// 🪽 Wings: who owns which (server-written, `wings`), which one is out (`wingOn`, the player's own setting) and the
// 🎰 wing slot machine (director 14 Nov: the only way to get wings; no chances shown anywhere). The server rolls.
// Only one of mount / wings / storm cloud at a time (director): wings out = the cloud put away (and the hero gets off
// the mount — TopDownScene); the cloud out = the wings put away; on a mount neither shows.
import type { GameState } from '../core/state';
import { addItem } from './inventory';
import { invSize } from '../core/state';
import { WINGS, WING_BY_ID, type WingTier } from '../data/wings';

/** open to players (closed: the admin can try it) */
export const WSLOT_OPEN = true;   // (opened 14 Nov 23:00 — director)
/** Limited wings can come out of the machine — open now in CBT, and KEPT when the CBT data is wiped for OBT (director 14 Nov) */
export const WSLOT_LTD = true;
/** director 16 Nov: the machine takes GOLD now (farm hard to spin) — an active player earns ~150-500k a day */
export const WSLOT_PRICE = 20000, WSLOT_PRICE10 = 180000;
/** per 10,000 spins, each wing of the tier (never shown to players) */
const WEIGHT: Record<WingTier, number> = { L: 15, SL: 4, X: 2 };   // (16 Nov: harder — gold is easier to come by than diamonds; OBT must not be flooded)
/** a wing already owned turns into ⭐ star coins */
const DUP_STARS: Record<WingTier, number> = { L: 15, SL: 40, X: 80 };
/** what is not a wing: the god elixir (rarer) or a few mana crystals (director 16 Nov: no gold back from a gold machine) */
export const SLOT_ELIXIR = 'elix_god', SLOT_SHARD = 'mana_shard', SLOT_SHARDS = 3;
const ELIXIR_W = 500;   // per 10,000 spins (never shown)

type WS = GameState & { wings?: string[]; wingOn?: string; petOn?: string; stars?: number };
export const wingsOf = (s: GameState) => (s as WS).wings ?? [];
export const ownsWing = (s: GameState, id: string) => wingsOf(s).includes(id);
/** the wings out now (owned and chosen), or null */
export function activeWing(s: GameState) { const id = (s as WS).wingOn; return id && ownsWing(s, id) && WING_BY_ID[id] ? WING_BY_ID[id] : null; }
/** put wings on (null = take them off); wings out = the storm cloud put away */
export function setWing(s: GameState, id: string | null) {
  const p = s as WS;
  if (id && !ownsWing(s, id)) return false;
  p.wingOn = id ?? 'none';   // (the UI also puts the cloud away and gets off the mount — server actions)
  return true;
}
/** the storm cloud is being put on: the wings come off (the other half of "one at a time") */
export function wingsOffForCloud(s: GameState) { (s as WS).wingOn = 'none'; }

export interface WPrize { wing?: string; item?: { id: string; qty: number }; gold?: number; stars?: number; text: string }
function roll(rnd: () => number, ltd: boolean): string | null {
  let r = rnd() * 10000;
  for (const w of WINGS) { if (w.tier === 'X' && !ltd) continue; r -= WEIGHT[w.tier]; if (r < 0) return w.id; }
  return null;
}
/** spin the machine 1 or 10 times (server) */
export function spinWings(s: GameState, n: number, rnd: () => number, ltd = WSLOT_LTD): 'gold' | 'bag' | 'n' | { prizes: WPrize[]; cost: number } {
  if (n !== 1 && n !== 10) return 'n';
  const p = s as WS, cost = n === 10 ? WSLOT_PRICE10 : WSLOT_PRICE;
  if (s.gold < cost) return 'gold';
  if (s.inventory.length + 2 > invSize(s)) return 'bag';
  s.gold -= cost;
  const prizes: WPrize[] = [];
  for (let i = 0; i < n; i++) {
    const id = roll(rnd, ltd);
    if (id) {
      const w = WING_BY_ID[id];
      if (ownsWing(s, id)) { const st = DUP_STARS[w.tier]; p.stars = (p.stars ?? 0) + st; prizes.push({ wing: id, stars: st, text: `${w.name} (มีแล้ว → ⭐ ${st})` }); }
      else { (p.wings ??= []).push(id); prizes.push({ wing: id, text: `🪽 ${w.name}!` }); }
    } else {
      if (rnd() * 10000 < ELIXIR_W) { addItem(s, SLOT_ELIXIR, 1); prizes.push({ item: { id: SLOT_ELIXIR, qty: 1 }, text: '' }); }
      else { addItem(s, SLOT_SHARD, SLOT_SHARDS); prizes.push({ item: { id: SLOT_SHARD, qty: SLOT_SHARDS }, text: '' }); }
    }
  }
  return { prizes, cost };
}

// ---------------------------------------------------------------- 🐎 mounts in the same machine (director 15 Nov: one machine,
// a tab for wings and a tab for mounts). Legend wolf / bear, SL stag / panther, Limited golden dragon (kept through OBT).
import { grantMount, hasMount } from './mounts';
import type { MountId } from '../data/mounts';
export const SLOT_MOUNTS: { id: MountId; tier: WingTier }[] = [{ id: 'wolf', tier: 'L' }, { id: 'bear', tier: 'L' }, { id: 'stag', tier: 'SL' }, { id: 'panther', tier: 'SL' }, { id: 'gdragon', tier: 'X' }];
export interface MPrize { mount?: MountId; item?: { id: string; qty: number }; gold?: number; stars?: number }
/** spin the mount side 1 or 10 times (server); the same price, the same no-salt prizes */
export function spinMounts(s: GameState, n: number, rnd: () => number): 'gold' | 'bag' | 'n' | { prizes: MPrize[]; cost: number } {
  if (n !== 1 && n !== 10) return 'n';
  const p = s as WS, cost = n === 10 ? WSLOT_PRICE10 : WSLOT_PRICE;
  if (s.gold < cost) return 'gold';
  if (s.inventory.length + 2 > invSize(s)) return 'bag';
  s.gold -= cost;
  const prizes: MPrize[] = [];
  for (let i = 0; i < n; i++) {
    let r = rnd() * 10000, got: (typeof SLOT_MOUNTS)[number] | null = null;
    for (const m of SLOT_MOUNTS) { r -= WEIGHT[m.tier] * 1.5; if (r < 0) { got = m; break; } }   // (5 mounts against 13 wings: each a little likelier)
    if (got) {
      if (hasMount(s, got.id)) { const st = DUP_STARS[got.tier]; p.stars = (p.stars ?? 0) + st; prizes.push({ mount: got.id, stars: st }); }
      else { grantMount(s, got.id); prizes.push({ mount: got.id }); }
    } else if (rnd() * 10000 < ELIXIR_W) { addItem(s, SLOT_ELIXIR, 1); prizes.push({ item: { id: SLOT_ELIXIR, qty: 1 } }); }
    else { addItem(s, SLOT_SHARD, SLOT_SHARDS); prizes.push({ item: { id: SLOT_SHARD, qty: SLOT_SHARDS } }); }
  }
  return { prizes, cost };
}
