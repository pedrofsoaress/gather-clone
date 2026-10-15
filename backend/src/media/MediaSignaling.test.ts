import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Session, type Room } from '../session'
import { CloudflareError, type RealtimeApi } from './CloudflareRealtime'
import { MediaSignaling, type MediaSignalingOptions } from './MediaSignaling'
import { EMPTY_TRACK_RETRY_MS, PUBLISH_TIMEOUT_MS, STUN_ONLY } from './protocol'

type Client = ReturnType<typeof fakeClient>
function fakeClient(uid: string) {
    const client = { socketId: `socket-${uid}`, emitted: [] as [string, any][], steps: [] as any[], active: 0, maxActive: 0, delayMs: 0, fail: false,
        emit(event: string, payload: unknown) { client.emitted.push([event, payload]) },
        async ask(_event: string, step: any) {
            client.active++; client.maxActive = Math.max(client.maxActive, client.active); client.steps.push(step)
            await new Promise(resolve => setTimeout(resolve, client.delayMs))
            client.active--
            if (client.fail) throw new Error('timeout')
            return step.type === 'pull' ? { ok: true, answer: `answer-${uid}` } : step.type === 'close' && !step.force ? { ok: true, offer: `offer-${uid}` } : { ok: true }
        } }
    return client
}

// The prefetch grace is off unless a test sets it (see the grace tests).
function harness(provider: 'agora' | 'cloudflare' = 'cloudflare', overrides: Partial<RealtimeApi> = {}, options: Partial<MediaSignalingOptions> = {}) {
    const calls: any[][] = []
    let sessions = 0, mids = 100
    const api: RealtimeApi = {
        async newSession() { calls.push(['newSession']); return `s${++sessions}` },
        async openSession(offer) { calls.push(['openSession', offer]); return { sessionId: `s${++sessions}`, answer: `open-answer-${offer}` } },
        async publish(sid, offer, tracks) { calls.push(['publish', sid, tracks]); return { sessionDescription: { type: 'answer', sdp: `answer-${offer}` }, tracks } },
        async pull(sid, tracks) { calls.push(['pull', sid, tracks]); return { requiresImmediateRenegotiation: true, sessionDescription: { type: 'offer', sdp: 'pull-offer' }, tracks: tracks.map(t => ({ mid: String(++mids), sessionId: t.sessionId, trackName: t.trackName })) } },
        async renegotiate(sid, answer) { calls.push(['renegotiate', sid, answer]) },
        async close(sid, closing, offer) { calls.push(['close', sid, closing, offer]); return { sessionDescription: { type: 'answer', sdp: 'close-answer' } } },
        async update(sid, tracks) { calls.push(['update', sid, tracks]); return {} },
        async iceServers() { return [{ urls: 'turn:turn.cloudflare.com:3478', username: 'u', credential: 'c' }] },
        ...overrides,
    }
    // Floor 0: hallway x 0..14, closed room x 20..24 (privateAreaId 'room'), training room y 6..9 with stage y 9.
    const tilemap: Room['tilemap'] = {}
    for (let x = 0; x < 30; x++) for (let y = 0; y < 10; y++) tilemap[`${x}, ${y}`] = x >= 20 && x <= 24 && y < 6 ? { privateAreaId: 'room' } : y >= 6 ? { privateAreaId: 'training' } : {}
    const room: Room = { name: 'A', tilemap, areas: { training: { label: 'Treinamento', meeting: { stage: { x1: 0, y1: 9, x2: 29, y2: 9 } } } } }
    const session = new Session('realm', { spawnpoint: { roomIndex: 0, x: 0, y: 0 }, rooms: [room, structuredClone(room)] })
    const logs: string[] = [], clients = new Map<string, Client>()
    const media = new MediaSignaling({ provider, api: provider === 'cloudflare' ? api : null, iceServers: () => api.iceServers(60), getSession: () => session, schedule: run => queueMicrotask(run), log: line => logs.push(line), pullRetryMs: 5, emptyTrackRetryMs: [1, 2, 3, 4], publishTimeoutMs: 40, prefetchGraceMs: 0, ...options })
    const place = async (uid: string, x: number, y: number, floor = 0) => { session.changeRoom(uid, floor, x, y); media.changed(session); await media.idle() }
    const enter = async (uid: string, x: number, y: number, floor = 0) => {
        session.addPlayer(`socket-${uid}`, uid, uid, '009')
        const client = fakeClient(uid); clients.set(uid, client)
        await media.join(uid, client)
        await place(uid, x, y, floor)
        return client
    }
    const publish = (uid: string, kind: string, extra = {}) => media.publish(uid, `socket-${uid}`, { kind, mid: kind, offer: `offer-${kind}`, simulcast: kind === 'camera', ...extra })
    return { api, media, session, calls, logs, clients, enter, place, publish }
}

const SIMULCAST = { priorityOrdering: 'none', ridNotAvailable: 'asciibetical' }
// The pulls the page holds now, replaying its negotiation steps: mid -> 'fromUid|kind'.
function openPulls(client: Client) {
    const open = new Map<string, string>()
    for (const step of client.steps) {
        if (step.type === 'pull') for (const track of step.tracks) open.set(track.mid, `${track.fromUid}|${track.kind}`)
        if (step.type === 'close') for (const mid of step.mids) open.delete(mid)
    }
    return open
}
// Negotiation steps without their generation (checked on its own in the generation test).
const stepsOf = (client: Client, from = 0) => client.steps.slice(from).map(({ generation, ...step }) => step)
const configOf = (client: Client) => { const [event, { generation, ...config }] = client.emitted.find(([name]) => name === 'mediaConfig')!; assert.equal(typeof generation, 'number'); return [event, config] }
const TURN = [{ urls: 'turn:turn.cloudflare.com:3478', username: 'u', credential: 'c' }]
const pulledKinds = (client: Client) => [...openPulls(client).values()].sort()
const lastPeers = (client: Client) => [...client.emitted].reverse().find(([event]) => event === 'mediaPeers')?.[1]
const callsOf = (calls: any[][], name: string) => calls.filter(call => call[0] === name)
const receiveSessionOf = (calls: any[][], uid: string) => calls.find(call => call[0] === 'renegotiate' && call[2] === `answer-${uid}`)?.[1]
async function until(condition: () => boolean) {
    for (let i = 0; i < 500 && !condition(); i++) await new Promise(resolve => setTimeout(resolve, 1))
    assert.ok(condition(), 'condition never became true')
}

test('agora: the page is told to use Agora and every media request is refused', async () => {
    const h = harness('agora')
    const ana = await h.enter('ana', 2, 0)
    await h.media.idle()
    assert.deepEqual(ana.emitted, [['mediaConfig', { provider: 'agora' }]])
    const refused = { ok: false, error: 'O vídeo deste escritório usa a Agora.' }
    assert.deepEqual(await h.publish('ana', 'mic'), refused)
    assert.deepEqual(await h.media.unpublish('ana', 'socket-ana', { kind: 'mic', mid: 'mic', offer: 'o' }), refused)
    assert.deepEqual(await h.media.trackState('ana', 'socket-ana', { kind: 'mic', live: false }), refused)
    assert.deepEqual(await h.media.layer('ana', 'socket-ana', { fromUid: 'bia', layer: 'h' }), refused)
    assert.deepEqual(await h.media.reset('ana', 'socket-ana', {}), refused)
    await h.media.refreshConfig()
    await h.media.idle()
    assert.deepEqual(h.calls, [])
    assert.equal(ana.emitted.length, 1)
})

test('config: TURN servers on join, STUN only with a log line when TURN fails', async () => {
    const h = harness()
    const ana = await h.enter('ana', 2, 0)
    assert.deepEqual(configOf(ana), ['mediaConfig', { provider: 'cloudflare', iceServers: TURN, bootstrap: true }])

    const broken = harness('cloudflare', { async iceServers() { throw new Error('sem rede') } })
    const bia = await broken.enter('bia', 2, 0)
    assert.deepEqual(configOf(bia), ['mediaConfig', { provider: 'cloudflare', iceServers: STUN_ONLY, bootstrap: true }])
    assert.ok(broken.logs.some(line => line.includes('TURN indisponível') && line.includes('usando só STUN')), broken.logs.join('\n'))
})

test('publish: one send session, unique track names, and the neighbour pulls mic and camera', async () => {
    const h = harness()
    const ana = await h.enter('ana', 2, 0)
    const [mic, camera] = await Promise.all([h.publish('ana', 'mic'), h.publish('ana', 'camera')])
    assert.deepEqual(mic, { ok: true, answer: 'answer-offer-mic' })
    assert.deepEqual(camera, { ok: true, answer: 'answer-offer-camera' })
    assert.equal(callsOf(h.calls, 'newSession').length, 1)
    assert.deepEqual(callsOf(h.calls, 'publish'), [
        ['publish', 's1', [{ location: 'local', mid: 'mic', trackName: 'mic-1' }]],
        ['publish', 's1', [{ location: 'local', mid: 'camera', trackName: 'camera-2' }]],
    ])

    const bia = await h.enter('bia', 4, 0)
    await h.media.idle()
    const pulls = stepsOf(bia).filter(step => step.type === 'pull')
    assert.equal(pulls.length, 1)
    assert.deepEqual(pulls[0], { type: 'pull', offer: 'pull-offer', tracks: [{ mid: '101', fromUid: 'ana', kind: 'mic', prefetch: false }, { mid: '102', fromUid: 'ana', kind: 'camera', prefetch: false }] })
    assert.deepEqual(callsOf(h.calls, 'pull'), [['pull', 's2', [
        { location: 'remote', sessionId: 's1', trackName: 'mic-1' },
        { location: 'remote', sessionId: 's1', trackName: 'camera-2', simulcast: { preferredRid: 'q', ...SIMULCAST } },
    ]]])
    assert.deepEqual(callsOf(h.calls, 'renegotiate'), [['renegotiate', 's2', 'answer-bia']])
    assert.ok(lastPeers(ana))
    assert.deepEqual(lastPeers(bia), { self: 'bia', conversation: lastPeers(bia).conversation, peers: [{ uid: 'ana', mic: true, camera: true, screen: false }], ownScreen: false })
    assert.ok(lastPeers(bia).conversation)
    assert.deepEqual(lastPeers(ana).peers, [{ uid: 'bia', mic: false, camera: false, screen: false }])
})

test('walking away closes the pulls forced, without a renegotiation, coming back pulls them again', async () => {
    const h = harness()
    await h.enter('ana', 2, 0)
    await h.enter('caio', 6, 0)
    await h.publish('ana', 'mic'); await h.publish('ana', 'camera'); await h.publish('caio', 'mic')
    const bia = await h.enter('bia', 4, 0)
    assert.deepEqual(pulledKinds(bia), ['ana|camera', 'ana|mic', 'caio|mic'])
    const sub = receiveSessionOf(h.calls, 'bia')
    const anaMids = [...openPulls(bia)].filter(([, who]) => who.startsWith('ana|')).map(([mid]) => mid)

    // Ana leaves the group while bia keeps caio's mic: still forced. A page-offered renegotiation on a receive
    // session that Cloudflare offered leaves it "disconnected" for Cloudflare (every later call there fails with 410).
    const before = bia.steps.length
    await h.place('ana', 14, 0)
    assert.deepEqual(stepsOf(bia, before), [{ type: 'close', mids: anaMids, force: true }])
    assert.deepEqual(callsOf(h.calls, 'close').filter(call => call[1] === sub), [['close', sub, anaMids, undefined]])
    assert.deepEqual(pulledKinds(bia), ['caio|mic'])

    await h.place('ana', 2, 0)
    assert.deepEqual(pulledKinds(bia), ['ana|camera', 'ana|mic', 'caio|mic'])
    const again = [...openPulls(bia)].filter(([, who]) => who.startsWith('ana|')).map(([mid]) => mid)
    assert.equal(again.some(mid => anaMids.includes(mid)), false, 'new mids')
})

test('closing the last pulled track is forced, with no offer and no answer step', async () => {
    const h = harness()
    await h.enter('ana', 2, 0)
    await h.publish('ana', 'mic'); await h.publish('ana', 'camera')
    const bia = await h.enter('bia', 4, 0)
    const sub = receiveSessionOf(h.calls, 'bia')
    const mids = [...openPulls(bia).keys()]
    assert.equal(mids.length, 2)

    const before = bia.steps.length
    await h.place('bia', 14, 0)
    assert.deepEqual(stepsOf(bia, before), [{ type: 'close', mids, force: true }])
    assert.deepEqual(callsOf(h.calls, 'close').filter(call => call[1] === sub), [['close', sub, mids, undefined]])
    assert.deepEqual(pulledKinds(bia), [])
    assert.equal(bia.emitted.some(([event]) => event === 'mediaRestart'), false)

    // The receive session survives: coming back pulls on it again without a new session.
    const sessions = callsOf(h.calls, 'newSession').length
    await h.place('bia', 4, 0)
    assert.equal(callsOf(h.calls, 'newSession').length, sessions)
    assert.equal(callsOf(h.calls, 'pull').at(-1)![1], sub)
    assert.deepEqual(pulledKinds(bia), ['ana|camera', 'ana|mic'])
})

test('open: the send session starts from the page offer with its data channel, publishes then use it', async () => {
    const h = harness()
    await h.enter('ana', 2, 0)
    const invalid = { ok: false, error: 'Pedido de vídeo inválido.' }
    assert.deepEqual(await h.media.open('ana', 'socket-ana', {}), invalid)
    assert.deepEqual(await h.media.open('ana', 'socket-stale', { offer: 'dc' }), { ok: false, error: 'Fora do escritório.' })
    assert.deepEqual(await h.media.open('ana', 'socket-ana', { offer: 'dc' }), { ok: true, answer: 'open-answer-dc' })
    assert.deepEqual(callsOf(h.calls, 'openSession'), [['openSession', 'dc']])
    assert.equal(callsOf(h.calls, 'newSession').length, 0, 'no other send session is made')
    await h.publish('ana', 'mic')
    assert.equal(callsOf(h.calls, 'publish')[0][1], 's1', 'the publish goes to the opened session')
    assert.equal(callsOf(h.calls, 'newSession').length, 0)
    // Once tracks are out on it, the session is not replaced.
    assert.deepEqual(await h.media.open('ana', 'socket-ana', { offer: 'dc2' }), invalid)
    assert.deepEqual(await harness('agora').media.open('ana', 'socket-ana', { offer: 'dc' }), { ok: false, error: 'O vídeo deste escritório usa a Agora.' })
})

test('authorization: closed rooms, speakers, screens, layers and stale sockets', async () => {
    const h = harness()
    await h.enter('ana', 21, 0)
    const dani = await h.enter('dani', 22, 0)
    const caio = await h.enter('caio', 19, 0)
    await h.enter('bia', 10, 0)
    await h.publish('ana', 'mic'); await h.publish('ana', 'camera'); await h.publish('dani', 'mic'); await h.publish('caio', 'mic')
    await h.media.idle()
    assert.deepEqual(pulledKinds(caio), [])
    assert.deepEqual(pulledKinds(dani), ['ana|camera', 'ana|mic'])

    assert.deepEqual(await h.publish('caio', 'speaker', { objectId: 'lounge' }), { ok: false, error: 'A caixa de som ficou indisponível.' })
    assert.deepEqual(await h.publish('caio', 'screen'), { ok: false, error: 'Aproxime-se de alguém para iniciar uma chamada antes de compartilhar a tela.' })
    assert.deepEqual(await h.media.layer('bia', 'socket-bia', { fromUid: 'caio', layer: 'f' }), { ok: true })
    await h.media.idle()
    assert.deepEqual(callsOf(h.calls, 'update'), [])

    const out = { ok: false, error: 'Fora do escritório.' }
    assert.deepEqual(await h.media.publish('ana', 'socket-dani', { kind: 'mic', mid: 'mic', offer: 'o', simulcast: false }), out)
    assert.deepEqual(await h.media.trackState('ana', 'socket-x', { kind: 'mic', live: false }), out)
    assert.deepEqual(await h.media.reset('nobody', 'socket-nobody', {}), out)
    const invalid = { ok: false, error: 'Pedido de vídeo inválido.' }
    assert.deepEqual(await h.media.publish('ana', 'socket-ana', { kind: 'mic' }), invalid)
    assert.deepEqual(await h.publish('ana', 'speaker'), invalid)
    assert.deepEqual(await h.media.unpublish('ana', 'socket-ana', { kind: 'camera', mid: 'other', offer: 'o' }), invalid)
})

test('training: the audience gets the stage cameras and every mic; the stage gets everything', async () => {
    const h = harness()
    const host = await h.enter('host', 5, 9)
    await h.enter('ana', 5, 7)
    const bia = await h.enter('bia', 6, 7)
    for (const uid of ['host', 'ana', 'bia']) { await h.publish(uid, 'camera'); await h.publish(uid, 'mic') }
    await h.media.idle()
    assert.deepEqual(pulledKinds(bia), ['ana|mic', 'host|camera', 'host|mic'])
    assert.deepEqual(pulledKinds(host), ['ana|camera', 'ana|mic', 'bia|camera', 'bia|mic'])

    await h.place('bia', 6, 9)
    assert.deepEqual(pulledKinds(bia), ['ana|camera', 'ana|mic', 'host|camera', 'host|mic'])
})

test('layers: tracks/update on the simulcast camera only, once per change, kept across pulls', async () => {
    const h = harness()
    await h.enter('ana', 2, 0)
    await h.publish('ana', 'mic'); await h.publish('ana', 'camera')
    await h.enter('caio', 3, 1)
    await h.publish('caio', 'camera', { simulcast: false })
    const bia = await h.enter('bia', 4, 0)
    const sub = receiveSessionOf(h.calls, 'bia')
    const anaCamera = [...openPulls(bia)].find(([, who]) => who === 'ana|camera')![0]

    assert.deepEqual(await h.media.layer('bia', 'socket-bia', { fromUid: 'ana', layer: 'h' }), { ok: true })
    await h.media.idle()
    assert.deepEqual(callsOf(h.calls, 'update'), [['update', sub, [{ location: 'remote', mid: anaCamera, sessionId: 's1', trackName: 'camera-2', simulcast: { preferredRid: 'h', ...SIMULCAST } }]]])
    assert.deepEqual(await h.media.layer('bia', 'socket-bia', { fromUid: 'ana', layer: 'h' }), { ok: true })
    assert.deepEqual(await h.media.layer('bia', 'socket-bia', { fromUid: 'caio', layer: 'h' }), { ok: true })
    await h.media.idle()
    assert.equal(callsOf(h.calls, 'update').length, 1)

    const caioPull = callsOf(h.calls, 'pull').filter(call => call[1] === sub).flatMap(call => call[2]).find((track: any) => track.trackName === 'camera-3')
    assert.ok(caioPull)
    assert.equal('simulcast' in caioPull, false)

    await h.place('bia', 14, 0)
    await h.place('bia', 4, 0)
    const repull = callsOf(h.calls, 'pull').at(-1)![2].find((track: any) => track.trackName === 'camera-2')
    assert.deepEqual(repull.simulcast, { preferredRid: 'h', ...SIMULCAST })
})

test('layers: a layer asked while that pull is negotiating is applied right after it', async () => {
    const h = harness()
    await h.enter('ana', 2, 0)
    await h.publish('ana', 'camera')
    h.session.addPlayer('socket-bia', 'bia', 'bia', '009')
    const bia = fakeClient('bia'); bia.delayMs = 20; h.clients.set('bia', bia)
    await h.media.join('bia', bia)
    h.session.changeRoom('bia', 0, 4, 0); h.media.changed(h.session)
    await until(() => bia.active === 1)
    assert.deepEqual(await h.media.layer('bia', 'socket-bia', { fromUid: 'ana', layer: 'f' }), { ok: true })
    await h.media.idle()
    assert.equal(callsOf(h.calls, 'pull')[0][2][0].simulcast.preferredRid, 'q')
    const mid = [...openPulls(bia).keys()][0]
    assert.deepEqual(callsOf(h.calls, 'update'), [['update', receiveSessionOf(h.calls, 'bia'), [{ location: 'remote', mid, sessionId: 's1', trackName: 'camera-1', simulcast: { preferredRid: 'f', ...SIMULCAST } }]]])
})

test('never two negotiations at once per person, and the send side never waits for them', async () => {
    const h = harness()
    await h.enter('ana', 2, 0)
    await h.publish('ana', 'mic'); await h.publish('ana', 'camera')

    h.session.addPlayer('socket-bia', 'bia', 'bia', '009')
    const bia = fakeClient('bia'); bia.delayMs = 20; h.clients.set('bia', bia)
    await h.media.join('bia', bia)
    h.session.changeRoom('bia', 0, 4, 0); h.media.changed(h.session)
    await until(() => bia.active === 1)

    assert.deepEqual(await h.publish('ana', 'screen'), { ok: true, answer: 'answer-offer-screen' })
    assert.equal(bia.active, 1, 'ana got her answer while bia was still negotiating')
    h.session.addPlayer('socket-caio', 'caio', 'caio', '009')
    const caio = fakeClient('caio'); h.clients.set('caio', caio)
    await h.media.join('caio', caio)
    h.session.changeRoom('caio', 0, 3, 1); h.media.changed(h.session)
    assert.deepEqual(await h.publish('caio', 'mic'), { ok: true, answer: 'answer-offer-mic' })
    assert.deepEqual(await h.media.unpublish('ana', 'socket-ana', { kind: 'mic', mid: 'mic', offer: 'off' }), { ok: true, answer: 'close-answer' })
    assert.equal(bia.active, 1)
    await h.media.idle()

    assert.equal(bia.maxActive, 1)
    bia.steps.forEach((step, index) => {
        if (step.type === 'close' && !step.force) assert.equal(bia.steps[index + 1]?.type, 'answer', `close at ${index} is answered`)
        if (step.type === 'answer') assert.equal(bia.steps[index - 1]?.type, 'close', `answer at ${index} follows a close`)
    })
    assert.deepEqual(pulledKinds(bia), ['ana|camera', 'ana|screen', 'caio|mic'])
})

test('failures: a refused track is retried once, then reported once, and pulled again after a republish', async () => {
    const h = harness()
    const pull = h.api.pull
    h.api.pull = async (sid, tracks) => {
        const response = await pull(sid, tracks)
        return { ...response, tracks: response.tracks!.map(track => track.trackName === 'camera-2' ? { ...track, errorCode: 'not_found' } : track) }
    }
    await h.enter('ana', 2, 0)
    await h.publish('ana', 'mic'); await h.publish('ana', 'camera')
    const bia = await h.enter('bia', 4, 0)
    const errors = () => bia.emitted.filter(([event]) => event === 'mediaTrackError')
    const pullsOfCamera2 = () => callsOf(h.calls, 'pull').flatMap(call => call[2]).filter((track: any) => track.trackName === 'camera-2').length
    assert.equal(pullsOfCamera2(), 2, 'asked, then retried once')
    assert.deepEqual(errors(), [['mediaTrackError', { fromUid: 'ana', kind: 'camera' }]])
    assert.deepEqual(pulledKinds(bia), ['ana|mic'])
    assert.deepEqual(stepsOf(bia).filter(step => step.type === 'pull').flatMap((step: any) => step.tracks.map((track: any) => track.kind)), ['mic'])

    // Someone arriving makes everyone resync; the refused key is not asked again.
    await h.enter('caio', 22, 3)
    assert.equal(pullsOfCamera2(), 2)

    // The republish closes the older camera on Cloudflare first (forced, the page renegotiates the new one).
    const closes = callsOf(h.calls, 'close').length
    await h.publish('ana', 'camera')
    const publishes = callsOf(h.calls, 'publish')
    assert.deepEqual(callsOf(h.calls, 'close').slice(closes), [['close', 's1', ['camera'], undefined]])
    assert.ok(h.calls.indexOf(callsOf(h.calls, 'close').at(-1)!) < h.calls.indexOf(publishes.at(-1)!))
    await h.media.idle()
    assert.equal(errors().length, 1)
    assert.deepEqual(pulledKinds(bia), ['ana|camera', 'ana|mic'])
    assert.equal(bia.emitted.some(([event]) => event === 'mediaRestart'), false)
})

test('failures: a pull refused once and accepted on the retry is never reported', async () => {
    const h = harness()
    const pull = h.api.pull
    let refusals = 0
    h.api.pull = async (sid, tracks) => {
        const response = await pull(sid, tracks)
        return { ...response, tracks: response.tracks!.map(track => track.trackName === 'camera-2' && refusals++ === 0 ? { ...track, errorCode: 'not_found' } : track) }
    }
    await h.enter('ana', 2, 0)
    await h.publish('ana', 'mic'); await h.publish('ana', 'camera')
    const bia = await h.enter('bia', 4, 0)
    assert.deepEqual(pulledKinds(bia), ['ana|camera', 'ana|mic'])
    assert.equal(bia.emitted.some(([event]) => event === 'mediaTrackError'), false)
})

test('failures: a track with no media yet (empty_track_error) is retried with a backoff before it is reported', async () => {
    assert.deepEqual(EMPTY_TRACK_RETRY_MS, [500, 1000, 2000, 4000])
    for (const [refusals, reported] of [[4, false], [9, true]] as const) {
        const h = harness()
        const pull = h.api.pull
        let refused = 0
        h.api.pull = async (sid, tracks) => {
            const response = await pull(sid, tracks)
            return { ...response, tracks: response.tracks!.map(track => track.trackName === 'camera-2' && refused++ < refusals ? { ...track, errorCode: 'empty_track_error' } : track) }
        }
        await h.enter('ana', 2, 0)
        await h.publish('ana', 'mic'); await h.publish('ana', 'camera')
        const bia = await h.enter('bia', 4, 0)
        await h.media.idle()
        const pullsOfCamera2 = callsOf(h.calls, 'pull').flatMap(call => call[2]).filter((track: any) => track.trackName === 'camera-2').length
        const errors = bia.emitted.filter(([event]) => event === 'mediaTrackError')
        if (reported) {
            assert.equal(pullsOfCamera2, 5, 'asked, then retried four times')
            assert.deepEqual(errors, [['mediaTrackError', { fromUid: 'ana', kind: 'camera' }]])
            assert.deepEqual(pulledKinds(bia), ['ana|mic'])
        } else {
            assert.equal(pullsOfCamera2, 5, 'accepted on the fourth retry')
            assert.deepEqual(errors, [])
            assert.deepEqual(pulledKinds(bia), ['ana|camera', 'ana|mic'])
        }
    }
})

test('failures: a refusal is not reported when the track is no longer wanted', async () => {
    const h = harness()
    const pull = h.api.pull
    let refusals = 0
    h.api.pull = async (sid, tracks) => {
        const response = await pull(sid, tracks)
        if (tracks.some(track => track.trackName === 'camera-2') && ++refusals === 2) { h.session.changeRoom('bia', 0, 14, 0); h.media.changed(h.session) }
        return { ...response, tracks: response.tracks!.map(track => track.trackName === 'camera-2' ? { ...track, errorCode: 'not_found' } : track) }
    }
    await h.enter('ana', 2, 0)
    await h.publish('ana', 'mic'); await h.publish('ana', 'camera')
    const bia = await h.enter('bia', 4, 0)
    await h.media.idle()
    assert.equal(refusals, 2)
    assert.equal(bia.emitted.some(([event]) => event === 'mediaTrackError'), false)
    assert.deepEqual(pulledKinds(bia), [])
})

test('failures: a Cloudflare error or a failed ask restarts that person only', async () => {
    const h = harness()
    const bia = await h.enter('bia', 14, 0)
    await h.publish('bia', 'mic')
    const ana = await h.enter('ana', 2, 0)
    await h.publish('ana', 'mic')
    const pull = h.api.pull
    h.api.pull = async (sid, tracks) => {
        if (tracks.some(track => track.sessionId === 's2')) { h.calls.push(['pull-failed', sid]); throw new CloudflareError('gone', 410, 'session_error') }
        return pull(sid, tracks)
    }
    await h.place('bia', 4, 0)
    assert.ok(bia.emitted.some(([event]) => event === 'mediaRestart'))
    assert.ok(h.logs.includes('media: reiniciando bia: gone'), h.logs.join('\n'))
    assert.deepEqual(pulledKinds(ana), [], 'ana closed bia\'s mic')
    assert.ok(ana.steps.some(step => step.type === 'close'))
    assert.deepEqual(lastPeers(ana).peers, [{ uid: 'bia', mic: false, camera: false, screen: false }])
    assert.equal(ana.emitted.some(([event]) => event === 'mediaRestart'), false)

    // Until the page resets, the restarted person is not negotiated with, and cannot publish or change layers.
    h.api.pull = pull
    const steps = bia.steps.length
    await h.enter('caio', 3, 1)
    assert.deepEqual(await h.publish('caio', 'mic'), { ok: true, answer: 'answer-offer-mic' })
    assert.equal(bia.steps.length, steps)
    const refused = { ok: false, error: 'Não foi possível conectar o vídeo. Tente novamente.' }
    assert.deepEqual(await h.publish('bia', 'camera'), refused)
    assert.deepEqual(await h.media.unpublish('bia', 'socket-bia', { kind: 'mic', mid: 'mic', offer: 'o' }), refused)
    assert.deepEqual(await h.media.layer('bia', 'socket-bia', { fromUid: 'ana', layer: 'h' }), refused)

    const reset = await h.media.reset('bia', 'socket-bia', {})
    assert.equal(reset.ok && reset.config?.provider === 'cloudflare' && reset.config.bootstrap, true)
    await h.media.idle()
    assert.deepEqual(pulledKinds(bia), ['ana|mic', 'caio|mic'])

    // A page that does not answer, or refuses, gets the same restart.
    for (const failure of ['throw', 'refuse'] as const) {
        const restarts = bia.emitted.filter(([event]) => event === 'mediaRestart').length
        await h.media.reset('bia', 'socket-bia', {})
        const ask = bia.ask
        if (failure === 'throw') bia.fail = true
        else bia.ask = async (event, step) => { await ask(event, step); return { ok: false, error: 'sem transceptor' } }
        await h.media.idle()
        assert.equal(bia.emitted.filter(([event]) => event === 'mediaRestart').length, restarts + 1, failure)
        assert.ok(h.logs.includes(`media: reiniciando bia: ${failure === 'throw' ? 'timeout' : 'sem transceptor'}`), h.logs.join('\n'))
        bia.fail = false; bia.ask = ask
    }
})

test('idle unpublish: a paused track keeps its pull, an unpublished one is closed', async () => {
    const h = harness()
    const ana = await h.enter('ana', 2, 0)
    await h.publish('ana', 'mic'); await h.publish('ana', 'camera')
    const bia = await h.enter('bia', 4, 0)
    const steps = bia.steps.length

    assert.deepEqual(await h.media.trackState('ana', 'socket-ana', { kind: 'camera', live: false }), { ok: true })
    await h.media.idle()
    assert.deepEqual(lastPeers(bia).peers, [{ uid: 'ana', mic: true, camera: false, screen: false }])
    assert.equal(bia.steps.length, steps)

    const cameraMid = [...openPulls(bia)].find(([, who]) => who === 'ana|camera')![0]
    assert.deepEqual(await h.media.unpublish('ana', 'socket-ana', { kind: 'camera', mid: 'camera', offer: 'off' }), { ok: true, answer: 'close-answer' })
    assert.deepEqual(h.calls.find(call => call[0] === 'close'), ['close', 's1', ['camera'], 'off'])
    await h.media.idle()
    assert.deepEqual(stepsOf(bia, steps), [{ type: 'close', mids: [cameraMid], force: true }])
    assert.deepEqual(pulledKinds(bia), ['ana|mic'])
    assert.ok(ana)
})

test('leave, reset and the config refresh', async () => {
    const h = harness()
    const ana = await h.enter('ana', 2, 0)
    await h.publish('ana', 'mic'); await h.publish('ana', 'camera')
    const bia = await h.enter('bia', 4, 0)
    assert.deepEqual(pulledKinds(bia), ['ana|camera', 'ana|mic'])

    const sessions = callsOf(h.calls, 'newSession').length
    const reset = await h.media.reset('ana', 'socket-ana', {})
    assert.ok(reset.ok && reset.config?.provider === 'cloudflare')
    const { generation, ...config } = reset.config as any
    assert.deepEqual(config, { provider: 'cloudflare', iceServers: TURN, bootstrap: true })
    assert.notEqual(generation, ana.emitted.find(([name]) => name === 'mediaConfig')![1].generation, 'a reset starts a new generation')
    await h.media.idle()
    assert.deepEqual(pulledKinds(bia), [])
    await h.publish('ana', 'mic')
    assert.equal(callsOf(h.calls, 'newSession').length, sessions + 1)
    assert.equal(callsOf(h.calls, 'publish').at(-1)![1], `s${sessions + 1}`)
    await h.media.idle()
    assert.deepEqual(pulledKinds(bia), ['ana|mic'])

    await h.media.refreshConfig()
    for (const client of [ana, bia]) {
        const [event, { generation: refreshed, ...refresh }] = client.emitted.at(-1)!
        assert.deepEqual([event, refresh], ['mediaConfig', { provider: 'cloudflare', iceServers: TURN, bootstrap: false }])
        assert.equal(typeof refreshed, 'number')
    }
    assert.equal(ana.emitted.at(-1)![1].generation, generation, 'the refresh keeps the current generation')

    const steps = bia.steps.length
    h.media.leave('ana', 'socket-stale')
    await h.media.idle()
    assert.equal(bia.steps.length, steps)
    h.media.leave('ana', 'socket-ana')
    await h.media.idle()
    assert.deepEqual(pulledKinds(bia), [])
    assert.deepEqual(await h.publish('ana', 'mic'), { ok: false, error: 'Fora do escritório.' })
})

test('unpublishing the last publication: no offer, closed forced, ack without an answer', async () => {
    const h = harness()
    await h.enter('ana', 2, 0)
    await h.publish('ana', 'mic'); await h.publish('ana', 'camera')
    const bia = await h.enter('bia', 4, 0)
    const invalid = { ok: false, error: 'Pedido de vídeo inválido.' }
    assert.deepEqual(await h.media.unpublish('ana', 'socket-ana', { kind: 'camera', mid: 'camera' }), invalid, 'the mic is still published')
    assert.deepEqual(await h.media.unpublish('ana', 'socket-ana', { kind: 'camera', mid: 'camera', offer: 'off' }), { ok: true, answer: 'close-answer' })
    assert.deepEqual(await h.media.unpublish('ana', 'socket-ana', { kind: 'mic', mid: 'mic' }), { ok: true })
    assert.deepEqual(callsOf(h.calls, 'close').filter(call => call[1] === 's1'), [['close', 's1', ['camera'], 'off'], ['close', 's1', ['mic'], undefined]])
    await h.media.idle()
    assert.deepEqual(pulledKinds(bia), [])
    assert.deepEqual(stepsOf(bia).at(-1), { type: 'close', mids: [[...openPulls({ ...bia, steps: bia.steps.slice(0, -1) } as Client).keys()][0]], force: true })
    assert.deepEqual(lastPeers(bia).peers, [{ uid: 'ana', mic: false, camera: false, screen: false }])
})

test('walking straight from one group to another pulls first, then closes forced', async () => {
    const h = harness()
    await h.enter('ana', 2, 0)
    await h.enter('caio', 12, 0)
    await h.publish('ana', 'mic'); await h.publish('caio', 'mic')
    const bia = await h.enter('bia', 4, 0)
    const anaMid = [...openPulls(bia).keys()][0]
    const before = bia.steps.length
    await h.place('bia', 10, 0)
    const steps = stepsOf(bia, before)
    assert.deepEqual(steps.map(step => step.type), ['pull', 'close'])
    assert.deepEqual((steps[0] as any).tracks.map((track: any) => track.fromUid), ['caio'])
    assert.deepEqual(steps[1], { type: 'close', mids: [anaMid], force: true })
    assert.deepEqual(pulledKinds(bia), ['caio|mic'])
})

test('every negotiation step carries the generation of the config the page holds', async () => {
    const h = harness()
    await h.enter('ana', 2, 0)
    await h.publish('ana', 'mic')
    const bia = await h.enter('bia', 4, 0)
    const joined = bia.emitted.find(([event]) => event === 'mediaConfig')![1].generation
    assert.ok(bia.steps.length > 0)
    assert.ok(bia.steps.every(step => step.generation === joined))

    const before = bia.steps.length
    const reset = await h.media.reset('bia', 'socket-bia', {})
    await h.media.idle()
    const current = reset.ok && reset.config?.provider === 'cloudflare' ? reset.config.generation : -1
    assert.notEqual(current, joined)
    assert.ok(bia.steps.length > before)
    assert.ok(bia.steps.slice(before).every(step => step.generation === current))
})

test('a change that does not touch media costs no reconcile work', async () => {
    const h = harness()
    await h.enter('ana', 21, 1)
    await h.enter('bia', 22, 1)
    await h.publish('ana', 'mic')
    await h.media.idle()
    const bia = h.clients.get('bia')!
    const emitted = bia.emitted.length, steps = bia.steps.length, calls = h.calls.length
    // Moving inside the closed room keeps the same conversation: nothing is sent and nothing is negotiated.
    await h.place('bia', 23, 2)
    await h.place('ana', 20, 3)
    assert.equal(bia.emitted.length, emitted)
    assert.equal(bia.steps.length, steps)
    assert.equal(h.calls.length, calls)
    // A live flag only refreshes the tiles.
    await h.media.trackState('ana', 'socket-ana', { kind: 'mic', live: false })
    await h.media.idle()
    assert.deepEqual(lastPeers(bia).peers, [{ uid: 'ana', mic: false, camera: false, screen: false }])
    assert.equal(bia.steps.length, steps)
})

test('a receive session full of dead m-lines is recycled once nothing is pulled; publishing is untouched', async () => {
    const h = harness()
    const ana = await h.enter('ana', 2, 0)
    await h.publish('ana', 'mic'); await h.publish('ana', 'camera')
    const bia = await h.enter('bia', 4, 0)
    const sub = receiveSessionOf(h.calls, 'bia')
    const publishes = callsOf(h.calls, 'publish').length
    // 2 m-lines on arrival, 2 more on each return: 40 after 19 rounds, still pulled.
    for (let i = 0; i < 19; i++) { await h.place('bia', 14, 0); await h.place('bia', 4, 0) }
    assert.equal(bia.steps.some(step => step.type === 'recycle'), false)
    await h.place('bia', 14, 0)
    assert.deepEqual(stepsOf(bia).slice(-2).map(step => step.type), ['close', 'recycle'])
    const sessions = callsOf(h.calls, 'newSession').length
    await h.place('bia', 4, 0)
    assert.equal(callsOf(h.calls, 'newSession').length, sessions + 1, 'a new receive session')
    assert.notEqual(callsOf(h.calls, 'pull').at(-1)![1], sub)
    assert.deepEqual(pulledKinds(bia), ['ana|camera', 'ana|mic'])
    // Nobody restarted, and nothing was published or closed on the send side.
    for (const client of [ana, bia]) assert.equal(client.emitted.some(([event]) => event === 'mediaRestart'), false)
    assert.equal(callsOf(h.calls, 'publish').length, publishes)
    assert.equal(callsOf(h.calls, 'close').some(call => call[1] === 's1'), false)
    // Walking away again: below the threshold, no recycle.
    await h.place('bia', 14, 0)
    assert.equal(bia.steps.filter(step => step.type === 'recycle').length, 1)
})

test('someone who keeps receiving is recycled at 100 m-lines: pulls closed, receive side new, pulled again', async () => {
    const h = harness()
    const ana = await h.enter('ana', 2, 0)
    await h.publish('ana', 'mic'); await h.publish('ana', 'camera')
    const caio = await h.enter('caio', 4, 0)
    await h.publish('caio', 'mic')
    const bia = await h.enter('bia', 6, 0)
    // bia keeps caio's mic while ana comes and goes: 3 m-lines on arrival, 2 per visit of ana.
    const sub = receiveSessionOf(h.calls, 'bia')
    const publishes = callsOf(h.calls, 'publish').length
    for (let i = 0; i < 48; i++) { await h.place('ana', 0, 9); await h.place('ana', 2, 0) }
    await h.place('ana', 0, 9)
    await h.place('ana', 2, 0)
    assert.equal(bia.steps.some(step => step.type === 'recycle'), false, '101 m-lines, nothing changed for bia since')
    // The next change for bia (ana leaves): every pull is closed, the receive side recycled, caio's mic pulled again.
    await h.place('ana', 0, 9)
    const recycle = bia.steps.findIndex(step => step.type === 'recycle')
    assert.ok(recycle > 0)
    assert.deepEqual(stepsOf(bia).slice(recycle - 1).map(step => step.type), ['close', 'recycle', 'pull'])
    assert.equal(bia.steps[recycle - 1].force, true)
    assert.notEqual(callsOf(h.calls, 'pull').at(-1)![1], sub)
    assert.deepEqual(pulledKinds(bia), ['caio|mic'])
    await h.place('ana', 2, 0)
    assert.deepEqual(pulledKinds(bia), ['ana|camera', 'ana|mic', 'caio|mic'])
    for (const client of [ana, bia, caio]) assert.equal(client.emitted.some(([event]) => event === 'mediaRestart'), false)
    assert.equal(callsOf(h.calls, 'publish').length, publishes)
})

test('a publish slower than the cap is refused, and the track Cloudflare made is closed once the call returns', async () => {
    assert.equal(PUBLISH_TIMEOUT_MS, 7000)
    const h = harness()
    await h.enter('ana', 2, 0)
    const bia = await h.enter('bia', 4, 0)
    const publish = h.api.publish
    let slow = true
    h.api.publish = async (sid, offer, tracks) => { if (slow) await new Promise(resolve => setTimeout(resolve, 120)); return publish(sid, offer, tracks) }
    const started = Date.now()
    assert.deepEqual(await h.publish('ana', 'mic'), { ok: false, error: 'Não foi possível conectar o vídeo. Tente novamente.' })
    assert.ok(Date.now() - started < 110, 'refused at the cap, before Cloudflare answered')
    await h.media.idle()
    assert.deepEqual(callsOf(h.calls, 'close').filter(call => call[1] === 's1'), [['close', 's1', ['mic'], undefined]], 'the late track is closed, forced')
    assert.deepEqual(pulledKinds(bia), [])
    assert.equal(lastPeers(bia)?.peers.find((peer: any) => peer.uid === 'ana')?.mic ?? false, false, 'bia never sees a mic from ana')
    assert.ok(h.logs.some(line => line.includes('não publicou mic-') && line.includes('a tempo')))
    assert.equal(bia.emitted.some(([event]) => event === 'mediaRestart'), false)
    // A refused publish leaves the person working: the next one goes through.
    slow = false
    assert.deepEqual(await h.publish('ana', 'mic'), { ok: true, answer: 'answer-offer-mic' })
    await h.media.idle()
    assert.deepEqual(pulledKinds(bia), ['ana|mic'])
})

test('abandoned unpublish: a publish the page gave up on is closed, forced, if it went through', async () => {
    const h = harness()
    const ana = await h.enter('ana', 2, 0)
    const bia = await h.enter('bia', 4, 0)
    await h.publish('ana', 'mic'); await h.publish('ana', 'camera')
    await h.media.idle()
    assert.deepEqual(pulledKinds(bia), ['ana|camera', 'ana|mic'])
    const unpublish = (payload: object) => h.media.unpublish('ana', 'socket-ana', payload)
    assert.deepEqual(await unpublish({ kind: 'camera', mid: 'camera', abandoned: true, offer: 'x' }), { ok: false, error: 'Pedido de vídeo inválido.' })
    // Not the last publication, and no offer: allowed because the page never applied that answer.
    assert.deepEqual(await unpublish({ kind: 'camera', mid: 'camera', abandoned: true }), { ok: true })
    assert.deepEqual(callsOf(h.calls, 'close').filter(call => call[1] === 's1'), [['close', 's1', ['camera'], undefined]])
    await h.media.idle()
    assert.deepEqual(pulledKinds(bia), ['ana|mic'])
    // Nothing published on that mid: nothing to do.
    const closes = callsOf(h.calls, 'close').length
    assert.deepEqual(await unpublish({ kind: 'screen', mid: 'screen', abandoned: true }), { ok: true })
    assert.equal(callsOf(h.calls, 'close').length, closes)
    assert.equal(ana.emitted.some(([event]) => event === 'mediaRestart'), false)
})

test('settle: m-lines the page abandoned are closed with its offer and answered', async () => {
    const h = harness()
    await h.enter('ana', 2, 0)
    const bia = await h.enter('bia', 4, 0)
    assert.deepEqual(await h.media.settle('ana', 'socket-ana', { mids: ['3'], offer: 'o' }), { ok: false, error: 'Pedido de vídeo inválido.' }, 'no send session yet')
    await h.publish('ana', 'mic')
    assert.deepEqual(await h.media.settle('ana', 'socket-ana', { mids: [], offer: 'o' }), { ok: false, error: 'Pedido de vídeo inválido.' })
    assert.deepEqual(await h.media.settle('ana', 'socket-ana', { mids: ['3'], offer: 'settle-offer' }), { ok: true, answer: 'close-answer' })
    assert.deepEqual(callsOf(h.calls, 'close').at(-1), ['close', 's1', ['3'], 'settle-offer'])
    await h.media.idle()
    assert.deepEqual(pulledKinds(bia), ['ana|mic'], 'publications on other mids untouched')
    assert.deepEqual(await h.media.settle('ana', 'socket-ana', { mids: ['mic'], offer: 'o2' }), { ok: true, answer: 'close-answer' })
    await h.media.idle()
    assert.deepEqual(pulledKinds(bia), [], 'a publication on a settled mid is dropped')
    assert.deepEqual(await harness('agora').media.settle('ana', 'socket-ana', { mids: ['3'], offer: 'o' }), { ok: false, error: 'O vídeo deste escritório usa a Agora.' })
})

// A clock for the prefetch grace: timers run only when the test fires them.
function fakeTimers() {
    let id = 0
    const pending = new Map<number, { run: () => void, ms: number }>()
    return {
        pending,
        timers: { setTimeout(run: () => void, ms: number) { pending.set(++id, { run, ms }); return id }, clearTimeout(timer: unknown) { pending.delete(timer as number) } },
        fire() { const due = [...pending.values()]; pending.clear(); for (const { run } of due) run() },
    }
}
const pullSteps = (client: Client, from = 0) => stepsOf(client, from).filter(step => step.type === 'pull')

test('prefetch: someone around is pulled at q and not shown; joining the conversation flips the same pull', async () => {
    const h = harness()
    await h.enter('ana', 2, 0)
    await h.publish('ana', 'mic'); await h.publish('ana', 'camera')
    const bia = await h.enter('bia', 8, 0)
    const sub = receiveSessionOf(h.calls, 'bia')
    assert.deepEqual(pullSteps(bia).map(step => step.tracks), [[{ mid: '101', fromUid: 'ana', kind: 'mic', prefetch: true }, { mid: '102', fromUid: 'ana', kind: 'camera', prefetch: true }]])
    assert.deepEqual(callsOf(h.calls, 'pull')[0][2][1].simulcast, { preferredRid: 'q', ...SIMULCAST })
    assert.deepEqual(lastPeers(bia), { self: 'bia', conversation: null, peers: [], ownScreen: false }, 'no tile while prefetched')
    // A layer asked meanwhile is kept for later: a prefetched camera stays at q.
    assert.deepEqual(await h.media.layer('bia', 'socket-bia', { fromUid: 'ana', layer: 'h' }), { ok: true })
    await h.media.idle()
    assert.deepEqual(callsOf(h.calls, 'update'), [])

    const steps = bia.steps.length, pulls = callsOf(h.calls, 'pull').length
    await h.place('bia', 4, 0)
    assert.deepEqual(stepsOf(bia, steps), [], 'no renegotiation, no close')
    assert.equal(callsOf(h.calls, 'pull').length, pulls)
    assert.deepEqual(callsOf(h.calls, 'close').filter(call => call[1] === sub), [])
    assert.deepEqual(callsOf(h.calls, 'update'), [['update', sub, [{ location: 'remote', mid: '102', sessionId: 's1', trackName: 'camera-2', simulcast: { preferredRid: 'h', ...SIMULCAST } }]]])
    assert.deepEqual(lastPeers(bia).peers, [{ uid: 'ana', mic: true, camera: true, screen: false }], 'the roster shows her at once')

    // Out of the conversation, still around: back to prefetch, at q, hidden, still pulled.
    await h.place('bia', 8, 0)
    assert.deepEqual(stepsOf(bia, steps), [])
    assert.deepEqual(callsOf(h.calls, 'update').at(-1), ['update', sub, [{ location: 'remote', mid: '102', sessionId: 's1', trackName: 'camera-2', simulcast: { preferredRid: 'q', ...SIMULCAST } }]])
    assert.deepEqual(lastPeers(bia).peers, [])
    assert.deepEqual(pulledKinds(bia), ['ana|camera', 'ana|mic'])

    // Out of reach (no grace here): closed forced.
    await h.place('bia', 14, 0)
    assert.deepEqual(stepsOf(bia, steps), [{ type: 'close', mids: ['101', '102'], force: true }])
    assert.deepEqual(pulledKinds(bia), [])
})

test('prefetch grace: walking out of reach keeps the pulls 3 s, coming back first cancels the close', async () => {
    const clock = fakeTimers()
    const h = harness('cloudflare', {}, { prefetchGraceMs: 3000, timers: clock.timers })
    await h.enter('ana', 2, 0)
    await h.publish('ana', 'mic'); await h.publish('ana', 'camera')
    const bia = await h.enter('bia', 8, 0)
    const steps = bia.steps.length, pulls = callsOf(h.calls, 'pull').length

    await h.place('bia', 10, 0)
    assert.deepEqual(stepsOf(bia, steps), [])
    assert.deepEqual(pulledKinds(bia), ['ana|camera', 'ana|mic'])
    assert.deepEqual([...clock.pending.values()].map(timer => timer.ms), [3000, 3000])
    await h.place('bia', 9, 0)
    await h.place('bia', 8, 0)
    assert.equal(clock.pending.size, 0, 'back within reach: the timers are cancelled')
    await h.place('bia', 11, 0)
    await h.place('bia', 8, 0)
    await h.place('bia', 10, 0)
    assert.deepEqual(stepsOf(bia, steps), [], 'back and forth at the edge: nothing closed, nothing pulled again')
    assert.equal(callsOf(h.calls, 'pull').length, pulls)

    clock.fire()
    await h.media.idle()
    assert.deepEqual(stepsOf(bia, steps), [{ type: 'close', mids: ['101', '102'], force: true }])
    assert.deepEqual(pulledKinds(bia), [])
    assert.equal(clock.pending.size, 0)

    // From the conversation straight out of reach (a teleport): hidden at once, kept as prefetch at q until the timer.
    await h.place('bia', 4, 0)
    await h.media.layer('bia', 'socket-bia', { fromUid: 'ana', layer: 'h' })
    await h.media.idle()
    const sub = receiveSessionOf(h.calls, 'bia')
    const before = bia.steps.length
    await h.place('bia', 14, 0)
    assert.deepEqual(lastPeers(bia).peers, [])
    assert.deepEqual(stepsOf(bia, before), [])
    assert.equal(callsOf(h.calls, 'update').at(-1)![2][0].simulcast.preferredRid, 'q')
    assert.equal(callsOf(h.calls, 'update').at(-1)![1], sub)
    clock.fire()
    await h.media.idle()
    assert.deepEqual(pulledKinds(bia), [])
})

test('prefetch grace: a sender entering a closed room, leaving or republishing is closed at once', async () => {
    const clock = fakeTimers()
    const h = harness('cloudflare', {}, { prefetchGraceMs: 3000, timers: clock.timers })
    await h.enter('ana', 12, 0)
    await h.publish('ana', 'mic')
    const bia = await h.enter('bia', 18, 0)
    assert.deepEqual(pulledKinds(bia), ['ana|mic'])
    await h.place('ana', 21, 0)
    assert.deepEqual(pulledKinds(bia), [], 'ana is inside the closed room: nothing of hers, not even for the grace')
    assert.equal(clock.pending.size, 0)
    // Nor is anything prefetched across its door, from either side.
    await h.place('bia', 19, 0)
    assert.deepEqual(pulledKinds(bia), [])
    assert.deepEqual(pullSteps(h.clients.get('ana')!), [])

    await h.place('ana', 12, 0)
    await h.place('bia', 17, 0)
    assert.deepEqual(pulledKinds(bia), ['ana|mic'])
    await h.place('bia', 19, 4)
    assert.equal(clock.pending.size, 1)
    // Republished in the meantime: the old track is dead, closed without waiting; the new one is out of reach.
    await h.publish('ana', 'mic')
    await h.media.idle()
    assert.deepEqual(pulledKinds(bia), [])
    assert.equal(clock.pending.size, 0)
})

test('prefetch: a refused prefetch is never reported, and is asked again once the conversation starts', async () => {
    let refuse = true
    const h = harness('cloudflare', {
        async pull(sid, tracks) {
            h.calls.push(['pull', sid, tracks])
            return { requiresImmediateRenegotiation: true, sessionDescription: { type: 'offer', sdp: 'pull-offer' }, tracks: tracks.map((t, i) => refuse && t.trackName.startsWith('camera') ? { sessionId: t.sessionId, trackName: t.trackName, errorCode: 'not_found' } : { mid: `m${h.calls.length}-${i}`, sessionId: t.sessionId, trackName: t.trackName }) }
        },
    })
    await h.enter('ana', 2, 0)
    await h.publish('ana', 'mic'); await h.publish('ana', 'camera')
    const bia = await h.enter('bia', 8, 0)
    await h.media.idle()
    assert.deepEqual(pulledKinds(bia), ['ana|mic'])
    assert.equal(bia.emitted.some(([event]) => event === 'mediaTrackError'), false)
    assert.ok(h.logs.some(line => line.includes('(prefetch)')), h.logs.join('\n'))

    refuse = false
    await h.place('bia', 4, 0)
    await h.media.idle()
    assert.deepEqual(pulledKinds(bia), ['ana|camera', 'ana|mic'])
    assert.equal(pullSteps(bia).at(-1)!.tracks[0].prefetch, false)
})
