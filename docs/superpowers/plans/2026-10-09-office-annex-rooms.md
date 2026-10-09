# Office Annex Rooms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dark annex wing to the right of the Matte office (training room for 50, four 1:1 rooms for up to 3 people, the directors' room) that reveals itself when a visitor steps into a passage in the office's east wall, with signs over every door.

**Architecture:** One wider map (86 x 30 tiles). The tile layout of the wing lives in one module (`scripts/annex-layout.mjs`) that drives both the art compositor (Python + Pillow, cutting pieces from the current office art) and the map generator. The server learns "areas" (capacity, stage audio, no proximity calls in the audience) and flat-volume speakers; the client draws a per-visit darkness layer and signs.

**Tech Stack:** Next.js 14.2 + PixiJS 8 + gsap (frontend), Node + Socket.IO + TypeScript (backend), zod, `node:test`, Python 3 + Pillow 12 (art build tool only, never shipped).

**Spec:** `docs/superpowers/specs/2026-10-09-escritorio-ala-de-salas-design.md` (approved by Pedro on 2026-10-09).

## Global Constraints

- Map: 86 tiles wide, 30 tall, 32 px per tile. Office keeps x 0..49 unchanged except the passage at (49,15) and (49,16). Wing occupies x 50..85.
- Reveal: per visit, never persisted. Darkness covers x 50..85, y 0..29; signs stay visible in the dark; revealing takes about 1.5 s and sweeps from the passage to the right.
- Signs, verbatim: `Salas →`, `Sala de treinamento`, `1:1 · 1`, `1:1 · 2`, `1:1 · 3`, `1:1 · 4`, `Diretoria · Pedro Soares`.
- 1:1 rooms: capacity 3, enforced by the server; the rejected step returns the error text `Sala cheia.`; conversation private (privateAreaId).
- Directors' room: open to anyone, private conversation, no capacity.
- Training: 50 seats (5 rows x 10), stage speaker and audience microphone both flat volume 100 for every listener inside the training area, both may be active together; no proximity calls between people inside the training area; seats sit only when standing exactly on the seat tile.
- Office capacity: 80 visitors; the 81st sees `O escritório está cheio. O limite é de 80 pessoas.`
- All user-visible copy in Brazilian Portuguese, no em or en dash.
- The live office must keep working exactly as before for anyone outside the wing; existing tests keep passing.
- The art for the wing is built only from pieces of `frontend/public/matte-office-v2.png` and simple drawn shapes in colors sampled from it; output `frontend/public/matte-office-v3.png`; `matte-office-v2.png` is kept (home page uses it).
- **Gate:** after Task 2 the controller shows the art to Pedro and waits for his approval before Task 3. Publishing (Task 10) waits for a time slot Pedro confirms; it restarts the office server and disconnects everyone briefly.
- Every commit message carries `[skip render]` on the subject line until Task 10, so no intermediate commit restarts the live server.
- Never push or merge before Task 10.

## Review Focus

1. A fourth visitor walking into a full 1:1 room: stopped at the door with `Sala cheia.`, and the three inside stay undisturbed. Tested in Task 3 (`OfficeState`) and Task 9 (four browsers).
2. Reconnecting while inside a 1:1 room that filled up in the meantime: the visitor returns to the reception, not into the room. Tested in Task 3 (`Session.addPlayer`).
3. People sitting side by side in the training audience: no proximity call forms, while people standing in the office keep their calls. Tested in Task 4.
4. Walking down the training aisle: the avatar does not sit down in every seat it passes. Tested in Task 3 (`sitRange: 0`).
5. Reloading the page inside or outside the wing: darkness returns outside, and a visitor resumed inside the wing sees it lit immediately. Tested in Task 6 (`shouldReveal`) and Task 9 screenshots.

---

## File Structure

| File | Responsibility |
|---|---|
| `scripts/annex-layout.mjs` (create) | Single source of the wing layout: sizes, passage, walls, doors, rooms, seats, signs. Prints JSON when run. |
| `scripts/annex-layout.test.mjs` (create) | Geometry checks of the layout. |
| `scripts/annex-art/compose.py` (create) | Builds `frontend/public/matte-office-v3.png` from the layout and office art. |
| `frontend/public/matte-office-v3.png` (create) | Office + wing art. |
| `backend/src/office/areas.ts` (create) | `areaAt`, `areaConfig`, `isStageArea`. |
| `backend/src/office/areas.test.ts` (create) | Tests for areas. |
| `backend/src/session.ts` (modify) | Types (`areas`, `areaId`, `sitRange`, speaker `flat`), resume fallback for full rooms, stage areas excluded from proximity, `MAX_PLAYERS_PER_SPACE`. |
| `backend/src/office/OfficeState.ts` (modify) | Capacity check on steps, `hasRoomFor`, `sitRange`. |
| `backend/src/office/SpeakerState.ts` (modify) | Area-based zone check, flat volume, mic expiry when the owner walks away. |
| `backend/src/office/object-config.ts` (modify) | Speaker `flat` flag. |
| `backend/src/sockets/sockets.ts` (modify) | Use `MAX_PLAYERS_PER_SPACE` and the Portuguese message. |
| `frontend/utils/pixi/zod.ts` (modify) | Schema for `areaId`, `areas`, `annex`, `signs`, `sitRange`, speaker `flat`. |
| `frontend/utils/pixi/office/annex-reveal.ts` (create) | Pure reveal rules. |
| `frontend/utils/pixi/office/annex-reveal.test.mjs` (create) | Tests. |
| `frontend/utils/pixi/office/AnnexLayer.ts` (create) | Darkness and signs drawing. |
| `frontend/utils/pixi/PlayApp.ts` (modify) | Create the layer per room, reveal on tile change, clean up. |
| `scripts/matte-office-map.mjs` (modify) | Wing tiles, walls, areas, objects, signs, annex config, v3 background. |
| `scripts/matte-office-map.test.mjs` (modify) | Updated counts and wing checks. |
| `README.md` (modify) | How to rebuild the art and the map. |

---

### Task 0: Branch

The branch `feat/office-annex-rooms` already exists in `/Users/pedrosoares/gather-clone` (main checkout, not a worktree: `.env` files are not copied into worktrees) with the spec commit `a634ddd`. Run every command from this checkout.

- [ ] **Step 1:** `cd /Users/pedrosoares/gather-clone && git switch feat/office-annex-rooms && git log --oneline -1` — Expected: `a634ddd docs: specify the office annex rooms [skip render]` or a later commit of this plan.

---

### Task 1: Wing layout module

**Files:**
- Create: `scripts/annex-layout.mjs`
- Test: `scripts/annex-layout.test.mjs`

**Interfaces:**
- Produces (named exports): `TILE = 32`, `OFFICE_WIDTH = 50`, `MAP_WIDTH = 86`, `MAP_HEIGHT = 30`, `passage`, `annex` (`{ reveal: { x, y, width, height }, triggers: [x, y][] }`), `corridor`, `hallway`, `walls` (`[x1, y1, x2, y2][]`), `doors` (`[x1, y1, x2, y2][]`), `training`, `oneOnOnes`, `directors`, `signs` (`{ text, x, y }[]`), `SEAT_VISUAL` (`{ dx, dy }`), `CHAIR_OFFSET` (`{ dx, dy }`). Running `node scripts/annex-layout.mjs` prints all of them as one JSON object.

- [ ] **Step 1: Write the failing test**

Create `scripts/annex-layout.test.mjs`:

```js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as layout from './annex-layout.mjs'

const inside = ({ x1, y1, x2, y2 }, x, y) => x >= x1 && x <= x2 && y >= y1 && y <= y2

test('the wing sits right of the office inside an 86 x 30 map', () => {
  assert.equal(layout.MAP_WIDTH, 86)
  assert.equal(layout.MAP_HEIGHT, 30)
  assert.deepEqual(layout.annex.reveal, { x: 50, y: 0, width: 36, height: 30 })
  assert.deepEqual(layout.annex.triggers, [[49, 15], [49, 16]])
  for (const [x1, y1, x2, y2] of [...layout.walls, ...layout.doors]) {
    assert.ok(x1 >= 49 && x2 <= 85 && y1 >= 0 && y2 <= 29 && x1 <= x2 && y1 <= y2)
  }
})

test('the training room has 50 distinct seats in 5 rows of 10 inside the room', () => {
  const seats = layout.training.seatRows.flatMap(row => layout.training.seatColumns.map(column => [column, row]))
  assert.equal(seats.length, 50)
  assert.equal(new Set(seats.map(String)).size, 50)
  for (const [x, y] of seats) assert.ok(inside(layout.training.interior, x, y), `${x},${y}`)
  assert.ok(inside(layout.training.interior, ...layout.training.stageMic))
  assert.ok(inside(layout.training.interior, ...layout.training.audienceMic))
  assert.ok(!seats.some(([x, y]) => x === layout.training.audienceMic[0] && y === layout.training.audienceMic[1]))
})

test('four 1:1 rooms and the directors room do not overlap and each has a door', () => {
  assert.equal(layout.oneOnOnes.length, 4)
  assert.deepEqual(layout.oneOnOnes.map(room => room.label), ['1:1 · 1', '1:1 · 2', '1:1 · 3', '1:1 · 4'])
  const rooms = [...layout.oneOnOnes.map(room => room.interior), layout.directors.interior]
  for (let a = 0; a < rooms.length; a++) for (let b = a + 1; b < rooms.length; b++) {
    assert.ok(rooms[a].x2 < rooms[b].x1 || rooms[b].x2 < rooms[a].x1, `rooms ${a} and ${b} overlap`)
  }
  for (const room of rooms) {
    assert.ok(layout.doors.some(([x1, y1, x2]) => y1 === room.y1 - 1 && x1 >= room.x1 && x2 <= room.x2), 'door above the room')
  }
})

test('signs use the agreed Portuguese texts', () => {
  assert.deepEqual(layout.signs.map(sign => sign.text), ['Salas →', 'Sala de treinamento', '1:1 · 1', '1:1 · 2', '1:1 · 3', '1:1 · 4', 'Diretoria · Pedro Soares'])
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test scripts/annex-layout.test.mjs`
Expected: FAIL, `Cannot find module` for `./annex-layout.mjs`.

- [ ] **Step 3: Write the layout**

Create `scripts/annex-layout.mjs`:

```js
// Layout of the annex wing right of the Matte office, in tiles (32 px).
// The art (scripts/annex-art/compose.py) and the map (scripts/matte-office-map.mjs)
// are both generated from these numbers so they always line up.
// Rectangles are inclusive: { x1, y1, x2, y2 } and [x1, y1, x2, y2].

export const TILE = 32
export const OFFICE_WIDTH = 50
export const MAP_WIDTH = 86
export const MAP_HEIGHT = 30

// Opening in the office's east wall (x = 49), in the right work area.
export const passage = { x: 49, ys: [15, 16] }

export const annex = {
  reveal: { x: 50, y: 0, width: 36, height: 30 },
  triggers: [[49, 15], [49, 16]],
}

export const corridor = { x1: 50, y1: 1, x2: 52, y2: 28 }
export const hallway = { x1: 53, y1: 17, x2: 84, y2: 18 }

export const training = {
  id: 'matte-training',
  label: 'Sala de treinamento',
  interior: { x1: 54, y1: 1, x2: 84, y2: 15 },
  stage: { x1: 62, y1: 1, x2: 76, y2: 3 },
  screen: { x1: 66, y1: 1, x2: 72, y2: 1 },
  presentationApproach: [67, 3],
  stageMic: [69, 3],
  audienceMic: [69, 10],
  seatColumns: [58, 60, 62, 64, 66, 72, 74, 76, 78, 80],
  seatRows: [6, 8, 10, 12, 14],
}

// Where the seated avatar is drawn relative to its seat tile, and where the
// chair art is pasted relative to the seat tile (both in tiles).
export const SEAT_VISUAL = { dx: 0.15, dy: 0.2 }
export const CHAIR_OFFSET = { dx: -0.3, dy: -0.6 }

export const oneOnOnes = [54, 60, 66, 72].map((x1, index) => ({
  id: `one-on-one-${index + 1}`,
  label: `1:1 · ${index + 1}`,
  x1,
  interior: { x1, y1: 20, x2: x1 + 4, y2: 28 },
  capacity: 3,
}))

export const directors = {
  id: 'matte-directors',
  label: 'Diretoria',
  interior: { x1: 78, y1: 20, x2: 84, y2: 28 },
}

export const walls = [
  [50, 0, 85, 0],
  [50, 29, 85, 29],
  [85, 0, 85, 29],
  [53, 0, 53, 16],
  [53, 16, 84, 16],
  [53, 19, 84, 19],
  [53, 19, 53, 29],
  [59, 19, 59, 29],
  [65, 19, 65, 29],
  [71, 19, 71, 29],
  [77, 19, 77, 29],
]

export const doors = [
  [53, 7, 53, 8],
  ...oneOnOnes.map(room => [room.x1 + 1, 19, room.x1 + 2, 19]),
  [80, 19, 81, 19],
]

export const signs = [
  { text: 'Salas →', x: 47.5, y: 14.3 },
  { text: training.label, x: 51.5, y: 6.3 },
  ...oneOnOnes.map(room => ({ text: room.label, x: room.x1 + 2.5, y: 18.5 })),
  { text: 'Diretoria · Pedro Soares', x: 81, y: 18.5 },
]

if (process.argv[1]?.endsWith('annex-layout.mjs')) {
  process.stdout.write(JSON.stringify({
    TILE, OFFICE_WIDTH, MAP_WIDTH, MAP_HEIGHT, passage, annex, corridor, hallway,
    training, SEAT_VISUAL, CHAIR_OFFSET, oneOnOnes, directors, walls, doors, signs,
  }))
}
```

- [ ] **Step 4: Run tests**

Run: `node --test scripts/annex-layout.test.mjs && node scripts/annex-layout.mjs | head -c 120`
Expected: 4 tests PASS; JSON starts with `{"TILE":32,"OFFICE_WIDTH":50,"MAP_WIDTH":86`.

- [ ] **Step 5: Commit**

```bash
git add scripts/annex-layout.mjs scripts/annex-layout.test.mjs
git commit -m "feat: define the annex wing layout [skip render]" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Wing art (gate: Pedro approves)

**Files:**
- Create: `scripts/annex-art/compose.py`
- Create: `frontend/public/matte-office-v3.png`

**Interfaces:**
- Consumes: `node scripts/annex-layout.mjs` JSON (Task 1).
- Produces: `frontend/public/matte-office-v3.png`, 2752 x 960 px, office in x 0..1599 identical to `matte-office-v2.png` resized to 1600 x 960 except the passage edit at tiles x 47..49, y 14..17.

Pillow is a build tool only. Install it in a scratch virtualenv, never in the repo: `python3 -m venv "$SCRATCH/venv" && "$SCRATCH/venv/bin/pip" install pillow` (`$SCRATCH` is the session scratchpad directory given by the controller).

- [ ] **Step 1: Write the compositor**

Create `scripts/annex-art/compose.py`:

```python
"""Builds frontend/public/matte-office-v3.png: the Matte office plus the annex wing.

Every piece of the wing is cut from the office art itself, or drawn with colors
sampled from it, so the style matches. The layout comes from
scripts/annex-layout.mjs. Run: python3 scripts/annex-art/compose.py  (needs Pillow)
"""
import json
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
L = json.loads(subprocess.check_output(['node', str(ROOT / 'scripts/annex-layout.mjs')]))
T = L['TILE']

office = Image.open(ROOT / 'frontend/public/matte-office-v2.png').convert('RGBA').resize(
    (L['OFFICE_WIDTH'] * T, L['MAP_HEIGHT'] * T), Image.LANCZOS)
canvas = Image.new('RGBA', (L['MAP_WIDTH'] * T, L['MAP_HEIGHT'] * T), (12, 14, 20, 255))
canvas.paste(office, (0, 0))
draw = ImageDraw.Draw(canvas)

# Source rectangles in office tiles: (x, y, width, height). Verified on a
# gridded render of the office art (Step 2 shows them side by side).
SOURCES = {
    'carpet': (46, 12, 1, 1),            # grey carpet of the right work area
    'kitchen_floor': (35, 8, 1, 1),      # darker checker of the kitchen
    'corridor': (31, 10, 1, 1),          # brick floor of the central corridor
    'rug': (20.3, 6.5, 2, 1.2),          # beige rug of the glass boardroom
    'teal_rug': (24.6, 24.6, 1, 0.6),    # teal rug of the reception
    'chair_up': (22.2, 6.2, 1.6, 1.8),   # boardroom chair seen from behind
    'round_table': (36.3, 5.4, 4.4, 3.6),
    'desk': (34.6, 10.8, 4.6, 3.3),
    'armchair_right': (21.8, 22.5, 2.2, 2.2),
    'armchair_left': (25.8, 22.5, 2.2, 2.2),
    'coffee_table': (24.2, 23, 1.7, 1.5),
    'plant': (33.6, 6.4, 1.6, 2.7),
}
# Single pixels (tile units) used for drawn shapes.
COLORS = {
    'wall': (33.5, 26.8),
    'wall_top': (33.5, 26.6),
    'trim': (37.0, 26.9),
    'wood': (24.5, 4.0),
}


def piece(name):
    x, y, w, h = SOURCES[name]
    return office.crop((round(x * T), round(y * T), round((x + w) * T), round((y + h) * T)))


def color(name):
    x, y = COLORS[name]
    return office.getpixel((round(x * T), round(y * T)))


def fill(texture, x1, y1, x2, y2):
    """Tile a texture over an inclusive tile rectangle."""
    tw, th = texture.size
    for py in range(y1 * T, (y2 + 1) * T, th):
        for px in range(x1 * T, (x2 + 1) * T, tw):
            region = texture.crop((0, 0, min(tw, (x2 + 1) * T - px), min(th, (y2 + 1) * T - py)))
            canvas.alpha_composite(region, (px, py))


def paste(name, x, y):
    canvas.alpha_composite(piece(name), (round(x * T), round(y * T)))


def wall(x1, y1, x2, y2):
    """Dark wall block with a lighter top edge and a wood trim, like the office."""
    left, top, right, bottom = x1 * T, y1 * T, (x2 + 1) * T - 1, (y2 + 1) * T - 1
    draw.rectangle((left, top, right, bottom), fill=color('wall'))
    draw.rectangle((left, top, right, top + 3), fill=color('wall_top'))
    if y1 == y2 and x2 - x1 >= 3:
        for tx in range(x1 + 1, x2, 4):
            draw.rectangle((tx * T + 4, top + 10, (tx + 2) * T - 4, top + 16), fill=color('trim'))
    if x1 == x2 and y2 - y1 >= 3:
        for ty in range(y1 + 1, y2, 4):
            draw.rectangle((left + 10, ty * T + 4, left + 16, (ty + 2) * T - 4), fill=color('trim'))


def covered_by_door(x, y):
    return any(x1 <= x <= x2 and y1 <= y <= y2 for x1, y1, x2, y2 in L['doors'])


# 1. Passage in the office east wall: carpet over the corner plant, corridor floor in the opening.
fill(piece('carpet'), 47, 14, 48, 16)
for y in L['passage']['ys']:
    fill(piece('corridor'), L['passage']['x'], y, L['passage']['x'], y)

# 2. Floors.
c, h = L['corridor'], L['hallway']
fill(piece('corridor'), c['x1'], c['y1'], c['x2'], c['y2'])
fill(piece('corridor'), h['x1'], h['y1'], h['x2'], h['y2'])
tr = L['training']
i = tr['interior']
fill(piece('rug'), i['x1'], i['y1'], i['x2'], i['y2'])
for room in L['oneOnOnes']:
    r = room['interior']
    fill(piece('kitchen_floor'), r['x1'], r['y1'], r['x2'], r['y2'])
d = L['directors']['interior']
fill(piece('carpet'), d['x1'], d['y1'], d['x2'], d['y2'])
fill(piece('teal_rug'), 79, 25, 84, 27)

# 3. Walls, leaving door openings with corridor floor.
for x1, y1, x2, y2 in L['walls']:
    for y in range(y1, y2 + 1):
        for x in range(x1, x2 + 1):
            if not covered_by_door(x, y):
                wall(x, y, x, y)
for x1, y1, x2, y2 in L['doors']:
    fill(piece('corridor'), x1, y1, x2, y2)

# 4. Training room: stage, screen, microphones, 50 chairs.
s = tr['stage']
draw.rectangle((s['x1'] * T, s['y1'] * T, (s['x2'] + 1) * T - 1, (s['y2'] + 1) * T - 1), fill=color('wood'))
draw.rectangle((s['x1'] * T, (s['y2'] + 1) * T - 4, (s['x2'] + 1) * T - 1, (s['y2'] + 1) * T - 1), fill=color('wall'))
sc = tr['screen']
draw.rectangle((sc['x1'] * T, sc['y1'] * T - 10, (sc['x2'] + 1) * T - 1, (sc['y2'] + 1) * T - 2), fill=(24, 28, 40, 255))
draw.rectangle((sc['x1'] * T + 4, sc['y1'] * T - 6, (sc['x2'] + 1) * T - 5, (sc['y2'] + 1) * T - 6), fill=(70, 130, 220, 255))
for mx, my in (tr['stageMic'], tr['audienceMic']):
    cx, cy = mx * T + 16, my * T + 10
    draw.ellipse((cx - 5, cy - 5, cx + 5, cy + 5), fill=(40, 44, 58, 255))
    draw.rectangle((cx - 1, cy + 5, cx + 1, cy + 20), fill=(40, 44, 58, 255))
for row in tr['seatRows']:
    for column in tr['seatColumns']:
        paste('chair_up', column + L['CHAIR_OFFSET']['dx'], row + L['CHAIR_OFFSET']['dy'])
paste('plant', i['x1'], i['y1'])
paste('plant', i['x2'] - 1, i['y1'])

# 5. 1:1 rooms: the kitchen round table shifted by (x1 - 36, 16); the fourth
# chair (bottom right) is covered with floor so each room shows 3 chairs.
for room in L['oneOnOnes']:
    dx, dy = room['x1'] - 36, 16
    sx, sy, _, _ = SOURCES['round_table']
    paste('round_table', sx + dx, sy + dy)
    fill(piece('kitchen_floor'), room['x1'] + 3, 24, room['x1'] + 4, 24)

# 6. Directors' room: desk shifted by (+44, +10), armchairs and table shifted by (+57, +2).
sx, sy, _, _ = SOURCES['desk']
paste('desk', sx + 44, sy + 10)
for name in ('armchair_right', 'armchair_left', 'coffee_table'):
    sx, sy, _, _ = SOURCES[name]
    paste(name, sx + 57, sy + 2)
paste('plant', d['x2'] - 1, d['y1'])

canvas.convert('RGB').save(ROOT / 'frontend/public/matte-office-v3.png', optimize=True)
print('wrote frontend/public/matte-office-v3.png', canvas.size)
```

- [ ] **Step 2: Build, inspect and adjust**

Run: `"$SCRATCH/venv/bin/python" scripts/annex-art/compose.py`
Expected: `wrote frontend/public/matte-office-v3.png (2752, 960)`.

Then render a check image with a 32 px grid and tile numbers over the wing (write a throwaway script in `$SCRATCH`, never in the repo) and read it. Acceptance, all must hold before Step 3:
- The office part (x < 47) is pixel-identical to v2 resized (`ImageChops.difference` bounding box is None for that crop).
- Every `SOURCES` crop shows only the intended piece (no stray plant, wall or person). If not, move the rectangle and record the new values in the file; record each change in the report.
- Each of the 50 chairs stands on its seat tile; chairs do not touch walls; the round tables fit inside the 1:1 rooms with 3 visible chairs; walls are continuous except at the doors; the passage reads as an opening.
- If the 1:1 tables cannot show exactly 3 chairs cleanly, keep 4 chairs and report it as a concern (capacity is still 3).

- [ ] **Step 3: Commit**

```bash
git add scripts/annex-art/compose.py frontend/public/matte-office-v3.png
git commit -m "feat: compose the annex wing art from the office art [skip render]" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: GATE — Pedro approves the art.** The controller publishes or shows `matte-office-v3.png` (and a version with the darkness drawn over the wing) to Pedro and waits. Changes he asks for are made in `compose.py` / `annex-layout.mjs`, re-run, re-committed with `[skip render]`, and shown again. Task 3 starts only after his explicit approval.

---

### Task 3: Server areas, capacity and exact seats

**Files:**
- Create: `backend/src/office/areas.ts`
- Create: `backend/src/office/areas.test.ts`
- Modify: `backend/src/session.ts` (Room/tile/object types; `Session.addPlayer`)
- Modify: `backend/src/office/OfficeState.ts` (`step`, new `hasRoomFor`, `countInArea`)
- Test: `backend/src/office/OfficeState.test.ts` (append), `backend/src/session.test.ts` (append)

**Interfaces:**
- Produces: `areaAt(room: Room, x: number, y: number): string | null`, `areaConfig(room: Room, areaId: string | null): AreaConfig | null`, `isStageArea(room: Room, areaId: string | null): boolean`, type `AreaConfig = { label: string, capacity?: number, conversation?: 'stage' }` (all in `backend/src/office/areas.ts`); `OfficeState.hasRoomFor(position: OfficePosition): boolean`; `Room.areas?: Record<string, AreaConfig>`; tile `areaId?: string`; `OfficeObject.sitRange?: 0 | 1`.

- [ ] **Step 1: Write the failing tests**

Create `backend/src/office/areas.test.ts`:

```ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { areaAt, areaConfig, isStageArea } from './areas'
import type { Room } from '../session'

const room: Room = {
    name: 'Matte',
    tilemap: { '1, 1': { privateAreaId: 'one-on-one-1' }, '2, 2': { areaId: 'matte-training' }, '3, 3': {} },
    areas: { 'one-on-one-1': { label: '1:1 · 1', capacity: 3 }, 'matte-training': { label: 'Sala de treinamento', conversation: 'stage' } },
}

test('a tile belongs to its private area first, then to its plain area', () => {
    assert.equal(areaAt(room, 1, 1), 'one-on-one-1')
    assert.equal(areaAt(room, 2, 2), 'matte-training')
    assert.equal(areaAt(room, 3, 3), null)
    assert.equal(areaAt(room, 9, 9), null)
})

test('area settings come from the room', () => {
    assert.equal(areaConfig(room, 'one-on-one-1')?.capacity, 3)
    assert.equal(areaConfig(room, null), null)
    assert.equal(isStageArea(room, 'matte-training'), true)
    assert.equal(isStageArea(room, 'one-on-one-1'), false)
})
```

Append to `backend/src/office/OfficeState.test.ts` (keep its existing imports; add `Room` to the `../session` type import if it is not there yet):

```ts
function smallRoomMap(): Room {
    const tilemap: Room['tilemap'] = {}
    for (let x = 0; x < 6; x++) for (let y = 0; y < 3; y++) tilemap[`${x}, ${y}`] = {}
    for (let x = 3; x < 6; x++) for (let y = 0; y < 3; y++) tilemap[`${x}, ${y}`].privateAreaId = 'one-on-one-1'
    return {
        name: 'Matte', tilemap,
        areas: { 'one-on-one-1': { label: '1:1 · 1', capacity: 3 } },
        interactions: [
            { id: 'aisle-seat', kind: 'seat', label: 'Lugar', bounds: { x: 1, y: 2, width: 1, height: 1 }, approach: { x: 1, y: 2 }, sitRange: 0 },
        ],
    }
}

test('a fourth visitor cannot step into a full 1:1 room', () => {
    let now = 0
    const office = new OfficeState(smallRoomMap(), () => now)
    for (const [uid, x, y] of [['a', 3, 0], ['b', 4, 0], ['c', 5, 0]] as const) office.addPlayer(uid, { x, y })
    office.addPlayer('d', { x: 2, y: 0 })
    now = 1000
    assert.deepEqual(office.step('d', { x: 3, y: 1 }), { ok: false, error: 'Movimento inválido.' })
    assert.deepEqual(office.step('d', { x: 3, y: 0 }).ok, false)
    assert.equal(office.step('d', { x: 3, y: 0 }).error, 'Sala cheia.')
    assert.equal(office.hasRoomFor({ x: 4, y: 1 }), false)
    now = 2000
    assert.equal(office.step('c', { x: 5, y: 1 }).ok, true, 'moving inside a full room is allowed')
})

test('a free place opens as soon as someone leaves', () => {
    let now = 0
    const office = new OfficeState(smallRoomMap(), () => now)
    for (const [uid, x, y] of [['a', 3, 0], ['b', 4, 0], ['c', 5, 0]] as const) office.addPlayer(uid, { x, y })
    office.addPlayer('d', { x: 2, y: 0 })
    office.removePlayer('a')
    now = 1000
    assert.equal(office.step('d', { x: 3, y: 0 }).ok, true)
    assert.equal(office.hasRoomFor({ x: 2, y: 1 }), true, 'outside an area there is always room')
})

test('a seat with sitRange 0 is taken only on its own tile', () => {
    let now = 0
    const office = new OfficeState(smallRoomMap(), () => now)
    office.addPlayer('a', { x: 0, y: 2 })
    now = 1000
    office.step('a', { x: 0, y: 1 })
    now = 2000
    office.step('a', { x: 1, y: 1 })
    assert.deepEqual(office.snapshot().occupancy, {}, 'passing next to the seat does not sit')
    now = 3000
    office.step('a', { x: 1, y: 2 })
    assert.equal(office.snapshot().occupancy['aisle-seat']?.uid, 'a')
})
```

Append to `backend/src/session.test.ts`:

```ts
test('a visitor resuming into a 1:1 room that filled up returns to the spawnpoint', () => {
    const tilemap: RealmData['rooms'][number]['tilemap'] = {}
    for (let x = 0; x < 10; x++) for (let y = 0; y < 3; y++) tilemap[`${x}, ${y}`] = {}
    for (let x = 6; x < 10; x++) for (let y = 0; y < 3; y++) tilemap[`${x}, ${y}`].privateAreaId = 'one-on-one-1'
    const manager = new SessionManager()
    manager.createSession('office', { spawnpoint: { roomIndex: 0, x: 0, y: 0 }, rooms: [{ name: 'Matte', tilemap, areas: { 'one-on-one-1': { label: '1:1 · 1', capacity: 3 } } }] })
    manager.addPlayerToSession('s-ana', 'office', 'ana', 'Ana', '009', 0)
    manager.getSession('office').movePlayer('ana', 7, 1)
    manager.logOutBySocketId('s-ana', 1_000)
    for (const [uid, x] of [['b', 6], ['c', 8], ['d', 9]] as const) {
        manager.addPlayerToSession(`s-${uid}`, 'office', uid, uid, '009', 1_000)
        manager.getSession('office').roomFeatures[0].office.addPlayer(uid, { x, y: 0 }, uid)
        manager.getSession('office').movePlayer(uid, x, 0)
    }
    manager.addPlayerToSession('s-ana-2', 'office', 'ana', 'Ana', '009', 2_000)
    const ana = manager.getSession('office').getPlayer('ana')
    assert.deepEqual({ x: ana.x, y: ana.y }, { x: 0, y: 0 })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx tsc -p . ; node --test $(find dist -name "*.test.js")`
Expected: compile errors for the missing `./areas` module, `areas`/`sitRange` properties and `hasRoomFor`. (`tsc` still emits; the new tests fail.)

- [ ] **Step 3: Implement**

Create `backend/src/office/areas.ts`:

```ts
import type { Room } from '../session'

export type AreaConfig = { label: string, capacity?: number, conversation?: 'stage' }

// A tile's area: its private conversation area, otherwise its plain area.
export function areaAt(room: Room, x: number, y: number): string | null {
    const tile = room.tilemap[`${x}, ${y}`]
    return tile?.privateAreaId ?? tile?.areaId ?? null
}

export function areaConfig(room: Room, areaId: string | null): AreaConfig | null {
    return areaId ? room.areas?.[areaId] ?? null : null
}

// In a stage area (the training room) people listen to the stage and the
// audience microphone instead of forming proximity calls with neighbours.
export function isStageArea(room: Room, areaId: string | null): boolean {
    return areaConfig(room, areaId)?.conversation === 'stage'
}
```

In `backend/src/session.ts`:
- Add `import type { AreaConfig } from './office/areas'` next to the other office imports.
- In `interface Room`, add `areas?: Record<string, AreaConfig>` after `channelId?: string`, and inside the tile type add `areaId?: string` after `privateAreaId?: string`.
- In `interface OfficeObject`, add `sitRange?: 0 | 1,` after `seatVisual?: ...`, and change the speaker config member `{ rangeTiles: number }` to `{ rangeTiles: number, flat?: boolean }`.
- In `Session.addPlayer`, replace

```ts
        const start = resume && resumeTile && !resumeTile.impassable
```

with

```ts
        const start = resume && resumeTile && !resumeTile.impassable && this.roomFeatures[resume.room].office.hasRoomFor(resume)
```

In `backend/src/office/OfficeState.ts`:
- Add `import { areaAt, areaConfig } from './areas'` below the existing import.
- In `step`, after the `distance !== 1` check and before `const at = this.now()`, insert:

```ts
    const targetArea = areaAt(this.room, next.x, next.y)
    if (targetArea && targetArea !== areaAt(this.room, visitor.position.x, visitor.position.y) && !this.hasRoomFor(next)) {
      return { ok: false, error: 'Sala cheia.' }
    }
```

- In `step`, change `.filter(candidate => candidate.distance <= 1 && !this.occupied.has(candidate.object.id))` to `.filter(candidate => candidate.distance <= (candidate.object.sitRange ?? 1) && !this.occupied.has(candidate.object.id))`.
- Add these methods after `verifiedPosition`:

```ts
  // Whether one more visitor fits in the area of this position (always true outside areas).
  hasRoomFor(position: OfficePosition): boolean {
    const areaId = areaAt(this.room, position.x, position.y)
    const capacity = areaConfig(this.room, areaId)?.capacity
    return capacity === undefined || this.countInArea(areaId) < capacity
  }

  private countInArea(areaId: string | null): number {
    let count = 0
    for (const visitor of this.visitors.values()) if (areaAt(this.room, visitor.position.x, visitor.position.y) === areaId) count++
    return count
  }
```

- [ ] **Step 4: Run tests**

Run: `cd backend && npx tsc -p . && node --test $(find dist -name "*.test.js") 2>&1 | grep -E "^not ok|^# (pass|fail)"`
Expected: `# fail 0`; pass count = previous 42 + the 6 new tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/office/areas.ts backend/src/office/areas.test.ts backend/src/session.ts backend/src/office/OfficeState.ts backend/src/office/OfficeState.test.ts backend/src/session.test.ts
git commit -m "feat: limit 1:1 rooms to 3 people and sit only on exact seats [skip render]" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Training audio, no audience calls, 80-person office

**Files:**
- Modify: `backend/src/session.ts` (`setProximityIdsWithPlayer`, `MAX_PLAYERS_PER_SPACE`)
- Modify: `backend/src/office/SpeakerState.ts`
- Modify: `backend/src/office/object-config.ts`
- Modify: `backend/src/sockets/sockets.ts`
- Test: `backend/src/session-proximity.test.ts` (append), `backend/src/office/SpeakerState.test.ts` (append), `backend/src/office/object-config.test.ts` (append)

**Interfaces:**
- Consumes: `areaAt`, `isStageArea` (Task 3).
- Produces: `export const MAX_PLAYERS_PER_SPACE = 80` in `backend/src/session.ts`; speaker config `{ rangeTiles, flat?: boolean }` accepted by `validateOfficeMap`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/src/session-proximity.test.ts`:

```ts
test('people in the training audience do not form proximity calls, people outside still do', () => {
    const tilemap: Room['tilemap'] = {}
    for (let x = 0; x < 20; x++) for (let y = 0; y < 5; y++) tilemap[`${x}, ${y}`] = {}
    for (let x = 10; x < 20; x++) for (let y = 0; y < 5; y++) tilemap[`${x}, ${y}`].areaId = 'matte-training'
    const session = new Session('office', {
        spawnpoint: { roomIndex: 0, x: 0, y: 4 },
        rooms: [{ name: 'Matte', tilemap, areas: { 'matte-training': { label: 'Sala de treinamento', conversation: 'stage' } } }],
    })
    for (const [uid, x] of [['ana', 12], ['bruno', 13], ['caio', 1], ['duda', 2]] as const) {
        session.addPlayer(`socket-${uid}`, uid, uid, '009')
        session.movePlayer(uid, x, 0)
    }
    assert.equal(session.getPlayer('ana').proximityId, null)
    assert.equal(session.getPlayer('bruno').proximityId, null)
    assert.ok(session.getPlayer('caio').proximityId)
    assert.equal(session.getPlayer('caio').proximityId, session.getPlayer('duda').proximityId)
    session.movePlayer('duda', 10, 0)
    session.movePlayer('caio', 9, 0)
    assert.equal(session.getPlayer('caio').proximityId, null, 'someone at the door does not join the audience')
})

test('the office accepts 80 people', async () => {
    const { MAX_PLAYERS_PER_SPACE } = await import('./session')
    assert.equal(MAX_PLAYERS_PER_SPACE, 80)
})
```

Append to `backend/src/office/SpeakerState.test.ts` (reuse its existing imports; add `OfficeState` and `Room` imports if missing):

```ts
function trainingRoom(): Room {
    const tilemap: Room['tilemap'] = {}
    for (let x = 0; x < 40; x++) for (let y = 0; y < 10; y++) tilemap[`${x}, ${y}`] = x >= 10 ? { areaId: 'matte-training' } : {}
    return {
        name: 'Matte', tilemap,
        areas: { 'matte-training': { label: 'Sala de treinamento', conversation: 'stage' } },
        interactions: [
            { id: 'stage-mic', kind: 'speaker', label: 'Microfone do palco', bounds: { x: 20, y: 0, width: 1, height: 1 }, approach: { x: 20, y: 1 }, config: { rangeTiles: 40, flat: true } },
            { id: 'audience-mic', kind: 'speaker', label: 'Microfone da plateia', bounds: { x: 20, y: 6, width: 1, height: 1 }, approach: { x: 20, y: 7 }, config: { rangeTiles: 40, flat: true } },
        ],
    }
}

test('stage and audience microphones reach every seat of the training room at full volume, together', () => {
    const room = trainingRoom()
    const office = new OfficeState(room)
    const speakers = new SpeakerState(room, office)
    office.addPlayer('host', { x: 20, y: 1 })
    office.addPlayer('guest', { x: 20, y: 7 })
    office.addPlayer('far', { x: 39, y: 9 })
    office.addPlayer('outside', { x: 5, y: 5 })
    assert.equal(speakers.start('host', 'stage-mic').ok, true)
    assert.equal(speakers.start('guest', 'audience-mic').ok, true)
    const heard = speakers.snapshotFor('far')
    assert.equal(heard['stage-mic'].volume, 100)
    assert.equal(heard['audience-mic'].volume, 100)
    assert.equal(speakers.snapshotFor('outside')['stage-mic'].volume, 0)
})

test('a flat microphone stops when its speaker walks away from it', () => {
    let now = 0
    const room = trainingRoom()
    const office = new OfficeState(room, () => now)
    const speakers = new SpeakerState(room, office)
    office.addPlayer('host', { x: 20, y: 1 })
    speakers.start('host', 'stage-mic')
    for (const x of [21, 22, 23]) { now += 1000; office.step('host', { x, y: 1 }) }
    assert.equal(speakers.expire(), true)
    assert.deepEqual(speakers.snapshotFor('host'), {})
})
```

Append to `backend/src/office/object-config.test.ts` (reuse its existing imports and any map-building helper it has; if it has none, build the map inline as below):

```ts
test('speakers may be flat; other speaker fields are still rejected', () => {
    const tilemap = { '0, 0': {}, '0, 1': {} }
    const map = (config: unknown) => ({ spawnpoint: { roomIndex: 0, x: 0, y: 1 }, rooms: [{ name: 'Matte', tilemap, interactions: [
        { id: 'mic', kind: 'speaker', label: 'Microfone', bounds: { x: 0, y: 0, width: 1, height: 1 }, approach: { x: 0, y: 1 }, config },
    ] }] }) as any
    assert.doesNotThrow(() => validateOfficeMap(map({ rangeTiles: 40, flat: true })))
    assert.throws(() => validateOfficeMap(map({ rangeTiles: 40, loud: true })))
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx tsc -p . ; node --test $(find dist -name "*.test.js") 2>&1 | grep -E "^not ok|^# (pass|fail)"`
Expected: failures in the new proximity, speaker and object-config tests.

- [ ] **Step 3: Implement**

`backend/src/session.ts`:
- Add `import { areaAt, isStageArea } from './office/areas'` (merge with the Task 3 type import).
- After `export const defaultSkin = '009'` add:

```ts
export const MAX_PLAYERS_PER_SPACE = 80
```

- In `setProximityIdsWithPlayer`, after the `zoneOf` constant add:

```ts
        const inStage = (player: Player) => isStageArea(this.map_data.rooms[player.room], areaAt(this.map_data.rooms[player.room], player.x, player.y))
```

  and change the neighbour filter line

```ts
                        if (visited.has(neighbor.uid) || zoneOf(neighbor) !== zone) continue
```

  to

```ts
                        if (visited.has(neighbor.uid) || zoneOf(neighbor) !== zone || inStage(member) || inStage(neighbor)) continue
```

`backend/src/office/SpeakerState.ts`:
- Add `import { areaAt } from './areas'`.
- Replace the body of `volume` after the `config` guard (`if (!object || !position || ...) return 0`) with:

```ts
    const sourceArea = areaAt(this.room, object.approach.x, object.approach.y)
    if (sourceArea !== areaAt(this.room, position.x, position.y)) return 0
    if (object.config.flat && sourceArea) return 100
    return Math.round(Math.max(0, 1 - Math.hypot(position.x - object.approach.x, position.y - object.approach.y) / object.config.rangeTiles) * 100)
```

- Replace `expire()` with:

```ts
  expire(): boolean {
    let changed = false
    for (const [id, state] of this.active) {
      const object = this.room.interactions?.find(item => item.id === id)
      const flat = Boolean(object?.config && 'flat' in object.config && object.config.flat)
      if (this.volume(state.ownerUid, id) === 0 || (flat && !this.office.isNear(state.ownerUid, id))) { this.active.delete(id); changed = true }
    }
    return changed
  }
```

`backend/src/office/object-config.ts`: change the speaker schema to

```ts
const speaker = z.object({ rangeTiles: z.number().int().min(1).max(40), flat: z.boolean().optional() }).strict()
```

`backend/src/sockets/sockets.ts`:
- Add `MAX_PLAYERS_PER_SPACE` to the import from `'../session'` (or add `import { MAX_PLAYERS_PER_SPACE } from '../session'`).
- Replace

```ts
                if (playerCount >= 30) {
                    return rejectJoin("Space is full. It's 30 players max.")
```

  with

```ts
                if (playerCount >= MAX_PLAYERS_PER_SPACE) {
                    return rejectJoin(`O escritório está cheio. O limite é de ${MAX_PLAYERS_PER_SPACE} pessoas.`)
```

- [ ] **Step 4: Run tests**

Run: `cd backend && npx tsc -p . && node --test $(find dist -name "*.test.js") 2>&1 | grep -E "^not ok|^# (pass|fail)"`
Expected: `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add backend/src
git commit -m "feat: stage audio for the training room and an 80-person office [skip render]" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Map schema on the frontend

**Files:**
- Modify: `frontend/utils/pixi/zod.ts`

**Interfaces:**
- Produces: `Room` (inferred) gains `areas?: Record<string, { label: string, capacity?: number, conversation?: 'stage' }>`, `annex?: { reveal: { x: number, y: number, width: number, height: number }, triggers: [number, number][] }`, `signs?: { text: string, x: number, y: number }[]`; tile `areaId?: string`; object `sitRange?: 0 | 1`; speaker config `flat?: boolean`.

- [ ] **Step 1: Edit the schema**

In `frontend/utils/pixi/zod.ts`:
- In `TileSchema`, add `areaId: z.string().optional(),` after `privateAreaId`.
- In `ObjectConfigSchema`, change `z.object({ rangeTiles: z.number().int().min(1).max(40) }).strict(),` to `z.object({ rangeTiles: z.number().int().min(1).max(40), flat: z.boolean().optional() }).strict(),`.
- In `OfficeObjectSchema`, add `sitRange: z.union([z.literal(0), z.literal(1)]).optional(),` after `seatVisual`.
- In `RoomSchema`, add after `interactions: z.array(OfficeObjectSchema).optional(),`:

```ts
  areas: z.record(z.string(), z.object({
    label: z.string().min(1).max(48),
    capacity: z.number().int().min(1).max(100).optional(),
    conversation: z.literal('stage').optional(),
  })).optional(),
  annex: z.object({
    reveal: z.object({ x: z.number().int(), y: z.number().int(), width: z.number().int().positive(), height: z.number().int().positive() }),
    triggers: z.array(z.tuple([z.number().int(), z.number().int()])).min(1),
  }).optional(),
  signs: z.array(z.object({ text: z.string().min(1).max(40), x: z.number(), y: z.number() })).max(40).optional(),
```

- [ ] **Step 2: Typecheck and run the suite**

Run: `cd frontend && npx tsc --noEmit --incremental false && node --experimental-strip-types --test $(find . -name "*.test.mjs" -not -path "./node_modules/*") 2>&1 | grep -E "^not ok|^# (pass|fail)"`
Expected: no type errors, `# fail 0`.

- [ ] **Step 3: Commit**

```bash
git add frontend/utils/pixi/zod.ts
git commit -m "feat: accept areas, annex and signs in office maps [skip render]" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Darkness and signs on the client

**Files:**
- Create: `frontend/utils/pixi/office/annex-reveal.ts`
- Create: `frontend/utils/pixi/office/annex-reveal.test.mjs`
- Create: `frontend/utils/pixi/office/AnnexLayer.ts`
- Modify: `frontend/utils/pixi/PlayApp.ts`

**Interfaces:**
- Consumes: `Room['annex']`, `Room['signs']` (Task 5).
- Produces: `isAnnexTrigger(annex, x, y): boolean`, `shouldReveal(annex, x, y): boolean`, types `AnnexConfig`, `AnnexSign`; class `AnnexLayer(annex: AnnexConfig | undefined, signs: AnnexSign[])` with `darkness: PIXI.Graphics`, `signs: PIXI.Container`, `revealed: boolean`, `reveal(animate = true)`, `destroy()`.

- [ ] **Step 1: Write the failing test**

Create `frontend/utils/pixi/office/annex-reveal.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { isAnnexTrigger, shouldReveal } from './annex-reveal.ts'

const annex = { reveal: { x: 50, y: 0, width: 36, height: 30 }, triggers: [[49, 15], [49, 16]] }

test('stepping on the passage reveals the wing with the sweep', () => {
    assert.equal(isAnnexTrigger(annex, 49, 15), true)
    assert.equal(shouldReveal(annex, 49, 16), true)
})

test('a visitor already inside the wing (after reconnecting) sees it lit', () => {
    assert.equal(isAnnexTrigger(annex, 60, 10), false)
    assert.equal(shouldReveal(annex, 60, 10), true)
    assert.equal(shouldReveal(annex, 85, 29), true)
})

test('the rest of the office keeps the wing dark', () => {
    assert.equal(shouldReveal(annex, 48, 15), false)
    assert.equal(shouldReveal(annex, 25, 18), false)
    assert.equal(shouldReveal(undefined, 49, 15), false)
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && node --experimental-strip-types --test utils/pixi/office/annex-reveal.test.mjs`
Expected: FAIL, `Cannot find module` for `./annex-reveal.ts`.

- [ ] **Step 3: Implement the rules**

Create `frontend/utils/pixi/office/annex-reveal.ts`:

```ts
export type AnnexConfig = { reveal: { x: number, y: number, width: number, height: number }, triggers: [number, number][] }
export type AnnexSign = { text: string, x: number, y: number }

export function isAnnexTrigger(annex: AnnexConfig | undefined, x: number, y: number): boolean {
    return Boolean(annex?.triggers.some(([triggerX, triggerY]) => triggerX === x && triggerY === y))
}

// The wing lights up on the passage, and also when the visitor is already
// inside it (a reconnection resumes them where they stood).
export function shouldReveal(annex: AnnexConfig | undefined, x: number, y: number): boolean {
    if (!annex) return false
    if (isAnnexTrigger(annex, x, y)) return true
    const { reveal } = annex
    return x >= reveal.x && x < reveal.x + reveal.width && y >= reveal.y && y < reveal.y + reveal.height
}
```

- [ ] **Step 4: Implement the layer**

Create `frontend/utils/pixi/office/AnnexLayer.ts`:

```ts
import * as PIXI from 'pixi.js'
import { gsap } from 'gsap'
import type { AnnexConfig, AnnexSign } from './annex-reveal'

const TILE = 32
const DARK = 0x05060a
const FEATHER_STRIPS = 12

// Per-visit darkness over the annex wing plus the door signs, which stay lit.
export class AnnexLayer {
    readonly darkness = new PIXI.Graphics()
    readonly signs = new PIXI.Container()
    private progress = 0
    private tween: gsap.core.Tween | null = null

    constructor(private readonly annex: AnnexConfig | undefined, signs: AnnexSign[]) {
        this.darkness.eventMode = 'none'
        this.signs.eventMode = 'none'
        for (const sign of signs) this.signs.addChild(createSign(sign))
        this.draw()
    }

    get revealed(): boolean {
        return !this.annex || this.progress >= 1
    }

    reveal(animate = true): void {
        if (this.revealed || this.tween) return
        if (!animate) {
            this.progress = 1
            this.draw()
            return
        }
        const state = { progress: this.progress }
        this.tween = gsap.to(state, {
            progress: 1, duration: 1.5, ease: 'power2.inOut',
            onUpdate: () => { this.progress = state.progress; this.draw() },
            onComplete: () => { this.tween = null },
        })
    }

    private draw(): void {
        this.darkness.clear()
        if (!this.annex || this.progress >= 1) return
        const { x, y, width, height } = this.annex.reveal
        const right = (x + width) * TILE
        const top = y * TILE
        const fullHeight = height * TILE
        let left = (x + width * this.progress) * TILE
        // A soft front while sweeping: strips get darker away from the passage.
        if (this.progress > 0) {
            const stripWidth = TILE / 4
            for (let strip = 0; strip < FEATHER_STRIPS && left < right; strip++) {
                this.darkness.rect(left, top, Math.min(stripWidth, right - left), fullHeight).fill({ color: DARK, alpha: (strip + 1) / (FEATHER_STRIPS + 1) })
                left += stripWidth
            }
        }
        if (left < right) this.darkness.rect(left, top, right - left, fullHeight).fill({ color: DARK, alpha: 1 })
    }

    destroy(): void {
        this.tween?.kill()
        this.tween = null
        this.darkness.destroy()
        this.signs.destroy({ children: true })
    }
}

function createSign(sign: AnnexSign): PIXI.Container {
    const container = new PIXI.Container()
    const text = new PIXI.Text({ text: sign.text, style: { fontFamily: 'Nunito, Arial, sans-serif', fontSize: 12, fontWeight: '700', fill: 0xffffff, padding: 1 } })
    text.anchor.set(0.5)
    const width = Math.ceil(text.width) + 20
    const plate = new PIXI.Graphics()
    plate.roundRect(-width / 2, -11, width, 22, 7).fill({ color: 0x101b2b, alpha: 0.94 })
    plate.roundRect(-width / 2, -11, width, 22, 7).stroke({ color: 0xffffff, width: 1, alpha: 0.25 })
    container.addChild(plate, text)
    container.position.set(sign.x * TILE, sign.y * TILE)
    return container
}
```

- [ ] **Step 5: Wire it into PlayApp**

In `frontend/utils/pixi/PlayApp.ts`:
- Imports: add

```ts
import { AnnexLayer } from './office/AnnexLayer'
import { isAnnexTrigger, shouldReveal } from './office/annex-reveal'
```

- Field: add `private annexLayer: AnnexLayer | null = null` next to `private lightingLayer`.
- In `loadRoom`, add `this.setUpAnnex()` on the line after `this.setUpRoomInteractions()`.
- Add the method after `setUpRoomInteractions`:

```ts
    // The annex wing starts dark on every visit; signs stay visible above the darkness.
    private setUpAnnex = () => {
        this.annexLayer?.destroy()
        this.annexLayer = null
        const room = this.realmData.rooms[this.currentRoomIndex]
        if (!room.annex && !room.signs?.length) return
        this.annexLayer = new AnnexLayer(room.annex, room.signs ?? [])
        const index = this.app.stage.getChildIndex(this.interactionLayer!.container) + 1
        this.app.stage.addChildAt(this.annexLayer.darkness, index)
        this.app.stage.addChildAt(this.annexLayer.signs, index + 1)
    }
```

- In `onLocalPlayerTileChanged`, add at the start of the method:

```ts
        const annex = this.realmData.rooms[this.currentRoomIndex].annex
        if (this.annexLayer && shouldReveal(annex, position.x, position.y)) this.annexLayer.reveal(isAnnexTrigger(annex, position.x, position.y))
```

- In `removeEvents`, after `this.interactionLayer = null` add:

```ts
        this.annexLayer?.destroy()
        this.annexLayer = null
```

- [ ] **Step 6: Run tests, typecheck and build**

Run: `cd frontend && node --experimental-strip-types --test $(find . -name "*.test.mjs" -not -path "./node_modules/*") 2>&1 | grep -E "^not ok|^# (pass|fail)" && npx tsc --noEmit --incremental false && npx next build 2>&1 | grep -E "Compiled|rror"`
Expected: `# fail 0`, no type errors, `Compiled successfully`.

- [ ] **Step 7: Commit**

```bash
git add frontend/utils/pixi/office/annex-reveal.ts frontend/utils/pixi/office/annex-reveal.test.mjs frontend/utils/pixi/office/AnnexLayer.ts frontend/utils/pixi/PlayApp.ts
git commit -m "feat: reveal the annex wing from the darkness with door signs [skip render]" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Stage microphones capture the voice (run right after Task 6)

The existing "caixa de som" publishes the audio of a browser tab (`getDisplayMedia`). Flat speakers (the training stage and audience microphones) must publish the visitor's **microphone** instead. The lounge speaker keeps sharing a tab.

**Files:**
- Modify: `frontend/utils/video-chat/SpatialAudio.ts` (`start`)
- Modify: `frontend/app/play/SpeakerPanel.tsx`
- Test: `frontend/utils/video-chat/SpatialAudio.test.mjs` (append; extend its `load()` harness)

**Interfaces:**
- Produces: `export type SpeakerSource = 'tab' | 'microphone'`; `spatialAudio.start(objectId: string, source: SpeakerSource = 'tab')`.
- Consumes: speaker config `flat` (Task 5 schema); `videoChat.getDevicePreferences().microphoneId`.

- [ ] **Step 1: Write the failing test**

In `frontend/utils/video-chat/SpatialAudio.test.mjs`, extend `load()` so the vm context's `navigator.mediaDevices` also has `getUserMedia: async constraints => { micCalls.push(constraints); return stream }` and counts `getDisplayMedia` calls in `displayCalls`; make the `./video-chat` stub `{ videoChat: { outputSupported: false, getDevicePreferences: () => ({ microphoneId: 'usb-mic' }) } }`; return `micCalls` and `displayCalls: () => displayCalls` from `load()`. Then append:

```js
test('a stage microphone captures the microphone and publishes it to the room', async () => {
  const env = load()
  const start = env.audio.start('training-stage-mic', 'microphone')
  await env.waitStart()
  env.acknowledge()
  await start
  assert.equal(env.displayCalls(), 0)
  assert.equal(env.micCalls.length, 1)
  assert.equal(env.micCalls[0].audio.echoCancellation, true)
  assert.deepEqual(env.micCalls[0].audio.deviceId, { ideal: 'usb-mic' })
  assert.equal(env.tracks.length, 1)
})

test('the lounge speaker still shares a browser tab', async () => {
  const env = load()
  const start = env.audio.start('lounge-speaker')
  await env.waitStart()
  env.acknowledge()
  await start
  assert.equal(env.displayCalls(), 1)
  assert.equal(env.micCalls.length, 0)
})
```

Run: `cd frontend && node --experimental-strip-types --test utils/video-chat/SpatialAudio.test.mjs` — Expected: the microphone test FAILS (getDisplayMedia is called).

- [ ] **Step 2: Implement the source switch**

In `frontend/utils/video-chat/SpatialAudio.ts`:
- Below the `Publication` type add `export type SpeakerSource = 'tab' | 'microphone'`.
- Change `public async start(objectId: string) {` to `public async start(objectId: string, source: SpeakerSource = 'tab') {`.
- Replace the three lines that create `Controller`, `controller` and call `getDisplayMedia` with:

```ts
            if (source === 'microphone') {
                const microphoneId = videoChat.getDevicePreferences().microphoneId
                stream = await navigator.mediaDevices.getUserMedia({ audio: {
                    ...(microphoneId ? { deviceId: { ideal: microphoneId } } : {}),
                    echoCancellation: true, noiseSuppression: true, autoGainControl: true,
                } }).catch(() => { throw new Error('Permita o microfone no navegador para falar para a sala.') })
            } else {
                const Controller = (window as Window & { CaptureController?: new () => { setFocusBehavior: (behavior: 'no-focus-change') => void } }).CaptureController
                const controller = Controller ? new Controller() : undefined
                controller?.setFocusBehavior('no-focus-change')
                stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true, ...(controller ? { controller } : {}) } as DisplayMediaStreamOptions)
            }
```

- Change `if (!audio) throw new Error('Escolha uma aba e marque “Compartilhar áudio” no navegador.')` to `if (!audio) throw new Error(source === 'microphone' ? 'Permita o microfone no navegador para falar para a sala.' : 'Escolha uma aba e marque “Compartilhar áudio” no navegador.')`.
- Change the success notice to `signal.emit('officeNotice', { message: source === 'microphone' ? 'Seu microfone está aberto para a sala toda.' : 'Áudio da aba tocando perto da caixa de som.', key: 'speaker-start' })`.

- [ ] **Step 3: Microphone wording in the panel**

In `frontend/app/play/SpeakerPanel.tsx`:
- After `const state = snapshot[object.id]` add:

```tsx
    const microphone = Boolean(object.config && 'flat' in object.config && object.config.flat)
    const own = state?.ownerUid === uid
```

- In `act`, change `else await spatialAudio.start(object.id)` to `else await spatialAudio.start(object.id, microphone ? 'microphone' : 'tab')`.
- Replace the description paragraph and the button label with:

```tsx
        <p>{microphone
            ? state ? own ? 'Seu microfone está aberto para toda a sala de treinamento.' : 'Alguém está falando neste microfone.' : 'Ligue o microfone para falar com toda a sala de treinamento.'
            : state ? own ? 'Você está compartilhando o áudio de uma aba.' : 'Alguém está compartilhando áudio aqui.' : 'Escolha uma aba com áudio. O som diminui conforme as pessoas se afastam.'}</p>
```

  and the button text `{busy ? 'Aguarde…' : microphone ? own ? 'Desligar microfone' : 'Ligar microfone' : own ? 'Parar áudio da aba' : 'Compartilhar áudio de uma aba'}`.

- [ ] **Step 4: Run tests, typecheck and build**

Run: `cd frontend && node --experimental-strip-types --test $(find . -name "*.test.mjs" -not -path "./node_modules/*") 2>&1 | grep -E "^not ok|^# (pass|fail)" && npx tsc --noEmit --incremental false && npx next build 2>&1 | grep -E "Compiled|rror"`
Expected: `# fail 0`, no type errors, `Compiled successfully`.

- [ ] **Step 5: Commit**

```bash
git add frontend/utils/video-chat/SpatialAudio.ts frontend/utils/video-chat/SpatialAudio.test.mjs frontend/app/play/SpeakerPanel.tsx
git commit -m "feat: stage microphones publish the voice instead of a tab [skip render]" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Map generator for the wing

**Files:**
- Modify: `scripts/matte-office-map.mjs`
- Modify: `scripts/matte-office-map.test.mjs`

**Interfaces:**
- Consumes: everything exported by `scripts/annex-layout.mjs` (Task 1); area/annex/sign/sitRange/flat formats (Tasks 3-5).
- Produces: `map` with one room: `backgroundImage { src: '/matte-office-v3.png', width: 2752, height: 960 }`, 86 x 30 tilemap, 128 interactions, `areas`, `annex`, `signs`.

- [ ] **Step 1: Update the tests first**

In `scripts/matte-office-map.test.mjs`:
- `assert.equal(interactions.length, 60)` becomes `assert.equal(interactions.length, 128)`.
- `assert.ok(left + width <= 50 && top + height <= 30, object.id)` becomes `assert.ok(left + width <= 86 && top + height <= 30, object.id)`.
- In the desk test, `assert.equal(desks.length, 8)` becomes `assert.equal(desks.length, 9)`.
- In the seats test, `assert.equal(seats.length, 42)` becomes `assert.equal(seats.length, 107)`.

Append:

```js
test('the annex wing has its rooms, signs and darkness', () => {
  const room = map.rooms[0]
  assert.deepEqual(room.backgroundImage, { src: '/matte-office-v3.png', width: 86 * 32, height: 30 * 32 })
  assert.deepEqual(room.annex, { reveal: { x: 50, y: 0, width: 36, height: 30 }, triggers: [[49, 15], [49, 16]] })
  assert.equal(room.signs.length, 7)
  assert.equal(room.areas['matte-training'].conversation, 'stage')
  for (let n = 1; n <= 4; n++) assert.equal(room.areas[`one-on-one-${n}`].capacity, 3)
  assert.equal(room.areas['matte-directors'].capacity, undefined)
  const training = room.interactions.filter(object => object.id.startsWith('training-seat-'))
  assert.equal(training.length, 50)
  for (const seat of training) {
    assert.equal(seat.sitRange, 0, seat.id)
    assert.equal(room.tilemap[`${seat.approach.x}, ${seat.approach.y}`].areaId, 'matte-training', seat.id)
  }
  for (let n = 1; n <= 4; n++) assert.equal(room.interactions.filter(object => object.id.startsWith(`one-on-one-${n}-`)).length, 3)
  const mics = room.interactions.filter(object => object.kind === 'speaker' && object.id.startsWith('training-'))
  assert.equal(mics.length, 2)
  for (const mic of mics) assert.deepEqual(mic.config, { rangeTiles: 40, flat: true })
  assert.equal(room.tilemap['49, 15'].impassable, undefined, 'the passage is open')
  assert.equal(room.tilemap['49, 14'].impassable, true, 'the rest of the east wall stays')
})
```

Run: `node --test scripts/matte-office-map.test.mjs` — Expected: FAIL (60 interactions, no annex).

- [ ] **Step 2: Extend the generator**

In `scripts/matte-office-map.mjs`:

1. Replace the first lines

```js
const width = 50
const height = 30
```

with

```js
import { MAP_WIDTH, MAP_HEIGHT, annex, passage, corridor, hallway, walls, doors, training, oneOnOnes, directors, signs, SEAT_VISUAL } from './annex-layout.mjs'

const width = MAP_WIDTH
const height = MAP_HEIGHT
```

2. Replace the perimeter lines

```js
block(0, 0, 49, 0)
block(0, 29, 49, 29)
block(0, 0, 0, 29)
block(49, 0, 49, 29)
```

with

```js
block(0, 0, 49, 0)
block(0, 29, 49, 29)
block(0, 0, 0, 29)
block(49, 0, 49, 29)
open(passage.x, passage.ys[0], passage.x, passage.ys[passage.ys.length - 1])
```

3. After the boardroom `privateAreaId` loop, add:

```js
// Annex wing: walls with door openings, furniture, and the areas of each room.
for (const [x1, y1, x2, y2] of walls) block(x1, y1, x2, y2)
for (const [x1, y1, x2, y2] of doors) open(x1, y1, x2, y2)
block(training.screen.x1, training.screen.y1, training.screen.x2, training.screen.y2)
for (const room of oneOnOnes) block(room.x1 + 1, 22, room.x1 + 3, 23) // round table
block(79, 21, 83, 22)                                                    // directors' desk

function area(rect, key, id) {
  for (let y = rect.y1; y <= rect.y2; y++) {
    for (let x = rect.x1; x <= rect.x2; x++) tile(x, y)[key] = id
  }
}
area(training.interior, 'areaId', training.id)
for (const room of oneOnOnes) area(room.interior, 'privateAreaId', room.id)
area(directors.interior, 'privateAreaId', directors.id)

const areas = {
  [training.id]: { label: training.label, conversation: 'stage' },
  ...Object.fromEntries(oneOnOnes.map(room => [room.id, { label: room.label, capacity: room.capacity }])),
  [directors.id]: { label: directors.label },
}
```

4. Before `const interactions = [`, add the wing objects:

```js
const trainingObjects = [
  officeObject('training-screen', 'presentation', 'Tela do treinamento', [training.screen.x1, training.screen.y1, training.screen.x2 - training.screen.x1 + 1, 1], training.presentationApproach, { config: { deckId: 'matte-training', slides: [
    { title: 'Sala de treinamento', body: 'Quem está no palco fala para a sala toda. Para falar da plateia, use o microfone do corredor.' },
  ] } }),
  officeObject('training-stage-mic', 'speaker', 'Microfone do palco', [training.stageMic[0], training.stageMic[1] - 1, 1, 1], training.stageMic, { config: { rangeTiles: 40, flat: true } }),
  officeObject('training-audience-mic', 'speaker', 'Microfone da plateia', [training.audienceMic[0], training.audienceMic[1] - 1, 1, 1], training.audienceMic, { config: { rangeTiles: 40, flat: true } }),
]

const trainingSeats = training.seatRows.flatMap((row, rowIndex) => training.seatColumns.map((column, columnIndex) =>
  officeObject(`training-seat-${rowIndex * 10 + columnIndex + 1}`, 'seat', `Treinamento · fileira ${rowIndex + 1}, lugar ${columnIndex + 1}`,
    [column - 0.2, row - 0.6, 1.4, 1.6], [column, row],
    { sitRange: 0, seatVisual: { x: column + SEAT_VISUAL.dx, y: row + SEAT_VISUAL.dy, facing: 'up' } })))

// Each 1:1 room copies the kitchen round table shifted by (x1 - 37, 16).
const oneOnOneSeats = oneOnOnes.flatMap(room => {
  const dx = room.x1 - 37
  const dy = 16
  return [
    officeObject(`${room.id}-left`, 'seat', `${room.label} · esquerda`, [37.6 + dx, 5.7 + dy, 1, 1.3], [38 + dx, 5 + dy], { seatVisual: { x: 37.9 + dx, y: 6.15 + dy, facing: 'down' } }),
    officeObject(`${room.id}-right`, 'seat', `${room.label} · direita`, [39.5 + dx, 5.7 + dy, 1, 1.3], [40 + dx, 5 + dy], { seatVisual: { x: 39.9 + dx, y: 6.15 + dy, facing: 'down' } }),
    officeObject(`${room.id}-front`, 'seat', `${room.label} · frente`, [37.6 + dx, 7.7 + dy, 1, 1.3], [38 + dx, 8 + dy], { seatVisual: { x: 37.9 + dx, y: 7.85 + dy, facing: 'up' } }),
  ]
})

// The directors' desk copies a work-area desk shifted by (+44, +10); the
// armchairs copy the reception set shifted by (+56.5, +2).
const directorsObjects = [
  officeObject('directors-desk', 'desk', 'Diretoria · mesa do Pedro', [79, 21, 5, 2], [81, 23], { seatVisual: { x: 80.5, y: 23.35, facing: 'up' } }),
  officeObject('directors-armchair-left', 'seat', 'Diretoria · poltrona esquerda', [78.5, 25, 2, 3], [79, 28], { seatVisual: { x: 78.8, y: 25.4, facing: 'right' } }),
  officeObject('directors-armchair-right', 'seat', 'Diretoria · poltrona direita', [82.5, 25, 2, 3], [83, 28], { seatVisual: { x: 83.1, y: 25.4, facing: 'left' } }),
]
```

5. In `const interactions = [ ... ]`, insert `...trainingObjects,` after the `officeObject('pingpong', ...)` entry, and append `...trainingSeats, ...oneOnOneSeats, ...directorsObjects,` after the last `workshop-stool-right` entry (seats stay last so their small hit areas win).

6. Replace the room definition

```js
    backgroundImage: { src: '/matte-office-v2.png', width: width * 32, height: height * 32 },
    tilemap,
    interactions,
```

with

```js
    backgroundImage: { src: '/matte-office-v3.png', width: width * 32, height: height * 32 },
    tilemap,
    interactions,
    areas,
    annex,
    signs,
```

- [ ] **Step 3: Run tests and validate the generated map with both schemas**

Run:

```bash
node --test scripts/matte-office-map.test.mjs scripts/annex-layout.test.mjs
node scripts/matte-office-map.mjs > "$SCRATCH/matte-office-v3.json"
cd frontend && node --experimental-strip-types -e "const { RealmDataSchema } = await import('./utils/pixi/zod.ts'); const map = JSON.parse(require('fs').readFileSync(process.env.SCRATCH + '/matte-office-v3.json', 'utf8')); const r = RealmDataSchema.safeParse(map); console.log(r.success ? 'zod ok' : JSON.stringify(r.error.issues.slice(0, 5)))" --input-type=module
cd ../backend && npx tsc -p . && node -e "const { validateOfficeMap } = require('./dist/office/object-config'); validateOfficeMap(JSON.parse(require('fs').readFileSync(process.env.SCRATCH + '/matte-office-v3.json', 'utf8'))); console.log('server ok')"
```

Expected: all tests PASS (including the 5 existing ones with updated counts), `zod ok`, `server ok`. If the frontend one-liner cannot import the `.ts` module directly, transpile it the way the existing `*.test.mjs` files do (`typescript` `transpileModule` + `vm`) in a throwaway script under `$SCRATCH`.

- [ ] **Step 4: Commit**

```bash
git add scripts/matte-office-map.mjs scripts/matte-office-map.test.mjs
git commit -m "feat: add the annex wing to the office map [skip render]" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: README

**Files:**
- Modify: `README.md` (the "Escritório Matte interativo" section)

- [ ] **Step 1:** After the sentence that starts "To regenerate it for deployment", add a paragraph:

```markdown
The annex wing (training room for 50, four 1:1 rooms for up to 3 people, and the directors' room) lies right of the office and stays dark on every visit until the visitor steps into the passage in the east wall of the right work area. Its layout lives in `scripts/annex-layout.mjs`, which drives both the map and the art. To rebuild the art, install Pillow in a virtualenv outside the repository and run `python3 scripts/annex-art/compose.py`; it writes `frontend/public/matte-office-v3.png`. The office accepts up to 80 people.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: describe the annex wing [skip render]" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: End-to-end verification on a private test space

**Files:**
- Create (scratch only): `$SCRATCH/annex-e2e.cjs`, `$SCRATCH/annex-realm.cjs`, `$SCRATCH/annex-guests.txt`

The live office must not be touched: this task creates a separate test space (realm) with the new map in the same Supabase project, runs the local backend and frontend against it, and deletes everything afterwards.

- [ ] **Step 1: Create the test space**

Write `$SCRATCH/annex-realm.cjs` that, using `frontend/.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SERVICE_ROLE`):
1. signs up one anonymous owner (`POST /auth/v1/signup` with the anon key and body `{}`),
2. inserts its `profiles` row and a `realms` row `{ owner_id, name: 'teste-ala-de-salas', map_data: <$SCRATCH/matte-office-v3.json>, only_owner: false }` with the service role,
3. prints `REALM_ID`, `SHARE_ID`, `OWNER_UID` and appends `OWNER_UID` to `$SCRATCH/annex-guests.txt`.

Expected: three ids printed.

- [ ] **Step 2: Start local servers**

Background: `cd backend && npm run dev` (port 3001) and `cd frontend && npx next build && npx next start -p 3000` (port 3000; `frontend/.env.local` already points the frontend at `http://localhost:3001` and the backend `FRONTEND_URL` at `http://localhost:3000`).
Expected: `Server is running on port 3001.` and Next `Ready`.

- [ ] **Step 3: Drive four browsers**

Write `$SCRATCH/annex-e2e.cjs` with Playwright (`/Users/pedrosoares/matte-one/node_modules/playwright-core`, `executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'`, args `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream`). For each of 4 browser contexts (Ana, Bruno, Caio, Duda): open `http://localhost:3000/play/${REALM_ID}?shareId=${SHARE_ID}`, wait for the heading "Prepare sua entrada", read the guest id from the `sb-*-auth-token` cookies exactly as in the entry-pages plan's Task 5 script and append it to `$SCRATCH/annex-guests.txt`, type the name, click "Entrar no escritório", wait for the canvas.

Movement uses the office's own click-to-move, so the client sends every step and reveals the wing exactly as for a real visitor. Apply a throwaway local patch that is **never committed**: in `frontend/app/play/PixiApp.tsx`, on the line after `await app.init()`, add `;(window as any).__playApp = app`, then rebuild. In the test, `await page.evaluate(([x, y]) => window.__playApp.player.moveToTile(x, y), [x, y])` and poll `window.__playApp.player.currentTilePosition` until it equals the target or stops changing for 2 s. Revert the patch with `git checkout frontend/app/play/PixiApp.tsx` before Step 5.

Route to the 1:1 rooms (all tiles walkable in the generated map): spawn (25,18) → (25,16) → east along y = 16 to (48,16) → passage (49,16) → (51,16) → (51,18) → east along y = 18 to (55,18) → door (55,19) → (55,20). Route to the training room: (51,16) → north along x = 51 to (51,7) → door (53,7) → lane (60,7) → seat (60,6).

Assertions and screenshots (all `failures` must be empty):
- Before stepping on the passage: screenshot `annex-dark.png` centred on (60,15) shows the wing dark with the 7 signs visible.
- 1.6 s after stepping on (49,16): screenshot `annex-revealed.png` shows the wing.
- Ana, Bruno and Caio enter `1:1 · 1`; Duda's step into (55,20) returns `{ ok: false, error: 'Sala cheia.' }` and a screenshot `annex-full.png` shows the "Sala cheia." notice.
- Caio walks out to (55,18); Duda's next step into (55,20) returns `ok: true`.
- One visitor walks into the training room via the door (53,7) and along row lane y = 7 to (60,7), then steps onto seat tile (60,6): the office snapshot shows them seated in `training-seat-2`; walking along y = 7 past the other seats seats nobody.
- Reload one page while outside the wing: `annex-reload.png` shows the wing dark again.

- [ ] **Step 4: Clean up**

Stop both local servers (only the processes started here). Delete every id in `$SCRATCH/annex-guests.txt` that Supabase reports as `"is_anonymous":true` with `DELETE /auth/v1/admin/users/<id>` (the owner's deletion cascades to the test realm and profile), then empty the file. Expected: one `200` per id. Confirm with a `GET /rest/v1/realms?name=eq.teste-ala-de-salas` that returns `[]`.

- [ ] **Step 5: Commit fixes only**

Commit any source fix found in this task with `[skip render]` on the subject; never commit scratch scripts, screenshots or the throwaway socket patch.

---

### Task 10: Publish (scheduled with Pedro)

**Gate:** the controller asks Pedro for a time slot with nobody in the office and waits for his answer. Publishing restarts the office server; everyone is disconnected for a few seconds.

- [ ] **Step 1: Merge and push** — From the main checkout: `git switch main && git pull --ff-only && git merge --ff-only feat/office-annex-rooms`. Add an empty commit **without** `[skip render]` so Render deploys the backend: `git commit --allow-empty -m "chore: release the office annex rooms" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"`, then `git push origin main`.
- [ ] **Step 2: Backend** — Pedro confirms the Render deploy of that commit is Live (or triggers Manual Deploy). Verify with the joinedRealm probe used on 2026-10-06 against `https://gather-clone-backend.onrender.com`, extended to check that a 31st connection is no longer refused is not needed; checking the deploy commit is enough.
- [ ] **Step 3: Map** — Update the Matte realm's `map_data` (`id = 0d778bfd-8e16-49bc-832f-3aa60c5bef0c`) with `node scripts/matte-office-map.mjs` output via `PATCH /rest/v1/realms?id=eq.0d778bfd-8e16-49bc-832f-3aa60c5bef0c` with the service role. Save the previous `map_data` to `$SCRATCH/map-data-before-annex.json` first, so it can be restored. Then restart the backend once more (Render Manual Deploy or "Restart service") because active sessions cache the map.
- [ ] **Step 4: Frontend** — Wait for the Vercel Production deployment of the new `main` SHA to report `success`; confirm `npx vercel inspect gather-clone-beta.vercel.app` (from `frontend/`) shows it.
- [ ] **Step 5: Smoke check** — Open the office link with one guest, walk to the passage, confirm the wing reveals and signs show; delete the guest.
