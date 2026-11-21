// 👑 The supporter name plate behind a hero's name (src/systems/supporter.ts plateOf). Director (19 Nov): small — just a
// frame around the name, see-through when it covers another hero, never on the battlefield. Drawn in code (no art to load):
// copper (tiers 1-2), silver (3-4), gold with a soft glow (5-6), the top one with a small crown and wing tips (7).
import Phaser from 'phaser';
import { plateOf } from '../systems/supporter';

const LOOK: Record<number, { fill: number; edge: number; hi: number }> = {
  1: { fill: 0x2a1a10, edge: 0xb87a4a, hi: 0xe0a878 },
  2: { fill: 0x1e2028, edge: 0xb8c4d4, hi: 0xeef4ff },
  3: { fill: 0x2a1e08, edge: 0xe8b83a, hi: 0xfff0a0 },
  4: { fill: 0x24103a, edge: 0xffd84a, hi: 0xffffff },
};

export class SupPlate {
  g: Phaser.GameObjects.Graphics; look = 0; w = 0;
  constructor(sc: Phaser.Scene) { this.g = sc.add.graphics().setDepth(99989); }
  /** tier 0 = no plate; `faint` = it covers another hero right now */
  update(tag: Phaser.GameObjects.Text, tier: number, faint: boolean, now: number) {
    const look = tag.visible ? plateOf(tier) : 0, w = Math.ceil(tag.width) + 6;
    if (look !== this.look || w !== this.w) {
      this.look = look; this.w = w; this.g.clear();
      const c = LOOK[look];
      if (c) {
        const h = 10, x = -w / 2, y = -h + 1;
        this.g.fillStyle(c.fill, 0.82).fillRoundedRect(x, y, w, h, 3).lineStyle(1, c.edge, 1).strokeRoundedRect(x, y, w, h, 3);
        this.g.lineStyle(1, c.hi, 0.7).lineBetween(x + 3, y + 1, x + w - 3, y + 1);   // (a thin light line on top)
        if (look === 4) {   // the top plate: wing tips at both ends + a tiny crown on top
          this.g.fillStyle(c.edge, 1).fillTriangle(x, y + 2, x - 5, y - 1, x, y + 7).fillTriangle(x + w, y + 2, x + w + 5, y - 1, x + w, y + 7);
          this.g.fillTriangle(-4, y, -3, y - 4, -1, y).fillTriangle(-1, y, 0, y - 5, 1, y).fillTriangle(1, y, 3, y - 4, 4, y);
        }
      }
    }
    if (!look) { this.g.setVisible(false); return; }
    // follows the name (the text's origin is its bottom centre); gold / top plates breathe a little
    const glow = look >= 3 ? 0.08 * Math.sin(now / 320) : 0;
    this.g.setVisible(true).setPosition(Math.round(tag.x), Math.round(tag.y)).setAlpha((faint ? 0.35 : 1) * (0.92 + glow));
    tag.setAlpha(faint ? 0.55 : 1);
  }
  destroy() { this.g.destroy(); }
}

/** is the name at (x, y) over another hero (any of these spots) — then the plate goes see-through */
export const plateOver = (x: number, y: number, spots: Iterable<{ x: number; y: number }>, self?: { x: number; y: number }) => {
  for (const p of spots) { if (p === self) continue; if (Math.abs(p.x - x) < 26 && y - p.y > -8 && y - p.y < 46) return true; }
  return false;
};
