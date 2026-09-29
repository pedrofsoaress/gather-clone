import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findObjectAt, isWithinMap, nearestObject } from './geometry.ts'

const objects = [
  { id: 'coffee', bounds: { x: 35, y: 1, width: 6, height: 4 }, approach: { x: 35, y: 5 } },
  { id: 'water', bounds: { x: 41, y: 1, width: 2, height: 4 }, approach: { x: 42, y: 5 } },
]

test('hit testing separates adjacent machines at the shared boundary', () => {
  assert.equal(findObjectAt(objects, 40.99, 2)?.id, 'coffee')
  assert.equal(findObjectAt(objects, 41, 2)?.id, 'water')
  assert.equal(findObjectAt(objects, 43, 2), null)
})

test('decoration and invalid coordinates never become a target', () => {
  assert.equal(findObjectAt(objects, 12, 10), null)
  assert.equal(findObjectAt(objects, Number.NaN, 2), null)
  assert.equal(isWithinMap(-1, 2, 50, 30), false)
  assert.equal(isWithinMap(50, 2, 50, 30), false)
  assert.equal(isWithinMap(2.5, 2, 50, 30), false)
  assert.equal(isWithinMap(49, 29, 50, 30), true)
})

test('nearby keyboard target prefers distance, then stable ID order', () => {
  assert.equal(nearestObject(objects, 42, 5, 2)?.id, 'water')
  const tied = [
    { id: 'zeta', approach: { x: 4, y: 5 }, bounds: { x: 4, y: 4, width: 1, height: 1 } },
    { id: 'alpha', approach: { x: 6, y: 5 }, bounds: { x: 6, y: 4, width: 1, height: 1 } },
  ]
  assert.equal(nearestObject(tied, 5, 5, 1)?.id, 'alpha')
  assert.equal(nearestObject(tied, 5, 5, 0), null)
})
