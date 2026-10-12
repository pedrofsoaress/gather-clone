"""Shared toolkit for the annex and second-floor art (compose.py, floor2.py).

Sources, cut-outs, floors, walls and colors are all taken from the office art
(frontend/public/matte-office-v2.png), so every generated piece matches its
style. Functions that draw take the target image as their first argument.
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
H = L['MAP_HEIGHT'] * T

office = Image.open(ROOT / 'frontend/public/matte-office-v2.png').convert('RGBA').resize(
    (OFFICE_W, H), Image.LANCZOS)


def canvas(width_px, height_px):
    """A blank output image in the map's background color."""
    return Image.new('RGBA', (width_px, height_px), (12, 14, 20, 255))


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
    # Project table with its six chairs, on the corridor bricks between the work
    # areas (the 1:1 rooms use the kitchen table instead). Its table tiles start
    # at (22, 12): shift by (ox - 22, oy - 12) to put the table at (ox, oy).
    'project_table': (21.0, 11.0, 8.0, 5.1),
    # Plant on a small wooden stand, by the workshop (a low plant between desks).
    'plant_stool': (12.45, 19.25, 1.05, 2.4),
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
    # The stand's dark legs read as shadow: dropped, with a drawn contact shadow.
    'plant_stool': {'tol': 28, 'shadow': 'drop', 'erase_px': [(0, 64, 33, 76), (0, 0, 1, 76)],
                    'ground': (12.5, 21.0, 0.95, 0.3, 90)},
    # The bricks' joints leave holes in the table's shadow: closed.
    'project_table': {'fill_shadow': 5},
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
    # The work-area carpet without the wall, brick and plant edges some of the
    # 'carpet' rectangles touch (second floor).
    'carpet_clean': [(34.08, 10.05, 35.12, 16.85), (45.1, 11.3, 47.15, 16.85), (35.0, 10.05, 39.4, 10.75),
                     (40.5, 10.05, 46.9, 10.75), (3.45, 11.7, 4.9, 16.85)],
    # The lounge rug without the leaf tips of the plant beside it (second floor).
    'beige_rug_clean': [(4.45, 6.4, 6.45, 8.35), (8.55, 6.4, 9.75, 8.35)],
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
    if 'fill_shadow' in opts:
        fill_shadow(im, opts['fill_shadow'])
    if 'ground' in opts:                                 # soft contact shadow, drawn
        gx, gy, gw, gh, alpha = opts['ground']
        under = Image.new('RGBA', im.size)
        ImageDraw.Draw(under).ellipse(local((gx, gy, gw, gh)), fill=(0, 0, 0, alpha))
        under.alpha_composite(im)
        im = under
    return im


def fill_shadow(im, size):
    """Closes the holes a patterned floor (brick joints) leaves in a drop
    shadow: transparent pixels and small floor-colored specks inside the closed
    shadow area become shadow of the typical darkness."""
    from PIL import ImageFilter
    alpha = im.getchannel('A')
    shadow = alpha.point(lambda v: 255 if 0 < v < 255 else 0)
    closed = shadow.filter(ImageFilter.MaxFilter(size)).filter(ImageFilter.MinFilter(size))
    values = sorted(v for v in alpha.getdata() if 0 < v < 255)
    typical = values[len(values) // 2] if values else 0
    pix, inside = im.load(), closed.load()
    cw, ch = im.size
    seen = set()
    for i in range(cw):
        for j in range(ch):
            if not inside[i, j] or (i, j) in seen:
                continue
            if pix[i, j][3] == 0:
                pix[i, j] = (0, 0, 0, typical)
            elif pix[i, j][3] == 255:              # an opaque group wholly inside the shadow
                group, stack, edge = [], [(i, j)], False
                seen.add((i, j))
                while stack:
                    a, b = stack.pop()
                    group.append((a, b))
                    for n in ((a + 1, b), (a - 1, b), (a, b + 1), (a, b - 1)):
                        if not (0 <= n[0] < cw and 0 <= n[1] < ch):
                            continue
                        if pix[n][3] == 255 and n not in seen:
                            seen.add(n)
                            stack.append(n)
                        elif pix[n][3] == 255 or not inside[n]:
                            edge = edge or not inside[n]
                if not edge and len(group) < 40 and all(sum(pix[g][:3]) > 300 for g in group):
                    for g in group:
                        pix[g] = (0, 0, 0, typical)


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


def place(img, image, x, y):
    img.alpha_composite(image, (px(x), px(y)))


# ---------------------------------------------------------------------------
# Floors.

def quilt(img, box, pool, seed, patch=32, overlap=8, candidates=60, existing=False):
    """Fills a pixel box with texture synthesized from office floor patches.

    Patches are laid in raster order; each is the best of a random sample at
    matching what is already placed in its overlap, and the overlap is
    cross-faded. With existing=True the current pixels of the box count as
    placed, so the fill blends into the surrounding office floor.
    """
    rng = random.Random(seed)
    x0, y0, x1, y1 = box
    out = img.crop(box).convert('RGB') if existing else Image.new('RGB', (x1 - x0, y1 - y0))
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
    img.paste(out, box[:2])


BRICK = {'face': (128, 118, 125), 'mortar': (120, 110, 117), 'soft': (124, 114, 121)}


def brick(img, box):
    """Running-bond brick floor in the colors of the office corridor, laid in
    map coordinates so that neighbouring brick areas line up."""
    draw = ImageDraw.Draw(img)
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


def rug(img, box, pool, edge, seed):
    """A rug: synthesized texture inside a light edge and a dark outline."""
    x0, y0, x1, y1 = box
    layer = Image.new('RGBA', (x1 - x0, y1 - y0))
    quilt(layer, (0, 0, x1 - x0, y1 - y0), pool, seed, patch=16, overlap=4, candidates=40)
    d = ImageDraw.Draw(layer)
    w, h = layer.size
    d.rectangle((0, 0, w - 1, h - 1), outline=shade(edge, 0.62))
    d.rectangle((1, 1, w - 2, h - 2), outline=edge)
    d.rectangle((2, 2, w - 3, h - 3), outline=shade(edge, 1.05))
    img.alpha_composite(Image.new('RGBA', (w - 2, 3), (0, 0, 0, 70)), (x0 + 2, y1))
    img.alpha_composite(layer, (x0, y0))


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


def h_wall(img, y, start, end, gaps=(), windows=True, posts=(), joined_start=False, joined_end=False):
    """Horizontal wall on tile row y, from px start to end, open at gaps.
    `posts` adds posts at junctions with vertical walls; joined_start and
    joined_end say the wall starts or ends against another wall."""
    draw = ImageDraw.Draw(img)
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
        post(img, c, cy)


def v_wall(img, x, start, end, gaps=(), windows=True, cap_top=True, cap_bottom=True, joined_end=False):
    """Vertical wall on tile column x, from px start to end, open at gaps;
    joined_end says it ends at a junction with a horizontal wall."""
    draw = ImageDraw.Draw(img)
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
        post(img, cx, c)


def spaced(first, rest, gap=16):
    """Post positions without near duplicates; `first` wins over `rest`."""
    out = []
    for c in first + rest:
        if all(abs(c - o) >= gap for o in out):
            out.append(c)
    return out


def post(img, cx, cy):
    img.alpha_composite(POST_IMG, (cx - POST_IMG.width // 2, cy - POST_IMG.height // 2))


def cap(img, x0, x1, y0, y1):
    """End block of a thick wall, drawn like the office's wall posts."""
    draw = ImageDraw.Draw(img)
    draw.rectangle((x0, y0, x1 - 1, y1 - 1), fill=color('post_dark'))
    draw.rectangle((x0 + 1, y0 + 1, x1 - 2, y1 - 2), fill=color('post_fill'))
    draw.line((x0 + 1, y0 + 1, x1 - 2, y0 + 1), fill=color('post_light'))


# ---------------------------------------------------------------------------
# Stairs.

def stairs(img, x1, y1, x2, y2, going='down'):
    """A staircase seen from above on the tile rectangle (inclusive), in the
    wood of the training stage: two treads per tile row between two dark
    rails, with a newel post at the top-of-rectangle end of each rail, where
    people step on. The camera looks from the bottom of the map, so:
    going='down' (the flight descends towards the bottom) shows each tread's
    lit nosing over a dark riser, and the treads darken towards the bottom;
    going='up' (the flight climbs towards the bottom) hides the risers, so each
    tread starts with a dark joint and a lit nosing, and the treads darken
    towards the top, the lower end."""
    draw = ImageDraw.Draw(img)
    x0, y0, xe, ye = x1 * T, y1 * T, (x2 + 1) * T, (y2 + 1) * T
    rail = 4
    sx0, sx1 = x0 + rail, xe - rail                  # treads between the rails
    step = T // 2
    count = (ye - y0) // step
    rng = random.Random(x1 * 100 + y1)
    wood, light, dark = color('wood'), color('wood_light'), color('wood_dark')

    def band(a, b, c):
        draw.rectangle((sx0, a, sx1 - 1, b - 1), fill=c)

    for n in range(count):
        k = n if going == 'down' else count - 1 - n
        f = 1.0 - 0.3 * k / max(1, count - 1)
        top, bottom = y0 + n * step, y0 + (n + 1) * step     # bottom exclusive
        band(top, bottom, shade(wood, f * rng.uniform(0.98, 1.02)))
        gx, gy = rng.randint(sx0 + 6, sx1 - 30), top + rng.randint(5, 8)       # a grain line
        draw.line((gx, gy, gx + rng.randint(12, 24), gy), fill=shade(wood, f * 0.94))
        if going == 'down':
            band(bottom - 6, bottom - 4, shade(light, f * 1.06))     # nosing
            band(bottom - 4, bottom - 1, shade(wood, f * 0.5))       # riser
            band(bottom - 1, bottom, shade(dark, f * 0.6))
            if n > 0:                                                # shadow of the tread above
                for i, a in enumerate((70, 35)):
                    img.alpha_composite(Image.new('RGBA', (sx1 - sx0, 1), (0, 0, 0, a)), (sx0, top + i))
        else:
            band(top, top + 2, shade(dark, f * 0.6))                 # joint with the tread below
            band(top + 2, top + 4, shade(light, f * 1.06))           # nosing
            band(bottom - 2, bottom, shade(wood, f * 0.82))          # tread's back edge
    # The rails shade the edges of the treads.
    for i, a in enumerate((60, 30)):
        side = Image.new('RGBA', (1, ye - y0), (0, 0, 0, a))
        img.alpha_composite(side, (sx0 + i, y0))
        img.alpha_composite(side, (sx1 - 1 - i, y0))
    # Rails along both sides, a newel post at the top end of each.
    for rx in (x0, xe - rail):
        draw.rectangle((rx, y0, rx + rail - 1, ye - 1), fill=color('post_dark'))
        draw.line((rx + 1, y0, rx + 1, ye - 1), fill=color('post_fill'))
        draw.line((rx + 2, y0, rx + 2, ye - 1), fill=color('post_light'))
    pw, ph = POST_IMG.size
    for cx in (x0 + pw // 2, xe - (pw + 1) // 2):
        post(img, cx, y0 + ph // 2)
