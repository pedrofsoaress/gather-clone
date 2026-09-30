import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Session, type Room } from '../session'

test('room features follow the player and clear owned state when changing rooms', () => {
  const room: Room = { name: 'Room', tilemap: { '0, 0': {}, '1, 0': {}, '2, 0': {} }, interactions: [
    { id: 'speaker', label: 'Speaker', kind: 'speaker', bounds: { x: 0, y: 0, width: 1, height: 1 }, approach: { x: 1, y: 0 }, config: { rangeTiles: 5 } },
    { id: 'slides', label: 'Slides', kind: 'presentation', bounds: { x: 0, y: 0, width: 1, height: 1 }, approach: { x: 1, y: 0 }, config: { deckId: 'deck', slides: [{ title: 'Hello' }] } },
  ] }
  const session = new Session('office', { spawnpoint: { roomIndex: 0, x: 1, y: 0 }, rooms: [room, structuredClone(room)] })
  session.addPlayer('socket', 'owner', 'Owner', '001')
  assert.equal(session.featuresFor('owner').speakers.start('owner', 'speaker').ok, true)
  assert.equal(session.featuresFor('owner').presentations.start('owner', 'slides').ok, true)
  session.changeRoom('owner', 1, 1, 0)
  assert.deepEqual(session.roomFeatures[0].speakers.snapshotFor('owner'), {})
  assert.deepEqual(session.roomFeatures[0].presentations.snapshot(), {})
  assert.equal(session.featuresFor('owner'), session.roomFeatures[1])
  assert.equal(session.featuresFor('owner').presentations.start('owner', 'slides').ok, true)
  assert.equal(session.featuresFor('owner').speakers.start('owner', 'speaker').ok, true)
  session.removePlayer('owner')
  assert.deepEqual(session.roomFeatures[1].presentations.snapshot(), {})
  assert.deepEqual(session.roomFeatures[1].speakers.snapshotFor('owner'), {})
})
