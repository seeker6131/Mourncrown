"""Prompt Book v2 (map-first, matched to the director's concept screenshots).
Single source of truth. The old book (characters/props/tiles) was retired; it lives in git history.
python3 tools/prompts.py <out.html>  -> writes docs/PROMPTS.md and a phone-friendly HTML page with copy buttons.
"""
import json, sys, os

# ---------- shared blocks ----------
STYLE = ("Art style: copy the attached reference image exactly - highly detailed 16-bit isometric pixel art like a premium mobile RPG, "
         "crisp visible pixels, rich hand-placed texture on every surface (wood grain, thatch, cobbles, cart tracks, grass tufts, fallen leaves), "
         "warm autumn palette (browns, ochre, mossy greens, dusty orange), soft dark outlines, warm lantern and firelight glow, light from top-left.")
CAM = ("Camera: same as the reference - 2:1 isometric, orthographic, looking down about 35 degrees; ground lines run diagonally "
       "(2 pixels across for 1 up).")
SCALE = ("Scale (very important, keep it the same in every image): a human would be about 1/14 of the image height "
         "(about 70 px tall in a 1536x1024 image); a one-storey cottage is about 3 humans tall; a big tree about 4 humans tall; "
         "doors are human-sized.")
EMPTY = ("Empty scene for a game level: NO people, NO animals, NO monsters, NO UI, NO text, NO logo, NO watermark. "
         "Keep wide open walkable ground and clear paths so characters can move around.")
LOT = ("An 'empty building lot' means a flat clearing of bare packed dirt about 5 humans wide, with a few stones or short "
       "stakes at its corners and nothing built on it.")
WHITE = "Plain pure white background, no cast shadow on the white, no text, no watermark."

def plate(desc, first=False, neighbours=''):
    head = ("Landscape 3:2 image (1536x1024). Isometric game map background: one piece of a playable level floor, "
            "the edges of the image are part of the same map and continue beyond the frame. ")
    join = '' if first else (
        f"The second attached image is the map piece directly {neighbours} this one. Draw the NEXT piece of the SAME map so "
        "the two join seamlessly along that shared edge: paths, roads, river, fences, cliffs and forest that cross the border "
        "continue at exactly the same positions, same scale, same lighting, same palette. ")
    return f"{head}{join}This piece shows: {desc} {STYLE} {CAM} {SCALE} {EMPTY}"

def room(desc):
    return (f"Landscape 3:2 image (1536x1024). Isometric game level: ONE complete dungeon room seen from above, {desc} "
            "Everything outside the room's walls is pure black void. " f"{STYLE} {CAM} {SCALE} {EMPTY}")

def bsheet(desc):
    return ("Landscape 3:2 image (1536x1024). Pixel art game asset sheet: THREE versions of the same building side by side, "
            "left to right: level 1 small and humble, level 3 bigger and sturdier, level 5 grand and decorated. "
            f"The building: {desc} Each version stands on its own small irregular patch of packed dirt together with its yard props; "
            "the patch edge breaks up softly into grass tufts, pebbles and leaves (no square base, no hard edge). "
            "All three at the same scale, the level 1 footprint about 5 humans wide, large empty white gaps between them. "
            f"No people, no animals. {STYLE} {CAM} {SCALE} {WHITE}")

def anim(who, action, n, extra='', facing='down-right'):
    return (f"Pixel art animation sprite sheet of {who}. {action} animation facing {facing}. "
            "Seen from a high isometric camera angle (about 30 degrees down). "
            f"Exactly {n} frames in one horizontal row, evenly spaced in equal-size cells, feet on the same baseline in every frame, "
            f"identical design and size in every frame. {extra} "
            "Crisp high-detail 16-bit pixel art, every pixel sharp, no anti-aliasing, no blur, dark 1-pixel outline, warm earthy palette, "
            f"light from top-left. {WHITE}").replace('  ', ' ')

S = []  # sections: (id, title, note, [(code, title, prompt)])
def sec(sid, title, note=''):
    S.append((sid, title, note, []))
def P(code, title, prompt):
    S[-1][3].append((code, title, prompt))

# ---------------- 1. village map ----------------
sec('village', '① แมพหมู่บ้าน (ทำก่อน)',
    'แมพเดียว 6 ชิ้น เรียง 3 คอลัมน์ × 2 แถว: VL1 VL2 VL3 / VL4 VL5 VL6 • แนบ "รูป concept สร้างหมู่บ้าน" ทุกครั้ง • '
    'เริ่ม VL2 ก่อน แล้วชิ้นต่อไปแนบชิ้นข้างๆ ที่บอกไว้เป็นรูปที่ 2 • ถ้าออกมารอยต่อเพี้ยนนิดหน่อยไม่เป็นไร ผมเกลี่ยให้ • '
    'ไม่มีตึกบนแปลงว่าง เพราะตึกเปลี่ยนตามเลเวล')
P('VL2', 'กลางบน: ลานกลางหมู่บ้าน (เริ่มชิ้นนี้)', plate(
    "the heart of an autumn medieval village. A wide dirt crossroads with cart tracks in the lower middle; a round cobblestone plaza "
    "with a stone well and a notice board; one LARGE empty building lot (about 7 humans wide) at the top centre behind the plaza for the "
    "town hall; a dirt road leaving the village through the top edge into a dark autumn forest; wooden lantern posts, short fences, "
    "barrels, hay bales, a few orange-leaved trees. " + LOT, first=True))
P('VL1', 'ซ้ายบน: ลานไม้ + เหมืองหิน', plate(
    "the north-west corner of the same village. Dark autumn forest with bare trees fills the top-left corner; a grey rocky slope with "
    "loose boulders and stone piles along the top; TWO empty building lots (for a sawmill and a quarry) beside a dirt path that comes "
    "from the right edge; stacked log piles, tree stumps, a wood chopping block, sawdust patches. " + LOT, neighbours="to the RIGHT of"))
P('VL3', 'ขวาบน: ย่านช่าง + ขอบป่าผีสิง', plate(
    "the north-east corner of the same village. TWO empty building lots (for a forge and a house) along a dirt road; the road leaves "
    "through the right edge toward a creepy dark forest of dead black trees that fills the top-right corner, faint glowing red eyes "
    "between the trees; a wooden sign post, firewood stacks, a broken cart. " + LOT, neighbours="to the LEFT of"))
P('VL5', 'กลางล่าง: ลานตลาด', plate(
    "the south-centre of the same village. The crossroads road continues down and leaves through the bottom edge; a small market "
    "square of packed dirt; TWO empty building lots (for a market and a tavern); crates, sacks, barrels, a hand cart, lantern posts, "
    "flower boxes. " + LOT, neighbours="BELOW (south of)"))
P('VL4', 'ซ้ายล่าง: ทุ่งนา', plate(
    "the south-west corner of the same village. Fenced farmland with neat tilled soil rows, golden wheat, cabbages and pumpkins; TWO "
    "empty building lots (for a farm and a kitchen); a dirt road leaving through the left edge; scarecrow, hay stacks, autumn trees in "
    "the bottom-left corner. " + LOT, neighbours="BELOW the first attached piece and to the LEFT of the other"))
P('VL6', 'ขวาล่าง: ริมน้ำ + คอกสัตว์', plate(
    "the south-east corner of the same village. A blue river comes in from the right edge and curves down out of the bottom edge, "
    "crossed by an arched stone bridge; a wooden water wheel on the bank; ONE large empty fenced pasture lot (for a barn and animal pen); "
    "reeds, rocks, a small wooden dock, autumn trees. " + LOT, neighbours="BELOW the first attached piece and to the RIGHT of the other"))

# ---------------- 2. buildings ----------------
sec('build', '② อาคาร 3 ระดับ พร้อมลานรอบตัว',
    'แนบรูป concept หมู่บ้านทุกครั้ง • 1 prompt = 1 อาคาร 3 ระดับ (Lv1 / Lv3 / Lv5) ในรูปเดียว • พื้นหลังขาวเหมือนเดิม • '
    'มีลานดินและของรอบตัวติดมาด้วย ผมจะวางลงแปลงว่างให้กลืนกับพื้น')
BLD = [
    ('BD1', 'ศาลากลาง', 'a village town hall with a bell tower, banners, wide front steps and a notice board.'),
    ('BD2', 'บ้านพัก', 'a villager cottage with a firewood pile, a clothesline and a small vegetable box.'),
    ('BD3', 'โรงเลื่อย', 'a sawmill: a timber shed with a huge circular saw bench, big log piles, cut planks, a log cart.'),
    ('BD4', 'เหมืองหิน', 'a stone quarry: a small rock face with a wooden crane hoist, cut stone blocks, a mine cart on short rails.'),
    ('BD5', 'ฟาร์ม', 'a farm: a small barn shed beside fenced crop fields of wheat, cabbages and pumpkins, a scarecrow, hay bales.'),
    ('BD6', 'คอกสัตว์', 'an animal barn with a wooden fenced pen, hay piles, water troughs and a chicken coop (no animals inside).'),
    ('BD7', 'โรงตีเหล็ก', 'an open-sided blacksmith workshop: anvil, glowing furnace with a smoking stone chimney, weapon rack, quench barrel.'),
    ('BD8', 'ครัว', 'a cookhouse: a timber kitchen with a big outdoor cauldron over a fire, a meat smoking rack, firewood, sacks of grain.'),
    ('BD9', 'โกดัง', 'a warehouse: a wide storehouse with stacked crates, barrels, sacks and a loading cart.'),
    ('BD10', 'โรงเตี๊ยม', 'a two-storey tavern inn with a hanging sign, warm lit windows, outdoor benches and barrels.'),
    ('BD11', 'ตลาด', 'a market: a cluster of wooden stalls with colourful striped awnings, fruit, cloth, pottery and baskets.'),
    ('BD12', 'หอป้องกัน', 'a defence watchtower with a short palisade: level 1 wooden lookout, level 3 stone tower with a ballista, level 5 tall stone tower with a glowing blue crystal on top.'),
]
for c, t, d in BLD:
    P(c, t, bsheet(d))
P('BD13', 'ไซต์ก่อสร้าง 3 ขั้น', bsheet(
    "a construction site shown as three stages instead of levels: left a staked-out foundation with lumber stacks and tools, middle a "
    "half-built timber frame with scaffolding and ladders, right an almost finished house with scaffolding and a crane."))

# ---------------- 3. hunting map ----------------
sec('hunt', '③ แมพป่าพรานไพร (ล่าสัตว์ ตัดไม้ ขุดหิน)',
    '4 ชิ้น 2×2: HT1 HT2 / HT3 HT4 • แนบ "รูป concept ค้นหาและตามล่า" • ต้นไม้และหินที่ตัดหรือขุดได้ เกมวางเอง เลยต้องเว้นที่โล่งไว้')
P('HT1', 'ซ้ายบน: แคมป์นายพราน (เริ่มชิ้นนี้)', plate(
    "a hunters' camp in a forest clearing. Large open grass area in the middle; a big stone campfire ring with a cooking pot on a "
    "tripod; two tall log watchtowers; a log palisade wall along the top; meat drying racks; small vegetable plots; thatched round huts "
    "at the left edge; a dirt path leaving through the left edge; pine and oak forest around the borders.", first=True))
P('HT2', 'ขวาบน: ป่าลึก', plate(
    "deep green forest with several open grassy glades between groups of big pine and oak trees, tree stumps, a small stream with "
    "stepping stones, ferns and mushrooms.", neighbours="to the LEFT of"))
P('HT3', 'ซ้ายล่าง: เนินหินและปากถ้ำ', plate(
    "rocky hills: a grey cliff face with a dark cave entrance and a rope ladder, a wide open area of rocky gravel ground (left empty for "
    "boulders the game will place), a few pine trees, a dirt path.", neighbours="BELOW (south of)"))
P('HT4', 'ขวาล่าง: ทุ่งหญ้า + บ่อน้ำ', plate(
    "an open meadow with tall grass patches, berry bushes, a deer trail, a small pond with reeds, wildflowers, scattered trees at "
    "the edges.", neighbours="BELOW the first attached piece and to the RIGHT of the other"))

# ---------------- 4-6. regions ----------------
REG = [
    ('haunt', '④ แมพป่าผีสิง (Lv20)', 'HF', 'แนบภาพ concept ป่าผีสิงที่เคยส่งมา', [
        ('ซ้ายบน: ทางเข้า + สุสาน (เริ่มชิ้นนี้)', "the entrance of a haunted autumn forest at dusk: a broken iron gate on a dirt path coming in from the left edge, a small "
         "graveyard with crooked tombstones, dead black trees, low purple fog, glowing mushrooms, scattered bones."),
        ('ขวาบน: บึงหมอก', "a misty swamp of the haunted forest: dark murky pools, twisted dead trees, rotten wooden walkways, "
         "lantern posts with green ghost flames, open muddy ground."),
        ('ซ้ายล่าง: โบสถ์ร้าง', "a ruined stone chapel of the haunted forest with collapsed walls and a broken bell tower, overgrown "
         "with roots, cracked flagstone yard, candles, open ground around it."),
        ('ขวาล่าง: ลานบอส', "the boss arena of the haunted forest: a large round clearing ringed by tall mossy standing stones with "
         "faint glowing runes, a huge dead tree at the back, eerie green light, wide open flat ground in the middle."),
    ]),
    ('lava', '⑤ แมพดินแดนลาวา (Lv50)', 'LV', 'แนบ "รูป concept หลอมอาวุธมหากาพย์"', [
        ('ซ้ายบน: ด่านโรงตีเหล็กคนแคระ (เริ่มชิ้นนี้)', "a dwarf blacksmith outpost on a volcanic plateau: a raised wooden plank deck with log railings, a big "
         "stone anvil, a stone furnace with a smoking chimney, fur pelts, barrels, a stone well with a slate roof, all on dark cracked rock "
         "with glowing lava cracks and rivers around the plateau."),
        ('ขวาบน: แม่น้ำลาวา', "a wide glowing lava river crossed by a black stone bridge, dark basalt ground, sharp rock spires, "
         "ash and embers, open walkable rock paths."),
        ('ซ้ายล่าง: ซากเมืองหินออบซิเดียน', "ruins of an obsidian temple: broken black pillars and stairs, carved stone floor "
         "with lava cracks, burning braziers, open walkable floor."),
        ('ขวาล่าง: ลานบอสปากปล่องภูเขาไฟ', "the boss arena on the rim of a volcano crater: a wide flat round rock plateau, lava "
         "pouring down around it, smoke and embers, glowing cracks, dramatic red light."),
    ]),
    ('snow', '⑥ แมพภูเขาหิมะ (Lv60)', 'SN', 'แนบภาพ concept ภูเขาหิมะที่เคยส่งมา', [
        ('ซ้ายบน: ด่านหมู่บ้านน้ำแข็ง (เริ่มชิ้นนี้)', "a small frozen mountain outpost: snow-covered log huts with smoking chimneys, a "
         "trampled snowy path coming in from the left edge, fences with icicles, firewood under snow, lanterns, snowy pine trees."),
        ('ขวาบน: ทะเลสาบน้ำแข็ง', "a frozen lake with cracked blue ice, snowy banks, frosted rocks, snowy pine forest, open snowy ground."),
        ('ซ้ายล่าง: ป่าสนคริสตัล', "a snowy pine forest with big glowing blue ice crystals growing from the rocks, snow drifts, "
         "open snowy clearings."),
        ('ขวาล่าง: ลานบอสยอดเขา', "the boss arena: a wide flat icy plateau near the mountain peak, ice pillars and frozen giant "
         "bones around the edge, blowing snow, cold blue light, open flat ground in the middle."),
    ]),
]
for sid, title, pre, note, items in REG:
    sec(sid, title, f'4 ชิ้น 2×2: {pre}1 {pre}2 / {pre}3 {pre}4 • {note} • ชิ้นถัดไปแนบชิ้นข้างๆ เป็นรูปที่ 2')
    sides = [None, "to the LEFT of", "BELOW (south of)", "BELOW the first attached piece and to the RIGHT of the other"]
    for i, (t, d) in enumerate(items):
        P(f'{pre}{i+1}', t, plate(d, first=(i == 0), neighbours=sides[i] or ''))

# ---------------- 7. dungeon ----------------
sec('dung', '⑦ คุกใต้ดิน (Lv80) — ห้องแยกกัน',
    'แนบ "รูป concept พิชิตคุกใต้ดิน" • ห้องละรูป ไม่ต้องต่อกัน เพราะเดินผ่านประตูไปห้องถัดไป')
P('DG1', 'ห้องทางเข้า', room("the entrance hall: wide stone stairs coming down from the top-left, cracked blue-grey flagstones with moss, "
  "stone brick walls with carved panels and wall torches, a round fire brazier on a stone base, an open archway door in the right wall."))
P('DG2', 'โถงเสา', room("a long pillared hall: two rows of dark stone pillars with glowing slit windows, a raised platform with short "
  "stairs, cobwebs, torches, archway doors in the left wall and the right wall."))
P('DG3', 'ทางเดินห้องขัง', room("a prison corridor: iron-barred cells along the back wall with chains and straw, puddles, broken crates, "
  "torches, archway doors in the left wall and the right wall."))
P('DG4', 'ห้องบัลลังก์บอส', room("the skeleton king's throne room: a large open stone floor for battle, a raised dais with a bone throne at "
  "the back, giant horned skull carvings, purple ghost-fire braziers, a treasure chest, an archway door in the left wall."))

# ---------------- 8. interiors ----------------
sec('inside', '⑧ ภายในอาคาร (ทำทีหลังได้)', 'แนบ "รูป concept รับสมัครฮีโร่" • ใช้ตอนเดินเข้าอาคาร')
P('IN1', 'ภายในโรงเตี๊ยม', room("a cosy tavern hall instead of a dungeon (cut-away view, two walls shown): a long bar counter with bottle "
  "shelves, a long feast table on a red rug, small round tables with stools, a stone fireplace, tall arched windows showing snow outside, "
  "barrels, candles, a door at the bottom-left.").replace("ONE complete dungeon room", "ONE complete room"))
P('IN2', 'ภายในโรงตีเหล็ก', room("a blacksmith workshop interior instead of a dungeon (cut-away view, two walls shown): a big anvil, a "
  "roaring furnace, weapon and armour racks, a grinding wheel, coal sacks, tool wall, a door at the bottom-left.").replace("ONE complete dungeon room", "ONE complete room"))

# ---------------- 9. atmosphere ----------------
sec('fx', '⑨ ของขยับได้ + บรรยากาศ', 'แนบรูป concept หมู่บ้าน • ของพวกนี้ทำให้แมพมีชีวิต')
P('FX1', 'กองไฟ + หม้อต้ม (6 เฟรม)', anim("a stone campfire ring with a cooking pot hanging on a wooden tripod", "Burning fire loop", 6,
  "Flames flicker, steam rises from the pot, sparks drift up. Same pot and stones in every frame."))
P('FX2', 'ควันปล่องไฟ (6 เฟรม)', anim("a soft grey chimney smoke puff column", "Rising smoke loop", 6,
  "Puffs grow and drift up and fade at the top. No chimney, smoke only."))
P('FX3', 'คบไฟผนัง + กระถางไฟ (4 เฟรม)', anim("a wall torch on the left and a standing iron fire brazier on the right", "Flame flicker loop", 4,
  "Two objects per frame, flames flicker."))
P('FX4', 'กังหันน้ำ (4 เฟรม)', anim("a wooden water wheel with a small wooden frame", "Turning loop", 4,
  "The wheel turns a quarter step each frame, water splashes off the paddles."))
P('FX5', 'ไอคอนลอยเหนืออาคาร', "Pixel art UI icon sheet, 6 separate icons in a 3x2 grid with large white gaps: round map-pin speech bubbles "
  "with a green ring, each holding one item: a wooden log, a raw steak, a wheat bundle, a grey stone, a gold coin, a hammer. "
  "Crisp high-detail 16-bit pixel art, dark outline, same style as the attached reference. " + WHITE)

# ---------------- 10. characters still missing ----------------
HERO = ('the same young hero with brown spiky hair and brown eyes (same character as the attached reference; for helmeted/masked forms '
        'keep the same body proportions), chibi, wearing ')
T2 = HERO + ('a tank guardian: thick iron armor over chainmail, huge rectangular tower shield, short heavy mace, broad strong stance, '
             'open-face iron helmet')
M3 = HERO + ('a sage mage: long violet robe with star embroidery, high collar, a tall pointed wizard hat with silver star ornaments '
             'shading the eyes and a mystic violet face veil over the mouth, floating spellbook beside him, ornate silver staff with orbiting crystal')
M4 = HERO + ('a legendary dark archmage: menacing jet-black layered robes with tattered edges and dark crimson runes, a tall black horned '
             'hood casting deep shadow, a sinister black iron skull-like mask covering the whole face with glowing blood-red eyes, black smoke '
             'and shadow wisps swirling around him, a twisted black bone staff topped with a glowing crimson void crystal')
CH = ' Chibi proportions: big head, small body.'
sec('chars', '⑩ ตัวละครที่ยังขาด', 'แนบรูปร่างเดิมของตัวนั้นไปด้วย • CH1 แทงค์ร่าง 2: ทำรูปหลักก่อน แล้วแนบรูปหลักไปกับท่าที่เหลือ')
P('CH1', 'แทงค์ร่าง 2 — รูปหลัก (ยืน)', anim(T2, 'Idle breathing', 4, 'Subtle chest rise.' + CH))
P('CH2', 'แทงค์ร่าง 2 — เดินหันหน้า', anim(T2, 'Walking', 6, 'Full walk cycle, heavy steps.' + CH))
P('CH3', 'แทงค์ร่าง 2 — เดินหันหลัง', anim(T2, 'Walking (back view)', 6, 'Full walk cycle.' + CH, 'up-right'))
P('CH4', 'แทงค์ร่าง 2 — โจมตี', anim(T2, 'Mace attack', 5, 'Wind-up, heavy mace smash, follow-through, recover.' + CH))
P('CH5', 'แทงค์ร่าง 2 — ใช้สกิล', anim(T2, 'Shield skill', 4, 'Raises the tower shield, it glows, slams it down with a shockwave.' + CH))
P('CH6', 'แทงค์ร่าง 2 — โดนตี+ล้ม', anim(T2, 'Hurt and defeat', 5, 'Flinch, stagger, fall to knees, falling, lying on the ground.' + CH))
P('CH7', 'แทงค์ร่าง 2 — รูปโปรไฟล์', "Pixel art character portrait bust (head and shoulders) of " + T2 +
  ", facing slightly right, determined expression, square canvas. Crisp high-detail 16-bit pixel art, dark outline. " + WHITE)
P('CH8', 'จอมเวทร่าง 3 — โดนตี+ล้ม', anim(M3, 'Hurt and defeat', 5, 'Flinch, stagger, fall to knees, falling, lying on the ground.' + CH))
P('CH9', 'จอมเวทร่าง 4 — ใช้สกิล', anim(M4, 'Dark skill casting', 4, 'Raises the bone staff, crimson void energy gathers, dark burst released.' + CH))
P('CH10', 'จอมเวทร่าง 4 — โดนตี+ล้ม', anim(M4, 'Hurt and defeat', 5, 'Flinch, stagger, fall to knees, falling, lying on the ground.' + CH))

# ---------------- 11. monster deaths ----------------
sec('mdie', '⑪ ท่าตายมอนสเตอร์', 'แนบรูปมอนตัวนั้น (ท่าเดิน) ไปด้วย • ตอนนี้ในเกมใช้จางหายแทนอยู่')
MD = [('สไลม์', 'slime', 'squashes flat and splats into a puddle that fades'),
      ('เห็ดพิษ', 'mushroom monster', 'wobbles, cap cracks, collapses into spores'),
      ('หมาป่า', 'wolf', 'yelps, staggers, falls on its side'),
      ('ก็อบลิน', 'goblin', 'staggers back, drops its weapon, falls on its back'),
      ('วิญญาณไฟ', 'wisp spirit', 'flickers, shrinks and pops into sparks'),
      ('หนูยักษ์', 'giant rat', 'squeaks, flips onto its back'),
      ('โครงกระดูก', 'skeleton warrior', 'rattles and crumbles into a pile of bones'),
      ('โครงกระดูกธนู', 'skeleton archer', 'drops the bow and crumbles into a pile of bones'),
      ('ผี', 'ghost', 'wails and dissolves into wisps of mist'),
      ('แมงมุมยักษ์', 'giant spider', 'curls its legs up and flips over'),
      ('อิมป์ไฟ', 'fire imp', 'flares up and bursts into embers and smoke'),
      ('โกเลมหิน', 'stone golem', 'cracks apart and collapses into a heap of rocks'),
      ('ซาลาแมนเดอร์', 'fire salamander', 'thrashes, its flames die out, lies still'),
      ('หมาป่าน้ำแข็ง', 'ice wolf', 'falls and shatters into ice shards'),
      ('เยติ', 'yeti', 'roars, staggers and falls face down into the snow'),
      ('กวาง', 'deer', 'stumbles and lies down on its side'),
      ('หมูป่า', 'wild boar', 'squeals and topples onto its side')]
for i, (t, who, how) in enumerate(MD):
    P(f'MD{i+1}', t, anim(f'the attached {who} monster (same design, colours and size)', 'Death', 5,
                          f'Hit flinch, then it {how}.'))

# ---------------- output ----------------
HOWTO = ('วิธีใช้: กดคัดลอก → วางใน GPT พร้อมแนบรูป concept ที่บอกไว้ในหมวด • ชิ้นแมพที่ต่อกัน แนบชิ้นข้างๆ เป็นรูปที่ 2 • '
         'ส่งภาพกลับพร้อมบอกรหัส (เช่น "VL2") • ลำดับ: ① → ② ก่อน เพราะเป็นหน้าแรกที่เห็น')

def write_md(path):
    out = ['# Prompt Book v2 — แมพตาม concept (Eldergrove Saga)', '', HOWTO, '']
    for sid, title, note, items in S:
        out += [f'## {title}', '']
        if note: out += [f'_{note}_', '']
        for code, t, p in items:
            out += [f'**{code} — {t}**', '```', p, '```', '']
    open(path, 'w').write('\n'.join(out))

def write_html(path):
    data = [{'id': sid, 'title': t, 'note': n, 'items': [{'code': c, 'title': tt, 'prompt': p} for c, tt, p in items]} for sid, t, n, items in S]
    tpl = open(os.path.join(os.path.dirname(__file__), 'prompts_page.html')).read()
    open(path, 'w').write(tpl.replace('__DATA__', json.dumps(data, ensure_ascii=False))
                          .replace('__COUNT__', str(sum(len(x[3]) for x in S))).replace('__HOWTO__', HOWTO))

if __name__ == '__main__':
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    write_md(os.path.join(root, 'docs', 'PROMPTS.md'))
    if len(sys.argv) > 1: write_html(sys.argv[1])
    print('prompts:', sum(len(x[3]) for x in S))
