import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Room } from '../session'
import { OfficeState } from './OfficeState'
import { PresentationState } from './PresentationState'

const room: Room = {
  name: 'Boardroom', tilemap: { '0, 0': {}, '1, 0': {}, '2, 0': {}, '3, 0': {}, '4, 0': {}, '5, 0': {} },
  interactions: [{ id: 'screen', kind: 'presentation', label: 'Tela', bounds: { x: 2, y: 0, width: 1, height: 1 }, approach: { x: 2, y: 0 }, config: { deckId: 'matte', slides: [{ title: 'Primeiro' }, { title: 'Segundo' }] } }],
}

function setup() {
  const office = new OfficeState(room)
  office.addPlayer('presenter', { x: 2, y: 0 })
  office.addPlayer('viewer', { x: 3, y: 0 })
  office.addPlayer('far', { x: 5, y: 0 })
  return new PresentationState(room, office)
}

test('presenter near the board starts and controls slides', () => {
  const state = setup()
  assert.equal(state.start('far', 'screen').ok, false)
  assert.equal(state.start('presenter', 'screen').ok, true)
  assert.equal(state.start('viewer', 'screen').ok, false)
  assert.equal(state.slide('viewer', 'screen', 1, 0).ok, false)
  assert.equal(state.slide('presenter', 'screen', 2, 0).ok, false)
  assert.deepEqual(state.slide('presenter', 'screen', 1, 0).session?.slideIndex, 1)
  assert.equal(state.slide('presenter', 'screen', 0, 0).ok, false)
})

test('viewer can raise a hand, presenter can end, and departure clears state', () => {
  const state = setup()
  state.start('presenter', 'screen')
  assert.equal(state.raiseHand('viewer', 'screen').ok, true)
  assert.deepEqual(state.snapshot().screen.raisedHands, ['viewer'])
  assert.equal(state.end('viewer', 'screen').ok, false)
  state.removePlayer('presenter')
  assert.equal(state.snapshot().screen, undefined)
})
