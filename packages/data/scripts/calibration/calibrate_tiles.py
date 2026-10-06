"""
One-off calibration of Worldhaven map tile images against the fhtts layout
frame (pointy-top hexes, orientation 0). Run locally after `mise run
assets:sync`; writes packages/data/tile-calibration.json, which is committed.

For each tile image:
  rotation  extra counter-clockwise rotation (deg) so its hexes match the
            template frame (from fhtts' TTS AdditionalRotation table)
  spacing   distance between neighbouring hex centres in image px
  center    image px (unrotated image) of the tile's "center" hex, i.e. the
            hex fhtts layout.center refers to
"""
import glob, json, math, os, sys
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../..'))
ASSETS = os.environ.get('ASSETS_DIR', os.path.join(ROOT, '.assets'))
TILE_DIR = os.path.join(ASSETS, 'worldhaven/map-tiles/frosthaven')
INFOS = json.load(open(os.path.join(ROOT, 'packages/data/generated/fhtts/tileInfos.json')))
SMALL = 29.42
SQ3 = math.sqrt(3)
# fhtts scripts/coordinates.lua AdditionalRotation, via TileLetterMappings (C,E,.. -> A; D,F,.. -> B)
EXTRA = {'03-A': 30, '03-B': -90, '06-A': 90, '06-B': -90, '07-A': -90, '07-B': 90, '10-A': 90, '10-B': -90, '11-A': -60, '16-A': 90, '16-B': -90}
FLIPPED = set('BDFHJL')

def edge_map(im):
    a = np.asarray(im.convert('L')).astype(float)
    alpha = np.asarray(im.convert('RGBA'))[:, :, 3]
    gx = np.zeros_like(a); gy = np.zeros_like(a)
    gx[:, 1:-1] = a[:, 2:] - a[:, :-2]; gy[1:-1, :] = a[2:, :] - a[:-2, :]
    g = np.hypot(gx, gy)
    g[alpha < 250] = 0
    g = np.asarray(Image.fromarray(np.clip(g, 0, 255).astype('uint8')).filter(ImageFilter.GaussianBlur(1.5))).astype(float)
    return g / (g.mean() + 1e-6), alpha

def samples(s, n=10):
    r = s / SQ3
    corners = [(r * math.cos(math.radians(30 + 60 * k)), r * math.sin(math.radians(30 + 60 * k))) for k in range(6)]
    pts = []
    for k in range(6):
        (x0, y0), (x1, y1) = corners[k], corners[(k + 1) % 6]
        for t in np.linspace(0.2, 0.8, n):
            pts.append((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t))
    return np.array(pts)

def lattice(s, px, py, W, H, alpha=None):
    rowh = s * SQ3 / 2
    out = []
    for j in range(-int(H / rowh) - 2, int(H / rowh) + 3):
        for i in range(-int(W / s) - 3, int(W / s) + 3):
            x = px + s * (i + j / 2); y = py + rowh * j
            if s * 0.45 < x < W - s * 0.45 and s * 0.45 < y < H - s * 0.45:
                if alpha is None or alpha[int(y), int(x)] > 250:
                    out.append((x, y))
    return np.array(out)

def score(g, alpha, s, px, py):
    H, W = g.shape
    c = lattice(s, px, py, W, H, alpha)
    if len(c) < 3:
        return 0
    P = (c[:, None, :] + samples(s)[None, :, :]).reshape(-1, 2)
    xs = np.clip(P[:, 0].round().astype(int), 0, W - 1); ys = np.clip(P[:, 1].round().astype(int), 0, H - 1)
    inner = (c[:, None, :] + samples(s * 0.5)[None, :, :]).reshape(-1, 2)
    xi = np.clip(inner[:, 0].round().astype(int), 0, W - 1); yi = np.clip(inner[:, 1].round().astype(int), 0, H - 1)
    return g[ys, xs].mean() - 0.5 * g[yi, xi].mean()

def fit(g, alpha, smin, smax):
    # Coarse pass over the whole range, then a fine pass around the best spacing.
    coarse = (-1e9, smin)
    for s in np.arange(smin, smax, 2.0):
        rowh = s * SQ3 / 2
        for fx in np.linspace(0, 1, 10, endpoint=False):
            for fy in np.linspace(0, 1, 10, endpoint=False):
                sc = score(g, alpha, s, fx * s, fy * 2 * rowh)
                if sc > coarse[0]:
                    coarse = (sc, s)
    best = (-1e9, None)
    for s in np.arange(coarse[1] - 2.5, coarse[1] + 2.5, 0.5):
        rowh = s * SQ3 / 2
        for fx in np.linspace(0, 1, 20, endpoint=False):
            for fy in np.linspace(0, 1, 20, endpoint=False):
                cand = (s, fx * s, fy * 2 * rowh)
                sc = score(g, alpha, *cand)
                if sc > best[0]:
                    best = (sc, cand)
    sc, (s, px, py) = best
    for step in (0.25, 0.1):
        improved = True
        while improved:
            improved = False
            for ds in (-step, 0, step):
                for dx in (-0.5, 0, 0.5):
                    for dy in (-0.5, 0, 0.5):
                        cand = (s + ds, px + dx, py + dy)
                        c = score(g, alpha, *cand)
                        if c > best[0] + 1e-9:
                            best = (c, cand); improved = True
            sc, (s, px, py) = best
    return sc, s, px, py

def calibrate(path, number, side, smin, smax):
    letter = 'B' if side in FLIPPED else 'A'
    extra = EXTRA.get(f'{number}-{letter}', 0)
    im = Image.open(path).convert('RGBA')
    W, H = im.size
    rot = im.rotate(extra, expand=True, resample=Image.BICUBIC) if extra else im
    RW, RH = rot.size
    g, alpha = edge_map(rot)
    sc, s, px, py = fit(g, alpha, smin, smax)
    info = INFOS[number]
    c = info['center_flipped'] if side in FLIPPED and 'center_flipped' in info else info['center']
    cx = RW / 2 + c['x'] * s / SMALL
    cy = RH / 2 + c['y'] * s / SMALL
    # snap to the nearest fitted hex centre
    rowh = s * SQ3 / 2
    j = round((cy - py) / rowh)
    i = round((cx - px) / s - j / 2)
    hx = px + s * (i + j / 2); hy = py + rowh * j
    snap = math.hypot(hx - cx, hy - cy) / s
    # back to unrotated image coordinates (PIL rotates counter-clockwise about the centre)
    a = math.radians(extra)
    dx, dy = hx - RW / 2, hy - RH / 2
    ux = W / 2 + dx * math.cos(a) - dy * math.sin(a)
    uy = H / 2 + dx * math.sin(a) + dy * math.cos(a)
    return {'rotation': extra, 'spacing': round(s, 2), 'center': {'x': round(ux, 1), 'y': round(uy, 1)}, 'score': round(sc, 3), 'snap': round(snap, 2), 'size': [W, H]}

if __name__ == '__main__':
    # Expected spacing ranges per tile number (images are scaled to fit 600 px).
    ranges = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}
    only = sys.argv[2].split(',') if len(sys.argv) > 2 else None
    out_path = os.path.join(ROOT, 'packages/data/tile-calibration.json')
    result = json.load(open(out_path)) if os.path.exists(out_path) else {}
    for path in sorted(glob.glob(os.path.join(TILE_DIR, 'fh-[0-9][0-9][a-l]-*.png'))):
        base = os.path.basename(path)
        number, side = base[3:5], base[5].upper()
        if only and number not in only:
            continue
        smin, smax = ranges.get(number, [38, 140])
        r = calibrate(path, number, side, smin, smax)
        r['image'] = 'map-tiles/frosthaven/' + base
        result[f'{number}-{side}'] = r
        print(f'{number}-{side}', r, flush=True)
    json.dump(dict(sorted(result.items())), open(out_path, 'w'), indent=1)
