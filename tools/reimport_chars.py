"""Re-import some characters without touching the others:  python3 -I tools/reimport_chars.py hr7 hr10 hg ...
Reads art-source/pixellab/chars/<key>.zip (or the OLD zips for hero / hr3 / hr4 / hr9), writes src/assets/td/<key>_*.webp
and merges the entry into chars.json. Heroes and villagers go through normalise() (same size + same standing spot in
every pose). DO NOT use for bs3: the remade dragon (chars/bs3b.zip) has its own import (see HANDOFF)."""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import import_chars as I
p = os.path.join(I.OUT, 'chars.json'); man = json.load(open(p))
for k in sys.argv[1:]:
    if k == 'bs3': print('skip bs3 (special import)'); continue
    zs = [os.path.join(I.PL, z) for z in I.OLD[k]] if k in I.OLD else [os.path.join(I.PL, 'chars', k + '.zip')]
    new = {}; I.build(k, zs, new); man[k] = new[k]
    print(k, 'idle', new[k]['idleFs'], {a: (x['fs'], x['n'], len(x['dirs'])) for a, x in new[k]['anims'].items()})
json.dump(man, open(p, 'w'), indent=0)
