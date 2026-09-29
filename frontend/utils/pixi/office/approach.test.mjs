import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canApproach, nextPendingAfterMove } from './approach.mjs'

test('a reachable object opens a movement path', () => {
  assert.equal(canApproach({ x: 25, y: 18 }, { x: 25, y: 16 }, new Set(),
    () => [[25, 17], [25, 16]]), true)
})

test('blocked or unreachable objects do not open an interaction', () => {
  assert.equal(canApproach({ x: 25, y: 18 }, { x: 25, y: 21 }, new Set(['25, 21']),
    () => { throw new Error('pathfinder should not run') }), false)
  assert.equal(canApproach({ x: 25, y: 18 }, { x: 25, y: 16 }, new Set(),
    () => null), false)
})

test('a free move cancels the object pending after a click', () => {
  assert.equal(nextPendingAfterMove('coffee', 'free-tile'), null)
  assert.equal(nextPendingAfterMove('coffee', 'interaction'), 'coffee')
})
