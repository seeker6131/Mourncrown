"""PixelLab character zip -> top-down sprite sheets for the TopDown scene.
usage: python3 tools/import_td.py <zip> <key>
writes src/assets/td/<key>_idle.webp (8 directions in one row) and <key>_<anim>.webp (rows = directions, cols = frames)."""
import sys, os, zipfile, io, re
from PIL import Image
DIRS = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west']
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'src', 'assets', 'td')

def main(zpath, key):
    os.makedirs(OUT, exist_ok=True)
    z = zipfile.ZipFile(zpath)
    names = z.namelist()
    load = lambda n: Image.open(io.BytesIO(z.read(n))).convert('RGBA')
    rot = {d: next(n for n in names if n.endswith(f'rotations/{d}.png')) for d in DIRS}
    ims = [load(rot[d]) for d in DIRS]; w, h = ims[0].size
    sheet = Image.new('RGBA', (w * 8, h))
    for i, im in enumerate(ims): sheet.paste(im, (i * w, 0))
    sheet.save(os.path.join(OUT, f'{key}_idle.webp'), lossless=True)
    anims = sorted({m.group(1) for n in names for m in [re.search(r'animations/([^/]+)/', n)] if m})
    for a in anims:
        frames = {d: sorted(n for n in names if f'animations/{a}/{d}/' in n and n.endswith('.png')) for d in DIRS}
        nf = max(len(v) for v in frames.values()); fw, fh = load(frames['south'][0]).size
        sh = Image.new('RGBA', (fw * nf, fh * 8))
        for r, d in enumerate(DIRS):
            for c, n in enumerate(frames[d]): sh.paste(load(n), (c * fw, r * fh))
        slug = re.sub(r'[^a-z0-9]+', '_', a.lower()).strip('_')
        sh.save(os.path.join(OUT, f'{key}_{slug}.webp'), lossless=True)
        print(key, a, nf, 'frames', fw, fh)
    print(key, 'idle', w, h)

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
