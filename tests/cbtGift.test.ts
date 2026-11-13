import { describe, it, expect } from 'vitest';
import { startNewGame } from '../src/core/save';
import { CBT_GIFT_OPEN, CBT_TIERS, CBT_TITLE, cbtTier, grantCbt, cbtGot } from '../src/systems/cbtGift';
import { vipActive, vipTier, diamonds } from '../src/systems/premium';
import { titleOf, titlesOf, achDone, ACHS } from '../src/data/achievements';
import { countItem } from '../src/systems/inventory';
import { handlers } from '../src/server/handlers';

const NOW = 1_800_000_000_000;
describe('CBT testers\' gift', () => {
  it('stays closed during the CBT', () => { expect(CBT_GIFT_OPEN).toBe(false); });
  it('tiers by the level reached: nothing under Lv10', () => {
    expect(cbtTier(9)).toBeNull(); expect(cbtTier(10)?.name).toBe(CBT_TIERS[0].name);
    expect(cbtTier(29)).toBe(CBT_TIERS[0]); expect(cbtTier(30)).toBe(CBT_TIERS[1]); expect(cbtTier(99)).toBe(CBT_TIERS[2]);
  });
  it('gives VIP 7 days, the exclusive title, gold and supplies — never diamonds', () => {
    const s = startNewGame(), g0 = s.gold;
    const t = grantCbt(s, 35, NOW)!;
    expect(t).toBe(CBT_TIERS[1]);
    expect(vipActive(s, NOW + 6.9 * 86400000)).toBe(true); expect(vipActive(s, NOW + 7.1 * 86400000)).toBe(false); expect(vipTier(s, NOW)).toBe(2);
    expect(titleOf(s)).toBe(CBT_TITLE.title); expect(titlesOf(s)).toContain('cbt'); expect(achDone(s)).toBe(0);
    expect(s.gold - g0).toBe(t.gold); expect(countItem(s, 'hp_potion_l')).toBeGreaterThanOrEqual(t.potL); expect(countItem(s, 'scroll_return')).toBeGreaterThanOrEqual(t.scroll);
    expect(diamonds(s)).toBe(0); expect(cbtGot(s)).toBe(true);
    expect(ACHS.some(a => a.id === 'cbt')).toBe(false);   // not a goal anyone can reach later
  });
  it('below Lv10 nothing is given', () => { const s = startNewGame(), g0 = s.gold; expect(grantCbt(s, 5, NOW)).toBeNull(); expect(s.gold).toBe(g0); expect(vipActive(s, NOW)).toBe(false); });
  it('the title can be put back on after wearing another', () => {
    const s = startNewGame(); grantCbt(s, 10, NOW);
    expect(handlers.setTitle(s, { id: null } as never)).toBeTruthy(); expect(titleOf(s)).toBeNull();
    handlers.setTitle(s, { id: 'cbt' } as never); expect(titleOf(s)).toBe(CBT_TITLE.title);
  });
  it('offline (no server) the claim is refused: only the server hands it out', () => {
    const s = startNewGame(); expect(handlers.cbtClaim(s, {})).toEqual({ refused: 'offline' }); expect(handlers.cbtInfo(s, {})).toEqual({ refused: 'offline' });
  });
});
