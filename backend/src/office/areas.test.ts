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
