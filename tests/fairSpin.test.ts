import { describe, it, expect } from 'vitest';
import { newGameState as newGame } from '../src/core/state';
import { spinWings, spinMounts, GOOD_IDS, SAME_MAX } from '../src/systems/wings';
import { rollSpins, WHEEL_SEGS } from '../src/systems/wheel';
import { spinDiamond } from '../src/systems/diamondWheel';
import { rollMountDrop, GOLDEN_MOUNT, WB_MOUNT } from '../src/systems/mountDrop';

let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const rich = () => { const s = newGame() as ReturnType<typeof newGame> & { stars?: number; diamonds?: number }; s.gold = 1e12; s.diamonds = 1e9; return s; };

describe('🎰 fair-looking spins (director 16 Nov: "10 spins = 10 mana shards looks rigged")', () => {
  it('a 10-spin of the wing / mount machine: no small prize more than 3 times, and one better prize when no wing / mount', () => {
    for (const spin of [spinWings, spinMounts]) for (let t = 0; t < 400; t++) {
      const s = rich(), r = spin(s, 10, rnd); expect(typeof r).toBe('object'); if (typeof r !== 'object') continue;
      const cnt = new Map<string, number>(); for (const p of r.prizes as { item?: { id: string } }[]) if (p.item) cnt.set(p.item.id, (cnt.get(p.item.id) ?? 0) + 1);
      for (const [id, n] of cnt) if (!GOOD_IDS.has(id)) expect(n).toBeLessThanOrEqual(SAME_MAX);
      const big = (r.prizes as { wing?: string; mount?: string }[]).some(p => p.wing || p.mount);
      if (!big) expect([...cnt.keys()].some(id => GOOD_IDS.has(id))).toBe(true);
      expect(cnt.size + (big ? 1 : 0)).toBeGreaterThanOrEqual(3);   // (always a mix)
    }
  });
  it('every prize really lands in the bag', () => {
    const s = rich(), r = spinWings(s, 10, rnd); if (typeof r !== 'object') throw new Error('spin');
    for (const p of r.prizes) if (p.item) expect(s.inventory.some(i => i.id === p.item!.id)).toBe(true);
  });
  it('the gold wheel: no segment more than 3 times in 10, and always a chest / core / elixir', () => {
    for (let t = 0; t < 2000; t++) {
      const segs = rollSpins(10, rnd), cnt = new Map<number, number>(); for (const i of segs) cnt.set(i, (cnt.get(i) ?? 0) + 1);
      for (const n of cnt.values()) expect(n).toBeLessThanOrEqual(3);
      expect(segs.some(i => ['legend', 'sr', 'rare', 'core', 'elixir'].includes(WHEEL_SEGS[i].key))).toBe(true);
    }
  });
  it('the diamond wheel: no segment more than 3 times in 10', () => {
    for (let t = 0; t < 400; t++) {
      const s = rich(), r = spinDiamond(s, 10, rnd); if (typeof r !== 'object') throw new Error('spin');
      const cnt = new Map<number, number>(); for (const p of r.prizes) cnt.set(p.seg, (cnt.get(p.seg) ?? 0) + 1);
      for (const n of cnt.values()) expect(n).toBeLessThanOrEqual(3);
    }
  });
});

describe('🐎 mounts from golden monsters and the roaming boss', () => {
  it('golden monsters: about 1 in 600 Legend, 1 in 3,500 SL; a second copy is star coins', () => {
    const s = rich() as ReturnType<typeof rich> & { mounts?: unknown }; let L = 0, SL = 0, stars = 0; const N = 600000;
    for (let i = 0; i < N; i++) { const d = rollMountDrop(s, rnd, GOLDEN_MOUNT); if (!d) continue; if (d.tier === 'L') L++; else SL++; if (d.stars) stars++; }
    expect(L / N).toBeGreaterThan(1 / 750); expect(L / N).toBeLessThan(1 / 500);
    expect(SL / N).toBeGreaterThan(1 / 5000); expect(SL / N).toBeLessThan(1 / 2500);
    expect(stars).toBeGreaterThan(0);
  });
  it('the roaming boss: the killer ~3.5%, a helper by their share; never the Limited dragon', () => {
    const s = rich(); let k = 0, h = 0; const N = 200000;
    for (let i = 0; i < N; i++) { const a = rollMountDrop(s, rnd, WB_MOUNT, 1), b = rollMountDrop(s, rnd, WB_MOUNT, 0.2); if (a) { k++; expect(a.mount).not.toBe('gdragon'); } if (b) h++; }
    expect(k / N).toBeGreaterThan(0.03); expect(k / N).toBeLessThan(0.04);
    expect(h / N).toBeGreaterThan(0.005); expect(h / N).toBeLessThan(0.009);
  });
});

describe('🎲 no pattern to see', () => {
  it('the better prize of a 10-spin lands anywhere in the 10, not always the same place', () => {
    const at = new Set<number>();
    for (let t = 0; t < 300; t++) { const s = rich(), r = spinWings(s, 10, rnd); if (typeof r !== 'object' || r.prizes.some(p => p.wing)) continue; r.prizes.forEach((p, i) => { if (p.item && GOOD_IDS.has(p.item.id)) at.add(i); }); }
    expect(at.size).toBeGreaterThanOrEqual(8);
    const w = new Set<number>(); for (let t = 0; t < 2000; t++) rollSpins(10, rnd).forEach((i, k) => { if (WHEEL_SEGS[i].key === 'rare') w.add(k); });
    expect(w.size).toBe(10);
  });
  it('two players spinning at the same moment do not get the same prizes', () => {
    const a = rich(), b = rich(), ra = spinWings(a, 10, Math.random), rb = spinWings(b, 10, Math.random);
    if (typeof ra !== 'object' || typeof rb !== 'object') throw new Error('spin');
    expect(JSON.stringify(ra.prizes)).not.toBe(JSON.stringify(rb.prizes));
  });
});

import { blackHorseFix } from '../src/systems/diamondWheel';
import { hasMount } from '../src/systems/mounts';
describe('🐎 the black horse prize (player report 18 Nov)', () => {
  it('owning the skin without the war horse gives the horse, once', () => {
    const s = rich() as ReturnType<typeof rich> & { skins?: string[] }; s.skins = ['horse_black'];
    expect(hasMount(s, 'horse')).toBe(false); expect(blackHorseFix(s)).toBe(true); expect(hasMount(s, 'horse')).toBe(true); expect(blackHorseFix(s)).toBe(false);
  });
});
