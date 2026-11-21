// 🧹 The OBT wipe (director 20 Nov): every character starts over (Lv1, nothing) except what the admin ticks to keep in the
// back office. The money records always stay (slip refs, top-up totals, supporter total) — a slip can never pay twice.
// Runs on the server (server/worker.ts /admin/obt) over the D1 `saves` rows; a backup table is made first.
import { newGameState } from '../core/state';
import { addItem, equip } from './inventory';
import { derive } from './stats';

export interface KeepOpt { id: string; label: string; def: boolean; keys: string[]; note?: string }
/** the ticks in the back office (def = ticked at first). Wings / mounts / titles are partly kept by filters below. */
export const KEEP_OPTS: KeepOpt[] = [
  { id: 'name', label: 'ชื่อตัวละคร + หน้าตา (ชาย/หญิง)', def: true, keys: ['name', 'look'] },
  { id: 'vip', label: '👑 VIP วันที่เหลือ', def: false, keys: ['vipTier', 'vipUntil', 'vipGift'] },   // (director 21 Nov: VIP is not kept)
  { id: 'wheel', label: '🎡 ของจากกงล้อเพชร (เมฆพายุ สกินม้าดำ ชื่อทอง ออร่าพายุ เอฟเฟกต์ดาบ กระเป๋า+5 ดาว⭐)', def: true,
    keys: ['pets', 'petOn', 'skins', 'horseSkin', 'nameColors', 'nameColor', 'auraLtd', 'fxOwned', 'fx', 'bagPlus', 'stars'] },
  { id: 'wingLtd', label: '🪽 ปีก Limited (พายุอสนี / จักรวาล / เทวาตกสวรรค์)', def: true, keys: [] },
  { id: 'wingAll', label: '🪽 ปีกทุกแบบ (Legend / SL ด้วย)', def: false, keys: [] },
  { id: 'dragon', label: '🐉 มังกรเพลิงนิรันดร์ (Limited)', def: true, keys: [] },
  { id: 'mounts', label: '🐎 สัตว์ขี่ทุกตัว', def: false, keys: [] },
  { id: 'titleSp', label: '🏷 ฉายาพิเศษ (ผู้บุกเบิก / ผู้บุกเบิกพายุ / ผู้สนับสนุน)', def: true, keys: [] },
  { id: 'titleAll', label: '🏷 ฉายาจากความสำเร็จทุกอัน', def: false, keys: [] },
  { id: 'slots', label: '👥 ช่องตัวละครที่ซื้อด้วยเพชร', def: true, keys: ['slotsBought'] },
  { id: 'settings', label: '⚙ การตั้งค่า (ปุ่ม เสียง ยาออโต้ เก็บของ)', def: true, keys: ['uiOpt', 'music', 'sfx', 'pot', 'lootOpt', 'introSeen'] },
  { id: 'guild', label: '🏛 กิลด์ (ไม่ติ๊ก = ยุบกิลด์ทั้งหมด)', def: false, keys: ['guild', 'guildId'] },
];
/** always kept, whatever is ticked: the money records + the diamonds (bought with real money — director 21 Nov) */
export const ALWAYS_KEEP = ['diamonds', 'payRefs', 'topups', 'topupThb', 'supPaid', 'supTier'];
export const LTD_WINGS = ['ltd', 'x_cosmos', 'x_fallen'];
export const SPECIAL_TITLE_IDS = ['cbt', 'storm', 'sup1', 'sup7'];
export const LTD_MOUNTS = ['dragon'];

type Any = Record<string, unknown>;
/** a character after the wipe: a fresh one + what is kept. `at` marks it (the server drops older copies in memory). */
export function wipeSave(old: Any, keep: string[], at: number): Any {
  const k = new Set(keep), fresh = newGameState();
  addItem(fresh, 'wood_sword'); addItem(fresh, 'cloth_tunic'); addItem(fresh, 'hp_potion', 5); addItem(fresh, 'mp_potion', 3);   // (the same start as a new player: core/save.ts startNewGame)
  equip(fresh, fresh.inventory[0].uid); equip(fresh, fresh.inventory[1].uid); { const d = derive(fresh); fresh.hp = d.maxHp; fresh.mp = d.maxMp; }
  const out = fresh as unknown as Any;
  for (const key of ALWAYS_KEEP) if (old[key] !== undefined) out[key] = old[key];
  for (const o of KEEP_OPTS) if (k.has(o.id)) for (const key of o.keys) if (old[key] !== undefined) out[key] = old[key];
  // wings: all, or only the Limited ones
  const wings = Array.isArray(old.wings) ? (old.wings as string[]) : [];
  const w = k.has('wingAll') ? wings : k.has('wingLtd') ? wings.filter(x => LTD_WINGS.includes(x)) : [];
  if (w.length) { out.wings = w; if (typeof old.wingOn === 'string' && w.includes(old.wingOn)) out.wingOn = old.wingOn; }
  // mounts: all, or only the Limited dragon
  const mounts = Array.isArray(old.mounts) ? (old.mounts as string[]) : [];
  const m = k.has('mounts') ? mounts : k.has('dragon') ? mounts.filter(x => LTD_MOUNTS.includes(x)) : [];
  if (m.length) { out.mounts = m; if (typeof old.mountLast === 'string' && m.includes(old.mountLast)) out.mountLast = old.mountLast; }
  // titles: all, or only the special ones
  const titles = Array.isArray(old.titles) ? (old.titles as string[]) : [];
  const t = k.has('titleAll') ? titles : k.has('titleSp') ? titles.filter(x => SPECIAL_TITLE_IDS.includes(x)) : [];
  if (t.length) { out.titles = t; if (typeof old.title === 'string' && t.includes(old.title)) out.title = old.title; }
  if (!k.has('name')) delete out.name;
  out.obtAt = at;
  return out;
}
/** what one character loses / keeps (the dry-run count in the back office) */
export function wipeSummary(rows: Any[], keep: string[]) {
  const k = new Set(keep); let dia = 0, vip = 0, wingsKept = 0, mountsKept = 0, gold = 0, lv = 0;
  for (const r of rows) {
    const n = wipeSave(r, keep, 1);
    dia += Number(n.diamonds) || 0; if (Number(n.vipUntil) > Date.now()) vip++;
    wingsKept += (n.wings as string[] | undefined)?.length ?? 0; mountsKept += (n.mounts as string[] | undefined)?.length ?? 0;
    gold += Number(r.gold) || 0; lv = Math.max(lv, Number(r.level) || 0);
  }
  return { players: rows.length, keep: [...k], diaKept: dia, vipKept: vip, wingsKept, mountsKept, goldGone: gold, topLevel: lv };
}
