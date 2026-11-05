import { newGameState, SAVE_VERSION, type GameState } from './state';
import { addItem, equip } from '../systems/inventory';
import { derive } from '../systems/stats';

const KEY = 'eldergrove_save_v1';

export function hasSave(): boolean {
  try { return !!localStorage.getItem(KEY); } catch { return false; }
}

export function saveGame(s: GameState): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    return true;
  } catch { return false; }
}

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || data.version !== SAVE_VERSION) return null;
    // merge onto defaults so new fields survive old saves
    const st: GameState = { ...newGameState(), ...data, base: { ...newGameState().base, ...data.base } };
    if (data.mapVer !== 2) { st.pos = { x: -1, y: -1 }; st.mapVer = 2; } // map projection changed in v0.2
    return st;
  } catch { return null; }
}

export function deleteSave() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

export function startNewGame(): GameState {
  const s = newGameState();
  addItem(s, 'wood_sword');
  addItem(s, 'cloth_tunic');
  addItem(s, 'hp_potion', 5);
  addItem(s, 'mp_potion', 3);
  equip(s, s.inventory[0].uid);
  equip(s, s.inventory[1].uid);
  const d = derive(s);
  s.hp = d.maxHp; s.mp = d.maxMp;
  return s;
}
