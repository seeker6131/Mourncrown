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
