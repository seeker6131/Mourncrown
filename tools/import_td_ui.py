"""PixelLab UI pieces (art-source/pixellab/ui, from tools/gen_ui.py) -> src/assets/ui/*.webp + meta.json,
replacing the old ornate gold skin with a dark-oak / iron one that matches the top-down forest look.
Pixel art is enlarged x2 with nearest-neighbour (the UI draws textures at 1/3 scale, see src/ui/skin.ts)."""
import os, json, random, colorsys
from PIL import Image, ImageDraw
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art-source', 'pixellab', 'ui'); OUT = os.path.join(ROOT, 'src', 'assets', 'ui')
META = json.load(open(os.path.join(OUT, 'meta.json')))
K = 2
def load(n): return Image.open(os.path.join(SRC, n + '.png')).convert('RGBA')
def crop(im): return im.crop(im.getbbox())
def big(im, k=K): return im.resize((im.width * k, im.height * k), Image.NEAREST)
def save(im, name, **m):
    im.save(os.path.join(OUT, name + '.webp'), lossless=True)
    META[name] = {'w': im.width, 'h': im.height, **m}

def key_out(im, seeds, tol=10):
    """flood-fill the flat background colour from the seed points to transparent"""
    px = im.load(); w, h = im.size
    for sx, sy in seeds:
        ref = px[sx, sy]
        if ref[3] == 0: continue
        st = [(sx, sy)]; seen = set()
        while st:
            x, y = st.pop()
            if (x, y) in seen or not (0 <= x < w and 0 <= y < h): continue
            seen.add((x, y)); p = px[x, y]
            if p[3] == 0 or max(abs(p[i] - ref[i]) for i in range(3)) > tol: continue
            px[x, y] = (0, 0, 0, 0)
            st += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    return im

# --- window frame (9-slice) ---
p = load('panel'); w, h = p.size
p = crop(key_out(p, [(1, 1), (w - 2, 1), (1, h - 2), (w - 2, h - 2), (w // 2, h // 2)]))
a = p.load(); mid = p.height // 2
def run_end(get, n):   # index where the first opaque run ends
    i = next(k for k in range(n) if get(k)[3] > 0)
    return next(k for k in range(i, n) if get(k)[3] == 0)
t = run_end(lambda k: a[k, mid], p.width)                 # left plank inner edge
ytop = run_end(lambda k: a[p.width // 2, k], p.height)    # top plank inner edge
br = run_end(lambda k: a[k, 2], p.width)                  # corner bracket width
pb = big(p); save(pb, 'panel', slice=max(br, ytop, t) * K + 2, inset=max(t, ytop) * K)
# --- background: dark worn wood/leather, tileable by construction ---
random.seed(3); T = 96; lt = Image.new('RGBA', (T, T)); q = lt.load()
for y in range(T):
    for x in range(T):
        n = random.random() * 6 + ((x * 7 + y * 3) % 11 == 0) * 4
        q[x, y] = (int(34 + n), int(26 + n * 0.8), int(20 + n * 0.6), 255)
save(lt, 'leather')
# --- buttons: one oak plate recoloured into the 6 colour families kitUI uses ---
b = crop(load('btn')); bw = b.width
ab = b.load(); cy = b.height // 2
cap = next((x for x in range(4, bw // 2) if colorsys.rgb_to_hsv(*[c / 255 for c in ab[x, cy][:3]])[1] > 0.3), 12)
FAM = {0: None, 1: (0.10, 1.25), 2: (0.0, 0.0), 3: (0.30, 0.9), 4: (0.0, 1.1), 5: (0.68, 0.9)}
for n, f in FAM.items():
    im = b.copy(); px = im.load()
    if f is not None:
        for y in range(im.height):
            for x in range(im.width):
                r, g, bb, al = px[x, y]
                if al == 0: continue
                hh, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, bb / 255)
                if s < 0.25: continue          # iron caps / rivets stay as they are
                if f == (0.0, 0.0): s, v = 0.05, v * 0.75
                else: hh, s = f[0], min(1, s * f[1])
                r, g, bb = colorsys.hsv_to_rgb(hh, s, v); px[x, y] = (int(r * 255), int(g * 255), int(bb * 255), al)
    save(big(im), f'btn{n}', cap=max(cap + 2, 14) * K)
    save(Image.new('RGBA', (4, 4)), f'btn{n}_gem')
# --- item slots: iron frame, rarity colour line inside ---
RC = [0xd8d4c8, 0x6fe07a, 0x5aa8ff, 0xc77dff, 0xffa53a, 0xff4a5a]
s0 = crop(load('slot'))
for n in range(6):
    im = s0.copy()
    if n:
        c = RC[n - 1]; col = ((c >> 16) & 255, (c >> 8) & 255, c & 255, 255)
        ImageDraw.Draw(im).rectangle([4, 4, im.width - 5, im.height - 5], outline=col, width=2)
    save(big(im), f'slot{n}')
# --- portrait ring, banners, icons ---
r = crop(load('ring'))
for n in range(6): save(big(r), f'ring{n}')
bn = crop(load('banner'))
for n in range(4): save(big(bn), f'banner{n}')
for n, k in enumerate(['ic_bag', 'ic_hero', 'ic_scroll', 'ic_gear', 'ic_full']): save(big(crop(load(k))), f'hud{n}')
for n, k in enumerate(['ic_gold', 'ic_wood', 'ic_stone', 'ic_food']): save(big(crop(load(k))), f'res{n}')
save(big(crop(load('ic_build'))), 'build')
bar = crop(load('bar')); save(big(bar), 'frame_bar')
json.dump(META, open(os.path.join(OUT, 'meta.json'), 'w'))
print({k: META[k] for k in ['panel', 'btn0', 'slot0', 'ring0', 'banner0', 'hud0', 'res0', 'build', 'frame_bar']})
