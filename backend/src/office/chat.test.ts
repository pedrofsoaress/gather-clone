import assert from 'node:assert/strict'
import test from 'node:test'
import { canReceiveNearbyChat } from './chat'

test('nearby chat includes players within six tiles in both directions', () => {
  assert.equal(canReceiveNearbyChat({ x: 10, y: 10 }, { x: 16, y: 4 }), true)
  assert.equal(canReceiveNearbyChat({ x: 10, y: 10 }, { x: 17, y: 10 }), false)
  assert.equal(canReceiveNearbyChat({ x: 10, y: 10 }, null), false)
})
