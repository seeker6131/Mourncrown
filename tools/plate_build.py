"""Stitch village plates into one composite (art px, 1 art px = 0.5 game px).
Offsets found with tools/plate_reg.py (VL2 at origin)."""
import numpy as np, os, json
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(ROOT, 'art-source', 'plates')
LAYOUT = {'VL1': (-1112, 0), 'VL2': (0, 0), 'VL4': (-872, 600), 'VL5': (0, 600), 'VL6': (212, 1018)}
FEATHER = 160  # distance used to rank plates; blending band is narrow (SHARP) to avoid ghosting
SHARP = 10

def build():
    xs = [o[0] for o in LAYOUT.values()]; ys = [o[1] for o in LAYOUT.values()]
    X0, Y0 = min(xs), min(ys); W = max(xs) + 1536 - X0; H = max(ys) + 1024 - Y0
    acc = np.zeros((H, W, 3)); wsum = np.zeros((H, W))
    for k, (ox, oy) in LAYOUT.items():
        im = np.asarray(Image.open(os.path.join(P, k + '.png')).convert('RGB'), float)
        h, w = im.shape[:2]
        yy, xx = np.mgrid[0:h, 0:w]
        d = np.minimum(np.minimum(xx, w - 1 - xx), np.minimum(yy, h - 1 - yy)).astype(float)
        wt = np.exp(np.minimum(d, 600) / SHARP - 60)
        x, y = ox - X0, oy - Y0
        acc[y:y + h, x:x + w] += im * wt[..., None]; wsum[y:y + h, x:x + w] += wt
    cov = wsum > 0
    out = np.zeros((H, W, 4), np.uint8)
    out[..., :3][cov] = (acc[cov] / wsum[cov][:, None]).clip(0, 255).astype(np.uint8)
    out[..., 3][cov] = 255
    return Image.fromarray(out, 'RGBA'), (X0, Y0)

if __name__ == '__main__':
    im, org = build()
    im.save(os.path.join(P, 'town_composite.png')); print(im.size, org)

# ---------------- walk mask ----------------
CELL = 8
# manual walkable additions in composite px: capsules (x0,y0,x1,y1,r) — gaps through fences, the bridge, lot entrances
WALK_ADD = [
    (1860, 1720, 2300, 1880, 44), (2300, 1880, 2520, 2042, 36),          # stone bridge + road beyond
    (1700, 1200, 1800, 1200, 30),                                         # lot west of the south road
    (1960, 1240, 2060, 1240, 30), (2300, 1290, 2300, 1480, 30),          # east lots
    (800, 340, 940, 340, 26), (800, 600, 940, 560, 26), (840, 880, 940, 860, 26),
    (1800, 360, 1800, 440, 26),
]
WALK_CUT = []  # (x0,y0,x1,y1,r) forced blocked

def capsule_mask(shape, caps, scale):
    H, W = shape; yy, xx = np.mgrid[0:H, 0:W]; cx = (xx + 0.5) * scale; cy = (yy + 0.5) * scale
    m = np.zeros(shape, bool)
    for x0, y0, x1, y1, r in caps:
        dx, dy = x1 - x0, y1 - y0; L = dx * dx + dy * dy or 1
        t = np.clip(((cx - x0) * dx + (cy - y0) * dy) / L, 0, 1)
        m |= np.hypot(cx - x0 - t * dx, cy - y0 - t * dy) <= r
    return m

def walk_mask(im):
    from scipy import ndimage as nd
    a = np.asarray(im); al = a[..., 3] > 0
    hsv = np.asarray(im.convert('RGB').convert('HSV')).astype(float)
    H = hsv[..., 0] * 360 / 255; S = hsv[..., 1] / 255; V = hsv[..., 2] / 255
    dirt = (H >= 15) & (H <= 38) & (S >= 0.3) & (S <= 0.68) & (V >= 0.5)
    grass = (H >= 38) & (H <= 80) & (S >= 0.35) & (V >= 0.38) & (V <= 0.8)
    cob = (S < 0.22) & (V >= 0.42) & (V <= 0.78)
    g = (dirt | grass | cob) & al
    h, w = g.shape; Hc, Wc = -(-h // CELL), -(-w // CELL)
    gp = np.zeros((Hc * CELL, Wc * CELL), bool); gp[:h, :w] = g
    gc = gp.reshape(Hc, CELL, Wc, CELL).mean((1, 3))
    m = gc > 0.45
    m = nd.binary_closing(m, iterations=1); m = nd.binary_opening(m, iterations=1)
    lab, n = nd.label(m); sz = nd.sum(m, lab, range(1, n + 1))
    m = np.isin(lab, [i + 1 for i, s in enumerate(sz) if s >= 300])
    m |= capsule_mask(m.shape, WALK_ADD, CELL)
    if WALK_CUT: m &= ~capsule_mask(m.shape, WALK_CUT, CELL)
    cov = np.zeros((Hc * CELL, Wc * CELL), bool); cov[:h, :w] = al
    m &= cov.reshape(Hc, CELL, Wc, CELL).mean((1, 3)) > 0.99
    # keep only the region reachable from the plaza
    lab, n = nd.label(m); start = lab[660 // CELL, 1860 // CELL + 1112 // CELL - 1112 // CELL]
    return m, lab, start

def rle(bits):
    out, cur, run = [], 0, 0
    for b in bits:
        if b == cur: run += 1
        else: out.append(run); cur, run = b, 1
    out.append(run); return out

# ---------------- buildings (3 levels per sheet) ----------------
def bld_sheet(path):
    import sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from sprite_tools import remove_white_bg, components, clean_edges
    im = remove_white_bg(Image.open(path), holes=600)
    a = np.asarray(im).copy(); a = clean_edges(a); im = Image.fromarray(a, 'RGBA')
    bx = sorted(components(im, gap=4, min_area=4000), key=lambda b: b[0])[:3]
    out = []
    for b in bx:
        sp = im.crop(tuple(int(v) for v in b[:4]))
        al = np.asarray(sp)[..., 3] > 0; h, w = al.shape
        ys, xs = np.nonzero(al[int(h * 0.75):]); pw = xs.max() - xs.min()
        cx = (xs.max() + xs.min()) / 2; bottom = int(np.nonzero(al.any(1))[0].max())
        ry = pw * 0.27; rx = pw * 0.5
        base = int(bottom - ry * 0.55)
        out.append((sp, None, dict(w=w, h=h, base=base, cx=round(cx), cy=round(bottom - ry), rx=round(rx), ry=round(ry))))
    return out

def export_town():
    from PIL import Image as I
    OUT = os.path.join(ROOT, 'src', 'assets', 'plates'); os.makedirs(OUT, exist_ok=True)
    im, (X0, Y0) = build()
    im.save(os.path.join(OUT, 'town.webp'), lossless=True, quality=100, method=4)
    m, lab, _ = walk_mask(im)
    reach = lab == lab[660 // CELL, 1860 // CELL]
    meta = dict(cell=CELL, w=m.shape[1], h=m.shape[0], pw=im.width, ph=im.height, walk=rle(reach.ravel().astype(int).tolist()),
                occ=rle((~m).ravel().astype(int).tolist()), start=[1860, 700], blds={})
    for code, key in (('BD1', 'townhall'), ('BD2', 'house'), ('BD3', 'lumber')):
        for i, (sp, body, md) in enumerate(bld_sheet(os.path.join(ROOT, 'art-source', 'bld', code + '.png'))):
            sp.save(os.path.join(OUT, f'pb_{key}_{i}.webp'), lossless=True, quality=100, method=4)
            meta['blds'][f'{key}_{i}'] = md
    json.dump(meta, open(os.path.join(OUT, 'town.json'), 'w'))
    print('town', im.size, 'walk cells', int(reach.sum()), 'blds', list(meta['blds']))

if __name__ == '__main__' and os.environ.get('EXPORT'):
    export_town()
