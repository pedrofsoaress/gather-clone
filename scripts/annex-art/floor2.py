"""Builds frontend/public/matte-floor2.png: the second floor of the Matte office.

Same method as compose.py (the annex wing): every piece is cut from the office
art or drawn with its colors, through kit.py, so the floor looks like the rest
of the office. The layout comes from scripts/floor2-layout.mjs, the same
numbers the map (scripts/matte-office-map.mjs) uses, so desks, tables and
chairs stand where the map blocks the tiles and puts the seats.
Run from the repo root: python3 scripts/annex-art/floor2.py  (needs Pillow)
The output is deterministic (fixed random seeds).
"""
import json
import os
import subprocess
import sys

from PIL import ImageDraw

sys.dont_write_bytecode = True                  # no __pycache__ beside the scripts
sys.path.insert(0, os.path.dirname(__file__))
from kit import (ROOT, T, office, canvas as new_canvas, px, color, shade, cut_out,  # noqa: E402
                 place, quilt, brick, rug, stairs, h_wall, v_wall, PROFILE, SOURCES, CUTS, V_OFF)

F = json.loads(subprocess.check_output(
    ['node', '--input-type=module', '-e',
     f"import * as F from {json.dumps((ROOT / 'scripts/floor2-layout.mjs').as_uri())};"
     "process.stdout.write(JSON.stringify(F))"]))
W, H = F['FLOOR2_WIDTH'] * T, F['FLOOR2_HEIGHT'] * T
last_x, last_y = F['FLOOR2_WIDTH'] - 1, F['FLOOR2_HEIGHT'] - 1
canvas = new_canvas(W, H)
draw = ImageDraw.Draw(canvas)

columns, rows = F['FOCUS_COLUMNS'], F['FOCUS_ROWS']
focus_x2 = max(columns) + 4                     # last tile of the focus desks
hall_y = max(rows) + 3                          # first row of the hall below the desks
corridor = (focus_x2 + 1, focus_x2 + 3)         # brick walk between the two halves
isl_x1 = corridor[1] + 1

# ---------------------------------------------------------------------------
# Pieces. The desks are the office work-area desks; each variant is placed so
# that its desk and chair stand exactly where the 'desk' piece (desk right 1,
# the one the directors' room uses) does: (x + 0.1, y - 0.15) for a desk whose
# tiles start at (x, y). The project table is shifted by (ox - 22, oy - 12).

DESK_VARIANTS = {               # office desk tiles (x, y) and the desk's offset from 'desk' in px
    'desk': (35, 11, 0, 0),
    'desk_r3': (35, 14, 0, 4),
}
for name, (bx, by, dx, dy) in DESK_VARIANTS.items():
    if name != 'desk':
        SOURCES[name] = (SOURCES['desk'][0] + bx - 35 + dx / T, SOURCES['desk'][1] + by - 11 + dy / T,
                         *SOURCES['desk'][2:])
        kx, ky, kw, kh = CUTS['desk']['keep'][0]
        CUTS[name] = {'keep': [(kx + bx - 35 + dx / T, ky + by - 11 + dy / T, kw, kh)]}
desks = {name: cut_out(name) for name in DESK_VARIANTS}
table = cut_out('project_table')
stool = cut_out('plant_stool')
plant = cut_out('plant')
plant_tall = cut_out('plant_tall')

# ---------------------------------------------------------------------------
# 1. Floors: the work-area carpet under the focus desks (down to their chair
# row), the lighter kitchen floor under the islands, brick in the corridor
# between them and in the hall along the bottom, a rug in each island area.
quilt(canvas, (0, 0, (focus_x2 + 1) * T, hall_y * T), 'carpet_clean', seed=101)
quilt(canvas, (isl_x1 * T, 0, W, hall_y * T), 'kitchen', seed=102)
brick(canvas, (corridor[0] * T, 0, (corridor[1] + 1) * T, H))
brick(canvas, (0, hall_y * T, W, H))
# Rugs centred on the table and its chairs (art centre: ox + 3, oy + 1.55).
beige = color('beige_edge')
for k, island in enumerate(F['islands']):
    ox, oy = island['ox'], island['oy']
    rug(canvas, (px(ox - 1.8), px(oy - 1.5), px(ox + 7.8), px(oy + 4.6)), 'beige_rug_clean', beige, seed=110 + k)

# Directors' room: the ground directors' carpet (its clean pool) up to the centre line of its
# walls, a brick sill in the door, and the teal rug under the armchairs and
# coffee table, placed against them as in the ground room (scripts/annex-art/compose.py).
HALF = T // 2
fd = F['floor2Directors']
LOUNGE = (fd['lounge']['dx'], fd['lounge']['dy'])
quilt(canvas, (fd['wallX'] * T + HALF, fd['wallY'] * T + HALF, W, H), 'carpet_clean', seed=131)
brick(canvas, (fd['door']['x1'] * T, fd['wallY'] * T, (fd['door']['x2'] + 1) * T, fd['wallY'] * T + HALF))
lounge = [SOURCES[n] for n in ('armchair_right', 'armchair_left')]
rug(canvas, (px(lounge[0][0] + LOUNGE[0] - 0.45), px(lounge[0][1] + LOUNGE[1] + 0.35),
             px(lounge[1][0] + lounge[1][2] + LOUNGE[0] + 0.45), px(lounge[0][1] + LOUNGE[1] + 3.25)),
    'teal_rug', color('teal_edge'), seed=161)

# ---------------------------------------------------------------------------
# 2. Walls: the annex outer walls on all four edges; the top wall's face has
# windows cut from the office boardroom's glass wall.
outer = PROFILE['outer']
# The directors' room walls first, solid like the ground floor's private rooms;
# the outer walls drawn next close their ends.
v_wall(canvas, fd['wallX'], fd['wallY'] * T + HALF, last_y * T + 6, windows=False, cap_top=False, cap_bottom=False)
h_wall(canvas, fd['wallY'], fd['wallX'] * T + V_OFF, W - len(outer),
       [(fd['door']['x1'] * T, (fd['door']['x2'] + 1) * T)], windows=False,
       posts=[fd['wallX'] * T + HALF], joined_start=True, joined_end=True)
for i, c in enumerate(outer):
    draw.line((0, i, W - 1, i), fill=c)                                    # top
face_top, face_bottom = len(outer), 2 * T - 1            # the face covers rows 0..1, both impassable
draw.rectangle((0, face_top, W - 1, face_bottom), fill=color('back_wall'))
draw.rectangle((0, face_top, W - 1, face_top + 3), fill=color('back_wall_top'))
draw.rectangle((0, face_bottom - 2, W - 1, face_bottom), fill=shade(color('back_wall'), 0.6))
window = office.crop((682, 22, 805, 60))
centres = [px(x + 2.2) for x in columns] + [px(i['ox'] + 3) for i in F['islands'][:2]]
for cx in centres:
    canvas.alpha_composite(window, (cx - window.width // 2, face_top))
for i, c in enumerate(outer):
    draw.line((i, i, i, H - 1), fill=c)                                    # left
    draw.line((W - 1 - i, i, W - 1 - i, H - 1), fill=c)                    # right
for i, c in enumerate(PROFILE['bottom_top']):
    draw.line((len(outer), last_y * T + i, W - 1 - len(outer), last_y * T + i), fill=c)
for i, c in enumerate(PROFILE['bottom_body']):
    y = last_y * T + len(PROFILE['bottom_top']) + i
    draw.line((len(outer), y, W - 1 - len(outer), y), fill=c)

# ---------------------------------------------------------------------------
# 3. Stairs down, in the bottom left corner.
st = F['floor2Stairs']
stairs(canvas, st['x1'], st['y1'], st['x2'], st['y2'], 'down')

# ---------------------------------------------------------------------------
# 4. Furniture, then plants (in front of the walls' lower edge).
# Focus desks: the two desk variants in a checker pattern, at (x + 0.1, y - 0.15).
names = list(DESK_VARIANTS)
for desk in F['focusDesks']:
    row, column = rows.index(desk['y']), columns.index(desk['x'])
    name = names[(row + column) % len(names)]
    place(canvas, desks[name], desk['x'] + SOURCES['desk'][0] - 35, desk['y'] + SOURCES['desk'][1] - 11)

for island in F['islands']:
    sx, sy = SOURCES['project_table'][:2]
    place(canvas, table, sx + island['ox'] - 22, sy + island['oy'] - 12)

# Low plants on stands between the desk columns, every other desk row, in the
# middle of the gap between two desks (clear of the seats on the row below).
for y in rows[::2]:
    for x in columns[:-1]:
        place(canvas, stool, x + 4.74, y + 0.35)

# Plants: by the stairs and along the bottom wall of the hall, and in the
# corners of the islands' half; none on a seat, in the corridor or on the
# way from the stairs.
pw, ph = SOURCES['plant'][2:]
th = SOURCES['plant_tall'][3]
bottom = last_y - 0.08                          # against the bottom wall
place(canvas, plant_tall, st['x2'] + 1.1, bottom - th)
for x in (12.0, 20.0, 33.0):
    place(canvas, plant, x, bottom - ph)
for x in (isl_x1 + 0.05, last_x - 0.15 - pw):
    place(canvas, plant, x, 0.95)
    place(canvas, plant, x, hall_y - 0.1 - ph)

# 5. Directors' room furniture: the office desk at fd['desk'] (as the focus
# desks: tiles + (0.1, -0.15)), the reception armchairs and coffee table shifted
# by fd['lounge'], and a plant in the bottom right corner, clear of the seats.
place(canvas, desks['desk'], fd['desk']['x'] + SOURCES['desk'][0] - 35, fd['desk']['y'] + SOURCES['desk'][1] - 11)
for name in ('armchair_right', 'armchair_left', 'coffee_table'):
    sx, sy = SOURCES[name][:2]
    place(canvas, cut_out(name), sx + LOUNGE[0], sy + LOUNGE[1])
place(canvas, plant, last_x - 0.15 - pw, bottom - ph)

canvas.convert('RGB').save(ROOT / 'frontend/public/matte-floor2.png', optimize=True)
print('wrote frontend/public/matte-floor2.png', canvas.size)
