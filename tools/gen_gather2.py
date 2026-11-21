"""Deepwild gatherer (hg) work poses, remade so each job reads clearly and the tool is the SAME in every direction:
  1. three STATES of hg (PixelLab 'create-character-state': the same villager already holding the tool, 8 rotations)
        axe  -> chop (trees)      pick -> mine (rocks / ore)      spear -> hunt (animals)
  2. one pixminimax animation per state, 8 directions, starting from the state's own picture (tool in hand from frame 0,
     nothing else drawn: no stump / rock / animal in the frames - the world object is already on the map)
python3 -I tools/gen_gather2.py state [axe pick spear]          create the states
python3 -I tools/gen_gather2.py anim  [axe pick spear] [dirs]   animate (skips directions already done)
python3 -I tools/gen_gather2.py zip                             -> art-source/pixellab/chars/hg.zip (all states)
State file: art-source/pixellab/chars/state.json['hg']['states'][name] = {'cid':..., 'g':...}"""
import os, sys, urllib.error, concurrent.futures as cf
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pixellab_api as P
import gen_chars as G
import gen_anim as A
D8 = G.D8
ST = {  # state name: (edit, animation name, action)
    'axe': ('he now holds a woodcutter axe with a long wooden handle and a steel head in both hands, resting diagonally in front of his chest, ready to chop',
            'chop', 'swings the axe hard in a wide sideways arc through the empty air in front of him at waist height, then pulls it back up to his shoulder. '
                    'His feet stay planted. Only the man and his axe are in the picture, on an empty background.'),
    'pick': ('he now holds an iron pickaxe with a long wooden handle and a curved two-pointed steel head in both hands, resting diagonally in front of his chest, ready to dig',
             'mine', 'lifts the pickaxe high above his head with both hands and slams it straight down into the empty ground in front of him, then lifts it back. '
                     'His feet stay planted. Only the man and his pickaxe are in the picture, on an empty background.'),
    'spear': ('he now holds a short wooden hunting spear with a pointed steel tip in both hands, pointing forward and slightly down, ready to hunt',
              'hunt', 'takes a short lunge and thrusts the spear straight forward with both hands in a fast stab, then pulls the spear back. '
                      'Only the man and his spear are in the picture, on an empty background.'),
}
hg = G.STATE['hg']; states = hg.setdefault('states', {})
if not states:   # lost from the state file: the states are still on PixelLab, in the same group as hg
    gid = P.call('GET', '/characters/' + hg['cid']).get('group_id')
    for c in P.call('GET', '/characters?limit=100').get('characters', []):
        if c.get('group_id') == gid and c.get('state_name') in ST: states[c['state_name']] = {'cid': c['id']}
    G.save()

def make_state(name):
    if states.get(name, {}).get('cid'): return name, 'exists'
    r = P.call('POST', '/create-character-state', {'character_id': hg['cid'], 'edit_description': ST[name][0], 'state_name': name,
                                                   'override_frame_size': {'width': 64, 'height': 64}, 'use_color_palette_from_reference': True})
    states[name] = {'cid': r['character_id']}; G.save()
    return name, G.jwait(r['background_job_id'], 300)['status'], r.get('usage')

def anim(name, dirs):
    """one request per direction (a request for all 8 at once is refused while other jobs are running)"""
    an, act = ST[name][1], ST[name][2]
    res = A.animate('hg', an, dirs, {'mode': 'pixminimax', 'frame_count': 8, 'action_description': act}, cid=states[name]['cid'])
    return name, an, res

if __name__ == '__main__':
    step = sys.argv[1]; args = sys.argv[2:]
    names = [a for a in args if a in ST] or list(ST)
    dirs = [a for a in args if a in D8] or D8
    b0 = A.bal()
    if step == 'zip': print('zip', A.zip_of('hg'))
    else:
        with cf.ThreadPoolExecutor(3) as ex:
            for r in ex.map(make_state if step == 'state' else (lambda n: anim(n, dirs)), names): print(*r, flush=True)
    b1 = A.bal(); print(f'GATHER2 BALANCE ${b0} -> ${b1}  (used ${b0 - b1:.4f})', flush=True)
