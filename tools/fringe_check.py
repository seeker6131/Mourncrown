"""Report white/light fringe pixels on sprite silhouettes. python3 tools/fringe_check.py [min_count]"""
import glob, os, sys
import numpy as np
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
lim = int(sys.argv[1]) if len(sys.argv) > 1 else 15
bad = []
for f in sorted(glob.glob(os.path.join(ROOT, 'src', 'assets', '*', '*.webp')) + glob.glob(os.path.join(ROOT, 'src', 'assets', '*', '*.png'))):
    if '/fx' in f or 'fx2_' in f or 'fx_' in os.path.basename(f) or 'env_smoke' in f: continue
    a = np.asarray(Image.open(f).convert('RGBA')).astype(np.int16)
    al = a[..., 3] > 0
    pad = np.pad(al, 1)
    edge = al & ~(pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:])
    rgb = a[..., :3]
    light = (rgb.min(2) > 200) & ((rgb.max(2) - rgb.min(2)) < 30)
    n = int((edge & light).sum()); e = int(edge.sum())
    if n >= lim: bad.append((n, round(n / max(e, 1) * 100, 1), os.path.relpath(f, ROOT)))
for b in sorted(bad, reverse=True): print(*b)
print('files flagged:', len(bad))
