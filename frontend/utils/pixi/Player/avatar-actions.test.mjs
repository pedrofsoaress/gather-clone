import assert from 'node:assert/strict'
import { test } from 'node:test'
import { actionFrames, actionPose, movementSpeed } from './avatar-actions.ts'

test('skins without dedicated action frames use their own directional movement frames', () => {
    const animations = { idle_down: ['rest'], walk_up: ['up1', 'up2'], walk_down: ['down1'] }
    assert.deepEqual(actionFrames(animations, 'dance', 'up'), ['up1', 'up2'])
    assert.deepEqual(actionFrames(animations, 'pet', 'left'), ['rest'])
    assert.deepEqual(actionFrames({ dance: ['dance1'], ...animations }, 'dance', 'down'), ['dance1'])
    assert.deepEqual(actionFrames({}, 'pet', 'right'), [])
})

test('dance and pet poses animate while idle returns the untransformed sprite', () => {
    assert.deepEqual(actionPose('idle', 0), { x: 0, y: 0, rotation: 0, scaleY: 1 })
    const dance = actionPose('dance', 190)
    assert.notEqual(dance.rotation, 0)
    assert.ok(dance.y <= 0)
    const pet = actionPose('pet', 200)
    assert.ok(pet.scaleY < 1)
    assert.ok(Number.isFinite(pet.rotation))
    assert.equal(movementSpeed(false), 3.5)
    assert.ok(movementSpeed(true) > movementSpeed(false))
})
