// Player market (auction house). Pure rules — when the game goes online these run on the server.
// Prices are in 💰 gold only; a sale pays 8% tax (a gold sink that keeps prices from inflating); listings last 48 h.
// Until the server exists the BUY tab shows sample listings from pretend players so the market can be previewed.
import type { GameState, InvItem } from '../core/state';
import { itemDef, ITEMS } from '../data/items';
import { addItem, isEquipped, removeUid, sellPrice } from './inventory';
import { pickBase, makeGear, rollRarity } from './loot';
import { invSize } from '../core/state';

export const MARKET_FEE = 0.08, LISTING_HOURS = 48, MAX_LISTINGS = 10;
export interface Listing { id: string; seller: string; item: Omit<InvItem, 'uid'>; price: number; until: number; sample?: boolean }
type MS = GameState & { myListings?: Listing[] };

export const feeOf = (price: number) => Math.ceil(price * MARKET_FEE);
/** a starting price: a few times the NPC price, more for rarer pieces */
/** a fair player-market price: from the item's value and rarity (not the low NPC buy price) */
export function suggestPrice(it: Omit<InvItem, 'uid'>) { const d = itemDef(it.id), r = d.rarity; return Math.max(10, Math.round(d.price * 0.5 * (1 + it.upg * 0.3) * (1 + Math.pow(r, 1.8)) / 10) * 10); }
export const myListings = (s: GameState) => (s as MS).myListings ?? [];

export function listItem(s: GameState, uid: number, qty: number, price: number, now = Date.now()): Listing | 'equipped' | 'missing' | 'full' | 'price' {
  const it = s.inventory.find(i => i.uid === uid);
  if (!it) return 'missing';
  if (isEquipped(s, uid)) return 'equipped';
  if (myListings(s).length >= MAX_LISTINGS) return 'full';
  if (!(price >= 1)) return 'price';
  const n = Math.max(1, Math.min(qty, it.qty));
  const l: Listing = { id: `L${now}${uid}`, seller: 'คุณ', item: { id: it.id, qty: n, upg: it.upg, rar: it.rar, aff: it.aff }, price: Math.round(price), until: now + LISTING_HOURS * 3600000 };
  removeUid(s, uid, n);
  (s as MS).myListings = [...myListings(s), l];
  return l;
}
/** take a listing back into the bag (also used when it expires) */
export function cancelListing(s: GameState, id: string): boolean {
  const l = myListings(s).find(q => q.id === id); if (!l) return false;
  if (s.inventory.length >= invSize(s) && !ITEMS[l.item.id]?.stack) return false;
  if (!addItem(s, l.item.id, l.item.qty, l.item.upg, { rar: l.item.rar, aff: l.item.aff })) return false;
  (s as MS).myListings = myListings(s).filter(q => q.id !== id);
  return true;
}

const NAMES = ['ShadowFox', 'มีดบินพิฆาต', 'LunaArcher', 'ป้าแม่ค้าใจดี', 'IronWall', 'จอมเวทมือใหม่', 'Kaito', 'นักล่าเงา', 'ElfQueen', 'ช่างตีดาบ', 'NightOwl', 'ราชันย์หมาป่า'];
/** pretend listings for the preview (deterministic per day) */
export function sampleListings(now = Date.now()): Listing[] {
  let seed = Math.floor(now / 86400000) * 7919 + 17; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const out: Listing[] = [];
  for (let i = 0; i < 48; i++) {
    let item: Omit<InvItem, 'uid'>;
    if (i % 4 === 3) { const id = ['hp_potion_l', 'mana_shard', 'wolf_pelt', 'goblin_fang', 'wisp_essence', 'ancient_core', 'tonic_exp'][Math.floor(r() * 7)]; item = { id, qty: 1 + Math.floor(r() * 20), upg: 0 }; }
    else { const rar = Math.min(4, rollRarity(r, 150, 0)); const b = pickBase(r, rar); const g = makeGear(r, b.id, rar); item = { id: b.id, qty: 1, upg: r() < 0.3 ? Math.floor(r() * 7) : 0, rar: g.rar, aff: g.aff }; }
    const base = suggestPrice(item) * item.qty * (0.7 + r() * 0.9);
    out.push({ id: `S${i}`, seller: NAMES[Math.floor(r() * NAMES.length)], item, price: Math.max(5, Math.round(base / 5) * 5), until: now + (2 + r() * 46) * 3600000, sample: true });
  }
  return out;
}
export const itemType = (id: string) => itemDef(id).type;
