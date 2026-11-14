"""art-source/pixellab/vfx/*.png -> src/assets/vfx/*.png (trimmed) + white copies (fx_circle_w, fx_blast_w) that can be tinted any colour."""
import os
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art-source', 'pixellab', 'vfx'); OUT = os.path.join(ROOT, 'src', 'assets', 'vfx'); os.makedirs(OUT, exist_ok=True)
def white(im):
    px = im.load(); out = Image.new('RGBA', im.size)
    po = out.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]; l = int(min(255, (0.3 * r + 0.59 * g + 0.11 * b) * 1.6)); po[x, y] = (l, l, l, a)
    return out
for f in sorted(os.listdir(SRC)):
    if not f.endswith('.png'): continue
    im = Image.open(os.path.join(SRC, f)).convert('RGBA'); bb = im.getbbox()
    if bb: im = im.crop(bb)
    im.save(os.path.join(OUT, f))
    if f in ('fx_circle.png', 'fx_blast_arcane.png'): white(im).save(os.path.join(OUT, f.replace('.png', '_w.png').replace('_arcane', '')))
print(sorted(os.listdir(OUT)))
