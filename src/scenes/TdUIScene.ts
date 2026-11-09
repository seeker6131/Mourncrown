// HUD + menus for the top-down game. Runs on top of TopDownScene and reuses the shared Panels
// (bag, character, shop, blacksmith, building plots, class choice, menu).
import Phaser from 'phaser';
import { activeElixir } from '../systems/alchemy';
import { UIKit } from '../ui/kit';
import { panelFrame } from '../ui/skin';
import { bus, EV, S } from '../core/events';
import { derive, expToNext, nextForm, activeTier, currentSkills } from '../systems/stats';
import { SKILL_BY_ID } from '../data/skills';
import { tdQuest, claimTdQuest, rewardText } from '../systems/tdQuests';
import { itemDef } from '../data/items';
import { saveGame } from '../core/save';
import { uiOpt } from '../core/uiOptions';
import { hideWait } from '../core/wait';
import { vipActive } from '../systems/premium';
import { skillIconKey } from '../ui/skin';
import { formName } from '../data/classes';
import { Panels } from '../ui/panels';
import { sfx } from '../audio/sfx';
import type { UIScene } from '../ui/panels';

const VH = 400;
export interface TdHost extends Phaser.Scene {
  heroKey(): string; levelUpFx(): void; resetJoy(): void; stageTitle(): string;
  castSkill(i: number): void; skillReady: Record<string, number>; stageN: number; toggleAuto(): void;
}

export class TdUIScene extends Phaser.Scene {
  kit!: UIKit;
  u = 1; VW = 640; VH = 400;
  panels!: Panels;
  root!: Phaser.GameObjects.Container;
  hud!: Phaser.GameObjects.Graphics;
  portrait!: Phaser.GameObjects.Image;
  lvText!: Phaser.GameObjects.Text; hpText!: Phaser.GameObjects.Text; expText!: Phaser.GameObjects.Text;
  resText!: Phaser.GameObjects.Text; stageText!: Phaser.GameObjects.Text; resTexts: Phaser.GameObjects.Text[] = [];
  formBtn!: Phaser.GameObjects.Container;
  actBtn!: Phaser.GameObjects.Container; actLabel = ''; actCb: (() => void) | null = null;
  toasts: Phaser.GameObjects.Text[] = [];
  lastKey = ''; refreshT = 0;
  mpText!: Phaser.GameObjects.Text;
  autoBtn!: Phaser.GameObjects.Container; autoBg!: Phaser.GameObjects.Graphics; autoTx!: Phaser.GameObjects.Text;
  questG!: Phaser.GameObjects.Graphics; questText!: Phaser.GameObjects.Text; questZone!: Phaser.GameObjects.Zone;
  skillBtns: { id: string; icon: Phaser.GameObjects.Image; cd: Phaser.GameObjects.Graphics; cdText: Phaser.GameObjects.Text; mp: Phaser.GameObjects.Text; c: Phaser.GameObjects.Container; x: number; y: number; r: number }[] = [];
  skillSet = '';

  preload() {
    const files = import.meta.glob('../assets/skills/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
    for (const [p, u] of Object.entries(files)) { const k = 'sk_' + p.split('/').pop()!.replace('.webp', ''); if (!this.textures.exists(k)) this.load.image(k, u); }
    const icons = import.meta.glob('../assets/icons/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
    // PixelLab item icons replace the code-drawn fallback icons made at boot
    for (const [p, u] of Object.entries(icons)) { const n = p.split('/').pop()!.replace('.webp', ''); if (!this.textures.exists('pl_icon_' + n)) this.load.image('pl_icon_' + n, u); }
    this.load.once('complete', () => {
      for (const k of this.textures.getTextureKeys()) if (k.startsWith('pl_icon_')) { const t = k.slice(3); if (this.textures.exists(t)) this.textures.remove(t); this.textures.renameTexture(k, t); }
    });
  }

  /** three skill buttons around the attack button (stages only) */
  buildSkills() {
    this.skillBtns.forEach(b => b.c.destroy()); this.skillBtns = [];
    const ids = currentSkills(S()); this.skillSet = ids.join(',');
    if (!this.td.stageN) return;
    const bs = uiOpt(S()).btn, R9 = this.VH / 9 * bs, ax = this.VW - R9 * 1.3, ay = this.VH - R9 * 1.3;
    const pos = [[-78, 10], [-64, -50], [-12, -80]].map(([a, b]) => [a * bs * this.VH / 400, b * bs * this.VH / 400]);
    ids.slice(0, 3).forEach((id, i) => {
      const sk = SKILL_BY_ID[id]; if (!sk) return;
      const x = ax + pos[i][0], y = ay + pos[i][1], R = 17 * bs * this.VH / 400;
      const c = this.add.container(x, y);
      const bg = this.add.circle(0, 0, R + 2, 0x0b0806, 0.8).setStrokeStyle(2, 0x8a6a40, 1);
      const key = this.textures.exists('sk_' + id) ? 'sk_' + id : skillIconKey(this, sk);
      const icon = this.add.image(0, 0, key); icon.setScale((R * 2 - 4) / Math.max(icon.width, icon.height));
      const mask = this.add.graphics().fillCircle(x, y, R).setVisible(false); icon.setMask(mask.createGeometryMask());
      const cd = this.add.graphics();
      const cdText = this.kit.text(0, 0, '', 9, '#ffffff').setOrigin(0.5);
      const mp = this.kit.text(0, R - 2, String(sk.mp), 6.5, '#8fc8ff').setOrigin(0.5, 0);
      const z = this.add.zone(0, 0, R * 2 + 6, R * 2 + 6).setInteractive();
      z.on('pointerdown', () => { c.setScale(0.92); this.td.castSkill(i); });
      z.on('pointerup', () => c.setScale(1)); z.on('pointerout', () => c.setScale(1));
      c.add([bg, icon, cd, cdText, mp, z]);
      this.root.add(c);
      this.skillBtns.push({ id, icon, cd, cdText, mp, c, x, y, r: R });
    });
  }
  updateSkills(now: number) {
    const s = S();
    if (currentSkills(s).join(',') !== this.skillSet) this.buildSkills();
    for (const b of this.skillBtns) {
      const sk = SKILL_BY_ID[b.id], left = (this.td.skillReady[b.id] ?? 0) - now, R = b.r;
      b.cd.clear();
      if (left > 0) {
        const f = left / sk.cooldown;
        b.cd.fillStyle(0x000000, 0.6).slice(0, 0, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f, false).fillPath();
        b.cdText.setText((left / 1000).toFixed(left < 1000 ? 1 : 0));
      } else b.cdText.setText('');
      b.icon.setAlpha((s.mp ?? 0) >= sk.mp ? 1 : 0.4);
    }
  }

  constructor() { super('TdUI'); }

  get td() { return this.scene.get('TopDown') as TdHost; }
  /** what Panels expects from the old WorldScene */
  get world() {
    const key = this.td.heroKey();
    return { hero: { ai: true, portrait: () => ({ key: `c_${key}_idle`, frame: 0 }) }, levelUpFx: () => this.td.levelUpFx() };
  }
  controlsReset() { this.td.resetJoy(); }
  enterStage(n: number) { (this.td as unknown as { enterStage(n: number): void }).enterStage(n); }
  /** which buildings a plot may hold: the home plot only takes the player's home */
  plotChoices(plot: number): string[] { return plot === 9 ? ['home'] : []; }
  reloadWorld() { this.scene.get('TopDown').scene.restart({ stage: 0 }); }
  toggleFullscreen() {
    sfx.click();
    if (this.scale.isFullscreen) { this.scale.stopFullscreen(); return; }
    try { document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => undefined); } catch { /* not supported */ }
  }

  create() {
    this.VH = VH / uiOpt(S()).scale;
    this.u = this.scale.height / this.VH;
    this.VW = this.scale.width / this.u;
    this.cameras.main.setOrigin(0, 0).setZoom(this.u);
    this.kit = new UIKit(this, () => Math.max(1, this.u));
    this.toasts = []; this.lastKey = ''; this.actLabel = ''; this.actCb = null; this.skillBtns = []; this.skillSet = '';
    this.root = this.add.container(0, 0);
    this.panels = new Panels(this as unknown as UIScene);
    const k = this.kit;

    // top-left: portrait, level, HP / EXP bars, gold + materials
    // top-left: wooden frame, portrait in the carved ring, HP/EXP bars, resources with icons
    this.root.add(panelFrame(this, 6, 6, 206, 50));
    this.hud = this.add.graphics();
    this.portrait = this.add.image(28, 30, '__DEFAULT');
    const ring = this.add.image(28, 30, 'ui_ring0'); ring.setScale(44 / ring.width);
    this.lvText = k.text(28, 52, 'Lv1', 8, '#ffe7a0').setOrigin(0.5);
    this.hpText = k.text(128, 9.5, '', 7, '#ffffff').setOrigin(0.5, 0);
    this.expText = k.text(128, 29, '', 6, '#e0d0ff').setOrigin(0.5, 0);
    this.mpText = k.text(128, 20.5, '', 6, '#d8ecff').setOrigin(0.5, 0);
    this.stageText = k.text(this.VW / 2, 8, '', 10, '#ffe7a0').setOrigin(0.5, 0);
    this.root.add([this.hud, this.portrait, ring, this.lvText, this.hpText, this.expText, this.mpText, this.stageText]);
    this.resTexts = (['res0', 'res1', 'res2', 'res3'] as const).map((ic, i) => {
      const x = 56 + i * 38, im = this.add.image(x, 44, 'ui_' + ic); im.setScale(11 / im.height);
      const t = k.text(x + 7, 44, '0', 7.5, '#ffe7a0').setOrigin(0, 0.5);
      this.root.add([im, t]); return t;
    });
    this.resText = this.resTexts[0];

    // AUTO toggle (above the attack button)
    {
      const bs = uiOpt(S()).btn, R9 = this.VH / 9 * bs, ax = this.VW - R9 * 1.3, ay = this.VH - R9 * 1.3;
      const x = Math.min(this.VW - 30, ax + 22 * bs), y = ay - 122 * bs * this.VH / 400;
      this.autoBtn = this.add.container(x, y);
      this.autoBg = this.add.graphics(); this.autoTx = k.text(0, 0, 'AUTO', 9, '#ffffff').setOrigin(0.5);
      const z = this.add.zone(0, 0, 54, 26).setInteractive();
      z.on('pointerup', () => { sfx.click(); this.td.toggleAuto(); });
      this.autoBtn.add([this.autoBg, this.autoTx, z]); this.root.add(this.autoBtn);
    }

    // quest tracker under the status box: tap to claim when done
    this.questG = this.add.graphics();
    this.questText = k.text(14, 66, '', 7.5, '#f3e6c4', { wordWrap: { width: 186 }, lineSpacing: 1 });
    this.questZone = this.add.zone(8, 60, 200, 30).setOrigin(0).setInteractive();
    this.questZone.on('pointerup', () => {
      const s = S(), q = claimTdQuest(s);
      if (q) { sfx.levelUp(); this.toast(`✔ ${q.title} — ได้รับ ${rewardText(q.reward, id => itemDef(id).name)}`, '#9fffb0'); saveGame(s); bus.emit(EV.STATE_CHANGED); this.td.levelUpFx(); }
    });
    this.root.add([this.questG, this.questText, this.questZone]);

    // top-right menu: icon buttons
    if (!this.textures.exists('ui_diamond')) {   // 💎 icon drawn once
      const cv = document.createElement('canvas'); cv.width = 40; cv.height = 40; const q = cv.getContext('2d')!;
      const gr = q.createLinearGradient(0, 4, 0, 36); gr.addColorStop(0, '#d8fbff'); gr.addColorStop(0.5, '#5ad2f0'); gr.addColorStop(1, '#1a6aa8');
      q.fillStyle = gr; q.beginPath(); q.moveTo(8, 14); q.lineTo(14, 5); q.lineTo(26, 5); q.lineTo(32, 14); q.lineTo(20, 36); q.closePath(); q.fill();
      q.strokeStyle = '#0b2a40'; q.lineWidth = 2; q.stroke(); q.strokeStyle = 'rgba(255,255,255,0.6)'; q.lineWidth = 1; q.beginPath(); q.moveTo(8, 14); q.lineTo(32, 14); q.moveTo(14, 5); q.lineTo(18, 14); q.lineTo(20, 36); q.moveTo(26, 5); q.lineTo(22, 14); q.stroke();
      this.textures.addCanvas('ui_diamond', cv);
    }
    const menu: [string, string, () => void][] = [['ui_diamond', 'ร้าน💎', () => this.panels.open('premium')], ['ui_res0', 'ตลาด', () => this.panels.open('market')], ['icon_armor0', 'ชุด', () => this.panels.open('wardrobe')], ['ui_hud0', 'กระเป๋า', () => this.panels.open('bag')], ['ui_hud1', 'ตัวละคร', () => this.panels.open('stats')], ['ui_hud3', 'เมนู', () => this.panels.open('menu')]];
    menu.forEach(([ic, label, cb], i) => {
      const x = this.VW - 22 - (menu.length - 1 - i) * 36, y = 20;
      const sl = this.add.image(x, y, 'ui_slot0'); sl.setScale(30 / sl.width);
      const im = this.add.image(x, y - 1, ic); im.setScale(20 / Math.max(im.width, im.height));
      const t = k.text(x, y + 17, label, 6.5, '#ffe7a0').setOrigin(0.5, 0);
      const z = this.add.zone(x, y + 4, 34, 40).setInteractive();
      z.on('pointerdown', () => im.setScale(18 / Math.max(im.width, im.height)));
      z.on('pointerout', () => im.setScale(20 / Math.max(im.width, im.height)));
      z.on('pointerup', () => { im.setScale(20 / Math.max(im.width, im.height)); cb(); });
      this.root.add([sl, im, t, z]);
    });
    // class change ready
    this.formBtn = k.button(this.VW - 206, 64, 194, 22, '✨ เปลี่ยนร่างได้! (แตะ)', () => this.panels.open('job'), { size: 9, color: 0x6a3a8a });
    this.formBtn.setVisible(false);
    this.root.add(this.formBtn);
    this.tweens.add({ targets: this.formBtn, alpha: 0.6, duration: 600, yoyo: true, repeat: -1 });

    bus.on(EV.TOAST, this.toast, this);
    bus.on(EV.STATE_CHANGED, this.refresh, this);
    this.events.once('shutdown', () => { bus.off(EV.TOAST, this.toast, this); bus.off(EV.STATE_CHANGED, this.refresh, this); });
    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.onResize, this));
    this.refresh();
    this.buildSkills();
    this.time.delayedCall(60, hideWait);   // the game is on screen: drop the 'please wait' overlay
    if (this.reopen) { const r = this.reopen; this.reopen = null; this.panels.open(r as 'uiopt'); }

    const st = S();
    if (!st.introSeen) {
      st.introSeen = true;
      this.time.delayedCall(800, () => this.panels.openDialog('elder', 'คำสาปดำกำลังกลืนแผ่นดินเอลเดอร์โกรฟ... เจ้าเป็นแค่ชาวบ้านถือดาบไม้ ออกไปทางประตูแผนที่ทางเหนือ ล่ามอนสเตอร์ เก็บเหรียญ ไอเทม ไม้ หิน อาหาร ยิ่งเลเวลสูงยิ่งไปแผนที่ที่ไกลขึ้นได้ ถึงเลเวล 10 แล้วมาหาข้า จะได้เลือกเส้นทางนักรบของเจ้า!'));
    }
  }

  onResize() { this.scene.restart(); }
  /** settings changed in the 'ปรับ UI' panel */
  reopen: string | null = null;
  applyUiOpt() { this.reopen = 'uiopt'; this.time.delayedCall(10, () => this.scene.restart()); }

  /** TopDownScene tells us what the action button does (talk / build / collect), or null to hide it. */
  setAction(label: string | null, cb?: () => void) {
    if ((label ?? '') === this.actLabel) { this.actCb = cb ?? null; return; }
    this.actLabel = label ?? ''; this.actCb = cb ?? null;
    this.actBtn?.destroy();
    if (!label) return;
    const w = Math.max(90, label.length * 7 + 20);
    this.actBtn = this.kit.button(this.VW - w - 96, this.VH - 140, w, 30, label, () => this.actCb?.(), { size: 11, color: 0x2a4a2a });
    this.root.add(this.actBtn);
  }

  /** true when a tap at this pointer belongs to the UI (open panel or a button) */
  blocks(p: Phaser.Input.Pointer) {
    return this.panels.isOpen || this.input.hitTestPointer(p).length > 0;
  }

  refresh() {
    if (!this.hud) return;
    const s = S(), d = derive(s), k = this.kit, g = this.hud;
    g.clear();
    g.fillStyle(0x140d08, 1).fillCircle(28, 30, 17);
    const need = expToNext(s.level);
    const bar = (x: number, y: number, w: number, h: number, f: number, col: number, hi: number) => {
      g.fillStyle(0x0b0806, 1).fillRect(x - 1, y - 1, w + 2, h + 2).fillStyle(0x2a1d14, 1).fillRect(x, y, w, h);
      const fw = Math.round(w * Phaser.Math.Clamp(f, 0, 1));
      g.fillStyle(col, 1).fillRect(x, y, fw, h).fillStyle(hi, 1).fillRect(x, y, fw, Math.max(1, Math.floor(h / 3)));
      g.lineStyle(1, 0x5a4a3a, 1).strokeRect(x - 1.5, y - 1.5, w + 3, h + 3);
    };
    bar(52, 10, 152, 9, s.hp / d.maxHp, 0xb8332c, 0xe0645a);
    bar(52, 21, 152, 6, (s.mp ?? 0) / d.maxMp, 0x2a6ac8, 0x6aa8f0);
    bar(52, 30, 152, 5, need > 0 ? s.exp / need : 1, 0x6a4ab8, 0x9a7ae0);
    this.hpText.setText(`HP ${Math.round(s.hp)}/${d.maxHp}`);
    this.expText.setText(`EXP ${Math.floor(s.exp)}/${need}`);
    this.mpText.setText(`MP ${Math.round(s.mp ?? 0)}/${d.maxMp}`);
    this.lvText.setText(`Lv${s.level}${vipActive(s) ? ' 👑' : ''}`).setColor(vipActive(s) ? '#ffd84a' : '#ffe7a0');
    [s.gold, s.res.wood, s.res.stone, s.res.food].forEach((v, i) => this.resTexts[i]?.setText(v >= 10000 ? Math.floor(v / 1000) + 'k' : String(v)));
    this.resTexts[3]?.setColor((s as unknown as { hungry?: boolean }).hungry ? '#ff6a5a' : '#ffe7a0');
    const key = this.td.heroKey();
    if (key !== this.lastKey && this.textures.exists(`c_${key}_idle`)) {
      this.lastKey = key;
      this.portrait.setTexture(`c_${key}_idle`, 0);
      const f = this.portrait.frame, ch = Math.round(f.height * 0.55);
      this.portrait.setCrop(0, Math.round(f.height * 0.12), f.width, ch).setScale(32 / ch).setOrigin(0.5, 0.36);
    }
    { const el = activeElixir(s); this.stageText.setText(`${this.td.stageTitle()} • ร่าง ${formName(s.cls, activeTier(s))}` + (el ? `  ✨${el.name} ${Math.ceil((el.until - Date.now()) / 60000)} นาที` : '')); }
    this.formBtn.setVisible(nextForm(s) !== null && !this.panels.isOpen);
    if (this.autoBg) {
      const on = !!s.auto, w = 54, h2 = 22;
      this.autoBg.clear().fillStyle(on ? 0x1f6a2a : 0x1a140e, 0.92).fillRoundedRect(-w / 2, -h2 / 2, w, h2, 6).lineStyle(1.5, on ? 0x9fffb0 : 0x8a6a40, 1).strokeRoundedRect(-w / 2, -h2 / 2, w, h2, 6);
      this.autoTx.setText(on ? (s.outfit === 'gather' ? '⛏ AUTO' : '⚔ AUTO') : 'AUTO').setColor(on ? '#ffffff' : '#c8b898');
    }
    const t = tdQuest(s), qg = this.questG; qg.clear();
    if (t) {
      this.questText.setText(t.done ? `✔ ${t.q.title}\nแตะเพื่อรับรางวัล!` : `📜 ${t.q.title}  ${t.cur}/${t.q.need}`).setColor(t.done ? '#9fffb0' : '#f3e6c4');
      const h = this.questText.height + 8;
      qg.fillStyle(t.done ? 0x1f4a2a : 0x0b0806, t.done ? 0.85 : 0.6).fillRoundedRect(8, 62, 200, h, 4).lineStyle(1, t.done ? 0x9fffb0 : 0x6a5a40, 0.9).strokeRoundedRect(8, 62, 200, h, 4);
      this.questZone.setSize(200, h);
    } else this.questText.setText('');
  }

  village(names: boolean) { for (const n of (this.td as unknown as { village?: { npcs: { tag: Phaser.GameObjects.Text; hidden: boolean }[] } }).village?.npcs ?? []) n.tag.setVisible(names); }

  toast(text: string, color = '#ffe7a0') {
    const t = this.kit.text(this.VW / 2, 92, text, 10, color).setOrigin(0.5).setAlpha(0);
    this.root.add(t);
    this.toasts.push(t);
    this.toasts.forEach((o, i) => { if (o !== t) this.tweens.add({ targets: o, y: 92 - (this.toasts.length - 1 - i) * 13, duration: 150 }); });
    this.tweens.add({ targets: t, alpha: 1, duration: 150 });
    this.tweens.add({ targets: t, alpha: 0, delay: 2000, duration: 400, onComplete: () => { t.destroy(); this.toasts = this.toasts.filter(x => x !== t); } });
    if (this.toasts.length > 4) this.toasts.shift()?.destroy();
  }

  update(time: number) {
    if (time - this.refreshT > 300) { this.refreshT = time; this.refresh(); }
    const sel = !!(this.td as unknown as { selectUi: unknown }).selectUi;
    this.root.setVisible(!sel).setAlpha(uiOpt(S()).alpha);
    this.village(uiOpt(S()).names);
    this.updateSkills(this.td.time.now);
  }
}

