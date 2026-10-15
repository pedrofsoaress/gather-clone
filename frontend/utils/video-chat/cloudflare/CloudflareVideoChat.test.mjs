import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as preferences from '../AudioPreference.ts'
import * as layers from './layers.ts'
import { fakeDocument, loadRemoteMedia, tracksOf } from './test-dom.mjs'

const tick = async (rounds = 20) => { for (let i = 0; i < rounds; i++) await new Promise(resolve => setImmediate(resolve)) }
const transpile = file => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText
// Objects made inside the vm have another Object.prototype; compare their JSON shape.
const plain = value => JSON.parse(JSON.stringify(value))
const config = (generation = 1) => ({ provider: 'cloudflare', iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }], bootstrap: true, generation })

function fakeTrack(kind, deviceId = '') {
    const listeners = new Map()
    const track = {
        kind, deviceId, stopped: false, readyState: 'live', contentHint: '',
        stop() { track.stopped = true },
        getSettings: () => ({ deviceId: track.deviceId }),
        addEventListener(name, fn) { listeners.set(name, fn) },
        fire(name) { const fn = listeners.get(name); listeners.delete(name); fn?.() },
    }
    return track
}

const key = (fromUid, kind, objectId) => `${fromUid ?? '*'}|${kind}|${objectId ?? ''}`

function fakeEngine(env) {
    return options => {
        const engine = {
            options, calls: [], connected: true, mapping: new Map(), pub: null, tracks: new Map(), receivers: new Map(), speakers: [],
            fail: null,
            start(value) { engine.calls.push(['start', value.generation]); return Promise.resolve() },
            suspend() { engine.calls.push(['suspend']) },
            stop() { engine.calls.push(['stop']); engine.connected = false },
            async publish(kind, track, objectId) { engine.calls.push(['publish', kind, track, objectId]); await env.publishGate?.(); if (engine.fail) throw new Error(engine.fail) },
            async unpublish(kind, objectId) { engine.calls.push(['unpublish', kind, objectId]) },
            async pause(kind) { engine.calls.push(['pause', kind]) },
            async resume(kind, track) { engine.calls.push(['resume', kind, track]); if (engine.fail) throw new Error(engine.fail) },
            async replaceTrack(kind, track) { engine.calls.push(['replaceTrack', kind, track]); if (env.failReplace) throw new Error(env.failReplace) },
            remoteTrack: (fromUid, kind, objectId) => engine.tracks.get(key(fromUid, kind, objectId)) ?? null,
            receiver: (fromUid, kind, objectId) => engine.receivers.get(key(fromUid, kind, objectId)) ?? null,
            remoteSpeakers: () => engine.speakers,
            emit: event => options.onEvent(event),
            names: () => engine.calls.map(call => call[0]),
        }
        env.engines.push(engine)
        return engine
    }
}

// One fake per office socket: what the page registers on it and asks through it.
function fakeSocket(name) {
    const socket = {
        name, handlers: new Map(), requests: [],
        on(event, fn) { socket.handlers.set(event, fn) },
        off(event, fn) { if (socket.handlers.get(event) === fn) socket.handlers.delete(event) },
        request(event, payload) { socket.requests.push([event, payload]); return Promise.resolve({}) },
    }
    return socket
}

function load({ capture } = {}) {
    const page = fakeDocument('page')
    const signals = []
    const engines = []
    const timers = new Map()
    let timerId = 0
    const gates = { publish: null, capture: null, replace: null }
    let socket = fakeSocket('socket-1')
    let devices = [{ kind: 'audioinput', deviceId: 'default' }, { kind: 'videoinput', deviceId: 'cam' }, { kind: 'audiooutput', deviceId: 'default' }]
    const captured = []
    const mediaDevices = {
        listeners: new Map(),
        enumerateDevices: async () => devices,
        getUserMedia: async constraints => {
            const kind = constraints.video ? 'video' : 'audio'
            if (capture) await capture(kind)
            if (gates.capture) await gates.capture.promise
            const track = fakeTrack(kind, constraints[kind]?.deviceId?.exact ?? '')
            captured.push(track)
            return { getVideoTracks: () => kind === 'video' ? [track] : [], getAudioTracks: () => kind === 'audio' ? [track] : [] }
        },
        getDisplayMedia: async () => {
            const track = fakeTrack('video')
            captured.push(track)
            return { getVideoTracks: () => [track], getTracks: () => [track] }
        },
        addEventListener(name, fn) { mediaDevices.listeners.set(name, fn) },
        removeEventListener(name, fn) { if (mediaDevices.listeners.get(name) === fn) mediaDevices.listeners.delete(name) },
    }
    // `socket` follows the current office socket, like officeSocket(); pinSocket() keeps the one of now.
    const deps = {
        socket: { on: (...args) => socket.on(...args), off: (...args) => socket.off(...args), request: (...args) => socket.request(...args) },
        socketTarget: () => socket,
        pinSocket: () => socket,
        createEngine: fakeEngine({ engines, get publishGate() { return gates.publish && (() => gates.publish.promise) }, get failReplace() { return gates.replace } }),
        setTimeout: (callback, ms) => { timers.set(++timerId, { callback, ms }); return timerId },
        clearTimeout: id => timers.delete(id),
        mediaDevices,
    }
    const remoteMedia = loadRemoteMedia(page)
    const exports = {}
    class HTMLMediaElement {}
    HTMLMediaElement.prototype.setSinkId = function () {}
    vm.runInNewContext(transpile('./CloudflareVideoChat.ts'), {
        exports, document: page, window: {}, HTMLMediaElement,
        require: name => {
            if (name === '../../signal') return { emit: (event, data) => signals.push([event, data]), on() {}, off() {} }
            if (name === '../AudioPreference') return preferences
            if (name === './remote-media') return remoteMedia
            if (name === './layers') return layers
            if (name === './CloudflareEngine') return { CloudflareEngine: class { constructor() { throw new Error('the real engine is never used here') } } }
            if (name === './socket') return { officeSocket() { throw new Error('the office socket is never used here') }, currentOfficeSocket() { throw new Error('never used') } }
            throw new Error(`Unexpected import: ${name}`)
        },
    })
    const hold = () => { let release; const promise = new Promise(resolve => { release = resolve }); return { promise, release } }
    const env = {
        page, signals, engines, timers, captured, deps, mediaDevices,
        get socket() { return socket },
        get engine() { return engines.at(-1) },
        setDevices(next) { devices = next },
        replaceSocket() { socket = fakeSocket(`socket-${++timerId}`); return socket },
        holdCapture() { gates.capture = hold(); return () => { const gate = gates.capture; gates.capture = null; gate.release() } },
        holdPublish() { gates.publish = hold(); return () => { const gate = gates.publish; gates.publish = null; gate.release() } },
        failReplace(message) { gates.replace = message },
        create(value = config()) { return new exports.CloudflareVideoChat(value, deps) },
        fire() { const due = [...timers.values()]; timers.clear(); for (const { callback } of due) callback() },
        named: name => signals.filter(([event]) => event === name),
        clear() { signals.length = 0 },
    }
    return env
}

const peers = (patch = {}) => ({ type: 'peers', peers: { self: 'me', conversation: 'c', peers: [{ uid: 'ana', mic: true, camera: true, screen: true }], ownScreen: true, ...patch } })

test('lifecycle: started at once, suspended on a socket drop, reconfigured only for Cloudflare', () => {
    const env = load()
    const chat = env.create(config(4))
    // Synchronously: a step right after mediaConfig must find the engine started with this generation.
    assert.deepEqual(env.engine.calls, [['start', 4]])
    assert.equal(typeof env.socket.handlers.get('disconnect'), 'function')
    env.socket.handlers.get('disconnect')('transport close')
    assert.deepEqual(env.engine.calls.at(-1), ['suspend'])
    chat.configure(config(5))
    assert.deepEqual(env.engine.calls.at(-1), ['start', 5])
    chat.configure({ provider: 'agora' })
    assert.equal(env.engine.calls.length, 3)
    assert.equal(env.engines.length, 1)
})

test('peers: tiles for people and screens, no repeat for the same roster, leaving the conversation', async () => {
    const env = load()
    const chat = env.create()
    env.engine.emit(peers())
    const updated = env.named('user-info-updated').map(([, user]) => user)
    assert.deepEqual(updated.map(user => user.uid), ['ana', 'ana-screen', 'me-screen'])
    assert.equal(updated[0].hasAudio, true)
    assert.equal(updated[0].hasVideo, true)
    assert.equal(updated[1].hasAudio, false)
    assert.equal(updated[1].hasVideo, true)
    assert.equal(chat.isConnected, true)

    env.clear()
    env.engine.emit(peers())
    assert.deepEqual(env.signals, [])

    await chat.startScreenShare()
    const screen = env.captured.at(-1)
    env.clear()
    env.engine.emit(peers({ conversation: null, peers: [], ownScreen: false }))
    await tick()
    assert.equal(env.named('user-left').length, 3)
    assert.equal(env.named('video-channel-left').length, 1)
    assert.deepEqual(env.engine.calls.at(-1), ['unpublish', 'screen', undefined])
    assert.equal(screen.stopped, true)
    assert.deepEqual(env.named('screen-share-changed'), [['screen-share-changed', false]])
    assert.equal(chat.isConnected, false)
})

test('tracks: video only when received, audio at the volume chosen for the person, speaking from the RTP level', () => {
    const env = load()
    const chat = env.create()
    env.engine.emit(peers({ peers: [{ uid: 'ana', mic: true, camera: true, screen: false }], ownScreen: false }))
    // The audience of a meeting room: her camera is on but nothing is received.
    assert.equal(chat.isVideoSubscribed('ana'), false)

    chat.setRemoteVolume('ana', 57)
    let level = 0.3
    const camera = { id: 'ana-camera' }, mic = { id: 'ana-mic' }
    env.engine.tracks.set(key('ana', 'camera'), camera)
    env.engine.tracks.set(key('ana', 'mic'), mic)
    env.engine.receivers.set(key('ana', 'mic'), { getSynchronizationSources: () => [{ audioLevel: level }] })
    env.clear()
    env.engine.emit({ type: 'tracks' })
    assert.equal(chat.isVideoSubscribed('ana'), true)
    const [[, ana]] = env.named('user-info-updated')
    const audio = ana.audioTrack.element
    assert.deepEqual(tracksOf(audio), [mic])
    assert.equal(audio.volume, 0.57)
    assert.equal(audio.played, 1)
    assert.deepEqual(plain(chat.getRemoteAudio('ana')), { muted: false, volume: 57, speaking: true })
    level = 0.01
    assert.equal(chat.getRemoteAudio('ana').speaking, false)

    chat.setRemoteMuted('ana', true)
    assert.equal(audio.volume, 0)
    assert.deepEqual(env.named('remote-audio-preference-changed').map(([, uid]) => uid), ['ana'])
    chat.setRemoteMuted('ana', false)
    assert.equal(audio.volume, 0.57)

    // The same tracks again: nothing to tell the tiles.
    env.clear()
    env.engine.emit({ type: 'tracks' })
    assert.deepEqual(env.named('user-info-updated'), [])
    // A republished camera: the same tile swaps the track without a new user-info-updated.
    const tile = env.page.add('remote-user-ana')
    ana.videoTrack.play('remote-user-ana')
    const next = { id: 'ana-camera-2' }
    env.engine.tracks.set(key('ana', 'camera'), next)
    env.engine.emit({ type: 'tracks' })
    assert.deepEqual(tracksOf(tile.children[0]), [next])
    assert.deepEqual(env.named('user-info-updated'), [])

    // Anyone toggling a mic re-sends the roster and the tracks: the playing elements are left alone (no blink),
    // and a person whose mic is off never shows as speaking, whatever level the browser still reports.
    level = 0.3
    const playing = tile.children[0].srcObject, heard = audio.srcObject
    env.engine.emit(peers({ peers: [{ uid: 'ana', mic: false, camera: true, screen: false }, { uid: 'bia', mic: true, camera: false, screen: false }], ownScreen: false }))
    env.engine.emit({ type: 'tracks' })
    env.engine.emit(peers({ peers: [{ uid: 'ana', mic: false, camera: true, screen: false }, { uid: 'bia', mic: true, camera: false, screen: false }], ownScreen: false }))
    assert.equal(tile.children[0].srcObject, playing)
    assert.equal(audio.srcObject, heard)
    assert.equal(audio.played, 1)
    assert.equal(chat.getRemoteAudio('ana').speaking, false)
})

test('camera: on sends and previews, off pauses and turns the light off', async () => {
    const env = load()
    const chat = env.create()
    const box = env.page.add('local-video')
    assert.equal(await chat.toggleCamera(), false)
    const track = env.captured.at(-1)
    assert.equal(track.kind, 'video')
    assert.deepEqual(env.engine.calls.at(-1), ['resume', 'camera', track])
    assert.deepEqual(tracksOf(box.children[0]), [track])
    assert.equal(box.children[0].style.transform, 'scaleX(-1)')

    const meeting = env.page.add('local-meeting-video')
    chat.playVideoTrackAtElementId('local-meeting-video')
    assert.deepEqual(tracksOf(meeting.children[0]), [track])
    chat.playVideoTrackAtElementId('local-video')

    assert.equal(await chat.toggleCamera(), true)
    assert.deepEqual(env.engine.calls.at(-1), ['pause', 'camera'])
    assert.equal(track.stopped, true)
    assert.equal(box.children.length, 0)
    assert.equal(await chat.turnOffCamera(), false)
})

test('microphone: mute pauses the same track, unmute resumes it', async () => {
    const env = load()
    const chat = env.create()
    assert.equal(chat.isMicrophoneMuted(), true)
    assert.equal(await chat.toggleMicrophone(), false)
    const track = env.captured.at(-1)
    assert.equal(track.kind, 'audio')
    assert.deepEqual(env.engine.calls.at(-1), ['resume', 'mic', track])
    assert.equal(chat.isMicrophoneMuted(), false)
    assert.equal(await chat.toggleMicrophone(), true)
    assert.deepEqual(env.engine.calls.at(-1), ['pause', 'mic'])
    assert.equal(track.stopped, false)
    assert.equal(await chat.toggleMicrophone(), false)
    assert.deepEqual(env.engine.calls.at(-1), ['resume', 'mic', track])
    assert.equal(env.captured.length, 1)
    assert.equal(await chat.muteMicrophone(), true)
    assert.equal(await chat.muteMicrophone(), false)
    assert.equal(chat.isMicrophoneMuted(), true)
})

test('layers: the biggest request after 250 ms, back to q, asked again after a reconnect', async () => {
    const env = load()
    const chat = env.create()
    env.engine.emit(peers({ peers: [{ uid: 'ana', mic: true, camera: true, screen: false }], ownScreen: false }))
    const meeting = chat.requestLayer('ana', 'h')
    const enlarged = chat.requestLayer('ana', 'f')
    assert.deepEqual([...env.timers.values()].map(timer => timer.ms), [250])
    env.fire()
    assert.deepEqual(plain(env.socket.requests), [['mediaLayer', { fromUid: 'ana', layer: 'f' }]])
    enlarged()
    meeting()
    env.fire()
    assert.deepEqual(plain(env.socket.requests.at(-1)), ['mediaLayer', { fromUid: 'ana', layer: 'q' }])

    // A tile that grows and shrinks back within 250 ms sends nothing.
    const quick = chat.requestLayer('ana', 'h')
    quick()
    env.fire()
    assert.equal(env.socket.requests.length, 2)

    chat.requestLayer('ana', 'h')
    env.fire()
    assert.deepEqual(plain(env.socket.requests.at(-1)), ['mediaLayer', { fromUid: 'ana', layer: 'h' }])
    env.engine.emit({ type: 'reconnected' })
    env.fire()
    assert.deepEqual(plain(env.socket.requests.slice(3)), [['mediaLayer', { fromUid: 'ana', layer: 'h' }]])
})

test('speakers: silent and playing when they arrive, stopped when they go, published through the engine', async () => {
    const env = load()
    const chat = env.create()
    const track = { id: 'lounge-track' }
    env.engine.speakers = ['lounge']
    env.engine.tracks.set(key(null, 'speaker', 'lounge'), track)
    env.engine.emit({ type: 'tracks' })
    const audio = chat.speakerAudio('lounge')
    assert.ok(audio)
    assert.equal(audio.element.volume, 0)
    assert.equal(audio.element.played, 1)
    assert.deepEqual(tracksOf(audio.element), [track])
    assert.equal(env.named('remote-speakers-changed').length, 1)
    env.engine.emit({ type: 'tracks' })
    assert.equal(env.named('remote-speakers-changed').length, 1)

    env.engine.speakers = []
    env.engine.tracks.delete(key(null, 'speaker', 'lounge'))
    env.engine.emit({ type: 'tracks' })
    assert.equal(chat.speakerAudio('lounge'), null)
    assert.equal(audio.element.srcObject, null)
    assert.equal(env.named('remote-speakers-changed').length, 2)

    const local = fakeTrack('audio')
    await chat.publishSpeaker('lounge', local)
    assert.deepEqual(env.engine.calls.at(-1), ['publish', 'speaker', local, 'lounge'])
    await chat.unpublishSpeaker('lounge')
    assert.deepEqual(env.engine.calls.at(-1), ['unpublish', 'speaker', 'lounge'])
})

test('screen: only inside a conversation, sent as detail, ends with the track, previewed from the local track', async () => {
    const env = load()
    const chat = env.create()
    await assert.rejects(chat.startScreenShare(), { message: 'Aproxime-se de alguém para iniciar uma chamada antes de compartilhar a tela.' })
    env.engine.emit(peers())
    await chat.startScreenShare()
    const track = env.captured.at(-1)
    assert.equal(track.contentHint, 'detail')
    assert.deepEqual(env.engine.calls.at(-1), ['publish', 'screen', track, undefined])
    assert.deepEqual(env.named('screen-share-changed'), [['screen-share-changed', true]])

    const tile = env.page.add('remote-user-me-screen')
    const stopPreview = chat.showScreenPreview('remote-user-me-screen')
    const preview = tile.children[0]
    assert.equal(preview.style.objectFit, 'contain')
    assert.equal(preview.style.transform, '')
    assert.deepEqual(tracksOf(preview), [track])
    stopPreview()
    assert.equal(tile.children.length, 0)

    track.fire('ended')
    await tick()
    assert.deepEqual(env.engine.calls.at(-1), ['unpublish', 'screen', undefined])
    assert.equal(track.stopped, true)
    assert.deepEqual(env.named('screen-share-changed').at(-1), ['screen-share-changed', false])
    assert.equal(typeof chat.showScreenPreview('remote-user-me-screen'), 'function')
    assert.equal(tile.children.length, 0)

    // The conversation ends while the server accepts the share: cancelled, unpublished, the button stays off.
    env.engine.emit(peers())
    env.clear()
    const release = env.holdPublish()
    const late = chat.startScreenShare()
    await tick()
    env.engine.emit(peers({ conversation: null, peers: [], ownScreen: false }))
    release()
    await assert.rejects(late, { message: 'Compartilhamento cancelado.' })
    const lateTrack = env.captured.at(-1)
    assert.notEqual(lateTrack, track)
    assert.equal(lateTrack.stopped, true)
    assert.deepEqual(env.engine.calls.at(-1), ['unpublish', 'screen', undefined])
    assert.deepEqual(env.named('screen-share-changed'), [])
})

test('notices and destroy', async () => {
    let release
    const env = load()
    const chat = env.create()
    env.engine.emit({ type: 'track-error', fromUid: 'ana', kind: 'camera' })
    assert.deepEqual(plain(env.named('officeFeedback')), [['officeFeedback', { message: 'Não foi possível receber a mídia de um participante.' }]])
    env.engine.emit({ type: 'reconnect-notice' })
    assert.deepEqual(plain(env.named('officeNotice')), [['officeNotice', { message: 'Reconectando o vídeo...', key: 'video-reconnecting' }]])

    await chat.toggleCamera()
    await chat.toggleMicrophone()
    const [camera, mic] = env.captured
    env.engine.emit(peers({ peers: [{ uid: 'ana', mic: true, camera: true, screen: false }], ownScreen: false }))
    env.engine.tracks.set(key('ana', 'camera'), { id: 'cam' })
    env.engine.tracks.set(key('ana', 'mic'), { id: 'mic' })
    env.engine.emit({ type: 'tracks' })
    const ana = env.named('user-info-updated').at(-1)[1]
    const tile = env.page.add('remote-user-ana')
    ana.videoTrack.play('remote-user-ana')
    const audio = ana.audioTrack.element
    env.clear()

    chat.destroy()
    assert.deepEqual(env.engine.calls.at(-1), ['stop'])
    assert.equal(camera.stopped, true)
    assert.equal(mic.stopped, true)
    assert.equal(tile.children.length, 0)
    assert.equal(audio.srcObject, null)
    assert.equal(env.named('reset-users').length, 1)
    assert.equal(env.socket.handlers.has('disconnect'), false)
    assert.equal(chat.isConnected, false)
    chat.configure(config(9))
    assert.equal(env.engines.length, 1, 'a destroyed chat never starts again')
    assert.deepEqual(env.engine.calls.at(-1), ['stop'])

    // A camera still opening when the call ends is closed and refused.
    const late = load({ capture: () => new Promise(resolve => { release = resolve }) })
    const next = late.create()
    const pending = next.toggleCamera()
    await tick()
    next.destroy()
    release()
    await assert.rejects(pending, { message: 'A chamada foi encerrada.' })
    assert.equal(late.captured[0].stopped, true)
    assert.equal(late.engine.calls.some(([name]) => name === 'resume'), false)
})

test('publish-failed after a reconnect turns that toggle off and says so', async () => {
    const env = load()
    const chat = env.create()
    env.engine.emit(peers())
    await chat.toggleMicrophone()
    await chat.toggleCamera()
    await chat.startScreenShare()
    const [mic, camera, screen] = env.captured
    const box = env.page.add('local-video')
    chat.playVideoTrackAtElementId('local-video')
    const speaker = fakeTrack('audio')
    await chat.publishSpeaker('lounge', speaker)
    env.clear()

    env.engine.emit({ type: 'publish-failed', kind: 'mic', error: 'x' })
    assert.equal(mic.stopped, true)
    assert.equal(chat.isMicrophoneMuted(), true)
    env.engine.emit({ type: 'publish-failed', kind: 'camera', error: 'x' })
    assert.equal(camera.stopped, true)
    assert.equal(box.children.length, 0)
    assert.equal(await chat.turnOffCamera(), false)
    env.engine.emit({ type: 'publish-failed', kind: 'screen', error: 'x' })
    assert.equal(screen.stopped, true)
    env.engine.emit({ type: 'publish-failed', kind: 'speaker', objectId: 'lounge', error: 'x' })
    assert.equal(speaker.stopped, true)
    await tick()

    assert.deepEqual(plain(env.signals), [
        ['local-microphone-changed', true],
        ['officeFeedback', { message: 'Não foi possível reenviar seu microfone.' }],
        ['local-camera-changed', true],
        ['officeFeedback', { message: 'Não foi possível reenviar sua câmera.' }],
        ['screen-share-changed', false],
        ['officeFeedback', { message: 'Não foi possível reenviar sua tela.' }],
        ['speaker-publish-failed', { objectId: 'lounge' }],
        ['officeFeedback', { message: 'Não foi possível reenviar o áudio da caixa de som.' }],
    ])
    // The engine already forgot those publications: nothing is unpublished.
    assert.equal(env.engine.calls.some(([name]) => name === 'unpublish' || name === 'pause'), false)
    // A track this page no longer sends says nothing.
    env.clear()
    env.engine.emit({ type: 'publish-failed', kind: 'mic', error: 'x' })
    assert.deepEqual(env.signals, [])
    // Turning the microphone on again captures a new track.
    assert.equal(await chat.toggleMicrophone(), false)
    assert.notEqual(env.captured.at(-1), mic)
})

test('a new office socket gets a new engine, started at once, with what this page still sends', async () => {
    const env = load()
    const chat = env.create(config(1))
    const first = env.engine
    env.engine.emit(peers())
    await chat.toggleMicrophone()
    await chat.toggleCamera()
    await chat.startScreenShare()
    const [mic, camera, screen] = env.captured
    const speaker = fakeTrack('audio')
    await chat.publishSpeaker('lounge', speaker)
    env.clear()

    // Leaving the office: the engine stops while its handlers are still on the old socket.
    env.socket.handlers.get('disconnect')('io client disconnect')
    assert.deepEqual(first.calls.at(-1), ['stop'])
    assert.equal(env.socket.handlers.has('disconnect'), false)
    assert.equal(env.named('user-left').length, 3)
    assert.equal(env.named('video-channel-left').length, 1)
    assert.equal(screen.stopped, true)
    assert.equal(speaker.stopped, true)
    assert.deepEqual(plain(env.named('speaker-publish-failed')), [['speaker-publish-failed', { objectId: 'lounge' }]])
    assert.equal(mic.stopped, false)
    assert.equal(camera.stopped, false)
    assert.equal(chat.isConnected, false)

    env.replaceSocket()
    chat.configure(config(7))
    const second = env.engine
    assert.notEqual(second, first)
    assert.deepEqual(second.calls[0], ['start', 7], 'started synchronously')
    assert.equal(typeof env.socket.handlers.get('disconnect'), 'function')
    await tick()
    assert.deepEqual(second.calls.slice(1), [['resume', 'mic', mic], ['resume', 'camera', camera]])

    // Events of the old engine are ignored.
    env.clear()
    first.emit(peers())
    assert.deepEqual(env.signals, [])

    // The socket replaced without a disconnect seen here (the chat was made on the old one): rebuilt as well.
    await chat.toggleMicrophone()
    const oldSocket = env.socket
    assert.equal(second.options.socket, oldSocket)
    const newSocket = env.replaceSocket()
    chat.configure(config(8))
    const third = env.engine
    assert.deepEqual(second.calls.at(-1), ['stop'])
    // Handlers leave the socket they were added to, not the current one.
    assert.equal(oldSocket.handlers.has('disconnect'), false)
    assert.equal(typeof newSocket.handlers.get('disconnect'), 'function')
    assert.equal(third.options.socket, newSocket)
    assert.deepEqual(third.calls[0], ['start', 8])
    await tick()
    assert.deepEqual(third.calls.slice(1), [['resume', 'camera', camera]], 'a muted microphone is not sent')

    // Same socket: the same engine starts again.
    chat.configure(config(9))
    assert.equal(env.engine, third)
    assert.deepEqual(third.calls.at(-1), ['start', 9])

    // A republish the new engine refuses turns that toggle off.
    env.socket.handlers.get('disconnect')('io client disconnect')
    env.replaceSocket()
    env.clear()
    const failing = env.deps.createEngine
    env.deps.createEngine = options => { const engine = failing(options); engine.fail = 'recusado'; return engine }
    chat.configure(config(10))
    await tick()
    assert.equal(camera.stopped, true)
    assert.deepEqual(env.named('local-camera-changed'), [['local-camera-changed', true]])
    assert.deepEqual(plain(env.named('officeFeedback')), [['officeFeedback', { message: 'Não foi possível reenviar sua câmera.' }]])
})

test('a device switch never revives a camera turned off, leaks nothing on destroy, and closes the old track on failure', async () => {
    const env = load()
    const chat = env.create()
    const box = env.page.add('local-video')
    await chat.toggleCamera()
    const first = env.captured.at(-1)

    // The camera is turned off while the new one opens.
    let release = env.holdCapture()
    let switching = chat.selectCamera('cam')
    await tick()
    assert.equal(await chat.turnOffCamera(), true)
    release()
    await switching
    const late = env.captured.at(-1)
    assert.notEqual(late, first)
    assert.equal(late.stopped, true)
    assert.equal(first.stopped, true)
    assert.equal(await chat.turnOffCamera(), false)
    assert.equal(box.children.length, 0)
    assert.equal(env.engine.calls.some(([name]) => name === 'replaceTrack'), false)

    // The microphone is dropped (publish-failed) while the new one opens.
    await chat.toggleMicrophone()
    release = env.holdCapture()
    switching = chat.selectMicrophone('default')
    await tick()
    env.engine.emit({ type: 'publish-failed', kind: 'mic', error: 'x' })
    release()
    await switching
    assert.equal(env.captured.at(-1).stopped, true)
    assert.equal(chat.isMicrophoneMuted(), true)
    assert.equal(env.engine.calls.some(([name]) => name === 'replaceTrack'), false)

    // replaceTrack refused: the new track is the camera now, and the old one is closed anyway.
    await chat.toggleCamera()
    const before = env.captured.at(-1)
    env.failReplace('recusado')
    await assert.rejects(chat.selectCamera('cam'), { message: 'recusado' })
    const after = env.captured.at(-1)
    assert.equal(before.stopped, true)
    assert.equal(after.stopped, false)
    assert.deepEqual(tracksOf(box.children[0]), [after])
    env.failReplace(null)
    assert.equal(await chat.turnOffCamera(), true)
    assert.equal(after.stopped, true)

    // The call ends while the new device opens.
    const other = load()
    const ended = other.create()
    await ended.toggleCamera()
    release = other.holdCapture()
    switching = ended.selectCamera('cam')
    await tick()
    ended.destroy()
    release()
    await switching
    assert.equal(other.captured.length, 2)
    assert.ok(other.captured.every(track => track.stopped))
    assert.equal(other.engine.calls.some(([name]) => name === 'replaceTrack'), false)
})

test('the audio output is saved only once the audio moved there', async () => {
    const env = load()
    const chat = env.create()
    env.setDevices([{ kind: 'audioinput', deviceId: 'default' }, { kind: 'audiooutput', deviceId: 'default' }, { kind: 'audiooutput', deviceId: 'usb-out' }])
    env.engine.emit(peers({ peers: [{ uid: 'ana', mic: true, camera: false, screen: false }], ownScreen: false }))
    env.engine.tracks.set(key('ana', 'mic'), { id: 'ana-mic' })
    env.engine.emit({ type: 'tracks' })
    const audio = env.named('user-info-updated').at(-1)[1].audioTrack.element
    env.clear()
    env.page.failSink = true
    await assert.rejects(chat.selectOutput('usb-out'), { message: 'sink refused' })
    assert.equal(chat.getDevicePreferences().outputId, '')
    assert.deepEqual(env.named('media-preferences-changed'), [])
    env.page.failSink = false
    await chat.selectOutput('usb-out')
    assert.equal(audio.sinkId, 'usb-out')
    assert.equal(chat.getDevicePreferences().outputId, 'usb-out')
    assert.equal(env.named('media-preferences-changed').length, 1)
})

test('the engine gets the camera placeholder of the deps', () => {
    const env = load()
    const placeholder = () => null
    env.deps.createPlaceholder = placeholder
    env.create()
    assert.equal(env.engine.options.createPlaceholder, placeholder)
    const without = load()
    without.create()
    assert.equal('createPlaceholder' in without.engine.options, false)
})
