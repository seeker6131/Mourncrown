// The mailbox (director): gifts and rewards come as letters the player opens and claims — from the admin's back office
// (one player, or everyone), compensation, events. The letters live in the server's copy of the character (never
// written by the device); claiming adds the gift, all or nothing (a full bag keeps the letter for later).
import type { GameState } from '../core/state';
import { addItem } from './inventory';
import { ITEMS } from '../data/items';
import { invSize } from '../core/state';
import { grantCbt, cbtGot, CBT_VIP_DAYS, CBT_TITLE, CBT_PACK } from './cbtGift';

export interface Gift { gold?: number; wood?: number; stone?: number; food?: number; items?: { id: string; qty: number }[] }
export interface Mail extends Gift { id: string; at: number; from: string; title: string; text: string; until?: number; claimed?: number; read?: boolean; /** 'cbt' = the CBT testers' gift (VIP 7 days + title + pack) */ kind?: 'cbt' }
type MS = GameState & { mail?: Mail[]; mailAll?: number };
export const MAIL_MAX = 60;
export const mailOf = (s: GameState) => ((s as MS).mail ??= []);
export const hasGift = (m: Mail) => !!(m.kind || m.gold || m.wood || m.stone || m.food || m.items?.length);
export const mailLive = (m: Mail, now = Date.now()) => !m.until || now < m.until;
/** letters waiting: gifts not yet claimed (and still in date) + unread letters */
export const mailWaiting = (s: GameState, now = Date.now()) => mailOf(s).filter(m => mailLive(m, now) && ((hasGift(m) && !m.claimed) || !m.read)).length;
/** the gift as short text: 💰 500 • 🪵 100 • ยาฟื้นพลังใหญ่ x5 */
export function giftText(g: Gift & { kind?: string }) {
  const out: string[] = [];
  if (g.kind === 'cbt') return `👑 VIP ${CBT_VIP_DAYS} วัน • 🏷 ฉายา「${CBT_TITLE.title}」• 💰 ${CBT_PACK.gold.toLocaleString()} • ยาฟื้นพลังใหญ่ x${CBT_PACK.potL} • ม้วนกลับหมู่บ้าน x${CBT_PACK.scroll}`;
  if (g.gold) out.push(`💰 ${g.gold.toLocaleString()}`);
  if (g.wood) out.push(`🪵 ${g.wood.toLocaleString()}`);
  if (g.stone) out.push(`🪨 ${g.stone.toLocaleString()}`);
  if (g.food) out.push(`🍖 ${g.food.toLocaleString()}`);
  for (const it of g.items ?? []) out.push(`${ITEMS[it.id]?.name ?? it.id}${it.qty > 1 ? ' x' + it.qty : ''}`);
  return out.join(' • ');
}
/** a clean gift (numbers in range, only real items) */
export function cleanGift(g: Gift): Gift {
  const n = (v: unknown) => Math.max(0, Math.min(10_000_000, Math.floor(Number(v) || 0)));
  const items = (g.items ?? []).filter(i => ITEMS[String(i.id)]).slice(0, 20).map(i => ({ id: String(i.id), qty: Math.max(1, Math.min(999, Math.floor(Number(i.qty) || 1))) }));
  return { gold: n(g.gold), wood: n(g.wood), stone: n(g.stone), food: n(g.food), ...(items.length ? { items } : {}) };
}
/** (server) drop a letter in the mailbox; the oldest finished letters make room */
export function addMail(s: GameState, m: Omit<Mail, 'id' | 'at'> & { id?: string; at?: number }, now = Date.now()) {
  const box = mailOf(s), id = m.id ?? `${now.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  if (box.some(q => q.id === id)) return null;
  const cg = cleanGift(m);
  const mail: Mail = { ...m, ...cg, items: cg.items, id, at: m.at ?? now, title: String(m.title ?? '').slice(0, 40) || 'จดหมาย', text: String(m.text ?? '').slice(0, 300), from: String(m.from ?? 'ระบบ').slice(0, 24) };
  if (!mail.items) delete mail.items;   // (only real items, cleaned — never what was passed in)
  box.unshift(mail);
  while (box.length > MAIL_MAX) { const i = box.map(q => !hasGift(q) || !!q.claimed || !mailLive(q, now)).lastIndexOf(true); box.splice(i >= 0 ? i : box.length - 1, 1); }
  return mail;
}
export function readMail(s: GameState, id: string) { const m = mailOf(s).find(q => q.id === id); if (!m) return false; m.read = true; return true; }
/** claim a letter's gift: all of it or nothing (the bag must have room for the items that do not stack) */
export function claimMail(s: GameState, id: string, now = Date.now()): 'missing' | 'claimed' | 'expired' | 'bag' | { got: string } {
  const m = mailOf(s).find(q => q.id === id); if (!m || !hasGift(m)) return 'missing';
  if (m.claimed) return 'claimed';
  if (!mailLive(m, now)) return 'expired';
  if (m.kind === 'cbt') {   // the CBT gift: the same as the menu's button, once per account
    if (cbtGot(s)) { m.claimed = now; m.read = true; return 'claimed'; }
    const need = ['hp_potion_l', 'scroll_return'].filter(id => !s.inventory.some(i => i.id === id)).length;
    if (s.inventory.length + need > invSize(s)) return 'bag';
    if (grantCbt(s, now) !== true) return 'expired';
    m.claimed = now; m.read = true; return { got: giftText(m) };
  }
  const items = m.items ?? [], need = items.reduce((n, it) => n + (ITEMS[it.id]?.stack ? (s.inventory.some(i => i.id === it.id) ? 0 : 1) : it.qty), 0);
  if (s.inventory.length + need > invSize(s)) return 'bag';
  s.gold += m.gold ?? 0; s.res.wood += m.wood ?? 0; s.res.stone += m.stone ?? 0; s.res.food += m.food ?? 0;
  for (const it of items) { if (ITEMS[it.id]?.stack) addItem(s, it.id, it.qty); else for (let i = 0; i < it.qty; i++) addItem(s, it.id, 1); }
  m.claimed = now; m.read = true;
  return { got: giftText(m) };
}
/** throw away a letter that has nothing left to claim */
export function deleteMail(s: GameState, id: string) {
  const box = mailOf(s), i = box.findIndex(q => q.id === id); if (i < 0) return false;
  const m = box[i]; if (hasGift(m) && !m.claimed && mailLive(m)) return false;
  box.splice(i, 1); return true;
}
/** the letters to everyone (back office) this hero has not had yet: the server puts them in, once each */
export function takeMailAll(s: GameState, rows: { id: number; at: number; title: string; text: string; gift: string; until: number }[], now = Date.now()) {
  const ms = s as MS; let n = 0;
  for (const r of rows.sort((a, b) => a.id - b.id)) {
    if (r.id <= (ms.mailAll ?? 0)) continue;
    ms.mailAll = r.id;
    if (r.until && now >= r.until) continue;
    let g: Gift = {}; try { g = JSON.parse(r.gift || '{}'); } catch { /* bad row */ }
    if (addMail(s, { id: 'all' + r.id, at: r.at, from: 'ทีมงาน Mourncrown', title: r.title, text: r.text, until: r.until || undefined, ...g }, now)) n++;
  }
  return n;
}
