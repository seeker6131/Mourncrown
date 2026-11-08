"""PixelLab object zips (art-source/pixellab/objs/batch*.zip) -> src/assets/td/obj/<name>.png + objs.json (foot = bbox bottom).
Picks are by index in the combined listing (sorted zip names, then sorted png names), chosen from a contact sheet."""
import zipfile, json, io, glob, os
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'src', 'assets', 'td', 'obj')
PICKS = {
    'oak': [155, 156, 157], 'pine': [159, 161, 162, 160], 'dead': [150, 151, 152, 153, 154, 25],
    'bush': [37, 38, 39, 40, 41], 'rock': [29, 30, 31, 32, 33, 34, 35, 36], 'ore': [1, 2, 3, 4, 5, 6, 7],
    'fenceh': [48, 49], 'fencev': [53, 58, 59], 'lamp': [68, 70, 71, 74], 'well': [50, 51, 82], 'fire': [76, 77, 80],
    'crate': [85, 86, 88, 89], 'barrel': [91, 92, 93, 94], 'cart': [96, 97], 'stall': [100, 101, 102, 103, 104],
    'logs': [105, 106, 107, 133, 134], 'sign': [114, 117, 120, 121], 'stump': [140, 141, 144, 145, 148], 'hay': [26, 27, 28],
    'palisade': [108, 109, 110, 136, 137, 138, 139],
    'townhall': [21, 20, 163], 'house': [24, 23, 22], 'lumber': [19, 18, 17], 'quarry': [16, 15, 14],
    'barn': [13, 12, 11], 'forge': [10, 9, 8], 'site': [0],
}
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
    json.dump(meta, open(os.path.join(OUT, 'objs.json'), 'w'))
    print(len(meta), 'objects')
if __name__ == '__main__': main()
