"""🔥 Fire footprints (fashion, director 2026-11-13): an animated burning sole print for the trail (src/world/fireSteps.ts).
Made with PixelLab's VFX artist ('lite', about half a cent each) — two around our own sole-shaped print (so it reads as a
footprint), one drawn freely. python3 -I tools/gen_firestep.py  -> art-source/pixellab/vfx2/fx_firestep*.png/.json/.gif"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gen_vfx2 as V
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art-source', 'pixellab', 'firestep'); os.makedirs(SRC, exist_ok=True)
# the sole print (the same shape as the code-drawn one), 3x, on a 64x64 canvas, toes up
SOLE = ['....####....', '...######...', '..########..', '..########..', '..#######...', '...######...', '...#####....', '...#####....', '...######...', '..#######...', '..########..', '..########..', '...######...', '....####....']
im = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
for y, row in enumerate(SOLE):
    for x, ch in enumerate(row):
        if ch == '#':
            for dy in range(3):
                for dx in range(3): im.putpixel((14 + x * 3 + dx, 11 + y * 3 + dy), (58, 12, 4, 255))
im.save(os.path.join(SRC, 'fs_sole.png'))
V.G = SRC
JOBS = [
    ('fx_firestep_a', 'small orange and yellow flames flickering up from this burnt footprint on the ground, its edges glowing hot red-orange like embers, a few sparks rising, seamless loop, about 0.8 seconds, keep the footprint shape clearly visible', 'fs_sole'),
    ('fx_firestep_b', 'this footprint is a scorched mark burning on the ground: a glowing molten orange rim, low licking flames of orange and gold dancing on it, tiny embers floating up, seamless loop, 1 second', 'fs_sole'),
    ('fx_firestep_c', 'a single burning footprint left on the ground seen from the front and above: an oval sole-shaped scorch mark without toes, glowing orange-red at the edges, with small orange and yellow flames flickering up from it and a few embers, seamless loop, 0.8 seconds, small and readable', None),
]
if __name__ == '__main__':
    b0 = V.P.call('GET', '/balance')['credits']['usd']
    if b0 < 0.05: sys.exit(f'balance too low: ${b0:.3f}')
    for j in JOBS: print(*V.one(*j), flush=True)
    b1 = V.P.call('GET', '/balance')['credits']['usd']
    print(f'BALANCE ${b0:.3f} -> ${b1:.3f} (used ${b0 - b1:.3f})', flush=True)
