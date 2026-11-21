"""Fill in the missing directions of each character's 'attack' animation (same text action, PixMiniMax, added to the
existing attack group so all 8 directions match). Heroes first, then monsters, then bosses. Stops when the balance
drops under RESERVE. python3 -I tools/gen_attack8.py [keys...]"""
import os, sys, json, time, urllib.request, urllib.error
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pixellab_api as P
import gen_chars as G
RESERVE = 40
D8 = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west']
ACT = {s[0]: dict(s[4]).get('attack') for s in G.SPECS}

def attack_group(cid):
    c = P.call('GET', '/characters/' + cid)
    for a in c.get('animations', []):
        if a.get('display_name') == 'attack':
            return a['animation_group_id'], {d['direction'] for d in a['directions'] if d.get('frames')}
    return None, set()

def run(key):
    st = G.STATE[key]; cid = st['cid']
    gid, have = attack_group(cid)
    todo = [d for d in D8 if d not in have]
    for d in todo:
        bal = P.call('GET', '/balance')['subscription']['generations']
        if bal < RESERVE: return f'stopped (balance {bal})'
        body = {'character_id': cid, 'action_description': ACT[key], 'animation_name': 'attack', 'mode': 'pixminimax', 'frame_count': 8, 'directions': [d]}
        if gid: body['animation_group_id'] = gid
        for attempt in range(6):
            try:
                r = P.call('POST', '/characters/animations', body, retries=3)
                gid = gid or r.get('animation_group_id')
                for j in r['background_job_ids']:
                    for _ in range(150):
                        s = P.call('GET', f'/background-jobs/{j}')
                        if s.get('status') in ('completed', 'failed'): break
                        time.sleep(5)
                print(key, d, s.get('status'), flush=True); break
            except urllib.error.HTTPError as e:
                print(key, d, 'HTTP', e.code, flush=True); time.sleep(40)
    gid, have = attack_group(cid)
    z = urllib.request.urlopen(urllib.request.Request(f'{P.API}/characters/{cid}/zip', headers=P.HDR), timeout=300).read()
    open(os.path.join(G.OUT, key + '.zip'), 'wb').write(z)
    st['attack8'] = len(have); G.save()
    return f'{len(have)}/8'

if __name__ == '__main__':
    ORDER = ['hr1', 'hr8', 'hr6', 'hr7'] + [f'mo{i}' for i in range(1, 18)] + [f'bs{i}' for i in range(1, 6)]
    keys = sys.argv[1:] or [k for k in ORDER if G.STATE.get(k, {}).get('attack8', 0) < 8]
    for k in keys:
        print(k, run(k), flush=True)
    print('ATTACKDONE', P.call('GET', '/balance')['subscription'], flush=True)
