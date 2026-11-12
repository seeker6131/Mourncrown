"""Guild art (art-source/pixellab/guild, made by tools/gen_guild_art2.py) -> the game.
  def_*.png / fu_*.png / dc_*.png -> src/assets/td/obj/<name>.png + objs.json entry (foot = bbox bottom), like tools/import_td_objs.py
(animated effects come from tools/gen_vfx2.py and go to src/assets/td/fx/ by themselves)
python3 -I tools/import_guild_art.py
"""
import json, os, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art-source/pixellab/guild')
OBJ = os.path.join(ROOT, 'src/assets/td/obj')


def main():
    meta_p = os.path.join(OBJ, 'objs.json')
    meta = json.load(open(meta_p))
    n = 0
    for f in sorted(os.listdir(SRC)):
        name, ext = os.path.splitext(f)
        if ext != '.png': continue
        if not name.startswith(('def_', 'fu_', 'dc_', 'pp_')): continue
        im = Image.open(os.path.join(SRC, f)).convert('RGBA')
        bb = im.getchannel('A').point(lambda a: 255 if a > 24 else 0).getbbox()
        if not bb: print('empty', f); continue
        im.save(os.path.join(OBJ, f), optimize=True)
        meta[name] = {'w': im.width, 'h': im.height, 'foot': bb[3], 'x0': bb[0], 'x1': bb[2], 'top': bb[1]}
        n += 1
    json.dump(meta, open(meta_p, 'w'))
    print('imported', n, 'files')


if __name__ == '__main__':
    sys.exit(main())
