"""Gathering animations: chop (axe) and mine (pickaxe) for the villager hero (all 8 directions) and the woodcutter /
miner NPCs (4 directions). PixMiniMax text actions. python3 -I tools/gen_gather.py [key:anim ...]
State: art-source/pixellab/chars/state.json[key]['gather'][anim] = [done dirs]; zips -> art-source/pixellab/chars/<key>.zip"""
import os, sys, json, time, urllib.request, urllib.error
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pixellab_api as P
import gen_chars as G
D8 = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west']
D4 = ['south', 'east', 'north', 'west']
HERO_CID = '755016b3-f6b1-4b0e-aaa3-3bc937accd35'
ACT = {'chop': 'holding a wood axe with both hands and swinging it down hard to chop a tree in front',
       'mine': 'holding an iron pickaxe with both hands and swinging it down hard to break a rock in front'}
JOBS = [('hero', 'chop', D8), ('hero', 'mine', D8), ('np4', 'chop', D4), ('np5', 'mine', D4)]

def cid_of(key): return HERO_CID if key == 'hero' else G.STATE[key]['cid']
def group(cid, name):
    c = P.call('GET', '/characters/' + cid)
    for a in c.get('animations', []):
        if a.get('display_name') == name: return a['animation_group_id'], {d['direction'] for d in a['directions'] if d.get('frames')}
    return None, set()

def run(key, anim, dirs):
    cid = cid_of(key); gid, have = group(cid, anim)
    for d in [x for x in dirs if x not in have]:
        body = {'character_id': cid, 'action_description': ACT[anim], 'animation_name': anim, 'mode': 'pixminimax', 'frame_count': 8, 'directions': [d]}
        if gid: body['animation_group_id'] = gid
        for _ in range(5):
            try:
                r = P.call('POST', '/characters/animations', body, retries=3); gid = gid or r.get('animation_group_id')
                for j in r['background_job_ids']:
                    for _ in range(150):
                        s = P.call('GET', f'/background-jobs/{j}')
                        if s.get('status') in ('completed', 'failed'): break
                        time.sleep(5)
                print(key, anim, d, s.get('status'), flush=True); break
            except urllib.error.HTTPError as e: print(key, anim, d, 'HTTP', e.code, flush=True); time.sleep(40)
    z = urllib.request.urlopen(urllib.request.Request(f'{P.API}/characters/{cid}/zip', headers=P.HDR), timeout=300).read()
    name = 'hero_gather.zip' if key == 'hero' else key + '.zip'
    open(os.path.join(G.OUT, name), 'wb').write(z)
    return group(cid, anim)[1]

if __name__ == '__main__':
    want = [tuple(a.split(':')) for a in sys.argv[1:]]
    for key, anim, dirs in JOBS:
        if want and (key, anim) not in [(k, a) for k, a, *_ in want]: continue
        use = [x for k, a, *rest in want if (k, a) == (key, anim) for x in rest] or dirs
        print(key, anim, sorted(run(key, anim, use)), flush=True)
    print('GATHERDONE', P.call('GET', '/balance')['subscription'], flush=True)
