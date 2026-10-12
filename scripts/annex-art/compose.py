"""Builds frontend/public/matte-office-v3.png: the Matte office plus the annex wing.

Every piece of the wing is cut from the office art itself, or drawn with colors
sampled from it, so the style matches. The layout comes from
scripts/annex-layout.mjs. Run: python3 scripts/annex-art/compose.py  (needs Pillow)

- Furniture is cut out of its office floor: the floor around it becomes
  transparent and its drop shadow a soft dark overlay, so it stands on any wing
  floor without a visible rectangle.
- Floors are synthesized from clean patches of the office floors (best match
  at each overlap, cross-faded), so they have the office texture and no seams.
- Walls repeat one pixel line taken across an office wall, with the office's
  dark posts at ends and junctions.
The pieces themselves live in kit.py. The output is deterministic (fixed random seeds).
"""
import os
import random
import sys

from PIL import Image, ImageDraw

sys.dont_write_bytecode = True                  # no __pycache__ beside the scripts
sys.path.insert(0, os.path.dirname(__file__))
from kit import (L, T, OFFICE_W, H, ROOT, office, canvas as new_canvas, px, color, shade, cut_out,  # noqa: E402
                 round_table_for_three, place, quilt, brick, rug, h_wall, v_wall, cap,
                 PROFILE, SOURCES, V_OFF)

W = L['MAP_WIDTH'] * T
canvas = new_canvas(W, H)
canvas.paste(office, (0, 0))
draw = ImageDraw.Draw(canvas)


# ---------------------------------------------------------------------------
# Build.

WX = OFFICE_W
tr = L['training']
ti = tr['interior']
dr = L['directors']['interior']
HALF = T // 2
co, hw = L['corridor'], L['hallway']
last_x, last_y = L['MAP_WIDTH'] - 1, L['MAP_HEIGHT'] - 1
rooms_top = hw['y2'] + 1                       # wall row between the hallway and the small rooms
# Placement shifts shared with the map (scripts/matte-office-map.mjs): the
# pieces stand where the map puts their seats.
TABLE_SHIFT = (lambda x1: x1 - 37, 16)         # kitchen round table -> each 1:1 room
DESK_SHIFT = (44, 10)                          # right work area desk -> directors
LOUNGE_SHIFT = (56.5, 2)                       # reception armchairs and coffee table -> directors

# 1. Floors, each reaching to the centre line of its walls.
quilt(canvas, (WX, 0, W, (ti['y2'] + 2) * T), 'carpet', seed=11)                      # training room
for k, room in enumerate(L['oneOnOnes']):
    r = room['interior']
    quilt(canvas, ((r['x1'] - 1) * T + HALF, rooms_top * T, (r['x2'] + 1) * T + HALF, H), 'kitchen', seed=20 + k)
quilt(canvas, ((dr['x1'] - 1) * T + HALF, rooms_top * T, W, H), 'carpet', seed=31)    # directors
brick(canvas, (WX, 0, (co['x2'] + 1) * T + HALF, H))                                # corridor
brick(canvas, (hw['x1'] * T, (hw['y1'] - 1) * T + HALF, W, (hw['y2'] + 1) * T + HALF))  # hallway
for x1, y1, x2, y2 in L['doors']:                                           # door sills
    if x1 == x2:
        brick(canvas, (x1 * T, y1 * T, x1 * T + HALF, (y2 + 1) * T))
    else:
        brick(canvas, (x1 * T, y1 * T, (x2 + 1) * T, y1 * T + HALF))

# 2. Passage through the office east wall: carpet over the corner plant, brick
# in the opening, the cut ends of the wall closed with end blocks.
pas = L['passage']
p_top, p_bottom = pas['ys'][0] * T, (pas['ys'][-1] + 1) * T
quilt(canvas, ((pas['x'] - 2) * T, (pas['ys'][0] - 1) * T + 12, pas['x'] * T - 5, p_bottom + 4), 'carpet', seed=41, existing=True)
brick(canvas, (48 * T + 27, p_top, WX, p_bottom))
cap(canvas, 48 * T + 26, WX, p_top - 10, p_top)
cap(canvas, 48 * T + 26, WX, p_bottom, p_bottom + 10)

# 3. Outer top wall, and the back wall of the corridor and the training room.
for i, c in enumerate(PROFILE['outer']):
    draw.line((WX, i, W - 1, i), fill=c)
face_top, face_bottom = len(PROFILE['outer']), 72
draw.rectangle((WX, face_top, W - 1, face_bottom), fill=color('back_wall'))
draw.rectangle((WX, face_top, W - 1, face_top + 3), fill=color('back_wall_top'))
draw.rectangle((WX, face_bottom - 2, W - 1, face_bottom), fill=shade(color('back_wall'), 0.6))

# 4. Training room.
# Stage: wood planks with a front edge, the screen on the back wall, speakers.
s = tr['stage']
sx0, sx1 = s['x1'] * T, (s['x2'] + 1) * T
st0, st1 = face_bottom + 1, (s['y2'] + 1) * T - 9
rng = random.Random(5)
for top in range(st0, st1, 9):
    off = rng.randint(0, 60)
    for left in range(sx0 - off, sx1, 64):
        tint = rng.uniform(0.96, 1.04)
        draw.rectangle((max(left, sx0), top, min(left + 63, sx1 - 1), min(top + 8, st1 - 1)),
                       fill=shade(color('wood'), tint))
        draw.line((max(left, sx0), top, min(left + 63, sx1 - 1), top), fill=shade(color('wood_light'), tint))
        if left + 63 < sx1 - 1:
            draw.line((left + 63, top, left + 63, min(top + 8, st1 - 1)), fill=shade(color('wood'), 0.9))
    if top + 8 < st1:
        draw.line((sx0, top + 8, sx1 - 1, top + 8), fill=shade(color('wood'), 0.9))
draw.rectangle((sx0, st1, sx1 - 1, st1 + 8), fill=shade(color('wood'), 0.78))
draw.line((sx0, st1, sx1 - 1, st1), fill=color('wood_light'))
draw.line((sx0, st1 + 8, sx1 - 1, st1 + 8), fill=color('wood_dark'))
draw.line((sx0, st0, sx0, st1 + 8), fill=color('wood_dark'))
draw.line((sx1 - 1, st0, sx1 - 1, st1 + 8), fill=color('wood_dark'))
canvas.alpha_composite(Image.new('RGBA', (sx1 - sx0, 3), (0, 0, 0, 80)), (sx0, st1 + 9))

sc = tr['screen']
bx0, bx1 = sc['x1'] * T + 6, (sc['x2'] + 1) * T - 6
by0, by1 = 26, 68
draw.rectangle((bx0, by0, bx1 - 1, by1 - 1), fill=color('monitor_bezel'))
draw.rectangle((bx0 + 4, by0 + 4, bx1 - 5, by1 - 5), fill=color('monitor_blue'))
draw.polygon([(bx0 + 120, by1 - 5), (bx0 + 150, by0 + 4), (bx0 + 175, by0 + 4), (bx0 + 145, by1 - 5)],
             fill=color('monitor_light'))
draw.rectangle((bx0 + 14, by0 + 10, bx0 + 78, by0 + 14), fill=color('monitor_glare'))
draw.rectangle((bx0 + 14, by0 + 20, bx0 + 60, by0 + 22), fill=color('monitor_glare_dim'))
draw.rectangle((bx0 + 14, by0 + 26, bx0 + 66, by0 + 28), fill=color('monitor_glare_dim'))
canvas.alpha_composite(Image.new('RGBA', (bx1 - bx0, 3), (0, 0, 0, 70)), (bx0, by1))

for sxp in (sx0 + 10, sx1 - 10 - 22):
    draw.rectangle((sxp, 50, sxp + 21, 92), fill=color('post_dark'))
    draw.rectangle((sxp + 1, 51, sxp + 20, 91), fill=color('speaker'))
    draw.ellipse((sxp + 6, 56, sxp + 15, 65), fill=color('post_dark'))
    draw.ellipse((sxp + 4, 70, sxp + 17, 83), fill=color('post_dark'))
    draw.ellipse((sxp + 8, 74, sxp + 13, 79), fill=color('post_fill'))

# Aisle rug from the stage to the back of the room.
mic_x = tr['audienceMic'][0]
aisle_left = max(c for c in tr['seatColumns'] if c < mic_x) + 1
aisle_right = min(c for c in tr['seatColumns'] if c > mic_x)
rug(canvas, (aisle_left * T + 18, st1 + 14, aisle_right * T - 18, (ti['y2'] + 1) * T - 4), 'beige_rug',
    color('beige_edge'), seed=51)

chair = cut_out('chair_up')
for row in tr['seatRows']:
    for column in tr['seatColumns']:
        place(canvas, chair, column + L['CHAIR_OFFSET']['dx'], row + L['CHAIR_OFFSET']['dy'])

plant = cut_out('plant')
plant_tall = cut_out('plant_tall')
place(canvas, plant_tall, ti['x1'] + 0.05, 0.95)
place(canvas, plant_tall, ti['x2'] - 0.85, 0.95)
place(canvas, plant, ti['x1'] + 0.05, ti['y2'] - 1.45)
place(canvas, plant, ti['x2'] - 0.65, ti['y2'] - 1.45)

# 5. 1:1 rooms: the kitchen round table shifted by (x1 - 37, 16), without the
# bottom right chair; a plant in the bottom left corner and a shelf against
# the right wall, both clear of the paths from the door to the three seats.
table = round_table_for_three()
shelf = cut_out('shelf')
for room in L['oneOnOnes']:
    r = room['interior']
    sx, sy = SOURCES['round_table'][:2]
    place(canvas, table, sx + TABLE_SHIFT[0](room['x1']), sy + TABLE_SHIFT[1])
    place(canvas, plant, r['x1'] - 0.12, r['y2'] + 0.92 - SOURCES['plant'][3])
    place(canvas, shelf, r['x2'] + 0.17, r['y2'] + 0.96 - SOURCES['shelf'][3])

# 6. Directors' room: desk shifted by (+44, +10), armchairs and coffee table
# shifted by (+56.5, +2) on a rug centred under them, and a plant against the
# bottom wall between the two armchair approach tiles. The plant keeps off the
# walking lanes: column x1 and column x2 (the only ways round the desk), the
# door tiles and the seat tiles.
lounge = [SOURCES[n] for n in ('armchair_right', 'armchair_left')]
rug_x0 = lounge[0][0] + LOUNGE_SHIFT[0] - 0.45
rug_x1 = lounge[1][0] + lounge[1][2] + LOUNGE_SHIFT[0] + 0.45
rug(canvas, (px(rug_x0), px(dr['y1'] + 4.4), px(rug_x1), px(dr['y1'] + 7.3)), 'teal_rug', color('teal_edge'), seed=61)
sx, sy = SOURCES['desk'][:2]
place(canvas, cut_out('desk'), sx + DESK_SHIFT[0], sy + DESK_SHIFT[1])
for name in ('armchair_right', 'armchair_left', 'coffee_table'):
    sx, sy = SOURCES[name][:2]
    place(canvas, cut_out(name), sx + LOUNGE_SHIFT[0], sy + LOUNGE_SHIFT[1])
place(canvas, plant, (dr['x1'] + dr['x2'] + 1) / 2 - SOURCES['plant'][2] / 2, dr['y2'] + 1 - SOURCES['plant'][3])

# 7. Interior walls, on top of the floors, from the layout's wall list. Walls
# of the training room get wood windows; the walls of the private rooms are
# solid. The outer walls (map edges) are drawn in step 8.
inner_right = W - len(PROFILE['outer'])
inner = [w for w in L['walls'] if not (w[1] == w[3] in (0, last_y) or w[0] == w[2] == last_x)]
vertical = [w for w in inner if w[0] == w[2]]
horizontal = [w for w in inner if w[1] == w[3]]
for x1, y1, x2, y2 in vertical:
    gaps = [(d[1] * T, (d[3] + 1) * T) for d in L['doors'] if d[0] == d[2] == x1 and y1 <= d[1] <= y2]
    start = face_top if y1 == 0 else y1 * T + HALF
    end = last_y * T + 6 if y2 == last_y else y2 * T + HALF
    joined = any(h[1] == y2 and h[0] <= x1 <= h[2] for h in horizontal)
    v_wall(canvas, x1, start, end, gaps, windows=y2 <= ti['y2'] + 1, cap_top=False, cap_bottom=False, joined_end=joined)
for x1, y1, x2, y2 in horizontal:
    gaps = [(d[0] * T, (d[2] + 1) * T) for d in L['doors'] if d[1] == d[3] == y1 and x1 <= d[0] <= x2]
    joints = [v[0] * T + HALF for v in vertical if v[1] <= y1 <= v[3]]
    # A wall reaching the outer right wall ends against it, with its end post
    # beside it, like the west end's post at the junction.
    at_outer = x2 == last_x - 1
    end = inner_right if at_outer else (x2 + 1) * T
    h_wall(canvas, y1, x1 * T + V_OFF, end, gaps, windows=y1 <= ti['y2'] + 1, posts=joints,
           joined_start=any(v[0] == x1 for v in vertical if v[1] <= y1 <= v[3]), joined_end=at_outer)

# 8. Outer right and bottom walls, and the joints with the office's outer
# walls: the top wall runs on over the office's top right corner, and a short
# wall below the office's bottom right corner closes the corridor off from the
# street in front of the office.
outer = PROFILE['outer']
for i, c in enumerate(outer):
    draw.line((W - 1 - i, i, W - 1 - i, H - 1), fill=c)                  # right wall
    draw.line((WX - 14, i, WX - 1, i), fill=c)                              # top joint
joint_x = WX - len(outer)
for i, c in enumerate(outer):
    draw.line((joint_x + i, (last_y - 2) * T + 18, joint_x + i, last_y * T), fill=c)  # bottom joint
for i, c in enumerate(PROFILE['bottom_top']):                            # bottom wall top
    draw.line((joint_x, last_y * T + i, W - 1 - len(outer), last_y * T + i), fill=c)
for i, c in enumerate(PROFILE['bottom_body']):                           # and front face
    y = last_y * T + len(PROFILE['bottom_top']) + i
    draw.line((joint_x, y, W - 9, y), fill=c)
draw.line((joint_x, last_y * T, joint_x, H - 1), fill=outer[0])

canvas.convert('RGB').save(ROOT / 'frontend/public/matte-office-v3.png', optimize=True)
print('wrote frontend/public/matte-office-v3.png', canvas.size)
