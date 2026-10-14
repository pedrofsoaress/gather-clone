import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { createHash } from 'node:crypto'
import * as preferences from './AudioPreference.ts'

const tick = () => new Promise(resolve => setImmediate(resolve))

function harness({ token = async () => 'token', screenCapture, manualTimers = false } = {}) {
    let devices = []
    const events = new Map()
    const signals = []
    const clients = []
    const captures = []
    const stored = new Map()
    const timers = new Map()
    const listeners = new Map()
    let meeting = null
    const delays = []
    const warnings = []
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
            const client = { connectionState: 'CONNECTED', published: [], joined: [], renewed: [], handlers: new Map(), subscriptions: [],
                // Like Agora: subscribing sets the remote user's track, unsubscribing removes it.
                async subscribe(user, kind) { this.subscriptions.push(['subscribe', String(user.uid), kind]); user[`${kind}Track`] = { kind, stopped: false, play() {}, stop() { this.stopped = true }, setVolume() {}, async setPlaybackDevice() {}, getVolumeLevel: () => 0 } },
                async unsubscribe(user, kind) { this.subscriptions.push(['unsubscribe', String(user.uid), kind]); user[`${kind}Track`] = undefined },
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
    const transpile = file => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText
    const source = transpile('./video-chat.ts')
    const exports = {}
    const timerApi = {
        setTimeout: manualTimers ? (callback, ms) => { timers.set(++timerId, callback); delays.push(ms); return timerId } : setTimeout,
        clearTimeout: manualTimers ? id => timers.delete(id) : clearTimeout,
    }
    // The pushed-token wait runs on the same (possibly manual) timers as the join.
    const tokenCache = {}
    vm.runInNewContext(transpile('./token-cache.ts'), { exports: tokenCache, Date, ...timerApi })
    const policy = {}
    vm.runInNewContext(transpile('./subscription-policy.ts'), { exports: policy })
    vm.runInNewContext(source, {
        exports, process: { env: {} }, console: { ...console, warn: (...args) => warnings.push(args) },
        ...timerApi,
        navigator: { mediaDevices: { getDisplayMedia: screenCapture, enumerateDevices: async () => devices, addEventListener: (name, fn) => events.set(name, fn), removeEventListener: (name, fn) => { if (events.get(name) === fn) events.delete(name) } } },
        window: { localStorage: storage }, HTMLMediaElement: class {},
        require: name => {
            if (name === 'agora-rtc-sdk-ng') return agora
            if (name === '../signal') return {
                emit: (name, data) => { signals.push({ name, data }); (listeners.get(name) ?? []).forEach(fn => fn(data)) },
                on: (name, fn) => listeners.set(name, [...(listeners.get(name) ?? []), fn]),
            }
            if (name === './meeting') return { getMeeting: () => meeting }
            if (name === './subscription-policy') return policy
            if (name === './generateToken') return { generateToken: token }
            if (name === './token-cache') return tokenCache
            if (name === './AudioPreference') return { ...preferences, readMediaPreferences: () => JSON.parse(storage.getItem('prefs') ?? '{"cameraId":"usb-camera","microphoneId":"usb-mic","outputId":""}'), saveMediaPreferences: next => storage.setItem('prefs', JSON.stringify(next)) }
            if (name === 'crypto') return { createHash }
            throw new Error(`Unexpected import: ${name}`)
        },
    })
    // Like meeting.ts: store the snapshot, then broadcast it.
    const setMeeting = snapshot => { meeting = snapshot; (listeners.get('meetingState') ?? []).forEach(fn => fn(snapshot)) }
    return { chat: exports.videoChat, clients, captures, events, signals, delays, warnings, setMeeting, setDevices: next => { devices = next }, flushTimers: () => { const pending = [...timers.values()]; timers.clear(); pending.forEach(callback => callback()) } }
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

test('a token pushed by the server joins at once without asking the server action', async () => {
    let requested = 0
    const env = harness({ manualTimers: true, token: async () => { requested++; return 'action-token' } })
    env.clients[0].connectionState = 'DISCONNECTED'
    const channel = createHash('md5').update('realm-0-meeting').digest('hex').slice(0, 16)
    const tokens = []
    env.clients[0].join = async function (_app, joined, value) { tokens.push(value); this.joined.push(joined); this.connectionState = 'CONNECTED' }
    env.chat.rememberToken(channel, 'pushed-token')
    await env.chat.joinChannel('meeting', 'uid', 'realm', 0)
    env.flushTimers()
    await env.chat.channelOperation
    assert.deepEqual(tokens, ['pushed-token'])
    assert.deepEqual(env.clients[0].joined, [channel])
    assert.equal(requested, 0)
})

test('before any pushed token the join waits 150 ms, then asks the server action without waiting for a push', async () => {
    let requested = 0
    const env = harness({ manualTimers: true, token: async () => { requested++; return 'action-token' } })
    env.clients[0].connectionState = 'DISCONNECTED'
    await env.chat.joinChannel('meeting', 'uid', 'realm', 0)
    assert.deepEqual(env.delays, [150])
    env.flushTimers()
    await env.chat.channelOperation
    assert.equal(requested, 1)
    assert.equal(env.clients[0].joined.length, 1)
    assert.deepEqual(env.delays, [150], 'no wait for a pushed token')
})

test('once a token was pushed, the join starts without delay', async () => {
    const env = harness({ manualTimers: true })
    env.clients[0].connectionState = 'DISCONNECTED'
    env.chat.rememberToken(createHash('md5').update('realm-0-meeting').digest('hex').slice(0, 16), 'pushed-token')
    await env.chat.joinChannel('meeting', 'uid', 'realm', 0)
    assert.deepEqual(env.delays, [0])
})

test('once a token was pushed, a join waits briefly for its own and falls back when Agora rejects it', async () => {
    let requested = 0
    const env = harness({ manualTimers: true, token: async () => { requested++; return 'action-token' } })
    env.clients[0].connectionState = 'DISCONNECTED'
    const channel = createHash('md5').update('realm-0-meeting').digest('hex').slice(0, 16)
    const tokens = []
    env.clients[0].join = async function (_app, joined, value) {
        tokens.push(value)
        if (value === 'rejected-token') throw new Error('CAN_NOT_GET_GATEWAY_SERVER: invalid token')
        this.joined.push(joined); this.connectionState = 'CONNECTED'
    }
    env.chat.rememberToken('0123456789abcdef', 'another-conversation')
    await env.chat.joinChannel('meeting', 'uid', 'realm', 0)
    env.flushTimers()
    await tick()
    assert.equal(requested, 0, 'still waiting for the push')
    env.chat.rememberToken(channel, 'rejected-token')
    await env.chat.channelOperation
    assert.deepEqual(tokens, ['rejected-token', 'action-token'])
    assert.deepEqual(env.clients[0].joined, [channel])
    assert.equal(requested, 1)
    assert.equal(env.warnings.length, 1)

    // Pushed tokens are no longer used: the next join neither waits nor joins with one.
    const otherRoom = createHash('md5').update('realm-1-meeting').digest('hex').slice(0, 16)
    env.chat.rememberToken(otherRoom, 'pushed-again')
    env.delays.length = 0
    await env.chat.joinChannel('meeting', 'uid', 'realm', 1)
    assert.deepEqual(env.delays, [150])
    env.flushTimers()
    await env.chat.channelOperation
    assert.deepEqual(tokens, ['rejected-token', 'action-token', 'action-token'])
    assert.equal(requested, 2)
    assert.equal(env.warnings.length, 1)
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

test('forced mute helpers are idempotent and never turn anything on', async () => {
  const env = harness()
  env.setDevices([{ kind: 'audioinput', deviceId: 'usb-mic' }, { kind: 'videoinput', deviceId: 'usb-camera' }])
  assert.equal(await env.chat.muteMicrophone(), false)
  assert.equal(await env.chat.turnOffCamera(), false)
  assert.equal(env.chat.isMicrophoneMuted(), true)
  assert.equal(await env.chat.toggleMicrophone(), false)
  assert.equal(env.chat.isMicrophoneMuted(), false)
  assert.equal(await env.chat.muteMicrophone(), true)
  assert.equal(await env.chat.muteMicrophone(), false)
  assert.equal(env.chat.isMicrophoneMuted(), true)
  await env.chat.toggleCamera()
  assert.equal(await env.chat.turnOffCamera(), true)
  assert.equal(await env.chat.turnOffCamera(), false)
})

const HOST = '11111111-1111-4111-8111-111111111111'
const ME = '22222222-2222-4222-8222-222222222222'
const BIA = '33333333-3333-4333-8333-333333333333'
const remote = uid => ({ uid, hasAudio: true, hasVideo: true })
const snapshot = moderators => ({ areaId: 'matte-training', locked: false, allowed: [], raised: [], moderators })

async function joinAs(env, uid) {
    env.clients[0].connectionState = 'DISCONNECTED'
    await env.chat.joinChannel('matte-training', uid, 'realm', 0)
    env.flushTimers()
    await env.chat.channelOperation
}

test('in a meeting the audience receives the stage video and everyone\'s audio; others follow the stage', async () => {
    const env = harness({ manualTimers: true })
    env.setMeeting(snapshot([HOST]))
    await joinAs(env, ME)
    const client = env.clients[0]
    const host = remote(HOST), bia = remote(BIA), screen = remote(`${BIA}-screen`)
    for (const user of [host, bia]) {
        await env.chat.onUserPublished(user, 'audio')
        await env.chat.onUserPublished(user, 'video')
    }
    await env.chat.onUserPublished(screen, 'video')
    assert.ok(host.videoTrack && host.audioTrack)
    assert.ok(screen.videoTrack, 'shared screens are always received')
    assert.ok(bia.audioTrack, 'the audience is still heard')
    assert.equal(bia.videoTrack, undefined, 'audience video is not received')
    assert.equal(env.chat.isVideoSubscribed(BIA), false)
    assert.equal(env.chat.isVideoSubscribed(HOST), true)
    assert.deepEqual(client.subscriptions.filter(([, uid]) => uid === BIA), [['subscribe', BIA, 'audio']])

    // Bia steps onto the stage: her video is received, nothing else changes.
    env.signals.length = 0
    env.setMeeting(snapshot([HOST, BIA]))
    await env.chat.applyVideoPolicy()
    assert.ok(bia.videoTrack)
    assert.equal(env.chat.isVideoSubscribed(BIA), true)
    assert.ok(env.signals.some(event => event.name === 'user-info-updated' && event.data === bia))

    // She steps off: only her video is dropped; her audio and the call stay.
    const audio = bia.audioTrack
    const video = bia.videoTrack
    env.setMeeting(snapshot([HOST]))
    await env.chat.applyVideoPolicy()
    assert.equal(bia.videoTrack, undefined)
    assert.equal(video.stopped, true)
    assert.equal(bia.audioTrack, audio)
    assert.equal(env.chat.isVideoSubscribed(BIA), false)
    assert.deepEqual(client.subscriptions.filter(([, uid]) => uid === BIA), [['subscribe', BIA, 'audio'], ['subscribe', BIA, 'video'], ['unsubscribe', BIA, 'video']])
    assert.equal(client.subscriptions.some(([action, , kind]) => action === 'unsubscribe' && kind === 'audio'), false)
    assert.equal(client.joined.length, 1, 'the channel is never left')
    assert.ok(host.videoTrack && screen.videoTrack)
    assert.equal(env.signals.some(event => event.name === 'officeFeedback'), false)
})

test('stepping onto the stage receives the whole audience, and leaving the meeting room receives everyone', async () => {
    const env = harness({ manualTimers: true })
    env.setMeeting(snapshot([HOST]))
    await joinAs(env, ME)
    const bia = remote(BIA)
    await env.chat.onUserPublished(bia, 'video')
    assert.equal(bia.videoTrack, undefined)
    env.setMeeting(snapshot([HOST, ME]))
    await tick() // the meetingState signal alone re-applies the policy
    assert.ok(bia.videoTrack, 'the presenter sees the audience')
    env.setMeeting(snapshot([HOST]))
    await env.chat.applyVideoPolicy()
    assert.equal(bia.videoTrack, undefined)
    env.setMeeting(null)
    await env.chat.applyVideoPolicy()
    assert.ok(bia.videoTrack, 'outside a meeting room nothing is filtered')
})

test('stepping off the stage while the video is still being subscribed ends unsubscribed', async () => {
    const env = harness({ manualTimers: true })
    env.setMeeting(snapshot([HOST]))
    await joinAs(env, ME)
    const client = env.clients[0]
    const bia = remote(BIA)
    await env.chat.onUserPublished(bia, 'video')
    const subscribe = client.subscribe
    let finish
    client.subscribe = function (user, kind) { return new Promise(resolve => { finish = () => resolve(subscribe.call(this, user, kind)) }) }
    env.setMeeting(snapshot([HOST, BIA]))
    while (!finish) await tick()
    env.setMeeting(snapshot([HOST]))
    finish()
    await env.chat.applyVideoPolicy()
    assert.equal(bia.videoTrack, undefined)
    assert.equal(env.chat.isVideoSubscribed(BIA), false)
    assert.deepEqual(client.subscriptions.map(([action]) => action), ['subscribe', 'unsubscribe'])

    // A change undone before its turn comes costs nothing.
    client.subscriptions.length = 0
    env.setMeeting(snapshot([HOST, BIA]))
    env.setMeeting(snapshot([HOST]))
    await env.chat.applyVideoPolicy()
    assert.deepEqual(client.subscriptions, [])
})

test('a camera turned off and on again is received again only when allowed', async () => {
    const env = harness({ manualTimers: true })
    env.setMeeting(snapshot([HOST]))
    await joinAs(env, ME)
    const host = remote(HOST)
    await env.chat.onUserPublished(host, 'video')
    host.hasVideo = false
    env.chat.onUserUnpublished(host, 'video')
    assert.equal(env.chat.isVideoSubscribed(HOST), false)
    host.hasVideo = true
    await env.chat.onUserPublished(host, 'video')
    assert.equal(env.chat.isVideoSubscribed(HOST), true)
    assert.deepEqual(env.clients[0].subscriptions.map(([action]) => action), ['subscribe', 'subscribe'])
})

test('your own shared screen is never received back; its tile plays the local track', async () => {
    const env = harness({ manualTimers: true })
    await joinAs(env, ME)
    const own = remote(`${ME}-screen`), other = remote(`${BIA}-screen`)
    await env.chat.onUserPublished(own, 'video')
    await env.chat.onUserPublished(other, 'video')
    assert.equal(own.videoTrack, undefined)
    assert.equal(env.chat.isVideoSubscribed(`${ME}-screen`), false)
    assert.ok(other.videoTrack)
    env.setMeeting(snapshot([ME]))
    await env.chat.applyVideoPolicy()
    assert.equal(own.videoTrack, undefined, 'not even on the stage')
    assert.equal(env.signals.some(event => event.name === 'officeFeedback'), false)

    assert.doesNotThrow(() => env.chat.showScreenPreview('remote-user-x')(), 'no share, no preview')
    const screenTrack = { played: [], stopped: 0, play(element, config) { this.played.push([element, config.fit]) }, stop() { this.stopped++ } }
    env.chat.screenTrack = screenTrack
    const stop = env.chat.showScreenPreview(`remote-user-${ME}-screen`)
    assert.deepEqual(screenTrack.played, [[`remote-user-${ME}-screen`, 'contain']])
    stop()
    assert.equal(screenTrack.stopped, 1)
})
