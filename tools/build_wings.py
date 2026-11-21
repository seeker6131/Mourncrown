"""🪽 Wings for the game (director 14 Nov): every approved front picture (art-source/pixellab/wings/<id>_s.png) becomes one
sheet — 5 directions (s, se, e, ne, n; the west side is the east side mirrored in the game) x 4 flap poses (each wing
turns round its root: 0, 14, 28, 14 degrees). The middle (where a back / an animal body would be) is cut away, so only
the two wings are left. Output: src/assets/td/wings/<id>.webp + src/assets/td/wings/wings.json.
python3 -I tools/build_wings.py"""
import os, json
from PIL import Image, ImageDraw, ImageEnhance

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art-source', 'pixellab', 'wings')
OUT = os.path.join(ROOT, 'src', 'assets', 'td', 'wings'); os.makedirs(OUT, exist_ok=True)
IDS = ['legend', 'l_hawk', 'l_fairy', 'l_bat', 'l_leaf', 'sl', 's_ice', 's_dragon', 's_moon', 's_gold', 'ltd', 'x_cosmos', 'x_fallen']
DIRS = ['s', 'se', 'e', 'ne', 'n']
ANG = [0, 14, 28, 14]

def clean(im, keep=60):
    """drop little islands of pixels (left over after the cut)"""
    w, h = im.size; px = im.load(); seen = set()
    for y in range(h):
        for x in range(w):
            if px[x, y][3] < 20 or (x, y) in seen: continue
            st = [(x, y)]; comp = []; seen.add((x, y))
            while st:
                a, b = st.pop(); comp.append((a, b))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    n = (a + dx, b + dy)
                    if 0 <= n[0] < w and 0 <= n[1] < h and n not in seen and px[n][3] >= 20: seen.add(n); st.append(n)
            if len(comp) < keep:
                for p in comp: px[p] = (0, 0, 0, 0)
    return im

def cut_middle(w):
    """the two wings only: a narrow V out of the middle (wider at the bottom)"""
    w = w.crop(w.getbbox()); W, H = w.size; a = w.getchannel('A'); d = ImageDraw.Draw(a); cx = W / 2
    d.polygon([(cx - W * 0.05, 0), (cx + W * 0.05, 0), (cx + W * 0.13, H), (cx - W * 0.13, H)], fill=0)
    w.putalpha(a); return clean(w)

def flap(w, a):
    W, H = w.size; L = w.crop((0, 0, W // 2, H)); R = w.crop((W // 2, 0, W, H)); pad = 24
    o = Image.new('RGBA', (W + pad * 2, H + pad * 2))
    for half, x0, root, sgn in ((L, 0, (W // 2, int(H * 0.3)), -1), (R, W // 2, (0, int(H * 0.3)), 1)):   # (tips go DOWN on the beat)
        c = Image.new('RGBA', o.size); c.alpha_composite(half, (pad + x0, pad))
        o.alpha_composite(c.rotate(sgn * a, resample=Image.NEAREST, center=(pad + x0 + root[0], pad + root[1])))
    sy = 1 - a / 180; o2 = o.resize((o.width, int(o.height * sy)), Image.NEAREST)
    f = Image.new('RGBA', o.size); f.alpha_composite(o2, (0, int(pad * (1 - sy)) + int(o.height * (1 - sy) * 0.3)))
    return f, (o.width // 2, pad + int(H * 0.5))   # (and where the middle of the back is)

def dark(im, f):
    return Image.merge('RGBA', (*ImageEnhance.Brightness(im.convert('RGB')).enhance(f).split(), im.getchannel('A')))

def view(f, mid, d):
    """a flap pose -> the picture for direction d; returns the picture, where the back's middle is in it, in front of the body?"""
    W, H = f.size; mx, my = mid; L = f.crop((0, 0, mx, H)); R = f.crop((mx, 0, W, H))
    sq = lambda im, k: im.resize((max(1, int(im.width * k)), H), Image.NEAREST)
    if d == 's': return f, mid, False
    if d == 'n':
        g = dark(f, 0.85); a = g.getchannel('A'); bw = (f.getbbox()[2] - f.getbbox()[0]) * 0.5
        ImageDraw.Draw(a).polygon([(mx - bw * 0.18, my - H * 0.1), (mx + bw * 0.18, my - H * 0.1), (mx + bw * 0.55, H), (mx - bw * 0.55, H)], fill=0); g.putalpha(a)
        return g, mid, True
    r2 = sq(R, 0.5)
    if d == 'se':
        o = Image.new('RGBA', (L.width + r2.width, H)); o.alpha_composite(L, (0, 0)); o.alpha_composite(dark(r2, 0.72), (L.width, 0)); return o, (mx, my), False
    if d == 'ne':
        o = Image.new('RGBA', (L.width + r2.width, H)); o.alpha_composite(dark(L, 0.85), (0, 0)); o.alpha_composite(dark(r2, 0.62), (L.width, 0))
        a = o.getchannel('A'); bw = (f.getbbox()[2] - f.getbbox()[0]) * 0.5
        ImageDraw.Draw(a).polygon([(mx - bw * 0.1, my - H * 0.1), (mx + bw * 0.3, my - H * 0.1), (mx + bw * 0.45, H), (mx - bw * 0.35, H)], fill=0); o.putalpha(a)
        return o, (mx, my), True
    # e: both wings sweep back (to the left); the far one darker and smaller behind
    far = dark(sq(L, 0.75), 0.6); o = Image.new('RGBA', (L.width + 4, H)); o.alpha_composite(far, (L.width - far.width + 4, 0)); o.alpha_composite(L, (0, 2))
    return o, (L.width, my), False

def build():
    meta = {}
    for wid in IDS:
        p = os.path.join(SRC, f'{wid}_s.png')
        if not os.path.exists(p): print('missing', wid); continue
        base = cut_middle(Image.open(p).convert('RGBA'))
        cells = []
        for d in DIRS:
            for a in ANG:
                f, mid = flap(base, a); v, m, front = view(f, mid, d)
                bb = v.getbbox(); v = v.crop(bb); m = (m[0] - bb[0], m[1] - bb[1]); cells.append((v, m, front))
        cw = max(c[0].width for c in cells) + 2; ch = max(c[0].height for c in cells) + 2
        sheet = Image.new('RGBA', (cw * len(ANG), ch * len(DIRS))); anch = {}
        for i, (v, m, front) in enumerate(cells):
            d, k = DIRS[i // len(ANG)], i % len(ANG)
            sheet.alpha_composite(v, (k * cw + 1, (i // len(ANG)) * ch + 1))
            anch.setdefault(d, {'front': front, 'mid': []})['mid'].append([m[0] + 1, m[1] + 1])
        sheet.save(os.path.join(OUT, f'{wid}.webp'), lossless=True)
        meta[wid] = {'cw': cw, 'ch': ch, 'w': base.width, 'frames': len(ANG), 'dirs': DIRS, 'a': anch}
        print(wid, sheet.size)
    json.dump(meta, open(os.path.join(OUT, 'wings.json'), 'w'), separators=(',', ':'))

if __name__ == '__main__':
    build()
