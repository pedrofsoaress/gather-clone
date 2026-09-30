import assert from 'node:assert/strict'
import test from 'node:test'
import { findWalkablePath } from './walkable-path.ts'

test('movement cannot cross missing floor or route beyond a map edge', () => {
  const map = { '0, 0': {}, '1, 0': {}, '3, 0': {}, '4, 0': {} }
  assert.equal(findWalkablePath([0, 0], [4, 0], map, new Set()), null)
  assert.equal(findWalkablePath([0, 0], [-1, 0], map, new Set()), null)
  assert.deepEqual(findWalkablePath([0, 0], [1, 0], map, new Set()), [[1, 0]])
})

test('a valid alternate path avoids both explicit and sprite collision tiles', () => {
  const map = { '0, 0': {}, '1, 0': { impassable: true }, '2, 0': {}, '0, 1': {}, '1, 1': {}, '2, 1': {} }
  assert.deepEqual(findWalkablePath([0, 0], [2, 0], map, new Set()), [[0, 1], [1, 1], [2, 1], [2, 0]])
  assert.equal(findWalkablePath([0, 0], [2, 0], map, new Set(['1, 1'])), null)
})
