"""Guild art, take 2 — flat 2D like the rest of the village (the first batch came out slanted / isometric and was thrown away).
Each piece starts from a rough code-drawn sketch in the game's projection (straight front face + the top seen from above,
never a corner toward the viewer) passed as init_image at a low strength (60): the angle is locked by the sketch, the detail
and style come from the generator ('high top-down', house_1 as the colour reference). Strength 300+ copies the sketch flat.
python3 -I tools/gen_guild_art2.py [key ...]   -> art-source/pixellab/guild/<key>.png (+ _sketch/<key>.png), then tools/import_guild_art.py
"""
import io, os, sys, base64, concurrent.futures as cf
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pixellab_api as P
from gen_buildings import CI
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'art-source', 'pixellab', 'guild'); os.makedirs(os.path.join(OUT, '_sketch'), exist_ok=True)
STRENGTH = int(os.environ.get('STR', 60))   # 60 = sketch angle + generator detail; raise it a little for pieces that drift
W, WD, WL, RED, CLOTH, STONE, STONE_D, IRON, GOLD, FIRE, GLASS = (112, 78, 52), (70, 46, 30), (140, 104, 70), (128, 52, 48), (200, 184, 170), (110, 110, 116), (74, 74, 80), (52, 52, 58), (200, 170, 80), (230, 130, 50), (150, 190, 200)

def canvas(S): im = Image.new('RGBA', (S, S)); return im, ImageDraw.Draw(im)
def box(d, x0, x1, top, mid, bot, ct, cf):   # top face (seen from above) then the front face, both straight
    d.rectangle([x0, top, x1, mid], fill=ct); d.rectangle([x0, mid, x1, bot], fill=cf)
def legs(d, xs, y0, y1, c=WD, w=2):
    for x in xs: d.rectangle([x - w, y0, x + w, y1], fill=c)

def sk_archer(S):
    im, d = canvas(S); legs(d, (42, 86), 60, 122, WD, 3); d.line([45, 70, 84, 110], fill=WD, width=3); d.line([84, 70, 45, 110], fill=WD, width=3)
    d.rectangle([32, 48, 96, 62], fill=W); d.rectangle([36, 30, 92, 48], fill=(60, 44, 32)); d.rectangle([56, 34, 72, 44], fill=(20, 16, 14))
    d.polygon([(28, 32), (64, 8), (100, 32)], fill=RED); return im
def sk_cannon(S):
    im, d = canvas(S); box(d, 26, 70, 46, 58, 76, WL, W)
    for cx in (22, 74): d.ellipse([cx - 12, 52, cx + 12, 84], fill=WD); d.ellipse([cx - 4, 64, cx + 4, 72], fill=IRON)
    d.ellipse([34, 22, 62, 50], fill=IRON); d.ellipse([42, 30, 54, 42], fill=(10, 10, 12)); return im
def sk_ballista(S):
    im, d = canvas(S); box(d, 28, 68, 58, 66, 84, STONE, STONE_D); d.rectangle([44, 36, 52, 60], fill=W)
    d.line([12, 34, 48, 40, 84, 34], fill=WD, width=4); d.line([12, 34, 48, 46, 84, 34], fill=(200, 200, 190), width=1)
    d.polygon([(44, 40), (52, 40), (48, 26)], fill=IRON); return im
def sk_bunker(S):
    im, d = canvas(S); box(d, 16, 96, 38, 54, 92, (130, 128, 132), STONE_D); d.rectangle([48, 64, 64, 92], fill=(16, 14, 14))
    for x in (28, 78): d.rectangle([x - 6, 66, x + 6, 70], fill=(16, 14, 14)); return im
def sk_palisade(S):
    im, d = canvas(S)
    for x in range(14, 84, 10): d.rectangle([x, 24, x + 8, 82], fill=W if (x // 10) % 2 else WL); d.polygon([(x, 24), (x + 8, 24), (x + 4, 14)], fill=WL)
    d.rectangle([12, 40, 84, 43], fill=(150, 130, 90)); d.rectangle([12, 66, 84, 69], fill=(150, 130, 90)); return im
def sk_spikes(S):
    im, d = canvas(S)
    for x in range(14, 82, 16): d.line([x, 76, x + 14, 40], fill=W, width=4); d.line([x + 14, 76, x, 40], fill=WL, width=4)
    d.rectangle([10, 66, 86, 70], fill=WD); d.ellipse([18, 56, 40, 74], fill=(60, 74, 44)); d.ellipse([56, 58, 80, 76], fill=(60, 74, 44)); return im
def sk_banner(S):
    im, d = canvas(S); d.rectangle([30, 6, 33, 60], fill=WD); d.rectangle([20, 8, 44, 12], fill=WD)
    d.polygon([(22, 12), (42, 12), (42, 40), (32, 46), (22, 40)], fill=RED); d.ellipse([28, 20, 36, 28], fill=GOLD); return im
def sk_throne(S):
    im, d = canvas(S); d.rectangle([18, 4, 46, 40], fill=WD); d.rectangle([23, 10, 41, 36], fill=RED); d.polygon([(18, 4), (32, 0), (46, 4)], fill=GOLD)
    box(d, 14, 50, 38, 46, 56, RED, W); legs(d, (16, 48), 56, 62); return im
def sk_wartable(S):
    im, d = canvas(S); box(d, 10, 102, 36, 70, 80, WL, W); d.rectangle([22, 42, 90, 64], fill=(206, 186, 140))
    for x, y in ((40, 50), (60, 54), (76, 48)): d.ellipse([x - 3, y - 3, x + 3, y + 3], fill=RED)
    legs(d, (14, 98), 80, 96, WD, 3); return im
def sk_donation(S):
    im, d = canvas(S); box(d, 8, 48, 16, 26, 50, (90, 90, 96), IRON); d.rectangle([24, 19, 32, 22], fill=(10, 10, 10))
    for x in (12, 44): d.rectangle([x - 1, 16, x + 1, 50], fill=GOLD); d.rectangle([24, 32, 32, 40], fill=GOLD); return im
def sk_board(S):
    im, d = canvas(S); legs(d, (14, 58), 20, 68, WD, 2); d.rectangle([10, 10, 62, 48], fill=W)
    for x, y in ((16, 16), (34, 14), (46, 26), (20, 32)): d.rectangle([x, y, x + 12, y + 12], fill=(222, 210, 180)); return im
def sk_shelf(S):
    im, d = canvas(S); d.rectangle([12, 6, 60, 68], fill=WD)
    for y in (22, 40, 58): d.rectangle([14, y, 58, y + 3], fill=WL)
    for i, (x, y) in enumerate(((18, 12), (28, 14), (40, 12), (50, 14), (20, 30), (34, 32), (46, 30), (24, 48), (40, 50))): d.rectangle([x, y, x + 6, y + 8], fill=(RED, GLASS, (90, 140, 80), GOLD)[i % 4])
    return im
def sk_fireplace(S):
    im, d = canvas(S); box(d, 10, 70, 8, 14, 72, (140, 136, 136), STONE); d.rectangle([24, 34, 56, 72], fill=(20, 16, 14))
    d.ellipse([30, 50, 50, 70], fill=FIRE); d.ellipse([36, 56, 44, 68], fill=(255, 210, 120)); return im
def sk_vault(S):
    im, d = canvas(S); d.rectangle([8, 8, 88, 88], fill=STONE); d.ellipse([18, 18, 78, 78], fill=STONE_D); d.ellipse([24, 24, 72, 72], fill=IRON)
    d.ellipse([42, 42, 54, 54], fill=GOLD); d.line([30, 48, 66, 48], fill=(90, 90, 96), width=3); return im
def sk_desk(S):
    im, d = canvas(S); box(d, 8, 56, 22, 34, 50, WL, W); d.rectangle([24, 38, 40, 44], fill=WD); legs(d, (10, 54), 50, 58)
    d.rectangle([14, 24, 28, 32], fill=(150, 40, 40)); d.rectangle([42, 18, 45, 28], fill=(230, 220, 180)); return im
def sk_goods(S):
    im, d = canvas(S); d.rectangle([8, 8, 72, 74], fill=WD)
    for y in (26, 46, 66): d.rectangle([10, y, 70, y + 3], fill=WL)
    for i, x in enumerate(range(12, 66, 11)):
        for j, y in enumerate((12, 32, 52)): d.rectangle([x, y + 2, x + 8, y + 13], fill=((140, 90, 140), (90, 120, 160), GOLD, (160, 120, 80))[(i + j) % 4])
    return im
def sk_sacks(S):
    im, d = canvas(S)
    for x, y in ((10, 26), (28, 26), (19, 10)): d.ellipse([x, y, x + 20, y + 24], fill=(190, 170, 130)); d.rectangle([x + 7, y - 2, x + 13, y + 3], fill=(150, 130, 90))
    return im
def sk_weaponrack(S):
    im, d = canvas(S); d.rectangle([10, 16, 70, 20], fill=W); d.rectangle([10, 60, 70, 66], fill=W); legs(d, (12, 68), 16, 72, WD, 2)
    for x in (22, 34, 46, 58): d.rectangle([x, 4, x + 2, 64], fill=(170, 170, 176)); d.polygon([(x - 2, 6), (x + 4, 6), (x + 1, 0)], fill=(200, 200, 205))
    return im
def sk_dummy(S):
    im, d = canvas(S); d.rectangle([26, 14, 30, 54], fill=WD); d.ellipse([18, 18, 38, 42], fill=(200, 176, 100)); d.ellipse([21, 4, 35, 18], fill=(200, 176, 100))
    d.rectangle([10, 24, 46, 28], fill=WD); d.ellipse([22, 26, 34, 36], fill=RED); return im
def sk_armor(S):
    im, d = canvas(S); d.rectangle([26, 40, 30, 54], fill=WD); d.rectangle([16, 50, 40, 54], fill=WD)
    d.ellipse([20, 2, 36, 18], fill=(150, 150, 158)); d.rectangle([16, 18, 40, 40], fill=(130, 130, 138)); d.rectangle([12, 18, 16, 32], fill=(110, 110, 118)); d.rectangle([40, 18, 44, 32], fill=(110, 110, 118)); return im
def sk_bunk(S):
    im, d = canvas(S); x0, x1 = 20, 60; legs(d, (x0, x1), 6, 76, WD, 2); d.rectangle([x0 - 2, 8, x1 + 2, 16], fill=W)
    d.rectangle([x0, 16, x1, 64], fill=(120, 124, 130)); d.rectangle([x0 + 4, 18, x1 - 4, 26], fill=CLOTH); d.rectangle([x0 - 2, 64, x1 + 2, 70], fill=W); return im
def sk_table(S):
    im, d = canvas(S); box(d, 8, 56, 18, 34, 42, WL, W); legs(d, (12, 52), 42, 50)
    d.rectangle([10, 8, 54, 13], fill=WD); d.rectangle([10, 50, 54, 56], fill=WD); return im
def sk_furnace(S):
    im, d = canvas(S); d.rectangle([40, 2, 56, 30], fill=STONE_D); box(d, 14, 82, 26, 36, 88, (140, 136, 136), STONE)
    d.rectangle([34, 52, 62, 80], fill=(30, 18, 12)); d.ellipse([38, 58, 58, 80], fill=FIRE); d.ellipse([44, 64, 52, 76], fill=(255, 220, 130)); return im
def sk_anvil(S):
    im, d = canvas(S); box(d, 14, 42, 30, 36, 52, WL, W); d.rectangle([12, 18, 44, 24], fill=IRON); d.rectangle([20, 24, 36, 30], fill=IRON)
    d.polygon([(44, 18), (52, 20), (44, 24)], fill=IRON); d.rectangle([30, 10, 33, 18], fill=WD); d.rectangle([26, 8, 38, 12], fill=(90, 90, 96)); return im
def sk_cauldron(S):
    im, d = canvas(S); d.ellipse([20, 46, 44, 60], fill=FIRE); d.ellipse([10, 16, 54, 52], fill=IRON); d.ellipse([12, 16, 52, 28], fill=(90, 120, 70))
    legs(d, (16, 48), 46, 58, IRON, 2); return im
def sk_bar(S):
    im, d = canvas(S); d.rectangle([8, 6, 120, 44], fill=WD)
    for x in range(14, 116, 20): d.ellipse([x, 12, x + 16, 30], fill=W); d.ellipse([x + 5, 18, x + 11, 24], fill=WD)
    box(d, 6, 122, 60, 70, 104, WL, W); d.rectangle([20, 52, 28, 60], fill=GOLD); d.rectangle([90, 52, 98, 60], fill=GOLD); return im
def sk_bed(S):
    im, d = canvas(S); x0, x1 = 20, 60; d.rectangle([x0 - 2, 8, x1 + 2, 22], fill=WD); d.rectangle([x0, 20, x1, 66], fill=RED); d.rectangle([x0 + 4, 22, x1 - 4, 32], fill=CLOTH)
    d.rectangle([x0 - 2, 64, x1 + 2, 72], fill=W); legs(d, (x0, x1), 72, 76); return im
def sk_chest(S):
    im, d = canvas(S); box(d, 10, 46, 14, 26, 48, WL, W)
    for x in (16, 40): d.rectangle([x - 1, 14, x + 1, 48], fill=IRON)
    d.rectangle([26, 30, 30, 36], fill=GOLD); return im
def sk_trophy(S):
    im, d = canvas(S); d.rectangle([12, 6, 68, 74], fill=WD); d.rectangle([16, 10, 64, 70], fill=GLASS); d.rectangle([16, 38, 64, 41], fill=WL)
    d.polygon([(26, 34), (30, 18), (34, 34)], fill=GOLD); d.ellipse([44, 22, 54, 34], fill=(150, 100, 200)); d.rectangle([24, 52, 36, 66], fill=(170, 170, 180)); d.ellipse([44, 54, 56, 66], fill=RED); return im
def sk_wardrobe(S):
    im, d = canvas(S); d.rectangle([14, 2, 58, 8], fill=WL); d.rectangle([14, 8, 58, 70], fill=W); d.line([36, 10, 36, 68], fill=WD, width=2)
    for x in (32, 40): d.rectangle([x - 1, 36, x + 1, 42], fill=GOLD)
    legs(d, (16, 56), 70, 72); return im
def sk_rug(S):
    im, d = canvas(S); d.rectangle([4, 14, 60, 50], fill=RED); d.rectangle([9, 19, 55, 45], outline=GOLD, width=2); d.rectangle([24, 26, 40, 38], fill=(160, 90, 60)); return im

FLAT = ('seen from the front and slightly above like a classic 2D top-down RPG, front side facing the viewer, symmetrical, upright, '
        'not rotated, not isometric, no ground around it, pixel art, muted desaturated dark-forest colours, soft shading')
# ---- village decoration (the guild village plaza, lanes and yards) ----
WATER, LEAF, PETAL, HAY, DIRT = (70, 120, 130), (64, 96, 52), ((190, 80, 90), (220, 190, 90), (150, 110, 190)), (196, 168, 90), (92, 70, 48)
def sk_fountain(S):
    im, d = canvas(S); d.ellipse([10, 56, 118, 96], fill=(140, 138, 140)); d.ellipse([16, 58, 112, 88], fill=WATER); d.rectangle([10, 76, 118, 104], fill=STONE)
    d.ellipse([10, 96, 118, 112], fill=STONE_D); d.rectangle([56, 30, 72, 76], fill=STONE); d.ellipse([42, 22, 86, 38], fill=(140, 138, 140)); d.ellipse([48, 24, 80, 34], fill=WATER)
    d.line([64, 10, 64, 26], fill=(170, 210, 220), width=3); return im
def sk_statue(S):
    im, d = canvas(S); box(d, 26, 70, 62, 70, 90, (140, 138, 140), STONE)
    d.ellipse([40, 10, 56, 26], fill=(150, 150, 156)); d.rectangle([38, 26, 58, 54], fill=(130, 130, 138)); d.rectangle([40, 54, 46, 64], fill=(120, 120, 128)); d.rectangle([50, 54, 56, 64], fill=(120, 120, 128))
    d.rectangle([60, 8, 63, 50], fill=(190, 190, 196)); d.rectangle([56, 40, 67, 43], fill=GOLD); return im
def sk_bench(S):
    im, d = canvas(S); d.rectangle([8, 14, 56, 26], fill=W); box(d, 8, 56, 26, 36, 42, WL, W); legs(d, (12, 52), 42, 52); return im
def sk_planter(S):
    im, d = canvas(S); box(d, 8, 40, 22, 28, 44, DIRT, W)
    for i, (x, y) in enumerate(((12, 14), (20, 10), (28, 14), (34, 18), (16, 20), (26, 20))): d.ellipse([x - 4, y - 4, x + 4, y + 4], fill=LEAF if i % 2 else PETAL[i % 3])
    return im
def sk_flowerbed(S):
    im, d = canvas(S); box(d, 4, 60, 18, 46, 54, DIRT, STONE)
    for i in range(12): x, y = 10 + (i % 6) * 9, 22 + (i // 6) * 12; d.ellipse([x - 4, y - 4, x + 4, y + 4], fill=PETAL[i % 3] if i % 2 == 0 else LEAF)
    return im
def sk_brazier(S):
    im, d = canvas(S); d.line([14, 44, 24, 26], fill=IRON, width=3); d.line([34, 44, 24, 26], fill=IRON, width=3); d.line([24, 46, 24, 26], fill=IRON, width=3)
    d.ellipse([10, 18, 38, 30], fill=IRON); d.ellipse([14, 4, 34, 24], fill=FIRE); d.ellipse([19, 10, 29, 22], fill=(255, 220, 130)); return im
def sk_trough(S):
    im, d = canvas(S); box(d, 6, 58, 24, 34, 48, WATER, W); d.rectangle([6, 22, 58, 25], fill=WL); legs(d, (10, 54), 48, 54); return im
def sk_haycart(S):
    im, d = canvas(S); d.ellipse([16, 14, 64, 50], fill=HAY); box(d, 14, 66, 44, 50, 64, WL, W)
    for cx in (12, 68): d.ellipse([cx - 9, 46, cx + 9, 74], fill=WD); d.ellipse([cx - 3, 57, cx + 3, 63], fill=IRON)
    return im
def sk_woodpile(S):
    im, d = canvas(S); d.rectangle([6, 52, 58, 56], fill=WD)
    for row, n in enumerate((5, 4, 3)):
        for i in range(n): x = 10 + row * 5 + i * 10; y = 42 - row * 10; d.ellipse([x, y, x + 10, y + 10], fill=(170, 130, 86)); d.ellipse([x + 3, y + 3, x + 7, y + 7], fill=(120, 86, 56))
    return im
def sk_target(S):
    im, d = canvas(S); legs(d, (18, 38), 26, 52, WD, 2); d.ellipse([10, 6, 46, 42], fill=HAY); d.ellipse([16, 12, 40, 36], fill=RED); d.ellipse([22, 18, 34, 30], fill=(230, 220, 200)); d.ellipse([26, 22, 30, 26], fill=RED); return im
def sk_beehive(S):
    im, d = canvas(S); box(d, 6, 42, 32, 36, 44, WL, W); legs(d, (8, 40), 44, 46)
    for x in (8, 24): d.ellipse([x, 12, x + 16, 34], fill=HAY); d.rectangle([x + 6, 28, x + 10, 32], fill=(30, 20, 10))
    return im
def sk_veggies(S):
    im, d = canvas(S); d.rectangle([4, 14, 76, 66], fill=DIRT); d.rectangle([4, 62, 76, 70], fill=W)
    for r in range(3):
        for i in range(6): x, y = 10 + i * 11, 20 + r * 15; d.ellipse([x, y, x + 9, y + 9], fill=LEAF if r != 1 else (110, 140, 60)); d.ellipse([x + 3, y + 6, x + 6, y + 10], fill=(220, 120, 40) if r == 2 else LEAF)
    return im
def sk_signpost(S):
    im, d = canvas(S); d.rectangle([22, 6, 26, 46], fill=WD); d.polygon([(8, 10), (36, 10), (42, 15), (36, 20), (8, 20)], fill=W); d.polygon([(40, 24), (12, 24), (6, 29), (12, 34), (40, 34)], fill=WL); return im
def sk_shrine(S):
    im, d = canvas(S); box(d, 14, 50, 44, 50, 60, (140, 138, 140), STONE); d.rectangle([18, 14, 46, 44], fill=STONE); d.rectangle([24, 22, 40, 44], fill=(30, 26, 30))
    d.polygon([(12, 16), (32, 2), (52, 16)], fill=STONE_D); d.rectangle([30, 34, 33, 42], fill=(230, 220, 190)); d.ellipse([29, 29, 34, 34], fill=FIRE); return im
def sk_crates(S):
    im, d = canvas(S); box(d, 4, 30, 28, 34, 58, WL, W); box(d, 32, 60, 28, 34, 58, WL, W); box(d, 18, 46, 6, 12, 30, WL, W)
    for x0, y0 in ((4, 34), (32, 34), (18, 12)): d.line([x0, y0, x0 + 26, y0 + 22], fill=WD, width=2)
    return im
def sk_doghouse(S):
    im, d = canvas(S); box(d, 10, 46, 26, 28, 50, W, W); d.polygon([(6, 28), (28, 8), (50, 28)], fill=RED); d.ellipse([20, 32, 36, 52], fill=(20, 14, 10)); d.rectangle([20, 42, 36, 50], fill=(20, 14, 10)); return im
def sk_clothesline(S):
    im, d = canvas(S); legs(d, (8, 72), 10, 60, WD, 2); d.line([8, 14, 72, 14], fill=(200, 190, 170), width=1)
    for i, (x, c) in enumerate(((14, (170, 160, 140)), (30, (120, 70, 70)), (46, (90, 110, 150)), (60, (180, 170, 120)))): d.rectangle([x, 15, x + 11, 32 + (i % 2) * 6], fill=c)
    return im

def sk_fountain2(S):   # round stone basin seen from the front and above: rim, water inside, brick front, a pedestal with a small bowl
    im, d = canvas(S); RIM, RIM_D = (150, 146, 140), (96, 94, 92)
    d.ellipse([8, 54, 120, 98], fill=RIM); d.ellipse([16, 60, 112, 92], fill=(58, 104, 116)); d.ellipse([24, 66, 104, 88], fill=(70, 122, 132))
    d.rectangle([8, 76, 120, 106], fill=RIM_D); d.ellipse([8, 96, 120, 116], fill=RIM_D); d.ellipse([8, 54, 120, 98], outline=RIM, width=6)
    for y in (84, 96):
        for x in range(14, 118, 14): d.line([x + (y // 12 % 2) * 7, y, x + (y // 12 % 2) * 7, y + 10], fill=(70, 68, 68))
    d.line([10, 90, 118, 90], fill=(70, 68, 68))
    d.rectangle([56, 34, 72, 76], fill=RIM); d.rectangle([60, 34, 64, 76], fill=(170, 166, 160))
    d.ellipse([40, 26, 88, 40], fill=RIM); d.ellipse([46, 28, 82, 37], fill=(70, 122, 132)); d.ellipse([58, 12, 70, 28], fill=RIM)
    return im

JOBS = [   # key, description, size, sketch
    ('def_archer', 'a wooden archer watchtower on log legs with a roofed lookout cabin', 128, sk_archer),
    ('def_cannon', 'a black iron cannon on a wooden carriage with two big wheels, the muzzle pointing at the viewer', 96, sk_cannon),
    ('def_ballista', 'a big wooden ballista crossbow on a stone base, the bolt pointing at the viewer', 96, sk_ballista),
    ('def_bunker', 'a low squat stone bunker with a dark doorway and arrow slits', 112, sk_bunker),
    ('def_palisade', 'a wall section of sharpened upright logs bound with rope', 96, sk_palisade),
    ('def_spikes', 'a low barricade of crossed sharpened wooden stakes with thorny brambles', 96, sk_spikes),
    ('def_banner', 'a wooden pole with a hanging dark red guild war banner with a golden crest', 64, sk_banner),
    ('fu_throne', 'a carved dark wooden throne chair with a red cushion and gold trim', 64, sk_throne),
    ('fu_wartable', 'a long wooden war table with a parchment map and small figurines', 112, sk_wartable),
    ('fu_donation', 'a heavy iron-bound donation chest with a coin slot and gold bands', 56, sk_donation),
    ('fu_board', 'a wooden quest notice board on two posts with pinned papers', 72, sk_board),
    ('fu_shelf', 'a tall wooden shelf with potion bottles, jars and books', 72, sk_shelf),
    ('fu_fireplace', 'a stone fireplace with a burning fire', 80, sk_fireplace),
    ('fu_vault', 'a heavy round iron vault door set in a stone wall', 96, sk_vault),
    ('fu_desk', 'a small wooden writing desk with a ledger book and a quill', 64, sk_desk),
    ('fu_goods', 'a wooden market shelf full of cloth bolts, jars and goods', 80, sk_goods),
    ('fu_sacks', 'a pile of three grain sacks', 56, sk_sacks),
    ('fu_weaponrack', 'a wooden weapon rack holding spears', 80, sk_weaponrack),
    ('fu_dummy', 'a straw training dummy on a wooden post with a red target', 56, sk_dummy),
    ('fu_bunk', 'a simple wooden soldier bed with a grey blanket, headboard at the top', 80, sk_bunk),
    ('fu_table', 'a wooden table with two benches', 64, sk_table),
    ('fu_furnace', 'a glowing stone smelting furnace with a chimney', 96, sk_furnace),
    ('fu_anvil', 'an iron anvil on a tree stump with a hammer', 56, sk_anvil),
    ('fu_cauldron', 'a big black iron cauldron of green stew over a fire', 64, sk_cauldron),
    ('fu_bar', 'a long wooden tavern bar counter with ale barrels on the wall behind it', 128, sk_bar),
    ('fu_bed', 'a single wooden bed with a dark red quilt and a white pillow, headboard at the top', 80, sk_bed),
    ('fu_chest', 'a wooden storage chest with iron bands and a gold lock', 56, sk_chest),
    ('fu_trophy', 'a glass trophy display cabinet with a golden sword, a gem and a helmet inside', 80, sk_trophy),
    ('fu_wardrobe', 'a tall wooden wardrobe with two doors', 72, sk_wardrobe),
    ('fu_rug', 'a rectangular dark red rug with a gold border, flat on the floor', 64, sk_rug),
    ('dc_fountain2', 'a round grey stone village fountain: a wide basin full of clear blue water with a thick stone rim, a stone pedestal in the middle with a small upper bowl, mossy cracks, old and calm', 128, sk_fountain2),
    ('dc_fountain', 'a round stone fountain with clear water and a small upper basin spouting water', 128, sk_fountain),
    ('dc_statue', 'a stone statue of a knight holding a sword on a stone pedestal', 96, sk_statue),
    ('dc_bench', 'a wooden park bench with a backrest', 64, sk_bench),
    ('dc_planter', 'a wooden planter box with colourful flowers', 48, sk_planter),
    ('dc_flowerbed', 'a flower bed with a low stone border and red, yellow and purple flowers', 64, sk_flowerbed),
    ('dc_brazier', 'an iron fire brazier on three legs with burning flames', 48, sk_brazier),
    ('dc_trough', 'a wooden water trough on short legs', 64, sk_trough),
    ('dc_haycart', 'a wooden farm cart loaded with hay, two big wheels', 80, sk_haycart),
    ('dc_woodpile', 'a neat pile of firewood logs, log ends facing the viewer', 64, sk_woodpile),
    ('dc_target', 'a straw archery target on a wooden stand', 56, sk_target),
    ('dc_beehive', 'two straw beehives on a wooden stand', 48, sk_beehive),
    ('dc_veggies', 'a small vegetable garden patch with rows of cabbages and carrots, flat on the ground', 80, sk_veggies),
    ('dc_signpost', 'a wooden signpost with two direction arrows', 48, sk_signpost),
    ('dc_shrine', 'a small stone roadside shrine with a candle', 64, sk_shrine),
    ('dc_crates', 'a stack of three wooden crates', 64, sk_crates),
    ('dc_doghouse', 'a small wooden dog kennel with a red roof', 56, sk_doghouse),
    ('dc_clothesline', 'a clothesline between two wooden posts with hanging laundry', 80, sk_clothesline),
]


def enc(im): b = io.BytesIO(); im.save(b, 'PNG'); return {'type': 'base64', 'base64': base64.b64encode(b.getvalue()).decode()}

def one(key, desc, size, sketch):
    out = os.path.join(OUT, key + '.png')
    if os.path.exists(out): return key, 'exists'
    sk = sketch(size); sk.save(os.path.join(OUT, '_sketch', key + '.png'))
    try: P.map_object(f'{desc}, {FLAT}', size, size, out, 'high top-down', color_image=CI, init_image=enc(sk), init_image_strength=STRENGTH)
    except Exception as e: return key, f'err {e}'
    return key, 'ok'


if __name__ == '__main__':
    only = set(sys.argv[1:])
    jobs = [j for j in JOBS if not only or j[0] in only]
    b0 = P.call('GET', '/balance')['credits']['usd']
    with cf.ThreadPoolExecutor(3) as ex:
        for r in ex.map(lambda j: one(*j), jobs): print(*r, flush=True)
    b1 = P.call('GET', '/balance')['credits']['usd']
    print(f'BALANCE ${b0:.3f} -> ${b1:.3f} (used ${b0 - b1:.3f})', flush=True)
