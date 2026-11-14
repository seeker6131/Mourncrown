"""⛈ Storm cloud pet (fashion, director 2026-11-13): a little dark-grey thundercloud with a face that floats after the
hero, lightning flickering inside it, bobbing gently. PixelLab VFX 'lite' (about half a cent each), three faces to choose.
python3 -I tools/gen_cloudpet.py  -> art-source/pixellab/vfx2/fx_cloud_a/b/c.png/.json/.gif"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gen_vfx2 as V
V.G = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'art-source', 'pixellab', 'cloudpet')   # (our cloud base)

BASE = 'a small cute storm cloud spirit pet floating in the air beside a hero: a puffy dark grey and charcoal thundercloud with a face, '
LOOP = ', the cloud bobs gently up and down and its puffy edges billow slightly, seamless loop, about 1.5 seconds, one small cloud in the middle with empty space around it'
CROWN = 'a cute storm cloud spirit pet about 40 pixels wide floating in the air: a big puffy round cloud of dark purple and charcoal black, a small shining gold royal crown with red gems sitting tilted on top of the cloud, a face on the cloud: '
EDGE = ', bright violet and pink-white lightning crackling around the edges of the cloud and flickering inside it, the cloud bobs gently up and down and its puffs billow slightly, seamless loop, about 1.5 seconds, one cloud in the middle with empty space around it'
SYM = ', bright violet and pink-white lightning crackling around the edges of the cloud and flickering inside it, the cloud bobs gently up and down and its puffs breathe a little, keep the cloud perfectly round and left-right symmetrical, seamless loop, about 1.5 seconds'
KEEP = '; add bright violet and pink-white lightning bolts crackling around the edges of the cloud on both sides and small sparks flickering over it, the whole cloud bobs gently up and down and breathes slightly, seamless loop, about 1.5 seconds'
JOBS = [
    ('fx_cloud_a', BASE + 'two round glowing white eyes and a small grumpy frown, thin yellow-white lightning flickering inside the cloud every so often lighting it up from within' + LOOP, None),
    ('fx_cloud_b', BASE + 'cheeky narrow glowing eyes and a mischievous grin, little zigzag lightning sparks crackling inside and a tiny bolt zapping out underneath now and then' + LOOP, None),
    ('fx_cloud_c', BASE + 'sleepy angry half-closed glowing eyes, violet-white lightning flashing deep inside the dark cloud with a soft purple glow, a few tiny raindrops falling' + LOOP, None),
    # director's brief (round 2): purple-black cloud, violet lightning around it, a crown instead of a hat — our own face
    # (NOT a copy of any existing character: no wide toothy grin / half-closed smug eyes / moustache shape)
    ('fx_cloud_d', CROWN + 'two round glowing amber eyes and a small sly smirk showing one tiny fang' + EDGE, None),
    ('fx_cloud_e', CROWN + 'fierce slanted glowing violet eyes under stormy brows and a small open shouting mouth' + EDGE, None),
    ('fx_cloud_f', CROWN + 'proud closed eyes curved like little arcs and a smug tiny smile, cheeks puffed' + EDGE, None),
    # round 3 (director: symmetrical and round like a cotton ball, a little bigger): built on our own symmetrical cloud
    ('fx_cloud_g', 'on the front of this round symmetrical storm cloud draw a cute face: proud closed eyes like little arcs, a small smug smile and pink blush on the cheeks; put a small shining gold crown with red gems straight on the top center of the cloud' + SYM, 'cloud_base'),
    ('fx_cloud_h', 'on the front of this round symmetrical storm cloud draw a cute face: two round glowing amber eyes and a small sly smile; put a small shining gold crown with red gems straight on the top center of the cloud' + SYM, 'cloud_base'),
    ('fx_cloud_i', 'a perfectly round and symmetrical fluffy storm cloud like a cotton ball, about 48 pixels wide, made of even round puffs, dark purple-black with lighter purple tops, a cute face with proud closed arc eyes, a smug little smile and pink blush, a small gold crown with red gems straight on top center' + SYM, None),
    # round 4 (director: the face clear and big): face + crown hand-drawn on our cloud (art-source/pixellab/cloudpet/draw_faces.py) —
    # the artist only adds the lightning and the motion
    ('fx_cloud_g2', 'keep this round cloud, its big face and its gold crown exactly as drawn, do not change the face' + KEEP, 'cloud_g2'),
    ('fx_cloud_h2', 'keep this round cloud, its big glowing amber eyes, its smile and its gold crown exactly as drawn, do not change the face' + KEEP, 'cloud_h2'),
]
if __name__ == '__main__':
    b0 = V.P.call('GET', '/balance')['credits']['usd']
    if b0 < 0.05: sys.exit(f'balance too low: ${b0:.3f}')
    only = set(sys.argv[1:])
    for j in JOBS:
        if not only or j[0] in only: print(*V.one(*j), flush=True)
    b1 = V.P.call('GET', '/balance')['credits']['usd']
    print(f'BALANCE ${b0:.3f} -> ${b1:.3f} (used ${b0 - b1:.3f})', flush=True)
