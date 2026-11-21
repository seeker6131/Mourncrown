"""art-source/pixellab/skills/<id>.png -> src/assets/skills/<id>.webp (trimmed, centred on a square canvas)."""
import os
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art-source', 'pixellab', 'skills'); OUT = os.path.join(ROOT, 'src', 'assets', 'skills')
os.makedirs(OUT, exist_ok=True)
for f in sorted(os.listdir(SRC)):
    if not f.endswith('.png'): continue
    im = Image.open(os.path.join(SRC, f)).convert('RGBA'); im = im.crop(im.getbbox())
    n = max(im.size) + 4; sq = Image.new('RGBA', (n, n)); sq.paste(im, ((n - im.width) // 2, (n - im.height) // 2))
    sq.save(os.path.join(OUT, f[:-4] + '.webp'), lossless=True)
print(len(os.listdir(OUT)), 'icons')
