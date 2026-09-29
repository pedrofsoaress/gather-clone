import assert from 'node:assert/strict'
import { test } from 'node:test'
import { OfficeState } from './OfficeState'
import type { Room } from '../session'

const tilemap: Room['tilemap'] = {}
for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) tilemap[`${x}, ${y}`] = { floor: 'floor' }
tilemap['12, 7'].impassable = true

const room: Room = {
  name: 'Matte',
  tilemap,
  interactions: [
    { id: 'lounge-sofa', kind: 'seat', label: 'Sofá', bounds: { x: 7, y: 5, width: 4, height: 2 }, approach: { x: 11, y: 6 }, seatVisual: { x: 8, y: 5 } },
    { id: 'desk', kind: 'desk', label: 'Mesa', bounds: { x: 7, y: 8, width: 3, height: 2 }, approach: { x: 10, y: 6 } },
    { id: 'board', kind: 'board', label: 'Quadro', bounds: { x: 2, y: 2, width: 4, height: 2 }, approach: { x: 6, y: 4 } },
  ],
}

test('only one visitor can occupy a seat and departure frees it', () => {
  let now = 0
  const state = new OfficeState(room, () => now)
  state.addPlayer('u1', { x: 11, y: 6 }, 'Ana')
  state.addPlayer('u2', { x: 11, y: 6 }, 'Beto')
  assert.equal(state.occupy('u1', 'lounge-sofa').ok, true)
  assert.equal(state.occupy('u2', 'lounge-sofa').ok, false)
  assert.deepEqual(state.snapshot().occupancy['lounge-sofa'], { uid: 'u1', name: 'Ana' })
  state.removePlayer('u1')
  assert.equal(state.occupy('u2', 'lounge-sofa').ok, true)
  assert.equal(state.occupy('u2', 'missing').ok, false)
  assert.equal(state.occupy('u2', 'board').ok, false)
  now = 100
  assert.equal(state.step('u2', { x: 11, y: 7 }).ok, true)
  assert.equal(state.step('u2', { x: 40, y: 7 }).ok, false)
})

test('verified steps reject blocked, distant, and too-fast movement', () => {
  let now = 0
  const state = new OfficeState(room, () => now)
  state.addPlayer('u1', { x: 11, y: 6 })
  now = 100
  assert.equal(state.step('u1', { x: 12, y: 6 }).ok, true)
  assert.equal(state.step('u1', { x: 12, y: 7 }).ok, false)
  assert.equal(state.step('u1', { x: 13, y: 6 }).ok, false)
  now = 180
  assert.equal(state.step('u1', { x: 11, y: 6 }).ok, true)
})

test('occupancy requires the last verified position near the approach', () => {
  const state = new OfficeState(room, () => 100)
  state.addPlayer('u1', { x: 0, y: 0 })
  assert.equal(state.occupy('u1', 'lounge-sofa').ok, false)
  assert.equal(state.verifiedPosition('u1')?.x, 0)
})

test('a visitor holds at most one place and walking away releases it', () => {
  let now = 0
  const state = new OfficeState(room, () => now)
  state.addPlayer('u1', { x: 11, y: 6 })
  assert.equal(state.occupy('u1', 'lounge-sofa').ok, true)
  assert.equal(state.occupy('u1', 'desk').ok, true)
  assert.equal(state.snapshot().occupancy['lounge-sofa'], undefined)
  for (const y of [7, 8, 9]) {
    now += 100
    assert.equal(state.step('u1', { x: 11, y }).ok, true)
  }
  assert.deepEqual(state.snapshot().occupancy, {})
})
