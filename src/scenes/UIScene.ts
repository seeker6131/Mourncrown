import Phaser from 'phaser';
import { UIKit, GOLD, GOLD_D, GOLD_L } from '../ui/kit';
import { bus, EV, S } from '../core/events';
import { controls, type WorldScene } from './WorldScene';
import { derive, expToNext } from '../systems/stats';
import { SKILLS, SKILL_BY_ID, type SkillId } from '../data/skills';
import { currentSkills, nextForm, activeTier } from '../systems/stats';
import { formName } from '../data/classes';
import { paintMinimapIso } from '../art/isoArt';
import { WORLD_PX_W, WORLD_PX_H } from '../world/mapgen';
import { QUEST_BY_ID } from '../data/quests';
import { Panels } from '../ui/panels';
import { sfx } from '../audio/sfx';
import { saveGame } from '../core/save';
import { buildingAt } from '../systems/settlement';
import { BUILDINGS, type BuildingId } from '../data/buildings';

const VH = 400; // virtual UI height

export class UIScene extends Phaser.Scene {
  kit!: UIKit;
  resG!: Phaser.GameObjects.Graphics;
  resTexts: Phaser.GameObjects.Text[] = [];
  formKey = '';
  outfitBtn!: ReturnType<UIKit['roundButton']>;
  u = 1; VW = 640;
  hud!: Phaser.GameObjects.Graphics;
  hpText!: Phaser.GameObjects.Text; mpText!: Phaser.GameObjects.Text; lvText!: Phaser.GameObjects.Text; goldText!: Phaser.GameObjects.Text; expText!: Phaser.GameObjects.Text;
  questText!: Phaser.GameObjects.Text;
  zoneText!: Phaser.GameObjects.Text;
  minimap!: Phaser.GameObjects.Image; miniDots!: Phaser.GameObjects.Graphics;
  joy = { id: -1, bx: 0, by: 0, x: 0, y: 0 };
  joyG!: Phaser.GameObjects.Graphics;
  skillBtns: { id: SkillId; c: Phaser.GameObjects.Container; cd: Phaser.GameObjects.Graphics; lock: Phaser.GameObjects.Text; r: number }[] = [];
  autoBtn!: ReturnType<UIKit['roundButton']>;
  talkBtn!: Phaser.GameObjects.Container;
  potionCount!: Phaser.GameObjects.Text;
  statBadge!: Phaser.GameObjects.Container;
  toasts: Phaser.GameObjects.Text[] = [];
  bossBar!: Phaser.GameObjects.Graphics; bossText!: Phaser.GameObjects.Text;
  bossInfo: { hp: number; max: number; name: string } | null = null;
  panels!: Panels;
  root!: Phaser.GameObjects.Container;
  vignette!: Phaser.GameObjects.Image;
  portrait!: Phaser.GameObjects.Image;

  constructor() { super('UI'); }

  get world() { return this.scene.get('World') as WorldScene; }

  create() {
    this.u = this.scale.height / VH;
    this.VW = this.scale.width / this.u;
    const cam = this.cameras.main;
    cam.setOrigin(0, 0).setZoom(this.u);
    this.kit = new UIKit(this, () => Math.max(1, this.u));
    this.skillBtns = []; this.toasts = []; this.bossInfo = null;
    this.buildVignette();
    this.root = this.add.container(0, 0);
    this.buildHud();
    this.buildControls();
    this.panels = new Panels(this);

    bus.on(EV.STATE_CHANGED, this.refresh, this);
    bus.on(EV.TOAST, this.toast, this);
    bus.on(EV.ZONE, this.showZone, this);
    bus.on(EV.NEAR_NPC, this.onNearNpc, this);
    bus.on(EV.NPC_TALK, this.onTalk, this);
    bus.on(EV.LEVEL_UP, this.onLevel, this);
    bus.on(EV.BOSS_HP, this.onBoss, this);
    bus.on(EV.HERO_DIED, this.onDied, this);
    bus.on(EV.PLOT, this.onPlot, this);
    this.events.once('shutdown', () => {
      bus.off(EV.STATE_CHANGED, this.refresh, this); bus.off(EV.TOAST, this.toast, this); bus.off(EV.ZONE, this.showZone, this);
      bus.off(EV.NEAR_NPC, this.onNearNpc, this); bus.off(EV.NPC_TALK, this.onTalk, this); bus.off(EV.LEVEL_UP, this.onLevel, this);
      bus.off(EV.BOSS_HP, this.onBoss, this); bus.off(EV.HERO_DIED, this.onDied, this); bus.off(EV.PLOT, this.onPlot, this);
      this.scale.off('resize', this.onResize, this);
    });
    this.scale.on('resize', this.onResize, this);
    this.refresh();
    this.showZone(this.zoneNameNow());
    const st = S();
    if (!st.introSeen) {
      st.introSeen = true;
      this.time.delayedCall(600, () => this.panels.openDialog('elder', 'คำสาปดำกำลังกลืนแผ่นดินเอลเดอร์โกรฟ... หมู่บ้านเราคือที่หลบภัยสุดท้าย เจ้าเป็นแค่ชาวบ้านถือดาบไม้ แต่ถ้าแกร่งพอถึงเลเวล 5 กลับมาหาข้า แล้วเลือกเส้นทางนักรบของเจ้า ล่ามอนสเตอร์ เก็บวัตถุดิบ สร้างหมู่บ้านทางใต้ แล้วชำระคำสาปให้สิ้น!'));
    }
  }

  zoneNameNow() { return ''; }

  /** Head-and-shoulders crop of the hero inside the round portrait frame. */
  fitPortrait() {
    const p = this.portrait;
    if (this.world.hero.ai) {
      const w = p.frame.width, h = p.frame.height;
      const ch = Math.round(h * 0.62);
      p.setCrop(0, 0, w, ch).setScale(30 / ch).setOrigin(0.5, 0.31);
    } else p.setCrop(4, 4, 32, 26).setScale(1.15).setOrigin(0.5);
  }

  controlsReset() {
    controls.mx = 0; controls.my = 0; controls.attackHeld = false; controls.joyActive = false;
    this.joy.id = -1; this.joy.bx = 70; this.joy.by = VH - 70;
  }

  onResize() { this.scene.restart(); }

  buildVignette() {
    const w = Math.ceil(this.VW), h = VH;
    const key = `vig_${w}`;
    if (!this.textures.exists(key)) {
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const c = cv.getContext('2d')!;
      const g = c.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, w * 0.62);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.6, 'rgba(10,6,14,0.18)'); g.addColorStop(1, 'rgba(8,4,12,0.7)');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      this.textures.addCanvas(key, cv);
    }
    this.vignette = this.add.image(0, 0, key).setOrigin(0).setDepth(-10);
  }

  // ---------------- HUD ----------------
  buildHud() {
    const k = this.kit;
    this.hud = this.add.graphics();
    this.root.add(this.hud);
    // portrait
    const pr = this.world.hero.portrait();
    this.portrait = this.add.image(26, 25, pr.key, pr.frame);
    this.fitPortrait();
    this.root.add(this.portrait);
    this.lvText = k.text(26, 47, 'Lv1', 9, '#ffe7a0').setOrigin(0.5);
    this.hpText = k.text(110, 11, '', 8, '#ffffff').setOrigin(0.5, 0);
    this.mpText = k.text(110, 23, '', 8, '#ffffff').setOrigin(0.5, 0);
    this.expText = k.text(110, 34, '', 7, '#e0d0ff').setOrigin(0.5, 0);
    this.goldText = k.text(62, 46, '', 9, '#ffd84a').setOrigin(0, 0);
    this.questText = k.text(8, 70, '', 8, '#f3e6c4', { wordWrap: { width: 150 }, lineSpacing: 2 });
    this.zoneText = k.text(this.VW / 2, 54, '', 14, '#ffe7a0', { strokeThickness: 4 }).setOrigin(0.5).setAlpha(0);
    this.root.add([this.lvText, this.hpText, this.mpText, this.expText, this.goldText, this.questText, this.zoneText]);
    this.resG = this.add.graphics();
    this.root.add(this.resG);
    this.resTexts = [];
    (['gold', 'wood', 'stone', 'food'] as const).forEach((r, i) => {
      const x0 = 190 + i * 62;
      const ic = this.add.image(x0 + 8, 13, r === 'gold' ? 'icon_gold' : `icon_res_${r}`).setDisplaySize(13, 13);
      const t = k.text(x0 + 17, 13, '0', 9, '#ffe7a0').setOrigin(0, 0.5);
      this.root.add([ic, t]); this.resTexts.push(t);
    });
    const qz = this.add.zone(4, 64, 160, 40).setOrigin(0).setInteractive();
    qz.on('pointerup', () => this.panels.open('quest'));
    this.root.add(qz);

    // minimap
    const mmW = 116, mmH = mmW * WORLD_PX_H / WORLD_PX_W;
    const mx = this.VW - mmW - 8, my = 8;
    if (!this.textures.exists('minimap')) this.textures.addCanvas('minimap', paintMinimapIso(this.world.map.ground, this.world.map.blocked));
    const mmG = this.add.graphics();
    k.frame(mmG, mx - 4, my - 4, mmW + 8, mmH + 8, 0.9);
    this.minimap = this.add.image(mx, my, 'minimap').setOrigin(0).setDisplaySize(mmW, mmH);
    this.miniDots = this.add.graphics();
    this.root.add([mmG, this.minimap, this.miniDots]);
    this.minimap.setData('rect', { mx, my, mmW, mmH });

    // menu buttons under minimap
    const by = my + mmH + 18;
    const menuDefs: [string, string, () => void][] = [
      ['icon_armor0', 'กระเป๋า', () => this.panels.open('bag')],
      ['icon_sword2', 'ตัวละคร', () => this.panels.open('stats')],
      ['icon_spore', 'เควสต์', () => this.panels.open('quest')],
      ['icon_gem0', 'เมนู', () => this.panels.open('menu')],
    ];
    menuDefs.forEach(([icon, label, cb], i) => {
      const b = k.roundButton(this.VW - 20 - (3 - i) * 27, by, 12, icon, null);
      b.zone.on('pointerup', () => { sfx.click(); cb(); });
      const t = k.text(0, 15, label, 6.5, '#ffe7a0').setOrigin(0.5, 0);
      b.c.add(t);
      this.root.add(b.c);
      if (i === 1) {
        this.statBadge = this.add.container(9, -9);
        const bg = this.add.graphics().fillStyle(0xe03030, 1).fillCircle(0, 0, 5).lineStyle(1, GOLD_L).strokeCircle(0, 0, 5);
        this.statBadge.add([bg, k.text(0, 0, '!', 7, '#ffffff').setOrigin(0.5)]);
        b.c.add(this.statBadge);
      }
    });

    // boss bar
    this.bossBar = this.add.graphics();
    this.bossText = k.text(this.VW / 2, 28, '', 9, '#ffb0a0').setOrigin(0.5, 0);
    this.root.add([this.bossBar, this.bossText]);

    // fullscreen hint button (top centre-left)
    const fs = k.roundButton(this.VW - 20 - 4 * 27, by, 12, null, '⛶');
    fs.zone.on('pointerup', () => this.toggleFullscreen());
    fs.c.add(k.text(0, 15, 'เต็มจอ', 6.5, '#ffe7a0').setOrigin(0.5, 0));
    this.root.add(fs.c);
  }

  toggleFullscreen() {
    sfx.click();
    if (this.scale.isFullscreen) { this.scale.stopFullscreen(); return; }
    try {
      const el = document.documentElement;
      const p = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : null;
      p?.then(() => { const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }; o?.lock?.('landscape').catch(() => undefined); }).catch(() => undefined);
    } catch { /* not supported */ }
  }

  // ---------------- Touch controls ----------------
  buildControls() {
    const k = this.kit;
    this.joyG = this.add.graphics();
    this.root.add(this.joyG);
    this.joy.bx = 70; this.joy.by = VH - 70;

    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (this.panels.isOpen || over.length) return;
      const vx = p.x / this.u, vy = p.y / this.u;
      if (vx < this.VW * 0.45 && vy > 100 && this.joy.id === -1) {
        this.joy.id = p.id; this.joy.bx = vx; this.joy.by = vy; this.joy.x = vx; this.joy.y = vy;
        controls.joyActive = true;
      }
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.id !== this.joy.id) return;
      this.joy.x = p.x / this.u; this.joy.y = p.y / this.u;
    });
    const up = (p: Phaser.Input.Pointer) => {
      if (p.id === this.joy.id) { this.joy.id = -1; controls.mx = 0; controls.my = 0; controls.joyActive = false; this.joy.bx = 70; this.joy.by = VH - 70; }
    };
    this.input.on('pointerup', up);
    this.input.on('pointerupoutside', up);
    this.input.on('gameout', () => { controls.attackHeld = false; });

    // Attack button
    const ax = this.VW - 62, ay = VH - 62;
    const atk = k.roundButton(ax, ay, 30, 'icon_sword1', null, 0x3a1a10);
    atk.zone.on('pointerdown', () => { controls.attackHeld = true; });
    atk.zone.on('pointerup', () => { controls.attackHeld = false; });
    atk.zone.on('pointerout', () => { controls.attackHeld = false; });
    this.root.add(atk.c);
    this.input.on('pointerup', () => { if (!this.input.manager.pointers.some(p => p.isDown)) controls.attackHeld = false; });

    // Skills arc around attack
    const angles = [180, 213, 247, 280];
    currentSkills(S()).slice(0, 4).map(id => SKILL_BY_ID[id]).forEach((sk, i) => {
      const a = (angles[i] * Math.PI) / 180, R = 58;
      const r = 17;
      const b = k.roundButton(ax + Math.cos(a) * R, ay + Math.sin(a) * R, r, `icon_${sk.icon}`, null);
      (b.c.getData('icon') as Phaser.GameObjects.Image).setDisplaySize(r * 2.15, r * 2.15);
      const cd = this.add.graphics();
      const lock = k.text(0, 0, '', 8, '#ffffff').setOrigin(0.5);
      b.c.add([cd, lock]);
      b.zone.on('pointerup', () => this.world.castSkill(sk.id));
      this.root.add(b.c);
      this.skillBtns.push({ id: sk.id, c: b.c, cd, lock, r });
    });

    // Potion
    const pb = k.roundButton(ax - 104, ay + 20, 15, 'icon_potion_hp', null);
    this.potionCount = k.text(9, 9, '0', 8, '#ffffff').setOrigin(0.5);
    pb.c.add(this.potionCount);
    pb.zone.on('pointerup', () => this.world.quickPotion());
    this.root.add(pb.c);

    // Auto toggle
    this.autoBtn = k.roundButton(ax - 6, ay - 98, 15, null, 'AUTO');
    (this.autoBtn.c.getData('label') as Phaser.GameObjects.Text).setFontSize(7.5);
    this.autoBtn.zone.on('pointerup', () => {
      const s = S(); s.auto = !s.auto; sfx.click();
      this.toast(s.auto ? 'เปิดโหมดต่อสู้อัตโนมัติ' : 'ปิดโหมดต่อสู้อัตโนมัติ', s.auto ? '#9fffb0' : '#e8c872');
      this.refresh();
    });
    this.root.add(this.autoBtn.c);


    // Talk button (appears near NPCs)
    this.talkBtn = k.button(ax - 70, ay - 140, 70, 24, '💬 พูดคุย', () => this.world.interact(), { size: 10, color: 0x2a4a2a });
    this.talkBtn.setVisible(false);
    this.root.add(this.talkBtn);
  }

  // ---------------- Updates ----------------
  update() {
    // pause the world while a modal panel is open
    const wsys = this.world.sys;
    if (this.panels.isOpen && wsys.isActive()) this.scene.pause('World');
    else if (!this.panels.isOpen && wsys.isPaused()) this.scene.resume('World');
    // joystick
    const g = this.joyG; g.clear();
    const j = this.joy;
    let dx = j.x - j.bx, dy = j.y - j.by;
    const max = 34;
    const d = Math.hypot(dx, dy);
    if (j.id !== -1) {
      if (d > max) { dx = dx / d * max; dy = dy / d * max; }
      const m = Math.min(1, d / max);
      controls.mx = d > 4 ? (dx / max) / Math.max(0.0001, m) * m : 0;
      controls.my = d > 4 ? (dy / max) / Math.max(0.0001, m) * m : 0;
      const l = Math.hypot(controls.mx, controls.my); if (l > 1) { controls.mx /= l; controls.my /= l; }
      if (l > 0.2) { controls.mx /= l; controls.my /= l; } // full speed beyond deadzone
    } else { dx = 0; dy = 0; }
    g.fillStyle(0x000000, 0.25).fillCircle(j.bx, j.by, 40);
    g.lineStyle(2, GOLD, j.id !== -1 ? 0.9 : 0.45).strokeCircle(j.bx, j.by, 40);
    g.lineStyle(1, GOLD_D, 0.6).strokeCircle(j.bx, j.by, 34);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; g.fillStyle(GOLD, 0.5).fillTriangle(j.bx + Math.cos(a) * 30, j.by + Math.sin(a) * 30, j.bx + Math.cos(a + 0.12) * 25, j.by + Math.sin(a + 0.12) * 25, j.bx + Math.cos(a - 0.12) * 25, j.by + Math.sin(a - 0.12) * 25); }
    g.fillStyle(0x2a1a10, 0.95).fillCircle(j.bx + dx, j.by + dy, 16);
    g.fillStyle(0xffffff, 0.1).fillCircle(j.bx + dx, j.by + dy - 5, 9);
    g.lineStyle(2, GOLD, 1).strokeCircle(j.bx + dx, j.by + dy, 16);

    // skill cooldowns
    const s = S();
    for (const b of this.skillBtns) {
      const sk = SKILLS.find(q => q.id === b.id)!;
      b.cd.clear();
      const locked = false;
      const cdms = this.world.getCooldown(b.id);
      if (locked) {
        b.cd.fillStyle(0x000000, 0.7).fillCircle(0, 0, b.r);
        b.lock.setText('');
      } else if (cdms > 0) {
        const frac = cdms / sk.cooldown;
        b.cd.fillStyle(0x000000, 0.65); b.cd.beginPath(); b.cd.slice(0, 0, b.r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac, false); b.cd.fillPath();
        b.lock.setText((cdms / 1000).toFixed(cdms < 1000 ? 1 : 0));
      } else if (s.mp < sk.mp) {
        b.cd.fillStyle(0x10204a, 0.6).fillCircle(0, 0, b.r);
        b.lock.setText('MP');
      } else b.lock.setText('');
    }

    // minimap dots
    const r = this.minimap.getData('rect') as { mx: number; my: number; mmW: number; mmH: number };
    const md = this.miniDots; md.clear();
    const sx = r.mmW / WORLD_PX_W, sy = r.mmH / WORLD_PX_H;
    const w = this.world;
    for (const m of w.monsters) {
      if (!m.alive) continue;
      md.fillStyle(m.def.boss ? 0xff3030 : 0xff8a6a, 1).fillRect(r.mx + m.x * sx - (m.def.boss ? 2 : 0.75), r.my + m.y * sy - (m.def.boss ? 2 : 0.75), m.def.boss ? 4 : 1.5, m.def.boss ? 4 : 1.5);
    }
    for (const n of w.npcs) md.fillStyle(0xffd84a, 1).fillRect(r.mx + n.x * sx - 1, r.my + n.y * sy - 1, 2, 2);
    md.fillStyle(0xffffff, 1).fillCircle(r.mx + w.hero.x * sx, r.my + w.hero.y * sy, 2);
    md.lineStyle(1, 0x000000, 1).strokeCircle(r.mx + w.hero.x * sx, r.my + w.hero.y * sy, 2);
    const v = w.cameras.main.worldView;
    md.lineStyle(1, 0xffffff, 0.5).strokeRect(r.mx + v.x * sx, r.my + v.y * sy, v.width * sx, v.height * sy);

    this.drawBoss();
  }

  refresh() {
    const s = S();
    const d = derive(s);
    const k = this.kit;
    const g = this.hud; g.clear();
    // portrait frame
    k.frame(g, 4, 4, 175, 54, 0.88);
    g.fillStyle(0x0a0705, 1).fillCircle(26, 25, 17);
    g.lineStyle(2, GOLD, 1).strokeCircle(26, 25, 17);
    g.fillStyle(0x2a1d12, 1).fillRoundedRect(12, 41, 28, 12, 3);
    g.lineStyle(1, GOLD, 1).strokeRoundedRect(12, 41, 28, 12, 3);
    k.bar(g, 50, 11, 120, 9, s.hp / d.maxHp, 0xd83a3a);
    k.bar(g, 50, 23, 120, 8, s.mp / d.maxMp, 0x3a7ae0, 0x101a3a);
    k.bar(g, 50, 35, 120, 4, s.exp / expToNext(s.level), 0xb07aff, 0x1a102a);
    this.hpText.setText(`${Math.ceil(s.hp)} / ${d.maxHp}`);
    this.mpText.setText(`${Math.ceil(s.mp)} / ${d.maxMp}`);
    this.expText.setText('');
    this.lvText.setText('Lv ' + s.level);
    if (this.formKey !== `${s.cls}${activeTier(s)}`) { const first = !this.formKey; this.formKey = `${s.cls}${activeTier(s)}`; if (!first) { this.time.delayedCall(10, () => this.scene.restart()); return; } }
    this.goldText.setText('พลังรบ ' + d.power.toLocaleString() + (s.buff && s.buff.until > Date.now() ? '  🍲' : ''));
    const fmt = (n: number) => n >= 10000 ? (n / 1000).toFixed(1) + 'K' : String(Math.floor(n));
    [s.gold, s.res.wood, s.res.stone, s.res.food].forEach((v, i) => this.resTexts[i].setText(fmt(v)));
    this.resG.clear().fillStyle(0x0a0705, 0.72).fillRoundedRect(184, 4, 4 * 62 + 4, 18, 9).lineStyle(1, GOLD_D, 1).strokeRoundedRect(184, 4, 4 * 62 + 4, 18, 9);
    const pr2 = this.world.hero.portrait();
    this.portrait.setTexture(pr2.key, pr2.frame);
    this.fitPortrait();
    // quest tracker
    const q = s.quests.find(x => x.status !== 'done');
    if (q) {
      const def = QUEST_BY_ID[q.id];
      g.fillStyle(0x0a0705, 0.6).fillRoundedRect(4, 64, 160, 34, 4);
      g.lineStyle(1, GOLD_D, 0.9).strokeRoundedRect(4, 64, 160, 34, 4);
      this.questText.setText(`◆ ${def.title}\n${q.status === 'ready' ? '✔ กลับไปหาผู้เฒ่า' : `${def.kind === 'kill' ? 'กำจัด' : 'เก็บ'} ${q.progress}/${def.count}`}`);
      this.questText.setColor(q.status === 'ready' ? '#9fffb0' : '#f3e6c4');
    } else if (s.quests.length < 6) {
      g.fillStyle(0x0a0705, 0.6).fillRoundedRect(4, 64, 160, 22, 4);
      this.questText.setText('◆ คุยกับผู้เฒ่าในหมู่บ้าน').setColor('#ffd84a');
    } else this.questText.setText('');
    // auto
    this.autoBtn.c.setData('active', s.auto);
    this.autoBtn.draw(false, s.auto);
    (this.autoBtn.c.getData('label') as Phaser.GameObjects.Text).setColor(s.auto ? '#9fffb0' : '#ffe7a0');
    this.potionCount.setText(String(this.world.countItem('hp_potion') + this.world.countItem('hp_potion_l')));
    this.statBadge.setVisible(false);
    if (this.panels?.isOpen) this.panels.rebuild();
  }

  // ---------------- Events ----------------
  toast(text: string, color = '#ffe7a0') {
    const t = this.kit.text(this.VW / 2, 92, text, 10, color).setOrigin(0.5).setAlpha(0);
    this.root.add(t);
    this.toasts.push(t);
    this.toasts.forEach((o, i) => { if (o !== t) this.tweens.add({ targets: o, y: 92 - (this.toasts.length - 1 - i) * 13, duration: 150 }); });
    this.tweens.add({ targets: t, alpha: 1, duration: 150 });
    this.tweens.add({ targets: t, alpha: 0, delay: 1800, duration: 400, onComplete: () => { t.destroy(); this.toasts = this.toasts.filter(x => x !== t); } });
    if (this.toasts.length > 4) this.toasts.shift()?.destroy();
  }

  showZone(name: string) {
    if (!name) return;
    this.zoneText.setText(`— ${name} —`).setAlpha(0).setScale(0.9);
    this.tweens.killTweensOf(this.zoneText);
    this.tweens.add({ targets: this.zoneText, alpha: 1, scale: 1, duration: 500, hold: 1600, yoyo: true });
  }

  onNearNpc(id: string | null) {
    this.talkBtn.setVisible(!!id);
    if (id) {
      const names: Record<string, string> = { elder: 'ผู้เฒ่าอัลดริค', merchant: 'พ่อค้ามิร่า', smith: 'ช่างตีเหล็กบรอม' };
      let label = '💬 ' + (names[id] ?? 'พูดคุย');
      if (id === 'wardrobe') label = '👕 ห้องแต่งตัว';
      if (id.startsWith('plot:')) { const b = buildingAt(S(), Number(id.slice(5))); label = '🔨 ' + (b ? BUILDINGS[b.type as BuildingId].name : 'ก่อสร้าง'); }
      (this.talkBtn.getData('label') as Phaser.GameObjects.Text).setText(label);
    }
  }

  onTalk(id: string) { this.panels.openDialog(id); }
  onPlot(i: number) { this.panels.openPlot(i); }

  onLevel(level: number) {
    const k = this.kit;
    const t = k.text(this.VW / 2, VH / 2 - 60, `LEVEL UP!  Lv ${level}`, 20, '#ffd84a', { strokeThickness: 5 }).setOrigin(0.5).setScale(0.3);
    const nf = nextForm(S());
    const t2 = k.text(this.VW / 2, VH / 2 - 36, nf !== null ? `✨ เปลี่ยนร่างได้แล้ว! ไปคุยกับผู้เฒ่าที่หมู่บ้าน` : `ได้แต้มสกิล +1 — อัปสกิลได้ที่หน้า "ตัวละคร"`, 9, '#ffffff').setOrigin(0.5).setAlpha(0);
    this.root.add([t, t2]);
    this.tweens.add({ targets: t, scale: 1, duration: 400, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t2, alpha: 1, duration: 300, delay: 300 });
    this.tweens.add({ targets: [t, t2], alpha: 0, delay: 2400, duration: 500, onComplete: () => { t.destroy(); t2.destroy(); } });

    saveGame(S());
  }

  onBoss(hp: number | null, max?: number, name?: string) {
    this.bossInfo = hp === null ? null : { hp, max: max!, name: name! };
  }

  drawBoss() {
    const g = this.bossBar; g.clear();
    if (!this.bossInfo) { this.bossText.setText(''); return; }
    const w = Math.min(240, this.VW * 0.4), x = this.VW / 2 - w / 2, y = 42;
    this.kit.bar(g, x, y, w, 8, this.bossInfo.hp / this.bossInfo.max, 0xc02a2a, 0x2a0a0a);
    this.kit.diamond(g, x - 6, y + 4, 5); this.kit.diamond(g, x + w + 6, y + 4, 5);
    this.bossText.setText(`☠ ${this.bossInfo.name}  ${Math.ceil(this.bossInfo.hp)}/${this.bossInfo.max}`);
    const w2 = this.world;
    if (w2.boss && w2.boss.alive && Math.hypot(w2.boss.x - w2.hero.x, w2.boss.y - w2.hero.y) > 320) this.bossInfo = null;
  }

  onDied(lost: number) {
    const k = this.kit;
    const ov = this.add.rectangle(0, 0, this.VW, VH, 0x200000, 0.6).setOrigin(0).setAlpha(0);
    const t = k.text(this.VW / 2, VH / 2 - 20, 'คุณพ่ายแพ้...', 24, '#ff6a6a', { strokeThickness: 5 }).setOrigin(0.5);
    const t2 = k.text(this.VW / 2, VH / 2 + 12, `เสียทอง ${lost} G — กำลังฟื้นคืนชีพที่หมู่บ้าน`, 10, '#ffe0e0').setOrigin(0.5);
    this.tweens.add({ targets: ov, alpha: 1, duration: 400 });
    this.time.delayedCall(3100, () => { ov.destroy(); t.destroy(); t2.destroy(); });
  }
}
