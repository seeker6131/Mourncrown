"""Riding poses (tools/gen_riders.py) -> src/assets/td/ride_<form>.webp (1 row x 8 dirs, DIRS order) + riders.json
{form: {fs, seat}}: seat = the row of the rider's seat (where the saddle goes), found from the side view's lowest
body row above the dangling legs (fallback: 62% down).   python3 -I tools/import_riders.py"""
import os, io, json, zipfile
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CH = os.path.join(ROOT, 'art-source', 'pixellab', 'chars'); OUT = os.path.join(ROOT, 'src', 'assets', 'td')
DIRS = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west']
man = {}
for f in sorted(os.listdir(CH)):
    if not f.endswith('_ride.zip'): continue
    form = f[:-9]; z = zipfile.ZipFile(os.path.join(CH, f)); names = z.namelist()
    rot = {}
    for d in DIRS:
        c = [n for n in names if n.endswith(f'rotations/{d}.png') and not n.startswith(('Idle/', 'rotations/'))] or [n for n in names if n.endswith(f'rotations/{d}.png')]
        if c: rot[d] = Image.open(io.BytesIO(z.read(c[-1]))).convert('RGBA')
    if len(rot) < 8: print(form, 'incomplete'); continue
    fs = max(im.width for im in rot.values())
    sh = Image.new('RGBA', (fs * 8, fs))
    for i, d in enumerate(DIRS): im = rot[d]; sh.paste(im, (i * fs + (fs - im.width) // 2, fs - im.height))
    sh.save(os.path.join(OUT, f'ride_{form}.webp'), lossless=True)
    bb = [rot[d].getbbox() for d in DIRS]
    foot = max(b[3] for b in bb if b) + (fs - rot['south'].height)
    man[form] = {'fs': fs, 'foot': foot, 'seat': round(fs - (fs - foot) - (foot - min(b[1] for b in bb if b)) * 0.36)}
    print(form, man[form])
json.dump(man, open(os.path.join(OUT, 'riders.json'), 'w'), indent=1)
