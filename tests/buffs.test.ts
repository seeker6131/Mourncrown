import { describe, it, expect } from 'vitest';
import { activeBuffs, buffClash, clock } from '../src/systems/buffs';
import { startNewGame } from '../src/core/save';

describe('buff chips (what is on, time left) and the replace warning', () => {
  it('lists the food/tonic, elixir and skill buffs with time left; asks before replacing a long one', () => {
    const now = 1_000_000, s = startNewGame() as ReturnType<typeof startNewGame> & Record<string, unknown>;
    expect(activeBuffs(s, now)).toEqual([]);
    expect(buffClash(s, 'buff', now)).toBeNull();
    s.buff = { stat: 'atk', pct: 10, until: now + 12 * 60000 + 30000, meal: true };
    s.elixir = { atk: 20, crit: 5, until: now + 5 * 60000, name: 'ยาอายุวัฒนะ' };
    s.skillBuff = { atk: 30, until: now + 8000 };
    const b = activeBuffs(s, now);
    expect(b.map(q => q.key)).toEqual(['buff', 'elixir', 'skill']);
    expect(b[0].text).toBe('🍖 ATK+10%'); expect(b[1].text).toBe('⚗ ATK+20% CRI+5%'); expect(clock(b[2].left)).toBe('0:08');
    expect(buffClash(s, 'buff', now)).toBe('🍖 ATK+10% (เหลือ 12:30)');
    expect(buffClash(s, 'buff', now + 12 * 60000)).toBeNull();   // (under a minute left: no question)
    expect(activeBuffs(s, now + 13 * 60000).map(q => q.key)).toEqual([]);   // (all over)
  });
});
