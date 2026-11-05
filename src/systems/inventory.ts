// Inventory / Equipment / Upgrade — pure functions over GameState.
import type { GameState, InvItem } from '../core/state';
import { INV_SIZE } from '../core/state';
import { itemDef, MAX_UPGRADE, upgradeChance, upgradeCost, type EquipSlot } from '../data/items';
import { derive } from './stats';

export function countItem(s: GameState, id: string): number {
  return s.inventory.filter(i => i.id === id).reduce((a, b) => a + b.qty, 0);
}

export function addItem(s: GameState, id: string, qty = 1, upg = 0): boolean {
  const d = itemDef(id);
  if (d.stack) {
    const ex = s.inventory.find(i => i.id === id);
    if (ex) { ex.qty += qty; return true; }
    if (s.inventory.length >= INV_SIZE) return false;
    s.inventory.push({ uid: s.nextUid++, id, qty, upg: 0 });
    return true;
  }
  for (let n = 0; n < qty; n++) {
    if (s.inventory.length >= INV_SIZE) return false;
    s.inventory.push({ uid: s.nextUid++, id, qty: 1, upg });
  }
  return true;
}

export function removeItem(s: GameState, id: string, qty = 1): boolean {
  if (countItem(s, id) < qty) return false;
  for (const it of [...s.inventory]) {
    if (it.id !== id || qty <= 0) continue;
    if (isEquipped(s, it.uid)) continue;
    const take = Math.min(qty, it.qty);
    it.qty -= take; qty -= take;
    if (it.qty <= 0) s.inventory.splice(s.inventory.indexOf(it), 1);
  }
  return qty <= 0;
}

export function removeUid(s: GameState, uid: number, qty = 1) {
  const it = s.inventory.find(i => i.uid === uid);
  if (!it) return;
  unequipUid(s, uid);
  it.qty -= qty;
  if (it.qty <= 0) s.inventory.splice(s.inventory.indexOf(it), 1);
}

export function isEquipped(s: GameState, uid: number): boolean {
  return s.equip.weapon === uid || s.equip.armor === uid || s.equip.accessory === uid;
}

export function equip(s: GameState, uid: number): boolean {
  const it = s.inventory.find(i => i.uid === uid);
  if (!it) return false;
  const d = itemDef(it.id);
  if (d.type !== 'weapon' && d.type !== 'armor' && d.type !== 'accessory') return false;
  s.equip[d.type as EquipSlot] = uid;
  clampVitals(s);
  return true;
}

export function unequipUid(s: GameState, uid: number) {
  for (const k of ['weapon', 'armor', 'accessory'] as const) if (s.equip[k] === uid) s.equip[k] = null;
  clampVitals(s);
}

export function clampVitals(s: GameState) {
  const d = derive(s);
  s.hp = Math.min(s.hp, d.maxHp);
  s.mp = Math.min(s.mp, d.maxMp);
}

export function useItem(s: GameState, uid: number): { heal: number; mana: number } | null {
  const it = s.inventory.find(i => i.uid === uid);
  if (!it) return null;
  const d = itemDef(it.id);
  if (d.type !== 'consumable') return null;
  const der = derive(s);
  const heal = Math.min(d.heal ?? 0, der.maxHp - s.hp);
  const mana = Math.min(d.mana ?? 0, der.maxMp - s.mp);
  s.hp += heal; s.mp += mana;
  removeUid(s, uid, 1);
  return { heal, mana };
}

export function equippedLook(s: GameState, slot: EquipSlot): number {
  const uid = s.equip[slot];
  if (uid == null) return -1;
  const it = s.inventory.find(i => i.uid === uid);
  return it ? itemDef(it.id).look ?? 0 : -1;
}

export type UpgradeResult = 'ok' | 'fail' | 'max' | 'no_gold' | 'no_shard' | 'invalid';

export function tryUpgrade(s: GameState, uid: number, rnd: () => number = Math.random): UpgradeResult {
  const it = s.inventory.find(i => i.uid === uid);
  if (!it) return 'invalid';
  const d = itemDef(it.id);
  if (d.type !== 'weapon' && d.type !== 'armor' && d.type !== 'accessory') return 'invalid';
  if (it.upg >= MAX_UPGRADE) return 'max';
  const cost = upgradeCost(it.upg, d);
  if (s.gold < cost.gold) return 'no_gold';
  if (countItem(s, 'mana_shard') < cost.shards) return 'no_shard';
  s.gold -= cost.gold;
  removeItem(s, 'mana_shard', cost.shards);
  if (rnd() < upgradeChance(it.upg)) { it.upg++; return 'ok'; }
  return 'fail';
}

export function sellPrice(it: InvItem): number {
  const d = itemDef(it.id);
  return Math.max(1, Math.floor(d.price * 0.4 * (1 + it.upg * 0.25)));
}
