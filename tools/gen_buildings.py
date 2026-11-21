"""Generate front-facing buildings via PixelLab API; reject slanted (isometric) results by mirror symmetry.
python3 -I tools/gen_buildings.py  -> art-source/pixellab/api/bld_<type>_<lv>.png"""
import sys, os, base64, io, json, concurrent.futures as cf
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pixellab_api as P
from PIL import Image
import numpy as np
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'art-source', 'pixellab', 'api'); os.makedirs(OUT, exist_ok=True)
ref = Image.open(os.path.join(ROOT, 'src/assets/td/obj/house_1.png')).convert('RGBA'); b = io.BytesIO(); ref.save(b, 'PNG')
CI = {'type': 'base64', 'base64': base64.b64encode(b.getvalue()).decode()}
TAIL = ("building only, no ground around it, seen from the front and above, symmetrical front facade facing the viewer, gable end facing the viewer, "
        "door in the centre, roof seen from above, not isometric, no corner facing the viewer, top-down pixel art, muted desaturated dark-forest colours, soft shading")
BLD = [('townhall', 'village town hall with a bell tower and banners'), ('house', 'villager cottage with a chimney and flower boxes'),
       ('lumber', 'timber sawmill shed with a big circular saw and stacked logs under its roof'), ('quarry', 'stone-cutting shed with a wooden crane and cut stone blocks'),
       ('barn', 'red wooden animal barn with a hay loft door'), ('forge', 'open-fronted blacksmith forge with a stone chimney, anvil and glowing furnace'),
       ('kitchen', 'cookhouse with a smoking chimney and a big cauldron by the door'), ('warehouse', 'wide storehouse with big double doors and crates'),
       ('tavern', 'tavern inn with a hanging sign and warm lit windows, wide front facade'), ('market', 'covered market hall with faded striped awnings and goods on tables'),
       ('tower', None)]
LV = [(0, 192, 'small humble rustic version, simple wood and straw'), (1, 192, 'medium sturdier version with stone foundation and tiled roof'),
      (2, 192, 'grand version, larger, stone and dark slate roof, gold trim, banners and lanterns')]
TOWER = ['small wooden watchtower', 'stone defence tower with a ballista on top', 'tall stone defence tower with a glowing blue crystal on top']

def sym(path):
    """1 = front-facing (flat bottom edge), lower = slanted (V-shaped bottom of an isometric corner) or opaque background."""
    a = np.asarray(Image.open(path).convert('RGBA'))[..., 3] > 0
    if a.mean() > 0.97: return 0.0
    ys, xs = np.nonzero(a); a = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]; h, w = a.shape
    bot = np.array([np.nonzero(a[:, x])[0].max() if a[:, x].any() else -1 for x in range(w)])
    c = bot[int(w * 0.45):int(w * 0.55)].mean(); side = (bot[int(w * 0.15):int(w * 0.25)].mean() + bot[int(w * 0.75):int(w * 0.85)].mean()) / 2
    return 1 - abs(c - side) / h * 8

def one(key, desc, size, tries=7):
    out = os.path.join(OUT, key + '.png')
    if os.path.exists(out): return key, 'exists'
    best = (0, None)
    for t in range(tries):
        tmp = os.path.join(OUT, f'_{key}_{t}.png')
        try: P.map_object(f'{desc}, {TAIL}', size, size, tmp, 'high top-down', color_image=CI)
        except Exception as e: print(key, 'err', e, file=sys.stderr); continue
        s = sym(tmp)
        if s > best[0]: best = (s, tmp)
        if s >= 0.88: break
    if best[1]: os.replace(best[1], out)
    for f in os.listdir(OUT):
        if f.startswith(f'_{key}_'): os.remove(os.path.join(OUT, f))
    return key, round(best[0], 3)

if __name__ == '__main__':
    jobs = []
    for k, d in BLD:
        for lv, size, extra in LV:
            desc = TOWER[lv] if k == 'tower' else f'{d}, {extra}'
            jobs.append((f'bld_{k}_{lv}', desc, size))
    jobs.append(('bld_site_0', 'building construction site with a timber frame, scaffolding, ladders and lumber stacks', 192))
    with cf.ThreadPoolExecutor(4) as ex:
        for r in ex.map(lambda j: one(*j), jobs): print(*r, flush=True)
    print(P.call('GET', '/balance'))
