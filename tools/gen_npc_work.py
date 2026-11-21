"""Work poses of the village woodcutter (np4: chop) and miner (np5: mine), re-made in all 8 directions with nothing but
the man and his tool in the frames (the first set drew a stump / a rock and barely moved facing north), plus the
missing diagonal 'floating' directions of the veil ghost (mo9), whose template walk gave her striding legs.
python3 -I tools/gen_npc_work.py [np4 np5 mo9]      (np4 / np5: the old group is deleted first, once)"""
import os, sys, urllib.error, concurrent.futures as cf
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pixellab_api as P
import gen_chars as G
import gen_anim as A
PM = lambda act: {'mode': 'pixminimax', 'frame_count': 8, 'action_description': act}
JOBS = {
    'np4': ('chop', G.D8, PM('takes the axe off his shoulder and swings it hard in a wide sideways arc through the empty air in front of him at waist height, '
                             'then lifts it back onto his shoulder. His feet stay planted. Only the man and his axe are in the picture, on an empty background.'), True),
    'np5': ('mine', G.D8, PM('lifts his pickaxe high above his head with both hands and slams it straight down into the empty ground in front of him, then lifts it back. '
                             'His feet stay planted. Only the man and his pickaxe are in the picture, on an empty background.'), True),
    'mo9': ('walk', ['south-east', 'north-east', 'north-west', 'south-west'], PM('floating slowly forward just above the ground, her long tattered veil drifting behind; she glides and never takes a step'), False),
}
def run(key):
    name, dirs, extra, fresh = JOBS[key]; st = G.STATE[key]; cid = st['cid']
    if fresh and not st.get('work2'):   # drop the first set once, then build the new one under the same name
        gid = A.groups(cid).get(name, (None, set()))[0]
        if gid:
            try: P.call('DELETE', f'/characters/{cid}/animations/{gid}')
            except urllib.error.HTTPError as e: return key, f'delete HTTP {e.code} {e.read().decode()[:200]}'
        st['work2'] = 1; G.save()
    res = A.animate(key, name, dirs, extra)
    return key, name, res, 'zip', A.zip_of(key)
if __name__ == '__main__':
    keys = [k for k in sys.argv[1:] if k in JOBS] or list(JOBS)
    b0 = A.bal()
    with cf.ThreadPoolExecutor(3) as ex:
        for r in ex.map(run, keys): print(*r, flush=True)
    b1 = A.bal(); print(f'NPCWORK BALANCE ${b0} -> ${b1}  (used ${b0 - b1:.4f})', flush=True)
