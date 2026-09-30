import assert from 'node:assert/strict'
import { test } from 'node:test'
import { zoomAtCursor } from './camera-zoom.mjs'

test('zoom keeps the world point underneath the cursor in place after panning', () => {
    const current = { scale: 1.5, pivot: { x: 210, y: 340 } }
    const cursor = { x: 300, y: 180 }
    const next = zoomAtCursor(current, cursor, -80, 0, 700)
    assert.ok(next.scale > current.scale)
    assert.ok(Math.abs(current.pivot.x + cursor.x / current.scale - next.pivot.x - cursor.x / next.scale) < 1e-9)
    assert.ok(Math.abs(current.pivot.y + cursor.y / current.scale - next.pivot.y - cursor.y / next.scale) < 1e-9)
})

test('wheel units normalize consistently and large events cannot jump too far', () => {
    const current = { scale: 1, pivot: { x: 0, y: 0 } }
    const cursor = { x: 0, y: 0 }
    assert.deepEqual(zoomAtCursor(current, cursor, 2, 1, 640), zoomAtCursor(current, cursor, 32, 0, 640))
    assert.deepEqual(zoomAtCursor(current, cursor, 0.05, 2, 640), zoomAtCursor(current, cursor, 32, 0, 640))
    const huge = zoomAtCursor(current, cursor, 10000, 0, 640)
    assert.ok(huge.scale > 0.8 && huge.scale < 1)
    assert.deepEqual(zoomAtCursor(current, cursor, NaN, 0, 640), current)
})

test('zoom limits preserve the camera and do not accumulate pivot drift', () => {
    const cursor = { x: 512, y: 360 }
    for (const [scale, delta] of [[0.5, 200], [3, -200]]) {
        const current = { scale, pivot: { x: 120, y: 96 } }
        assert.deepEqual(zoomAtCursor(current, cursor, delta, 0, 720), current)
    }
})
