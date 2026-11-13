import { describe, it, expect } from 'vitest';
import { startNewGame } from '../src/core/save';
import { handlers, useMem, newMem } from '../src/server/handlers';
import { lootOpt, setLootOpt, lootSkip, lootDis } from '../src/systems/lootOpt';
import { ITEMS } from '../src/data/items';
import { isGear } from '../src/systems/loot';

const ctx = { now: 1_800_000_000_000, rnd: () => 0.5, admin: false };
const gearId = Object.values(ITEMS).find(d => isGear(d) && d.rarity === 0)!.id;
const legendId = Object.values(ITEMS).find(d => isGear(d) && d.rarity >= 4)?.id ?? gearId;
const vip = () => { const s = startNewGame() as ReturnType<typeof startNewGame> & { vipUntil?: number }; s.vipUntil = ctx.now + 86400000; return s; };
const drop = (id: string, rar: number, set?: string) => { const m = newMem(); useMem(m); m.drops.set(1, { id, qty: 1, gear: { rar, ...(set ? { set } : {}) }, until: ctx.now + 60000 } as never); return m; };

describe('👑 VIP loot settings: which gear to pick up, auto-dismantle', () => {
  it('settings are clamped; only VIP leaves low gear on the ground / sends the dismantle setting', () => {
    const s = vip(); setLootOpt(s, { keep: 9, dis: 7 }); expect(lootOpt(s)).toEqual({ keep: 5, dis: 3 });
    setLootOpt(s, { keep: 2, dis: 1 });
    expect(lootSkip(s, true, 1, ctx.now)).toBe(true); expect(lootSkip(s, true, 2, ctx.now)).toBe(false); expect(lootSkip(s, false, 0, ctx.now)).toBe(false);   // (materials always)
    expect(lootDis(s, ctx.now)).toBe(1);
    const n = startNewGame(); setLootOpt(n, { keep: 3, dis: 2 });
    expect(lootSkip(n, true, 0, ctx.now)).toBe(false); expect(lootDis(n, ctx.now)).toBeUndefined();   // (not VIP: nothing)
  });
  it('VIP pickup with dis: low gear becomes mana shards (no bag slot); a set / legend / higher gear is kept', () => {
    const s = vip(), bag = s.inventory.length, shard = () => s.inventory.find(i => i.id === 'mana_shard')?.qty ?? 0, sh0 = shard(), nGear = () => s.inventory.filter(i => i.id === gearId).length, g0 = nGear();
    drop(gearId, 1); const r = handlers.pickup(s, { did: 1, dis: 1 }, ctx) as { dis?: { shards: number } };
    expect(r.dis?.shards).toBeGreaterThan(0); expect(shard()).toBe(sh0 + r.dis!.shards); expect(nGear()).toBe(g0);
    drop(gearId, 1, 'set_x'); expect((handlers.pickup(s, { did: 1, dis: 3 }, ctx) as { dis?: unknown }).dis).toBeUndefined();   // (set gear: kept)
    drop(legendId, 4); expect((handlers.pickup(s, { did: 1, dis: 9 }, ctx) as { dis?: unknown }).dis).toBeUndefined();          // (Legend: never)
    drop(gearId, 2); expect((handlers.pickup(s, { did: 1, dis: 1 }, ctx) as { dis?: unknown }).dis).toBeUndefined();            // (above the setting)
    expect(s.inventory.length).toBeGreaterThan(bag);
    const n = startNewGame(); drop(gearId, 0); expect((handlers.pickup(n, { did: 1, dis: 3 }, ctx) as { dis?: unknown }).dis).toBeUndefined();   // (not VIP)
  });
});
