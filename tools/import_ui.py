"""Slice the Director's UI kit (art-source/pending/ui) into game textures -> src/assets/ui/*.webp + meta.json.
Stored at 3x of the UI's virtual pixels (UI scene is 400 virtual px tall) so it stays sharp on phones.
python3 tools/import_ui.py"""
import os, sys, json, colorsys
sys.path.insert(0, os.path.dirname(__file__))
import numpy as np
from PIL import Image
from sprite_tools import remove_white_bg, components, order_rows, clean_edges

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art-source', 'pending', 'ui')
OUT = os.path.join(ROOT, 'src', 'assets', 'ui')
os.makedirs(OUT, exist_ok=True)
for f in os.listdir(OUT): os.remove(os.path.join(OUT, f))
meta = {}
K = 3

def load(n, holes=400): return remove_white_bg(Image.open(os.path.join(SRC, n + '.png')), holes=holes)

def down(img, w=None, h=None):
    """premultiplied resize keeping soft alpha edges clean"""
    W, H = img.size
    if w and not h: h = max(1, round(H * w / W))
    if h and not w: w = max(1, round(W * h / H))
    a = np.asarray(img.convert('RGBA')).astype(np.float32); al = a[..., 3:4] / 255
    pre = Image.fromarray(np.concatenate([a[..., :3] * al, a[..., 3:4]], 2).astype(np.uint8), 'RGBA').resize((w, h), Image.LANCZOS)
    s = np.asarray(pre).astype(np.float32); A = s[..., 3:4]
    rgb = np.where(A > 0, s[..., :3] * 255 / np.maximum(A, 1), 0)
    out = np.concatenate([np.clip(rgb, 0, 255), np.where(A > 120, 255, 0)], 2).astype(np.uint8)
    return Image.fromarray(clean_edges(out, 2), 'RGBA')

def trim(img, thr=100):
    al = np.asarray(img)[..., 3]; ys, xs = np.nonzero(al > thr)
    return img.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)) if len(xs) else img

def save(img, name, **m):
    img.save(os.path.join(OUT, name + '.webp'), 'WEBP', lossless=True, quality=100, method=6, exact=True)
    meta[name] = {'w': img.width, 'h': img.height, **m}

def pieces(img, gap=6, min_area=300, row_tol=60):
    return [img.crop(tuple(int(v) for v in b[:4])) for b in order_rows(components(img, gap=gap, min_area=min_area), row_tol=row_tol)]

# ---- panel (9-slice composite: corners + plain edge strips + leather) ----
pan = load('panel_9slice')
P = {n: pan.crop(b) for n, b in {
    'tl': (36, 28, 376, 380), 'tr': (884, 28, 1224, 380), 'bl': (36, 880, 376, 1216), 'br': (884, 880, 1224, 1216),
    't': (420, 48, 836, 224), 'b': (420, 1036, 836, 1204), 'l': (52, 420, 208, 836), 'r': (1048, 420, 1208, 836), 'c': (416, 416, 844, 840)}.items()}
S = 0.27  # source -> 3x texture
# Edge strips are cut from the corners' own arms so every join is seamless; the leather is a separate tile.
cw = round(340 * S); mid = 24; T = cw * 2 + mid
tex = Image.new('RGBA', (T, T), (0, 0, 0, 0))
C = {k: down(P[k], cw, cw) for k in ('tl', 'tr', 'bl', 'br')}
def arm(img, side):
    w, h = img.size
    if side == 'right': return img.crop((w - 3, 0, w - 1, h))
    if side == 'left': return img.crop((1, 0, 3, h))
    if side == 'bottom': return img.crop((0, h - 3, w, h - 1))
    return img.crop((0, 1, w, 3))
tex.alpha_composite(arm(C['tl'], 'right').resize((mid + 2, cw), Image.NEAREST), (cw - 1, 0))
tex.alpha_composite(arm(C['bl'], 'right').resize((mid + 2, cw), Image.NEAREST), (cw - 1, T - cw))
tex.alpha_composite(arm(C['tl'], 'bottom').resize((cw, mid + 2), Image.NEAREST), (0, cw - 1))
tex.alpha_composite(arm(C['tr'], 'bottom').resize((cw, mid + 2), Image.NEAREST), (T - cw, cw - 1))
for k, (x, y) in {'tl': (0, 0), 'tr': (T - cw, 0), 'bl': (0, T - cw), 'br': (T - cw, T - cw)}.items(): tex.alpha_composite(C[k], (x, y))
save(tex, 'panel', slice=cw, inset=round(150 * S))
lc = P['c']; lw, lh = lc.size
save(down(lc.crop((70, 70, lw - 70, lh - 70)), 240, 240), 'leather')
save(down(P['t'].crop((140, 0, 276, P['t'].height)), h=round(176 * S)), 'panel_gem')

# ---- buttons: left cap + plain middle + right cap (3-slice) and the gem ornament ----
for i, b in enumerate(pieces(load('buttons6'))):
    bw, bh = b.size
    capw = round(bw * 0.17)
    plain = b.crop((capw + 10, 0, capw + 40, bh))
    h3 = 72; sc = h3 / bh
    capL = down(b.crop((0, 0, capw, bh)), round(capw * sc), h3); capR = down(b.crop((bw - capw, 0, bw, bh)), round(capw * sc), h3)
    m = down(plain, 12, h3)
    t = Image.new('RGBA', (capL.width + 12 + capR.width, h3)); t.alpha_composite(capL, (0, 0)); t.alpha_composite(m, (capL.width, 0)); t.alpha_composite(capR, (capL.width + 12, 0))
    save(t, f'btn{i}', cap=capL.width)
    gem = b.crop((round(bw / 2 - bw * 0.2), 0, round(bw / 2 + bw * 0.2), bh))
    save(down(gem, h=h3), f'btn{i}_gem')

# ---- bars: full and empty versions + tube range ----
bars = load('bars_hp_mp_exp_boss')
hues = {'hp': lambda h: h < 22 or h > 335, 'mp': lambda h: 180 <= h <= 245, 'exp': lambda h: 245 <= h <= 315, 'boss': lambda h: h < 22 or h > 335}
for name, box in zip(['hp', 'mp', 'exp', 'boss'], [(100, 20, 1664, 208), (100, 216, 1664, 404), (100, 420, 1664, 608), (28, 620, 1752, 876)]):
    b = bars.crop(box); a = np.asarray(b).astype(np.float32)
    H, W = a.shape[:2]
    rgb = a[..., :3] / 255
    mx, mn = rgb.max(2), rgb.min(2); l = (mx + mn) / 2
    sat = np.where(mx - mn == 0, 0, (mx - mn) / (1 - np.abs(2 * l - 1) + 1e-6))
    r, g, bb = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    hue = np.degrees(np.arctan2(np.sqrt(3) * (g - bb), 2 * r - g - bb)) % 360
    liquid = np.vectorize(hues[name])(hue) & (sat > 0.45) & (a[..., 3] > 0)
    cols = np.nonzero(liquid[H // 2 - 8:H // 2 + 8].any(0))[0]
    cols = cols[(cols > W * (0.2 if name == 'boss' else 0.17)) & (cols < W * 0.89)]
    # tube = longest run of liquid columns
    runs = []; s = cols[0]; p = cols[0]
    for c in cols[1:]:
        if c > p + 12: runs.append((s, p)); s = c
        p = c
    runs.append((s, p)); x0, x1 = max(runs, key=lambda q: q[1] - q[0])
    rows = np.nonzero(liquid[:, x0:x1].mean(1) > 0.3)[0]; y0, y1 = rows[0], rows[-1]
    tube = np.zeros_like(liquid); tube[y0:y1 + 1, x0:x1 + 1] = True
    m = liquid & tube
    empty = a.copy()
    lum = (0.3 * a[..., 0] + 0.59 * a[..., 1] + 0.11 * a[..., 2])
    for k, v in enumerate([0.22, 0.12, 0.13]): empty[..., k] = np.where(m, lum * v + 8, a[..., k])
    tw = 600 if name != 'boss' else 660
    sc = tw / W
    save(down(b, tw), f'bar_{name}', x0=round(x0 * sc), x1=round(x1 * sc))
    save(down(Image.fromarray(empty.astype(np.uint8), 'RGBA'), tw), f'bar_{name}_empty')

# ---- slots (rarity frames) ----
for i, s in enumerate(pieces(load('item_slots_rarity6'))): save(down(s, 96), f'slot{i}')
# ---- icons ----
for i, s in enumerate(pieces(load('hud_icons10'))): save(down(s, 90), f'hud{i}')
for i, s in enumerate(pieces(load('res_icons8'))): save(down(s, 54), f'res{i}')
for i, s in enumerate(pieces(load('skill_icons8'))): save(down(s, 120), f'skill{i}')
fr = []
for s0 in pieces(load('frames_rings')):
    al = np.asarray(s0)[..., 3] > 100; col = al.any(0); xs = np.nonzero(col)[0]
    gaps = [x for x in range(xs[0], xs[-1]) if not col[x]]
    if gaps:
        # split merged pieces at the widest empty column run
        runs = []; st = gaps[0]; pv = gaps[0]
        for g in gaps[1:]:
            if g > pv + 1: runs.append((st, pv)); st = g
            pv = g
        runs.append((st, pv)); g0, g1 = max(runs, key=lambda r: r[1] - r[0])
        fr += [trim(s0.crop((0, 0, g0, s0.height))), trim(s0.crop((g1 + 1, 0, s0.width, s0.height)))]
    elif not fr and s0.width > s0.height * 1.5:
        cut = int(s0.width * 0.545); fr += [trim(s0.crop((0, 0, cut, s0.height))), trim(s0.crop((cut, 0, s0.width, s0.height)))]
    else: fr.append(s0)
for i, s in enumerate(fr): save(trim(down(trim(s), h=150)), f'ring{i}')
# ---- banners: split by empty rows ----
ban = load('banners4'); al = np.asarray(ban)[..., 3] > 0
cnt = al.sum(1); Hh = len(cnt); cuts = [0]
for f in (0.25, 0.5, 0.75):
    lo, hi = int(Hh * (f - 0.08)), int(Hh * (f + 0.08)); cuts.append(lo + int(np.argmin(cnt[lo:hi])))
cuts.append(Hh); rows = list(zip(cuts[:-1], cuts[1:]))
for i, (y0, y1) in enumerate(rows):
    c = ban.crop((0, y0, ban.width, y1)); c = c.crop(c.getbbox()); save(down(c, 600), f'banner{i}')
json.dump(meta, open(os.path.join(OUT, 'meta.json'), 'w'))
print(len(meta), 'ui textures', sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT)), 'bytes', 'banners', len(rows))
