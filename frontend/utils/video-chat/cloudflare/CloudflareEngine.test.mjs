import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as config from './config.ts'

const tick = async (rounds = 20) => { for (let i = 0; i < rounds; i++) await new Promise(resolve => setImmediate(resolve)) }
// Objects made inside the vm have another Object.prototype; compare their JSON shape.
const plain = value => JSON.parse(JSON.stringify(value))
const transpile = file => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText

function load() {
    const protocol = {}
    vm.runInNewContext(transpile('./protocol.ts'), { exports: protocol })
    const exports = {}
    vm.runInNewContext(transpile('./CloudflareEngine.ts'), {
        exports,
        require: name => {
            if (name === './protocol') return protocol
            if (name === './config') return config
            throw new Error(`Unexpected import: ${name}`)
        },
    })
    return { ...exports, protocol }
}

function fakePc(world) {
    const pc = { role: null, transceivers: [], transceiverReads: 0, connectionState: 'new', listeners: {}, closed: false, configs: [], localDescription: null, rolledBack: 0, offers: 0, failEncodings: world.failEncodings, singleEncoding: world.singleEncoding,
        addEventListener(name, fn) { pc.listeners[name] = fn },
        setState(state) { pc.connectionState = state; pc.listeners.connectionstatechange?.() },
        addTransceiver(track, init = {}) {
            pc.role ??= 'pub'
            if (init.sendEncodings && pc.failEncodings) throw new Error('sendEncodings unsupported')
            const encodings = init.sendEncodings ? (pc.singleEncoding ? [{}] : init.sendEncodings) : [{}]
            const t = { mid: null, init, stopped: false, sender: { track, replaced: [], async replaceTrack(next) { this.replaced.push(next); this.track = next }, getParameters: () => ({ encodings }) }, receiver: { track: null }, stop() { t.stopped = true } }
            pc.transceivers.push(t); return t
        },
        // `transceivers` keeps every transceiver ever made (for the asserts); like browsers, a stopped one leaves
        // getTransceivers() only once a negotiation completes (an answer is applied).
        getTransceivers: () => { pc.transceiverReads++; return pc.transceivers.filter(t => !t.removed) },
        async createOffer() { pc.offers++; return { type: 'offer', sdp: `offer-${++world.sdp}` } },
        async createAnswer() { return { type: 'answer', sdp: `answer-${++world.sdp}` } },
        async setLocalDescription(d) { if (d.type === 'rollback') { pc.rolledBack++; return } pc.transceivers.forEach((t, i) => { t.mid ??= String(i) }); pc.localDescription = d; if (d.type === 'answer') settle() },
        // A pull offer "mids=3,4" adds a receiving transceiver for each mid it does not have yet. As in browsers
        // (JSEP), a mid still held by a stopped transceiver, whose stop was never negotiated, matches that
        // transceiver: the section is rejected and nothing new is received.
        async setRemoteDescription(d) {
            if (d.type === 'offer') pc.role ??= 'sub'
            world.order.push(`${pc.role}:${d.type}`)
            await world.remoteGate?.(pc, d)
            for (const mid of (d.sdp.match(/mids=([\w,]+)/)?.[1] ?? '').split(',').filter(Boolean)) if (!pc.transceivers.some(t => t.mid === mid && !t.removed)) pc.transceivers.push({ mid, stopped: false, receiver: { track: { id: `track-${mid}-${++world.sdp}` } }, stop() { this.stopped = true } })
            if (d.type === 'answer') settle()
        },
        setConfiguration(config) { pc.configs.push(config) },
        // Only with world.dataChannels: the send connection then opens with its data channel first.
        ...(world.dataChannels ? { createDataChannel(label) { pc.role ??= 'pub'; (pc.channels ??= []).push(label); return { label } } } : {}),
        close() { pc.closed = true },
    }
    const settle = () => pc.transceivers.forEach(t => { if (t.stopped) t.removed = true })
    return pc
}

const ICE = [{ urls: 'stun:stun.cloudflare.com:3478' }]
const cfg = (generation = 1, extra = {}) => ({ provider: 'cloudflare', iceServers: ICE, bootstrap: true, generation, ...extra })

function harness(options = {}) {
    const mod = load()
    const world = { sdp: 0, order: [], failEncodings: false, singleEncoding: false, ...options.world }
    const pcs = []
    const created = []
    const timers = new Map()
    let timerId = 0
    let clock = 0
    const events = []
    let generation = 1
    const socket = {
        handlers: new Map(), requests: [],
        replies: { mediaReset: () => ({ ok: true, config: cfg(++generation) }) },
        on(event, handler) { socket.handlers.set(event, handler) },
        off(event, handler) { if (socket.handlers.get(event) === handler) socket.handlers.delete(event) },
        // Like officeSocket(): resolves with an ok reply, rejects with the error of any other.
        async request(event, payload) {
            socket.requests.push([event, payload])
            const reply = await (socket.replies[event] ?? (() => ({ ok: true, answer: 'answer' })))(payload)
            if (!reply?.ok) throw new Error(reply?.error ?? 'recusado')
            return reply
        },
    }
    let engine
    engine = new mod.CloudflareEngine({
        socket,
        createPeerConnection: config => { const pc = fakePc(world); pc.createdWith = config; pcs.push(pc); created.push(config); return pc },
        setTimeout: (callback, ms) => { timers.set(++timerId, { callback, ms }); return timerId },
        clearTimeout: id => timers.delete(id),
        onEvent: event => events.push({ ...plain(event), at: { subAnswer: engine?.mapping && pcs.find(pc => pc.role === 'sub' && !pc.closed)?.localDescription?.sdp } }),
        now: () => clock,
    })
    const fire = ms => { for (const [id, timer] of [...timers]) if (timer.ms === ms) { timers.delete(id); timer.callback() } }
    const step = (payload, gen = 1) => new Promise(resolve => socket.handlers.get('mediaNegotiate')({ generation: gen, ...payload }, resolve))
    const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
    const names = () => events.map(event => event.type)
    const sent = event => socket.requests.filter(([name]) => name === event).map(([, payload]) => plain(payload))
    return { mod, engine, world, pcs, created, timers, events, socket, fire, step, deferred, names, sent, advance: ms => { clock += ms }, pub: () => pcs.find(pc => pc.role === 'pub' && !pc.closed), sub: () => pcs.find(pc => pc.role === 'sub' && !pc.closed) }
}

const pullAnaAndDj = { type: 'pull', offer: 'mids=3,4', tracks: [{ mid: '3', fromUid: 'ana', kind: 'camera' }, { mid: '4', fromUid: 'dj', kind: 'speaker', objectId: 'lounge' }] }

test('publish: simulcast camera, single layer mic, speaker with its object', async () => {
    const h = harness()
    await h.engine.start(cfg())
    assert.equal(h.engine.connected, true)
    const camera = { id: 'cam' }
    await h.engine.publish('camera', camera)
    const pub = h.pub()
    assert.equal(h.engine.pub, pub)
    assert.deepEqual(plain(pub.createdWith), { iceServers: ICE, bundlePolicy: 'max-bundle' })
    const [cam] = pub.transceivers
    assert.equal(cam.init.direction, 'sendonly')
    assert.deepEqual(plain(cam.init.sendEncodings.map(e => [e.rid, e.scaleResolutionDownBy])), [['f', 1], ['h', 2], ['q', 4]])
    assert.equal(cam.sender.track, camera)
    assert.deepEqual(h.sent('mediaPublish'), [{ kind: 'camera', mid: '0', offer: 'offer-1', simulcast: true }])
    assert.deepEqual(h.world.order, ['pub:answer'])
    await h.engine.publish('mic', { id: 'mic' })
    assert.equal(pub.transceivers[1].init.sendEncodings, undefined)
    assert.equal(pub.transceivers[1].init.direction, 'sendonly')
    assert.deepEqual(h.sent('mediaPublish')[1], { kind: 'mic', mid: '1', offer: 'offer-2', simulcast: false })
    await h.engine.publish('speaker', { id: 'music' }, 'lounge')
    assert.deepEqual(h.sent('mediaPublish')[2], { kind: 'speaker', objectId: 'lounge', mid: '2', offer: 'offer-3', simulcast: false })
    assert.equal(h.pcs.length, 1)
})

test('simulcast fallback: no sendEncodings, a single encoding, and a refused publish', async () => {
    const failing = harness({ world: { failEncodings: true } })
    await failing.engine.start(cfg())
    await failing.engine.publish('camera', { id: 'cam' })
    const [only] = failing.pub().transceivers
    assert.equal(failing.pub().transceivers.length, 1)
    assert.equal(only.init.sendEncodings, undefined)
    assert.deepEqual(failing.sent('mediaPublish'), [{ kind: 'camera', mid: '0', offer: 'offer-1', simulcast: false }])

    const single = harness({ world: { singleEncoding: true } })
    await single.engine.start(cfg())
    await single.engine.publish('camera', { id: 'cam' })
    assert.equal(single.sent('mediaPublish')[0].simulcast, false)

    const refused = harness()
    await refused.engine.start(cfg())
    refused.socket.replies.mediaPublish = () => ({ ok: false, error: 'Não foi possível conectar o vídeo. Tente novamente.' })
    await assert.rejects(refused.engine.publish('camera', { id: 'cam' }), /Não foi possível conectar o vídeo/)
    const pub = refused.pub()
    assert.equal(pub.rolledBack, 1)
    assert.equal(pub.transceivers[0].stopped, true)
    // Forgotten: pausing it later asks nothing.
    await refused.engine.pause('camera')
    assert.deepEqual(refused.sent('mediaTrackState'), [])
    refused.socket.replies.mediaPublish = () => ({ ok: true, answer: 'answer' })
    await refused.engine.publish('camera', { id: 'cam' })
    assert.equal(pub.transceivers.length, 2)
    assert.equal(refused.sent('mediaPublish')[1].mid, '1')
})

test('pull: the answer, the mapping by mid, receivers and speakers', async () => {
    const h = harness()
    await h.engine.start(cfg())
    const ack = await h.step(pullAnaAndDj)
    assert.equal(ack.ok, true)
    assert.match(ack.answer, /^answer-/)
    const sub = h.sub()
    assert.deepEqual(plain(sub.createdWith), { iceServers: ICE, bundlePolicy: 'max-bundle' })
    assert.equal(h.engine.pub, null)
    const ana = sub.transceivers.find(t => t.mid === '3')
    assert.equal(h.engine.remoteTrack('ana', 'camera'), ana.receiver.track)
    assert.equal(h.engine.receiver('ana', 'camera'), ana.receiver)
    assert.equal(h.engine.remoteTrack(null, 'camera'), ana.receiver.track)
    assert.equal(h.engine.remoteTrack('ana', 'mic'), null)
    assert.equal(h.engine.remoteTrack('bia', 'camera'), null)
    assert.deepEqual([...h.engine.remoteSpeakers()], ['lounge'])
    assert.notEqual(h.engine.remoteTrack(null, 'speaker', 'lounge'), null)
    assert.equal(h.engine.remoteTrack(null, 'speaker', 'hall'), null)
    assert.deepEqual(plain(h.engine.mapping.get('4')), { mid: '4', fromUid: 'dj', kind: 'speaker', objectId: 'lounge' })
    // The tracks event comes after the answer was set.
    const tracks = h.events.filter(event => event.type === 'tracks')
    assert.equal(tracks.length, 1)
    assert.equal(tracks[0].at.subAnswer, ack.answer)
})

test('mid reuse: a mid closed and pulled again points to the new person', async () => {
    const h = harness()
    await h.engine.start(cfg())
    await h.step({ type: 'pull', offer: 'mids=k', tracks: [{ mid: 'k', fromUid: 'keeper', kind: 'mic' }] })
    await h.step({ type: 'pull', offer: 'mids=3', tracks: [{ mid: '3', fromUid: 'ana', kind: 'camera' }] })
    const anaTrack = h.engine.remoteTrack('ana', 'camera')
    const closing = await h.step({ type: 'close', mids: ['3'] })
    assert.equal(closing.ok, true)
    assert.match(closing.offer, /^offer-/)
    assert.equal(h.sub().transceivers.find(t => t.mid === '3').stopped, true)
    assert.equal(h.engine.remoteTrack('ana', 'camera'), null)
    assert.deepEqual(plain(await h.step({ type: 'answer', answer: 'answer-close' })), { ok: true })
    await h.step({ type: 'pull', offer: 'mids=3', tracks: [{ mid: '3', fromUid: 'bia', kind: 'camera' }] })
    assert.equal(h.engine.remoteTrack('ana', 'camera'), null)
    const biaTrack = h.engine.remoteTrack('bia', 'camera')
    assert.ok(biaTrack)
    assert.notEqual(biaTrack, anaTrack)
    assert.equal(biaTrack, h.sub().transceivers.find(t => t.mid === '3' && !t.stopped).receiver.track)
    await h.step({ type: 'close', mids: ['3'] })
    await h.step({ type: 'answer', answer: 'a' })
    for (let i = 0; i < 50; i++) {
        const mid = String(10 + (i % 3))
        await h.step({ type: 'pull', offer: `mids=${mid}`, tracks: [{ mid, fromUid: `p${i}`, kind: 'camera' }] })
        assert.equal(h.engine.mapping.size, 2)
        assert.equal(h.engine.remoteTrack(`p${i}`, 'camera'), h.sub().transceivers.find(t => t.mid === mid && !t.stopped).receiver.track)
        if (i > 0) assert.equal(h.engine.remoteTrack(`p${i - 1}`, 'camera'), null)
        assert.equal((await h.step({ type: 'close', mids: [mid] })).ok, true)
        assert.equal((await h.step({ type: 'answer', answer: 'a' })).ok, true)
    }
    assert.equal(h.engine.mapping.size, 1)
    assert.ok(h.engine.remoteTrack('keeper', 'mic'))
})

test('forced close: stops locally with no offer, and the next pull applies on fresh transceivers', async () => {
    const h = harness()
    await h.engine.start(cfg())
    await h.step(pullAnaAndDj)
    const sub = h.sub()
    const offers = sub.offers
    const before = h.events.length
    const ack = await h.step({ type: 'close', mids: ['3', '4'], force: true })
    assert.deepEqual(plain(ack), { ok: true })
    assert.equal(sub.offers, offers)
    assert.deepEqual(sub.transceivers.map(t => t.stopped), [true, true])
    assert.equal(h.engine.mapping.size, 0)
    assert.equal(h.engine.remoteTrack('ana', 'camera'), null)
    assert.deepEqual([...h.engine.remoteSpeakers()], [])
    assert.deepEqual(h.events.slice(before).map(event => event.type), ['tracks'])
    // The next pull with new mids applies on the same connection; its answer completes the stop of 3 and 4.
    const next = await h.step({ type: 'pull', offer: 'mids=5', tracks: [{ mid: '5', fromUid: 'caio', kind: 'camera' }] })
    assert.equal(next.ok, true)
    assert.equal(h.sub(), sub)
    assert.equal(h.engine.remoteTrack('ana', 'camera'), null)
    assert.equal(h.engine.remoteTrack('caio', 'camera'), sub.transceivers[2].receiver.track)
    assert.equal(h.engine.mapping.size, 1)
    // A forced close, then a pull that offers the stopped mid again before any renegotiation: the browser rejects
    // that section, so nothing would play. The step is refused (the server restarts this page) instead of acked.
    assert.deepEqual(plain(await h.step({ type: 'close', mids: ['5'], force: true })), { ok: true })
    const reused = await h.step({ type: 'pull', offer: 'mids=5,6', tracks: [{ mid: '5', fromUid: 'bia', kind: 'mic' }, { mid: '6', fromUid: 'dani', kind: 'camera' }] })
    assert.deepEqual(plain(reused), { ok: false, error: `${h.mod.PULL_UNMATCHED_ERROR}: 5` })
    assert.equal(h.mod.PULL_UNMATCHED_ERROR, 'pull sem transceptor de recepção')
    assert.equal(h.engine.remoteTrack('bia', 'mic'), null)
    assert.equal(h.engine.remoteTrack('caio', 'camera'), null)
    assert.deepEqual([...h.engine.mapping.keys()], ['6'])
    assert.equal(h.events.at(-1).type, 'tracks')
})

test('lookups: the newest entry wins, and they read an index built once per step', async () => {
    const h = harness()
    await h.engine.start(cfg())
    await h.step({ type: 'pull', offer: 'mids=3', tracks: [{ mid: '3', fromUid: 'ana', kind: 'camera' }] })
    // Ana republished: her new camera is pulled before the older one is closed.
    await h.step({ type: 'pull', offer: 'mids=5', tracks: [{ mid: '5', fromUid: 'ana', kind: 'camera' }] })
    const sub = h.sub()
    const newest = sub.transceivers.find(t => t.mid === '5').receiver
    assert.equal(h.engine.remoteTrack('ana', 'camera'), newest.track)
    assert.equal(h.engine.receiver('ana', 'camera'), newest)
    assert.equal(h.engine.remoteTrack(null, 'camera'), newest.track)
    const reads = sub.transceiverReads
    for (let i = 0; i < 100; i++) { h.engine.remoteTrack('ana', 'camera'); h.engine.receiver(null, 'camera'); h.engine.remoteSpeakers() }
    assert.equal(sub.transceiverReads, reads)
    await h.step({ type: 'close', mids: ['3'] })
    await h.step({ type: 'answer', answer: 'a' })
    assert.equal(h.engine.remoteTrack('ana', 'camera'), newest.track)
})

test('publish and pull overlap on separate connections; steps run one at a time', async () => {
    const h = harness()
    await h.engine.start(cfg())
    const slow = h.deferred()
    h.socket.replies.mediaPublish = () => slow.promise
    let published = false
    const publishing = h.engine.publish('camera', { id: 'cam' }).then(() => { published = true })
    await tick()
    const ack = await h.step(pullAnaAndDj)
    assert.equal(ack.ok, true)
    assert.equal(published, false)
    assert.deepEqual(h.world.order, ['sub:offer'])
    slow.resolve({ ok: true, answer: 'answer' })
    await publishing
    assert.deepEqual(h.world.order, ['sub:offer', 'pub:answer'])

    // Back to back: the second step is applied only after the first was acked.
    const order = h.world.order
    order.length = 0
    const first = h.step({ type: 'pull', offer: 'mids=6', tracks: [{ mid: '6', fromUid: 'bia', kind: 'mic' }] }).then(reply => { order.push('ack:first'); return reply })
    const second = h.step({ type: 'pull', offer: 'mids=7', tracks: [{ mid: '7', fromUid: 'caio', kind: 'mic' }] }).then(reply => { order.push('ack:second'); return reply })
    assert.equal((await first).ok, true)
    assert.equal((await second).ok, true)
    assert.deepEqual(order, ['sub:offer', 'ack:first', 'sub:offer', 'ack:second'])
})

test('send operations run one at a time, and a republish uses a new transceiver', async () => {
    const h = harness()
    await h.engine.start(cfg())
    const slow = h.deferred()
    h.socket.replies.mediaPublish = () => slow.promise
    const camera = h.engine.publish('camera', { id: 'cam' })
    const mic = h.engine.publish('mic', { id: 'mic' })
    const pausing = h.engine.pause('camera')
    await tick()
    assert.equal(h.pub().transceivers.length, 1)
    assert.equal(h.socket.requests.length, 1)
    h.socket.replies.mediaPublish = () => ({ ok: true, answer: 'answer' })
    slow.resolve({ ok: true, answer: 'answer' })
    await Promise.all([camera, mic, pausing])
    assert.deepEqual(h.socket.requests.map(([name, payload]) => `${name}:${payload.kind}`), ['mediaPublish:camera', 'mediaPublish:mic', 'mediaTrackState:camera'])

    // Republishing a kind that is already out: the older transceiver is stopped, the new one gets a new mid.
    await h.engine.publish('screen', { id: 'screen-1' })
    const pub = h.pub()
    const first = pub.transceivers[2]
    await h.engine.publish('screen', { id: 'screen-2' })
    assert.equal(first.stopped, true)
    assert.equal(pub.transceivers.length, 4)
    assert.equal(pub.transceivers[3].sender.track.id, 'screen-2')
    assert.deepEqual(h.sent('mediaPublish').slice(2).map(payload => payload.mid), ['2', '3'])
    // And a paused camera published again is a fresh publication too.
    await h.engine.publish('camera', { id: 'cam-2' })
    assert.equal(pub.transceivers[0].stopped, true)
    assert.equal(h.sent('mediaPublish').at(-1).mid, '4')
    assert.equal(h.sent('mediaPublish').at(-1).simulcast, true)
})

test('pause and resume within 25 s only swap the track', async () => {
    const h = harness()
    await h.engine.start(cfg())
    await h.engine.publish('camera', { id: 'cam' })
    await h.engine.publish('mic', { id: 'mic' })
    const [cam, mic] = h.pub().transceivers
    await h.engine.pause('camera')
    assert.deepEqual(cam.sender.replaced, [null])
    assert.deepEqual(h.sent('mediaTrackState'), [{ kind: 'camera', live: false }])
    h.advance(10_000)
    const next = { id: 'cam-2' }
    await h.engine.resume('camera', next)
    assert.deepEqual(cam.sender.replaced, [null, next])
    assert.deepEqual(h.sent('mediaTrackState')[1], { kind: 'camera', live: true })
    assert.equal(h.sent('mediaPublish').length, 2)
    // The idle timer was cleared.
    h.fire(25_000)
    await tick()
    assert.deepEqual(h.sent('mediaUnpublish'), [])
    // A device switch while the mic is paused waits for the resume.
    await h.engine.pause('mic')
    const other = { id: 'mic-2' }
    await h.engine.replaceTrack('mic', other)
    assert.deepEqual(mic.sender.replaced, [null])
    await h.engine.replaceTrack('camera', other)
    assert.deepEqual(cam.sender.replaced, [null, next, other])
    // A refused track state is ignored.
    h.socket.replies.mediaTrackState = () => ({ ok: false, error: 'x' })
    await h.engine.resume('mic', other)
    assert.deepEqual(mic.sender.replaced, [null, other])
})

test('idle GC: a paused track is unpublished after 25 s, also when timers were throttled', async () => {
    const h = harness()
    await h.engine.start(cfg())
    await h.engine.publish('camera', { id: 'cam' })
    await h.engine.publish('mic', { id: 'mic' })
    const pub = h.pub()
    await h.engine.pause('camera')
    h.fire(25_000)
    await tick()
    assert.deepEqual(h.sent('mediaUnpublish'), [{ kind: 'camera', mid: '0', offer: 'offer-3' }])
    assert.equal(pub.transceivers[0].stopped, true)
    assert.deepEqual(h.world.order, ['pub:answer', 'pub:answer', 'pub:answer'])
    await h.engine.resume('camera', { id: 'cam-2' })
    assert.equal(h.sent('mediaPublish').length, 3)
    assert.deepEqual(h.sent('mediaPublish')[2], { kind: 'camera', mid: '2', offer: 'offer-4', simulcast: true })

    // Throttled timers: the timer never ran, the clock says 40 s.
    const t = harness()
    await t.engine.start(cfg())
    await t.engine.publish('camera', { id: 'cam' })
    await t.engine.publish('mic', { id: 'mic' })
    await t.engine.pause('camera')
    t.advance(40_000)
    await t.engine.resume('camera', { id: 'cam-2' })
    assert.deepEqual(t.socket.requests.map(([name]) => name), ['mediaPublish', 'mediaPublish', 'mediaTrackState', 'mediaUnpublish', 'mediaPublish'])
    assert.deepEqual(t.sent('mediaUnpublish'), [{ kind: 'camera', mid: '0', offer: 'offer-3' }])
    assert.equal(t.pub().transceivers[0].stopped, true)
    assert.equal(t.sent('mediaPublish')[2].mid, '2')
    // The timer that fires late finds a live camera and does nothing.
    t.fire(25_000)
    await tick()
    assert.equal(t.sent('mediaUnpublish').length, 1)
})

test('unpublishing the last published track sends no offer', async () => {
    const h = harness()
    await h.engine.start(cfg())
    await h.engine.publish('camera', { id: 'cam' })
    const pub = h.pub()
    await h.engine.pause('camera')
    h.socket.replies.mediaUnpublish = payload => ({ ok: true, ...(payload.offer ? { answer: 'answer' } : {}) })
    h.fire(25_000)
    await tick()
    assert.deepEqual(h.sent('mediaUnpublish'), [{ kind: 'camera', mid: '0' }])
    assert.equal(pub.transceivers[0].stopped, true)
    assert.equal(pub.offers, 1)
    assert.deepEqual(h.world.order, ['pub:answer'])
    // The next publish renegotiates on the same connection with a new transceiver.
    await h.engine.publish('mic', { id: 'mic' })
    assert.equal(h.pub(), pub)
    assert.deepEqual(h.sent('mediaPublish')[1], { kind: 'mic', mid: '1', offer: 'offer-2', simulcast: false })
    // With two out, the first goes with an offer and the last without.
    await h.engine.publish('speaker', { id: 'music' }, 'lounge')
    await h.engine.unpublish('mic')
    await h.engine.unpublish('speaker', 'lounge')
    assert.deepEqual(h.sent('mediaUnpublish').slice(1), [{ kind: 'mic', mid: '1', offer: 'offer-4' }, { kind: 'speaker', objectId: 'lounge', mid: '2' }])
    // A refused unpublish rejects.
    await h.engine.publish('mic', { id: 'mic' })
    h.socket.replies.mediaUnpublish = () => ({ ok: false, error: 'Pedido de vídeo inválido.' })
    await assert.rejects(h.engine.unpublish('mic'), /Pedido de vídeo inválido/)
})

test('generation: steps of another generation, or during a reset, are stale', async () => {
    const h = harness()
    await h.engine.start(cfg(1))
    assert.deepEqual(plain(await h.step(pullAnaAndDj, 0)), { ok: false, error: 'stale' })
    assert.deepEqual(plain(await h.step(pullAnaAndDj, 2)), { ok: false, error: 'stale' })
    assert.deepEqual(h.world.order, [])
    // A refresh never changes the generation.
    await h.engine.start(cfg(1, { bootstrap: false }))
    assert.equal((await h.step(pullAnaAndDj, 1)).ok, true)

    // A restart: the old generation is stale while the reset is pending; a step of the new one waits for it.
    const reset = h.deferred()
    h.socket.replies.mediaReset = () => reset.promise
    h.socket.handlers.get('mediaRestart')()
    await tick()
    assert.deepEqual(plain(await h.step({ type: 'pull', offer: 'mids=8', tracks: [{ mid: '8', fromUid: 'bia', kind: 'mic' }] }, 1)), { ok: false, error: 'stale' })
    let early = null
    const waiting = h.step({ type: 'pull', offer: 'mids=8', tracks: [{ mid: '8', fromUid: 'bia', kind: 'mic' }] }, 5).then(reply => { early = reply })
    await tick()
    assert.equal(early, null)
    reset.resolve({ ok: true, config: cfg(5) })
    await waiting
    assert.equal(early.ok, true)
    assert.ok(h.engine.remoteTrack('bia', 'mic'))
    assert.deepEqual(plain(await h.step(pullAnaAndDj, 1)), { ok: false, error: 'stale' })
    assert.deepEqual(plain(await h.step({ generation: 5, type: 'bogus' }, 5)).ok, false)
})

test('reconnect: a failed connection resets, republishes the live tracks and says so', async () => {
    const h = harness()
    await h.engine.start(cfg(1))
    await h.engine.publish('mic', { id: 'mic' })
    await h.step(pullAnaAndDj)
    const [pub, sub] = [h.pub(), h.sub()]
    const reset = h.deferred()
    h.socket.replies.mediaReset = () => reset.promise
    sub.setState('failed')
    await tick()
    assert.equal(pub.closed, true)
    assert.equal(sub.closed, true)
    assert.equal(h.engine.mapping.size, 0)
    assert.equal(h.engine.remoteTrack('ana', 'camera'), null)
    assert.equal(h.events.at(-1).type, 'tracks')
    assert.deepEqual(h.sent('mediaReset'), [{}])
    // Once at a time.
    pub.setState('failed')
    h.socket.handlers.get('mediaRestart')()
    await tick()
    assert.equal(h.sent('mediaReset').length, 1)
    assert.equal(h.names().includes('reconnect-notice'), false)
    h.fire(3_000)
    assert.equal(h.names().at(-1), 'reconnect-notice')
    reset.resolve({ ok: true, config: cfg(2) })
    await tick()
    const fresh = h.pub()
    assert.ok(fresh && fresh !== pub)
    assert.deepEqual(h.sent('mediaPublish').map(payload => payload.kind), ['mic', 'mic'])
    assert.equal(fresh.transceivers[0].sender.track.id, 'mic')
    assert.equal(h.names().at(-1), 'reconnected')
    assert.equal((await h.step(pullAnaAndDj, 2)).ok, true)

    // Quick enough: no notice.
    const quick = harness()
    await quick.engine.start(cfg(1))
    await quick.engine.publish('mic', { id: 'mic' })
    quick.pub().setState('failed')
    await tick()
    quick.fire(3_000)
    assert.deepEqual(quick.names(), ['reconnected'])
    assert.equal(quick.sent('mediaPublish').length, 2)
})

test('reconnect: disconnected for 5 s, the server restart, and a failing reset retried', async () => {
    const h = harness()
    await h.engine.start(cfg(1))
    await h.engine.publish('mic', { id: 'mic' })
    const pub = h.pub()
    pub.setState('disconnected')
    pub.setState('connected')
    h.fire(5_000)
    await tick()
    assert.deepEqual(h.sent('mediaReset'), [])
    pub.setState('disconnected')
    h.fire(5_000)
    await tick()
    assert.equal(h.sent('mediaReset').length, 1)
    assert.equal(pub.closed, true)
    assert.equal(h.names().at(-1), 'reconnected')

    const s = harness()
    await s.engine.start(cfg(1))
    await s.engine.publish('mic', { id: 'mic' })
    const first = s.pub()
    let refusals = 1
    s.socket.replies.mediaReset = () => refusals-- > 0 ? { ok: false, error: 'Fora do escritório.' } : { ok: true, config: cfg(3) }
    s.socket.handlers.get('mediaRestart')()
    await tick()
    assert.equal(first.closed, true)
    assert.equal(s.sent('mediaReset').length, 1)
    assert.equal(s.engine.pub, null)
    s.fire(2_000)
    await tick()
    assert.equal(s.sent('mediaReset').length, 2)
    assert.ok(s.pub())
    assert.equal(s.sent('mediaPublish').length, 2)
    assert.equal(s.names().at(-1), 'reconnected')
    // A malformed config counts as a failure too.
    s.socket.replies.mediaReset = () => ({ ok: true, config: { provider: 'cloudflare' } })
    s.socket.handlers.get('mediaRestart')()
    await tick()
    assert.equal(s.sent('mediaReset').length, 3)
    assert.equal(s.engine.pub, null)
    assert.ok([...s.timers.values()].some(timer => timer.ms === 2_000))
})

test('suspend: drops the connections; the next bootstrap republishes live tracks only', async () => {
    const h = harness()
    await h.engine.start(cfg(1))
    await h.engine.publish('mic', { id: 'mic' })
    await h.engine.publish('camera', { id: 'cam' })
    await h.engine.pause('camera')
    await h.step(pullAnaAndDj)
    const [pub, sub] = [h.pub(), h.sub()]
    h.engine.suspend()
    assert.equal(h.engine.connected, false)
    assert.equal(pub.closed, true)
    assert.equal(sub.closed, true)
    assert.equal(h.engine.mapping.size, 0)
    assert.deepEqual(plain(await h.step(pullAnaAndDj, 1)), { ok: false, error: 'stale' })
    // Nothing goes out while suspended, a refresh changes nothing, and a share started now waits.
    const requests = h.socket.requests.length
    await h.engine.publish('screen', { id: 'screen' })
    await h.engine.start(cfg(1, { bootstrap: false }))
    h.socket.handlers.get('mediaRestart')()
    await tick()
    assert.equal(h.socket.requests.length, requests)
    assert.equal(h.engine.connected, false)
    h.fire(3_000)
    assert.equal(h.names().at(-1), 'reconnect-notice')
    await h.engine.start(cfg(2))
    assert.equal(h.engine.connected, true)
    assert.deepEqual(h.sent('mediaPublish').slice(2).map(payload => payload.kind), ['mic', 'screen'])
    assert.equal(h.pub().transceivers.length, 2)
    assert.equal(h.names().at(-1), 'reconnected')
    // The camera was dropped: resuming it publishes it again.
    await h.engine.resume('camera', { id: 'cam-2' })
    assert.equal(h.sent('mediaPublish').at(-1).kind, 'camera')

    // A reset reply that lands after a suspend is ignored.
    const r = harness()
    await r.engine.start(cfg(1))
    await r.engine.publish('mic', { id: 'mic' })
    const reset = r.deferred()
    r.socket.replies.mediaReset = () => reset.promise
    r.socket.handlers.get('mediaRestart')()
    await tick()
    r.engine.suspend()
    reset.resolve({ ok: true, config: cfg(2) })
    await tick()
    assert.equal(r.engine.pub, null)
    assert.equal(r.sent('mediaPublish').length, 1)
    assert.equal(r.names().includes('reconnected'), false)
})

test('refresh: new ICE servers on both connections, nothing created', async () => {
    const h = harness()
    await h.engine.start(cfg(1))
    await h.engine.publish('mic', { id: 'mic' })
    await h.step(pullAnaAndDj)
    const fresh = [{ urls: 'turn:turn.cloudflare.com:3478', username: 'u', credential: 'c' }]
    await h.engine.start({ provider: 'cloudflare', iceServers: fresh, bootstrap: false, generation: 1 })
    assert.equal(h.pcs.length, 2)
    for (const pc of h.pcs) assert.deepEqual(plain(pc.configs), [{ iceServers: fresh, bundlePolicy: 'max-bundle' }])
    assert.equal(h.sent('mediaPublish').length, 1)
    // A reset after that brings its own config.
    h.pcs.forEach(pc => pc.setState('failed'))
    await tick()
    assert.deepEqual(plain(h.pub().createdWith), { iceServers: ICE, bundlePolicy: 'max-bundle' })
})

test('stop: unsubscribes, refuses later steps, and forwarded the server events before', async () => {
    const h = harness()
    assert.deepEqual([...h.socket.handlers.keys()].sort(), ['mediaNegotiate', 'mediaPeers', 'mediaRestart', 'mediaTrackError'])
    await h.engine.start(cfg(1))
    await h.engine.publish('mic', { id: 'mic' })
    await h.engine.pause('mic')
    const peers = { self: 'me', conversation: 'c', peers: [{ uid: 'ana', mic: true, camera: false, screen: false }], ownScreen: false }
    h.socket.handlers.get('mediaPeers')(peers)
    h.socket.handlers.get('mediaTrackError')({ fromUid: 'ana', kind: 'camera' })
    const negotiate = h.socket.handlers.get('mediaNegotiate')
    const pub = h.pub()
    h.engine.stop()
    assert.equal(h.socket.handlers.size, 0)
    assert.equal(pub.closed, true)
    assert.equal(h.engine.connected, false)
    assert.equal(h.timers.size, 0)
    const ack = await new Promise(resolve => negotiate({ generation: 1, ...pullAnaAndDj }, resolve))
    assert.equal(ack.ok, false)
    const forwarded = h.events.filter(event => event.type !== 'tracks').map(({ at, ...event }) => event)
    assert.deepEqual(forwarded, [{ type: 'peers', peers }, { type: 'track-error', fromUid: 'ana', kind: 'camera' }])
    // Stopped for good.
    await h.engine.start(cfg(2))
    assert.equal(h.engine.connected, false)
    assert.equal(h.pcs.length, 1)
})

test('a republish refused after a reconnect is reported, and the others still go out', async () => {
    const h = harness()
    await h.engine.start(cfg(1))
    await h.engine.publish('mic', { id: 'mic' })
    await h.engine.publish('screen', { id: 'screen' })
    h.engine.suspend()
    h.socket.replies.mediaPublish = payload => payload.kind === 'screen' ? { ok: false, error: 'Aproxime-se de alguém para compartilhar a tela.' } : { ok: true, answer: 'answer' }
    await h.engine.start(cfg(2))
    assert.deepEqual(h.sent('mediaPublish').slice(2).map(payload => payload.kind), ['mic', 'screen'])
    const failed = h.events.filter(event => event.type === 'publish-failed').map(({ at, ...event }) => event)
    assert.deepEqual(failed, [{ type: 'publish-failed', kind: 'screen', error: 'Aproxime-se de alguém para compartilhar a tela.' }])
    assert.equal(h.names().at(-1), 'reconnected')
    // Forgotten: unpublishing it asks nothing, and the mic is the last track out.
    await h.engine.unpublish('screen')
    assert.deepEqual(h.sent('mediaUnpublish'), [])
    await h.engine.unpublish('mic')
    assert.deepEqual(h.sent('mediaUnpublish'), [{ kind: 'mic', mid: '0' }])
    // A speaker carries its object.
    await h.engine.publish('speaker', { id: 'music' }, 'lounge')
    h.engine.suspend()
    h.socket.replies.mediaPublish = () => ({ ok: false, error: 'x' })
    await h.engine.start(cfg(3))
    assert.deepEqual(h.events.filter(event => event.type === 'publish-failed').map(({ at, ...event }) => event).at(-1), { type: 'publish-failed', kind: 'speaker', objectId: 'lounge', error: 'x' })
})

test('a publish queued before a reconnect is not published twice', async () => {
    const h = harness()
    await h.engine.start(cfg(1))
    const slow = h.deferred()
    h.socket.replies.mediaPublish = () => slow.promise
    const camera = h.engine.publish('camera', { id: 'cam' })
    await tick()
    const mic = h.engine.publish('mic', { id: 'mic' })
    h.engine.suspend()
    h.socket.replies.mediaPublish = () => ({ ok: true, answer: 'answer' })
    const starting = h.engine.start(cfg(2))
    slow.resolve({ ok: true, answer: 'answer' })
    await Promise.all([camera, mic, starting])
    assert.deepEqual(h.sent('mediaPublish').map(payload => payload.kind), ['camera', 'mic', 'camera'])
    assert.equal(h.pub().transceivers.length, 2)
})

test('a republish stops the older transceiver only once the server took the new one', async () => {
    const h = harness()
    await h.engine.start(cfg(1))
    await h.engine.publish('screen', { id: 'screen-1' })
    const pub = h.pub()
    const [first] = pub.transceivers
    h.socket.replies.mediaPublish = () => ({ ok: false, error: 'Aproxime-se de alguém para compartilhar a tela.' })
    await assert.rejects(h.engine.publish('screen', { id: 'screen-2' }), /Aproxime-se/)
    assert.equal(first.stopped, false)
    assert.equal(pub.transceivers[1].stopped, true)
    // Still out: unpublishing sends its mid, as the last track, with no offer.
    await h.engine.unpublish('screen')
    assert.deepEqual(h.sent('mediaUnpublish'), [{ kind: 'screen', mid: '0' }])
    assert.equal(first.stopped, true)

    h.socket.replies.mediaPublish = () => ({ ok: true, answer: 'answer' })
    await h.engine.publish('screen', { id: 'screen-3' })
    const older = pub.transceivers[2]
    let olderStoppedAtRequest = null
    h.socket.replies.mediaPublish = () => { olderStoppedAtRequest = older.stopped; return { ok: true, answer: 'answer' } }
    await h.engine.publish('screen', { id: 'screen-4' })
    assert.equal(olderStoppedAtRequest, false)
    assert.equal(older.stopped, true)
    // A refused republish of a paused camera keeps it paused, with its idle timer.
    h.socket.replies.mediaPublish = () => ({ ok: true, answer: 'answer' })
    await h.engine.publish('camera', { id: 'cam' })
    await h.engine.pause('camera')
    h.socket.replies.mediaPublish = () => ({ ok: false, error: 'x' })
    await assert.rejects(h.engine.publish('camera', { id: 'cam-2' }), /x/)
    h.socket.replies.mediaUnpublish = () => ({ ok: true, answer: 'answer' })
    h.fire(25_000)
    await tick()
    assert.equal(h.sent('mediaUnpublish').at(-1).kind, 'camera')
})

test('a failed reset acks the parked steps stale at once', async () => {
    const h = harness()
    await h.engine.start(cfg(1))
    const reset = h.deferred()
    h.socket.replies.mediaReset = () => reset.promise
    h.socket.handlers.get('mediaRestart')()
    await tick()
    let parked = null
    h.step({ type: 'pull', offer: 'mids=8', tracks: [{ mid: '8', fromUid: 'bia', kind: 'mic' }] }, 5).then(reply => { parked = reply })
    await tick()
    assert.equal(parked, null)
    reset.resolve({ ok: false, error: 'Fora do escritório.' })
    await tick()
    assert.deepEqual(plain(parked), { ok: false, error: 'stale' })
    assert.deepEqual(plain(await h.step(pullAnaAndDj, 1)), { ok: false, error: 'stale' })
    // The retry still runs.
    h.socket.replies.mediaReset = () => ({ ok: true, config: cfg(6) })
    h.fire(2_000)
    await tick()
    assert.equal((await h.step(pullAnaAndDj, 6)).ok, true)
})

test('exports the timing constants of the plan', () => {
    const { IDLE_UNPUBLISH_MS, NOTICE_DELAY_MS, RECONNECT_GRACE_MS, RESTART_RETRY_MS } = load()
    assert.deepEqual([IDLE_UNPUBLISH_MS, NOTICE_DELAY_MS, RECONNECT_GRACE_MS, RESTART_RETRY_MS], [25_000, 3_000, 5_000, 2_000])
})

test('the send connection negotiates its data channel first, then every unpublish renegotiates, the last one too', async () => {
    const h = harness({ world: { dataChannels: true } })
    await h.engine.start(cfg())
    await h.engine.publish('camera', { id: 'cam' })
    const pub = h.pub()
    assert.deepEqual(pub.channels, ['anchor'])
    assert.deepEqual(h.socket.requests.map(([event]) => event), ['mediaOpen', 'mediaPublish'])
    assert.deepEqual(h.sent('mediaOpen'), [{ offer: 'offer-1' }])
    assert.deepEqual(h.sent('mediaPublish'), [{ kind: 'camera', mid: '0', offer: 'offer-2', simulcast: true }])
    assert.deepEqual(h.world.order, ['pub:answer', 'pub:answer'])
    await h.engine.publish('mic', { id: 'mic' })
    assert.equal(h.sent('mediaOpen').length, 1, 'opened once per connection')
    await h.engine.unpublish('camera')
    await h.engine.unpublish('mic')
    // With the data channel first the BUNDLE group never empties: the last track goes out with an offer as well.
    assert.deepEqual(h.sent('mediaUnpublish').map(payload => [payload.kind, typeof payload.offer]), [['camera', 'string'], ['mic', 'string']])
    await h.engine.publish('mic', { id: 'mic2' })
    assert.equal(h.sent('mediaOpen').length, 1)
    assert.equal(h.pcs.filter(pc => pc.role === 'pub').length, 1)
})

test('a refused open closes the half-open send connection and the next publish opens a new one', async () => {
    const h = harness({ world: { dataChannels: true } })
    await h.engine.start(cfg())
    h.socket.replies.mediaOpen = () => ({ ok: false, error: 'Não foi possível conectar o vídeo. Tente novamente.' })
    await assert.rejects(h.engine.publish('camera', { id: 'cam' }), /Não foi possível conectar/)
    const first = h.pcs.find(pc => pc.role === 'pub')
    assert.equal(first.closed, true)
    assert.equal(first.transceivers.length, 0, 'no track was added to the half-open connection')
    assert.equal(h.sent('mediaPublish').length, 0)
    delete h.socket.replies.mediaOpen
    await h.engine.publish('camera', { id: 'cam' })
    const second = h.pub()
    assert.notEqual(second, first)
    assert.deepEqual(second.channels, ['anchor'])
    assert.equal(h.sent('mediaOpen').length, 2)
    assert.equal(h.sent('mediaPublish').length, 1)
})

test('a reconnect opens the new send connection again before republishing', async () => {
    const h = harness({ world: { dataChannels: true } })
    await h.engine.start(cfg())
    await h.engine.publish('mic', { id: 'mic' })
    await h.engine.start(cfg(2))
    assert.deepEqual(h.socket.requests.map(([event]) => event), ['mediaOpen', 'mediaPublish', 'mediaOpen', 'mediaPublish'])
    assert.equal(h.pcs.filter(pc => pc.role === 'pub' && !pc.closed).length, 1)
})
