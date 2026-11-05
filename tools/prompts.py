"""Single source of truth for every art prompt the game needs.
python3 tools/prompts.py <out.html>  -> writes docs/PROMPTS.md and a phone-friendly HTML page with copy buttons.
"""
import html, json, sys, os

LOOK = ("Cozy medieval fantasy village style like a premium mobile pixel game: warm earthy palette (browns, mossy greens, "
        "golden lamplight), soft hue-shifted shading, light from top-left.")
PIX = ("Crisp high-detail 16-bit pixel art: every pixel sharp and visible, no anti-aliasing, no gradients, no blur, "
       "no painterly texture, dark 1-pixel outline.")
BG = "Plain pure white background, no shadow, no text, no watermark."
ISO = ("TRUE ISOMETRIC 2:1 projection: orthographic, no perspective, camera high above looking down about 30 degrees; "
       "bottom edges slant at 26.5 degrees (2 pixels across for 1 up); the front corner points straight down toward the viewer; "
       "both side walls equally visible; roof clearly visible from above.")
CAMCHAR = "Seen from a high isometric camera angle (about 30 degrees down). Chibi proportions: big head, small body."
ROW = "Exactly {n} frames in one horizontal row, evenly spaced in equal-size cells, feet on the same baseline in every frame, identical design and size in every frame."
OBJ_ONLY = "Object only: no ground, no grass base, no floor tile, no cast shadow. Single object centered."

def char_anim(who, action, n, facing='down-right', extra=''):
    return (f"Pixel art animation sprite sheet of {who}. {action} animation facing {facing}. {CAMCHAR} "
            f"{ROW.format(n=n)} {extra} {LOOK} {PIX} {BG}").replace('  ', ' ')

def iso_obj(desc, extra=''):
    return f"Pixel art game asset: {desc}. {ISO} {OBJ_ONLY} {extra} {LOOK} {PIX} {BG}".replace('  ', ' ')

def sheet(desc, grid, items, iso=True):
    i = ', '.join(items)
    return (f"Pixel art sprite sheet: {len(items)} separate {desc} in a {grid} grid with large empty white space between them, "
            f"all at the same scale: {i}. {ISO if iso else ''} Objects only: no ground, no cast shadow. {LOOK} {PIX} {BG}").replace('  ', ' ')

S = []  # sections: (id, title, note, [(code, title, prompt)])
def sec(sid, title, note=''):
    S.append((sid, title, note, []))
def P(code, title, prompt):
    S[-1][3].append((code, title, prompt))

HERO = "the attached chibi hero (same face, brown spiky hair, red headband, green scarf, blue tunic, sword held in his own right hand)"

# ---------------- 1. hero ----------------
sec('hero', 'ฮีโร่หลัก — ท่าที่ยังขาด', 'แนบภาพฮีโร่ท่ายืน (A1) ไปด้วยทุกครั้ง • ดาบต้องอยู่มือขวาของตัวละครเสมอ')
P('L1', 'ยืนหายใจ หันซ้าย', char_anim(HERO, 'Idle breathing', 4, 'down-LEFT', 'Subtle chest rise, scarf and headband tails waving.'))
P('L2', 'เดิน หันซ้าย', char_anim(HERO, 'Walking', 6, 'down-LEFT', 'Full walk cycle, legs alternating, arms swinging, small bounce.'))
P('L3', 'เดินหันหลัง ไปทางซ้าย', char_anim(HERO, 'Walking (back view)', 6, 'up-LEFT', 'Full walk cycle, scarf and headband tails waving.'))
P('L4', 'ฟันดาบ หันซ้าย', char_anim(HERO, 'Sword attack', 5, 'down-LEFT', 'Wind-up, fast diagonal slash with a blue slash arc, follow-through, recover.'))
P('L5', 'ร่ายเวท หันซ้าย', char_anim(HERO, 'Spell casting', 4, 'down-LEFT', 'Free hand raised, blue magic gathering, glowing brighter, release.'))
P('H1', 'โดนตี หันขวา', char_anim(HERO, 'Short hurt reaction', 3, 'down-right', 'Normal stance, recoil with eyes squeezed shut, recover. Stays standing. No impact marks.'))
P('H2', 'โดนตี หันซ้าย', char_anim(HERO, 'Short hurt reaction', 3, 'down-LEFT', 'Normal stance, recoil with eyes squeezed shut, recover. Stays standing. No impact marks.'))
P('W1', 'ตัดไม้ (ฟันขวาน)', char_anim(HERO, 'Chopping wood with a small axe instead of the sword', 4, 'down-right', 'Raise axe, swing down, impact with wood chips, recover.'))
P('W2', 'ขุดหิน (จอบ)', char_anim(HERO, 'Mining with a pickaxe instead of the sword', 4, 'down-right', 'Raise pickaxe, swing down, impact with stone sparks, recover.'))

# ---------------- 1b. player classes & forms ----------------
sec('forms', 'ร่างตัวละคร: ชาวบ้าน → 4 สาย × 3 ร่าง', 'ร่าง 1 ชาวบ้าน • ร่าง 2 (Lv5) • ร่าง 3 (Lv20) ชุดเท่ขึ้น • ร่าง 4 (Lv35) สวยที่สุด • ร่าง 3-4 ใส่หมวก/หน้ากากปิดหน้า • สายที่ 4 = แทงค์ (T) แทนนักบวช • ทำ "รูปหลัก" ก่อน แล้วแนบรูปนั้นไปกับท่าที่เหลือของร่างเดียวกัน • ทุกร่างคือหนุ่มผมน้ำตาลคนเดิม')
HERO_FACE = 'the same young hero with brown spiky hair and brown eyes (same character as the attached reference; for helmeted/masked forms keep the same body proportions)'
FORMS = [
    ('V0', 'ชาวบ้าน', 'a simple peasant villager outfit: plain beige linen shirt, brown trousers, rope belt, worn boots, holding a wooden practice sword'),
    ('S2', 'นักดาบ', 'a swordsman: blue tunic with leather pauldron, red headband, green scarf, steel short sword and small round shield'),
    ('S3', 'อัศวิน', 'a knight: polished steel plate armor with blue tabard, red cape, a cool closed steel knight helmet with a T-shaped visor slit and a red plume hiding the face, steel longsword and kite shield with a gold emblem'),
    ('S4', 'ลอร์ดอัศวิน', 'a legendary lord knight: ornate white-and-gold plate armor with glowing blue runes, flowing royal blue cape with gold trim, a majestic full helmet with golden wings and a glowing blue visor covering the face, radiant holy greatsword with light particles'),
    ('A2', 'นักธนู', 'an archer: green hooded tunic, leather bracers, quiver on the back, simple wooden bow'),
    ('A3', 'พรานป่า', 'a forest ranger: layered green and brown leather armor, deep fur-lined hood pulled low, a dark green cloth mask covering the nose and mouth so only sharp eyes show, feathered cloak, carved composite longbow'),
    ('A4', 'เรนเจอร์ราชันย์', 'a legendary royal ranger: elegant emerald and gold elven armor, flowing leaf-pattern cape, hood with a sleek golden half-mask covering the lower face and glowing green eyes, glowing magical bow made of light with spirit arrows'),
    ('M2', 'จอมเวท', 'a mage: purple hooded robe with gold trim, belt with potion pouches, wooden staff with a blue crystal'),
    ('M3', 'ปราชญ์เวท', 'a sage mage: long violet robe with star embroidery, high collar, a tall pointed wizard hat with silver star ornaments shading the eyes and a mystic violet face veil over the mouth, floating spellbook beside him, ornate silver staff with orbiting crystal'),
    ('M4', 'อาร์คเมจทมิฬ', 'a legendary dark archmage: menacing jet-black layered robes with tattered edges and dark crimson runes, a tall black horned hood casting deep shadow, a sinister black iron skull-like mask covering the whole face with glowing blood-red eyes, black smoke and shadow wisps swirling around him, floating dark purple arcane sigils, a twisted black bone staff topped with a glowing crimson void crystal, intimidating and powerful pose'),
    ('T2', 'ผู้พิทักษ์ (แทงค์)', 'a tank guardian: thick iron armor over chainmail, huge rectangular tower shield, short heavy mace, broad strong stance, open-face iron helmet'),
    ('T3', 'อัศวินเหล็กกล้า', 'a heavy tank juggernaut: massive dark steel plate armor with huge spiked pauldrons, a full closed great-helm with a narrow glowing visor slit hiding the face, giant spiked tower shield, heavy war hammer'),
    ('T4', 'ป้อมปราการมนุษย์', 'a legendary fortress tank: colossal black-and-gold ornate plate armor with glowing orange runes, enormous layered pauldrons, a menacing horned full helmet with a fierce iron face mask and burning orange eyes, gigantic castle-gate tower shield with a lion emblem, glowing heavy war hammer, unstoppable and intimidating pose'),
]
ACTS = [
    ('', 'รูปหลัก (ยืน 4 เฟรม)', 'Idle breathing', 4, 'down-right', 'Subtle chest rise, cape/scarf gently waving.'),
    ('w', 'เดินหันหน้า', 'Walking', 6, 'down-right', 'Full walk cycle, legs alternating, small bounce.'),
    ('u', 'เดินหันหลัง', 'Walking (back view)', 6, 'up-right', 'Full walk cycle.'),
    ('a', 'โจมตี', 'Basic attack with the class weapon', 5, 'down-right', 'Wind-up, strike (sword slash / bow shot / magic bolt / holy strike), follow-through, recover.'),
    ('k', 'ใช้สกิล', 'Skill casting', 4, 'down-right', 'Powerful pose, weapon or hand glowing, release of energy.'),
    ('d', 'โดนตี+ล้ม', 'Hurt and defeat', 5, 'down-right', 'Flinch, stagger, fall to knees, falling, lying on the ground.'),
]
VG = f"{HERO_FACE}, chibi, wearing a simple peasant villager outfit: plain beige linen shirt, brown trousers, rope belt, worn boots (same villager as the attached V0 reference)"
P('V0c', 'ชาวบ้าน — ตัดไม้ด้วยขวาน (ไม่มีดาบ)', char_anim(VG + ', holding a woodcutter axe instead of a sword (no sword visible)', 'Chopping a tree with an axe', 4, 'down-right', 'Raise axe over shoulder, swing down, impact with wood chips flying, recover.'))
P('V0m', 'ชาวบ้าน — ขุดหินด้วยจอบ (ไม่มีดาบ)', char_anim(VG + ', holding a mining pickaxe instead of a sword (no sword visible)', 'Mining a rock with a pickaxe', 4, 'down-right', 'Raise pickaxe, swing down, impact with stone sparks, recover.'))
P('V0g', 'ชาวบ้าน — เดินแบกตะกร้า (ชุดหาของ)', char_anim(VG + ', carrying a woven basket of wood and stones on his back, small axe tucked in the belt (no sword)', 'Walking', 6, 'down-right', 'Full walk cycle, basket bobbing.'))
P('V0i', 'ชาวบ้าน — ยืน (ชุดหาของ ไม่มีดาบ)', char_anim(VG + ', basket on his back, small axe in hand (no sword)', 'Idle breathing', 4, 'down-right', 'Subtle breathing, wiping sweat.'))

for code, name, outfit in FORMS:
    who = f"{HERO_FACE}, chibi, wearing {outfit}"
    for suf, an, act, n, face, ex in ACTS:
        P(code + suf, f'{name} — {an}', char_anim(who, act, n, face, ex))
    P(code + 'P', f'{name} — รูปโปรไฟล์', f"Pixel art character portrait bust (head and shoulders) of {who}, facing slightly right, confident expression. {PIX} {LOOK} {BG}")

# ---------------- 2. companions ----------------
sec('party', 'ฮีโร่เพื่อนร่วมทีม NPC (รับที่โรงเตี๊ยม — ทำทีหลัง)', 'สั่งตัวละ 5 แผ่น • แผ่นแรกได้แล้ว แนบแผ่นนั้นไปกับแผ่นต่อๆ ไป เพื่อให้หน้าเหมือนเดิม')
COMP = [
    ('E', 'นักธนูเอลฟ์', 'a chibi blonde elf archer girl with green hood, leather vest and a longbow', 'drawing the bow and shooting an arrow'),
    ('M', 'จอมเวท', 'a chibi young mage girl with silver hair, big blue pointed witch hat, blue robe and a crystal staff', 'raising the staff and casting a glowing blue spell'),
    ('K', 'อัศวินหญิง', 'a chibi red-haired female knight with silver armor, round shield and short sword', 'shield bash then sword slash'),
    ('C', 'นักบวช', 'a chibi cheerful priest with white and gold robe, holy book and golden mace', 'raising the book and casting golden holy light'),
    ('D', 'คนแคระคลั่ง', 'a chibi stout red-bearded dwarf berserker with horned helmet and a huge two-handed axe', 'spinning heavy axe swing'),
]
for c, name, who, atk in COMP:
    P(f'{c}1', f'{name} — ยืน', char_anim(who, 'Idle breathing', 4))
    P(f'{c}2', f'{name} — เดินหันหน้า', char_anim(who, 'Walking', 6))
    P(f'{c}3', f'{name} — เดินหันหลัง', char_anim(who, 'Walking (back view)', 6, 'up-right'))
    P(f'{c}4', f'{name} — โจมตี', char_anim(who, f'Attack: {atk}', 5))
    P(f'{c}5', f'{name} — โดนตี+ล้ม', char_anim(who, 'Hurt and defeat', 5, 'down-right', 'Flinch, stagger, fall to knees, falling, lying on the ground.'))
    P(f'{c}P', f'{name} — รูปโปรไฟล์', f"Pixel art character portrait bust (head and shoulders) of {who}, facing slightly right, friendly expression, inside a square frame-less canvas. {PIX} {LOOK} {BG}")

# ---------------- 3. villagers ----------------
sec('villagers', 'ชาวบ้าน (ทำงานในอาคาร)', 'ท่าทำงานวนลูป 4 เฟรม')
VIL = [
    ('V1', 'คนตัดไม้', 'a chibi burly lumberjack in a red plaid shirt with an axe', 'Chopping a log, looping'),
    ('V2', 'คนขุดหิน', 'a chibi miner with a helmet lamp and a pickaxe', 'Mining a rock, looping'),
    ('V3', 'ชาวนา', 'a chibi farmer with a straw hat and a hoe', 'Hoeing soil, looping'),
    ('V4', 'แม่ครัว', 'a chibi plump cook with white chef hat and apron holding a ladle', 'Stirring a pot, looping'),
    ('V5', 'ช่างตีเหล็กตีดาบ', 'a chibi muscular bearded blacksmith with leather apron and hammer', 'Hammering on an anvil with sparks, looping'),
    ('V6', 'เจ้าของโรงเตี๊ยม', 'a chibi friendly tavern keeper woman with an apron holding a beer mug', 'Wiping a mug and waving, looping'),
    ('V7', 'ทหารยาม', 'a chibi village guard with leather armor, helmet and spear', 'Standing guard, slight breathing and looking around'),
    ('V8', 'ชาวบ้านเดิน', 'a chibi villager carrying a basket of goods', 'Walking'),
]
for c, name, who, act in VIL:
    P(c, name, char_anim(who, act, 4 if c != 'V8' else 6))

# ---------------- 4. animals ----------------
sec('animals', 'สัตว์ (เลี้ยงในคอก / ล่าในป่า)', '')
for c, name, who, n in [('N1', 'แกะ', 'a fluffy white sheep', 4), ('N2', 'วัว', 'a brown and white cow', 4), ('N3', 'ไก่', 'a small white chicken', 4),
                        ('N4', 'หมู', 'a pink pig', 4), ('N5', 'กวาง (ล่าได้)', 'a brown deer with antlers', 6), ('N6', 'หมูป่า (ล่าได้)', 'an angry wild boar with tusks', 6)]:
    P(c, f'{name} — เดิน', char_anim(who, 'Walking', n, 'down-left'))

# ---------------- 5. monsters by region ----------------
sec('monsters', 'มอนสเตอร์ดินแดนใหม่', 'แต่ละตัว 2 แถว: แถวบนเดิน 4 เฟรม แถวล่างโจมตี 4 เฟรม')
def mon(who, move, attack):
    return (f"Pixel art animation sprite sheet of {who}. Facing down-left. {CAMCHAR} Two rows, every frame in an equal-size cell, "
            f"feet on the same baseline, identical design and size in every frame. Row 1: {move}, exactly 4 frames. Row 2: {attack}, exactly 4 frames. {LOOK} {PIX} {BG}")
MONS = [
    ('R1', 'โครงกระดูกนักรบ (ป่าผีสิง)', 'a chibi skeleton warrior with rusty sword and wooden shield', 'shambling walk', 'sword slash'),
    ('R2', 'โครงกระดูกนักธนู', 'a chibi skeleton archer with a bow and tattered hood', 'walk', 'drawing and shooting an arrow'),
    ('R3', 'ซอมบี้', 'a chibi green zombie villager in torn clothes', 'slow limping walk', 'lunging grab'),
    ('R4', 'วิญญาณพเนจร', 'a chibi pale ghost with a lantern', 'floating', 'screaming wail with purple wave'),
    ('R5', 'อิมพ์ไฟ (ลาวา)', 'a chibi red fire imp with small wings and a trident', 'hopping', 'throwing a fireball'),
    ('R6', 'โกเลมลาวา', 'a chibi lava rock golem with glowing cracks', 'heavy walk', 'ground punch with lava splash'),
    ('R7', 'ซาลาแมนเดอร์', 'a chibi fire salamander lizard', 'crawling', 'breathing a short flame'),
    ('R8', 'หมาป่าน้ำแข็ง (หิมะ)', 'a chibi white ice wolf with frosty blue mane', 'running', 'leaping bite with ice shards'),
    ('R9', 'เยติ', 'a chibi furry white yeti', 'stomping walk', 'double fist slam'),
    ('R10', 'แมงมุมยักษ์ (ดันเจี้ยน)', 'a chibi giant purple cave spider', 'crawling', 'pouncing bite'),
    ('R11', 'หนูดันเจี้ยน', 'a chibi big grey dungeon rat with red eyes', 'scurrying', 'biting'),
    ('R12', 'อัศวินโครงกระดูก', 'a chibi armored skeleton knight with a greatsword', 'march', 'heavy overhead slash'),
]
for c, name, who, mv, at in MONS:
    P(c, name, mon(who, mv, at))

sec('bosses', 'บอส', 'บอสละ 2 แผ่น (แถวบน/แถวล่าง)')
BOSS = [
    ('B1', 'กวางยักษ์คำสาป', 'a huge cursed elk with massive antlers, dark brown fur and glowing purple eyes', 'heavy trotting walk', 'antler charge', 'stomping causing purple shockwave', 'collapsing to the ground'),
    ('B2', 'ราชาโครงกระดูกเขาเหล็ก', 'a huge skeleton king with a horned iron helmet, tattered fur cape and a glowing blue curved sword', 'menacing march', 'wide sword sweep with blue trail', 'raising sword summoning blue flames', 'crumbling into bones'),
    ('B3', 'มังกรลาวา', 'a chibi but huge red lava dragon with glowing magma belly', 'walking', 'claw swipe', 'breathing a big fire stream', 'falling down defeated'),
    ('B4', 'ยักษ์น้ำแข็ง', 'a huge frost giant with icy armor and an ice club', 'stomping walk', 'club smash with ice shards', 'roaring and summoning ice spikes', 'shattering into ice'),
]
for c, name, who, mv, at, cast, die in BOSS:
    base = f"Pixel art animation sprite sheet of {who}. Facing down-left, high isometric camera angle. Two rows, every frame in an equal-size cell, feet on the same baseline, identical design and size in every frame."
    P(c + 'a', f'{name} — เดิน+โจมตี', f"{base} Row 1: {mv}, exactly 4 frames. Row 2: {at}, exactly 5 frames. {LOOK} {PIX} {BG}")
    P(c + 'b', f'{name} — ท่าพิเศษ+ตาย', f"{base} Row 1: {cast}, exactly 4 frames. Row 2: {die}, exactly 5 frames. {LOOK} {PIX} {BG}")

# ---------------- 6. buildings ----------------
sec('buildings', 'อาคารหมู่บ้าน (สร้าง/อัปเกรดได้)', 'แต่ละอาคาร 2 ภาพ: Lv1 เล็ก/เรียบ และ Lv5 ใหญ่/หรู • ห้ามมีพื้นหญ้าติดมา')
BLD = [
    ('T', 'ศาลากลาง', 'a village town hall with a bell tower and banner', 'a grand town hall with stone base, clock tower, flags and gold trim'),
    ('H', 'บ้านพัก', 'a tiny thatched peasant hut', 'a two-story timber house with balcony and flower boxes'),
    ('LM', 'โรงเลื่อยไม้', 'a small open lumber shed with a log pile and chopping block', 'a big sawmill with a large circular saw blade, water wheel and stacked planks'),
    ('Q', 'เหมืองหิน', 'a small quarry pit with a few stone blocks and a wooden crane', 'a large quarry with cut stone stacks, mine cart rails and a big crane'),
    ('F', 'ฟาร์ม', 'a small vegetable field with a fence and scarecrow (flat field)', 'a large farm field with wheat, pumpkins, cabbages, a barn and scarecrow'),
    ('AP', 'คอกสัตว์', 'a small wooden animal pen with a trough (empty, no animals)', 'a big barn with fenced pasture, hay bales and a feeding trough (no animals)'),
    ('KT', 'ครัว', 'an outdoor cooking spot with a cauldron on a tripod and a small table', 'a cozy cookhouse with chimney smoke, hanging sausages and a big oven'),
    ('FG', 'โรงหลอม', 'a small open forge with an anvil and a stone furnace', 'a big forge hall with roaring furnaces, weapon racks, anvils and chimney smoke'),
    ('TV', 'โรงเตี๊ยม', 'a small tavern hut with a hanging mug sign (sign without letters)', 'a large two-story tavern inn with balcony, lanterns and a hanging mug sign (no letters)'),
    ('WH', 'โกดัง', 'a small storage shed with crates and barrels', 'a large warehouse with big doors, stacked crates, sacks and barrels'),
    ('MK', 'ตลาด', 'a single market stall with a striped awning', 'a market square cluster of three colorful stalls with goods'),
    ('WT', 'หอคอยยาม', 'a small wooden watchtower', 'a tall stone watchtower with a ballista on top and banners'),
]
for c, name, small, big in BLD:
    P(c + '1', f'{name} Lv1', iso_obj(small))
    P(c + '5', f'{name} Lv5', iso_obj(big))
P('CS', 'ที่ก่อสร้าง (กำลังสร้าง)', iso_obj('a construction site with wooden scaffolding, a half-built timber frame, stacked planks and a wheelbarrow'))
P('PL', 'ที่ดินว่าง', iso_obj('an empty building plot: a flat square of tilled dirt marked with four small wooden stakes and rope and a small signpost (flat, no grass)'))
P('WL', 'กำแพงหมู่บ้าน+ประตู', sheet('village defense pieces', '3 by 2', ['wooden palisade wall segment', 'wooden palisade corner', 'wooden gate with towers', 'stone wall segment', 'stone wall corner', 'stone gatehouse']))

# ---------------- 7. environment per region ----------------
sec('env', 'ฉากและของตกแต่งแต่ละดินแดน', '')
REG = [
    ('G1', 'ป่าฤดูใบไม้ร่วงผีสิง', ['dead twisted tree', 'orange autumn tree', 'bare spooky tree with crows', 'old gravestone', 'broken cart', 'pumpkin patch', 'creepy scarecrow', 'fallen log with mushrooms']),
    ('G2', 'ดินแดนลาวา', ['volcanic rock spire', 'obsidian crystal cluster', 'lava pool crack', 'charred dead tree', 'bone pile', 'steaming vent', 'iron ore rock', 'ruined lava stone pillar']),
    ('G3', 'ภูเขาหิมะ', ['snowy pine tree', 'ice crystal', 'snow-covered rock', 'frozen bush', 'snowman', 'wooden sled', 'ice pillar', 'snowy log pile']),
    ('G4', 'คุกใต้ดิน', ['stone dungeon pillar with torch', 'iron prison cell door', 'skull pile', 'wooden table with candles', 'chained skeleton', 'treasure chest', 'spike trap', 'stone stairs going down']),
]
for c, name, items in REG:
    P(c, f'{name} — ของตกแต่ง 8 ชิ้น', sheet(f'{name} environment props', '4 by 2', items))
TILES = [('TL1', 'ป่าผีสิง', 'dead leaf ground, muddy path, mossy cobblestone, dark grass'), ('TL2', 'ลาวา', 'cracked volcanic rock, ash ground, glowing lava, obsidian floor'),
         ('TL3', 'หิมะ', 'fresh snow, icy path, frozen lake ice, snowy cobblestone'), ('TL4', 'ดันเจี้ยน', 'dungeon stone floor, mossy dungeon floor, wooden planks, dark water')]
for c, name, t in TILES:
    P(c, f'พื้น{name} 4 แบบ', f"Pixel art tileset: 4 flat isometric floor tiles in one row with white space between them. Each tile is a perfectly flat diamond exactly twice as wide as tall (2:1), seen from above, no thickness, no sides: {t}. Seamless textures. {PIX} {BG}")
P('DW', 'ผนังดันเจี้ยน', sheet('dungeon wall pieces', '4 by 2', ['straight stone wall segment going down-right', 'straight stone wall segment going down-left', 'outer corner', 'inner corner', 'wall with torch', 'wall with barred window', 'arched doorway', 'collapsed wall']))
P('VP', 'ของในหมู่บ้านเพิ่มเติม', sheet('village props', '4 by 3', ['log pile', 'plank stack', 'stone block pile', 'hay cart', 'wheelbarrow', 'water trough', 'notice board without letters', 'beehive', 'clothesline with laundry', 'pumpkin pile', 'flower planter', 'wooden bench']))

# ---------------- 7b. terrain with height ----------------
sec('terrain', 'แมพมีมิติ: หน้าผา เนิน ภูเขา ระดับสูงต่ำ', 'ทุกชิ้นต้องเป็น ISOMETRIC 2:1 เหมือนพื้นในเกม • ทำ M1 ก่อน (ใช้เป็นต้นแบบ) แล้วแนบไปกับชิ้นต่อไป')
TER = [
    ('M1', 'หน้าผาหญ้า (ชุดต่อกันได้)', 'a set of 8 modular grass-topped cliff pieces for building raised plateaus: straight cliff wall facing down-left, straight cliff wall facing down-right, outer corner, inner corner, left end, right end, cliff with hanging vines, cliff with roots; each piece exactly one isometric tile wide with a grass top edge and layered brown earth and stone face about one tile tall'),
    ('M2', 'หน้าผาหิน ภูเขา', 'a set of 8 modular grey rocky mountain cliff pieces, taller (two tiles high), with ledges, cracks, moss and small shrubs: straight wall facing down-left, straight wall facing down-right, outer corner, inner corner, two variations, a cave entrance, a cliff with a small waterfall'),
    ('M3', 'ทางขึ้นลง', 'a set of 6 ramps and stairs connecting a low ground level to a higher plateau: carved stone stairs facing down-left, stone stairs facing down-right, wooden stairs with railing, dirt slope ramp, rope ladder on a cliff, rocky natural steps'),
    ('M4', 'เนินเขาและเนินดิน', 'a set of 6 soft grassy hills and mounds of different sizes with flowers and small rocks, seen from a high isometric angle, gentle slopes, to place on flat grass as decoration'),
    ('M5', 'ภูเขาพื้นหลัง (ไกล)', 'a wide panoramic background of distant layered fantasy mountains and forested hills with soft mist between layers, warm sunset light, painted in high-detail pixel art, 3 separate horizontal layers stacked vertically with white space between them: far misty peaks, middle forested hills, near tree line silhouette'),
    ('M6', 'น้ำตก', 'an isometric pixel art waterfall flowing down a two-tile-high grassy rock cliff into a small pond with foam and mist, plus 3 extra frames of the same waterfall showing water animation, 4 frames in one row'),
    ('M7', 'สะพาน/ทางเดินสูง', 'a set of 4 isometric bridges: long wooden plank bridge over a ravine, stone arch bridge, rope bridge, broken bridge'),
    ('M8', 'ขอบน้ำ/ริมแม่น้ำ', 'a set of 8 modular isometric riverbank edge pieces: grass to water edge with sand, rocks along the shore, reeds and cattails, lily pads cluster, wooden dock, fishing pier, stepping stones, small rapids'),
    ('M9', 'ต้นไม้ใหญ่บังฉาก (ด้านหน้า)', 'a set of 4 large foreground tree canopies and hanging branches seen from above at an isometric angle, used to frame the screen edges and add depth, slightly darker and more saturated'),
]
for c, name, d in TER:
    P(c, name, f"Pixel art game asset sheet: {d}. TRUE ISOMETRIC 2:1 projection, orthographic, no perspective, camera high above looking down about 30 degrees; edges slant at 26.5 degrees. {LOOK} {PIX} Pieces separated by large empty white space. No characters. {BG}")

def icons(n, grid, items):
    return f"Pixel art sprite sheet: {n} fantasy RPG item icons in a {grid} grid with white space between them, each the same size, front view, centered in its cell: {', '.join(items)}. {PIX} rich colors. {BG}"

# ---------------- 7c. UI art kit ----------------
sec('ui', 'ชุด UI ดำทอง (หน้าต่าง ปุ่ม แถบ)', 'ภาพมองตรง ไม่ต้อง isometric • ใช้แทน UI ที่วาดด้วยโค้ด')
UIP = "Fantasy RPG mobile game UI asset, front view, black and gold ornate style with dark wood and engraved gold filigree, high-detail 16-bit pixel art, crisp pixels, no text, no letters. Plain pure white background, no watermark."
P('U1', 'กรอบหน้าต่าง 9 ส่วน', f"Pixel art sprite sheet of a 9-slice window frame: 4 corner pieces with gold dragon-scroll ornaments, 4 edge pieces that can tile (top, bottom, left, right), and 1 dark leather center tile, arranged in a 3 by 3 grid with white space. {UIP}")
P('U2', 'ปุ่ม 3 สถานะ', f"Pixel art sprite sheet of rectangular game buttons in 3 states in one row (normal, pressed, disabled) plus 3 color variants in a second row (green confirm, red cancel, purple special), dark wood face with gold rim and rivets. {UIP}")
P('U3', 'ปุ่มกลม/ช่องสกิล', f"Pixel art sprite sheet: 6 round button frames in one row: large attack button frame with crossed swords ornament, skill slot frame, small menu button frame, joystick base ring, joystick knob, auto-battle toggle frame. Empty centers. {UIP}")
P('U4', 'แถบ HP/MP/EXP', f"Pixel art sprite sheet: ornate horizontal bar frames with gold ends and 3 fill textures (red glossy HP, blue glossy MP, purple EXP), plus a boss health bar frame with skull ornament, each on its own row. {UIP}")
P('U5', 'ช่องไอเทมตามความแรร์', f"Pixel art sprite sheet: 6 square inventory slot frames in one row: empty dark slot, common (silver), uncommon (green gems), rare (blue gems), epic (purple glowing), legendary (orange flaming gold). {UIP}")
P('U6', 'ป้ายชื่อ/แบนเนอร์', f"Pixel art sprite sheet: 4 decorative banners and title plates: long ribbon title banner, zone name plate with leaves, level-up banner with wings, reward chest banner. Empty for text. {UIP}")
P('U7', 'ไอคอนเมนู HUD', f"Pixel art sprite sheet: 10 round HUD menu icons in a 5 by 2 grid: backpack, character helmet, quest scroll, settings gear, fullscreen arrows, map, village house, guild shield, shop coin bag, mail letter. Same size, gold rim. {UIP}")
P('U8', 'ไอคอนทรัพยากร', f"Pixel art sprite sheet: 8 small resource icons in one row: gold coins, wood logs, stone blocks, meat, iron ore, crystal, gem, scroll. {UIP}")

# ---------------- 7d. pets & mounts ----------------
sec('pets', 'สัตว์เลี้ยงติดตาม & พาหนะ', 'สัตว์เลี้ยงเดินตามตัว ช่วยเก็บของ • พาหนะเพิ่มความเร็ว')
PET = [('P1', 'ลูกจิ้งจอกไฟ', 'a cute baby fire fox with a flaming tail'), ('P2', 'สไลม์น้อยสวมมงกุฎ', 'a tiny green slime wearing a little gold crown'),
       ('P3', 'นกฮูกเวท', 'a small magical owl with glowing blue runes'), ('P4', 'มังกรน้อย', 'a chubby baby purple dragon with tiny wings'),
       ('P5', 'หมาป่าน้อย', 'a fluffy grey wolf pup'), ('P6', 'ภูติดอกไม้', 'a tiny flower fairy with petal wings')]
for c, name, who in PET:
    P(c, f'{name} — เดิน', char_anim(who + ', pet companion', 'Walking / floating', 6, 'down-right'))
MNT = [('R1', 'ม้าศึก', 'a brown war horse with leather saddle and gold bridle'), ('R2', 'หมาป่ายักษ์', 'a giant grey dire wolf with a saddle'),
       ('R3', 'กริฟฟอน', 'a majestic griffon with a saddle'), ('R4', 'กวางเรืองแสง', 'a glowing spirit stag with crystal antlers and a saddle')]
for c, name, who in MNT:
    P(c + 'a', f'{name} — วิ่ง (มีคนขี่)', char_anim(f"the attached chibi hero riding {who}", 'Galloping run', 6, 'down-right'))
    P(c + 'b', f'{name} — วิ่ง (ไม่มีคนขี่)', char_anim(who + ', riderless', 'Galloping run', 6, 'down-right'))

# ---------------- 7e. village war / raid ----------------
sec('raid', 'สงครามหมู่บ้าน/ปล้น (ออนไลน์อนาคต)', 'ใช้ตอนทำระบบบุก-ป้องกันหมู่บ้าน')
P('X5', 'ป้อมป้องกัน', sheet('village defense structures', '3 by 2', ['wooden archer tower', 'stone cannon tower', 'magic crystal tower', 'spike trap', 'bear trap', 'barricade']))
P('X6', 'อาวุธล้อมเมือง', sheet('siege weapons', '3 by 2', ['wooden catapult', 'battering ram with roof', 'ballista', 'siege tower', 'bomb barrel', 'war drum']))
P('X7', 'ทหารยามหมู่บ้าน', mon('a chibi village spearman guard with leather armor and round helmet', 'marching', 'spear thrust'))
P('X8', 'ทหารบุก', mon('a chibi raider soldier with a red bandana, leather armor and an axe', 'running', 'axe swing'))
P('X9', 'ธงกิลด์ 8 แบบ', icons(8, '4 by 2', ['red lion banner', 'blue eagle banner', 'green tree banner', 'purple dragon banner', 'black wolf banner', 'gold sun banner', 'white swan banner', 'orange phoenix banner']))
P('X10', 'ห้องโถงกิลด์', iso_obj('a grand guild hall building with large wooden doors, stone towers, hanging guild banners, torches and a courtyard statue'))
P('X11', 'ไฟไหม้/ซาก (โดนปล้น)', sheet('damage effects for buildings', '3 by 2', ['small fire on a roof', 'large fire', 'smoking rubble pile', 'broken fence', 'collapsed wall', 'repair scaffolding']))

# ---------------- 7f. more village life ----------------
sec('life', 'ชีวิตในหมู่บ้านเพิ่มเติม', 'ทำให้หมู่บ้านมีชีวิตชีวา')
for c, name, who, act in [('Y1', 'เด็กวิ่งเล่น', 'a chibi village child with a wooden toy sword', 'Running and playing'),
                          ('Y2', 'แมวส้ม', 'a fat orange tabby cat', 'Walking with tail up'),
                          ('Y3', 'หมาบ้าน', 'a friendly brown village dog', 'Trotting'),
                          ('Y4', 'ชาวประมง', 'a chibi old fisherman with a straw hat and a fishing rod', 'Fishing, casting and waiting, looping'),
                          ('Y5', 'นักดนตรีเร่', 'a chibi bard with a lute and feathered hat', 'Playing the lute, looping'),
                          ('Y6', 'ไก่จิกพื้น', 'a white chicken', 'Pecking the ground, looping')]:
    P(c, name, char_anim(who, act, 6 if 'Walk' in act or 'Run' in act or 'Trot' in act else 4))
P('Y7', 'เฟอร์นิเจอร์ในบ้าน', sheet('house interior furniture', '4 by 3', ['wooden bed with quilt', 'dining table with chairs', 'bookshelf', 'fireplace with fire', 'kitchen counter with pots', 'wardrobe closet', 'rug', 'potted plant', 'treasure display stand', 'weapon rack with swords', 'armor mannequin', 'chest of drawers']))
P('Y8', 'ร้านค้าเพิ่ม', sheet('village shop stalls', '3 by 2', ['potion shop stall with bottles', 'fish market stall', 'fruit and vegetable stall', 'blacksmith weapon display', 'jewelry stall', 'bakery stall with bread']))
P('Y9', 'ของตกแต่งตามเทศกาล', sheet('seasonal festival decorations', '4 by 2', ['paper lanterns string', 'harvest pumpkin pile', 'snowy christmas tree', 'flower arch', 'fireworks stand', 'festival flag garland', 'candle shrine', 'big gift box']))

# ---------------- 7g. weather / fishing / misc ----------------
sec('misc', 'อื่นๆ ที่ทำให้เกมดีขึ้น', '')
P('Z1', 'ปลา 12 ชนิด (ระบบตกปลา)', icons(12, '4 by 3', ['small river fish', 'golden carp', 'blue trout', 'catfish', 'piranha', 'glowing jellyfish', 'eel', 'crab', 'shrimp', 'old boot', 'treasure bottle with map', 'legendary rainbow fish']))
P('Z2', 'แร่และพืชเก็บได้', sheet('gatherable resource nodes', '4 by 2', ['iron ore rock', 'gold ore rock', 'crystal cluster', 'herb bush', 'mushroom patch', 'berry bush', 'beehive tree', 'magic flower']))
P('Z3', 'หีบสมบัติตามระดับ', sheet('treasure chests by rarity, closed and open pairs', '4 by 2', ['wooden chest closed', 'wooden chest open', 'silver chest closed', 'silver chest open', 'gold chest closed', 'gold chest open', 'legendary glowing chest closed', 'legendary chest open with light']))
P('Z4', 'ประตูมิติ/วาร์ป', sheet('teleport and portal pieces', '3 by 2', ['stone teleport circle glowing blue', 'dungeon entrance stairs', 'magic portal arch purple', 'waypoint obelisk', 'cave entrance', 'boss gate with chains']))

# ---------------- 8. items ----------------
sec('items', 'ไอคอนไอเทม', 'ไอคอนมองตรง ไม่ต้อง isometric')
def icons(n, grid, items):
    return f"Pixel art sprite sheet: {n} fantasy RPG item icons in a {grid} grid with white space between them, each the same size, front view, centered in its cell: {', '.join(items)}. {PIX} rich colors. {BG}"
P('I1', 'อาวุธ 16 ชิ้น', icons(16, '4 by 4', ['wooden bow', 'hunting bow', 'elven longbow', 'flaming bow', 'battle axe', 'great axe', 'iron spear', 'golden halberd', 'war hammer', 'dagger', 'twin daggers', 'crystal staff', 'skull staff', 'holy mace', 'katana', 'legendary glowing greatsword']))
P('I2', 'หมวก/ถุงมือ/รองเท้า 12 ชิ้น', icons(12, '4 by 3', ['leather cap', 'iron helmet', 'horned knight helmet', 'wizard hat', 'leather gloves', 'iron gauntlets', 'golden gauntlets', 'mage gloves', 'leather boots', 'iron greaves', 'winged boots', 'golden boots']))
P('I3', 'เครื่องประดับ 8 ชิ้น', icons(8, '4 by 2', ['silver ring with blue gem', 'gold ring with red gem', 'bone ring', 'emerald ring', 'wolf fang necklace', 'golden cross amulet', 'moon pendant', 'dragon eye amulet']))
P('I4', 'วัตถุดิบ 16 ชิ้น', icons(16, '4 by 4', ['log', 'wood planks', 'stone', 'iron ore', 'iron ingot', 'gold ore', 'leather', 'raw meat', 'wheat', 'herb', 'mushroom', 'bone', 'feather', 'cloth', 'blue crystal', 'dragon scale']))
P('I5', 'อาหาร/ยา 8 ชิ้น', icons(8, '4 by 2', ['roasted meat', 'bread', 'stew bowl', 'apple pie', 'large red potion', 'large blue potion', 'green antidote potion', 'golden elixir']))
P('I6', 'ไอคอนอาคาร/เมนู 12 ชิ้น', icons(12, '4 by 3', ['hammer and saw (build)', 'treasure chest (bag)', 'crossed swords (battle)', 'scroll (quest)', 'castle (village)', 'beer mug (tavern)', 'anvil (forge)', 'map', 'gear (settings)', 'shield (defense)', 'gold coins', 'trophy']))

# ---------------- 9. skills / vfx ----------------
sec('vfx', 'เอฟเฟกต์สกิลฮีโร่ทีม', 'พื้นหลังดำ ตั้งใจ (เอฟเฟกต์แสง)')
def vfx(rows):
    r = '; '.join(f'row {i+1} {x}' for i, x in enumerate(rows))
    return f"Pixel art VFX animation sprite sheet for a fantasy RPG, {len(rows)} rows, each row exactly 6 frames in equal-size cells: {r}. Crisp 16-bit pixel art, bright glowing colors, every pixel sharp, no blur, no anti-aliasing. Plain pure black background, no text."
P('X1', 'ธนู/น้ำแข็ง/แสงศักดิ์สิทธิ์', vfx(['flying arrow with wind trail', 'rain of arrows falling', 'ice spike erupting from the ground', 'golden holy light beam from the sky']))
P('X2', 'ไฟ/พิษ/โล่/บัฟ', vfx(['fire breath stream', 'green poison cloud', 'blue magic shield bubble', 'red rage aura flames']))
P('X3', 'งาน/สร้าง', vfx(['wood chips flying from an axe hit', 'stone sparks from a pickaxe hit', 'construction dust puff', 'gold coins burst']))
P('X4', 'ไอคอนสกิลทีม 8 อัน', f"Pixel art sprite sheet: 8 round fantasy RPG skill icons in a 4 by 2 grid with white space between them, each a circle with an ornate gold rim and dark background, same size: arrow rain, piercing arrow, ice spike, meteor, shield bash, battle cry, holy heal circle, axe whirlwind. {PIX} rich glowing colors. {BG}")

# ---------------- 10. key art ----------------
sec('keyart', 'ภาพโหลด/หน้าเปิดแต่ละดินแดน', 'ภาพกว้าง 16:9 ใช้เป็นฉากหลังหน้าโหลด')
for c, name, d in [('K1', 'หมู่บ้านยามเย็น', 'a bustling isometric medieval village being built: sawmill, farm with animals, forge, tavern, villagers working, autumn trees'),
                   ('K2', 'ป่าผีสิง', 'a haunted autumn forest at night with gravestones, skeletons and a giant cursed elk in the fog'),
                   ('K3', 'ดินแดนลาวา', 'a volcanic land with rivers of lava, obsidian ruins and a lava dragon on a peak'),
                   ('K4', 'ภูเขาหิมะ', 'snowy mountains with a frozen village, ice crystals and a frost giant'),
                   ('K5', 'คุกใต้ดิน', 'an isometric underground dungeon with torches, a party of heroes fighting a horned skeleton king')]:
    P(c, name, f"Isometric pixel art key art, wide 16:9: {d}. Warm dramatic lighting, high-detail 16-bit pixel art, crisp pixels. {LOOK} No text, no logo, no watermark.")

# ---------------- output ----------------
def write_md(path):
    out = ['# รายการ Prompt ภาพทั้งหมด (Eldergrove Saga)', '',
           'วิธีใช้: คัดลอกทั้งกล่องไปวางใน GPT • ส่งภาพกลับพร้อมบอกรหัส (เช่น "L2", "E4") • ถ้าเป็นตัวละครเดิม แนบภาพเดิมไปด้วย', '']
    for sid, title, note, items in S:
        out += [f'## {title}', '']
        if note: out += [f'_{note}_', '']
        for code, t, p in items:
            out += [f'**{code} — {t}**', '```', p, '```', '']
    open(path, 'w').write('\n'.join(out))

def write_html(path):
    data = [{'id': sid, 'title': t, 'note': n, 'items': [{'code': c, 'title': tt, 'prompt': p} for c, tt, p in items]} for sid, t, n, items in S]
    tpl = open(os.path.join(os.path.dirname(__file__), 'prompts_page.html')).read()
    open(path, 'w').write(tpl.replace('__DATA__', json.dumps(data, ensure_ascii=False)).replace('__COUNT__', str(sum(len(x[3]) for x in S))))

if __name__ == '__main__':
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    write_md(os.path.join(root, 'docs', 'PROMPTS.md'))
    if len(sys.argv) > 1: write_html(sys.argv[1])
    print('prompts:', sum(len(x[3]) for x in S))
