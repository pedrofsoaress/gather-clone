import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Room } from '../session'
import { OfficeState } from './OfficeState'
import { SpeakerState } from './SpeakerState'

function setup() {
  const room: Room = { name: 'Office', tilemap: Object.fromEntries(Array.from({ length: 12 }, (_, x) => [`${x}, 0`, x === 5 ? { privateAreaId: 'private' } : {}])), interactions: [
    { id: 'speaker', kind: 'speaker', label: 'Som', bounds: { x: 2, y: 0, width: 1, height: 1 }, approach: { x: 2, y: 0 }, config: { rangeTiles: 6 } },
  ] }
  const office = new OfficeState(room)
  office.addPlayer('owner', { x: 2, y: 0 })
  office.addPlayer('listener', { x: 4, y: 0 })
  office.addPlayer('far', { x: 10, y: 0 })
  office.addPlayer('private', { x: 5, y: 0 })
  return { office, state: new SpeakerState(room, office) }
}

test('speaker requires proximity, one owner, and rejects other owners stopping it', () => {
  const { state } = setup()
  assert.equal(state.start('far', 'speaker').ok, false)
  assert.equal(state.start('owner', 'speaker').ok, true)
  assert.equal(state.start('listener', 'speaker').ok, false)
  assert.equal(state.stop('listener', 'speaker').ok, false)
  assert.equal(state.stop('owner', 'speaker').ok, true)
})

test('distance and private zones determine listener volume and token authorization', () => {
  const { state } = setup()
  state.start('owner', 'speaker')
  assert.equal(state.snapshotFor('listener').speaker.volume, 67)
  assert.equal(state.snapshotFor('far').speaker.volume, 0)
  assert.equal(state.authorize('far', 'speaker', false), null)
  assert.equal(state.authorize('private', 'speaker', false), null)
  assert.equal(state.authorize('listener', 'speaker', true), null)
  assert.ok(state.authorize('owner', 'speaker', true)?.channel.startsWith('speaker-'))
  assert.ok(state.authorize('listener', 'speaker', false))
})

test('owner departure or leaving the radius clears the speaker', () => {
  const { state, office } = setup()
  state.start('owner', 'speaker')
  state.removePlayer('owner')
  assert.deepEqual(state.snapshotFor('listener'), {})
  state.start('owner', 'speaker')
  office.addPlayer('owner', { x: 10, y: 0 })
  assert.equal(state.expire(), true)
  assert.deepEqual(state.snapshotFor('listener'), {})
})

function trainingRoom(): Room {
    const tilemap: Room['tilemap'] = {}
    for (let x = 0; x < 40; x++) for (let y = 0; y < 10; y++) tilemap[`${x}, ${y}`] = x >= 10 ? { areaId: 'matte-training' } : {}
    return {
        name: 'Matte', tilemap,
        areas: { 'matte-training': { label: 'Sala de treinamento', conversation: 'stage' } },
        interactions: [
            { id: 'stage-mic', kind: 'speaker', label: 'Microfone do palco', bounds: { x: 20, y: 0, width: 1, height: 1 }, approach: { x: 20, y: 1 }, config: { rangeTiles: 40, flat: true } },
            { id: 'audience-mic', kind: 'speaker', label: 'Microfone da plateia', bounds: { x: 20, y: 6, width: 1, height: 1 }, approach: { x: 20, y: 7 }, config: { rangeTiles: 40, flat: true } },
        ],
    }
}

test('stage and audience microphones reach every seat of the training room at full volume, together', () => {
    const room = trainingRoom()
    const office = new OfficeState(room)
    const speakers = new SpeakerState(room, office)
    office.addPlayer('host', { x: 20, y: 1 })
    office.addPlayer('guest', { x: 20, y: 7 })
    office.addPlayer('far', { x: 39, y: 9 })
    office.addPlayer('outside', { x: 5, y: 5 })
    assert.equal(speakers.start('host', 'stage-mic').ok, true)
    assert.equal(speakers.start('guest', 'audience-mic').ok, true)
    const heard = speakers.snapshotFor('far')
    assert.equal(heard['stage-mic'].volume, 100)
    assert.equal(heard['audience-mic'].volume, 100)
    assert.equal(speakers.snapshotFor('outside')['stage-mic'].volume, 0)
})

test('a flat microphone stops when its speaker walks away from it', () => {
    let now = 0
    const room = trainingRoom()
    const office = new OfficeState(room, () => now)
    const speakers = new SpeakerState(room, office)
    office.addPlayer('host', { x: 20, y: 1 })
    speakers.start('host', 'stage-mic')
    for (const x of [21, 22, 23]) { now += 1000; office.step('host', { x, y: 1 }) }
    assert.equal(speakers.expire(), true)
    assert.deepEqual(speakers.snapshotFor('host'), {})
})

test('a microphone asks to come closer to the microphone, the lounge speaker keeps its own text', () => {
    const room = trainingRoom()
    const office = new OfficeState(room)
    const speakers = new SpeakerState(room, office)
    office.addPlayer('far', { x: 30, y: 9 })
    assert.deepEqual(speakers.start('far', 'stage-mic'), { ok: false, error: 'Aproxime-se do microfone.' })
    assert.deepEqual(setup().state.start('far', 'speaker'), { ok: false, error: 'Aproxime-se da caixa de som.' })
})
