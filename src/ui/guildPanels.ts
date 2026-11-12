// Guild window (overview, members, donate, buildings, defenses, goals, shop, raid, log) and the house windows
// (private chest, trophy shelf). Every change goes through act() -> server rules in src/systems/guild.ts.
import Phaser from 'phaser';
import { S, bus, EV } from '../core/events';
import { act, refused } from '../net/client';
import { sfx } from '../audio/sfx';
import { GOLD_D } from './kit';
import type { UIKit } from './kit';
import { BUILDINGS } from '../data/buildings';
import { itemDef, RARITY_COLORS, RARITY_NAMES } from '../data/items';
import { isEquipped } from '../systems/inventory';
import { invSize } from '../core/state';
import {
  guildOf, meOf, isOfficer, hallLv, whLv, barracksLv, gbLv, tCap, villageCost, goals, rivals, rivalStructs, raidsLeft, repairCost, homeOf, houseLv, defensePower,
  guildUnlocked, guildOffers, guardsTotal, guardFoodH, houseCost, produce,
} from '../systems/guild';
import {
  DEFENSES, DEF_ORDER, defSlots, defStat, GUILD_SHOP, GOAL_POOL, vaultShare, stashSlots, trophySlots, TROPHY_BONUS, GUILD_MAX, restCap, REST_EXP,
  GUILD_UNLOCK_LV, GUILD_BLD, GUILD_BLD_ORDER, gbRate, gbStoreCap, GUARDS, guardCap, type DefenseId, type GuardType,
} from '../data/guild';

import { DEV_TOOLS } from '../server/config';
export type GuildTab = 'home' | 'members' | 'donate' | 'build' | 'defense' | 'guards' | 'goals' | 'shop' | 'raid' | 'log';
const TABS: [GuildTab, string][] = [['home', '🏛 ภาพรวม'], ['members', '👥 สมาชิก'], ['donate', '🎁 บริจาค'], ['build', '🏗 อาคาร'], ['defense', '🛡 ป้อม'], ['guards', '💂 ทหาร'], ['goals', '📜 ภารกิจ'], ['shop', '🛒 ร้าน'], ['raid', '⚔ ปล้น'], ['log', '📖 บันทึก']];
const RES_ICON: Record<string, string> = { gold: '💰', wood: '🪵', stone: '🪨', food: '🍖' };
const WHY: Record<string, string> = {
  role: 'เฉพาะหัวหน้า/รองหัวหน้า', treasury: 'คลังหมู่บ้านไม่พอ — ชวนสมาชิกบริจาค', hall: 'ต้องอัปหอกิลด์ก่อน', busy: 'กำลังก่อสร้างอยู่', max: 'เลเวลสูงสุดแล้ว',
  cap: 'คลังหมู่บ้านเต็ม — อัปโกดังเพื่อขยาย', amount: 'ของไม่พอ', taken: 'ช่องนี้มีป้อมแล้ว', slot: 'ช่องนี้ยังไม่เปิด', daily: 'วันนี้ครบแล้ว', pts: 'แต้มบุญไม่พอ',
  bag: 'กระเป๋าเต็ม', full: 'เต็มแล้ว', weak: 'หมู่บ้านนี้อ่อนเกินไป', target: 'เป้าหมายนี้ไม่มีแล้ว', rarity: 'ตั้งโชว์ได้เฉพาะอุปกรณ์ Super Rare ขึ้นไป', equipped: 'ถอดออกก่อน',
  house: 'ต้องสร้างบ้านก่อน', item: 'ไม่มีของชิ้นนี้', member: 'ทำกับสมาชิกคนนี้ไม่ได้', level: `ต้องเลเวล ${GUILD_UNLOCK_LV} ขึ้นไป`, name: 'ชื่อกิลด์สั้นเกินไป',
  cost: 'ทรัพยากรส่วนตัวไม่พอ', empty: 'ยังไม่มีของให้เก็บ', none: 'ไม่มีทหารประเภทนี้', guild: 'ยังไม่มีกิลด์',
};
export const whyText = (r: unknown) => WHY[(r as { refused: string }).refused] ?? 'ทำไม่ได้';
const num = (n: number) => Math.floor(n).toLocaleString();
const hrs = (ms: number) => { const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000); return h ? `${h} ชม. ${m} นาที` : `${m} นาที`; };

/** what the guild window needs from the panel host */
export interface GuildHost {
  k: UIKit; scene: Phaser.Scene; guildTab: GuildTab; guildSlot: number; guildPick: DefenseId | null;
  window(c: Phaser.GameObjects.Container, w: number, h: number, title: string): { x: number; y: number; w: number; h: number; g: Phaser.GameObjects.Graphics };
  rebuild(): void; close(): void; ico(x: number, y: number, key: string, box: number): Phaser.GameObjects.Image;
}
const done = (h: GuildHost, msg: string, col = '#9fffb0') => { sfx.levelUp(); bus.emit(EV.TOAST, msg, col); bus.emit(EV.STATE_CHANGED); h.rebuild(); };
const fail = (r: unknown) => { sfx.error(); bus.emit(EV.TOAST, whyText(r), '#ff8a8a'); };

export function buildGuild(h: GuildHost, c: Phaser.GameObjects.Container) {
  const s = S(), g0 = guildOf(s); const ui = h.scene, k = h.k;
  const W = Math.min(600, (ui as unknown as { VW: number }).VW - 16), H = 318;
  const { x, y, g } = h.window(c, W, H, g0 ? `🏛 ${g0.name}` : '🏛 กิลด์');
  if (!g0) { buildNoGuild(h, c, x, y, W, H, g); return; }
  // tabs
  const tw = (W - 20) / TABS.length;
  TABS.forEach(([id, name], i) => c.add(k.button(x + 10 + i * tw, y + 24, tw - 3, 18, name, () => { h.guildTab = id; h.guildPick = null; h.rebuild(); }, { size: 7.5, color: h.guildTab === id ? 0x6a4a1a : 0x2a1d12 })));
  const top = y + 48, L = x + 12, R = x + W - 12, CW = R - L;
  g.fillStyle(0x0a0705, 0.6).fillRoundedRect(L, top, CW, H - 58, 4);
  const T = (tx: number, ty: number, t: string, size = 8.5, col = '#e8dcc0', wrap?: number) => { const o = k.text(tx, ty, t, size, col, wrap ? { wordWrap: { width: wrap } } : {}); c.add(o); return o; };
  const me = meOf(s)!, off = isOfficer(s), now = Date.now();
  const tr = g0.treasury, cap = tCap(s);
  const treasuryLine = (ty: number) => { T(L + 8, ty, `คลังหมู่บ้าน  ${RES_ICON.gold}${num(tr.gold)}  ${RES_ICON.wood}${num(tr.wood)}  ${RES_ICON.stone}${num(tr.stone)}  ${RES_ICON.food}${num(tr.food)}   (เพดาน ${num(cap)}/อย่าง)`, 8.5, '#ffe7a0'); };

  switch (h.guildTab) {
    case 'home': {
      treasuryLine(top + 6);
      T(L + 8, top + 22, `ตำแหน่งของคุณ: ${me.role === 'leader' ? '👑 หัวหน้า' : me.role === 'deputy' ? '⭐ รองหัวหน้า' : 'สมาชิก'}   •   แต้มบุญ ${num(me.pts)}   •   สมาชิก ${g0.members.length}/${GUILD_MAX}   •   หอกิลด์ Lv${hallLv(s)}`, 8.5, '#9fffb0');
      const sh = g0.shieldUntil - now;
      T(L + 8, top + 38, `🛡 โล่: ${sh > 0 ? `อีก ${hrs(sh)}` : 'ไม่มี (ศัตรูปล้นได้)'}   •   ห้องนิรภัยกันของไว้ ${Math.round(vaultShare(whLv(s)) * 100)}%   •   พลังป้องกัน ${num(defensePower(s))}   •   ปล้นได้อีกวันนี้ ${raidsLeft(s)} ครั้ง`, 8.5, '#9ad8ff', CW - 16);
      const hl = me.houseLv, hc = hl < BUILDINGS.home.maxLevel ? houseCost(hl + 1) : null;
      T(L + 8, top + 54, `🏠 บ้านของคุณในหมู่บ้านกิลด์: ${hl ? `Lv${hl}` : 'ที่ดินโล่ง'}${hc ? ` — ${hl ? 'อัป' : 'สร้าง'}ใช้ของส่วนตัว ${(['gold', 'wood', 'stone', 'food'] as const).filter(r => hc[r]).map(r => `${RES_ICON[r]}${num(hc[r]!)}`).join(' ')}` : ''}`, 8, '#ffe7a0', CW - 130);
      if (hc) c.add(k.button(R - 116, top + 50, 108, 18, hl ? '⬆ อัปบ้าน' : '🔨 สร้างบ้าน', () => { const r = act('houseBuild', {}); if (refused(r)) fail(r); else done(h, `บ้านของคุณ → Lv${r.level}`); }, { size: 8, color: 0x1f4a2a, disabled: !!me.houseDone && now < me.houseDone }));
      T(L + 8, top + 72, 'ข่าวล่าสุดในกิลด์', 9, '#ffd84a');
      g0.log.slice(0, 7).forEach((l, i) => T(L + 12, top + 88 + i * 15, `${new Date(l.t).toLocaleTimeString().slice(0, 5)}  ${l.text}`, 8, '#e8dcc0', CW - 24));
      T(L + 8, top + H - 80, 'บริจาคเข้าคลัง → หัวหน้าอัปอาคาร/ป้อม • ของส่วนตัวไม่โดนปล้น แต่คลังหมู่บ้านโดน', 7.5, '#a89878', CW - 16);
      if (DEV_TOOLS) c.add(k.button(L + 8, top + H - 124, CW - 16, 18, '🧪 จำลองกิลด์ศัตรู (บอท) บุกหมู่บ้านเรา — สู้จริง', () => { h.close(); bus.emit('td:defend'); }, { size: 8, color: 0x7a1a10 }));
      if (DEV_TOOLS) ([['🧪 เติมคลังเต็ม', 'guildFill'], ['🧪 ข้ามเวลา 12 ชม.', 'guildTime'], ['🧪 รายงานโดนปล้น', 'guildAttack']] as const).forEach(([lb, op], i) => c.add(k.button(L + 8 + i * ((CW - 16) / 3), top + H - 102, (CW - 16) / 3 - 6, 18, lb, () => {
        const r = act('dev', { op }); if (refused(r)) { fail(r); return; }
        for (const m of r.got) bus.emit(EV.TOAST, m, m.startsWith('⚔') ? '#ff9a7a' : '#9fffb0');
        sfx.levelUp(); bus.emit(EV.STATE_CHANGED); h.rebuild();
      }, { size: 7.5, color: 0x2a3a5a })));
      break;
    }
    case 'members': {
      g0.members.forEach((m, i) => {
        const ry = top + 6 + i * 22; g.fillStyle(m.id === g0.me ? 0x1f3a1f : 0x2a1d12, 0.85).fillRoundedRect(L + 4, ry, CW - 8, 20, 3);
        T(L + 10, ry + 4, `${m.role === 'leader' ? '👑' : m.role === 'deputy' ? '⭐' : '•'} ${m.name}${m.sim ? ' (จำลอง)' : ''}`, 8.5, m.id === g0.me ? '#9fffb0' : '#ffe7a0');
        T(L + 180, ry + 4, `Lv${m.lv}  บ้าน Lv${m.houseLv}  แต้มบุญ ${num(m.pts)}`, 8, '#e8dcc0');
        if (me.role === 'leader' && m.id !== g0.me) {
          c.add(k.button(R - 150, ry + 1, 70, 17, m.role === 'deputy' ? 'ปลดรอง' : 'ตั้งเป็นรอง', () => { const r = act('guildRole', { id: m.id, role: m.role === 'deputy' ? 'member' : 'deputy' }); if (refused(r)) fail(r); else done(h, 'เปลี่ยนตำแหน่งแล้ว'); }, { size: 7.5, color: 0x3a2a5a }));
          c.add(k.button(R - 76, ry + 1, 64, 17, 'ให้ออก', () => { const r = act('guildKick', { id: m.id }); if (refused(r)) fail(r); else done(h, `${m.name} ออกจากกิลด์`, '#ffb080'); }, { size: 7.5, color: 0x5a1a1a }));
        }
      });
      if (g0.members.length < GUILD_MAX) c.add(k.button(L + 8, top + H - 84, 200, 20, '➕ ชวนสมาชิก (จำลอง — รอเซิร์ฟจริง)', () => { const r = act('guildInvite', {}); if (refused(r)) fail(r); else done(h, `${r.name} เข้ากิลด์แล้ว!`); }, { size: 8, color: 0x1f4a2a }));
      break;
    }
    case 'donate': {
      treasuryLine(top + 6);
      T(L + 8, top + 22, `ของส่วนตัว  ${RES_ICON.gold}${num(s.gold)}  ${RES_ICON.wood}${num(s.res.wood)}  ${RES_ICON.stone}${num(s.res.stone)}  ${RES_ICON.food}${num(s.res.food)}   •   แต้มบุญของคุณ ${num(me.pts)}`, 8.5, '#9fffb0');
      (['gold', 'wood', 'stone', 'food'] as const).forEach((r, i) => {
        const ry = top + 42 + i * 26, have = r === 'gold' ? s.gold : s.res[r];
        T(L + 10, ry + 4, `${RES_ICON[r]} ${({ gold: 'ทอง', wood: 'ไม้', stone: 'หิน', food: 'อาหาร' })[r]}`, 9, '#ffe7a0');
        const steps = r === 'gold' ? [500, 2000, 10000] : [100, 500, 2000];
        [...steps, -1].forEach((n, j) => {
          const amt = n < 0 ? Math.min(have, Math.max(0, cap - tr[r])) : n;
          c.add(k.button(L + 90 + j * 86, ry, 80, 20, n < 0 ? 'ทั้งหมด' : `+${num(n)}`, () => {
            const rr = act('donate', { [r]: amt } as never); if (refused(rr)) fail(rr); else done(h, `บริจาค ${RES_ICON[r]}${num(amt)} • +${rr.pts} แต้มบุญ`);
          }, { size: 8.5, color: 0x1f4a2a, disabled: amt <= 0 || amt > have }));
        });
      });
      const mats = s.inventory.filter(it => itemDef(it.id).type === 'material' && !isEquipped(s, it.uid));
      T(L + 8, top + 152, 'วัตถุดิบ (ของหายากได้แต้มบุญสูง • ใช้อัปอาคารขั้นสูง)', 9, '#ffd84a');
      mats.slice(0, 12).forEach((it, i) => {
        const bx = L + 8 + (i % 4) * ((CW - 16) / 4), by = top + 170 + Math.floor(i / 4) * 24, d = itemDef(it.id);
        c.add(k.button(bx, by, (CW - 16) / 4 - 4, 20, `${d.name} x${it.qty}`, () => { const rr = act('donate', { item: it.id, qty: it.qty }); if (refused(rr)) fail(rr); else done(h, `บริจาค ${d.name} x${it.qty} • +${rr.pts} แต้มบุญ`); }, { size: 7.5, color: 0x3a2a12 }));
      });
      if (!mats.length) T(L + 12, top + 172, 'ยังไม่มีวัตถุดิบในกระเป๋า', 8, '#8a7a60');
      break;
    }
    case 'build': {
      treasuryLine(top + 6);
      T(L + 8, top + 20, off ? 'คุณเป็นหัวหน้า/รอง: กดอัปได้ (ใช้คลังหมู่บ้าน) • อาคารอัปได้ไม่เกินเลเวลหอกิลด์' : 'เฉพาะหัวหน้า/รองหัวหน้าที่อัปได้ — ช่วยด้วยการบริจาค', 8, off ? '#9fffb0' : '#ffb080');
      produce(s, now);
      GUILD_BLD_ORDER.forEach((t, i) => {
        const b = g0.buildings.find(q => q.type === t); if (!b) return;
        const d = GUILD_BLD[t], col = i % 2, row = Math.floor(i / 2), bx = L + 6 + col * (CW / 2), by = top + 34 + row * 44, bw = CW / 2 - 10;
        g.fillStyle(0x2a1d12, 0.9).fillRoundedRect(bx, by, bw, 41, 3).lineStyle(1, GOLD_D, 1).strokeRoundedRect(bx, by, bw, 41, 3);
        const building = !!b.done && now < b.done;
        T(bx + 6, by + 2, `${d.icon} ${d.name} Lv${b.level}${building ? ' 🔨' : ''}`, 8.5, '#ffd84a');
        T(bx + 6, by + 15, d.produces ? `ผลิต ${RES_ICON[d.produces]}${gbRate(d, b.level).toFixed(1)}/นาที • มีรอเก็บ ${num(b.stored)}/${num(gbStoreCap(d, b.level))}` : d.effect(b.level), 7, '#9ad8ff', bw - 70);
        if (b.level >= 5) { T(bx + 6, by + 28, 'เลเวลสูงสุด', 7, '#9fffb0'); return; }
        const cost = villageCost(t, b.level + 1), ok = (['gold', 'wood', 'stone', 'food'] as const).every(r => (cost[r] ?? 0) <= tr[r]) && Object.entries(cost.items ?? {}).every(([id, n]) => (tr.items[id] ?? 0) >= n);
        const parts = (['gold', 'wood', 'stone', 'food'] as const).filter(r => cost[r]).map(r => `${RES_ICON[r]}${num(cost[r]!)}`).concat(Object.entries(cost.items ?? {}).map(([id, n]) => `${itemDef(id).name}${n}`));
        T(bx + 6, by + 28, parts.join(' '), 6.5, ok ? '#c8e8b0' : '#ff8a7a', bw - 70);
        c.add(k.button(bx + bw - 60, by + 4, 54, 16, '⬆ อัป', () => { const r = act('guildUpgrade', { type: t }); if (refused(r)) fail(r); else done(h, `เริ่มอัป${d.name} → Lv${r.level}`); }, { size: 8, color: 0x1f4a2a, disabled: !off || building || (t !== 'hall' && b.level + 1 > hallLv(s)) }));
        if (d.produces) c.add(k.button(bx + bw - 60, by + 22, 54, 16, '📦 เก็บ', () => { const r = act('guildCollect', { type: t }); if (refused(r)) fail(r); else done(h, `เข้าคลัง ${RES_ICON[r.res]}${num(r.amount)}`); }, { size: 7.5, color: 0x3a2a12, disabled: b.stored < 1 }));
      });
      break;
    }
    case 'guards': {
      treasuryLine(top + 6);
      const bl = barracksLv(s), cap2 = guardCap(bl), n = guardsTotal(g0);
      T(L + 8, top + 22, `ทหารรับจ้าง ${n}/${cap2} (ค่ายทหาร Lv${bl}) • กินอาหารจากคลัง ${RES_ICON.food}${guardFoodH(s)}/ชม.${g0.hungry ? ' • ⚠ อาหารหมด ทหารหิว (พลังครึ่งเดียว)' : ''}`, 8.5, g0.hungry ? '#ff8a7a' : '#9fffb0', CW - 16);
      T(L + 8, top + 38, 'ทหารเดินลาดตระเวนในหมู่บ้าน ช่วยสู้ตอนศัตรูบุก • จ้างด้วยคลังหมู่บ้านที่ทุกคนช่วยกันหา • อัปค่ายทหาร = จ้างได้มากขึ้น แข็งแรงขึ้น', 7.5, '#a89878', CW - 16);
      (Object.keys(GUARDS) as GuardType[]).forEach((t, i) => {
        const d = GUARDS[t], by = top + 64 + i * 70;
        g.fillStyle(0x2a1d12, 0.9).fillRoundedRect(L + 6, by, CW - 12, 64, 4).lineStyle(1, GOLD_D, 1).strokeRoundedRect(L + 6, by, CW - 12, 64, 4);
        T(L + 14, by + 4, `${t === 'spear' ? '🛡' : '🏹'} ${d.name} × ${g0.guards[t]}`, 10, '#ffd84a');
        T(L + 14, by + 22, `❤${d.hp}  ⚔${d.atk}  ระยะ ${d.range}`, 8, '#9ad8ff');
        const hc = (['gold', 'wood', 'stone', 'food'] as const).filter(r => d.hire[r]).map(r => `${RES_ICON[r]}${num(d.hire[r]!)}`).join(' ');
        T(L + 14, by + 40, `ค่าจ้าง ${hc}`, 8, '#c8e8b0');
        c.add(k.button(R - 200, by + 18, 100, 26, '➕ จ้าง', () => { const r = act('hireGuard', { type: t }); if (refused(r)) fail(r); else done(h, `จ้าง${d.name}แล้ว`); }, { size: 9, color: 0x1f4a2a, disabled: !off || n >= cap2 }));
        c.add(k.button(R - 94, by + 18, 80, 26, 'ปลด', () => { const r = act('dismissGuard', { type: t }); if (refused(r)) fail(r); else done(h, `ปลด${d.name}แล้ว`, '#ffb080'); }, { size: 8.5, color: 0x5a1a1a, disabled: !off || !g0.guards[t] }));
      });
      if (!off) T(L + 8, top + H - 80, 'เฉพาะหัวหน้า/รองหัวหน้าที่จ้าง/ปลดได้', 8, '#ffb080');
      break;
    }
    case 'defense': {
      treasuryLine(top + 6);
      const open = defSlots(hallLv(s));
      T(L + 8, top + 20, `ช่องป้อม ${open}/14 (หอกิลด์ Lv${hallLv(s)}) • ป้อมอยู่บนถนนรอบหมู่บ้าน • ${off ? 'แตะช่องเพื่อสร้าง/อัป/ซ่อม' : 'หัวหน้า/รองเป็นคนสร้าง'}`, 8, '#9ad8ff', CW - 16);
      for (let i = 0; i < 14; i++) {
        const q = g0.defenses.find(d => d.slot === i), bx = L + 6 + (i % 7) * ((CW - 12) / 7), by = top + 36 + Math.floor(i / 7) * 44, bw = (CW - 12) / 7 - 4;
        const locked = i >= open, sel = h.guildSlot === i;
        g.fillStyle(locked ? 0x14100c : sel ? 0x4a3a1a : 0x2a1d12, 0.9).fillRoundedRect(bx, by, bw, 40, 3).lineStyle(1, sel ? 0xffd84a : GOLD_D, 1).strokeRoundedRect(bx, by, bw, 40, 3);
        if (q) { const d = DEFENSES[q.type], st = defStat(d, q.level); T(bx + 4, by + 3, `${d.icon} ${d.name}`, 7, '#ffd84a', bw - 6); T(bx + 4, by + 26, `Lv${q.level} ❤${Math.round(q.hp / st.hp * 100)}%`, 7, q.hp < st.hp ? '#ff8a7a' : '#9fffb0'); }
        else T(bx + 4, by + 12, locked ? '🔒' : '＋ ว่าง', 8, locked ? '#5a4a3a' : '#a89878');
        if (!locked) { const z = ui.add.zone(bx, by, bw, 40).setOrigin(0).setInteractive(); z.on('pointerup', () => { h.guildSlot = i; h.guildPick = null; h.rebuild(); }); c.add(z); }
      }
      const i = h.guildSlot, q = g0.defenses.find(d => d.slot === i), py = top + 130;
      if (i < 0 || i >= open) { T(L + 8, py, 'เลือกช่องด้านบน', 8.5, '#a89878'); break; }
      if (q) {
        const d = DEFENSES[q.type], st = defStat(d, q.level), rc = repairCost(q, Math.max(1, gbLv(s, 'forge')));
        T(L + 8, py, `${d.icon} ${d.name} Lv${q.level} — ${d.desc}`, 9, '#ffe7a0', CW - 16);
        T(L + 8, py + 18, `❤ ${num(q.hp)}/${num(st.hp)}${st.dmg ? `  ⚔ ${st.dmg}` : ''}${st.range ? `  ระยะ ${st.range}` : ''}`, 8.5, '#9ad8ff');
        const nc = d.costs[q.level];
        if (q.level < 5 && nc) c.add(k.button(L + 8, py + 40, 170, 22, `⬆ อัป Lv${q.level + 1}  ${RES_ICON.gold}${num(nc.gold ?? 0)} ${RES_ICON.wood}${num(nc.wood ?? 0)} ${RES_ICON.stone}${num(nc.stone ?? 0)}`, () => { const r = act('defUpgrade', { slot: i }); if (refused(r)) fail(r); else done(h, `${d.name} → Lv${(r as { level: number }).level}`); }, { size: 7.5, color: 0x1f4a2a, disabled: !off }));
        c.add(k.button(L + 186, py + 40, 150, 22, rc.wood ? `🔧 ซ่อม ${RES_ICON.wood}${num(rc.wood)} ${RES_ICON.stone}${num(rc.stone ?? 0)}` : '🔧 สภาพดี', () => { const r = act('defRepair', { slot: i }); if (refused(r)) fail(r); else done(h, 'ซ่อมเสร็จ'); }, { size: 7.5, color: 0x3a2a12, disabled: !rc.wood }));
        c.add(k.button(R - 90, py + 40, 80, 22, 'รื้อทิ้ง', () => { const r = act('defRemove', { slot: i }); if (refused(r)) fail(r); else done(h, 'รื้อแล้ว', '#ffb080'); }, { size: 7.5, color: 0x5a1a1a, disabled: !off }));
      } else {
        T(L + 8, py, 'สร้างป้อมในช่องนี้ (ใช้คลังหมู่บ้าน)', 9, '#ffe7a0');
        DEF_ORDER.forEach((t, j) => {
          const d = DEFENSES[t], c0 = d.costs[0], can = hallLv(s) >= d.hall;
          const bx = L + 8 + (j % 4) * ((CW - 16) / 4), by = py + 18 + Math.floor(j / 4) * 50, bw = (CW - 16) / 4 - 6;
          g.fillStyle(0x2a1d12, 0.9).fillRoundedRect(bx, by, bw, 46, 3);
          T(bx + 4, by + 2, `${d.icon} ${d.name}${can ? '' : ` 🔒หอ${d.hall}`}`, 8, can ? '#ffd84a' : '#7a6a5a');
          T(bx + 4, by + 16, `${RES_ICON.gold}${num(c0.gold ?? 0)} ${RES_ICON.wood}${num(c0.wood ?? 0)} ${RES_ICON.stone}${num(c0.stone ?? 0)}`, 7, '#c8e8b0');
          c.add(k.button(bx + 4, by + 28, bw - 8, 15, 'สร้าง', () => { const r = act('defBuild', { slot: i, type: t }); if (refused(r)) fail(r); else done(h, `เริ่มสร้าง${d.name}`); }, { size: 7.5, color: 0x1f4a2a, disabled: !off || !can }));
        });
      }
      break;
    }
    case 'goals': {
      T(L + 8, top + 6, 'ภารกิจกิลด์ประจำวัน — ทุกคนช่วยกันทำ ครบแล้วของเข้าคลัง + แต้มบุญให้คนที่ช่วย', 8.5, '#ffe7a0', CW - 16);
      goals(s).forEach((q, i) => {
        const e = GOAL_POOL.find(x => x.kind === q.kind)!, by = top + 30 + i * 60;
        g.fillStyle(0x2a1d12, 0.9).fillRoundedRect(L + 6, by, CW - 12, 54, 4);
        T(L + 14, by + 4, `${q.done ? '✅' : '🎯'} ${e.name} ${num(Math.min(q.have, q.need))}/${num(q.need)}`, 10, q.done ? '#9fffb0' : '#ffd84a');
        k.bar(g, L + 14, by + 22, CW - 40, 7, Math.min(1, q.have / q.need), q.done ? 0x4ad86a : 0xd8a83a);
        const rw = (['gold', 'wood', 'stone', 'food'] as const).filter(r => e.reward[r]).map(r => `${RES_ICON[r]}${num(e.reward[r]!)}`).join(' ');
        T(L + 14, by + 34, `รางวัลเข้าคลัง ${rw}  •  แต้มบุญ +${e.pts}  •  คุณช่วยไป ${num(q.mine)}`, 8, '#e8dcc0');
      });
      T(L + 8, top + 214, 'ตัดไม้/ขุดหิน/ส่งแร่ = ในป่าดงดิบ • ล่ามอน = แผนที่มอน • ล่าสัตว์ = ป่าดงดิบ', 7.5, '#a89878', CW - 16);
      break;
    }
    case 'shop': {
      T(L + 8, top + 6, `แลกของด้วยแต้มบุญ (มี ${num(me.pts)})`, 9, '#ffe7a0');
      const day = new Date(now).toDateString();
      GUILD_SHOP.forEach((e, i) => {
        const d = itemDef(e.id), bx = L + 8 + (i % 3) * ((CW - 16) / 3), by = top + 26 + Math.floor(i / 3) * 70, bw = (CW - 16) / 3 - 6;
        const used = g0.shop.day && new Date(now).toDateString() === day ? (g0.shop.bought[e.id] ?? 0) : 0;
        g.fillStyle(0x2a1d12, 0.9).fillRoundedRect(bx, by, bw, 64, 4);
        if (ui.textures.exists(`icon_${d.icon}`)) c.add(h.ico(bx + 20, by + 22, `icon_${d.icon}`, 30));
        T(bx + 40, by + 6, d.name, 9, '#' + RARITY_COLORS[d.rarity].toString(16).padStart(6, '0'), bw - 44);
        T(bx + 40, by + 22, `${e.pts} แต้ม • วันนี้อีก ${Math.max(0, e.daily - used)}`, 7.5, '#e8dcc0');
        c.add(k.button(bx + 6, by + 42, bw - 12, 18, 'แลก', () => { const r = act('guildShop', { id: e.id }); if (refused(r)) fail(r); else done(h, `ได้ ${d.name}!`); }, { size: 8, color: 0x1f4a2a, disabled: me.pts < e.pts }));
      });
      break;
    }
    case 'raid': {
      const sh = g0.shieldUntil - now;
      T(L + 8, top + 6, `ปล้นได้อีกวันนี้ ${raidsLeft(s)} ครั้ง • ${sh > 0 ? `โล่ของเรายังอยู่ ${hrs(sh)} (ไปปล้น = โล่หาย)` : 'ไม่มีโล่'} • ระบบจับคู่หมู่บ้านพลังใกล้กันให้ 3 แห่งต่อวัน`, 8, '#ffe7a0', CW - 16);
      T(L + 8, top + 22, 'เข้าไปทำลายอาคาร/ป้อมใน 3 นาที • ⭐ ทำลายครึ่งหนึ่ง หรือหอกิลด์ • ⭐⭐ หอกิลด์+ครึ่งหนึ่ง • ⭐⭐⭐ ทั้งหมด • ของที่ได้เข้าคลังหมู่บ้านเรา', 7.5, '#9ad8ff', CW - 16);
      rivals(s).forEach((r, i) => {
        const by = top + 50 + i * 64, st = rivalStructs(r), rich = r.treasury.gold + r.treasury.wood + r.treasury.stone;
        g.fillStyle(0x2a1d12, 0.9).fillRoundedRect(L + 6, by, CW - 12, 58, 4).lineStyle(1, GOLD_D, 1).strokeRoundedRect(L + 6, by, CW - 12, 58, 4);
        T(L + 14, by + 4, `⚔ ${r.name}`, 10, '#ffd84a');
        T(L + 14, by + 22, `หอกิลด์ Lv${r.hall} • ป้อม ${r.defenses.length} • ทหาร ${r.guards} • อาคาร ${st.length - r.defenses.length}`, 8, '#e8dcc0');
        T(L + 14, by + 38, `คลัง: ${rich > 60000 ? 'ร่ำรวย 💰💰💰' : rich > 25000 ? 'ปานกลาง 💰💰' : 'น้อย 💰'}`, 8, '#c8e8b0');
        c.add(k.button(R - 120, by + 16, 104, 26, '⚔ บุกปล้น', () => { const rr = act('raidStart', { id: r.id }); if (refused(rr)) { fail(rr); return; } h.close(); bus.emit('td:raid', rr); }, { size: 10, color: 0x7a1a10, disabled: !off || raidsLeft(s) <= 0 }));
      });
      if (!rivals(s).length) T(L + 12, top + 60, 'วันนี้ไม่มีเป้าหมายเหลือแล้ว พรุ่งนี้มาใหม่', 9, '#a89878');
      if (!off) T(L + 8, top + H - 80, 'เฉพาะหัวหน้า/รองหัวหน้าที่สั่งบุกได้', 8, '#ffb080');
      break;
    }
    case 'log': {
      g0.log.slice(0, 15).forEach((l, i) => T(L + 10, top + 6 + i * 15, `${new Date(l.t).toLocaleString().slice(0, 16)}  ${l.text}`, 8, l.kind === 'defend' ? '#ff9a7a' : l.kind === 'raid' ? '#ffd84a' : '#e8dcc0', CW - 20));
      if (!g0.log.length) T(L + 10, top + 10, 'ยังไม่มีบันทึก', 9, '#a89878');
      break;
    }
  }
}

/** not in a guild yet: found one (Lv20+) or join one of the guilds looking for members */
function buildNoGuild(h: GuildHost, c: Phaser.GameObjects.Container, x: number, y: number, W: number, H: number, g: Phaser.GameObjects.Graphics) {
  const s = S(), k = h.k, L = x + 12, top = y + 30, CW = W - 24;
  g.fillStyle(0x0a0705, 0.6).fillRoundedRect(L, top, CW, H - 40, 4);
  const T = (tx: number, ty: number, t: string, size = 8.5, col = '#e8dcc0') => { const o = k.text(tx, ty, t, size, col, { wordWrap: { width: CW - 20 } }); c.add(o); return o; };
  T(L + 10, top + 8, 'หมู่บ้านกิลด์ — ย้ายไปอยู่กับเพื่อนในหมู่บ้านของกิลด์เอง: สร้างบ้านของตัวเอง ช่วยกันอัปอาคาร จ้างทหาร สร้างป้อม และบุกปล้นกิลด์อื่น', 9, '#ffe7a0');
  if (!guildUnlocked(s)) {
    T(L + 10, top + 52, `🔒 ปลดล็อกเมื่อเลเวล ${GUILD_UNLOCK_LV} (ตอนนี้ Lv${s.level})`, 11, '#ff8a7a');
    T(L + 10, top + 76, 'ระหว่างนี้อยู่หมู่บ้านเริ่มต้นไปก่อน — ฟาร์ม เก็บของ อัปบ้าน ของที่มีจะติดตัวไปหมู่บ้านกิลด์ด้วย', 8.5, '#a89878');
    return;
  }
  T(L + 10, top + 44, '👑 ก่อตั้งกิลด์ใหม่ (คุณเป็นหัวหน้า • หมู่บ้านใหม่ อาคาร Lv1 • ได้ทุนตั้งต้นในคลัง • โล่ 3 วัน)', 8.5, '#9fffb0');
  c.add(k.button(L + 10, top + 62, 180, 24, '🏰 ก่อตั้งกิลด์', () => {
    const nm = (typeof window !== 'undefined' ? window.prompt('ตั้งชื่อกิลด์ (2-24 ตัวอักษร)', `กิลด์ของ${s.name || 'ฉัน'}`) : null); if (!nm) return;
    const r = act('guildCreate', { name: nm }); if (refused(r)) fail(r); else { done(h, `ก่อตั้ง ${nm} แล้ว! ไปหมู่บ้านกิลด์ได้ที่ประตูหมู่บ้าน`); bus.emit('td:guildHome'); }
  }, { size: 10, color: 0x6a4a1a }));
  T(L + 10, top + 100, '🤝 หรือเข้าร่วมกิลด์ที่กำลังหาสมาชิก (จำลอง — รอเซิร์ฟจริง)', 8.5, '#9ad8ff');
  guildOffers(s).forEach((o, i) => {
    const by = top + 120 + i * 40;
    g.fillStyle(0x2a1d12, 0.9).fillRoundedRect(L + 8, by, CW - 16, 34, 4);
    T(L + 16, by + 4, `🏛 ${o.name}`, 9.5, '#ffd84a');
    T(L + 16, by + 19, `หัวหน้า ${o.leader} • สมาชิก ${o.members}/${GUILD_MAX} • หอกิลด์ Lv${o.hall}`, 8, '#e8dcc0');
    c.add(k.button(L + CW - 104, by + 6, 88, 22, 'เข้าร่วม', () => { const r = act('guildJoin', { id: o.id }); if (refused(r)) fail(r); else { done(h, `เข้าร่วม ${o.name} แล้ว!`); bus.emit('td:guildHome'); } }, { size: 9, color: 0x1f4a2a }));
  });
}

/** the private chest in your house: items kept at home don't take bag space */
export function buildStash(h: GuildHost, c: Phaser.GameObjects.Container) {
  const s = S(), k = h.k, ui = h.scene, hm = homeOf(s), lv = houseLv(s), cap = stashSlots(lv);
  const W = Math.min(560, (ui as unknown as { VW: number }).VW - 16), H = 300;
  const { x, y, g } = h.window(c, W, H, `🧰 หีบส่วนตัว ${hm.stash.length}/${cap}`);
  const half = (W - 36) / 2, L = x + 12, R = L + half + 12, top = y + 30;
  g.fillStyle(0x0a0705, 0.6).fillRoundedRect(L, top, half, H - 40, 4).fillRoundedRect(R, top, half, H - 40, 4);
  c.add(k.text(L + 6, top + 4, `กระเป๋า ${s.inventory.length}/${invSize(s)} (แตะ = ฝาก)`, 8.5, '#ffe7a0'));
  c.add(k.text(R + 6, top + 4, 'ในหีบ (แตะ = เอาออก)', 8.5, '#ffe7a0'));
  const cell = (bx: number, by: number, it: { id: string; qty: number; rar?: number }, cb: () => void) => {
    const d = itemDef(it.id), rar = it.rar ?? d.rarity;
    g.fillStyle(0x2a1d12, 0.95).fillRoundedRect(bx, by, 30, 30, 3).lineStyle(1, RARITY_COLORS[rar], 1).strokeRoundedRect(bx, by, 30, 30, 3);
    if (ui.textures.exists(`icon_${d.icon}`)) c.add(h.ico(bx + 15, by + 15, `icon_${d.icon}`, 30));
    if (it.qty > 1) c.add(k.text(bx + 28, by + 20, String(it.qty), 7, '#ffffff').setOrigin(1, 0));
    const z = ui.add.zone(bx, by, 30, 30).setOrigin(0).setInteractive(); z.on('pointerup', cb); c.add(z);
  };
  const per = Math.floor((half - 8) / 33);
  s.inventory.filter(it => !isEquipped(s, it.uid)).slice(0, per * 7).forEach((it, i) => cell(L + 5 + (i % per) * 33, top + 20 + Math.floor(i / per) * 33, it, () => { const r = act('stashPut', { uid: it.uid }); if (refused(r)) fail(r); else { sfx.page(); h.rebuild(); } }));
  hm.stash.slice(0, per * 7).forEach((it, i) => cell(R + 5 + (i % per) * 33, top + 20 + Math.floor(i / per) * 33, it, () => { const r = act('stashTake', { i }); if (refused(r)) fail(r); else { sfx.page(); h.rebuild(); } }));
  if (!cap) c.add(k.text(R + 8, top + 30, 'สร้างบ้านก่อนจึงจะมีหีบ', 9, '#ff8a7a'));
}

/** the trophy shelf: Super Rare and better gear on display gives small permanent bonuses */
export function buildTrophy(h: GuildHost, c: Phaser.GameObjects.Container) {
  const s = S(), k = h.k, ui = h.scene, hm = homeOf(s), lv = houseLv(s), cap = trophySlots(lv);
  const W = Math.min(560, (ui as unknown as { VW: number }).VW - 16), H = 300;
  const { x, y, g } = h.window(c, W, H, `🏆 ตู้โชว์ถ้วยรางวัล ${hm.trophies.length}/${cap}`);
  const L = x + 12, top = y + 30, CW = W - 24;
  const sum = { atk: 0, def: 0, hp: 0 }; for (const it of hm.trophies) { const b = TROPHY_BONUS[Math.min(5, it.rar ?? itemDef(it.id).rarity)]; if (b) { sum.atk += b.atk; sum.def += b.def; sum.hp += b.hp; } }
  c.add(k.text(L, top, `ของในตู้ให้พลังถาวร: ATK/MATK +${sum.atk}%  DEF +${sum.def}%  HP +${sum.hp}%   (ช่องเพิ่มตามเลเวลบ้าน)`, 8.5, '#9fffb0'));
  for (let i = 0; i < 6; i++) {
    const bx = L + i * ((CW) / 6), it = hm.trophies[i], open = i < cap;
    g.fillStyle(open ? 0x2a1d12 : 0x120d0a, 0.95).fillRoundedRect(bx, top + 18, CW / 6 - 6, 70, 4).lineStyle(1, it ? RARITY_COLORS[it.rar ?? 3] : GOLD_D, 1).strokeRoundedRect(bx, top + 18, CW / 6 - 6, 70, 4);
    if (it) {
      const d = itemDef(it.id); if (ui.textures.exists(`icon_${d.icon}`)) c.add(h.ico(bx + (CW / 6 - 6) / 2, top + 44, `icon_${d.icon}`, 40));
      c.add(k.text(bx + 4, top + 68, d.name, 7, '#ffe7a0', { wordWrap: { width: CW / 6 - 12 } }));
      const z = ui.add.zone(bx, top + 18, CW / 6 - 6, 70).setOrigin(0).setInteractive(); z.on('pointerup', () => { const r = act('trophyTake', { i }); if (refused(r)) fail(r); else { sfx.page(); bus.emit(EV.STATE_CHANGED); h.rebuild(); } }); c.add(z);
    } else c.add(k.text(bx + 8, top + 46, open ? 'ว่าง' : '🔒', 9, '#7a6a5a'));
  }
  c.add(k.text(L, top + 96, 'อุปกรณ์ Super Rare ขึ้นไปในกระเป๋า (แตะ = ตั้งโชว์ • ตั้งโชว์แล้วใส่ไม่ได้)', 8.5, '#ffe7a0'));
  const pool = s.inventory.filter(it => !isEquipped(s, it.uid) && ['weapon', 'armor', 'accessory'].includes(itemDef(it.id).type) && (it.rar ?? itemDef(it.id).rarity) >= 3);
  pool.slice(0, 12).forEach((it, i) => {
    const d = itemDef(it.id), rar = it.rar ?? d.rarity, bx = L + (i % 6) * (CW / 6), by = top + 114 + Math.floor(i / 6) * 60;
    g.fillStyle(0x2a1d12, 0.95).fillRoundedRect(bx, by, CW / 6 - 6, 54, 4).lineStyle(1, RARITY_COLORS[rar], 1).strokeRoundedRect(bx, by, CW / 6 - 6, 54, 4);
    if (ui.textures.exists(`icon_${d.icon}`)) c.add(h.ico(bx + 18, by + 18, `icon_${d.icon}`, 30));
    c.add(k.text(bx + 36, by + 4, RARITY_NAMES[rar], 7, '#' + RARITY_COLORS[rar].toString(16).padStart(6, '0')));
    c.add(k.text(bx + 4, by + 36, d.name, 7, '#e8dcc0', { wordWrap: { width: CW / 6 - 12 } }));
    const z = ui.add.zone(bx, by, CW / 6 - 6, 54).setOrigin(0).setInteractive(); z.on('pointerup', () => { const r = act('trophyPut', { uid: it.uid }); if (refused(r)) fail(r); else { sfx.levelUp(); bus.emit(EV.STATE_CHANGED); h.rebuild(); } }); c.add(z);
  });
  if (!pool.length) c.add(k.text(L + 4, top + 118, 'ยังไม่มีของ Super Rare ขึ้นไป — ล่าบอส/มอนทอง/ดันเจี้ยน', 8.5, '#a89878'));
  c.add(k.text(L, top + H - 50, `🛏 พลังพักผ่อนตอนนี้ ${num(hm.rest)}/${num(restCap(lv))} ตัว (EXP +${REST_EXP}%) — นอนที่เตียงก่อนออกเกม`, 8, '#9ad8ff'));
}
