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
