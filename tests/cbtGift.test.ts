import { describe, it, expect } from 'vitest';
import { startNewGame } from '../src/core/save';
import { CBT_ACTIVE, CBT_PACK, CBT_TITLE, grantCbt, cbtGot, cbtReady } from '../src/systems/cbtGift';
import { vipActive, vipTier, diamonds } from '../src/systems/premium';
import { titleOf, titlesOf, achDone, ACHS } from '../src/data/achievements';
import { countItem } from '../src/systems/inventory';
import { handlers } from '../src/server/handlers';

const NOW = 1_800_000_000_000;
describe('CBT gift: VIP 7 days now, once per account', () => {
  it('is open during the CBT', () => { expect(CBT_ACTIVE).toBe(true); expect(cbtReady(startNewGame())).toBe(true); });
  it('gives VIP 7 days, the testers\' title, gold and supplies at any level — never diamonds', () => {
    const s = startNewGame(), g0 = s.gold;
    expect(grantCbt(s, NOW)).toBe(true);
    expect(vipActive(s, NOW + 6.9 * 86400000)).toBe(true); expect(vipActive(s, NOW + 7.1 * 86400000)).toBe(false); expect(vipTier(s, NOW)).toBe(2);
    expect(titleOf(s)).toBe(CBT_TITLE.title); expect(titlesOf(s)).toContain('cbt'); expect(achDone(s)).toBe(0);
    expect(s.gold - g0).toBe(CBT_PACK.gold); expect(countItem(s, 'hp_potion_l')).toBeGreaterThanOrEqual(CBT_PACK.potL); expect(countItem(s, 'scroll_return')).toBeGreaterThanOrEqual(CBT_PACK.scroll);
    expect(diamonds(s)).toBe(0); expect(cbtGot(s)).toBe(true); expect(cbtReady(s)).toBe(false);
    expect(ACHS.some(a => a.id === 'cbt')).toBe(false);
  });
  it('only once: a second claim adds nothing', () => {
    const s = startNewGame(); grantCbt(s, NOW); const g = s.gold, v = (s as unknown as { vipUntil: number }).vipUntil;
    expect(grantCbt(s, NOW + 1000)).toBe('claimed'); expect(s.gold).toBe(g); expect((s as unknown as { vipUntil: number }).vipUntil).toBe(v);
  });
  it('the title can be put back on after wearing another', () => {
    const s = startNewGame(); grantCbt(s, NOW);
    handlers.setTitle(s, { id: null }); expect(titleOf(s)).toBeNull();
    handlers.setTitle(s, { id: 'cbt' }); expect(titleOf(s)).toBe(CBT_TITLE.title);
  });
  it('offline (no server) the claim is refused: only the server hands it out', () => {
    expect(handlers.cbtClaim(startNewGame(), {})).toEqual({ refused: 'offline' });
  });
});
