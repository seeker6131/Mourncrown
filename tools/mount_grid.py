"""A mount's 8 idle frames blown up with a 10 px grid (labels every 10) — for reading the saddle point by eye.
python3 -I tools/mount_grid.py <out.png> <key>"""
import os, sys, json
from PIL import Image, ImageDraw
TD = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'src', 'assets', 'td')
out, key = sys.argv[1:3]; m = json.load(open(os.path.join(TD, 'mounts.json')))[key]; fs = m['fs']; Z = 4
sheet = Image.open(os.path.join(TD, f'{key}_idle.webp')).convert('RGBA')
o = Image.new('RGB', (fs * Z * 4 + 20, fs * Z * 2 + 20), (40, 50, 34)); d = ImageDraw.Draw(o)
for i in range(8):
    im = sheet.crop((i * fs, 0, (i + 1) * fs, fs)).resize((fs * Z, fs * Z), Image.NEAREST); ox, oy = (i % 4) * fs * Z + 10, (i // 4) * fs * Z + 10
    bg = Image.new('RGB', im.size, (58, 72, 44)); bg.paste(im, (0, 0), im); o.paste(bg, (ox, oy))
    for g in range(0, fs, 10):
        d.line((ox + g * Z, oy, ox + g * Z, oy + fs * Z), fill=(90, 110, 70)); d.line((ox, oy + g * Z, ox + fs * Z, oy + g * Z), fill=(90, 110, 70))
        d.text((ox + g * Z + 1, oy + 1), str(g), fill=(255, 255, 120)); d.text((ox + 1, oy + g * Z + 1), str(g), fill=(120, 255, 255))
    d.text((ox + fs * Z - 30, oy + fs * Z - 14), str(i), fill=(255, 80, 80))
o.save(out); print(o.size)
