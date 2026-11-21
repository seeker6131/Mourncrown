"""Re-make every character's walk with PixelLab's skeleton template 'walking-8-frames' in all 8 directions
(the text-made 'walk' barely moved the legs facing south/north). 1 generation per direction.
python3 -I tools/gen_walk8.py [keys...]   — state in art-source/pixellab/chars/state.json ('walk8'), zip re-downloaded."""
import os, sys, json, time, urllib.request, concurrent.futures as cf
sys.path.insert(0, os.path.dirname(__file__))
import pixellab_api as P
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'art-source', 'pixellab', 'chars')
SP = os.path.join(OUT, 'state.json'); STATE = json.load(open(SP))
DIRS8 = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west']
GOOD = {'hero', 'hr3', 'hr4', 'hr9'}          # hand-made in PixelLab, already fine
def save(): json.dump(STATE, open(SP, 'w'), indent=1)

def jwait(jid):
    for _ in range(240):
        try: j = P.call('GET', f'/background-jobs/{jid}')
        except Exception: time.sleep(5); continue
        if j.get('status') in ('completed', 'failed'): return j['status']
        time.sleep(5)
    return 'timeout'

def run(key):
    st = STATE[key]
    try:
        done = set(st.get('walk8dirs', []))
        todo = [d for d in DIRS8 if d not in done]
        if todo:
            body = {'character_id': st['cid'], 'mode': 'template', 'template_animation_id': 'walking-8-frames', 'animation_name': 'walking', 'directions': todo}
            if st.get('walk8group'): body['animation_group_id'] = st['walk8group']
            r = P.call('POST', '/characters/animations', body)
            st['walk8group'] = r.get('animation_group_id', st.get('walk8group')); save()
            res = [jwait(j) for j in r['background_job_ids']]
            for d, s in zip(r.get('directions', todo), res):
                if s == 'completed': done.add(d)
            st['walk8dirs'] = sorted(done); save()
        if len(done) == 8:
            z = urllib.request.urlopen(urllib.request.Request(f'{P.API}/characters/{st["cid"]}/zip', headers=P.HDR), timeout=300).read()
            open(os.path.join(OUT, key + '.zip'), 'wb').write(z); st['walk8'] = 'done'; save()
            return key, 'ok'
        return key, f'partial {len(done)}/8'
    except Exception as e:
        return key, f'err {e}'

if __name__ == '__main__':
    only = sys.argv[1:]
    order = lambda k: (0 if k.startswith('np') else 1 if k.startswith('hr') else 2 if k.startswith('mo') else 3 if k.startswith('an') else 4)
    keys = only or sorted([k for k, v in STATE.items() if v.get('cid') and v.get('zip') and not k.startswith('bs') and k not in GOOD and v.get('walk8') != 'done'], key=lambda k: (order(k), k))
    print('todo', keys, flush=True)
    with cf.ThreadPoolExecutor(3) as ex:
        for r in ex.map(run, keys): print(*r, flush=True)
    print(P.call('GET', '/balance')['subscription'], flush=True)
