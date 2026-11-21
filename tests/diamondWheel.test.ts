import { describe, it, expect } from 'vitest';
import { startNewGame } from '../src/core/save';
import { handlers } from '../src/server/handlers';
import { spinDiamond, starTrade, DWHEEL_SEGS, DWHEEL_PRICE, DWHEEL_PRICE10, STAR_TRADE, DWHEEL_OPEN, dChance } from '../src/systems/diamondWheel';
import { hasMount } from '../src/systems/mounts';
import { isGear } from '../src/systems/loot';
import { ITEMS } from '../src/data/items';

let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
type DS = ReturnType<typeof startNewGame> & { diamonds?: number; stars?: number; pets?: string[]; skins?: string[] };
const rich = () => { const s = startNewGame() as DS; s.diamonds = 1e9; s.inventory = []; return s; };

describe('💎 the diamond wheel', () => {
  it('costs 30 / 270, gives a star per spin, needs diamonds', () => {
    const s = rich();
    spinDiamond(s, 1, rnd); expect(s.diamonds).toBe(1e9 - DWHEEL_PRICE); expect(s.stars).toBe(1);
    spinDiamond(s, 10, rnd); expect(s.diamonds).toBe(1e9 - DWHEEL_PRICE - DWHEEL_PRICE10); expect(s.stars).toBeGreaterThanOrEqual(11);
    const poor = startNewGame() as DS; poor.diamonds = 29; expect(spinDiamond(poor, 1, rnd)).toBe('diamonds');
  });
  it('no pay-to-win: never gear, elixirs or mana shards; odds add to 100%; owned prizes turn into stars', () => {
    const s = rich(), N = 20000;
    for (let i = 0; i < N / 10; i++) { if (s.inventory.length > 40) s.inventory = []; spinDiamond(s, 10, rnd); }
    expect(s.inventory.some(it => isGear(ITEMS[it.id]) || it.id.startsWith('elix_') || it.id === 'mana_shard')).toBe(false);
    expect(hasMount(s, 'dragon')).toBe(true); expect(s.pets).toContain('cloud'); expect(s.skins).toContain('horse_black');   // (20k spins: all won)
    expect(s.stars!).toBeGreaterThan(N);   // (duplicates became stars)
    expect(DWHEEL_SEGS.reduce((t, _, i) => t + dChance(i), 0)).toBeCloseTo(100);
  });
  it('150 stars trade for the dragon or the cloud (once each)', () => {
    const s = rich(); s.stars = STAR_TRADE * 2 + 5;
    expect(starTrade(s, 'dragon')).toBe(true); expect(hasMount(s, 'dragon')).toBe(true); expect(starTrade(s, 'dragon')).toBe('owned');
    expect(starTrade(s, 'cloud')).toBe(true); expect(s.stars).toBe(5); expect(starTrade(s, 'cloud')).toBe('owned');
    const p = rich(); p.stars = 10; expect(starTrade(p, 'cloud')).toBe('stars');
  });
  it('closed to players (admin can try)', () => {
    const s = rich(), ctx = { now: Date.now(), rnd, admin: false };
    if (!DWHEEL_OPEN) { expect((handlers.dwheelSpin(s, { n: 1 }, ctx) as { refused?: string }).refused).toBe('closed'); expect((handlers.starTrade(s, { what: 'cloud' }, ctx) as { refused?: string }).refused).toBe('closed'); }
    expect((handlers.dwheelSpin(s, { n: 1 }, { ...ctx, admin: true }) as { prizes?: unknown[] }).prizes?.length).toBe(1);
  });
});
