// Monsters keep up with the players on a map (docs/ONLINE_RISKS.md 10): the more people hunting in one map, the more
// monsters live there at once and the faster the dead ones come back, so nobody stands around with nothing to hit.
// Per-player income stays the same (each player still has to find and kill each monster); only waiting goes away.
// Online the server counts the players in the map's room; offline it is the hero plus the test bots.

/** most monsters a map holds at once, whatever the crowd (keeps phones smooth) */
export const MON_CAP = 120;
/** shortest respawn, however busy the map */
export const MIN_RESPAWN = 1000;

/** how many ordinary monsters this map should hold with `players` hunting in it */
export function monTarget(base: number, players: number) {
  const p = Math.max(1, Math.floor(players));
  return Math.min(MON_CAP, Math.max(base, Math.round(base + (p - 1) * 0.9)));
}
/** respawn wait for a monster that would wait `ms` on an empty map */
export function respawnMs(ms: number, players: number) {
  const p = Math.max(1, Math.floor(players));
  return p <= 1 ? ms : Math.max(MIN_RESPAWN, ms / (1 + (p - 1) / 6));
}
/** too few alive (under 60% of the target): bring dead ones back right away */
export const lowWater = (target: number) => Math.ceil(target * 0.6);

/** how close (px) a hero may walk past a monster before it notices and comes (player feedback 14 Nov; bosses / animals never) */
export const SIGHT = 80;
