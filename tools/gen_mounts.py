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
    # 5 more (director 14 Nov): Legend 140% wolf / bear, SL 145% stag / panther, Limited 150% nightmare
    'mt_wolf': (76, 'dog', 'a huge riding dire wolf with dark grey and black fur, pale glowing blue eyes, an EMPTY dark leather saddle with straps on its back, nobody riding it, standing proudly'),
    'mt_stag': (84, 'horse', 'a large white spirit stag with huge antlers glowing soft green and wrapped in vines, an EMPTY carved wooden saddle with green cloth on its back, nobody riding it, standing calmly'),
    'mt_bear': (84, 'bear', 'a huge brown war bear wearing iron armour plates on its head and shoulders, an EMPTY heavy leather war saddle on its back, nobody riding it, standing on four legs'),
    'mt_panther': (76, 'lion', 'a sleek black panther with faint purple stripes and glowing yellow eyes, an EMPTY slim purple leather saddle on its back, nobody riding it, standing on four legs'),
    # retries (14 Nov): the first wolf / bear / stag / panther came out turned half a step — "straight at the viewer" asked
    'mt_wolf2': (76, 'dog', 'a huge riding dire wolf with dark grey and black fur, pale glowing blue eyes, an EMPTY dark leather saddle with straps in the middle of its back, nobody riding it, standing square on four legs, symmetrical, the front view looks straight at the viewer'),
    'mt_bear2': (84, 'bear', 'a huge brown war bear wearing iron armour plates on its head and shoulders, an EMPTY heavy leather war saddle in the middle of its back, nobody riding it, standing square on four legs, symmetrical, the front view looks straight at the viewer'),
    'mt_stag2': (84, 'horse', 'a large white spirit stag with huge antlers glowing soft green and wrapped in vines, an EMPTY carved wooden saddle with green cloth in the middle of its back, nobody riding it, standing square on four legs, symmetrical, the front view looks straight at the viewer'),
    'mt_panther2': (76, 'lion', 'a sleek black panther with faint purple stripes and glowing yellow eyes, an EMPTY slim purple leather saddle in the middle of its back, nobody riding it, standing square on four legs, symmetrical, the front view looks straight at the viewer'),
    'mt_gdragon2': (96, 'lion', 'a majestic four-legged golden riding dragon with ONE horned golden head, its golden wings FOLDED tightly flat against its sides, a long level back with an EMPTY large ornate white and gold saddle clearly on the middle of it, nobody riding it, shining gold scales with a white-gold belly, a small flame flickering from its mouth, long golden tail, standing square, symmetrical, the front view looks straight at the viewer'),   # (wings folded: the game draws flapping wings behind the rider — the open-wing one hid the rider from the side)
    'mt_hydra': (96, None, 'a majestic golden three-headed dragon flying in the air, three long necks each with a clearly separate horned golden head, shining gold scales with white-gold belly, big golden wings spread wide, small flames flickering from its mouths, an EMPTY ornate white and gold saddle on its back between the wings, nobody riding it, legs tucked under the body, hovering'),   # (Limited 150%: flies — wings flap, never walks; director: gold, a little fire)
    'mt_gdragon': (96, 'lion', 'a majestic four-legged golden riding dragon with ONE horned golden head, a long level back with an EMPTY large ornate white and gold saddle clearly on the middle of it, nobody riding it, shining gold scales with a white-gold belly, big golden wings spread out to the sides, a small flame flickering from its mouth, long golden tail, proud and majestic'),   # (Limited 150%: the game lifts it and flaps — director: one head, a back to sit on; the upright try is mt_gdragon_up)
    'mt_dragon': (88, 'lion', 'a young four-legged riding dragon with emerald green scales, golden belly, small folded wings, short horns, an EMPTY ornate red-and-gold saddle on its back, nobody riding it, proud and majestic'),
}
def bal(): return P.call('GET', '/balance')['credits']['usd']

def create(key):
    size, tpl, desc = MOUNTS[key]; st = G.STATE.setdefault(key, {})
    if 'cid' in st: return 'exists'
    r = P.call('POST', '/create-character-v3', {'description': desc + PL, 'image_size': {'width': size, 'height': size}, 'view': 'low top-down', 'n_directions': 8,
                                                 **({'template_id': tpl} if tpl else {}), 'outline': 'single color black outline', 'detail': 'high detail', 'name': key, 'no_background': True})
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
