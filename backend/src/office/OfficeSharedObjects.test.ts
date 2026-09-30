import assert from 'node:assert/strict'
import { test } from 'node:test'
import { OfficeState } from './OfficeState'
import { OfficeSharedObjects } from './OfficeSharedObjects'
import type { Room } from '../session'

const room: Room = {
  name: 'Matte', tilemap: { '0, 0': {}, '1, 0': {}, '2, 0': {}, '3, 0': {}, '4, 0': {}, '5, 0': {} },
  interactions: [{ id: 'board', kind: 'external', label: 'Board', bounds: { x: 2, y: 0, width: 1, height: 1 }, approach: { x: 2, y: 0 }, config: { url: 'https://miro.com/board/1', allowedHosts: ['miro.com'], roomEditable: true } }],
}

function setup() {
  const office = new OfficeState(room)
  office.addPlayer('near', { x: 2, y: 0 })
  office.addPlayer('far', { x: 5, y: 0 })
  return new OfficeSharedObjects(room, office)
}

test('the configured URL is the initial shared room', () => {
  assert.deepEqual(setup().get('near', 'board'), { ok: true, url: 'https://miro.com/board/1', revision: 0 })
})

test('only a nearby participant can change a room to an allowed HTTPS host', () => {
  const shared = setup()
  assert.equal(shared.setRoom('far', 'board', 'https://miro.com/board/2', 0).ok, false)
  assert.equal(shared.setRoom('near', 'board', 'https://evil.example/', 0).ok, false)
  assert.equal(shared.setRoom('near', 'board', 'javascript:alert(1)', 0).ok, false)
  assert.deepEqual(shared.setRoom('near', 'board', 'https://miro.com/board/2', 0), { ok: true, url: 'https://miro.com/board/2', revision: 1 })
})

test('stale revisions cannot overwrite a newer shared room', () => {
  const shared = setup()
  shared.setRoom('near', 'board', 'https://miro.com/board/2', 0)
  assert.equal(shared.setRoom('near', 'board', 'https://miro.com/board/3', 0).ok, false)
  assert.equal(shared.get('near', 'board').url, 'https://miro.com/board/2')
})
