"""Prompt Book v4 — PixelLab Tier 1 workflow, step by step (menu → settings → text to paste).
Top-down 3/4 pixel art, muted dark-forest tone. Every item = (code, title, how-steps, text to paste).
python3 tools/prompts.py <out.html>  -> writes docs/PROMPTS.md and a phone-friendly HTML page with copy buttons.
"""
import json, sys, os

PL = "top-down pixel art, muted desaturated dark-forest colours, soft shading"
NOTEXT = "(ข้อนี้ไม่ต้องวางข้อความ — กดปุ่มตามขั้นตอนด้านบน)"

S = []  # sections: (id, title, note, [(code, title, how, prompt)])
def sec(sid, title, note=''):
    S.append((sid, title, note, []))
def P(code, title, how, prompt):
    S[-1][3].append((code, title, how, prompt))

# ---------- step templates ----------
def create_char(size, name, nexts):
    return [
        "เมนูแถบบน กด **Characters** → กดปุ่ม **Create character** (หรือ **+ New**)",
        "กล่องข้อความใหญ่บนสุด (เขียนว่า 0/2000) → **วางข้อความด้านล่าง**",
        "**Camera View** → กด **Low Top-Down**",
        f"**Sprite Size** → กด **{size}px**",
        "**Detail** → **Highly detailed** • **Outline** → **single color black outline**",
        "เลื่อนลงล่างสุด กด **Generate** แล้วรอ (เว็บสร้าง 8 ทิศให้เอง)",
        f"ได้ {name} แล้ว ทำท่าขยับต่อตามข้อ {nexts}",
    ]

def walk(name):
    return [
        f"เมนู **Characters** → กดรูป **{name}** ที่สร้างไว้",
        "กดปุ่ม **Add Animation**",
        "ส่วนบนสุดที่เขียนว่า **MODEL** → กด **PixMiniMax** (กรอบสีส้ม)",
        "กดปุ่ม **Walking** (ได้ท่าเดิน + ยืน ในครั้งเดียว)",
        "เลื่อนลงล่างสุด กด **Generate in Background**",
    ]

def custom(name, what, last=False):
    st = [
        f"เมนู **Characters** → กดรูป **{name}** → กด **Add Animation**",
        "เลื่อนลงหากล่อง **Describe your own** → กดช่อง **Custom Animation**",
        f"**วางข้อความด้านล่าง** ในช่องนั้น ({what})",
        "เลื่อนลงล่างสุด กด **Generate in Background**",
    ]
    if last:
        st.append("ทำครบทุกท่าแล้ว: ในหน้าตัวละคร กด **Download** (ได้ไฟล์ ZIP) → **ส่ง ZIP มาในแชทนี้** ได้เลย")
    return st

def obj(size, name):
    return [
        "เมนูแถบบน กด **Objects** → กดปุ่มสร้างใหม่ (**Create** / **+ New**)",
        "ช่องคำอธิบาย → **วางข้อความด้านล่าง**",
        "มุมกล้อง (View / Camera) → **Low Top-Down** ถ้ามีให้เลือก",
        f"ขนาด → **{size}px** (ถ้ามีช่อง width/height ใส่ {size} ทั้งคู่)",
        "กด **Generate** → เสร็จแล้วกด **Download** → ส่งรูปมาในแชทนี้",
        f"(ถ้าหน้า Objects ไม่มีช่องตามนี้ แคปหน้าจอมาให้ผมก่อน — ชิ้นนี้คือ {name})",
    ]

def tile(part, name):
    if part == 'a':
        return [
            "เมนูแถบบน กด **Maps** (ปลดล็อกแล้วหลังจ่าย) → หา **Create tileset** แบบ **Top-down**",
            "**Tile size** → **32**",
            f"ช่อง **Lower** (พื้นล่าง) → **วางข้อความด้านล่าง** ({name})",
            "ยังไม่กด Generate — ไปก๊อปข้อ b มาวางในช่อง Upper ก่อน",
            "(ถ้าในเมนู Maps ไม่มีคำว่า tileset / Lower / Upper แคปหน้าจอมาให้ผม)",
        ]
    return [
        f"หน้าเดิมจากข้อ a: ช่อง **Upper** (พื้นบน) → **วางข้อความด้านล่าง** ({name})",
        "กด **Generate** แล้วรอ",
        "เสร็จแล้วกด **Download** / **Export** (PNG) → ส่งรูปมาในแชทนี้",
    ]

# ---------------- 0. plan ----------------
sec('plan', '⓪ แผนทำงาน 1 เดือน (อ่านก่อน)',
    'สัปดาห์ 1: ① แผ่นพื้น TL1-TL4 + ② ฮีโร่ HR1 และ HR3 (ท่าที่ขาด) • สัปดาห์ 2: ③ มอน MO1-MO8 + ฮีโร่ร่างอื่น • '
    'สัปดาห์ 3: มอนที่เหลือ + ④ บอส + ⑤ ชาวบ้าน/สัตว์ • สัปดาห์ 4: ⑥ อาคาร + ⑦ ของในฉาก + เก็บตก • '
    'ทุกข้อมีขั้นตอน 1-2-3 บอกเมนูและปุ่มที่ต้องกด แล้วกดคัดลอกข้อความในกล่องไปวาง • '
    'ทำตัวไหนครบ ส่ง ZIP มาเลย ไม่ต้องรอทั้งชุด • ดูตัวนับโควต้าในหน้า Account บ้าง ถ้าลดเร็วผิดปกติ บอกผม')

# ---------------- 0b. ground fix (director: roads/ground look wrong) ----------------
def tile16(part, name):
    if part == 'a':
        return [
            "เมนูแถบบน กด **Maps** → **Create tileset** แบบ **Top-down**",
            "**Tile size** → **16** (ถ้าไม่มี 16 ให้ใช้ 32 แล้วบอกผม)",
            "ถ้ามีช่อง **Transition** / ความกว้างขอบ → เลือกแบบ **กว้าง / soft / smooth** ที่สุด",
            f"ช่อง **Lower** → **วางข้อความด้านล่าง** ({name})",
            "ยังไม่กด Generate — ก๊อปข้อ b ไปวางช่อง Upper ก่อน",
        ]
    return [
        f"หน้าเดิม: ช่อง **Upper** → **วางข้อความด้านล่าง** ({name})",
        "กด **Generate** → เสร็จแล้วกด **Download** → เลือก **Wang** → ส่งรูปมาในแชทนี้",
    ]
sec('fix', '⓪ ชุดแก้พื้นให้สมจริง (ทำก่อนอย่างอื่น)',
    'ปัญหาเดิม: ทางดินเป็นร่องลึกมีขอบนูน และแผ่นใหญ่ 32px ทำให้ทางเป็นเหลี่ยมขั้นบันได • ชุดนี้สั่งให้ทางเรียบเสมอหญ้า ขอบนุ่ม '
    'และใช้แผ่นเล็ก 16px → ทางโค้งได้ลื่น • ของประดับพื้น (FX-D) ใช้โรยกลบรอยซ้ำให้ดูธรรมชาติ แบบที่เกมจริงทำ')
FIX_GRASS = "short dense dark moss-green grass, flat, even ground, no rim, no border, top-down pixel art, muted desaturated dark-forest colours, soft shading"
for c, t, up in [
    ('FT1', 'หญ้า ↔ ทางดินเรียบ', "flat worn dirt footpath at the same height as the grass, soft ragged grassy edge, a few pebbles and faint wheel ruts, no raised rim, no trench, no dark outline"),
    ('FT2', 'หญ้า ↔ ลานหินปู', "flat old flagstone pavement at the same height as the grass, irregular worn grey stones with grass and moss growing in the gaps, edge stones half buried in grass, no raised rim"),
    ('FT3', 'หญ้า ↔ น้ำ', "calm deep teal river water with gentle ripples, gentle muddy bank sloping into the water, a few reeds and wet stones at the edge"),
]:
    P(c + 'a', f'{t} — ช่อง Lower', tile16('a', 'หญ้า'), FIX_GRASS)
    P(c + 'b', f'{t} — ช่อง Upper', tile16('b', t.split('↔ ')[1]), f"{up}, top-down pixel art, muted desaturated dark-forest colours, soft shading")
DEC = [
    ('FD1', 'กอหญ้าสูง', 16, 'small clump of tall wild grass blades'),
    ('FD2', 'ดอกไม้ป่า', 16, 'tiny cluster of small pale wildflowers in grass'),
    ('FD3', 'ก้อนกรวด', 16, 'few small flat pebbles lying on the ground'),
    ('FD4', 'ใบไม้ร่วง', 16, 'few fallen rust-brown leaves on the ground'),
    ('FD5', 'แอ่งน้ำ', 32, 'small shallow muddy puddle reflecting the sky, flat on the ground'),
    ('FD6', 'รอยล้อเกวียน', 32, 'short section of two faint wheel ruts in dirt, flat on the ground, transparent background'),
    ('FD7', 'มอสกับหญ้าแทรกหิน', 16, 'small patch of moss and grass tufts growing between stones'),
    ('FD8', 'กกริมน้ำ', 32, 'clump of tall reeds and cattails at a river edge'),
]
for c, t, size, d in DEC:
    P(c, f'ของประดับพื้น: {t} ({size}px)', obj(size, t), f"{d}, top-down pixel art, muted desaturated dark-forest colours, soft shading")
P('FB1', 'สะพานไม้ มองจากบน (96px)', obj(96, 'สะพาน'), "wooden plank bridge seen directly from above, planks running across, rope railings on both sides, top-down pixel art, muted desaturated dark-forest colours, soft shading")

# ---------------- 1. tilesets ----------------
sec('tiles', '① แผ่นพื้น (เมนู Maps)', '1 ชุด = ข้อ a (ช่อง Lower) + ข้อ b (ช่อง Upper) แล้วกด Generate ครั้งเดียว')
TILES = [
    ('TL1', 'หญ้า ↔ ทางดิน', 'dense dark moss-green grass with tiny weeds', 'packed brown dirt path with small pebbles'),
    ('TL2', 'หญ้า ↔ ทางหินปู', 'dense dark moss-green grass with tiny weeds', 'worn slate-grey cobblestone road, irregular stones, moss in the gaps'),
    ('TL3', 'น้ำ ↔ หญ้า (ริมน้ำ)', 'calm deep teal river water with soft ripples', 'dense dark moss-green grass with a muddy bank edge'),
    ('TL4', 'หญ้า ↔ หน้าผาหิน', 'dense dark moss-green grass', 'raised rocky plateau with a vertical grey stone cliff face on its south side'),
    ('TL5', 'พื้นป่ามืด ↔ ใบไม้ร่วง', 'dark forest floor of moss and roots', 'fallen rust-brown leaves and twigs'),
    ('TL6', 'หิมะ ↔ ทางน้ำแข็ง', 'soft blue-white snow', 'packed icy path with blue cracks'),
    ('TL7', 'หินภูเขาไฟ ↔ ลาวา', 'dark cracked basalt rock', 'glowing orange lava with a dark crust'),
    ('TL8', 'พื้นคุก ↔ ทางน้ำใต้ดิน', 'old blue-grey dungeon flagstones with moss', 'dark sewer water channel'),
]
for c, t, lo, up in TILES:
    P(c + 'a', f'{t} — ช่อง Lower', tile('a', lo.split(',')[0]), f"{lo}, {PL}")
    P(c + 'b', f'{t} — ช่อง Upper', tile('b', up.split(',')[0]), f"{up}, {PL}")

# ---------------- 2. hero ----------------
sec('hero', '② ฮีโร่ 13 ร่าง (เมนู Characters • 48px)',
    'ทุกร่างทำแค่ 3 ข้อ: สร้างตัว → เดิน → โจมตี • ไม่ต้องทำท่าสกิลและท่าตาย (เกมทำด้วยโค้ด: สกิล = ท่าโจมตี + เอฟเฟกต์ • ตาย = กะพริบ ล้ม แตกเป็นพิกเซล วิญญาณลอยขึ้น) • ทุกร่างคือหนุ่มผมน้ำตาลคนเดิม • '
    'ถ้าอาวุธในมือส่ายตอนเดิน ลองใหม่โดยเติมคำว่า weapon sheathed, hands empty ท้ายข้อความสร้างตัว')
ATK = {
    'sword': ("swinging the sword in a strong slash attack", "spinning around in a powerful sword slash with a glowing trail"),
    'bow': ("drawing the bow and shooting an arrow forward", "aiming the bow up high and shooting a glowing arrow into the sky"),
    'mage': ("thrusting the staff forward and casting a glowing magic bolt", "raising both hands high and casting a big glowing spell circle"),
    'tank': ("smashing forward with the weapon while holding the shield", "raising the shield high and slamming it into the ground with a shockwave"),
}
DIE = "falling down defeated and lying on the ground"
FORMS = [
    ('HR0', 'ชาวบ้าน (ร่างแรก) — มีแล้ว: ตัว เดิน ฟันดาบ', 'sword', 'young man with short messy brown hair, plain beige linen shirt, brown trousers, rope belt, worn boots, wooden practice sword'),
    ('HR1', 'นักดาบ', 'sword', 'same young man, blue tunic with leather shoulder guard, red headband, green scarf, steel short sword and small round shield'),
    ('HR2', 'อัศวิน', 'sword', 'same young man in polished steel plate armour, blue tabard, red cape, closed knight helmet with red plume, longsword and kite shield'),
    ('HR3', 'ลอร์ดอัศวิน', 'sword', 'same young man in ornate white-and-gold plate armour with glowing blue runes, royal blue cape, winged full helmet, radiant greatsword'),
    ('HR4', 'นักธนู', 'bow', 'same young man in green hooded tunic, leather bracers, quiver on the back, simple wooden bow'),
    ('HR5', 'พรานป่า', 'bow', 'same young man in layered green-brown leather armour, fur-lined hood, cloth mask over nose and mouth, carved longbow'),
    ('HR6', 'เรนเจอร์ราชันย์', 'bow', 'same young man in emerald-and-gold elven armour, leaf-pattern cape, golden half mask, glowing bow of light'),
    ('HR7', 'จอมเวท', 'mage', 'same young man in purple hooded robe with gold trim, potion pouches, wooden staff with a blue crystal'),
    ('HR8', 'ปราชญ์เวท', 'mage', 'same young man in long violet star-embroidered robe, tall pointed wizard hat, face veil, silver staff with orbiting crystal'),
    ('HR9', 'อาร์คเมจทมิฬ', 'mage', 'same young man in tattered jet-black robes with crimson runes, horned black hood, iron skull mask with red eyes, bone staff with crimson crystal'),
    ('HR10', 'ผู้พิทักษ์ (แทงค์)', 'tank', 'same young man in thick iron armour over chainmail, open-face iron helmet, huge rectangular tower shield, short heavy mace'),
    ('HR11', 'อัศวินเหล็กกล้า', 'tank', 'same young man in massive dark steel plate armour with spiked pauldrons, closed great-helm with glowing visor slit, spiked tower shield, war hammer'),
    ('HR12', 'ป้อมปราการมนุษย์', 'tank', 'same young man in colossal black-and-gold plate armour with glowing orange runes, horned helmet with iron face mask, castle-gate tower shield, glowing war hammer'),
]
for c, t, cls, d in FORMS:
    name = t.split(' —')[0]
    if c != 'HR0':
        P(c, f'{name} — สร้างตัว', create_char(48, name, f'{c}-W, {c}-A'), f"{d}, {PL}")
        P(c + '-W', f'{name} — เดิน', walk(name), NOTEXT)
        P(c + '-A', f'{name} — โจมตี', custom(name, 'ท่าโจมตี', last=True), ATK[cls][0])

# ---------------- 3. monsters ----------------
sec('mon', '③ มอนสเตอร์ 17 ตัว — ออกแบบใหม่ ดุ น่ากลัว ไม่ซ้ำเกมอื่น (เมนู Characters)', 'ทุกตัวทำแค่ 3 ข้อ: สร้างตัว → เดิน → โจมตี (ท่าตายเกมทำด้วยโค้ด) • ขนาดเขียนไว้ในหัวข้อ • เยติที่ทำไปแล้วใช้ได้ หรือทำ MO15 ใหม่ให้ดุกว่าก็ได้')
MONS = [
    # ป่าเอลเดอร์โกรฟ (Lv1-20)
    ('MO1', 'ก้อนโคลนกลืนกิน (แทนสไลม์)', 32, 'pulsing blob of black bog tar with a ring of tiny needle teeth on top and three pale staring eyes, dripping', 'stretching up and lunging forward to bite with its ring of teeth', 'bursting and melting into a black puddle'),
    ('MO2', 'ซากเห็ดเน่า (แทนเห็ด)', 48, 'hunched rotting corpse-like fungus creature, sickly mushroom caps sprouting from its bony back, glowing spore-filled eye sockets', 'swinging its long arms and coughing a cloud of glowing spores', 'collapsing into a heap of rotten mushrooms'),
    ('MO3', 'หมาป่ากลวงโหว่ (แทนหมาป่า)', 48, 'gaunt skinless wolf with exposed ribs, cracked bark-like hide, ember red eyes and a jaw too long for its skull', 'lunging forward with a vicious biting attack', 'yelping and collapsing into a pile of bones and bark'),
    ('MO4', 'ภูตหนามสวมหน้ากาก (แทนก็อบลิน)', 48, 'small wiry creature made of black thorny briars wearing a cracked carved wooden mask, holding a sharpened bone knife', 'stabbing forward fast with the bone knife', 'falling apart into dry thorny twigs, the mask dropping'),
    ('MO5', 'ผีเสื้อกลางคืนหน้ากะโหลก (แทนวิญญาณไฟ)', 48, 'giant moth with a pale skull-like face, tattered dusty wings glowing faintly like a lantern, long thin legs', 'diving forward with a flash of glowing wing dust', 'wings crumbling to dust as it falls'),
    # ป่าผีสิง / คุกใต้ดิน (Lv20-80)
    ('MO6', 'หนูแทะซาก (แทนหนูยักษ์)', 32, 'hairless giant plague rat with a split lower jaw, pale sores and milky blind eyes', 'lunging forward with its split jaw', 'twitching and flipping onto its back'),
    ('MO7', 'อัศวินเปลือกกลวง (แทนโครงกระดูก)', 48, 'headless rusted suit of armour filled with twisting roots, green glow from the empty neck, cracked rusty greatsword', 'swinging the rusty greatsword in a heavy slash', 'collapsing into empty armour pieces as the glow dies'),
    ('MO8', 'นักธนูกระดูกเขากวาง (แทนโครงกระดูกธนู)', 48, 'skeletal archer with deer antlers growing from its skull, ragged hood, bow strung with sinew', 'drawing the sinew bow and shooting a bone arrow', 'crumbling into bones and antlers'),
    ('MO9', 'วิญญาณผ้าคลุมหน้า (แทนผี)', 48, 'tall faceless ghost woman in a long tattered grey veil, very long thin fingers, floating above the ground', 'reaching forward fast with long clawed fingers', 'screaming silently and tearing apart into mist'),
    ('MO10', 'แมงมุมปากคน (แทนแมงมุม)', 48, 'giant black spider whose whole body is a gaping mouth full of human-like teeth, eight bristly legs', 'rearing up and snapping its giant mouth forward', 'curling its legs and going still'),
    # ดินแดนลาวา (Lv50)
    ('MO11', 'ปีศาจเถ้าถ่าน (แทนอิมป์)', 32, 'small horned fiend with cracked obsidian skin, a mouth glowing with fire and smoking claws', 'spitting a burst of fire forward', 'cracking apart into glowing embers'),
    ('MO12', 'ยักษ์ตะกรันโซ่ตรวน (แทนโกเลม)', 64, 'hulking colossus of cooled black slag bound in rusted chains, a glowing furnace heart in its open chest', 'raising chained fists and smashing the ground', 'its furnace heart dying as it crumbles into slag'),
    ('MO13', 'กิ้งก่าแมกมาหกขา (แทนซาลาแมนเดอร์)', 48, 'six-legged lizard with cooling lava plates on its back, glowing cracks and a long whip tail', 'whipping its tail and spitting molten rock', 'curling up as its glow fades to black stone'),
    # ภูเขาหิมะ (Lv60)
    ('MO14', 'นักล่าเหมันต์ (แทนหมาป่าน้ำแข็ง)', 48, 'lean wolf-like beast with icicle spines along its back, a frozen exposed jaw and cold blue eyes', 'lunging forward with a freezing bite', 'shattering into ice shards'),
    ('MO15', 'ยักษ์หน้ากากน้ำแข็ง (แทนเยติ)', 64, 'hunched furred giant wearing a frozen skull mask, arms encased in jagged ice', 'swinging an ice-covered arm down', 'falling face down and freezing solid'),
    # สัตว์ล่าในป่าพรานไพร
    ('MO16', 'กวางเขาดำ (สัตว์ล่า)', 48, 'large dark forest stag with black branching antlers and scars', 'kicking backwards with the hind legs', 'stumbling and lying down on its side'),
    ('MO17', 'หมูป่าแผลเป็น (สัตว์ล่า)', 48, 'huge scarred wild boar with broken tusks and bristly black mane', 'charging forward with its tusks', 'squealing and toppling onto its side'),
]
for c, t, size, d, atk, die in MONS:
    P(c, f'{t} — สร้างตัว ({size}px)', create_char(size, t, f'{c}-W, {c}-A'), f"{d}, {PL}")
    P(c + '-W', f'{t} — เดิน', walk(t), NOTEXT)
    P(c + '-A', f'{t} — โจมตี', custom(t, 'ท่าโจมตี', last=True), atk)

# ---------------- 4. bosses ----------------
sec('boss', '④ บอส 5 ตัว (เมนู Characters • 128–168px)', 'Tier 1 ทำตัวใหญ่ได้แล้ว • ทุกตัวทำ 5 ข้อ: สร้างตัว → เดิน → โจมตี → ท่าพิเศษ → ตาย')
BOSS = [
    ('BS1', 'มารดารากเน่า (บอสป่า)', 128, 'colossal rotten tree woman with a hollow screaming face in the bark, root fingers dragging on the ground, cages of trapped glowing souls hanging from her branches', 'sweeping a huge root arm forward', 'slamming her roots down so thorny roots burst from the ground', 'splitting apart and falling like a dead tree as the souls escape'),
    ('BS2', 'ราชากวางโครงกระดูก (บอสป่าผีสิง)', 128, 'giant skeletal stag with candle-lit antlers dripping wax and a ribcage holding a cold blue flame, tattered moss hanging from its bones', 'charging forward with its burning antlers', 'rearing up and releasing a wave of blue ghost fire', 'collapsing into bones as the blue flame goes out'),
    ('BS3', 'อสรพิษแก้วดำ (บอสลาวา)', 168, 'huge wingless serpent dragon made of black volcanic glass with lava flowing through its cracks and a crown of jagged obsidian horns', 'striking forward with its jaws', 'breathing a stream of molten lava forward', 'cracking and shattering as the lava cools'),
    ('BS4', 'ผู้คุมเหมันต์ (บอสหิมะ)', 128, 'towering giant in frozen armour, face hidden under a crown of ice, carrying a huge frozen bell as a mace', 'swinging the frozen bell mace down', 'ringing the bell so ice spikes burst from the ground', 'falling to its knees and shattering into ice'),
    ('BS5', 'มงกุฎกลวง (บอสคุกใต้ดิน)', 128, 'towering rotting king with four arms fused to his throne by iron chains, a crown of rusted nails and a glowing purple hole where his face should be', 'swinging two great swords in a wide slash', 'pulling the chains so purple ghost fire erupts around him', 'crumbling into bones and chains with the crown rolling away'),
]
for c, t, size, d, atk, sp, die in BOSS:
    P(c, f'{t} — สร้างตัว ({size}px)', create_char(size, t, f'{c}-W, {c}-A, {c}-K, {c}-D'), f"{d}, {PL}")
    P(c + '-W', f'{t} — เดิน', walk(t), NOTEXT)
    P(c + '-A', f'{t} — โจมตี', custom(t, 'ท่าโจมตี'), atk)
    P(c + '-K', f'{t} — ท่าพิเศษ', custom(t, 'ท่าพิเศษ'), sp)
    P(c + '-D', f'{t} — ตาย', custom(t, 'ท่าตาย', last=True), die)

# ---------------- 5. NPCs & animals ----------------
sec('npc', '⑤ ชาวบ้านและสัตว์ (เมนู Characters)', 'ทำ 2 ข้อ: สร้างตัว → เดิน • คนงานมีท่าทำงานเพิ่มอีก 1 ข้อ')
NPCS = [
    ('NP1', 'ผู้เฒ่าหมู่บ้าน', 48, 'old village elder with a long white beard, hooded grey-green robe and a gnarled staff', None),
    ('NP2', 'พ่อค้า', 48, 'plump travelling merchant with a big backpack, felt hat and coin pouch', None),
    ('NP3', 'ช่างตีเหล็ก', 48, 'burly blacksmith with a leather apron, rolled sleeves and a hammer', 'hammering on an anvil'),
    ('NP4', 'คนตัดไม้', 48, 'lumberjack in a plaid shirt with an axe over his shoulder', 'chopping wood with the axe'),
    ('NP5', 'คนงานเหมือง', 48, 'miner with a helmet lamp and a pickaxe', 'swinging the pickaxe at a rock'),
    ('NP6', 'แม่ครัว', 48, 'cook woman with a white apron and a wooden ladle', 'stirring a big pot with the ladle'),
    ('NP7', 'สาวโรงเตี๊ยม', 48, 'tavern barmaid with braided hair carrying a mug', None),
    ('NP8', 'ยามหมู่บ้าน', 48, 'village guard in a padded gambeson with a spear', None),
    ('NP9', 'เด็กในหมู่บ้าน', 32, 'small village kid with messy hair and patched clothes', None),
    ('NP10', 'เอลฟ์นักธนู', 48, 'blonde elf archer girl with a green hood and a longbow', None),
    ('AN1', 'แมว', 32, 'small tabby cat', None), ('AN2', 'แกะ', 32, 'fluffy cream sheep', None), ('AN3', 'วัว', 48, 'brown and white cow', None),
    ('AN4', 'หมู', 32, 'pink farm pig', None), ('AN5', 'ไก่', 32, 'white hen', None),
]
for c, t, size, d, work in NPCS:
    P(c, f'{t} — สร้างตัว ({size}px)', create_char(size, t, f'{c}-W' + (f', {c}-J' if work else '')), f"{d}, {PL}")
    w = walk(t)
    if not work: w = w + ["เสร็จแล้ว: หน้าตัวละคร กด **Download** (ZIP) → ส่งมาในแชทนี้"]
    P(c + '-W', f'{t} — เดิน', w, NOTEXT)
    if work:
        P(c + '-J', f'{t} — ท่าทำงาน', custom(t, 'ท่าทำงาน', last=True), work)

# ---------------- 6. buildings (Objects) ----------------
sec('bld', '⑥ อาคาร 3 ระดับ (เมนู Objects)', 'อาคารละ 3 รูป: Lv1 เล็ก / Lv3 กลาง / Lv5 ใหญ่หรู • ทำทีละรูป • ขนาดเขียนไว้ในขั้นที่ 4')
BLD = [
    ('BD1', 'ศาลากลาง', 'village town hall with a bell tower and banners', 160),
    ('BD2', 'บ้านพัก', 'villager cottage with a chimney and flower boxes', 128),
    ('BD3', 'โรงเลื่อย', 'timber sawmill shed with a big circular saw and stacked logs under its roof', 128),
    ('BD4', 'เหมืองหิน', 'stone-cutting shed with a wooden crane and cut stone blocks', 128),
    ('BD5', 'คอกสัตว์', 'red wooden animal barn with a hay loft door and a small fenced pen', 128),
    ('BD6', 'โรงตีเหล็ก', 'open-fronted blacksmith forge with a stone chimney, anvil and glowing furnace', 128),
    ('BD7', 'ครัว', 'cookhouse with a smoking chimney and a big cauldron by the door', 128),
    ('BD8', 'โกดัง', 'wide storehouse with big double doors and crates', 128),
    ('BD9', 'โรงเตี๊ยม', 'two-storey tavern inn with a hanging sign and warm lit windows', 160),
    ('BD10', 'ตลาด', 'covered market hall with faded striped awnings and goods on tables', 128),
    ('BD11', 'หอป้องกัน', 'defence watchtower', 128),
]
LV = [('1', 'Lv1', 'small humble rustic version, simple wood and straw'),
      ('3', 'Lv3', 'medium sturdier version with stone foundation and tiled roof'),
      ('5', 'Lv5', 'grand version, larger, stone and dark slate roof, gold trim, banners and lanterns')]
for c, t, d, size in BLD:
    for k, lv, extra in LV:
        dd = d
        if c == 'BD11': dd = {'1': 'small wooden watchtower', '3': 'stone tower with a ballista on top', '5': 'tall stone tower with a glowing blue crystal on top'}[k]
        P(f'{c}-{k}', f'{t} {lv}', obj(size + (32 if k == '5' else 0), f'{t} {lv}'), f"{dd}, {extra}, building only, no ground around it, front door facing the viewer, {PL}")
P('BD12-1', 'ไซต์ก่อสร้าง', obj(128, 'ไซต์ก่อสร้าง'), f"building construction site with a timber frame, scaffolding, ladders and lumber stacks, no ground around it, {PL}")

# ---------------- 7. props (Objects) ----------------
sec('obj', '⑦ ของในฉาก (เมนู Objects)', 'ทำทีละชิ้น • ขนาดเขียนไว้ในหัวข้อ')
OBJ = [
    ('OB1', 'ต้นสน', 64, 'tall dark teal-green pine tree with a visible trunk'),
    ('OB2', 'ต้นโอ๊กใหญ่', 96, 'big round oak tree with a dense moss-green canopy and thick trunk'),
    ('OB3', 'ต้นไม้แห้ง', 64, 'bare dead tree with twisted grey branches'),
    ('OB4', 'พุ่มไม้', 32, 'round dark green bush'),
    ('OB5', 'ก้อนหิน', 32, 'mossy grey boulder'),
    ('OB6', 'รั้วไม้แนวนอน', 32, 'short horizontal wooden rail fence segment with two posts'),
    ('OB7', 'รั้วไม้แนวตั้ง', 32, 'short vertical wooden rail fence segment seen from above, running up and down'),
    ('OB8', 'โคมไฟ', 48, 'wooden lamp post with a hanging glowing lantern'),
    ('OB9', 'บ่อน้ำ', 48, 'round stone well with a small wooden roof and bucket'),
    ('OB10', 'กองไฟ', 32, 'campfire ring of stones with burning logs'),
    ('OB11', 'เกวียน', 48, 'wooden hand cart with two wheels'),
    ('OB12', 'ถังไม้', 32, 'wooden barrel with iron bands'),
    ('OB13', 'ลังไม้', 32, 'stack of two wooden crates'),
    ('OB14', 'ป้ายบอกทาง', 32, 'wooden direction sign post'),
    ('OB15', 'แผงตลาด', 64, 'market stall with a faded striped awning and baskets of goods'),
    ('OB16', 'กองซุง', 48, 'pile of cut logs'),
    ('OB17', 'สะพานไม้', 96, 'short wooden plank bridge seen from above, crossing from left to right'),
    ('OB18', 'กองฟาง', 32, 'hay bale'),
    ('OB19', 'ต้นไม้ (ตัดได้) ตอ', 32, 'tree stump with an axe mark'),
    ('OB20', 'หินแร่ (ขุดได้)', 48, 'large grey rock with glinting ore veins'),
]
for c, t, size, d in OBJ:
    P(c, f'{t} ({size}px)', obj(size, t), f"{d}, {PL}")

# ---------------- output ----------------
HOWTO = ('ทุกข้อ: ทำตามขั้นตอน 1-2-3 (บอกเมนู ปุ่ม และค่าที่ต้องตั้ง) แล้วกด "คัดลอก" ข้อความในกล่องไปวางตรงที่บอก • '
         'ทำตัวไหนครบ ส่ง ZIP/รูปมาในแชทเลย ไม่ต้องบอกรหัส • ปุ่มหรือเมนูไม่ตรงกับที่เขียน แคปหน้าจอมาให้ผม')

def write_md(path):
    out = ['# Prompt Book v4 — PixelLab ทีละขั้น (Eldergrove Saga)', '', HOWTO, '']
    for sid, title, note, its in S:
        out += [f'## {title}', '']
        if note: out += [f'_{note}_', '']
        for code, t, how, p in its:
            out += [f'**{code} — {t}**', '']
            out += [f'{i + 1}. {h}' for i, h in enumerate(how)] + ['', '```', p, '```', '']
    open(path, 'w').write('\n'.join(out))

def write_html(path):
    data = [{'id': sid, 'title': t, 'note': n, 'items': [{'code': c, 'title': tt, 'how': how, 'prompt': p} for c, tt, how, p in its]} for sid, t, n, its in S]
    tpl = open(os.path.join(os.path.dirname(__file__), 'prompts_page.html')).read()
    open(path, 'w').write(tpl.replace('__DATA__', json.dumps(data, ensure_ascii=False))
                          .replace('__COUNT__', str(sum(len(x[3]) for x in S))).replace('__HOWTO__', HOWTO))

if __name__ == '__main__':
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    write_md(os.path.join(root, 'docs', 'PROMPTS.md'))
    if len(sys.argv) > 1: write_html(sys.argv[1])
    print('prompts:', sum(len(x[3]) for x in S))
