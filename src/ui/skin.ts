// Image-based UI skin made from the Director's UI kit (tools/import_ui.py -> src/assets/ui).
// Textures are stored at 3x of the UI's virtual pixels and drawn at 1/3 scale for sharpness.
import Phaser from 'phaser';
import meta from '../assets/ui/meta.json';
import type { SkillDef } from '../data/skills';

type M = { w: number; h: number; slice?: number; inset?: number; cap?: number; x0?: number; x1?: number };
export const UI_META = meta as Record<string, M>;
const files = import.meta.glob('../assets/ui/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
export const UK = 3;

export function preloadUi(scene: Phaser.Scene) {
  for (const [p, u] of Object.entries(files)) scene.load.image('ui_' + p.split('/').pop()!.replace('.webp', ''), u);
}
export const hasSkin = (scene: Phaser.Scene) => scene.textures.exists('ui_panel');

/** HUD menu icons replaced by the painted round icons. */
const ALIAS: Record<string, string> = { fx_ui_bag: 'ui_hud0', fx_ui_hero: 'ui_hud1', fx_ui_scroll: 'ui_hud2', fx_ui_gear: 'ui_hud3', fx_ui_full: 'ui_hud4' };
export const SKINNED = new Set<string>();
export function applyUi(scene: Phaser.Scene) {
  for (const [k, src] of Object.entries(ALIAS)) {
    if (!scene.textures.exists(src)) continue;
    if (scene.textures.exists(k)) scene.textures.remove(k);
    scene.textures.addImage(k, scene.textures.get(src).getSourceImage() as HTMLImageElement);
    SKINNED.add(k);
  }
}

/** Ornate 9-slice window frame. */
export function panelFrame(scene: Phaser.Scene, x: number, y: number, w: number, h: number): Phaser.GameObjects.GameObject[] {
  const s = UI_META.panel.slice!, pad = 6, ins = (UI_META.panel.inset ?? 40) / UK - pad;
  const out: Phaser.GameObjects.GameObject[] = [];
  if (scene.textures.exists('ui_leather')) out.push(scene.add.tileSprite(x + ins, y + ins, (w - ins * 2) * UK, (h - ins * 2) * UK, 'ui_leather').setOrigin(0).setScale(1 / UK));
  out.push(scene.add.nineslice(x - pad, y - pad, 'ui_panel', undefined, (w + pad * 2) * UK, (h + pad * 2) * UK, s, s, s, s).setOrigin(0).setScale(1 / UK));
  return out;
}

/** Button plate by colour family. */
export function buttonPlate(color: number | undefined, disabled?: boolean) {
  if (disabled) return 2;
  if (color === undefined) return 0;
  const c = Phaser.Display.Color.IntegerToColor(color);
  const hsv = Phaser.Display.Color.RGBToHSV(c.red, c.green, c.blue) as { h: number; s: number; v: number };
  const h = hsv.h * 360;
  if (hsv.s < 0.25) return 0;
  if (h >= 80 && h < 170) return 3;   // green
  if (h >= 170 && h < 330) return 5;  // blue / purple
  if (h < 15 || h >= 330) return 4;   // red
  if (h < 30) return color === 0x3a2414 ? 0 : 4;
  return 1;                            // orange / gold
}

/** Painted 8-icon set mapped onto skills by their kind. */
export function skillIconKey(scene: Phaser.Scene, sk: SkillDef): string {
  const pick = (): number => {
    const id = sk.id;
    if (sk.kind === 'heal') return 6;
    if (sk.kind === 'shield' || (sk.kind === 'buff' && sk.buff?.def)) return 4;
    if (sk.kind === 'buff') return 5;
    if (sk.kind === 'rain' && sk.fall === 'arrow') return 0;
    if (sk.proj === 'arrow' || sk.kind === 'pierce') return 1;
    if (id.startsWith('m4_meteor') || sk.fall === 'meteor') return 3;
    if (id.startsWith('m')) return 2;
    return 7;
  };
  const k = 'ui_skill' + pick();
  return scene.textures.exists(k) ? k : `icon_${sk.icon}`;
}

/** Painted HP/MP/EXP/boss bar: empty frame + liquid revealed by crop. */
export class SkinBar {
  empty: Phaser.GameObjects.Image; full: Phaser.GameObjects.Image; m: M;
  constructor(scene: Phaser.Scene, kind: 'hp' | 'mp' | 'exp' | 'boss', x: number, y: number, w: number) {
    this.m = UI_META['bar_' + kind];
    const sc = w / this.m.w;
    this.empty = scene.add.image(x, y, `ui_bar_${kind}_empty`).setOrigin(0, 0.5).setScale(sc);
    this.full = scene.add.image(x, y, `ui_bar_${kind}`).setOrigin(0, 0.5).setScale(sc);
  }
  get h() { return this.empty.displayHeight; }
  set(frac: number) {
    frac = Phaser.Math.Clamp(frac, 0, 1);
    const { x0 = 0, x1 = this.m.w } = this.m;
    // liquid only: the left icon stays bright, the tube fills
    this.full.setCrop(0, 0, frac >= 1 ? this.m.w : x0 + (x1 - x0) * frac, this.m.h);
  }
  tubeCenter() { const { x0 = 0, x1 = this.m.w } = this.m; return this.empty.x + ((x0 + x1) / 2) * this.empty.scaleX; }
  setVisible(v: boolean) { this.empty.setVisible(v); this.full.setVisible(v); return this; }
}
