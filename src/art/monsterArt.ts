// Procedural monster sprites. All face RIGHT; flipX in-game for left.
import { PixelCanvas, shadeDark, shadeLight, lighten, darken, type Color } from './pixel';
import type { MonsterKind } from '../data/monsters';

export interface MonsterSheet { w: number; h: number; anims: Record<string, { frames: PixelCanvas[]; rate: number; repeat: number }> }

const OUT = 0x140c1c;

// ---------- Slime ----------
function slime(sq: number, lift: number, mouth = false, col: Color = 0x5ed05a): PixelCanvas {
  const p = new PixelCanvas(28, 26);
  const rx = 9 + sq, ry = 7 - sq;
  const cy = 22 - ry - lift;
  p.shadedEllipse(14, cy, rx, ry, col);
  // flat bottom
  p.rect(14 - rx + 2, cy + ry - 1, rx * 2 - 4, 1, shadeDark(col, 0.45));
  // inner core
  p.ellipse(12, cy + 1, 2.5, 2, lighten(col, 0.25));
  p.set(11, cy, 0xffffff);
  // shine
  p.rect(9, cy - ry + 2, 3, 1, 0xeaffea); p.set(8, cy - ry + 3, 0xeaffea);
  // eyes
  p.rect(16, cy - 2, 2, 3, OUT); p.rect(20, cy - 2, 2, 3, OUT);
  p.set(16, cy - 2, 0xffffff); p.set(20, cy - 2, 0xffffff);
  if (mouth) { p.rect(17, cy + 2, 4, 2, 0x5a1a2a); p.set(18, cy + 2, 0xff8aa0); }
  else p.rect(18, cy + 2, 2, 1, darken(col, 0.5));
  p.outline(OUT);
  return p;
}

// ---------- Shroom ----------
function shroom(bob: number, lf: number, rf: number, tilt: number, angry = false): PixelCanvas {
  const p = new PixelCanvas(28, 30);
  const cap = 0xd8443c, stem = 0xf2e2c4;
  // feet
  p.rect(9 + lf, 25, 4, 3, 0xc8a878); p.rect(15 + rf, 25, 4, 3, 0xb8986a);
  // stem body
  p.shadedEllipse(14, 20 + bob, 6, 6, stem, false);
  // face
  p.rect(14, 18 + bob, 2, 3, OUT); p.rect(18, 18 + bob, 2, 3, OUT);
  p.set(14, 18 + bob, 0xffffff); p.set(18, 18 + bob, 0xffffff);
  if (angry) { p.line(13, 16 + bob, 15, 17 + bob, OUT); p.line(19, 17 + bob, 21, 16 + bob, OUT); }
  p.rect(16, 22 + bob, 2, 1, 0x8a3a3a);
  p.set(12, 21 + bob, 0xf0a0a0);
  // arms
  p.rect(7, 19 + bob, 2, 4, stem); p.rect(20, 19 + bob, 2, 4, darken(stem, 0.1));
  // cap
  const cx = 14 + tilt, cy = 11 + bob;
  p.shadedEllipse(cx, cy, 11, 7, cap);
  p.rect(cx - 10, cy + 3, 21, 2, shadeDark(cap, 0.45));
  // spots
  for (const [sx, sy, r] of [[-5, -3, 2], [2, -4, 1.6], [6, 0, 1.5], [-1, 0, 1.2], [-8, 1, 1]] as const) p.ellipse(cx + sx, cy + sy, r, r * 0.8, 0xfff4e0);
  p.outline(OUT);
  return p;
}

// ---------- Wolf ----------
function wolf(phase: number, lunge = 0, open = false, crouch = 0): PixelCanvas {
  const p = new PixelCanvas(40, 30);
  const fur = 0x5c5a7e, belly = 0x9a96b8, dark = 0x3a3858;
  const by = 17 + crouch;
  const L = (x: number, ph: number, col: Color) => {
    const off = Math.round(Math.sin(phase * Math.PI / 2 + ph) * 2);
    p.rect(x + off, by + 3, 3, 7 - crouch, col);
    p.rect(x + off - 1 + 1, by + 9 - crouch, 4, 1, darken(col, 0.3));
  };
  L(10, Math.PI, dark); L(23 + lunge, 0, dark);
  // tail
  p.thickLine(8, by - 1, 2, by - 5 + Math.round(Math.sin(phase) * 1), fur, 3);
  p.set(2, by - 6, belly);
  // body
  p.shadedEllipse(17 + lunge / 2, by, 11, 6, fur);
  p.rect(10, by + 3, 14, 2, belly);
  // mane
  p.shadedEllipse(25 + lunge, by - 3, 5, 6, darken(fur, 0.1));
  // head
  const hx = 30 + lunge, hy = by - 6;
  p.shadedEllipse(hx, hy, 5, 4.5, fur);
  // snout
  p.rect(hx + 3, hy, 5, 3, fur); p.rect(hx + 3, hy + 2, 5, 1, belly);
  p.rect(hx + 7, hy, 1, 1, OUT);
  if (open) { p.rect(hx + 3, hy + 3, 5, 2, 0x6a1a2a); p.set(hx + 4, hy + 3, 0xffffff); p.set(hx + 6, hy + 3, 0xffffff); }
  // ears
  p.rect(hx - 3, hy - 7, 2, 4, dark); p.rect(hx, hy - 7, 2, 4, fur); p.set(hx + 0, hy - 5, 0xd08aa0);
  // eye (glow)
  p.rect(hx + 1, hy - 1, 2, 1, 0xffd040); p.set(hx + 2, hy - 1, 0xffffff);
  L(13, 0, fur); L(26 + lunge, Math.PI, fur);
  p.outline(OUT);
  return p;
}

// ---------- Goblin ----------
function goblin(phase: number, draw = 0, bob = 0): PixelCanvas {
  const p = new PixelCanvas(32, 32);
  const skin = 0x7fb04a, tunic = 0x7a4a2a, dark = 0x4a2c18;
  const lo = Math.round(Math.sin(phase * Math.PI / 2) * 2);
  // legs
  p.rect(12 - lo, 24, 3, 5, darken(skin, 0.2)); p.rect(17 + lo, 24, 3, 5, skin);
  p.rect(11 - lo, 28, 4, 2, dark); p.rect(17 + lo, 28, 4, 2, dark);
  // body
  p.shadedRect(11, 17 + bob, 10, 8, tunic);
  p.rect(11, 22 + bob, 10, 1, dark);
  p.rect(13, 23 + bob, 6, 3, darken(tunic, 0.2));
  // quiver
  p.rect(9, 14 + bob, 3, 8, 0x5a3a20); p.set(9, 13 + bob, 0xd0d0d0); p.set(11, 12 + bob, 0xd0d0d0);
  // head
  p.shadedEllipse(17, 12 + bob, 6, 5.5, skin);
  // ears
  p.line(11, 11 + bob, 6, 8 + bob, skin); p.line(11, 12 + bob, 7, 9 + bob, skin);
  p.line(23, 11 + bob, 27, 8 + bob, skin);
  // hood
  p.shadedEllipse(16, 8 + bob, 6, 3.5, 0x4a6a2a);
  // eyes & mouth
  p.rect(18, 11 + bob, 2, 2, 0xff3030); p.set(18, 11 + bob, 0xffe0a0);
  p.rect(21, 11 + bob, 1, 2, 0xff3030);
  p.rect(18, 15 + bob, 4, 1, 0x2a1a10); p.set(19, 16 + bob, 0xffffff);
  // bow arm
  const ax = 23 + (draw ? -1 : 0);
  p.rect(20, 18 + bob, 4, 2, skin);
  // bow
  const bx = 25, by = 19 + bob;
  for (let a = -70; a <= 70; a += 10) {
    const r = (a * Math.PI) / 180;
    p.set(bx + Math.cos(r) * 4, by + Math.sin(r) * 8, 0x8a5a2a);
  }
  // string
  const sx = bx + 1 - draw * 4;
  p.line(bx + 1, by - 8, sx, by, 0xe0e0e0); p.line(sx, by, bx + 1, by + 8, 0xe0e0e0);
  if (draw) { p.line(sx, by, sx + 10, by, 0xc8a070); p.set(sx + 10, by, 0xe0e0e0); p.rect(sx - 1, by - 1, 2, 2, skin); }
  void ax;
  p.outline(OUT);
  return p;
}

// ---------- Wisp ----------
function wisp(t: number, flare = 0): PixelCanvas {
  const p = new PixelCanvas(28, 32);
  const c1 = 0x3fd6e0, c2 = 0x9ff6ff;
  const cy = 18 + Math.round(Math.sin(t * Math.PI / 2) * 1.5);
  // flame tongues
  for (let i = 0; i < 5; i++) {
    const x = 9 + i * 2.6;
    const h = 6 + ((i * 7 + t * 3) % 5) + flare * 2;
    p.thickLine(x, cy - 2, x + Math.sin(t + i) * 1.5, cy - 4 - h, i % 2 ? c1 : 0x2ab0c8, 2);
  }
  p.shadedEllipse(14, cy, 7 + flare, 6.5 + flare, c1);
  p.ellipse(14, cy + 1, 4, 3.5, c2);
  p.ellipse(14, cy + 1, 2, 2, 0xffffff);
  // eyes
  p.rect(11, cy - 1, 2, 2, 0x10304a); p.rect(16, cy - 1, 2, 2, 0x10304a);
  // trailing sparks
  p.set(6, cy + 6 + (t % 2), c2); p.set(22, cy + 5 - (t % 2), c2); p.set(14, cy + 9, c1);
  p.outline(0x0a2a3a);
  return p;
}

// ---------- Treant boss ----------
function treant(sway: number, step: number, arms: number, glow = 0): PixelCanvas {
  const p = new PixelCanvas(80, 80);
  const bark = 0x6a4a2e, barkD = 0x4a3020, moss = 0x5a8a3a, leaf = 0x2f6a3a, eye = glow ? 0xff5a3a : 0xa6ff6a;
  // roots/legs
  const lx = Math.round(Math.sin(step * Math.PI / 2) * 3);
  p.thickLine(30, 60, 24 - lx, 74, barkD, 5); p.thickLine(24 - lx, 74, 18 - lx, 76, barkD, 3);
  p.thickLine(48, 60, 54 + lx, 74, bark, 5); p.thickLine(54 + lx, 74, 61 + lx, 76, bark, 3);
  // arms (branches) — arms: 0 rest, 1 raised, 2 slam
  const armY = arms === 1 ? 18 : arms === 2 ? 58 : 44;
  p.thickLine(26, 40, 10, armY, barkD, 5); p.thickLine(10, armY, 4, armY - 6, barkD, 2); p.thickLine(10, armY, 6, armY + 6, barkD, 2);
  // trunk body
  const sx = sway;
  for (let y = 24; y < 64; y++) {
    const w = 15 + Math.round(Math.sin((y - 24) / 40 * Math.PI) * 3);
    for (let x = -w; x <= w; x++) {
      const n = (Math.sin(x * 1.3 + y * 0.2) + Math.sin(y * 0.9 + x * 0.3)) * 0.5;
      let c = bark;
      if (x > w * 0.45) c = shadeDark(bark, 0.35);
      else if (x < -w * 0.5) c = shadeLight(bark, 0.15);
      if (n > 0.75) c = barkD;
      p.set(40 + x + Math.round(sx * (64 - y) / 40), y, c);
    }
  }
  // moss patches
  p.ellipse(32 + sx, 56, 5, 2, moss); p.ellipse(50 + sx, 48, 3, 2, moss);
  // face
  const fx = 40 + sx;
  p.rect(fx - 9, 36, 6, 4, 0x1a0e0a); p.rect(fx + 3, 36, 6, 4, 0x1a0e0a);
  p.rect(fx - 8, 37, 4, 2, eye); p.rect(fx + 4, 37, 4, 2, eye);
  p.set(fx - 7, 37, 0xffffff); p.set(fx + 5, 37, 0xffffff);
  p.line(fx - 10, 34, fx - 3, 35, barkD); p.line(fx + 10, 34, fx + 3, 35, barkD);
  p.rect(fx - 6, 46, 12, 4, 0x1a0e0a);
  for (let i = 0; i < 4; i++) p.set(fx - 5 + i * 3, 46, 0xd8c8a0);
  if (glow) { p.ellipse(fx, 48, 3, 1.5, 0xff7a3a); }
  // other arm in front
  p.thickLine(54 + sx, 40, 70, armY, bark, 5); p.thickLine(70, armY, 76, armY - 6, bark, 2); p.thickLine(70, armY, 74, armY + 6, bark, 2);
  // crown of leaves
  const crown: [number, number, number][] = [[40, 16, 16], [26, 22, 10], [54, 22, 10], [33, 10, 9], [48, 10, 9], [40, 6, 8]];
  for (const [x, y, r] of crown) p.shadedEllipse(x + sx * 1.5, y, r, r * 0.75, leaf);
  // blossoms & thorns
  for (const [x, y] of [[30, 12], [46, 8], [52, 18], [36, 20], [24, 20], [42, 14]] as const) { p.set(x + sx, y, 0xff8ab8); p.set(x + 1 + sx, y, 0xffc0d8); }
  for (const [x, y] of [[34, 28], [46, 30], [38, 54], [52, 58]] as const) p.set(x + sx, y, 0xd8d0a0);
  p.outline(OUT);
  return p;
}

export function buildMonster(kind: MonsterKind): MonsterSheet {
  switch (kind as string) {
    case 'slime': return {
      w: 28, h: 26, anims: {
        idle: { frames: [slime(0, 0), slime(0.6, 0), slime(1, 0), slime(0.6, 0)], rate: 6, repeat: -1 },
        move: { frames: [slime(1.4, 0), slime(-1, 3), slime(-1.4, 6), slime(-0.5, 3)], rate: 8, repeat: -1 },
        attack: { frames: [slime(2, 0, true), slime(-2, 4, true), slime(1, 0, true)], rate: 8, repeat: 0 },
        hurt: { frames: [slime(1.8, 0, true, 0xff8a8a)], rate: 8, repeat: 0 },
      },
    };
    case 'shroom': return {
      w: 28, h: 30, anims: {
        idle: { frames: [shroom(0, 0, 0, 0), shroom(1, 0, 0, 0)], rate: 3, repeat: -1 },
        move: { frames: [shroom(0, -1, 1, 0), shroom(-1, 0, 0, 1), shroom(0, 1, -1, 0), shroom(-1, 0, 0, -1)], rate: 8, repeat: -1 },
        attack: { frames: [shroom(1, 0, 0, -2, true), shroom(-1, 0, 0, 3, true), shroom(0, 0, 0, 2, true)], rate: 8, repeat: 0 },
        hurt: { frames: [shroom(1, 0, 0, -2, true)], rate: 8, repeat: 0 },
      },
    };
    case 'wolf': return {
      w: 40, h: 30, anims: {
        idle: { frames: [wolf(0), wolf(0, 0, false, 1)], rate: 2, repeat: -1 },
        move: { frames: [wolf(0), wolf(1), wolf(2), wolf(3)], rate: 12, repeat: -1 },
        attack: { frames: [wolf(0, -2, false, 2), wolf(1, 4, true), wolf(2, 3, true)], rate: 9, repeat: 0 },
        hurt: { frames: [wolf(0, -2, true, 1)], rate: 8, repeat: 0 },
      },
    };
    case 'goblin': return {
      w: 32, h: 32, anims: {
        idle: { frames: [goblin(0, 0, 0), goblin(0, 0, 1)], rate: 3, repeat: -1 },
        move: { frames: [goblin(0), goblin(1), goblin(2), goblin(3)], rate: 8, repeat: -1 },
        attack: { frames: [goblin(0, 1), goblin(0, 2), goblin(0, 0)], rate: 5, repeat: 0 },
        hurt: { frames: [goblin(0, 0, 1)], rate: 8, repeat: 0 },
      },
    };
    case 'wisp': return {
      w: 28, h: 32, anims: {
        idle: { frames: [wisp(0), wisp(1), wisp(2), wisp(3)], rate: 7, repeat: -1 },
        move: { frames: [wisp(0), wisp(1), wisp(2), wisp(3)], rate: 10, repeat: -1 },
        attack: { frames: [wisp(0, 1), wisp(1, 2), wisp(2, 1)], rate: 7, repeat: 0 },
        hurt: { frames: [wisp(1, 1)], rate: 8, repeat: 0 },
      },
    };
    case 'treant': return {
      w: 80, h: 80, anims: {
        idle: { frames: [treant(0, 0, 0), treant(1, 0, 0), treant(0, 0, 0), treant(-1, 0, 0)], rate: 3, repeat: -1 },
        move: { frames: [treant(0, 0, 0), treant(1, 1, 0), treant(0, 2, 0), treant(-1, 3, 0)], rate: 5, repeat: -1 },
        attack: { frames: [treant(0, 0, 1), treant(-1, 0, 1), treant(1, 0, 2), treant(0, 0, 2)], rate: 6, repeat: 0 },
        hurt: { frames: [treant(1, 0, 0, 1)], rate: 8, repeat: 0 },
        cast: { frames: [treant(0, 0, 1, 1), treant(0, 0, 1, 1), treant(1, 0, 0, 1)], rate: 4, repeat: 0 },
      },
    };
    default: return buildMonster('wolf');
  }
}
