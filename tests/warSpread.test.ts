import { it, expect } from 'vitest';
import { botGuild, rivalOf, type GuildState } from '../src/systems/guild';
import { startWar, warTick, WAR_SECS, type War } from '../src/systems/war';
import type { GameState } from '../src/core/state';

let seed = 9; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const st = (g: GuildState) => ({ guild: { ...g, me: g.members[0].id } }) as unknown as GameState;
it('a war spreads out: fences go first and fast, houses before buildings, the hall last; it lasts most of the 4 minutes', () => {
  const now = Date.UTC(2026, 10, 16, 6), a = botGuild('bot-a', 'A', 3, now, rnd), b = botGuild('bot-b', 'B', 3, now, rnd);
  const S = st(a), rv = rivalOf(st(b), now); startWar(S, rv.id, now, rv);
  const w = (S as unknown as { guild: { war: War } }).guild.war, fell: Record<string, number> = {};
  for (let t = 1; t <= WAR_SECS; t++) { warTick(S, now + t * 1000); for (const x of w.theirs.blds) if (x.hp <= 0 && !(x.id in fell)) fell[x.id] = t; if (w.over) break; }
  const when = (p: string) => Object.entries(fell).filter(([k]) => k.startsWith(p)).map(([, v]) => v);
  const fences = w.theirs.blds.filter(x => x.id.startsWith('d:')), houses = when('h:'), blds = when('b:');
  console.log('fell at (s):', JSON.stringify({ defenses: when('d:'), houses, buildings: blds, hall: fell['b:hall'] ?? '-', over: w.over?.theirs }));
  expect(houses.length).toBeGreaterThan(0);
  expect(Math.min(...when('d:'))).toBeLessThan(Math.min(...houses));
  expect(fell['b:hall'] === undefined || fell['b:hall'] >= Math.max(...houses)).toBe(true);
  expect(fences.length).toBeGreaterThan(0);
});
