"""Re-make hero walk directions whose weapon / shield / cape vanished in the 'walking-8-frames' template walk.
Uses mode 'skeleton-v3' (the same walk template posed onto the character: it MOVES the idle picture instead of redrawing
it, so the staff, shield, cape and face stay) with a small arm swing so held items stay in the hands.
The new directions land in a second animation group -> zip folder 'walking-<group id 8 chars>'; import_chars.py lets
those directions replace the old 'walking' ones.
python3 -I tools/gen_walk_fix.py [key[:dir,dir] ...]     state: state.json[key]['walkfix_g'] / ['walkfix']"""
import os, sys, time, urllib.error, concurrent.futures as cf
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pixellab_api as P
import gen_chars as G
import gen_anim as A
D8 = G.D8
BAD = {  # directions that lost something (seen with tools/audit_dirs.py)
    'hr1': ['south-east', 'east', 'north-east', 'north', 'south-west'],
    'hr2': ['south', 'south-east', 'north-east', 'north', 'north-west', 'south-west'],
    'hr5': ['south-east', 'north'],
    'hr6': ['south-east', 'north', 'west'],
    'hr7': ['south', 'south-east', 'east', 'north', 'north-west', 'west'],
    'hr10': ['south', 'south-east', 'east', 'north', 'north-west', 'west'],
    'hr11': ['south-east', 'east', 'north-east', 'north'],
    'hr12': ['south-east', 'east', 'north', 'west', 'south-west'],
}
SLIDERS = {'arm_swing': 0.35}

def have(cid, gid):
    c = P.call('GET', '/characters/' + cid)
    for a in c.get('animations', []):
        if a['animation_group_id'] == gid: return {d['direction'] for d in a.get('directions', []) if d.get('frames')}
    return set()

def run(key, dirs):
    """one request per direction: a request for several directions at once is refused while other jobs are running"""
    st = G.STATE[key]; cid = st['cid']; gid = st.get('walkfix_g')
    try:
        for d in [x for x in dirs if x not in (have(cid, gid) if gid else set())]:
            body = {'character_id': cid, 'mode': 'skeleton-v3', 'template_animation_id': 'walking-8-frames', 'directions': [d], 'motion_adjustments': SLIDERS}
            if gid: body['animation_group_id'] = gid
            for attempt in range(30):
                try:
                    r = P.call('POST', '/characters/animations', body, retries=1)
                    gid = st['walkfix_g'] = r.get('animation_group_id', gid); G.save()
                    res = [G.jwait(j, 400)['status'] for j in r['background_job_ids']]
                    if res: print(key, d, res, flush=True); break
                    time.sleep(40)                      # every job slot busy: ask again
                except urllib.error.HTTPError as e:
                    if e.code in (400, 402, 409, 422): print(key, d, 'HTTP', e.code, e.read().decode()[:200], flush=True); break
                    time.sleep(40)                      # 429 = concurrent job limit: wait for a free slot
        done = sorted(have(cid, gid)); st['walkfix'] = done; G.save()
        A.zip_of(key)
        return key, f'{len(done)} dirs: {done}'
    except Exception as e:
        return key, f'err {e!r}'

if __name__ == '__main__':
    jobs = {}
    for a in sys.argv[1:]:
        k, _, ds = a.partition(':'); jobs[k] = D8 if ds == 'all' else ds.split(',') if ds else BAD[k]
    jobs = jobs or BAD
    b0 = A.bal()
    with cf.ThreadPoolExecutor(5) as ex:
        for r in ex.map(lambda kv: run(*kv), jobs.items()): print(*r, flush=True)
    b1 = A.bal(); print(f'WALKFIX BALANCE ${b0} -> ${b1}  (used ${b0 - b1:.4f})', flush=True)
