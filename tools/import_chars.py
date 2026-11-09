"""All PixelLab character zips -> src/assets/td/<key>_<anim>.webp sheets + src/assets/td/chars.json manifest.
Sources: art-source/pixellab/chars/<key>.zip (API) and older hand-downloaded zips mapped in OLD.
Sheets: idle = 1 row x 8 dirs (or 4); anim = rows = directions (DIRS order, missing dirs skipped), cols = frames."""
import os, io, re, json, zipfile
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'src', 'assets', 'td'); PL = os.path.join(ROOT, 'art-source', 'pixellab')
DIRS = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west']
OLD = {'hero': ['hero_villager.zip', 'hero_villager_guard.zip'], 'hr3': ['hr3_lordknight.zip', 'hr3_attack.zip'],
       'hr4': ['hr4_walk.zip', 'hr4_attack.zip'], 'hr9': ['hr9_walk.zip', 'hr9_attack.zip']}
ALIAS = {'walking': 'walk'}
def norm(a):
    a = a.lower()
    if a.startswith('walk'): return 'walk'
    if any(w in a for w in ('swing', 'slash', 'shoot', 'thrust', 'smash', 'attack', 'lift')): return 'attack'
    return re.sub(r'[^a-z0-9]+', '_', a).strip('_')

def frames_of(z):
    names = z.namelist(); load = lambda n: Image.open(io.BytesIO(z.read(n))).convert('RGBA')
    rot = {d: load(n) for d in DIRS for n in names if n.endswith(f'rotations/{d}.png')}
    anims = {}
    folders = {m.group(1) for n in names for m in [re.search(r'animations/([^/]+)/', n)] if m}
    for n in names:
        m = re.search(r'animations/([^/]+)/([a-z-]+)/frame_(\d+)\.png$', n)
        # the skeleton-template 'walking' (8 directions, real leg motion) replaces the old text-made 'walk'
        if m and m.group(1) != 'walking' and norm(m.group(1)) == 'walk' and 'walking' in folders: continue
        if m: anims.setdefault(norm(m.group(1)), {}).setdefault(m.group(2), []).append((int(m.group(3)), n))
    return rot, {a: {d: [load(n) for _, n in sorted(v)] for d, v in dd.items()} for a, dd in anims.items()}, load

def foot(ims):
    b = [im.getbbox() for im in ims if im.getbbox()]
    return max(x[3] for x in b) if b else ims[0].height

def build(key, zips, man):
    rot, anims = {}, {}
    for zp in zips:
        r, a, _ = frames_of(zipfile.ZipFile(zp))
        rot.update(r); anims.update(a)
    dirs = [d for d in DIRS if d in rot]
    w = rot[dirs[0]].width
    sh = Image.new('RGBA', (w * len(dirs), w))
    for i, d in enumerate(dirs): sh.paste(rot[d], (i * w, 0))
    sh.save(os.path.join(OUT, f'{key}_idle.webp'), lossless=True)
    info = {'dirs': dirs, 'idleFs': w, 'idleFoot': foot([rot[d] for d in dirs]), 'anims': {}}
    for a, dd in anims.items():
        ad = [d for d in dirs if d in dd]
        if not ad: continue
        n = max(len(dd[d]) for d in ad); fs = dd[ad[0]][0].width
        s = Image.new('RGBA', (fs * n, fs * len(ad)))
        for r, d in enumerate(ad):
            for c, im in enumerate(dd[d]): s.paste(im, (c * fs, r * fs))
        s.save(os.path.join(OUT, f'{key}_{a}.webp'), lossless=True)
        info['anims'][a] = {'fs': fs, 'n': n, 'dirs': ad, 'foot': foot([im for d in ad for im in dd[d]])}
    man[key] = info

if __name__ == '__main__':
    man = {}
    for k, zs in OLD.items(): build(k, [os.path.join(PL, z) for z in zs], man)
    cd = os.path.join(PL, 'chars')
    for f in sorted(os.listdir(cd)) if os.path.isdir(cd) else []:
        if f.endswith('.zip'): build(f[:-4], [os.path.join(cd, f)], man)
    json.dump(man, open(os.path.join(OUT, 'chars.json'), 'w'), indent=0)
    for k, v in man.items(): print(k, v['idleFs'], {a: (x['fs'], x['n'], len(x['dirs'])) for a, x in v['anims'].items()})
