"""Mounts (rideable animals): the animal alone with an EMPTY saddle, 8 directions, idle + walk. The rider is drawn by
the game from the hero's own picture (upper body on the saddle), so every hero form can ride every mount.
python3 -I tools/gen_mounts.py create|walk|zip <key> [dirs]   (state in art-source/pixellab/chars/state.json)"""
import sys, os, json, time, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pixellab_api as P
import gen_chars as G
PL = ', top-down pixel art, muted desaturated dark-forest colours, soft shading'
MOUNTS = {   # key: (size, quadruped template, description)
    'mt_horse': (80, 'horse', 'a sturdy brown riding horse with a dark mane, an EMPTY brown leather saddle and bridle on its back, nobody riding it, standing calmly'),
    'mt_dragon': (88, 'lion', 'a young four-legged riding dragon with emerald green scales, golden belly, small folded wings, short horns, an EMPTY ornate red-and-gold saddle on its back, nobody riding it, proud and majestic'),
}
def bal(): return P.call('GET', '/balance')['credits']['usd']

def create(key):
    size, tpl, desc = MOUNTS[key]; st = G.STATE.setdefault(key, {})
    if 'cid' in st: return 'exists'
    r = P.call('POST', '/create-character-v3', {'description': desc + PL, 'image_size': {'width': size, 'height': size}, 'view': 'low top-down', 'n_directions': 8,
                                                 'template_id': tpl, 'outline': 'single color black outline', 'detail': 'high detail', 'name': key, 'no_background': True})
    st['cid'] = r['character_id']; G.save()
    return G.jwait(r['background_job_id'])['status']

def walk(key, dirs, body):
    import gen_anim as A
    return A.animate(key, 'walk', dirs, body)

if __name__ == '__main__':
    cmd, key = sys.argv[1], sys.argv[2]
    b0 = bal()
    if cmd == 'create': print(key, create(key))
    elif cmd == 'walk': print(walk(key, sys.argv[3].split(',') if len(sys.argv) > 3 else G.D8, json.loads(sys.argv[4]) if len(sys.argv) > 4 else {'mode': 'v3', 'frame_count': 8, 'action_description': 'walking forward at a steady trot, legs stepping in turn'}))
    if cmd in ('create', 'walk', 'zip'):
        import gen_anim as A; print('zip', A.zip_of(key))
    print(f'BALANCE ${b0:.4f} -> ${bal():.4f}', flush=True)
