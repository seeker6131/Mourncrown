"""Where the rider sits on each mount, per direction: found from the saddle's own colours in the imported idle sheet
(src/assets/td/<key>_idle.webp). Prints seat [x, y] (the hips' point in the frame) and the front parts (the animal's
head / neck facing us or to the side, its rump from behind) to paste into src/data/mounts.ts — then check in the game.
python3 -I tools/mount_seats.py mt_wolf ..."""
import os, sys, json, colorsys
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); TD = os.path.join(ROOT, 'src', 'assets', 'td')
MAN = json.load(open(os.path.join(TD, 'mounts.json')))
def hsv(p): return colorsys.rgb_to_hsv(p[0] / 255, p[1] / 255, p[2] / 255)
SADDLE = {   # colour rules of each saddle (the body around it is another colour)
    'mt_wolf': lambda h, s, v: 0.02 < h < 0.12 and s > 0.3 and 0.18 < v < 0.75,
    'mt_stag': lambda h, s, v: 0.02 < h < 0.12 and s > 0.35 and 0.2 < v < 0.8,
    'mt_bear': lambda h, s, v: 0.14 < h < 0.4 and s > 0.18 and v > 0.18,           # the green saddle cloth
    'mt_panther': lambda h, s, v: (h > 0.75 or h < 0.04) and s > 0.12 and v > 0.3,
    'mt_gdragon': lambda h, s, v: s < 0.2 and v > 0.62,
}
def seat(key):
    m = MAN[key]; fs = m['fs']; sheet = Image.open(os.path.join(TD, f'{key}_idle.webp')).convert('RGBA'); out, fronts = [], []
    for d in range(8):
        im = sheet.crop((d * fs, 0, (d + 1) * fs, fs)); px = im.load(); bb = im.getbbox()
        pts = [(x, y) for y in range(bb[1], bb[1] + (bb[3] - bb[1]) * 2 // 3) for x in range(bb[0], bb[2]) if px[x, y][3] > 200 and SADDLE[key](*hsv(px[x, y]))]
        if len(pts) < 6: cx = (bb[0] + bb[2]) // 2; out.append([cx, bb[1] + (bb[3] - bb[1]) // 2]); fronts.append([]); print(key, d, 'no saddle found'); continue
        xs = sorted(p[0] for p in pts); ys = sorted(p[1] for p in pts)
        sx, top, bot = xs[len(xs) // 2], ys[len(ys) // 10], ys[-len(ys) // 10 - 1]
        sy = top + max(1, (bot - top) // 3); out.append([sx, sy])
        # the animal parts nearer the viewer than the rider: facing us the head / chest (a band in the middle, under the
        # seat), from the side the head and neck ahead of the saddle, from behind the rump under the seat
        w = bb[2] - bb[0]
        if d == 0: fronts.append([[sx - w // 5, sx + w // 5, sy + 4]])
        elif d == 4: fronts.append([[sx - w // 5, sx + w // 5, sy + 5]])
        elif d in (1, 2): fronts.append([[sx + 7, bb[2], bb[1]]])
        elif d in (6, 7): fronts.append([[bb[0], sx - 7, bb[1]]])
        else: fronts.append([])
    return out, fronts
if __name__ == '__main__':
    for key in sys.argv[1:]:
        s, f = seat(key); print(key, 'seat:', json.dumps(s), '\n  front:', json.dumps(f))
