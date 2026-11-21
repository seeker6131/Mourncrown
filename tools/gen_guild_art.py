"""Art for the guild village / guild war (docs/GUILD_WAR.md):
  rooms     (NOT USED: /create-room answers 403 "1010" to this client) interiors of the guild buildings as PixelLab rooms
  furniture the pieces the interiors are built from instead (front-facing map objects; floors / walls are drawn in code)
  defenses  thorn fence, palisade, archer tower, cannon, ballista, bunker, gate, guild banner (front-facing map objects)
  guards    attack of the village guard (np8, spear) and the archer (np10, bow) in 8 directions (skeleton-v3 + action)
  anims     firing animation of the cannon, ballista and archer tower (object import + pixminimax)
python3 -I tools/gen_guild_art.py rooms|defenses|guards|anims|all
Out: art-source/pixellab/guild/<key>.png (+ rooms.json with walkable rects / doors), state in guild/state.json"""
import os, sys, json, time, base64, io, urllib.request, urllib.error, concurrent.futures as cf
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pixellab_api as P
import gen_chars as G
import gen_anim as A
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'art-source', 'pixellab', 'guild'); os.makedirs(OUT, exist_ok=True)
SF = os.path.join(OUT, 'state.json')
ST = json.load(open(SF)) if os.path.exists(SF) else {}
def save():
    cur = json.load(open(SF)) if os.path.exists(SF) else {}
    for k, v in ST.items():
        if isinstance(v, dict): cur.setdefault(k, {}).update(v)
        else: cur[k] = v
    json.dump(cur, open(SF, 'w'), indent=1)

DARK = 'dark fantasy forest village, muted desaturated colours, soft warm candle light'
ROOMS = {   # key: theme   (guildhall first: the others take its walls / door / lights as their style)
    'guildhall': f'The guild hall of a {DARK}: a long war table with a map and figurines, guild banners on the walls, a big iron-bound donation chest, a quest notice board, a carved leader chair.',
    'house': f'A small player cottage in a {DARK}: a wooden bed with a quilt, a big storage chest, a wardrobe, a trophy shelf on the back wall, a small fireplace and a rug.',
    'forge': f'The blacksmith forge of a {DARK}: a glowing stone furnace, an anvil, weapon racks with swords and axes, a quench barrel, bellows and tool hooks.',
    'tavern': f'The tavern of a {DARK}: a bar counter with ale barrels, round wooden tables with stools, a stone fireplace, a bounty notice board on the wall.',
    'kitchen': f'The cookhouse of a {DARK}: a big iron cauldron over a fire, hanging herbs and sausages, shelves of jars, a chopping table with vegetables.',
    'warehouse': f'The storehouse vault of a {DARK}: stacked wooden crates, sacks of grain, barrels, a reinforced iron vault door on the back wall, a ledger desk.',
    'market': f'The covered market hall of a {DARK}: merchant counters with scales, shelves of goods and cloth bolts, a coin chest, hanging lanterns.',
    'barracks': f'The barracks of a {DARK}: bunk beds, spear and shield racks, armour stands, a straw training dummy, a sergeant table with a map.',
}
DOOR = [{'side': 's', 'col': 3, 'row': 5}]

def jwait_room(rid):
    for _ in range(200):
        r = P.call('GET', f'/rooms/{rid}')
        if r.get('status') in ('completed', 'failed'): return r
        time.sleep(15)
    return {'status': 'timeout'}

def room(key, style=None):
    st = ST.setdefault('rooms', {})
    if os.path.exists(os.path.join(OUT, f'room_{key}.png')): return key, 'exists'
    try:
        if key not in st:
            body = {'theme': ROOMS[key], 'doors': DOOR, 'view': 'top-down', 'name': f'mc_{key}'}
            if style: body.update({'style_room_id': style, 'style_room_floor': False})
            r = P.call('POST', '/create-room', body); st[key] = r.get('room_id') or r.get('id'); save()
        r = jwait_room(st[key])
        if r.get('status') != 'completed': return key, f"room {r.get('status')} {r.get('error')}"
        img = P.fetch(r['image_url']); open(os.path.join(OUT, f'room_{key}.png'), 'wb').write(img)
        meta = json.load(open(os.path.join(OUT, 'rooms.json'))) if os.path.exists(os.path.join(OUT, 'rooms.json')) else {}
        meta[key] = {'id': st[key], 'walkable': r.get('walkable'), 'doors': r.get('doors'), 'size': r.get('picture_size'), 'cells': r.get('cells')}
        json.dump(meta, open(os.path.join(OUT, 'rooms.json'), 'w'), indent=1)
        return key, 'ok'
    except urllib.error.HTTPError as e:
        return key, f'HTTP {e.code} {e.read().decode()[:300]}'
    except Exception as e:
        return key, f'err {e!r}'

def rooms():
    first = room('guildhall'); print(*first, flush=True)
    style = ST.get('rooms', {}).get('guildhall')
    with cf.ThreadPoolExecutor(4) as ex:
        for r in ex.map(lambda k: room(k, style), [k for k in ROOMS if k != 'guildhall']): print(*r, flush=True)

# ---- defenses: front-facing like the village buildings (same colour reference) ----
ref = Image.open(os.path.join(ROOT, 'src/assets/td/obj/house_1.png')).convert('RGBA'); _b = io.BytesIO(); ref.save(_b, 'PNG')
CI = {'type': 'base64', 'base64': base64.b64encode(_b.getvalue()).decode()}
TAIL = ('structure only, no ground around it, seen from the front and above, facing the viewer, not isometric, '
        'top-down pixel art, muted desaturated dark-forest colours, soft shading')
DEF = [
    ('def_spikes', 'a short row of sharpened wooden stakes and thorny brambles, a spiked barricade', 96),
    ('def_palisade', 'a straight section of a wooden palisade wall made of sharpened logs bound with rope', 96),
    ('def_archer', 'a wooden archer watchtower on four legs with a small roofed platform and a lookout window', 128),
    ('def_cannon', 'an old iron cannon on a wooden wheeled carriage pointing forward toward the viewer', 96),
    ('def_ballista', 'a large wooden ballista siege crossbow on a rotating stand, loaded with a big bolt, pointing toward the viewer', 96),
    ('def_bunker', 'a low squat stone bunker with a thick iron door and narrow arrow slits, sandbags around it', 128),
    ('def_gate', 'a fortified wooden village gate with two small towers and an open double door', 160),
    ('def_banner', 'a tall wooden pole with a hanging guild war banner, dark red cloth with a golden crown emblem', 64),
]
def defense(key, desc, size, tries=4):
    out = os.path.join(OUT, key + '.png')
    if os.path.exists(out): return key, 'exists'
    for t in range(tries):
        try: P.map_object(f'{desc}, {TAIL}', size, size, out, 'high top-down', color_image=CI); return key, 'ok'
        except Exception as e: print(key, 'retry', e, file=sys.stderr); time.sleep(10)
    return key, 'failed'
def defenses():
    with cf.ThreadPoolExecutor(3) as ex:
        for r in ex.map(lambda j: defense(*j), DEF): print(*r, flush=True)

# ---- furniture: interiors are assembled in the game from these pieces ----
FURN = [
    ('fu_bed', 'a wooden single bed with a patchwork quilt and a pillow, headboard at the top', 80),
    ('fu_chest', 'a big iron-bound wooden storage chest with a heavy lock', 56),
    ('fu_wardrobe', 'a tall carved wooden wardrobe with two doors', 72),
    ('fu_trophy', 'a wooden wall display shelf with three empty glass-fronted compartments for trophies', 80),
    ('fu_fireplace', 'a small stone fireplace with a crackling fire and a mantel', 80),
    ('fu_rug', 'a round woven rug with a red and brown pattern, flat on the floor', 64),
    ('fu_table', 'a small round wooden table with two stools', 64),
    ('fu_wartable', 'a long wooden war table covered with a map, figurines and candles', 112),
    ('fu_donation', 'a large ornate iron-bound donation chest with a coin slot and gold trim', 64),
    ('fu_board', 'a wooden notice board on legs covered with pinned paper notes and quests', 72),
    ('fu_throne', 'a carved high-backed wooden leader chair with a red cushion and a crest', 64),
    ('fu_furnace', 'a glowing stone blacksmith furnace with orange fire inside and a chimney hood', 96),
    ('fu_anvil', 'a heavy iron anvil on a tree stump with a hammer leaning on it', 56),
    ('fu_weaponrack', 'a wooden weapon rack holding swords, axes and spears', 80),
    ('fu_barrel', 'a wooden quench barrel full of water', 40),
    ('fu_bar', 'a long wooden tavern bar counter with mugs and ale barrels behind it', 128),
    ('fu_cauldron', 'a big black iron cauldron with bubbling green stew over a small fire', 64),
    ('fu_shelf', 'a wooden shelf with jars, bottles and hanging herbs', 72),
    ('fu_vault', 'a massive round reinforced iron vault door set in a stone frame', 96),
    ('fu_desk', 'a small wooden desk with an open ledger book, quill and candle', 64),
    ('fu_sacks', 'a pile of grain sacks', 56),
    ('fu_counter', 'a merchant counter with brass scales, coins and small goods', 96),
    ('fu_goods', 'a tall shelf of colourful cloth bolts, pots and goods for sale', 80),
    ('fu_bunk', 'a wooden bunk bed for soldiers with grey blankets', 80),
    ('fu_armor', 'an armour stand with a helmet, breastplate and shield', 56),
    ('fu_dummy', 'a straw training dummy on a wooden post with a target painted on it', 56),
]
FTAIL = ('furniture only, single object, no floor, no room, seen from the front and above, facing the viewer, not isometric, '
         'top-down pixel art, muted desaturated dark-forest colours, soft warm shading')
def furniture():
    def one(j):
        key, desc, size = j; out = os.path.join(OUT, key + '.png')
        if os.path.exists(out): return key, 'exists'
        for t in range(3):
            try: P.map_object(f'{desc}, {FTAIL}', size, size, out, 'high top-down', color_image=CI); return key, 'ok'
            except Exception as e: print(key, 'retry', e, file=sys.stderr); time.sleep(10)
        return key, 'failed'
    with cf.ThreadPoolExecutor(3) as ex:
        for r in ex.map(one, FURN): print(*r, flush=True)

# ---- guards: the same skeleton motion in all 8 directions (like gen_attack_fix.py) ----
GUARDS = {'np8': 'a strong spear thrust: he pulls the spear back for an instant, lunges forward and stabs it straight ahead at chest height, then returns to his guard stance. Feet stay planted.',
          'np10': 'shooting her bow: she raises the bow with the bow arm straight out, pulls the string back to her cheek, lets go, then lowers the bow. Feet stay planted.'}
def guards():
    def one(k):
        res = A.animate(k, 'attack', G.D8, {'mode': 'skeleton-v3', 'frame_count': 8, 'action_description': GUARDS[k]})
        return k, res, 'zip', A.zip_of(k)
    with cf.ThreadPoolExecutor(2) as ex:
        for r in ex.map(one, GUARDS): print(*r, flush=True)

# ---- firing animations of the weapon towers (the still picture becomes an object, then animated) ----
ANIM = {'def_cannon': 'the cannon fires: a flash and puff of smoke at the muzzle, the barrel recoils back on its carriage, then rolls forward again',
        'def_ballista': 'the ballista fires: the string snaps forward and the big bolt shoots out toward the viewer, the arms flex, then the ballista is reloaded',
        'def_archer': 'an archer appears in the tower window, draws a bow and shoots an arrow toward the viewer, then ducks back down'}
def anim(key):
    st = ST.setdefault('objs', {}).setdefault(key, {})
    png = os.path.join(OUT, key + '.png')
    if not os.path.exists(png): return key, 'no picture yet'
    try:
        if 'oid' not in st:
            r = P.call('POST', '/objects/import', {'image': {'type': 'base64', 'base64': base64.b64encode(open(png, 'rb').read()).decode()}, 'name': key})
            st['oid'] = r.get('object_id') or r.get('id'); save()
        if 'g' not in st:
            r = P.call('POST', f"/objects/{st['oid']}/animations", {'mode': 'pixminimax', 'animation_description': ANIM[key], 'frame_count': 8, 'display_name': 'fire'})
            st['g'] = r.get('animation_group_id'); save()
            for j in r.get('background_job_ids', []): G.jwait(j, 300)
        for attempt in range(40):
            try: z = urllib.request.urlopen(urllib.request.Request(f"{P.API}/objects/{st['oid']}/zip", headers=P.HDR), timeout=300).read(); break
            except urllib.error.HTTPError as e:
                if e.code != 423 or attempt == 39: raise
                time.sleep(20)
        open(os.path.join(OUT, key + '_anim.zip'), 'wb').write(z)
        return key, 'ok', len(z)
    except urllib.error.HTTPError as e:
        return key, f'HTTP {e.code} {e.read().decode()[:300]}'
def anims():
    with cf.ThreadPoolExecutor(3) as ex:
        for r in ex.map(anim, ANIM): print(*r, flush=True)

if __name__ == '__main__':
    what = sys.argv[1] if len(sys.argv) > 1 else 'all'
    b0 = A.bal()
    if what == 'all':
        with cf.ThreadPoolExecutor(3) as ex:
            fs = [ex.submit(f) for f in (furniture, defenses, guards)]
            for f in fs: f.result()
        anims()
    else: {'rooms': rooms, 'defenses': defenses, 'guards': guards, 'anims': anims, 'furniture': furniture}[what]()
    b1 = A.bal(); print(f'GUILDART BALANCE ${b0} -> ${b1}  (used ${b0 - b1:.4f})', flush=True)
