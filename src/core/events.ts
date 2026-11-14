import Phaser from 'phaser';
import type { GameState } from './state';

/** Global event bus between World and UI scenes. */
export const bus = new Phaser.Events.EventEmitter();

/** Shared runtime handle to the current GameState. */
export const runtime: { state: GameState | null } = { state: null };

export function S(): GameState {
  if (!runtime.state) throw new Error('No game state');
  return runtime.state;
}

export const EV = {
  STATE_CHANGED: 'state',      // any stat/inventory change -> UI refresh
  TOAST: 'toast',              // (text, color?)
  LEVEL_UP: 'levelup',
  NPC_TALK: 'npc',             // (npcId)
  NEAR_NPC: 'nearnpc',         // (npcId | null)
  SKILL_CAST: 'skillcast',     // (skillId)
  BOSS_HP: 'bosshp',           // (hp, max) | null
  HERO_DIED: 'herodied',
  ZONE: 'zone',                // (zoneName)
  MINIMAP: 'minimap',
  PLOT: 'plot',               // (plotIndex)
};
