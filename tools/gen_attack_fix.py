"""Hero attacks re-made with mode 'skeleton-v3' + an action text: ONE 3D motion per hero, posed onto the idle picture of
every direction. Unlike the first text-made attacks it starts moving at once, moves the same way in all 8 directions,
keeps the face / weapon / shield (no frame where the mage turns into somebody else, no staff that melts) and draws no
slash or spell effect into the frames (the game adds those itself).
The clips land in an animation called 'attackfix'; import_chars.py lets its directions replace 'attack' and puts the
idle picture in front as frame 0.
python3 -I tools/gen_attack_fix.py [key[:dir,dir] ...]      zips -> art-source/pixellab/chars/<key>.zip (hero: hero_api.zip)"""
import os, sys, time, urllib.request, urllib.error, concurrent.futures as cf
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pixellab_api as P
import gen_chars as G
import gen_anim as A
D8 = G.D8
# characters made by hand on the site (their sprites come from hand-downloaded zips; only the new attack is taken from the API zip)
for _k, _cid in (('hero', '755016b3-f6b1-4b0e-aaa3-3bc937accd35'), ('hr3', 'd0a01c4a-3a8f-4c3b-bcc6-a36f722e16e1'),
                 ('hr4', 'e26767d2-9a4d-4f35-abea-3c75491e3c08'), ('hr9', '13f0c952-ddf0-49de-b3e2-c884d72ddfd7')):
    G.STATE.setdefault(_k, {'cid': _cid})
API_ZIP = {'hero': 'hero_api.zip', 'hr3': 'hr3_api.zip', 'hr4': 'hr4_api.zip', 'hr9': 'hr9_api.zip'}
SLASH = ('a fast, powerful horizontal sword slash: he winds the sword arm back for an instant, sweeps the blade across in front of his body '
         'at chest height, follows through, then returns to his guard stance. Feet stay planted.')
CAST = ('casting a spell with his staff: he quickly raises the staff, thrusts its tip forward at chest height with the staff arm, '
        'holds for an instant, then pulls the staff back to his resting stance. Feet stay planted.')
# thin staffs melt when the staff arm swings (hr7): the staff stays upright in its hand and the free hand casts
CAST2 = ('casting a spell: he keeps holding his staff upright and still in one hand, leans forward and thrusts his free hand forward '
         'at chest height with the palm open, holds it for an instant, then pulls the hand back to his side. The staff barely moves. Feet stay planted.')
SMASH = ('a heavy overhead smash with the weapon in his weapon hand: he lifts it high, slams it down hard in front of him, '
         'then recovers to his guard stance with the shield held at his side. Feet stay planted.')
SHOOT = ('shooting his bow: he raises the bow with the bow arm straight out, pulls the string back to his cheek with the other hand, '
         'lets go, then lowers the bow. Feet stay planted.')
ACT = {'hero': SLASH, 'hr1': SLASH, 'hr2': SLASH, 'hr7': CAST2, 'hr8': CAST, 'hr9': CAST2, 'hr10': SMASH, 'hr11': SMASH, 'hr12': SMASH, 'hr5': SHOOT, 'hr6': SHOOT}
NAME = 'attackfix'
REDO = {'hr7'}          # keys whose first 'attackfix' was not good enough (staff melted)

def run(key, dirs):
    cid = G.STATE[key]['cid']
    try:
        gs = A.groups(cid)
        if key in REDO and NAME in gs and not G.STATE[key].get('attackfix_redo'):   # throw the first try away, once
            P.call('DELETE', f'/characters/{cid}/animations/{gs[NAME][0]}'); G.STATE[key]['attackfix_redo'] = 1; G.save(); gs = A.groups(cid)
        if NAME not in gs and 'atk_test' in gs:    # the first trial clips: keep them, under the real name
            P.call('PATCH', f'/characters/{cid}/animations/{gs["atk_test"][0]}', {'display_name': NAME})
        res = A.animate(key, NAME, dirs, {'mode': 'skeleton-v3', 'frame_count': 8, 'action_description': ACT[key]})
        z = A.zip_of(key) if key not in API_ZIP else None
        if key in API_ZIP:
            for attempt in range(40):
                try: data = urllib.request.urlopen(urllib.request.Request(f'{P.API}/characters/{cid}/zip', headers=P.HDR), timeout=300).read(); break
                except urllib.error.HTTPError as e:
                    if e.code != 423 or attempt == 39: raise
                    time.sleep(20)
            open(os.path.join(G.OUT, API_ZIP[key]), 'wb').write(data); z = len(data)
        return key, sorted(A.groups(cid).get(NAME, (None, set()))[1]), 'zip', z
    except urllib.error.HTTPError as e:
        return key, f'HTTP {e.code} {e.read().decode()[:300]}'
    except Exception as e:
        return key, f'err {e!r}'

if __name__ == '__main__':
    jobs = {}
    for a in sys.argv[1:]:
        k, _, ds = a.partition(':'); jobs[k] = ds.split(',') if ds else D8
    jobs = jobs or {k: D8 for k in ACT}
    b0 = A.bal()
    with cf.ThreadPoolExecutor(6) as ex:
        for r in ex.map(lambda kv: run(*kv), jobs.items()): print(*r, flush=True)
    b1 = A.bal(); print(f'ATTACKFIX BALANCE ${b0} -> ${b1}  (used ${b0 - b1:.4f})', flush=True)
