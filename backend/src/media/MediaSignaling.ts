import type { Session } from '../session'
import { conversationChannelFor } from '../office/ConversationAuthorization'
import { MAX_TRACKS_PER_REQUEST, type IceServer, type Layer, type RealtimeApi, type Simulcast } from './CloudflareRealtime'
import { ICE_SERVERS_TIMEOUT_MS, MediaLayer, MediaPublish, MediaTrackState, MediaUnpublish, NegotiatedSdp, STUN_ONLY, type MediaConfig, type NegotiateStep } from './protocol'
import { desiredPulls, diffPulls, mediaView, peersFor, type MediaKind, type MediaView, type Publication, type WantedPull } from './subscriptions'

export type MediaClient = { socketId: string, emit(event: string, payload?: unknown): void, ask(event: string, payload: unknown): Promise<any> }
export type MediaAck = { ok: true, answer?: string, config?: MediaConfig } | { ok: false, error: string }
export type MediaSignalingOptions = { provider: 'agora' | 'cloudflare', api: RealtimeApi | null, iceServers: () => Promise<IceServer[]>, getSession: (uid: string) => Session | undefined, schedule?: (run: () => void) => void, log?: (line: string) => void }

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
    client: MediaClient,
    session: Session,
    pub: Lane,
    sub: Lane & { pulled: Map<string, Pulled>, failed: Set<string>, syncing: boolean, again: boolean },
    // 'mic' | 'camera' | 'screen' | 'speaker:<objectId>'
    publications: Map<string, Publication>,
    layers: Map<string, Layer>,
    lastPeers: string | null,
    // After a restart the page tears both connections down and asks for a reset; nothing is negotiated meanwhile.
    awaitingReset: boolean,
}

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
    private readonly versions = new Map<Session, number>()
    private readonly snapshots = new WeakMap<Session, { version: number, view: MediaView, publications: Publication[] }>()
    private readonly scheduled = new Set<Session>()
    private readonly work = new Set<Promise<void>>()
    private readonly schedule: (run: () => void) => void
    private readonly log: (line: string) => void
    private trackCounter = 0

    constructor(private readonly options: MediaSignalingOptions) {
        this.schedule = options.schedule ?? (run => { setImmediate(run) })
        this.log = options.log ?? console.error
    }

    private get cloudflare() { return this.options.provider === 'cloudflare' && this.options.api !== null }
    private get api() { return this.options.api! }

    async join(uid: string, client: MediaClient): Promise<void> {
        if (!this.cloudflare) return client.emit('mediaConfig', { provider: 'agora' })
        const older = this.connections.get(uid)
        if (older) { this.connections.delete(uid); this.changed(older.session) }
        const config = await this.config(true)
        const session = this.options.getSession(uid)
        // The visitor left, or another tab took over, while the TURN servers were loading.
        if (!session || session.getPlayer(uid)?.socketId !== client.socketId) return
        // Registered and told in the same tick: no negotiation can reach the page before its config.
        this.connections.set(uid, this.fresh(uid, client, session))
        client.emit('mediaConfig', config)
        this.changed(session)
    }

    leave(uid: string, socketId: string): void {
        const connection = this.connections.get(uid)
        if (!connection || connection.client.socketId !== socketId) return
        this.connections.delete(uid)
        this.changed(connection.session)
    }

    async publish(uid: string, socketId: string, raw: unknown): Promise<MediaAck> {
        if (!this.cloudflare) return AGORA
        const connection = this.connectionFor(uid, socketId)
        if (!connection) return OUTSIDE
        const parsed = MediaPublish.safeParse(raw)
        if (!parsed.success) return INVALID
        const { kind, objectId, mid, offer, simulcast } = parsed.data
        const session = connection.session
        if (kind === 'speaker' && !session.featuresFor(uid).speakers.authorize(uid, objectId!, true)) return SPEAKER
        if (kind === 'screen' && !conversationChannelFor(session, uid)) return SCREEN
        try {
            return await this.onLane(connection, 'pub', async () => {
                const sessionId = await this.sendSession(connection)
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
                connection.publications.set(publicationKey(kind, objectId), { uid, kind, ...(objectId ? { objectId } : {}), sessionId, trackName, mid, live: true, simulcast: kind === 'camera' && simulcast })
                this.changed(session)
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
        const parsed = MediaUnpublish.safeParse(raw)
        if (!parsed.success) return INVALID
        const { kind, objectId, mid, offer } = parsed.data
        const key = publicationKey(kind, objectId)
        if (connection.publications.get(key)?.mid !== mid) return INVALID
        try {
            return await this.onLane(connection, 'pub', async () => {
                const publication = connection.publications.get(key)
                if (!publication || publication.mid !== mid || !connection.pub.sessionId) return INVALID
                const response = await this.api.close(connection.pub.sessionId, [mid], offer)
                this.check(connection)
                const answer = response.sessionDescription?.sdp
                if (!answer) throw new Error('close sem SDP de resposta')
                if (connection.publications.get(key) === publication) connection.publications.delete(key)
                this.changed(connection.session)
                return { ok: true, answer } as MediaAck
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
            this.changed(connection.session)
        }
        return { ok: true }
    }

    async layer(uid: string, socketId: string, raw: unknown): Promise<MediaAck> {
        if (!this.cloudflare) return AGORA
        const connection = this.connectionFor(uid, socketId)
        if (!connection) return OUTSIDE
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
        this.changed(session)
        const config = await this.config(true)
        if (this.connections.get(uid) === paused) {
            this.connections.set(uid, this.fresh(uid, client, session))
            this.changed(session)
        }
        return this.connections.get(uid)?.client === client ? { ok: true, config } : OUTSIDE
    }

    // Coalesced: one reconcile per session per scheduled tick.
    changed(session: Session): void {
        if (!this.cloudflare) return
        this.versions.set(session, (this.versions.get(session) ?? 0) + 1)
        if (this.scheduled.has(session)) return
        this.scheduled.add(session)
        this.schedule(() => {
            this.scheduled.delete(session)
            this.reconcile(session)
        })
    }

    async refreshConfig(): Promise<void> {
        if (!this.cloudflare || this.connections.size === 0) return
        const config = await this.config(false)
        for (const connection of this.connections.values()) connection.client.emit('mediaConfig', config)
    }

    // Resolves once nothing is scheduled or queued (tests).
    async idle(): Promise<void> {
        while (this.scheduled.size > 0 || this.work.size > 0) {
            await Promise.all([...this.work])
            await new Promise(resolve => setImmediate(resolve))
        }
    }

    private fresh(uid: string, client: MediaClient, session: Session): Connection {
        return {
            uid, client, session,
            pub: { sessionId: null, chain: Promise.resolve() },
            sub: { sessionId: null, chain: Promise.resolve(), pulled: new Map(), failed: new Set(), syncing: false, again: false },
            publications: new Map(), layers: new Map(), lastPeers: null, awaitingReset: false,
        }
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

    private async config(bootstrap: boolean): Promise<MediaConfig> {
        let timer: NodeJS.Timeout | undefined
        try {
            const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('tempo esgotado')), ICE_SERVERS_TIMEOUT_MS) })
            const iceServers = await Promise.race([this.options.iceServers(), timeout])
            return { provider: 'cloudflare', iceServers: iceServers.length ? iceServers : STUN_ONLY, bootstrap }
        } catch (error) {
            this.log(`Cloudflare TURN indisponível (${messageOf(error)}); usando só STUN.`)
            return { provider: 'cloudflare', iceServers: STUN_ONLY, bootstrap }
        } finally {
            clearTimeout(timer)
        }
    }

    // Mutations of one Cloudflare session run one at a time; the send and receive lanes never wait on each other.
    private onLane<T>(connection: Connection, lane: 'pub' | 'sub', run: () => Promise<T>): Promise<T> {
        const state = connection[lane]
        const result = state.chain.then(() => { this.check(connection); return run() })
        state.chain = result.then(noop, noop)
        const settled = result.then(noop, noop)
        this.work.add(settled)
        void settled.then(() => this.work.delete(settled))
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
        return session.getPlayerIds()
            .map(uid => this.connections.get(uid))
            .filter((connection): connection is Connection => Boolean(connection && connection.session === session && session.getPlayer(connection.uid)?.socketId === connection.client.socketId))
    }

    private snapshot(session: Session) {
        const version = this.versions.get(session) ?? 0
        const cached = this.snapshots.get(session)
        if (cached && cached.version === version) return cached
        const fresh = { version, view: mediaView(session), publications: this.active(session).flatMap(connection => [...connection.publications.values()]) }
        this.snapshots.set(session, fresh)
        return fresh
    }

    private reconcile(session: Session) {
        const { view, publications } = this.snapshot(session)
        for (const connection of this.active(session)) {
            const peers = peersFor(view, connection.uid, publications)
            const serialized = JSON.stringify(peers)
            if (serialized !== connection.lastPeers) {
                connection.lastPeers = serialized
                connection.client.emit('mediaPeers', peers)
            }
            this.sync(connection)
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
                    const { view, publications } = this.snapshot(connection.session)
                    await this.syncOnce(connection, view, publications)
                } while (sub.again && this.alive(connection))
            } finally {
                sub.syncing = false
            }
        }).catch(error => this.fail(connection, error))
    }

    private async syncOnce(connection: Connection, view: MediaView, publications: Publication[]) {
        const sub = connection.sub
        const wanted = desiredPulls(view, connection.uid, publications)
        for (const key of sub.failed) if (!wanted.has(key)) sub.failed.delete(key)
        const { add, remove } = diffPulls(sub.pulled, wanted, sub.failed)
        for (let i = 0; i < remove.length; i += MAX_TRACKS_PER_REQUEST) await this.closePulls(connection, remove.slice(i, i + MAX_TRACKS_PER_REQUEST))
        for (let i = 0; i < add.length; i += MAX_TRACKS_PER_REQUEST) await this.pullTracks(connection, add.slice(i, i + MAX_TRACKS_PER_REQUEST))
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
        const mids = keys.map(key => sub.pulled.get(key)!.mid)
        // Closing every remaining pulled track: a renegotiation offer from a max-bundle page would have no
        // BUNDLE group and fail in the browser, so the page drops them locally and Cloudflare closes them forced.
        if (keys.length === sub.pulled.size) {
            await this.ask(connection, { type: 'close', mids, force: true })
            for (const key of keys) sub.pulled.delete(key)
            await this.api.close(sessionId, mids)
            this.check(connection)
            return
        }
        const reply = await this.ask(connection, { type: 'close', mids })
        const offer = NegotiatedSdp.safeParse(reply.offer)
        if (!offer.success) throw new Error('fechamento sem oferta')
        for (const key of keys) sub.pulled.delete(key)
        const response = await this.api.close(sessionId, mids, offer.data)
        this.check(connection)
        const answer = response.sessionDescription?.sdp
        if (!answer) throw new Error('close sem SDP de resposta')
        await this.ask(connection, { type: 'answer', answer })
    }

    private async pullTracks(connection: Connection, pulls: WantedPull[]) {
        const sub = connection.sub
        const sessionId = await this.receiveSession(connection)
        const requested = new Map(pulls.map(pull => [pull.key, connection.layers.get(pull.fromUid) ?? 'q' as Layer]))
        const response = await this.api.pull(sessionId, pulls.map(pull => ({ location: 'remote' as const, sessionId: pull.sessionId, trackName: pull.trackName, ...(pull.simulcast ? { simulcast: simulcastFor(requested.get(pull.key)!) } : {}) })))
        this.check(connection)
        const working: { pull: WantedPull, mid: string }[] = []
        for (const pull of pulls) {
            const result = response.tracks?.find(track => track.sessionId === pull.sessionId && track.trackName === pull.trackName)
            if (!result || result.errorCode || !result.mid) {
                sub.failed.add(pull.key)
                this.log(`media: ${connection.uid} não recebeu ${pull.key}: ${result?.errorCode ?? 'sem resposta'}`)
                connection.client.emit('mediaTrackError', { fromUid: pull.fromUid, kind: pull.kind })
                continue
            }
            working.push({ pull, mid: result.mid })
        }
        if (!working.length) return
        if (response.requiresImmediateRenegotiation) {
            const offer = response.sessionDescription?.sdp
            if (!offer) throw new Error('pull sem oferta')
            const tracks = working.map(({ pull, mid }) => ({ mid, fromUid: pull.fromUid, kind: pull.kind, ...(pull.objectId ? { objectId: pull.objectId } : {}) }))
            const reply = await this.ask(connection, { type: 'pull', offer, tracks })
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

    // Any failure of a person's Cloudflare calls or negotiation: drop their media state and have the page rebuild it.
    private fail(connection: Connection, error: unknown) {
        if (error instanceof Stale || !this.alive(connection)) return
        this.log(`media: reiniciando ${connection.uid}: ${messageOf(error)}`)
        const restarted = this.fresh(connection.uid, connection.client, connection.session)
        restarted.awaitingReset = true
        this.connections.set(connection.uid, restarted)
        connection.client.emit('mediaRestart')
        this.changed(connection.session)
    }
}
