# 🪽 Wings: the 8 directions made from the ONE approved front picture (PixelLab per-direction pictures did not match — 14 Nov).
# Preview: python3 -I tools/wing_dirs_preview.py <out dir> hr1,hr5,hg  -> <out>/w8_<tier>.png
import sys, json
from PIL import Image, ImageDraw, ImageEnhance
SP=sys.argv[1]; D='src/assets/td'; m=json.load(open(D+'/chars.json'))
def wing_dir(w, d):
    """front picture -> the picture for direction d, plus whether it is drawn in front of the body and an x offset (in wing widths)"""
    w = w.crop(w.getbbox()); W, H = w.size; L = w.crop((0, 0, W // 2, H)); R = w.crop((W // 2, 0, W, H))
    def join(a, b, gap=0):
        o = Image.new('RGBA', (a.width + b.width - gap, H)); o.alpha_composite(a, (0, 0)); o.alpha_composite(b, (a.width - gap, 0)); return o
    dark = lambda im, f=0.72: Image.merge('RGBA', (*ImageEnhance.Brightness(im.convert('RGB')).enhance(f).split(), im.getchannel('A')))
    sq = lambda im, f: im.resize((max(1, int(im.width * f)), H), Image.NEAREST)
    base = d.replace('west', 'east'); mir = 'west' in d
    if base == 'south': o, front, dx = w, False, 0
    elif base == 'north': o, front, dx = dark(w, 0.85), True, 0
    elif base == 'south-east': o, front, dx = join(L, dark(sq(R, 0.5))), False, -0.12
    elif base == 'north-east': o, front, dx = join(dark(L, 0.85), dark(sq(R, 0.5), 0.7)), True, -0.12
    else:   # east: both wings sweep back (to the left), the far one darker and smaller behind
        far = dark(sq(L, 0.75), 0.6); o = Image.new('RGBA', (L.width, H)); o.alpha_composite(far, (L.width - far.width, -2 if H > 4 else 0)); o.alpha_composite(L, (0, 2)); front, dx = False, -0.18
    if mir: o = o.transpose(Image.FLIP_LEFT_RIGHT); dx = -dx
    return o, front, dx
DIRS = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west']
if __name__ == '__main__':
    heroes = sys.argv[2].split(','); cell = 70
    for k in ['legend', 'sl', 'ltd']:
        wing = Image.open(f'art-source/pixellab/wings/{k}_s.png').convert('RGBA')
        out = Image.new('RGBA', (cell * 8, cell * len(heroes)), (58, 72, 44, 255)); dr = ImageDraw.Draw(out)
        for r, hk in enumerate(heroes):
            v = m[hk]; fs = v['idleFs']; foot = v['idleFoot']; sheet = Image.open(f'{D}/{hk}_idle.webp').convert('RGBA')
            for c, d in enumerate(DIRS):
                i = v['dirs'].index(d); im = sheet.crop((i * fs, 0, (i + 1) * fs, fs)); bb = im.getbbox(); top = bb[1]; hh = foot - top
                wd, front, dx = wing_dir(wing, d)
                sc = hh * 1.25 / wing.crop(wing.getbbox()).width; wg = wd.resize((max(1, int(wd.width * sc)), max(1, int(wd.height * sc))), Image.NEAREST)
                x0 = c * cell; base = r * cell + cell - 5; lift = 8
                for j in range(5): dr.ellipse((x0 + cell // 2 - 9 + j, base - 3 + j * 0.4, x0 + cell // 2 + 9 - j, base + 3 - j * 0.4), fill=(8, 12, 8, 50 + j * 30))
                hx = x0 + cell // 2 - fs // 2; hy = base - foot - lift; cy = hy + top + int(hh * (0.36 if front else 0.42))
                wx = x0 + cell // 2 - wg.width // 2 + int(dx * hh * 1.25)
                if not front: out.alpha_composite(wg, (wx, cy - wg.height // 2))
                out.alpha_composite(im, (hx, hy))
                if front:   # seen from behind: the wings come out of the shoulders — the back itself stays visible
                    bw = int((bb[2] - bb[0]) * 0.62); cxm = x0 + cell // 2 - wx + (int(dx * hh * 1.25) if dx else 0) * 0 ; top0 = int(wg.height * 0.32)
                    cut = wg.copy(); a_ = cut.getchannel('A'); from PIL import ImageDraw as _D; mx = wg.width // 2 - (int(dx * wg.width) if dx else 0); _D.Draw(a_).polygon([(mx - bw * 0.18, int(wg.height * 0.08)), (mx + bw * 0.18, int(wg.height * 0.08)), (mx + bw * 0.55, wg.height), (mx - bw * 0.55, wg.height)], fill=0); cut.putalpha(a_)
                    out.alpha_composite(wg.copy() if False else cut, (wx, cy - wg.height // 2))
        out.resize((out.width * 3, out.height * 3), Image.NEAREST).save(f'{SP}/w8_{k}.png')
