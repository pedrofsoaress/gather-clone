import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Session, type Room } from '../session'
import { desiredPulls, diffPulls, mediaView, peersFor, type MediaView, type Publication, type ViewPlayer } from './subscriptions'

const pub = (uid: string, kind: Publication['kind'], extra: Partial<Publication> = {}): Publication => ({ uid, kind, sessionId: `s-${uid}`, trackName: `${kind}-1`, mid: '0', live: true, simulcast: kind === 'camera', ...extra })
const view = (players: Record<string, Partial<ViewPlayer>>): MediaView => new Map(Object.entries(players).map(([uid, p]) => [uid, { conversation: null, moderators: null, speakers: {}, ...p }]))
const keys = (pulls: Map<string, unknown>) => [...pulls.keys()]

test('a conversation receives the others microphones, cameras and screens, never its own', () => {
    const v = view({ ana: { conversation: 'c1' }, bia: { conversation: 'c1' }, caio: { conversation: 'c2' } })
    const pubs = [pub('ana', 'mic'), pub('ana', 'camera'), pub('ana', 'screen'), pub('bia', 'mic'), pub('bia', 'screen'), pub('caio', 'mic')]
    assert.deepEqual(keys(desiredPulls(v, 'bia', pubs)), ['ana|mic-1', 'ana|camera-1', 'ana|screen-1'])
    assert.deepEqual(keys(desiredPulls(v, 'ana', pubs)), ['bia|mic-1', 'bia|screen-1'])
    assert.deepEqual(keys(desiredPulls(v, 'caio', pubs)), [])
    assert.equal(desiredPulls(v, 'bia', pubs).get('ana|camera-1')?.simulcast, true)
})

test('training: the audience gets the stage cameras, every microphone and screen; the stage gets all', () => {
    const room = { conversation: 't', moderators: ['host'] }
    const v = view({ host: room, ana: room, bia: room })
    const pubs = [pub('host', 'camera'), pub('ana', 'camera'), pub('ana', 'mic'), pub('bia', 'screen')]
    assert.deepEqual(keys(desiredPulls(v, 'bia', pubs)), ['host|camera-1', 'ana|mic-1'])
    assert.deepEqual(keys(desiredPulls(v, 'ana', pubs)), ['host|camera-1', 'bia|screen-1'])
    assert.deepEqual(keys(desiredPulls(v, 'host', pubs)), ['ana|camera-1', 'ana|mic-1', 'bia|screen-1'])
})

test('speakers: only listeners in range of a speaker owned by the publisher', () => {
    const v = view({ dj: {}, near: { speakers: { lounge: { ownerUid: 'dj', volume: 40 } } }, edge: { speakers: { lounge: { ownerUid: 'dj', volume: 0 } } }, fake: { speakers: { lounge: { ownerUid: 'other', volume: 90 } } } })
    const pubs = [pub('dj', 'speaker', { objectId: 'lounge', trackName: 'speaker-lounge-1' })]
    assert.deepEqual(keys(desiredPulls(v, 'near', pubs)), ['dj|speaker-lounge-1'])
    for (const uid of ['dj', 'edge', 'fake']) assert.deepEqual(keys(desiredPulls(v, uid, pubs)), [])
})

test('the difference adds what is missing (unless it failed) and removes what is no longer wanted', () => {
    const v = view({ ana: { conversation: 'c' }, bia: { conversation: 'c' } })
    const wanted = desiredPulls(v, 'bia', [pub('ana', 'mic'), pub('ana', 'camera')])
    const diff = diffPulls(new Map([['ana|mic-1', {}], ['caio|mic-1', {}]]), wanted, new Set(['ana|camera-1']))
    assert.deepEqual(diff.add, [])
    assert.deepEqual(diff.remove, ['caio|mic-1'])
    assert.deepEqual(diffPulls(new Map(), wanted).add.map(pull => pull.key), ['ana|mic-1', 'ana|camera-1'])
})

test('the roster lists the conversation with live mic and camera, and your own screen', () => {
    const v = view({ ana: { conversation: 'c' }, bia: { conversation: 'c' }, caio: {} })
    const pubs = [pub('ana', 'mic', { live: false }), pub('ana', 'camera'), pub('bia', 'screen')]
    assert.deepEqual(peersFor(v, 'bia', pubs), { self: 'bia', conversation: 'c', peers: [{ uid: 'ana', mic: false, camera: true, screen: false }], ownScreen: true })
    assert.deepEqual(peersFor(v, 'caio', pubs), { self: 'caio', conversation: null, peers: [], ownScreen: false })
})

test('the view follows the server: closed rooms, floors and proximity', () => {
    const tilemap: Room['tilemap'] = {}
    for (let x = 0; x < 12; x++) tilemap[`${x}, 0`] = x >= 6 ? { privateAreaId: 'room' } : {}
    const session = new Session('realm', { spawnpoint: { roomIndex: 0, x: 0, y: 0 }, rooms: [{ name: 'A', tilemap }, { name: 'B', tilemap: structuredClone(tilemap) }] })
    const add = (uid: string, x: number, room = 0) => { session.addPlayer(`socket-${uid}`, uid, uid, '009'); session.changeRoom(uid, room, x, 0) }
    add('ana', 7); add('caio', 9); add('bia', 5); add('dani', 7, 1); add('eva', 1); add('fred', 3)
    const v = mediaView(session)
    assert.ok(v.get('ana')!.conversation)
    assert.equal(v.get('ana')!.conversation, v.get('caio')!.conversation)
    assert.equal(v.get('bia')!.conversation, v.get('eva')!.conversation, 'bia is in the hallway group, outside the room')
    assert.notEqual(v.get('dani')!.conversation, v.get('ana')!.conversation, 'same tile on another floor')
    assert.deepEqual(keys(desiredPulls(v, 'bia', [pub('ana', 'mic'), pub('dani', 'mic')])), [])
})
