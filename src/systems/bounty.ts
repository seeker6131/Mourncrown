// Wandering bounty boss (docs/GUILD_WAR.md 9.1): every 20 minutes the server names a map near the player's level and a
// "lord" of that land's monsters roams there (40x HP, big). The bounty board (tavern) and a server-wide announcement say
// where. Killing it pays like a boss (3 gear, Rare or better, the land's set piece) + bounty gold + 1 ancient core.
// Rarity rules are the usual ones (rollRarity, SL pity) — nothing is shown as a rate.
import type { GameState } from '../core/state';
import { STAGES } from '../world/stages';
import type { StageMon } from '../world/stages';

export const BOUNTY_SLOT = 20 * 60000;
export const BOUNTY_HP = 40;
const TITLES = ['จ่าฝูง', 'ราชา', 'เจ้าแห่งความหิว', 'ผู้เร่ร่อน', 'ตำนาน'];
export interface Bounty { slot: number; n: number; mob: StageMon; name: string; until: number; killed: boolean; gold: number }
type BS = GameState & { bounty?: { slot: number }; tdCleared?: number };

function rnd(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** the bounty of this 20-minute slot for this player (the same for everyone in the same level band) */
export function bountyOf(s: GameState, now = Date.now()): Bounty {
  const slot = Math.floor(now / BOUNTY_SLOT), band = Math.floor(s.level / 10), r = rnd(slot * 131 + band * 7919);
  const top = Math.max(1, STAGES.filter(st => st.req <= s.level).length);
  const n = Math.max(1, Math.min(STAGES.length, top - Math.floor(r() * 4)));
  const st = STAGES[n - 1], mob = st.land.mobs[Math.floor(r() * st.land.mobs.length)];
  const name = `${TITLES[Math.floor(r() * TITLES.length)]}${mob.name}`;
  return { slot, n, mob, name, until: (slot + 1) * BOUNTY_SLOT, killed: (s as BS).bounty?.slot === slot, gold: Math.round(300 * st.level) };
}
export const markBounty = (s: GameState, slot: number) => { (s as BS).bounty = { slot }; };
