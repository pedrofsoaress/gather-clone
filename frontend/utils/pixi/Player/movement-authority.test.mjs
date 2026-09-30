import test from 'node:test'
import assert from 'node:assert/strict'
import { MovementAuthority } from './movement-authority.ts'

test('rejection waits for remaining acknowledgements before returning the final verified position', () => {
    const movement = new MovementAuthority()
    movement.reset({ x: 0, y: 0 })
    const first = movement.begin()
    const second = movement.begin()
    assert.deepEqual(movement.settle(first, false, { x: 0, y: 0 }), { recovering: true, settled: false })
    assert.deepEqual(movement.settle(second, true, { x: 1, y: 0 }), { recovering: true, settled: true })
    assert.deepEqual(movement.position, { x: 1, y: 0 })
})

test('an old room acknowledgement cannot move or freeze the new room player', () => {
    const movement = new MovementAuthority()
    movement.reset({ x: 0, y: 0 })
    const old = movement.begin()
    movement.reset({ x: 10, y: 10 })
    assert.equal(movement.settle(old, false, { x: 0, y: 0 }), null)
    assert.deepEqual(movement.position, { x: 10, y: 10 })
})
