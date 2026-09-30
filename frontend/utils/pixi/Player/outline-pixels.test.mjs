import assert from 'node:assert/strict'
import test from 'node:test'
import { outlinePixels } from './outline-pixels.ts'

test('one-pixel white outline follows alpha and preserves every original opaque pixel', () => {
    const rgba = new Uint8ClampedArray(5 * 5 * 4)
    rgba.set([32, 80, 140, 255], (2 * 5 + 2) * 4)
    const outlined = outlinePixels(rgba, 5, 5, 5)
    assert.deepEqual([...outlined.slice((2 * 5 + 2) * 4, (2 * 5 + 2) * 4 + 4)], [32, 80, 140, 255])
    assert.deepEqual([...outlined.slice((1 * 5 + 1) * 4, (1 * 5 + 1) * 4 + 4)], [255, 255, 255, 238])
    assert.equal(outlined[(0 * 5 + 0) * 4 + 3], 0)
    assert.equal(rgba[(1 * 5 + 1) * 4 + 3], 0)
    assert.equal(outlined.length, rgba.length)
})

test('atlas outline never bleeds between neighboring animation frames', () => {
    const rgba = new Uint8ClampedArray(6 * 3 * 4)
    rgba.set([8, 50, 5, 255], (1 * 6 + 2) * 4)
    const outlined = outlinePixels(rgba, 6, 3, 3)
    assert.equal(outlined[(1 * 6 + 1) * 4 + 3], 238)
    assert.equal(outlined[(1 * 6 + 3) * 4 + 3], 0)
    assert.deepEqual([...outlinePixels(new Uint8ClampedArray(36), 3, 3, 3)], new Array(36).fill(0))
})
