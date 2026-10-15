import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Session, type Room } from '../session'
import { desiredPulls, diffPulls, mediaFingerprint, mediaView, peersFor, PREFETCH_LIMIT, PREFETCH_RADIUS, type MediaView, type Publication, type ViewPlayer } from './subscriptions'

const pub = (uid: string, kind: Publication['kind'], extra: Partial<Publication> = {}): Publication => ({ uid, kind, sessionId: `s-${uid}`, trackName: `${kind}-1`, mid: '0', live: true, simulcast: kind === 'camera', ...extra })
const view = (players: Record<string, Partial<ViewPlayer>>): MediaView => new Map(Object.entries(players).map(([uid, p]) => [uid, { conversation: null, moderators: null, speakers: {}, open: null, nearby: [], ...p }]))
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

test('prefetch: someone around you, outside your conversation, is pulled flagged prefetch; your conversation is active', () => {
    const v = view({
        ana: { conversation: 'c1', open: 0, nearby: ['bia', 'caio'] },
        bia: { conversation: 'c1', open: 0, nearby: ['ana', 'caio'] },
        caio: { conversation: null, open: 0, nearby: ['ana', 'bia'] },
        dani: { conversation: null, open: 0, nearby: [] },
    })
    const pubs = [pub('bia', 'mic'), pub('bia', 'camera'), pub('caio', 'mic'), pub('caio', 'camera'), pub('caio', 'screen'), pub('dani', 'mic'), pub('ana', 'mic'), pub('caio', 'speaker', { objectId: 'lounge', trackName: 'speaker-lounge-1' })]
    const wanted = desiredPulls(v, 'ana', pubs)
    // Never a screen ahead of time (full resolution, no q layer): it comes when the conversation starts.
    assert.deepEqual([...wanted.values()].map(pull => `${pull.key}:${pull.prefetch ? 'prefetch' : 'active'}`), ['bia|mic-1:active', 'bia|camera-1:active', 'caio|mic-1:prefetch', 'caio|camera-1:prefetch'])
    assert.deepEqual(keys(desiredPulls(view({ ana: { conversation: 'c', open: 0, nearby: [] }, caio: { conversation: 'c', open: 0, nearby: [] } }), 'ana', pubs)), ['caio|mic-1', 'caio|camera-1', 'caio|screen-1'])
    // caio is alone: everyone around him is prefetched, never his own tracks, never a speaker by proximity.
    assert.deepEqual([...desiredPulls(v, 'caio', pubs).values()].map(pull => `${pull.key}:${pull.prefetch}`), ['bia|mic-1:true', 'bia|camera-1:true', 'ana|mic-1:true'])
    assert.deepEqual(keys(desiredPulls(v, 'dani', pubs)), [])
})

test('prefetch: nothing from or into a closed room, a meeting room or another floor', () => {
    const pubs = [pub('bia', 'mic'), pub('bia', 'camera')]
    // bia is listed around ana but stands in a private area (open null): nothing, whatever the list says.
    assert.deepEqual(keys(desiredPulls(view({ ana: { open: 0, nearby: ['bia'] }, bia: { open: null, nearby: ['ana'] } }), 'ana', pubs)), [])
    assert.deepEqual(keys(desiredPulls(view({ ana: { open: null, nearby: ['bia'] }, bia: { open: 0, nearby: ['ana'] } }), 'ana', pubs)), [])
    assert.deepEqual(keys(desiredPulls(view({ ana: { open: 0, nearby: ['bia'] }, bia: { open: 1, nearby: ['ana'] } }), 'ana', pubs)), [])
    // The audience of a meeting room gets only the stage cameras: never a prefetch to make up for it.
    const room = { conversation: 't', moderators: ['host'], open: null }
    assert.deepEqual(keys(desiredPulls(view({ host: room, ana: room, bia: { ...room, nearby: ['ana'] } }), 'ana', [pub('bia', 'camera')])), [])
})

test('prefetch: the server view, closed rooms, meeting rooms, floors and the seated reach', () => {
    const tilemap: Room['tilemap'] = {}
    for (let x = 0; x < 40; x++) for (let y = 0; y < 12; y++) tilemap[`${x}, ${y}`] = x >= 30 ? { privateAreaId: 'room' } : x >= 20 && y >= 6 ? { areaId: 'training' } : {}
    const desk = (id: string, x: number, y: number) => ({ id, kind: 'desk' as const, label: id, bounds: { x, y: y - 1, width: 1, height: 1 }, approach: { x, y } })
    const room: Room = { name: 'A', tilemap, areas: { training: { label: 'Treinamento', conversation: 'stage', meeting: { stage: { x1: 20, y1: 11, x2: 29, y2: 11 } } } }, interactions: [desk('d1', 2, 1), desk('d2', 2, 5)] }
    const session = new Session('realm', { spawnpoint: { roomIndex: 0, x: 0, y: 0 }, rooms: [room, structuredClone(room)] })
    const office = session.roomFeatures[0].office
    const add = (uid: string, x: number, y: number, floor = 0) => { if (!session.getPlayer(uid)) session.addPlayer(`socket-${uid}`, uid, uid, '009'); session.changeRoom(uid, floor, x, y) }
    add('ana', 10, 1); add('bia', 16, 1)
    assert.deepEqual(mediaView(session).get('ana')!.nearby, ['bia'], 'six tiles: within PREFETCH_RADIUS')
    assert.equal(mediaView(session).get('ana')!.conversation, null)
    add('bia', 17, 1)
    assert.deepEqual(mediaView(session).get('ana')!.nearby, [], 'seven tiles: out')
    add('bia', 16, 1, 1)
    assert.deepEqual(mediaView(session).get('ana')!.nearby, [], 'another floor')
    add('bia', 31, 1); add('ana', 27, 1)
    assert.equal(mediaView(session).get('bia')!.open, null, 'inside a closed room')
    assert.deepEqual(mediaView(session).get('ana')!.nearby, [], 'across the door of a closed room')
    add('bia', 22, 7); add('ana', 22, 3)
    assert.equal(mediaView(session).get('bia')!.open, null, 'inside a meeting room')
    assert.deepEqual(mediaView(session).get('ana')!.nearby, [])

    // Two seated people never prefetch each other (4 tiles apart: no conversation either); one standing: 6.5 applies.
    add('ana', 2, 1); add('bia', 2, 5)
    assert.ok(office.occupy('ana', 'd1').ok); assert.ok(office.occupy('bia', 'd2').ok)
    assert.equal(mediaView(session).get('ana')!.conversation, null)
    assert.deepEqual(mediaView(session).get('ana')!.nearby, [], 'both seated')
    assert.deepEqual(mediaView(session).get('bia')!.nearby, [])
    office.release('bia')
    assert.deepEqual(mediaView(session).get('ana')!.nearby, ['bia'], 'seated and standing, 4 tiles')
    assert.deepEqual(mediaView(session).get('bia')!.nearby, ['ana'])
    assert.equal(PREFETCH_RADIUS, 6.5); assert.equal(PREFETCH_LIMIT, 6)
})

test('prefetch: the same track turning active (or back) is a flip, not a close and a pull', () => {
    const active = desiredPulls(view({ ana: { conversation: 'c' }, bia: { conversation: 'c' } }), 'ana', [pub('bia', 'mic'), pub('bia', 'camera')])
    const around = desiredPulls(view({ ana: { open: 0, nearby: ['bia'] }, bia: { open: 0, nearby: ['ana'] } }), 'ana', [pub('bia', 'mic'), pub('bia', 'camera')])
    const pulled = (wanted: Map<string, { prefetch: boolean }>) => new Map([...wanted].map(([key, pull]) => [key, { prefetch: pull.prefetch }]))
    const up = diffPulls(pulled(around), active)
    assert.deepEqual({ add: up.add, remove: up.remove, flip: up.flip.map(pull => `${pull.key}:${pull.prefetch}`) }, { add: [], remove: [], flip: ['bia|mic-1:false', 'bia|camera-1:false'] })
    const down = diffPulls(pulled(active), around)
    assert.deepEqual(down.flip.map(pull => `${pull.key}:${pull.prefetch}`), ['bia|mic-1:true', 'bia|camera-1:true'])
    assert.deepEqual(diffPulls(pulled(active), active).flip, [])
})

test('prefetch: the fingerprint moves when someone comes within reach or leaves it, not on every step inside it', () => {
    const tilemap: Room['tilemap'] = {}
    for (let x = 0; x < 30; x++) tilemap[`${x}, 0`] = {}
    const session = new Session('realm', { spawnpoint: { roomIndex: 0, x: 0, y: 0 }, rooms: [{ name: 'A', tilemap }] })
    const add = (uid: string, x: number) => { if (!session.getPlayer(uid)) session.addPlayer(`socket-${uid}`, uid, uid, '009'); session.changeRoom(uid, 0, x, 0) }
    add('ana', 0); add('bia', 10)
    const far = mediaFingerprint(session)
    add('bia', 9)
    assert.equal(mediaFingerprint(session), far, 'still out of reach')
    add('bia', 6)
    const near = mediaFingerprint(session)
    assert.notEqual(near, far, 'within PREFETCH_RADIUS')
    add('bia', 5)
    assert.equal(mediaFingerprint(session), near, 'a step inside the reach, still no conversation')
})

test('prefetch: at most the 6 nearest, ties by uid, never someone already in the conversation', () => {
    const tilemap: Room['tilemap'] = {}
    for (let x = 0; x < 40; x++) for (let y = 0; y < 14; y++) tilemap[`${x}, ${y}`] = {}
    const session = new Session('realm', { spawnpoint: { roomIndex: 0, x: 0, y: 0 }, rooms: [{ name: 'A', tilemap }] })
    const add = (uid: string, x: number, y: number) => { if (!session.getPlayer(uid)) session.addPlayer(`socket-${uid}`, uid, uid, '009'); session.changeRoom(uid, 0, x, y) }
    // A crowded reception around ana, everyone out of her conversation reach: four at 4 tiles, three at 5, one at 6.
    add('ana', 20, 6)
    add('a1', 24, 6); add('a2', 16, 6); add('a3', 20, 2); add('a4', 20, 10)
    add('c', 25, 6); add('b', 15, 6); add('d', 20, 1); add('e', 26, 6)
    const view = mediaView(session)
    assert.equal(view.get('ana')!.conversation, null)
    assert.deepEqual(view.get('ana')!.nearby, ['a1', 'a2', 'a3', 'a4', 'b', 'c'])
    assert.ok(view.get('d')!.nearby.length <= PREFETCH_LIMIT)

    const pair = new Session('realm', { spawnpoint: { roomIndex: 0, x: 0, y: 0 }, rooms: [{ name: 'A', tilemap }] })
    for (const [uid, x] of [['ana', 0], ['bia', 3]] as const) { pair.addPlayer(`socket-${uid}`, uid, uid, '009'); pair.changeRoom(uid, 0, x, 0) }
    assert.ok(mediaView(pair).get('ana')!.conversation)
    assert.deepEqual(mediaView(pair).get('ana')!.nearby, [], 'in the conversation: pulled as active, not counted')
    pair.changeRoom('bia', 0, 6, 0)
    assert.deepEqual(mediaView(pair).get('ana')!.nearby, ['bia'])
})
