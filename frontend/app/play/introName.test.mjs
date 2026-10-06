import test from 'node:test'
import assert from 'node:assert/strict'
import { suggestedName } from './introName.ts'

test('the generated guest name is not offered as the office name', () => {
    assert.equal(suggestedName('Guest-a1b2c3'), '')
    assert.equal(suggestedName('Guest-0f9e8d'), '')
})

test('a real name is kept as typed', () => {
    assert.equal(suggestedName('pedro'), 'pedro')
    assert.equal(suggestedName('Guest de honra'), 'Guest de honra')
})
