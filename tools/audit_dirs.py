"""One character, every direction: rows = the 8 directions, columns = idle + every Nth frame of the chosen animations,
all standing on the same ground line. Shows at once which direction lost its weapon / cape / changed size.
python3 -I tools/audit_dirs.py <out.png> <key> [anim,anim...] [step]     (reads src/assets/td; default anims = walk,attack)"""
import json, sys, os
from PIL import Image, ImageDraw
D = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'src', 'assets', 'td')
man = json.load(open(D + '/chars.json'))
out, key = sys.argv[1], sys.argv[2]
anims = (sys.argv[3] if len(sys.argv) > 3 else 'walk,attack').split(',')
step = int(sys.argv[4]) if len(sys.argv) > 4 else 2
v = man[key]; idle = Image.open(f'{D}/{key}_idle.webp').convert('RGBA'); fs = v['idleFs']
S = 3 if fs <= 100 else 1
rows = []
for dn in v['dirs']:
    i = v['dirs'].index(dn); cells = [('idle', idle.crop((i * fs, 0, (i + 1) * fs, fs)), v['idleFoot'])]
    for a in anims:
        x = v['anims'].get(a)
        if not x: continue
        if dn not in x['dirs']: cells.append((a + ' -', None, 0)); continue
        sh = Image.open(f'{D}/{key}_{a}.webp').convert('RGBA'); r = x['dirs'].index(dn); F = x['fs']
        for f in range(0, x['n'], step): cells.append((f'{a}{f}', sh.crop((f * F, r * F, (f + 1) * F, (r + 1) * F)), x['foot']))
    rows.append((dn, cells))
big = max([fs] + [v['anims'][a]['fs'] for a in anims if a in v['anims']])
W = big + 4; H = big + 10; NC = max(len(c) for _, c in rows)
o = Image.new('RGBA', (W * S * NC + 90, H * S * len(rows)), (46, 40, 52, 255)); d = ImageDraw.Draw(o)
for r, (lab, cells) in enumerate(rows):
    base = r * H * S + H * S - 6 * S
    d.text((W * S * NC + 4, r * H * S + 20), lab, fill='white'); d.line((0, base, W * S * NC, base), fill=(150, 60, 60, 255))
    for c, (n, im, foot) in enumerate(cells):
        d.text((c * W * S + 4, r * H * S + 2), n, fill='yellow')
        if im is None: continue
        im2 = im.resize((im.width * S, im.height * S), Image.NEAREST)
        o.alpha_composite(im2, (c * W * S + W * S // 2 - im2.width // 2, base - foot * S))
o.convert('RGB').save(out); print(o.size)
