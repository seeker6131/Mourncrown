"""Riding poses (director: a real sitting pose, not a cut-off hero): for every hero form, a new STATE of its own PixelLab
character — the same person, outfit and weapon — sitting astride an (invisible) saddle, legs apart on both sides.
The game seats this picture on any mount (world/mount.ts).  python3 -I tools/gen_riders.py [key ...]"""
import sys, os, json, concurrent.futures as cf
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pixellab_api as P
import gen_chars as G
import gen_anim as A
FORMS = ['hero', 'heroF', 'hr1', 'hr2', 'hr3', 'hr4', 'hr5', 'hr6', 'hr7', 'hr8', 'hr9', 'hr10', 'hr11', 'hr12']
EDIT = ('sitting astride a riding saddle as if on horseback: legs bent and spread apart on both sides, knees out, feet low in stirrups, '
        'upper body upright, one hand holding reins in front; draw only the rider in this riding pose, no horse, no saddle, no ground')

def one(key):
    st = G.STATE.setdefault(key, {}); rk = key + '_ride'; rs = G.STATE.setdefault(rk, {})
    try:
        if 'cid' not in rs:
            r = P.call('POST', '/create-character-state', {'character_id': st['cid'], 'edit_description': EDIT, 'state_name': 'riding', 'no_background': True, 'use_color_palette_from_reference': True})
            rs['cid'] = r.get('character_id') or r.get('new_character_id'); rs['src'] = key; G.save()
            j = G.jwait(r['background_job_id']); 
            if j.get('status') != 'completed': return key, j.get('status')
        A.zip_of(rk, rs['cid']); return key, 'ok'
    except Exception as e: return key, f'err {e!r}'

if __name__ == '__main__':
    keys = sys.argv[1:] or FORMS
    b0 = A.bal()
    with cf.ThreadPoolExecutor(3) as ex:
        for r in ex.map(one, keys): print(*r, flush=True)
    print(f'BALANCE ${b0:.4f} -> ${A.bal():.4f}', flush=True)
