"""🪽 Wings (fashion, diamond wheel only — director 14 Nov): one wing picture per tier, drawn behind / in front of any hero.
Sample step: python3 -I tools/gen_wings.py [tier ...]  -> art-source/pixellab/wings/<tier>_s.png (facing the viewer)"""
import os, sys, concurrent.futures as cf
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pixellab_api as P

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'art-source', 'pixellab', 'wings'); os.makedirs(OUT, exist_ok=True)
SEED = 4127
SEEDS = {'l_hawk': 5203, 'l_bat': 5203, 's_dragon': 5203}   # (retries after a whole animal came out)   # (keep: the approved sample's seed is reused for the other directions)
TAIL = (', a pair of wings only, no person, no body, no head, an empty gap in the middle between the two wings where a back would be, '
        'symmetrical, both wings spread wide and slightly raised, seen from behind and slightly above like a classic 2D top-down RPG, '
        'not isometric, no ground, no background, pixel art, soft shading, readable at small size')
WINGS = {   # tier: L = Legend (no aura) · S = SL (thin aura, code) · X = Limited (aura, code; OBT)
    'legend': 'large white feathered angel wings with warm gold trim along the feather edges, layered feathers, ivory and pale gold',
    'l_hawk': 'two detached hawk wings like a costume worn on the back, NO bird body, NO head, NO tail, just the two wings with brown and golden-tan barred feathers, sharp dark wing tips, layered feathers',
    'l_fairy': 'large emerald green butterfly wings with fine gold vein patterns and small pale spots, four rounded wing lobes',
    'l_bat': 'two detached black leather bat wings like a costume worn on the back, NO bat body, NO head, NO ears, just the two wings, with dark grey membranes stretched between thin bony fingers, small claws at the top',
    'l_leaf': 'large wings made of overlapping autumn leaves in orange, amber and deep green, leaf veins visible',
    'sl': 'large deep crimson feathered wings, the feather tips turning into small orange and yellow flames, dark red to ember orange',
    's_ice': 'large wings made of sharp pale blue ice crystals and frozen feathers, white frost highlights, translucent cyan edges',
    's_dragon': 'two detached dragon wings like a costume worn on the back, NO dragon body, NO head, NO tail, NO legs, just the two wings, with dark green scaled membranes, golden wing bones and small horns along the top edge',
    's_moon': 'large silver and pale lavender feathered wings with tiny star sparkles on the feathers, moonlight shine',
    's_gold': 'large armoured wings of polished gold metal feathers with white inner feathers, holy paladin style',
    'ltd': 'large dark blue and violet feathered storm wings, thin bright cyan lightning lines running along the wing edges',
    'x_cosmos': 'large cosmic wings filled with a deep purple and blue night sky, small bright stars and a pink nebula glow inside the feathers',
    'x_fallen': 'large fallen angel wings, the left wing pure white feathers and the right wing pure black feathers, a thin golden edge on both',
}
# the other views (W, SW, NW = mirrored E, SE, NE). Colours come from the approved front picture (color_image).
VIEW = {
    's': TAIL,
    'n': (', a pair of wings only, no person, no body, seen from directly behind the wearer: the backs of both wings spread wide and slightly raised, '
          'symmetrical, the two wing roots meeting in the middle, not isometric, no ground, no background, pixel art, soft shading, readable at small size'),
    'e': (', a pair of wings only, no person, no body, seen from the side as worn by someone facing right: both wings half open and sweeping back '
          'to the left, the near wing in front of the far wing, side view, not isometric, no ground, no background, pixel art, soft shading, readable at small size'),
    'se': (', a pair of wings only, no person, no body, three-quarter view as worn by someone facing down and to the right: both wings spread out '
           'behind, the left wing large and fully visible, the right wing smaller and partly hidden, not isometric, no ground, no background, pixel art, soft shading, readable at small size'),
    'ne': (', a pair of wings only, no person, no body, three-quarter back view as worn by someone facing up and to the right: the backs of both wings '
           'spread out, the left wing large and fully visible, the right wing smaller, not isometric, no ground, no background, pixel art, soft shading, readable at small size'),
}
def ci(k):
    import base64
    return {'type': 'base64', 'base64': base64.b64encode(open(os.path.join(OUT, f'{k}_s.png'), 'rb').read()).decode()}
def one(job):
    k, v = job; out = os.path.join(OUT, f'{k}_{v}.png')
    if os.path.exists(out): return k, v, 'skip'
    try:
        extra = {} if v == 's' else {'color_image': ci(k)}
        P.map_object(WINGS[k] + VIEW[v], 80, 64, out, 'low top-down', seed=SEEDS.get(k, SEED), **extra); return k, v, 'ok'
    except Exception as e: return k, v, f'err {e}'
if __name__ == '__main__':
    ks = [a for a in sys.argv[1:] if a in WINGS] or list(WINGS); vs = [a for a in sys.argv[1:] if a in VIEW] or list(VIEW)
    with cf.ThreadPoolExecutor(3) as ex:
        for r in ex.map(one, [(k, v) for k in ks for v in vs]): print(*r, flush=True)
