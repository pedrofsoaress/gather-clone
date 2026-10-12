import { test } from 'node:test'
import assert from 'node:assert/strict'
import { focusedUids, nearestFocused } from './focus.ts'

test('only occupants of focus desks are focused', () => {
  const objects = [{ id: 'f1', focus: true }, { id: 'd1' }, { id: 'f2', focus: true }]
  const set = focusedUids(objects, { f1: { uid: 'ana' }, d1: { uid: 'bia' } })
  assert.deepEqual([...set], ['ana'])
})

test('the nearest focused person within reach is offered', () => {
  const people = [{ uid: 'ana', name: 'Ana', x: 2, y: 1 }, { uid: 'caio', name: 'Caio', x: 1, y: 0 }, { uid: 'bia', name: 'Bia', x: 0, y: 1 }]
  assert.deepEqual(nearestFocused({ x: 0, y: 0 }, people, new Set(['ana', 'caio'])), { uid: 'caio', name: 'Caio' })
  assert.equal(nearestFocused({ x: 0, y: 0 }, [{ uid: 'ana', name: 'Ana', x: 2, y: 2 }], new Set(['ana'])), null)
})
