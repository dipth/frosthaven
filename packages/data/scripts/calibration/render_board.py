"""Renders a generated board to PNG to eyeball tile calibration (dev tool)."""
import json, math, os, sys
from PIL import Image, ImageDraw
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../..'))
ASSETS = os.path.join(ROOT, '.assets/worldhaven')
U = 60.0  # px between hex centres
def P(x, y): return (U * (x + y / 2), -U * math.sqrt(3) / 2 * y)
board = json.load(open(os.path.join(ROOT, f'packages/data/generated/boards/{sys.argv[1]}.json')))
sections = sys.argv[3].split(',') if len(sys.argv) > 3 else None
maps = [m for m in board['maps'] if m['type'] == 'scenario' or (sections is None or m['name'] in sections)]
used = {t for m in maps for t in m['tiles']}
layers = []
pts = []
for t in board['tiles']:
    if t['name'] not in used or 'image' not in t: continue
    im = t['image']
    img = Image.open(os.path.join(ASSETS, im['path'])).convert('RGBA')
    k = U / im['spacing']
    img = img.resize((round(img.width * k), round(img.height * k)), Image.BICUBIC)
    ox, oy = im['origin']['x'] * k, im['origin']['y'] * k
    angle = im['rotation'] + t['orientation']  # CCW
    # rotate about the origin point: pad so origin is centre
    W, H = img.size
    R = int(math.hypot(max(ox, W - ox), max(oy, H - oy))) + 2
    canvas = Image.new('RGBA', (2 * R, 2 * R), (0, 0, 0, 0))
    canvas.paste(img, (int(R - ox), int(R - oy)))
    rot = canvas.rotate(angle, resample=Image.BICUBIC)
    gx, gy = P(t['origin']['x'], t['origin']['y'])
    layers.append((rot, gx - R, gy - R))
    pts += [(gx - R, gy - R), (gx + R, gy + R)]
minx = min(p[0] for p in pts); miny = min(p[1] for p in pts)
maxx = max(p[0] for p in pts); maxy = max(p[1] for p in pts)
out = Image.new('RGBA', (int(maxx - minx), int(maxy - miny)), (20, 20, 30, 255))
for img, x, y in layers:
    out.alpha_composite(img, (int(x - minx), int(y - miny)))
d = ImageDraw.Draw(out)
colors = {'monster': (255, 60, 60), 'token': (255, 230, 0), 'overlay': (80, 200, 255)}
for m in maps:
    for it in m['items']:
        hexes = it['hexes'] if it['kind'] == 'overlay' else [it['hex']]
        for h in hexes:
            x, y = P(h['x'], h['y']); x -= minx; y -= miny
            c = colors[it['kind']]
            if it['kind'] == 'overlay' and ('Door' in it['type'] or 'Door' in it['name']): c = (0, 255, 0)
            r = U * 0.22
            d.ellipse([x - r, y - r, x + r, y + r], outline=c, width=3)
            label = it['name'][:3] if it['kind'] != 'monster' else it['levels']
            d.text((x - r, y - 6), label, fill=c)
out.save(sys.argv[2])
print(out.size)
