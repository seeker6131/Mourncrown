"""PixelLab object zips (art-source/pixellab/objs/batch*.zip) -> src/assets/td/obj/<name>.png + objs.json (foot = bbox bottom).
Picks are by index in the combined listing (sorted zip names, then sorted png names), chosen from a contact sheet."""
import zipfile, json, io, glob, os
import numpy as np

def chimney(im):
    """Find a chimney: a narrow column block whose top rises abruptly above both neighbours. Returns [x, y] of its top or None."""
    a = np.asarray(im)[..., 3] > 0; h, w = a.shape
    top = np.array([np.argmax(a[:, x]) if a[:, x].any() else h for x in range(w)])
    best = None
    for x0 in range(2, w - 4):
        if top[x0] >= top[x0 - 2] - 3: continue          # abrupt rise on the left
        for x1 in range(x0 + 3, min(w - 2, x0 + 16)):
            if top[x1 + 1] >= top[x1] + 3 or (x1 + 2 < w and top[x1 + 2] >= top[x1] + 3):   # abrupt fall on the right
                seg = top[x0:x1 + 1]
                if seg.max() - seg.min() <= 4 and seg.min() < h * 0.5 and abs((x0 + x1) / 2 - w / 2) > w * 0.12:
                    cand = (int(seg.min()), (x0 + x1) // 2)
                    if best is None or cand[0] < best[0]: best = cand
                break
    return [best[1], best[0]] if best else None
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'src', 'assets', 'td', 'obj')
PICKS = {
    'oak': [155, 156, 157], 'pine': [159, 161, 162], 'dead': [150, 151],
    'bush': [37, 38, 39, 40, 41], 'rock': [29, 30, 31, 32, 33, 34, 35, 36], 'ore': [1, 2, 3, 4, 5, 6, 7],
    'fenceh': [48, 49], 'fencev': [53, 58, 59], 'lamp': [68, 70, 71, 74], 'well': [50, 51, 82], 'fire': [76, 77, 80],
    'crate': [85, 86, 88, 89], 'barrel': [91, 92, 93, 94], 'cart': [96, 97], 'stall': [100, 101, 102, 103, 104],
    'logs': [105, 106, 107, 133, 134], 'sign': [114, 117, 120, 121], 'stump': [140, 141, 144, 145, 148], 'hay': [26, 27, 28],
    'palisade': [108, 109, 110, 136, 137, 138, 139],
    'townhall': [21, 20, 163], 'house': [24, 23, 22], 'lumber': [19, 18, 17], 'quarry': [16, 15, 14],
    'reed': [165, 166, 167, 168], 'leaf': [169, 170, 171], 'pebble': [172, 173, 174, 175, 176, 177],
    'flower': [178, 180, 181, 182, 183], 'tuft': [164, 179],
    'barn': [13, 12, 11], 'forge': [10, 9, 8], 'site': [0],
}
CHIM = {'house_1': [58, 20], 'house_2': [58, 12], 'forge_1': [150, 14], 'tavern_0': [150, 30], 'tavern_1': [160, 25], 'kitchen_2': [48, 30]}  # eyeballed
def main():
    items = []
    for zp in sorted(glob.glob(os.path.join(ROOT, 'art-source', 'pixellab', 'objs', 'batch*.zip'))):
        z = zipfile.ZipFile(zp)
        for n in sorted(x for x in z.namelist() if x.endswith('.png')):
            items.append(Image.open(io.BytesIO(z.read(n))).convert('RGBA'))
    os.makedirs(OUT, exist_ok=True)
    meta = {}
    for k, idx in PICKS.items():
        for j, i in enumerate(idx):
            im = items[i]; bb = im.getbbox()
            name = f'{k}_{j}'; im.save(os.path.join(OUT, name + '.png'))
            meta[name] = {'w': im.width, 'h': im.height, 'foot': bb[3], 'x0': bb[0], 'x1': bb[2], 'top': bb[1]}
    # API-generated replacements (bigger, front-facing): art-source/pixellab/api/<name>.png
    API = os.path.join(ROOT, 'art-source', 'pixellab', 'api')
    if os.path.isdir(API):
        for f in sorted(os.listdir(API)):
            if not f.endswith('.png') or f.startswith('_'): continue
            name = f[:-4]
            if name.startswith('bld_'): name = name[4:]
            im = Image.open(os.path.join(API, f)).convert('RGBA'); bb = im.getbbox()
            if not bb: continue
            im = im.crop((0, 0, im.width, bb[3] + 1))
            im.save(os.path.join(OUT, name + '.png'))
            meta[name] = {'w': im.width, 'h': im.height, 'foot': bb[3], 'x0': bb[0], 'x1': bb[2], 'top': bb[1]}
            if f.startswith('bld_') and not name.startswith('tower'):
                c = CHIM.get(name) or chimney(im)
                if c: meta[name]['chim'] = c
    json.dump(meta, open(os.path.join(OUT, 'objs.json'), 'w'))
    print(len(meta), 'objects')
if __name__ == '__main__': main()
