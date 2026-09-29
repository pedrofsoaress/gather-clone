import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Session } from './session'

test('people at neighboring desk chairs share an automatic proximity conversation', () => {
    const session = new Session('office', {
        spawnpoint: { roomIndex: 0, x: 25, y: 19 },
        rooms: [{ name: 'Matte', tilemap: { '43, 13': { floor: 'floor' } } }],
    })
    session.addPlayer('socket-ana', 'ana', 'Ana', '009')
    session.addPlayer('socket-bruno', 'bruno', 'Bruno', '009')
    session.movePlayer('ana', 37, 13)
    session.movePlayer('bruno', 43, 13)
    assert.ok(session.getPlayer('ana').proximityId)
    assert.equal(session.getPlayer('ana').proximityId, session.getPlayer('bruno').proximityId)
})
