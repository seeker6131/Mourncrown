"""Helpers to turn AI-generated sheets (white background) into game-ready pixel sprites."""
from collections import deque
from PIL import Image
import numpy as np


def remove_white_bg(im: Image.Image, thr: int = 236, sat: int = 28, holes: int = 0) -> Image.Image:
    """Flood-fill near-white pixels connected to the image border -> transparent."""
    a = np.asarray(im.convert('RGB')).astype(np.int16)
    h, w, _ = a.shape
    mn = a.min(axis=2); mx = a.max(axis=2)
    bgish = (mn >= thr) & ((mx - mn) <= sat)
    mask = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if bgish[y, x]: q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if bgish[y, x]: q.append((y, x))
    while q:
        y, x = q.popleft()
        if mask[y, x]: continue
        mask[y, x] = True
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not mask[ny, nx] and bgish[ny, nx]:
                q.append((ny, nx))
    if holes:
        # also clear enclosed white pockets larger than `holes` pixels (e.g. gaps between limbs)
        seen = mask.copy()
        ys, xs = np.nonzero(bgish & ~mask)
        for y0, x0 in zip(ys, xs):
            if seen[y0, x0]: continue
            region = []; q = deque([(y0, x0)]); seen[y0, x0] = True
            while q:
                y, x = q.popleft(); region.append((y, x))
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and not seen[ny, nx] and bgish[ny, nx]:
                        seen[ny, nx] = True; q.append((ny, nx))
            if len(region) >= holes:
                for y, x in region: mask[y, x] = True
    rgba = np.dstack([a.astype(np.uint8), np.where(mask, 0, 255).astype(np.uint8)])
    return Image.fromarray(rgba, 'RGBA')


def components(img: Image.Image, gap: int = 20, min_area: int = 400):
    """Bounding boxes of opaque blobs; blobs closer than `gap` px are merged."""
    al = np.asarray(img)[:, :, 3] > 0
    h, w = al.shape
    # downsample for speed
    s = 4
    small = al[::s, ::s]
    sh, sw = small.shape
    lab = np.zeros((sh, sw), np.int32)
    boxes = []
    n = 0
    for y in range(sh):
        for x in range(sw):
            if small[y, x] and not lab[y, x]:
                n += 1
                q = deque([(y, x)]); lab[y, x] = n
                x0 = x1 = x; y0 = y1 = y; cnt = 0
                while q:
                    cy, cx = q.popleft(); cnt += 1
                    x0 = min(x0, cx); x1 = max(x1, cx); y0 = min(y0, cy); y1 = max(y1, cy)
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < sh and 0 <= nx < sw and small[ny, nx] and not lab[ny, nx]:
                            lab[ny, nx] = n; q.append((ny, nx))
                boxes.append([x0 * s, y0 * s, (x1 + 1) * s, (y1 + 1) * s, cnt * s * s])
    # merge close boxes
    changed = True
    while changed:
        changed = False
        for i in range(len(boxes)):
            for j in range(i + 1, len(boxes)):
                a, b = boxes[i], boxes[j]
                if a[0] - gap <= b[2] and b[0] - gap <= a[2] and a[1] - gap <= b[3] and b[1] - gap <= a[3]:
                    boxes[i] = [min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3]), a[4] + b[4]]
                    boxes.pop(j); changed = True; break
            if changed: break
    boxes = [b for b in boxes if b[4] >= min_area]
    return boxes


def order_rows(boxes, row_tol: int = 80):
    boxes = sorted(boxes, key=lambda b: (b[1] + b[3]) / 2)
    rows = []
    for b in boxes:
        cy = (b[1] + b[3]) / 2
        if rows and abs(((rows[-1][0][1] + rows[-1][0][3]) / 2) - cy) < row_tol:
            rows[-1].append(b)
        else:
            rows.append([b])
    out = []
    for r in rows:
        out.extend(sorted(r, key=lambda b: b[0]))
    return out


def to_game(img: Image.Image, width: int = 0, height: int = 0, crisp: bool = True) -> Image.Image:
    """Trim, downscale to target size and harden alpha."""
    img = img.crop(img.getbbox())
    w, h = img.size
    if width and not height: height = round(h * width / w)
    if height and not width: width = round(w * height / h)
    # premultiplied downscale to avoid white fringes
    arr = np.asarray(img).astype(np.float32)
    al = arr[:, :, 3:4] / 255.0
    pre = np.concatenate([arr[:, :, :3] * al, arr[:, :, 3:4]], axis=2)
    small = Image.fromarray(pre.astype(np.uint8), 'RGBA').resize((width, height), Image.BOX)
    sa = np.asarray(small).astype(np.float32)
    alpha = sa[:, :, 3:4]
    rgb = np.where(alpha > 0, sa[:, :, :3] * 255.0 / np.maximum(alpha, 1), 0)
    hard = np.where(alpha > 110, 255, 0)
    out = np.concatenate([np.clip(rgb, 0, 255), hard], axis=2).astype(np.uint8)
    res = Image.fromarray(out, 'RGBA')
    if crisp:
        # slight sharpening of colours via palette reduction keeps a pixel-art look
        rgbq = res.convert('RGB').quantize(160, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB')
        res = Image.merge('RGBA', (*rgbq.split(), res.split()[3]))
    return res


def outline(img: Image.Image, color=(24, 14, 20, 255)) -> Image.Image:
    a = np.asarray(img).copy()
    al = a[:, :, 3] > 0
    pad = np.pad(al, 1)
    nb = pad[:-2, 1:-1] | pad[2:, 1:-1] | pad[1:-1, :-2] | pad[1:-1, 2:]
    edge = nb & ~al
    a[edge] = color
    return Image.fromarray(a, 'RGBA')
