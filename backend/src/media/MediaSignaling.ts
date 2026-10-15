import type { Session } from '../session'
import { conversationChannelFor } from '../office/ConversationAuthorization'
import { MAX_TRACKS_PER_REQUEST, type IceServer, type Layer, type RealtimeApi, type Simulcast } from './CloudflareRealtime'
import { ICE_SERVERS_TIMEOUT_MS, MediaLayer, MediaPublish, MediaTrackState, MediaUnpublish, NegotiatedSdp, PULL_RETRY_MS, STUN_ONLY, type MediaConfig, type NegotiateStep } from './protocol'
import { desiredPulls, diffPulls, indexPublications, mediaFingerprint, mediaView, peersFor, type MediaKind, type MediaView, type Publication, type PublicationIndex, type WantedPull } from './subscriptions'

export type MediaClient = { socketId: string, emit(event: string, payload?: unknown): void, ask(event: string, payload: unknown): Promise<any> }
export type MediaAck = { ok: true, answer?: string, config?: MediaConfig } | { ok: false, error: string }
export type MediaSignalingOptions = { provider: 'agora' | 'cloudflare', api: RealtimeApi | null, iceServers: () => Promise<IceServer[]>, getSession: (uid: string) => Session | undefined, schedule?: (run: () => void) => void, log?: (line: string) => void, pullRetryMs?: number }

const AGORA: MediaAck = { ok: false, error: 'O vídeo deste escritório usa a Agora.' }
const INVALID: MediaAck = { ok: false, error: 'Pedido de vídeo inválido.' }
const OUTSIDE: MediaAck = { ok: false, error: 'Fora do escritório.' }
const SPEAKER: MediaAck = { ok: false, error: 'A caixa de som ficou indisponível.' }
const SCREEN: MediaAck = { ok: false, error: 'Aproxime-se de alguém para iniciar uma chamada antes de compartilhar a tela.' }
const CLOUDFLARE: MediaAck = { ok: false, error: 'Não foi possível conectar o vídeo. Tente novamente.' }

type Pulled = { mid: string, fromUid: string, kind: MediaKind, objectId?: string, sessionId: string, trackName: string, simulcast: boolean, layer: Layer }
type Lane = { sessionId: string | null, chain: Promise<void> }
type Connection = {
    uid: string,
    // Changes on every join, reset and restart; sent in the config and on every negotiation step.
    generation: number,
    client: MediaClient,
    session: Session,
    pub: Lane,
    // failed: refused pulls not to be asked again; retried: refused pulls that already had their one retry.
    sub: Lane & { pulled: Map<string, Pulled>, failed: Set<string>, retried: Set<string>, syncing: boolean, again: boolean },
    // 'mic' | 'camera' | 'screen' | 'speaker:<objectId>'
    publications: Map<string, Publication>,
    layers: Map<string, Layer>,
    lastPeers: string | null,
    // After a restart the page tears both connections down and asks for a reset; nothing is negotiated meanwhile.
    awaitingReset: boolean,
}
// syncKey: what decides who pulls what. peersKey: that plus the live flags shown on the tiles.
type Snapshot = { syncKey: string, peersKey: string, view: MediaView, publications: Publication[], index: PublicationIndex, byConversation: Map<string, Publication[]>, speakers: Publication[] }

// The connection was replaced (leave, reset, restart, new join) while an operation was in flight.
class Stale extends Error {}

const noop = () => {}
const simulcastFor = (layer: Layer): Simulcast => ({ preferredRid: layer, priorityOrdering: 'none', ridNotAvailable: 'asciibetical' })
const publicationKey = (kind: MediaKind, objectId?: string) => kind === 'speaker' ? `speaker:${objectId}` : kind
const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error)

// The server side of the Cloudflare Realtime calls: it publishes what each page sends, and pulls into each
// page exactly what the office rules allow (subscriptions.ts), one negotiation at a time per person.
export class MediaSignaling {
    private readonly connections = new Map<string, Connection>()
    // Bumped when the set of publications or connections changes (pubs), or only a live flag (live).
    private readonly revisions = new WeakMap<Session, { pubs: number, live: number }>()
    // Sessions changed since their snapshot was taken: the next snapshot recomputes the fingerprint.
    private readonly dirty = new WeakSet<Session>()
    private readonly snapshots = new WeakMap<Session, Snapshot>()
    private readonly reconciled = new WeakMap<Session, { syncKey: string, peersKey: string }>()
    private readonly scheduled = new Set<Session>()
    private readonly work = new Set<Promise<void>>()
    private readonly schedule: (run: () => void) => void
    private readonly log: (line: string) => void
    private readonly pullRetryMs: number
    private trackCounter = 0
    private generations = 0

    constructor(private readonly options: MediaSignalingOptions) {
        this.schedule = options.schedule ?? (run => { setImmediate(run) })
        this.log = options.log ?? console.error
        this.pullRetryMs = options.pullRetryMs ?? PULL_RETRY_MS
    }

    private get cloudflare() { return this.options.provider === 'cloudflare' && this.options.api !== null }
    private get api() { return this.options.api! }

    async join(uid: string, client: MediaClient): Promise<void> {
        if (!this.cloudflare) return client.emit('mediaConfig', { provider: 'agora' })
        const older = this.connections.get(uid)
        if (older) { this.connections.delete(uid); this.touch(older.session) }
        const iceServers = await this.iceServers()
        const session = this.options.getSession(uid)
        // The visitor left, or another tab took over, while the TURN servers were loading.
        if (!session || session.getPlayer(uid)?.socketId !== client.socketId) return
        // Registered and told in the same tick: no negotiation can reach the page before its config.
        const connection = this.fresh(uid, client, session)
        this.connections.set(uid, connection)
        client.emit('mediaConfig', this.configFor(connection, iceServers, true))
        this.touch(session)
    }

    leave(uid: string, socketId: string): void {
        const connection = this.connections.get(uid)
        if (!connection || connection.client.socketId !== socketId) return
        this.connections.delete(uid)
        this.touch(connection.session)
    }

    async publish(uid: string, socketId: string, raw: unknown): Promise<MediaAck> {
        if (!this.cloudflare) return AGORA
        const connection = this.connectionFor(uid, socketId)
        if (!connection) return OUTSIDE
        if (connection.awaitingReset) return CLOUDFLARE
        const parsed = MediaPublish.safeParse(raw)
        if (!parsed.success) return INVALID
        const { kind, objectId, mid, offer, simulcast } = parsed.data
        const session = connection.session
        if (kind === 'speaker' && !session.featuresFor(uid).speakers.authorize(uid, objectId!, true)) return SPEAKER
        if (kind === 'screen' && !conversationChannelFor(session, uid)) return SCREEN
        const key = publicationKey(kind, objectId)
        try {
            return await this.onLane(connection, 'pub', async () => {
                const sessionId = await this.sendSession(connection)
                // A republish of the same kind: the older track goes first, so nobody keeps pulling a dead one.
                const older = connection.publications.get(key)
                if (older) {
                    try { await this.api.close(sessionId, [older.mid]) } catch (error) { this.log(`media: ${uid} não fechou ${older.trackName}: ${messageOf(error)}`) }
                    this.check(connection)
                    if (connection.publications.get(key) === older) { connection.publications.delete(key); this.touch(session) }
                }
                const trackName = `${kind}${objectId ? `-${objectId}` : ''}-${++this.trackCounter}`
                const response = await this.api.publish(sessionId, offer, [{ location: 'local', mid, trackName }])
                this.check(connection)
                const track = response.tracks?.find(result => result.trackName === trackName) ?? response.tracks?.[0]
                if (track?.errorCode) {
                    this.log(`media: ${uid} não publicou ${trackName}: ${track.errorCode}`)
                    return CLOUDFLARE
                }
                const answer = response.sessionDescription?.sdp
                if (!answer) throw new Error('publish sem SDP de resposta')
                connection.publications.set(key, { uid, kind, ...(objectId ? { objectId } : {}), sessionId, trackName, mid, live: true, simulcast: kind === 'camera' && simulcast })
                this.touch(session)
                return { ok: true, answer } as MediaAck
            })
        } catch (error) {
            this.fail(connection, error)
            return CLOUDFLARE
        }
    }

    async unpublish(uid: string, socketId: string, raw: unknown): Promise<MediaAck> {
        if (!this.cloudflare) return AGORA
        const connection = this.connectionFor(uid, socketId)
        if (!connection) return OUTSIDE
        if (connection.awaitingReset) return CLOUDFLARE
        const parsed = MediaUnpublish.safeParse(raw)
        if (!parsed.success) return INVALID
        const { kind, objectId, mid, offer } = parsed.data
        const key = publicationKey(kind, objectId)
        const isLast = () => connection.publications.size === 1 && connection.publications.get(key)?.mid === mid
        if (connection.publications.get(key)?.mid !== mid || (!offer && !isLast())) return INVALID
        try {
            return await this.onLane(connection, 'pub', async () => {
                const publication = connection.publications.get(key)
                if (!publication || publication.mid !== mid || !connection.pub.sessionId || (!offer && !isLast())) return INVALID
                const response = await this.api.close(connection.pub.sessionId, [mid], offer)
                this.check(connection)
                const answer = response.sessionDescription?.sdp
                if (offer && !answer) throw new Error('close sem SDP de resposta')
                if (connection.publications.get(key) === publication) connection.publications.delete(key)
                this.touch(connection.session)
                return (offer ? { ok: true, answer } : { ok: true }) as MediaAck
            })
        } catch (error) {
            this.fail(connection, error)
            return CLOUDFLARE
        }
    }

    async trackState(uid: string, socketId: string, raw: unknown): Promise<MediaAck> {
        if (!this.cloudflare) return AGORA
        const connection = this.connectionFor(uid, socketId)
        if (!connection) return OUTSIDE
        const parsed = MediaTrackState.safeParse(raw)
        if (!parsed.success) return INVALID
        const publication = connection.publications.get(parsed.data.kind)
        if (publication && publication.live !== parsed.data.live) {
            publication.live = parsed.data.live
            this.touch(connection.session, 'live')
        }
        return { ok: true }
    }

    async layer(uid: string, socketId: string, raw: unknown): Promise<MediaAck> {
        if (!this.cloudflare) return AGORA
        const connection = this.connectionFor(uid, socketId)
        if (!connection) return OUTSIDE
        if (connection.awaitingReset) return CLOUDFLARE
        const parsed = MediaLayer.safeParse(raw)
        if (!parsed.success) return INVALID
        const { fromUid, layer } = parsed.data
        // Bounded by the people in the office: a page cannot grow this map with made-up ids.
        if (!connection.session.getPlayer(fromUid)) return { ok: true }
        connection.layers.set(fromUid, layer)
        const needsUpdate = () => [...connection.sub.pulled.values()].find(pull => pull.fromUid === fromUid && pull.kind === 'camera' && pull.simulcast && pull.layer !== connection.layers.get(fromUid))
        if (needsUpdate()) {
            // Not awaited: the page gets its ack even while a negotiation holds the receive lane.
            this.onLane(connection, 'sub', async () => {
                const pull = needsUpdate()
                const wanted = connection.layers.get(fromUid)
                if (!pull || !wanted || !connection.sub.sessionId) return
                await this.api.update(connection.sub.sessionId, [{ location: 'remote', mid: pull.mid, sessionId: pull.sessionId, trackName: pull.trackName, simulcast: simulcastFor(wanted) }])
                this.check(connection)
                pull.layer = wanted
            }).catch(error => this.fail(connection, error))
        }
        return { ok: true }
    }

    async reset(uid: string, socketId: string, _raw?: unknown): Promise<MediaAck> {
        if (!this.cloudflare) return AGORA
        const connection = this.connectionFor(uid, socketId)
        if (!connection) return OUTSIDE
        const { client, session } = connection
        // The page is tearing its connections down: drop the state now and negotiate nothing until the ack.
        const paused = this.fresh(uid, client, session)
        paused.awaitingReset = true
        this.connections.set(uid, paused)
        this.touch(session)
        const iceServers = await this.iceServers()
        if (this.connections.get(uid) === paused) {
            this.connections.set(uid, this.fresh(uid, client, session))
            this.touch(session)
        }
        const current = this.connections.get(uid)
        return current?.client === client ? { ok: true, config: this.configFor(current, iceServers, true) } : OUTSIDE
    }

    // Coalesced: one reconcile per session per scheduled tick, skipped when nothing that matters to media changed.
    changed(session: Session): void {
        if (!this.cloudflare) return
        this.dirty.add(session)
        if (this.scheduled.has(session)) return
        this.scheduled.add(session)
        this.schedule(() => {
            this.scheduled.delete(session)
            this.reconcile(session)
        })
    }

    async refreshConfig(): Promise<void> {
        if (!this.cloudflare || this.connections.size === 0) return
        const iceServers = await this.iceServers()
        for (const connection of this.connections.values()) connection.client.emit('mediaConfig', this.configFor(connection, iceServers, false))
    }

    // Resolves once nothing is scheduled, queued or waiting for a retry (tests).
    async idle(): Promise<void> {
        while (this.scheduled.size > 0 || this.work.size > 0) {
            await Promise.all([...this.work])
            await new Promise(resolve => setImmediate(resolve))
        }
    }

    private fresh(uid: string, client: MediaClient, session: Session): Connection {
        return {
            uid, generation: ++this.generations, client, session,
            pub: { sessionId: null, chain: Promise.resolve() },
            sub: { sessionId: null, chain: Promise.resolve(), pulled: new Map(), failed: new Set(), retried: new Set(), syncing: false, again: false },
            publications: new Map(), layers: new Map(), lastPeers: null, awaitingReset: false,
        }
    }

    private touch(session: Session, what: 'pubs' | 'live' = 'pubs') {
        const revision = this.revisions.get(session) ?? { pubs: 0, live: 0 }
        revision[what]++
        this.revisions.set(session, revision)
        this.changed(session)
    }

    // Only the socket that joined, while it is still the person's socket in the office.
    private connectionFor(uid: string, socketId: string): Connection | null {
        const connection = this.connections.get(uid)
        if (!connection || connection.client.socketId !== socketId) return null
        const session = this.options.getSession(uid)
        if (session !== connection.session || session.getPlayer(uid)?.socketId !== socketId) return null
        return connection
    }

    private alive(connection: Connection) { return this.connections.get(connection.uid) === connection }
    private check(connection: Connection) { if (!this.alive(connection)) throw new Stale() }

    private configFor(connection: Connection, iceServers: IceServer[], bootstrap: boolean): MediaConfig {
        return { provider: 'cloudflare', iceServers, bootstrap, generation: connection.generation }
    }

    private async iceServers(): Promise<IceServer[]> {
        let timer: NodeJS.Timeout | undefined
        try {
            const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('tempo esgotado')), ICE_SERVERS_TIMEOUT_MS) })
            const iceServers = await Promise.race([this.options.iceServers(), timeout])
            return iceServers.length ? iceServers : STUN_ONLY
        } catch (error) {
            this.log(`Cloudflare TURN indisponível (${messageOf(error)}); usando só STUN.`)
            return STUN_ONLY
        } finally {
            clearTimeout(timer)
        }
    }

    private track(promise: Promise<unknown>) {
        const settled = promise.then(noop, noop)
        this.work.add(settled)
        void settled.then(() => this.work.delete(settled))
    }

    // Mutations of one Cloudflare session run one at a time; the send and receive lanes never wait on each other.
    private onLane<T>(connection: Connection, lane: 'pub' | 'sub', run: () => Promise<T>): Promise<T> {
        const state = connection[lane]
        const result = state.chain.then(() => { this.check(connection); return run() })
        state.chain = result.then(noop, noop)
        this.track(result)
        return result
    }

    private async sendSession(connection: Connection): Promise<string> {
        if (!connection.pub.sessionId) {
            const sessionId = await this.api.newSession()
            this.check(connection)
            connection.pub.sessionId = sessionId
        }
        return connection.pub.sessionId
    }

    private async receiveSession(connection: Connection): Promise<string> {
        if (!connection.sub.sessionId) {
            const sessionId = await this.api.newSession()
            this.check(connection)
            connection.sub.sessionId = sessionId
        }
        return connection.sub.sessionId
    }

    // The people of `session` whose media connection is the socket they are in the office with.
    private active(session: Session): Connection[] {
        const active: Connection[] = []
        for (const uid of session.getPlayerIds()) {
            const connection = this.connections.get(uid)
            if (connection && connection.session === session && session.getPlayer(uid)?.socketId === connection.client.socketId) active.push(connection)
        }
        return active
    }

    // Recomputed only after a change, and rebuilt only when the fingerprint or a revision moved.
    private snapshot(session: Session): Snapshot {
        const cached = this.snapshots.get(session)
        if (cached && !this.dirty.has(session)) return cached
        this.dirty.delete(session)
        const revision = this.revisions.get(session) ?? { pubs: 0, live: 0 }
        const syncKey = `${revision.pubs}\n${mediaFingerprint(session)}`
        const peersKey = `${revision.live}\n${syncKey}`
        if (cached?.peersKey === peersKey) return cached
        let next: Snapshot
        if (cached?.syncKey === syncKey) {
            // Only live flags changed: same view and publications (their flags are updated in place).
            next = { ...cached, peersKey, index: indexPublications(cached.publications) }
        } else {
            const view = mediaView(session)
            const publications = this.active(session).flatMap(connection => [...connection.publications.values()])
            const byConversation = new Map<string, Publication[]>()
            const speakers: Publication[] = []
            for (const publication of publications) {
                if (publication.kind === 'speaker') { speakers.push(publication); continue }
                const conversation = view.get(publication.uid)?.conversation
                if (!conversation) continue
                const list = byConversation.get(conversation)
                if (list) list.push(publication)
                else byConversation.set(conversation, [publication])
            }
            next = { syncKey, peersKey, view, publications, index: indexPublications(publications), byConversation, speakers }
        }
        this.snapshots.set(session, next)
        return next
    }

    // desiredPulls over the only publications that can match: the receiver's conversation and the speakers.
    private wanted(snapshot: Snapshot, uid: string) {
        const conversation = snapshot.view.get(uid)?.conversation
        const candidates = conversation ? snapshot.byConversation.get(conversation) ?? [] : []
        return desiredPulls(snapshot.view, uid, snapshot.speakers.length ? [...candidates, ...snapshot.speakers] : candidates)
    }

    private reconcile(session: Session) {
        const snapshot = this.snapshot(session)
        const previous = this.reconciled.get(session)
        if (previous?.peersKey === snapshot.peersKey) return
        this.reconciled.set(session, { syncKey: snapshot.syncKey, peersKey: snapshot.peersKey })
        const resync = previous?.syncKey !== snapshot.syncKey
        for (const connection of this.active(session)) {
            const peers = peersFor(snapshot.view, connection.uid, snapshot.publications, snapshot.index)
            const serialized = JSON.stringify(peers)
            if (serialized !== connection.lastPeers) {
                connection.lastPeers = serialized
                connection.client.emit('mediaPeers', peers)
            }
            if (resync) this.sync(connection)
        }
    }

    private sync(connection: Connection) {
        if (connection.awaitingReset) return
        const sub = connection.sub
        if (sub.syncing) { sub.again = true; return }
        sub.syncing = true
        this.onLane(connection, 'sub', async () => {
            // `syncing` is cleared in the same tick as the last `again` check: a change arriving after it starts a new sync.
            try {
                do {
                    sub.again = false
                    await this.syncOnce(connection)
                } while (sub.again && this.alive(connection))
            } finally {
                sub.syncing = false
            }
        }).catch(error => this.fail(connection, error))
    }

    private async syncOnce(connection: Connection) {
        const sub = connection.sub
        const wanted = this.wanted(this.snapshot(connection.session), connection.uid)
        for (const key of sub.failed) if (!wanted.has(key)) sub.failed.delete(key)
        for (const key of sub.retried) if (!wanted.has(key)) sub.retried.delete(key)
        const { add, remove } = diffPulls(sub.pulled, wanted, sub.failed)
        // Additions first: walking straight from one group to another never empties the connection on the way,
        // so only a real "nothing left" takes the forced close.
        for (let i = 0; i < add.length; i += MAX_TRACKS_PER_REQUEST) await this.pullTracks(connection, add.slice(i, i + MAX_TRACKS_PER_REQUEST))
        for (let i = 0; i < remove.length; i += MAX_TRACKS_PER_REQUEST) await this.closePulls(connection, remove.slice(i, i + MAX_TRACKS_PER_REQUEST))
    }

    private async ask(connection: Connection, step: NegotiateStep): Promise<any> {
        const reply = await connection.client.ask('mediaNegotiate', step)
        this.check(connection)
        if (!reply || reply.ok !== true) throw new Error(typeof reply?.error === 'string' ? reply.error : 'negociação recusada')
        return reply
    }

    private async closePulls(connection: Connection, keys: string[]) {
        const sub = connection.sub
        const sessionId = sub.sessionId!
        const generation = connection.generation
        const mids = keys.map(key => sub.pulled.get(key)!.mid)
        // Always forced: the page stops those transceivers without an offer and Cloudflare closes them with no SDP.
        // A page-offered renegotiation on this session (which Cloudflare offered so far) leaves it "disconnected"
        // for Cloudflare: media keeps flowing, but every later call on it waits 5 s and fails with 410. Closing the
        // last tracks this way also avoids the max-bundle offer with no BUNDLE group. The next pull offer from
        // Cloudflare renegotiates the stopped m-lines.
        await this.ask(connection, { generation, type: 'close', mids, force: true })
        for (const key of keys) sub.pulled.delete(key)
        await this.api.close(sessionId, mids)
        this.check(connection)
    }

    private async pullTracks(connection: Connection, pulls: WantedPull[]) {
        const sub = connection.sub
        const sessionId = await this.receiveSession(connection)
        const requested = new Map(pulls.map(pull => [pull.key, connection.layers.get(pull.fromUid) ?? 'q' as Layer]))
        const response = await this.api.pull(sessionId, pulls.map(pull => ({ location: 'remote' as const, sessionId: pull.sessionId, trackName: pull.trackName, ...(pull.simulcast ? { simulcast: simulcastFor(requested.get(pull.key)!) } : {}) })))
        this.check(connection)
        const working: { pull: WantedPull, mid: string }[] = []
        let stillWanted: Map<string, WantedPull> | null = null
        for (const pull of pulls) {
            const result = response.tracks?.find(track => track.sessionId === pull.sessionId && track.trackName === pull.trackName)
            if (result && !result.errorCode && result.mid) { sub.retried.delete(pull.key); working.push({ pull, mid: result.mid }); continue }
            sub.failed.add(pull.key)
            if (!sub.retried.has(pull.key)) {
                // It may have raced a fresh publish: one more try before telling the page.
                sub.retried.add(pull.key)
                this.retryLater(connection, pull.key)
                continue
            }
            this.log(`media: ${connection.uid} não recebeu ${pull.key}: ${result?.errorCode ?? 'sem resposta'}`)
            stillWanted ??= this.wanted(this.snapshot(connection.session), connection.uid)
            if (stillWanted.has(pull.key)) connection.client.emit('mediaTrackError', { fromUid: pull.fromUid, kind: pull.kind })
        }
        if (!working.length) return
        if (response.requiresImmediateRenegotiation) {
            const offer = response.sessionDescription?.sdp
            if (!offer) throw new Error('pull sem oferta')
            const tracks = working.map(({ pull, mid }) => ({ mid, fromUid: pull.fromUid, kind: pull.kind, ...(pull.objectId ? { objectId: pull.objectId } : {}) }))
            const reply = await this.ask(connection, { generation: connection.generation, type: 'pull', offer, tracks })
            const answer = NegotiatedSdp.safeParse(reply.answer)
            if (!answer.success) throw new Error('pull sem resposta')
            await this.api.renegotiate(sessionId, answer.data)
            this.check(connection)
        }
        for (const { pull, mid } of working) {
            const { key, fromUid, kind, objectId, sessionId: from, trackName, simulcast } = pull
            sub.pulled.set(key, { mid, fromUid, kind, ...(objectId ? { objectId } : {}), sessionId: from, trackName, simulcast, layer: requested.get(key)! })
        }
        // The page asked for another layer while this pull was negotiating.
        const stale = working.map(({ pull }) => sub.pulled.get(pull.key)!).filter(pull => pull.simulcast && pull.layer !== (connection.layers.get(pull.fromUid) ?? 'q'))
        if (stale.length) {
            await this.api.update(sessionId, stale.map(pull => ({ location: 'remote' as const, mid: pull.mid, sessionId: pull.sessionId, trackName: pull.trackName, simulcast: simulcastFor(connection.layers.get(pull.fromUid) ?? 'q') })))
            this.check(connection)
            for (const pull of stale) pull.layer = connection.layers.get(pull.fromUid) ?? 'q'
        }
    }

    private retryLater(connection: Connection, key: string) {
        this.track(new Promise<void>(resolve => {
            setTimeout(() => {
                resolve()
                if (!this.alive(connection) || !connection.sub.failed.delete(key)) return
                this.sync(connection)
            }, this.pullRetryMs)
        }))
    }

    // Any failure of a person's Cloudflare calls or negotiation: drop their media state and have the page rebuild it.
    private fail(connection: Connection, error: unknown) {
        if (error instanceof Stale || !this.alive(connection)) return
        this.log(`media: reiniciando ${connection.uid}: ${messageOf(error)}`)
        const restarted = this.fresh(connection.uid, connection.client, connection.session)
        restarted.awaitingReset = true
        this.connections.set(connection.uid, restarted)
        connection.client.emit('mediaRestart')
        this.touch(connection.session)
    }
}
