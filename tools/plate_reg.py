"""Find the offset of plate B relative to plate A (B origin = A origin + (dx,dy)) by matching their overlap.
usage: python3 tools/plate_reg.py A.png B.png  [side: right|below|any]"""
import sys, numpy as np
from PIL import Image

def load(p, s):
    im = Image.open(p).convert('L'); return np.asarray(im.resize((im.width // s, im.height // s), Image.BOX), float)

def score(a, b, dx, dy, min_ov):
    H, W = a.shape
    x0, x1 = max(0, dx), min(W, b.shape[1] + dx); y0, y1 = max(0, dy), min(H, b.shape[0] + dy)
    if x1 - x0 < min_ov[0] or y1 - y0 < min_ov[1]: return 1e9
    return np.abs(a[y0:y1, x0:x1] - b[y0 - dy:y1 - dy, x0 - dx:x1 - dx]).mean()

def register(pa, pb, side='any'):
    s = 8; a = load(pa, s); b = load(pb, s); H, W = a.shape
    rng_x = range(-W + 8, W - 7); rng_y = range(-H + 8, H - 7)
    if side == 'right': rng_x = range(W // 3, W - 4); rng_y = range(-H // 4, H // 4)
    if side == 'below': rng_x = range(-W // 4, W // 4); rng_y = range(H // 3, H - 4)
    best = min(((score(a, b, dx, dy, (6, 6)), dx, dy) for dx in rng_x for dy in rng_y))
    _, dx, dy = best
    for s2 in (4, 2, 1):
        a = load(pa, s2); b = load(pb, s2); f = s // s2
        cand = [(score(a, b, X, Y, (12, 12)), X, Y) for X in range(dx * f - f, dx * f + f + 1) for Y in range(dy * f - f, dy * f + f + 1)]
        e, dx, dy = min(cand); s = s2
    return dx, dy, e

if __name__ == '__main__':
    print(register(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else 'any'))
