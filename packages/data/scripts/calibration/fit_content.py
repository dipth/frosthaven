"""
Second calibration step: align each tile image using the content fhtts places
on that tile in every scenario (monsters, tokens, obstacles, traps...).
In tile-local coordinates all those hexes must lie inside the tile, which pins
down the origin hex and the 60-degree rotation between image and template.

Updates packages/data/tile-calibration.json with:
  origin    image px (unrotated image) of the tile's local origin hex
  rotation  counter-clockwise degrees to rotate the image so it is in the
            template frame at orientation 0 (multiple of 30)
"""
import json, math, os
import numpy as np
from PIL import Image
from calibrate_tiles import ROOT, TILE_DIR, SQ3, INFOS, FLIPPED, edge_map, fit

SCEN = json.load(open(os.path.join(ROOT, 'packages/data/generated/fhtts/processedScenarios.human.json')))
CAL_PATH = os.path.join(ROOT, 'packages/data/tile-calibration.json')
CAL = json.load(open(CAL_PATH))
SKIP = {'Door', 'Corridor', 'Wall'}

def rot_hex(x, y, o):
    o = int(o) % 360
    if o == 0: return x, y
    if o == 60: return -y, x + y
    if o == 120: return -x - y, x
    if o == 180: return -x, -y
    if o == 240: return y, -x - y
    if o == 300: return x + y, -x
    raise ValueError(o)

def local_positions():
    """number+flipped -> set of local hex positions used by content."""
    out = {}
    for s in SCEN.values():
        layout = {t['name']: t for t in (s.get('layout') or [])}
        for m in s['maps']:
            for e in m.get('entries') or []:
                ref = e['reference']['tile']
                if ref not in layout:
                    continue
                num, side = ref.split('-')
                angle = INFOS.get(num, {}).get('angle', 0)
                eff = int(e['reference'].get('tileOrientation', layout[ref]['orientation']))
                key = (num, side in FLIPPED)
                pts = out.setdefault(key, {})
                def add(x, y):
                    lx, ly = rot_hex(x, y, (-eff) % 360)
                    pts[(lx, ly)] = pts.get((lx, ly), 0) + 1
                for t in e.get('tokens') or []:
                    for p in t['positions']: add(p['x'], p['y'])
                for t in e.get('monsters') or []:
                    for p in t['positions']: add(p['x'], p['y'])
                for o in e.get('overlays') or []:
                    for p in o['positions']:
                        if p.get('type') not in SKIP and 'Corridor' not in o['name'] and 'Door' not in o['name']:
                            add(p['x'], p['y'])
    return out

def tile_hexes(im, s, px, py):
    """Lattice hexes (i, j) whose centre area is fully on the tile."""
    a = np.asarray(im.convert('RGBA'))[:, :, 3]
    H, W = a.shape
    rowh = s * SQ3 / 2
    inside = {}
    ring = [(math.cos(t) * s * 0.35, math.sin(t) * s * 0.35) for t in np.linspace(0, 2 * math.pi, 12, endpoint=False)] + [(0, 0)]
    for j in range(-40, 41):
        for i in range(-40, 41):
            x = px + s * (i + j / 2); y = py + rowh * j
            ok = all(0 <= x + dx < W and 0 <= y + dy < H and a[int(y + dy), int(x + dx)] > 200 for dx, dy in ring)
            if ok:
                inside[(i, j)] = (x, y)
    return inside

def to_lattice(lx, ly):
    # Book hex coords (x right, y up-right; page y grows downwards) -> lattice (i right, j down)
    # P(x, y) = (s*(x + y/2), -rowh*y); lattice L(i, j) = (s*(i + j/2), rowh*j) => j = -y, i = x + y
    return lx + ly, -ly

# Spacing ranges where the grid fit locks onto a harmonic.
RANGES = {'07': (65, 85), '11': (60, 72), '14': (60, 75)}
import sys
ONLY = sys.argv[1].split(',') if len(sys.argv) > 1 else None

def solve(im, pre, smin, smax, pts):
    rot = im.rotate(pre, expand=True, resample=Image.BICUBIC) if pre else im
    g, alpha = edge_map(rot)
    sc, s, px, py = fit(g, alpha, smin, smax)
    inside = tile_hexes(rot, s, px, py)
    per_rotation = {}
    for r in range(0, 360, 60):
        lat = [(to_lattice(*rot_hex(x, y, r)), w) for (x, y), w in pts.items()]
        for (oi, oj) in inside:
            hit = sum(w for (i, j), w in lat if (i + oi, j + oj) in inside)
            miss = sum(w for (i, j), w in lat if (i + oi, j + oj) not in inside)
            cand = (hit - 3 * miss, -miss, r, (oi, oj))
            if r not in per_rotation or cand > per_rotation[r]:
                per_rotation[r] = cand
    best = max(per_rotation.values())
    return best, rot, inside, s, per_rotation

positions = local_positions()
results = {}
for name, cal in sorted(CAL.items()):
    if ONLY and name.split('-')[0] not in ONLY:
        continue
    num, side = name.split('-')
    pts = positions.get((num, side in FLIPPED), {})
    im = Image.open(os.path.join(TILE_DIR, os.path.basename(cal['image']))).convert('RGBA')
    smin, smax = RANGES.get(num, (cal['spacing'] - 3, cal['spacing'] + 3))
    # Images have pointy-top hexes either as-is or after a 30 degree turn; the
    # content search covers the 60 degree steps.
    options = [solve(im, pre, smin, smax, pts) + (pre,) for pre in (0, 30)]
    results[name] = max(options, key=lambda o: o[0][0])

# One rotation per tile geometry (number + side flipped): all sides share the scan framing.
groups = {}
for name, (best, rot, inside, s, per_rotation, pre) in results.items():
    num, side = name.split('-')
    g = groups.setdefault((num, side in FLIPPED), {})
    for r, cand in per_rotation.items():
        g[(pre, r)] = g.get((pre, r), 0) + cand[0]
chosen = {}
for key, totals in groups.items():
    top = max(totals.values())
    tied = sorted(k for k, v in totals.items() if v == top)
    chosen[key] = tied[0]

for name, (best, rot, inside, s, per_rotation, pre) in sorted(results.items()):
    num, side = name.split('-')
    cal = CAL[name]
    gpre, gr = chosen[(num, side in FLIPPED)]
    if gpre != pre:
        im = Image.open(os.path.join(TILE_DIR, os.path.basename(cal['image']))).convert('RGBA')
        smin, smax = RANGES.get(num, (cal['spacing'] - 3, cal['spacing'] + 3))
        best, rot, inside, s, per_rotation = solve(im, gpre, smin, smax, positions.get((num, side in FLIPPED), {}))
        pre = gpre
    score, negmiss, r, (oi, oj) = per_rotation[gr]
    W, H = Image.open(os.path.join(TILE_DIR, os.path.basename(cal['image']))).size
    ox, oy = inside[(oi, oj)]
    a = math.radians(pre)
    RW, RH = rot.size
    dx, dy = ox - RW / 2, oy - RH / 2
    ux = W / 2 + dx * math.cos(a) - dy * math.sin(a)
    uy = H / 2 + dx * math.sin(a) + dy * math.cos(a)
    total = sum(positions.get((num, side in FLIPPED), {}).values())
    cal.update({'preRotation': pre, 'spacing': round(float(s), 2), 'origin': {'x': round(ux, 1), 'y': round(uy, 1)}, 'rotation': (pre - gr) % 360,
                'contentMisses': -negmiss, 'contentUses': total})
    for k in ('center', 'score', 'snap', 'contentHexes'):
        cal.pop(k, None)
    print(name, 'rot', cal['rotation'], 'spacing', cal['spacing'], 'origin', cal['origin'], 'misses', -negmiss, '/', total, flush=True)
json.dump(CAL, open(CAL_PATH, 'w'), indent=1, default=float)
