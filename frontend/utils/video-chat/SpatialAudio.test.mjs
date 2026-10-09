import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

function load({ micError } = {}) {
  const exports = {}, commands = [], clients = [], tracks = [], micCalls = []
  let displayCalls = 0
  let ackStart
  const source = ts.transpileModule(readFileSync(new URL('./SpatialAudio.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText
  const media = { stopped: false, stop() { this.stopped = true }, addEventListener() {} }
  const stream = { getAudioTracks: () => [media], getTracks: () => [media] }
  const socket = { timeout: () => ({ emit(event, data, ack) { commands.push(event); if (event === 'speakerStart') ackStart = ack; else ack(null, { ok: true }) } }) }
  vm.runInNewContext(source, {
    exports, process: { env: {} }, window: {}, navigator: { mediaDevices: { getDisplayMedia: async () => { displayCalls++; return stream }, getUserMedia: async constraints => { micCalls.push(constraints); if (micError) throw micError; return stream } } },
    require: name => {
      if (name === 'agora-rtc-sdk-ng') return {
        createClient() { const client = { connectionState: 'DISCONNECTED', async join() { this.connectionState = 'CONNECTED' }, async publish() {}, async leave() { this.connectionState = 'DISCONNECTED' }, on() {} }; clients.push(client); return client },
        createCustomAudioTrack() { const track = { closed: false, close() { this.closed = true } }; tracks.push(track); return track },
      }
      if (name === '../backend/server') return { server: { socket } }
      if (name === '../signal') return { emit() {} }
      if (name === './generateToken') return { generateSpeakerToken: async () => ({ channel: 'speaker-test', token: 'mock', uid: 'user-speaker' }) }
      if (name === './video-chat') return { videoChat: { outputSupported: false, getDevicePreferences: () => ({ microphoneId: 'usb-mic' }) } }
      throw new Error(name)
    },
  })
  return { audio: exports.spatialAudio, commands, media, clients, tracks, micCalls, displayCalls: () => displayCalls, waitStart: async () => { while (!ackStart) await Promise.resolve() }, acknowledge: () => ackStart(null, { ok: true }) }
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
