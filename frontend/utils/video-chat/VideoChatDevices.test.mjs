import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { createHash } from 'node:crypto'
import * as preferences from './AudioPreference.ts'

function harness({ token = async () => 'token', screenCapture, manualTimers = false } = {}) {
    let devices = []
    const events = new Map()
    const signals = []
    const clients = []
    const captures = []
    const stored = new Map()
    const timers = new Map()
    let timerId = 0
    const storage = { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) }
    const track = (kind, initialId) => ({
        deviceId: initialId,
        enabled: true, muted: false, played: [], switched: [], closed: false,
        play(id) { this.played.push(id) }, stop() {}, close() { this.closed = true },
        async setDevice(id) { this.switched.push(id); this.deviceId = id },
        async setEnabled(enabled) { this.enabled = enabled }, async setMuted(muted) { this.muted = muted },
        getMediaStreamTrack() { return { readyState: 'live', getSettings: () => ({ deviceId: this.deviceId }) } },
    })
    const agora = {
        setLogLevel() {},
        createClient() {
            const client = { connectionState: 'CONNECTED', published: [], joined: [], renewed: [], handlers: new Map(),
                async publish(tracks) { this.published.push(...(Array.isArray(tracks) ? tracks : [tracks])) }, async unpublish() {},
                async leave() { this.connectionState = 'DISCONNECTED' }, async join(_app, channel) { this.joined.push(channel); this.connectionState = 'CONNECTED' },
                async renewToken(value) { this.renewed.push(value) }, on(name, callback) { this.handlers.set(name, callback) } }
            clients.push(client)
            return client
        },
        async createCameraVideoTrack(config) { captures.push({ kind: 'video', config }); return track('video', config?.cameraId ?? devices.find(device => device.kind === 'videoinput')?.deviceId) },
        async createMicrophoneAudioTrack(config) { captures.push({ kind: 'audio', config }); return track('audio', config?.microphoneId ?? devices.find(device => device.kind === 'audioinput')?.deviceId) },
        createCustomVideoTrack() { return track('screen') },
    }
    const source = ts.transpileModule(readFileSync(new URL('./video-chat.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText
    const exports = {}
    vm.runInNewContext(source, {
        exports, process: { env: {} }, console,
        setTimeout: manualTimers ? callback => { timers.set(++timerId, callback); return timerId } : setTimeout,
        clearTimeout: manualTimers ? id => timers.delete(id) : clearTimeout,
        navigator: { mediaDevices: { getDisplayMedia: screenCapture, enumerateDevices: async () => devices, addEventListener: (name, fn) => events.set(name, fn), removeEventListener: (name, fn) => { if (events.get(name) === fn) events.delete(name) } } },
        window: { localStorage: storage }, HTMLMediaElement: class {},
        require: name => {
            if (name === 'agora-rtc-sdk-ng') return agora
            if (name === '../signal') return { emit: (name, data) => signals.push({ name, data }) }
            if (name === './generateToken') return { generateToken: token }
            if (name === './AudioPreference') return { ...preferences, readMediaPreferences: () => JSON.parse(storage.getItem('prefs') ?? '{"cameraId":"usb-camera","microphoneId":"usb-mic","outputId":""}'), saveMediaPreferences: next => storage.setItem('prefs', JSON.stringify(next)) }
            if (name === 'crypto') return { createHash }
            throw new Error(`Unexpected import: ${name}`)
        },
    })
    return { chat: exports.videoChat, clients, captures, events, signals, setDevices: next => { devices = next }, flushTimers: () => { const pending = [...timers.values()]; timers.clear(); pending.forEach(callback => callback()) } }
}

test('first enable clears disconnected saved devices and keeps screen client independent', async () => {
    const env = harness()
    env.setDevices([{ deviceId: 'built-in-camera', kind: 'videoinput' }, { deviceId: 'built-in-mic', kind: 'audioinput' }])
    env.chat.playVideoTrackAtElementId('local-meeting-video')
    await env.chat.toggleCamera()
    await env.chat.toggleMicrophone()
    assert.deepEqual(env.captures.map(item => item.config), [undefined, undefined])
    assert.deepEqual([...env.clients[0].published[0].played], ['local-meeting-video'])
    assert.equal(env.clients[0].published.length, 2)
    assert.equal(env.clients[1].published.length, 0)
    assert.equal(env.chat.getDevicePreferences().cameraId, '')
    assert.equal(env.chat.getDevicePreferences().microphoneId, '')
})

test('device monitoring replaces unplugged input tracks while settings dialog is closed and cleans up', async () => {
    const env = harness()
    env.setDevices([{ deviceId: 'usb-camera', kind: 'videoinput' }, { deviceId: 'usb-mic', kind: 'audioinput' }])
    await env.chat.toggleCamera()
    await env.chat.toggleMicrophone()
    const camera = env.clients[0].published[0]
    const mic = env.clients[0].published[1]
    env.chat.playVideoTrackAtElementId('local-meeting-video')
    const stop = env.chat.startDeviceMonitoring()
    env.setDevices([{ deviceId: 'built-in-camera', kind: 'videoinput' }, { deviceId: 'default', kind: 'audioinput' }])
    await env.events.get('devicechange')()
    assert.deepEqual([...camera.switched], ['built-in-camera'])
    assert.deepEqual([...mic.switched], ['default'])
    assert.equal(camera.played.at(-1), 'local-meeting-video')
    assert.equal(env.clients[0].published.length, 2, 'switching must not republish tracks')
    assert.equal(env.clients[1].published.length, 0)
    stop()
    assert.equal(env.events.has('devicechange'), false)
})

test('unplugging the last camera closes it and updates the UI without interrupting the microphone', async () => {
    const env = harness()
    env.setDevices([{ deviceId: 'usb-camera', kind: 'videoinput' }, { deviceId: 'usb-mic', kind: 'audioinput' }])
    await env.chat.toggleCamera()
    await env.chat.toggleMicrophone()
    const [camera, mic] = env.clients[0].published
    const stop = env.chat.startDeviceMonitoring()
    env.setDevices([{ deviceId: 'usb-mic', kind: 'audioinput' }])
    await env.events.get('devicechange')()
    assert.equal(camera.closed, true)
    assert.equal(mic.closed, false)
    assert.ok(env.signals.some(event => event.name === 'local-camera-changed' && event.data === true))
    assert.ok(env.signals.some(event => event.name === 'officeFeedback' && event.data.message.includes('câmera')))
    stop()
})

test('a failed camera publication closes its capture and the next attempt creates a usable track', async () => {
    const env = harness()
    env.setDevices([{ deviceId: 'usb-camera', kind: 'videoinput' }])
    let failedTrack
    env.clients[0].publish = async tracks => { failedTrack = tracks[0]; throw new Error('publication failed') }
    await assert.rejects(env.chat.toggleCamera(), /publication failed/)
    assert.equal(failedTrack.closed, true)
    env.clients[0].publish = async tracks => { env.clients[0].published.push(...tracks) }
    assert.equal(await env.chat.toggleCamera(), false)
    assert.equal(env.captures.length, 2)
    assert.equal(env.clients[0].published[0].closed, false)
})

test('equal private ids in different rooms join different Agora channels and renew authorization', async () => {
    const env = harness({ manualTimers: true })
    env.clients[0].connectionState = 'DISCONNECTED'
    env.clients[1].connectionState = 'DISCONNECTED'
    for (const room of [0, 1]) {
        await env.chat.joinChannel('meeting', 'uid', 'realm', room)
        env.flushTimers()
        await env.chat.channelOperation
    }
    assert.equal(env.clients[0].joined.length, 2)
    assert.notEqual(env.clients[0].joined[0], env.clients[0].joined[1])
    assert.equal(env.clients[0].joined[1], createHash('md5').update('realm-1-meeting').digest('hex').slice(0, 16))
    env.clients[0].handlers.get('token-privilege-will-expire')()
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(env.clients[0].renewed, ['token'])
})

test('late token resolution after leaving the application cannot reopen a call', async () => {
    let resolveToken, requested = false
    const env = harness({ manualTimers: true, token: () => { requested = true; return new Promise(resolve => { resolveToken = resolve }) } })
    env.clients[0].connectionState = 'DISCONNECTED'
    await env.chat.joinChannel('meeting', 'uid', 'realm', 0)
    env.flushTimers()
    while (!requested) await Promise.resolve()
    env.chat.destroy()
    resolveToken('token')
    await env.chat.channelOperation
    assert.deepEqual(env.clients[0].joined, [])
})

test('accepting a screen picker after leaving stops capture without publishing', async () => {
    let accept
    const mediaTrack = { stopped: false, stop() { this.stopped = true }, addEventListener() {} }
    const env = harness({ screenCapture: () => new Promise(resolve => { accept = resolve }) })
    env.chat.currentUid = 'uid'
    env.chat.currentAgoraChannel = '0123456789abcdef'
    const capture = env.chat.startScreenShare()
    env.chat.destroy()
    accept({ getVideoTracks: () => [mediaTrack], getTracks: () => [mediaTrack] })
    await assert.rejects(capture, /cancelado/)
    assert.equal(mediaTrack.stopped, true)
    assert.deepEqual(env.clients[1].joined, [])
})

test('the floating window borrows the camera preview and returns it when it closes', async () => {
    const env = harness()
    env.setDevices([{ kind: 'videoinput', deviceId: 'usb-camera' }])
    env.chat.playVideoTrackAtElementId('local-video')
    await env.chat.toggleCamera()
    const camera = env.clients[0].published[0]
    const floatingTile = { id: 'floating-self' }
    const restore = env.chat.showCameraIn(floatingTile)
    assert.equal(camera.played.at(-1), floatingTile)
    restore()
    assert.equal(camera.played.at(-1), 'local-video')
})

test('a preview moved elsewhere while floating is not taken back on close', async () => {
    const env = harness()
    env.setDevices([{ kind: 'videoinput', deviceId: 'usb-camera' }])
    await env.chat.toggleCamera()
    const camera = env.clients[0].published[0]
    const restore = env.chat.showCameraIn({ id: 'floating-self' })
    env.chat.playVideoTrackAtElementId('local-meeting-video')
    restore()
    assert.equal(camera.played.at(-1), 'local-meeting-video')
})
