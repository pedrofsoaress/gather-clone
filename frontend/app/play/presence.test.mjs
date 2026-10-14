import test from 'node:test'
import assert from 'node:assert/strict'
import { entranceCountLabel, floorLabel, otherFloorNotice, parsePresence, placeLabel, sortPresence } from './presence.ts'

const rooms = [
    { name: 'Escritório Matte', areas: { 'matte-training': { label: 'Sala de treinamento' } } },
    { name: '2º andar', areas: { 'cabin-5': { label: 'Cabine 5' } } },
]

test('floors are named Térreo and after the room upstairs', () => {
    assert.equal(floorLabel(rooms, 0), 'Térreo')
    assert.equal(floorLabel(rooms, 1), '2º andar')
    assert.equal(floorLabel([...rooms, { name: 'Terraço' }], 2), '3º andar')
})

test('the place adds the area label when there is one', () => {
    assert.equal(placeLabel(rooms, { room: 1, areaId: 'cabin-5' }), '2º andar · Cabine 5')
    assert.equal(placeLabel(rooms, { room: 0, areaId: 'matte-training' }), 'Térreo · Sala de treinamento')
    assert.equal(placeLabel(rooms, { room: 0, areaId: 'matte-boardroom' }), 'Térreo · Sala de reunião')
    assert.equal(placeLabel(rooms, { room: 0, areaId: null }), 'Térreo')
    assert.equal(placeLabel(rooms, { room: 1, areaId: 'unknown-area' }), '2º andar')
})

test('the visitor comes first, then everyone by name', () => {
    const entries = [
        { uid: 'c', name: 'carla', room: 0, areaId: null },
        { uid: 'me', name: 'Zé', room: 1, areaId: null },
        { uid: 'a', name: 'Ágata', room: 0, areaId: null },
        { uid: 'b', name: 'Bruno', room: 0, areaId: null },
    ]
    assert.deepEqual(sortPresence(entries, 'me').map(entry => entry.uid), ['me', 'a', 'b', 'c'])
    assert.deepEqual(entries.map(entry => entry.uid), ['c', 'me', 'a', 'b'], 'the input is not changed')
})

test('someone on another floor is announced instead of followed', () => {
    assert.equal(otherFloorNotice('Ana', rooms, 1), 'Ana está no 2º andar.')
    assert.equal(otherFloorNotice('Ana', rooms, 0), 'Ana está no térreo.')
})

test('the entrance count is singular, plural, or hidden', () => {
    assert.equal(entranceCountLabel(1), '1 pessoa no escritório agora')
    assert.equal(entranceCountLabel(7), '7 pessoas no escritório agora')
    assert.equal(entranceCountLabel(0), null)
    assert.equal(entranceCountLabel(null), null)
    assert.equal(entranceCountLabel(undefined), null)
})

test('malformed presence entries are dropped', () => {
    assert.equal(parsePresence(null), null)
    assert.deepEqual(parsePresence([{ uid: 'a', name: 'Ana', room: 0, areaId: null }, { uid: 1 }, null, { uid: 'b', name: 'B', room: 1.5, areaId: null }]), [{ uid: 'a', name: 'Ana', room: 0, areaId: null }])
})
