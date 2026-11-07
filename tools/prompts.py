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
EMPTY = ("GROUND ONLY (most important): draw only the flat ground and things lower than a person's knee - dirt roads with cart "
         "tracks, grass, fallen leaves, small flowers, pebbles, low bushes, cobblestones, water, river banks, cracks, snow, "
         "lava. Do NOT draw anything taller than a knee: no trees, no tree trunks, no houses or buildings, no walls, no fences, no lamp "
         "posts, no signs, no carts, no barrels, no crates, no big rocks, no pillars, no towers - those are separate game sprites placed "
         "later. If the description mentions such tall things, draw only the flat ground where they will stand. "
         "TERRAIN IS PART OF THE GROUND: cliffs, raised rocky ledges, hills, slopes, stone stairs and ramps cut into slopes, rivers and "
         "bridges ARE drawn in this image - make cliff faces clearly vertical and readable, show where people can climb (stairs or a "
         "ramp), and draw bridges as a clear walking deck with low side curbs. "
         "NO people, NO animals, NO monsters, NO UI, NO text, NO logo, NO watermark.")
LOT = ("An 'empty building lot' means a flat isometric diamond of bare packed dirt, about 420 px from its left corner to its "
       "right corner and 210 px from back to front (the big town-hall lot 480 x 240 px), with a few flat stones at its corners and "
       "nothing standing on it.")
WHITE = "Plain pure white background, no cast shadow on the white, no text, no watermark."

def plate(desc, first=False, neighbours=''):
    head = ("Landscape 3:2 image (1536x1024). Isometric game map background: one piece of a playable level floor, "
            "the edges of the image are part of the same map and continue beyond the frame. ")
    join = '' if first else (
        f"The second attached image is the map piece directly {neighbours} this one. Draw the NEXT piece of the SAME map so "
        "the two join seamlessly. OVERLAP RULE (most important): the new image must OVERLAP the attached piece by about one quarter "
        "of its size - the quarter of the new image on the side that touches the attached piece is an exact copy of the attached "
        "piece's touching quarter (same roads, grass patches, cliffs, rivers, lots and stones at the same positions and the same "
        "size, even if they are cut by the edge), and the rest of the new image continues the map from there. Same scale, same lighting, same palette. ")
    return f"{head}{join}This piece shows: {desc} {STYLE} {CAM} {SCALE} {EMPTY}"

def room(desc):
    return (f"Landscape 3:2 image (1536x1024). Isometric game level: ONE complete dungeon room seen from above, {desc} "
            "Everything outside the room's walls is pure black void. " f"{STYLE} {CAM} {SCALE} {EMPTY}")

def bsheet(desc, foot=420):
    return ("Landscape 3:2 image (1536x1024). Pixel art building asset sheet: THREE versions of the same building side by side, "
            "left to right: level 1 small and humble, level 3 sturdier, level 5 grand and richly decorated. "
            f"The building: {desc} FOOTPRINT RULE (most important): every version stands on exactly the same isometric diamond "
            f"footprint, {foot} px from its left corner to its right corner and {foot // 2} px from its back corner to its front corner, "
            "on a low stone or timber foundation whose bottom edges follow that diamond exactly, the front corner pointing straight "
            "down at the viewer. Higher levels grow taller and richer, NOT wider. Nothing outside the footprint: no ground patch, no "
            "grass, no dirt, no yard, no loose props (small things fixed to the walls such as lanterns, signs, flower boxes, banners are "
            "fine). The lowest point of each building is the front corner of its foundation. Large empty white gaps between the three. "
            f"Same scale and palette as the attached map image (a human is about 70 px tall, doors human-sized). No people, no animals. "
            f"{STYLE} {CAM} {WHITE}")

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

# ---------------- 1. village map (fresh design, ground only) ----------------
sec('village', '① แมพหมู่บ้านใหม่ (พื้นอย่างเดียว) — ทำก่อน',
    'ออกแบบใหม่ทั้งหมด ไม่ใช้ภาพเก่า • 6 ชิ้น เรียง 3×2: GV1 GV2 GV3 / GV4 GV5 GV6 • แนบรูป concept "สร้างหมู่บ้านของคุณ" เป็นรูปที่ 1 ทุกครั้ง (ใช้แค่สไตล์) • '
    'เริ่ม GV2 • ชิ้นอื่นแนบชิ้นที่บอกไว้เป็นรูปที่ 2 • ต้องมีส่วนซ้ำกับชิ้นที่แนบประมาณ 1/4 ผมใช้ส่วนนั้นต่อภาพ • '
    'พื้นอย่างเดียว: บ้าน ต้นไม้ รั้ว โคม เป็นชิ้นแยก (หมวด ② ③) • หน้าผา เนิน แม่น้ำ สะพาน อยู่ในภาพพื้น ผมทำให้ชนหน้าผาจริงและเดินขึ้นลงสะพานโค้งจริง')
P('GV2', 'กลางบน: ลานกลางหมู่บ้าน (เริ่มชิ้นนี้)', plate(
    "the heart of a beautiful autumn fantasy village. A large round cobblestone plaza in the middle with a mosaic sun pattern; one LARGE "
    "empty building lot for the town hall at the top centre behind the plaza; wide dirt roads with cart tracks leaving the plaza to the "
    "left edge, the right edge and the bottom edge; soft grass verges full of fallen orange and red leaves, small wildflowers and "
    "pebbles; a low two-step stone terrace (knee high) around the back of the plaza with three wide steps in the middle. " + LOT, first=True))
P('GV1', 'ซ้ายบน: ที่ราบสูงหน้าผา + น้ำตก (แนบ GV2)', plate(
    "the north-west of the same village: a raised rocky plateau whose south edge is a clear vertical grey-brown cliff about 1.5 humans "
    "tall, with wide carved stone stairs going up the cliff from the road; on top of the plateau TWO empty building lots (for a "
    "sawmill and a quarry) and patches of mossy rock ground; a thin waterfall falls from the cliff into a small round pond at its foot; "
    "the dirt road from the right edge runs along the foot of the cliff; leaf-covered forest floor along the left edge. " + LOT,
    neighbours="to the RIGHT of"))
P('GV3', 'ขวาบน: แม่น้ำ + สะพานโค้งหิน (แนบ GV2)', plate(
    "the north-east of the same village: a clear blue river enters from the top-right corner and flows down out of the bottom edge; "
    "the dirt road from the left edge crosses the river on a beautiful high-arched stone bridge with low side curbs and continues out "
    "of the right edge toward a darker forest floor of dead leaves; TWO empty building lots on the village side of the river; "
    "sandy river banks with reeds and stepping stones. " + LOT, neighbours="to the LEFT of"))
P('GV5', 'กลางล่าง: ลานตลาด (แนบ GV2)', plate(
    "the south-centre of the same village: the road from the plaza continues down and leaves through the bottom edge; a small square "
    "market area paved with worn cobblestones; TWO empty building lots (for a market and a tavern); grass verges with leaves, "
    "flowers and pebbles; a gentle grassy mound on one side. " + LOT, neighbours="ABOVE (north of)"))
P('GV4', 'ซ้ายล่าง: ทุ่งหญ้าเนินเตี้ย (แนบ GV5)', plate(
    "the south-west of the same village: rolling grass meadow with gentle low hills and a few flat rocky outcrops, wildflowers and "
    "fallen leaves; TWO empty building lots beside the road; a dirt road leaving through the left edge toward the hunting forest; a "
    "small lily pond. " + LOT, neighbours="to the RIGHT of"))
P('GV6', 'ขวาล่าง: ริมแม่น้ำ (แนบ GV5)', plate(
    "the south-east of the same village: the river from the north continues and widens, curving out through the bottom-right corner, "
    "with sandy banks, reeds, flat stones and a low wooden boardwalk along the bank; ONE large empty building lot (for an animal barn) "
    "on the grass; a small waterfall step in the river where the land drops one level, with a short low cliff beside it. " + LOT,
    neighbours="to the LEFT of"))

def osheet(n, grid, desc):
    return (f"Landscape 3:2 image (1536x1024). Pixel art game asset sheet: {n} separate objects in a {grid} grid with large empty "
            f"white gaps between them, none touching, each standing upright with its base visible: {desc} "
            "Every object at the SAME scale as the attached reference (a human is about 70 px tall), seen from the same isometric camera. "
            f"Objects only: no ground patch under them, no grass base, no cast shadow. {STYLE} {CAM} {WHITE}")

sec('objects', '② ของในฉากแยกชิ้น (ใช้กับทุกแมพ)',
    'แนบรูป concept หมู่บ้าน + ภาพพื้น GV2 (ให้ขนาดตรงกัน) • 1 รูป = หลายชิ้นบนพื้นขาว • ชิ้นพวกนี้ผมวางเองตามตำแหน่งในภาพเดิม '
    'แต่ละชิ้นรู้จุดยืนของตัวเอง เลยบังตัวละครตามรูปร่างจริง ไม่เป็นสี่เหลี่ยม')
P('OB1', 'ต้นไม้ใบไม้ร่วง 6 แบบ', osheet(6, '3x2', "a big orange autumn oak, a red maple, a golden-yellow tree, a bare dead tree with twisted branches, "
  "a dark green pine, a small young orange tree. Each tree about 4 humans tall (the small one 2), trunk base clearly visible."))
P('OB2', 'กลุ่มป่าทึบขอบแมพ 4 แบบ', osheet(4, '2x2', "dense clumps of 3-5 overlapping autumn trees (orange, red, yellow mixed) for framing the edge of the "
  "map, each clump about 3 trees wide, dark shaded undergrowth at the base."))
P('OB3', 'รั้วไม้ (ต่อกันได้)', osheet(8, '4x2', "wooden rail fence pieces: a straight segment running diagonally down-right (exactly 2 posts), "
  "a straight segment running diagonally down-left (exactly 2 posts), a corner post, an end post, a fence gate closed, a fence gate open, "
  "a broken segment down-right, a broken segment down-left. Fence height about half a human, all posts identical."))
P('OB4', 'โคมไฟ ป้าย บ่อน้ำ', osheet(6, '3x2', "a wooden lamp post with a hanging glowing lantern, a wooden direction sign post, a notice board "
  "with papers, a stone well with a small red tile roof and bucket, a red banner on a pole, a wooden bench."))
P('OB5', 'ของในหมู่บ้าน', osheet(9, '3x3', "a wooden hand cart, a stack of 3 barrels, a single barrel, a stack of crates, two grain sacks, "
  "two hay bales, a big log pile, a tree stump with an axe in it, a water trough."))
P('OB6', 'หินและหน้าผา', osheet(6, '3x2', "a big mossy grey boulder, a cluster of three rocks, a small rock, a rocky cliff chunk about 2 humans "
  "tall, a stack of cut stone blocks, a low stone wall segment."))
P('OB7', 'แผงตลาดและของลาน', osheet(6, '3x2', "a market stall with a red-white striped awning and fruit crates, a market stall with a "
  "green awning and cloth, a small flower cart, a haystack, a firewood rack, a wooden weapon rack."))
P('OB8', 'ริมน้ำ', osheet(4, '2x2', "a wooden water wheel with its frame, a small wooden fishing dock, a clump of tall reeds, a rowing boat."))

# ---------------- 2. buildings ----------------
sec('build', '③ อาคาร 3 ระดับ (ฐานพอดีแปลง ไม่มีพื้นติด)',
    'แนบ 2 รูป: รูป concept หมู่บ้าน + ภาพพื้น GV2 (ให้สีและขนาดเข้ากับแมพ) • 1 prompt = 1 อาคาร 3 ระดับในรูปเดียว • '
    'ทุกระดับฐานกว้างเท่ากันพอดีแปลงดินในแมพ อัปเกรดแล้ววางที่เดิมได้ • ไม่มีพื้นหญ้าติดมา ผมใส่เงาฐานและขอบดินให้กลืนกับแปลงเอง')
BLD = [
    ('BD1', 'ศาลากลาง', 'a village town hall with a bell tower, banners and wide front steps (built into the footprint).'),
    ('BD2', 'บ้านพัก', 'a villager cottage with a chimney, a firewood lean-to against one wall and flower boxes.'),
    ('BD3', 'โรงเลื่อย', 'a sawmill: an open-fronted timber shed with a huge circular saw bench and stacked logs inside the shed.'),
    ('BD4', 'เหมืองหิน', 'a quarry works: a stone-cutting shed with a wooden crane hoist and cut stone blocks stacked inside the footprint.'),
    ('BD6', 'คอกสัตว์', 'an animal barn with a small fenced pen attached inside the footprint, hay in the loft (no animals).'),
    ('BD7', 'โรงตีเหล็ก', 'an open-sided blacksmith workshop: anvil, glowing furnace with a smoking stone chimney, weapon rack, quench barrel.'),
    ('BD8', 'ครัว', 'a cookhouse: a timber kitchen with a big outdoor cauldron over a fire, a meat smoking rack, firewood, sacks of grain.'),
    ('BD9', 'โกดัง', 'a warehouse: a wide storehouse with stacked crates, barrels, sacks and a loading cart.'),
    ('BD10', 'โรงเตี๊ยม', 'a two-storey tavern inn with a hanging sign, warm lit windows, outdoor benches and barrels.'),
    ('BD11', 'ตลาด', 'a market: a cluster of wooden stalls with colourful striped awnings, fruit, cloth, pottery and baskets.'),
    ('BD12', 'หอป้องกัน', 'a defence watchtower with a short palisade: level 1 wooden lookout, level 3 stone tower with a ballista, level 5 tall stone tower with a glowing blue crystal on top.'),
]
for c, t, d in BLD:
    P(c, t, bsheet(d, 480 if c == 'BD1' else 420))
P('BD13', 'ไซต์ก่อสร้าง 3 ขั้น', bsheet(
    "a construction site shown as three stages instead of levels: left a staked-out foundation with lumber stacks and tools, middle a "
    "half-built timber frame with scaffolding and ladders, right an almost finished house with scaffolding and a crane."))

# ---------------- 3. hunting map ----------------
sec('hunt', '④ แมพป่าพรานไพร (ล่าสัตว์ ตัดไม้ ขุดหิน)',
    '4 ชิ้น 2×2: HT1 HT2 / HT3 HT4 • HT2 แนบ HT1, HT3 แนบ HT1, HT4 แนบ HT3 • แนบ "รูป concept ค้นหาและตามล่า" • พื้นอย่างเดียว ต้นไม้ หิน หอไม้ กระท่อม เป็นชิ้นแยก')
P('HT1', 'ซ้ายบน: แคมป์นายพราน (เริ่มชิ้นนี้)', plate(
    "a hunters' camp in a forest clearing. Large open grass area in the middle; a big stone campfire ring with a cooking pot on a "
    "tripod; two tall log watchtowers; a log palisade wall along the top; meat drying racks; thatched round huts "
    "at the left edge; a dirt path leaving through the left edge; pine and oak forest around the borders.", first=True))
P('HT2', 'ขวาบน: ป่าลึก', plate(
    "deep green forest with several open grassy glades between groups of big pine and oak trees, tree stumps, a small stream with "
    "stepping stones, ferns and mushrooms.", neighbours="to the LEFT of"))
P('HT3', 'ซ้ายล่าง: เนินหินและปากถ้ำ', plate(
    "rocky hills: a grey cliff face with a dark cave entrance and a rope ladder, a wide open area of rocky gravel ground (left empty for "
    "boulders the game will place), a few pine trees, a dirt path.", neighbours="ABOVE (north of)"))
P('HT4', 'ขวาล่าง: ทุ่งหญ้า + บ่อน้ำ', plate(
    "an open meadow with tall grass patches, berry bushes, a deer trail, a small pond with reeds, wildflowers, scattered trees at "
    "the edges.", neighbours="to the LEFT of"))

# ---------------- 4-6. regions ----------------
REG = [
    ('haunt', '⑤ แมพป่าผีสิง (Lv20)', 'HF', 'แนบภาพ concept ป่าผีสิงที่เคยส่งมา', [
        ('ซ้ายบน: ทางเข้า + สุสาน (เริ่มชิ้นนี้)', "the entrance of a haunted autumn forest at dusk: a broken iron gate on a dirt path coming in from the left edge, a small "
         "graveyard with crooked tombstones, dead black trees, low purple fog, glowing mushrooms, scattered bones."),
        ('ขวาบน: บึงหมอก', "a misty swamp of the haunted forest: dark murky pools, twisted dead trees, rotten wooden walkways, "
         "lantern posts with green ghost flames, open muddy ground."),
        ('ซ้ายล่าง: โบสถ์ร้าง', "a ruined stone chapel of the haunted forest with collapsed walls and a broken bell tower, overgrown "
         "with roots, cracked flagstone yard, candles, open ground around it."),
        ('ขวาล่าง: ลานบอส', "the boss arena of the haunted forest: a large round clearing ringed by tall mossy standing stones with "
         "faint glowing runes, a huge dead tree at the back, eerie green light, wide open flat ground in the middle."),
    ]),
    ('lava', '⑥ แมพดินแดนลาวา (Lv50)', 'LV', 'แนบ "รูป concept หลอมอาวุธมหากาพย์"', [
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
    ('snow', '⑦ แมพภูเขาหิมะ (Lv60)', 'SN', 'แนบภาพ concept ภูเขาหิมะที่เคยส่งมา', [
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
    sec(sid, title, f'4 ชิ้น 2×2: {pre}1 {pre}2 / {pre}3 {pre}4 • {note} • {pre}2 แนบ {pre}1, {pre}3 แนบ {pre}1, {pre}4 แนบ {pre}3 (เป็นรูปที่ 2)')
    sides = [None, "to the LEFT of", "ABOVE (north of)", "to the LEFT of"]
    for i, (t, d) in enumerate(items):
        P(f'{pre}{i+1}', t, plate(d, first=(i == 0), neighbours=sides[i] or ''))

# ---------------- 7. dungeon ----------------
sec('dung', '⑧ คุกใต้ดิน (Lv80) — ห้องแยกกัน',
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
sec('inside', '⑨ ภายในอาคาร (ทำทีหลังได้)', 'แนบ "รูป concept รับสมัครฮีโร่" • ใช้ตอนเดินเข้าอาคาร')
P('IN1', 'ภายในโรงเตี๊ยม', room("a cosy tavern hall instead of a dungeon (cut-away view, two walls shown): a long bar counter with bottle "
  "shelves, a long feast table on a red rug, small round tables with stools, a stone fireplace, tall arched windows showing snow outside, "
  "barrels, candles, a door at the bottom-left.").replace("ONE complete dungeon room", "ONE complete room"))
P('IN2', 'ภายในโรงตีเหล็ก', room("a blacksmith workshop interior instead of a dungeon (cut-away view, two walls shown): a big anvil, a "
  "roaring furnace, weapon and armour racks, a grinding wheel, coal sacks, tool wall, a door at the bottom-left.").replace("ONE complete dungeon room", "ONE complete room"))

# ---------------- 9. atmosphere ----------------
sec('fx', '⑩ ของขยับได้ + บรรยากาศ', 'แนบรูป concept หมู่บ้าน • ของพวกนี้ทำให้แมพมีชีวิต')
P('FX1', 'กองไฟ + หม้อต้ม (6 เฟรม)', anim("a stone campfire ring with a cooking pot hanging on a wooden tripod", "Burning fire loop", 6,
  "Flames flicker, steam rises from the pot, sparks drift up. Same pot and stones in every frame."))
P('FX2', 'ควันปล่องไฟ (6 เฟรม)', anim("a soft grey chimney smoke puff column", "Rising smoke loop", 6,
  "Puffs grow and drift up and fade at the top. No chimney, smoke only."))
P('FX3', 'คบไฟผนัง + กระถางไฟ (4 เฟรม)', anim("a wall torch on the left and a standing iron fire brazier on the right", "Flame flicker loop", 4,
  "Two objects per frame, flames flicker."))
P('FX4', 'กังหันน้ำ (4 เฟรม)', anim("a wooden water wheel with a small wooden frame", "Turning loop", 4,
  "The wheel turns a quarter step each frame, water splashes off the paddles."))
P('FX5', 'ไอคอนลอยเหนืออาคาร', "Pixel art UI icon sheet, 6 separate icons in a 3x2 grid with large white gaps: round map-pin speech bubbles "
  "with a green ring, each holding one item: a wooden log, a raw steak, a roast chicken leg, a grey stone, a gold coin, a hammer. "
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
sec('chars', '⑪ ตัวละครที่ยังขาด', 'แนบรูปร่างเดิมของตัวนั้นไปด้วย • CH1 แทงค์ร่าง 2: ทำรูปหลักก่อน แล้วแนบรูปหลักไปกับท่าที่เหลือ')
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
sec('mdie', '⑫ ท่าตายมอนสเตอร์', 'แนบรูปมอนตัวนั้น (ท่าเดิน) ไปด้วย • ตอนนี้ในเกมใช้จางหายแทนอยู่')
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

# ---------------- batches: one copy, then type "ต่อ" ----------------
def batch(codes, ref_note):
    items = {c: (t, pr) for _, _, _, its in S for c, t, pr in its}
    head = ("I am making a mobile game. The image I attached is the STYLE REFERENCE for every image in this chat. "
            f"{ref_note} Below is a list of images. Make them ONE AT A TIME, in order: make image #1 now, then stop and wait. "
            "Every time I type ต่อ make the next image on the list. Never skip one, never merge two into one picture. "
            "When an image says it continues an earlier image, look at that earlier image you made in this chat and follow it exactly. "
            "Keep the same scale, camera and style for all of them.\n\n")
    body = []
    for i, c in enumerate(codes):
        t, pr = items[c]
        pr = pr.replace("The second attached image is the map piece directly", f"The image {{nb}} you made earlier in this chat is the map piece directly")
        body.append(f"#{i + 1} ({c}): {pr}")
    return head + "\n\n".join(body)

NB = {'GV1': 'GV2', 'GV3': 'GV2', 'GV5': 'GV2', 'GV4': 'GV5', 'GV6': 'GV5'}
def fill_nb(text, codes):
    out = []
    for part in text.split('\n\n'):
        for c, n in NB.items():
            if part.startswith(f'#') and f'({c}):' in part.split(':')[0] + ':': part = part.replace('{nb}', n)
        out.append(part)
    return '\n\n'.join(out)

S.insert(0, ('batch', '⓪ ชุดก๊อปรวดเดียว (ง่ายสุด)',
    'ก๊อป 1 ครั้ง วางใน ChatGPT แชทใหม่ พร้อมแนบรูป concept 1 รูป → ได้รูปแรก → พิมพ์ "ต่อ" ไปเรื่อยๆ จนครบ • '
    'ไม่ต้องแนบรูปอื่น ไม่ต้องบอกรหัส • ครบชุดแล้วส่งรูปทั้งหมดให้ผมทีเดียว • 1 ชุด = 1 แชทใหม่ของ ChatGPT', []))
VCODES = ['GV2', 'GV1', 'GV3', 'GV5', 'GV4', 'GV6']
OCODES = ['OB1', 'OB2', 'OB3', 'OB4', 'OB5', 'OB6', 'OB7', 'OB8']
BCODES = ['BD1', 'BD2', 'BD3', 'BD4', 'BD6', 'BD7', 'BD8', 'BD9', 'BD10', 'BD11', 'BD12', 'BD13']
MINI = ['GV2', 'GV1', 'GV3', 'OB1', 'OB3', 'OB4', 'BD2']
S[0][3].append(('ชุดเล็ก', 'เริ่มตรงนี้: 7 รูปพอเล่นได้ (แมพแถวบน + ต้นไม้ + รั้ว + โคม + บ้าน)',
    fill_nb(batch(MINI, 'Images #1-#3 are pieces of ONE big village map; #4-#7 are separate objects and a building on white backgrounds '
                  '("the attached map image" / "attached reference" means image #1 you made).'), MINI)))
S[0][3].append(('ชุด A', 'แมพหมู่บ้าน 6 รูป (แนบ concept "สร้างหมู่บ้านของคุณ")',
    fill_nb(batch(VCODES, 'The images are pieces of ONE big village map that will be joined together.'), VCODES)))
S[0][3].append(('ชุด B', 'ของแยกชิ้น 8 รูป (แนบ concept หมู่บ้าน)',
    batch(OCODES, 'These are separate game objects on white backgrounds. "The attached map image" means the style reference.').replace('the SAME scale as the attached reference', 'the SAME scale as the style reference')))
S[0][3].append(('ชุด C', 'อาคาร 12 รูป (แนบ concept หมู่บ้าน)',
    batch(BCODES, 'These are game buildings on white backgrounds. "The attached map image" means the style reference.')))

# ---------------- output ----------------
HOWTO = ('วิธีใช้: กดคัดลอก → วางใน GPT พร้อมแนบรูปที่บอกไว้ในหมวด • ทุกแมพออกแบบใหม่ ไม่ใช้ภาพเก่า • แมพ = พื้นอย่างเดียว ของสูงกว่าเข่าเป็นชิ้นแยก • '
         'ส่งภาพกลับพร้อมบอกรหัส (เช่น "GV2", "OB1") • ลำดับ: ① → ② ก่อน')

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
