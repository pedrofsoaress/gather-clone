import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Session, type Room } from './session'

function setup() {
    const tilemap: Room['tilemap'] = {}
    for (let x = 0; x < 50; x++) for (let y = 0; y < 10; y++) tilemap[`${x}, ${y}`] = { floor: 'floor' }
    tilemap['8, 2'].privateAreaId = 'meeting-a'
    tilemap['9, 2'].privateAreaId = 'meeting-b'
    tilemap['8, 3'].privateAreaId = 'meeting-a'
    const session = new Session('office', {
        spawnpoint: { roomIndex: 0, x: 49, y: 9 },
        rooms: [{ name: 'Office', tilemap }, { name: 'Other', tilemap }],
    })
    const add = (uid: string, x: number, y = 0, room = 0) => {
        session.addPlayer(`socket-${uid}`, uid, uid, '009')
        session.changeRoom(uid, room, x, y)
    }
    return { session, add }
}

test('moving apart resets the stationary participant as well as the moving participant', () => {
    const { session, add } = setup()
    add('ana', 0)
    add('bruno', 2)
    assert.ok(session.getPlayer('ana').proximityId)
    const changed = session.movePlayer('bruno', 20, 0)
    assert.deepEqual(changed.sort(), ['ana', 'bruno'])
    assert.equal(session.getPlayer('ana').proximityId, null)
    assert.equal(session.getPlayer('bruno').proximityId, null)
})

test('splitting and merging groups updates every affected participant without channel churn', () => {
    const { session, add } = setup()
    add('ana', 0)
    add('bruno', 5)
    add('carla', 10)
    add('davi', 15)
    const originalId = session.getPlayer('ana').proximityId
    assert.ok(originalId)
    assert.equal(session.getPlayer('davi').proximityId, originalId)
    session.movePlayer('bruno', 2, 0)
    const leftId = session.getPlayer('ana').proximityId
    const rightId = session.getPlayer('carla').proximityId
    assert.ok(leftId)
    assert.ok(rightId)
    assert.notEqual(leftId, rightId)
    assert.ok(leftId === originalId || rightId === originalId)
    assert.equal(session.getPlayer('bruno').proximityId, leftId)
    assert.equal(session.getPlayer('davi').proximityId, rightId)
    const changed = session.movePlayer('bruno', 6, 0)
    const mergedId = session.getPlayer('ana').proximityId
    assert.ok(mergedId === leftId || mergedId === rightId)
    assert.ok(changed.length >= 2)
    assert.ok(Object.values(session.players).every(player => player.proximityId === mergedId))
    assert.deepEqual(session.movePlayer('davi', 14, 0), [])
    assert.equal(session.getPlayer('davi').proximityId, mergedId)
})

test('public area and distinct private areas never bridge proximity groups', () => {
    const { session, add } = setup()
    add('ana', 8, 2)
    add('bruno', 9, 2)
    add('carla', 7, 2)
    assert.equal(session.getPlayer('ana').proximityId, null)
    assert.equal(session.getPlayer('bruno').proximityId, null)
    assert.equal(session.getPlayer('carla').proximityId, null)
    add('davi', 8, 3)
    assert.ok(session.getPlayer('ana').proximityId)
    assert.equal(session.getPlayer('davi').proximityId, session.getPlayer('ana').proximityId)
    assert.equal(session.getPlayer('bruno').proximityId, null)
    assert.equal(session.getPlayer('carla').proximityId, null)
})

test('room departure and disconnection clear remaining participants', () => {
    const { session, add } = setup()
    add('ana', 0)
    add('bruno', 2)
    assert.ok(session.getPlayer('ana').proximityId)
    const changed = session.changeRoom('bruno', 1, 2, 0)
    assert.ok(changed.includes('ana'))
    assert.equal(session.getPlayer('ana').proximityId, null)
    assert.equal(session.getPlayer('bruno').proximityId, null)
    session.changeRoom('bruno', 0, 2, 0)
    assert.ok(session.getPlayer('ana').proximityId)
    session.removePlayer('bruno')
    assert.deepEqual(session.setProximityIdsWithPlayer('bruno'), ['ana'])
    assert.equal(session.getPlayer('ana').proximityId, null)
})
