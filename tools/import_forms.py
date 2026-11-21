"""Import the Director's character-form sheets (art-source/forms/<CODE><suffix>.png) into game strips.

python3 tools/import_forms.py  ->  public/forms/<CODE>_<anim>.png + public/forms/meta.json
Suffixes: '' idle(4), w walk(6), u walkup(6), a attack(5), k skill(4), d die(5).

Quality steps (the Director complained about white fringes):
  * background removal by flood fill from the border + enclosed white pockets
  * de-fringe: peel near-white, low-saturation edge pixels (2 passes) and recolour remaining edge
    pixels from their darker neighbours, then a hard alpha cut
  * every frame of a form is scaled with ONE scale (from the idle sheet) so sizes never pop
  * frames are anchored on the feet (or torso for walk cycles) and bottom-aligned so cycles don't jitter
"""
import os, sys, json
sys.path.insert(0, os.path.dirname(__file__))
import numpy as np
from PIL import Image
from collections import deque
from sprite_tools import clean_edges

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art-source', 'forms')
OUT = os.path.join(ROOT, 'src', 'assets', 'forms')
os.makedirs(OUT, exist_ok=True)

R = 3            # texture px per world px
HERO_H = 32      # standing height in world px
ANIMS = [('', 'idle', 4), ('w', 'walk', 6), ('u', 'walkup', 6), ('a', 'attack', 5), ('k', 'skill', 4), ('d', 'die', 5), ('c', 'chop', 4), ('m', 'mine', 4)]
FORMS = ['V0', 'S2', 'S3', 'S4', 'A2', 'A3', 'A4', 'M2', 'M3', 'M4', 'T2', 'T3', 'T4']


def remove_bg(im):
    a = np.asarray(im.convert('RGB')).astype(np.int16)
    h, w, _ = a.shape
    mn, mx = a.min(2), a.max(2)
    bg = (mn >= 228) & ((mx - mn) <= 30)
    mask = np.zeros((h, w), bool)
    q = deque([(y, x) for x in range(w) for y in (0, h - 1) if bg[y, x]] + [(y, x) for y in range(h) for x in (0, w - 1) if bg[y, x]])
    while q:
        y, x = q.popleft()
        if mask[y, x]: continue
        mask[y, x] = True
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not mask[ny, nx] and bg[ny, nx]: q.append((ny, nx))
    # enclosed white pockets (between legs / bow string) larger than eye-whites
    seen = mask.copy()
    ys, xs = np.nonzero(bg & ~mask)
    for y0, x0 in zip(ys, xs):
        if seen[y0, x0]: continue
        reg = []; q = deque([(y0, x0)]); seen[y0, x0] = True
        while q:
            y, x = q.popleft(); reg.append((y, x))
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w and not seen[ny, nx] and bg[ny, nx]:
                    seen[ny, nx] = True; q.append((ny, nx))
        if len(reg) > 900:
            for y, x in reg: mask[y, x] = True
    alpha = np.where(mask, 0, 255).astype(np.uint8)
    return np.dstack([a.astype(np.uint8), alpha])


def defringe(arr, passes=2):
    """Peel whitish edge pixels touching transparency."""
    a = arr.copy()
    for _ in range(passes):
        al = a[:, :, 3] > 0
        pad = np.pad(al, 1)
        nb_t = ~(pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:])
        rgb = a[:, :, :3].astype(np.int16)
        light = (rgb.min(2) > 175) & ((rgb.max(2) - rgb.min(2)) < 45)
        kill = al & nb_t & light
        a[kill, 3] = 0
    return a


def runs(occ, n, min_len=4):
    idx = np.nonzero(occ)[0]
    if not len(idx): return []
    segs = []; s = p = idx[0]
    for i in idx[1:]:
        if i > p + 1: segs.append([s, p]); s = i
        p = i
    segs.append([s, p])
    while len(segs) > n:
        # merge the smallest segment into its nearest neighbour, or the smallest gap
        widths = [b - a for a, b in segs]
        k = int(np.argmin(widths))
        if widths[k] < 40:
            if k == 0: j = 1
            elif k == len(segs) - 1: j = k - 1
            else: j = k - 1 if segs[k][0] - segs[k - 1][1] < segs[k + 1][0] - segs[k][1] else k + 1
        else:
            gaps = [segs[i + 1][0] - segs[i][1] for i in range(len(segs) - 1)]
            k = int(np.argmin(gaps)); j = k + 1
        a, b = min(k, j), max(k, j)
        segs[a] = [segs[a][0], segs[b][1]]; segs.pop(b)
    return segs


def frames_of(rgba, n):
    al = rgba[:, :, 3] > 40
    cols = runs(al.any(0), n)
    dens = al.sum(0)
    # frames joined by effects: split the widest segment at its thinnest column (middle part only)
    while len(cols) < n and cols:
        k = max(range(len(cols)), key=lambda i: cols[i][1] - cols[i][0])
        a, b = cols[k]
        w = b - a
        parts = round(w / (sum(c[1] - c[0] for c in cols) / (len(cols) + n - len(cols)) + 1e-6))
        lo, hi = a + int(w * (0.5 / max(2, parts) + 0.15)), a + int(w * (1 - 0.5 / max(2, parts) - 0.15))
        if parts <= 2 or hi <= lo: lo, hi = a + int(w * 0.3), a + int(w * 0.7)
        cut = lo + int(np.argmin(dens[lo:hi]))
        cols[k:k + 1] = [[a, cut], [cut + 1, b]]
    out = []
    for x0, x1 in cols:
        sub = rgba[:, x0:x1 + 1]
        m = sub[:, :, 3] > 40
        ys = np.nonzero(m.any(1))[0]
        out.append(sub[ys[0]:ys[-1] + 1])
    return out


def anchor_x(f, mode):
    m = f[:, :, 3] > 40
    h = m.shape[0]
    if mode == 'torso':
        band = m[int(h * 0.2):int(h * 0.6)]
    else:  # feet
        band = m[int(h * 0.85):]
    ys, xs = np.nonzero(band)
    if not len(xs): ys, xs = np.nonzero(m)
    return float(np.median(xs))


def downscale(f, s):
    h, w = f.shape[:2]
    nw, nh = max(1, round(w * s)), max(1, round(h * s))
    fl = f.astype(np.float32)
    al = fl[:, :, 3:4] / 255
    pre = Image.fromarray(np.concatenate([fl[:, :, :3] * al, fl[:, :, 3:4]], 2).astype(np.uint8), 'RGBA')
    small = np.asarray(pre.resize((nw, nh), Image.LANCZOS)).astype(np.float32)
    a = small[:, :, 3:4]
    rgb = np.where(a > 0, small[:, :, :3] * 255 / np.maximum(a, 1), 0)
    alpha = np.where(a > 128, 255, 0)
    out = np.concatenate([np.clip(rgb, 0, 255), alpha], 2).astype(np.uint8)
    return clean_edges(defringe(out, 1), 2)


def register(frames, ax, name):
    """Lock the head/torso in place across frames: find each frame's horizontal shift that best matches
    frame 0 (bottom-aligned), so capes/effects flaring sideways don't make the body slide."""
    H = max(f.shape[0] for f in frames)
    W = max(f.shape[1] for f in frames) + 40
    def canvas(f, x):
        c = np.zeros((H, W, 4), np.float32)
        y = H - f.shape[0]
        c[y:, x:x + f.shape[1]] = f
        return c
    lo, hi = int(H * 0.08), int(H * (0.55 if name != 'idle' else 0.7))
    ref = canvas(frames[0], 20)[lo:hi]
    refm = ref[:, :, 3] > 0
    refl = ref[:, :, :3].mean(2)
    base = 20 + ax[0]
    out = [ax[0]]
    for f in frames[1:]:
        best, bx = 1e18, 0
        for dx in range(-14, 15):
            x0 = int(round(base - ax[0])) if False else 20 + dx
            if x0 < 0 or x0 + f.shape[1] > W: continue
            c = canvas(f, x0)[lo:hi]
            m = c[:, :, 3] > 0
            both = m & refm
            cost = (m ^ refm).sum() * 60 + np.abs(c[:, :, :3].mean(2) - refl)[both].sum()
            if cost < best: best, bx = cost, x0
        # frame drawn at x=bx aligns with ref drawn at x=20 => its anchor = ax0 + (20 - bx)
        out.append(ax[0] + (20 - bx))
    return out


meta = {}
for form in FORMS:
    have = {suf: os.path.join(SRC, form + suf + '.png') for suf, _, _ in ANIMS if os.path.exists(os.path.join(SRC, form + suf + '.png'))}
    if '' not in have: continue
    sheets = {}
    for suf, name, n in ANIMS:
        if suf not in have: continue
        rgba = defringe(remove_bg(Image.open(have[suf])), 2)
        fr = frames_of(rgba, n)
        if len(fr) != n: print('skip', form, name, len(fr)); continue
        sheets[name] = fr
    # one scale per sheet, normalised to the standing height (median of standing frames)
    def stand_h(fr, name):
        hs = [f.shape[0] for f in fr]
        if name == 'die': return hs[0]
        return float(np.median(hs))
    ref = stand_h(sheets['idle'], 'idle')
    for name, fr in sheets.items():
        sh = stand_h(fr, name)
        # sheets drawn at a different size are brought to the idle size (effects can inflate, so clamp)
        k = ref / sh if 0.55 < ref / sh < 1.8 else 1.0
        s = HERO_H * R / ref * k
        mode = 'torso' if name in ('walk', 'walkup') else ('center' if name == 'die' else 'feet')
        small = [downscale(f, s) for f in fr]
        ax = []
        for f in small:
            if mode == 'center':
                m = f[:, :, 3] > 0; xs = np.nonzero(m.any(0))[0]; ax.append((xs[0] + xs[-1]) / 2)
            else: ax.append(anchor_x(f, mode))
        if name in ('idle', 'walk', 'walkup', 'skill'):
            ax = register(small, ax, name)
        left = int(np.ceil(max(ax))) + 2
        right = int(np.ceil(max(f.shape[1] - a for f, a in zip(small, ax)))) + 2
        H = max(f.shape[0] for f in small) + 2
        W = left + right
        strip = np.zeros((H, W * len(small), 4), np.uint8)
        for i, (f, a) in enumerate(zip(small, ax)):
            x = i * W + int(round(left - a)); y = H - 1 - f.shape[0]
            region = strip[y:y + f.shape[0], x:x + f.shape[1]]
            m = f[:, :, 3] > 0
            region[m] = f[m]
        Image.fromarray(strip, 'RGBA').save(os.path.join(OUT, f'{form}_{name}.png'), optimize=True)
        meta[f'{form}_{name}'] = {'w': W, 'h': H, 'n': len(small), 'ax': left, 'ay': H - 1}
    if os.path.exists(os.path.join(SRC, form + 'P.png')):
        p = Image.fromarray(defringe(remove_bg(Image.open(os.path.join(SRC, form + 'P.png'))), 2), 'RGBA')
        p = p.crop(p.getbbox())
        sc = min(160 / p.width, 160 / p.height)
        p = Image.fromarray(downscale(np.asarray(p), sc), 'RGBA')
        p.save(os.path.join(OUT, f'{form}_portrait.png'), optimize=True)
        meta[f'{form}_portrait'] = {'w': p.width, 'h': p.height, 'n': 1, 'ax': 0, 'ay': 0}
    print(form, sorted(k for k in sheets))

json.dump(meta, open(os.path.join(OUT, 'meta.json'), 'w'))
tot = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
print('files', len(os.listdir(OUT)), 'bytes', tot)
