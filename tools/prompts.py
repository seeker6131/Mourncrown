"""Prompt Book v3 — top-down 3/4 pixel art, muted dark-forest tone (inspired by the tone/camera of indie top-down pixel MMOs).
Tools: PixelLab (characters, monsters, tilesets, objects) + ChatGPT/Gemini (buildings and props, pixelised afterwards by
tools/pixelize.py) + optional video AI (Minimax/Veo) for animation frames.
Single source of truth. Older books (isometric) are retired; they live in git history.
python3 tools/prompts.py <out.html>  -> writes docs/PROMPTS.md and a phone-friendly HTML page with copy buttons.
"""
import json, sys, os

# ---------- shared style (our own words; never attach another game's screenshots) ----------
TONE = ("muted dark-forest fantasy palette: desaturated teal and moss greens, slate-grey cobblestone, warm weathered brown wood, "
        "dusty straw yellow, cool dusk lighting, low contrast, soft shading, 1-pixel dark outline")
PL = "top-down pixel art, muted desaturated dark-forest colours, soft shading"   # PixelLab likes short descriptions
GPT = ("True pixel art game asset, top-down 3/4 view (camera looking down at about 60 degrees, front faces visible, roofs seen "
       f"from above), like a cozy indie pixel RPG. {TONE[0].upper() + TONE[1:]}. Crisp square pixels on a clear grid, no anti-aliasing, "
       "no blur, no gradients, limited palette of about 32 colours. Scale: a person is 32 pixels tall, a door is 32 pixels tall, a "
       "ground tile is 32x32 pixels. Plain pure white background, no shadow on the white, no text, no watermark.")

S = []  # sections: (id, title, note, [(code, title, prompt)])
def sec(sid, title, note=''):
    S.append((sid, title, note, []))
def P(code, title, prompt):
    S[-1][3].append((code, title, prompt))

# ---------------- 1. tilesets (PixelLab: Create tileset, top-down) ----------------
sec('tiles', '① แผ่นพื้น (PixelLab → Create tileset • Top-down • 32×32)',
    'ใน PixelLab เลือก Create tileset (top-down) • ข้อ a วางในช่อง Lower ข้อ b วางในช่อง Upper (1 ชุด = 1 ครั้ง) • ขนาด 32 • '
    'ได้ชุดแผ่นพื้นที่ต่อขอบกันเอง ผมเอาไปวาดแมพได้ทุกรูปแบบ (ทางเดิน ลาน ริมน้ำ หน้าผา) • ทำ TL1-TL4 ก่อน พอสร้างหมู่บ้านได้')
TILES = [
    ('TL1', 'หญ้า ↔ ทางดิน', 'dense dark moss-green grass with tiny weeds', 'packed brown dirt path with small pebbles'),
    ('TL2', 'หญ้า ↔ ทางหินปู', 'dense dark moss-green grass with tiny weeds', 'worn slate-grey cobblestone road, irregular stones, moss in the gaps'),
    ('TL3', 'น้ำ ↔ หญ้า (ริมน้ำ)', 'calm deep teal river water with soft ripples', 'dense dark moss-green grass with a muddy bank edge'),
    ('TL4', 'หญ้า ↔ หน้าผาหิน', 'dense dark moss-green grass', 'raised rocky plateau with a vertical grey stone cliff face on its south side'),
    ('TL5', 'พื้นป่ามืด ↔ ใบไม้ร่วง', 'dark forest floor of moss and roots', 'fallen rust-brown leaves and twigs'),
    ('TL6', 'หิมะ ↔ ทางน้ำแข็ง', 'soft blue-white snow', 'packed icy path with blue cracks'),
    ('TL7', 'หินภูเขาไฟ ↔ ลาวา', 'dark cracked basalt rock', 'glowing orange lava with a dark crust'),
    ('TL8', 'พื้นคุกใต้ดิน ↔ ทางน้ำ', 'old blue-grey dungeon flagstones with moss', 'dark sewer water channel'),
]
for c, t, lo, up in TILES:
    P(c + 'a', t + ' — ช่อง Lower (ล่าง)', f"{lo}, {PL}")
    P(c + 'b', t + ' — ช่อง Upper (บน)', f"{up}, {PL}")

# ---------------- 2. hero (PixelLab: Create character) ----------------
sec('hero', '② ฮีโร่ (PixelLab → Create character • 48px • 4 ทิศ • low top-down)',
    'ตั้งค่า: ขนาด 48 • 4 directions • view: low top-down • outline: single color black • shading: medium • detail: medium • '
    'ได้ตัวละคร 4 ทิศแล้ว กด Animate → เลือกท่า walk / attack / cast / hurt / death ตามรายการ ⑦ • '
    'ทำ HR0 (ชาวบ้าน) ก่อน เพราะเป็นร่างแรกของเกม • ทุกร่างคือหนุ่มผมน้ำตาลคนเดิม ใส่ชุดต่างกัน • ท่าเดินใช้ Template motion → Skeleton v3 (ของที่ถือเพี้ยนน้อย) • ถ้าอาวุธในมือส่ายตอนเดิน ให้เพิ่มคำว่า weapon sheathed / on the back, hands empty')
FORMS = [
    ('HR0', 'ชาวบ้าน (ร่างแรก)', 'young man with short messy brown hair, plain beige linen shirt, brown trousers, rope belt, worn boots, a wooden sword sheathed at his hip, hands empty'),
    ('HR1', 'นักดาบ', 'same young man, blue tunic with leather shoulder guard, red headband, green scarf, steel short sword and small round shield'),
    ('HR2', 'อัศวิน', 'same young man in polished steel plate armour, blue tabard, red cape, closed knight helmet with red plume, longsword and kite shield'),
    ('HR3', 'ลอร์ดอัศวิน', 'same young man in ornate white-and-gold plate armour with glowing blue runes, royal blue cape, winged full helmet, radiant greatsword'),
    ('HR4', 'นักธนู', 'same young man in green hooded tunic, leather bracers, quiver on the back, simple wooden bow'),
    ('HR5', 'พรานป่า', 'same young man in layered green-brown leather armour, fur-lined hood, cloth mask over nose and mouth, carved longbow'),
    ('HR6', 'เรนเจอร์ราชันย์', 'same young man in emerald-and-gold elven armour, leaf-pattern cape, golden half mask, glowing bow of light'),
    ('HR7', 'จอมเวท', 'same young man in purple hooded robe with gold trim, potion pouches, wooden staff with a blue crystal'),
    ('HR8', 'ปราชญ์เวท', 'same young man in long violet star-embroidered robe, tall pointed wizard hat, face veil, silver staff with orbiting crystal'),
    ('HR9', 'อาร์คเมจทมิฬ', 'same young man in tattered jet-black robes with crimson runes, horned black hood, iron skull mask with red eyes, bone staff with crimson crystal'),
    ('HR10', 'ผู้พิทักษ์ (แทงค์)', 'same young man in thick iron armour over chainmail, open-face iron helmet, huge rectangular tower shield, short heavy mace'),
    ('HR11', 'อัศวินเหล็กกล้า', 'same young man in massive dark steel plate armour with spiked pauldrons, closed great-helm with glowing visor slit, spiked tower shield, war hammer'),
    ('HR12', 'ป้อมปราการมนุษย์', 'same young man in colossal black-and-gold plate armour with glowing orange runes, horned helmet with iron face mask, castle-gate tower shield, glowing war hammer'),
]
for c, t, d in FORMS:
    P(c, t, f"{d}, {PL}")

# ---------------- 3. monsters ----------------
sec('mon', '③ มอนสเตอร์ (PixelLab → Create character • 4 ทิศ • low top-down)',
    'ขนาดตามที่เขียนในหัวข้อ (ตัวเล็ก 32 • ตัวกลาง 48 • ตัวใหญ่ 64) • ท่าที่ต้องมี: walk + attack + death (ดู ⑦) • '
    'ตัวที่ใช้ในหมู่บ้านแรกก่อน: MO1 สไลม์ MO2 เห็ด MO3 หมาป่า MO4 ก็อบลิน')
MONS = [
    ('MO1', 'สไลม์ • 32', 'small round moss-green slime with a glossy top and two dot eyes'),
    ('MO2', 'เห็ดพิษ • 32', 'walking toadstool mushroom monster with a red-brown spotted cap and stubby legs'),
    ('MO3', 'หมาป่า • 48', 'lean grey forest wolf with a dark back stripe, snarling'),
    ('MO4', 'ก็อบลิน • 48', 'short green goblin in ragged leather with a crude dagger'),
    ('MO5', 'วิญญาณไฟ • 32', 'floating pale blue-green will-o-wisp flame spirit with a faint face'),
    ('MO6', 'หนูยักษ์ • 32', 'giant brown sewer rat with a long pink tail'),
    ('MO7', 'โครงกระดูก • 48', 'skeleton warrior with a rusty sword and a cracked wooden shield'),
    ('MO8', 'โครงกระดูกธนู • 48', 'skeleton archer with a bone bow and a tattered hood'),
    ('MO9', 'ผี • 48', 'translucent grey-blue hooded ghost with long sleeves and glowing eyes'),
    ('MO10', 'แมงมุมยักษ์ • 48', 'giant dark purple forest spider with hairy legs and red eyes'),
    ('MO11', 'อิมป์ไฟ • 32', 'small red fire imp with bat wings and a flaming tail'),
    ('MO12', 'โกเลมหิน • 64', 'hulking moss-covered stone golem with glowing teal cracks'),
    ('MO13', 'ซาลาแมนเดอร์ • 48', 'black-and-orange fire salamander lizard with ember spots'),
    ('MO14', 'หมาป่าน้ำแข็ง • 48', 'white-blue ice wolf with frosty crystal fur on its back'),
    ('MO15', 'เยติ • 64', 'big white furry yeti with blue-grey face and huge hands'),
    ('MO16', 'กวาง (สัตว์ล่า) • 48', 'brown forest deer stag with branching antlers'),
    ('MO17', 'หมูป่า (สัตว์ล่า) • 48', 'dark bristly wild boar with curved tusks'),
]
for c, t, d in MONS:
    P(c, t, f"{d}, {PL}")

sec('boss', '④ บอส (PixelLab → Create character • 96–128 ถ้าบัญชีทำได้ ไม่งั้นใช้ GPT ข้อ GB)',
    'รุ่นฟรีของ PixelLab อาจทำขนาดใหญ่ไม่ได้ ถ้าไม่ได้ให้ใช้ prompt GB (ChatGPT) แทน ผมแปลงเป็นพิกเซลแท้ให้')
BOSS = [
    ('BS1', 'ทรีนท์ผู้พิโรธ', 'ancient angry treant tree monster with a gnarled bark face, mossy branches and glowing green eyes'),
    ('BS2', 'กวางคำสาป', 'giant cursed stag with ghostly antlers wrapped in purple mist and glowing eyes'),
    ('BS3', 'มังกรลาวา', 'large black lava dragon with glowing orange cracks, horned head and folded wings'),
    ('BS4', 'ยักษ์น้ำแข็ง', 'towering frost giant with ice armour, frozen beard and a huge ice club'),
    ('BS5', 'ราชาโครงกระดูก', 'horned skeleton king in rusted black armour with a glowing purple sword and tattered crown'),
]
for c, t, d in BOSS:
    P(c, t, f"{d}, {PL}")
for c, t, d in BOSS:
    P('G' + c, f'{t} (ChatGPT)', f"{GPT} Subject: a boss monster for the game, about 4 times the height of a person: {d}. Show it facing down-right "
      "in an idle pose, full body, centred.")

# ---------------- 5. NPCs & animals ----------------
sec('npc', '⑤ ชาวบ้านและสัตว์ (PixelLab → Create character • 48 / สัตว์ 32 • 4 ทิศ)', 'ท่าที่ต้องมี: idle + walk (คนงานเพิ่ม work)')
NPCS = [
    ('NP1', 'ผู้เฒ่าหมู่บ้าน', 'old village elder with a long white beard, hooded grey-green robe and a gnarled staff'),
    ('NP2', 'พ่อค้า', 'plump travelling merchant with a big backpack, felt hat and coin pouch'),
    ('NP3', 'ช่างตีเหล็ก', 'burly blacksmith with a leather apron, rolled sleeves and a hammer'),
    ('NP4', 'คนตัดไม้', 'lumberjack in a plaid shirt with an axe over his shoulder'),
    ('NP5', 'คนงานเหมือง', 'miner with a helmet lamp and a pickaxe'),
    ('NP6', 'แม่ครัว', 'cook woman with a white apron and a wooden ladle'),
    ('NP7', 'สาวโรงเตี๊ยม', 'tavern barmaid with braided hair carrying a mug'),
    ('NP8', 'ยามหมู่บ้าน', 'village guard in a padded gambeson with a spear'),
    ('NP9', 'เด็กในหมู่บ้าน', 'small village kid with messy hair and patched clothes'),
    ('NP10', 'เอลฟ์นักธนู', 'blonde elf archer girl with a green hood and a longbow'),
    ('AN1', 'แมว • 32', 'small tabby cat'), ('AN2', 'แกะ • 32', 'fluffy cream sheep'), ('AN3', 'วัว • 48', 'brown and white cow'),
    ('AN4', 'หมู • 32', 'pink farm pig'), ('AN5', 'ไก่ • 32', 'white hen'),
]
for c, t, d in NPCS:
    P(c, t, f"{d}, {PL}")

# ---------------- 6. buildings & objects ----------------
sec('bld', '⑥ อาคาร 3 ระดับ (ChatGPT / Gemini • ผมแปลงเป็นพิกเซลแท้)',
    'วางใน ChatGPT หรือแอป Gemini (ไม่ต้องแนบรูป) • 1 รูป = อาคาร 3 ระดับ เรียงซ้าย→ขวา • พื้นหลังขาว • '
    'ผมจะลดขนาดให้ลงตาราง 32 px และบังคับชุดสีเดียวกันทั้งเกม ถ้า PixelLab บัญชีพี่ทำ map object ขนาดใหญ่ได้ จะใช้ PixelLab แทนก็ได้')
def bld(desc):
    return (f"{GPT} Subject: THREE versions of the same building side by side with wide white gaps, left to right: level 1 small and "
            f"humble, level 3 sturdier, level 5 grand and decorated: {desc} Every version has the same footprint (about 4 x 3 ground tiles, "
            "128 x 96 pixels at the base); higher levels grow taller and richer, not wider. The building only: no ground patch, no grass "
            "around it. Front wall and door facing the viewer.")
BLD = [
    ('BD1', 'ศาลากลาง', 'a village town hall with a bell tower and banners.'),
    ('BD2', 'บ้านพัก', 'a villager cottage with a chimney and flower boxes.'),
    ('BD3', 'โรงเลื่อย', 'a timber sawmill shed with a big circular saw and stacked logs under its roof.'),
    ('BD4', 'เหมืองหิน', 'a stone-cutting shed with a wooden crane and cut stone blocks.'),
    ('BD5', 'คอกสัตว์', 'a red wooden barn with a hay loft door.'),
    ('BD6', 'โรงตีเหล็ก', 'an open-fronted blacksmith forge with a stone chimney, anvil and glowing furnace.'),
    ('BD7', 'ครัว', 'a cookhouse with a smoking chimney and a big cauldron by the door.'),
    ('BD8', 'โกดัง', 'a wide storehouse with big double doors and crates.'),
    ('BD9', 'โรงเตี๊ยม', 'a two-storey tavern inn with a hanging sign and warm lit windows.'),
    ('BD10', 'ตลาด', 'a covered market hall with striped awnings and goods on tables.'),
    ('BD11', 'หอป้องกัน', 'a defence tower: level 1 wooden watchtower, level 3 stone tower with a ballista, level 5 tall stone tower with a glowing crystal.'),
    ('BD12', 'ไซต์ก่อสร้าง', 'a construction site in three stages: staked foundation with lumber, half-built timber frame with scaffolding, almost finished house with scaffolding.'),
]
for c, t, d in BLD:
    P(c, t, bld(d))

sec('obj', '⑦ ของในฉาก (PixelLab → Create map object • หรือ ChatGPT ข้อ GO)',
    'PixelLab: Create map object • view: low top-down • ขนาดตามหัวข้อ • ถ้าใช้ ChatGPT ใช้ข้อ GO1-GO4 ได้หลายชิ้นในรูปเดียว')
OBJ = [
    ('OB1', 'ต้นสนเขียวหม่น • 64', 'tall dark teal-green pine tree with a visible trunk'),
    ('OB2', 'ต้นโอ๊กใหญ่ • 96', 'big round oak tree with a dense moss-green canopy and thick trunk'),
    ('OB3', 'ต้นไม้แห้ง • 64', 'bare dead tree with twisted grey branches'),
    ('OB4', 'พุ่มไม้ • 32', 'round dark green bush'),
    ('OB5', 'ก้อนหิน • 32', 'mossy grey boulder'),
    ('OB6', 'รั้วไม้ • 32', 'short horizontal wooden rail fence segment, two posts'),
    ('OB7', 'โคมไฟ • 48', 'wooden lamp post with a hanging glowing lantern'),
    ('OB8', 'บ่อน้ำ • 48', 'round stone well with a small wooden roof and bucket'),
    ('OB9', 'กองไฟ • 32', 'campfire ring of stones with logs'),
    ('OB10', 'เกวียน • 48', 'wooden hand cart with two wheels'),
    ('OB11', 'ถังไม้ • 32', 'wooden barrel with iron bands'),
    ('OB12', 'ลังไม้ • 32', 'stack of two wooden crates'),
    ('OB13', 'ป้ายบอกทาง • 32', 'wooden direction sign post'),
    ('OB14', 'แผงตลาด • 64', 'market stall with a faded striped awning and baskets of goods'),
    ('OB15', 'กองซุง • 48', 'pile of cut logs'),
    ('OB16', 'สะพานไม้ • 96', 'short wooden plank bridge seen from above, for crossing a river'),
]
for c, t, d in OBJ:
    P(c, t, f"{d}, {PL}")
def objs(desc):
    return f"{GPT} Subject: separate objects in a grid with wide white gaps, none touching, all at the same scale: {desc}"
P('GO1', 'ต้นไม้ 6 แบบ (ChatGPT)', objs("a tall dark teal pine, a big round moss-green oak, a bare dead tree, a young sapling, a round dark bush, a tall reed clump."))
P('GO2', 'ของหมู่บ้าน 8 ชิ้น (ChatGPT)', objs("a lamp post with lantern, a stone well with roof, a hand cart, a barrel, two stacked crates, a sign post, a log pile, a campfire."))
P('GO3', 'รั้วและหิน 8 ชิ้น (ChatGPT)', objs("horizontal fence segment, vertical fence segment, fence corner post, fence gate, a big mossy boulder, a small rock, a rock cluster, a stone stairway piece."))
P('GO4', 'ริมน้ำและตลาด 6 ชิ้น (ChatGPT)', objs("a short wooden plank bridge, a small fishing dock, a rowing boat, a market stall with striped awning, a hay bale, a flower box."))

# ---------------- 8. animation ----------------
sec('anim', '⑧ ท่าขยับ (PixelLab → Animate)',
    'เปิดตัวละครที่สร้างแล้ว → Animate → พิมพ์ชื่อท่าตามนี้ • ทำทุกทิศที่ PixelLab ให้ • ถ้าเฟรมเพี้ยน ส่งมาได้ ผมซ่อมให้ • '
    'ทางเลือก (เหมือนเกมต้นแบบ): เอารูปตัวละครไปใส่ AI วิดีโอ เช่น Minimax/Hailuo หรือ Veo สั่งท่า แล้วส่งวิดีโอมา ผมเลือกเฟรมและแปลงเป็นพิกเซลให้')
ANIMS = [
    ('AM1', 'เดิน (ทุกตัว)', 'walking'), ('AM2', 'ยืนหายใจ (ทุกตัว)', 'idle breathing'),
    ('AM3', 'โจมตีดาบ (ฮีโร่สายดาบ/แทงค์)', 'sword slash attack'), ('AM4', 'ยิงธนู (สายธนู)', 'shooting a bow'),
    ('AM5', 'ร่ายเวท (สายเวท + ทุกร่างตอนใช้สกิล)', 'casting a spell with raised hand'), ('AM6', 'โดนตี', 'taking a hit, flinching'),
    ('AM7', 'ล้ม/ตาย (ทุกตัว)', 'falling down defeated'), ('AM8', 'ตัดไม้ (HR0)', 'chopping with an axe'),
    ('AM9', 'ขุดหิน (HR0)', 'mining with a pickaxe'), ('AM10', 'กัด/ตะปบ (มอนสัตว์)', 'biting attack lunge'),
]
for c, t, d in ANIMS:
    P(c, t, d)

# ---------------- 0. start here ----------------
S.insert(0, ('start', '⓪ เริ่มตรงนี้: 13 ภาพแรก พอได้หมู่บ้านที่เล่นได้',
    'PixelLab ฟรีได้ 40 ครั้งแรก แล้ววันละ 5 • ทำตามลำดับนี้: TL1 TL2 TL3 TL4 → HR0 + เดิน/โจมตี/ตาย → MO1 MO3 → '
    'OB1 OB2 OB6 OB7 (หรือ GO1 GO2 GO3 ใน ChatGPT) → BD1 BD2 (ChatGPT) • ส่งรูปให้ผมทีเดียวตอนครบ', []))
order = ['TL1a', 'TL1b', 'TL2a', 'TL2b', 'TL3a', 'TL3b', 'TL4a', 'TL4b', 'HR0', 'MO1', 'MO3', 'OB1', 'OB2', 'OB6', 'OB7', 'BD1', 'BD2']
items = {c: (t, p) for _, _, _, its in S for c, t, p in its}
for c in order:
    S[0][3].append((c, items[c][0], items[c][1]))

# ---------------- output ----------------
HOWTO = ('วิธีใช้: PixelLab = ตัวละคร มอน แผ่นพื้น ของชิ้นเล็ก (ตั้งค่าตามที่เขียนในหัวหมวด) • ChatGPT/Gemini = อาคาร และของหลายชิ้นในรูปเดียว • '
         'ไม่ต้องแนบรูปเกมอื่น • ส่งรูปให้ผมทีเดียว ไม่ต้องบอกรหัส ผมแปลงเป็นพิกเซลแท้ชุดสีเดียวกันเอง')

def write_md(path):
    out = ['# Prompt Book v3 — มุมมองจากบน โทนป่าหม่น (Eldergrove Saga)', '', HOWTO, '']
    for sid, title, note, its in S:
        out += [f'## {title}', '']
        if note: out += [f'_{note}_', '']
        for code, t, p in its:
            out += [f'**{code} — {t}**', '```', p, '```', '']
    open(path, 'w').write('\n'.join(out))

def write_html(path):
    data = [{'id': sid, 'title': t, 'note': n, 'items': [{'code': c, 'title': tt, 'prompt': p} for c, tt, p in its]} for sid, t, n, its in S]
    tpl = open(os.path.join(os.path.dirname(__file__), 'prompts_page.html')).read()
    open(path, 'w').write(tpl.replace('__DATA__', json.dumps(data, ensure_ascii=False))
                          .replace('__COUNT__', str(sum(len(x[3]) for x in S))).replace('__HOWTO__', HOWTO))

if __name__ == '__main__':
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    write_md(os.path.join(root, 'docs', 'PROMPTS.md'))
    if len(sys.argv) > 1: write_html(sys.argv[1])
    print('prompts:', sum(len(x[3]) for x in S))
