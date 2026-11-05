"""Split the Director's animation sheets (art-source/anim/*.png) into game spritesheets.
Run: python3 tools/import_anims.py   -> src/assets/anim/*.png + meta.json

Each sheet: rows x frames. Frames are found by projecting opaque pixels onto the axes and merging
the smallest gaps until the expected counts are reached. Frames keep the row's common baseline
(so jumps stay jumps) and are horizontally anchored on the feet.
"""
import os, sys, json
sys.path.insert(0, os.path.dirname(__file__))
import numpy as np
from PIL import Image
from sprite_tools import remove_white_bg

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art-source', 'anim')
OUT = os.path.join(ROOT, 'src', 'assets', 'anim')
os.makedirs(OUT, exist_ok=True)
for f in os.listdir(OUT):
    os.remove(os.path.join(OUT, f))
meta = {}
R = 2  # stored at 2x of world pixels


def load(name, dark=False):
    im = Image.open(os.path.join(SRC, name + '.png')).convert('RGB')
    if dark:
        a = np.asarray(im).astype(np.float32)
        mx = a.max(axis=2)
        alpha = np.clip((mx - 18) * 2.4, 0, 255)
        rgb = np.where(alpha[..., None] > 0, np.clip(a * 255 / np.maximum(alpha[..., None], 1), 0, 255), 0)
        return Image.fromarray(np.dstack([rgb, alpha]).astype(np.uint8), 'RGBA')
    return remove_white_bg(im, holes=500)


def runs(occ, n, min_len=3):
    """Find n runs of True in a 1D array by merging the smallest gaps."""
    idx = np.nonzero(occ)[0]
    if not len(idx):
        return []
    segs = []
    s = idx[0]; p = idx[0]
    for i in idx[1:]:
        if i > p + 1:
            segs.append([s, p]); s = i
        p = i
    segs.append([s, p])
    segs = [g for g in segs if g[1] - g[0] >= min_len or len(segs) <= n]
    while len(segs) > n:
        gaps = [segs[i + 1][0] - segs[i][1] for i in range(len(segs) - 1)]
        k = int(np.argmin(gaps))
        segs[k] = [segs[k][0], segs[k + 1][1]]
        segs.pop(k + 1)
    return segs


def split(im, rows):
    """rows: list of frame counts per row. Returns list (per row) of (box, rowbottom)."""
    al = np.asarray(im)[:, :, 3] > 40
    out = []
    rsegs = runs(al.any(axis=1), len(rows), 6)
    assert len(rsegs) == len(rows), (len(rsegs), rows)
    for (y0, y1), n in zip(rsegs, rows):
        band = al[y0:y1 + 1]
        csegs = runs(band.any(axis=0), n, 6)
        assert len(csegs) == n, ('cols', len(csegs), n)
        out.append([(x0, y0, x1 + 1, y1 + 1) for x0, x1 in csegs])
    return out


def feet_x(a):
    al = np.asarray(a)[:, :, 3] > 40
    ys, xs = np.nonzero(al)
    if not len(ys):
        return a.width / 2
    yb = ys.max()
    sel = ys > yb - max(4, (yb - ys.min()) * 0.22)
    return float(xs[sel].mean())


def build(name, im, rowspec, scale, anchor='feet', dark=False):
    """rowspec: list of (animName, nFrames). Saves one strip per anim."""
    rows = split(im, [n for _, n in rowspec])
    for (anim, n), boxes in zip(rowspec, rows):
        crops = []
        bands = [im.crop(b) for b in boxes]
        bbs = [b.getbbox() for b in bands]
        top = min(bb[1] for bb in bbs); bottom = max(bb[3] for bb in bbs)
        for c, bb in zip(bands, bbs):
            c = c.crop((bb[0], top, bb[2], bottom))
            fx = feet_x(c) if anchor == 'feet' else c.width / 2
            crops.append((c, fx))
        left = max(fx for c, fx in crops)
        right = max(c.width - fx for c, fx in crops)
        H = max(c.height for c, _ in crops)
        W = int(np.ceil(left + right))
        fw, fh = max(1, round(W * scale)), max(1, round(H * scale))
        strip = Image.new('RGBA', (fw * n, fh), (0, 0, 0, 0))
        for i, (c, fx) in enumerate(crops):
            cell = Image.new('RGBA', (W, H), (0, 0, 0, 0))
            cell.paste(c, (int(round(left - fx)), H - c.height))
            # premultiplied box downscale
            arr = np.asarray(cell).astype(np.float32)
            a = arr[:, :, 3:4] / 255
            pre = Image.fromarray(np.concatenate([arr[:, :, :3] * a, arr[:, :, 3:4]], 2).astype(np.uint8), 'RGBA').resize((fw, fh), Image.BOX)
            sa = np.asarray(pre).astype(np.float32)
            al = sa[:, :, 3:4]
            rgb = np.where(al > 0, sa[:, :, :3] * 255 / np.maximum(al, 1), 0)
            alpha = al if dark else np.where(al > 110, 255, 0)
            strip.paste(Image.fromarray(np.concatenate([np.clip(rgb, 0, 255), alpha], 2).astype(np.uint8), 'RGBA'), (i * fw, 0))
        key = f'{name}_{anim}'
        strip.save(os.path.join(OUT, key + '.png'), optimize=True)
        meta[key] = {'w': fw, 'h': fh, 'n': n, 'ax': round(left * scale, 2), 'ay': fh}


def scale_for(im, rows, first_row_target, axis='h', use='median'):
    rs = split(im, rows)[0]
    sizes = []
    for (x0, y0, x1, y1) in rs:
        bb = im.crop((x0, y0, x1, y1)).getbbox()
        sizes.append((bb[3] - bb[1]) if axis == 'h' else (bb[2] - bb[0]))
    ref = sizes[0] if use == 'first' else float(np.median(sizes))
    return first_row_target / ref


# ---- hero (world height ~44 px) ----
HERO_H = 44 * R
for sheet, spec in [('hero_idle', [('idle', 4)]), ('hero_walk', [('walk', 6)]), ('hero_walkup', [('walkup', 6)]),
                    ('hero_attack', [('attack', 5)]), ('hero_cast', [('cast', 4)]), ('hero_die', [('die', 5)])]:
    im = load(sheet)
    sc = scale_for(im, [n for _, n in spec], HERO_H, 'h', 'first' if sheet in ('hero_attack', 'hero_cast', 'hero_die') else 'median')
    build('hero', im, spec, sc)

# ---- monsters (world widths from the single-image versions) ----
for kind, width in [('slime', 30), ('shroom', 30), ('wolf', 50), ('goblin', 36), ('wisp', 28)]:
    im = load(kind)
    sc = scale_for(im, [4, 4], width * R, 'w')
    build('mon_' + kind, im, [('move', 4), ('attack', 4)], sc)

# ---- boss ----
im = load('boss_a'); sc = scale_for(im, [4, 5], 104 * R, 'h')
build('mon_treant', im, [('move', 4), ('attack', 5)], sc)
im = load('boss_b'); build('mon_treant', im, [('cast', 4), ('die', 5)], sc)

# ---- NPCs ----
for n in ['elder', 'merchant', 'smith']:
    im = load('npc_' + n); sc = scale_for(im, [4], 44 * R, 'h')
    build('npc_' + n, im, [('idle', 4)], sc)

# ---- VFX (black background, additive) ----
im = load('fx_e1', dark=True)
rows = split(im, [6, 6, 6])
def fx(name, im, rowspec, target_w, anchor='center'):
    sc = None
    rs = split(im, [n for _, n in rowspec])
    # scale by the widest frame of each row individually
    for (anim, n), boxes in zip(rowspec, rs):
        w = max(im.crop(b).getbbox()[2] - im.crop(b).getbbox()[0] for b in boxes)
        sub = im.crop((0, boxes[0][1], im.width, boxes[0][3]))
        build('fx', sub, [(anim, n)], target_w[anim] * R / w, anchor=anchor, dark=True)
fx('fx', load('fx_e1', dark=True), [('slash', 6), ('fireball', 6), ('explode', 6)], {'slash': 34, 'fireball': 26, 'explode': 70})
fx('fx', load('fx_e2', dark=True), [('bolt', 6), ('heal', 6), ('lvlup', 6)], {'bolt': 44, 'heal': 46, 'lvlup': 52})
fx('fx', load('fx_e3', dark=True), [('smoke', 6), ('hit', 6)], {'smoke': 40, 'hit': 30})

# ---- environment ----
im = load('env_f1')
rs = split(im, [6, 6])
for (anim, n, tw), boxes in zip([('campfire', 6, 32), ('lamp', 6, 22)], rs):
    sub = im.crop((0, boxes[0][1], im.width, boxes[0][3]))
    w = max(sub.crop((b[0], 0, b[2], sub.height)).getbbox()[2] - sub.crop((b[0], 0, b[2], sub.height)).getbbox()[0] for b in boxes)
    build('env', sub, [(anim, n)], tw * R / w, anchor='center')
im = load('env_f2')
rs = split(im, [6, 6])
for (anim, n, tw), boxes in zip([('smoke', 6, 26), ('flag', 6, 22)], rs):
    sub = im.crop((0, boxes[0][1], im.width, boxes[0][3]))
    w = max(sub.crop((b[0], 0, b[2], sub.height)).getbbox()[2] - sub.crop((b[0], 0, b[2], sub.height)).getbbox()[0] for b in boxes)
    build('env', sub, [(anim, n)], tw * R / w, anchor='center')

# ---- skill icons (64px) ----
im = load('skill_icons')
for (x0, y0, x1, y1), nm in zip(split(im, [4])[0], ['cyclone', 'flame', 'thunder', 'heal']):
    c = im.crop((x0, y0, x1, y1)); c = c.crop(c.getbbox()).resize((64, 64), Image.LANCZOS)
    a = np.asarray(c).copy(); a[:, :, 3] = np.where(a[:, :, 3] > 110, 255, 0)
    Image.fromarray(a, 'RGBA').save(os.path.join(OUT, f'skill_{nm}.png'), optimize=True)

json.dump(meta, open(os.path.join(OUT, 'meta.json'), 'w'), indent=0)
tot = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
print(len(meta), 'anims;', tot, 'bytes')
