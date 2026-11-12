"""The female starting villager ('heroF'): the look a player can pick instead of the male villager 'hero' (wardrobe).
Same style as the other heroes: create-character-v3 48 px, walk = skeleton-v3 'walking-8-frames' template, attack =
skeleton-v3 with the same sword-slash action as 'hero' (tools/gen_attack_fix.py). One request per direction (gen_anim).
python3 -I tools/gen_heroine.py   -> art-source/pixellab/chars/heroF.zip, then python3 -I tools/reimport_chars.py heroF"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pixellab_api as P
import gen_chars as G
import gen_anim as A
KEY = 'heroF'
DESC = ('young woman with long brown hair in a single braid, simple green villager tunic with a leather belt, brown trousers and boots, '
        'holding a short wooden practice sword')
SLASH = ('a fast, powerful horizontal sword slash: she winds the sword arm back for an instant, sweeps the blade across in front of her body '
         'at chest height, follows through, then returns to her guard stance. Feet stay planted.')
if __name__ == '__main__':
    b0 = A.bal(); st = G.STATE.setdefault(KEY, {})
    if 'cid' not in st:
        r = P.call('POST', '/create-character-v3', {'description': DESC + G.PL, 'image_size': {'width': 48, 'height': 48}, 'view': 'low top-down',
                                                    'outline': 'single color black outline', 'detail': 'high detail', 'name': KEY})
        st['cid'] = r['character_id']; G.save(); print('create', G.jwait(r['background_job_id'])['status'], flush=True)
    A.animate(KEY, 'walk', G.D8, {'mode': 'skeleton-v3', 'template_animation_id': 'walking-8-frames', 'motion_adjustments': {'arm_swing': 0.35}})
    A.animate(KEY, 'attack', G.D8, {'mode': 'skeleton-v3', 'frame_count': 8, 'action_description': SLASH})
    print('zip', A.zip_of(KEY)); st['zip'] = 1; G.save()
    print(f'BALANCE ${b0:.3f} -> ${A.bal():.3f}', flush=True)
