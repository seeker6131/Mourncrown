"""Big trees and structures via PixelLab map-objects (transparent, low top-down). -> art-source/pixellab/api/<key>.png"""
import sys, os, concurrent.futures as cf
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pixellab_api as P
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'art-source', 'pixellab', 'api'); os.makedirs(OUT, exist_ok=True)
T = ", top-down pixel art, muted desaturated dark-forest colours, soft shading"
JOBS = []
for i in range(3): JOBS.append((f'oak_{i}', 'big old round oak tree with a dense dark moss-green canopy, thick gnarled trunk and visible roots at the base', 192))
for i in range(3): JOBS.append((f'pine_{i}', 'tall dark teal-green pine tree with a straight visible trunk at the base', 160))
for i in range(2): JOBS.append((f'dead_{i}', 'large bare dead tree with twisted grey branches and a thick trunk', 160))
JOBS += [('lamp_0', 'wooden lamp post with a hanging glowing lantern', 64), ('well_0', 'round stone well with a small wooden roof and bucket', 64),
         ('stall_0', 'market stall with a faded striped awning and baskets of goods', 96), ('stall_1', 'market stall with a faded green awning and cloth bolts', 96),
         ('cart_0', 'wooden hand cart with two wheels', 64), ('sign_0', 'wooden direction sign post', 48), ('logs_0', 'pile of cut logs', 64),
         ('bridge_0', 'wooden plank bridge seen directly from above, planks running across from top to bottom, rope railings on the left and right sides, long horizontal bridge crossing a river from left to right', 128)]
def one(k, d, s):
    out = os.path.join(OUT, k + '.png')
    if os.path.exists(out): return k, 'exists'
    try: P.map_object(d + T, s, s, out, 'low top-down'); return k, 'ok'
    except Exception as e: return k, f'err {e}'
with cf.ThreadPoolExecutor(3) as ex:
    for r in ex.map(lambda j: one(*j), JOBS): print(*r, flush=True)
