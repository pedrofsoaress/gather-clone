import { z } from 'zod'
import type { IceServer } from './CloudflareRealtime'
import type { MediaKind } from './subscriptions'

const kind = z.enum(['mic', 'camera', 'screen', 'speaker'])
const objectId = z.string().min(1).max(64).optional()
const sdp = z.string().min(1).max(200_000)
const mid = z.string().min(1).max(32)
const speakerHasObject = (value: { kind: string, objectId?: string }) => (value.kind === 'speaker') === Boolean(value.objectId)

export const MediaPublish = z.object({ kind, objectId, mid, offer: sdp, simulcast: z.boolean() }).refine(speakerHasObject)
export const MediaUnpublish = z.object({ kind, objectId, mid, offer: sdp }).refine(speakerHasObject)
export const MediaTrackState = z.object({ kind: z.enum(['mic', 'camera']), live: z.boolean() })
export const MediaLayer = z.object({ fromUid: z.string().min(1).max(64), layer: z.enum(['f', 'h', 'q']) })
// What the page sends back inside a negotiation ack.
export const NegotiatedSdp = sdp

export type MediaConfig = { provider: 'agora' } | { provider: 'cloudflare', iceServers: IceServer[], bootstrap: boolean }
// `close` with `force: true` closes the last tracks of the receive connection. The page stops those
// transceivers locally WITHOUT creating an offer (a max-bundle connection with every m-line rejected has no
// BUNDLE group and setLocalDescription throws) and acks `{ ok: true }`. The server then closes them on
// Cloudflare with `force: true` and no SDP; no `answer` step follows. The next pull offer renegotiates as usual.
export type NegotiateStep =
    | { type: 'pull', offer: string, tracks: { mid: string, fromUid: string, kind: MediaKind, objectId?: string }[] }
    | { type: 'close', mids: string[], force?: true }
    | { type: 'answer', answer: string }
export const STUN_ONLY: IceServer[] = [{ urls: 'stun:stun.cloudflare.com:3478' }]
export const NEGOTIATE_TIMEOUT_MS = 8000
export const CONFIG_REFRESH_MS = 6 * 60 * 60 * 1000
// A join never waits longer than this for TURN credentials; past it the page gets STUN only.
export const ICE_SERVERS_TIMEOUT_MS = 5000
