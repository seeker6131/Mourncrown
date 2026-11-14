"""pixelfx (https://github.com/patch-gg/pixelfx, MIT) sprite sheets -> src/assets/pfx/<name>.webp + pfx.json
Step 1 (in a pixelfx checkout):  node tools/render.mjs <cat/effect> --sheet --no-actor --out <RAW>
Step 2:  python3 -I tools/import_pfx.py <RAW>
Each effect is resampled to FPS, cut to its max length (MAXDUR) and to the last visible frame, cropped to the union of
visible pixels; the pivot (where it touches the ground / the target) is kept. Add an effect: list it in MAXDUR."""
import os, sys, json
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'src', 'assets', 'pfx'); os.makedirs(OUT, exist_ok=True)
FPS = 24
MAXDUR = {   # seconds kept from the start (short = snappy combat)
 'melee/sword-slash': .6, 'melee/heavy-cleave': .9, 'melee/spin-slash': .8, 'melee/double-slash': .9, 'melee/thrust': .6, 'melee/hammer-smash': 1.0,
 'holy/divine-shield': 1.4, 'holy/blessing': 1.4, 'holy/heal': 1.6, 'holy/smite': 1.1, 'holy/holy-pillar': 1.3, 'holy/sunburst': 1.2,
 'fire/fire-ring': 1.2, 'fire/meteor': 1.5, 'nature/leaf-storm': 1.3, 'nature/root-snare': 1.3, 'nature/thorns': 1.1, 'nature/quake': 1.3,
 'ice/ice-shatter': .9, 'ice/frost-nova': 1.6, 'explosions/small-explosion': 1.0, 'explosions/dirt-explosion': 1.2,
 'lightning/lightning-strike': 1.0, 'lightning/charge-up': 1.2, 'arcane/mana-burst': 1.2, 'arcane/magic-circle-cast': 1.3,
 'shadow/dark-explosion': 1.6, 'shadow/shadow-tendrils': 1.3, 'impacts/hit-spark': .5, 'impacts/crit-hit': .7, 'impacts/blunt-hit': .6,
 'impacts/ground-slam': 1.0, 'impacts/heavy-landing': .9,
 # monsters / bosses attacking the hero
 'melee/claw-swipe': .5, 'nature/earth-spike': 1.1, 'shadow/grasping-hands': 1.3, 'fire/flame-pillar': 1.3, 'ice/ice-spikes': 1.2, 'shadow/necro-skulls': 1.3,
}
START = {'lightning/lightning-strike': .62, 'arcane/magic-circle-cast': 1.25, 'fire/meteor': .42, 'holy/smite': .0}   # skip a slow wind-up
def main(raw):
    man = {}
    for fid, dur in MAXDUR.items():
        cat, name = fid.split('/'); d = os.path.join(raw, cat, name)
        j = json.load(open(os.path.join(d, name + '.json'))); sheet = Image.open(os.path.join(d, name + '.png')).convert('RGBA')
        meta = j['meta']['pixelfx']; src_fps = meta['fps']; px, py = meta['pivot']
        frames = [sheet.crop((f['frame']['x'], f['frame']['y'], f['frame']['x'] + f['frame']['w'], f['frame']['y'] + f['frame']['h'])) for f in j['frames']]
        st = int(START.get(fid, 0) * src_fps); frames = frames[st:]
        n = min(len(frames), int(dur * src_fps))
        pick = [frames[min(n - 1, round(i * src_fps / FPS))] for i in range(max(1, round(n * FPS / src_fps)))]
        while len(pick) > 1 and pick[-1].getbbox() is None: pick.pop()
        # peak = the brightest frame (the moment of impact) so the game can time the damage to it
        lum = [sum(1 for q in im.getdata() if q[3] > 128 and q[0] + q[1] + q[2] > 600) for im in pick]; peak = lum.index(max(lum))   # most near-white pixels = the flash
        boxes = [im.getbbox() for im in pick if im.getbbox()]
        x0, y0 = min(b[0] for b in boxes), min(b[1] for b in boxes); x1, y1 = max(b[2] for b in boxes), max(b[3] for b in boxes)
        fw, fh = x1 - x0, y1 - y0
        cols = max(1, min(len(pick), 2048 // fw)); rows = (len(pick) + cols - 1) // cols
        out = Image.new('RGBA', (cols * fw, rows * fh))
        for i, im in enumerate(pick): out.paste(im.crop((x0, y0, x1, y1)), ((i % cols) * fw, (i // cols) * fh))
        key = name; out.save(os.path.join(OUT, key + '.webp'), quality=82, method=6, alpha_quality=90)
        man[key] = {'fw': fw, 'fh': fh, 'n': len(pick), 'fps': FPS, 'px': px - x0, 'py': py - y0, 'peak': peak}
        print(f'{fid:28s} {len(pick):3d}f {fw}x{fh} peak {peak}')
    json.dump(man, open(os.path.join(OUT, 'pfx.json'), 'w'))
if __name__ == '__main__': main(sys.argv[1])
