import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const transpile = file => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText

function load() {
    const listeners = new Map(), signals = [], made = [], log = []
    const fake = (provider, config) => {
        const index = made.length
        const chat = {
            provider, config, calls: [], destroyed: false, outputSupported: true, isConnected: false,
            // How many other chats were still alive when this one was made: a switch must never leave two.
            aliveAtCreation: made.filter(other => !other.destroyed).length,
            playVideoTrackAtElementId(element) { log.push(`play:${index}`); chat.calls.push(['play', element]) },
            startDeviceMonitoring() { chat.calls.push(['monitor']); return () => chat.calls.push(['unmonitor']) },
            configure(next) { chat.calls.push(['configure', next.provider]) },
            destroy() { log.push(`destroy:${index}`); chat.destroyed = true },
            async toggleCamera() { chat.calls.push(['camera']); return false },
            async joinChannel(...args) { chat.calls.push(['join', ...args]) },
            async leaveChannel() { chat.calls.push(['leave']) },
            getDevicePreferences() { chat.calls.push(['preferences']); return { microphoneId: 'chat', cameraId: '', outputId: '' } },
        }
        made.push(chat)
        return chat
    }
    const exports = {}
    vm.runInNewContext(transpile('./video-chat.ts'), { exports, require: name => {
        if (name === '../signal') return { __esModule: true, default: { on: (event, fn) => listeners.set(event, fn), off() {}, emit: (event, data) => signals.push([event, data && typeof data === 'object' ? { ...data } : data]) } }
        if (name === './agora-video-chat') return { AgoraVideoChat: function () { return fake('agora') } }
        if (name === './cloudflare/CloudflareVideoChat') return { CloudflareVideoChat: function (config) { return fake('cloudflare', config) } }
        if (name === './AudioPreference') return { readMediaPreferences: () => ({ microphoneId: 'saved', cameraId: '', outputId: '' }) }
        throw new Error(`Unexpected import: ${name}`)
    } })
    return { chat: exports.videoChat, made, signals, log, config: value => listeners.get('mediaConfig')(value) }
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
    assert.deepEqual(env.signals, [['local-camera-changed', true], ['local-microphone-changed', true], ['video-provider-changed', { provider: 'cloudflare' }]])
    env.config(cloudflare)
    assert.equal(env.made.length, 2, 'same provider: reconfigured, not recreated')
    assert.deepEqual(next.calls.at(-1), ['configure', 'cloudflare'])
    env.config({ provider: 'agora' })
    assert.equal(env.made[1].destroyed, true)
    assert.equal(env.made.length, 2, 'back to the one Agora chat of this page, not a new one')
    assert.deepEqual(agora.calls.at(-2), ['play', 'local-meeting-video'])
    assert.deepEqual(agora.calls.at(-1), ['monitor'])
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
    assert.deepEqual(env.signals, [['local-camera-changed', true], ['local-microphone-changed', true], ['video-provider-changed', { provider: 'cloudflare' }]], 'nothing was on after destroy: no extra reset')
    env.config({ provider: 'agora' })
    assert.equal(env.made.length, 3, 'the Agora chat of this page is reused')
    assert.deepEqual(env.log.slice(-2), ['destroy:2', 'play:0'], 'Cloudflare is stopped before Agora takes over')
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
    assert.equal(env.made.length, 2)
    assert.deepEqual(env.made[0].calls.at(-1), ['play', 'local-video'], 'back on Agora, not monitoring any more')
})

test('mediaConfig agora before any use makes the single Agora chat, with no reset of the buttons', () => {
    const env = load()
    env.config({ provider: 'agora' })
    assert.equal(env.made.length, 1)
    assert.equal(env.made[0].provider, 'agora')
    assert.deepEqual(env.made[0].calls, [['play', 'local-video']])
    env.config({ provider: 'agora' })
    assert.equal(env.made.length, 1)
    assert.deepEqual(env.signals, [])
})

test('a switch while in a conversation joins it again on the new provider; not after a leave or destroy', async () => {
    const area = { areaId: 'sala', isMeetingArea: false }
    const env = load()
    env.config(cloudflare)
    await env.chat.joinChannel('sala', 'uid-1', 'realm', 0, area)
    // VIDEO_PROVIDER rolled back to Agora: the server restarts and the page gets an agora config mid-conversation.
    env.config({ provider: 'agora' })
    const agora = env.made[1]
    assert.deepEqual(agora.calls.find(call => call[0] === 'join'), ['join', 'sala', 'uid-1', 'realm', 0, area])
    // And back: the conversation follows again.
    env.config(cloudflare)
    assert.deepEqual(env.made[2].calls.find(call => call[0] === 'join'), ['join', 'sala', 'uid-1', 'realm', 0, area])

    await env.chat.leaveChannel()
    env.config({ provider: 'agora' })
    assert.equal(agora.calls.filter(call => call[0] === 'join').length, 1, 'left: nothing to join again')

    await env.chat.joinChannel('perto', 'uid-1', 'realm', 0, null)
    env.chat.destroy()
    env.config(cloudflare)
    assert.equal(env.made.at(-1).calls.some(call => call[0] === 'join'), false, 'destroyed: nothing to join again')
})

test('after destroy in Cloudflare mode nothing is made until the fresh config, unless the person acts', async () => {
    const env = load()
    env.chat.playVideoTrackAtElementId('local-video')
    env.config(cloudflare)
    env.chat.destroy()
    // What a remount does before the socket is back: reads, the preview element and device monitoring.
    assert.equal(env.chat.outputSupported, false)
    assert.deepEqual({ ...env.chat.getDevicePreferences() }, { microphoneId: 'saved', cameraId: '', outputId: '' })
    assert.equal(env.chat.isMicrophoneMuted(), true)
    assert.equal(env.chat.isConnected, false)
    assert.equal(env.chat.isVideoSubscribed('ana'), false)
    assert.deepEqual({ ...env.chat.getRemoteAudio('ana') }, { muted: false, volume: 100, speaking: false })
    assert.equal(env.chat.speakerAudio('caixa'), null)
    env.chat.requestLayer('ana', 'h')()
    env.chat.showScreenPreview('x')()
    assert.equal(await env.chat.muteMicrophone(), false)
    assert.equal(await env.chat.turnOffCamera(), false)
    await env.chat.stopScreenShare()
    env.chat.playVideoTrackAtElementId('local-video')
    const stop = env.chat.startDeviceMonitoring()
    await env.chat.leaveChannel()
    assert.equal(env.made.length, 2, 'no chat made with the old config (made: Agora, then Cloudflare)')
    const fresh = { ...cloudflare, generation: 9 }
    env.config(fresh)
    assert.equal(env.made.length, 3)
    assert.deepEqual(env.made[2].config, fresh)
    assert.deepEqual(env.made[2].calls, [['play', 'local-video'], ['monitor']])
    stop()
    assert.deepEqual(env.made[2].calls.at(-1), ['unmonitor'])
    assert.deepEqual(env.signals, [['local-camera-changed', true], ['local-microphone-changed', true], ['video-provider-changed', { provider: 'cloudflare' }]])
})

test('an action after destroy, before the fresh config, makes the chat with what the page asked for meanwhile', async () => {
    const env = load()
    env.config(cloudflare)
    env.chat.destroy()
    env.chat.playVideoTrackAtElementId('local-video')
    env.chat.startDeviceMonitoring()
    await env.chat.toggleCamera()
    assert.equal(env.made.length, 2)
    assert.deepEqual(env.made[1].config, cloudflare)
    assert.deepEqual(env.made[1].calls, [['play', 'local-video'], ['monitor'], ['camera']])
    env.config({ ...cloudflare, generation: 3 })
    assert.equal(env.made.length, 2, 'the fresh config reconfigures it')
    assert.deepEqual(env.made[1].calls.at(-1), ['configure', 'cloudflare'])
})

test('video-provider-changed is told once per real switch, after the new chat exists and the conversation is joined again', async () => {
    const env = load()
    env.config({ provider: 'agora' })
    env.config({ provider: 'agora' })
    assert.deepEqual(env.signals, [], 'same provider: nothing to tell')
    await env.chat.joinChannel('sala', 'uid-1', 'realm', 0, null)
    env.config(cloudflare)
    const changed = env.signals.filter(([event]) => event === 'video-provider-changed')
    assert.deepEqual(changed, [['video-provider-changed', { provider: 'cloudflare' }]])
    assert.equal(env.chat.provider, 'cloudflare', 'the router already answers with the new provider')
    assert.deepEqual(env.made[1].calls.find(call => call[0] === 'join'), ['join', 'sala', 'uid-1', 'realm', 0, null])
    env.config({ ...cloudflare, generation: 2 })
    assert.equal(env.signals.filter(([event]) => event === 'video-provider-changed').length, 1, 'a reconfigure is not a switch')
    env.config({ provider: 'agora' })
    assert.deepEqual(env.signals.at(-1), ['video-provider-changed', { provider: 'agora' }])
})

test('a switch before any chat was made is still told, so the speakers follow it', () => {
    const env = load()
    env.config(cloudflare)
    assert.deepEqual(env.signals, [['video-provider-changed', { provider: 'cloudflare' }]])
})
