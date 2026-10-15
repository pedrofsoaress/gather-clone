import { z } from 'zod'
import type { IceServer } from './CloudflareRealtime'
import type { MediaKind } from './subscriptions'

const kind = z.enum(['mic', 'camera', 'screen', 'speaker'])
const objectId = z.string().min(1).max(64).optional()
const sdp = z.string().min(1).max(200_000)
const mid = z.string().min(1).max(32)
const speakerHasObject = (value: { kind: string, objectId?: string }) => (value.kind === 'speaker') === Boolean(value.objectId)

// The first message of a send connection: an offer with only the page's data channel. Its m-line stays first in the
// BUNDLE group for the life of the connection, so unpublishing any track never removes the group's first m-line
// (Chrome then drops the transport and Cloudflare answers every later call with 410) nor empties the group.
export const MediaOpen = z.object({ offer: sdp })
export const MediaPublish = z.object({ kind, objectId, mid, offer: sdp, simulcast: z.boolean() }).refine(speakerHasObject)
// `offer` may be left out only to unpublish the connection's last publication: a max-bundle send connection
// with every m-line stopped has no BUNDLE group, so the page stops the transceiver without renegotiating and the
// server closes the track forced, with no SDP. The ack then has no `answer`.
export const MediaUnpublish = z.object({ kind, objectId, mid, offer: sdp.optional(), abandoned: z.literal(true).optional() }).refine(speakerHasObject).refine(value => !(value.abandoned && value.offer))
// A page offer that only settles m-lines the page abandoned (a publish it gave up on, rolled back and stopped): Chrome
// puts such an m-line back in its next offer, in the place of the new transceiver, until one negotiation drops it.
export const MediaSettle = z.object({ mids: z.array(mid).min(1).max(64), offer: sdp })
export const MediaTrackState = z.object({ kind: z.enum(['mic', 'camera']), live: z.boolean() })
export const MediaLayer = z.object({ fromUid: z.string().min(1).max(64), layer: z.enum(['f', 'h', 'q']) })
// What the page sends back inside a negotiation ack.
export const NegotiatedSdp = sdp

// `generation` names the server's media state for this page. It changes on every join, reset and restart; every
// negotiation step carries the generation it belongs to, and the page drops steps of any other generation.
export type MediaConfig = { provider: 'agora' } | { provider: 'cloudflare', iceServers: IceServer[], bootstrap: boolean, generation: number }
// The server sends every `close` with `force: true`: the page stops those transceivers locally WITHOUT creating an
// offer and acks `{ ok: true }`; the server then closes them on Cloudflare with `force: true` and no SDP, and no
// `answer` step follows. (A page offer on this Cloudflare-offered session leaves it "disconnected" for Cloudflare,
// and an offer with every m-line stopped has no BUNDLE group.) The next pull offer renegotiates as usual. A `close`
// without `force` (page offer, then an `answer` step) is still understood by the page but no longer sent.
// `prefetch` on a pulled track: pulled ahead of a conversation (the sender is close but not in it), at the lowest layer.
// The page holds such a track without showing or playing it. Whether a received track is shown follows the roster,
// `mediaPeers`, alone: a sender listed there is in the conversation (the same pull turned active, nothing is
// renegotiated); a sender dropped from it is hidden again while their track may stay pulled as prefetch.
export type NegotiateStep = { generation: number } & (
    | { type: 'pull', offer: string, tracks: { mid: string, fromUid: string, kind: MediaKind, objectId?: string, prefetch: boolean }[] }
    | { type: 'close', mids: string[], force?: true }
    | { type: 'answer', answer: string }
    // Nothing is pulled and the receive connection carries RECEIVE_RECYCLE_MLINES dead m-lines: the page closes it
    // (sending is untouched) and acks `{ ok: true }`; the next pull starts a new session and connection.
    | { type: 'recycle' })
export const STUN_ONLY: IceServer[] = [{ urls: 'stun:stun.cloudflare.com:3478' }]
export const NEGOTIATE_TIMEOUT_MS = 8000
export const CONFIG_REFRESH_MS = 6 * 60 * 60 * 1000
// A join never waits longer than this for TURN credentials; past it the page gets STUN only.
export const ICE_SERVERS_TIMEOUT_MS = 5000
// A refused pull may race a fresh publish: it is retried once after this delay before the page is told.
export const PULL_RETRY_MS = 2000
// The Cloudflare publish call is given this long, under the page's 8 s request timeout: past it the page is refused and
// the track Cloudflare made is closed when the call returns, so a page that gave up never ends up published.
export const PUBLISH_TIMEOUT_MS = 7000
// Cloudflare never reuses the m-lines of a receive session: once nothing is pulled and it carries this many, the
// receive session and connection are replaced (a `recycle` step), so the SDP never grows past the limit above.
export const RECEIVE_RECYCLE_MLINES = 40
// Someone who never runs out of pulled tracks (staying in a group while others come and go) is recycled anyway at this
// many m-lines (about 140 KB of SDP): their pulls are closed, the receive side starts over and pulls them again, a
// second or two without received media instead of a full restart at the SDP limit.
export const RECEIVE_FORCE_RECYCLE_MLINES = 100
// Cloudflare refuses a pull with `empty_track_error` while the published track has not sent media yet (a camera that
// just came on): those are retried with this backoff, about 7.5 s in all, before the page is told.
export const EMPTY_TRACK_RETRY_MS = [500, 1000, 2000, 4000]
// A prefetched track whose sender walked out of PREFETCH_RADIUS is closed only after this long (unless they come back
// first), so walking back and forth at the edge never closes and pulls again.
export const PREFETCH_GRACE_MS = 3000
// While a conversation is received, nothing new is prefetched past this many m-lines on the receive session, so
// passers-by never push the conversation into the forced recycle (RECEIVE_FORCE_RECYCLE_MLINES).
export const PREFETCH_MLINES_BUDGET = 60
