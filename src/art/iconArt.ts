// 16x16 item & skill icons, plus VFX textures.
import { PixelCanvas, shadeDark, shadeLight, lighten, darken, type Color } from './pixel';

const OUT = 0x140c1c;

function sword(blade: Color, hilt: Color, guard: Color, glow?: Color) {
  const p = new PixelCanvas(16, 16);
  p.thickLine(5, 10, 13, 2, blade, 2);
  p.line(6, 10, 13, 3, shadeLight(blade, 0.6));
  p.line(3, 8, 7, 12, guard);
  p.line(2, 13, 5, 10, hilt); p.set(1, 14, guard);
  if (glow) { p.set(12, 2, glow); p.set(9, 6, glow); }
  p.outline(OUT, false);
  return p;
}
function armor(body: Color, trim: Color) {
  const p = new PixelCanvas(16, 16);
  p.shadedRect(4, 3, 8, 11, body);
  p.shadedEllipse(3.5, 4.5, 2.5, 2, lighten(body, 0.1)); p.shadedEllipse(12.5, 4.5, 2.5, 2, lighten(body, 0.1));
  p.rect(7, 3, 2, 8, trim); p.rect(4, 10, 8, 1, darken(trim, 0.2));
  p.rect(6, 2, 4, 1, darken(body, 0.4));
  p.outline(OUT, false);
  return p;
}
function potion(c: Color, big = false) {
  const p = new PixelCanvas(16, 16);
  p.rect(6, 1, 4, 2, 0x8a5a2a);
  p.rect(6, 3, 4, 3, 0xd8e8f0);
  p.shadedEllipse(8, 10, big ? 5.5 : 4.5, big ? 5 : 4.5, c);
  p.set(6, 8, 0xffffff); p.set(5, 9, lighten(c, 0.6));
  p.outline(OUT, false);
  return p;
}
function ring(c: Color, gem: Color) {
  const p = new PixelCanvas(16, 16);
  p.ellipse(8, 10, 5, 4, c); p.ellipse(8, 10, 3, 2.2, -1 as Color);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const dx = (x + 0.5 - 8) / 3, dy = (y + 0.5 - 10) / 2.2; if (dx * dx + dy * dy <= 1) p.set(x, y, -1); }
  p.shadedEllipse(8, 5, 2.5, 2.5, gem);
  p.outline(OUT, false);
  return p;
}
function amulet(gem: Color) {
  const p = new PixelCanvas(16, 16);
  for (let a = 200; a <= 340; a += 12) { const r = (a * Math.PI) / 180; p.set(8 + Math.cos(r) * 6, 8 + Math.sin(r) * 6, 0xe0c050); }
  p.line(2, 8, 6, 11, 0xe0c050); p.line(14, 8, 10, 11, 0xe0c050);
  p.shadedEllipse(8, 12, 3, 3, gem);
  p.outline(OUT, false);
  return p;
}
function blob(c: Color, kind: 'gel' | 'spore' | 'pelt' | 'fang' | 'essence' | 'shard' | 'gem') {
  const p = new PixelCanvas(16, 16);
  switch (kind) {
    case 'gel': p.shadedEllipse(8, 10, 5, 4, c); p.set(6, 8, 0xffffff); break;
    case 'spore': p.rect(7, 9, 2, 5, 0xf2e2c4); p.shadedEllipse(8, 8, 6, 4, c); p.set(5, 7, 0xffffff); p.set(10, 6, 0xffffff); break;
    case 'pelt': p.shadedEllipse(8, 9, 6, 5, c); p.rect(2, 4, 3, 3, c); p.rect(11, 4, 3, 3, c); p.line(5, 12, 11, 12, darken(c, 0.3)); break;
    case 'fang': for (let y = 2; y < 14; y++) { const w = Math.max(0, (14 - y) / 4); p.rect(8 - w, y, w * 2 + 1, 1, y < 4 ? 0x8a6a4a : 0xf0e8d0); } break;
    case 'essence': p.shadedEllipse(8, 9, 4.5, 4.5, c); p.ellipse(8, 9, 2, 2, 0xffffff); p.set(3, 3, c); p.set(13, 5, c); break;
    case 'shard': for (let y = 1; y < 15; y++) { const w = y < 8 ? y / 2.2 : (15 - y) / 2.2; for (let x = -w; x <= w; x++) p.set(8 + x, y, x < 0 ? lighten(c, 0.3) : shadeDark(c, 0.2)); } p.set(7, 4, 0xffffff); break;
    case 'gem': p.shadedEllipse(8, 8, 6, 6, c); p.ellipse(7, 7, 2.5, 2.5, lighten(c, 0.4)); p.set(5, 5, 0xffffff); p.rect(7, 1, 2, 2, 0x5a9a3a); break;
  }
  p.outline(OUT, false);
  return p;
}
function staff() {
  const p = new PixelCanvas(16, 16);
  p.thickLine(3, 14, 11, 5, 0x8a5a2a, 2);
  p.shadedEllipse(12, 4, 3, 3, 0x4fd0ff); p.set(11, 3, 0xffffff);
  p.outline(OUT, false);
  return p;
}
function gold() {
  const p = new PixelCanvas(16, 16);
  for (const [x, y] of [[5, 11], [10, 11], [8, 7]] as const) { p.shadedEllipse(x, y, 4, 3, 0xf2c040); p.rect(x - 1, y - 1, 2, 1, 0xfff0a0); }
  p.outline(OUT, false);
  return p;
}

// ---- Skill icons (20x20, on a coloured disc) ----
function skillBase(c: Color) {
  const p = new PixelCanvas(20, 20);
  p.shadedEllipse(10, 10, 9.5, 9.5, darken(c, 0.55), false);
  return p;
}
function skCyclone() {
  const p = skillBase(0x4080c0);
  for (let a = 0; a < 600; a += 9) {
    const r = (a * Math.PI) / 180, rad = 1.5 + a / 90;
    p.set(10 + Math.cos(r) * rad, 10 + Math.sin(r) * rad * 0.8, a > 300 ? 0xffffff : 0x9fd8ff);
  }
  p.thickLine(4, 15, 14, 5, 0xd8e0f0, 2);
  return p;
}
function skFlame() {
  const p = skillBase(0xe05020);
  for (let y = 0; y < 13; y++) { const w = Math.sin((y / 13) * Math.PI) * 5 * (y < 6 ? y / 6 : 1); p.rect(10 - w, 16 - y, w * 2, 1, y < 4 ? 0xff5a2a : y < 9 ? 0xffa030 : 0xffe070); }
  p.ellipse(10, 12, 2, 2, 0xffffff);
  return p;
}
function skThunder() {
  const p = skillBase(0xc0a020);
  const pts: [number, number][] = [[12, 2], [7, 10], [11, 10], [7, 18], [14, 8], [10, 8], [13, 2]];
  for (let i = 0; i < pts.length - 1; i++) p.thickLine(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 0xfff060, 2);
  p.line(11, 3, 8, 9, 0xffffff);
  return p;
}
function skHeal() {
  const p = skillBase(0x30a050);
  p.rect(8, 4, 4, 12, 0xbfffd0); p.rect(4, 8, 12, 4, 0xbfffd0);
  p.rect(9, 5, 2, 10, 0xffffff); p.rect(5, 9, 10, 2, 0xffffff);
  for (const [x, y] of [[4, 4], [15, 5], [5, 15]] as const) p.set(x, y, 0xffffff);
  return p;
}

export function buildIcons(): Record<string, PixelCanvas> {
  return {
    sword0: sword(0xb08850, 0x6a4126, 0x8a6030),
    sword1: sword(0xc8d2e0, 0x5a3a24, 0x8a8a9a),
    sword2: sword(0xe8f0ff, 0x2f4f9a, 0xe0c050),
    sword3: sword(0xff9a3a, 0x4a1a1a, 0xf2cc58, 0xffe070),
    staff0: staff(),
    armor0: armor(0x3e6db5, 0x8a5a32),
    armor1: armor(0x9a6534, 0x5e3a1c),
    armor2: armor(0xa9b4c4, 0x2f4f9a),
    armor3: armor(0xe0b040, 0xb02a2a),
    ring0: ring(0xd08a4a, 0x7ee08a),
    amulet0: amulet(0xe02040),
    amulet1: amulet(0x4fa0ff),
    gem0: blob(0x5ae070, 'gem'),
    potion_hp: potion(0xe03040),
    potion_hp_l: potion(0xff2060, true),
    potion_mp: potion(0x3060e0),
    gel: blob(0x6ae06a, 'gel'),
    spore: blob(0xd8443c, 'spore'),
    pelt: blob(0x6a6a8a, 'pelt'),
    fang: blob(0, 'fang'),
    essence: blob(0x3fd6e0, 'essence'),
    shard: blob(0x9a7aff, 'shard'),
    gold: gold(),
    sk_cyclone: skCyclone(),
    sk_flame: skFlame(),
    sk_thunder: skThunder(),
    sk_heal: skHeal(),
  };
}

// ---- VFX textures ----
export function buildVfx(): Record<string, HTMLCanvasElement | PixelCanvas> {
  const out: Record<string, HTMLCanvasElement | PixelCanvas> = {};
  // soft radial glow
  const glow = document.createElement('canvas'); glow.width = glow.height = 64;
  const g = glow.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.35, 'rgba(255,255,255,0.45)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  out.glow = glow;
  // shadow ellipse
  const sh = document.createElement('canvas'); sh.width = 32; sh.height = 12;
  const s = sh.getContext('2d')!;
  const sg = s.createRadialGradient(16, 6, 0, 16, 6, 16);
  sg.addColorStop(0, 'rgba(10,6,20,0.55)'); sg.addColorStop(1, 'rgba(10,6,20,0)');
  s.setTransform(1, 0, 0, 0.375, 0, 0); s.fillStyle = sg; s.fillRect(0, 0, 32, 32);
  out.shadow = sh;
  // slash crescent
  const sl = new PixelCanvas(40, 40);
  for (let a = -80; a <= 80; a += 1) {
    const r = (a * Math.PI) / 180;
    const thick = 4 * Math.cos(r);
    for (let t = 0; t < thick; t += 0.5) {
      const rad = 17 - t;
      sl.set(20 + Math.cos(r) * rad, 20 + Math.sin(r) * rad, t < 1 ? 0xffffff : t < 2.5 ? 0xd8f0ff : 0x8ac8ff);
    }
  }
  out.slash = sl;
  // spark star
  const sp = new PixelCanvas(9, 9);
  sp.line(4, 0, 4, 8, 0xfff4c0); sp.line(0, 4, 8, 4, 0xfff4c0); sp.set(4, 4, 0xffffff); sp.set(3, 3, 0xffe070); sp.set(5, 5, 0xffe070); sp.set(3, 5, 0xffe070); sp.set(5, 3, 0xffe070);
  out.spark = sp;
  // pixel dot
  const dot = new PixelCanvas(3, 3); dot.rect(0, 0, 3, 3, 0xffffff); out.dot = dot;
  const dot1 = new PixelCanvas(2, 2); dot1.rect(0, 0, 2, 2, 0xffffff); out.px = dot1;
  // fireball
  const fb = new PixelCanvas(16, 16);
  fb.ellipse(8, 8, 7, 7, 0xff5a2a); fb.ellipse(8.5, 8, 5, 5, 0xffa030); fb.ellipse(9, 8, 3, 3, 0xffe070); fb.ellipse(9.5, 7.5, 1.5, 1.5, 0xffffff);
  out.fireball = fb;
  // arrow
  const ar = new PixelCanvas(14, 5);
  ar.line(0, 2, 10, 2, 0xc8a070); ar.rect(10, 1, 3, 3, 0xd0d0e0); ar.set(13, 2, 0xffffff); ar.set(0, 1, 0xe04848); ar.set(0, 3, 0xe04848);
  out.arrow = ar;
  // magic orb (wisp)
  const mo = new PixelCanvas(12, 12);
  mo.ellipse(6, 6, 5, 5, 0x3fd6e0); mo.ellipse(6, 6, 3, 3, 0x9ff6ff); mo.set(5, 5, 0xffffff); mo.set(6, 5, 0xffffff);
  out.orb = mo;
  // thorn (boss projectile)
  const th = new PixelCanvas(14, 6);
  for (let x = 0; x < 14; x++) { const w = (14 - x) / 6; th.rect(x, 3 - w, 1, w * 2, x > 10 ? 0xd8d0a0 : 0x5a8a3a); }
  out.thorn = th;
  // lightning bolt (vertical)
  const lb = new PixelCanvas(24, 96);
  let x = 12;
  for (let y = 0; y < 96; y += 6) {
    const nx = 12 + (Math.sin(y * 1.7) * 6);
    lb.thickLine(x, y, nx, y + 6, 0xbfe8ff, 3); lb.line(x, y, nx, y + 6, 0xffffff);
    if (y % 24 === 12) lb.line(nx, y + 6, nx + 6, y + 12, 0x9fd0ff);
    x = nx;
  }
  out.bolt = lb;
  // ring (for AoE / level up / heal)
  const rg = document.createElement('canvas'); rg.width = rg.height = 64;
  const rc = rg.getContext('2d')!;
  rc.strokeStyle = 'white'; rc.lineWidth = 3; rc.beginPath(); rc.arc(32, 32, 29, 0, Math.PI * 2); rc.stroke();
  rc.globalAlpha = 0.4; rc.lineWidth = 7; rc.beginPath(); rc.arc(32, 32, 26, 0, Math.PI * 2); rc.stroke();
  out.ring = rg;
  // warning circle (boss telegraph)
  const wc = document.createElement('canvas'); wc.width = wc.height = 64;
  const w = wc.getContext('2d')!;
  const wg = w.createRadialGradient(32, 32, 0, 32, 32, 32);
  wg.addColorStop(0, 'rgba(255,40,40,0.15)'); wg.addColorStop(0.85, 'rgba(255,40,40,0.35)'); wg.addColorStop(0.95, 'rgba(255,90,60,0.9)'); wg.addColorStop(1, 'rgba(255,40,40,0)');
  w.fillStyle = wg; w.fillRect(0, 0, 64, 64);
  out.warn = wc;
  // leaf
  const lf = new PixelCanvas(5, 4); lf.rect(1, 1, 3, 2, 0x8acf4a); lf.set(0, 2, 0x6aaf3a); lf.set(4, 1, 0xaaef6a); out.leaf = lf;
  const pt = new PixelCanvas(5, 4); pt.rect(1, 1, 3, 2, 0xffb0d0); pt.set(0, 2, 0xff90b8); pt.set(4, 1, 0xffe0ee); out.petal = pt;
  // god ray
  const ray = document.createElement('canvas'); ray.width = 32; ray.height = 128;
  const rr = ray.getContext('2d')!;
  const rgd = rr.createLinearGradient(0, 0, 0, 128);
  rgd.addColorStop(0, 'rgba(255,240,190,0.5)'); rgd.addColorStop(1, 'rgba(255,240,190,0)');
  rr.fillStyle = rgd; rr.beginPath(); rr.moveTo(8, 0); rr.lineTo(24, 0); rr.lineTo(32, 128); rr.lineTo(0, 128); rr.fill();
  out.ray = ray;
  // quest marker
  const qm = new PixelCanvas(8, 14);
  qm.rect(2, 0, 4, 9, 0xffd040); qm.rect(2, 11, 4, 3, 0xffd040); qm.rect(2, 0, 2, 9, 0xfff0a0);
  qm.outline(OUT, false);
  out.qmark = qm;
  const qq = new PixelCanvas(10, 14);
  qq.rect(2, 0, 6, 2, 0x8ae0ff); qq.rect(6, 2, 2, 4, 0x8ae0ff); qq.rect(4, 5, 3, 2, 0x8ae0ff); qq.rect(4, 7, 2, 3, 0x8ae0ff); qq.rect(4, 11, 2, 3, 0x8ae0ff); qq.rect(1, 2, 2, 2, 0x8ae0ff);
  qq.outline(OUT, false);
  out.qdone = qq;
  return out;
}
