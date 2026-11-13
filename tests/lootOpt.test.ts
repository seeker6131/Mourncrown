import { describe, it, expect } from 'vitest';
import { startNewGame } from '../src/core/save';
import { handlers, useMem, newMem } from '../src/server/handlers';
import { lootOpt, toggleLoot, lootSkip, lootDis, disMatch } from '../src/systems/lootOpt';
import { ITEMS } from '../src/data/items';
import { isGear } from '../src/systems/loot';

const ctx = { now: 1_800_000_000_000, rnd: () => 0.5, admin: false };
const gearId = Object.values(ITEMS).find(d => isGear(d) && d.rarity === 0)!.id;
const legendId = Object.values(ITEMS).find(d => isGear(d) && d.rarity >= 4)?.id ?? gearId;
const vip = () => { const s = startNewGame() as ReturnType<typeof startNewGame> & { vipUntil?: number }; s.vipUntil = ctx.now + 86400000; return s; };
const drop = (id: string, rar: number, set?: string) => { const m = newMem(); useMem(m); m.drops.set(1, { id, qty: 1, gear: { rar, ...(set ? { set } : {}) }, until: ctx.now + 60000 } as never); return m; };

describe('👑 VIP loot settings: tick up to 3 rarities to pick up / to dismantle', () => {
  it('tick boxes: at most 3 each; only C..SR; the first version\'s numbers still read', () => {
    const s = vip();
    expect(toggleLoot(s, 'keep', 1)).toBe(true); expect(toggleLoot(s, 'keep', 2)).toBe(true); expect(toggleLoot(s, 'keep', 3)).toBe(true);
    expect(toggleLoot(s, 'keep', 0)).toBe(false);   // (a 4th: refused)
    expect(toggleLoot(s, 'keep', 5)).toBe(false);   // (SL: not a choice — always picked up)
    expect(toggleLoot(s, 'keep', 2)).toBe(true); expect(lootOpt(s).keep).toEqual([1, 3]);   // (untick)
    (s as unknown as { lootOpt: unknown }).lootOpt = { keep: 2, dis: 1 }; expect(lootOpt(s)).toEqual({ keep: [2, 3], dis: [0, 1] });
  });
  it('what stays on the ground: an unticked rarity (unless it is to be dismantled); never Legend / SL; not for non-VIP', () => {
    const s = vip(); (s as unknown as { lootOpt: unknown }).lootOpt = { keep: [2, 3], dis: [0] };
    expect(lootSkip(s, true, 1, ctx.now)).toBe(true); expect(lootSkip(s, true, 0, ctx.now)).toBe(false); expect(lootSkip(s, true, 2, ctx.now)).toBe(false);
    expect(lootSkip(s, true, 4, ctx.now)).toBe(false); expect(lootSkip(s, true, 5, ctx.now)).toBe(false); expect(lootSkip(s, false, 1, ctx.now)).toBe(false);
    expect(lootDis(s, ctx.now)).toEqual([0]);
    const n = startNewGame(); (n as unknown as { lootOpt: unknown }).lootOpt = { keep: [3], dis: [0, 1] };
    expect(lootSkip(n, true, 0, ctx.now)).toBe(false); expect(lootDis(n, ctx.now)).toBeUndefined();
    expect(disMatch([0, 2], 2)).toBe(true); expect(disMatch([0, 2], 1)).toBe(false); expect(disMatch(1, 1)).toBe(true); expect(disMatch([4, 5], 4)).toBe(false);
  });
  it('VIP pickup with a dismantle list: ticked rarities become mana shards (no bag slot); set / legend / unticked are kept', () => {
    const s = vip(), shard = () => s.inventory.find(i => i.id === 'mana_shard')?.qty ?? 0, sh0 = shard(), nGear = () => s.inventory.filter(i => i.id === gearId).length, g0 = nGear();
    drop(gearId, 2); const r = handlers.pickup(s, { did: 1, dis: [0, 2] }, ctx) as { dis?: { shards: number } };
    expect(r.dis?.shards).toBeGreaterThan(0); expect(shard()).toBe(sh0 + r.dis!.shards); expect(nGear()).toBe(g0);
    drop(gearId, 1); expect((handlers.pickup(s, { did: 1, dis: [0, 2] }, ctx) as { dis?: unknown }).dis).toBeUndefined();   // (not ticked)
    drop(gearId, 0, 'set_x'); expect((handlers.pickup(s, { did: 1, dis: [0] }, ctx) as { dis?: unknown }).dis).toBeUndefined();   // (set gear: kept)
    drop(legendId, 4); expect((handlers.pickup(s, { did: 1, dis: [4, 5] }, ctx) as { dis?: unknown }).dis).toBeUndefined();     // (Legend: never)
    const n = startNewGame(); drop(gearId, 0); expect((handlers.pickup(n, { did: 1, dis: [0] }, ctx) as { dis?: unknown }).dis).toBeUndefined();   // (not VIP)
  });
});
