import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

function load({ micError, provider = 'agora' } = {}) {
  const exports = {}, commands = [], clients = [], tracks = [], micCalls = []
  const speakerCalls = [], handles = {}, signalHandlers = new Map()
  let displayCalls = 0
  let ackStart
  const source = ts.transpileModule(readFileSync(new URL('./SpatialAudio.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText
  const media = { stopped: false, stop() { this.stopped = true }, addEventListener() {} }
  const stream = { getAudioTracks: () => [media], getTracks: () => [media] }
  const videoChat = { provider, outputSupported: false, getDevicePreferences: () => ({ microphoneId: 'usb-mic' }),
    speakerAudio: id => handles[id] ?? null,
    publishSpeaker: async (id, track) => { speakerCalls.push(['publish', id, track === media]) },
    unpublishSpeaker: async id => { speakerCalls.push(['unpublish', id]) } }
  const socket = { timeout: () => ({ emit(event, data, ack) { commands.push(event); if (event === 'speakerStart') ackStart = ack; else ack(null, { ok: true }) } }) }
  vm.runInNewContext(source, {
    exports, process: { env: {} }, window: {}, navigator: { mediaDevices: { getDisplayMedia: async () => { displayCalls++; return stream }, getUserMedia: async constraints => { micCalls.push(constraints); if (micError) throw micError; return stream } } },
    require: name => {
      if (name === 'agora-rtc-sdk-ng') return {
        createClient() { const client = { connectionState: 'DISCONNECTED', async join() { this.connectionState = 'CONNECTED' }, async publish() {}, async leave() { this.connectionState = 'DISCONNECTED' }, on() {} }; clients.push(client); return client },
        createCustomAudioTrack() { const track = { closed: false, close() { this.closed = true } }; tracks.push(track); return track },
      }
      if (name === '../backend/server') return { server: { socket } }
      if (name === '../signal') return { emit() {}, on: (event, fn) => signalHandlers.set(event, fn) }
      if (name === './generateToken') return { generateSpeakerToken: async () => ({ channel: 'speaker-test', token: 'mock', uid: 'user-speaker' }) }
      if (name === './video-chat') return { videoChat }
      throw new Error(name)
    },
  })
  return { audio: exports.spatialAudio, commands, media, clients, tracks, micCalls, speakerCalls, handles, signalHandlers, videoChat, displayCalls: () => displayCalls, waitStart: async () => { while (!ackStart) await Promise.resolve() }, acknowledge: () => ackStart(null, { ok: true }) }
}

test('cancelling while speakerStart waits for ack releases the server reservation', async () => {
  const env = load()
  const result = env.audio.start('speaker').catch(error => error.message)
  await env.waitStart()
  await env.audio.stop()
  env.acknowledge()
  assert.equal(typeof await result, 'string')
  assert.ok(env.commands.includes('speakerStop'))
  assert.equal(env.media.stopped, true)
  assert.equal(env.tracks.length, 0)
})

test('capture stop closes the specific published audio and leaves its Agora channel', async () => {
  const env = load()
  const result = env.audio.start('speaker')
  await env.waitStart()
  env.acknowledge()
  await result
  await env.audio.stop()
  assert.equal(env.media.stopped, true)
  assert.equal(env.tracks[0].closed, true)
  assert.equal(env.clients[0].connectionState, 'DISCONNECTED')
  assert.equal(env.commands.filter(event => event === 'speakerStop').length, 1)
})

test('a stage microphone captures the microphone and publishes it to the room', async () => {
  const env = load()
  const start = env.audio.start('training-stage-mic', 'microphone')
  await env.waitStart()
  env.acknowledge()
  await start
  assert.equal(env.displayCalls(), 0)
  assert.equal(env.micCalls.length, 1)
  assert.equal(env.micCalls[0].audio.echoCancellation, true)
  assert.deepEqual(JSON.parse(JSON.stringify(env.micCalls[0].audio.deviceId)), { ideal: 'usb-mic' })
  assert.equal(env.tracks.length, 1)
})

test('the lounge speaker still shares a browser tab', async () => {
  const env = load()
  const start = env.audio.start('lounge-speaker')
  await env.waitStart()
  env.acknowledge()
  await start
  assert.equal(env.displayCalls(), 1)
  assert.equal(env.micCalls.length, 0)
})

test('a missing microphone gets its own message and leaves nothing behind', async () => {
  for (const [name, message] of [
    ['NotFoundError', 'Nenhum microfone encontrado neste computador.'],
    ['NotReadableError', 'O microfone está em uso por outro programa.'],
    ['NotAllowedError', 'Permita o microfone no navegador para falar para a sala.'],
  ]) {
    const env = load({ micError: { name } })
    await assert.rejects(env.audio.start('training-stage-mic', 'microphone'), { message })
    assert.deepEqual(env.commands, [], name)
    assert.equal(env.clients.length, 0, name)
    await assert.rejects(env.audio.start('training-stage-mic', 'microphone'), { message }, 'a new attempt is possible')
  }
})

test('with Cloudflare the speaker is published through the office connection, never through an Agora client', async () => {
  const env = load({ provider: 'cloudflare' })
  const start = env.audio.start('lounge-speaker')
  await env.waitStart()
  env.acknowledge()
  await start
  assert.deepEqual(env.speakerCalls, [['publish', 'lounge-speaker', true]])
  assert.equal(env.clients.length, 0)
  await env.audio.stop()
  assert.deepEqual(env.speakerCalls.at(-1), ['unpublish', 'lounge-speaker'])
  assert.ok(env.commands.includes('speakerStop'))
})

test('with Cloudflare each speaker plays at the volume of where you stand, and silent when muted', () => {
  const env = load({ provider: 'cloudflare' })
  const volumes = []
  env.handles['lounge-speaker'] = { setVolume: value => volumes.push(value), play() {} }
  env.audio.update({ 'lounge-speaker': { ownerUid: 'dj', channel: 'speaker-1', volume: 67 } }, 'me')
  assert.deepEqual(volumes, [67])
  env.audio.setMuted(true)
  assert.deepEqual(volumes, [67, 0])
  env.audio.setMuted(false)
  env.signalHandlers.get('remote-speakers-changed')()
  assert.deepEqual(volumes, [67, 0, 67, 67])
  assert.equal(env.clients.length, 0, 'listening needs no Agora client either')
})

const settle = () => new Promise(resolve => setImmediate(resolve))

test('with Cloudflare a speaker the office connection could not keep ends its own publication and tells the server', async () => {
  const env = load({ provider: 'cloudflare' })
  const start = env.audio.start('lounge-speaker')
  await env.waitStart()
  env.acknowledge()
  await start
  env.signalHandlers.get('speaker-publish-failed')({ objectId: 'another-speaker' })
  await settle()
  assert.equal(env.commands.filter(event => event === 'speakerStop').length, 0, 'another object is not this publication')
  env.signalHandlers.get('speaker-publish-failed')({ objectId: 'lounge-speaker' })
  await settle()
  assert.equal(env.commands.filter(event => event === 'speakerStop').length, 1)
  assert.equal(env.media.stopped, true)
  void env.audio.start('lounge-speaker').catch(() => {})
  await settle()
  assert.equal(env.commands.filter(event => event === 'speakerStart').length, 2, 'nothing left that blocks a new start')
})

test('a switch to Cloudflare leaves the Agora speaker channels and ends an Agora publication', async () => {
  const env = load()
  env.audio.update({ 'lounge-speaker': { ownerUid: 'dj', channel: 'speaker-test', volume: 67 } }, 'me')
  const start = env.audio.start('stage-mic', 'microphone')
  await env.waitStart()
  env.acknowledge()
  await start
  await settle()
  assert.equal(env.clients.length, 2)
  assert.ok(env.clients.every(client => client.connectionState === 'CONNECTED'))
  const volumes = []
  env.handles['lounge-speaker'] = { setVolume: value => volumes.push(value), play() {} }
  env.videoChat.provider = 'cloudflare'
  env.signalHandlers.get('video-provider-changed')({ provider: 'cloudflare' })
  await settle()
  assert.ok(env.clients.every(client => client.connectionState === 'DISCONNECTED'))
  assert.equal(env.tracks[0].closed, true)
  assert.equal(env.commands.filter(event => event === 'speakerStop').length, 1)
  assert.deepEqual(volumes, [67], 'the speaker in range plays at once on the new connection')
})

test('a switch back to Agora ends a Cloudflare publication and listens to the speakers in range again', async () => {
  const env = load({ provider: 'cloudflare' })
  env.audio.update({ 'lounge-speaker': { ownerUid: 'dj', channel: 'speaker-test', volume: 67 } }, 'me')
  const start = env.audio.start('stage-mic', 'microphone')
  await env.waitStart()
  env.acknowledge()
  await start
  assert.equal(env.clients.length, 0)
  env.videoChat.provider = 'agora'
  env.signalHandlers.get('video-provider-changed')({ provider: 'agora' })
  await settle()
  assert.deepEqual(env.speakerCalls.at(-1), ['unpublish', 'stage-mic'])
  assert.equal(env.commands.filter(event => event === 'speakerStop').length, 1)
  assert.equal(env.clients.length, 1, 'one Agora listener for the speaker in range')
  assert.equal(env.clients[0].connectionState, 'CONNECTED')
})

// The real router and the real SpatialAudio on one shared signal, as on the page: only the chats and Agora are fakes.
function loadWithRouter() {
  const compile = file => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText
  const signalModule = {}
  vm.runInNewContext(compile('../signal.ts'), { exports: signalModule })
  const signal = signalModule.default
  const emitted = []
  const emit = signal.emit.bind(signal)
  signal.emit = (event, data) => { emitted.push(event); emit(event, data) }
  const commands = [], clients = [], tracks = [], chats = [], acks = []
  const media = { stopped: false, stop() { this.stopped = true }, addEventListener() {} }
  const stream = { getAudioTracks: () => [media], getTracks: () => [media] }
  const fakeChat = provider => {
    const chat = {
      provider, calls: [], handles: {}, destroyed: false, outputSupported: false, isConnected: false,
      playVideoTrackAtElementId() {}, startDeviceMonitoring: () => () => {}, configure() { chat.calls.push(['configure']) },
      destroy() { chat.destroyed = true }, async joinChannel() {}, async leaveChannel() {},
      getDevicePreferences: () => ({ microphoneId: '', cameraId: '', outputId: '' }),
      speakerAudio: id => chat.handles[id] ?? null,
      async publishSpeaker(id) { if (provider !== 'cloudflare') throw new Error('agora'); chat.calls.push(['publish', id]) },
      async unpublishSpeaker(id) { chat.calls.push(['unpublish', id]) },
    }
    chats.push(chat)
    return chat
  }
  const router = {}
  vm.runInNewContext(compile('./video-chat.ts'), { exports: router, require: name => {
    if (name === '../signal') return signalModule
    if (name === './agora-video-chat') return { AgoraVideoChat: function () { return fakeChat('agora') } }
    if (name === './cloudflare/CloudflareVideoChat') return { CloudflareVideoChat: function () { return fakeChat('cloudflare') } }
    if (name === './AudioPreference') return { readMediaPreferences: () => ({ microphoneId: '', cameraId: '', outputId: '' }) }
    throw new Error(name)
  } })
  const socket = { timeout: () => ({ emit(event, data, ack) { commands.push(event); if (event === 'speakerStart') acks.push(ack); else ack(null, { ok: true }) } }) }
  const exports = {}
  vm.runInNewContext(compile('./SpatialAudio.ts'), {
    exports, process: { env: {} }, window: {}, navigator: { mediaDevices: { getUserMedia: async () => stream } },
    require: name => {
      if (name === 'agora-rtc-sdk-ng') return {
        createClient() { const client = { connectionState: 'DISCONNECTED', async join() { this.connectionState = 'CONNECTED' }, async publish() {}, async leave() { this.connectionState = 'DISCONNECTED' }, on() {} }; clients.push(client); return client },
        createCustomAudioTrack() { const track = { closed: false, close() { this.closed = true } }; tracks.push(track); return track },
      }
      if (name === '../backend/server') return { server: { socket } }
      if (name === '../signal') return signalModule
      if (name === './generateToken') return { generateSpeakerToken: async () => ({ channel: 'speaker-test', token: 'mock', uid: 'user-speaker' }) }
      if (name === './video-chat') return router
      throw new Error(name)
    },
  })
  const start = async objectId => {
    const before = acks.length
    const started = exports.spatialAudio.start(objectId, 'microphone')
    while (acks.length === before) await Promise.resolve()
    acks.at(-1)(null, { ok: true })
    await started
  }
  return { audio: exports.spatialAudio, signal, emitted, router: router.videoChat, chats, commands, clients, tracks, start }
}

test('the real router and SpatialAudio switch providers together: no Agora client left, no stale Cloudflare speaker', async () => {
  const env = loadWithRouter()
  const snapshot = { 'lounge-speaker': { ownerUid: 'dj', channel: 'speaker-test', volume: 67 } }
  env.audio.update(snapshot, 'me')
  await env.start('stage-mic')
  await settle()
  assert.equal(env.clients.length, 2, 'Agora: one listener and one publisher')
  assert.ok(env.clients.every(client => client.connectionState === 'CONNECTED'))

  env.signal.emit('mediaConfig', { provider: 'cloudflare', iceServers: [], bootstrap: true })
  await settle()
  const cloudflare = env.chats.find(chat => chat.provider === 'cloudflare')
  assert.ok(cloudflare)
  assert.ok(env.clients.every(client => client.connectionState === 'DISCONNECTED'), 'every Agora speaker client left')
  assert.equal(env.tracks[0].closed, true)
  assert.equal(env.commands.filter(event => event === 'speakerStop').length, 1, 'the Agora publication was ended with the server')

  const volumes = []
  cloudflare.handles['lounge-speaker'] = { setVolume: value => volumes.push(value), play() {} }
  env.signal.emit('remote-speakers-changed')
  assert.deepEqual(volumes, [67])
  await env.start('stage-mic')
  assert.deepEqual(cloudflare.calls.at(-1), ['publish', 'stage-mic'])
  assert.equal(env.clients.length, 2, 'Cloudflare makes no Agora client')

  env.signal.emit('mediaConfig', { provider: 'agora' })
  await settle()
  assert.equal(cloudflare.destroyed, true)
  assert.equal(env.commands.filter(event => event === 'speakerStop').length, 2, 'the stale Cloudflare publication was ended with the server')
  assert.equal(env.clients.length, 3, 'back on Agora: the speaker in range is heard again')
  assert.equal(env.clients[2].connectionState, 'CONNECTED')
  await env.start('stage-mic')
  assert.equal(env.clients.length, 4, 'and a new publication goes out on Agora')
})

test('with Agora a same-provider mediaConfig changes nothing: no new clients, nothing stopped, nothing told', async () => {
  const env = loadWithRouter()
  env.audio.update({ 'lounge-speaker': { ownerUid: 'dj', channel: 'speaker-test', volume: 67 } }, 'me')
  await env.start('stage-mic')
  await settle()
  const commands = [...env.commands], emitted = env.emitted.length
  env.signal.emit('mediaConfig', { provider: 'agora' })
  env.signal.emit('mediaConfig', { provider: 'agora' })
  await settle()
  assert.equal(env.clients.length, 2)
  assert.ok(env.clients.every(client => client.connectionState === 'CONNECTED'))
  assert.equal(env.tracks[0].closed, false)
  assert.deepEqual(env.commands, commands, 'no speakerStop, no speakerStart')
  assert.deepEqual(env.emitted.slice(emitted), ['mediaConfig', 'mediaConfig'], 'no provider change, no button reset')
  assert.equal(env.chats.length, 1, 'the one Agora chat of the page')
})
