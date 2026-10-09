# Training Room Meeting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the training room into one room-wide video meeting where whoever stands on the stage moderates microphones and cameras (mute one, camera off one, mute all, lock microphones with "Pedir para falar" / "Liberar"), and make proximity calls open almost instantly everywhere.

**Architecture:** The training room becomes a private conversation area (`privateAreaId: 'matte-training'`), which already gives everyone inside one shared Agora channel. A new server-side `MeetingState` per meeting area keeps the lock, the allowed speakers and the raised hands; socket events let stage moderators act and push `meetingState` / `meetingForce` to members. The client stores the latest meeting snapshot, enforces the lock when the visitor tries to unmute, obeys forced mutes, and shows moderator controls in the video strip.

**Tech Stack:** Node + Socket.IO + TypeScript + zod (backend), Next.js 14.2 + React 18 + Agora Web SDK (frontend), `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-09-escritorio-ala-de-salas-design.md`, section "Sala de treinamento (revisado em 09/10/2026: grande reunião)" and "Chamada mais rápida".

## Global Constraints

- Moderator = a member of the meeting area standing on the area's stage rectangle (`training.stage` from `scripts/annex-layout.mjs`: x 62..76, y 1..3). Several moderators are allowed. Leaving the stage removes the controls.
- Moderator actions: `mute` (target mic off), `cameraOff` (target camera off), `muteAll` (mic off for every member not on the stage), `lock`, `unlock`, `allow` (target may unmute while locked), `deny` (removes permission and mutes). Members: `raiseHand` true/false.
- Locked: a non-moderator who is not allowed cannot turn the microphone on; the client shows `O apresentador bloqueou os microfones. Clique em Pedir para falar.`. Locking forces every non-moderator who is not allowed to mute. Unlocking clears allowed speakers and raised hands.
- Forced mute notices: `O apresentador desligou seu microfone.` / `O apresentador desligou sua câmera.`.
- Server validates every moderator action (requester on stage of the same meeting; target is a member of that meeting).
- Proximity join delay: 150 ms (was 1000 ms). Leave delay unchanged.
- The two training microphones (`training-stage-mic`, `training-audience-mic`) are removed from the map; flat-speaker support stays in the code.
- Everything else in the office behaves as before. Brazilian Portuguese copy, no em or en dash.
- Every commit subject carries `[skip render]` until the release task. Never push or merge before the release task; the release task needs the owner's Render Manual Deploy.

## Review Focus

1. A moderator steps off the stage in the middle of a lock: controls disappear for them, the lock stays, another stage occupant can unlock.
2. A muted member reconnects or reloads while the room is locked: they still cannot unmute (state comes from the server on rejoin).
3. A member leaves the room while their hand is raised or while allowed: the hand and the permission are cleared.
4. Someone outside the training room sends a moderation event (forged): rejected.
5. The glass boardroom, 1:1 rooms and directors' room keep their behaviour (no meeting state, no moderator controls).

---

## File Structure

| File | Responsibility |
|---|---|
| `scripts/annex-layout.mjs` (modify) | `training.stage` already exists; no change unless noted. |
| `scripts/matte-office-map.mjs` (modify) | Training interior uses `privateAreaId`; area config `meeting.stage`; remove the two mics; slide copy. |
| `scripts/matte-office-map.test.mjs` (modify) | Updated counts and meeting checks. |
| `backend/src/office/areas.ts` (modify) | `AreaConfig.meeting?: { stage: { x1, y1, x2, y2 } }`; `meetingStage(room, areaId)`. |
| `backend/src/office/MeetingState.ts` (create) | Pure lock / allowed / raised state and snapshot. |
| `backend/src/office/MeetingState.test.ts` (create) | Tests. |
| `backend/src/session.ts` (modify) | `meetingOf(uid)`, meeting state per area. |
| `backend/src/sockets/socket-types.ts` (modify) | `MeetingModerate`, `MeetingRaiseHand` schemas. |
| `backend/src/sockets/sockets.ts` (modify) | Meeting events, broadcasts on step/disconnect/join. |
| `backend/src/session-meeting.test.ts` (create) | Session-level meeting membership/moderator tests. |
| `frontend/utils/pixi/zod.ts` (modify) | `areas[].meeting`. |
| `frontend/utils/video-chat/meeting.ts` (create) | Client meeting store (`setMeeting`, `getMeeting`, `canUnmute`, `isModerator`). |
| `frontend/utils/video-chat/meeting.test.mjs` (create) | Tests. |
| `frontend/utils/pixi/PlayApp.ts` (modify) | Relay `meetingState` / `meetingForce` socket events to signals; request state on init and rejoin. |
| `frontend/app/hooks/useVideoChat.tsx` (modify) | Enforce the lock on unmute; obey forced mute/camera off. |
| `frontend/components/VideoChat/MeetingControls.tsx` (create) | Moderator panel and "Pedir para falar". |
| `frontend/components/VideoChat/VideoBar.tsx` (modify) | Render `MeetingControls`; per-person moderator actions in the audio menu. |
| `frontend/utils/video-chat/video-chat.ts` (modify) | Join delay 150 ms. |

---

### Task 1: Map, areas and schemas

**Files:** Modify `backend/src/office/areas.ts`, `frontend/utils/pixi/zod.ts`, `scripts/matte-office-map.mjs`, `scripts/matte-office-map.test.mjs`; test `backend/src/office/areas.test.ts` (append).

**Interfaces:** Produces `AreaConfig = { label: string, capacity?: number, conversation?: 'stage', meeting?: { stage: { x1: number, y1: number, x2: number, y2: number } } }` and `meetingStage(room: Room, areaId: string | null): { x1, y1, x2, y2 } | null` in `backend/src/office/areas.ts`; map area `'matte-training': { label: 'Sala de treinamento', meeting: { stage: { x1: 62, y1: 1, x2: 76, y2: 3 } } }`; training interior tiles carry `privateAreaId: 'matte-training'` and no `areaId`.

- [ ] **Step 1: Failing tests**

Append to `backend/src/office/areas.test.ts`:

```ts
test('a meeting area exposes its stage', async () => {
    const { meetingStage } = await import('./areas')
    const meetingRoom: Room = { name: 'Matte', tilemap: { '1, 1': { privateAreaId: 'matte-training' } }, areas: { 'matte-training': { label: 'Sala de treinamento', meeting: { stage: { x1: 0, y1: 0, x2: 2, y2: 0 } } } } }
    assert.deepEqual(meetingStage(meetingRoom, 'matte-training'), { x1: 0, y1: 0, x2: 2, y2: 0 })
    assert.equal(meetingStage(meetingRoom, null), null)
    assert.equal(meetingStage(room, 'one-on-one-1'), null)
})
```

In `scripts/matte-office-map.test.mjs`: `interactions.length` 128 → 126; in the annex test replace the training `areaId` assertion with `assert.equal(room.tilemap[\`${seat.approach.x}, ${seat.approach.y}\`].privateAreaId, 'matte-training', seat.id)`; replace `assert.equal(room.areas['matte-training'].conversation, 'stage')` with `assert.deepEqual(room.areas['matte-training'].meeting, { stage: { x1: 62, y1: 1, x2: 76, y2: 3 } })`; replace the mics block (`const mics = ...` and its loop) with `assert.equal(room.interactions.filter(object => object.id.startsWith('training-') && object.kind === 'speaker').length, 0)`; keep every other assertion. Update the training-slide copy test (added in commit 6f183cb) to the new text in Step 3.

Run: `cd backend && npx tsc -p . ; node --test dist/office/areas.test.js` and `node --test scripts/matte-office-map.test.mjs` — Expected: FAIL.

- [ ] **Step 2: Areas and schema**

`backend/src/office/areas.ts`: extend `AreaConfig` with `meeting?: { stage: { x1: number, y1: number, x2: number, y2: number } }` and add:

```ts
// The stage of a meeting area: people standing on it moderate the meeting.
export function meetingStage(room: Room, areaId: string | null): { x1: number, y1: number, x2: number, y2: number } | null {
    return areaConfig(room, areaId)?.meeting?.stage ?? null
}
```

`frontend/utils/pixi/zod.ts`: inside the `areas` record object add `meeting: z.object({ stage: z.object({ x1: z.number().int(), y1: z.number().int(), x2: z.number().int(), y2: z.number().int() }) }).optional(),`.

- [ ] **Step 3: Map**

In `scripts/matte-office-map.mjs`:
- `area(training.interior, 'areaId', training.id)` becomes `area(training.interior, 'privateAreaId', training.id)`.
- In `areas`, `[training.id]: { label: training.label, conversation: 'stage' }` becomes `[training.id]: { label: training.label, meeting: { stage: { ...training.stage } } }`.
- In `trainingObjects`, delete the `training-stage-mic` and `training-audience-mic` entries; change the slide body to `'Quem está no palco apresenta e controla os microfones. Para falar, ligue seu microfone ou clique em Pedir para falar.'`.

- [ ] **Step 4: Run and validate**

Run: `cd backend && npx tsc -p . && node --test $(find dist -name "*.test.js")`; `node --test scripts/*.test.mjs`; `cd frontend && npx tsc --noEmit --incremental false`; regenerate the map to `$SCRATCH/meeting-map.json` and validate it with the backend `validateOfficeMap` and the frontend zod schema (throwaway transpile + vm script as in the annex plan's Task 7 report). Expected: all pass.

- [ ] **Step 5: Commit** — `git commit -m "feat: make the training room one private meeting area [skip render]"` (plus the Co-Authored-By line) with the files above.

---

### Task 2: Server meeting state and events

**Files:** Create `backend/src/office/MeetingState.ts`, `backend/src/office/MeetingState.test.ts`, `backend/src/session-meeting.test.ts`; modify `backend/src/session.ts`, `backend/src/sockets/socket-types.ts`, `backend/src/sockets/sockets.ts`.

**Interfaces:**
- `MeetingSnapshot = { areaId: string, locked: boolean, allowed: string[], raised: string[], moderators: string[] }`.
- `class MeetingState { locked; allowed: Set<string>; raised: Set<string>; canSpeak(uid, isModerator): boolean; leave(uid): void; snapshot(areaId, moderators: string[]): MeetingSnapshot }`.
- `Session.meetingOf(uid): { areaId: string, state: MeetingState, members: string[], moderators: string[] } | null`.
- Socket events (client → server, with ack `{ ok: boolean, error?: string }`): `meetingModerate` `{ action: 'mute' | 'cameraOff' | 'muteAll' | 'lock' | 'unlock' | 'allow' | 'deny', targetUid?: string }`; `meetingRaiseHand` `{ raised: boolean }`; `meetingGetState` (ack `{ ok: true, snapshot: MeetingSnapshot | null }`).
- Server → client: `meetingState` (`MeetingSnapshot | null`, sent only to members, and `null` to someone who just left); `meetingForce` `{ mic?: false, camera?: false }`.

- [ ] **Step 1: Failing tests**

`backend/src/office/MeetingState.test.ts`:

```ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MeetingState } from './MeetingState'

test('unlocked meetings let everyone speak; locked ones only moderators and allowed people', () => {
    const meeting = new MeetingState()
    assert.equal(meeting.canSpeak('ana', false), true)
    meeting.locked = true
    assert.equal(meeting.canSpeak('ana', false), false)
    assert.equal(meeting.canSpeak('host', true), true)
    meeting.allowed.add('ana')
    assert.equal(meeting.canSpeak('ana', false), true)
})

test('leaving clears the raised hand and the permission', () => {
    const meeting = new MeetingState()
    meeting.raised.add('ana'); meeting.allowed.add('ana')
    meeting.leave('ana')
    assert.equal(meeting.raised.has('ana'), false)
    assert.equal(meeting.allowed.has('ana'), false)
})

test('snapshots are plain sorted arrays', () => {
    const meeting = new MeetingState()
    meeting.locked = true; meeting.raised.add('bia'); meeting.raised.add('ana'); meeting.allowed.add('caio')
    assert.deepEqual(meeting.snapshot('matte-training', ['host']), { areaId: 'matte-training', locked: true, allowed: ['caio'], raised: ['ana', 'bia'], moderators: ['host'] })
})
```

`backend/src/session-meeting.test.ts`:

```ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Session, type Room } from './session'

function setup() {
    const tilemap: Room['tilemap'] = {}
    for (let x = 0; x < 20; x++) for (let y = 0; y < 6; y++) tilemap[`${x}, ${y}`] = x >= 10 ? { privateAreaId: 'matte-training' } : {}
    const session = new Session('office', { spawnpoint: { roomIndex: 0, x: 0, y: 5 }, rooms: [{ name: 'Matte', tilemap, areas: { 'matte-training': { label: 'Sala de treinamento', meeting: { stage: { x1: 10, y1: 0, x2: 19, y2: 0 } } } } }] })
    const add = (uid: string, x: number, y: number) => { session.addPlayer(`s-${uid}`, uid, uid, '009'); session.roomFeatures[0].office.addPlayer(uid, { x, y }, uid); session.movePlayer(uid, x, y) }
    return { session, add }
}

test('members of the meeting and its stage moderators', () => {
    const { session, add } = setup()
    add('host', 12, 0); add('ana', 12, 3); add('out', 2, 3)
    const meeting = session.meetingOf('ana')!
    assert.equal(meeting.areaId, 'matte-training')
    assert.deepEqual(meeting.members.sort(), ['ana', 'host'])
    assert.deepEqual(meeting.moderators, ['host'])
    assert.equal(session.meetingOf('out'), null)
    assert.strictEqual(session.meetingOf('host')!.state, meeting.state, 'one state per meeting area')
})
```

Run: `cd backend && npx tsc -p . ; node --test $(find dist -name "*.test.js")` — Expected: the new tests FAIL (modules/methods missing).

- [ ] **Step 2: Implement `MeetingState`**

`backend/src/office/MeetingState.ts`:

```ts
export type MeetingSnapshot = { areaId: string, locked: boolean, allowed: string[], raised: string[], moderators: string[] }

// Lock, allowed speakers and raised hands of one meeting area (the training room).
export class MeetingState {
    locked = false
    readonly allowed = new Set<string>()
    readonly raised = new Set<string>()

    canSpeak(uid: string, isModerator: boolean): boolean {
        return !this.locked || isModerator || this.allowed.has(uid)
    }

    leave(uid: string): void {
        this.allowed.delete(uid)
        this.raised.delete(uid)
    }

    snapshot(areaId: string, moderators: string[]): MeetingSnapshot {
        return { areaId, locked: this.locked, allowed: [...this.allowed].sort(), raised: [...this.raised].sort(), moderators: [...moderators].sort() }
    }
}
```

- [ ] **Step 3: `Session.meetingOf`**

In `backend/src/session.ts` import `MeetingState` and `meetingStage`; add a field `private readonly meetings = new Map<string, MeetingState>()` (key `${room}:${areaId}`) and:

```ts
    // The meeting the visitor is in (a meeting area of their room), its members and its stage moderators.
    public meetingOf(uid: string): { areaId: string, state: MeetingState, members: string[], moderators: string[] } | null {
        const player = this.players[uid]
        if (!player) return null
        const room = this.map_data.rooms[player.room]
        const areaId = areaAt(room, player.x, player.y)
        const stage = meetingStage(room, areaId)
        if (!areaId || !stage) return null
        const key = `${player.room}:${areaId}`
        if (!this.meetings.has(key)) this.meetings.set(key, new MeetingState())
        const members = this.getPlayersInRoom(player.room).filter(other => areaAt(room, other.x, other.y) === areaId)
        const onStage = (other: Player) => other.x >= stage.x1 && other.x <= stage.x2 && other.y >= stage.y1 && other.y <= stage.y2
        return { areaId, state: this.meetings.get(key)!, members: members.map(other => other.uid), moderators: members.filter(onStage).map(other => other.uid) }
    }
```

- [ ] **Step 4: Socket schemas and events**

`backend/src/sockets/socket-types.ts`:

```ts
export const MeetingModerate = z.object({ action: z.enum(['mute', 'cameraOff', 'muteAll', 'lock', 'unlock', 'allow', 'deny']), targetUid: z.string().uuid().optional() })
export const MeetingRaiseHand = z.object({ raised: z.boolean() })
```

`backend/src/sockets/sockets.ts` (inside `io.on('connection')`, near the other office handlers):

```ts
        // Training-room meeting: stage moderators control microphones and cameras.
        const sendMeeting = (session: Session, uid: string) => {
            const meeting = session.meetingOf(uid)
            if (!meeting) return
            const snapshot = meeting.state.snapshot(meeting.areaId, meeting.moderators)
            for (const member of meeting.members) io.to(session.getPlayer(member).socketId).emit('meetingState', snapshot)
        }
        const meetingKey = (session: Session, uid: string) => {
            const meeting = session.meetingOf(uid)
            return meeting ? `${meeting.areaId}|${meeting.moderators.includes(uid)}` : null
        }

        socket.on('meetingGetState', (ack: unknown) => {
            if (typeof ack !== 'function') return
            const uid = socket.handshake.query.uid as string
            const session = sessionManager.getPlayerSession(uid)
            if (!session || session.getPlayer(uid)?.socketId !== socket.id) return ack({ ok: false, error: 'Fora do escritório.' })
            const meeting = session.meetingOf(uid)
            ack({ ok: true, snapshot: meeting ? meeting.state.snapshot(meeting.areaId, meeting.moderators) : null })
        })

        socket.on('meetingRaiseHand', (raw: unknown, ack: unknown) => {
            const reply = (result: { ok: boolean, error?: string }) => { if (typeof ack === 'function') ack(result) }
            const uid = socket.handshake.query.uid as string
            const parsed = MeetingRaiseHand.safeParse(raw)
            const session = sessionManager.getPlayerSession(uid)
            const meeting = session?.meetingOf(uid)
            if (!parsed.success || !session || !meeting || session.getPlayer(uid)?.socketId !== socket.id) return reply({ ok: false, error: 'Você não está na sala de treinamento.' })
            if (parsed.data.raised) meeting.state.raised.add(uid)
            else meeting.state.raised.delete(uid)
            sendMeeting(session, uid)
            reply({ ok: true })
        })

        socket.on('meetingModerate', (raw: unknown, ack: unknown) => {
            const reply = (result: { ok: boolean, error?: string }) => { if (typeof ack === 'function') ack(result) }
            const uid = socket.handshake.query.uid as string
            const parsed = MeetingModerate.safeParse(raw)
            const session = sessionManager.getPlayerSession(uid)
            const meeting = session?.meetingOf(uid)
            if (!parsed.success || !session || !meeting || session.getPlayer(uid)?.socketId !== socket.id) return reply({ ok: false, error: 'Você não está na sala de treinamento.' })
            if (!meeting.moderators.includes(uid)) return reply({ ok: false, error: 'Só quem está no palco controla os microfones.' })
            const { action, targetUid } = parsed.data
            const force = (target: string, payload: { mic?: false, camera?: false }) => io.to(session.getPlayer(target).socketId).emit('meetingForce', payload)
            const audience = meeting.members.filter(member => !meeting.moderators.includes(member))
            if (['mute', 'cameraOff', 'allow', 'deny'].includes(action)) {
                if (!targetUid || !meeting.members.includes(targetUid)) return reply({ ok: false, error: 'Essa pessoa não está na sala.' })
            }
            if (action === 'mute') force(targetUid!, { mic: false })
            if (action === 'cameraOff') force(targetUid!, { camera: false })
            if (action === 'muteAll') for (const member of audience) force(member, { mic: false })
            if (action === 'lock') {
                meeting.state.locked = true
                for (const member of audience) if (!meeting.state.allowed.has(member)) force(member, { mic: false })
            }
            if (action === 'unlock') { meeting.state.locked = false; meeting.state.allowed.clear(); meeting.state.raised.clear() }
            if (action === 'allow') { meeting.state.allowed.add(targetUid!); meeting.state.raised.delete(targetUid!) }
            if (action === 'deny') { meeting.state.allowed.delete(targetUid!); meeting.state.raised.delete(targetUid!); force(targetUid!, { mic: false }) }
            sendMeeting(session, uid)
            reply({ ok: true })
        })
```

Broadcast on membership/moderator changes:
- In the `officeStep` handler, capture `const meetingBefore = meetingKey(session, uid)` and `const previousMeeting = session.meetingOf(uid)` before `session.movePlayer(...)` (only inside `if (result.ok)`), and after it:

```ts
                    const meetingAfter = meetingKey(session, uid)
                    if (meetingBefore !== meetingAfter) {
                        if (previousMeeting && previousMeeting.areaId !== session.meetingOf(uid)?.areaId) {
                            previousMeeting.state.leave(uid)
                            socket.emit('meetingState', null)
                            const remaining = previousMeeting.members.find(member => member !== uid)
                            if (remaining) sendMeeting(session, remaining)
                        }
                        sendMeeting(session, uid)
                    }
```

- In the disconnect handler, before `sessionManager.logOutBySocketId(socket.id)`, capture `const leavingMeeting = session.meetingOf(uid)`; after a successful logout: `if (leavingMeeting) { leavingMeeting.state.leave(uid); const remaining = leavingMeeting.members.find(member => member !== uid); if (remaining) sendMeeting(session, remaining) }`.
- In `join()`, after `emit('playerJoinedRoom', player)`: `sendMeeting(newSession, uid)` (covers a resume inside the room).

Add tests in `backend/src/session-meeting.test.ts` for: moderators list changes when the host steps off the stage (`session.movePlayer('host', 12, 1)` → moderators `[]`); `meetingOf` returns the same `state` object for two members; state survives the moderator leaving the stage (lock stays true).

- [ ] **Step 5: Run** — `cd backend && npx tsc -p . && node --test $(find dist -name "*.test.js")` — Expected: all pass.

- [ ] **Step 6: Commit** — `git commit -m "feat: training meeting moderation on the server [skip render]"` (plus the Co-Authored-By line).

---

### Task 3: Client meeting store, enforcement and fast join

**Files:** Create `frontend/utils/video-chat/meeting.ts`, `frontend/utils/video-chat/meeting.test.mjs`; modify `frontend/utils/pixi/PlayApp.ts`, `frontend/app/hooks/useVideoChat.tsx`, `frontend/utils/video-chat/video-chat.ts`, and `frontend/utils/pixi/reconnect.test.mjs` (stub the new import if the harness needs it).

**Interfaces:** `MeetingSnapshot` type (same shape as the server's); `setLocalMeetingUid(uid: string)`, `setMeeting(snapshot: MeetingSnapshot | null)`, `getMeeting(): MeetingSnapshot | null`, `isModerator(uid?: string): boolean`, `canUnmute(): boolean`; signals `meetingState` (snapshot or null) and `meetingForce` (`{ mic?: false, camera?: false }`).

- [ ] **Step 1: Failing test** — `frontend/utils/video-chat/meeting.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { setLocalMeetingUid, setMeeting, getMeeting, isModerator, canUnmute } from './meeting.ts'

const snapshot = (overrides = {}) => ({ areaId: 'matte-training', locked: false, allowed: [], raised: [], moderators: ['host'], ...overrides })

test('outside a meeting or in an unlocked one everyone may unmute', () => {
    setLocalMeetingUid('ana')
    setMeeting(null)
    assert.equal(canUnmute(), true)
    setMeeting(snapshot())
    assert.equal(canUnmute(), true)
})

test('a locked meeting blocks unmuting unless on stage or allowed', () => {
    setLocalMeetingUid('ana')
    setMeeting(snapshot({ locked: true }))
    assert.equal(canUnmute(), false)
    setMeeting(snapshot({ locked: true, allowed: ['ana'] }))
    assert.equal(canUnmute(), true)
    setLocalMeetingUid('host')
    assert.equal(canUnmute(), true)
    assert.equal(isModerator(), true)
    assert.equal(isModerator('ana'), false)
    assert.equal(getMeeting().locked, true)
})
```

Run: `cd frontend && node --experimental-strip-types --test utils/video-chat/meeting.test.mjs` — Expected: FAIL (module missing).

- [ ] **Step 2: Store** — `frontend/utils/video-chat/meeting.ts`:

```ts
import signal from '../signal'

export type MeetingSnapshot = { areaId: string, locked: boolean, allowed: string[], raised: string[], moderators: string[] }

// Latest training-meeting state sent by the server (null outside a meeting room).
let current: MeetingSnapshot | null = null
let localUid = ''

export function setLocalMeetingUid(uid: string) { localUid = uid }

export function setMeeting(snapshot: MeetingSnapshot | null) {
    current = snapshot
    signal.emit('meetingState', snapshot)
}

export function getMeeting(): MeetingSnapshot | null { return current }

export function isModerator(uid = localUid): boolean { return Boolean(current?.moderators.includes(uid)) }

export function canUnmute(): boolean {
    return !current || !current.locked || isModerator() || current.allowed.includes(localUid)
}
```

(If the test harness cannot import `../signal` with strip-types, import it as `'../signal.ts'` only in a way `tsc` accepts, or stub via the same vm approach other tests use; keep `next build` passing.)

- [ ] **Step 3: Relay socket events in PlayApp** — In `frontend/utils/pixi/PlayApp.ts`:
- import `{ setLocalMeetingUid, setMeeting }` from `'../video-chat/meeting'`; call `setLocalMeetingUid(uid)` in the constructor.
- `private onMeetingState = (snapshot: MeetingSnapshot | null) => setMeeting(snapshot ?? null)` and `private onMeetingForce = (force: { mic?: false, camera?: false }) => signal.emit('meetingForce', force)`.
- register both in `setUpSocketEvents` (`'meetingState'`, `'meetingForce'`) and unregister in `removeSocketEvents`.
- in `requestSnapshots`, also `server.socket.emit('meetingGetState', (response: { ok: boolean, snapshot?: MeetingSnapshot | null }) => { if (response?.ok) setMeeting(response.snapshot ?? null) })`.
- in `removeEvents`, call `setMeeting(null)`.

- [ ] **Step 4: Enforcement in useVideoChat** — In `frontend/app/hooks/useVideoChat.tsx`:
- import `{ canUnmute }` from `'../../utils/video-chat/meeting'`.
- at the start of `toggleMicrophone` (after the pending guard), add:

```tsx
        if (isMicMuted && !canUnmute()) {
            signal.emit('officeFeedback', { message: 'O apresentador bloqueou os microfones. Clique em Pedir para falar.' })
            return
        }
```

- in the provider's first `useEffect`, subscribe to `meetingForce`:

```tsx
        const onForce = (force: { mic?: false, camera?: false }) => {
            if (force.mic === false && !isMicMutedRef.current) {
                void videoChat.toggleMicrophone().then(setIsMicMuted).catch(() => {})
                signal.emit('officeFeedback', { message: 'O apresentador desligou seu microfone.' })
            }
            if (force.camera === false && !isCameraMutedRef.current) {
                void videoChat.toggleCamera().then(setIsCameraMuted).catch(() => {})
                signal.emit('officeFeedback', { message: 'O apresentador desligou sua câmera.' })
            }
        }
        signal.on('meetingForce', onForce)
```

  with `isMicMutedRef` / `isCameraMutedRef` (`useRef`) kept in sync with the state (`useEffect(() => { isMicMutedRef.current = isMicMuted }, [isMicMuted])`, same for camera), and `signal.off('meetingForce', onForce)` in the cleanup.

- [ ] **Step 5: Fast join** — In `frontend/utils/video-chat/video-chat.ts`, `joinChannel`'s `setTimeout(..., 1000)` (the first of the two `}, 1000)` in the file, inside `joinChannel`) becomes `}, 150)`. Leave `leaveChannel`'s delay at 1000.

- [ ] **Step 6: Run** — `cd frontend && node --experimental-strip-types --test $(find . -name "*.test.mjs" -not -path "./node_modules/*")`, `npx tsc --noEmit --incremental false` — Expected: all pass.

- [ ] **Step 7: Commit** — `git commit -m "feat: enforce training meeting locks and open calls faster [skip render]"` (plus the Co-Authored-By line).

---

### Task 4: Moderator and participant controls

**Files:** Create `frontend/components/VideoChat/MeetingControls.tsx`; modify `frontend/components/VideoChat/VideoBar.tsx`.

**Interfaces:** `useMeeting(): MeetingSnapshot | null` (hook in `MeetingControls.tsx`, exported, listening to the `meetingState` signal with initial value `getMeeting()`); `moderate(action, targetUid?)` and `raiseHand(raised)` helpers emitting the socket events with an 8 s timeout and showing the ack error as `officeFeedback`.

- [ ] **Step 1: Component** — `frontend/components/VideoChat/MeetingControls.tsx`:

```tsx
import React, { useEffect, useState } from 'react'
import signal from '@/utils/signal'
import { server } from '@/utils/backend/server'
import { getMeeting, isModerator, type MeetingSnapshot } from '@/utils/video-chat/meeting'
import { usePeerProfile } from './useRemoteUsers'

export function useMeeting() {
    const [meeting, setMeeting] = useState<MeetingSnapshot | null>(getMeeting())
    useEffect(() => {
        signal.on('meetingState', setMeeting)
        return () => signal.off('meetingState', setMeeting)
    }, [])
    return meeting
}

type Action = 'mute' | 'cameraOff' | 'muteAll' | 'lock' | 'unlock' | 'allow' | 'deny'

export function moderate(action: Action, targetUid?: string) {
    server.socket.timeout(8000).emit('meetingModerate', { action, targetUid }, (timeout: Error | null, result: { ok: boolean, error?: string }) => {
        if (timeout || !result?.ok) signal.emit('officeFeedback', { message: result?.error ?? 'Não foi possível concluir a ação.' })
    })
}

function raiseHand(raised: boolean) {
    server.socket.timeout(8000).emit('meetingRaiseHand', { raised }, (timeout: Error | null, result: { ok: boolean, error?: string }) => {
        if (timeout || !result?.ok) signal.emit('officeFeedback', { message: result?.error ?? 'Não foi possível enviar o pedido.' })
    })
}

function RaisedHand({ uid }: { uid: string }) {
    const { name } = usePeerProfile(uid)
    return <li className='flex items-center justify-between gap-2'>
        <span className='truncate'>{name}</span>
        <button type='button' onClick={() => moderate('allow', uid)} className='rounded bg-teal-500 px-2 py-0.5 text-xs font-semibold text-slate-950 hover:bg-teal-400'>Liberar</button>
    </li>
}

// Training-room meeting controls: stage moderators get the panel; others get "Pedir para falar" while locked.
export default function MeetingControls({ localUid }: { localUid: string }) {
    const meeting = useMeeting()
    if (!meeting) return null
    if (isModerator(localUid)) return <div className='pointer-events-auto w-72 space-y-2 rounded-xl bg-slate-950/90 p-3 text-xs text-white shadow-xl'>
        <p className='font-semibold'>Você está no palco: é o apresentador.</p>
        <div className='flex gap-2'>
            <button type='button' onClick={() => moderate('muteAll')} className='flex-1 rounded bg-slate-700 px-2 py-1.5 hover:bg-slate-600'>Silenciar todos</button>
            <button type='button' onClick={() => moderate(meeting.locked ? 'unlock' : 'lock')} className={`flex-1 rounded px-2 py-1.5 ${meeting.locked ? 'bg-rose-700 hover:bg-rose-600' : 'bg-slate-700 hover:bg-slate-600'}`}>{meeting.locked ? 'Liberar microfones' : 'Bloquear microfones'}</button>
        </div>
        {meeting.raised.length > 0 && <div>
            <p className='mb-1 text-white/70'>Pedidos para falar</p>
            <ul className='space-y-1'>{meeting.raised.map(uid => <RaisedHand key={uid} uid={uid} />)}</ul>
        </div>}
    </div>
    if (!meeting.locked) return null
    const allowed = meeting.allowed.includes(localUid)
    const raised = meeting.raised.includes(localUid)
    return <div className='pointer-events-auto w-72 space-y-2 rounded-xl bg-slate-950/90 p-3 text-xs text-white shadow-xl'>
        <p>{allowed ? 'O apresentador liberou seu microfone.' : 'O apresentador bloqueou os microfones.'}</p>
        {!allowed && <button type='button' onClick={() => raiseHand(!raised)} className='w-full rounded bg-teal-500 px-2 py-1.5 font-semibold text-slate-950 hover:bg-teal-400'>{raised ? 'Cancelar pedido' : 'Pedir para falar'}</button>}
    </div>
}
```

- [ ] **Step 2: Place it and add per-person actions** — In `frontend/components/VideoChat/VideoBar.tsx`:
- import `MeetingControls, { useMeeting, moderate }` from `'./MeetingControls'` and `isModerator` from `'@/utils/video-chat/meeting'`.
- In the non-meeting-mode return (the top-right strip container), render `<MeetingControls localUid={localUid} />` as the first child (above the "Expandir reunião" button). In meeting mode, render it inside the header row at the right, before the "Visualização de mapa" button area (keep layout tidy; `pointer-events-auto`).
- Render the controls even when `peers.length === 0` if a meeting snapshot exists (a moderator alone on stage should still see the panel): change the early `return null` to `if (peers.length === 0 && !presentation && !meeting) return null` with `const meeting = useMeeting()` declared with the other hooks at the top of `VideoBar`; when there are no peers, render only `<div className='pointer-events-none absolute right-3 top-3 z-30'><MeetingControls localUid={localUid} /></div>`.
- In `RemoteUser`, inside the audio popover (`role='group'`), after the volume control, when `useMeeting()` is non-null and `isModerator(localUid)` and the person is not a screen share, add:

```tsx
                {meetingActive && <div className="space-y-1 border-t border-slate-700 pt-2">
                    <p className="text-white/60">Como apresentador</p>
                    {user.micEnabled && <button type="button" onClick={() => moderate('mute', officeUid)} className="w-full rounded bg-slate-700 px-2 py-1 text-left">Desligar microfone</button>}
                    {user.cameraEnabled && <button type="button" onClick={() => moderate('cameraOff', officeUid)} className="w-full rounded bg-slate-700 px-2 py-1 text-left">Desligar câmera</button>}
                    {meeting?.locked && !meeting.allowed.includes(officeUid) && <button type="button" onClick={() => moderate('allow', officeUid)} className="w-full rounded bg-slate-700 px-2 py-1 text-left">Liberar microfone</button>}
                    {meeting?.locked && meeting.allowed.includes(officeUid) && <button type="button" onClick={() => moderate('deny', officeUid)} className="w-full rounded bg-slate-700 px-2 py-1 text-left">Bloquear microfone</button>}
                </div>}
```

  with `const meeting = useMeeting()`, `const officeUid = user.user.uid.toString().slice(0, 36)`, `const meetingActive = Boolean(meeting && isModerator(localUid))`.

- [ ] **Step 3: Run** — frontend tests, `npx tsc --noEmit --incremental false`, `npx next build` — Expected: pass.

- [ ] **Step 4: Commit** — `git commit -m "feat: training meeting controls for the stage and the audience [skip render]"` (plus the Co-Authored-By line).

---

### Task 5: End-to-end check on a private test space

Reuse the annex plan's Task 9 procedure and scripts (local backend compiled with `tsc` + `node dist/index.js`, local `next start`, a new private test realm with `$SCRATCH/meeting-map.json`, throwaway `window.__playApp` patch never committed, cleanup of every recorded anonymous id). Three browsers: Host, Ana, Bruno (fake media). Checks, each with a screenshot read by the agent:
1. Ana and Bruno inside the training room see each other's video tiles in the top strip (cameras turned on with fake devices); people outside the room do not.
2. Host on the stage sees the moderator panel; Ana (off stage) does not.
3. Host mutes Ana's microphone from her tile: Ana's mic turns off and she sees `O apresentador desligou seu microfone.`.
4. Host "Bloquear microfones": Ana's and Bruno's mics off; Ana clicking the mic button sees the lock notice and stays muted; Ana clicks "Pedir para falar"; Host sees the request and clicks "Liberar"; Ana can now unmute; Bruno still cannot.
5. Host steps off the stage: the panel disappears; the lock stays (Bruno still blocked).
6. Proximity call in the main office opens within about 1 s of two visitors meeting (measure time from the step to the remote video tile appearing).
Report all results; commit fixes only with `[skip render]`.

### Task 6: Release (owner's Render click)

1. Merge into `main` (fast-forward), add an empty commit without `[skip render]` (`chore: release the training meeting`), push.
2. Wait for the Vercel production deploy of that SHA (`success`).
3. Ask Pedro to click Render Manual Deploy → Deploy latest commit; confirm the new backend with a probe that calls `meetingGetState` and gets `{ ok: true }` (the old backend never answers it).
4. Save the live `map_data` (backup file in `~/Backup-secrets/`), then PATCH the Matte realm with `node scripts/matte-office-map.mjs` output. The realtime listener ends the running session; visitors re-enter.
5. Smoke check with one guest: join, walk into the training room, `meetingGetState` returns a snapshot; delete the guest.
