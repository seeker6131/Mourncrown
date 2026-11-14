"""Skill icons, round and gold-rimmed like the painted set players liked (src/assets/ui/skill0-7) — one per skill, none
the same. PixelLab /generate-image-v2 with that set as the style image: each call gives 16 tries at 64 px; one is
picked per skill (by eye), then src/assets/skills/<id>.webp is replaced, so the skill window and the battle buttons
(both read the skill atlas) show the same picture.
python3 -I tools/gen_skill_icons2.py <id ...>   -> art-source/pixellab/skillicons/<id>_sheet.png (+ <id>_NN.png)"""
import os, sys, io, json, time, base64, concurrent.futures as cf
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pixellab_api as P
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'art-source', 'pixellab', 'skillicons'); os.makedirs(OUT, exist_ok=True)
def b64(path):
    im = Image.open(path).convert('RGBA'); b = io.BytesIO(); im.save(b, 'PNG'); return {'type': 'base64', 'base64': base64.b64encode(b.getvalue()).decode()}, im.size
STYLE, SSZ = b64(os.path.join(ROOT, 'src', 'assets', 'ui', 'skill1.webp'))
TAIL = (', a round fantasy RPG skill icon: a circular gold ornamental rim with small gems, the scene painted inside the circle, '
        'dramatic lighting and glow, rich colours, readable at small size, centred, no text')
SK = {   # id: what is painted inside (the skill's own look — no two alike)
    'v_bash': 'a plain wooden club swung down hard with a dusty impact burst, simple village weapon',
    's2_cleave': 'a steel sword splitting a boulder in two with orange sparks flying',
    's2_whirl': 'a sword spinning in a full circle leaving a silver whirlwind trail',
    's2_guard': 'a round steel shield raised in front with a pale blue guard glow',
    's3_charge': 'a knight lance charging forward with speed lines and a red trail',
    's3_crusade': 'a knightly longsword with a red cross hilt glowing with white holy light',
    's3_valor': 'a lion head crest on a blue banner with golden courage aura',
    's4_judgment': 'a golden sword falling from heaven through clouds onto the ground with a beam of light',
    's4_blades': 'many small holy golden blades circling in a storm',
    's4_aegis': 'a radiant golden shield with a sun emblem and a dome of light',
    'a2_double': 'two arrows flying side by side with green trails',
    'a2_fan': 'five arrows spreading out in a fan shape',
    'a2_focus': 'a hunter eye with a green crosshair focus',
    'a3_pierce': 'one arrow piercing through a heart-shaped target with a bright streak',
    'a3_rain': 'a rain of arrows falling from a dark sky',
    'a3_trap': 'a snare of thorny green vines bursting from the ground',
    'a4_spirit': 'a glowing green spirit deer shaped arrow',
    'a4_storm': 'an emerald storm of glowing arrows swirling',
    'a4_wind': 'a swirling green wind with a feather crown',
    'm2_bolt': 'a sharp ice crystal spear flying with frost mist',
    'm2_fire': 'a blazing fireball with a trail of flames',
    'm2_heal': 'soft green healing light with a leaf and sparkles',
    'm3_chain': 'a blue lightning bolt chaining between three points',
    'm3_arcane': 'an exploding purple star burst of arcane energy',
    'm3_volley': 'many small glowing magic missiles flying forward',
    'm4_meteor': 'a blood red meteor crashing down with fire',
    'm4_void': 'a black and violet void spear tearing space',
    'm4_dread': 'a dark wave of death skulls rippling outward',
    't2_slam': 'a heavy iron shield bash with a shockwave',
    't2_wall': 'a wall of iron plates locked together',
    't2_recover': 'a kneeling warrior silhouette with a warm healing glow',
    't3_quake': 'a war hammer smashing the ground with cracks spreading',
    't3_ram': 'an armoured shoulder ramming forward with steel sparks',
    't3_bulwark': 'a tower shield planted like a fortress gate',
    't4_titan': 'a giant armoured titan fist striking down from above',
    't4_fortress': 'a stone fortress tower with glowing orange runes',
    't4_lion': 'a roaring golden lion head with a sound wave',
}
# director 14 Nov: "all the same look" — no style image any more; each class has its own frame and colours,
# attacks burst out of the frame, buffs are a still emblem, the last form's skills get a bigger crowned frame
CLASS_STYLE = {
    'v': 'framed by a plain rough wooden square frame, earthy brown and green colours',
    's': 'framed by a battered steel shield-shaped frame with rivets and nicks, crimson red and cold steel colours, sparks',
    'a': 'framed by a carved wooden frame wrapped in leaves and vines, forest green and amber colours, motion of wind',
    'm': 'no solid frame: a glowing ring of floating violet arcane runes around it, deep purple and electric blue colours, magic bursting out',
    't': 'framed by a white marble frame with gold inlay and a soft halo, holy white and gold colours, radiant light',
}
KIND = {'buff': 'shown as a still heraldic emblem in the centre', 'shield': 'shown as a still heraldic emblem in the centre', 'heal': 'shown as a still glowing emblem in the centre'}
def prompt(sid):
    from_skill = SK[sid]; cls = sid[0]; tier = sid[1] if sid[1].isdigit() else '1'
    import re
    kind = KINDS.get(sid, 'strike')
    look = KIND.get(kind, 'dynamic action bursting diagonally out of the frame')
    crown = ', the frame larger and more ornate with small wings and a crown on top' if tier == '4' else ''
    return f'{from_skill}, {look}, a square fantasy RPG skill icon {CLASS_STYLE[cls]}{crown}, pixel art, crisp, readable at small size, no text'
KINDS = {}
def run(sid):
    sheet = os.path.join(OUT, f'{sid}_c_sheet.png')
    if os.path.exists(sheet): return sid, 'skip'
    body = {'description': prompt(sid), 'image_size': {'width': 64, 'height': 64}, 'no_background': True}
    r = P.call('POST', '/generate-image-v2', body); jid = r.get('background_job_id')
    for _ in range(120):
        j = P.call('GET', f'/background-jobs/{jid}')
        if j.get('status') in ('completed', 'failed'): break
        time.sleep(5)
    if j.get('status') != 'completed': return sid, 'failed ' + json.dumps(j)[:200]
    imgs = []
    def walk(x):
        if isinstance(x, dict):
            if x.get('type') == 'base64' and x.get('base64'): imgs.append(x['base64']); return
            for v in x.values(): walk(v)
        elif isinstance(x, list):
            for v in x: walk(v)
    walk(j.get('last_response', j))
    ims = [Image.open(io.BytesIO(base64.b64decode(b.split(',')[-1]))).convert('RGBA') for b in imgs]
    for i, im in enumerate(ims): im.save(os.path.join(OUT, f'{sid}_c{i:02d}.png'))
    n = len(ims); cols = 8; sh = Image.new('RGBA', (cols * 70, ((n + cols - 1) // cols) * 80), (40, 34, 30, 255))
    from PIL import ImageDraw
    d = ImageDraw.Draw(sh)
    for i, im in enumerate(ims): sh.alpha_composite(im, ((i % cols) * 70 + 3, (i // cols) * 80 + 12)); d.text(((i % cols) * 70 + 3, (i // cols) * 80), str(i), fill=(255, 255, 120, 255))
    sh.save(sheet); return sid, f'{n} images'
if __name__ == '__main__':
    import re as _re
    src = open(os.path.join(ROOT, 'src', 'data', 'skills.ts'), encoding='utf-8').read()
    KINDS.update(dict(_re.findall(r"id:\s*'([a-z0-9_]+)'[^}]*?kind:\s*'([a-z]+)'", src)))
    ids = sys.argv[1:] or list(SK)
    with cf.ThreadPoolExecutor(3) as ex:
        for r in ex.map(run, ids): print(*r, flush=True)
