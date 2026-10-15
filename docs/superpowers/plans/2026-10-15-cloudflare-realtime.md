# Cloudflare Realtime Video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all of the office's audio and video from Agora to the Cloudflare Realtime SFU. That covers proximity conversations, closed rooms, the training room, screen share and the lounge speaker. The screen the team uses stays the same, and a server switch (`VIDEO_PROVIDER`) allows an instant rollback.

**Architecture:**
- **Backend.** A new `backend/src/media/` folder holds four parts:
  - a typed Cloudflare REST client (SFU sessions and tracks, TURN credentials);
  - a pure function that decides which tracks each person must receive;
  - `MediaSignaling`, which owns each person's two Cloudflare sessions (one to send, one to receive), pulls and closes tracks when the office state changes, and drives the receive connection's SDP over Socket.IO;
  - the wiring into `sockets.ts` and `helpers.ts`.
- **Frontend.** A new `frontend/utils/video-chat/cloudflare/` folder holds the protocol types, `CloudflareEngine` and `CloudflareVideoChat`:
  - `CloudflareEngine` manages two `RTCPeerConnection`s: a publish connection with simulcast that the client drives, and a receive connection that the server drives.
  - `CloudflareVideoChat` implements the same `MediaChat` interface as today's Agora class.
  - In Task 6, `video-chat.ts` becomes a router that picks the provider from the server's `mediaConfig`.

**Tech Stack:**
- Backend: Node 18 or newer, TypeScript 5, Socket.IO 4.7 (`emitWithAck`), zod, `node:test`.
- Frontend: Next.js 14, browser WebRTC, socket.io-client 4.7, `node:test` with `--experimental-strip-types`.
- No new dependencies. The backend uses the global `fetch`, and `yarn.lock` does not change.

**Spec:** docs/superpowers/specs/2026-10-15-cloudflare-realtime-design.md

## Global Constraints

**Branch.** All work happens on `feat/cloudflare-video`, which is already checked out. Only the release (Task 9) touches `main`.

**Provider switch.** The backend reads `VIDEO_PROVIDER` once, at startup.
- `cloudflare` means Cloudflare. Anything else, or nothing, means `agora`.
- Cloudflare needs all four of `CLOUDFLARE_SFU_APP_ID`, `CLOUDFLARE_SFU_APP_SECRET`, `CLOUDFLARE_TURN_KEY_ID` and `CLOUDFLARE_TURN_API_TOKEN`.
- If any is missing, the server logs exactly `VIDEO_PROVIDER=cloudflare sem <NOMES, separados por vírgula>; usando agora.` and serves Agora.
- If TURN credentials cannot be fetched, the server keeps Cloudflare with STUN only, `[{ urls: 'stun:stun.cloudflare.com:3478' }]`, and logs `Cloudflare TURN indisponível (<motivo>); usando só STUN.` It never splits the office between providers.

**Secrets.**
- The four values live only in the server's process environment: Render, or the implementer's shell.
- They are never written to any file. That includes `.env`, scratch scripts, the plan, commits, logs and screenshots.
- Logs and error messages may name a variable but never its value.
- The browser never receives the app secret or the TURN API token. It receives only short-lived ICE servers.

**Simulcast layers.**
- The camera is published with `sendEncodings` `f`, `h` and `q`, with `scaleResolutionDownBy` 1, 2 and 4.
- Which layer each place in the UI receives:

  | Where the person is shown | Layer |
  |---|---|
  | Small strip tiles, compact floating bubbles | `q` (the server's default) |
  | Expanded meeting tiles, full floating window | `h` |
  | Enlarged tile | `f` |
  | Shared screen | single layer, full resolution, no simulcast |

- The page asks for a layer change and the server applies it with `tracks/update`, using `priorityOrdering: 'none'` and `ridNotAvailable: 'asciibetical'`.

**Cloudflare API facts used by every task.**
- Calls go to `https://rtc.live.cloudflare.com/v1/apps/{appId}` with `Authorization: Bearer <APP_SECRET>`.
- Endpoints:
  - `POST /sessions/new` returns `{ sessionId }`.
  - `POST /sessions/{id}/tracks/new` publishes local tracks (with an offer) or pulls remote ones. A pull returns `requiresImmediateRenegotiation`, an offer, and `tracks[{ mid, trackName, sessionId, errorCode? }]`.
  - `PUT .../renegotiate` takes `{ sessionDescription: answer }`.
  - `PUT .../tracks/close` takes `{ tracks:[{mid}], force, sessionDescription? }`. `force` is required by the OpenAPI schema.
  - `PUT .../tracks/update` takes `{ tracks:[{ ..., mid, simulcast }] }`.
- TURN: `POST /v1/turn/keys/{keyId}/credentials/generate-ice-servers` with `Bearer <TURN token>` and `{ ttl }`. It returns `{ iceServers }`.
- These names were checked against the docs and the OpenAPI schema (`realtime-api-2024-05-21.yaml`) on 15/10. Task 1 Step 6 checks them again with live calls. If a live response differs, fix `CloudflareRealtime.ts` and its test before starting Task 2; every later task talks only to its typed methods.
- Limits:
  - 50 requests per second per session;
  - at most 64 tracks per request (the server chunks);
  - mutations on one session are serialized (the server keeps one queue per Cloudflare session);
  - a session that never connects expires (later calls return 410);
  - a track that receives no packets for 30 s is garbage-collected. The page therefore unpublishes a paused mic or camera after 25 s (`IDLE_UNPUBLISH_MS`).

**UI copy.**
- All UI text is Brazilian Portuguese with no em or en dash.
- Reuse "Não foi possível receber a mídia de um participante." when Cloudflare refuses a track.
- The new notice is "Reconectando o vídeo...". It appears only when reconnecting takes longer than 3 s.

**Tests.**
- Backend, 94 today: `cd backend && npx tsc -p . && node --test $(find dist -name "*.test.js")`.
- Frontend, 185 today: `cd frontend && npx tsc --noEmit --incremental false && node --experimental-strip-types --test $(find . -name "*.test.mjs" -not -path "./node_modules/*" -not -path "./.next/*")`.
- Backend tests live in `src/**/*.test.ts`.
- Frontend `.test.mjs` files have two styles:
  - A module with no runtime imports, and no TypeScript parameter properties, is imported directly as `./x.ts`.
  - Any other module is transpiled with `ts.transpileModule` and run in `vm` with stubbed `require`, as `VideoChatDevices.test.mjs` does.

**Commits.** Each commit's subject ends with ` [skip render]`. Each commit's message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Use the form `git commit -m "<subject> [skip render]" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.

**Production office.** Never test with guests or bots in the production office. All automated end-to-end checks run in a throwaway realm on localhost (Task 8).

**`<scratchpad>`** means `/private/tmp/claude-501/-Users-pedrosoares/03356041-6d92-46ea-be20-f5b76175358a/scratchpad`. It already holds `floor2-realm.cjs`, `floor2-driver.cjs` and `cleanup-floor2.cjs`. Nothing in it is committed.

## Review Focus

Reviewers should look hardest at five failure modes that the happy-path tests would not catch. Each one has a test in the task that owns it.

1. **Renegotiation glare when publish and pull overlap.**
   - Publishing and receiving use separate peer connections and separate Cloudflare sessions.
   - Only the server ever starts a negotiation on the receive connection.
   - Both the server and the page serialize the steps.
   - Tests: Task 3, test "never two negotiations at once"; Task 4, test "publish and pull overlap".
2. **Mapping a mid to the right person after many pulls and closes.**
   - The page maps tracks only by the mid the server sends for each step. It never uses transceiver order, and a mid reused after a close points to the new person.
   - Tests: Task 4, test "mid reuse"; Task 3, test "walk away closes".
3. **Simulcast in Safari and Firefox.**
   - If `addTransceiver` rejects `sendEncodings`, or the sender ends up with one encoding, the page publishes one layer with `simulcast: false`.
   - The server then pulls without `simulcast` and never sends `tracks/update` for that track.
   - Tests: Task 4, test "simulcast fallback"; Task 3, test "layers". Manual check in Task 8 Step 12.
4. **Network change and reconnect.**
   - A receive or publish connection that is `failed`, or `disconnected` for more than 5 s, triggers `mediaReset` and a republish.
   - A socket drop suspends the engine; the rejoin's `mediaConfig` restarts it.
   - Cloudflare 410 errors and timed-out steps make the server send `mediaRestart`.
   - Tests: Task 4, tests "reconnect" and "suspend"; Task 3, test "failures".
5. **Idle-track garbage collection after 30 s with the camera off.**
   - The page unpublishes a paused track after 25 s.
   - When a resume comes after 25 s of wall-clock time (background tabs throttle timers), the page republishes instead of calling `replaceTrack`.
   - The server reports per-track pull errors once and does not retry them until the publisher republishes.
   - Tests: Task 4, test "idle GC"; Task 3, tests "idle unpublish" and "failures".

---

### Task 1: Provider switch and Cloudflare client (backend)

**Files:**
- Create: `backend/src/media/config.ts`
- Create: `backend/src/media/CloudflareRealtime.ts`
- Test: `backend/src/media/config.test.ts`, `backend/src/media/CloudflareRealtime.test.ts`
- Scratch, not committed: `<scratchpad>/cf-live-check.cjs`

**Interfaces:**
- Consumes: nothing.
- Produces from `config.ts`:
  - `type CloudflareCredentials = { appId, appSecret, turnKeyId, turnApiToken }`
  - `type VideoProvider = { provider: 'agora' } | { provider: 'cloudflare', credentials }`
  - `videoProviderFromEnv(env, log?)`
- Produces from `CloudflareRealtime.ts`:
  - `interface RealtimeApi`, `class CloudflareRealtime`, `class CloudflareError` (with `status` and `code`), `class IceServerCache`
  - types `Layer`, `Simulcast`, `LocalTrack`, `RemoteTrack`, `TracksResponse`, `IceServer`, `FetchLike`
  - `usableIceServers`, `MAX_TRACKS_PER_REQUEST = 64`, `TURN_TTL_SECONDS`

- [ ] **Step 1: Write the failing config test** `backend/src/media/config.test.ts`:

```ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { videoProviderFromEnv } from './config'

const all = { CLOUDFLARE_SFU_APP_ID: 'app', CLOUDFLARE_SFU_APP_SECRET: 'secret-value', CLOUDFLARE_TURN_KEY_ID: 'key', CLOUDFLARE_TURN_API_TOKEN: 'token-value' }

test('Agora unless VIDEO_PROVIDER says cloudflare', () => {
    assert.deepEqual(videoProviderFromEnv({ ...all }), { provider: 'agora' })
    assert.deepEqual(videoProviderFromEnv({ ...all, VIDEO_PROVIDER: 'zoom' }), { provider: 'agora' })
})

test('cloudflare with the four credentials', () => {
    assert.deepEqual(videoProviderFromEnv({ ...all, VIDEO_PROVIDER: ' Cloudflare ' }), { provider: 'cloudflare', credentials: { appId: 'app', appSecret: 'secret-value', turnKeyId: 'key', turnApiToken: 'token-value' } })
})

test('a missing credential falls back to agora and logs only the names', () => {
    const logs: string[] = []
    assert.deepEqual(videoProviderFromEnv({ ...all, VIDEO_PROVIDER: 'cloudflare', CLOUDFLARE_TURN_API_TOKEN: '' }, line => logs.push(line)), { provider: 'agora' })
    assert.deepEqual(logs, ['VIDEO_PROVIDER=cloudflare sem CLOUDFLARE_TURN_API_TOKEN; usando agora.'])
    assert.ok(!logs.join().includes('secret-value'))
})
```

- [ ] **Step 2: Write the failing client test** `backend/src/media/CloudflareRealtime.test.ts`. It builds a fake `fetch` that records `{ url, method, headers, body: JSON.parse(body) }` and answers with queued `{ status, json }` replies. There are five tests:
  1. **`newSession` and `publish`.**
     - `newSession` POSTs `https://rtc.live.cloudflare.com/v1/apps/app/sessions/new` with `Authorization: Bearer secret-value` and returns the `sessionId`.
     - `publish('s1', 'OFFER', [{ location:'local', mid:'0', trackName:'camera-1' }])` POSTs `.../sessions/s1/tracks/new` with body `{ sessionDescription:{ type:'offer', sdp:'OFFER' }, tracks:[...] }`.
  2. **The other session calls.**
     - `pull` POSTs `{ tracks:[{ location:'remote', sessionId, trackName, simulcast }] }`.
     - `renegotiate` PUTs `{ sessionDescription:{ type:'answer', sdp } }`.
     - `close('s2', ['5'], 'OFF')` PUTs `{ tracks:[{mid:'5'}], force:false, sessionDescription:{type:'offer', sdp:'OFF'} }`, and without an offer it sends `force:true` and no `sessionDescription`.
     - `update` PUTs `{ tracks }` to `.../tracks/update`.
  3. **Errors.**
     - A 410 throws a `CloudflareError` with `status` 410 and `code` taken from `errorCode` (or `http_410`).
     - A 200 response that carries a top-level `errorCode` throws.
     - No error message contains `secret-value` or `token-value`.
  4. **`iceServers(600)`.**
     - It POSTs `https://rtc.live.cloudflare.com/v1/turn/keys/key/credentials/generate-ice-servers` with `Bearer token-value` and body `{ ttl: 600 }`.
     - It drops the `:53` urls and drops entries left with no url.
  5. **`IceServerCache`.** Two concurrent `get()` calls make one request. A third `get()` 13 h later (injected `now`) makes a new request.

- [ ] **Step 3: Run** `cd backend && npx tsc -p .`. Expected: FAIL, because `Cannot find module './config'` and `'./CloudflareRealtime'`.

- [ ] **Step 4: Implement** `backend/src/media/config.ts`:

```ts
export type CloudflareCredentials = { appId: string, appSecret: string, turnKeyId: string, turnApiToken: string }
export type VideoProvider = { provider: 'agora' } | { provider: 'cloudflare', credentials: CloudflareCredentials }

const REQUIRED = ['CLOUDFLARE_SFU_APP_ID', 'CLOUDFLARE_SFU_APP_SECRET', 'CLOUDFLARE_TURN_KEY_ID', 'CLOUDFLARE_TURN_API_TOKEN'] as const

// Read once at startup. Logs name the missing variables, never a value.
export function videoProviderFromEnv(env: Record<string, string | undefined>, log: (line: string) => void = console.error): VideoProvider {
    if ((env.VIDEO_PROVIDER ?? '').trim().toLowerCase() !== 'cloudflare') return { provider: 'agora' }
    const value = (name: typeof REQUIRED[number]) => (env[name] ?? '').trim()
    const missing = REQUIRED.filter(name => !value(name))
    if (missing.length) {
        log(`VIDEO_PROVIDER=cloudflare sem ${missing.join(', ')}; usando agora.`)
        return { provider: 'agora' }
    }
    return { provider: 'cloudflare', credentials: { appId: value('CLOUDFLARE_SFU_APP_ID'), appSecret: value('CLOUDFLARE_SFU_APP_SECRET'), turnKeyId: value('CLOUDFLARE_TURN_KEY_ID'), turnApiToken: value('CLOUDFLARE_TURN_API_TOKEN') } }
}
```

Then `backend/src/media/CloudflareRealtime.ts`:

```ts
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
        try { json = text ? JSON.parse(text) : {} } catch { /* an HTML error page */ }
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
    publish(sessionId: string, offer: string, tracks: LocalTrack[]) { return this.sfu<TracksResponse>('POST', `/sessions/${sessionId}/tracks/new`, { sessionDescription: { type: 'offer', sdp: offer }, tracks }) }
    pull(sessionId: string, tracks: RemoteTrack[]) { return this.sfu<TracksResponse>('POST', `/sessions/${sessionId}/tracks/new`, { tracks }) }
    async renegotiate(sessionId: string, answer: string) { await this.sfu('PUT', `/sessions/${sessionId}/renegotiate`, { sessionDescription: { type: 'answer', sdp: answer } }) }
    close(sessionId: string, mids: string[], offer?: string) {
        return this.sfu<TracksResponse>('PUT', `/sessions/${sessionId}/tracks/close`, { tracks: mids.map(mid => ({ mid })), force: !offer, ...(offer ? { sessionDescription: { type: 'offer', sdp: offer } } : {}) })
    }
    update(sessionId: string, tracks: (RemoteTrack & { mid: string })[]) { return this.sfu<TracksResponse>('PUT', `/sessions/${sessionId}/tracks/update`, { tracks }) }
    async iceServers(ttlSeconds: number): Promise<IceServer[]> {
        const url = `${API}/turn/keys/${this.credentials.turnKeyId}/credentials/generate-ice-servers`
        const { iceServers } = await this.call<{ iceServers?: IceServer[] }>('POST', url, { ttl: ttlSeconds }, this.credentials.turnApiToken)
        return usableIceServers(iceServers ?? [])
    }
}

// Cloudflare also lists port 53, which browsers block and would only slow ICE down.
export function usableIceServers(servers: IceServer[]): IceServer[] {
    return servers
        .map(server => ({ ...server, urls: (Array.isArray(server.urls) ? server.urls : [server.urls]).filter(url => !/:53(\?|$)/.test(url)) }))
        .filter(server => server.urls.length > 0)
}

// One set of TURN credentials for every visitor, renewed after half of its lifetime.
export class IceServerCache {
    private value: { servers: IceServer[], at: number } | null = null
    private pending: Promise<IceServer[]> | null = null
    constructor(private readonly api: Pick<RealtimeApi, 'iceServers'>, private readonly now: () => number = Date.now) {}
    get(): Promise<IceServer[]> {
        if (this.value && this.now() - this.value.at < TURN_TTL_SECONDS * 500) return Promise.resolve(this.value.servers)
        this.pending ??= this.api.iceServers(TURN_TTL_SECONDS)
            .then(servers => { this.value = { servers, at: this.now() }; return servers })
            .finally(() => { this.pending = null })
        return this.pending
    }
}
```

- [ ] **Step 5: Run** the backend suite (command in Global Constraints). Expected: PASS, 94 + 8 = 102 tests.

- [ ] **Step 6: Live check of the field names.** This needs the four variables in the implementer's process env.
  - Write `<scratchpad>/cf-live-check.cjs`. It uses the compiled `dist` modules and Playwright's headless Chromium, the same one `floor2-driver.cjs` uses. The page is `about:blank` and the video source is a canvas, so no secure context is needed.
  - Run it with `node <scratchpad>/cf-live-check.cjs`. Expected: every line `ok`. Any `FAIL` means: compare the logged response keys with the docs, fix `CloudflareRealtime.ts` and its test, then rerun.

```js
// Real calls to check the Cloudflare field names. Reads process.env only; prints no secret.
const { chromium } = require('/Users/pedrosoares/webinars-live/node_modules/playwright')
const { CloudflareRealtime } = require('/Users/pedrosoares/gather-clone/backend/dist/media/CloudflareRealtime')
const { videoProviderFromEnv } = require('/Users/pedrosoares/gather-clone/backend/dist/media/config')
const check = (name, ok) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) process.exitCode = 1 }
const simulcast = rid => ({ preferredRid: rid, priorityOrdering: 'none', ridNotAvailable: 'asciibetical' })
;(async () => {
  const provider = videoProviderFromEnv({ ...process.env, VIDEO_PROVIDER: 'cloudflare' })
  if (provider.provider !== 'cloudflare') throw new Error('faltam variáveis')
  const api = new CloudflareRealtime(provider.credentials)
  check('turn', (await api.iceServers(600)).some(s => [].concat(s.urls).some(u => u.startsWith('turn'))))
  const browser = await chromium.launch({ executablePath: '/Users/pedrosoares/Library/Caches/ms-playwright/chromium_headless_shell-1200/chrome-headless-shell-mac-arm64/chrome-headless-shell' })
  const page = await browser.newPage()
  const offer = await page.evaluate(async () => {
    const canvas = Object.assign(document.createElement('canvas'), { width: 1280, height: 720 })
    const g = canvas.getContext('2d'); setInterval(() => { g.fillStyle = `hsl(${(Date.now() / 5) % 360} 80% 50%)`; g.fillRect(0, 0, 1280, 720) }, 40)
    window.pub = new RTCPeerConnection({ bundlePolicy: 'max-bundle' }); window.sub = new RTCPeerConnection({ bundlePolicy: 'max-bundle' })
    const t = pub.addTransceiver(canvas.captureStream(25).getVideoTracks()[0], { direction: 'sendonly', sendEncodings: [{ rid: 'f', scaleResolutionDownBy: 1 }, { rid: 'h', scaleResolutionDownBy: 2 }, { rid: 'q', scaleResolutionDownBy: 4 }] })
    await pub.setLocalDescription(await pub.createOffer())
    return { sdp: pub.localDescription.sdp, mid: t.mid }
  })
  const pubSession = await api.newSession()
  const published = await api.publish(pubSession, offer.sdp, [{ location: 'local', mid: offer.mid, trackName: 'camera-1' }])
  check('publish answer', published.sessionDescription?.type === 'answer' && !published.tracks?.[0]?.errorCode)
  await page.evaluate(sdp => pub.setRemoteDescription({ type: 'answer', sdp }), published.sessionDescription.sdp)
  const subSession = await api.newSession()
  const pulled = await api.pull(subSession, [{ location: 'remote', sessionId: pubSession, trackName: 'camera-1', simulcast: simulcast('q') }])
  const mid = pulled.tracks?.[0]?.mid
  check('pull offer and mid', pulled.requiresImmediateRenegotiation === true && pulled.sessionDescription?.type === 'offer' && Boolean(mid))
  await api.renegotiate(subSession, await page.evaluate(async sdp => { await sub.setRemoteDescription({ type: 'offer', sdp }); await sub.setLocalDescription(await sub.createAnswer()); return sub.localDescription.sdp }, pulled.sessionDescription.sdp))
  const width = () => page.evaluate(async () => { let w = 0; (await sub.getStats()).forEach(s => { if (s.type === 'inbound-rtp' && s.kind === 'video') w = s.frameWidth ?? 0 }); return w })
  const until = async ok => { for (let i = 0; i < 40; i++) { const w = await width(); if (ok(w)) return true; await new Promise(r => setTimeout(r, 250)) } return false }
  check('layer q arrives', await until(w => w > 0 && w <= 400))
  await api.update(subSession, [{ location: 'remote', mid, sessionId: pubSession, trackName: 'camera-1', simulcast: simulcast('h') }])
  check('layer h after update', await until(w => w > 400 && w <= 800))
  const closeOffer = await page.evaluate(async mid => { sub.getTransceivers().find(t => t.mid === mid).stop(); await sub.setLocalDescription(await sub.createOffer()); return sub.localDescription.sdp }, mid)
  const closed = await api.close(subSession, [mid], closeOffer)
  check('negotiated close answer', closed.sessionDescription?.type === 'answer')
  await page.evaluate(sdp => sub.setRemoteDescription({ type: 'answer', sdp }), closed.sessionDescription.sdp)
  await browser.close()
})().catch(error => { console.error('FAIL', error.message); process.exit(1) })
```

- [ ] **Step 7: Commit.**

```bash
git add backend/src/media
git commit -m "feat: video provider switch and Cloudflare Realtime client, secrets only on the server [skip render]" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Who receives what (pure backend rules)

**Files:**
- Create: `backend/src/media/subscriptions.ts`
- Test: `backend/src/media/subscriptions.test.ts`

**Interfaces:**
- Consumes: `Session` (`getPlayerIds`, `meetingOf`, `featuresFor(uid).speakers.snapshotFor`), `conversationChannelFor` from `office/ConversationAuthorization`, and `Layer` (Task 1).
- Produces:
  - types `MediaKind`, `Publication`, `WantedPull`, `PeerState`, `PeersSnapshot`, `ViewPlayer`, `MediaView`
  - functions `pullKey`, `mediaView`, `desiredPulls`, `diffPulls`, `peersFor`
- A pull key is `${fromUid}|${trackName}`. A republished track gets a new `trackName`, so its key changes.

- [ ] **Step 1: Write the failing test** `backend/src/media/subscriptions.test.ts`:

```ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Session, type Room } from '../session'
import { desiredPulls, diffPulls, mediaView, peersFor, type MediaView, type Publication, type ViewPlayer } from './subscriptions'

const pub = (uid: string, kind: Publication['kind'], extra: Partial<Publication> = {}): Publication => ({ uid, kind, sessionId: `s-${uid}`, trackName: `${kind}-1`, mid: '0', live: true, simulcast: kind === 'camera', ...extra })
const view = (players: Record<string, Partial<ViewPlayer>>): MediaView => new Map(Object.entries(players).map(([uid, p]) => [uid, { conversation: null, moderators: null, speakers: {}, ...p }]))
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
```

- [ ] **Step 2: Run** `cd backend && npx tsc -p .`. Expected: FAIL, because `Cannot find module './subscriptions'`.

- [ ] **Step 3: Implement** `backend/src/media/subscriptions.ts`:

```ts
import type { Session } from '../session'
import { conversationChannelFor } from '../office/ConversationAuthorization'

export type MediaKind = 'mic' | 'camera' | 'screen' | 'speaker'
// One track a person publishes on their send session.
export type Publication = { uid: string, kind: MediaKind, objectId?: string, sessionId: string, trackName: string, mid: string, live: boolean, simulcast: boolean }
export type WantedPull = { key: string, fromUid: string, kind: MediaKind, objectId?: string, sessionId: string, trackName: string, simulcast: boolean }
export type PeerState = { uid: string, mic: boolean, camera: boolean, screen: boolean }
export type PeersSnapshot = { self: string, conversation: string | null, peers: PeerState[], ownScreen: boolean }
// conversation: the channel of the person's verified tile (private area, else proximity group).
// moderators: the stage of the meeting room they are in, null outside one.
export type ViewPlayer = { conversation: string | null, moderators: string[] | null, speakers: Record<string, { ownerUid: string, volume: number }> }
export type MediaView = Map<string, ViewPlayer>

export const pullKey = (publication: Pick<Publication, 'uid' | 'trackName'>) => `${publication.uid}|${publication.trackName}`

export function mediaView(session: Session): MediaView {
    const view: MediaView = new Map()
    for (const uid of session.getPlayerIds()) {
        const meeting = session.meetingOf(uid)
        view.set(uid, { conversation: conversationChannelFor(session, uid), moderators: meeting ? meeting.moderators : null, speakers: session.featuresFor(uid).speakers.snapshotFor(uid) })
    }
    return view
}

// What `uid` must receive now. The same rules that authorized an Agora call: the microphones and cameras of
// your conversation (in a meeting room the audience only gets the stage's cameras), the others' shared
// screens, and every lounge speaker in range. Nothing of your own, nothing from another floor.
export function desiredPulls(view: MediaView, uid: string, publications: Iterable<Publication>): Map<string, WantedPull> {
    const me = view.get(uid)
    const wanted = new Map<string, WantedPull>()
    if (!me) return wanted
    for (const publication of publications) {
        if (publication.uid === uid) continue
        if (publication.kind === 'speaker') {
            const speaker = publication.objectId ? me.speakers[publication.objectId] : undefined
            if (!speaker || speaker.ownerUid !== publication.uid || speaker.volume <= 0) continue
        } else {
            if (!me.conversation || view.get(publication.uid)?.conversation !== me.conversation) continue
            if (publication.kind === 'camera' && me.moderators && !me.moderators.includes(uid) && !me.moderators.includes(publication.uid)) continue
        }
        const key = pullKey(publication)
        const { uid: fromUid, kind, objectId, sessionId, trackName, simulcast } = publication
        wanted.set(key, { key, fromUid, kind, ...(objectId ? { objectId } : {}), sessionId, trackName, simulcast })
    }
    return wanted
}

// `failed`: pulls Cloudflare refused; not retried until the publisher republishes (new key).
export function diffPulls(current: ReadonlyMap<string, unknown>, wanted: ReadonlyMap<string, WantedPull>, failed: ReadonlySet<string> = new Set()): { add: WantedPull[], remove: string[] } {
    return {
        add: [...wanted.values()].filter(pull => !current.has(pull.key) && !failed.has(pull.key)),
        remove: [...current.keys()].filter(key => !wanted.has(key)),
    }
}

// The tiles the page shows: everyone in your conversation, even when their video is not received.
export function peersFor(view: MediaView, uid: string, publications: Publication[]): PeersSnapshot {
    const conversation = view.get(uid)?.conversation ?? null
    const has = (who: string, kind: MediaKind, live: boolean) => publications.some(p => p.uid === who && p.kind === kind && (!live || p.live))
    const peers = !conversation ? [] : [...view]
        .filter(([other, player]) => other !== uid && player.conversation === conversation)
        .map(([other]) => ({ uid: other, mic: has(other, 'mic', true), camera: has(other, 'camera', true), screen: has(other, 'screen', false) }))
        .sort((a, b) => a.uid.localeCompare(b.uid))
    return { self: uid, conversation, peers, ownScreen: Boolean(conversation) && has(uid, 'screen', false) }
}
```

- [ ] **Step 4: Run** the backend suite. Expected: PASS, 102 + 6 = 108 tests.

- [ ] **Step 5: Commit.**

```bash
git add backend/src/media/subscriptions.ts backend/src/media/subscriptions.test.ts
git commit -m "feat: server rules for who receives which track, same as the Agora calls [skip render]" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Media signaling on the server

**Files:**
- Create: `backend/src/media/protocol.ts`, `backend/src/media/MediaSignaling.ts`, `backend/src/media/media.ts`
- Test: `backend/src/media/MediaSignaling.test.ts`
- Modify: `backend/src/sockets/sockets.ts`, `backend/src/sockets/helpers.ts`

**Interfaces:**
- Consumes: Task 1 (`RealtimeApi`, `CloudflareError`, `IceServerCache`, `videoProviderFromEnv`, `MAX_TRACKS_PER_REQUEST`), Task 2 (everything), `SpeakerState.authorize`, `conversationChannelFor`.
- Produces the wire contract below. The frontend mirrors it in Task 4.

| Event | Direction | Payload | Ack |
|---|---|---|---|
| `mediaConfig` | server to page, on every join before `joinedRealm` | `{ provider:'agora' }` or `{ provider:'cloudflare', iceServers, bootstrap }` | none |
| `mediaPeers` | server to page, when it changes | `PeersSnapshot` | none |
| `mediaNegotiate` | server to page, one at a time per person | `{ type:'pull', offer, tracks:[{ mid, fromUid, kind, objectId? }] }`, or `{ type:'close', mids }`, or `{ type:'answer', answer }` | `{ ok:true, answer }` for pull, `{ ok:true, offer }` for close, `{ ok:true }` for answer, or `{ ok:false, error }` |
| `mediaTrackError` | server to page | `{ fromUid, kind }` | none |
| `mediaRestart` | server to page | none | none |
| `mediaPublish` | page to server | `{ kind, objectId?, mid, offer, simulcast }` | `{ ok:true, answer }` |
| `mediaUnpublish` | page to server | `{ kind, objectId?, mid, offer }` | `{ ok:true, answer }` |
| `mediaTrackState` | page to server | `{ kind:'mic' or 'camera', live }` | `{ ok:true }` |
| `mediaLayer` | page to server | `{ fromUid, layer }` | `{ ok:true }` |
| `mediaReset` | page to server | `{}` | `{ ok:true, config }` with `bootstrap: true` |

**What `bootstrap` means.** `true` means the server holds no media state for this connection. That is always the case on a join and after a reset: the page reopens both connections and republishes. `false` is the six-hourly refresh (`CONFIG_REFRESH_MS`): only the ICE servers changed.

**Error replies.**
- Agora mode: `'O vídeo deste escritório usa a Agora.'`
- Bad payload: `'Pedido de vídeo inválido.'`
- Unknown or stale socket: `'Fora do escritório.'`
- Speaker not owned or out of range: `'A caixa de som ficou indisponível.'`
- Screen outside a conversation: `'Aproxime-se de alguém para iniciar uma chamada antes de compartilhar a tela.'`
- A Cloudflare failure: `'Não foi possível conectar o vídeo. Tente novamente.'`

- [ ] **Step 1: Write `backend/src/media/protocol.ts`:**

```ts
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

export type MediaConfig = { provider: 'agora' } | { provider: 'cloudflare', iceServers: IceServer[], bootstrap: boolean }
export type NegotiateStep =
    | { type: 'pull', offer: string, tracks: { mid: string, fromUid: string, kind: MediaKind, objectId?: string }[] }
    | { type: 'close', mids: string[] }
    | { type: 'answer', answer: string }
export const STUN_ONLY: IceServer[] = [{ urls: 'stun:stun.cloudflare.com:3478' }]
export const NEGOTIATE_TIMEOUT_MS = 8000
export const CONFIG_REFRESH_MS = 6 * 60 * 60 * 1000
```

- [ ] **Step 2: Write the failing test** `backend/src/media/MediaSignaling.test.ts`.

The harness, with real code:

```ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Session, type Room } from '../session'
import { CloudflareError, type RealtimeApi } from './CloudflareRealtime'
import { MediaSignaling } from './MediaSignaling'

type Client = ReturnType<typeof fakeClient>
function fakeClient(uid: string) {
    const client = { socketId: `socket-${uid}`, emitted: [] as [string, any][], steps: [] as any[], active: 0, maxActive: 0, delayMs: 0, fail: false,
        emit(event: string, payload: unknown) { client.emitted.push([event, payload]) },
        async ask(_event: string, step: any) {
            client.active++; client.maxActive = Math.max(client.maxActive, client.active); client.steps.push(step)
            await new Promise(resolve => setTimeout(resolve, client.delayMs))
            client.active--
            if (client.fail) throw new Error('timeout')
            return step.type === 'pull' ? { ok: true, answer: `answer-${uid}` } : step.type === 'close' ? { ok: true, offer: `offer-${uid}` } : { ok: true }
        } }
    return client
}

function harness(provider: 'agora' | 'cloudflare' = 'cloudflare', overrides: Partial<RealtimeApi> = {}) {
    const calls: any[][] = []
    let sessions = 0, mids = 100
    const api: RealtimeApi = {
        async newSession() { calls.push(['newSession']); return `s${++sessions}` },
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
    const media = new MediaSignaling({ provider, api: provider === 'cloudflare' ? api : null, iceServers: () => api.iceServers(60), getSession: () => session, schedule: run => queueMicrotask(run), log: line => logs.push(line) })
    const place = async (uid: string, x: number, y: number, floor = 0) => { session.changeRoom(uid, floor, x, y); media.changed(session); await media.idle() }
    const enter = async (uid: string, x: number, y: number, floor = 0) => {
        session.addPlayer(`socket-${uid}`, uid, uid, '009')
        const client = fakeClient(uid); clients.set(uid, client)
        await media.join(uid, client)
        await place(uid, x, y, floor)
        return client
    }
    const publish = (uid: string, kind: string, extra = {}) => media.publish(uid, `socket-${uid}`, { kind, mid: kind, offer: `offer-${kind}`, simulcast: kind === 'camera', ...extra })
    return { media, session, calls, logs, clients, enter, place, publish }
}
```

The test cases. Each one awaits `media.idle()` before asserting.
1. **Agora.**
   - `join` emits exactly `['mediaConfig', { provider: 'agora' }]`.
   - Every handler replies `{ ok:false, error:'O vídeo deste escritório usa a Agora.' }`.
   - `calls` stays empty.
2. **Config.**
   - A Cloudflare join emits `mediaConfig { provider:'cloudflare', iceServers:[turn...], bootstrap:true }`.
   - With `iceServers` throwing, the config has STUN only and `logs` has a line containing `TURN indisponível` and `usando só STUN`.
3. **Publish and pull.**
   - Setup: `ana` at (2,0) and `bia` at (4,0). `ana` publishes `mic` and `camera`.
   - Exactly one `newSession` is made for ana's send session. The track names are unique (`mic-1`, `camera-2`). The ack is `{ ok:true, answer:'answer-offer-mic' }`.
   - `bia`'s client gets one `pull` step whose `tracks` are `[{ mid, fromUid:'ana', kind:'mic' }, { mid, fromUid:'ana', kind:'camera' }]`.
   - The `pull` call carries `simulcast: { preferredRid:'q', priorityOrdering:'none', ridNotAvailable:'asciibetical' }` on the camera only.
   - A `renegotiate` call follows with `answer-bia`.
   - Both clients got a `mediaPeers` snapshot, and bia's lists ana with `mic:true, camera:true`.
4. **Walk away closes.** `bia` moves to (14,0).
   - Her client gets `close` with both mids, then `answer`.
   - The `close` call is `[sid, [{mid},{mid}], 'offer-bia']`.
   - A later re-approach pulls again with new mids.
5. **Authorization.**
   - `caio` stands in the hallway right outside the closed room while `ana` and `dani` are inside. Caio gets no `pull` step for anything of theirs.
   - `publish(..., { kind:'speaker', objectId:'lounge' })` from a non-owner replies `'A caixa de som ficou indisponível.'`.
   - A `screen` publish from someone in no conversation replies with the screen message.
   - `media.layer('bia', 'socket-bia', { fromUid:'caio', layer:'f' })` for a track bia does not receive makes no `update` call.
   - A handler called with the wrong socket id replies `'Fora do escritório.'`.
6. **Training.**
   - Setup: `host` at (5,9) on the stage; `ana` (5,7) and `bia` (6,7) in the audience; everyone publishes `camera` and `mic`.
   - `bia` pulls `host|camera`, `host|mic` and `ana|mic`, but not `ana|camera`.
   - `host` pulls all four of ana's and bia's tracks.
   - `bia` moves to (6,9) and pulls `ana|camera` too.
7. **Layers.**
   - `layer('bia', ..., { fromUid:'ana', layer:'h' })` makes `update` with `[{ location:'remote', mid, sessionId, trackName:'camera-2', simulcast:{ preferredRid:'h', ... } }]`.
   - A second request for `h` makes no new call.
   - A publication with `simulcast:false` never gets `update`, and its pull has no `simulcast` field.
   - After a close and a re-pull, the new pull uses `preferredRid:'h'`.
8. **Never two negotiations at once.**
   - `bia`'s `delayMs` is 20.
   - While her first pull is in flight: `ana` publishes `screen`, `caio` walks up and publishes `mic`, and `ana` unpublishes `mic`.
   - At the end, `bia.maxActive === 1`.
   - Her steps alternate correctly (each `close` is followed by its `answer`).
   - Her pulled set equals `desiredPulls` for the final state.
   - Ana's publish acks resolved while bia's steps were still in flight: the send session's queue is separate.
9. **Failures.**
   - `pull` answers `ana|camera` with `errorCode: 'not_found'`. Bia gets `mediaTrackError { fromUid:'ana', kind:'camera' }` once, and the next `changed()` does not pull it again. After ana republishes the camera (new track name), it is pulled.
   - Any API call throwing `new CloudflareError('gone', 410, 'session_error')` during bia's sync makes bia's client receive `mediaRestart`. Her publications and pulls are dropped, and ana gets `close` for bia's tracks.
   - A client `ask` that throws has the same effect.
10. **Idle unpublish.**
    - `trackState('ana', ..., { kind:'camera', live:false })` makes bia's roster show `camera:false`, and no `close` is sent: the pull is kept.
    - `unpublish('ana', ..., { kind:'camera', mid:'camera', offer:'off' })` replies `{ ok:true, answer:'close-answer' }` after the call `['close', ana's send session, [{mid:'camera'}], 'off']`, and bia gets `close` for that pull.
11. **Leave and reset.**
    - `leave('ana', 'socket-ana')` closes ana's tracks on bia.
    - `leave` with a stale socket id does nothing.
    - `reset` drops ana's state, replies with `config.bootstrap === true`, and the next publish creates a new send session.
    - `refreshConfig()` emits `mediaConfig` with `bootstrap:false` to every Cloudflare connection.

- [ ] **Step 3: Run** `cd backend && npx tsc -p .`. Expected: FAIL, because `Cannot find module './MediaSignaling'`.

- [ ] **Step 4: Implement `MediaSignaling.ts` to this contract.**

```ts
export type MediaClient = { socketId: string, emit(event: string, payload?: unknown): void, ask(event: string, payload: unknown): Promise<any> }
export type MediaAck = { ok: true, answer?: string, config?: MediaConfig } | { ok: false, error: string }
export type MediaSignalingOptions = { provider: 'agora' | 'cloudflare', api: RealtimeApi | null, iceServers: () => Promise<IceServer[]>, getSession: (uid: string) => Session | undefined, schedule?: (run: () => void) => void, log?: (line: string) => void }
export class MediaSignaling {
    constructor(options: MediaSignalingOptions)
    join(uid: string, client: MediaClient): Promise<void>
    leave(uid: string, socketId: string): void
    publish(uid: string, socketId: string, raw: unknown): Promise<MediaAck>
    unpublish(uid: string, socketId: string, raw: unknown): Promise<MediaAck>
    trackState(uid: string, socketId: string, raw: unknown): Promise<MediaAck>
    layer(uid: string, socketId: string, raw: unknown): Promise<MediaAck>
    reset(uid: string, socketId: string, raw?: unknown): Promise<MediaAck>
    changed(session: Session): void          // coalesced: one reconcile per session per scheduled tick
    refreshConfig(): Promise<void>
    idle(): Promise<void>                    // resolves once nothing is scheduled or queued (tests)
}
```

The defaults are `schedule = setImmediate` and `log = console.error`.

Rules:
- **Connections.** There is one connection per uid: `{ uid, client, pub: { sessionId, chain }, sub: { sessionId, chain, pulled: Map<key, { mid, fromUid, kind, objectId?, sessionId, trackName, simulcast, layer }>, failed: Set<key>, syncing, again }, publications: Map<'mic' | 'camera' | 'screen' | 'speaker:<objectId>', Publication>, layers: Map<fromUid, Layer>, lastPeers }`.
  - `join` replaces any older connection of the same uid, without emitting.
  - `leave`, `reset` and restart drop the state: publications, pulled tracks, failed keys, session ids, layers and `lastPeers`. Then they call `changed(session)`.
- **Send session.** Its Cloudflare mutations run one at a time on `pub.chain`. Those of the receive session run on `sub.chain`. The two never wait on each other.
- **`publish`.**
  - It validates with `MediaPublish` and authorizes:
    - `speaker` needs `featuresFor(uid).speakers.authorize(uid, objectId, true)`;
    - `screen` needs `conversationChannelFor(session, uid)`;
    - `mic` and `camera` are always allowed, because people publish once.
  - Then, on `pub.chain`: create the send session if needed, set `trackName = ${kind}${objectId ? '-' + objectId : ''}-${++counter}`, and call `api.publish`.
  - If the track result has an `errorCode`, reply with the Cloudflare error.
  - Otherwise store `{ live: true, simulcast: kind === 'camera' && simulcast }`, replacing an older publication with the same key, call `changed`, and reply `{ ok:true, answer }`.
- **`unpublish`.** It finds the publication by key and mid, then on `pub.chain` calls `api.close(sid, [mid], offer)`, deletes the publication, calls `changed`, and replies with the answer.
- **`trackState`.** It sets `live` and calls `changed`.
- **Reconcile.** `changed(session)` bumps a per-session version and schedules a reconcile. The reconcile:
  - builds `mediaView(session)` once, cached by version;
  - collects every publication of the connections in that session;
  - emits `mediaPeers` to each connection whose `JSON.stringify(peersFor(...))` differs from `lastPeers`;
  - starts each connection's receive sync. A sync already running sets `again`, and the loop runs once more with a fresh view.
- **Receive sync.** It runs inside `sub.chain`.
  1. Compute `diffPulls(pulled, desiredPulls(view, uid, publications), failed)`, and delete from `failed` the keys that are no longer wanted.
  2. Close the removed keys in chunks of `MAX_TRACKS_PER_REQUEST`:
     - ask `{ type:'close', mids }`;
     - delete the entries;
     - call `api.close(sid, mids, reply.offer)`;
     - ask `{ type:'answer', answer }` with the returned answer.
  3. Pull the added ones in chunks:
     - create the receive session if needed;
     - call `api.pull` with `simulcast: { preferredRid: layers.get(fromUid) ?? 'q', priorityOrdering:'none', ridNotAvailable:'asciibetical' }` only when `simulcast` is set;
     - match the response tracks by `sessionId` and `trackName`. For every one with an `errorCode`, add it to `failed` and emit `mediaTrackError { fromUid, kind }`;
     - if `requiresImmediateRenegotiation` is set, ask `{ type:'pull', offer, tracks }` for the tracks that worked, call `api.renegotiate(sid, reply.answer)`, then record them in `pulled` with their layer.
- **Failures.** A thrown `CloudflareError`, a failed or `ok:false` ask, or an ask timeout leads to the same path: log `media: reiniciando ${uid}: ${message}`, drop the connection's state, emit `mediaRestart`, and call `changed`.
- **`layer`.**
  - Validate, then store the layer in `layers`.
  - If `pulled` has a simulcast camera from `fromUid` whose layer differs, call `api.update(sid, [{ location:'remote', mid, sessionId, trackName, simulcast }])` on `sub.chain` and store the layer.
  - Reply `{ ok:true }` in every case.
- **Config.**
  - `join` and `reset` reply or emit `{ provider:'cloudflare', iceServers, bootstrap:true }`.
  - `iceServers()` failing gives `STUN_ONLY` plus the log line from Global Constraints.
  - `refreshConfig` sends the same config with `bootstrap:false` to every connection.

- [ ] **Step 5: Write `backend/src/media/media.ts`:**

```ts
import { sessionManager } from '../session'
import { videoProviderFromEnv } from './config'
import { CloudflareRealtime, IceServerCache } from './CloudflareRealtime'
import { MediaSignaling } from './MediaSignaling'
import { CONFIG_REFRESH_MS } from './protocol'

let instance: MediaSignaling | null = null

// Created on first use, after index.ts loaded the environment.
export function media(): MediaSignaling {
    if (instance) return instance
    const provider = videoProviderFromEnv(process.env)
    const api = provider.provider === 'cloudflare' ? new CloudflareRealtime(provider.credentials) : null
    const turn = api ? new IceServerCache(api) : null
    instance = new MediaSignaling({ provider: provider.provider, api, iceServers: () => turn ? turn.get() : Promise.resolve([]), getSession: uid => sessionManager.getPlayerSession(uid) })
    console.log(`Vídeo pelo provedor ${provider.provider}.`)
    if (api) setInterval(() => { void instance?.refreshConfig() }, CONFIG_REFRESH_MS).unref()
    return instance
}
```

- [ ] **Step 6: Wire the sockets.**
  - **`sockets.ts`:**
    - Import `media` from `'../media/media'` and `NEGOTIATE_TIMEOUT_MS` from `'../media/protocol'`.
    - Call `media()` as the first line of `sockets(io)`.
    - In `join()`, between `sendConversationToken(newSession, uid)` and `socket.emit('joinedRealm', ...)`:

      ```ts
      await media().join(uid, { socketId: socket.id, emit: (event, payload) => socket.emit(event, payload), ask: (event, payload) => socket.timeout(NEGOTIATE_TIMEOUT_MS).emitWithAck(event, payload) })
      ```

      Right after `sendMeeting(newSession, uid)`, add `media().changed(newSession)`.
    - At the end of `broadcastSpeakers`, add `media().changed(session)`.
    - In the disconnect handler, inside `if (success)`, add `media().leave(uid, socket.id)` first.
    - After the `speakerStart`/`speakerStop` loop, add:

      ```ts
      for (const [event, handle] of [['mediaPublish', 'publish'], ['mediaUnpublish', 'unpublish'], ['mediaTrackState', 'trackState'], ['mediaLayer', 'layer'], ['mediaReset', 'reset']] as const) socket.on(event, async (raw: unknown, ack: unknown) => {
          if (typeof ack !== 'function') return
          await officeStepQueue
          ack(await media()[handle](socket.handshake.query.uid as string, socket.id, raw).catch(() => ({ ok: false, error: 'Não foi possível conectar o vídeo. Tente novamente.' })))
      })
      ```
  - **`helpers.ts`:**
    - Import `media`.
    - Add `media().changed(session)` as the last line of `sendProximity` and as the last line of `sendMeeting`. Every step, teleport, seat, focus answer, kick and disconnect already ends in `sendProximity`.
    - In `kickPlayer`, right before `sessionManager.logOutPlayer(uid)`, add `media().leave(uid, player.socketId)`.

- [ ] **Step 7: Run** the backend suite. Expected: PASS, 108 + 11 = 119 tests.

- [ ] **Step 8: Commit.**

```bash
git add backend/src/media backend/src/sockets
git commit -m "feat: server pulls and closes Cloudflare tracks as people move, one negotiation at a time [skip render]" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Frontend protocol, config parser and Cloudflare engine

**Files:**
- Create: `frontend/utils/video-chat/cloudflare/protocol.ts`, `config.ts`, `socket.ts`, `CloudflareEngine.ts`
- Test: `frontend/utils/video-chat/cloudflare/config.test.mjs`, `frontend/utils/video-chat/cloudflare/CloudflareEngine.test.mjs`

**Interfaces:**
- Consumes: the Task 3 wire contract, and `server.socket` from `utils/backend/server`.
- Produces from `protocol.ts`:
  - types `MediaProvider`, `Layer`, `MediaKind`, `IceServer`, `CloudflareMediaConfig`, `MediaConfig`, `PeerState`, `PeersSnapshot`, `RemoteEntry`, `NegotiateStep`, `NegotiateReply`
  - interface `SignalingSocket`
  - constant `SIMULCAST_ENCODINGS`
- Produces `parseMediaConfig` from `config.ts`, and `officeSocket()` and `REQUEST_TIMEOUT_MS` from `socket.ts`.
- Produces from `CloudflareEngine.ts`: `interface MediaEngine`, `type EngineOptions`, `type EngineEvent`, `class CloudflareEngine`, and the constants `IDLE_UNPUBLISH_MS`, `NOTICE_DELAY_MS`, `RECONNECT_GRACE_MS`, `RESTART_RETRY_MS`.

- [ ] **Step 1: Write `protocol.ts`:**

```ts
// Wire format with the office server for the Cloudflare path (mirrors backend/src/media/protocol.ts).
export type MediaProvider = 'agora' | 'cloudflare'
export type Layer = 'f' | 'h' | 'q'
export type MediaKind = 'mic' | 'camera' | 'screen' | 'speaker'
export type IceServer = { urls: string | string[], username?: string, credential?: string }
export type CloudflareMediaConfig = { provider: 'cloudflare', iceServers: IceServer[], bootstrap: boolean }
export type MediaConfig = { provider: 'agora' } | CloudflareMediaConfig
export type PeerState = { uid: string, mic: boolean, camera: boolean, screen: boolean }
export type PeersSnapshot = { self: string, conversation: string | null, peers: PeerState[], ownScreen: boolean }
export type RemoteEntry = { mid: string, fromUid: string, kind: MediaKind, objectId?: string }
export type NegotiateStep = { type: 'pull', offer: string, tracks: RemoteEntry[] } | { type: 'close', mids: string[] } | { type: 'answer', answer: string }
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
```

- [ ] **Step 2: Write the failing config test** `cloudflare/config.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { parseMediaConfig } from './config.ts'

test('agora, and a well formed cloudflare config, are accepted as sent', () => {
    assert.deepEqual(parseMediaConfig({ provider: 'agora', extra: 1 }), { provider: 'agora' })
    const config = { provider: 'cloudflare', bootstrap: true, iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }, { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'], username: 'u', credential: 'c' }] }
    assert.deepEqual(parseMediaConfig(config), config)
})

test('anything malformed is ignored', () => {
    for (const raw of [null, 'cloudflare', { provider: 'zoom' }, { provider: 'cloudflare', iceServers: [] , bootstrap: true }, { provider: 'cloudflare', iceServers: [{ urls: 'http://x' }], bootstrap: true }, { provider: 'cloudflare', iceServers: [{ urls: 'stun:x' }] }, { provider: 'cloudflare', iceServers: [{ urls: 'turn:x', username: 3 }], bootstrap: false }])
        assert.equal(parseMediaConfig(raw), null)
})
```

- [ ] **Step 3: Run** `cd frontend && node --experimental-strip-types --test utils/video-chat/cloudflare/config.test.mjs`. Expected: FAIL (module not found).

- [ ] **Step 4: Write `config.ts` and `socket.ts`:**

```ts
// config.ts
import type { IceServer, MediaConfig } from './protocol'

const iceUrl = (url: unknown) => typeof url === 'string' && /^(stun|turns?):/.test(url)

function iceServer(raw: unknown): IceServer | null {
    const value = raw as { urls?: unknown, username?: unknown, credential?: unknown } | null
    const urls = Array.isArray(value?.urls) ? value!.urls : [value?.urls]
    if (!urls.length || !urls.every(iceUrl)) return null
    if ((value!.username !== undefined && typeof value!.username !== 'string') || (value!.credential !== undefined && typeof value!.credential !== 'string')) return null
    return value as IceServer
}

// The server's word on the provider of this office. Malformed input is ignored: the page keeps what it has.
export function parseMediaConfig(raw: unknown): MediaConfig | null {
    const value = raw as { provider?: unknown, iceServers?: unknown, bootstrap?: unknown } | null
    if (value?.provider === 'agora') return { provider: 'agora' }
    if (value?.provider !== 'cloudflare' || !Array.isArray(value.iceServers) || typeof value.bootstrap !== 'boolean') return null
    const iceServers = value.iceServers.map(iceServer)
    if (!iceServers.length || iceServers.some(server => !server)) return null
    return { provider: 'cloudflare', iceServers: iceServers as IceServer[], bootstrap: value.bootstrap }
}
```

```ts
// socket.ts
import { server } from '../../backend/server'
import type { SignalingSocket } from './protocol'

export const REQUEST_TIMEOUT_MS = 8000

// The office socket, read on every call: a new visit replaces `server.socket`.
export function officeSocket(): SignalingSocket {
    return {
        on: (event, handler) => { server.socket.on(event, handler) },
        off: (event, handler) => { server.socket.off(event, handler) },
        request: async (event, payload, timeoutMs = REQUEST_TIMEOUT_MS) => {
            const reply = await server.socket.timeout(timeoutMs).emitWithAck(event, payload) as { ok?: boolean, error?: string } | undefined
            if (!reply?.ok) throw new Error(reply?.error || 'O servidor recusou o pedido de vídeo.')
            return reply as never
        },
    }
}
```

- [ ] **Step 5: Write the failing engine test** `cloudflare/CloudflareEngine.test.mjs`.
  - Load `CloudflareEngine.ts` with `ts.transpileModule` and run it in `vm`, as `VideoChatDevices.test.mjs` does. Stub `require('./protocol')` with the real `SIMULCAST_ENCODINGS`.
  - Use manual timers (`timers` map plus a `fire(ms)` helper) and an injectable `now`.
  - Fake socket: `{ handlers: Map, requests: [], replies: {}, on, off, async request(event, payload) { requests.push([event, payload]); return (replies[event] ?? (() => ({ ok: true, answer: 'answer' })))(payload) } }`. A test makes a reply slow by returning a promise it resolves later.
  - Fake peer connection, real code:

```js
function fakePc(world) {
    const pc = { transceivers: [], connectionState: 'new', listeners: {}, closed: false, configs: [], localDescription: null, rolledBack: 0, failEncodings: false, singleEncoding: false,
        addEventListener(name, fn) { pc.listeners[name] = fn },
        setState(state) { pc.connectionState = state; pc.listeners.connectionstatechange?.() },
        addTransceiver(track, init = {}) {
            if (init.sendEncodings && pc.failEncodings) throw new Error('sendEncodings unsupported')
            const encodings = init.sendEncodings ? (pc.singleEncoding ? [{}] : init.sendEncodings) : [{}]
            const t = { mid: null, init, stopped: false, sender: { track, replaced: [], async replaceTrack(next) { this.replaced.push(next); this.track = next }, getParameters: () => ({ encodings }) }, receiver: { track: null }, stop() { t.stopped = true } }
            pc.transceivers.push(t); return t
        },
        getTransceivers: () => pc.transceivers,
        async createOffer() { return { type: 'offer', sdp: `offer-${++world.sdp}` } },
        async createAnswer() { return { type: 'answer', sdp: `answer-${++world.sdp}` } },
        async setLocalDescription(d) { if (d.type === 'rollback') { pc.rolledBack++; return } pc.transceivers.forEach((t, i) => { t.mid ??= String(i) }); pc.localDescription = d },
        // A pull offer "mids=3,4" adds a receiving transceiver for each mid it does not have yet.
        async setRemoteDescription(d) { world.order.push(`${pc.role}:${d.type}`); for (const mid of (d.sdp.match(/mids=([\w,]+)/)?.[1] ?? '').split(',').filter(Boolean)) if (!pc.transceivers.some(t => t.mid === mid && !t.stopped)) pc.transceivers.push({ mid, stopped: false, receiver: { track: { id: `track-${mid}-${++world.sdp}` } }, stop() { this.stopped = true } }) },
        setConfiguration(config) { pc.configs.push(config) },
        close() { pc.closed = true },
    }
    return pc
}
```

  - `createPeerConnection` hands out fakes in order, setting `role` to `pub` or `sub`.
  - `step(payload)` calls the `mediaNegotiate` handler and returns a promise of its ack.
  - Tests:
    1. **Publish.**
       - `publish('camera', track)` adds a transceiver with `direction:'sendonly'` and `sendEncodings` equal to f/h/q with scale 1/2/4.
       - It requests `['mediaPublish', { kind:'camera', mid:'0', offer:'offer-1', simulcast:true }]` and applies the answer.
       - `publish('mic', track)` uses no `sendEncodings` and sends `simulcast:false`.
       - `publish('speaker', track, 'lounge')` sends `objectId:'lounge'`.
    2. **Simulcast fallback** (Safari, Firefox).
       - With `failEncodings`, the transceiver is added again without encodings and sends `simulcast:false`.
       - With `singleEncoding`, it sends `simulcast:false`.
       - A rejected `mediaPublish` rolls back, stops the transceiver, and rejects.
    3. **Pull.**
       - `step({ type:'pull', offer:'mids=3,4', tracks:[{ mid:'3', fromUid:'ana', kind:'camera' }, { mid:'4', fromUid:'dj', kind:'speaker', objectId:'lounge' }] })` acks `{ ok:true, answer }`.
       - `remoteTrack('ana','camera')` is the receiver track of mid 3.
       - `receiver('ana','camera')` is that receiver.
       - `remoteSpeakers()` is `['lounge']` and `remoteTrack(null,'speaker','lounge')` is not null.
       - A `tracks` event fired after the answer was set.
    4. **Mid reuse.**
       - Pull `mid 3 = ana camera`, close `[3]` (acks `{ ok:true, offer }`, transceiver stopped), answer, then pull `mid 3 = bia camera`.
       - `remoteTrack('ana','camera')` is null and `remoteTrack('bia','camera')` is the new track.
       - After 50 cycles of pulling and closing different people, `mapping.size` equals the number of open pulls.
    5. **Publish and pull overlap.**
       - While `mediaPublish` is pending, a pull step arrives. It is answered before the publish settles, and `world.order` shows the `offer` on `sub`, never on `pub`.
       - Two steps sent back to back: the second's `setRemoteDescription` runs only after the first ack.
    6. **Pause and resume** within 25 s.
       - `pause('camera')` makes `replaceTrack(null)` and requests `mediaTrackState { kind:'camera', live:false }`.
       - `resume('camera', next)` makes `replaceTrack(next)` and `live:true`, with no second `mediaPublish`.
       - `replaceTrack('mic', other)` while the mic is paused does not touch the sender.
    7. **Idle GC.**
       - After `pause('camera')`, `fire(25000)` requests `mediaUnpublish { kind:'camera', mid:'0', offer }`, stops the transceiver and applies the answer. Then `resume` requests a new `mediaPublish`.
       - Throttled timers: pause, advance `now` by 40000 without firing, and `resume` does `mediaUnpublish` then `mediaPublish`.
    8. **Reconnect.**
       - `sub.setState('failed')` closes both connections, clears `mapping`, emits `tracks`, and requests `mediaReset`.
       - The reply `{ ok:true, config:{ ..., bootstrap:true } }` creates new connections and republishes the live mic.
       - `reconnect-notice` fires only when `fire(3000)` happens before the reply.
       - `reconnected` is emitted.
       - `disconnected` followed by `connected` within 5000 ms does nothing.
       - A `mediaRestart` from the server has the same effect as `failed`.
       - A failing `mediaReset` is retried after 2000 ms.
    9. **Suspend.**
       - `suspend()` closes both connections and sets `connected` to false.
       - `start({ bootstrap:true })` republishes live tracks only (a paused camera is dropped) and emits `reconnected`.
    10. **Refresh.** `start({ bootstrap:false, iceServers:[new] })` calls `setConfiguration` on both connections and creates nothing.
    11. **Stop.**
        - `stop()` removes the four socket handlers.
        - A step delivered afterwards acks `{ ok:false }`.
        - The `peers` and `track-error` events from `mediaPeers` and `mediaTrackError` were forwarded before the stop.

- [ ] **Step 6: Run** the engine test. Expected: FAIL (module not found).

- [ ] **Step 7: Implement `CloudflareEngine.ts` to this contract.**

```ts
export const IDLE_UNPUBLISH_MS = 25_000, NOTICE_DELAY_MS = 3_000, RECONNECT_GRACE_MS = 5_000, RESTART_RETRY_MS = 2_000
export type EngineEvent = { type: 'peers', peers: PeersSnapshot } | { type: 'tracks' } | { type: 'track-error', fromUid: string, kind: MediaKind } | { type: 'reconnect-notice' } | { type: 'reconnected' }
export type EngineOptions = { socket: SignalingSocket, createPeerConnection: (config: RTCConfiguration) => RTCPeerConnection, setTimeout: (callback: () => void, ms: number) => unknown, clearTimeout: (timer: unknown) => void, onEvent: (event: EngineEvent) => void, now?: () => number }
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
export class CloudflareEngine implements MediaEngine { constructor(options: EngineOptions) }
```

Rules:
- **Socket handlers.** The constructor subscribes `mediaNegotiate`, `mediaPeers`, `mediaTrackError` and `mediaRestart`. `stop()` unsubscribes them.
- **Connections.**
  - `pub` and `sub` are created lazily with `{ iceServers, bundlePolicy:'max-bundle' }`.
  - Each listens to `connectionstatechange`: `failed` means restart; `disconnected` starts a `RECONNECT_GRACE_MS` timer that restarts unless the state is `connected` again.
- **Local publications.** They are keyed `mic`, `camera`, `screen` or `speaker:<objectId>`, as `{ kind, objectId, track, transceiver, live, pausedAt, idleTimer }`.
- **Send mutations.** These are publish, unpublish, pause, resume and replaceTrack. They run one at a time on a send queue.
- **Receive steps.** They run one at a time on a separate receive queue.
- **Generation.** A `generation` counter is checked after every await. Work from an older generation stops quietly.
- **`start(config)`.**
  - If `!config.bootstrap` and the engine is running and not suspended, it only calls `setConfiguration({ iceServers })` on both connections.
  - Otherwise it tears down: closes both connections, clears `mapping` (emitting `tracks` if it was non-empty), and bumps the generation. It then stores the config, clears the notice timer, and republishes, in order, every publication whose track is live, dropping the paused ones.
  - If this start follows `suspend()` or a restart, it emits `reconnected`.
- **`connected`** is `running && !suspended`.
- **`publish`.**
  - If the key exists, it does `replaceTrack` and marks the track live.
  - Otherwise the camera uses `addTransceiver(track, { direction:'sendonly', sendEncodings: SIMULCAST_ENCODINGS })`. If that throws, the call is repeated without encodings. Other kinds use `{ direction:'sendonly' }`.
  - Then `createOffer`, then `setLocalDescription`. `simulcast` is true when the kind is camera and `sender.getParameters().encodings.length >= 2`.
  - It requests `mediaPublish { kind, objectId?, mid, offer, simulcast }` and applies the answer with `setRemoteDescription`.
  - On error: roll back, stop the transceiver, delete the key, rethrow.
- **`unpublish`.** It deletes the key, clears the idle timer, stops the transceiver, makes an offer, requests `mediaUnpublish { kind, objectId?, mid, offer }` and applies the answer. On error it rolls back and rethrows.
- **`pause`.** It marks the track not live, sets `pausedAt = now()`, calls `sender.replaceTrack(null)`, requests `mediaTrackState { live:false }` with errors ignored, and arms `IDLE_UNPUBLISH_MS`, which then calls `unpublish(kind)`.
- **`resume`.**
  - With no publication, it publishes.
  - If `now() - pausedAt >= IDLE_UNPUBLISH_MS`, it unpublishes and then publishes.
  - Otherwise it clears the timer, calls `sender.replaceTrack(track)`, marks the track live, and requests `mediaTrackState { live:true }`.
- **`replaceTrack`.** It stores the track, and calls `sender.replaceTrack` only while the track is live.
- **Steps.** Each is acked with `NegotiateReply`; any error, or an engine that is stopped or restarting, acks `{ ok:false, error }`.
  - `pull`: set the remote offer on `sub`, then store each track in `mapping` (overwriting that mid), then create and set the answer, emit `tracks`, and reply with the answer.
  - `close`: delete the mids from `mapping`, stop the transceivers with those mids, emit `tracks`, create and set an offer, and reply with it.
  - `answer`: set the remote answer.
- **Remote lookups.**
  - `remoteTrack` and `receiver` find the `mapping` entry with that kind, the same `fromUid` (or any when `null`) and the same `objectId` (when given), then the `sub` transceiver with that mid. They return null otherwise.
  - `remoteSpeakers()` returns the `objectId`s of speaker entries that have a track.
- **Server events.** `mediaPeers` emits `{ type:'peers' }`. `mediaTrackError` emits `track-error`. `mediaRestart` restarts.
- **`restart()`.** It runs once at a time and only while running. It tears down, arms `NOTICE_DELAY_MS` (which emits `reconnect-notice`), then loops: request `mediaReset` and call `start(reply.config)`, retrying after `RESTART_RETRY_MS` until success, `stop()` or `suspend()`.
- **`suspend()`.** It tears down, sets suspended, and arms the notice timer.
- **`stop()`.** It tears down, clears every timer and publication, sets running to false, and unsubscribes.

- [ ] **Step 8: Run** the full frontend suite. Expected: PASS, 185 + 2 + 11 = 198 tests.

- [ ] **Step 9: Commit.**

```bash
git add frontend/utils/video-chat/cloudflare
git commit -m "feat: Cloudflare engine, simulcast publish and server driven receive with reconnect [skip render]" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Cloudflare video chat with the same interface as today

**Files:**
- Create: `frontend/utils/video-chat/media-chat.ts`
- Create: `frontend/utils/video-chat/cloudflare/layers.ts`, `remote-media.ts`, `CloudflareVideoChat.ts`
- Test: `cloudflare/layers.test.mjs` (1), `cloudflare/remote-media.test.mjs` (3, also exports `fakeDocument`), `cloudflare/CloudflareVideoChat.test.mjs` (9)

**Interfaces:**
- Consumes:
  - Task 4: `MediaEngine`, `EngineOptions`, `EngineEvent`, `CloudflareEngine`, the protocol types, `officeSocket`
  - `AudioPreference` helpers
  - `ChannelArea`
- Produces from `media-chat.ts`:
  - `interface MediaChat`, `interface MediaRemoteUser`, `type SpeakerAudio`, `type PlayableVideo`
  - re-exports of `Layer`, `MediaConfig`, `MediaProvider`
- Produces from `layers.ts`: `LayerRequests` (`request(uid, layer): () => void`, `current(uid): Layer | null`, `clear()`) and `LAYER_DEBOUNCE_MS = 250`.
- Produces from `remote-media.ts`: `RemoteVideo`, `RemoteAudio`, `LocalPreview`, `CloudflareRemoteUser`, `signature`, `SPEAKING_AUDIO_LEVEL`.
- Produces from `CloudflareVideoChat.ts`:
  - `class CloudflareVideoChat implements MediaChat`, with `constructor(config: CloudflareMediaConfig, deps?: ChatDeps)`, `configure(config)`, `requestLayer`, `speakerAudio`, `publishSpeaker`, `unpublishSpeaker`
  - `type ChatDeps`
  - the signal `remote-speakers-changed`

- [ ] **Step 1: Write `media-chat.ts`:**

```ts
import type { MediaPreferences } from './AudioPreference'
import type { ChannelArea } from './subscription-policy'
import type { Layer, MediaConfig } from './cloudflare/protocol'
export type { Layer, MediaConfig, MediaProvider } from './cloudflare/protocol'

export type PlayableVideo = { play(element: string | HTMLElement, config?: { fit?: 'cover' | 'contain' }): void, stop(): void }
// What the tiles read from a remote person; Agora's IAgoraRTCRemoteUser fits it as well.
export interface MediaRemoteUser { uid: string | number, hasAudio: boolean, hasVideo: boolean, videoTrack?: PlayableVideo }
export type SpeakerAudio = { setVolume(volume: number): void, play(): void }

// Everything the screen uses, whichever provider is behind it.
export interface MediaChat {
    toggleCamera(): Promise<boolean>
    toggleMicrophone(): Promise<boolean>
    isMicrophoneMuted(): boolean
    muteMicrophone(): Promise<boolean>
    turnOffCamera(): Promise<boolean>
    getDevicePreferences(): MediaPreferences
    startDeviceMonitoring(): () => void
    listDevices(): Promise<MediaDeviceInfo[]>
    selectMicrophone(deviceId: string): Promise<void>
    selectCamera(deviceId: string): Promise<void>
    selectOutput(deviceId: string): Promise<void>
    readonly outputSupported: boolean
    getRemoteAudio(uid: string): { muted: boolean, volume: number, speaking: boolean }
    setRemoteMuted(uid: string, muted: boolean): void
    setRemoteVolume(uid: string, volume: number): void
    playVideoTrackAtElementId(elementId: string | HTMLElement): void
    showCameraIn(element: HTMLElement): () => void
    readonly isConnected: boolean
    isVideoSubscribed(uid: string): boolean
    rememberToken(channel: string, token: string): void
    startScreenShare(): Promise<void>
    showScreenPreview(element: string | HTMLElement): () => void
    stopScreenShare(): Promise<void>
    joinChannel(channel: string, uid: string, realmId: string, roomIndex: number, area?: ChannelArea | null): Promise<void>
    leaveChannel(): Promise<void>
    requestLayer(uid: string, layer: Layer): () => void
    configure(config: MediaConfig): void
    speakerAudio(objectId: string): SpeakerAudio | null
    publishSpeaker(objectId: string, track: MediaStreamTrack): Promise<void>
    unpublishSpeaker(objectId: string): Promise<void>
    destroy(): void
}
```

- [ ] **Step 2: Write the failing layers test, then `layers.ts`.**

```js
// cloudflare/layers.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { LayerRequests } from './layers.ts'

test('the biggest tile wins, and the last tile going away drops back to q', () => {
    const changes = []
    const layers = new LayerRequests((uid, layer) => changes.push([uid, layer]))
    const strip = layers.request('ana', 'q')
    const meeting = layers.request('ana', 'h')
    const enlarged = layers.request('ana', 'f')
    assert.equal(layers.current('ana'), 'f')
    enlarged(); enlarged()
    meeting()
    strip()
    assert.equal(layers.current('ana'), null)
    assert.deepEqual(changes, [['ana', 'h'], ['ana', 'f'], ['ana', 'h'], ['ana', 'q']])
})
```

```ts
// cloudflare/layers.ts
import type { Layer } from './protocol'

export const LAYER_DEBOUNCE_MS = 250
const RANK: Record<Layer, number> = { q: 0, h: 1, f: 2 }

// Every tile showing someone asks for the layer it needs; the biggest wins. q is what the server sends by default.
export class LayerRequests {
    private readonly requests = new Map<string, Map<number, Layer>>()
    private readonly onChange: (uid: string, layer: Layer) => void
    private next = 0

    constructor(onChange: (uid: string, layer: Layer) => void) { this.onChange = onChange }

    current(uid: string): Layer | null {
        let best: Layer | null = null
        for (const layer of this.requests.get(uid)?.values() ?? []) if (!best || RANK[layer] > RANK[best]) best = layer
        return best
    }

    request(uid: string, layer: Layer): () => void {
        const id = ++this.next
        this.change(uid, () => {
            if (!this.requests.has(uid)) this.requests.set(uid, new Map())
            this.requests.get(uid)!.set(id, layer)
        })
        return () => this.change(uid, () => {
            const mine = this.requests.get(uid)
            mine?.delete(id)
            if (mine && !mine.size) this.requests.delete(uid)
        })
    }

    clear(): void { this.requests.clear() }

    private change(uid: string, edit: () => void) {
        const before = this.current(uid) ?? 'q'
        edit()
        const after = this.current(uid) ?? 'q'
        if (after !== before) this.onChange(uid, after)
    }
}
```

- [ ] **Step 3: Write the failing remote-media test** `remote-media.test.mjs`.
  - It transpiles `remote-media.ts` and runs it with `document`, `MediaStream` (`class { constructor(tracks) { this.tracks = tracks } }`) and a recording `HTMLMediaElement`.
  - It exports `fakeDocument(name)`. That fake document's elements record `children`, `style`, `srcObject`, `volume`, `sinkId`, `played` and `removed`, and support `replaceChildren`, `remove`, `play()` (a resolved promise), `pause()` and `setSinkId(id)`. It also provides `getElementById` over a registry and `ownerDocument`.
  - Tests:
    1. `RemoteVideo`:
       - `play('remote-user-ana', { fit:'contain' })` puts one muted, autoplaying, inline `<video>` with `objectFit: 'contain'` into that element.
       - `play(elementOfOtherDocument)` creates the video with the other document and removes the first one.
       - `setTrack(next)` swaps `srcObject.tracks` to `[next]`.
       - `stop()` removes it.
    2. `RemoteAudio`:
       - `setVolume(57)` sets `volume` to 0.57; `setVolume(250)` sets 1.
       - `setPlaybackDevice('default')` calls `setSinkId('')`, and `'usb'` calls `setSinkId('usb')`.
       - `getVolumeLevel()` returns `receiver.getSynchronizationSources()[0].audioLevel`, and 0 without a receiver.
       - `stop()` clears `srcObject`.
    3. `LocalPreview`:
       - `play(el, track)` is `cover` and mirrored (`scaleX(-1)`).
       - `play(el, track, { fit:'contain', mirror:false })` is not mirrored.
       - `stop()` removes the video.
       - Playing into a missing id does nothing.

- [ ] **Step 4: Write `remote-media.ts`:**

```ts
type Options = { fit?: 'cover' | 'contain', mirror?: boolean }

// RTP audio level is 0 (silence) to 1; normal speech sits well above this.
export const SPEAKING_AUDIO_LEVEL = 0.05

// A container id of this page, or an element of any document (the floating window has its own).
function attach(element: string | HTMLElement, track: MediaStreamTrack, { fit = 'cover', mirror = false }: Options): HTMLVideoElement | null {
    const box = typeof element === 'string' ? document.getElementById(element) : element
    if (!box) return null
    const video = box.ownerDocument.createElement('video')
    video.autoplay = true
    video.muted = true
    video.playsInline = true
    video.srcObject = new MediaStream([track])
    Object.assign(video.style, { width: '100%', height: '100%', objectFit: fit, transform: mirror ? 'scaleX(-1)' : '' })
    box.replaceChildren(video)
    void video.play().catch(() => {})
    return video
}

export class RemoteVideo {
    private track: MediaStreamTrack
    private video: HTMLVideoElement | null = null
    constructor(track: MediaStreamTrack) { this.track = track }
    play(element: string | HTMLElement, config?: { fit?: 'cover' | 'contain' }): void {
        this.video?.remove()
        this.video = attach(element, this.track, { fit: config?.fit ?? 'cover' })
    }
    setTrack(track: MediaStreamTrack): void {
        this.track = track
        if (this.video) this.video.srcObject = new MediaStream([track])
    }
    stop(): void { this.video?.remove(); this.video = null }
}

export class RemoteAudio {
    readonly track: MediaStreamTrack
    private readonly receiver: RTCRtpReceiver | null
    private readonly element: HTMLAudioElement
    constructor(track: MediaStreamTrack, receiver: RTCRtpReceiver | null) {
        this.track = track
        this.receiver = receiver
        this.element = document.createElement('audio')
        this.element.autoplay = true
        this.element.srcObject = new MediaStream([track])
    }
    setVolume(volume: number): void { this.element.volume = Math.max(0, Math.min(100, volume)) / 100 }
    async setPlaybackDevice(deviceId: string): Promise<void> {
        await (this.element as HTMLAudioElement & { setSinkId(id: string): Promise<void> }).setSinkId(deviceId === 'default' ? '' : deviceId)
    }
    play(): void { void this.element.play().catch(() => {}) }
    stop(): void { this.element.pause(); this.element.srcObject = null }
    getVolumeLevel(): number { return this.receiver?.getSynchronizationSources?.()[0]?.audioLevel ?? 0 }
}

// Your own camera (mirrored) or your own shared screen, played from the local track.
export class LocalPreview {
    private video: HTMLVideoElement | null = null
    play(element: string | HTMLElement, track: MediaStreamTrack, options: Options = { fit: 'cover', mirror: true }): void {
        this.stop()
        this.video = attach(element, track, options)
    }
    stop(): void { this.video?.remove(); this.video = null }
}

export class CloudflareRemoteUser {
    readonly uid: string
    hasAudio = false
    hasVideo = false
    videoTrack?: RemoteVideo
    audioTrack?: RemoteAudio
    constructor(uid: string) { this.uid = uid }
}

// What the tiles render from; a change means a `user-info-updated`.
export const signature = (user: CloudflareRemoteUser) => `${user.hasAudio}|${user.hasVideo}|${Boolean(user.videoTrack)}|${Boolean(user.audioTrack)}`
```

- [ ] **Step 5: Write the failing chat test** `CloudflareVideoChat.test.mjs`.
  - Load the module with transpile and `vm`. Stub `../../signal` (it records emits), `../AudioPreference` with the real module (direct import), `./remote-media` with the real transpiled module on `fakeDocument`, and `./layers` with the real module.
  - `./CloudflareEngine`, `./socket` and the default deps are never used.
  - Construct with `new CloudflareVideoChat(config, deps)`, where:
    - `createEngine` returns a fake engine that records calls and holds `onEvent`, with `tracks` and `receivers` maps and `speakers = []`;
    - `socket` records `request`s and the `disconnect` handler;
    - timers are manual;
    - `mediaDevices` returns fake tracks (`stop`, `getSettings`, `readyState:'live'`, `addEventListener`).
  - Tests:
    1. **Lifecycle.**
       - The constructor calls `engine.start(config)` and registers `disconnect`, which calls `suspend()`.
       - `configure({ provider:'cloudflare', ... })` calls `start` again; `configure({ provider:'agora' })` does nothing.
    2. **Peers.**
       - `{ type:'peers', peers:{ self:'me', conversation:'c', peers:[{ uid:'ana', mic:true, camera:true, screen:true }], ownScreen:true } }` emits `user-info-updated` for `ana` (hasAudio and hasVideo true), `ana-screen` and `me-screen`.
       - A second identical event emits nothing.
       - `conversation:null` emits `user-left` three times and `video-channel-left`, and stops a running screen share.
    3. **Tracks.**
       - After `{ type:'tracks' }` with the engine having ana's camera and mic, `isVideoSubscribed('ana')` is true and her audio plays at the stored volume.
       - In the audience case (camera true, no track), `isVideoSubscribed('ana')` is false.
       - `setRemoteMuted('ana', true)` sets her audio to volume 0.
       - `getRemoteAudio('ana').speaking` follows the receiver level.
    4. **Camera.**
       - `toggleCamera()` on returns `false`, calls `resume('camera', track)` and plays the preview in `local-video`.
       - A second toggle returns `true`, calls `pause('camera')` and stops the track.
       - `turnOffCamera()` when off returns `false`.
    5. **Microphone.**
       - The first toggle calls `resume('mic', track)` and returns `false`.
       - The second calls `pause('mic')` and returns `true`.
       - The third calls `resume` with the same track.
       - `muteMicrophone()` is true once, then false.
    6. **Layers.**
       - `requestLayer('ana','h')`, then `requestLayer('ana','f')` within 250 ms, sends one `request('mediaLayer', { fromUid:'ana', layer:'f' })`.
       - Releasing both sends `q`.
       - `{ type:'reconnected' }` sends the current non-q layers again.
    7. **Speakers.**
       - A `tracks` event with `remoteSpeakers()` `['lounge']` makes `speakerAudio('lounge')` volume 0 and playing, and emits `remote-speakers-changed`.
       - The speaker disappearing stops it and emits again.
       - `publishSpeaker('lounge', t)` calls `engine.publish('speaker', t, 'lounge')`.
    8. **Screen.**
       - `startScreenShare()` outside a conversation rejects with "Aproxime-se de alguém...".
       - Inside one, it sets `contentHint` to `'detail'`, publishes `'screen'` and emits `screen-share-changed` true.
       - The track's `ended` event unpublishes and emits false.
       - `showScreenPreview(el)` plays with `objectFit: 'contain'`, not mirrored.
    9. **Notices and destroy.**
       - `track-error` emits `officeFeedback` with "Não foi possível receber a mídia de um participante.".
       - `reconnect-notice` emits `officeNotice { message:'Reconectando o vídeo...', key:'video-reconnecting' }`.
       - `destroy()` calls `engine.stop()`, stops every local and remote track, emits `reset-users`, and removes the `disconnect` handler.
       - A `toggleCamera` pending across `destroy()` rejects with "A chamada foi encerrada." and stops its track.

- [ ] **Step 6: Write `CloudflareVideoChat.ts`.**
  - The header below declares the imports, constants, `ChatDeps`, `browserDeps()` and the first fields.
  - The class body continues with the block from the first draft that starts with `    private camera: MediaStreamTrack | null = null` and ends with the class's closing `}`. It holds the constructor, `configure`, the engine events, `syncRemote`, `syncSpeakers`, layers, devices, screen share and `destroy`. It is kept in the plan right after this task; source: `<scratchpad>/cf-plan-raw.md`, lines 1 to 487.

```ts
import signal from '../../signal'
import { clampRemoteVolume, createWithDeviceFallback, defaultDeviceId, mediaErrorMessage, readMediaPreferences, resolveDevicePreference, saveMediaPreferences, type MediaPreferences } from '../AudioPreference'
import type { Layer, MediaChat, MediaConfig } from '../media-chat'
import type { CloudflareMediaConfig, MediaKind, PeersSnapshot, SignalingSocket } from './protocol'
import { CloudflareEngine, type EngineEvent, type EngineOptions, type MediaEngine } from './CloudflareEngine'
import { LayerRequests, LAYER_DEBOUNCE_MS } from './layers'
import { CloudflareRemoteUser, LocalPreview, RemoteAudio, RemoteVideo, SPEAKING_AUDIO_LEVEL, signature } from './remote-media'
import { officeSocket } from './socket'

const RECEIVE_ERROR = 'Não foi possível receber a mídia de um participante.'
// The f layer; h and q are half and a quarter of it.
const CAMERA_CONSTRAINTS: MediaTrackConstraints = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } }

export type ChatDeps = {
    socket: SignalingSocket
    createEngine: (options: EngineOptions) => MediaEngine
    setTimeout: (callback: () => void, ms: number) => unknown
    clearTimeout: (timer: unknown) => void
    mediaDevices?: Partial<Pick<MediaDevices, 'getUserMedia' | 'getDisplayMedia' | 'enumerateDevices' | 'addEventListener' | 'removeEventListener'>>
}

function browserDeps(): ChatDeps {
    return {
        socket: officeSocket(),
        createEngine: options => new CloudflareEngine(options),
        setTimeout: (callback, ms) => window.setTimeout(callback, ms),
        clearTimeout: timer => window.clearTimeout(timer as number),
        mediaDevices: typeof navigator === 'undefined' ? undefined : navigator.mediaDevices,
    }
}

// Same surface as the Agora class. The server decides what this page receives; it only sends and plays.
export class CloudflareVideoChat implements MediaChat {
    private readonly deps: ChatDeps
    private readonly engine: MediaEngine
    private readonly users = new Map<string, CloudflareRemoteUser>()
    private readonly speakers = new Map<string, RemoteAudio>()
    private peers: PeersSnapshot | null = null
    private microphone: MediaStreamTrack | null = null
    private microphoneMuted = false
    // ...the body continues with the preserved block (from `private camera` to the closing brace).
```

- [ ] **Step 7: Run the full frontend suite.** Command: `cd frontend && npx tsc --noEmit --incremental false && node --experimental-strip-types --test $(find . -name "*.test.mjs" -not -path "./node_modules/*" -not -path "./.next/*")`. Expected: PASS, with 198 + 13 = 211 tests: 1 in `layers`, 3 in `remote-media` and 9 in `CloudflareVideoChat`. `remote-media.test.mjs` exports `fakeDocument`, so it runs both as a test file and as a helper; that is fine.

- [ ] **Step 8: Commit.**

```bash
git add frontend/utils/video-chat/media-chat.ts frontend/utils/video-chat/cloudflare
git commit -m "feat: Cloudflare video chat with the same interface as today, layers asked by tiles [skip render]" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Provider router, Agora class move and UI wiring

**Files:**
- Create: `frontend/utils/video-chat/agora-video-chat.ts`. Move the whole current `video-chat.ts` here. Rename the class to `AgoraVideoChat implements MediaChat` and remove the `export const videoChat` singleton.
- Modify: `frontend/utils/video-chat/video-chat.ts` (it becomes the router)
- Test: create `frontend/utils/video-chat/video-chat-router.test.mjs`; modify `frontend/utils/video-chat/VideoChatDevices.test.mjs`
- Modify: `frontend/utils/backend/server.ts`, `frontend/utils/backend/server.test.mjs`
- Modify: `frontend/components/VideoChat/useRemoteUsers.ts`, `frontend/components/VideoChat/VideoBar.tsx`, `frontend/components/VideoChat/FloatingCall.tsx`

**Interfaces:**
- Consumes: `MediaChat` (Task 5), `CloudflareVideoChat` (Task 5), `parseMediaConfig` (Task 4).
- Produces from `video-chat.ts`: `class VideoChatRouter implements MediaChat` with:
  - `get provider(): MediaProvider`
  - `useProvider(config: MediaConfig): void`
  - `export const videoChat`, the same import path for every caller
  - `export type { MediaRemoteUser }`
- Produces from `server.ts`: forwards every valid `mediaConfig` socket message as `signal.emit('mediaConfig', config)`.

- [ ] **Step 1: Write the failing router test** `frontend/utils/video-chat/video-chat-router.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const transpile = file => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText

function load() {
    const listeners = new Map(), signals = [], made = []
    const fake = (provider, config) => {
        const chat = {
            provider, config, calls: [], destroyed: false, outputSupported: true, isConnected: false,
            playVideoTrackAtElementId(element) { chat.calls.push(['play', element]) },
            startDeviceMonitoring() { chat.calls.push(['monitor']); return () => chat.calls.push(['unmonitor']) },
            configure(next) { chat.calls.push(['configure', next.provider]) },
            destroy() { chat.destroyed = true },
            async toggleCamera() { chat.calls.push(['camera']); return false },
        }
        made.push(chat)
        return chat
    }
    const exports = {}
    vm.runInNewContext(transpile('./video-chat.ts'), { exports, require: name => {
        if (name === '../signal') return { __esModule: true, default: { on: (event, fn) => listeners.set(event, fn), off() {}, emit: (event, data) => signals.push([event, data]) } }
        if (name === './agora-video-chat') return { AgoraVideoChat: function () { return fake('agora') } }
        if (name === './cloudflare/CloudflareVideoChat') return { CloudflareVideoChat: function (config) { return fake('cloudflare', config) } }
        throw new Error(`Unexpected import: ${name}`)
    } })
    return { chat: exports.videoChat, made, signals, config: value => listeners.get('mediaConfig')(value) }
}
const cloudflare = { provider: 'cloudflare', iceServers: [{ urls: 'stun:x:1' }], bootstrap: true }

test('Agora until the server says otherwise, created once and only when used', async () => {
    const env = load()
    assert.equal(env.made.length, 0)
    await env.chat.toggleCamera()
    await env.chat.toggleCamera()
    assert.equal(env.made.length, 1)
    assert.equal(env.chat.provider, 'agora')
})

test('switching to Cloudflare turns the old devices off and moves preview and monitoring over', async () => {
    const env = load()
    env.chat.playVideoTrackAtElementId('local-meeting-video')
    env.chat.startDeviceMonitoring()
    env.config(cloudflare)
    const [agora, next] = env.made
    assert.equal(agora.destroyed, true)
    assert.equal(next.provider, 'cloudflare')
    assert.deepEqual(next.config, cloudflare)
    assert.deepEqual(next.calls, [['play', 'local-meeting-video'], ['monitor']])
    assert.deepEqual(env.signals, [['local-camera-changed', true], ['local-microphone-changed', true]])
    env.config(cloudflare)
    assert.equal(env.made.length, 2, 'same provider: reconfigured, not recreated')
    assert.deepEqual(next.calls.at(-1), ['configure', 'cloudflare'])
    env.config({ provider: 'agora' })
    assert.equal(env.made[1].destroyed, true)
    assert.equal(env.made[2].provider, 'agora')
})

test('the floating window borrows the preview and gives it back only if it still has it', () => {
    const env = load()
    const element = { id: 'floating' }
    const giveBack = env.chat.showCameraIn(element)
    giveBack()
    assert.deepEqual(env.made[0].calls.map(call => call[1]), [element, 'local-video'])
    const again = env.chat.showCameraIn(element)
    env.chat.playVideoTrackAtElementId('local-meeting-video')
    again()
    assert.equal(env.made[0].calls.at(-1)[1], 'local-meeting-video')
})

test('after destroy the current provider comes back with the last configuration', () => {
    const env = load()
    env.config(cloudflare)
    env.chat.destroy()
    void env.chat.toggleCamera()
    assert.equal(env.made.at(-1).provider, 'cloudflare')
    assert.deepEqual(env.made.at(-1).config, cloudflare)
})
```

- [ ] **Step 2: Run** `cd frontend && node --experimental-strip-types --test utils/video-chat/video-chat-router.test.mjs`. Expected: FAIL (`exports.videoChat.provider` is undefined, and `Unexpected import: agora-rtc-sdk-ng`).

- [ ] **Step 3: Move the Agora class.** Run `git mv frontend/utils/video-chat/video-chat.ts frontend/utils/video-chat/agora-video-chat.ts`. Then edit `agora-video-chat.ts`:
  - Change `export class VideoChat {` to `export class AgoraVideoChat implements MediaChat {`, and add `import type { MediaChat } from './media-chat'`.
  - Delete the last line, `export const videoChat = new VideoChat()`.
  - Add these members (Agora keeps its own behaviour; these are the Cloudflare-only parts of the interface):

```ts
    // Agora sends one layer; the tiles' requests only matter for Cloudflare.
    public requestLayer(): () => void { return () => {} }
    public configure(): void {}
    public speakerAudio(): null { return null }
    public async publishSpeaker(): Promise<void> { throw new Error('A caixa de som usa a Agora neste modo.') }
    public async unpublishSpeaker(): Promise<void> {}
```

  - Change the `joinChannel` signature to return `Promise<void>`: make it `public async joinChannel(...)`. Its body stays as it is (it already returns nothing; the timer work is unchanged).

In `VideoChatDevices.test.mjs`, change exactly two lines:
- `const source = transpile('./video-chat.ts')` becomes `const source = transpile('./agora-video-chat.ts')`;
- `return { chat: exports.videoChat,` becomes `return { chat: new exports.AgoraVideoChat(),`.

- [ ] **Step 4: Write the router** `frontend/utils/video-chat/video-chat.ts`:

```ts
import signal from '../signal'
import { AgoraVideoChat } from './agora-video-chat'
import { CloudflareVideoChat } from './cloudflare/CloudflareVideoChat'
import type { Layer, MediaChat, MediaConfig, MediaProvider } from './media-chat'
import type { CloudflareMediaConfig } from './cloudflare/protocol'
import type { MediaPreferences } from './AudioPreference'
import type { ChannelArea } from './subscription-policy'

export type { MediaRemoteUser } from './media-chat'

type Factories = { agora: () => MediaChat, cloudflare: (config: CloudflareMediaConfig) => MediaChat }

// The screen talks to `videoChat`; the server's mediaConfig decides whether Agora or Cloudflare is behind it.
export class VideoChatRouter implements MediaChat {
    private readonly factories: Factories
    private impl: MediaChat | null = null
    private current: MediaProvider = 'agora'
    private lastConfig: CloudflareMediaConfig | null = null
    private cameraElement: string | HTMLElement = 'local-video'
    private monitoring = false
    private stopImpl: (() => void) | null = null

    constructor(factories: Factories) {
        this.factories = factories
        signal.on('mediaConfig', (config: MediaConfig) => this.useProvider(config))
    }

    get provider(): MediaProvider { return this.current }

    private get chat(): MediaChat {
        if (!this.impl) this.impl = this.current === 'cloudflare' && this.lastConfig ? this.factories.cloudflare(this.lastConfig) : this.factories.agora()
        return this.impl
    }

    useProvider(config: MediaConfig): void {
        if (config.provider === 'cloudflare') this.lastConfig = config
        if (config.provider === this.current && this.impl) { this.impl.configure(config); return }
        const previous = this.impl
        this.impl = null
        this.current = config.provider
        if (previous) {
            previous.destroy()
            // The camera and microphone of the old provider are gone: the buttons go back to off.
            signal.emit('local-camera-changed', true)
            signal.emit('local-microphone-changed', true)
        }
        const next = this.chat
        next.playVideoTrackAtElementId(this.cameraElement)
        if (this.monitoring) this.stopImpl = next.startDeviceMonitoring()
    }

    toggleCamera(): Promise<boolean> { return this.chat.toggleCamera() }
    toggleMicrophone(): Promise<boolean> { return this.chat.toggleMicrophone() }
    isMicrophoneMuted(): boolean { return this.chat.isMicrophoneMuted() }
    muteMicrophone(): Promise<boolean> { return this.chat.muteMicrophone() }
    turnOffCamera(): Promise<boolean> { return this.chat.turnOffCamera() }
    getDevicePreferences(): MediaPreferences { return this.chat.getDevicePreferences() }
    startDeviceMonitoring(): () => void {
        this.stopImpl?.()
        this.monitoring = true
        this.stopImpl = this.chat.startDeviceMonitoring()
        return () => { this.monitoring = false; this.stopImpl?.(); this.stopImpl = null }
    }
    listDevices(): Promise<MediaDeviceInfo[]> { return this.chat.listDevices() }
    selectMicrophone(deviceId: string): Promise<void> { return this.chat.selectMicrophone(deviceId) }
    selectCamera(deviceId: string): Promise<void> { return this.chat.selectCamera(deviceId) }
    selectOutput(deviceId: string): Promise<void> { return this.chat.selectOutput(deviceId) }
    get outputSupported(): boolean { return this.chat.outputSupported }
    getRemoteAudio(uid: string) { return this.chat.getRemoteAudio(uid) }
    setRemoteMuted(uid: string, muted: boolean): void { this.chat.setRemoteMuted(uid, muted) }
    setRemoteVolume(uid: string, volume: number): void { this.chat.setRemoteVolume(uid, volume) }
    playVideoTrackAtElementId(elementId: string | HTMLElement): void { this.cameraElement = elementId; this.chat.playVideoTrackAtElementId(elementId) }
    // The floating call window lives in another document; the returned function gives the preview back.
    showCameraIn(element: HTMLElement): () => void {
        const previous = this.cameraElement
        this.playVideoTrackAtElementId(element)
        return () => { if (this.cameraElement === element) this.playVideoTrackAtElementId(previous) }
    }
    get isConnected(): boolean { return this.chat.isConnected }
    isVideoSubscribed(uid: string): boolean { return this.chat.isVideoSubscribed(uid) }
    rememberToken(channel: string, token: string): void { this.chat.rememberToken(channel, token) }
    startScreenShare(): Promise<void> { return this.chat.startScreenShare() }
    showScreenPreview(element: string | HTMLElement): () => void { return this.chat.showScreenPreview(element) }
    stopScreenShare(): Promise<void> { return this.chat.stopScreenShare() }
    joinChannel(channel: string, uid: string, realmId: string, roomIndex: number, area: ChannelArea | null = null): Promise<void> { return this.chat.joinChannel(channel, uid, realmId, roomIndex, area) }
    leaveChannel(): Promise<void> { return this.chat.leaveChannel() }
    requestLayer(uid: string, layer: Layer): () => void { return this.chat.requestLayer(uid, layer) }
    configure(config: MediaConfig): void { this.useProvider(config) }
    speakerAudio(objectId: string) { return this.chat.speakerAudio(objectId) }
    publishSpeaker(objectId: string, track: MediaStreamTrack): Promise<void> { return this.chat.publishSpeaker(objectId, track) }
    unpublishSpeaker(objectId: string): Promise<void> { return this.chat.unpublishSpeaker(objectId) }
    destroy(): void {
        this.impl?.destroy()
        this.impl = null
        this.stopImpl = null
        this.monitoring = false
        this.cameraElement = 'local-video'
    }
}

export const videoChat = new VideoChatRouter({
    agora: () => new AgoraVideoChat(),
    cloudflare: config => new CloudflareVideoChat(config),
})
```

- [ ] **Step 5: Forward `mediaConfig` in `frontend/utils/backend/server.ts`.**
  - Add `import signal from '../signal'` and `import { parseMediaConfig } from '../video-chat/cloudflare/config'`.
  - Inside `connect()`, right before `this.socket.on('connect', ...)`, add:
    ```ts
            // Sent by the server on every join, before joinedRealm: which video provider the office uses now.
            this.socket.on('mediaConfig', (raw: unknown) => {
                const config = parseMediaConfig(raw)
                if (config) signal.emit('mediaConfig', config)
            })
    ```
  - In `server.test.mjs`, add two stubs to the `require` switch: `if (name === '../signal') return { __esModule: true, default: { emit() {} } }` and `if (name === '../video-chat/cloudflare/config') return { parseMediaConfig: () => null }`.

- [ ] **Step 6: UI wiring.** Exactly these edits; nothing else in the components changes.
  - `components/VideoChat/useRemoteUsers.ts`:
    - Replace `import { IAgoraRTCRemoteUser } from 'agora-rtc-sdk-ng'` with `import type { MediaRemoteUser } from '@/utils/video-chat/media-chat'`.
    - Replace every `IAgoraRTCRemoteUser` with `MediaRemoteUser`, in the interface field `user` and in both handler parameters.
    - Change the first comment line to `// People currently in the conversation, shared by the meeting view and the floating window.`
  - `components/VideoChat/VideoBar.tsx`, in `RemoteUser`, right after the effect that calls `videoTrack?.play(...)`:
    ```tsx
        // Small strip tiles receive the lowest layer, the expanded meeting the middle one, an enlarged tile the full one.
        useEffect(() => {
            if (isScreen || !showVideo || floating) return
            return videoChat.requestLayer(user.uid, expanded ? 'f' : meetingMode ? 'h' : 'q')
        }, [isScreen, showVideo, floating, expanded, meetingMode, user.uid])
    ```
  - `components/VideoChat/FloatingCall.tsx`, in `FloatingPerson`, right after the effect that plays the video:
    ```tsx
        // Bubbles of the slim strip are tiny (q); the full floating window shows the middle layer (h).
        useEffect(() => {
            if (!user.cameraEnabled || !user.videoSubscribed) return
            return videoChat.requestLayer(user.uid, compact ? 'q' : 'h')
        }, [user.uid, user.cameraEnabled, user.videoSubscribed, compact])
    ```
  - `app/hooks/useVideoChat.tsx`, `PlayNavbar.tsx`, `DeviceSettings.tsx`, `Player.ts` and `PlayApp.ts` keep importing `videoChat` from `video-chat` and do not change.

- [ ] **Step 7: Run the full frontend suite.** Command: `cd frontend && npx tsc --noEmit --incremental false && node --experimental-strip-types --test $(find . -name "*.test.mjs" -not -path "./node_modules/*" -not -path "./.next/*")`. Expected: PASS. All 25 tests in `VideoChatDevices.test.mjs` still pass against `AgoraVideoChat`, `server.test.mjs` and `reconnect.test.mjs` pass, and the 4 router tests are new.

- [ ] **Step 8: Commit.**

```bash
git add frontend
git commit -m "feat: the office picks Agora or Cloudflare from the server, tiles ask for the layer they show [skip render]" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Speakers over Cloudflare

**Files:**
- Modify: `frontend/utils/video-chat/SpatialAudio.ts`
- Test: `frontend/utils/video-chat/SpatialAudio.test.mjs` (existing stubs plus new tests)

**Interfaces:**
- Consumes:
  - `videoChat.provider`, `videoChat.speakerAudio(objectId)`, `videoChat.publishSpeaker(objectId, track)` and `videoChat.unpublishSpeaker(objectId)` (Task 6)
  - the signal `remote-speakers-changed` (Task 5)
  - the server-side speaker authorization in `MediaSignaling.publish` (Task 3)
- Produces: the same `spatialAudio` API (`update`, `start`, `stop`, `setMuted`, `refreshOutput`, `destroy`). In Cloudflare mode there is no Agora client and no `generateSpeakerToken` call.

- [ ] **Step 1: Write the failing tests.** In `SpatialAudio.test.mjs`, change the `load` signature to `function load({ micError, provider = 'agora' } = {})`, and add `const speakerCalls = [], handles = {}, signalHandlers = new Map()` to the harness. Then change two stubs:

```js
      if (name === '../signal') return { emit() {}, on: (event, fn) => signalHandlers.set(event, fn) }
      if (name === './video-chat') return { videoChat: { provider, outputSupported: false, getDevicePreferences: () => ({ microphoneId: 'usb-mic' }),
        speakerAudio: id => handles[id] ?? null,
        publishSpeaker: async (id, track) => { speakerCalls.push(['publish', id, track === media]) },
        unpublishSpeaker: async id => { speakerCalls.push(['unpublish', id]) } } }
```

Return `speakerCalls`, `handles` and `signalHandlers` from `load`. Then append:

```js
test('with Cloudflare the speaker is published through the office connection, never through an Agora client', async () => {
  const env = load({ provider: 'cloudflare' })
  const start = env.audio.start('lounge-speaker')
  await env.waitStart()
  env.acknowledge()
  await start
  assert.deepEqual(env.speakerCalls, [['publish', 'lounge-speaker', true]])
  assert.equal(env.clients.length, 0)
  await env.audio.stop()
  assert.deepEqual(env.speakerCalls.at(-1), ['unpublish', 'lounge-speaker'])
  assert.ok(env.commands.includes('speakerStop'))
})

test('with Cloudflare each speaker plays at the volume of where you stand, and silent when muted', () => {
  const env = load({ provider: 'cloudflare' })
  const volumes = []
  env.handles['lounge-speaker'] = { setVolume: value => volumes.push(value), play() {} }
  env.audio.update({ 'lounge-speaker': { ownerUid: 'dj', channel: 'speaker-1', volume: 67 } }, 'me')
  assert.deepEqual(volumes, [67])
  env.audio.setMuted(true)
  assert.deepEqual(volumes, [67, 0])
  env.audio.setMuted(false)
  env.signalHandlers.get('remote-speakers-changed')()
  assert.deepEqual(volumes, [67, 0, 67, 67])
  assert.equal(env.clients.length, 0, 'listening needs no Agora client either')
})
```

- [ ] **Step 2: Run** `cd frontend && node --experimental-strip-types --test utils/video-chat/SpatialAudio.test.mjs`. Expected: the two new tests FAIL. The first gets `clients.length` 1 and no publish; the second records no volumes. The five existing tests PASS.

- [ ] **Step 3: Modify `SpatialAudio.ts`.**
  1. Make the Agora fields optional: `type Publication = { objectId: string, client: IAgoraRTCClient | null, stream: MediaStream, track?: ILocalAudioTrack, cloudflare: boolean, cancelled: boolean, authorized: boolean, reservationRequested: boolean, reservationReleased: boolean }`.
  2. Add a constructor and a helper to the class:

```ts
    constructor() {
        // A speaker track arrived or changed on the Cloudflare connection: give it its volume.
        signal.on('remote-speakers-changed', () => this.applyCloudflareVolumes())
    }

    private applyCloudflareVolumes() {
        if (videoChat.provider !== 'cloudflare') return
        for (const [id, state] of Object.entries(this.snapshot)) {
            const audio = videoChat.speakerAudio(id)
            if (!audio) continue
            audio.setVolume(this.muted ? 0 : state.volume)
            audio.play()
        }
    }
```

  3. In `update`, keep the first two lines (snapshot, and the stop when ownership was lost), then branch:

```ts
        if (videoChat.provider === 'cloudflare') {
            // The server pulls the speakers in range into the office connection; only the volumes are set here.
            for (const [id, listener] of this.listeners) this.removeListener(id, listener)
            this.applyCloudflareVolumes()
        } else {
            /* the two existing loops over this.listeners and Object.entries(snapshot), unchanged */
        }
        signal.emit('officeSpeakerState', snapshot)
```

  4. In `start`:
     - Create the Agora client only for Agora: `const cloudflare = videoChat.provider === 'cloudflare'` and `const client = cloudflare ? null : AgoraRTC.createClient({ codec: 'vp8', mode: 'rtc' })`.
     - Build the publication with `client, cloudflare`.
     - After `current.authorized = true` and the cancelled check, add:

```ts
            if (cloudflare) {
                await videoChat.publishSpeaker(objectId, audio)
                if (current.cancelled) throw new Error('Compartilhamento cancelado.')
            } else {
                /* the existing generateSpeakerToken / client.join / createCustomAudioTrack / publish / token renewal block, with `client!` */
            }
```

     The `officeNotice` after that block stays as it is.
  5. In `stopPublication`, replace the `client.leave` line with:

```ts
        if (publication.cloudflare) await videoChat.unpublishSpeaker(publication.objectId).catch(() => {})
        else if (publication.client && publication.client.connectionState !== 'DISCONNECTED') await publication.client.leave().catch(() => {})
```

  6. In `setMuted`, after the listeners loop, call `this.applyCloudflareVolumes()`.
  7. `refreshOutput` is unchanged, because `CloudflareVideoChat.selectOutput` already moves the speaker audio to the new output.

- [ ] **Step 4: Run** the full frontend suite (command in Global Constraints). Expected: PASS, with 7 tests in `SpatialAudio.test.mjs`.

- [ ] **Step 5: Commit.**

```bash
git add frontend/utils/video-chat/SpatialAudio.ts frontend/utils/video-chat/SpatialAudio.test.mjs
git commit -m "feat: lounge speaker and stage microphone over Cloudflare, volume by position as before [skip render]" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Local end-to-end verification (controller)

**Files:**
- Temporary (reverted at the end): `frontend/app/play/PixiApp.tsx`. Add `;(window as any).__playApp = app; (window as any).__videoChat = videoChat; (window as any).__spatialAudio = spatialAudio` right after `await app.init()`, with the two imports.
- Scratchpad only (`<scratchpad>` as in Task 1):
  - `cf-realm.cjs`, a copy of `floor2-realm.cjs` that reads `cf-map.json` and names the realm `Teste vídeo Cloudflare (descartável)`
  - `cf-map.json`
  - `floor2-driver.cjs`, reused as is
  - `cleanup-floor2.cjs`, reused as is (it reads `state.json`)

**Interfaces:**
- Consumes everything above.
- Produces a written report in the controller's message: each check with pass or fail, latency samples, screenshots in `<scratchpad>`.

- [ ] **Step 1: Prepare.**
  1. `node scripts/matte-office-map.mjs > <scratchpad>/cf-map.json`, then `node <scratchpad>/cf-realm.cjs` (this writes `state.json`).
  2. Check that the four variables exist without printing them: `node -e "console.log(['CLOUDFLARE_SFU_APP_ID','CLOUDFLARE_SFU_APP_SECRET','CLOUDFLARE_TURN_KEY_ID','CLOUDFLARE_TURN_API_TOKEN'].map(k=>k+':'+Boolean(process.env[k])).join(' '))"`.
  3. Backend: `cd backend && npx tsc -p . && VIDEO_PROVIDER=cloudflare FRONTEND_URL=http://localhost:3000 PORT=3001 node dist/index.js > <scratchpad>/backend.log 2>&1` (in the background).
  4. Frontend: `cd frontend && NEXT_PUBLIC_BACKEND_URL=http://localhost:3001 npx next build && npx next start -p 3000 > <scratchpad>/frontend.log 2>&1` (in the background).
  5. Driver: `node <scratchpad>/floor2-driver.cjs` (port 3999).
  6. Open guests `ana`, `bia`, `caio` with `http://localhost:3000/play/<realmId>?shareId=<shareId>` from `state.json`.
  7. The driver must never receive the production realm id or share link.

- [ ] **Step 2: Provider and baseline.**
  - In every page, `__videoChat.provider === 'cloudflare'`.
  - `backend.log` has no "usando agora" or "TURN indisponível" line.
  - Turn on camera and mic for `ana` and `bia` with `await __videoChat.toggleCamera(); await __videoChat.toggleMicrophone()`.

- [ ] **Step 3: Proximity latency** (spec criterion 1, target about 0.5 s). `bia` stands at the spawn (25, 18). `ana` stands 6 tiles away, then walks 3 tiles toward her. In `ana`'s page, time from the moment `__playApp.proximityId` turns non-null to the first frame of `#remote-user-<biaUid> video` (`videoWidth > 0 && currentTime > 0`), polling with `requestAnimationFrame`. Repeat 5 times (walk away 8 tiles in between).
  - Report every sample and the median. Pass: median ≤ 600 ms on localhost. Agora is about 1900 ms.
  - Also check that after walking away, within 2 s, the tile disappears, and `backend.log` and the `mediaNegotiate` close steps show the mids closed.

- [ ] **Step 4: Private rooms** (criterion 2).
  - `ana` inside 1:1 room 1 (56, 24), `bia` in the hallway right outside (56, 18), `caio` inside with `ana` (57, 24).
  - `bia` sees no tiles, and `__videoChat.impl.engine.mapping.size === 0` on her page.
  - `ana` and `caio` receive each other.
  - Repeat with the Diretoria (80, 24).

- [ ] **Step 5: Training** (criterion 3).
  - `ana` on the stage (64, 3); `bia` and `caio` in the audience, (60, 8) and (62, 8); all cameras on.
  - `bia` receives `ana`'s camera and mic plus `caio`'s mic, but not `caio`'s camera: her mapping has no `{ fromUid: caio, kind: 'camera' }`.
  - `ana` receives both cameras.
  - `bia` steps onto the stage (66, 3): within 2 s she receives `caio`'s camera.

- [ ] **Step 6: Screen share** (criterion 4).
  - In `ana`'s page, override `navigator.mediaDevices.getDisplayMedia = c => navigator.mediaDevices.getUserMedia({ video: true })`, then call `__videoChat.startScreenShare()` while near `bia`.
  - `bia` sees "Tela de ana".
  - `ana`'s own screen tile plays the local track, and her mapping has no screen entry.
  - Stop the share: the tile goes away.

- [ ] **Step 7: Speaker** (criterion 5).
  - `ana` at (13, 5) runs `__spatialAudio.start('lounge-speaker', 'microphone')`.
  - `bia` at (16, 5) has `__videoChat.speakerAudio('lounge-speaker')` set, with an `<audio>` volume around 0.57.
  - `caio` at (25, 18) has none.
  - `bia` walks to (19, 5): the volume drops; at (21, 5) the speaker is closed.

- [ ] **Step 8: Floor change** (criterion 6). `ana` and `bia` are talking; `ana` takes the stairs (51, 26). Within 2 s both mappings drop the other.

- [ ] **Step 9: Off means not sending** (criterion 7).
  - Read `ana`'s `__videoChat.impl.engine.pub.getStats()` `outbound-rtp` `bytesSent` per track, toggle the camera off, read again after 3 s: the camera's bytesSent must not grow.
  - After 25 s, `bia`'s tile shows the avatar, and the `mediaUnpublish` for the camera mid appears in `backend.log` or on the socket.
  - Camera on again: `bia` sees the video within 1 s.
  - Same check for the mic.

- [ ] **Step 10: Reconnect.**
  - `await context.setOffline(true)` for `ana` for 8 s, then back online.
  - "Reconectando o vídeo..." or the office reconnect notice appears.
  - Within 10 s of going back online, `bia` sees and hears `ana` again.
  - Take a screenshot of each notice.

- [ ] **Step 11: Fallbacks.**
  - Restart the backend without `VIDEO_PROVIDER`: after the pages reconnect, `__videoChat.provider === 'agora'`.
  - Restart with `VIDEO_PROVIDER=cloudflare` and `CLOUDFLARE_TURN_API_TOKEN=` (empty): the log says `VIDEO_PROVIDER=cloudflare sem CLOUDFLARE_TURN_API_TOKEN; usando agora.` and the provider is `agora`.
  - Restore the normal env.

- [ ] **Step 12: Safari and Firefox (needs Pedro, about 10 minutes).**
  - Pedro opens the test realm link (from `state.json`) in Safari and in Firefox on his Mac, with a Chromium guest nearby.
  - Check video both ways, the small strip, the expanded meeting (layer h) and the enlarged tile (layer f), and in DevTools that simulcast is either active or falls back to one layer without errors.
  - Pedro then closes those tabs (his own account is not a guest).

- [ ] **Step 13: Clean up.**
  - Stop the servers and the driver.
  - Revert the change with `git checkout frontend/app/play/PixiApp.tsx`.
  - Run `node <scratchpad>/cleanup-floor2.cjs` (it deletes the realm and the anonymous users, checking `is_anonymous`).
  - Confirm `git status` is clean. Nothing to commit.

---

### Task 9: Release (needs the owner)

**Files:** none changed, except the empty release commit.

**Interfaces:**
- Consumes: the branch `feat/cloudflare-video` with Tasks 1 to 8 done.
- Produces: production on Agora first, then switched to Cloudflare at the agreed time, with a written rollback.

- [ ] **Step 1: Agree the times with Pedro.** Two moments:
  - (a) the deploy, when nobody is online;
  - (b) the switch, at least one day later, so every open tab is running the new site. The tabs loaded before the deploy only know Agora; ask the team to reload at the switch.

  Confirm in the Render logs that Node is version 18 or newer ("Using Node.js version").
- [ ] **Step 2: Deploy on Agora.**
  1. ff-merge `feat/cloudflare-video` into `main`.
  2. Add the empty commit `chore: release video through Cloudflare Realtime (still on Agora)` (without `[skip render]`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`) and push.
  3. Publish the site. If Vercel does not pick up the push, deploy from a `git archive` export with `npx vercel deploy --prod --yes`.
  4. Pedro runs the Render Manual Deploy, with `VIDEO_PROVIDER` unset or `agora`.
  5. Smoke check by real people, not guests: Pedro and a colleague walk up to each other in the production office and have a normal Agora call. In the console, `__videoChat` is not exposed, so check that no `mediaConfig`-related error shows up.
- [ ] **Step 3: Switch.** At the agreed time, Pedro sets the following in Render, Environment:
  - `CLOUDFLARE_SFU_APP_ID`, `CLOUDFLARE_SFU_APP_SECRET`, `CLOUDFLARE_TURN_KEY_ID`, `CLOUDFLARE_TURN_API_TOKEN` (values typed by Pedro, or set by the controller through the Render dashboard or API from its process env, never printed);
  - `VIDEO_PROVIDER=cloudflare`.

  Render restarts, and everyone online drops for a few seconds and reconnects. Check the Render logs: no "usando agora", no "Cloudflare TURN indisponível".
- [ ] **Step 4: Production check with real people.** Pedro and a colleague, no guests, go through the spec's checks 1 to 7: proximity speed, a closed room, the training room, a screen share, the lounge speaker, a floor change, and camera off.
- [ ] **Step 5: Cost check after one day.** Pedro opens Cloudflare, Realtime, then usage. The delivered traffic must match the estimate and point to under 1 000 GB per month (spec criterion 8).
- [ ] **Step 6: Rollback, if anything goes wrong.** Set `VIDEO_PROVIDER=agora` in Render (it restarts). Open tabs reconnect, get `mediaConfig { provider: 'agora' }`, and switch back to Agora by themselves. The Cloudflare keys can stay in the environment.

---

### Critical Files for Implementation
- /Users/pedrosoares/gather-clone/backend/src/media/MediaSignaling.ts
- /Users/pedrosoares/gather-clone/backend/src/media/subscriptions.ts
- /Users/pedrosoares/gather-clone/frontend/utils/video-chat/cloudflare/CloudflareEngine.ts
- /Users/pedrosoares/gather-clone/frontend/utils/video-chat/cloudflare/CloudflareVideoChat.ts
- /Users/pedrosoares/gather-clone/frontend/utils/video-chat/video-chat.ts (router; the Agora class moves to agora-video-chat.ts)