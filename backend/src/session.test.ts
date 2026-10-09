import assert from 'node:assert/strict'
import { test } from 'node:test'
import { RealmData, Session, SessionManager } from './session'

test('separate desk stations do not open a call until people approach each other', () => {
    const session = new Session('office', {
        spawnpoint: { roomIndex: 0, x: 25, y: 19 },
        rooms: [{ name: 'Matte', tilemap: { '43, 13': { floor: 'floor' } } }],
    })
    session.addPlayer('socket-ana', 'ana', 'Ana', '009')
    session.addPlayer('socket-bruno', 'bruno', 'Bruno', '009')
    session.movePlayer('ana', 37, 13)
    session.movePlayer('bruno', 43, 13)
    assert.equal(session.getPlayer('ana').proximityId, null)
    assert.equal(session.getPlayer('bruno').proximityId, null)
    session.movePlayer('bruno', 39, 13)
    assert.ok(session.getPlayer('ana').proximityId)
    assert.equal(session.getPlayer('ana').proximityId, session.getPlayer('bruno').proximityId)
})

const resumeMap: RealmData = {
    spawnpoint: { roomIndex: 0, x: 25, y: 19 },
    rooms: [
        { name: 'Matte', tilemap: { '40, 12': { floor: 'floor' }, '41, 12': { floor: 'floor', impassable: true } } },
        { name: 'Sala', tilemap: { '3, 4': { floor: 'floor' } } },
    ],
}

function reconnectAfter(position: { room: number, x: number, y: number }, elapsedMs: number, realmId = 'office') {
    const manager = new SessionManager()
    manager.createSession('office', resumeMap)
    manager.createSession('other', resumeMap)
    manager.addPlayerToSession('socket-1', 'office', 'adriano', 'Adriano', '009', 0)
    const session = manager.getSession('office')
    if (position.room !== 0) session.changeRoom('adriano', position.room, position.x, position.y)
    else session.movePlayer('adriano', position.x, position.y)
    assert.equal(manager.logOutBySocketId('socket-1', 1_000), true)
    manager.addPlayerToSession('socket-2', realmId, 'adriano', 'Adriano', '009', 1_000 + elapsedMs)
    const player = manager.getSession(realmId).getPlayer('adriano')
    return { player: { room: player.room, x: player.x, y: player.y }, verified: manager.getSession(realmId).featuresFor('adriano').office.verifiedPosition('adriano') }
}

test('a visitor whose connection drops resumes the place they were standing', () => {
    const { player, verified } = reconnectAfter({ room: 0, x: 40, y: 12 }, 5_000)
    assert.deepEqual(player, { room: 0, x: 40, y: 12 })
    assert.deepEqual(verified, { x: 40, y: 12 })
})

test('a resumed visitor returns to the room they were in', () => {
    const { player, verified } = reconnectAfter({ room: 1, x: 3, y: 4 }, 5_000)
    assert.deepEqual(player, { room: 1, x: 3, y: 4 })
    assert.deepEqual(verified, { x: 3, y: 4 })
})

test('an old disconnection or another space starts at the spawnpoint', () => {
    assert.deepEqual(reconnectAfter({ room: 0, x: 40, y: 12 }, 3 * 60_000).player, { room: 0, x: 25, y: 19 })
    assert.deepEqual(reconnectAfter({ room: 0, x: 40, y: 12 }, 5_000, 'other').player, { room: 0, x: 25, y: 19 })
})

test('a resume never places a visitor on a blocked tile', () => {
    assert.deepEqual(reconnectAfter({ room: 0, x: 41, y: 12 }, 5_000).player, { room: 0, x: 25, y: 19 })
})

test('a visitor resuming into a 1:1 room that filled up returns to the spawnpoint', () => {
    const tilemap: RealmData['rooms'][number]['tilemap'] = {}
    for (let x = 0; x < 10; x++) for (let y = 0; y < 3; y++) tilemap[`${x}, ${y}`] = {}
    for (let x = 6; x < 10; x++) for (let y = 0; y < 3; y++) tilemap[`${x}, ${y}`].privateAreaId = 'one-on-one-1'
    const manager = new SessionManager()
    manager.createSession('office', { spawnpoint: { roomIndex: 0, x: 0, y: 0 }, rooms: [{ name: 'Matte', tilemap, areas: { 'one-on-one-1': { label: '1:1 · 1', capacity: 3 } } }] })
    manager.addPlayerToSession('s-ana', 'office', 'ana', 'Ana', '009', 0)
    manager.getSession('office').movePlayer('ana', 7, 1)
    manager.logOutBySocketId('s-ana', 1_000)
    for (const [uid, x] of [['b', 6], ['c', 8], ['d', 9]] as const) {
        manager.addPlayerToSession(`s-${uid}`, 'office', uid, uid, '009', 1_000)
        manager.getSession('office').roomFeatures[0].office.addPlayer(uid, { x, y: 0 }, uid)
        manager.getSession('office').movePlayer(uid, x, 0)
    }
    manager.addPlayerToSession('s-ana-2', 'office', 'ana', 'Ana', '009', 2_000)
    const ana = manager.getSession('office').getPlayer('ana')
    assert.deepEqual({ x: ana.x, y: ana.y }, { x: 0, y: 0 })
})
