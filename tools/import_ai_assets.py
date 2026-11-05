"""Convert the Game Director's AI-generated art (art-source/*.png) into game sprites in src/assets/ai/.
Run:  python3 tools/import_ai_assets.py
Each source sheet is background-removed, split into objects, trimmed and downscaled to game pixel size.
"""
import os, sys, json
sys.path.insert(0, os.path.dirname(__file__))
from PIL import Image
import numpy as np
from sprite_tools import remove_white_bg, components, order_rows, to_game, outline

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art-source')
OUT = os.path.join(ROOT, 'src', 'assets', 'ai')
os.makedirs(OUT, exist_ok=True)
meta = {}

def save(name, img):
    img.save(os.path.join(OUT, name + '.png'), optimize=True)
    meta[name] = {'w': img.width, 'h': img.height}

def single(src, name, width=0, height=0):
    im = remove_white_bg(Image.open(os.path.join(SRC, src)))
    # keep only the largest merged blob (drops stray smoke specks far away)
    save(name, to_game(im, width, height))

def sheet(src, names_sizes, gap=18, holes=0):
    im = remove_white_bg(Image.open(os.path.join(SRC, src)), holes=holes)
    boxes = order_rows(components(im, gap=gap, min_area=1500))
    assert len(boxes) == len(names_sizes), (src, len(boxes))
    for (x0, y0, x1, y1, _), ns in zip(boxes, names_sizes):
        if ns is None: continue
        name, kw = ns
        save(name, to_game(im.crop((x0, y0, x1, y1)), **kw))
    return boxes

# ---- buildings ----
single('01.png', 'house_0', width=128)
single('02.png', 'house_1', width=118)
single('03.png', 'smithy', width=104)
single('04.png', 'stall', width=72)
single('05.png', 'tower', width=86)

# ---- trees ----
sheet('06.png', [('tree_oak', dict(width=66)), ('tree_pine', dict(width=50)), ('tree_autumn', dict(width=66)),
                 ('tree_blossom', dict(width=66)), ('tree_dead', dict(width=60)), ('tree_magic', dict(width=66))], holes=900)

# ---- props ----
sheet('07.png', [('barrel', dict(width=18)), ('crate', dict(width=22)), ('chest_0', dict(width=24)), ('chest_1', dict(width=26)),
                 ('campfire', dict(width=28)), ('lamp', dict(height=40)), ('sign', dict(width=24)), ('well', dict(width=40)),
                 ('haystack', dict(width=26)), ('rock', dict(width=28)), ('bush', dict(width=26)), ('fence', dict(width=30))])

# ---- ruins ----
sheet('08.png', [('ruin_pillar', dict(height=58)), ('ruin_broken', dict(width=32)), ('ruin_wall', dict(width=60)), ('ruin_corner', dict(width=58)),
                 ('ruin_stairs', dict(width=50)), ('ruin_altar', dict(width=58)), ('ruin_statue', dict(height=44)), ('ruin_arch', dict(width=60))], holes=900)

# ---- ground tiles: diamond textures 64x32 (cover 2x2 game tiles) ----
im = remove_white_bg(Image.open(os.path.join(SRC, '09.png')))
boxes = order_rows(components(im, gap=10, min_area=1500))
tile_names = ['tile_grass', 'tile_forest', 'tile_path', 'tile_cobble', 'tile_ruins', 'tile_planks', 'tile_sand', 'tile_water']
for (x0, y0, x1, y1, _), name in zip(boxes, tile_names):
    t = im.crop((x0, y0, x1, y1)).convert('RGBA')
    # top diamond only (ignore any slab thickness): use the width to find the diamond height
    w = t.width; dh = w // 2
    t = t.crop((0, 0, w, min(dh + 2, t.height))).resize((128, 64), Image.BOX)
    save(name, t)

# ---- hero: 8 poses ----
sheet('10.png', [(f'hero_{i}', dict(height=42)) for i in range(8)])

# ---- monsters ----
sheet('11.png', [('mon_slime', dict(width=28)), ('mon_shroom', dict(width=28)), ('mon_wolf', dict(width=46)),
                 ('mon_goblin', dict(width=34)), ('mon_wisp', dict(width=26))], gap=40, holes=900)

# ---- item icons 32px ----
icon_names = ['sword0', 'sword1', 'sword2', 'sword3', 'staff0', 'armor0', 'armor1', 'armor2', 'armor3', 'ring0', 'amulet0', 'amulet1',
              'potion_hp', 'potion_mp', 'shard', 'gold']
im = remove_white_bg(Image.open(os.path.join(SRC, '12.png')))
boxes = order_rows(components(im, gap=18, min_area=1500))
assert len(boxes) == 16
for (x0, y0, x1, y1, _), name in zip(boxes, icon_names):
    c = im.crop((x0, y0, x1, y1)); c = c.crop(c.getbbox())
    side = max(c.size); sq = Image.new('RGBA', (side, side), (0, 0, 0, 0)); sq.paste(c, ((side - c.width) // 2, (side - c.height) // 2))
    save('icon_' + name, to_game(sq, width=32, height=32))

# ---- boss: 3 poses, same scale ----
im = remove_white_bg(Image.open(os.path.join(SRC, '13.png')), holes=600)
boxes = order_rows(components(im, gap=18, min_area=1500))
assert len(boxes) == 3
scale = 104 / max(b[3] - b[1] for b in boxes)
for i, (x0, y0, x1, y1, _) in enumerate(boxes):
    c = im.crop((x0, y0, x1, y1)); c = c.crop(c.getbbox())
    save(f'boss_{i}', to_game(c, width=max(1, round(c.width * scale)), height=max(1, round(c.height * scale))))

# ---- title key art ----
k = Image.open(os.path.join(SRC, '14.png')).convert('RGB')
k = k.resize((1280, round(k.height * 1280 / k.width)), Image.LANCZOS)
k.save(os.path.join(OUT, 'keyart.jpg'), quality=84, optimize=True)

with open(os.path.join(OUT, 'meta.json'), 'w') as f:
    json.dump(meta, f, indent=0)
total = sum(os.path.getsize(os.path.join(OUT, n)) for n in os.listdir(OUT))
print('assets:', len(meta), 'total bytes:', total)
