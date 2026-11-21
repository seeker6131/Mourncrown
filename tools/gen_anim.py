"""Add one animation (some directions) to an existing PixelLab character, then re-download its zip.
python3 -I tools/gen_anim.py <key> <animation name> <dir,dir|all> '<json body extras>' [--nozip]
  key  = a key of art-source/pixellab/chars/state.json (cid looked up there)
  body = e.g. '{"mode":"pixminimax","template_action":"walking"}'
         '{"mode":"pixminimax","action_description":"...","frame_count":8}'
         '{"mode":"skeleton-v3","template_animation_id":"walking-8-frames","motion_adjustments":{"arm_swing":0.3}}'
Directions the animation already has are skipped (delete them first to redo). Prints the credit balance before / after."""
import os, sys, json, time, urllib.request, urllib.error
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pixellab_api as P
import gen_chars as G
D8 = G.D8

def groups(cid):
    """{animation name: (group id, {directions that have frames})}"""
    c = P.call('GET', '/characters/' + cid); out = {}
    for a in c.get('animations', []):
        out[a.get('display_name')] = (a['animation_group_id'], {d['direction'] for d in a.get('directions', []) if d.get('frames')})
    return out

def bal(): return P.call('GET', '/balance')['credits']['usd']

def zip_of(key, cid=None):
    cid = cid or G.STATE[key]['cid']
    for attempt in range(40):
        try: z = urllib.request.urlopen(urllib.request.Request(f'{P.API}/characters/{cid}/zip', headers=P.HDR), timeout=300).read(); break
        except urllib.error.HTTPError as e:
            if e.code != 423 or attempt == 39: raise      # 423 = a job of this character is still running: wait for it
            time.sleep(20)
    open(os.path.join(G.OUT, key + '.zip'), 'wb').write(z); return len(z)

def animate(key, name, dirs, extra, cid=None):
    cid = cid or G.STATE[key]['cid']
    gid, have = groups(cid).get(name, (None, set()))
    res = {}
    for d in [x for x in dirs if x not in have]:
        body = {'character_id': cid, 'animation_name': name, 'directions': [d], **extra}
        if gid: body['animation_group_id'] = gid
        for attempt in range(30):
            try:
                r = P.call('POST', '/characters/animations', body, retries=1); gid = gid or r.get('animation_group_id')
                st = [G.jwait(j, 400)['status'] for j in r['background_job_ids']]
                if not st: time.sleep(40); continue        # every job slot busy: ask again
                res[d] = st[0] + (f" {r['usage']}" if r.get('usage') else ''); break
            except urllib.error.HTTPError as e:
                msg = e.read().decode()[:300]; res[d] = f'HTTP {e.code} {msg}'
                if e.code in (400, 402, 409, 422): break
                time.sleep(40)                              # 429 = concurrent job limit: wait for a free slot
        print(key, name, d, res[d], flush=True)
    return res

if __name__ == '__main__':
    key, name, dirs, extra = sys.argv[1], sys.argv[2], sys.argv[3], json.loads(sys.argv[4])
    b0 = bal()
    animate(key, name, D8 if dirs == 'all' else dirs.split(','), extra)
    if '--nozip' not in sys.argv: print('zip', zip_of(key))
    b1 = bal(); print(f'BALANCE ${b0} -> ${b1}  (used ${b0 - b1:.4f})', flush=True)
