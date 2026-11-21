"""Interior tilesets for the guild village rooms (PixelLab /create-tileset, 'cliff' sets: transition_size 1.0).
lower = the floor, upper = the top of the walls, transition = the wall face that shows below a wall (2 rows tall),
exactly how 2D top-down RPG interiors are built. 32 px tiles, 25 tiles each (Wang corners with a 'transition' value).
(The room generator /create-room is not used: it is refused to this client.)
python3 -I tools/gen_room_tiles.py [key ...]  -> src/assets/td/room/<key>.png (5x5 grid) + <key>.json (corners of each cell)
"""
import os, sys, json, time, base64, io
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pixellab_api as P
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'src', 'assets', 'td', 'room'); os.makedirs(OUT, exist_ok=True)
SETS = {
    'rt_woodstone': ('warm brown wooden plank floor of a medieval house interior', 'top of a thick dark stone wall seen from above',
                     'grey stone brick wall face with a dark wooden skirting beam at the bottom'),
    'rt_stone': ('worn grey flagstone floor of a castle hall interior', 'top of a thick dark stone wall seen from above',
                 'dark grey castle stone brick wall face with a carved stone base'),
    'rt_wood': ('warm brown wooden plank floor of a cosy cottage interior', 'top of a thick wooden log wall seen from above',
                'brown wooden plank wall face with vertical boards and a dark beam at the bottom'),
}


def make(key, low, up, tr):
    if os.path.exists(os.path.join(OUT, key + '.png')): return key, 'exists'
    body = {'lower_description': low, 'upper_description': up, 'transition_description': tr, 'transition_size': 1.0,
            'tile_size': {'width': 32, 'height': 32}, 'mode': 'standard', 'lower_walkable': True, 'upper_walkable': False,
            'shape_style': 'square', 'raggedness': 0.0}
    r = P.call('POST', '/create-tileset', body); tid = r['tileset_id']
    t = None
    for _ in range(80):
        try: t = P.call('GET', f'/tilesets/{tid}', retries=1)
        except Exception: time.sleep(10); continue
        if t.get('tileset', {}).get('tiles'): break
        time.sleep(10)
    tiles = t['tileset']['tiles']
    sheet = Image.new('RGBA', (5 * 32, 5 * 32)); meta = []
    for i, tl in enumerate(tiles):
        im = Image.open(io.BytesIO(base64.b64decode(tl['image']['base64']))).convert('RGBA')
        sheet.alpha_composite(im, ((i % 5) * 32, (i // 5) * 32))
        c = tl['corners']; meta.append(''.join(c[k][0] for k in ('NW', 'NE', 'SW', 'SE')))   # e.g. 'uutt'
    sheet.save(os.path.join(OUT, key + '.png'))
    json.dump({'tile': 32, 'cols': 5, 'corners': meta}, open(os.path.join(OUT, key + '.json'), 'w'))
    return key, 'ok'


if __name__ == '__main__':
    only = set(sys.argv[1:])
    b0 = P.call('GET', '/balance')['credits']['usd']
    for k, v in SETS.items():
        if not only or k in only: print(*make(k, *v), flush=True)
    print(f"BALANCE ${b0:.3f} -> ${P.call('GET', '/balance')['credits']['usd']:.3f}")
