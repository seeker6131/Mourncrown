"""⛈ Storm cloud pet (fashion, director 2026-11-13): a little dark-grey thundercloud with a face that floats after the
hero, lightning flickering inside it, bobbing gently. PixelLab VFX 'lite' (about half a cent each), three faces to choose.
python3 -I tools/gen_cloudpet.py  -> art-source/pixellab/vfx2/fx_cloud_a/b/c.png/.json/.gif"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gen_vfx2 as V

BASE = 'a small cute storm cloud spirit pet floating in the air beside a hero: a puffy dark grey and charcoal thundercloud with a face, '
LOOP = ', the cloud bobs gently up and down and its puffy edges billow slightly, seamless loop, about 1.5 seconds, one small cloud in the middle with empty space around it'
CROWN = 'a cute storm cloud spirit pet about 40 pixels wide floating in the air: a big puffy round cloud of dark purple and charcoal black, a small shining gold royal crown with red gems sitting tilted on top of the cloud, a face on the cloud: '
EDGE = ', bright violet and pink-white lightning crackling around the edges of the cloud and flickering inside it, the cloud bobs gently up and down and its puffs billow slightly, seamless loop, about 1.5 seconds, one cloud in the middle with empty space around it'
JOBS = [
    ('fx_cloud_a', BASE + 'two round glowing white eyes and a small grumpy frown, thin yellow-white lightning flickering inside the cloud every so often lighting it up from within' + LOOP, None),
    ('fx_cloud_b', BASE + 'cheeky narrow glowing eyes and a mischievous grin, little zigzag lightning sparks crackling inside and a tiny bolt zapping out underneath now and then' + LOOP, None),
    ('fx_cloud_c', BASE + 'sleepy angry half-closed glowing eyes, violet-white lightning flashing deep inside the dark cloud with a soft purple glow, a few tiny raindrops falling' + LOOP, None),
    # director's brief (round 2): purple-black cloud, violet lightning around it, a crown instead of a hat — our own face
    # (NOT a copy of any existing character: no wide toothy grin / half-closed smug eyes / moustache shape)
    ('fx_cloud_d', CROWN + 'two round glowing amber eyes and a small sly smirk showing one tiny fang' + EDGE, None),
    ('fx_cloud_e', CROWN + 'fierce slanted glowing violet eyes under stormy brows and a small open shouting mouth' + EDGE, None),
    ('fx_cloud_f', CROWN + 'proud closed eyes curved like little arcs and a smug tiny smile, cheeks puffed' + EDGE, None),
]
if __name__ == '__main__':
    b0 = V.P.call('GET', '/balance')['credits']['usd']
    if b0 < 0.05: sys.exit(f'balance too low: ${b0:.3f}')
    only = set(sys.argv[1:])
    for j in JOBS:
        if not only or j[0] in only: print(*V.one(*j), flush=True)
    b1 = V.P.call('GET', '/balance')['credits']['usd']
    print(f'BALANCE ${b0:.3f} -> ${b1:.3f} (used ${b0 - b1:.3f})', flush=True)
