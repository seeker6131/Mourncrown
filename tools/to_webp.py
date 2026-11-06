"""Convert game art in src/assets to LOSSLESS WebP (pixel-identical, ~30% smaller). Run after any importer.
python3 tools/to_webp.py"""
import glob, os
from PIL import Image
import numpy as np
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
n = 0
for f in glob.glob(os.path.join(ROOT, 'src', 'assets', '*', '*.png')):
    out = f[:-4] + '.webp'
    im = Image.open(f)
    im.save(out, 'WEBP', lossless=True, quality=100, method=6, exact=True)
    a, b = np.asarray(im.convert('RGBA')), np.asarray(Image.open(out).convert('RGBA'))
    assert a.shape == b.shape and (a[..., 3] == b[..., 3]).all() and (a[a[..., 3] > 0] == b[a[..., 3] > 0]).all(), f
    os.remove(f); n += 1
print('converted', n)
