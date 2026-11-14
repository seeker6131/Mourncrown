// Small pixel HP bar over a player's head (the hero and other players / test bots — never NPCs).
import type Phaser from 'phaser';

export function hpBar(g: Phaser.GameObjects.Graphics, x: number, y: number, f: number, w = 22) {
  const k = Math.max(0, Math.min(1, f)), l = Math.round(x - w / 2), t = Math.round(y), fill = Math.round(w * k);
  g.fillStyle(0x0b0805, 0.85).fillRect(l - 1, t - 1, w + 2, 5);
  g.fillStyle(0x3a1410, 1).fillRect(l, t, w, 3);
  if (fill > 0) { g.fillStyle(k > 0.5 ? 0x5ad86a : k > 0.25 ? 0xffc040 : 0xff4a3a, 1).fillRect(l, t, fill, 3); g.fillStyle(0xffffff, 0.3).fillRect(l, t, fill, 1); }
}
