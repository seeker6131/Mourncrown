"""Re-generate slanted props as straight front-facing (reject slanted by flat bottom edge)."""
import sys, os, concurrent.futures as cf
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pixellab_api as P
from gen_buildings import sym, CI, OUT
T = (", seen from the front and above, straight front view facing the viewer, horizontal and symmetrical, not rotated, not diagonal, not isometric, "
     "top-down pixel art, muted desaturated dark-forest colours, soft shading")
JOBS = [('stall_0', 'small wooden market stall with a faded red and cream striped awning and baskets of fruit on the counter', 80),
        ('stall_1', 'small wooden market stall with a faded green and cream striped awning and cloth bolts on the counter', 80),
        ('logs_0', 'small neat pile of cut logs stacked horizontally, round log ends facing the viewer', 48),
        ('cart_0', 'small wooden hand cart with two wheels seen from the front', 48)]
def one(k, d, s):
    best = (-9, None)
    for t in range(6):
        tmp = os.path.join(OUT, f'_{k}_{t}.png')
        try: P.map_object(d + T, s, s, tmp, 'high top-down', color_image=CI)
        except Exception as e: print(k, e); continue
        v = sym(tmp)
        if v > best[0]: best = (v, tmp)
        if v >= 0.9: break
    if best[1]: os.replace(best[1], os.path.join(OUT, k + '.png'))
    for f in os.listdir(OUT):
        if f.startswith(f'_{k}_'): os.remove(os.path.join(OUT, f))
    return k, round(best[0], 3)
with cf.ThreadPoolExecutor(2) as ex:
    for r in ex.map(lambda j: one(*j), JOBS): print(*r, flush=True)
