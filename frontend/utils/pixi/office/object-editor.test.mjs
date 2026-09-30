import test from 'node:test'
import assert from 'node:assert/strict'
import { upsertObject, removeObject } from './object-editor.ts'

const room = {
  name: 'Matte', tilemap: { '1, 1': { floor: '1' } }, interactions: [
    { id: 'old', kind: 'board', label: 'Recados', bounds: { x: 1, y: 1, width: 1, height: 1 }, approach: { x: 1, y: 1 } },
  ],
}
const added = { id: 'quadro', kind: 'external', label: 'Miro', bounds: { x: 1, y: 1, width: 1, height: 1 }, approach: { x: 1, y: 1 }, config: { url: 'https://miro.com/', allowedHosts: ['miro.com'], roomEditable: true } }

test('adding an object preserves existing hotspots and leaves the input untouched', () => {
  const next = upsertObject(room, added)
  assert.deepEqual(next.interactions.map(item => item.id), ['old', 'quadro'])
  assert.equal(room.interactions.length, 1)
})

test('editing by id replaces only that object', () => {
  const next = upsertObject(upsertObject(room, added), { ...added, label: 'Quadro Matte' })
  assert.deepEqual(next.interactions.map(item => item.label), ['Recados', 'Quadro Matte'])
})

test('deleting an object preserves other objects and the map', () => {
  const next = removeObject(upsertObject(room, added), 'quadro')
  assert.deepEqual(next.interactions.map(item => item.id), ['old'])
  assert.deepEqual(next.tilemap, room.tilemap)
})
