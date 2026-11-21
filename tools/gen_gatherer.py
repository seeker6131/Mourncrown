"""Empty-handed villager for the Deepwild (key 'hg'): no sword. Walks empty-handed (8-dir skeleton walk),
chops with an axe (trees + animals) and mines with a pickaxe — 8 directions each.
python3 -I tools/gen_gatherer.py  — state in art-source/pixellab/chars/state.json['hg'], zip -> chars/hg.zip"""
import os, sys, time, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pixellab_api as P
import gen_chars as G
D8 = G.D8
DESC = ('young man with short messy brown hair, plain beige linen shirt, brown trousers, rope belt, worn boots, small leather satchel on the hip, '
        'empty hands, no weapon, top-down pixel art, muted desaturated dark-forest colours, soft shading')
ACT = {'chop': 'holding a wood axe with both hands and swinging it down hard to chop a tree in front',
       'mine': 'holding an iron pickaxe with both hands and swinging it down hard to break a rock in front'}
st = G.STATE.setdefault('hg', {})
def wait_all(ids): return [G.jwait(j)['status'] for j in ids]
if 'cid' not in st:
    r = P.call('POST', '/create-character-v3', {'description': DESC, 'image_size': {'width': 48, 'height': 48}, 'view': 'low top-down',
                                               'outline': 'single color black outline', 'detail': 'medium detail', 'name': 'hg'})
    st['cid'] = r['character_id']; G.save(); print('create', G.jwait(r['background_job_id'])['status'], flush=True)
cid = st['cid']
if st.get('walk8') != 'done':
    r = P.call('POST', '/characters/animations', {'character_id': cid, 'mode': 'template', 'template_animation_id': 'walking-8-frames', 'animation_name': 'walking', 'directions': D8})
    res = wait_all(r['background_job_ids']); print('walk', res, flush=True); st['walk8'] = 'done' if all(x == 'completed' for x in res) else 'partial'; G.save()
for a in ('chop', 'mine'):
    if st.get(a) == 'done': continue
    r = P.call('POST', '/characters/animations', {'character_id': cid, 'action_description': ACT[a], 'animation_name': a, 'mode': 'pixminimax', 'frame_count': 8, 'directions': D8})
    res = wait_all(r['background_job_ids']); print(a, res, flush=True); st[a] = 'done' if all(x == 'completed' for x in res) else 'partial'; G.save()
z = urllib.request.urlopen(urllib.request.Request(f'{P.API}/characters/{cid}/zip', headers=P.HDR), timeout=300).read()
open(os.path.join(G.OUT, 'hg.zip'), 'wb').write(z); st['zip'] = 1; G.save()
print('HGDONE', P.call('GET', '/balance')['subscription'], flush=True)
