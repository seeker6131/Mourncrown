"""Legend / SL icons recoloured from the Super Rare art (PixelLab quota ran out): Legend = gold, SL = crimson-violet with
white-hot highlights and sparkles; plus a plain Common charm. python3 -I tools/make_tier_icons.py"""
import os
from PIL import Image
D = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'src', 'assets', 'icons')
def ramp(stops, t):
    for i in range(len(stops) - 1):
        a, b = stops[i], stops[i + 1]
        if t <= b[0]: f = (t - a[0]) / max(1e-6, b[0] - a[0]); return tuple(int(a[1][k] + (b[1][k] - a[1][k]) * f) for k in range(3))
    return stops[-1][1]
GOLD = [(0, (40, 18, 4)), (.35, (150, 80, 10)), (.65, (240, 180, 40)), (.85, (255, 235, 140)), (1, (255, 255, 230))]
SL = [(0, (30, 0, 20)), (.3, (140, 10, 50)), (.55, (230, 40, 70)), (.75, (255, 120, 200)), (.9, (255, 220, 255)), (1, (255, 255, 255))]
GREY = [(0, (30, 24, 18)), (.5, (120, 96, 70)), (1, (220, 200, 170))]
def recolor(src, dst, stops, sparkle=False, boost=1.15):
    im = Image.open(os.path.join(D, src + '.webp')).convert('RGBA'); px = im.load(); w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if not a: continue
            l = min(1, (0.3 * r + 0.59 * g + 0.11 * b) / 255 * boost); px[x, y] = (*ramp(stops, l), a)
    if sparkle:   # little 4-point stars around the item
        for (sx, sy) in [(int(w * .18), int(h * .2)), (int(w * .82), int(h * .3)), (int(w * .75), int(h * .82))]:
            for dx, dy in [(0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)]:
                if 0 <= sx + dx < w and 0 <= sy + dy < h: px[sx + dx, sy + dy] = (255, 255, 255, 255)
    im.save(os.path.join(D, dst + '.webp'), lossless=True)
for base, n in [('sword3', 'sword'), ('staff3', 'staff'), ('bow3', 'bow'), ('hammer3', 'hammer'), ('armor3', 'armor'), ('gem0', 'gem')]:
    recolor(base, n + '4', GOLD); recolor(base, n + '5', SL, sparkle=True)
recolor('ring0', 'ring_c', GREY, boost=1.0)
print('ok')
