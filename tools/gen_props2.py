"""Map dressing props per land (PixelLab map-objects, 'high top-down', house_1 as the colour reference) ->
art-source/pixellab/guild/pp_<land>_<name>.png, then tools/import_guild_art.py puts them in src/assets/td/obj.
Natural shapes (rocks, trees, bones, crystals) need no sketch; the game places them per land (TopDownScene.placeLandProps).
python3 -I tools/gen_props2.py [key ...]
"""
import os, sys, concurrent.futures as cf
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pixellab_api as P
from gen_buildings import CI

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'art-source', 'pixellab', 'guild')
TAIL = (', a single object, seen from the front and slightly above like a classic 2D top-down RPG, upright, not isometric, '
        'no ground around it, pixel art, muted desaturated dark-forest colours, soft shading')
JOBS = [
    # forest (Eldergrove)
    ('pp_forest_log', 'a fallen mossy tree log lying horizontally with ferns growing on it', 64),
    ('pp_forest_shrooms', 'a cluster of big red-capped forest mushrooms', 40),
    ('pp_forest_boulder', 'a big mossy grey boulder with small flowers at its base', 56),
    ('pp_forest_berry', 'a round bush with red berries', 40),
    ('pp_forest_stumpshroom', 'an old tree stump with little glowing mushrooms growing on it', 40),
    ('pp_forest_ruin', 'a broken mossy ancient stone pillar ruin with ivy', 56),
    ('pp_forest_flowers', 'a patch of wild blue and yellow flowers and grass', 32),
    ('pp_forest_birch', 'a slender white birch tree with yellow-green leaves', 96),
    ('pp_forest_willow', 'a drooping willow tree with long hanging branches', 112),
    ('pp_forest_rockpile', 'a small pile of grey stones with moss', 40),
    # haunted woods
    ('pp_haunt_grave1', 'an old cracked tombstone with a rounded top, leaning slightly', 40),
    ('pp_haunt_grave2', 'a weathered stone cross grave marker with ivy', 40),
    ('pp_haunt_crypt', 'a small dark stone crypt with an iron door and a skull carving', 80),
    ('pp_haunt_skulls', 'a pile of old skulls and bones', 40),
    ('pp_haunt_lantern', 'a crooked iron lantern post with an eerie green ghost flame inside', 48),
    ('pp_haunt_glowshroom', 'a cluster of glowing purple ghost mushrooms', 32),
    ('pp_haunt_fence', 'a broken rusty iron graveyard fence section', 56),
    ('pp_haunt_coffin', 'an old wooden coffin standing upright, half open', 48),
    ('pp_haunt_scarecrow', 'a creepy crooked scarecrow with a burlap sack face on a wooden pole', 56),
    ('pp_haunt_tree', 'a twisted dead black tree with a hollow face-like knot and bare clawing branches', 112),
    ('pp_haunt_web', 'a dead thorny bush covered in thick cobwebs', 40),
    # lava lands
    ('pp_lava_spike', 'a tall jagged black obsidian rock spike', 56),
    ('pp_lava_vent', 'a volcanic rock vent with glowing orange lava cracks and a little smoke', 56),
    ('pp_lava_tree', 'a charred burnt dead tree with glowing embers in its cracks', 96),
    ('pp_lava_ribs', 'a huge charred beast ribcage skeleton half buried', 80),
    ('pp_lava_crystal', 'a cluster of glowing orange fire crystals', 40),
    ('pp_lava_boulder', 'a big dark volcanic boulder with cooling magma veins', 56),
    ('pp_lava_bones', 'scattered blackened bones and a horned skull', 40),
    ('pp_lava_pillar', 'a cracked ancient basalt pillar ruin glowing faintly red', 64),
    # snow mountain
    ('pp_snow_pine', 'a snow-covered dark pine tree heavy with snow', 96),
    ('pp_snow_pine2', 'a small young pine tree dusted with snow', 64),
    ('pp_snow_crystal', 'a cluster of pale blue ice crystals', 40),
    ('pp_snow_boulder', 'a grey boulder with a thick snow cap and icicles', 56),
    ('pp_snow_snowman', 'a lopsided old snowman with a carrot nose and a ragged scarf', 48),
    ('pp_snow_bush', 'a frozen dead bush covered in frost', 40),
    ('pp_snow_spike', 'a tall jagged ice spike sticking out of the snow', 56),
    ('pp_snow_log', 'a snow-covered fallen log', 56),
    ('pp_snow_statue', 'a frozen stone warrior statue covered in ice and snow', 64),
    # dungeon (abyss prison)
    ('pp_dung_chains', 'rusty chains and shackles hanging on a stone block', 48),
    ('pp_dung_torch', 'a stone pillar with a burning wall torch', 64),
    ('pp_dung_pillar', 'a cracked dark stone dungeon pillar', 72),
    ('pp_dung_cage', 'a rusty iron hanging cage on a post with a skeleton inside', 64),
    ('pp_dung_rubble', 'a pile of fallen stone bricks and rubble', 48),
    ('pp_dung_bones', 'a pile of bones with a rusty helmet', 40),
    ('pp_dung_spike', 'a skull on a wooden spike', 40),
    ('pp_dung_barrel', 'a broken rotting wooden barrel spilling dark slime', 40),
    ('pp_dung_rack', 'a rusty broken weapon rack with old swords', 56),
    ('pp_dung_altar', 'a dark stone altar with purple candles and a carved skull', 64),
    # Deepwild jungle
    ('pp_wild_flower', 'a giant tropical red jungle flower plant', 48),
    ('pp_wild_vinerock', 'a big rock covered in green jungle vines and flowers', 56),
    ('pp_wild_hollowlog', 'a big hollow fallen jungle log with moss', 72),
    ('pp_wild_shroomring', 'a ring of small white mushrooms on moss', 40),
    ('pp_wild_bamboo', 'a tall clump of green bamboo stalks', 72),
    ('pp_wild_totem', 'an old carved wooden jungle totem pole with moss', 72),
    ('pp_wild_bush', 'a dense tropical bush with big leaves', 48),
    # villages
    ('pp_vil_produce', 'a wooden crate full of apples, carrots and cabbages', 40),
    ('pp_vil_pumpkins', 'a small pumpkin patch with three orange pumpkins and leaves', 48),
    ('pp_vil_flowerbarrel', 'a wooden half barrel planter full of red and white flowers', 40),
    ('pp_vil_wheelbarrow', 'a wooden wheelbarrow loaded with firewood, seen from the side', 48),
    ('pp_vil_haystack', 'a round golden haystack', 48),
    ('pp_vil_coop', 'a small wooden chicken coop with a red roof and a ramp', 56),
    ('pp_vil_appletree', 'a round apple tree with red apples', 96),
    ('pp_vil_sacks', 'a pile of grain sacks next to a small wooden crate', 48),
    ('pp_vil_firepit', 'a stone ring campfire pit with logs and a cooking pot on a tripod', 48),
    ('pp_vil_bench', 'a small wooden log bench', 40),
]


def one(key, desc, size):
    out = os.path.join(OUT, key + '.png')
    if os.path.exists(out): return key, 'exists'
    try: P.map_object(desc + TAIL, size, size, out, 'high top-down', color_image=CI); return key, 'ok'
    except Exception as e: return key, f'err {e}'


if __name__ == '__main__':
    only = set(sys.argv[1:])
    b0 = P.call('GET', '/balance')['credits']['usd']
    with cf.ThreadPoolExecutor(3) as ex:
        for r in ex.map(lambda j: one(*j), [j for j in JOBS if not only or j[0] in only]): print(*r, flush=True)
    print(f"BALANCE ${b0:.3f} -> ${P.call('GET', '/balance')['credits']['usd']:.3f}", flush=True)
