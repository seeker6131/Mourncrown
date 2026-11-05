// Test hooks used by automated browser tests (window.__dbg).
import { runtime, bus, EV } from './events';
import { advanceClass } from '../systems/stats';
import { saveGame } from './save';
import { addItem, equip } from '../systems/inventory';
import { makeGear } from '../systems/loot';
import { derive, gainExp, expToNext } from '../systems/stats';
import type Phaser from 'phaser';

export function installDebug(game: Phaser.Game) {
  (window as unknown as { __dbgState: unknown }).__dbgState = () => runtime.state;
  (window as unknown as { __dbg: unknown }).__dbg = {
    boss() {
      const s = runtime.state!;
      let need = 0; for (let l = s.level; l < 15; l++) need += expToNext(l);
      gainExp(s, need - s.exp);
      addItem(s, 'flame_saber', 1, 0, makeGear(Math.random, 'flame_saber', 3)); equip(s, s.inventory[s.inventory.length - 1].uid);
      addItem(s, 'knight_plate', 1, 0, makeGear(Math.random, 'knight_plate', 3)); equip(s, s.inventory[s.inventory.length - 1].uid);
      addItem(s, 'hp_potion_l', 10);
      const d = derive(s); s.hp = d.maxHp; s.mp = d.maxMp;
      s.auto = true; s.cls = 'sword'; s.tier = 2;
      const w = game.scene.getScene('World') as unknown as { hero: { x: number; y: number }; map: { bossPos: { x: number; y: number } }; onState(): void };
      w.hero.x = w.map.bossPos.x - 90; w.hero.y = w.map.bossPos.y;
      w.onState();
      game.events.emit('dbg');
    },
    info() {
      const s = runtime.state!;
      const w = game.scene.getScene('World') as unknown as { boss: { hp: number; alive: boolean } | null; hero: { x: number; y: number } };
      return JSON.stringify({ lv: s.level, hp: s.hp, gold: s.gold, inv: s.inventory.length, boss: w.boss ? { hp: Math.round(w.boss.hp), alive: w.boss.alive } : null, defeated: s.bossDefeated, pos: s.pos });
    },
    cls(c: string) { const s = runtime.state!; s.level = Math.max(s.level, 5); advanceClass(s, c as never); bus.emit(EV.STATE_CHANGED); },
    save() { return saveGame(runtime.state!); },
  };
}
