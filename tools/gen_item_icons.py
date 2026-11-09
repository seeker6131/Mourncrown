"""Item icons for the class weapons (PixelLab map objects 48x48 -> art-source/pixellab/icons/<icon>.png -> src/assets/icons/<icon>.webp).
Loaded as texture 'icon_<icon>' (same key the panels use)."""
import os, sys, concurrent.futures as cf
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
import pixellab_api as P
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'art-source', 'pixellab', 'icons'); OUT = os.path.join(ROOT, 'src', 'assets', 'icons')
ST = ', single item icon, pixel art, diagonal pose, no background, game inventory icon'
ICONS = {
 'wand0': 'a short plain wooden magic wand with a tiny blue crystal tip',
 'staff2': 'a tall silver staff topped with a glowing crescent moon',
 'staff3': 'a dark twisted staff with a horned skull and a glowing purple gem',
 'bow0': 'a small simple wooden short bow with a string',
 'bow1': 'a dark brown recurve hunting bow with leather grip',
 'bow2': 'an elegant silver elven longbow with leaf engravings',
 'bow3': 'a glowing emerald green spirit bow with vine decorations',
 'mace0': 'a simple iron flanged mace with a wooden handle',
 'hammer1': 'an iron war hammer with a square head',
 'hammer2': 'a heavy steel war hammer with a rivetted head and a small shield emblem',
 'hammer3': 'a huge titan maul with glowing orange runes on a stone head',

 'sword0': 'a plain wooden training sword', 'sword1': 'a sharp steel sword with a leather grip', 'sword2': 'an ornate silver knight sword with a blue gem in the hilt',
 'sword3': 'a flaming red saber with fire along the blade', 'staff0': 'a twisted oak staff topped with a green-blue orb',
 'armor0': 'a plain linen tunic', 'armor1': 'a brown leather hunter armour vest', 'armor2': 'a grey chain mail shirt', 'armor3': 'a golden knight breastplate with a red cape',
 'ring0': 'a simple copper ring with a small green stone', 'amulet0': 'a gold amulet with a big red ruby', 'amulet1': 'a silver pendant with a glowing violet crystal',
 'gem0': 'a glowing green forest heart gem', 'potion_hp': 'a small round red health potion bottle', 'potion_hp_l': 'a large red health potion flask with a gold cap',
 'potion_mp': 'a small round blue mana potion bottle', 'gel': 'a blob of green slime gel', 'spore': 'a purple spotted mushroom cap', 'pelt': 'a folded grey wolf pelt',
 'fang': 'a single sharp goblin fang', 'essence': 'a floating pale blue spirit wisp essence', 'shard': 'a glowing purple mana crystal shard',
}
def run(k):
    out = os.path.join(RAW, k + '.png')
    if os.path.exists(out): return k, 'skip'
    try: P.map_object(ICONS[k] + ST, 48, 48, out, 'side'); return k, 'ok'
    except Exception as e: return k, f'err {e}'
if __name__ == '__main__':
    os.makedirs(RAW, exist_ok=True); os.makedirs(OUT, exist_ok=True)
    if 'import' not in sys.argv:
        with cf.ThreadPoolExecutor(3) as ex:
            for r in ex.map(run, list(ICONS)): print(*r, flush=True)
    for f in os.listdir(RAW):
        im = Image.open(os.path.join(RAW, f)).convert('RGBA'); im = im.crop(im.getbbox())
        n = max(im.size); sq = Image.new('RGBA', (n, n)); sq.paste(im, ((n - im.width) // 2, (n - im.height) // 2))
        sq.resize((40, 40), Image.NEAREST if n <= 40 else Image.LANCZOS).save(os.path.join(OUT, f[:-4] + '.webp'), lossless=True)
    print('icons', len(os.listdir(OUT)))
