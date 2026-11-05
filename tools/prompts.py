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
sec('forms', 'ร่างตัวละคร: ชาวบ้าน → 4 สาย × 3 ร่าง', 'ร่าง 1 ชาวบ้าน • ร่าง 2 (Lv5) • ร่าง 3 (Lv20) ชุดเท่ขึ้น • ร่าง 4 (Lv35) สวยที่สุด • ร่าง 3-4 ใส่หมวก/หน้ากากปิดหน้า • ทำ "รูปหลัก" ก่อน แล้วแนบรูปนั้นไปกับท่าที่เหลือของร่างเดียวกัน • ทุกร่างคือหนุ่มผมน้ำตาลคนเดิม')
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
    ('C2', 'นักบวช', 'a cleric: white and gold robe, holy symbol necklace, small mace and a prayer book'),
    ('C3', 'นักบุญ', 'a saint: layered white robe with gold armor pieces, blue sash, a white and gold mitre-style holy helmet with a silver face guard over the eyes, golden halo, holy hammer'),
    ('C4', 'ไฮพรีสต์', 'a legendary high priest: radiant white and gold vestments with feather wings motif, a tall ornate golden crown-helm with a radiant sun-shaped golden mask covering the face, glowing golden halo and floating holy light orbs, ornate scepter with a sun emblem'),
]
ACTS = [
    ('', 'รูปหลัก (ยืน 4 เฟรม)', 'Idle breathing', 4, 'down-right', 'Subtle chest rise, cape/scarf gently waving.'),
    ('w', 'เดินหันหน้า', 'Walking', 6, 'down-right', 'Full walk cycle, legs alternating, small bounce.'),
    ('u', 'เดินหันหลัง', 'Walking (back view)', 6, 'up-right', 'Full walk cycle.'),
    ('a', 'โจมตี', 'Basic attack with the class weapon', 5, 'down-right', 'Wind-up, strike (sword slash / bow shot / magic bolt / holy strike), follow-through, recover.'),
    ('k', 'ใช้สกิล', 'Skill casting', 4, 'down-right', 'Powerful pose, weapon or hand glowing, release of energy.'),
    ('d', 'โดนตี+ล้ม', 'Hurt and defeat', 5, 'down-right', 'Flinch, stagger, fall to knees, falling, lying on the ground.'),
]
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
