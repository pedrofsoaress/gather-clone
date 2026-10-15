// Wire format with the office server for the Cloudflare path (mirrors backend/src/media/protocol.ts).
export type MediaProvider = 'agora' | 'cloudflare'
export type Layer = 'f' | 'h' | 'q'
export type MediaKind = 'mic' | 'camera' | 'screen' | 'speaker'
export type IceServer = { urls: string | string[], username?: string, credential?: string }
// `generation` names the server's media state for this page: new on every join, reset and restart. A
// `bootstrap: false` config (the six-hourly ICE refresh) carries the current one and never changes it.
export type CloudflareMediaConfig = { provider: 'cloudflare', iceServers: IceServer[], bootstrap: boolean, generation: number }
export type MediaConfig = { provider: 'agora' } | CloudflareMediaConfig
export type PeerState = { uid: string, mic: boolean, camera: boolean, screen: boolean }
export type PeersSnapshot = { self: string, conversation: string | null, peers: PeerState[], ownScreen: boolean }
export type RemoteEntry = { mid: string, fromUid: string, kind: MediaKind, objectId?: string }
// Every step carries the generation it belongs to; the page answers only steps of its current generation.
// `close` with `force: true` (every close the server sends): the page stops those transceivers locally WITHOUT
// creating an offer and acks `{ ok: true }`. No `answer` step follows. A page offer on this Cloudflare-offered
// session would leave it "disconnected" for Cloudflare (later calls fail with 410).
export type NegotiateStep = { generation: number } & (
    | { type: 'pull', offer: string, tracks: RemoteEntry[] }
    | { type: 'close', mids: string[], force?: true }
    | { type: 'answer', answer: string })
export type NegotiateReply = { ok: true, answer?: string, offer?: string } | { ok: false, error: string }

export interface SignalingSocket {
    on(event: string, handler: (...args: any[]) => void): void
    off(event: string, handler: (...args: any[]) => void): void
    // Emits with an ack: resolves with the reply when it says ok, rejects with its error or a timeout.
    request<T = {}>(event: string, payload: unknown, timeoutMs?: number): Promise<T>
}

// Simulcast layers of the camera: full, half and quarter resolution.
export const SIMULCAST_ENCODINGS: RTCRtpEncodingParameters[] = [
    { rid: 'f', scaleResolutionDownBy: 1, maxBitrate: 1_200_000 },
    { rid: 'h', scaleResolutionDownBy: 2, maxBitrate: 450_000 },
    { rid: 'q', scaleResolutionDownBy: 4, maxBitrate: 150_000 },
]
