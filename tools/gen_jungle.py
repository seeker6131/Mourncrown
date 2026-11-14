"""Jungle gathering map art (PixelLab map-objects) -> art-source/pixellab/api/<key>.png (then run import_td_objs.py)."""
import sys, os, concurrent.futures as cf
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pixellab_api as P
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'art-source', 'pixellab', 'api'); os.makedirs(OUT, exist_ok=True)
T = ", top-down pixel art, lush deep jungle colours, rich greens, soft shading"
JOBS = [
 ('jtree_0', 'giant ancient jungle tree with huge buttress roots, hanging vines and a broad lush emerald canopy', 192),
 ('jtree_1', 'tall tropical rainforest tree with moss covered trunk, lianas and a dense layered dark green canopy', 192),
 ('jtree_2', 'huge banyan tree with many aerial roots and a wide bright green canopy', 192),
 ('palm_0', 'tropical fan palm tree with big fronds', 160),
 ('fern_0', 'large lush jungle fern bush', 64),
 ('fern_1', 'big leafy tropical plant with broad elephant ear leaves', 64),
 ('pit_0', 'large open pit mine dug into the ground seen from above, terraced grey rock walls going down, wooden ladders and plank scaffolding, ore rocks at the bottom', 256),
 ('pit_1', 'big round quarry crater in the earth seen from above, stepped stone ledges, wooden walkway and a crane winch at the rim', 256),
 ('mine_0', 'mine tunnel entrance in a rocky hillside with a timber frame, lanterns and a minecart on rails', 160),
 ('vein_0', 'cluster of glowing purple amethyst crystals growing out of a dark rock', 64),
 ('vein_1', 'cluster of glowing icy blue crystals growing out of a grey rock', 64),
 ('vein_2', 'rock with shining gold ore veins and gold nuggets', 64),
 ('vein_3', 'cluster of glowing red magma crystals growing out of black rock', 64),
]
def one(k, d, s):
    out = os.path.join(OUT, k + '.png')
    if os.path.exists(out): return k, 'exists'
    try: P.map_object(d + T, s, s, out, 'low top-down'); return k, 'ok'
    except Exception as e: return k, f'err {e}'
with cf.ThreadPoolExecutor(3) as ex:
    for r in ex.map(lambda j: one(*j), JOBS): print(*r, flush=True)
