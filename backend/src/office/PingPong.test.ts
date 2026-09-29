import assert from 'node:assert/strict'
import { test } from 'node:test'
import { OfficeState } from './OfficeState'
import type { Room } from '../session'

const tilemap: Room['tilemap'] = {}
for (let x = 0; x < 12; x++) for (let y = 0; y < 12; y++) tilemap[`${x}, ${y}`] = { floor: 'floor' }
const room: Room = {
  name: 'Matte', tilemap,
  interactions: [
    { id: 'pingpong', kind: 'pingpong', label: 'Pingue-pongue', bounds: { x: 5, y: 5, width: 3, height: 3 }, approach: { x: 4, y: 6 } },
    { id: 'coffee', kind: 'drink', label: 'Café', bounds: { x: 1, y: 1, width: 2, height: 2 }, approach: { x: 2, y: 3 }, effect: 'coffee' },
  ],
}

test('two nearby players rally, a third cannot join, and a missed return awards a point', () => {
  let now = 1000
  const state = new OfficeState(room, () => now)
  state.addPlayer('u1', { x: 4, y: 6 }, 'Ana')
  state.addPlayer('u2', { x: 4, y: 6 }, 'Bruno')
  state.addPlayer('u3', { x: 4, y: 6 }, 'Carla')
  assert.equal(state.startGame('u1', 'pingpong').ok, true)
  assert.equal(state.joinGame('u2', 'pingpong').ok, true)
  assert.equal(state.joinGame('u3', 'pingpong').ok, false)
  assert.equal(state.returnBall('u2', 'pingpong').ok, false)
  assert.equal(state.returnBall('u1', 'pingpong').ok, true)
  assert.equal(state.snapshot().games.pingpong?.rally, 1)
  assert.equal(state.snapshot().games.pingpong?.turn, 'u2')
  now += 3001
  assert.equal(state.expire(), true)
  assert.deepEqual(state.snapshot().games.pingpong?.scores, [1, 0])
})

test('game ends at five, departure clears it, and a new state starts empty', () => {
  let now = 0
  const state = new OfficeState(room, () => now)
  state.addPlayer('u1', { x: 4, y: 6 }, 'Ana')
  state.addPlayer('u2', { x: 4, y: 6 }, 'Bruno')
  state.startGame('u1', 'pingpong')
  state.joinGame('u2', 'pingpong')
  for (let i = 0; i < 5; i++) {
    now += 3001
    assert.equal(state.expire(), true)
    if (i < 4) assert.equal(state.returnBall('u2', 'pingpong').ok, true)
  }
  assert.equal(state.snapshot().games.pingpong?.status, 'ended')
  assert.deepEqual(state.snapshot().games.pingpong?.scores, [0, 5])
  state.removePlayer('u1')
  assert.equal(state.snapshot().games.pingpong, undefined)
  assert.deepEqual(new OfficeState(room).snapshot().games, {})
})

test('appliance effect requires a matching object and verified proximity', () => {
  const state = new OfficeState(room)
  state.addPlayer('u1', { x: 4, y: 6 })
  assert.equal(state.apply('u1', { objectId: 'coffee', action: 'drink' }).ok, false)
  state.addPlayer('u1', { x: 2, y: 3 })
  assert.equal(state.apply('u1', { objectId: 'coffee', action: 'drink' }).effect, 'coffee')
  assert.equal(state.apply('u1', { objectId: 'pingpong', action: 'drink' }).ok, false)
})
