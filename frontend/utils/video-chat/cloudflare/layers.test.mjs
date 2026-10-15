import test from 'node:test'
import assert from 'node:assert/strict'
import { LayerRequests } from './layers.ts'

test('the biggest tile wins, and the last tile going away drops back to q', () => {
    const changes = []
    const layers = new LayerRequests((uid, layer) => changes.push([uid, layer]))
    const strip = layers.request('ana', 'q')
    const meeting = layers.request('ana', 'h')
    const enlarged = layers.request('ana', 'f')
    assert.equal(layers.current('ana'), 'f')
    enlarged(); enlarged()
    meeting()
    strip()
    assert.equal(layers.current('ana'), null)
    assert.deepEqual(changes, [['ana', 'h'], ['ana', 'f'], ['ana', 'h'], ['ana', 'q']])
})
