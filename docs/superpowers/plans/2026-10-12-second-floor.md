# Second Floor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A staircase at the bottom of the annex corridor leads to a new second-floor room with 20 silent focus desks and 4 numbered team islands of 6 seats, in the same pixel-art identity.

**Architecture:** The second floor is `rooms[1]` of the same realm map; both staircases are teleporter tiles, which the client and server already support (`teleport` socket event, `loadRoom`). Focus mode is computed on the server: a person seated at a `desk` with `focus: true` gets their own proximity zone, so the existing proximity grouping never joins them with anyone; an accepted knock puts the knocker in the same zone. Islands are `privateAreaId` rectangles like the glass boardroom. The art is kitbashed from the office art with the existing Pillow toolkit.

**Tech Stack:** Node + Socket.IO + zod (backend, `node --test` on compiled `dist`), Next.js 14 + PixiJS 8 + React (frontend, `node --experimental-strip-types --test`), map generator in `scripts/*.mjs` (`node --test scripts/*.test.mjs`), Python 3 + Pillow for art (venv at `/private/tmp/claude-501/-Users-pedrosoares/03356041-6d92-46ea-be20-f5b76175358a/scratchpad/venv/bin/python`).

**Spec:** `docs/superpowers/specs/2026-10-12-escritorio-segundo-andar-design.md`

## Global Constraints

- Ground-floor stairs: annex corridor tiles x 50..52, y 26..28. Row y = 26 is the teleporter row (all three tiles go to the second floor); rows 27..28 are impassable. Arrival on the ground floor from upstairs: (51, 24).
- Second floor: 50 × 30 tiles, background `/matte-floor2.png` (1600 × 960 px), room name `2º andar`. Stairs down: x 1..3, y 25..28; teleporter row y = 25 (all three tiles go to the ground floor); rows 26..28 impassable. Arrival on the second floor from the ground floor: (2, 23).
- Focus area: 20 desks, `kind: 'desk'`, `focus: true`, ids `focus-desk-1`..`focus-desk-20`, desk top-left x ∈ {1, 7, 13, 19}, y ∈ {3, 7, 11, 15, 19}, bounds 5 × 2, approach (x + 2, y + 2), seatVisual `{ x: x + 1.5, y: y + 2.35, facing: 'up' }`, desk tiles impassable.
- Islands: 4 copies of the office project table (table 7 × 4, origin ox, oy) at origins (30, 4), (40, 4), (30, 14), (40, 14); ids `island-1`..`island-4`, labels `Ilha 1`..`Ilha 4`; 6 seats each (24 total); private areas island-1 x 27..37 y 2..10, island-2 x 38..48 y 2..10, island-3 x 27..37 y 12..20, island-4 x 38..48 y 12..20.
- Reach for knocking and for keeping a focus conversation: dx² + dy² ≤ 6.25 (the proximity radius 2.5 used by `getProximityTiles`).
- Knock: answer within 30 000 ms, same knocker → same person again only after 60 000 ms.
- Office capacity stays `MAX_PLAYERS_PER_SPACE = 80`.
- Copy (Brazilian Portuguese, no em or en dash): `Escada · 2º andar`, `Escada · Térreo`, `Área de foco · silêncio`, `Ilha 1`..`Ilha 4`, `em foco`, `Chamar {nome}`, `{nome} quer falar com você`, `Aceitar`, `Agora não`, `{nome} está em foco agora.`, `{nome} aceitou. Vocês estão conversando.`, `Modo foco: ninguém te escuta. Quem quiser falar vai te chamar.`, `Aguarde um minuto para chamar de novo.`, `A chamada expirou.`.
- Every commit subject ends with ` [skip render]` and every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push, merge or deploy before Task 6; Task 6 needs the owner (Render Manual Deploy).
- The ground floor must not change except the stairs and their sign; regenerated `matte-office-v3.png` may differ from HEAD only inside tiles x 50..52, y 24..28.

## Review Focus

1. Someone sitting down at a focus desk by clicking (officeAction occupy) without moving: the proximity groups must be rebuilt at once, or the person stays in a call they should have left. (Task 3 test: occupy then expect proximityId null.)
2. A knocker who walks away, or a focused person who stands up, or either one disconnecting or going downstairs: the pair ends and both drop out of the call. (Task 3 tests for walk-away, stand-up, removal.)
3. Two focused people at neighbouring desks, plus a third person standing between them: nobody is joined with a focused person. (Task 3 test.)
4. Reloading upstairs resumes upstairs (server resume already supports rooms; client `setStartPosition` uses `roomIndex`). (Task 5 e2e check.)
5. A knock answered after the 30 s window, or answered by someone other than the target, is rejected. (Task 3 tests.)

---

### Task 1: Map data for the stairs and the second floor

**Files:**
- Create: `scripts/floor2-layout.mjs`
- Modify: `scripts/annex-layout.mjs` (add `groundStairs`, a sign)
- Modify: `scripts/matte-office-map.mjs` (teleporters on the ground floor, build `rooms[1]`)
- Modify: `scripts/matte-office-map.test.mjs`, `scripts/annex-layout.test.mjs`
- Modify: `backend/src/session.ts` (`OfficeObject.focus?: boolean`)
- Modify: `frontend/utils/pixi/zod.ts` (interaction `focus: z.boolean().optional()`)
- Modify: `frontend/utils/pixi/types.ts` only if it declares `OfficeObject` by hand (check; zod-inferred types need nothing)

**Interfaces:**
- Produces: `map.rooms[1]` with `name: '2º andar'`, `backgroundImage: { src: '/matte-floor2.png', width: 1600, height: 960 }`, `tilemap`, `interactions` (44 seats: 20 focus desks + 24 island seats), `areas` (`island-1`..`island-4` → `{ label: 'Ilha N' }`), `signs`. Ground-floor tiles (50..52, 26) have `teleporter: { roomIndex: 1, x: 2, y: 23 }`; second-floor tiles (1..3, 25) have `teleporter: { roomIndex: 0, x: 51, y: 24 }`.
- Produces from `scripts/floor2-layout.mjs` (used by Task 2's art): `FLOOR2_WIDTH = 50`, `FLOOR2_HEIGHT = 30`, `floor2Stairs = { x1: 1, y1: 25, x2: 3, y2: 28, triggerY: 25, arrival: [2, 23] }`, `focusDesks` (array of `{ id, x, y }` top-left), `islands` (array of `{ id, label, ox, oy, area: { x1, y1, x2, y2 } }`), `floor2Signs`.
- Produces from `scripts/annex-layout.mjs`: `groundStairs = { x1: 50, y1: 26, x2: 52, y2: 28, triggerY: 26, arrival: [51, 24] }`.

- [ ] **Step 1: Write the failing tests** in `scripts/matte-office-map.test.mjs` (append):

```js
test('the ground floor stairs lead upstairs and back', () => {
  const [ground, upstairs] = map.rooms
  for (const x of [50, 51, 52]) {
    assert.deepEqual(ground.tilemap[`${x}, 26`].teleporter, { roomIndex: 1, x: 2, y: 23 })
    assert.ok(ground.tilemap[`${x}, 27`].impassable && ground.tilemap[`${x}, 28`].impassable)
  }
  for (const x of [1, 2, 3]) {
    assert.deepEqual(upstairs.tilemap[`${x}, 25`].teleporter, { roomIndex: 0, x: 51, y: 24 })
    assert.ok(upstairs.tilemap[`${x}, 26`].impassable)
  }
  assert.ok(!ground.tilemap['51, 24'].impassable && !ground.tilemap['51, 24'].teleporter)
  assert.ok(!upstairs.tilemap['2, 23'].impassable && !upstairs.tilemap['2, 23'].teleporter)
})

test('the second floor has 20 focus desks and 4 islands of 6', () => {
  const upstairs = map.rooms[1]
  assert.equal(upstairs.name, '2º andar')
  assert.equal(upstairs.backgroundImage.src, '/matte-floor2.png')
  assert.equal(Object.keys(upstairs.tilemap).length, 50 * 30)
  const focus = upstairs.interactions.filter(item => item.kind === 'desk' && item.focus === true)
  assert.equal(focus.length, 20)
  for (let n = 1; n <= 4; n++) {
    assert.equal(upstairs.areas[`island-${n}`].label, `Ilha ${n}`)
    const seats = upstairs.interactions.filter(item => item.id.startsWith(`island-${n}-`))
    assert.equal(seats.length, 6)
    for (const seat of seats) assert.equal(upstairs.tilemap[`${seat.approach.x}, ${seat.approach.y}`].privateAreaId, `island-${n}`)
  }
  assert.equal(upstairs.interactions.filter(item => item.kind === 'seat' || item.kind === 'desk').length, 44)
  for (const desk of focus) assert.equal(upstairs.tilemap[`${desk.approach.x}, ${desk.approach.y}`].privateAreaId, undefined)
})

test('every second floor seat is reachable from the stairs arrival', () => {
  const { tilemap, interactions } = map.rooms[1]
  const reachable = new Set(['2, 23'])
  const queue = [[2, 23]]
  for (let i = 0; i < queue.length; i++) {
    const [cx, cy] = queue[i]
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const key = `${cx + dx}, ${cy + dy}`
      if (tilemap[key] && !tilemap[key].impassable && !reachable.has(key)) { reachable.add(key); queue.push([cx + dx, cy + dy]) }
    }
  }
  for (const object of interactions) assert.ok(reachable.has(`${object.approach.x}, ${object.approach.y}`), object.id)
  assert.ok(map.rooms[1].signs.some(sign => sign.text === 'Área de foco · silêncio'))
  assert.ok(map.rooms[1].signs.some(sign => sign.text === 'Escada · Térreo'))
  assert.ok(map.rooms[0].signs.some(sign => sign.text === 'Escada · 2º andar'))
})
```

Also update the existing `assert.equal(interactions.length, 126)` test: it stays 126 for `map.rooms[0]` (the ground floor gains no interactions).

- [ ] **Step 2: Run** `node --test scripts/*.test.mjs` from the repo root. Expected: the three new tests FAIL (`map.rooms[1]` undefined).

- [ ] **Step 3: Create `scripts/floor2-layout.mjs`:**

```js
// Layout of the second floor, in tiles (32 px). The art (scripts/annex-art/floor2.py)
// and the map (scripts/matte-office-map.mjs) are both generated from these numbers.
// Rectangles are inclusive: { x1, y1, x2, y2 }.

export const FLOOR2_WIDTH = 50
export const FLOOR2_HEIGHT = 30

// Stairs down in the bottom left corner. The top step (triggerY) sends people
// to the ground floor; `arrival` is where people from the ground floor appear.
export const floor2Stairs = { x1: 1, y1: 25, x2: 3, y2: 28, triggerY: 25, arrival: [2, 23] }

// Focus desks: a work-area desk (5 x 2 tiles) with its chair on the row below.
export const FOCUS_COLUMNS = [1, 7, 13, 19]
export const FOCUS_ROWS = [3, 7, 11, 15, 19]
export const focusDesks = FOCUS_ROWS.flatMap((y, row) => FOCUS_COLUMNS.map((x, column) => ({
  id: `focus-desk-${row * FOCUS_COLUMNS.length + column + 1}`, x, y,
})))

// Team islands: copies of the office project table (7 x 4 tiles at ox, oy) with
// its six chairs, each inside its own private conversation area.
const ISLAND_AREAS = [
  { x1: 27, y1: 2, x2: 37, y2: 10 },
  { x1: 38, y1: 2, x2: 48, y2: 10 },
  { x1: 27, y1: 12, x2: 37, y2: 20 },
  { x1: 38, y1: 12, x2: 48, y2: 20 },
]
export const islands = [[30, 4], [40, 4], [30, 14], [40, 14]].map(([ox, oy], index) => ({
  id: `island-${index + 1}`, label: `Ilha ${index + 1}`, ox, oy, area: ISLAND_AREAS[index],
}))

export const floor2Signs = [
  { text: 'Área de foco · silêncio', x: 12, y: 1.6 },
  ...islands.map(island => ({ text: island.label, x: island.ox + 3.5, y: island.oy - 1.6 })),
  { text: 'Escada · Térreo', x: 2.5, y: 23.6 },
]
```

The project-table seat approaches relative to the table origin are (+1, -1), (+4, -1), (-2, +2), (+7, +2), (+1, +4), (+4, +4); for island-2 (ox 40) the left seat approach is x 38 and the right is x 47, both inside 38..48; for island-1 the right seat approach is x 37, inside 27..37.

- [ ] **Step 4: Add to `scripts/annex-layout.mjs`** (after `hallway`):

```js
// Stairs to the second floor at the bottom of the corridor. The top step
// (triggerY) sends people upstairs; `arrival` is where people from upstairs appear.
export const groundStairs = { x1: 50, y1: 26, x2: 52, y2: 28, triggerY: 26, arrival: [51, 24] }
```

and add `{ text: 'Escada · 2º andar', x: 51.5, y: 24.6 }` to `signs`, and `groundStairs` to the module's default/aggregate export list at the bottom if one exists (line ~84 lists exports for the art).

- [ ] **Step 5: Build the second floor in `scripts/matte-office-map.mjs`.** Refactor the tile helpers so they work on any tilemap: change `tile`, `block`, `open`, `area` to take the tilemap as first argument (`function tile(map, x, y)`, `block(map, x1, y1, x2, y2)`, …) and update the ground-floor calls to pass `tilemap`. Then add, before `const map = {`:

```js
import { FLOOR2_WIDTH, FLOOR2_HEIGHT, floor2Stairs, focusDesks, islands, floor2Signs } from './floor2-layout.mjs'
// (move this import to the top of the file with the other import)

// Ground floor stairs: the top step goes upstairs, the steps below are art only.
for (let x = groundStairs.x1; x <= groundStairs.x2; x++) {
  tile(tilemap, x, groundStairs.triggerY).teleporter = { roomIndex: 1, x: floor2Stairs.arrival[0], y: floor2Stairs.arrival[1] }
}
block(tilemap, groundStairs.x1, groundStairs.triggerY + 1, groundStairs.x2, groundStairs.y2)

// Second floor.
const floor2 = {}
for (let y = 0; y < FLOOR2_HEIGHT; y++) for (let x = 0; x < FLOOR2_WIDTH; x++) floor2[`${x}, ${y}`] = {}
block(floor2, 0, 0, FLOOR2_WIDTH - 1, 0)
block(floor2, 0, FLOOR2_HEIGHT - 1, FLOOR2_WIDTH - 1, FLOOR2_HEIGHT - 1)
block(floor2, 0, 0, 0, FLOOR2_HEIGHT - 1)
block(floor2, FLOOR2_WIDTH - 1, 0, FLOOR2_WIDTH - 1, FLOOR2_HEIGHT - 1)
for (let x = floor2Stairs.x1; x <= floor2Stairs.x2; x++) {
  tile(floor2, x, floor2Stairs.triggerY).teleporter = { roomIndex: 0, x: groundStairs.arrival[0], y: groundStairs.arrival[1] }
}
block(floor2, floor2Stairs.x1, floor2Stairs.triggerY + 1, floor2Stairs.x2, floor2Stairs.y2)
for (const desk of focusDesks) block(floor2, desk.x, desk.y, desk.x + 4, desk.y + 1)
for (const island of islands) {
  block(floor2, island.ox, island.oy, island.ox + 6, island.oy + 3)
  area(floor2, island.area, 'privateAreaId', island.id)
}

const focusObjects = focusDesks.map((desk, index) => officeObject(desk.id, 'desk', `Área de foco · mesa ${index + 1}`,
  [desk.x, desk.y, 5, 2], [desk.x + 2, desk.y + 2], { focus: true, seatVisual: { x: desk.x + 1.5, y: desk.y + 2.35, facing: 'up' } }))

// Each island copies the six project-table chairs, shifted from the office table at (22, 12).
const islandSeats = islands.flatMap(island => {
  const dx = island.ox - 22
  const dy = island.oy - 12
  return [
    officeObject(`${island.id}-top-left`, 'seat', `${island.label} · superior esquerda`, [22.9 + dx, 11.1 + dy, 1.2, 1.2], [23 + dx, 11 + dy], { seatVisual: { x: 23 + dx, y: 11.5 + dy, facing: 'down' } }),
    officeObject(`${island.id}-top-right`, 'seat', `${island.label} · superior direita`, [26 + dx, 11.1 + dy, 1.2, 1.2], [26 + dx, 11 + dy], { seatVisual: { x: 26.1 + dx, y: 11.5 + dy, facing: 'down' } }),
    officeObject(`${island.id}-left`, 'seat', `${island.label} · lateral esquerda`, [21.2 + dx, 13 + dy, 1.2, 2], [20 + dx, 14 + dy], { seatVisual: { x: 21.35 + dx, y: 13.6 + dy, facing: 'right' } }),
    officeObject(`${island.id}-right`, 'seat', `${island.label} · lateral direita`, [27.8 + dx, 13 + dy, 1.2, 2], [29 + dx, 14 + dy], { seatVisual: { x: 28.1 + dx, y: 13.6 + dy, facing: 'left' } }),
    officeObject(`${island.id}-bottom-left`, 'seat', `${island.label} · inferior esquerda`, [22.9 + dx, 14.8 + dy, 1.2, 1.3], [23 + dx, 16 + dy], { seatVisual: { x: 23 + dx, y: 15.3 + dy, facing: 'up' } }),
    officeObject(`${island.id}-bottom-right`, 'seat', `${island.label} · inferior direita`, [26 + dx, 14.8 + dy, 1.2, 1.3], [26 + dx, 16 + dy], { seatVisual: { x: 26.1 + dx, y: 15.3 + dy, facing: 'up' } }),
  ]
})
```

and change the map to two rooms:

```js
const map = {
  rooms: [{ /* ground floor, unchanged */ }, {
    name: '2º andar',
    backgroundImage: { src: '/matte-floor2.png', width: FLOOR2_WIDTH * 32, height: FLOOR2_HEIGHT * 32 },
    tilemap: floor2,
    interactions: [...focusObjects, ...islandSeats],
    areas: Object.fromEntries(islands.map(island => [island.id, { label: island.label }])),
    signs: floor2Signs,
  }],
  spawnpoint: { roomIndex: 0, x: 25, y: 18 },
}
```

Island seat bounds use fractional x/y like the office project seats; `validateOfficeMap` only checks integer bounds for configured kinds (external/presentation/speaker/pet/light), so seats are fine.

- [ ] **Step 6: Types.** In `backend/src/session.ts` add `focus?: boolean,` to `OfficeObject` (after `sitRange`). In `frontend/utils/pixi/zod.ts` add `focus: z.boolean().optional(),` next to `sitRange` in the interaction schema. Check `frontend/utils/pixi/types.ts`: if `OfficeObject` is declared by hand, add `focus?: boolean` there too.

- [ ] **Step 7: Run** `node --test scripts/*.test.mjs` (expect all pass, 14 tests), `cd backend && npx tsc -p . && node --test $(find dist -name "*.test.js")` (65 pass), and a map-load check: `cd backend && node -e "const {Session}=require('./dist/session'); const m=JSON.parse(require('child_process').execSync('node ../scripts/matte-office-map.mjs').toString()); new Session('t', m); console.log('ok', m.rooms.length)"` (if `Session` is not exported, use whatever `session.test` uses to build one). Then `cd frontend && npx tsc --noEmit --incremental false` and the frontend tests (114 pass), and parse the generated map with the frontend zod schema the same way an existing frontend test does (find a test that imports `zod.ts`, or add one: `RealmDataSchema.parse(map)` succeeds).

- [ ] **Step 8: Commit** `feat: second floor and stairs in the office map [skip render]`.

---

### Task 2: Art for the stairs and the second floor

**Files:**
- Create: `scripts/annex-art/kit.py` (shared helpers and cut-outs, moved out of `compose.py`)
- Modify: `scripts/annex-art/compose.py` (import from `kit.py`; draw the ground stairs)
- Create: `scripts/annex-art/floor2.py` (builds `frontend/public/matte-floor2.png`)
- Create: `frontend/public/matte-floor2.png`; Modify: `frontend/public/matte-office-v3.png`

**Interfaces:**
- Consumes: `scripts/annex-layout.mjs` `groundStairs`, `scripts/floor2-layout.mjs` (`floor2Stairs`, `focusDesks`, `islands`), read the same way `compose.py` reads `annex-layout.mjs` today (check its top: it evaluates the .mjs through node and parses JSON).
- Produces: `/matte-floor2.png` 1600 × 960, `/matte-office-v3.png` 2752 × 960.

Run every script from the repo root with the venv python: `PY=/private/tmp/claude-501/-Users-pedrosoares/03356041-6d92-46ea-be20-f5b76175358a/scratchpad/venv/bin/python`.

- [ ] **Step 1: Pin the current art.** `shasum frontend/public/matte-office-v3.png` and keep the value.
- [ ] **Step 2: Extract `kit.py`.** Move everything from `compose.py` above the `# Build.` section (sources, cut-outs, floors, walls, colors, helpers such as `px`, `color`, `shade`, `cut_out`, `despeckle`, `place`, `quilt`, `brick`, `rug`, `profile`, `panels`, `wall_pieces`, `h_wall`, `v_wall`, `spaced`, `post`, `cap`, and the loaded office image) into `kit.py`. Functions that draw onto the output image must take the target image as a parameter (or `kit.py` exposes a `canvas(width_px, height_px)` that the caller creates and passes); keep behaviour identical. `compose.py` does `sys.path.insert(0, os.path.dirname(__file__))` then `from kit import *` (or explicit names).
- [ ] **Step 3: Prove the refactor changed nothing.** `$PY scripts/annex-art/compose.py` then `shasum frontend/public/matte-office-v3.png` must equal Step 1's value. If not, fix the refactor until it does. Commit `refactor: share the annex art toolkit [skip render]`.
- [ ] **Step 4: Stairs piece in `kit.py`:** `def stairs(img, x1, y1, x2, y2, going='down')` draws, on the tile rectangle, a staircase seen from above in the office style: steps as horizontal wood planks (sample the stage wood colours already used for the training stage in `compose.py`), each step 1 tile tall with a 3 px darker front edge and a 2 px light top highlight, steps getting darker towards the far end (shade 1.0 → 0.7) to read as descending, dark posts (`post`) and a 4 px dark rail on both sides. `going='down'` darkens towards higher y; `'up'` the reverse.
- [ ] **Step 5: Ground stairs in `compose.py`:** after the corridor floor is laid, call `stairs(img, 50, 26, 52, 28, 'down')`. Run it, then diff against the pinned image with Pillow: changed pixels must all lie in tiles x 50..52, y 24..28 (print the bounding box of `ImageChops.difference(old, new).getbbox()` in tiles). Crop x 48..54, y 22..29 tiles at 4× to a scratch PNG and look at it (Read the PNG): the stairs read as a staircase going down at the bottom of the corridor and nothing else changed.
- [ ] **Step 6: `floor2.py`.** Build a 1600 × 960 canvas with `kit.py`:
  1. Floor: quilt the office work-area carpet over x 1..23 (focus area), the corridor wood/brick floor over x 24..26 and y 21..28, a lighter carpet over x 27..48; one `rug` per island area rectangle (from `islands[].area`) in the style of the office rugs.
  2. Walls: outer walls on all four edges with `h_wall`/`v_wall` like the annex outer walls (top wall with windows).
  3. Focus desks: for each `focusDesks` entry, paste the office work-area desk cut-out (the one the ground floor uses for `desk-left-1`, office tiles x 5..9, y 11..12 plus its chair on row 13; reuse the existing cut-out source if `kit.py` has one for the directors' desk, which is the same desk) with its top-left at (x, y). Between columns place a low plant or the office desk partition every other row, never on an approach tile (x + 2, y + 2).
  4. Islands: paste the office project table with its six chairs (office tiles x 20..29, y 11..16, the piece the 1:1 rooms do NOT use; add a cut-out source in `kit.py` checked on a zoomed crop) shifted so the table's top-left is (ox, oy).
  5. Stairs: `stairs(img, 1, 25, 3, 28, 'down')`.
  6. Decoration: office plants in the four corners of each half and next to the stairs, clear of every approach tile and of the corridor x 24..26.
  Save to `frontend/public/matte-floor2.png`.
- [ ] **Step 7: Check the art against the map.** Write a scratch script that overlays the second-floor tilemap on the PNG (red 30 % fill on impassable tiles, green dot on every approach tile, blue outline on island areas, yellow on teleporter tiles) and Read the result at full size. Every desk and table must sit under red tiles, every chair under its green dot, the stairs under the yellow/red rows, and no furniture on walkable tiles. Fix `floor2.py` (or the layout numbers in Task 1's file, re-running Task 1's tests) until it lines up.
- [ ] **Step 8: Commit** `feat: stairs and second floor art [skip render]`.

---

### Task 3: Focus mode on the server

**Files:**
- Create: `backend/src/office/FocusState.ts`, `backend/src/office/FocusState.test.ts`
- Modify: `backend/src/office/OfficeState.ts` (public `seatOf(uid)`)
- Modify: `backend/src/session.ts` (`focus`, `isFocused`, zone override, pair pruning)
- Create: `backend/src/session-focus.test.ts`
- Modify: `backend/src/sockets/sockets.ts` (`focusKnock`, `focusAnswer`, regroup after `officeAction`), `backend/src/sockets/socket-types.ts` (zod for the two events)

**Interfaces:**
- Consumes: `OfficeObject.focus` (Task 1).
- Produces (socket, client → server): `focusKnock({ targetUid: string }, ack)` → ack `{ ok: true } | { ok: false, error: string }`; `focusAnswer({ knockId: string, accept: boolean }, ack)` → same ack shape.
- Produces (socket, server → client): `focusKnocked({ knockId, fromUid, fromName })` to the target; `focusKnockClosed({ knockId })` to the target when a knock expires; `focusAnswered({ accepted: boolean, name: string })` to the knocker (name = target's name). Proximity changes arrive as the existing `proximityUpdate`.
- Produces: `Session.isFocused(uid): boolean`, `Session.focus: FocusState`, `OfficeState.seatOf(uid): OfficeObject | null`, `withinReach(a: {x,y}, b: {x,y}): boolean` exported from `FocusState.ts`.

- [ ] **Step 1: Failing tests for `FocusState`** (`backend/src/office/FocusState.test.ts`, same style as `MeetingState.test.ts`):

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FocusState, withinReach } from './FocusState'

const clock = () => { let t = 1000; return { now: () => t, advance: (ms: number) => { t += ms } } }
const ids = () => { let n = 0; return () => `k${++n}` }

test('a knock can be accepted once by its target and pairs the two', () => {
  const c = clock(); const focus = new FocusState(c.now, ids())
  const knock = focus.knock('bia', 'ana')
  assert.ok(knock.ok)
  assert.deepEqual(focus.answer('k1', 'caio', true), { ok: false, error: 'Chamada não encontrada.' })
  const answer = focus.answer('k1', 'ana', true)
  assert.ok(answer.ok)
  assert.equal(focus.partnerOf('ana'), 'bia')
  assert.equal(focus.partnerOf('bia'), 'ana')
  assert.equal(focus.focusedOf('bia'), 'ana')
  assert.equal(focus.focusedOf('ana'), 'ana')
  assert.deepEqual(focus.answer('k1', 'ana', true), { ok: false, error: 'Chamada não encontrada.' })
})

test('declining pairs nobody; a late answer expires', () => {
  const c = clock(); const focus = new FocusState(c.now, ids())
  focus.knock('bia', 'ana')
  assert.ok(focus.answer('k1', 'ana', false).ok)
  assert.equal(focus.partnerOf('ana'), null)
  c.advance(60_000)
  focus.knock('bia', 'ana')
  c.advance(30_001)
  assert.deepEqual(focus.answer('k2', 'ana', true), { ok: false, error: 'A chamada expirou.' })
})

test('the same person can knock again only after a minute', () => {
  const c = clock(); const focus = new FocusState(c.now, ids())
  focus.knock('bia', 'ana')
  focus.answer('k1', 'ana', false)
  assert.deepEqual(focus.knock('bia', 'ana'), { ok: false, error: 'Aguarde um minuto para chamar de novo.' })
  c.advance(60_000)
  assert.ok(focus.knock('bia', 'ana').ok)
  assert.ok(focus.knock('caio', 'ana').ok)
  assert.deepEqual(focus.knock('ana', 'ana'), { ok: false, error: 'Chamada inválida.' })
})

test('expire closes a pending knock once', () => {
  const c = clock(); const focus = new FocusState(c.now, ids())
  focus.knock('bia', 'ana')
  assert.equal(focus.expire('k1')?.from, 'bia')
  assert.equal(focus.expire('k1'), null)
})

test('prune ends pairs the caller no longer keeps', () => {
  const c = clock(); const focus = new FocusState(c.now, ids())
  focus.knock('bia', 'ana'); focus.answer('k1', 'ana', true)
  focus.prune(() => true)
  assert.equal(focus.partnerOf('ana'), 'bia')
  focus.prune((focused, knocker) => !(focused === 'ana' && knocker === 'bia'))
  assert.equal(focus.partnerOf('ana'), null)
})

test('reach is the proximity circle of radius 2.5', () => {
  assert.ok(withinReach({ x: 0, y: 0 }, { x: 2, y: 1 }))
  assert.ok(!withinReach({ x: 0, y: 0 }, { x: 2, y: 2 }))
  assert.ok(!withinReach({ x: 0, y: 0 }, { x: 3, y: 0 }))
})
```

- [ ] **Step 2: Run** `cd backend && npx tsc -p . ; node --test dist/office/FocusState.test.js` → FAIL (module missing).

- [ ] **Step 3: Implement `backend/src/office/FocusState.ts`:**

```ts
import { randomUUID } from 'crypto'

export type Knock = { id: string, from: string, to: string, at: number }
export type FocusResult = { ok: true, knock: Knock } | { ok: false, error: string }

export const KNOCK_ANSWER_MS = 30_000
export const KNOCK_COOLDOWN_MS = 60_000

// Same circle as the proximity tiles (radius 2.5): close enough to talk.
export function withinReach(a: { x: number, y: number }, b: { x: number, y: number }): boolean {
    const dx = a.x - b.x
    const dy = a.y - b.y
    return dx * dx + dy * dy <= 6.25
}

// Knocks on people seated at focus desks, and the conversations they accepted.
// One pair per focused person: an accepted knock replaces any earlier pair.
export class FocusState {
    private readonly knocks = new Map<string, Knock>()
    private readonly pairs = new Map<string, string>() // focused uid -> knocker uid
    private readonly lastKnock = new Map<string, number>() // `${from}>${to}` -> time

    constructor(private readonly now: () => number = Date.now, private readonly newId: () => string = randomUUID) {}

    knock(from: string, to: string): FocusResult {
        if (from === to) return { ok: false, error: 'Chamada inválida.' }
        if (this.pairs.get(to) === from) return { ok: false, error: 'Vocês já estão conversando.' }
        const at = this.now()
        const last = this.lastKnock.get(`${from}>${to}`)
        if (last !== undefined && at - last < KNOCK_COOLDOWN_MS) return { ok: false, error: 'Aguarde um minuto para chamar de novo.' }
        const knock = { id: this.newId(), from, to, at }
        this.knocks.set(knock.id, knock)
        this.lastKnock.set(`${from}>${to}`, at)
        return { ok: true, knock }
    }

    answer(id: string, by: string, accept: boolean): FocusResult {
        const knock = this.knocks.get(id)
        if (!knock || knock.to !== by) return { ok: false, error: 'Chamada não encontrada.' }
        this.knocks.delete(id)
        if (this.now() - knock.at > KNOCK_ANSWER_MS) return { ok: false, error: 'A chamada expirou.' }
        if (accept) this.pairs.set(knock.to, knock.from)
        return { ok: true, knock }
    }

    // Closes a knock nobody answered; null when it was already answered.
    expire(id: string): Knock | null {
        const knock = this.knocks.get(id)
        if (!knock) return null
        this.knocks.delete(id)
        return knock
    }

    partnerOf(uid: string): string | null {
        const knocker = this.pairs.get(uid)
        if (knocker) return knocker
        for (const [focused, other] of this.pairs) if (other === uid) return focused
        return null
    }

    // The focused person of the pair `uid` is in (themselves when focused and paired).
    focusedOf(uid: string): string | null {
        if (this.pairs.has(uid)) return uid
        for (const [focused, knocker] of this.pairs) if (knocker === uid) return focused
        return null
    }

    // Keeps only the pairs `keep` approves (both present, still focused, still close).
    prune(keep: (focused: string, knocker: string) => boolean): void {
        for (const [focused, knocker] of [...this.pairs]) if (!keep(focused, knocker)) this.pairs.delete(focused)
    }
}
```

- [ ] **Step 4: Run** the FocusState tests → PASS.

- [ ] **Step 5: Failing session tests** (`backend/src/session-focus.test.ts`). Build a tiny two-room-free map like `session-meeting.test.ts` does (read it and copy its helper): a 12 × 6 room, all tiles walkable, interactions: `focus-a` desk `{ bounds: {x:1,y:1,width:2,height:1}, approach: {x:2,y:3}, focus: true }`, `focus-b` desk `{ bounds: {x:5,y:1,width:2,height:1}, approach: {x:6,y:3}, focus: true }` (approaches 4 tiles apart), `plain` desk at approach (10, 3) without focus. Tests:

```ts
test('a person at a focus desk joins no proximity call', () => {
  // ana at (2,3) seats on focus-a by stepping there (use the same step helper as session-meeting.test.ts);
  // bia stands at (3,3), next to her.
  // expect session.isFocused('ana') === true, session.getPlayer('ana').proximityId === null,
  // and bia's proximityId === null (she is alone).
})

test('sitting down by clicking also leaves the call at once', () => {
  // ana and bia stand at (2,4) and (3,4): same proximityId.
  // session.featuresFor('ana').office.occupy('ana', 'focus-a'); session.setProximityIdsWithPlayer('ana')
  // expect ana.proximityId === null and bia.proximityId === null
})

test('two focused neighbours and someone between them stay apart', () => {
  // ana seated at focus-a (2,3), caio seated at focus-b (6,3), bia standing at (4,3).
  // expect all three proximityId null.
})

test('an accepted knock joins the two; walking away or standing up ends it', () => {
  // ana seated at focus-a; bia at (3,4). const k = session.focus.knock('bia','ana'); session.focus.answer(k.knock.id,'ana',true)
  // session.setProximityIdsWithPlayer('bia') -> ana and bia share a non-null proximityId
  // move bia to (6,4) (out of reach) -> both null, and session.focus.partnerOf('ana') === null
  // re-knock after advancing the FocusState clock is not needed: build a new pair by calling focus.answer on a fresh knock with a FocusState whose clock you control (construct Session then replace session.focus = new FocusState(clock.now, ids())).
  // pair again, then ana steps off the desk -> both null and pair gone.
})

test('removing a player ends their pair', () => {
  // pair ana+bia, session.removePlayer('bia'), session.setProximityIdsWithPlayer('bia') -> focus.partnerOf('ana') === null
})
```

Write each test fully with the helpers you copied (no comments left as placeholders): place players with `session.addPlayer(socketId, uid, name, skin)` then `session.featuresFor(uid).office.step(...)`/`session.movePlayer(...)` exactly as `session-meeting.test.ts` does.

- [ ] **Step 6: Implement in `OfficeState.ts`:**

```ts
  // The seat or desk this visitor occupies, if any.
  seatOf(uid: string): OfficeObject | null {
    const objectId = this.objectOccupiedBy(uid)
    return objectId ? this.objects.get(objectId) ?? null : null
  }
```

- [ ] **Step 7: Implement in `session.ts`:** import `{ FocusState, withinReach }`; add `public focus = new FocusState()`; add

```ts
    // Seated at a focus desk: out of every proximity call unless a knock was accepted.
    public isFocused(uid: string): boolean {
        const player = this.players[uid]
        return Boolean(player && this.roomFeatures[player.room].office.seatOf(uid)?.focus)
    }
```

and in `setProximityIdsWithPlayer`, before building groups:

```ts
        this.focus.prune((focused, knocker) => {
            const a = this.players[focused]
            const b = this.players[knocker]
            return Boolean(a && b && a.room === b.room && this.isFocused(focused) && !this.isFocused(knocker) && withinReach(a, b))
        })
        const focusZone = (player: Player) => {
            const focused = this.focus.focusedOf(player.uid)
            if (focused) return `focus:${focused}`
            return this.isFocused(player.uid) ? `focus:${player.uid}` : null
        }
```

and change `zoneOf` to `const zoneOf = (player: Player) => focusZone(player) ?? this.map_data.rooms[player.room].tilemap[`${player.x}, ${player.y}`]?.privateAreaId ?? null`.

- [ ] **Step 8: Run** backend tests → all pass (65 + 6 FocusState + 5 session-focus).

- [ ] **Step 9: Socket handlers** in `sockets.ts`. Add zod schemas in `socket-types.ts`: `FocusKnock = z.object({ targetUid: z.string().uuid() })`, `FocusAnswer = z.object({ knockId: z.string().min(1).max(64), accept: z.boolean() })`. Add a helper next to the existing proximity loops (factor the three repeated loops `for (const changedUid of changed) { ... emit('proximityUpdate') }` into it and use it everywhere they appear):

```ts
function sendProximity(session: Session, changed: string[]) {
    for (const changedUid of changed) {
        const player = session.getPlayer(changedUid)
        if (player) io.to(player.socketId).emit('proximityUpdate', { proximityId: player.proximityId })
    }
}
```

In `officeAction`, after `ack(...)`: `if (result.changed) sendProximity(session, session.setProximityIdsWithPlayer(uid))`.

Handlers (inside the connection closure, after `meetingRaiseHand`):

```ts
        socket.on('focusKnock', async (raw: unknown, ack: unknown) => {
            if (typeof ack !== 'function') return
            await officeStepQueue
            const uid = socket.handshake.query.uid as string
            const parsed = FocusKnock.safeParse(raw)
            const session = sessionManager.getPlayerSession(uid)
            const me = session?.getPlayer(uid)
            if (!parsed.success || !session || !me || me.socketId !== socket.id) return ack({ ok: false, error: 'Chamada inválida.' })
            const target = session.getPlayer(parsed.data.targetUid)
            if (!target || target.room !== me.room || !session.isFocused(target.uid) || session.isFocused(uid) || !withinReach(me, target)) {
                return ack({ ok: false, error: 'Chegue perto de quem está em foco para chamar.' })
            }
            const result = session.focus.knock(uid, target.uid)
            if (!result.ok) return ack(result)
            io.to(target.socketId).emit('focusKnocked', { knockId: result.knock.id, fromUid: uid, fromName: me.username })
            ack({ ok: true })
            setTimeout(() => {
                if (!session.focus.expire(result.knock.id)) return
                const knocker = session.getPlayer(uid)
                const focused = session.getPlayer(target.uid)
                if (knocker) io.to(knocker.socketId).emit('focusAnswered', { accepted: false, name: target.username })
                if (focused) io.to(focused.socketId).emit('focusKnockClosed', { knockId: result.knock.id })
            }, KNOCK_ANSWER_MS)
        })

        socket.on('focusAnswer', async (raw: unknown, ack: unknown) => {
            if (typeof ack !== 'function') return
            await officeStepQueue
            const uid = socket.handshake.query.uid as string
            const parsed = FocusAnswer.safeParse(raw)
            const session = sessionManager.getPlayerSession(uid)
            const me = session?.getPlayer(uid)
            if (!parsed.success || !session || !me || me.socketId !== socket.id) return ack({ ok: false, error: 'Chamada inválida.' })
            const result = session.focus.answer(parsed.data.knockId, uid, parsed.data.accept)
            if (!result.ok) return ack(result)
            const knocker = session.getPlayer(result.knock.from)
            ack({ ok: true })
            if (parsed.data.accept) sendProximity(session, session.setProximityIdsWithPlayer(uid))
            const paired = session.focus.partnerOf(uid) === result.knock.from
            if (knocker) io.to(knocker.socketId).emit('focusAnswered', { accepted: parsed.data.accept && paired, name: me.username })
        })
```

(`paired` is false when the prune inside `setProximityIdsWithPlayer` dropped the pair because the knocker had already walked away; the knocker then hears "está em foco agora".) Import `KNOCK_ANSWER_MS`, `withinReach` from `../office/FocusState`.

- [ ] **Step 10: Run** backend `npx tsc -p .` and all backend tests → pass. **Commit** `feat: focus desks and knocking on the server [skip render]`.

---

### Task 4: Focus mode in the client

**Files:**
- Create: `frontend/utils/pixi/office/focus.ts`, `frontend/utils/pixi/office/focus.test.mjs`
- Modify: `frontend/utils/pixi/PlayApp.ts` (focus badges, `focusNearby`, `focusSelf` signals)
- Modify: `frontend/utils/pixi/Player/AvatarDecorations.ts` and `frontend/utils/pixi/Player/Player.ts` (badge)
- Create: `frontend/app/play/FocusControls.tsx`
- Modify: `frontend/app/play/PlayClient.tsx` (mount `FocusControls`)

**Interfaces:**
- Consumes: socket events from Task 3; `OfficeObject.focus` (Task 1); `OfficeSnapshot.occupancy` (existing, `objectId -> { uid, name }`).
- Produces: `focusedUids(objects: { id: string, focus?: boolean }[], occupancy: Record<string, { uid: string }>): Set<string>`; `nearestFocused(me: { x: number, y: number }, people: { uid: string, name: string, x: number, y: number }[], focused: Set<string>): { uid: string, name: string } | null` (closest within dx² + dy² ≤ 6.25, ties by name); signals `focusNearby` (`{ uid, name } | null`) and `focusSelf` (`boolean`); `Player.setFocusBadge(on: boolean)`.

- [ ] **Step 1: Failing tests** `frontend/utils/pixi/office/focus.test.mjs` (follow the import style of a sibling `.test.mjs` in that folder):

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { focusedUids, nearestFocused } from './focus.ts'

test('only occupants of focus desks are focused', () => {
  const objects = [{ id: 'f1', focus: true }, { id: 'd1' }, { id: 'f2', focus: true }]
  const set = focusedUids(objects, { f1: { uid: 'ana' }, d1: { uid: 'bia' } })
  assert.deepEqual([...set], ['ana'])
})

test('the nearest focused person within reach is offered', () => {
  const people = [{ uid: 'ana', name: 'Ana', x: 2, y: 1 }, { uid: 'caio', name: 'Caio', x: 1, y: 0 }, { uid: 'bia', name: 'Bia', x: 0, y: 1 }]
  assert.deepEqual(nearestFocused({ x: 0, y: 0 }, people, new Set(['ana', 'caio'])), { uid: 'caio', name: 'Caio' })
  assert.equal(nearestFocused({ x: 0, y: 0 }, [{ uid: 'ana', name: 'Ana', x: 2, y: 2 }], new Set(['ana'])), null)
})
```

- [ ] **Step 2: Run** `cd frontend && node --experimental-strip-types --test utils/pixi/office/focus.test.mjs` → FAIL.

- [ ] **Step 3: Implement `focus.ts`:**

```ts
// Who is seated at a focus desk, from the room's objects and the seat occupancy.
export function focusedUids(objects: { id: string, focus?: boolean }[], occupancy: Record<string, { uid: string }>): Set<string> {
    const focusIds = new Set(objects.filter(object => object.focus).map(object => object.id))
    return new Set(Object.entries(occupancy).filter(([id]) => focusIds.has(id)).map(([, seat]) => seat.uid))
}

// The focused person this visitor can knock on: the closest within the proximity circle.
export function nearestFocused(me: { x: number, y: number }, people: { uid: string, name: string, x: number, y: number }[], focused: Set<string>): { uid: string, name: string } | null {
    const candidates = people
        .filter(person => focused.has(person.uid))
        .map(person => ({ person, distance: (person.x - me.x) ** 2 + (person.y - me.y) ** 2 }))
        .filter(candidate => candidate.distance <= 6.25)
        .sort((a, b) => a.distance - b.distance || a.person.name.localeCompare(b.person.name))
    return candidates.length ? { uid: candidates[0].person.uid, name: candidates[0].person.name } : null
}
```

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Badge.** In `AvatarDecorations` add a `focusBadge` container (hidden by default): a small pill with text `em foco` (fontSize 9, fill `0x0b1220`, background `0x65e3c2`), positioned 14 px above the nameplate in `position()`; `setFocus(on: boolean)` toggles `visible`; destroy it in `destroy()`. In `Player` add `public setFocusBadge(on: boolean)` that calls the decorations' `setFocus` (find where `Player` owns its `AvatarDecorations` instance and add the badge container to the same parent layer as the nameplate).

- [ ] **Step 6: PlayApp.** Add a private `updateFocus()` that:
  1. computes `const focused = focusedUids(room.interactions ?? [], this.officeSnapshot.occupancy)`;
  2. calls `setFocusBadge(focused.has(uid))` on `this.player` and every `this.players[uid]`;
  3. emits `signal.emit('focusSelf', focused.has(this.uid))` only when the value changed from the last call (keep `private focusSelf = false`); when it turns true also `signal.emit('officeNotice', { message: 'Modo foco: ninguém te escuta. Quem quiser falar vai te chamar.', key: 'focus-on' })`;
  4. if this visitor is not focused, computes `nearestFocused(this.player.currentTilePosition, Object.entries(this.players).map(([uid, p]) => ({ uid, name: p.username, x: p.currentTilePosition.x, y: p.currentTilePosition.y })), focused)`, else `null`, and emits `focusNearby` with it when its uid changed from the last emitted value.
  Call `updateFocus()` at the end of `onOfficeStateChanged`, in `onLocalPlayerTileChanged`, at the end of `onPlayerMoved` (after `moveToTile`) and at the end of `loadRoom`.

- [ ] **Step 7: `FocusControls.tsx`** (client component, Tailwind, same look as `MeetingControls` cards: `rounded-xl bg-slate-950 text-white shadow` etc.):
  - State `nearby` from signal `focusNearby`; when set, a button fixed above the bottom toolbar, centered: `Chamar {nearby.name}`. Click → `server.socket.emit('focusKnock', { targetUid: nearby.uid }, (r) => signal.emit('officeFeedback', { message: r?.ok ? `Chamando ${nearby.name}...` : r?.error ?? 'Não foi possível chamar.' }))`.
  - Knocks received: `server.socket.on('focusKnocked', k => setKnocks(list => [...list, k]))`; render each as a card `{fromName} quer falar com você` with buttons `Aceitar` / `Agora não` → `server.socket.emit('focusAnswer', { knockId, accept }, r => { if (!r?.ok) signal.emit('officeFeedback', { message: r?.error ?? 'Não foi possível responder.' }) })` and remove the card. Remove a card on `focusKnockClosed` and after 30 s on its own.
  - `server.socket.on('focusAnswered', ({ accepted, name }) => signal.emit('officeFeedback', { message: accepted ? `${name} aceitou. Vocês estão conversando.` : `${name} está em foco agora.` }))`.
  - Unsubscribe everything in the effect cleanup.
- [ ] **Step 8: Mount** `<FocusControls />` in `PlayClient.tsx` next to `OfficeHud` (inside the same relative container so it is above the canvas, `z-30`).
- [ ] **Step 9: Run** `npx tsc --noEmit --incremental false` and all frontend tests → pass. **Commit** `feat: focus badges and knocking in the client [skip render]`.

---

### Task 5: End-to-end check (controller)

Local backend (`cd backend && npm run build && node dist/index.js`) and frontend (`npx next build && npx next start -p 3000`, with the temporary `window.__playApp = app` line in `frontend/app/play/PixiApp.tsx` that is reverted afterwards), a throwaway realm with the generated map (`scratchpad/meeting-realm.cjs`, swap `meeting-map.json` for the new map), and the Playwright driver (`scratchpad/meeting-driver.cjs`). Checks:

1. Walk a guest through the passage to (51, 25) and onto (51, 26): it arrives upstairs at (2, 23), the floor-2 art and signs render, and the guest is listed in room 1 by `/getPlayersInRoom?roomIndex=1`. Reload: still upstairs. Step onto (2, 25): back at (51, 24) on the ground floor.
2. Two guests upstairs: one sits at `focus-desk-1` (approach (3, 5)), the other stands at (4, 5): no call (`proximityId` null on both), the badge shows, the stander sees `Chamar …`; knock, accept: same proximityId; walk to (8, 5): both null. Knock again within a minute: the cooldown message.
3. A guest at `island-1` seats and one at `island-2` seats: two separate calls; a third guest in the corridor hears neither.
4. Ground-floor and upstairs guests never share a call.
5. Screenshot each floor and compare the stairs, desks and islands with the overlay from Task 2.

Clean up: stop the servers, revert `PixiApp.tsx`, delete the realm and the anonymous guests (check `is_anonymous`).

### Task 6: Release (needs the owner)

1. Ask Pedro for a time with nobody online and for the Render Manual Deploy.
2. ff-merge `feat/second-floor` into `main`, add the empty commit `chore: release the second floor` (without `[skip render]`), push; publish the site (Vercel may not pick up pushes: deploy from a `git archive` export with `npx vercel deploy --prod --yes`, as done on 12/10).
3. After Pedro's Render deploy, probe `focusKnock` with an invalid payload: the new backend answers `{ ok: false, error: 'Chamada inválida.' }`.
4. Back up the live `map_data` to `~/Backup-secrets/gather-map-data-before-second-floor-<date>.json`, PATCH the new map, smoke-test with one guest going upstairs and back, delete the guest.
