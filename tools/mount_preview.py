"""Riding preview drawn exactly the way world/mount.ts layers it (animal → rider seated at the seat point → the animal's
front parts), for every direction and a few hero forms. Seats / fronts from src/data/mounts.ts or a JSON override.
python3 -I tools/mount_preview.py <out.png> <key> <seats.json|-> [forms]"""
import os, sys, json, re
from PIL import Image, ImageDraw
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); TD = os.path.join(ROOT, 'src', 'assets', 'td')
MAN = json.load(open(os.path.join(TD, 'mounts.json'))); RID = json.load(open(os.path.join(TD, 'riders.json')))
def draw(key, seat, front, form, d, dot=False):
    m = MAN[key]; fs = m['fs']; im = Image.open(os.path.join(TD, f'{key}_idle.webp')).convert('RGBA').crop((d * fs, 0, (d + 1) * fs, fs))
    r = RID[form]; rs = Image.open(os.path.join(TD, f'ride_{form}.webp')).convert('RGBA').crop((d * r['fs'], 0, (d + 1) * r['fs'], r['fs']))
    pad = 40; c = Image.new('RGBA', (fs + pad * 2, fs + pad * 2)); c.alpha_composite(im, (pad, pad))
    sx, sy = seat[d]; c.alpha_composite(rs, (pad + sx - r['fs'] // 2, pad + sy + 1 - r['seat']))
    for x0, x1, y0 in front[d]:
        part = im.crop((x0, y0, x1, fs)); c.alpha_composite(part, (pad + x0, pad + y0))
    if dot: ImageDraw.Draw(c).point((pad + sx, pad + sy), fill=(255, 0, 0, 255))
    return c
if __name__ == '__main__':
    out, key, src = sys.argv[1:4]; forms = (sys.argv[4] if len(sys.argv) > 4 else 'hero,hr2,hr5,hr7,hr11').split(',')
    cfg = json.load(open(src))[key] if src != '-' else None
    seat, front = cfg['seat'], cfg['front']
    fs = MAN[key]['fs']; cell = fs + 60
    sheet = Image.new('RGBA', (cell * 8, cell * len(forms)), (58, 72, 44, 255))
    for r, form in enumerate(forms):
        for d in range(8):
            c = draw(key, seat, front, form, d, dot=os.environ.get('DOT') == '1'); bb = c.getbbox(); c = c.crop(bb)
            sheet.alpha_composite(c, (d * cell + (cell - c.width) // 2, r * cell + cell - 4 - c.height))
    sheet.resize((sheet.width * 2, sheet.height * 2), Image.NEAREST).save(out)
