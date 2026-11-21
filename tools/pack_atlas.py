"""Pack many small pictures into a few atlas pages (director: faster loading — hundreds of separate files -> a handful).
Frames are stored whole (no trimming) with 2 px gaps, so every picture keeps its exact size and metadata (objs.json).
python3 -I tools/pack_atlas.py   -> src/assets/td/atlas/<set>_<n>.webp + .json (Phaser JSON hash); run after importing art."""
import os, glob, json
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'src', 'assets', 'td', 'atlas'); os.makedirs(OUT, exist_ok=True)
SETS = {   # name: (source glob, frame name from file name)
    'obj': os.path.join(ROOT, 'src', 'assets', 'td', 'obj', '*.png'),
    'icon': os.path.join(ROOT, 'src', 'assets', 'icons', '*.webp'),
    'skill': os.path.join(ROOT, 'src', 'assets', 'skills', '*.webp'),
}
PAGE, GAP = 2048, 2

def pack(name, pattern):
    for f in glob.glob(os.path.join(OUT, f'{name}_*')): os.remove(f)
    ims = sorted(((os.path.splitext(os.path.basename(p))[0], Image.open(p).convert('RGBA')) for p in glob.glob(pattern)), key=lambda t: (-t[1].height, -t[1].width))
    pages, cur, frames = [], None, None
    def new_page():
        nonlocal cur, frames
        cur = {'img': Image.new('RGBA', (PAGE, PAGE)), 'x': GAP, 'y': GAP, 'row': 0, 'w': 0, 'h': 0}; frames = {}; pages.append((cur, frames))
    new_page()
    for n, im in ims:
        w, h = im.size
        if cur['x'] + w + GAP > PAGE: cur['x'] = GAP; cur['y'] += cur['row'] + GAP; cur['row'] = 0
        if cur['y'] + h + GAP > PAGE: new_page()
        x, y = cur['x'], cur['y']; cur['img'].paste(im, (x, y))
        frames[n] = {'frame': {'x': x, 'y': y, 'w': w, 'h': h}, 'rotated': False, 'trimmed': False, 'spriteSourceSize': {'x': 0, 'y': 0, 'w': w, 'h': h}, 'sourceSize': {'w': w, 'h': h}}
        cur['x'] += w + GAP; cur['row'] = max(cur['row'], h); cur['w'] = max(cur['w'], x + w + GAP); cur['h'] = max(cur['h'], y + h + GAP)
    for i, (pg, fr) in enumerate(pages):
        img = pg['img'].crop((0, 0, pg['w'], pg['h'])); fn = f'{name}_{i}.webp'
        img.save(os.path.join(OUT, fn), lossless=True, method=6)
        json.dump({'frames': fr, 'meta': {'image': fn, 'size': {'w': img.width, 'h': img.height}, 'scale': 1}}, open(os.path.join(OUT, f'{name}_{i}.json'), 'w'))
    print(name, len(ims), 'pictures ->', len(pages), 'pages', [os.path.getsize(os.path.join(OUT, f'{name}_{i}.webp')) // 1024 for i in range(len(pages))], 'KB')

if __name__ == '__main__':
    for k, v in SETS.items(): pack(k, v)
