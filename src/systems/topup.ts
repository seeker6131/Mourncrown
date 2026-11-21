// 💳 Real-money top-up (diamonds) — the shared, testable part.
// The flow: the player picks a pack → the server hands back the director's own bank "receive money" QR with the pack's
// price written into it (Thai QR / EMVCo; the stored QR is uploaded once in the back office, never in the code) → the
// player pays in their bank app and uploads the slip → the server asks Thunder (slip check API) whether the money went to
// the director's registered account, the amount is right and the slip was not used before → diamonds.
import { DIAMOND_PACKS, VIP_CARDS } from './premium';

/** a diamond pack or a VIP card (both bought the same way: QR → slip) */
export type Pack = { id: string; thb: number; diamonds: number; bonus: number; days: number };
export const packOf = (id: string): Pack | undefined => {
  const d = DIAMOND_PACKS.find(p => p.id === id); if (d) return { ...d, days: 0 };
  const v = VIP_CARDS.find(p => p.id === id); return v ? { id: v.id, thb: v.thb, diamonds: 0, bonus: 0, days: v.days } : undefined;
};
/** diamonds for a pack: the pack + its bonus, and the base doubled on the account's very first top-up ("เติมครั้งแรก x2") */
export const packDiamonds = (p: Pack, first: boolean) => p.diamonds + p.bonus + (first ? p.diamonds : 0);
/** slips checked per account per hour (each check spends the Thunder quota) */
export const SLIP_PER_HOUR = 5;
/** a slip older than this is refused (an old transfer to the same account cannot be turned into diamonds) */
export const SLIP_MAX_AGE_MS = 24 * 3600000;

// ---- Thai QR (EMVCo merchant-presented QR): id(2) + length(2) + value, ending with CRC16 tag 63 ----
export function crc16(s: string): string {
  let c = 0xffff;
  for (let i = 0; i < s.length; i++) {
    c ^= s.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff;
  }
  return c.toString(16).toUpperCase().padStart(4, '0');
}
export function tlv(s: string): [string, string][] | null {
  const out: [string, string][] = [];
  for (let i = 0; i < s.length;) {
    const id = s.slice(i, i + 2), n = Number(s.slice(i + 2, i + 4));
    if (!/^\d\d$/.test(id) || !/^\d\d$/.test(s.slice(i + 2, i + 4)) || i + 4 + n > s.length) return null;
    out.push([id, s.slice(i + 4, i + 4 + n)]); i += 4 + n;
  }
  return out;
}
const enc = (id: string, v: string) => id + String(v.length).padStart(2, '0') + v;

export interface QrInfo { ok: boolean; why?: 'format' | 'crc' | 'country' | 'currency' | 'account'; kind?: string; tail?: string }
/** is this a usable Thai QR to receive money: the format, the checksum, Thailand, baht, and a PromptPay / bill payment account
 *  (`tail` = the last 4 digits of the account, for the back office — the full number is never shown) */
export function qrCheck(p: string): QrInfo {
  const t = tlv(p.trim()); if (!t || t.length < 4) return { ok: false, why: 'format' };
  const last = t[t.length - 1]; if (last[0] !== '63' || last[1].toUpperCase() !== crc16(p.trim().slice(0, -4))) return { ok: false, why: 'crc' };
  const m = new Map(t);
  if (m.get('58') !== 'TH') return { ok: false, why: 'country' };
  if (m.get('53') !== '764') return { ok: false, why: 'currency' };
  const pp = m.get('29'), bill = m.get('30');
  if (pp) {
    const sub = new Map(tlv(pp) ?? []); const KIND: Record<string, string> = { '01': 'พร้อมเพย์ (เบอร์โทร)', '02': 'พร้อมเพย์ (เลขบัตร/ภาษี)', '03': 'QR พร้อมเพย์ (รหัส 15 หลัก)', '04': 'บัญชีธนาคาร' };
    const k = ['01', '02', '03', '04'].find(x => sub.has(x)); if (!k) return { ok: false, why: 'account' };
    return { ok: true, kind: KIND[k], tail: sub.get(k)!.slice(-4) };
  }
  if (bill) return { ok: true, kind: 'บิลเพย์เมนต์ (ร้านค้า)', tail: (new Map(tlv(bill) ?? []).get('02') ?? '').slice(-4) };
  return { ok: false, why: 'account' };
}
/** the stored QR with the amount written in (a "dynamic" QR: the bank app shows the price, the player only confirms) */
export function qrWithAmount(p: string, thb: number): string {
  const t = tlv(p.trim()); if (!t) throw new Error('qr');
  const m = new Map(t.filter(([id]) => id !== '63'));
  m.set('01', '12'); m.set('54', thb.toFixed(2));
  const body = [...m.entries()].sort((a, b) => Number(a[0]) - Number(b[0])).map(([id, v]) => enc(id, v)).join('') + '6304';
  return body + crc16(body);
}

// ---- the Thunder answer (POST /v2/verify/bank, data part) ----
export interface SlipData {
  isDuplicate?: boolean; matchedAccount?: unknown; isAmountMatched?: boolean | null; amountInSlip?: number;
  rawSlip?: { transRef?: string; date?: string; amount?: { amount?: number } };
}
export type SlipVerdict = { ok: true; ref: string; thb: number } | { ok: false; why: 'dup' | 'account' | 'amount' | 'old' | 'bad' };
/** does this checked slip pay for the pack: to the director's account, the right amount, new, recent */
export function slipVerdict(d: SlipData | null | undefined, thb: number, now: number): SlipVerdict {
  const ref = String(d?.rawSlip?.transRef ?? '');
  if (!d || !ref) return { ok: false, why: 'bad' };
  if (d.isDuplicate) return { ok: false, why: 'dup' };
  if (!d.matchedAccount) return { ok: false, why: 'account' };
  const amt = Number(d.rawSlip?.amount?.amount ?? d.amountInSlip);
  if (d.isAmountMatched === false || !(Math.abs(amt - thb) < 0.005)) return { ok: false, why: 'amount' };
  const at = Date.parse(String(d.rawSlip?.date ?? ''));
  if (Number.isFinite(at) && now - at > SLIP_MAX_AGE_MS) return { ok: false, why: 'old' };
  return { ok: true, ref, thb: amt };
}
/** what the player reads when a slip is refused */
export const SLIP_WHY: Record<string, string> = {
  dup: 'สลิปนี้ถูกใช้ไปแล้ว',
  account: 'สลิปนี้ไม่ได้โอนเข้าบัญชีของเกม',
  amount: 'ยอดในสลิปไม่ตรงกับแพ็กที่เลือก',
  old: 'สลิปเก่าเกิน 24 ชม.',
  bad: 'อ่านสลิปไม่ได้ — ลองรูปที่ชัดกว่านี้ (เห็น QR มุมสลิปครบ)',
  image: 'อ่านสลิปไม่ได้ — ลองรูปที่ชัดกว่านี้ (เห็น QR มุมสลิปครบ)',
  limit: `ตรวจสลิปได้ ${SLIP_PER_HOUR} ครั้ง/ชม. — รอสักครู่แล้วลองใหม่`,
  closed: 'ระบบเติมเงินยังไม่เปิด',
  noqr: 'ระบบเติมเงินยังไม่พร้อม (ยังไม่ได้ตั้ง QR รับเงิน)',
  service: 'ระบบตรวจสลิปขัดข้องชั่วคราว — ยังไม่หักอะไร ลองใหม่ภายหลัง หรือแจ้งแอดมินพร้อมสลิป',
  pack: 'ไม่พบแพ็กนี้',
  big: 'รูปใหญ่เกินไป',
  login: 'ต้องเชื่อมต่อเซิร์ฟเวอร์ก่อน (เข้าเกมแบบออนไลน์)',
  net: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ลองใหม่อีกครั้ง',
  credit: 'ตรวจสลิปผ่านแล้ว แต่ส่งเพชรไม่สำเร็จ — แจ้งแอดมิน (บันทึกไว้แล้ว ไม่หาย)',
};
