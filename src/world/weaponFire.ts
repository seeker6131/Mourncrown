// 🔥 Weapon flames (director): a weapon upgraded to +5..+9 burns gold, +10 burns red — every class, every form. The hero
// pictures have the weapon drawn in, so the flame sits where the weapon hand is for the facing (8 directions), scaled by
// the form's height; a few rising sparks with a soft glow, never many (old phones).
import Phaser from 'phaser';

/** the weapon hand for each facing (0 = south, clockwise), as a share of the hero's height: [x from the centre, up from the feet] */
export const HAND: [number, number][] = [[-0.2, 0.42], [0.04, 0.42], [0.18, 0.44], [0.2, 0.47], [0.2, 0.48], [-0.04, 0.47], [-0.18, 0.44], [-0.22, 0.42]];
export const fireTier = (upg: number) => (upg >= 10 ? 2 : upg >= 5 ? 1 : 0);
const TINTS: Record<number, number[]> = { 1: [0xfff6c0, 0xffd84a, 0xffa020], 2: [0xffd0a0, 0xff4a2a, 0xb01010] };

function tex(sc: Phaser.Scene) {
  if (sc.textures.exists('px_flame')) return;
  const c = document.createElement('canvas'); c.width = 4; c.height = 6; const k = c.getContext('2d')!;
  const g = k.createRadialGradient(2, 3, 0, 2, 3, 3); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  k.fillStyle = g; k.fillRect(0, 0, 4, 6); sc.textures.addCanvas('px_flame', c);
}

export class WeaponFire {
  em: Phaser.GameObjects.Particles.ParticleEmitter; glow: Phaser.GameObjects.Arc; tier: number;
  constructor(public sc: Phaser.Scene, tier: number) {
    tex(sc); this.tier = tier;
    this.glow = sc.add.circle(0, 0, tier === 2 ? 7 : 5, tier === 2 ? 0xff3a1a : 0xffc83a, 0.28).setBlendMode(Phaser.BlendModes.ADD);
    this.em = sc.add.particles(0, 0, 'px_flame', {
      x: { min: -2.5, max: 2.5 }, y: { min: -2, max: 2 }, speedY: { min: tier === 2 ? -40 : -30, max: -12 }, speedX: { min: -5, max: 5 },
      lifespan: { min: 260, max: tier === 2 ? 520 : 420 }, scale: { start: tier === 2 ? 1.5 : 1.15, end: 0.2 }, alpha: { start: 0.95, end: 0 },
      tint: TINTS[tier], frequency: tier === 2 ? 28 : 45, blendMode: Phaser.BlendModes.ADD, maxAliveParticles: tier === 2 ? 26 : 16,
    });
  }
  /** follow the hand: feet at (x, y), height h (px on screen), facing dir; visible or not */
  update(x: number, y: number, h: number, dir: number, depth: number, time: number, visible: boolean) {
    const [fx, fy] = HAND[dir] ?? HAND[0], hx = x + fx * h, hy = y - fy * h;
    this.em.setPosition(hx, hy).setDepth(depth + 0.6).setVisible(visible); this.em.emitting = visible;
    this.glow.setPosition(hx, hy).setDepth(depth + 0.5).setVisible(visible).setScale(1 + Math.sin(time / 90) * 0.15);
  }
  destroy() { this.em.destroy(); this.glow.destroy(); }
}
