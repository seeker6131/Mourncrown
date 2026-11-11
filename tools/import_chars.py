"""All PixelLab character zips -> src/assets/td/<key>_<anim>.webp sheets + src/assets/td/chars.json manifest.
Sources: art-source/pixellab/chars/<key>.zip (API) and older hand-downloaded zips mapped in OLD.
Sheets: idle = 1 row x 8 dirs (or 4); anim = rows = directions (DIRS order, missing dirs skipped), cols = frames."""
import os, io, re, json, zipfile
import numpy as np
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'src', 'assets', 'td'); PL = os.path.join(ROOT, 'art-source', 'pixellab')
DIRS = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west']
OLD = {'hero': ['hero_villager.zip', 'hero_villager_guard.zip', 'chars/hero_gather.zip'], 'hr3': ['hr3_lordknight.zip', 'hr3_attack.zip'],
       'hr4': ['hr4_walk.zip', 'hr4_attack.zip'], 'hr9': ['hr9_walk.zip', 'hr9_attack.zip']}
ALIAS = {'walking': 'walk'}
def norm(a):
    a = a.lower()
    if a.startswith('walk'): return 'walk'
    if any(w in a for w in ('swing', 'slash', 'shoot', 'thrust', 'smash', 'attack', 'lift')): return 'attack'
    return re.sub(r'[^a-z0-9]+', '_', a).strip('_')

def frames_of(z, old_walk=False):
    names = z.namelist(); load = lambda n: Image.open(io.BytesIO(z.read(n))).convert('RGBA')
    rot = {d: load(n) for d in DIRS for n in names if n.endswith(f'rotations/{d}.png')}
    anims = {}
    folders = {m.group(1) for n in names for m in [re.search(r'animations/([^/]+)/', n)] if m}
    for n in names:
        m = re.search(r'animations/([^/]+)/([a-z-]+)/frame_(\d+)\.png$', n)
        # the skeleton-template 'walking' (8 directions, real leg motion) replaces the old text-made 'walk'
        if m and m.group(1) != 'walking' and norm(m.group(1)) == 'walk' and 'walking' in folders and not old_walk: continue
        # bosses: the skeleton 'walking' template deforms non-human shapes (wings / extra arms / tree body lost) -> keep the old walk
        if m and m.group(1) == 'walking' and old_walk and any(f != 'walking' and norm(f) == 'walk' for f in folders): continue
        if m: anims.setdefault(norm(m.group(1)), {}).setdefault(m.group(2), []).append((int(m.group(3)), n))
    return rot, {a: {d: [load(n) for _, n in sorted(v)] for d, v in dd.items()} for a, dd in anims.items()}, load

def foot(ims):
    b = [im.getbbox() for im in ims if im.getbbox()]
    return max(x[3] for x in b) if b else ims[0].height

# ---------- seamless poses: every animation is the same size as the idle and stands on the same spot ----------
def _stats(im):
    """body top / bottom rows, height, and three x anchors (head, torso, feet) of one frame; None when empty"""
    a = np.asarray(im)[..., 3] > 0
    wide = np.nonzero(a.sum(1) >= 6)[0]; any3 = np.nonzero(a.sum(1) >= 3)[0]
    if not len(wide) or not len(any3): return None
    top, bot = int(wide[0]), int(any3[-1]); h = bot - top + 1
    def cx(y0, y1):
        xs = np.nonzero(a[max(0, y0):y1 + 1])[1]
        return float(xs.mean()) if len(xs) else im.width / 2
    feet = np.nonzero(a[max(top, bot - 3):bot + 1].any(0))[0]
    return {'top': top, 'bot': bot, 'h': h, 'head': cx(top, top + int(h * 0.3)), 'torso': cx(top + int(h * 0.35), top + int(h * 0.8)),
            'feet': (feet[0] + feet[-1]) / 2 if len(feet) else im.width / 2}

def normalise(rot, dirs, w, idle_foot, anims):
    """Scale each direction of each animation to the idle's body height and move it so its reference pose (frame 0;
    every frame for the walk) has the feet and body where the idle of that direction has them. Returns
    {anim: (frame size, foot row, {dir: frames})} drawn on a canvas whose anchor (centre x, foot row) is the idle's anchor."""
    out = {}
    for a, dd in anims.items():
        placed, ext = {}, [0, 0, 0, 0]   # extents relative to the anchor: left, right, up, down
        for d in dd:
            if d not in rot: continue
            si = _stats(rot[d]); frames = dd[d]
            ref = frames if a == 'walk' else frames[:1]
            sr = [x for x in (_stats(f) for f in ref) if x]
            if not si or not sr: placed[d] = (frames, 0, 0); continue
            k = si['h'] / float(np.median([x['h'] for x in sr]))
            k = 1.0 if 0.95 < k < 1.05 else min(1.25, max(0.85, k))
            if k != 1.0:
                frames = [f.resize((max(1, round(f.width * k)), max(1, round(f.height * k))), Image.NEAREST) for f in frames]
                sr = [x for x in (_stats(f) for f in (frames if a == 'walk' else frames[:1])) if x]
            bot = max(x['bot'] for x in sr)                                   # the foot on the ground
            dxs = sorted(si[q] - w / 2 - (float(np.median([x[q] for x in sr]))) for q in ('head', 'torso', 'feet'))
            ox = round(dxs[1])                                                # median of the three anchors: robust to a raised weapon
            oy = round(-(idle_foot - (si['bot'] + 1)) - (bot + 1))
            placed[d] = (frames, ox, oy)
            for f in frames:
                bb = f.getbbox()
                if not bb: continue
                ext = [min(ext[0], ox + bb[0]), max(ext[1], ox + bb[2]), min(ext[2], oy + bb[1]), max(ext[3], oy + bb[3])]
        half = int(np.ceil(max(-ext[0], ext[1]))) + 1; up, down = int(np.ceil(-ext[2])) + 1, int(np.ceil(max(0, ext[3]))) + 1
        N = max(2 * half, up + down); N += N % 2; FOOT = N - down
        res = {}
        for d, (frames, ox, oy) in placed.items():
            res[d] = []
            for f in frames:
                c = Image.new('RGBA', (N, N)); c.paste(f, (N // 2 + ox, FOOT + oy)); res[d].append(c)
        out[a] = (N, FOOT, res)
    return out

def build(key, zips, man):
    rot, anims = {}, {}
    for zp in zips:
        r, a, _ = frames_of(zipfile.ZipFile(zp), key.startswith('bs'))
        rot.update(r); anims.update(a)
    dirs = [d for d in DIRS if d in rot]
    w = rot[dirs[0]].width
    # some PixelLab idle poses are bigger than their canvas (wings cut off): use the first frame of the attack (drawn on a
    # bigger canvas, same pose family) or of the walk for that direction instead; the idle canvas grows to fit
    clipped = lambda im: (lambda al: al[:, 0].max() > 0 or al[:, -1].max() > 0 or al[0].max() > 0)(np.asarray(im)[..., 3])
    for d in dirs:
        if not clipped(rot[d]): continue
        for a in ('attack', 'walk'):
            f0 = anims.get(a, {}).get(d, [None])[0]
            if f0 is not None and not clipped(f0): rot[d] = f0; break
    w = max(rot[d].width for d in dirs)
    for d in dirs:
        if rot[d].width != w: pad = Image.new('RGBA', (w, w)); pad.paste(rot[d], ((w - rot[d].width) // 2, w - rot[d].height)); rot[d] = pad
    sh = Image.new('RGBA', (w * len(dirs), w))
    for i, d in enumerate(dirs): sh.paste(rot[d], (i * w, 0))
    sh.save(os.path.join(OUT, f'{key}_idle.webp'), lossless=True)
    info = {'dirs': dirs, 'idleFs': w, 'idleFoot': foot([rot[d] for d in dirs]), 'anims': {}}
    # animation frames cut by the canvas edge. NEVER drop a direction (a missing direction makes the character face the
    # wrong way — worse than a clipped sword tip). Creatures (monsters / animals) may take the mirrored opposite side when
    # the cut is big and that side is clean; heroes and villagers always keep their own frames (shield / weapon hands).
    MIRROR = {'east': 'west', 'west': 'east', 'north-east': 'north-west', 'north-west': 'north-east', 'south-east': 'south-west', 'south-west': 'south-east'}
    def clip_px(im):
        al = np.asarray(im)[..., 3] > 0
        return int(al[:, 0].sum() + al[:, -1].sum() + al[0].sum())
    creature = key.startswith(('mo', 'an'))
    for a, dd in anims.items():
        if not creature: break
        worst = {d: max(clip_px(im) for im in dd[d]) for d in dd}
        for d in list(dd):
            m = MIRROR.get(d)
            if worst[d] > 10 and m in dd and worst[m] <= 2: dd[d] = [im.transpose(Image.FLIP_LEFT_RIGHT) for im in dd[m]]
    # heroes and villagers: same size and same standing spot in every pose (no pop between idle / walk / attack)
    human = key in ('hero', 'hg') or key.startswith(('hr', 'np'))
    place = normalise(rot, dirs, w, info['idleFoot'], anims) if human else {}
    for a, dd in anims.items():
        ft = None
        if a in place: fs0, ft, dd = place[a]
        ad = [d for d in dirs if d in dd]
        if not ad: continue
        n = max(len(dd[d]) for d in ad); fs = dd[ad[0]][0].width
        s = Image.new('RGBA', (fs * n, fs * len(ad)))
        for r, d in enumerate(ad):
            for c, im in enumerate(dd[d]): s.paste(im, (c * fs, r * fs))
        s.save(os.path.join(OUT, f'{key}_{a}.webp'), lossless=True)
        info['anims'][a] = {'fs': fs, 'n': n, 'dirs': ad, 'foot': ft if ft is not None else foot([im for d in ad for im in dd[d]])}
    man[key] = info

if __name__ == '__main__':
    man = {}
    for k, zs in OLD.items(): build(k, [os.path.join(PL, z) for z in zs], man)
    cd = os.path.join(PL, 'chars')
    for f in sorted(os.listdir(cd)) if os.path.isdir(cd) else []:
        if f.endswith('.zip') and not f.startswith('hero_'): build(f[:-4], [os.path.join(cd, f)], man)
    json.dump(man, open(os.path.join(OUT, 'chars.json'), 'w'), indent=0)
    for k, v in man.items(): print(k, v['idleFs'], {a: (x['fs'], x['n'], len(x['dirs'])) for a, x in v['anims'].items()})
