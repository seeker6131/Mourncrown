// 👥 Several characters on one account (director 2026-11-14). The account keeps ONE saved state (one Player object on the
// server); the character being played is "swapped in": its own keys (below) live at the top of the state, the others wait
// in `alts`. Everything not listed is the account's and shared by every character: gold, diamonds, VIP, the village and
// its resources, the house chest (home.stash — how characters pass items to each other), mounts, looks, mail, guild,
// market, achievements / titles. 2 slots are free; a 3rd and 4th cost diamonds.
import type { GameState } from '../core/state';
import { startNewGame } from '../core/save';
import { invSize } from '../core/state';
import { itemDef } from '../data/items';
import { isEquipped } from './inventory';

/** the keys that belong to one character (swapped when switching) — anything else is shared by the account */
export const CHAR_KEYS = [
  'name', 'level', 'exp', 'statPoints', 'base', 'hp', 'mp', 'inventory', 'equip', 'quests', 'pos', 'map', 'mapPos',
  'cls', 'tier', 'look', 'useTier', 'outfit', 'prevOutfit', 'skillLv', 'skillPts', 'buff', 'elixir',
  'bossDefeated', 'bossFirst', 'tdq', 'tdKills', 'tdCasts', 'tdMaxMap', 'tut', 'tutBase', 'tutPaid', 'slPity',
  'dng', 'bounty', 'energy', 'heroHungry', 'auto', 'farm', 'pot', 'daily', 'kills', 'playTime',
] as const;
export const FREE_SLOTS = 2, MAX_SLOTS = 4, SLOT_PRICE = 300;   // (💎 a slot past the free ones)

type Bag = Record<string, unknown>;
type CS = GameState & { slot?: number; alts?: Record<string, Bag>; slotsBought?: number; diamonds?: number };
export interface CharInfo { slot: number; name: string; cls: string; tier: number; level: number; active: boolean }

const take = (s: Bag): Bag => { const o: Bag = {}; for (const k of CHAR_KEYS) if (k in s) { o[k] = s[k]; } return o; };
export const activeSlot = (s: GameState) => (s as CS).slot ?? 1;
export const slotCount = (s: GameState) => Math.min(MAX_SLOTS, FREE_SLOTS + ((s as CS).slotsBought ?? 0));
/** every character on the account (the active one from the top of the state) */
export function charList(s: GameState): CharInfo[] {
  const p = s as CS, me = activeSlot(s), out: CharInfo[] = [{ slot: me, name: s.name, cls: s.cls, tier: s.tier ?? 0, level: s.level, active: true }];
  for (const [k, c] of Object.entries(p.alts ?? {})) out.push({ slot: Number(k), name: String(c.name ?? ''), cls: String(c.cls ?? 'novice'), tier: Number(c.tier) || 0, level: Number(c.level) || 1, active: false });
  return out.sort((a, b) => a.slot - b.slot);
}
const freeSlot = (s: GameState) => { const used = new Set(charList(s).map(c => c.slot)); for (let i = 1; i <= slotCount(s); i++) if (!used.has(i)) return i; return 0; };
/** play another character: the current one's keys go to `alts`, the chosen one's come up */
export function switchChar(s: GameState, slot: number): { ok: true } | { refused: string } {
  const p = s as CS & Bag, me = activeSlot(s);
  if (slot === me) return { refused: 'same' };
  const next = p.alts?.[String(slot)]; if (!next) return { refused: 'slot' };
  const cur = take(p); for (const k of CHAR_KEYS) delete p[k];
  Object.assign(p, next); p.alts = { ...(p.alts ?? {}), [String(me)]: cur }; delete p.alts[String(slot)];
  p.slot = slot;
  return { ok: true };
}
/** a new level-1 character in a free slot (not played yet: switch to it) — the name is checked by the server first */
export function createChar(s: GameState, name: string): { ok: true; slot: number } | { refused: string } {
  const slot = freeSlot(s); if (!slot) return { refused: 'slots' };
  const fresh = take(startNewGame() as unknown as Bag);
  fresh.name = name; fresh.tut = 99;   // (the village and its lessons are already known to this account)
  { // the account counts item numbers once for every character (the chest and sending items need them unique)
    const inv = fresh.inventory as GameState['inventory'], eq = fresh.equip as Record<string, number | null>, map = new Map<number, number>();
    for (const it of inv) { const n = s.nextUid++; map.set(it.uid, n); it.uid = n; }
    for (const k of Object.keys(eq)) if (eq[k] != null) eq[k] = map.get(eq[k]!) ?? null;
  }
  const p = s as CS; p.alts = { ...(p.alts ?? {}), [String(slot)]: fresh }; p.slot ??= 1;
  return { ok: true, slot };
}
/** another slot for diamonds (up to MAX_SLOTS) */
export function buySlot(s: GameState): { ok: true; slots: number } | { refused: string } {
  const p = s as CS; if (slotCount(s) >= MAX_SLOTS) return { refused: 'max' };
  if ((p.diamonds ?? 0) < SLOT_PRICE) return { refused: 'diamonds' };
  p.diamonds = (p.diamonds ?? 0) - SLOT_PRICE; p.slotsBought = (p.slotsBought ?? 0) + 1;
  return { ok: true, slots: slotCount(s) };
}
/** the name rule (same as the first name): 2–16 Thai / English letters or digits */
export const nameOk = (n: string) => /^[A-Za-z0-9฀-๿]{2,16}$/.test(n);
/** 📤 send an item from the character being played straight into another character's bag (gear: the piece; a stack: qty) */
export function giveToChar(s: GameState, uid: number, slot: number, qty = 0): { ok: true; name: string } | { refused: string } {
  const p = s as CS, to = p.alts?.[String(slot)] as { name?: string; inventory?: GameState['inventory'] } | undefined; if (!to) return { refused: 'slot' };
  const it = s.inventory.find(i => i.uid === uid); if (!it) return { refused: 'item' };
  if (isEquipped(s, uid)) return { refused: 'equipped' };
  const inv = (to.inventory ??= []), stack = !!itemDef(it.id).stack, n = stack ? Math.max(1, Math.min(it.qty, Math.floor(qty) || it.qty)) : it.qty;
  const same = stack ? inv.find(i => i.id === it.id) : undefined;
  if (!same && inv.length >= invSize(s)) return { refused: 'full' };   // (bag size comes from the shared village / VIP: the same for every character)
  if (same) same.qty += n; else inv.push({ ...it, qty: n, uid: stack && n < it.qty ? s.nextUid++ : it.uid });
  if (n >= it.qty) s.inventory.splice(s.inventory.indexOf(it), 1); else it.qty -= n;
  return { ok: true, name: String(to.name ?? '') };
}
