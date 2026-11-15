import { it, expect } from 'vitest';
import { botGuild, maxGuild, rivalOf, raidedBy, GUILD_MAX_LV, type GuildState } from '../src/systems/guild';
import { startWar, warTick, warDone, WAR_SECS } from '../src/systems/war';
import type { GameState } from '../src/core/state';

let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const st = (g: GuildState, me: string) => ({ guild: { ...g, me } }) as unknown as GameState;
it('🧪 admin kit: a bot guild by tier, max out, a bot war on a guild with the loss dealt to it', () => {
  const now = Date.UTC(2026, 10, 16, 5);
  const weak = botGuild('bot-a', '[BOT] a', 1, now, rnd), god = botGuild('bot-b', '[BOT] b', 5, now, rnd);
  expect(weak.members.length).toBe(10); expect(weak.members.every(m => m.sim)).toBe(true);
  expect(god.buildings.every(b => b.level === 5)).toBe(true); expect(god.defenses.length).toBeGreaterThan(weak.defenses.length);
  expect(god.shieldUntil).toBe(0);
  // the target ("the admin's guild"): maxed out, then a god bot wars it
  const target = botGuild('adm', 'Admin', 2, now, rnd); target.members.forEach(m => (m.sim = false));
  maxGuild(target, now); expect(target.buildings.every(b => b.level === GUILD_MAX_LV && !b.dmg)).toBe(true); expect(target.treasury.gold).toBe(120000);
  const tS = st(target, target.members[0].id), rv = rivalOf(tS, now);
  const bS = st(god, god.members[0].id);
  const r = startWar(bS, rv.id, now, rv); expect('refused' in r).toBe(false);
  warTick(bS, now + (WAR_SECS + 2) * 1000); const over = warDone(bS);
  expect(over).toBeTruthy();
  const out = (bS as unknown as { guild: { out?: { target: string; stars: number; destroyed: string[]; gain: Record<string, number> }[] } }).guild.out ?? [];
  expect(out.length).toBe(1); expect(out[0].target).toBe('adm');
  const before = target.treasury.gold, lost = raidedBy(tS, { ...out[0], name: god.name } as never, now);
  const after = (tS as unknown as { guild: GuildState }).guild;
  expect(after.treasury.gold).toBe(before - lost.gold); expect(after.shieldUntil).toBeGreaterThan(now);
});
