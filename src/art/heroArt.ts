// Procedural chibi hero sprite with swappable armor & weapon looks.
// Frame: 40x40, feet at y≈36. Directions: down, up, side (right; left = flipX).
import { PixelCanvas, shadeDark, shadeLight, lighten, darken, type Color } from './pixel';

export const HERO_FRAME = 40;
export type Dir = 'down' | 'up' | 'side';

export interface Pose {
  bob: number;        // body vertical offset
  legA: number;       // left/back leg offset (-2..2)
  legB: number;       // right/front leg offset
  armA: number;       // off-hand swing
  weaponAngle: number | null; // degrees, 0=right, 90=down
  handDX?: number; handDY?: number;
  cast?: boolean;
  hurt?: boolean;
}

interface ArmorLook { scarf?: Color; body: Color; trim: Color; pants: Color; boots: Color; cape?: Color; helm?: 'band' | 'helm' | 'crown'; band: Color; shoulder?: Color }

const ARMORS: ArmorLook[] = [
  { scarf: 0x3f9a4a, body: 0x3e6db5, trim: 0x8a5a32, pants: 0x3b3550, boots: 0x6a4126, helm: 'band', band: 0xc23b3b },
  { scarf: 0xb8402a, body: 0x9a6534, trim: 0x5e3a1c, pants: 0x4a3a2c, boots: 0x4a2c18, helm: 'band', band: 0x3f8f4a, shoulder: 0x6e4422 },
  { body: 0xa9b4c4, trim: 0x2f4f9a, pants: 0x30364a, boots: 0x3a3f52, helm: 'helm', band: 0x8a96aa, shoulder: 0xc8d0dc },
  { body: 0xe0b040, trim: 0xb02a2a, pants: 0x5a2228, boots: 0x7a5a20, cape: 0xb52a30, helm: 'crown', band: 0xf5d050, shoulder: 0xf2cc58 },
];
const NAKED: ArmorLook = { scarf: 0x3f9a4a, body: 0xe8dcc0, trim: 0x8a7a60, pants: 0x4a4038, boots: 0x6a4126, helm: 'band', band: 0xc23b3b };

const SKIN = 0xf4c7a0;
const HAIR = 0x6b3a22;
const EYE = 0x2a1a38;
const IRIS = 0x3a78c8;

interface WeaponLook { blade: Color; hilt: Color; guard: Color; len: number; staff?: boolean; glow?: Color }
const WEAPONS: WeaponLook[] = [
  { blade: 0xb08850, hilt: 0x6a4126, guard: 0x8a6030, len: 10 },
  { blade: 0xc8d2e0, hilt: 0x5a3a24, guard: 0x8a8a9a, len: 12 },
  { blade: 0xe8f0ff, hilt: 0x2f4f9a, guard: 0xe0c050, len: 13 },
  { blade: 0xff9a3a, hilt: 0x4a1a1a, guard: 0xf2cc58, len: 14, glow: 0xffe070 },
  { blade: 0x8a5a2a, hilt: 0x6a4126, guard: 0x4fd0ff, len: 15, staff: true, glow: 0x9fe8ff },
];

function drawWeapon(p: PixelCanvas, hx: number, hy: number, angleDeg: number, wl: WeaponLook) {
  const a = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(a), dy = Math.sin(a);
  if (wl.staff) {
    // shaft extends both ways from hand
    p.thickLine(hx - dx * 4, hy - dy * 4, hx + dx * wl.len, hy + dy * wl.len, wl.blade, 2);
    const ox = hx + dx * (wl.len + 1), oy = hy + dy * (wl.len + 1);
    p.ellipse(ox, oy, 2.5, 2.5, wl.guard);
    p.set(ox - 1, oy - 1, 0xffffff);
    return;
  }
  // hilt behind hand
  p.line(hx - dx * 3, hy - dy * 3, hx, hy, wl.hilt);
  // guard (perpendicular)
  const gx = -dy, gy = dx;
  p.line(hx + dx - gx * 2.5, hy + dy - gy * 2.5, hx + dx + gx * 2.5, hy + dy + gy * 2.5, wl.guard);
  // blade: 2px with highlight edge
  const sx = hx + dx * 2, sy = hy + dy * 2;
  const ex = hx + dx * wl.len, ey = hy + dy * wl.len;
  p.thickLine(sx, sy, ex, ey, wl.blade, 2);
  p.line(sx + gx * 0.5, sy + gy * 0.5, ex - dx, ey - dy, shadeLight(wl.blade, 0.6));
  if (wl.glow) { p.set(ex, ey, wl.glow); p.set(ex - dx * 4, ey - dy * 4, wl.glow); }
}

function drawHeadDown(p: PixelCanvas, cx: number, cy: number, al: ArmorLook, hurt: boolean) {
  // face
  p.shadedEllipse(cx, cy + 1, 6.5, 6, SKIN, false);
  // hair mass
  p.shadedEllipse(cx, cy - 2, 7.5, 5.2, HAIR);
  for (const [i, j] of [[-4, -5], [-3, -6], [-1, -6], [0, -7], [2, -6], [3, -5]]) p.set(cx + i, cy + j, shadeLight(HAIR, i < 0 ? 0.5 : 0.3));
  // side locks
  p.rect(cx - 7, cy - 1, 2, 5, HAIR); p.rect(cx + 5, cy - 1, 2, 5, darken(HAIR, 0.15));
  // bangs (jagged)
  for (let i = -5; i <= 4; i++) {
    const len = [2, 3, 2, 1, 3, 2, 1, 3, 2, 2][i + 5];
    p.rect(cx + i, cy - 1, 1, len, i % 2 ? HAIR : shadeLight(HAIR, 0.12));
  }
  if (hurt) {
    p.rect(cx - 4, cy + 2, 2, 1, EYE); p.rect(cx + 2, cy + 2, 2, 1, EYE);
  } else {
    // big chibi eyes
    for (const ex of [cx - 4, cx + 2]) {
      p.rect(ex, cy + 1, 2, 3, EYE);
      p.set(ex, cy + 3, IRIS); p.set(ex + 1, cy + 3, lighten(IRIS, 0.3));
      p.set(ex, cy + 1, 0xffffff);
    }
  }
  p.set(cx - 5, cy + 4, 0xf09a90); p.set(cx + 4, cy + 4, 0xf09a90);
  p.set(cx, cy + 5, 0xb86a5a);
  drawHeadgear(p, cx, cy, al, 'down');
}

function drawHeadUp(p: PixelCanvas, cx: number, cy: number, al: ArmorLook) {
  p.shadedEllipse(cx, cy, 7.5, 7, HAIR);
  for (let i = -5; i <= 5; i += 2) p.set(cx + i, cy + 6, darken(HAIR, 0.3));
  p.set(cx - 2, cy - 3, shadeLight(HAIR, 0.4)); p.set(cx - 1, cy - 4, shadeLight(HAIR, 0.4));
  drawHeadgear(p, cx, cy, al, 'up');
}

function drawHeadSide(p: PixelCanvas, cx: number, cy: number, al: ArmorLook, hurt: boolean) {
  p.shadedEllipse(cx + 1, cy + 1, 6.2, 6, SKIN, false);
  p.shadedEllipse(cx - 1, cy - 1.5, 7, 5.6, HAIR);
  p.rect(cx - 7, cy, 4, 5, HAIR); // back hair
  for (const [i, j] of [[-3, -5], [-2, -6], [0, -6], [1, -5]]) p.set(cx + i, cy + j, shadeLight(HAIR, 0.45));
  p.set(cx - 7, cy + 5, darken(HAIR, 0.2));
  // bangs front
  p.rect(cx + 3, cy - 1, 3, 2, HAIR); p.set(cx + 6, cy - 1, HAIR);
  // ear
  p.set(cx - 1, cy + 2, darken(SKIN, 0.15)); p.set(cx - 1, cy + 3, darken(SKIN, 0.15));
  if (hurt) p.rect(cx + 3, cy + 2, 2, 1, EYE);
  else {
    p.rect(cx + 3, cy + 1, 2, 3, EYE);
    p.set(cx + 4, cy + 3, IRIS); p.set(cx + 3, cy + 1, 0xffffff);
  }
  p.set(cx + 3, cy + 4, 0xf09a90);
  p.set(cx + 6, cy + 5, 0xb86a5a);
  drawHeadgear(p, cx, cy, al, 'side');
}

function drawHeadgear(p: PixelCanvas, cx: number, cy: number, al: ArmorLook, dir: Dir) {
  if (al.helm === 'band') {
    if (dir === 'side') {
      p.rect(cx - 6, cy - 2, 11, 2, al.band); p.rect(cx - 6, cy - 2, 11, 1, shadeLight(al.band, 0.3));
      p.rect(cx - 9, cy - 1, 3, 1, al.band); p.rect(cx - 10, cy, 2, 1, darken(al.band, 0.2));
    } else {
      p.rect(cx - 7, cy - 2, 15, 2, al.band); p.rect(cx - 7, cy - 2, 15, 1, shadeLight(al.band, 0.3));
      if (dir === 'up') { p.rect(cx - 1, cy, 1, 4, al.band); p.rect(cx + 1, cy, 1, 5, darken(al.band, 0.2)); }
    }
  } else if (al.helm === 'helm') {
    const w = dir === 'side' ? 7 : 7.8;
    p.shadedEllipse(dir === 'side' ? cx - 1 : cx, cy - 3, w, 4.5, al.band);
    p.rect(cx - 7, cy - 1, 15, 1, darken(al.band, 0.3));
    p.rect(cx - 1, cy - 8, 2, 2, 0x2f4f9a); // crest
    p.rect(cx - 2, cy - 10, 3, 2, 0x4a6fc0);
  } else if (al.helm === 'crown') {
    p.rect(cx - 6, cy - 3, 13, 2, al.band);
    p.rect(cx - 6, cy - 3, 13, 1, shadeLight(al.band, 0.5));
    for (const i of [-5, -1, 3]) { p.set(cx + i + 1, cy - 4, al.band); p.set(cx + i + 1, cy - 5, shadeLight(al.band, 0.4)); }
    if (dir !== 'up') p.set(cx, cy - 2, 0xd02040);
  }
}

function drawLegs(p: PixelCanvas, x: number, y: number, off: number, al: ArmorLook) {
  const lift = Math.max(0, -off);
  const h = 6 - lift;
  p.rect(x, y + off * 0, 3, h - 2, al.pants);
  p.rect(x, y + h - 2, 3, 2, al.boots);
  p.set(x, y + h - 2, shadeLight(al.boots, 0.3));
}

/** Draw one hero frame. */
export function drawHero(dir: Dir, pose: Pose, armorLook: number, weaponLook: number): PixelCanvas {
  const p = new PixelCanvas(HERO_FRAME, HERO_FRAME);
  const al = armorLook >= 0 ? ARMORS[Math.min(armorLook, 3)] : NAKED;
  const wl = WEAPONS[Math.max(0, Math.min(weaponLook, 4))];
  const ox = 4, oy = 6; // origin offset (sprite is 32x32 within 40x40)
  const b = pose.bob;
  const cx = 16 + ox;

  if (dir === 'down') {
    // cape behind
    if (al.cape) { p.rect(cx - 6, oy + 17 + b, 12, 10, darken(al.cape, 0.25)); }
    // legs
    drawLegsFront(p, cx - 4, oy + 24, pose.legA, al);
    drawLegsFront(p, cx + 1, oy + 24, pose.legB, al);
    // torso
    p.shadedRect(cx - 5, oy + 17 + b, 10, 8, al.body);
    p.rect(cx - 1, oy + 17 + b, 2, 5, al.trim); // tabard stripe / lacing
    p.rect(cx - 5, oy + 22 + b, 10, 1, darken(al.trim, 0.2)); // belt
    p.set(cx, oy + 22 + b, 0xf2cc58);
    p.rect(cx + 2, oy + 22 + b, 3, 3, 0x7a4a2a); p.set(cx + 2, oy + 22 + b, 0x9a6a3a);
    if (al.shoulder) { p.shadedEllipse(cx - 6, oy + 18 + b, 2.5, 2, al.shoulder); p.shadedEllipse(cx + 5, oy + 18 + b, 2.5, 2, al.shoulder); }
    if (al.scarf) { p.rect(cx - 5, oy + 16 + b, 10, 2, al.scarf); p.rect(cx - 4, oy + 16 + b, 8, 1, shadeLight(al.scarf, 0.3)); p.rect(cx + 2, oy + 18 + b, 2, 3, shadeDark(al.scarf, 0.25)); }
    // arms
    p.rect(cx - 7, oy + 18 + b + pose.armA, 2, 5, al.body);
    p.rect(cx - 7, oy + 23 + b + pose.armA, 2, 2, SKIN);
    const hx = cx + 6 + (pose.handDX ?? 0), hy = oy + 23 + b + (pose.handDY ?? 0);
    p.line(cx + 5, oy + 18 + b, hx, hy - 1, al.body); p.line(cx + 6, oy + 18 + b, hx + 1, hy - 1, al.body);
    drawHeadDown(p, cx, oy + 10 + b, al, !!pose.hurt);
    if (pose.weaponAngle !== null) drawWeapon(p, hx, hy, pose.weaponAngle, wl);
    p.rect(hx - 1, hy - 1, 2, 2, SKIN);
    if (pose.cast) castGlow(p, cx - 6, oy + 23 + b + pose.armA);
  } else if (dir === 'up') {
    const hx = cx - 6 + (pose.handDX ?? 0), hy = oy + 22 + b + (pose.handDY ?? 0);
    if (pose.weaponAngle !== null) drawWeapon(p, hx, hy, pose.weaponAngle, wl);
    drawLegsFront(p, cx - 4, oy + 24, pose.legA, al);
    drawLegsFront(p, cx + 1, oy + 24, pose.legB, al);
    p.shadedRect(cx - 5, oy + 17 + b, 10, 8, al.body);
    p.rect(cx - 5, oy + 22 + b, 10, 1, darken(al.trim, 0.2));
    if (al.shoulder) { p.shadedEllipse(cx - 6, oy + 18 + b, 2.5, 2, al.shoulder); p.shadedEllipse(cx + 5, oy + 18 + b, 2.5, 2, al.shoulder); }
    if (al.scarf) { p.rect(cx - 5, oy + 16 + b, 10, 2, al.scarf); p.rect(cx - 2, oy + 18 + b, 3, 5 + Math.abs(pose.legA), shadeDark(al.scarf, 0.15)); p.set(cx - 2, oy + 23 + b, shadeDark(al.scarf, 0.4)); }
    p.rect(cx + 5, oy + 18 + b + pose.armA, 2, 5, al.body);
    p.rect(cx + 5, oy + 23 + b + pose.armA, 2, 2, SKIN);
    p.line(cx - 5, oy + 18 + b, hx, hy - 1, al.body);
    p.rect(hx - 1, hy - 1, 2, 2, SKIN);
    if (al.cape) {
      p.rect(cx - 6, oy + 17 + b, 12, 11, al.cape);
      p.rect(cx - 6, oy + 17 + b, 12, 1, shadeLight(al.cape, 0.3));
      for (let i = -5; i < 6; i += 3) p.rect(cx + i, oy + 19 + b, 1, 8, shadeDark(al.cape, 0.3));
    }
    drawHeadUp(p, cx, oy + 10 + b, al);
    if (pose.cast) castGlow(p, cx + 6, oy + 23 + b + pose.armA);
  } else {
    // side (facing right)
    if (al.cape) {
      p.rect(cx - 6, oy + 17 + b, 4, 10, al.cape);
      p.rect(cx - 7, oy + 22 + b, 2, 5, darken(al.cape, 0.2));
    }
    // back arm
    p.rect(cx - 3 + pose.armA, oy + 18 + b, 2, 5, darken(al.body, 0.25));
    // legs (back then front)
    drawLegsSide(p, cx - 3 + pose.legA, oy + 24, darken(al.pants, 0.2), darken(al.boots, 0.2));
    drawLegsSide(p, cx + pose.legB, oy + 24, al.pants, al.boots);
    p.shadedRect(cx - 4, oy + 17 + b, 8, 8, al.body);
    p.rect(cx - 4, oy + 22 + b, 8, 1, darken(al.trim, 0.2));
    p.rect(cx + 1, oy + 17 + b, 2, 5, al.trim);
    if (al.shoulder) p.shadedEllipse(cx, oy + 18 + b, 3, 2, al.shoulder);
    if (al.scarf) {
      p.rect(cx - 4, oy + 16 + b, 8, 2, al.scarf); p.rect(cx - 3, oy + 16 + b, 6, 1, shadeLight(al.scarf, 0.3));
      const fl = Math.abs(pose.legA) > 0 ? 1 : 0;
      p.rect(cx - 8, oy + 17 + b - fl, 4, 2, shadeDark(al.scarf, 0.15)); p.rect(cx - 10, oy + 18 + b - fl * 2, 2, 1, shadeDark(al.scarf, 0.3));
    }
    p.rect(cx - 3, oy + 22 + b, 3, 3, 0x7a4a2a);
    drawHeadSide(p, cx, oy + 10 + b, al, !!pose.hurt);
    const hx = cx + 3 + (pose.handDX ?? 0), hy = oy + 22 + b + (pose.handDY ?? 0);
    p.thickLine(cx, oy + 19 + b, hx, hy, al.body, 2);
    if (pose.weaponAngle !== null) drawWeapon(p, hx, hy, pose.weaponAngle, wl);
    p.rect(hx - 1, hy - 1, 2, 2, SKIN);
    if (pose.cast) castGlow(p, hx, hy - 2);
  }
  p.outline(0x140c1c);
  if (pose.hurt) p.map(c => lerpC(c, 0xff5050, 0.3));
  return p;
}

function lerpC(a: Color, b: Color, t: number): Color {
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * t);
  const g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * t);
  const bl = (a & 255) + (((b & 255) - (a & 255)) * t);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

function castGlow(p: PixelCanvas, x: number, y: number) {
  p.ellipse(x, y, 2, 2, 0x9fe8ff);
  p.set(x, y, 0xffffff);
  p.set(x - 3, y - 2, 0xcff6ff); p.set(x + 3, y - 3, 0xcff6ff);
}

function drawLegsFront(p: PixelCanvas, x: number, y: number, off: number, al: ArmorLook) {
  drawLegs(p, x, y, off, al);
}

function drawLegsSide(p: PixelCanvas, x: number, y: number, pants: Color, boots: Color) {
  p.rect(x, y, 3, 4, pants);
  p.rect(x, y + 4, 4, 2, boots);
  p.set(x, y + 4, shadeLight(boots, 0.3));
}

// ---- Animation definitions ----
export interface AnimDef { name: string; frames: Pose[]; rate: number; repeat: number }

const idle = (b: number, aw = -55): Pose => ({ bob: b, legA: 0, legB: 0, armA: 0, weaponAngle: aw });

export function heroAnims(dir: Dir): AnimDef[] {
  const restAngle = dir === 'down' ? -60 : dir === 'up' ? -120 : -50;
  const walk: Pose[] = [
    { bob: 0, legA: -1, legB: 1, armA: 1, weaponAngle: restAngle },
    { bob: -1, legA: 0, legB: 0, armA: 0, weaponAngle: restAngle - 4 },
    { bob: 0, legA: 1, legB: -1, armA: -1, weaponAngle: restAngle },
    { bob: -1, legA: 0, legB: 0, armA: 0, weaponAngle: restAngle - 4 },
  ];
  if (dir === 'side') {
    walk[0].legA = -2; walk[0].legB = 2; walk[2].legA = 2; walk[2].legB = -2;
  }
  let atk: Pose[];
  if (dir === 'down') atk = [
    { bob: 0, legA: 0, legB: 0, armA: 0, weaponAngle: -150, handDX: -2, handDY: -6 },
    { bob: 1, legA: -1, legB: 1, armA: 1, weaponAngle: -20, handDX: 1, handDY: -2 },
    { bob: 1, legA: -1, legB: 1, armA: 1, weaponAngle: 60, handDX: 0, handDY: 1 },
    { bob: 0, legA: 0, legB: 0, armA: 0, weaponAngle: 110, handDX: -2, handDY: 1 },
  ];
  else if (dir === 'up') atk = [
    { bob: 0, legA: 0, legB: 0, armA: 0, weaponAngle: 150, handDX: 0, handDY: 0 },
    { bob: 0, legA: -1, legB: 1, armA: 1, weaponAngle: -150, handDX: 2, handDY: -4 },
    { bob: -1, legA: -1, legB: 1, armA: 1, weaponAngle: -90, handDX: 5, handDY: -6 },
    { bob: 0, legA: 0, legB: 0, armA: 0, weaponAngle: -30, handDX: 8, handDY: -3 },
  ];
  else atk = [
    { bob: 0, legA: -1, legB: 1, armA: -1, weaponAngle: -130, handDX: -3, handDY: -6 },
    { bob: 0, legA: -2, legB: 2, armA: 0, weaponAngle: -50, handDX: 2, handDY: -3 },
    { bob: 1, legA: -2, legB: 3, armA: 1, weaponAngle: 15, handDX: 4, handDY: 0 },
    { bob: 1, legA: -1, legB: 2, armA: 1, weaponAngle: 60, handDX: 3, handDY: 1 },
  ];
  const cast: Pose[] = [
    { bob: 0, legA: 0, legB: 0, armA: -3, weaponAngle: -90, handDX: 0, handDY: -6, cast: true },
    { bob: -1, legA: 0, legB: 0, armA: -4, weaponAngle: -90, handDX: 0, handDY: -7, cast: true },
  ];
  const hurt: Pose[] = [{ bob: 1, legA: 0, legB: 0, armA: -1, weaponAngle: restAngle + 20, hurt: true }];
  return [
    { name: 'idle', frames: [idle(0, restAngle), idle(1, restAngle)], rate: 3, repeat: -1 },
    { name: 'walk', frames: walk, rate: 9, repeat: -1 },
    { name: 'attack', frames: atk, rate: 18, repeat: 0 },
    { name: 'cast', frames: cast, rate: 6, repeat: 0 },
    { name: 'hurt', frames: hurt, rate: 8, repeat: 0 },
  ];
}
