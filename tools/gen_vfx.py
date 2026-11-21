"""Skill VFX sprites (PixelLab map-objects, transparent) -> art-source/pixellab/vfx/<key>.png, imported to src/assets/vfx/*.png"""
import sys, os, concurrent.futures as cf
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pixellab_api as P
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'art-source', 'pixellab', 'vfx'); os.makedirs(OUT, exist_ok=True)
T = ', pixel art game visual effect sprite, glowing, high contrast, dark fantasy, centered, single effect only, no character, no text'
JOBS = [
 ('fx_circle', 'a glowing purple magic circle on the ground seen from above, two rings of ancient runes and sigils, bright energy lines, symmetrical', 128, 'high top-down'),
 ('fx_slash', 'a single wide crescent sword slash arc of bright white light, thick in the middle tapering to sharp tips, motion streaks', 128, 'side'),
 ('fx_blast_fire', 'a round fire explosion seen from above, white-yellow core, expanding ring of orange flames and smoke, flying sparks', 128, 'high top-down'),
 ('fx_blast_arcane', 'a round arcane magic explosion seen from above, white-violet core, expanding ring of purple energy and dark wisps', 128, 'high top-down'),
 ('fx_lightning', 'a vertical lightning bolt striking down, jagged branching, white core with electric blue glow, sparks at the bottom', 128, 'side'),
 ('fx_pillar', 'a tall vertical pillar of holy golden light rising from the ground, soft beam with floating light particles', 128, 'side'),
 ('fx_fireball', 'a blazing fireball projectile flying to the right, bright core, orange and red flame trail behind it, embers', 64, 'side'),
 ('fx_icespike', 'a sharp glowing ice crystal spike projectile pointing to the right, pale cyan core, frost mist trail', 64, 'side'),
]
def one(k, d, s, v):
    out = os.path.join(OUT, k + '.png')
    if os.path.exists(out): return k, 'exists'
    try: P.map_object(d + T, s, s, out, v); return k, 'ok'
    except Exception as e: return k, f'err {e}'
if __name__ == '__main__':
    with cf.ThreadPoolExecutor(3) as ex:
        for r in ex.map(lambda j: one(*j), JOBS): print(*r, flush=True)
    print('VFXDONE', P.call('GET', '/balance')['subscription'], flush=True)
