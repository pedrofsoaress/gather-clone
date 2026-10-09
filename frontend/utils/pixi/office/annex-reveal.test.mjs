import test from 'node:test'
import assert from 'node:assert/strict'
import { isAnnexTrigger, shouldReveal } from './annex-reveal.ts'

const annex = { reveal: { x: 50, y: 0, width: 36, height: 30 }, triggers: [[49, 15], [49, 16]] }

test('stepping on the passage reveals the wing with the sweep', () => {
    assert.equal(isAnnexTrigger(annex, 49, 15), true)
    assert.equal(shouldReveal(annex, 49, 16), true)
})

test('a visitor already inside the wing (after reconnecting) sees it lit', () => {
    assert.equal(isAnnexTrigger(annex, 60, 10), false)
    assert.equal(shouldReveal(annex, 60, 10), true)
    assert.equal(shouldReveal(annex, 85, 29), true)
})

test('the rest of the office keeps the wing dark', () => {
    assert.equal(shouldReveal(annex, 48, 15), false)
    assert.equal(shouldReveal(annex, 25, 18), false)
    assert.equal(shouldReveal(undefined, 49, 15), false)
})
