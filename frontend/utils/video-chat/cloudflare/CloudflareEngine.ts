import { parseMediaConfig } from './config'
import { SIMULCAST_ENCODINGS, type CloudflareMediaConfig, type MediaKind, type NegotiateReply, type NegotiateStep, type PeersSnapshot, type RemoteEntry, type SignalingSocket } from './protocol'

// A paused mic or camera sends no packets; Cloudflare collects such a track after 30 s, so it is unpublished first.
export const IDLE_UNPUBLISH_MS = 25_000
// "Reconectando o vídeo..." shows only when reconnecting takes longer than this.
export const NOTICE_DELAY_MS = 3_000
// A connection `disconnected` for this long is rebuilt; most network blips recover by themselves before.
export const RECONNECT_GRACE_MS = 5_000
export const RESTART_RETRY_MS = 2_000
// While off, the camera sends the placeholder (a black frame a second) at most this fast per layer, instead of
// nothing: its Cloudflare track and the connection's bandwidth estimate stay alive (with no video at all, Chrome's
// estimate falls to about 80 kbps in 25 s, as Cloudflare gives no feedback on audio) and turning it on is immediate.
export const PLACEHOLDER_BITRATE = 30_000
// Turning the camera on, the server hears "on" once a few real frames went out (or after this wait), so no tile
// shows a black frame.
export const RESUME_FRAMES = 3
export const RESUME_WAIT_MS = 400

export type EngineEvent =
    | { type: 'peers', peers: PeersSnapshot }
    | { type: 'tracks' }
    | { type: 'track-error', fromUid: string, kind: MediaKind }
    | { type: 'reconnect-notice' }
    | { type: 'reconnected' }
    // A track the page believed out could not be published again after a reconnect (the server refused it, e.g. a
    // screen outside a conversation). The publication is gone: the UI turns that toggle off and may tell the person.
    | { type: 'publish-failed', kind: MediaKind, objectId?: string, error: string }

export type EngineOptions = {
    socket: SignalingSocket
    createPeerConnection: (config: RTCConfiguration) => RTCPeerConnection
    setTimeout: (callback: () => void, ms: number) => unknown
    clearTimeout: (timer: unknown) => void
    onEvent: (event: EngineEvent) => void
    now?: () => number
    // The camera's placeholder while off (see PLACEHOLDER_BITRATE), made once per engine. Without it, a camera turned
    // off is paused and unpublished after 25 s, like the mic.
    createPlaceholder?: () => MediaStreamTrack | null
}

export interface MediaEngine {
    readonly connected: boolean
    readonly mapping: ReadonlyMap<string, RemoteEntry>     // mid of the receive connection -> whose track it is
    readonly pub: RTCPeerConnection | null
    start(config: CloudflareMediaConfig): Promise<void>
    suspend(): void
    stop(): void
    publish(kind: MediaKind, track: MediaStreamTrack, objectId?: string): Promise<void>
    unpublish(kind: MediaKind, objectId?: string): Promise<void>
    pause(kind: 'mic' | 'camera'): Promise<void>
    resume(kind: 'mic' | 'camera', track: MediaStreamTrack): Promise<void>
    replaceTrack(kind: 'mic' | 'camera', track: MediaStreamTrack): Promise<void>
    remoteTrack(fromUid: string | null, kind: MediaKind, objectId?: string): MediaStreamTrack | null
    receiver(fromUid: string | null, kind: MediaKind, objectId?: string): RTCRtpReceiver | null
    remoteSpeakers(): string[]
}

// One local track sent to Cloudflare. `transceiver` and `mid` are null while it is not negotiated on the current
// send connection (suspended, restarting, or published before the first config): `start` publishes it then.
type Publication = {
    kind: MediaKind
    objectId?: string
    track: MediaStreamTrack
    transceiver: RTCRtpTransceiver | null
    mid: string | null
    live: boolean
    pausedAt: number
    idleTimer: unknown
    // Off and sending the placeholder: the encoding limits to put back when it is turned on.
    held: { maxBitrate?: number, maxFramerate?: number }[] | null
}

// Thrown when the connections were rebuilt (or the engine stopped) while some work awaited: it ends quietly.
class StaleWork {}

const KINDS: readonly string[] = ['mic', 'camera', 'screen', 'speaker']
const CONNECT_ERROR = 'Não foi possível conectar o vídeo. Tente novamente.'
const INVALID_STEP = 'Passo de vídeo inválido.'
// The ack error of a pull with a mid that has no live receiving transceiver (followed by the mids). Like any
// `ok: false` reply, it makes the server restart this page.
export const PULL_UNMATCHED_ERROR = 'pull sem transceptor de recepção'
const stale = (): NegotiateReply => ({ ok: false, error: 'stale' })
const keyOf = (kind: MediaKind, objectId?: string) => kind === 'speaker' ? `speaker:${objectId}` : kind
const messageOf = (error: unknown) => typeof (error as { message?: unknown })?.message === 'string' ? (error as { message: string }).message : String(error)
// `stopped` is gone from the spec but still set by some browsers; a stopped transceiver has direction 'stopped'.
const isStopped = (transceiver: RTCRtpTransceiver) => (transceiver as { stopped?: boolean }).stopped === true || transceiver.direction === 'stopped' || transceiver.currentDirection === 'stopped'

function validStep(raw: unknown): raw is NegotiateStep {
    const step = raw as Partial<Record<string, unknown>> | null
    if (!step || typeof step.generation !== 'number') return false
    if (step.type === 'pull') return typeof step.offer === 'string' && Array.isArray(step.tracks) && step.tracks.every(track => {
        const entry = track as Partial<RemoteEntry> | null
        return typeof entry?.mid === 'string' && typeof entry.fromUid === 'string' && KINDS.includes(entry.kind as string) && (entry.objectId === undefined || typeof entry.objectId === 'string')
    })
    if (step.type === 'close') return Array.isArray(step.mids) && step.mids.every(mid => typeof mid === 'string')
    if (step.type === 'answer') return typeof step.answer === 'string'
    return false
}

// Cloudflare Realtime from the page's side. Two peer connections: `pub` sends this page's tracks, negotiated by the
// page one operation at a time; `sub` receives, and only the server starts negotiations on it (`mediaNegotiate`).
export class CloudflareEngine implements MediaEngine {
    private readonly options: EngineOptions
    private readonly now: () => number
    private config: CloudflareMediaConfig | null = null
    // The server's media state for this page; steps of any other generation are stale.
    private serverGeneration = -1
    private running = false
    private stopped = false
    private suspended = false
    private restarting = false
    // Set by suspend and restart: the next bootstrap start says `reconnected`.
    private interrupted = false
    // Bumped whenever the connections are torn down; work started on older connections ends quietly.
    private epoch = 0
    // Bumped to cancel a reset loop (start, suspend, stop).
    private restartRun = 0
    private sendPc: RTCPeerConnection | null = null
    // The send connection whose data channel is negotiated (openSend).
    private anchoredPc: RTCPeerConnection | null = null
    private receivePc: RTCPeerConnection | null = null
    private readonly entries = new Map<string, RemoteEntry>()
    private readonly receiving = new Map<string, RTCRtpTransceiver>()
    private readonly publications = new Map<string, Publication>()
    private sendQueue: Promise<unknown> = Promise.resolve()
    private receiveQueue: Promise<unknown> = Promise.resolve()
    private noticeTimer: unknown = null
    private readonly graceTimers = new Map<RTCPeerConnection, unknown>()
    private readonly sleepers = new Set<() => void>()
    private generationWaiters: (() => void)[] = []
    private readonly handlers: [string, (...args: any[]) => void][]

    constructor(options: EngineOptions) {
        this.options = options
        this.now = options.now ?? Date.now
        this.handlers = [
            ['mediaNegotiate', (step: unknown, ack: unknown) => this.onNegotiate(step, ack)],
            ['mediaPeers', (peers: unknown) => { if (peers && typeof peers === 'object') this.emit({ type: 'peers', peers: peers as PeersSnapshot }) }],
            ['mediaTrackError', (raw: unknown) => {
                const error = raw as { fromUid?: unknown, kind?: unknown } | null
                if (typeof error?.fromUid === 'string' && KINDS.includes(error.kind as string)) this.emit({ type: 'track-error', fromUid: error.fromUid, kind: error.kind as MediaKind })
            }],
            ['mediaRestart', () => { void this.restart() }],
        ]
        for (const [event, handler] of this.handlers) options.socket.on(event, handler)
    }

    get connected(): boolean { return this.running && !this.suspended }
    get mapping(): ReadonlyMap<string, RemoteEntry> { return this.entries }
    get pub(): RTCPeerConnection | null { return this.sendPc }

    // Negotiating is allowed: started, not suspended, and not waiting for a reset.
    private get ready(): boolean { return this.running && !this.suspended && !this.restarting && this.config !== null }

    async start(config: CloudflareMediaConfig): Promise<void> {
        if (this.stopped) return
        if (!config.bootstrap && this.running) {
            // The six-hourly refresh: new ICE servers only, same generation, same connections.
            this.config = { ...(this.config ?? config), iceServers: config.iceServers }
            if (this.suspended || this.restarting) return
            for (const pc of [this.sendPc, this.receivePc]) if (pc) try { pc.setConfiguration(this.rtcConfig()) } catch { /* the next connection uses them */ }
            return
        }
        const resumed = this.interrupted
        this.restartRun++
        this.restarting = false
        this.teardown()
        this.running = true
        this.suspended = false
        this.interrupted = false
        this.config = config
        this.setGeneration(config.generation)
        this.clearNotice()
        // The server holds nothing for this page now: paused tracks are dropped, live ones published again.
        for (const [key, publication] of [...this.publications]) if (!publication.live) { this.clearIdle(publication); this.publications.delete(key) }
        const epoch = this.epoch
        await this.enqueueSend(async () => {
            for (const [key, publication] of [...this.publications]) {
                if (epoch !== this.epoch) return
                // Gone, paused, or already published on these connections by an operation queued before this one.
                if (this.publications.get(key) !== publication || !publication.live || publication.transceiver) continue
                const { kind, track, objectId } = publication
                try { await this.doPublish(key, kind, track, objectId) } catch (error) {
                    if (epoch === this.epoch) this.emit({ type: 'publish-failed', kind, ...(objectId ? { objectId } : {}), error: messageOf(error) })
                }
            }
        })
        if (resumed && epoch === this.epoch) this.emit({ type: 'reconnected' })
    }

    suspend(): void {
        if (!this.running || this.suspended) return
        this.restartRun++
        this.restarting = false
        this.teardown()
        this.suspended = true
        this.interrupted = true
        this.wakeSleepers()
        this.releaseWaiters()
        this.armNotice()
    }

    stop(): void {
        if (this.stopped) return
        this.restartRun++
        this.teardown()
        this.stopped = true
        this.running = false
        this.suspended = false
        this.restarting = false
        this.clearNotice()
        for (const publication of this.publications.values()) this.clearIdle(publication)
        this.publications.clear()
        this.placeholder?.stop()
        this.placeholder = null
        this.wakeSleepers()
        this.releaseWaiters()
        for (const [event, handler] of this.handlers) this.options.socket.off(event, handler)
    }

    publish(kind: MediaKind, track: MediaStreamTrack, objectId?: string): Promise<void> {
        return this.enqueueSend(() => this.doPublish(keyOf(kind, objectId), kind, track, objectId))
    }

    unpublish(kind: MediaKind, objectId?: string): Promise<void> {
        return this.enqueueSend(() => this.doUnpublish(keyOf(kind, objectId)))
    }

    pause(kind: 'mic' | 'camera'): Promise<void> {
        return this.enqueueSend(async () => {
            const publication = this.publications.get(kind)
            if (!publication || !publication.live) return
            publication.live = false
            publication.pausedAt = this.now()
            const transceiver = publication.transceiver
            if (!transceiver || !this.ready) return
            const epoch = this.epoch
            const placeholder = kind === 'camera' ? this.placeholderTrack() : null
            if (placeholder) {
                // Told first: every tile shows the avatar before a black frame can arrive.
                await this.socket.request('mediaTrackState', { kind, live: false }).catch(() => {})
                if (epoch !== this.epoch || this.publications.get(kind) !== publication || publication.live) return
                publication.held = await this.hold(transceiver.sender, placeholder)
                return
            }
            this.armIdle(kind, publication)
            await transceiver.sender.replaceTrack(null)
            if (epoch !== this.epoch) return
            await this.socket.request('mediaTrackState', { kind, live: false }).catch(() => {})
        })
    }

    resume(kind: 'mic' | 'camera', track: MediaStreamTrack): Promise<void> {
        return this.enqueueSend(async () => {
            const publication = this.publications.get(kind)
            if (!publication || (this.ready && !publication.transceiver)) return this.doPublish(kind, kind, track)
            if (!this.ready) {
                this.clearIdle(publication)
                publication.track = track
                publication.live = true
                return
            }
            const held = publication.held
            if (held && !publication.live && publication.transceiver) {
                publication.held = null
                publication.track = track
                publication.live = true
                const epoch = this.epoch
                const sender = publication.transceiver.sender
                await sender.replaceTrack(track)
                await this.release(sender, held)
                await this.framesOut(sender, epoch)
                if (epoch !== this.epoch || !publication.live) return
                await this.socket.request('mediaTrackState', { kind, live: true }).catch(() => {})
                return
            }
            // Timers of a background tab may never have fired: past the idle limit Cloudflare dropped the track.
            if (!publication.live && this.now() - publication.pausedAt >= IDLE_UNPUBLISH_MS) {
                try { await this.doUnpublish(kind) } catch { /* the republish closes the older track on the server */ }
                return this.doPublish(kind, kind, track)
            }
            this.clearIdle(publication)
            const wasLive = publication.live
            publication.track = track
            publication.live = true
            const epoch = this.epoch
            await publication.transceiver!.sender.replaceTrack(track)
            if (wasLive || epoch !== this.epoch) return
            await this.socket.request('mediaTrackState', { kind, live: true }).catch(() => {})
        })
    }

    // A device switch. While paused only the stored track changes; `resume` sends it.
    replaceTrack(kind: 'mic' | 'camera', track: MediaStreamTrack): Promise<void> {
        return this.enqueueSend(async () => {
            const publication = this.publications.get(kind)
            if (!publication) return
            publication.track = track
            if (publication.live && publication.transceiver) await publication.transceiver.sender.replaceTrack(track)
        })
    }

    remoteTrack(fromUid: string | null, kind: MediaKind, objectId?: string): MediaStreamTrack | null {
        return this.transceiverFor(fromUid, kind, objectId)?.receiver.track ?? null
    }

    receiver(fromUid: string | null, kind: MediaKind, objectId?: string): RTCRtpReceiver | null {
        return this.transceiverFor(fromUid, kind, objectId)?.receiver ?? null
    }

    remoteSpeakers(): string[] {
        const speakers = new Set<string>()
        for (const entry of this.entries.values()) if (entry.kind === 'speaker' && entry.objectId && this.receiving.has(entry.mid)) speakers.add(entry.objectId)
        return [...speakers]
    }

    private get socket(): SignalingSocket { return this.options.socket }

    private emit(event: EngineEvent) {
        try { this.options.onEvent(event) } catch { /* a page handler never breaks the media state */ }
    }

    private rtcConfig(): RTCConfiguration {
        return { iceServers: this.config!.iceServers as RTCIceServer[], bundlePolicy: 'max-bundle' }
    }

    private connection(role: 'send' | 'receive'): RTCPeerConnection {
        const existing = role === 'send' ? this.sendPc : this.receivePc
        if (existing) return existing
        const pc = this.options.createPeerConnection(this.rtcConfig())
        const epoch = this.epoch
        pc.addEventListener('connectionstatechange', () => this.onConnectionState(pc, epoch))
        if (role === 'send') this.sendPc = pc
        else this.receivePc = pc
        return pc
    }

    private onConnectionState(pc: RTCPeerConnection, epoch: number) {
        if (epoch !== this.epoch || (pc !== this.sendPc && pc !== this.receivePc)) return
        const state = pc.connectionState
        if (state === 'failed') return void this.restart()
        if (state === 'disconnected') {
            if (this.graceTimers.has(pc)) return
            this.graceTimers.set(pc, this.options.setTimeout(() => {
                this.graceTimers.delete(pc)
                if (epoch === this.epoch && pc.connectionState !== 'connected') void this.restart()
            }, RECONNECT_GRACE_MS))
            return
        }
        if (state === 'connected' && this.graceTimers.has(pc)) {
            this.options.clearTimeout(this.graceTimers.get(pc))
            this.graceTimers.delete(pc)
        }
    }

    // Closes both connections and forgets what was received. Publications are kept, without their transceivers.
    private teardown() {
        this.epoch++
        for (const pc of [this.sendPc, this.receivePc]) if (pc) try { pc.close() } catch { /* already closed */ }
        this.sendPc = null
        this.anchoredPc = null
        this.receivePc = null
        this.receiving.clear()
        for (const timer of this.graceTimers.values()) this.options.clearTimeout(timer)
        this.graceTimers.clear()
        for (const publication of this.publications.values()) { publication.transceiver = null; publication.mid = null }
        if (this.entries.size) {
            this.entries.clear()
            this.emit({ type: 'tracks' })
        }
    }

    // A connection failed, or the server lost this page's state: ask for a reset until one works.
    private async restart(): Promise<void> {
        if (!this.running || this.suspended || this.restarting) return
        const run = ++this.restartRun
        this.restarting = true
        this.interrupted = true
        this.teardown()
        this.armNotice()
        while (run === this.restartRun) {
            try {
                const reply = await this.socket.request<{ config?: unknown }>('mediaReset', {})
                if (run !== this.restartRun) return
                const config = parseMediaConfig(reply.config)
                if (config?.provider !== 'cloudflare' || !config.bootstrap) throw new Error(CONNECT_ERROR)
                await this.start(config)
                return
            } catch {
                if (run !== this.restartRun) return
                // Steps parked for the reset's generation are acked stale now, so the receive queue moves on.
                this.releaseWaiters()
                await this.sleep(RESTART_RETRY_MS)
            }
        }
    }

    private setGeneration(generation: number) {
        this.serverGeneration = generation
        this.releaseWaiters()
    }

    private releaseWaiters() {
        const waiters = this.generationWaiters
        this.generationWaiters = []
        for (const wake of waiters) wake()
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => {
            let timer: unknown = null
            const wake = () => {
                this.sleepers.delete(wake)
                this.options.clearTimeout(timer)
                resolve()
            }
            this.sleepers.add(wake)
            timer = this.options.setTimeout(wake, ms)
        })
    }

    private wakeSleepers() {
        for (const wake of [...this.sleepers]) wake()
    }

    private armNotice() {
        if (this.noticeTimer !== null) return
        this.noticeTimer = this.options.setTimeout(() => {
            this.noticeTimer = null
            this.emit({ type: 'reconnect-notice' })
        }, NOTICE_DELAY_MS)
    }

    private clearNotice() {
        if (this.noticeTimer === null) return
        this.options.clearTimeout(this.noticeTimer)
        this.noticeTimer = null
    }

    private placeholder: MediaStreamTrack | null = null
    private placeholderTrack(): MediaStreamTrack | null {
        if (this.placeholder?.readyState === 'ended') this.placeholder = null
        if (!this.placeholder) try { this.placeholder = this.options.createPlaceholder?.() ?? null } catch { this.placeholder = null }
        return this.placeholder
    }

    // The placeholder at one frame a second and a few kbps per layer; returns the limits it replaced.
    private async hold(sender: RTCRtpSender, placeholder: MediaStreamTrack): Promise<{ maxBitrate?: number, maxFramerate?: number }[]> {
        const parameters = sender.getParameters()
        const saved = (parameters.encodings ?? []).map(({ maxBitrate, maxFramerate }) => ({ maxBitrate, maxFramerate }))
        for (const encoding of parameters.encodings ?? []) { encoding.maxBitrate = PLACEHOLDER_BITRATE; encoding.maxFramerate = 1 }
        try { await sender.setParameters(parameters) } catch { /* sent at the camera's limits */ }
        await sender.replaceTrack(placeholder)
        return saved
    }

    private async release(sender: RTCRtpSender, held: { maxBitrate?: number, maxFramerate?: number }[]): Promise<void> {
        const parameters = sender.getParameters()
        ;(parameters.encodings ?? []).forEach((encoding, i) => {
            const saved = held[i] ?? {}
            if (saved.maxBitrate === undefined) delete encoding.maxBitrate
            else encoding.maxBitrate = saved.maxBitrate
            if (saved.maxFramerate === undefined) delete encoding.maxFramerate
            else encoding.maxFramerate = saved.maxFramerate
        })
        try { await sender.setParameters(parameters) } catch { /* the placeholder limits stay */ }
    }

    // Waits until some layer sent RESUME_FRAMES real frames, at most RESUME_WAIT_MS.
    private async framesOut(sender: RTCRtpSender, epoch: number): Promise<void> {
        if (typeof sender.getStats !== 'function') return
        const frames = async () => {
            const counts = new Map<number, number>()
            ;(await sender.getStats()).forEach((stat: { type: string, ssrc?: number, framesEncoded?: number }) => { if (stat.type === 'outbound-rtp' && stat.ssrc !== undefined) counts.set(stat.ssrc, stat.framesEncoded ?? 0) })
            return counts
        }
        try {
            const start = await frames()
            const deadline = this.now() + RESUME_WAIT_MS
            while (epoch === this.epoch && this.now() < deadline) {
                await this.sleep(50)
                for (const [ssrc, count] of await frames()) if (count - (start.get(ssrc) ?? 0) >= RESUME_FRAMES) return
            }
        } catch { /* told now */ }
    }

    private armIdle(key: string, publication: Publication) {
        this.clearIdle(publication)
        publication.idleTimer = this.options.setTimeout(() => {
            publication.idleTimer = null
            this.enqueueSend(async () => {
                if (this.publications.get(key) === publication && !publication.live) await this.doUnpublish(key)
            }).catch(() => {})
        }, IDLE_UNPUBLISH_MS)
    }

    private clearIdle(publication: Publication) {
        if (publication.idleTimer === null) return
        this.options.clearTimeout(publication.idleTimer)
        publication.idleTimer = null
    }

    private check(epoch: number) {
        if (epoch !== this.epoch || !this.running) throw new StaleWork()
    }

    // Send-side work runs one operation at a time, in call order.
    private enqueueSend<T>(work: () => Promise<T>): Promise<T> {
        const result = this.sendQueue.then(work)
        this.sendQueue = result.catch(() => {})
        return result
    }

    private addSender(pc: RTCPeerConnection, kind: MediaKind, track: MediaStreamTrack): RTCRtpTransceiver {
        if (kind === 'camera') {
            // Some browsers refuse simulcast encodings: the camera then goes out as one layer.
            try { return pc.addTransceiver(track, { direction: 'sendonly', sendEncodings: SIMULCAST_ENCODINGS.map(encoding => ({ ...encoding })) }) } catch { /* below */ }
        }
        return pc.addTransceiver(track, { direction: 'sendonly' })
    }

    // Always a new transceiver. A republish keeps the older one until the server accepted the new track (the server
    // closes the older track itself, and refuses some republishes before touching it), then stops it.
    private async doPublish(key: string, kind: MediaKind, track: MediaStreamTrack, objectId?: string): Promise<void> {
        if (this.stopped) return
        const older = this.publications.get(key)
        if (older) this.clearIdle(older)
        const publication: Publication = { kind, ...(objectId ? { objectId } : {}), track, transceiver: null, mid: null, live: true, pausedAt: 0, idleTimer: null, held: null }
        this.publications.set(key, publication)
        if (!this.ready) {
            older?.transceiver?.stop()
            return
        }
        const epoch = this.epoch
        const pc = this.connection('send')
        let transceiver: RTCRtpTransceiver | null = null
        let offered = false
        try {
            await this.openSend(pc, epoch)
            transceiver = this.addSender(pc, kind, track)
            publication.transceiver = transceiver
            const offer = await pc.createOffer()
            this.check(epoch)
            await pc.setLocalDescription(offer)
            offered = true
            this.check(epoch)
            const mid = transceiver.mid
            if (!mid) throw new Error(CONNECT_ERROR)
            const simulcast = kind === 'camera' && (transceiver.sender.getParameters().encodings?.length ?? 0) >= 2
            const reply = await this.socket.request<{ answer?: string }>('mediaPublish', { kind, ...(objectId ? { objectId } : {}), mid, offer: pc.localDescription?.sdp ?? offer.sdp, simulcast })
            this.check(epoch)
            if (!reply.answer) throw new Error(CONNECT_ERROR)
            await pc.setRemoteDescription({ type: 'answer', sdp: reply.answer })
            this.check(epoch)
            publication.mid = mid
            older?.transceiver?.stop()
        } catch (error) {
            if (error instanceof StaleWork || epoch !== this.epoch || !this.running) return
            if (offered) try { await pc.setLocalDescription({ type: 'rollback' }) } catch { /* nothing to undo */ }
            transceiver?.stop()
            if (this.publications.get(key) === publication) {
                // A refused republish leaves the older track out, as the server still has it.
                if (older?.transceiver && older.mid) {
                    this.publications.set(key, older)
                    if (!older.live) this.armIdle(key, older)
                } else this.publications.delete(key)
            }
            throw error
        }
    }

    // Before the first track of a send connection: a data channel is negotiated alone, so its m-line is the first of
    // the BUNDLE group for the life of the connection. Chrome drops the transport when the group's first m-line is
    // rejected (Cloudflare then answers every later call on the session with 410), and a group with every media
    // m-line stopped would be empty; with the data channel first, any track can be unpublished with an offer.
    private async openSend(pc: RTCPeerConnection, epoch: number): Promise<void> {
        if (this.anchoredPc === pc || typeof pc.createDataChannel !== 'function') return
        try {
            pc.createDataChannel('anchor')
            const offer = await pc.createOffer()
            this.check(epoch)
            await pc.setLocalDescription(offer)
            this.check(epoch)
            const reply = await this.socket.request<{ answer?: string }>('mediaOpen', { offer: pc.localDescription?.sdp ?? offer.sdp })
            this.check(epoch)
            if (!reply.answer) throw new Error(CONNECT_ERROR)
            await pc.setRemoteDescription({ type: 'answer', sdp: reply.answer })
            this.check(epoch)
            this.anchoredPc = pc
        } catch (error) {
            // A half-open connection cannot negotiate its data channel again: the next publish starts a new one.
            if (!(error instanceof StaleWork) && epoch === this.epoch && this.sendPc === pc) {
                try { pc.close() } catch { /* already closed */ }
                this.sendPc = null
            }
            throw error
        }
    }

    private async doUnpublish(key: string): Promise<void> {
        const publication = this.publications.get(key)
        if (!publication) return
        this.publications.delete(key)
        this.clearIdle(publication)
        const { transceiver, mid, kind, objectId } = publication
        const pc = this.sendPc
        if (!transceiver || !mid || !pc || !this.ready) { transceiver?.stop(); return }
        const epoch = this.epoch
        // The last track out of a connection without its data channel: an offer with every m-line stopped has no
        // BUNDLE group, so the page stops it locally and the server closes it forced, with no SDP.
        const last = this.anchoredPc !== pc && ![...this.publications.values()].some(other => other.transceiver && other.mid)
        transceiver.stop()
        const payload = { kind, ...(objectId ? { objectId } : {}), mid }
        let offered = false
        try {
            if (last) {
                await this.socket.request('mediaUnpublish', payload)
                return
            }
            const offer = await pc.createOffer()
            this.check(epoch)
            await pc.setLocalDescription(offer)
            offered = true
            this.check(epoch)
            const reply = await this.socket.request<{ answer?: string }>('mediaUnpublish', { ...payload, offer: pc.localDescription?.sdp ?? offer.sdp })
            this.check(epoch)
            if (!reply.answer) throw new Error(CONNECT_ERROR)
            await pc.setRemoteDescription({ type: 'answer', sdp: reply.answer })
            this.check(epoch)
        } catch (error) {
            if (error instanceof StaleWork || epoch !== this.epoch || !this.running) return
            if (offered) try { await pc.setLocalDescription({ type: 'rollback' }) } catch { /* nothing to undo */ }
            throw error
        }
    }

    private onNegotiate(step: unknown, ack: unknown) {
        const reply = typeof ack === 'function' ? ack as (reply: NegotiateReply) => void : () => {}
        // One step at a time; the next one is applied only after this one was acked.
        this.receiveQueue = this.receiveQueue.then(async () => { reply(await this.runStep(step)) }).catch(() => {})
    }

    private async runStep(raw: unknown): Promise<NegotiateReply> {
        if (!this.running) return stale()
        if (!validStep(raw)) return { ok: false, error: INVALID_STEP }
        const step = raw
        // A step of the state a pending reset is creating may arrive just before the reset's reply is applied.
        if (this.restarting && step.generation > this.serverGeneration) await new Promise<void>(resolve => this.generationWaiters.push(resolve))
        if (!this.ready || step.generation !== this.serverGeneration) return stale()
        const epoch = this.epoch
        try {
            if (step.type === 'pull') {
                const pc = this.connection('receive')
                await pc.setRemoteDescription({ type: 'offer', sdp: step.offer })
                this.check(epoch)
                // Strictly by the mids of this step: a mid reused after a close belongs to whoever this step says.
                // Deleted first, so the newest entry is last and wins the lookups (a republish pulled before the
                // older track is closed).
                for (const { mid, fromUid, kind, objectId } of step.tracks) {
                    this.entries.delete(mid)
                    this.entries.set(mid, { mid, fromUid, kind, ...(objectId ? { objectId } : {}) })
                }
                const answer = await pc.createAnswer()
                this.check(epoch)
                await pc.setLocalDescription(answer)
                this.check(epoch)
                this.indexReceivers()
                // A mid of a transceiver stopped by a forced close, offered again before any renegotiation, is
                // matched to that stopped transceiver and rejected by the browser: nothing would play. Refusing the
                // step makes the server restart this page, which rebuilds both connections.
                const unmatched = step.tracks.filter(({ mid }) => !this.receiving.has(mid)).map(({ mid }) => mid)
                if (unmatched.length) {
                    for (const mid of unmatched) this.entries.delete(mid)
                    this.emit({ type: 'tracks' })
                    return { ok: false, error: `${PULL_UNMATCHED_ERROR}: ${unmatched.join(',')}` }
                }
                this.emit({ type: 'tracks' })
                return { ok: true, answer: pc.localDescription?.sdp ?? answer.sdp! }
            }
            if (step.type === 'close') {
                const mids = new Set(step.mids)
                for (const mid of mids) this.entries.delete(mid)
                const pc = this.receivePc
                for (const transceiver of pc?.getTransceivers() ?? []) if (transceiver.mid !== null && mids.has(transceiver.mid) && !isStopped(transceiver)) transceiver.stop()
                this.indexReceivers()
                this.emit({ type: 'tracks' })
                // Forced: the last tracks of the connection; no offer, and no answer step follows.
                if (step.force) return { ok: true }
                if (!pc) throw new Error(INVALID_STEP)
                const offer = await pc.createOffer()
                this.check(epoch)
                await pc.setLocalDescription(offer)
                this.check(epoch)
                return { ok: true, offer: pc.localDescription?.sdp ?? offer.sdp! }
            }
            const pc = this.receivePc
            if (!pc) throw new Error(INVALID_STEP)
            await pc.setRemoteDescription({ type: 'answer', sdp: step.answer })
            this.check(epoch)
            this.indexReceivers()
            return { ok: true }
        } catch (error) {
            if (error instanceof StaleWork) return stale()
            return { ok: false, error: messageOf(error) }
        }
    }

    // mid -> the live receiving transceiver with that mid (the newest one wins), rebuilt once per step.
    private indexReceivers() {
        this.receiving.clear()
        for (const transceiver of this.receivePc?.getTransceivers() ?? []) {
            if (transceiver.mid !== null && !isStopped(transceiver) && transceiver.receiver?.track) this.receiving.set(transceiver.mid, transceiver)
        }
    }

    // The newest matching entry first.
    private transceiverFor(fromUid: string | null, kind: MediaKind, objectId?: string): RTCRtpTransceiver | null {
        const entries = [...this.entries.values()]
        for (let i = entries.length - 1; i >= 0; i--) {
            const entry = entries[i]
            if (entry.kind !== kind || (fromUid !== null && entry.fromUid !== fromUid) || (objectId !== undefined && entry.objectId !== objectId)) continue
            const transceiver = this.receiving.get(entry.mid)
            if (transceiver) return transceiver
        }
        return null
    }
}
