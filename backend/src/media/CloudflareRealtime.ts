import type { CloudflareCredentials } from './config'

export type Layer = 'f' | 'h' | 'q'
export type Sdp = { type: 'offer' | 'answer', sdp: string }
export type Simulcast = { preferredRid: Layer, priorityOrdering: 'none' | 'asciibetical', ridNotAvailable: 'none' | 'asciibetical' }
export type LocalTrack = { location: 'local', mid: string, trackName: string }
export type RemoteTrack = { location: 'remote', sessionId: string, trackName: string, simulcast?: Simulcast }
export type TrackResult = { mid?: string, trackName?: string, sessionId?: string, errorCode?: string, errorDescription?: string }
export type TracksResponse = { requiresImmediateRenegotiation?: boolean, sessionDescription?: Sdp, tracks?: TrackResult[] }
export type IceServer = { urls: string | string[], username?: string, credential?: string }
export type FetchLike = (url: string, init: { method: string, headers: Record<string, string>, body?: string }) => Promise<{ ok: boolean, status: number, text(): Promise<string> }>

export const MAX_TRACKS_PER_REQUEST = 64
export const TURN_TTL_SECONDS = 24 * 60 * 60
const API = 'https://rtc.live.cloudflare.com/v1'

export class CloudflareError extends Error {
    constructor(message: string, readonly status: number, readonly code: string) { super(message) }
}

export interface RealtimeApi {
    newSession(): Promise<string>
    // A session started from the page's offer (its data channel, which keeps the BUNDLE group's first m-line).
    openSession(offer: string): Promise<{ sessionId: string, answer: string }>
    publish(sessionId: string, offer: string, tracks: LocalTrack[]): Promise<TracksResponse>
    pull(sessionId: string, tracks: RemoteTrack[]): Promise<TracksResponse>
    renegotiate(sessionId: string, answer: string): Promise<void>
    close(sessionId: string, mids: string[], offer?: string): Promise<TracksResponse>
    update(sessionId: string, tracks: (RemoteTrack & { mid: string })[]): Promise<TracksResponse>
    iceServers(ttlSeconds: number): Promise<IceServer[]>
}

// Server-side only: every call carries a secret.
export class CloudflareRealtime implements RealtimeApi {
    constructor(private readonly credentials: CloudflareCredentials, private readonly fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike) {}

    private async call<T>(method: 'POST' | 'PUT', url: string, body: unknown, token: string): Promise<T> {
        const response = await this.fetchImpl(url, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
        const text = await response.text()
        let json: { errorCode?: string, errorDescription?: string } & Record<string, unknown> = {}
        let parsed = true
        try { json = text ? JSON.parse(text) : {} } catch { parsed = false }
        if (response.ok && !parsed) throw new CloudflareError(`Cloudflare ${method} ${response.status} resposta não é JSON: ${text.slice(0, 120)}`, response.status, 'not_json')
        if (!response.ok || json.errorCode) {
            const code = json.errorCode ?? `http_${response.status}`
            throw new CloudflareError(`Cloudflare ${method} ${response.status} ${code}${json.errorDescription ? `: ${json.errorDescription}` : ''}`, response.status, code)
        }
        return json as T
    }

    private sfu<T>(method: 'POST' | 'PUT', path: string, body?: unknown): Promise<T> {
        return this.call<T>(method, `${API}/apps/${this.credentials.appId}${path}`, body, this.credentials.appSecret)
    }

    async newSession(): Promise<string> { return (await this.sfu<{ sessionId: string }>('POST', '/sessions/new')).sessionId }
    async openSession(offer: string): Promise<{ sessionId: string, answer: string }> {
        const { sessionId, sessionDescription } = await this.sfu<{ sessionId?: string, sessionDescription?: Sdp }>('POST', '/sessions/new', { sessionDescription: { type: 'offer', sdp: offer } })
        if (!sessionId || !sessionDescription?.sdp) throw new Error('sessions/new sem SDP de resposta')
        return { sessionId, answer: sessionDescription.sdp }
    }
    publish(sessionId: string, offer: string, tracks: LocalTrack[]) { return this.sfu<TracksResponse>('POST', `/sessions/${sessionId}/tracks/new`, { sessionDescription: { type: 'offer', sdp: offer }, tracks }) }
    pull(sessionId: string, tracks: RemoteTrack[]) { return this.sfu<TracksResponse>('POST', `/sessions/${sessionId}/tracks/new`, { tracks }) }
    async renegotiate(sessionId: string, answer: string) { await this.sfu('PUT', `/sessions/${sessionId}/renegotiate`, { sessionDescription: { type: 'answer', sdp: answer } }) }
    close(sessionId: string, mids: string[], offer?: string) {
        return this.sfu<TracksResponse>('PUT', `/sessions/${sessionId}/tracks/close`, { tracks: mids.map(mid => ({ mid })), force: !offer, ...(offer ? { sessionDescription: { type: 'offer', sdp: offer } } : {}) })
    }
    update(sessionId: string, tracks: (RemoteTrack & { mid: string })[]) { return this.sfu<TracksResponse>('PUT', `/sessions/${sessionId}/tracks/update`, { tracks }) }
    async iceServers(ttlSeconds: number): Promise<IceServer[]> {
        const url = `${API}/turn/keys/${this.credentials.turnKeyId}/credentials/generate-ice-servers`
        const json = await this.call<{ iceServers?: IceServer | IceServer[] }>('POST', url, { ttl: ttlSeconds }, this.credentials.turnApiToken)
        // Cloudflare answers with a list, but a single object is also accepted. Anything else is reported, never silently STUN.
        const servers = Array.isArray(json.iceServers) ? json.iceServers : json.iceServers ? [json.iceServers] : []
        const usable = usableIceServers(servers)
        if (!usable.length) throw new Error(`generate-ice-servers sem servidores: ${JSON.stringify(json).replace(/"(username|credential)":"[^"]*"/g, '"$1":"…"').slice(0, 160)}`)
        return usable
    }
}

// Cloudflare also lists port 53, which browsers block and would only slow ICE down.
export function usableIceServers(servers: IceServer[]): IceServer[] {
    return servers
        .map(server => ({ ...server, urls: (Array.isArray(server.urls) ? server.urls : [server.urls]).filter(url => !/:53(\?|$)/.test(url)) }))
        .filter(server => server.urls.length > 0)
}

// One set of TURN credentials for every visitor, renewed after half of its lifetime. Until they really expire, the
// current ones are served at once while new ones load, and kept if the renewal fails: a join never waits for the
// TURN API, and a TURN outage does not push STUN only to everyone. Expired credentials are never served.
export const TURN_EXPIRY_MARGIN_MS = 10 * 60 * 1000
export class IceServerCache {
    private value: { servers: IceServer[], at: number } | null = null
    private pending: Promise<IceServer[]> | null = null
    constructor(private readonly api: Pick<RealtimeApi, 'iceServers'>, private readonly now: () => number = Date.now, private readonly log: (line: string) => void = console.error) {}
    get(): Promise<IceServer[]> {
        const age = this.value ? this.now() - this.value.at : Infinity
        if (this.value && age < TURN_TTL_SECONDS * 500) return Promise.resolve(this.value.servers)
        const usable = this.value && age < TURN_TTL_SECONDS * 1000 - TURN_EXPIRY_MARGIN_MS ? this.value.servers : null
        if (!this.pending) {
            const pending = this.api.iceServers(TURN_TTL_SECONDS)
                .then(servers => { this.value = { servers, at: this.now() }; return servers })
                .finally(() => { if (this.pending === pending) this.pending = null })
            this.pending = pending
            if (usable) pending.catch(error => this.log(`Cloudflare TURN indisponível (${error instanceof Error ? error.message : String(error)}); usando as credenciais atuais até expirarem.`))
        }
        return usable ? Promise.resolve(usable) : this.pending
    }
}
