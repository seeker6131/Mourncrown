import { describe, it, expect } from 'vitest';
import { crc16, tlv, qrCheck, qrWithAmount, slipVerdict, packOf, packDiamonds } from '../src/systems/topup';

const make = (body: string) => body + '6304' + crc16(body + '6304');
// a static PromptPay QR to a bank account (made-up number)
const acct = '0016A000000677010111' + '0413' + '0040001234567';
const STATIC = make('000201' + '010211' + '29' + String(acct.length).padStart(2, '0') + acct + '5802TH' + '5303764');

describe('top-up', () => {
  it('crc16 is CCITT-FALSE', () => { expect(crc16('123456789')).toBe('29B1'); });
  it('reads the bank QR', () => {
    const q = qrCheck(STATIC); expect(q.ok).toBe(true); expect(q.kind).toBe('บัญชีธนาคาร'); expect(q.tail).toBe('4567');
    expect(qrCheck(STATIC.slice(0, -1) + (STATIC.endsWith('0') ? '1' : '0')).why).toBe('crc');
    expect(qrCheck('hello').ok).toBe(false);
  });
  it('writes the amount in and keeps the checksum valid', () => {
    const q = qrWithAmount(STATIC, 29); const m = new Map(tlv(q)!);
    expect(m.get('54')).toBe('29.00'); expect(m.get('01')).toBe('12'); expect(qrCheck(q).ok).toBe(true);
    expect(new Map(tlv(qrWithAmount(q, 149))!).get('54')).toBe('149.00');   // (again on a dynamic one: replaced, not added)
  });
  it('first top-up doubles the base', () => {
    const p = packOf('d300')!; expect(packDiamonds(p, false)).toBe(330); expect(packDiamonds(p, true)).toBe(630);
    expect(packOf('nope')).toBeUndefined();
  });
  it('judges the slip', () => {
    const now = Date.parse('2026-11-14T10:00:00+07:00');
    const good = { isDuplicate: false, matchedAccount: { bankNumber: 'x' }, isAmountMatched: true, rawSlip: { transRef: 'T1', date: '2026-11-14T09:50:00+07:00', amount: { amount: 29 } } };
    expect(slipVerdict(good, 29, now)).toEqual({ ok: true, ref: 'T1', thb: 29 });
    expect(slipVerdict({ ...good, isDuplicate: true }, 29, now)).toEqual({ ok: false, why: 'dup' });
    expect(slipVerdict({ ...good, matchedAccount: null }, 29, now)).toEqual({ ok: false, why: 'account' });
    expect(slipVerdict({ ...good, isAmountMatched: false }, 29, now)).toEqual({ ok: false, why: 'amount' });
    expect(slipVerdict({ ...good, rawSlip: { ...good.rawSlip, amount: { amount: 30 } } }, 29, now)).toEqual({ ok: false, why: 'amount' });
    expect(slipVerdict({ ...good, rawSlip: { ...good.rawSlip, date: '2026-11-12T09:00:00+07:00' } }, 29, now)).toEqual({ ok: false, why: 'old' });
    expect(slipVerdict(null, 29, now)).toEqual({ ok: false, why: 'bad' });
  });
});
