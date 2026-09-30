import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sampleGamepad, gamepadLabels } from './gamepad.mjs'
import { enqueueNotice, notificationCanSound } from './notifications.mjs'
import { getLightDescriptors, lightingStrength } from './lighting.mjs'

const pad = (axes = [0, 0], pressed = []) => ({ connected: true, id: 'Generic gamepad', axes, buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })) })

test('gamepad dead zone prevents drift and D-pad overrides analog input', () => {
    assert.equal(sampleGamepad(pad([0.15, -0.2])).direction, null)
    assert.equal(sampleGamepad(pad([0.5, -0.9])).direction, 'ArrowUp')
    assert.equal(sampleGamepad(pad([1, 0], [13])).direction, 'ArrowDown')
    assert.equal(sampleGamepad(pad([NaN, Infinity])).direction, null)
})

test('actions fire once per press and disconnection releases every held control', () => {
    const first = sampleGamepad(pad([1, 0], [0, 1, 2, 4]))
    assert.equal(first.action, true)
    assert.equal(first.back, true)
    assert.equal(first.dance, true)
    assert.equal(first.running, true)
    assert.equal(sampleGamepad(pad([1, 0], [0]), first.held).action, false)
    const gone = sampleGamepad(null, first.held)
    assert.equal(gone.direction, null)
    assert.equal(gone.running, false)
    assert.deepEqual(gone.held, [])
    assert.equal(sampleGamepad(pad([], [0]), gone.held).action, true)
    assert.equal(gamepadLabels('Sony DualSense').action, '×')
})

test('notices deduplicate bursts and retain at most three current notices', () => {
    let queue = enqueueNotice([], { message: 'Bem-vindo', key: 'join' }, 100)
    queue = enqueueNotice(queue, { message: 'Bem-vindo', key: 'join' }, 200)
    assert.equal(queue.length, 1)
    for (let i = 0; i < 8; i++) queue = enqueueNotice(queue, { message: `Pessoa ${i}` }, 300 + i)
    assert.equal(queue.length, 3)
    assert.equal(queue[2].message, 'Pessoa 7')
    assert.equal(enqueueNotice(queue, { message: 'Depois' }, 10000).length, 1)
    assert.deepEqual(enqueueNotice([], { message: '' }, 0), [])
})

test('notice sound requires explicit opt-in, visible page and no active call/presentation', () => {
    assert.equal(notificationCanSound({ enabled: false, hidden: false, busy: false }), false)
    assert.equal(notificationCanSound({ enabled: true, hidden: true, busy: false }), false)
    assert.equal(notificationCanSound({ enabled: true, hidden: false, busy: true }), false)
    assert.equal(notificationCanSound({ enabled: true, hidden: false, busy: false }), true)
})

test('lights use world coordinates and presentation dim restores without mutating configuration', () => {
    assert.deepEqual(getLightDescriptors([]), [])
    const objects = [{ id: 'lamp', kind: 'light', bounds: { x: 10, y: 8, width: 2, height: 2 }, config: { radiusTiles: 5, color: '#fff2bb', intensity: 0.6 } }]
    assert.deepEqual(getLightDescriptors(objects), [{ id: 'lamp', x: 352, y: 288, radius: 160, color: 0xfff2bb, intensity: 0.6 }])
    assert.deepEqual(lightingStrength(false, 0), { shade: 0, glow: 1 })
    assert.ok(lightingStrength(true, 1).shade > lightingStrength(false, 1).shade)
    assert.equal(getLightDescriptors(objects)[0].intensity, 0.6)
    assert.deepEqual(lightingStrength(false, 1), { shade: 0.04, glow: 1 })
})
