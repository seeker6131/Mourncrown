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
}
export const POT_DEFAULT: PotSet = { auto: true, hp: 35, mpAuto: false, mp: 20, big: true, vipAuto: true };
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
