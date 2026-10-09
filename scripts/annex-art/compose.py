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
The output is deterministic (fixed random seeds).
"""
import json
import random
import subprocess
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageStat

ROOT = Path(__file__).resolve().parents[2]
L = json.loads(subprocess.check_output(['node', str(ROOT / 'scripts/annex-layout.mjs')]))
T = L['TILE']
OFFICE_W = L['OFFICE_WIDTH'] * T
W, H = L['MAP_WIDTH'] * T, L['MAP_HEIGHT'] * T

office = Image.open(ROOT / 'frontend/public/matte-office-v2.png').convert('RGBA').resize(
    (OFFICE_W, H), Image.LANCZOS)
canvas = Image.new('RGBA', (W, H), (12, 14, 20, 255))
canvas.paste(office, (0, 0))
draw = ImageDraw.Draw(canvas)


def px(v):
    return round(v * T)


# ---------------------------------------------------------------------------
# Sources, in office tiles: (x, y, width, height). Each was checked on a
# zoomed, gridded render of the office art and on a cut-out review sheet.

SOURCES = {
    # Boardroom chair seen from behind (bottom row, second chair), on the beige
    # rug. The chair sits 0.15 right of and 0.11 below the crop origin, as in
    # the rectangle CHAIR_OFFSET was measured on, so seat + CHAIR_OFFSET still
    # puts the chair on its seat.
    'chair_up': (24.225, 6.2, 1.5, 1.45),
    # Kitchen round table and its four chairs (the bottom right one is removed).
    'round_table': (37.55, 5.85, 3.45, 3.25),
    # Right work area desk with monitor and chair.
    'desk': (35.1, 10.85, 4.32, 3.15),
    # Reception armchairs and coffee table, on the teal rug.
    'armchair_right': (21.95, 22.05, 2.0, 2.45),   # left armchair, facing right
    'armchair_left': (25.95, 22.05, 2.0, 2.45),    # right armchair, facing left
    'coffee_table': (24.15, 23.0, 1.7, 1.75),
    # Big plant in the corner of the right work area (the passage replaces it).
    'plant': (47.25, 14.6, 1.62, 2.42),
    # Plant in front of the file cabinet of the left work area.
    'plant_tall': (1.2, 14.08, 1.8, 2.92),
    # Tall shelf with a plant on top, by the east wall of the right work area.
    'shelf': (47.72, 9.85, 1.11, 4.29),
}

# How each piece is cut out (see cut_out): `keep` shapes are always opaque,
# `erase` rectangles are always cleared.
CUTS = {
    # The top rows are the boardroom table's edge, which hides the chair top:
    # cleared, the chair back keeps its own dark top outline.
    'chair_up': {'erase_px': [(0, 0, 47, 3), (0, 4, 5, 4), (11, 4, 39, 4), (45, 4, 47, 4),
                              (0, 5, 5, 5), (11, 5, 37, 5), (44, 4, 47, 5),
                              (0, 6, 4, 6), (12, 6, 13, 6), (35, 6, 37, 6), (45, 6, 47, 6)],
                 'shadow': 'drop', 'shadow_tol': 30, 'shadow_min': 0.4, 'blue': 24,
                 'ground': (24.52, 7.3, 0.92, 0.28, 60)},
    'round_table': {},
    'desk': {'keep': [(36.4, 12.3, 1.35, 1.6)]},             # dark chair looks like shadow
    'armchair_right': {'tol': 30},
    'armchair_left': {'tol': 30},
    'coffee_table': {},
    'plant': {'keep': [(47.62, 16.05, 0.95, 0.95, 'ellipse')], 'shadow': 'drop',   # dark pot
              'ground': (47.6, 16.72, 1.0, 0.3, 80)},
    # Its sides touch the crop border, so the floor is sampled beside it.
    'shelf': {'floor_from': (45.2, 11.5, 1.8, 2.0), 'erase': [(47.72, 9.85, 0.07, 2.0)]},
    'plant_tall': {'keep': [(1.57, 16.02, 0.96, 0.95, 'ellipse')], 'shadow': 'drop',
                   'erase': [(1.2, 15.85, 0.3, 0.3)],
                   'ground': (1.55, 16.7, 1.0, 0.3, 80)},
}

# Clean floor areas (x1, y1, x2, y2 in tiles) that feed the floor synthesis.
FLOOR_POOLS = {
    'carpet': [(34.0, 10.0, 35.1, 16.9), (45.1, 11.3, 47.15, 16.9), (35.0, 9.95, 39.4, 10.75),
               (40.5, 9.95, 46.9, 10.75), (3.2, 9.95, 4.9, 16.9), (15.0, 9.95, 16.4, 16.9)],
    'kitchen': [(34.1, 4.6, 35.4, 6.3), (35.6, 5.0, 37.55, 8.9), (41.1, 4.7, 43.2, 8.9)],
    'beige_rug': [(4.7, 6.3, 6.5, 8.3), (8.4, 6.3, 9.7, 8.3), (4.3, 5.0, 5.0, 8.3)],
    'teal_rug': [(22.1, 24.45, 27.9, 25.0), (24.05, 22.3, 25.95, 22.95)],
}

# Wall profiles: one pixel line across an office wall (office px), repeated
# along the wall. ('col', x, y1, y2) is a vertical line, ('row', y, x1, x2) a
# horizontal one; the end is exclusive.
WALL_PROFILES = {
    'h_dark': ('col', 1440, 550, 566),
    'h_wood': ('col', 1380, 550, 566),
    'v_dark': ('row', 590, 1029, 1043),
    'v_wood': ('row', 624, 1029, 1043),
    'outer': ('col', 1488, 0, 24),          # outer top wall, outside to inside
    'bottom_top': ('col', 1488, 849, 865),
    'bottom_body': ('col', 1488, 869, 885),
}
POST = (1257, 549, 1270, 567)               # dark post between two wall panels

# Single colors sampled from the office (office px).
COLORS = {
    'back_wall': (1200, 45),                # teal back wall of the top rooms
    'back_wall_top': (1200, 24),
    'wood_light': (740, 118),               # boardroom table: lit edge, top, dark edge
    'wood': (740, 124),
    'wood_dark': (768, 200),
    'post_dark': (1263, 564),
    'post_fill': (1263, 555),
    'post_light': (1263, 551),
    'monitor_bezel': (1170, 350),           # work desk monitor
    'monitor_blue': (1197, 370),
    'monitor_light': (1188, 370),
    'monitor_glare': (1170, 362),           # brightest part of the monitor picture
    'monitor_glare_dim': (1182, 370),
    'speaker': (1440, 562),
    'beige_edge': (160, 272),               # lounge rug border
    'teal_edge': (701, 768),                # reception rug border
}


def color(name):
    return office.getpixel(COLORS[name])


def shade(c, f):
    return tuple(max(0, min(255, round(v * f))) for v in c[:3]) + (255,)


# ---------------------------------------------------------------------------
# Cut-outs.

def cut_out(name):
    """Crops SOURCES[name] and makes the floor around the object transparent.

    The floor colors are the frequent colors of the crop border (or of the
    `floor_from` rectangle). Pixels connected to the border that match the
    floor become transparent; those that match a darker floor (a drop shadow)
    become a black overlay of the same darkness, or are dropped too with
    shadow='drop' (then `ground` draws a clean contact shadow instead). Options
    per piece are in CUTS: `keep` shapes and, with `blue`, bluish pixels are
    never removed; `erase` (tiles) and `erase_px` (crop pixels) are always
    cleared.
    """
    opts = CUTS.get(name, {})
    tol = opts.get('tol', 24)
    stol, smin = opts.get('shadow_tol', tol * 0.5), opts.get('shadow_min', 0.55)
    drop = opts.get('shadow') == 'drop'
    x, y, w, h = SOURCES[name]
    box = (px(x), px(y), px(x + w), px(y + h))
    im = office.crop(box)
    cw, ch = im.size
    pix = im.load()

    def local(shape):
        sx, sy, sw, sh = shape[:4]
        return (px(sx) - box[0], px(sy) - box[1], px(sx + sw) - box[0] - 1, px(sy + sh) - box[1] - 1)

    border = [pix[i, 0] for i in range(cw)] + [pix[i, ch - 1] for i in range(cw)] + \
             [pix[0, j] for j in range(ch)] + [pix[cw - 1, j] for j in range(ch)]
    if 'floor_from' in opts:
        fx, fy, fw, fh = opts['floor_from']
        border = [office.getpixel((i, j)) for i in range(px(fx), px(fx + fw)) for j in range(px(fy), px(fy + fh))]
    clusters = []                                   # [sum r, sum g, sum b, count]
    for c in border:
        for cl in clusters:
            if sum((c[k] - cl[k] / cl[3]) ** 2 for k in range(3)) <= 18 ** 2:
                for k in range(3):
                    cl[k] += c[k]
                cl[3] += 1
                break
        else:
            clusters.append([c[0], c[1], c[2], 1])
    floor = [tuple(cl[k] / cl[3] for k in range(3)) for cl in clusters if cl[3] >= 0.06 * len(border)]

    guard = Image.new('L', im.size, 0)
    for shape in opts.get('keep', []):
        if len(shape) > 4 and shape[4] == 'ellipse':
            ImageDraw.Draw(guard).ellipse(local(shape), fill=255)
        else:
            ImageDraw.Draw(guard).rectangle(local(shape), fill=255)
    kept = guard.load()

    blue = opts.get('blue')

    def kind(i, j):
        col = pix[i, j]
        if kept[i, j] or (blue and col[2] - col[0] > blue):
            return None
        if min(sum((col[k] - f[k]) ** 2 for k in range(3)) for f in floor) <= tol * tol:
            return 0.0
        for f in floor:
            s = sum(col[k] * f[k] for k in range(3)) / sum(f[k] * f[k] for k in range(3))
            if smin <= s < 0.97 and sum((col[k] - s * f[k]) ** 2 for k in range(3)) <= stol ** 2:
                return 0.0 if drop else 1.0 - s
        return None

    seen = [[False] * ch for _ in range(cw)]
    stack = [(i, j) for i in range(cw) for j in (0, ch - 1)] + [(i, j) for j in range(ch) for i in (0, cw - 1)]
    while stack:
        i, j = stack.pop()
        if i < 0 or j < 0 or i >= cw or j >= ch or seen[i][j]:
            continue
        seen[i][j] = True
        k = kind(i, j)
        if k is None:
            continue
        pix[i, j] = (0, 0, 0, round(min(0.5, k) * 255)) if k > 0 else (0, 0, 0, 0)
        stack += [(i + 1, j), (i - 1, j), (i, j + 1), (i, j - 1)]
    for shape in opts.get('erase', []):
        ImageDraw.Draw(im).rectangle(local(shape), fill=(0, 0, 0, 0))
    for rect in opts.get('erase_px', []):                # crop pixels, inclusive
        ImageDraw.Draw(im).rectangle(rect, fill=(0, 0, 0, 0))
    despeckle(im)
    if 'ground' in opts:                                 # soft contact shadow, drawn
        gx, gy, gw, gh, alpha = opts['ground']
        under = Image.new('RGBA', im.size)
        ImageDraw.Draw(under).ellipse(local((gx, gy, gw, gh)), fill=(0, 0, 0, alpha))
        under.alpha_composite(im)
        im = under
    return im


def despeckle(im, smallest=12):
    """Clears groups of fewer than `smallest` solid pixels left on the floor."""
    pix = im.load()
    cw, ch = im.size
    seen = set()
    for i in range(cw):
        for j in range(ch):
            if (i, j) in seen or pix[i, j][3] < 255:
                continue
            group, stack = [], [(i, j)]
            seen.add((i, j))
            while stack:
                a, b = stack.pop()
                group.append((a, b))
                for n in ((a + 1, b), (a - 1, b), (a, b + 1), (a, b - 1)):
                    if 0 <= n[0] < cw and 0 <= n[1] < ch and n not in seen and pix[n][3] == 255:
                        seen.add(n)
                        stack.append(n)
            if len(group) < smallest:
                for a, b in group:
                    pix[a, b] = (0, 0, 0, 0)


def round_table_for_three():
    """The kitchen round table without its bottom right chair.

    The chair hides part of the table's front edge, so that part is redrawn:
    the table is a cylinder seen from above, so a point of the top surface
    takes the color of the centre column at the same elliptical radius, and a
    point of the front edge the color of the centre column at the same depth
    below the top surface.
    """
    im = cut_out('round_table')
    x0, y0 = px(SOURCES['round_table'][0]), px(SOURCES['round_table'][1])
    src = office.load()
    cx, cy = 39.285 * T - x0, 7.195 * T - y0         # centre of the top surface
    a, b = 1.165 * T, 0.925 * T                       # its half width and half depth
    edge = 0.18 * T                                   # front edge height
    col = round(cx)
    pix = im.load()
    rx0, ry0 = px(39.62) - x0, px(7.75) - y0
    for i in range(rx0, im.width):
        for j in range(ry0, im.height):
            dx, dy = (i + 0.5 - cx) / a, (j + 0.5 - cy) / b
            r = (dx * dx + dy * dy) ** 0.5
            if r <= 1:
                pix[i, j] = src[col + x0, round(cy + r * b - 0.5) + y0]
                continue
            if abs(dx) < 1:
                rim = cy + b * (1 - dx * dx) ** 0.5
                depth = j + 0.5 - rim
                if 0 <= depth < edge:
                    pix[i, j] = src[col + x0, round(cy + b + depth - 0.5) + y0]
                    continue
            pix[i, j] = (0, 0, 0, 0)
    return im


def place(image, x, y):
    canvas.alpha_composite(image, (px(x), px(y)))


# ---------------------------------------------------------------------------
# Floors.

def quilt(box, pool, seed, patch=32, overlap=8, candidates=60, existing=False, target=None):
    """Fills a pixel box with texture synthesized from office floor patches.

    Patches are laid in raster order; each is the best of a random sample at
    matching what is already placed in its overlap, and the overlap is
    cross-faded. With existing=True the current pixels of the box count as
    placed, so the fill blends into the surrounding office floor.
    """
    target = target or canvas
    rng = random.Random(seed)
    x0, y0, x1, y1 = box
    out = target.crop(box).convert('RGB') if existing else Image.new('RGB', (x1 - x0, y1 - y0))
    filled = Image.new('L', out.size, 255 if existing else 0)
    pools = [(px(a), px(b), px(c), px(d)) for a, b, c, d in FLOOR_POOLS[pool]]
    pools = [p for p in pools if p[2] - p[0] > patch and p[3] - p[1] > patch]
    weights = [(p[2] - p[0] - patch) * (p[3] - p[1] - patch) for p in pools]
    step = patch - overlap
    fade = Image.new('L', (patch, patch), 255)
    for i in range(overlap):
        v = round(255 * (i + 1) / (overlap + 1))
        fade.paste(ImageChops.darker(fade.crop((i, 0, i + 1, patch)), Image.new('L', (1, patch), v)), (i, 0))
        fade.paste(ImageChops.darker(fade.crop((0, i, patch, i + 1)), Image.new('L', (patch, 1), v)), (0, i))
    start = -overlap if existing else 0
    for oy in range(start, out.height, step):
        for ox in range(start, out.width, step):
            region = (ox, oy, ox + patch, oy + patch)
            current, known = out.crop(region), filled.crop(region)
            best, best_err = None, None
            for _ in range(candidates):
                p = rng.choices(pools, weights)[0]
                sx, sy = rng.randint(p[0], p[2] - patch), rng.randint(p[1], p[3] - patch)
                cand = office.crop((sx, sy, sx + patch, sy + patch)).convert('RGB')
                diff = ImageChops.multiply(ImageChops.difference(cand, current).convert('L'), known)
                err = ImageStat.Stat(diff).sum2[0]
                if best_err is None or err < best_err:
                    best, best_err = cand, err
            out.paste(best, (ox, oy), ImageChops.lighter(fade, ImageChops.invert(known)))
            filled.paste(255, region)
    target.paste(out, box[:2])


BRICK = {'face': (128, 118, 125), 'mortar': (120, 110, 117), 'soft': (124, 114, 121)}


def brick(box):
    """Running-bond brick floor in the colors of the office corridor, laid in
    map coordinates so that neighbouring brick areas line up."""
    x0, y0, x1, y1 = box
    course, length = 11, 30
    for row in range(y0 // course - 1, y1 // course + 2):
        top = row * course
        shift = (length // 2) * (row % 2)
        for k in range((x0 - shift) // length - 1, (x1 - shift) // length + 2):
            left = k * length + shift
            tint = random.Random(row * 1000 + k).randint(-2, 2)
            ax0, ay0 = max(left, x0), max(top, y0)
            ax1, ay1 = min(left + length - 1, x1 - 1), min(top + course - 1, y1 - 1)
            if ax0 > ax1 or ay0 > ay1:
                continue
            draw.rectangle((ax0, ay0, ax1, ay1), fill=tuple(v + tint for v in BRICK['face']) + (255,))
            if y0 <= top + course - 1 < y1:
                draw.line((ax0, top + course - 1, ax1, top + course - 1), fill=BRICK['mortar'] + (255,))
            if y0 <= top + course - 2 < y1:
                draw.line((ax0, top + course - 2, ax1, top + course - 2), fill=BRICK['soft'] + (255,))
            if x0 <= left + length - 1 < x1:
                draw.line((left + length - 1, ay0, left + length - 1, ay1), fill=BRICK['mortar'] + (255,))


def rug(box, pool, edge, seed):
    """A rug: synthesized texture inside a light edge and a dark outline."""
    x0, y0, x1, y1 = box
    layer = Image.new('RGBA', (x1 - x0, y1 - y0))
    quilt((0, 0, x1 - x0, y1 - y0), pool, seed, patch=16, overlap=4, candidates=40, target=layer)
    d = ImageDraw.Draw(layer)
    w, h = layer.size
    d.rectangle((0, 0, w - 1, h - 1), outline=shade(edge, 0.62))
    d.rectangle((1, 1, w - 2, h - 2), outline=edge)
    d.rectangle((2, 2, w - 3, h - 3), outline=shade(edge, 1.05))
    canvas.alpha_composite(Image.new('RGBA', (w - 2, 3), (0, 0, 0, 70)), (x0 + 2, y1))
    canvas.alpha_composite(layer, (x0, y0))


# ---------------------------------------------------------------------------
# Walls, in the style of the office's interior walls: dark panels and wood
# panels between dark posts, centred on the wall tile.

def profile(name):
    kind, a, b, c = WALL_PROFILES[name]
    if kind == 'col':
        return [office.getpixel((a, v)) for v in range(b, c)]
    return [office.getpixel((v, a)) for v in range(b, c)]


PROFILE = {name: profile(name) for name in WALL_PROFILES}
POST_IMG = office.crop(POST)
H_OFF = (T - len(PROFILE['h_dark'])) // 2          # first wall row inside the tile
V_OFF = (T - len(PROFILE['v_dark'])) // 2


def panels(a, b, windows, joined_start=False, joined_end=False):
    """Splits a wall run [a, b) in px into (start, end, kind) panels and the
    positions of the posts between them. A run gets a dark panel at each end,
    except at an end joined to another wall: there the window runs on to the
    junction post, so two posts are not stacked a tile apart."""
    if not windows or b - a < 4 * T:
        return [(a, b, 'dark')], []
    end = round(1.25 * T)
    m0, m1 = a + (0 if joined_start else end), b - (0 if joined_end else end)
    count = max(1, round((m1 - m0) / (5 * T)))
    cuts = [round(m0 + (m1 - m0) * k / count) for k in range(count + 1)]
    segs = [(cuts[k], cuts[k + 1], 'wood') for k in range(count)]
    if joined_start:
        cuts = cuts[1:]
    else:
        segs = [(a, m0, 'dark')] + segs
    if joined_end:
        cuts = cuts[:-1]
    else:
        segs = segs + [(m1, b, 'dark')]
    return segs, cuts


def wall_pieces(start, end, gaps):
    pieces, cur = [], start
    for g0, g1 in sorted(gaps):
        pieces.append((cur, g0))
        cur = g1
    pieces.append((cur, end))
    return pieces


def h_wall(y, start, end, gaps=(), windows=True, posts=(), joined_start=False, joined_end=False):
    """Horizontal wall on tile row y, from px start to end, open at gaps.
    `posts` adds posts at junctions with vertical walls; joined_start and
    joined_end say the wall starts or ends against another wall."""
    top, cy = y * T + H_OFF, y * T + T // 2
    centres = []
    pieces = wall_pieces(start, end, gaps)
    for n, (a, b) in enumerate(pieces):
        segs, cuts = panels(a, b, windows, joined_start=joined_start and n == 0,
                            joined_end=joined_end and n == len(pieces) - 1)
        for s0, s1, kind in segs:
            for i, c in enumerate(PROFILE['h_' + kind]):
                draw.line((s0, top + i, s1 - 1, top + i), fill=c)
        centres += cuts + [a + POST_IMG.width // 2, b - (POST_IMG.width + 1) // 2]
    for c in spaced(list(posts), centres):
        post(c, cy)


def v_wall(x, start, end, gaps=(), windows=True, cap_top=True, cap_bottom=True, joined_end=False):
    """Vertical wall on tile column x, from px start to end, open at gaps;
    joined_end says it ends at a junction with a horizontal wall."""
    left, cx = x * T + V_OFF, x * T + T // 2
    pieces = wall_pieces(start, end, gaps)
    centres = []
    for n, (a, b) in enumerate(pieces):
        segs, cuts = panels(a, b, windows, joined_end=joined_end and n == len(pieces) - 1)
        for s0, s1, kind in segs:
            for i, c in enumerate(PROFILE['v_' + kind]):
                draw.line((left + i, s0, left + i, s1 - 1), fill=c)
        centres += cuts
        if n > 0 or cap_top:
            centres.append(a + POST_IMG.height // 2)
        if n < len(pieces) - 1 or cap_bottom:
            centres.append(b - (POST_IMG.height + 1) // 2)
    for c in spaced([], centres):
        post(cx, c)


def spaced(first, rest, gap=16):
    """Post positions without near duplicates; `first` wins over `rest`."""
    out = []
    for c in first + rest:
        if all(abs(c - o) >= gap for o in out):
            out.append(c)
    return out


def post(cx, cy):
    canvas.alpha_composite(POST_IMG, (cx - POST_IMG.width // 2, cy - POST_IMG.height // 2))


def cap(x0, x1, y0, y1):
    """End block of a thick wall, drawn like the office's wall posts."""
    draw.rectangle((x0, y0, x1 - 1, y1 - 1), fill=color('post_dark'))
    draw.rectangle((x0 + 1, y0 + 1, x1 - 2, y1 - 2), fill=color('post_fill'))
    draw.line((x0 + 1, y0 + 1, x1 - 2, y0 + 1), fill=color('post_light'))


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
quilt((WX, 0, W, (ti['y2'] + 2) * T), 'carpet', seed=11)                      # training room
for k, room in enumerate(L['oneOnOnes']):
    r = room['interior']
    quilt(((r['x1'] - 1) * T + HALF, rooms_top * T, (r['x2'] + 1) * T + HALF, H), 'kitchen', seed=20 + k)
quilt(((dr['x1'] - 1) * T + HALF, rooms_top * T, W, H), 'carpet', seed=31)    # directors
brick((WX, 0, (co['x2'] + 1) * T + HALF, H))                                # corridor
brick((hw['x1'] * T, (hw['y1'] - 1) * T + HALF, W, (hw['y2'] + 1) * T + HALF))  # hallway
for x1, y1, x2, y2 in L['doors']:                                           # door sills
    if x1 == x2:
        brick((x1 * T, y1 * T, x1 * T + HALF, (y2 + 1) * T))
    else:
        brick((x1 * T, y1 * T, (x2 + 1) * T, y1 * T + HALF))

# 2. Passage through the office east wall: carpet over the corner plant, brick
# in the opening, the cut ends of the wall closed with end blocks.
pas = L['passage']
p_top, p_bottom = pas['ys'][0] * T, (pas['ys'][-1] + 1) * T
quilt(((pas['x'] - 2) * T, (pas['ys'][0] - 1) * T + 12, pas['x'] * T - 5, p_bottom + 4), 'carpet', seed=41, existing=True)
brick((48 * T + 27, p_top, WX, p_bottom))
cap(48 * T + 26, WX, p_top - 10, p_top)
cap(48 * T + 26, WX, p_bottom, p_bottom + 10)

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
rug((aisle_left * T + 18, st1 + 14, aisle_right * T - 18, (ti['y2'] + 1) * T - 4), 'beige_rug',
    color('beige_edge'), seed=51)


def mic(tx, ty):
    """Microphone stand standing on tile (tx, ty)."""
    cx, base = tx * T + HALF, ty * T + 27
    dark, light = color('post_dark'), color('post_light')
    canvas.alpha_composite(Image.new('RGBA', (16, 3), (0, 0, 0, 70)), (cx - 8, base + 2))
    draw.ellipse((cx - 7, base - 3, cx + 7, base + 3), fill=dark)
    draw.rectangle((cx - 1, base - 26, cx + 1, base), fill=dark)
    draw.ellipse((cx - 4, base - 34, cx + 4, base - 24), fill=dark)
    draw.ellipse((cx - 2, base - 32, cx + 1, base - 29), fill=light)


mic(tr['stageMic'][0], tr['stageMic'][1] - 1)
mic(tr['audienceMic'][0], tr['audienceMic'][1] - 1)

chair = cut_out('chair_up')
for row in tr['seatRows']:
    for column in tr['seatColumns']:
        place(chair, column + L['CHAIR_OFFSET']['dx'], row + L['CHAIR_OFFSET']['dy'])

plant = cut_out('plant')
plant_tall = cut_out('plant_tall')
place(plant_tall, ti['x1'] + 0.05, 0.95)
place(plant_tall, ti['x2'] - 0.85, 0.95)
place(plant, ti['x1'] + 0.05, ti['y2'] - 1.45)
place(plant, ti['x2'] - 0.65, ti['y2'] - 1.45)

# 5. 1:1 rooms: the kitchen round table shifted by (x1 - 37, 16), without the
# bottom right chair; a plant in the bottom left corner and a shelf against
# the right wall, both clear of the paths from the door to the three seats.
table = round_table_for_three()
shelf = cut_out('shelf')
for room in L['oneOnOnes']:
    r = room['interior']
    sx, sy = SOURCES['round_table'][:2]
    place(table, sx + TABLE_SHIFT[0](room['x1']), sy + TABLE_SHIFT[1])
    place(plant, r['x1'] - 0.12, r['y2'] + 0.92 - SOURCES['plant'][3])
    place(shelf, r['x2'] + 0.17, r['y2'] + 0.96 - SOURCES['shelf'][3])

# 6. Directors' room: desk shifted by (+44, +10), armchairs and coffee table
# shifted by (+56.5, +2) on a rug centred under them, and a plant against the
# bottom wall between the two armchair approach tiles. The plant keeps off the
# walking lanes: column x1 and column x2 (the only ways round the desk), the
# door tiles and the seat tiles.
lounge = [SOURCES[n] for n in ('armchair_right', 'armchair_left')]
rug_x0 = lounge[0][0] + LOUNGE_SHIFT[0] - 0.45
rug_x1 = lounge[1][0] + lounge[1][2] + LOUNGE_SHIFT[0] + 0.45
rug((px(rug_x0), px(dr['y1'] + 4.4), px(rug_x1), px(dr['y1'] + 7.3)), 'teal_rug', color('teal_edge'), seed=61)
sx, sy = SOURCES['desk'][:2]
place(cut_out('desk'), sx + DESK_SHIFT[0], sy + DESK_SHIFT[1])
for name in ('armchair_right', 'armchair_left', 'coffee_table'):
    sx, sy = SOURCES[name][:2]
    place(cut_out(name), sx + LOUNGE_SHIFT[0], sy + LOUNGE_SHIFT[1])
place(plant, (dr['x1'] + dr['x2'] + 1) / 2 - SOURCES['plant'][2] / 2, dr['y2'] + 1 - SOURCES['plant'][3])

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
    v_wall(x1, start, end, gaps, windows=y2 <= ti['y2'] + 1, cap_top=False, cap_bottom=False, joined_end=joined)
for x1, y1, x2, y2 in horizontal:
    gaps = [(d[0] * T, (d[2] + 1) * T) for d in L['doors'] if d[1] == d[3] == y1 and x1 <= d[0] <= x2]
    joints = [v[0] * T + HALF for v in vertical if v[1] <= y1 <= v[3]]
    # A wall reaching the outer right wall ends against it, with its end post
    # beside it, like the west end's post at the junction.
    at_outer = x2 == last_x - 1
    end = inner_right if at_outer else (x2 + 1) * T
    h_wall(y1, x1 * T + V_OFF, end, gaps, windows=y1 <= ti['y2'] + 1, posts=joints,
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
