import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Room } from '../session'
import { OfficeState } from './OfficeState'
import { AvatarActions } from './AvatarActions'

const room: Room = {
  name: 'Matte',
  tilemap: Object.fromEntries(Array.from({ length: 12 }, (_, x) => [`${x}, 0`, {}])),
  interactions: [
    { id: 'cat', kind: 'pet', label: 'Caju', bounds: { x: 3, y: 0, width: 1, height: 1 }, approach: { x: 3, y: 0 }, config: { animationSet: 'matte-cat' } },
    { id: 'chair', kind: 'seat', label: 'Cadeira', bounds: { x: 0, y: 0, width: 1, height: 1 }, approach: { x: 0, y: 0 } },
  ],
}

test('dance is ephemeral, cannot start while seated, and movement clears it', () => {
  let now = 100
  const office = new OfficeState(room, () => now)
  office.addPlayer('ana', { x: 3, y: 0 })
  const actions = new AvatarActions(room, office, () => now)
  assert.equal(actions.setAction('unknown', 'dance').ok, false)
  assert.equal(actions.setAction('ana', 'dance').ok, true)
  assert.equal(actions.snapshot().ana.action, 'dance')
  actions.stopAction('ana')
  assert.equal(actions.snapshot().ana.action, 'idle')
  actions.setAction('ana', 'dance')
  now += 10001
  assert.equal(actions.snapshot().ana.action, 'idle')
  office.addPlayer('ana', { x: 0, y: 0 })
  office.occupy('ana', 'chair')
  assert.equal(actions.setAction('ana', 'dance').ok, false)
})

test('pet requires verified proximity, cools down, and does not leak mutable state', () => {
  let now = 100
  const office = new OfficeState(room, () => now)
  office.addPlayer('ana', { x: 3, y: 0 })
  office.addPlayer('far', { x: 11, y: 0 })
  const actions = new AvatarActions(room, office, () => now)
  assert.equal(actions.setAction('far', 'pet', 'cat').ok, false)
  assert.equal(actions.setAction('ana', 'pet', 'chair').ok, false)
  assert.equal(actions.setAction('ana', 'pet', 'cat').ok, true)
  assert.equal(actions.snapshot().ana.objectId, 'cat')
  assert.equal(actions.setAction('ana', 'pet', 'cat').ok, false)
  const snapshot = actions.snapshot()
  snapshot.ana.action = 'dance'
  assert.equal(actions.snapshot().ana.action, 'pet')
  now += 3001
  assert.equal(actions.snapshot().ana.action, 'idle')
  assert.equal(actions.setAction('ana', 'pet', 'cat').ok, true)
  actions.removePlayer('ana')
  assert.equal(actions.snapshot().ana, undefined)
})

test('run is server-approved, refuses seated visitors and never disables collision', () => {
  const office = new OfficeState(room)
  office.addPlayer('ana', { x: 3, y: 0 })
  const actions = new AvatarActions(room, office)
  assert.equal(actions.minimumStepMs('ana'), 120)
  assert.equal(actions.setRunning('unknown', true).ok, false)
  actions.setAction('ana', 'dance')
  assert.equal(actions.setRunning('ana', true).ok, true)
  assert.equal(actions.snapshot().ana.action, 'idle')
  assert.equal(actions.minimumStepMs('ana'), 80)
  assert.equal(office.step('ana', { x: 7, y: 0 }, actions.minimumStepMs('ana')).ok, false)
  office.addPlayer('ana', { x: 0, y: 0 })
  office.occupy('ana', 'chair')
  assert.equal(actions.setRunning('ana', true).ok, false)
  assert.equal(actions.setRunning('ana', false).ok, true)
  assert.equal(actions.minimumStepMs('ana'), 120)
})
