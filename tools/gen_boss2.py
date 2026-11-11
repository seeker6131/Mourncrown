"""Finish the bosses: the remade Obsidian Serpent (bs3b: attack / special / die, facing south, east, north - west is
the east flipped by the importer) and the missing walk directions of the Hollow King (bs5: north, west).
python3 -I tools/gen_boss2.py [key:anim ...]       zips -> art-source/pixellab/chars/<key>.zip"""
import os, sys, concurrent.futures as cf
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gen_anim as A
PM = lambda act: {'mode': 'pixminimax', 'frame_count': 8, 'action_description': act}
JOBS = [
    ('bs3b', 'attack', ['east', 'north'], PM('rearing up and striking forward with its jaws')),
    ('bs3b', 'special', ['south', 'east', 'north'], PM('rearing its head back, then breathing a wide stream of molten fire forward from its open jaws')),
    ('bs3b', 'die', ['south', 'east', 'north'], PM('roaring in pain, then collapsing flat onto the ground as its lava glow fades into cold dark stone')),
    ('bs5', 'walk', ['north', 'west'], PM('walking forward')),
    # diagonal walks (round 2): same action text as each boss's first walk, added to the same animation
    ('bs1', 'walk', ['south-east', 'north-east', 'north-west', 'south-west'], PM('dragging forward on roots')),
    ('bs2', 'walk', ['south-east', 'north-east', 'north-west', 'south-west'], PM('walking')),
    ('bs4', 'walk', ['south-east', 'north-east', 'north-west', 'south-west'], PM('stomping forward')),
    ('bs5', 'walk', ['south-east', 'north-east', 'north-west', 'south-west'], PM('walking forward')),
    ('bs3b', 'walk', ['south-east', 'north-east'], PM('slithering forward slowly, wings slightly moving')),   # west side = mirrored
]
if __name__ == '__main__':
    want = set(sys.argv[1:]); jobs = [j for j in JOBS if not want or f'{j[0]}:{j[1]}' in want]
    b0 = A.bal()
    with cf.ThreadPoolExecutor(3) as ex:
        for j, r in zip(jobs, ex.map(lambda j: A.animate(*j), jobs)): print(j[0], j[1], r, flush=True)
    for k in sorted({j[0] for j in jobs}): print('zip', k, A.zip_of(k))
    b1 = A.bal(); print(f'BOSS2 BALANCE ${b0} -> ${b1}  (used ${b0 - b1:.4f})', flush=True)
