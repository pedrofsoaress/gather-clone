import test from 'node:test'
import assert from 'node:assert/strict'
import { skins, defaultSkin, stepSkin } from './skins.ts'

test('arrows walk through every avatar and wrap around both ends', () => {
    assert.equal(stepSkin('001', 1), '002')
    assert.equal(stepSkin('001', -1), skins.at(-1))
    assert.equal(stepSkin(skins.at(-1), 1), '001')
})

test('an unknown saved avatar starts from the default one', () => {
    assert.equal(stepSkin('999', 1), skins[(skins.indexOf(defaultSkin) + 1) % skins.length])
})
