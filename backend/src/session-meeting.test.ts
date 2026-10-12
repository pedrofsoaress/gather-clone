import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Session, type Room } from './session'

function setup() {
    const tilemap: Room['tilemap'] = {}
    for (let x = 0; x < 20; x++) for (let y = 0; y < 6; y++) tilemap[`${x}, ${y}`] = x >= 10 ? { privateAreaId: 'matte-training' } : {}
    const session = new Session('office', { spawnpoint: { roomIndex: 0, x: 0, y: 5 }, rooms: [{ name: 'Matte', tilemap, areas: { 'matte-training': { label: 'Sala de treinamento', meeting: { stage: { x1: 10, y1: 0, x2: 19, y2: 0 } } } } }] })
    const add = (uid: string, x: number, y: number) => { session.addPlayer(`s-${uid}`, uid, uid, '009'); session.roomFeatures[0].office.addPlayer(uid, { x, y }, uid); session.movePlayer(uid, x, y) }
    return { session, add }
}

test('members of the meeting and its stage moderators', () => {
    const { session, add } = setup()
    add('host', 12, 0); add('ana', 12, 3); add('out', 2, 3)
    const meeting = session.meetingOf('ana')!
    assert.equal(meeting.areaId, 'matte-training')
    assert.deepEqual(meeting.members.sort(), ['ana', 'host'])
    assert.deepEqual(meeting.moderators, ['host'])
    assert.equal(session.meetingOf('out'), null)
    assert.strictEqual(session.meetingOf('host')!.state, meeting.state, 'one state per meeting area')
})

test('stepping off the stage removes the moderator', () => {
    const { session, add } = setup()
    add('host', 12, 0); add('ana', 12, 3)
    assert.deepEqual(session.meetingOf('ana')!.moderators, ['host'])
    session.movePlayer('host', 12, 1)
    assert.deepEqual(session.meetingOf('ana')!.moderators, [])
    assert.deepEqual(session.meetingOf('host')!.members.sort(), ['ana', 'host'])
})

test('two members share the same meeting state object', () => {
    const { session, add } = setup()
    add('ana', 11, 2); add('bia', 18, 5)
    const ana = session.meetingOf('ana')!
    const bia = session.meetingOf('bia')!
    assert.strictEqual(ana.state, bia.state)
    ana.state.raised.add('ana')
    assert.deepEqual(bia.state.snapshot(bia.areaId, bia.moderators).raised, ['ana'])
})

test('the meeting state survives the moderator leaving the stage', () => {
    const { session, add } = setup()
    add('host', 12, 0); add('ana', 12, 3)
    session.meetingOf('host')!.state.locked = true
    session.meetingOf('host')!.state.allowed.add('ana')
    session.movePlayer('host', 3, 3)
    assert.equal(session.meetingOf('host'), null)
    const meeting = session.meetingOf('ana')!
    assert.deepEqual(meeting.moderators, [])
    assert.equal(meeting.state.locked, true)
    assert.equal(meeting.state.canSpeak('ana', false), true)
})

test('the last member leaving resets the meeting; earlier ones keep it', () => {
    const { session, add } = setup()
    add('host', 12, 0); add('ana', 12, 3)
    const state = session.meetingOf('host')!.state
    state.locked = true; state.allowed.add('ana'); state.raised.add('host')
    const hostLeft = session.meetingOf('host')!
    session.movePlayer('host', 3, 3)
    assert.equal(session.leaveMeeting('host', hostLeft), 'ana')
    assert.equal(state.locked, true)
    assert.equal(state.raised.size, 0)
    const anaLeft = session.meetingOf('ana')!
    session.removePlayer('ana')
    assert.equal(session.leaveMeeting('ana', anaLeft), null)
    assert.deepEqual(state.snapshot('matte-training', []), { areaId: 'matte-training', locked: false, allowed: [], raised: [], moderators: [] })
    add('bia', 12, 3)
    assert.equal(session.meetingOf('bia')!.state.locked, false, 'the next training starts unlocked')
})
