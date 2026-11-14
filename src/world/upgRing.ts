// ⚔ The upgrade circle (director): a weapon at +5..+9 shows a slowly turning gold rune circle under the feet; +10 a red
// ring of fire with sparks rising off its edge. Drawn on the ground (never clashes with the auras round the body);
// the hero's own and other players'.
import Phaser from 'phaser';

export const upgTier = (upg: number) => (upg >= 10 ? 2 : upg >= 5 ? 1 : 0);
/** the weapon's +level of a state (0 = no weapon) */
export const weaponUpg = (s: { equip: { weapon: number | null }; inventory: { uid: number; upg: number }[] }) => s.equip.weapon != null ? s.inventory.find(i => i.uid === s.equip.weapon)?.upg ?? 0 : 0;

function spark(sc: Phaser.Scene) {
  if (sc.textures.exists('px_upgspark')) return;
  const c = document.createElement('canvas'); c.width = 3; c.height = 8; const k = c.getContext('2d')!;
  const g = k.createLinearGradient(0, 8, 0, 0); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  k.fillStyle = g; k.fillRect(0, 0, 3, 8); sc.textures.addCanvas('px_upgspark', c);
}

export class UpgRing {
  g: Phaser.GameObjects.Graphics; em?: Phaser.GameObjects.Particles.ParticleEmitter;
  constructor(public sc: Phaser.Scene, public tier: number) {
    this.g = sc.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    if (tier === 2) {
      spark(sc);
      this.em = sc.add.particles(0, 0, 'px_upgspark', {
        emitZone: { type: 'edge', source: new Phaser.Geom.Ellipse(0, 0, 34, 13), quantity: 24 } as never,
        speedY: { min: -34, max: -16 }, speedX: { min: -3, max: 3 }, lifespan: { min: 260, max: 460 },
        scaleX: { start: 0.9, end: 0.3 }, scaleY: { start: 1.1, end: 0.3 }, alpha: { start: 0.85, end: 0 },
        tint: [0xffd0a0, 0xff5a2a, 0xc01a10], frequency: 55, blendMode: Phaser.BlendModes.ADD, maxAliveParticles: 18,
      });
    }
  }
  update(x: number, y: number, time: number, visible: boolean) {
    const g = this.g.clear().setVisible(visible).setDepth(y - 2.5); this.em?.setVisible(visible).setPosition(x, y).setDepth(y - 2); if (this.em) this.em.emitting = visible;
    if (!visible) return;
    const red = this.tier === 2, rx = red ? 17 : 15, ry = red ? 6.5 : 5.5, col = red ? 0xff4a2a : 0xffd23a, a0 = time / (red ? 700 : 1400), pulse = 0.75 + Math.sin(time / 260) * 0.25;
    g.lineStyle(1.2, col, 0.85 * pulse).strokeEllipse(x, y, rx * 2, ry * 2);
    g.lineStyle(0.8, col, 0.45 * pulse).strokeEllipse(x, y, rx * 2 - 6, ry * 2 - 2.4);
    for (let i = 0; i < 8; i++) {   // rune marks turning round the circle
      const a = a0 + i * Math.PI / 4, px = x + Math.cos(a) * (rx - 2), py = y + Math.sin(a) * (ry - 0.8);
      g.fillStyle(red ? 0xffb070 : 0xfff2a0, 0.9 * pulse).fillRect(Math.round(px) - 1, Math.round(py) - (i % 2 ? 1 : 0), i % 2 ? 2 : 3, i % 2 ? 2 : 1);
    }
    if (red) g.fillStyle(0xff3a1a, 0.12 * pulse).fillEllipse(x, y, rx * 2, ry * 2);
  }
  destroy() { this.g.destroy(); this.em?.destroy(); }
}
