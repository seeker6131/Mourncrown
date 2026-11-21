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

/** what is not a wing / mount (director 16 Nov: "10 spins = 10 mana shards looks rigged"): a mix of useful things, by weight
 *  (never shown). In a 10-spin the same small prize comes at most SAME_MAX times, and a 10-spin with no wing / mount always
 *  holds one better prize (a Super Rare selector chest, an ancient core or the god elixir). */
export const SLOT_FILL: { id: string; qty: number; w: number }[] = [
  { id: SLOT_SHARD, qty: SLOT_SHARDS, w: 34 }, { id: 'hp_potion_l', qty: 3, w: 18 }, { id: 'mp_potion', qty: 5, w: 12 }, { id: 'scroll_return', qty: 2, w: 12 },
  { id: 'tonic_atk', qty: 1, w: 6 }, { id: 'tonic_def', qty: 1, w: 6 }, { id: 'tonic_exp', qty: 1, w: 6 }, { id: 'pick_rare', qty: 1, w: 4 }, { id: 'ancient_core', qty: 1, w: 2 },
];
export const SAME_MAX = 3;
const GOOD: { id: string; w: number }[] = [{ id: 'pick_sr', w: 60 }, { id: 'ancient_core', w: 30 }, { id: SLOT_ELIXIR, w: 10 }];
/** the better small prizes (the UI shows them first) */
export const GOOD_IDS = new Set(['pick_sr', 'ancient_core', SLOT_ELIXIR]);
const wpick = <T extends { w: number }>(l: T[], rnd: () => number) => { let r = rnd() * l.reduce((t, q) => t + q.w, 0); for (const q of l) { r -= q.w; if (r < 0) return q; } return l[l.length - 1]; };
/** one small prize, avoiding any already given SAME_MAX times in this spin */
function fill(s: GameState, rnd: () => number, seen: Map<string, number>): { id: string; qty: number } {
  const ok = SLOT_FILL.filter(f => (seen.get(f.id) ?? 0) < SAME_MAX);
  const f = rnd() * 10000 < ELIXIR_W ? { id: SLOT_ELIXIR, qty: 1 } : wpick(ok.length ? ok : SLOT_FILL, rnd);
  seen.set(f.id, (seen.get(f.id) ?? 0) + 1); addItem(s, f.id, f.qty); return { id: f.id, qty: f.qty };
}
/** a 10-spin with no wing / mount: the last small prize becomes a better one */
function better(s: GameState, rnd: () => number, list: { item?: { id: string; qty: number } }[]) {
  const small = list.filter(p => p.item); if (!small.length) return;
  const last = small[Math.floor(rnd() * small.length)];   // (any place in the 10, not always the last — no pattern to see)
  if (!last.item) return;
  const it = s.inventory.find(i => i.id === last.item!.id);
  if (it) { it.qty -= last.item.qty; if (it.qty <= 0) s.inventory.splice(s.inventory.indexOf(it), 1); }   // (take the small one back)
  const g = wpick(GOOD, rnd); addItem(s, g.id, 1); last.item = { id: g.id, qty: 1 };
}
/** the bag room a spin needs (a 10-spin can bring several new kinds) */
const room = (n: number) => n === 10 ? 8 : 2;

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
  if (s.inventory.length + room(n) > invSize(s)) return 'bag';
  s.gold -= cost;
  const prizes: WPrize[] = [], seen = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const id = roll(rnd, ltd);
    if (id) {
      const w = WING_BY_ID[id];
      if (ownsWing(s, id)) { const st = DUP_STARS[w.tier]; p.stars = (p.stars ?? 0) + st; prizes.push({ wing: id, stars: st, text: `${w.name} (มีแล้ว → ⭐ ${st})` }); }
      else { (p.wings ??= []).push(id); prizes.push({ wing: id, text: `🪽 ${w.name}!` }); }
    } else prizes.push({ item: fill(s, rnd, seen), text: '' });
  }
  if (n === 10 && !prizes.some(p => p.wing)) better(s, rnd, prizes);
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
  if (s.inventory.length + room(n) > invSize(s)) return 'bag';
  s.gold -= cost;
  const prizes: MPrize[] = [], seen = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    let r = rnd() * 10000, got: (typeof SLOT_MOUNTS)[number] | null = null;
    for (const m of SLOT_MOUNTS) { r -= WEIGHT[m.tier] * 1.5; if (r < 0) { got = m; break; } }   // (5 mounts against 13 wings: each a little likelier)
    if (got) {
      if (hasMount(s, got.id)) { const st = DUP_STARS[got.tier]; p.stars = (p.stars ?? 0) + st; prizes.push({ mount: got.id, stars: st }); }
      else { grantMount(s, got.id); prizes.push({ mount: got.id }); }
    } else prizes.push({ item: fill(s, rnd, seen) });
  }
  if (n === 10 && !prizes.some(p => p.mount)) better(s, rnd, prizes);
  return { prizes, cost };
}
