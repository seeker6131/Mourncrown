// Retention systems — pure rules (server-side when online): first-time tutorial reward, 7-day login calendar.
import { invSize } from '../core/state';
import { itemDef } from '../data/items';
import type { GameState } from '../core/state';
import { addItem } from './inventory';
import { dayKey } from './daily';

// ---- tutorial (first 5 minutes): the steps are checked by the client, the one-time reward is paid by the server ----
export const TUT_STEPS = [
  'ลากนิ้วด้านซ้ายของจอเพื่อเดิน',
  'แตะปุ่มดาบขวาล่าง (หรือแตะจอด้านขวา) เพื่อโจมตี',
  'เดินไปที่ ประตูแผนที่ ▲ ตามลูกศรเหลือง แล้วเลือกแผนที่ 1',
  'ปราบมอนสเตอร์ 3 ตัว — มอนไม่ตีก่อน เข้าไปตีได้เลย',
  'แตะกล่องภารกิจซ้ายบนเพื่อรับรางวัล',
  'แตะปุ่ม AUTO ให้ตัวละครตีมอนเอง',
  'กลับหมู่บ้าน: ใช้ประตู "กลับหมู่บ้าน" ทางซ้ายของแผนที่ (ดูมินิแมพมุมขวาบน)',
  'ประตูซ้ายของหมู่บ้าน = 🌿 ป่าดงดิบ: ตัดไม้ ขุดแร่ ล่าสัตว์ เข้าไปดูเลย',
  'แตะปุ่มดาบข้างต้นไม้หรือก้อนหินเพื่อเก็บทรัพยากร',
];
export const TUT_REWARD = { gold: 300, items: { hp_potion: 5, scroll_return: 2 } };
type TS = GameState & { tut?: number; tutBase?: number; tutPaid?: boolean };
export const tutStep = (s: GameState) => (s as TS).tut ?? 0;
export const tutActive = (s: GameState) => tutStep(s) >= 0 && tutStep(s) < TUT_STEPS.length;
export function tutPay(s: GameState) {
  const t = s as TS; if (t.tutPaid) return false;
  t.tutPaid = true; t.tut = -1; s.gold += TUT_REWARD.gold;
  for (const [id, n] of Object.entries(TUT_REWARD.items)) addItem(s, id, n);
  return true;
}

// ---- 7-day login calendar: one claim per calendar day, the 7-day cycle repeats ----
export interface LoginReward { gold?: number; items?: Record<string, number>; label: string }
export const LOGIN_REWARDS: LoginReward[] = [
  { gold: 300, items: { hp_potion: 5 }, label: '💰300 + ยา 5' },
  { items: { mana_shard: 3 }, label: 'ผลึกมานา 3' },
  { gold: 500, items: { scroll_return: 3 }, label: '💰500 + ม้วนกลับ 3' },
  { items: { tonic_exp: 2 }, label: 'ยา EXP 2' },
  { items: { elix_iron: 2 }, label: 'ยาเหล็กกล้า 2' },
  { gold: 1000, items: { hp_potion_l: 5 }, label: '💰1000 + ยาใหญ่ 5' },
  { items: { gem_emerald: 1, mana_shard: 5 }, label: '💎มรกตพงไพร + ผลึก 5' },
];
type LS = GameState & { login?: { n: number; last: string } };
export function loginInfo(s: GameState, now = Date.now()) {
  const l = (s as LS).login ?? { n: 0, last: '' };
  const ready = l.last !== dayKey(now);
  return { ready, day: l.n % 7, total: l.n };
}
/** room in the bag for a day's items (a stack already held needs no new slot) */
export function loginFits(s: GameState, r: LoginReward) {
  const need = Object.keys(r.items ?? {}).filter(id => !(itemDef(id).stack && s.inventory.some(i => i.id === id))).length;
  return s.inventory.length + need <= invSize(s);
}
export function claimLogin(s: GameState, now = Date.now()) {
  const st = s as LS, info = loginInfo(s, now); if (!info.ready) return null;
  const r = LOGIN_REWARDS[info.day];
  if (!loginFits(s, r)) return 'bag' as const;   // (a full bag: wait instead of losing the items)
  s.gold += r.gold ?? 0; for (const [id, n] of Object.entries(r.items ?? {})) addItem(s, id, n);
  st.login = { n: info.total + 1, last: dayKey(now) };
  return r;
}
