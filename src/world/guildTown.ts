// The guild village on the top-down scene (docs/GUILD_WAR.md 2): no NPC villagers — the guild's buildings (level art,
// scaffolding while upgrading), the members' 10 house lots side by side, the defenses on the wall road, and the hired
// guards walking their rounds. Layout: src/world/villageLayout.ts. Rules: src/systems/guild.ts (through act()).
import Phaser from 'phaser';
import { S, bus, EV } from '../core/events';
import { act, refused } from '../net/client';
import { guildOf, meOf, hallLv, isRuin, bldRepairCost, houseRepairCost } from '../systems/guild';
import { GUILD_BLD, GUILD_BLD_ORDER, gbRate, gbStoreCap, defSlots, defStat, DEFENSES, GUARDS, type GuildBld, type GuardType } from '../data/guild';
import * as L from './villageLayout';
import { Village, type Step } from './npcs';
import { fx2 } from './fx2';
import { opaqueBox, charTint } from './ruin';
import { flagPole } from './flag';
import { flagFor } from '../data/flag';
import { formKeyOf } from './chars';

type Ter = 'g' | 'd' | 'c' | 'w';
type Obj = Phaser.GameObjects.GameObject;
const ART: Record<GuildBld, string> = { hall: 'townhall', barracks: 'tower', forge: 'forge', kitchen: 'kitchen', tavern: 'tavern', market: 'market', warehouse: 'warehouse', lumber: 'lumber', quarry: 'quarry', barn: 'barn' };
const artLv = (lv: number) => lv >= 5 ? 2 : lv >= 3 ? 1 : 0;
/** defense picture scale (the PixelLab objects are drawn bigger than a wall-road slot) */
const DEF_SC: Record<string, number> = { spikes: 0.62, palisade: 0.7, archer: 0.62, cannon: 0.6, ballista: 0.62, bunker: 0.6, banner: 0.8 };
export const ICON_RES: Record<string, string> = { gold: '💰', wood: '🪵', stone: '🪨', food: '🍖' };

/** ground type at a vertex of the guild village (same rules as the starter village: wobbly edges, grass islands) */
export function gvTerrain(x: number, y: number, wob: number, isl: number): Ter {
  if (Math.abs(x - L.riverX(y)) < 30 + wob * 14 || Math.hypot(x - L.POND.x, (y - L.POND.y) * 1.3) < L.POND.r + wob * 22) return 'w';
  const core = L.laneDist(x, y) < 10 || L.ringDist(x, y) < 9;
  if (Math.hypot(x - L.PLAZA.x, (y - L.PLAZA.y) * 1.1) < L.PLAZA.r + 18 + wob * 50) return isl > 0.74 && !core ? 'g' : 'c';
  for (const Y of L.yards()) if (Math.hypot((x - Y.x) / Y.rx, (y - Y.y) / Y.ry) + wob * 0.9 < 1) return isl > 0.76 && !core ? 'g' : 'c';
  if (L.laneDist(x, y) < 17 + wob * 18 || L.ringDist(x, y) < 15 + wob * 12) return 'd';
  return 'g';
}
/** planks over the river: the main road and the wall road (north and south) */
export function gvBridges() {
  return [L.roadY(L.riverX(470)), L.RING.y0, L.RING.y1].map(cy => ({ x0: L.riverX(cy) - 46, x1: L.riverX(cy) + 46, y0: cy - 15, y1: cy + 15 }));
}

/** what the guild town needs from the top-down scene */
export interface TownHost extends Phaser.Scene {
  hero: Phaser.GameObjects.Sprite; reserved: Set<string>; lamps: Phaser.GameObjects.Image[];
  obj(name: string, x: number, y: number, fw?: number, fd?: number, shadow?: boolean, sc?: number): Phaser.GameObjects.Image | null;
  /** the burnt ruin of an object picture (world/ruin.ts) */
  ruin(name: string, x: number, y: number, fw?: number, fd?: number, shadow?: boolean, sc?: number): Phaser.GameObjects.Image | null;
  isBlocked(x: number, y: number): boolean; surfAt(x: number, y: number): string;
  combat: { float(x: number, y: number, t: string, col: string, size?: number): void };
  castShadow(src: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite, live?: boolean, cut?: number): void;
}
interface View { key: string; objs: Obj[]; bubble?: Phaser.GameObjects.Container }

/** fire state of a building for its view key: '' intact, f1-f3 burning (more flames the worse), 'ruin' burnt down */
export const fireKey = (dmg = 0) => dmg >= 1 ? 'ruin' : dmg > 0 ? 'f' + Math.min(3, Math.ceil(dmg * 3)) : '';
/** flames + smoke on a burning building (same look for every building), or small fires in its ruin. The flames rise from
 *  behind the roof line (their base hidden by the roof) and the walls darken with soot the worse the fire gets. */
export function burnFx(sc: Phaser.Scene, im: Phaser.GameObjects.Image, dmg: number): Obj[] {
  const out: Obj[] = [], bx = opaqueBox(sc, im.texture.key), k = im.scaleY, foot = im.y;
  const top = im.y - (im.height * im.originY - bx.top) * k, bh = (bx.bot - bx.top) * k, bw = (bx.x1 - bx.x0) * im.scaleX, cx = im.x + ((bx.x0 + bx.x1) / 2 - im.width * im.originX) * im.scaleX;
  const add = (o: Phaser.GameObjects.Sprite | null) => { if (o) out.push(o); return o; };
  if (dmg >= 1) {   // the ruin: little fires among the rubble, a thin smoke column
    add(fx2(sc, 'fx_ruin_fire', cx, foot - bh * 0.06, foot + 2, Math.max(0.7, bw / 60)))?.setOrigin(0.5, 0.95);
    add(fx2(sc, 'fx_smoke', cx + bw * 0.12, foot - bh * 0.3, foot + 3, Math.max(0.7, bw / 120)))?.setOrigin(0.5, 1).setAlpha(0.6);
    return out;
  }
  im.setTint(charTint(dmg));
  const n = Math.min(3, Math.ceil(dmg * 3)), fs = Math.max(0.3, bw / 88 * 0.4);
  for (let i = 0; i < n; i++) {
    const x = cx + (n === 1 ? 0 : (i / (n - 1) - 0.5) * bw * 0.55), y = top + bh * (0.4 + (i % 2) * 0.06);
    add(fx2(sc, 'fx_bld_fire', x, y, foot - 0.5, fs * (i % 2 ? 0.85 : 1)))?.setOrigin(0.5, 0.95);   // just behind the building: the roof hides the flame's base
  }
  add(fx2(sc, 'fx_smoke', cx - bw * 0.1, top + bh * 0.1, foot + 6, Math.max(0.7, bw / 100)))?.setOrigin(0.5, 1).setAlpha(0.7);
  return out;
}

export class GuildTown {
  views = new Map<string, View>();
  guards?: Village;
  guardKey = '';
  t = 0; syncT = 0;
  constructor(public sc: TownHost) {}

  // ---------------------------------------------------------------- static dressing
  place(rnd: () => number, pick: (k: string, n: number) => string, free: (x: number, y: number, r: number) => boolean) {
    const sc = this.sc;
    // keep trees off the plots, the slots and the gates
    const keep = (x: number, y: number, rx: number, ry0: number, ry1: number) => { for (let j = -ry0; j <= ry1; j += 4) for (let i = -rx; i <= rx; i += 4) sc.reserved.add(Math.round((x + i) / 4) + ',' + Math.round((y + j) / 4)); };
    L.PLOTS.forEach((P, i) => keep(P.x, P.y, i >= 10 ? 60 : 100, i >= 10 ? 130 : 200, 60));
    for (const s of L.SLOTS) keep(s.x, s.y, 36, 60, 24);
    const near = (x: number, y: number) => sc.reserved.has(Math.round(x / 4) + ',' + Math.round(y / 4));
    // the fountain in the middle of the plaza (animated), braziers at the hall door, benches and flower beds round the plaza
    const block = (x: number, y: number, rx: number, ry: number) => { for (let j = -ry; j <= ry; j += 2) for (let i = -rx; i <= rx; i += 2) if ((i / rx) ** 2 + (j / ry) ** 2 <= 1) (sc as unknown as { block(x: number, y: number): void }).block(x + i, y + j); };
    { const fy = L.PLAZA.y - 4, im = sc.obj('dc_fountain2', L.PLAZA.x, fy, 0.86, 18, true, 1); if (im) fountainWater(sc, L.PLAZA.x, fy, im); }
    const hall = L.PLOTS[L.HALL_PLOT];
    for (const dx of [-62, 62]) if (fx2(sc, 'fx_brazier', hall.x + dx, hall.y + 34, hall.y + 34, 0.75)) { block(hall.x + dx, hall.y + 32, 9, 4); sc.lamps.push(sc.add.image(hall.x + dx, hall.y + 14, 'td_glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(99990)); }
    for (const [k, x, y, f] of [
      ['dc_bench', L.PLAZA.x - 100, L.PLAZA.y + 20, 0.8], ['dc_bench', L.PLAZA.x + 100, L.PLAZA.y + 20, 0.8], ['dc_flowerbed', L.PLAZA.x - 96, L.PLAZA.y - 30, 0.8], ['dc_flowerbed', L.PLAZA.x + 96, L.PLAZA.y - 30, 0.8],
      ['dc_statue', hall.x - 150, hall.y + 10, 0.8], ['dc_statue', hall.x + 150, hall.y + 10, 0.8],
      ['dc_signpost', L.NORTH_GATE.x + 40, L.roadY(L.NORTH_GATE.x) - 26, 0.8], ['dc_signpost', L.SOUTH_GATE.x + 40, L.SOUTH_GATE.y - 60, 0.8],
      ['dc_trough', L.PLOTS[L.PLOT_OF.barn].x - 100, L.PLOTS[L.PLOT_OF.barn].y + 20, 0.8], ['dc_woodpile', L.PLOTS[L.PLOT_OF.lumber].x + 96, L.PLOTS[L.PLOT_OF.lumber].y + 10, 0.8],
      ['dc_target', L.PLOTS[L.PLOT_OF.barracks].x + 100, L.PLOTS[L.PLOT_OF.barracks].y + 6, 0.8], ['fu_dummy', L.PLOTS[L.PLOT_OF.barracks].x + 130, L.PLOTS[L.PLOT_OF.barracks].y + 10, 0.8],
      ['dc_shrine', L.POND.x + 70, L.POND.y - 40, 0.8], ['dc_bench', L.POND.x + 20, L.POND.y + 70, 0.8],
      ['dc_veggies', 170, 1236, 0.8], ['dc_veggies', 300, 1236, 0.8], ['dc_clothesline', 470, 1240, 0.8], ['dc_doghouse', 640, 1236, 0.8],
    ] as [string, number, number, number][]) if (!sc.isBlocked(x, y)) sc.obj(k, x, y, 0.7, 4, true, f);
    // planters between the houses of the residential street
    for (const ly of [905, 1135]) for (let c = 0; c < 4; c++) { const x = 170 + c * 116 + 58, y = ly - 30; if (!sc.isBlocked(x, y)) sc.obj('dc_planter', x, y, 0.6, 3, true, 0.7); }
    // market stalls + lamps on the plaza
    for (const [x, y] of [[L.PLAZA.x - 70, L.PLAZA.y + 50], [L.PLAZA.x + 72, L.PLAZA.y + 46]]) sc.obj(pick('stall', 5), x, y, 0.8, 10);
    for (let a = 0; a < 6; a++) {
      const x = Math.round(L.PLAZA.x + Math.cos(a * Math.PI / 3 + 0.5) * (L.PLAZA.r + 22)), y = Math.round(L.PLAZA.y + Math.sin(a * Math.PI / 3 + 0.5) * (L.PLAZA.r + 18));
      if (sc.surfAt(x, y) === 'water' || sc.isBlocked(x, y) || near(x, y)) continue;
      sc.obj('lamp_0', x, y, 0.2, 2);
      sc.lamps.push(sc.add.image(x + 6, y - 26, 'td_glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(99990));
    }
    // lamps along the residential lanes, fences behind the house rows
    for (const ly of L.ROW_LANES) for (let x = 140; x < 760; x += 116) { const y = ly + 4; if (!sc.isBlocked(x + 58, y)) { sc.obj('lamp_1', x + 58, y, 0.2, 2); sc.lamps.push(sc.add.image(x + 62, y - 20, 'td_glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(99990).setScale(0.7)); } }
    for (let x = 120; x < 760; x += 30) { const y = 820; if (sc.surfAt(x, y) === 'grass' && !sc.isBlocked(x, y)) sc.obj('fenceh_0', x, y, 1, 3, false); }
    // river banks and the pond
    const BR = gvBridges();
    for (let y = 20; y < 1270; y += 14) for (const side of [-1, 1]) {
      const x = L.riverX(y) + side * (40 + rnd() * 10);
      if (BR.some(b => y > b.y0 - 30 && y < b.y1 + 30) || sc.isBlocked(x, y) || sc.surfAt(x, y) !== 'grass') continue;
      const r = rnd();
      if (r < 0.28) sc.obj(pick('rock', 8), x, y, 0.5, 3, true, 0.75 + rnd() * 0.3);
      else if (r < 0.75) sc.add.image(Math.round(x), Math.round(y), 'o_' + pick('reed', 4)).setOrigin(0.5, 0.9).setDepth(y);
    }
    for (let a = 0; a < Math.PI * 2; a += 0.25) {
      const x = L.POND.x + Math.cos(a) * (L.POND.r + 14 + rnd() * 8), y = L.POND.y + Math.sin(a) * (L.POND.r / 1.3 + 12 + rnd() * 6);
      if (sc.isBlocked(x, y) || sc.surfAt(x, y) !== 'grass') continue;
      if (rnd() < 0.35) sc.obj(pick('rock', 8), x, y, 0.5, 3, true, 0.7 + rnd() * 0.3); else sc.add.image(Math.round(x), Math.round(y), 'o_' + pick('reed', 4)).setOrigin(0.5, 0.9).setDepth(y);
    }
    // forest outside the wall road, a few trees inside
    const { x0, y0, x1, y1 } = L.RING;
    for (let k = 0; k < 1100; k++) {
      const x = 16 + rnd() * 1568, y = 30 + rnd() * 1240;
      const outside = x < x0 - 26 || x > x1 + 26 || y < y0 - 26 || y > y1 + 26;
      if (!outside && !(fbmish(x, y) > 0.86)) continue;
      if (!free(x, y, 40) || near(x, y)) continue;
      const r = rnd();
      sc.obj(r < 0.45 ? pick('pine', 3) : r < 0.9 ? pick('oak', 3) : pick('dead', 2), x, y, 0.22, 16, true, outside ? 1 : 0.8);
    }
    for (let k = 0; k < 2400; k++) {
      const x = 8 + rnd() * 1584, y = 8 + rnd() * 1264, sf = sc.surfAt(x, y);
      if (sf !== 'grass' || sc.isBlocked(x, y) || near(x, y)) continue;
      const r = rnd();
      if (r < 0.04) sc.add.image(Math.round(x), Math.round(y), 'o_' + pick('bush', 5)).setOrigin(0.5, 0.85).setDepth(y);
      else if (r < 0.2) sc.add.image(Math.round(x), Math.round(y), 'o_' + (r < 0.1 ? pick('flower', 5) : r < 0.16 ? pick('tuft', 2) : pick('leaf', 3))).setOrigin(0.5, 0.8).setDepth(y);
    }
    // the guild banner before the hall
  }

  // ---------------------------------------------------------------- live parts (rebuilt when the guild state changes)
  private view(id: string, key: string, make: () => Obj[]) {
    const v = this.views.get(id); if (v?.key === key) return v;
    v?.objs.forEach(o => o.destroy()); v?.bubble?.destroy();
    const nv: View = { key, objs: make() }; this.views.set(id, nv); return nv;
  }
  private label(x: number, y: number, t: string, col = '#ffe7a0', size = 7) {
    return this.sc.add.text(x, y, t, { fontFamily: 'sans-serif', fontSize: size + 'px', color: col, stroke: '#0b0f0c', strokeThickness: 3, resolution: 8, align: 'center' }).setOrigin(0.5, 1).setDepth(99980);
  }
  private lot(x: number, y: number, w: number, h: number) {
    const g = this.sc.add.graphics().setDepth(1.1);
    g.fillStyle(0x2a2016, 0.35).fillRoundedRect(x - w / 2, y - h + 6, w, h, 8).lineStyle(1, 0xc8a878, 0.5).strokeRoundedRect(x - w / 2, y - h + 6, w, h, 8);
    const out: Obj[] = [g];
    for (const [dx, dy] of [[-w / 2, -h + 6], [w / 2, -h + 6], [-w / 2, 6], [w / 2, 6]]) out.push(this.sc.add.rectangle(x + dx, y + dy, 2, 7, 0x6a4a2a).setOrigin(0.5, 1).setDepth(y + dy));
    return out;
  }
  /** draw / refresh buildings, houses and defenses from the guild state */
  render(now = Date.now()) {
    const g = guildOf(S()); if (!g) return;
    const sc = this.sc;
    // the guild's own flag on two poles before the hall
    const fpx = flagFor(g.name, g.flag), HP = L.PLOTS[L.HALL_PLOT];
    this.view('flag', fpx, () => [...flagPole(sc, HP.x - 120, HP.y + 30, fpx, 2, 66), ...flagPole(sc, HP.x + 120, HP.y + 30, fpx, 2, 66)]);
    for (const t of GUILD_BLD_ORDER) {
      const b = g.buildings.find(q => q.type === t)!, P = L.PLOTS[L.PLOT_OF[t]], busy = !!b.done && now < b.done;
      const art = busy ? 'site_0' : `${ART[t]}_${artLv(b.level)}`;
      const fk = busy ? '' : fireKey(b.dmg);
      this.view('b:' + t, art + b.level + fk, () => {
        const sc0 = t === 'hall' ? 1.1 : 1, im = fk === 'ruin' ? sc.ruin(art, P.x, P.y, 0.82, 50, true, sc0) : sc.obj(art, P.x, P.y, 0.82, 50, true, sc0);
        const top = im ? im.y - im.displayHeight * im.originY : P.y - 120;
        const fire = fk === 'ruin' ? ' 💀 ซาก (ต้องซ่อม)' : fk ? ' 🔥' : '';
        const lb = this.label(P.x, (fk === 'ruin' ? P.y - 70 : top - 2), `${GUILD_BLD[t].icon} ${GUILD_BLD[t].name} Lv${b.level}${busy ? ' 🔨' : ''}${fire}`, fk === 'ruin' ? '#ff9a7a' : t === 'hall' ? '#ffd84a' : '#ffe7a0');
        if (busy) lb.setData('timer', t);
        if (sc.hero && sc.isBlocked(sc.hero.x, sc.hero.y)) sc.hero.setPosition(L.doorOf(L.PLOT_OF[t]).x, L.doorOf(L.PLOT_OF[t]).y + 20);
        return im ? [im, lb, ...(fk ? burnFx(sc, im, b.dmg ?? 0) : [])] : [lb];
      });
    }
    // the residential street: one lot per member (empty until they build), free lots stay staked out
    for (let i = 0; i < L.PLOTS.length - 10; i++) {
      const P = L.PLOTS[10 + i], m = g.members.find(q => q.house === i), mine = m?.id === g.me;
      const busy = !!m?.houseDone && now < m.houseDone, lv = m ? (busy ? m.houseLv - 1 : m.houseLv) : 0;
      const hk = m && !busy && lv > 0 ? fireKey(m.houseDmg) : '';
      const key = (!m ? 'free' : busy ? `site:${m.name}` : lv > 0 ? `h${artLv(lv)}:${lv}:${m.name}` : `lot:${m.name}`) + hk;
      this.view('h:' + i, key + (mine ? ':me' : ''), () => {
        const out: Obj[] = [];
        if (!m || (lv === 0 && !busy)) {
          out.push(...this.lot(P.x, P.y, 84, 40));
          const sg = sc.obj('sign_1', P.x, P.y - 6, 0.5, 2, false); if (sg) out.push(sg);
          out.push(this.label(P.x, P.y - 40, m ? `${mine ? '🏠 ที่ดินของคุณ — สร้างบ้าน' : `ที่ดินของ ${m.name}`}` : 'ที่ดินว่าง', mine ? '#9fffb0' : '#c8b898', 6.5));
        } else {
          const art = busy ? 'site_0' : `house_${artLv(lv)}`;
          const im = hk === 'ruin' ? sc.ruin(art, P.x, P.y, 0.82, 22, true, L.HOUSE_SCALE) : sc.obj(art, P.x, P.y, 0.82, 22, true, L.HOUSE_SCALE); if (im) out.push(im);
          const top = im ? im.y - im.displayHeight * im.originY : P.y - 90;
          out.push(this.label(P.x, hk === 'ruin' ? P.y - 50 : top, `${mine ? '🏠 ' : ''}${m.name} Lv${lv}${busy ? ' 🔨' : ''}${hk === 'ruin' ? ' 💀' : hk ? ' 🔥' : ''}`, hk ? '#ff9a7a' : mine ? '#9fffb0' : '#ffe7a0', 6.5));
          if (im && hk) out.push(...burnFx(sc, im, m.houseDmg ?? 0));
        }
        return out;
      });
    }
    // defenses on the wall road (slots open with the hall level)
    const open = defSlots(hallLv(S(), now));
    L.SLOTS.forEach((P, i) => {
      const q = g.defenses.find(d => d.slot === i), busy = !!q?.done && now < q.done;
      const hurt = q && !busy && q.hp < defStat(DEFENSES[q.type], q.level).hp * 0.5;
      const key = i >= open ? 'locked' : !q ? 'empty' : `${q.type}:${q.level}:${busy}:${hurt}`;
      this.view('d:' + i, key, () => {
        if (key === 'locked') return [];
        if (!q) { const g2 = sc.add.graphics().setDepth(1.2); g2.lineStyle(1, 0xc8a878, 0.45).strokeEllipse(P.x, P.y, 34, 14); return [g2]; }
        const art = 'def_' + q.type, im = sc.obj(busy ? 'site_0' : art, P.x, P.y, 0.6, 6, true, busy ? 0.3 : DEF_SC[q.type] ?? 0.65);
        const out: Obj[] = im ? [im] : [];
        if (im && hurt) { const f = fx2(sc, 'fx_bld_fire', P.x, im.y - im.displayHeight * im.originY * 0.5, P.y + 2, 0.3); if (f) out.push(f.setOrigin(0.5, 0.95)); }
        if (q.level > 1) out.push(this.label(P.x, P.y + 12, '★'.repeat(Math.min(5, q.level - 1)), '#ffd84a', 6));
        return out;
      });
    });
    this.spawnGuards();
  }

  /** hired guards: spearmen walk the wall road, archers keep watch at the gates and the plaza */
  spawnGuards() {
    const g = guildOf(S()); if (!g) return;
    const key = `${g.guards.spear}:${g.guards.archer}:${!!g.hungry}:${g.members.map(m => m.id + m.house).join(',')}`; if (key === this.guardKey) return;
    this.guardKey = key;
    if (this.guards) for (const n of this.guards.npcs) { n.sp.destroy(); n.shadow.destroy(); n.tag.destroy(); }
    const v = this.guards = new Village(this.sc as never, L.VW, L.VH);
    const go = (x: number, y: number): Step => ({ kind: 'go', to: { x, y } });
    const watch = (ms: number, face: number): Step => ({ kind: 'work', ms, face });
    const ring = [[L.NORTH_GATE.x, L.RING.y0 + 12], [L.RING.x1 - 30, L.RING.y0 + 40], [L.RING.x1 - 12, 700], [L.RING.x1 - 40, L.RING.y1 - 20], [L.SOUTH_GATE.x, L.RING.y1 - 10], [L.RING.x0 + 30, L.RING.y1 - 40], [L.RING.x0 + 12, 640], [L.RING.x0 + 40, L.RING.y0 + 30]];
    const posts = [[L.NORTH_GATE.x + 30, 120, 0], [L.SOUTH_GATE.x - 30, L.SOUTH_GATE.y - 70, 4], [L.PLAZA.x + 40, L.PLAZA.y + 60, 0], [L.PLOTS[L.HALL_PLOT].x - 60, L.PLOTS[L.HALL_PLOT].y + 40, 0], [L.WEST_EXIT.x + 60, L.WEST_EXIT.y + 26, 6]];
    const name = (t: GuardType) => GUARDS[t].name + (g.hungry ? ' (หิว)' : '');
    for (let i = 0; i < g.guards.spear; i++) {
      const plan: Step[] = []; for (let k = 0; k < ring.length; k++) { const [x, y] = ring[(k + i * 3) % ring.length]; plan.push(go(x, y)); if (k % 2) plan.push(watch(3000 + i * 400, 0)); }
      const [hx, hy] = ring[(i * 3) % ring.length];
      v.add(GUARDS.spear.key, name('spear'), { x: hx, y: hy }, plan, g.hungry ? 14 : 22, true, 'walk');
    }
    for (let i = 0; i < g.guards.archer; i++) {
      const [x, y, f] = posts[i % posts.length], [x2, y2] = posts[(i + 2) % posts.length];
      v.add(GUARDS.archer.key, name('archer'), { x, y }, [go(x, y), watch(14000, f), go(x2 + 20, y2), watch(9000, 0)], g.hungry ? 14 : 20, true, 'walk');
    }
    // the other members (bots until the game is online) live here too: home, the plaza, a building, back home
    const spots = [L.PLAZA, ...(['hall', 'tavern', 'market', 'forge', 'warehouse', 'kitchen'] as GuildBld[]).map(t => L.doorOf(L.PLOT_OF[t]))];
    g.members.forEach((m, i) => {
      if (!m.sim) return;
      const tier = m.lv >= 80 ? 3 : m.lv >= 40 ? 2 : m.lv >= 10 ? 1 : 0, k = formKeyOf(m.cls, tier), d = L.doorOf(L.housePlot(m.house));
      const a = spots[i % spots.length], b = spots[(i * 3 + 2) % spots.length], off = (n: number) => ((i * 29 + n * 17) % 50) - 25;
      v.add(k, `${m.role === 'leader' ? '👑 ' : m.role === 'deputy' ? '⭐ ' : ''}${m.name} Lv${m.lv}`, { x: d.x, y: d.y + 16 },
        [go(d.x, d.y + 16), watch(4000 + i * 700, 0), go(a.x + off(1), a.y + 24 + off(2) / 3), watch(7000, (i * 2) % 8), go(b.x + off(3), b.y + 24), watch(5000, 0)], 24, true, 'walk');
    });
    for (const n of v.npcs) this.sc.castShadow(n.sp, true);
  }

  /** every frame: guards walk; every second: timers, production bubbles, walking up to a building collects its output */
  update(time: number, dt: number) {
    this.guards?.update(time, dt);
    if (time - this.t < 1000) return;
    this.t = time;
    const s = S(), g = guildOf(s); if (!g) return;
    if (time - this.syncT > 60000) { this.syncT = time; this.sync(); }
    const now = Date.now();
    this.render(now);
    for (const t of GUILD_BLD_ORDER) {
      const v = this.views.get('b:' + t), b = g.buildings.find(q => q.type === t)!, d = GUILD_BLD[t], P = L.PLOTS[L.PLOT_OF[t]];
      if (!v) continue;
      if (b.done && now < b.done) { (v.objs.find(o => o.getData?.('timer')) as Phaser.GameObjects.Text | undefined)?.setText(`🔨 ${d.name} Lv${b.level} • ${fmtLeft(b.done - now)}`); continue; }
      if (!d.produces) continue;
      const stored = Math.min(gbStoreCap(d, b.level), b.stored + gbRate(d, b.level) * Math.max(0, (now - b.last) / 60000));
      const show = stored >= 1;
      if (show && !v.bubble) {
        const im = v.objs[0] as Phaser.GameObjects.Image, top = im?.y ? im.y - im.displayHeight * im.originY - 14 : P.y - 130;
        const bub = this.sc.add.container(P.x, top).setDepth(99990);
        bub.add([this.sc.add.circle(0, 0, 8, 0xffffff, 0.95).setStrokeStyle(1.5, 0x3a8a3a), this.sc.add.text(0, 0, ICON_RES[d.produces], { fontSize: '9px', resolution: 8 }).setOrigin(0.5)]);
        this.sc.tweens.add({ targets: bub, y: top - 4, duration: 650, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        v.bubble = bub;
      } else if (!show && v.bubble) { v.bubble.destroy(); v.bubble = undefined; }
      if (show && this.sc.hero && Math.hypot(P.x - this.sc.hero.x, P.y + 14 - this.sc.hero.y) < 50) {
        const r = act('guildCollect', { type: t });
        if (!refused(r)) { this.sc.combat.float(P.x, P.y - 70, `+${r.amount} ${ICON_RES[r.res]} เข้าคลังหมู่บ้าน`, '#9fffb0', 10); bus.emit(EV.STATE_CHANGED); }
      }
    }
  }
  /** catch the village up (production, guards' food, simulated members) and show what happened while away */
  sync() {
    const r = act('guildSync', {});
    if (refused(r)) return;
    for (const m of r.unread) bus.emit(EV.TOAST, m, m.startsWith('🛡') ? '#9fffb0' : '#ff9a7a');
    if (r.unread.length) bus.emit(EV.STATE_CHANGED);
  }

  /** repair with the guild treasury (any member) — the fire goes out with a puff of building dust */
  repair(t: GuildBld) {
    const r = act('bldRepair', { t });
    if (refused(r)) { bus.emit(EV.TOAST, r.refused === 'treasury' ? 'ของในคลังกิลด์ไม่พอซ่อม — ช่วยกันบริจาคไม้/หิน' : 'ซ่อมไม่ได้', '#ff8a6a'); return; }
    const P = L.PLOTS[L.PLOT_OF[t]]; fx2(this.sc, 'fx_build', P.x, P.y - 40, P.y + 5, 1.4);
    bus.emit(EV.TOAST, `🔧 ซ่อม${GUILD_BLD[t].name}แล้ว — กลับมาทำงานตามปกติ`, '#9fffb0'); this.render(); bus.emit(EV.STATE_CHANGED);
  }
  repairHouse() {
    const r = act('houseRepair', {});
    if (refused(r)) { bus.emit(EV.TOAST, r.refused === 'cost' ? 'ไม้/หินของคุณไม่พอซ่อมบ้าน' : 'ซ่อมไม่ได้', '#ff8a6a'); return; }
    const m = meOf(S())!, P = L.PLOTS[L.housePlot(m.house)]; fx2(this.sc, 'fx_build', P.x, P.y - 30, P.y + 5, 1.1);
    bus.emit(EV.TOAST, '🔧 ซ่อมบ้านแล้ว', '#9fffb0'); this.render(); bus.emit(EV.STATE_CHANGED);
  }
  /** what the action button offers near the guild buildings, the house lots and the defense slots */
  offers(h: { x: number; y: number }, offer: (d: number, label: string, cb: () => void) => void, open: (what: string, arg?: number) => void) {
    const g = guildOf(S()); if (!g) return;
    for (const t of GUILD_BLD_ORDER) {
      const P = L.doorOf(L.PLOT_OF[t]), d = Math.hypot(P.x - h.x, (P.y - h.y) * 1.4); if (d > 64) continue;
      const b = g.buildings.find(q => q.type === t)!;
      if (b.dmg) { const c = bldRepairCost(S(), b); offer(d + 5, `🔧 ซ่อม${GUILD_BLD[t].name} (คลังกิลด์ 🪵${c.wood} 🪨${c.stone})`, () => this.repair(t)); }
      if (!isRuin(b)) offer(d + 10, `🚪 เข้า${GUILD_BLD[t].name}`, () => open('enter', L.PLOT_OF[t]));
    }
    const me = meOf(S());
    for (const m of g.members) {
      const P = L.doorOf(L.housePlot(m.house)), d = Math.hypot(P.x - h.x, (P.y - h.y) * 1.4); if (d > 52) continue;
      if (m.id !== g.me) { offer(d + 20, `🏠 บ้านของ ${m.name}`, () => bus.emit(EV.TOAST, `${m.name} • Lv${m.lv} • บ้าน Lv${m.houseLv} • แต้มบุญ ${m.pts}`, '#ffe7a0')); continue; }
      if (me?.houseDmg) { const c = houseRepairCost(S()); offer(d - 1, `🔧 ซ่อมบ้าน (ของคุณเอง 🪵${c.wood} 🪨${c.stone})`, () => this.repairHouse()); }
      if (me?.houseDmg && me.houseDmg >= 1) continue;
      if ((me?.houseLv ?? 0) > 0 && !(me?.houseDone && Date.now() < me.houseDone)) offer(d, '🚪 เข้าบ้าน', () => open('enter', L.housePlot(m.house)));
      else offer(d, (me?.houseDone && Date.now() < me.houseDone) ? '🔨 กำลังสร้างบ้าน' : '🔨 สร้างบ้าน', () => open('tab:home'));
    }
    L.SLOTS.forEach((P, i) => {
      const d = Math.hypot(P.x - h.x, (P.y - h.y) * 1.4); if (d > 40 || i >= defSlots(hallLv(S()))) return;
      const q = g.defenses.find(x => x.slot === i);
      offer(d + 15, q ? `${DEFENSES[q.type].icon} ${DEFENSES[q.type].name} Lv${q.level}` : '🛡 ช่องวางป้อม', () => open('slot', i));
    });
  }
}

/** the fountain's water, in pixels: drops falling from the upper bowl and sparkles drifting on the basin (no blur) */
function fountainWater(sc: Phaser.Scene, x: number, foot: number, im: Phaser.GameObjects.Image) {
  if (!sc.textures.exists('px_drop')) { const c = document.createElement('canvas'); c.width = 2; c.height = 2; const k = c.getContext('2d')!; k.fillStyle = '#d8f4f8'; k.fillRect(0, 0, 2, 2); sc.textures.addCanvas('px_drop', c); }
  const top = foot - im.displayHeight * im.originY, h = im.displayHeight;
  const bowlY = top + h * 0.3, basinY = top + h * 0.72;
  // a thin spout of drops falling from the upper bowl into the basin, all round its rim
  sc.add.particles(x, bowlY, 'px_drop', { x: { min: -16, max: 16 }, speedY: { min: -6, max: 4 }, speedX: { min: -14, max: 14 }, gravityY: 160, lifespan: { min: 380, max: 520 },
    alpha: { start: 0.95, end: 0.4 }, frequency: 45, quantity: 1 }).setDepth(foot + 1);
  // the jet at the top
  sc.add.particles(x, top + 6, 'px_drop', { speedY: { min: -26, max: -14 }, speedX: { min: -5, max: 5 }, gravityY: 140, lifespan: { min: 280, max: 380 }, alpha: { start: 1, end: 0.5 }, frequency: 70, quantity: 1 }).setDepth(foot + 1);
  // glints on the water of the basin
  for (let i = 0; i < 9; i++) {
    const g = sc.add.image(x, basinY, 'px_drop').setAlpha(0).setDepth(foot + 0.5);
    const blink = () => { const a = Math.random() * Math.PI * 2, r = Math.random(); g.setPosition(Math.round(x + Math.cos(a) * im.displayWidth * 0.36 * r), Math.round(basinY + Math.sin(a) * h * 0.1 * r)); sc.tweens.add({ targets: g, alpha: { from: 0, to: 0.9 }, duration: 260 + Math.random() * 300, yoyo: true, delay: Math.random() * 900, onComplete: blink }); };
    blink();
  }
}
const fmtLeft = (ms: number) => { const s = Math.ceil(ms / 1000); return s >= 60 ? `${Math.floor(s / 60)} นาที ${s % 60} วิ` : `${s} วิ`; };
/** cheap smooth noise for the few trees inside the wall */
function fbmish(x: number, y: number) { return (Math.sin(x / 97 + Math.cos(y / 71)) * Math.cos(y / 83 - Math.sin(x / 59)) + 1) / 2; }
