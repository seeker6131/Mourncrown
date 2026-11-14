// Potions in battle (director: a potion button beside the skills, and a settings menu — when to drink, or automatic).
// Settings are the player's own preference (not valuable); drinking still goes through act('useItem') on the server.
import type { GameState } from '../core/state';

export interface PotSet {
  /** drink by itself when low (works with or without AUTO fighting) */
  auto: boolean;
  /** drink an HP potion below this % of max HP */
  hp: number;
  /** also drink MP potions by itself */
  mpAuto: boolean;
  /** drink an MP potion below this % of max MP */
  mp: number;
  /** big HP potions first (else small first) */
  big: boolean;
  /** VIP: buy a potion by itself when out (else buy by hand with the VIP buttons) */
  vipAuto: boolean;
  // ⚔ AUTO fighting, MMO style (player feedback 14 Nov; director: VIP only — others fight with AUTO_DEFAULT).
  // Kept here so it rides the same synced 'pot' save field.
  /** hunt only this far (px) from where AUTO was switched on; 0 = the whole map */
  aRange: number;
  /** which monster next: the nearest, the one with the least HP left, or the toughest */
  aPick: 'near' | 'weak' | 'strong';
  /** bosses / elites: 'all' = like any monster, 'skip' = leave them alone, 'first' = go for them first */
  aBoss: 'all' | 'skip' | 'first';
  /** leave monsters another player is fighting alone (no stealing) */
  aKs: boolean;
  /** which of the three skill slots AUTO may cast */
  aSk: [boolean, boolean, boolean];
  /** attack skills: always, only on a boss / elite, or only when 3+ monsters are close */
  aSkWhen: 'always' | 'boss' | 'pack';
  /** keep this much MP (%) — no attack skills below it (heal / shield still allowed) */
  aMp: number;
  /** walk to loot on the ground */
  aLoot: boolean;
  /** out of HP potions: fight on, or walk home */
  aNoPot: 'fight' | 'home';
  /** bag full: fight on, stop AUTO, or walk home */
  aBag: 'fight' | 'stop' | 'home';
}
export const POT_DEFAULT: PotSet = { auto: true, hp: 35, mpAuto: false, mp: 20, big: true, vipAuto: true, aRange: 0, aPick: 'near', aBoss: 'all', aKs: false, aSk: [true, true, true], aSkWhen: 'always', aMp: 0, aLoot: true, aNoPot: 'fight', aBag: 'fight' };
export const RANGE_STEPS = [0, 150, 300, 500], MP_KEEP = [0, 20, 40, 60];
/** the AUTO settings in force: the player's own for a VIP, the plain defaults for everyone else (director) */
export const autoOf = (s: GameState, vip: boolean): PotSet => (vip ? potOf(s) : { ...potOf(s), ...Object.fromEntries(Object.entries(POT_DEFAULT).filter(([k]) => k.startsWith('a') && k !== 'auto')) } as PotSet);
export const HP_STEPS = [20, 35, 50, 70], MP_STEPS = [10, 20, 35, 50];
export const POT_CD = 2500;   // ms between two potions of one kind

type PS = GameState & { pot?: Partial<PotSet> };
export const potOf = (s: GameState): PotSet => ({ ...POT_DEFAULT, ...((s as PS).pot ?? {}) });
export function setPot(s: GameState, ch: Partial<PotSet>) { (s as PS).pot = { ...potOf(s), ...ch }; }

const HP_IDS = ['hp_potion_l', 'hp_potion'], MP_IDS = ['mp_potion'];
/** the potion this hero would drink now (by the setting's order), or null */
export function pickPotion(s: GameState, kind: 'hp' | 'mp') {
  const ids = kind === 'mp' ? MP_IDS : potOf(s).big ? HP_IDS : [...HP_IDS].reverse();
  for (const id of ids) { const it = s.inventory.find(i => i.id === id); if (it) return it; }
  return null;
}
/** how many potions of a kind the bag holds */
export const potCount = (s: GameState, kind: 'hp' | 'mp') => s.inventory.filter(i => (kind === 'mp' ? MP_IDS : HP_IDS).includes(i.id)).reduce((a, i) => a + (i.qty ?? 1), 0);
