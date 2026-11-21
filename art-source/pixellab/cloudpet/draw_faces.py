# the cloud pet's big face + crown drawn by hand on our symmetrical cloud (director: the face must be clear and big)
from PIL import Image
import os
D = os.path.dirname(os.path.abspath(__file__))
base = Image.open(os.path.join(D, 'cloud_base.png')).convert('RGBA')
OUT = (16, 10, 22, 255); GOLD = (255, 204, 64, 255); GOLD2 = (214, 150, 30, 255); GEM = (220, 40, 60, 255); WHITE = (250, 244, 255, 255)
def put(im, pts, col):
    for x, y in pts: im.putpixel((x, y), col)
def mirror(pts): return pts + [(63 - x, y) for x, y in pts]
def crown(im):   # 16x9 gold crown, three points, a red gem, outlined — sits on the top center
    rows = ['O..O...OO...O..O', 'OGOO..OGGO..OOGO', 'OGGO.OGGGGO.OGGO', 'OGGGOGGGGGGOGGGO', 'OGGGGGGRRGGGGGGO', 'OGGGGGGRRGGGGGGO', 'OYYYYYYYYYYYYYYO', 'OOOOOOOOOOOOOOOO']
    cm = {'O': OUT, 'G': GOLD, 'Y': GOLD2, 'R': GEM}
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch in cm: im.putpixel((24 + x, 9 + y), cm[ch])
def thick(im, pts, col):   # 2px-thick strokes (readable when the pet is small on screen)
    for x, y in pts:
        for dx, dy in ((0, 0), (0, 1)): im.putpixel((x + dx, y + dy), col)
def face_g(im):   # big proud closed eyes (arcs), a wide smug grin, pink blush — fills the front of the cloud
    arc = [(16, 33), (17, 31), (18, 30), (19, 29), (20, 29), (21, 29), (22, 29), (23, 30), (24, 31), (25, 33)]
    thick(im, mirror(arc), WHITE)
    grin = [(22, 39), (23, 40), (24, 41), (25, 42), (26, 42), (27, 43), (28, 43), (29, 43), (30, 43), (31, 43)]
    thick(im, mirror(grin), WHITE)
    for x in range(26, 38):
        for y in (44,): im.putpixel((x, y), (120, 40, 70, 255))   # a dark lip line under the grin
    for x, y in mirror([(x, y) for x in range(13, 18) for y in (37, 38, 39)]): im.putpixel((x, y), (255, 120, 170, 255))
def face_h(im):   # big round glowing amber eyes with pupils and a white shine, a wide happy open smile
    for cx in (21, 42):
        for dy in range(-5, 6):
            for dx in range(-5, 6):
                d = dx * dx + dy * dy
                if d <= 26: im.putpixel((cx + dx, 32 + dy), OUT if d > 18 else (255, 170, 30, 255) if d > 6 else (255, 224, 110, 255))
        for dx, dy in ((0, 0), (1, 0), (0, 1), (1, 1)): im.putpixel((cx + dx, 33 + dy), (60, 20, 10, 255))   # pupil
        for dx, dy in ((-2, -2), (-1, -2), (-2, -1)): im.putpixel((cx + dx, 32 + dy), WHITE)                # shine
    mouth = [(x, 40) for x in range(25, 32)] + [(x, 41) for x in range(25, 32)] + [(x, 42) for x in range(26, 32)] + [(x, 43) for x in range(28, 32)]
    put(im, mirror(mouth), OUT)
    put(im, mirror([(x, 41) for x in range(27, 32)] + [(x, 42) for x in range(28, 32)]), (210, 60, 90, 255))
    for x, y in mirror([(x, y) for x in range(11, 15) for y in (38, 39)]): im.putpixel((x, y), (255, 120, 170, 255))
for name, face in (('cloud_g2', face_g), ('cloud_h2', face_h)):
    im = base.copy(); face(im); crown(im); im.save(os.path.join(D, name + '.png'))
print('ok')
