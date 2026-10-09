import assert from 'node:assert/strict'
import { test } from 'node:test'
import { areaAt, areaConfig, isStageArea } from './areas'
import type { Room } from '../session'

const room: Room = {
    name: 'Matte',
    tilemap: { '1, 1': { privateAreaId: 'one-on-one-1' }, '2, 2': { areaId: 'matte-training' }, '3, 3': {} },
    areas: { 'one-on-one-1': { label: '1:1 · 1', capacity: 3 }, 'matte-training': { label: 'Sala de treinamento', conversation: 'stage' } },
}

test('a tile belongs to its private area first, then to its plain area', () => {
    assert.equal(areaAt(room, 1, 1), 'one-on-one-1')
    assert.equal(areaAt(room, 2, 2), 'matte-training')
    assert.equal(areaAt(room, 3, 3), null)
    assert.equal(areaAt(room, 9, 9), null)
})

test('area settings come from the room', () => {
    assert.equal(areaConfig(room, 'one-on-one-1')?.capacity, 3)
    assert.equal(areaConfig(room, null), null)
    assert.equal(isStageArea(room, 'matte-training'), true)
    assert.equal(isStageArea(room, 'one-on-one-1'), false)
})

test('a meeting area exposes its stage', async () => {
    const { meetingStage } = await import('./areas')
    const meetingRoom: Room = { name: 'Matte', tilemap: { '1, 1': { privateAreaId: 'matte-training' } }, areas: { 'matte-training': { label: 'Sala de treinamento', meeting: { stage: { x1: 0, y1: 0, x2: 2, y2: 0 } } } } }
    assert.deepEqual(meetingStage(meetingRoom, 'matte-training'), { x1: 0, y1: 0, x2: 2, y2: 0 })
    assert.equal(meetingStage(meetingRoom, null), null)
    assert.equal(meetingStage(room, 'one-on-one-1'), null)
})
