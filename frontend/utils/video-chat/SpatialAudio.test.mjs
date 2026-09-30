import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

function load() {
  const exports = {}, commands = [], clients = [], tracks = []
  let ackStart
  const source = ts.transpileModule(readFileSync(new URL('./SpatialAudio.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText
  const media = { stopped: false, stop() { this.stopped = true }, addEventListener() {} }
  const stream = { getAudioTracks: () => [media], getTracks: () => [media] }
  const socket = { timeout: () => ({ emit(event, data, ack) { commands.push(event); if (event === 'speakerStart') ackStart = ack; else ack(null, { ok: true }) } }) }
  vm.runInNewContext(source, {
    exports, process: { env: {} }, window: {}, navigator: { mediaDevices: { getDisplayMedia: async () => stream } },
    require: name => {
      if (name === 'agora-rtc-sdk-ng') return {
        createClient() { const client = { connectionState: 'DISCONNECTED', async join() { this.connectionState = 'CONNECTED' }, async publish() {}, async leave() { this.connectionState = 'DISCONNECTED' }, on() {} }; clients.push(client); return client },
        createCustomAudioTrack() { const track = { closed: false, close() { this.closed = true } }; tracks.push(track); return track },
      }
      if (name === '../backend/server') return { server: { socket } }
      if (name === '../signal') return { emit() {} }
      if (name === './generateToken') return { generateSpeakerToken: async () => ({ channel: 'speaker-test', token: 'mock', uid: 'user-speaker' }) }
      if (name === './video-chat') return { videoChat: { outputSupported: false } }
      throw new Error(name)
    },
  })
  return { audio: exports.spatialAudio, commands, media, clients, tracks, waitStart: async () => { while (!ackStart) await Promise.resolve() }, acknowledge: () => ackStart(null, { ok: true }) }
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
