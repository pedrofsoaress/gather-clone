import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PresenceTracker } from './Presence'
import { Session, type RealmData } from '../session'

test('the tracker reports a change only when floor, area or name differ', () => {
    const presence = new PresenceTracker()
    assert.equal(presence.takeChange(), false)
    assert.equal(presence.set({ uid: 'ana', name: 'Ana', room: 0, areaId: null }), true)
    assert.equal(presence.takeChange(), true)
    assert.equal(presence.takeChange(), false, 'a change is reported once')
    assert.equal(presence.set({ uid: 'ana', name: 'Ana', room: 0, areaId: null }), false)
    assert.equal(presence.takeChange(), false)
    assert.equal(presence.set({ uid: 'ana', name: 'Ana', room: 0, areaId: 'cabin-1' }), true)
    assert.equal(presence.set({ uid: 'ana', name: 'Ana', room: 1, areaId: 'cabin-1' }), true)
    assert.equal(presence.takeChange(), true)
    assert.deepEqual(presence.snapshot(), [{ uid: 'ana', name: 'Ana', room: 1, areaId: 'cabin-1' }])
})

test('removing someone is a change, removing a stranger is not', () => {
    const presence = new PresenceTracker()
    presence.set({ uid: 'ana', name: 'Ana', room: 0, areaId: null })
    presence.takeChange()
    assert.equal(presence.remove('bruno'), false)
    assert.equal(presence.takeChange(), false)
    assert.equal(presence.remove('ana'), true)
    assert.equal(presence.takeChange(), true)
    assert.deepEqual(presence.snapshot(), [])
})

test('the snapshot is a copy that later changes do not touch', () => {
    const presence = new PresenceTracker()
    presence.set({ uid: 'ana', name: 'Ana', room: 0, areaId: null })
    const snapshot = presence.snapshot()
    snapshot[0].room = 5
    presence.set({ uid: 'ana', name: 'Ana', room: 0, areaId: 'x' })
    assert.deepEqual(snapshot, [{ uid: 'ana', name: 'Ana', room: 5, areaId: null }])
    assert.deepEqual(presence.snapshot(), [{ uid: 'ana', name: 'Ana', room: 0, areaId: 'x' }])
})

function corridorMap(): RealmData {
    const ground: RealmData['rooms'][number]['tilemap'] = {}
    for (let x = 0; x < 12; x++) ground[`${x}, 0`] = {}
    ground['8, 0'] = { privateAreaId: 'matte-boardroom' }
    ground['9, 0'] = { privateAreaId: 'matte-boardroom' }
    ground['10, 0'] = { areaId: 'matte-training' }
    const upstairs: RealmData['rooms'][number]['tilemap'] = { '0, 0': {}, '1, 0': { privateAreaId: 'cabin-5' } }
    return {
        spawnpoint: { roomIndex: 0, x: 0, y: 0 },
        rooms: [
            { name: 'Escritório Matte', tilemap: ground, areas: { 'matte-training': { label: 'Sala de treinamento' } } },
            { name: '2º andar', tilemap: upstairs, areas: { 'cabin-5': { label: 'Cabine 5' } } },
        ],
    }
}

test('the session tracks joins, area changes, floor changes and leaves, not every step', () => {
    const session = new Session('office', corridorMap())
    session.addPlayer('socket-ana', 'ana', 'Ana', '009')
    session.addPlayer('socket-bruno', 'bruno', 'Bruno', '009')
    assert.equal(session.presence.takeChange(), true)
    assert.deepEqual(session.presence.snapshot(), [
        { uid: 'ana', name: 'Ana', room: 0, areaId: null },
        { uid: 'bruno', name: 'Bruno', room: 0, areaId: null },
    ])

    // Walking along the corridor sends nothing.
    for (let x = 1; x <= 7; x++) session.movePlayer('ana', x, 0)
    assert.equal(session.presence.takeChange(), false)

    // Entering the boardroom (private area) is a change; walking inside it is not.
    session.movePlayer('ana', 8, 0)
    assert.equal(session.presence.takeChange(), true)
    session.movePlayer('ana', 9, 0)
    assert.equal(session.presence.takeChange(), false)
    assert.equal(session.presence.snapshot().find(entry => entry.uid === 'ana')?.areaId, 'matte-boardroom')

    // A plain area counts too.
    session.movePlayer('ana', 10, 0)
    assert.equal(session.presence.takeChange(), true)
    assert.equal(session.presence.snapshot().find(entry => entry.uid === 'ana')?.areaId, 'matte-training')

    // Upstairs: the floor changes, then the cabin.
    session.changeRoom('bruno', 1, 0, 0)
    assert.equal(session.presence.takeChange(), true)
    assert.deepEqual(session.presence.snapshot().find(entry => entry.uid === 'bruno'), { uid: 'bruno', name: 'Bruno', room: 1, areaId: null })
    session.movePlayer('bruno', 1, 0)
    assert.equal(session.presence.takeChange(), true)
    assert.equal(session.presence.snapshot().find(entry => entry.uid === 'bruno')?.areaId, 'cabin-5')

    session.removePlayer('ana')
    assert.equal(session.presence.takeChange(), true)
    assert.deepEqual(session.presence.snapshot().map(entry => entry.uid), ['bruno'])
})
