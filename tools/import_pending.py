"""Import the Director's batch-2 single images (art-source/pending) into src/assets/ai as 2x world art.
python3 tools/import_pending.py
Widths are in WORLD pixels (hero is 32 px tall ~ 1.7 m), so buildings stay true to human scale.
"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from PIL import Image
from sprite_tools import remove_white_bg, to_game, components, order_rows

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(ROOT, 'art-source', 'pending')
OUT = os.path.join(ROOT, 'src', 'assets', 'ai')
R = 2

def single(rel, name, width):
    im = remove_white_bg(Image.open(os.path.join(P, rel + '.png')), holes=800)
    to_game(im, width=width * R, crisp=False).save(os.path.join(OUT, name + '.png'), optimize=True)

# buildings: plot footprint is 3x3 tiles (96 px diamond)
for rel, name, w in [
    ('buildings/empty_plot', 'bld_empty', 92), ('buildings/construction', 'bld_construction', 92),
    ('buildings/forge_lv1', 'bld_forge_1', 92), ('buildings/forge_lv2', 'bld_forge_2', 104),
    ('buildings/kitchen_lv1_campfire', 'bld_kitchen_1', 60), ('buildings/kitchen_lv2', 'bld_kitchen_2', 94),
    ('buildings/warehouse_lv1', 'bld_warehouse_1', 90), ('buildings/warehouse_lv2', 'bld_warehouse_2', 98),
    ('buildings/farm_lv1', 'bld_farm_1', 100), ('buildings/farm_lv2', 'bld_farm_2', 104),
    ('buildings/barn_lv1_pen', 'bld_barn_1', 96), ('buildings/barn_lv2', 'bld_barn_2', 104),
    ('buildings/lumber_lv1', 'bld_lumber_1', 90), ('buildings/lumber_lv2_sawmill', 'bld_lumber_2', 104),
    ('buildings/quarry_lv1', 'bld_quarry_1', 100), ('buildings/quarry_lv2', 'bld_quarry_2', 106),
    ('buildings/tavern_lv1', 'bld_tavern_1', 90), ('buildings/tavern_lv2', 'bld_tavern_2', 96),
    ('buildings/market_lv1', 'bld_market_1', 72), ('buildings/market_lv2', 'bld_market_2', 104),
    ('buildings/tower_lv1_wood', 'bld_tower_1', 50), ('buildings/tower_lv2_stone', 'bld_tower_2', 56),
    ('buildings/townhall_lv2', 'bld_townhall_2', 110), ('buildings/townhall_lv3', 'bld_townhall_3', 120),
    ('buildings/house_hut_lv1', 'bld_house_1', 80), ('buildings/house_lv2', 'bld_house_2', 92),
]:
    single(rel, name, w)
    print(name)

# region prop sheets: 8 objects each (two rows of four), world widths per object
def sheet(rel, prefix, widths, holes=600):
    im = remove_white_bg(Image.open(os.path.join(P, rel + '.png')), holes=holes)
    bx = order_rows(components(im, gap=14, min_area=1500), row_tol=120)
    for i, b in enumerate(bx[:len(widths)]):
        to_game(im.crop(tuple(int(v) for v in b[:4])), width=widths[i] * R, crisp=False).save(os.path.join(OUT, f'{prefix}{i}.png'), optimize=True)
    print(prefix, len(bx))
sheet('props/haunted_autumn_sheet', 'pr_haunt', [46, 50, 46, 22, 30, 22, 22, 34])
sheet('props/lava_sheet', 'pr_lava', [34, 28, 40, 44, 44, 34, 26, 34])
sheet('props/snow_sheet', 'pr_snow', [30, 24, 36, 26, 18, 28, 22, 30])
sheet('props/dungeon_sheet', 'pr_dung', [20, 30, 26, 30, 22, 22, 28, 30])
sheet('props/village_props12', 'pr_vil', [26, 22, 20, 24, 22, 20, 22, 24, 22, 20, 22, 24])

# terrain / defense pieces (world widths)
sheet('terrain/bridges', 'pr_bridge', [96, 96, 96, 96], holes=300)
sheet('terrain/canopy_overhang', 'pr_canopy', [150, 150, 150, 150])
sheet('terrain/dungeon_walls', 'pr_dwall', [34, 34, 34, 34, 34, 34, 34, 34])
sheet('terrain/earth_ledge', 'pr_ledge', [34, 34, 34, 34, 22, 22, 34, 34])
sheet('terrain/grass_hills', 'pr_hill', [80, 52, 44, 70, 46, 32])
sheet('terrain/rock_cliff', 'pr_cliff', [36, 36, 36, 36, 36, 36, 36, 36])
sheet('terrain/shore_edges', 'pr_shore', [34, 34, 34, 34, 34, 34, 34, 34])
sheet('terrain/stairs_ramps', 'pr_stairs', [40, 40, 40, 40, 34, 40])
sheet('terrain/waterfall_4f', 'pr_fall', [48, 48, 48, 48])
sheet('buildings/defense_towers_traps', 'pr_def', [36, 36, 30, 22, 18, 26])
sheet('props/siege_weapons', 'pr_siege', [40, 44, 40, 40, 16, 22])
sheet('buildings/walls_sheet_wood_stone', 'pr_wall', [34, 30, 60, 34, 30, 60])
# parallax strips (stored wide, no 2x)
pim = remove_white_bg(Image.open(os.path.join(P, 'terrain/parallax_bg.png')), holes=0)
import numpy as _np
al = _np.asarray(pim)[:, :, 3] > 0; rows = _np.nonzero(al.any(1))[0]
cuts = []; s0 = rows[0]; pv = rows[0]
for r in rows[1:]:
    if r > pv + 6: cuts.append((s0, pv)); s0 = r
    pv = r
cuts.append((s0, pv))
for i, (a, b) in enumerate(cuts[:3]):
    c = pim.crop((0, a, pim.width, b + 1)); c = c.crop(c.getbbox()); c.save(os.path.join(OUT, f'bg_par{i}.png'), optimize=True)
print('parallax', len(cuts))
# concept art -> region splash
for n in ['village', 'haunted_forest', 'lava', 'snow', 'dungeon']:
    Image.open(os.path.join(P, 'concept', n + '.png')).convert('RGB').resize((800, 450), Image.LANCZOS).save(os.path.join(OUT, f'splash_{n}.jpg'), quality=82)
