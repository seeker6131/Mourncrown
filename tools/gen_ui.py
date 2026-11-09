"""Generate a UI skin that matches the dark-forest pixel look (PixelLab map objects, 1 gen each).
Raw images -> art-source/pixellab/ui/<name>.png ; tools/import_ui.py turns them into src/assets/ui/*.webp."""
import os, sys, concurrent.futures as cf
sys.path.insert(0, os.path.dirname(__file__))
import pixellab_api as P
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'art-source', 'pixellab', 'ui')
ST = ', pixel art game UI element, front view, flat, muted desaturated dark-forest colours, plain background'
SPECS = [
 ('panel', 208, 208, 'square window frame border made of dark weathered oak planks with black iron corner brackets and rivets, small moss patches, the middle is completely empty and hollow'),
 ('leather', 128, 128, 'flat surface of dark brown aged leather, subtle worn grain texture, evenly lit, fills the whole image, no border'),
 ('btn', 128, 48, 'wide rectangular button plate of dark oak wood with black iron end caps on the left and right, flat empty face'),
 ('ring', 128, 128, 'round portrait frame ring of dark carved wood bound with an iron band and a few small leaves, the center is empty and hollow'),
 ('slot', 96, 96, 'square inventory slot, dark iron border with four rivets, dark recessed empty inside'),
 ('bar', 320, 48, 'long thin horizontal empty gauge frame of dark iron with small wooden end caps, the long slot in the middle is empty and hollow'),
 ('banner', 256, 64, 'horizontal cloth ribbon banner of worn dark moss-green fabric with frayed folded ends, empty, nothing written'),
 ('ic_bag', 64, 64, 'icon of a brown leather backpack'),
 ('ic_hero', 64, 64, 'icon of an iron knight helmet'),
 ('ic_scroll', 64, 64, 'icon of a rolled parchment quest scroll with a red wax seal'),
 ('ic_gear', 64, 64, 'icon of an iron cog gear'),
 ('ic_full', 64, 64, 'icon of four small iron arrows pointing outward to the corners'),
 ('ic_gold', 48, 48, 'icon of a small pile of gold coins'),
 ('ic_wood', 48, 48, 'icon of two stacked chopped wooden logs'),
 ('ic_stone', 48, 48, 'icon of a grey stone block chunk'),
 ('ic_food', 48, 48, 'icon of a roasted meat leg on the bone'),
 ('ic_build', 64, 64, 'icon of a wooden hammer crossed with a saw'),
]
def run(s):
    name, w, h, desc = s
    out = os.path.join(OUT, name + '.png')
    if os.path.exists(out): return name, 'skip'
    try: P.map_object(desc + ST, w, h, out, 'side'); return name, 'ok'
    except Exception as e: return name, f'err {e}'
if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    only = set(sys.argv[1:])
    with cf.ThreadPoolExecutor(3) as ex:
        for r in ex.map(run, [s for s in SPECS if not only or s[0] in only]): print(*r, flush=True)
    print(P.call('GET', '/balance')['subscription'])
