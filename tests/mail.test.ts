import { describe, it, expect } from 'vitest';
import { startNewGame } from '../src/core/save';
import { addMail, claimMail, deleteMail, mailOf, mailWaiting, takeMailAll, readMail } from '../src/systems/mail';
import { countItem } from '../src/systems/inventory';
import { invSize } from '../src/core/state';
import { handlers } from '../src/server/handlers';

const NOW = 1_800_000_000_000;
describe('the mailbox: gifts the player claims', () => {
  it('a letter with a gift: claimed once, everything at once', () => {
    const s = startNewGame(), g0 = s.gold;
    const m = addMail(s, { from: 'แอดมิน', title: 'ชดเชย', text: 'ขอโทษครับ', gold: 500, wood: 100, items: [{ id: 'hp_potion_l', qty: 5 }] }, NOW)!;
    expect(mailWaiting(s, NOW)).toBe(1);
    const r = claimMail(s, m.id, NOW); expect(typeof r).toBe('object');
    expect(s.gold - g0).toBe(500); expect(s.res.wood).toBe(100); expect(countItem(s, 'hp_potion_l')).toBeGreaterThanOrEqual(5);
    expect(claimMail(s, m.id, NOW)).toBe('claimed'); expect(s.gold - g0).toBe(500);
    expect(mailWaiting(s, NOW)).toBe(0);
  });
  it('a full bag keeps the letter (nothing given); an expired gift cannot be claimed', () => {
    const s = startNewGame();
    while (s.inventory.length < invSize(s)) s.inventory.push({ uid: 9000 + s.inventory.length, id: 'wood_sword', qty: 1, upg: 0 });
    const m = addMail(s, { from: 'x', title: 'ดาบ', text: '', items: [{ id: 'wood_sword', qty: 1 }] }, NOW)!, g0 = s.gold;
    expect(claimMail(s, m.id, NOW)).toBe('bag'); expect(s.gold).toBe(g0); expect(mailOf(s)[0].claimed).toBeUndefined();
    const e = addMail(s, { from: 'x', title: 'หมด', text: '', gold: 10, until: NOW + 1000 }, NOW)!;
    expect(claimMail(s, e.id, NOW + 2000)).toBe('expired');
  });
  it('a letter with an unclaimed gift cannot be thrown away; a finished one can', () => {
    const s = startNewGame(), m = addMail(s, { from: 'x', title: 'a', text: '', gold: 1 }, NOW)!;
    expect(deleteMail(s, m.id)).toBe(false); claimMail(s, m.id, NOW); expect(deleteMail(s, m.id)).toBe(true);
    const t = addMail(s, { from: 'x', title: 'ข่าว', text: 'อ่านอย่างเดียว' }, NOW)!; expect(mailWaiting(s, NOW)).toBe(1); readMail(s, t.id); expect(mailWaiting(s, NOW)).toBe(0);
  });
  it('letters to everyone come once each (by id), expired ones are skipped, bad numbers are cleaned', () => {
    const s = startNewGame();
    const rows = [{ id: 1, at: NOW, title: 'เปิด CBT', text: '', gift: '{"gold":1000}', until: 0 }, { id: 2, at: NOW, title: 'เก่า', text: '', gift: '{"gold":5}', until: NOW - 1 }, { id: 3, at: NOW, title: 'โกง', text: '', gift: '{"gold":-50,"items":[{"id":"nope","qty":3}]}', until: 0 }];
    expect(takeMailAll(s, rows, NOW)).toBe(2); expect(takeMailAll(s, rows, NOW)).toBe(0);
    expect(mailOf(s).map(m => m.title)).toEqual(['โกง', 'เปิด CBT']);
    expect(mailOf(s)[0].gold).toBe(0); expect(mailOf(s)[0].items).toBeUndefined();
  });
  it('the game cannot make letters: the actions only claim / read / delete what is there', () => {
    const s = startNewGame(); expect(handlers.mailClaim(s, { id: 'none' }, { now: NOW, rnd: Math.random, admin: false })).toBe('missing');
  });
});
