import test from 'node:test'
import assert from 'node:assert/strict'
import { upsertObject, removeObject, objectKindDefaults, observeOfficeObjects } from './object-editor.ts'
import signal from '../../signal.ts'

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

test('new seats and appliances save usable defaults even when their fields are untouched', () => {
  assert.equal(objectKindDefaults('drink', added.bounds).effect, 'water')
  assert.equal(objectKindDefaults('snack', added.bounds).effect, 'snack')
  assert.deepEqual(objectKindDefaults('seat', added.bounds).seatVisual, { x: 1, y: 1, facing: 'down' })
  assert.equal(objectKindDefaults('external', added.bounds).seatVisual, undefined)
})

test('reopening the objects panel requests the latest editor snapshot', () => {
  let current = room.interactions
  const provide = () => signal.emit('officeObjectsChanged', current)
  signal.on('requestOfficeObjects', provide)
  let received
  const stop = observeOfficeObjects(signal, objects => { received = objects })
  assert.deepEqual(received, current)
  stop()
  current = upsertObject(room, added).interactions
  const stopAgain = observeOfficeObjects(signal, objects => { received = objects })
  assert.equal(received.length, 2)
  stopAgain()
  signal.off('requestOfficeObjects', provide)
})
