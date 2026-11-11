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
SRC = {'bs3': 'bs3b'}      # the remade Obsidian Serpent (big canvas, wings not cut) lives in chars/bs3b.zip
MIRROR_W = {'bs3'}         # generated facing south / east / north only: west = east flipped
COPY = {'bs3': {'special': 'attack', 'attack': 'walk'}}   # animation not generated yet -> shown with another one
def norm(a):
    a = a.lower()
    if a.startswith('walk'): return 'walk'
    if any(w in a for w in ('swing', 'slash', 'shoot', 'thrust', 'smash', 'attack', 'lift')): return 'attack'
    return re.sub(r'[^a-z0-9]+', '_', a).strip('_')

# A character can have two template 'walking' groups: the first 8-direction one and the directions re-made by
# tools/gen_walk_fix.py. The zip calls one 'walking' and the other 'walking-<first 8 chars of its group id>' (which one
# gets the plain name varies), so the re-made group is found by its id in state.json ('walkfix_g').
FIX = re.compile(r'^walking-[0-9a-f]{8}$')
_SF = os.path.join(PL, 'chars', 'state.json'); STATE = json.load(open(_SF)) if os.path.exists(_SF) else {}
def frames_of(z, old_walk=False, fixg=None):
    names = z.namelist(); load = lambda n: Image.open(io.BytesIO(z.read(n))).convert('RGBA')
    # a zip can hold several states of one character (hg: Idle + axe / pick / spear): the idle picture is the 'Idle' state
    rot = {}
    for d in DIRS:
        c = sorted((n for n in names if n.endswith(f'rotations/{d}.png')), key=lambda n: (not n.startswith(('Idle/', 'rotations/')), n))
        if c: rot[d] = load(c[0])
    groups = {}   # (state folder, animation folder) -> {direction: [(frame no, zip name)]}
    for n in names:
        m = re.search(r'(?:^|/)animations/([^/]+)/([a-z-]+)/frame_(\d+)\.png$', n)
        if m: groups.setdefault((n[:m.start()].strip('/'), m.group(1)), {}).setdefault(m.group(2), []).append((int(m.group(3)), n))
    folders = {f for _, f in groups}
    has_tpl = any(f == 'walking' or FIX.match(f) for f in folders)
    fixname = None if not fixg else 'walking-' + fixg[:8] if 'walking-' + fixg[:8] in folders else 'walking' if any(FIX.match(f) for f in folders) else None
    anims, fix, tool = {}, {}, {}
    # the group with more directions goes first: a second group of the same animation ('die' + 'die-ef4c0b8a') only
    # fills the directions the bigger one lacks (frames of two groups are never glued into one direction)
    for (state, f), dd in sorted(groups.items(), key=lambda kv: (-len(kv[1]), kv[0])):
        tpl = f == 'walking' or bool(FIX.match(f))      # a template walk group
        if tpl and f == fixname:
            if not old_walk: fix.update(dd)
            continue
        # the skeleton-template 'walking' (8 directions, real leg motion) replaces the old text-made 'walk'
        if not tpl and norm(f) == 'walk' and has_tpl and not old_walk: continue
        # bosses: the skeleton 'walking' template deforms non-human shapes (wings / extra arms / tree body lost) -> keep the old walk
        if tpl and old_walk and any(x != 'walking' and not FIX.match(x) and norm(x) == 'walk' for x in folders): continue
        # an animation made on a tool-holding state (axe / pick / spear) replaces the same-named one of the Idle state
        tgt = (anims if state in ('', 'Idle') else tool).setdefault(norm(re.sub(r'-[0-9a-f]{8}$', '', f)), {})
        for d, v in dd.items(): tgt.setdefault(d, v)
    for a, dd in tool.items(): anims.setdefault(a, {}).update(dd)
    out = {a: {d: [load(n) for _, n in sorted(v)] for d, v in dd.items()} for a, dd in anims.items()}
    # re-made walk directions (weapon / shield / cape kept) replace the template ones, direction by direction
    for d, v in fix.items(): out.setdefault('walk', {})[d] = [load(n) for _, n in sorted(v)]
    return rot, out, load

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

def fit_creature_walk(rot, dd, w0):
    """The template walk of a monster / animal is redrawn by the AI and often comes out smaller than the idle picture
    (a deer at 80%). Scale each direction back to the idle's body mass and stand it on the idle's spot (bottom centre of
    the body). Returns the frames on one centred canvas (so the centre rule of build() still holds)."""
    mass = lambda im: int((np.asarray(im)[..., 3] > 0).sum())
    placed, need = {}, 0
    for d, frames in dd.items():
        bi = rot[d].getbbox() if d in rot else None
        ms = [mass(f) for f in frames if f.getbbox()]
        if not bi or not ms: placed[d] = [(f, 0, 0) for f in frames]; continue
        k = (mass(rot[d]) / float(np.median(ms))) ** 0.5
        k = 1.0 if 0.95 < k < 1.06 else min(1.4, max(0.85, k))
        fr = [f.resize((max(1, round(f.width * k)), max(1, round(f.height * k))), Image.NEAREST) for f in frames] if k != 1.0 else frames
        bbs = [f.getbbox() for f in fr if f.getbbox()]
        dx = round((bi[0] + bi[2]) / 2 - float(np.median([(b[0] + b[2]) / 2 for b in bbs])))
        dy = bi[3] - max(b[3] for b in bbs)
        placed[d] = [(f, dx, dy) for f in fr]
        for f, _, _ in placed[d]:
            b = f.getbbox()
            if b: need = max(need, -(dx + b[0]), dx + b[2] - w0, -(dy + b[1]), dy + b[3] - w0)
    pad = max(0, int(need)); pad += pad % 2; N = w0 + 2 * pad
    out = {}
    for d, fr in placed.items():
        out[d] = []
        for f, dx, dy in fr:
            c = Image.new('RGBA', (N, N)); c.paste(f, (pad + dx, pad + dy)); out[d].append(c)
    return out

IDLE_DIRS = {'bs3': ['south', 'east', 'north', 'west']}   # the remade dragon only faces the directions it is animated in

def build(key, zips, man):
    rot, anims = {}, {}
    for zp in zips:
        r, a, _ = frames_of(zipfile.ZipFile(zp), key.startswith('bs'), STATE.get(key, {}).get('walkfix_g'))
        rot.update(r); anims.update(a)
    if key in MIRROR_W:
        if 'east' in rot: rot['west'] = rot['east'].transpose(Image.FLIP_LEFT_RIGHT)   # idle too, so idle and walk match
        for dd in anims.values():
            if 'east' in dd and 'west' not in dd: dd['west'] = [im.transpose(Image.FLIP_LEFT_RIGHT) for im in dd['east']]
    dirs = [d for d in DIRS if d in rot and d in IDLE_DIRS.get(key, DIRS)]
    w0 = rot[dirs[0]].width
    human = key in ('hero', 'hg') or key.startswith(('hr', 'np'))
    foot0 = foot([rot[d] for d in dirs])     # the ground line PixelLab drew the character on (canvas w0)
    if key.startswith(('mo', 'an')) and 'walk' in anims and all(f.width == w0 for fr in anims['walk'].values() for f in fr):
        anims['walk'] = fit_creature_walk(rot, anims['walk'], w0)
    for a, src in COPY.get(key, {}).items():
        if a not in anims and src in anims: anims[a] = anims[src]
    # some PixelLab idle poses are bigger than their canvas (wings cut off): use the first frame of the attack (drawn on a
    # bigger canvas, same pose family) or of the walk for that direction instead; the idle canvas grows to fit
    clipped = lambda im: (lambda al: al[:, 0].max() > 0 or al[:, -1].max() > 0 or al[0].max() > 0)(np.asarray(im)[..., 3])
    for d in dirs:
        if not clipped(rot[d]): continue
        for a in ('attack', 'walk'):
            f0 = anims.get(a, {}).get(d, [None])[0]
            if f0 is not None and not clipped(f0): rot[d] = f0; break
    w = max(rot[d].width for d in dirs)
    # PixelLab grows a canvas around its centre (idle 128 -> attack 168 / 172 / 180 per direction, the picture stays in the
    # middle). Creatures and bosses are therefore placed by canvas centre: every frame of every animation is centred on
    # one canvas size and stands on the idle's ground line -> no jump between idle / walk / attack / special / die.
    # (Heroes and villagers go through normalise() instead, which also fixes size differences.)
    def centre(im, n):
        if im.width == n and im.height == n: return im
        c = Image.new('RGBA', (n, n)); c.paste(im, ((n - im.width) // 2, (n - im.height) // 2)); return c
    for d in dirs:
        if rot[d].width == w: continue
        if human: pad = Image.new('RGBA', (w, w)); pad.paste(rot[d], ((w - rot[d].width) // 2, w - rot[d].height)); rot[d] = pad
        else: rot[d] = centre(rot[d], w)
    sh = Image.new('RGBA', (w * len(dirs), w))
    for i, d in enumerate(dirs): sh.paste(rot[d], (i * w, 0))
    sh.save(os.path.join(OUT, f'{key}_idle.webp'), lossless=True)
    info = {'dirs': dirs, 'idleFs': w, 'idleFoot': foot([rot[d] for d in dirs]) if human else foot0 + (w - w0) // 2, 'anims': {}}
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
    place = normalise(rot, dirs, w, info['idleFoot'], anims) if human else {}
    for a, dd in anims.items():
        ft = None
        if a in place: fs0, ft, dd = place[a]
        ad = [d for d in dirs if d in dd]
        if not ad: continue
        n = max(len(dd[d]) for d in ad); fs = max(im.width for d in ad for im in dd[d])
        if ft is None: ft = foot0 + (fs - w0) // 2          # creature: the idle's ground line on this canvas
        s = Image.new('RGBA', (fs * n, fs * len(ad)))
        for r, d in enumerate(ad):
            row = dd[d] + [dd[d][-1]] * (n - len(dd[d]))     # a shorter direction holds its last frame (never blank frames)
            for c, im in enumerate(row): s.paste(centre(im, fs), (c * fs, r * fs))
        s.save(os.path.join(OUT, f'{key}_{a}.webp'), lossless=True)
        info['anims'][a] = {'fs': fs, 'n': n, 'dirs': ad, 'foot': ft}
    man[key] = info

if __name__ == '__main__':
    man = {}
    for k, zs in OLD.items(): build(k, [os.path.join(PL, z) for z in zs], man)
    cd = os.path.join(PL, 'chars')
    alt = set(SRC.values())
    for f in sorted(os.listdir(cd)) if os.path.isdir(cd) else []:
        k = f[:-4]
        if f.endswith('.zip') and not f.startswith('hero_') and k not in alt: build(k, [os.path.join(cd, SRC.get(k, k) + '.zip')], man)
    json.dump(man, open(os.path.join(OUT, 'chars.json'), 'w'), indent=0)
    for k, v in man.items(): print(k, v['idleFs'], {a: (x['fs'], x['n'], len(x['dirs'])) for a, x in v['anims'].items()})
