import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const transpile = file => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText

function load() {
    const listeners = new Map(), signals = [], made = []
    const fake = (provider, config) => {
        const chat = {
            provider, config, calls: [], destroyed: false, outputSupported: true, isConnected: false,
            // How many other chats were still alive when this one was made: a switch must never leave two.
            aliveAtCreation: made.filter(other => !other.destroyed).length,
            playVideoTrackAtElementId(element) { chat.calls.push(['play', element]) },
            startDeviceMonitoring() { chat.calls.push(['monitor']); return () => chat.calls.push(['unmonitor']) },
            configure(next) { chat.calls.push(['configure', next.provider]) },
            destroy() { chat.destroyed = true },
            async toggleCamera() { chat.calls.push(['camera']); return false },
        }
        made.push(chat)
        return chat
    }
    const exports = {}
    vm.runInNewContext(transpile('./video-chat.ts'), { exports, require: name => {
        if (name === '../signal') return { __esModule: true, default: { on: (event, fn) => listeners.set(event, fn), off() {}, emit: (event, data) => signals.push([event, data]) } }
        if (name === './agora-video-chat') return { AgoraVideoChat: function () { return fake('agora') } }
        if (name === './cloudflare/CloudflareVideoChat') return { CloudflareVideoChat: function (config) { return fake('cloudflare', config) } }
        throw new Error(`Unexpected import: ${name}`)
    } })
    return { chat: exports.videoChat, made, signals, config: value => listeners.get('mediaConfig')(value) }
}
const cloudflare = { provider: 'cloudflare', iceServers: [{ urls: 'stun:x:1' }], bootstrap: true }

test('Agora until the server says otherwise, created once and only when used', async () => {
    const env = load()
    assert.equal(env.made.length, 0)
    await env.chat.toggleCamera()
    await env.chat.toggleCamera()
    assert.equal(env.made.length, 1)
    assert.equal(env.chat.provider, 'agora')
})

test('switching to Cloudflare turns the old devices off and moves preview and monitoring over', async () => {
    const env = load()
    env.chat.playVideoTrackAtElementId('local-meeting-video')
    env.chat.startDeviceMonitoring()
    env.config(cloudflare)
    const [agora, next] = env.made
    assert.equal(agora.destroyed, true)
    assert.equal(next.provider, 'cloudflare')
    assert.deepEqual(next.config, cloudflare)
    assert.deepEqual(next.calls, [['play', 'local-meeting-video'], ['monitor']])
    assert.deepEqual(env.signals, [['local-camera-changed', true], ['local-microphone-changed', true]])
    env.config(cloudflare)
    assert.equal(env.made.length, 2, 'same provider: reconfigured, not recreated')
    assert.deepEqual(next.calls.at(-1), ['configure', 'cloudflare'])
    env.config({ provider: 'agora' })
    assert.equal(env.made[1].destroyed, true)
    assert.equal(env.made[2].provider, 'agora')
})

test('the floating window borrows the preview and gives it back only if it still has it', () => {
    const env = load()
    const element = { id: 'floating' }
    const giveBack = env.chat.showCameraIn(element)
    giveBack()
    assert.deepEqual(env.made[0].calls.map(call => call[1]), [element, 'local-video'])
    const again = env.chat.showCameraIn(element)
    env.chat.playVideoTrackAtElementId('local-meeting-video')
    again()
    assert.equal(env.made[0].calls.at(-1)[1], 'local-meeting-video')
})

test('after destroy the current provider comes back with the last configuration', () => {
    const env = load()
    env.config(cloudflare)
    env.chat.destroy()
    void env.chat.toggleCamera()
    assert.equal(env.made.at(-1).provider, 'cloudflare')
    assert.deepEqual(env.made.at(-1).config, cloudflare)
})

test('the Cloudflare chat is made inside the mediaConfig handler, with the newest config, never next to a live one', () => {
    const env = load()
    env.chat.playVideoTrackAtElementId('local-video')
    const fresh = { ...cloudflare, generation: 2 }
    env.config({ ...cloudflare, generation: 1 })
    assert.equal(env.made.length, 2, 'made synchronously, before the handler returns')
    assert.equal(env.made[1].aliveAtCreation, 0, 'Agora was destroyed before Cloudflare was made')
    // A new visit: the old chat is gone and the server's new config arrives before anything else uses it.
    env.chat.destroy()
    env.config(fresh)
    assert.equal(env.made.length, 3)
    assert.deepEqual(env.made[2].config, fresh, 'started with the config of this visit, not the previous one')
    assert.equal(env.made[2].aliveAtCreation, 0)
    assert.deepEqual(env.signals, [['local-camera-changed', true], ['local-microphone-changed', true]], 'nothing was on after destroy: no extra reset')
    env.config({ provider: 'agora' })
    assert.equal(env.made[3].aliveAtCreation, 0)
    assert.equal(env.made.filter(chat => !chat.destroyed).length, 1)
})

test('with Agora the same instance serves the whole page, across destroy, as before the router', async () => {
    const env = load()
    await env.chat.toggleCamera()
    env.chat.destroy()
    assert.equal(env.made[0].destroyed, true)
    env.config({ provider: 'agora' })
    await env.chat.toggleCamera()
    assert.equal(env.made.length, 1, 'never recreated: its pushed-token state lives for the page')
    assert.deepEqual(env.made[0].calls, [['camera'], ['configure', 'agora'], ['camera']])
    assert.deepEqual(env.signals, [])
})

test('a stale device-monitoring stopper leaves the newer monitoring running', () => {
    const env = load()
    const first = env.chat.startDeviceMonitoring()
    const second = env.chat.startDeviceMonitoring()
    first()
    assert.deepEqual(env.made[0].calls, [['monitor'], ['unmonitor'], ['monitor']])
    env.config(cloudflare)
    assert.deepEqual(env.made[1].calls.at(-1), ['monitor'], 'still monitoring, so the new provider monitors too')
    second()
    assert.deepEqual(env.made[1].calls.at(-1), ['unmonitor'])
    env.config({ provider: 'agora' })
    assert.equal(env.made[2].calls.some(call => call[0] === 'monitor'), false)
})
