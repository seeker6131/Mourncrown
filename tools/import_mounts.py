"""Mount zips -> src/assets/td/<key>_idle.webp (1 row x 8 dirs) + <key>_walk.webp (8 rows x N frames) + mounts.json.
PixelLab's quadruped rotations came out with their direction names shifted (the 'south-east' picture faces the viewer,
'north-east' is the right side...), so each mount says which named picture really shows which direction; directions
it lacks are mirrored from the opposite side. All frames share one canvas (the walk's), centred like PixelLab grows it.
python3 -I tools/import_mounts.py"""
import os, io, re, json, zipfile
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CH = os.path.join(ROOT, 'art-source', 'pixellab', 'chars'); OUT = os.path.join(ROOT, 'src', 'assets', 'td')
DIRS = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west']
# real direction -> (named picture, mirrored?)
MAP = {
    'mt_horse': {'south': ('south-east', False), 'south-west': ('south', False), 'south-east': ('south', True), 'east': ('north-east', False), 'west': ('north-east', True),
                 'north-east': ('north', False), 'north-west': ('north', True), 'north': ('north-west', False)},
    'mt_dragon': {'south': ('south-east', False), 'south-east': ('east', False), 'east': ('north-east', False), 'north-east': ('north', False),
                  'north': ('north-west', False), 'north-west': ('west', False), 'west': ('north-east', True), 'south-west': ('south', False)},
}
def load(z, n): return Image.open(io.BytesIO(z.read(n))).convert('RGBA')
def centre(im, n): c = Image.new('RGBA', (n, n)); c.paste(im, ((n - im.width) // 2, (n - im.height) // 2)); return c

man = json.load(open(os.path.join(OUT, 'mounts.json'))) if os.path.exists(os.path.join(OUT, 'mounts.json')) else {}
for key, mp in MAP.items():
    zp = os.path.join(CH, key + '.zip')
    if not os.path.exists(zp): continue
    z = zipfile.ZipFile(zp); names = z.namelist()
    rot = {d: load(z, n) for d in DIRS for n in names if n.endswith(f'rotations/{d}.png')}
    def anim(prefix):
        out = {}
        for n in names:
            m = re.search(r'animations/([^/]+)/([a-z-]+)/frame_(\d+)\.png$', n)
            if m and m.group(1).lower().startswith(prefix): out.setdefault(m.group(2), []).append((int(m.group(3)), n))
        return {d: [load(z, n) for _, n in sorted(v)][1:] for d, v in out.items()}   # frame 0 = the idle picture: a loop goes without it
    walk, ida = anim('walk'), anim('idle')
    if any(mp[d][0] not in walk for d in DIRS): print(key, 'walk not complete yet — skipped'); continue
    fs = max([im.width for v in list(walk.values()) + list(ida.values()) for im in v] + [im.width for im in rot.values()])
    flip = lambda im, f: im.transpose(Image.FLIP_LEFT_RIGHT) if f else im
    idle = Image.new('RGBA', (fs * 8, fs)); n = min(len(v) for v in walk.values()); wk = Image.new('RGBA', (fs * n, fs * 8))
    for i, d in enumerate(DIRS):
        src, f = mp[d]
        idle.paste(centre(flip(rot[src], f), fs), (i * fs, 0))
        for j, im in enumerate(walk[src][:n]): wk.paste(centre(flip(im, f), fs), (j * fs, i * fs))
    foot = max(centre(rot[mp['south'][0]], fs).getbbox()[3], centre(rot[mp['east'][0]], fs).getbbox()[3])
    idle.save(os.path.join(OUT, f'{key}_idle.webp'), lossless=True); wk.save(os.path.join(OUT, f'{key}_walk.webp'), lossless=True)
    man[key] = {'fs': fs, 'n': n, 'foot': foot}
    if ida and all(mp[d][0] in ida for d in DIRS):   # a living idle (the dragon's flames move while it stands)
        ni = min(len(v) for v in ida.values()); ia = Image.new('RGBA', (fs * ni, fs * 8))
        for i, d in enumerate(DIRS):
            src, f = mp[d]
            for j, im in enumerate(ida[src][:ni]): ia.paste(centre(flip(im, f), fs), (j * fs, i * fs))
        ia.save(os.path.join(OUT, f'{key}_idlea.webp'), lossless=True); man[key]['idleN'] = ni
    print(key, fs, n, foot)
json.dump(man, open(os.path.join(OUT, 'mounts.json'), 'w'), indent=1)
