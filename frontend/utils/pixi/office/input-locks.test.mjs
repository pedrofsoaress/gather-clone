import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createInputLocks } from './input-lock-core.mjs'

test('closing devices preserves an open chat lock and closing all releases movement', () => {
    const states = []
    const lock = createInputLocks(value => states.push(value))
    lock('chat', true)
    lock('devices', true)
    lock('devices', false)
    assert.equal(states.at(-1), true)
    lock('chat', false)
    assert.equal(states.at(-1), false)
    lock('chat', false)
    assert.equal(states.at(-1), false)
})

test('repeated effects from one panel do not leak a lock after cleanup', () => {
    let blocked = false
    const lock = createInputLocks(value => { blocked = value })
    lock('object', true)
    lock('object', true)
    lock('object', false)
    assert.equal(blocked, false)
})
