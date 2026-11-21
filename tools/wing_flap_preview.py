# 🪽 Wings flapping preview (4 poses: each wing turns round its root, 0/14/28/14 degrees) -> <out>/wings_flap.gif
# python3 -I tools/wing_flap_preview.py <out dir>
import sys, json
from PIL import Image, ImageDraw
sys.path.insert(0, 'tools'); import importlib.util
spec = importlib.util.spec_from_file_location('wd', 'tools/wing_dirs_preview.py'); wd = importlib.util.module_from_spec(spec); spec.loader.exec_module(wd)
SP = sys.argv[1]; D = 'src/assets/td'; m = json.load(open(D + '/chars.json'))
def flap(w, a):
    """one flap pose: each wing turns round its root (inner top), tips going down by a degrees, and gets a little shorter"""
    w = w.crop(w.getbbox()); W, H = w.size; L = w.crop((0, 0, W // 2, H)); R = w.crop((W // 2, 0, W, H))
    pad = 24; o = Image.new('RGBA', (W + pad * 2, H + pad * 2))
    for half, x0, root, sgn in ((L, 0, (W // 2, int(H * 0.3)), 1), (R, W // 2, (0, int(H * 0.3)), -1)):
        c = Image.new('RGBA', (W + pad * 2, H + pad * 2)); c.alpha_composite(half, (pad + x0, pad))
        cx, cy = pad + x0 + root[0], pad + root[1]
        c = c.rotate(sgn * a, resample=Image.NEAREST, center=(cx, cy))
        o.alpha_composite(c)
    sy = 1 - a / 180; o2 = o.resize((o.width, int(o.height * sy)), Image.NEAREST)
    f = Image.new('RGBA', o.size); f.alpha_composite(o2, (0, int(pad * (1 - sy)) + int(o.height * (1 - sy) * 0.3))); return f.crop(f.getbbox()) if f.getbbox() else f
ANG = [0, 14, 28, 14]
heroes = ['hr1', 'hg']; dirs = ['south', 'east', 'north', 'south-west']; cell = 80
frames = []
for t, a in enumerate(ANG):
    out = Image.new('RGBA', (cell * len(dirs) * 3, cell * len(heroes)), (58, 72, 44, 255)); dr = ImageDraw.Draw(out)
    for ti, k in enumerate(['legend', 'sl', 'ltd']):
        base_w = Image.open(f'art-source/pixellab/wings/{k}_s.png').convert('RGBA'); w = flap(base_w, a)
        for r, hk in enumerate(heroes):
            v = m[hk]; fs = v['idleFs']; foot = v['idleFoot']; sheet = Image.open(f'{D}/{hk}_idle.webp').convert('RGBA')
            for c, d in enumerate(dirs):
                i = v['dirs'].index(d); im = sheet.crop((i * fs, 0, (i + 1) * fs, fs)); bb = im.getbbox(); top = bb[1]; hh = foot - top
                wdir, front, dx = wd.wing_dir(w, d)
                sc = hh * 1.25 / base_w.crop(base_w.getbbox()).width; wg = wdir.resize((max(1, int(wdir.width * sc)), max(1, int(wdir.height * sc))), Image.NEAREST)
                x0 = (ti * len(dirs) + c) * cell; base = r * cell + cell - 6; bob = [0, -1, -2, -1][t]; lift = 9 + bob
                for j in range(5): dr.ellipse((x0 + cell // 2 - 9 + j, base - 3 + j * 0.4, x0 + cell // 2 + 9 - j, base + 3 - j * 0.4), fill=(8, 12, 8, 40 + j * 25))
                hx = x0 + cell // 2 - fs // 2; hy = base - foot - lift; cy = hy + top + int(hh * (0.36 if front else 0.42)) - int(wg.height * 0.1)
                wx = x0 + cell // 2 - wg.width // 2 + int(dx * hh * 1.25)
                if front:
                    bw = int((bb[2] - bb[0]) * 0.62); a_ = wg.getchannel('A'); mx = wg.width // 2 - int(dx * wg.width)
                    ImageDraw.Draw(a_).polygon([(mx - bw * 0.18, int(wg.height * 0.08)), (mx + bw * 0.18, int(wg.height * 0.08)), (mx + bw * 0.55, wg.height), (mx - bw * 0.55, wg.height)], fill=0); wg.putalpha(a_)
                    out.alpha_composite(im, (hx, hy)); out.alpha_composite(wg, (wx, cy - wg.height // 2 + int(wg.height * 0.1)))
                else:
                    out.alpha_composite(wg, (wx, cy - wg.height // 2 + int(wg.height * 0.1))); out.alpha_composite(im, (hx, hy))
    frames.append(out.resize((out.width * 2, out.height * 2), Image.NEAREST).convert('RGB'))
frames[0].save(f'{SP}/wings_flap.gif', save_all=True, append_images=frames[1:], duration=110, loop=0)
print(frames[0].size)
