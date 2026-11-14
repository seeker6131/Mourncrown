// Premium: 💎 diamonds (only from real-money top-ups) and VIP cards (3 / 7 / 15 days, real money).
// Design rule: NO pay-to-win — money buys time, comfort and looks, never stronger gear or better drop rarity.
// Online later: payments are verified on the server; the client never grants diamonds or VIP by itself.
import type { GameState } from '../core/state';
import { addItem } from './inventory';
import { dayKey } from './daily';

export const DIAMOND_PACKS = [
  { id: 'd60', diamonds: 60, bonus: 0, thb: 29 },
  { id: 'd300', diamonds: 300, bonus: 30, thb: 149 },
  { id: 'd680', diamonds: 680, bonus: 80, thb: 299 },
  { id: 'd1480', diamonds: 1480, bonus: 220, thb: 599 },
  { id: 'd3080', diamonds: 3080, bonus: 520, thb: 1190 },
];
export const VIP_CARDS = [
  { id: 'vip3', days: 3, thb: 39 },
  { id: 'vip7', days: 7, thb: 79 },
  { id: 'vip15', days: 15, thb: 149 },
];
export const VIP_PERKS = [
  'EXP x1.5 จากทุกอย่าง',
  'ทองจากมอน +30%',
  'กินเสบียงบนแผนที่มอนน้อยลง 30%',
  'ดันเจี้ยนรายวัน 3 รอบ (ปกติ 2)',
  'ฟาร์มทรัพยากรออโต้ในป่าดงดิบ (เลือกของและจำนวนเอง)',
  'กระเป๋า +20 ช่อง',
  'ซื้อยาได้ทุกที่ไม่ต้องกลับบ้าน + เลือกให้ระบบซื้อยาให้เองเมื่อหมด',
  'ของขวัญรายวัน: ม้วนกลับหมู่บ้าน x3 + ยาฟื้นพลังใหญ่ x5',
  'ป้าย VIP สีทองบนแถบสถานะ',
  'ออร่าพลังรอบตัว: 3 วัน สีฟ้า • 7 วัน สีม่วง • 15 วัน สีทอง',
  'เดินเร็วขึ้น 15% (ขี่ม้า/มังกรยังเร็วกว่า)',
  'ลงขายของในตลาดกลางได้ทุกที่ ไม่ต้องกลับหมู่บ้าน',
  'สะสมเวลาบัพยา/อาหารชนิดเดียวกันได้ถึง 3 ชม. (ปกติ 1 ชม.)',
];
/** things diamonds buy — comfort and looks only */
export interface DiamondItem { id: string; name: string; desc: string; price: number; soon?: boolean }
export const DIAMOND_SHOP: DiamondItem[] = [
  { id: 'bag10', name: 'ขยายกระเป๋า +10 ช่อง (ถาวร)', desc: 'เก็บของได้มากขึ้น ซื้อซ้ำได้สูงสุด 5 ครั้ง', price: 120 },
  { id: 'fx_gold', name: 'เอฟเฟกต์ดาบ: เปลวทอง', desc: 'รอยฟันและแสงโจมตีเป็นสีทอง (ความสวยอย่างเดียว)', price: 300 },
  { id: 'fx_void', name: 'เอฟเฟกต์ดาบ: ม่วงทมิฬ', desc: 'รอยฟันและแสงโจมตีเป็นสีม่วงเข้ม', price: 300 },
  { id: 'fx_frost', name: 'เอฟเฟกต์ดาบ: น้ำแข็ง', desc: 'รอยฟันและแสงโจมตีเป็นสีฟ้าน้ำแข็ง', price: 300 },
  { id: 'fx_blood', name: 'เอฟเฟกต์ดาบ: เลือดชาด', desc: 'รอยฟันและแสงโจมตีเป็นสีแดงเลือด', price: 300 },
  { id: 'scroll10', name: 'ม้วนกลับหมู่บ้าน x10', desc: 'ประหยัดเวลาเดินกลับ', price: 40 },
  { id: 'build_now', name: 'สร้าง/อัปอาคารเสร็จทันที', desc: 'ข้ามเวลารอก่อสร้างทุกหลังที่กำลังสร้างอยู่', price: 30 },
  { id: 'costume', name: 'ชุดแฟชั่น (สกินตัวละคร)', desc: 'เปลี่ยนรูปลักษณ์ ไม่เพิ่มค่าพลัง', price: 600, soon: true },
  { id: 'pet', name: 'สัตว์เลี้ยงติดตาม', desc: 'เดินตามตัว เก็บของให้อัตโนมัติ (ไม่เพิ่มพลัง)', price: 800, soon: true },
  { id: 'house_skin', name: 'สกินบ้าน / ของแต่งหมู่บ้าน', desc: 'แต่งบ้านของคุณให้ไม่เหมือนใคร', price: 400, soon: true },
  { id: 'title', name: 'ฉายา + สีชื่อ', desc: 'โชว์บนหัวตัวละครในโหมดออนไลน์', price: 150, soon: true },
  { id: 'rename', name: 'เปลี่ยนชื่อตัวละคร', desc: 'ใช้ได้เมื่อระบบออนไลน์เปิด', price: 200, soon: true },
];

type PS = GameState & { diamonds?: number; vipUntil?: number; vipTier?: number; auraOff?: boolean; vipGift?: string; bagPlus?: number; fxOwned?: string[]; fx?: string };
export const diamonds = (s: GameState) => (s as PS).diamonds ?? 0;
export const vipActive = (s: GameState, now = Date.now()) => ((s as PS).vipUntil ?? 0) > now;
export const vipLeftMs = (s: GameState, now = Date.now()) => Math.max(0, ((s as PS).vipUntil ?? 0) - now);
/** grant after a VERIFIED purchase (server-side when online); stacks onto remaining time */
export function grantVip(s: GameState, days: number, now = Date.now()) {
  const p = s as PS, tier = days >= 15 ? 3 : days >= 7 ? 2 : 1;
  p.vipTier = (p.vipUntil ?? 0) > now ? Math.max(p.vipTier ?? 1, tier) : tier;   // the best card in this VIP run
  p.vipUntil = Math.max(p.vipUntil ?? 0, now) + days * 86400000;
}
/** VIP card tier while VIP lasts: 1 = 3-day, 2 = 7-day, 3 = 15-day (aura colour) — 0 when not VIP */
export const vipTier = (s: GameState, now = Date.now()) => vipActive(s, now) ? (s as PS).vipTier ?? 1 : 0;
/** VIP walks a little faster on foot — slower than the horse (x1.3) and the dragon (x1.5) */
export const VIP_WALK = 1.15;
/** aura colours by VIP card: 3 days = sky blue, 7 days = violet, 15 days = gold */
export const VIP_AURA: Record<number, { name: string; col: number; tints: number[] }> = {
  1: { name: 'ฟ้าคราม', col: 0x5ad8ff, tints: [0xe0faff, 0x5ad8ff, 0x1a8aff] },
  2: { name: 'ม่วงทมิฬ', col: 0xb05aff, tints: [0xf0c8ff, 0xb05aff, 0x6a1aff] },
  3: { name: 'ทองราชันย์', col: 0xffd23a, tints: [0xfff2a0, 0xffd23a, 0xff9a1a] },
  4: { name: 'พายุ', col: 0x9ad8ff, tints: [0xffffff, 0xfff27a, 0x9ad8ff, 0x8a6aff] },   // (the diamond wheel's 30-day storm aura)
};
export function grantDiamonds(s: GameState, n: number) { const p = s as PS; p.diamonds = (p.diamonds ?? 0) + n; }

/** daily VIP gift; returns false if not VIP or already claimed today */
export function claimVipGift(s: GameState, now = Date.now()) {
  const p = s as PS, d = dayKey(now);
  if (!vipActive(s, now) || p.vipGift === d) return false;
  p.vipGift = d; addItem(s, 'scroll_return', 3); addItem(s, 'hp_potion_l', 5);
  return true;
}
export const vipGiftReady = (s: GameState, now = Date.now()) => vipActive(s, now) && (s as PS).vipGift !== dayKey(now);

export type BuyResult = 'ok' | 'diamonds' | 'soon' | 'owned' | 'max';
export function buyDiamondItem(s: GameState, id: string, now = Date.now()): BuyResult {
  const p = s as PS, it = DIAMOND_SHOP.find(q => q.id === id);
  if (!it || it.soon) return 'soon';
  if (id.startsWith('fx_') && (p.fxOwned ?? []).includes(id)) { p.fx = id; return 'owned'; }
  if (id === 'bag10' && (p.bagPlus ?? 0) >= 50) return 'max';
  if (diamonds(s) < it.price) return 'diamonds';
  p.diamonds = diamonds(s) - it.price;
  if (id === 'bag10') p.bagPlus = (p.bagPlus ?? 0) + 10;
  else if (id.startsWith('fx_')) { p.fxOwned = [...(p.fxOwned ?? []), id]; p.fx = id; }
  else if (id === 'scroll10') addItem(s, 'scroll_return', 10);
  else if (id === 'build_now') for (const b of s.buildings) if (b.done && b.done > now) b.done = now;
  return 'ok';
}
/** cosmetic slash colour (null = the form's own colour) */
export const FX_COLOR: Record<string, number> = { fx_gold: 0xffc83a, fx_void: 0xa040ff, fx_frost: 0x7ae0ff, fx_blood: 0xff2a3a };
export const slashFx = (s: GameState) => { const f = (s as PS).fx; return f ? FX_COLOR[f] ?? null : null; };
