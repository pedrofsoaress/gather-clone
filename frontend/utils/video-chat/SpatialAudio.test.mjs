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
  env.signalHandlers.get('mediaConfig')({ provider: 'cloudflare' })
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
  env.signalHandlers.get('mediaConfig')({ provider: 'agora' })
  await settle()
  assert.deepEqual(env.speakerCalls.at(-1), ['unpublish', 'stage-mic'])
  assert.equal(env.commands.filter(event => event === 'speakerStop').length, 1)
  assert.equal(env.clients.length, 1, 'one Agora listener for the speaker in range')
  assert.equal(env.clients[0].connectionState, 'CONNECTED')
})
