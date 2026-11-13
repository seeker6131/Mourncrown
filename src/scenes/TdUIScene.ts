// HUD + menus for the top-down game. Runs on top of TopDownScene and reuses the shared Panels
// (bag, character, shop, blacksmith, building plots, class choice, menu).
import Phaser from 'phaser';
import { showNews } from '../core/changelog';
import { mailWaiting } from '../systems/mail';
import { activeElixir } from '../systems/alchemy';
import { toggleFullscreen } from '../core/fullscreen';
import { lang } from '../core/i18n';
import { act } from '../net/client';
import { resCap } from '../systems/economy';
import { tutActive, loginInfo } from '../systems/progress';
import { Minimap, type MapInfo } from '../ui/minimap';
import { LootPopup, NewsTicker } from '../ui/lootPopup';
import { itemDef as idef, RARITY_NAMES as RN } from '../data/items';
import { UIKit } from '../ui/kit';
import { panelFrame } from '../ui/skin';
import { bus, EV, S } from '../core/events';
import { derive, expToNext, nextForm, activeTier, currentSkills } from '../systems/stats';
import { SKILL_BY_ID } from '../data/skills';
import { tdQuest, rewardText } from '../systems/tdQuests';
import { itemDef } from '../data/items';
import { saveGame } from '../core/save';
import { potCount, POT_CD } from '../systems/potions';
import { openReport } from '../net/report';
import { askChat } from '../net/chatInput';
import { chatHub, WORLD_LV } from '../net/chatHub';
import { play } from '../net/play';
import { accountToken, SERVER } from '../net/cloud';
import { uiOpt } from '../core/uiOptions';
import { hideWait } from '../core/wait';
import { WC } from '../world/warClient';
import { loadAtlas, unpackAtlas } from '../world/atlas';
/** the PixelLab item icons have been loaded and swapped in (they stay for the whole session) */
let ICONS_SWAPPED = false;
import { mountOn, mountsOf, nextRide } from '../systems/mounts';
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
  usePotion(kind: 'hp' | 'mp', manual: boolean): boolean; potT: number; mpT: number;
}

/** the online counter's last answer (kept while the HUD restarts between maps) */
const onlineNow = { n: 0, at: 0 };
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
  rideBtn?: Phaser.GameObjects.Container; rideBg?: Phaser.GameObjects.Graphics; rideTx?: Phaser.GameObjects.Text; rideOn?: boolean;
  warBtn?: Phaser.GameObjects.Container; warBg?: Phaser.GameObjects.Graphics; warTx?: Phaser.GameObjects.Text;
  autoBtn!: Phaser.GameObjects.Container; autoBg!: Phaser.GameObjects.Graphics; autoTx!: Phaser.GameObjects.Text;
  questG!: Phaser.GameObjects.Graphics; questText!: Phaser.GameObjects.Text; questZone!: Phaser.GameObjects.Zone;
  offText?: Phaser.GameObjects.Text; offSince = 0; offShown = false; chatLog: { id: string; name: string; text: string }[] = [];
  chatLines: { line: string; t: number }[] = []; chatText?: Phaser.GameObjects.Text;
  /** the last chat lines (fade 15 s after the newest) */
  drawChat() { if (!this.chatText) return; const live = this.chatLines.filter(l => this.time.now - l.t < 15000); this.chatText.setText(live.map(l => l.line).join('\n')).setAlpha(live.length ? 1 : 0); }
  potBtns: { kind: 'hp' | 'mp'; c: Phaser.GameObjects.Container; n: Phaser.GameObjects.Text; cd: Phaser.GameObjects.Graphics; r: number }[] = [];
  skillBtns: { id: string; icon: Phaser.GameObjects.Image; cd: Phaser.GameObjects.Graphics; cdText: Phaser.GameObjects.Text; mp: Phaser.GameObjects.Text; c: Phaser.GameObjects.Container; x: number; y: number; r: number }[] = [];
  skillSet = '';

  preload() {
    // skill and item icons come in one atlas page each (tools/pack_atlas.py)
    // PixelLab item icons replace the code-drawn fallback icons made at boot
    // (once per session: after the swap the 'pl_' keys are gone, so without this every scene change downloaded them all again)
    if (!ICONS_SWAPPED) {
      loadAtlas(this, 'skill'); loadAtlas(this, 'icon');
      this.load.once('complete', () => { unpackAtlas(this, 'skill', 'sk_'); unpackAtlas(this, 'icon', 'icon_', true); ICONS_SWAPPED = true; });
    }
  }

  /** three skill buttons around the attack button (stages only) */
  buildSkills() {
    this.skillBtns.forEach(b => b.c.destroy()); this.skillBtns = [];
    this.potBtns.forEach(b => b.c.destroy()); this.potBtns = [];
    const ids = currentSkills(S()); this.skillSet = ids.join(',');
    if (!this.td.stageN) return;
    this.buildPotions();
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
  /** two potion buttons left of the skills (HP, MP) with the count; tap = drink, the small ⚙ = potion settings */
  buildPotions() {
    const bs = uiOpt(S()).btn, u = bs * this.VH / 400, R9 = this.VH / 9 * bs, ax = this.VW - R9 * 1.3, ay = this.VH - R9 * 1.3, R = 14 * u;
    ([['hp', -124, 26, 'icon_potion_hp', 0xc83a3a], ['mp', -112, -30, 'icon_potion_mp', 0x3a6ac8]] as const).forEach(([kind, dx, dy, key, col]) => {
      const c = this.add.container(ax + dx * u, ay + dy * u);
      const bg = this.add.circle(0, 0, R + 2, 0x0b0806, 0.8).setStrokeStyle(2, col, 1);
      const ic = this.textures.exists(key) ? this.add.image(0, 0, key) : this.add.text(0, 0, kind === 'hp' ? '❤' : '💧', { fontSize: R + 'px' }).setOrigin(0.5);
      if (ic instanceof Phaser.GameObjects.Image) ic.setScale((R * 1.7) / Math.max(ic.width, ic.height));
      const cd = this.add.graphics();
      const n = this.kit.text(R * 0.7, R * 0.45, '', 7, '#ffffff', { stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5);
      const z = this.add.zone(0, 0, R * 2 + 6, R * 2 + 6).setInteractive();
      z.on('pointerdown', () => { c.setScale(0.9); this.td.usePotion(kind, true); });
      z.on('pointerup', () => c.setScale(1)); z.on('pointerout', () => c.setScale(1));
      c.add([bg, ic, cd, n, z]); this.root.add(c);
      this.potBtns.push({ kind, c, n, cd, r: R });
    });
    // settings
    const gc = this.add.container(ax - 140 * u, ay - 4 * u);
    const gb = this.add.circle(0, 0, 9 * u, 0x0b0806, 0.75).setStrokeStyle(1.5, 0x8a6a40, 1);
    const gt = this.kit.text(0, 0, '⚙', 9, '#e8dcc0').setOrigin(0.5);
    const gz = this.add.zone(0, 0, 22 * u, 22 * u).setInteractive(); gz.on('pointerup', () => this.panels.open('potion'));
    gc.add([gb, gt, gz]); this.root.add(gc);
    this.potBtns.push({ kind: 'hp', c: gc, n: gt, cd: this.add.graphics(), r: 0 });   // (kept with the buttons so it is rebuilt with them)
  }
  updateSkills(now: number) {
    const s = S();
    { // the server restarts for an update / the network drops: first "reconnecting" (it comes back by itself), after a while the plain warning
      const off = !!accountToken() && !(play.ws && play.ws.readyState === WebSocket.OPEN);   // (connected but a brand-new save still seeding: not 'offline')
      if (!off) { if (this.offSince && this.offShown) this.toast('✔ เชื่อมต่อเซิร์ฟแล้ว', '#9fffb0'); this.offSince = 0; this.offShown = false; }
      else if (!this.offSince) this.offSince = now;
      const long = now - this.offSince > 12000, show = off && now - this.offSince > 1500;
      const cap = play.full && Date.now() - play.full.at < 90000 ? play.full : null;   // the server's cap (director's money limit)
      if (show && cap) { this.offShown = true; this.offText?.setText(cap.why === 'day' ? '🚧 วันนี้เซิร์ฟเปิดครบเวลาแล้ว — เปิดใหม่ 07:00 น. (ตอนนี้ของที่ได้จะไม่ถูกบันทึก)' : `🚧 เซิร์ฟเต็ม (${cap.n}/${cap.max} คน) — รอสักครู่ ระบบจะพาเข้าเองเมื่อมีที่ว่าง`).setBackgroundColor('rgba(90,50,10,0.85)'); }
      else if (show) { this.offShown = true; this.offText?.setText(long ? '⚠ ออฟไลน์ — กำลังเชื่อมต่อเซิร์ฟ... ของที่ได้ตอนนี้จะไม่ถูกบันทึก' : '🔄 กำลังเชื่อมต่อเซิร์ฟใหม่... รอสักครู่').setBackgroundColor(long ? 'rgba(110,20,20,0.85)' : 'rgba(20,60,110,0.85)'); }
      this.offText?.setVisible(show);
    }
    if (this.chatLines.length && (Math.floor(now / 500) % 2 === 0)) this.drawChat();
    for (const b of this.potBtns) {
      if (!b.r) continue;
      const left = (b.kind === 'hp' ? this.td.potT : this.td.mpT) - this.td.time.now, n = potCount(s, b.kind);
      b.n.setText(n > 99 ? '99+' : String(n)).setColor(n ? '#ffffff' : '#ff8a6a');
      b.cd.clear(); if (left > 0) b.cd.fillStyle(0x000000, 0.6).slice(0, 0, b.r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left / POT_CD, false).fillPath();
      b.c.setAlpha(n ? 1 : 0.55);
    }
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
  enterStage(n: number, room?: number) { (this.td as unknown as { enterStage(n: number, room?: number): void }).enterStage(n, room); }
  /** which buildings a plot may hold: the home plot only takes the player's home */
  plotChoices(plot: number): string[] { return plot === 9 ? ['home'] : []; }
  reloadWorld() { this.scene.get('TopDown').scene.restart({ stage: 0 }); }
  toggleFullscreen() {
    sfx.click();
    const r = toggleFullscreen();
    if (r === 'ios') this.toast(lang() === 'en' ? 'iPhone: tap Share ⬆ → "Add to Home Screen", then open Mourncrown from the home screen for full screen' : 'iPhone: แตะปุ่มแชร์ ⬆ → "เพิ่มไปยังหน้าจอโฮม" แล้วเปิด Mourncrown จากหน้าโฮม จะเล่นเต็มจอ', '#ffd84a');
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
    const topL = 216, topR = this.VW - 224, midR = this.VW - 152;
    this.stageText = k.text((topL + topR) / 2, 8, '', topR - topL < 300 ? 8 : 10, '#ffe7a0', { wordWrap: { width: Math.max(120, topR - topL - 6) }, align: 'center' }).setOrigin(0.5, 0);
    // 🟢 how many are playing now (director: small, at the top) — asked every 3 minutes, kept across map changes
    { const t = k.text((topL + topR) / 2, topR - topL < 300 ? 19 : 22, '', 6.5, '#9fffb0').setOrigin(0.5, 0).setAlpha(0.85); this.root.add(t);
      const show = () => t.active && t.setText(onlineNow.n > 0 ? `🟢 ออนไลน์ ${onlineNow.n.toLocaleString()} คน` : '');
      const ask = () => { if (!accountToken()) return; onlineNow.at = Date.now(); fetch(SERVER + '/online').then(r => r.json()).then((j: { n: number }) => { onlineNow.n = Number(j.n) || 0; show(); }).catch(() => undefined); };
      show(); if (Date.now() - onlineNow.at > 180000) ask();
      this.time.addEvent({ delay: 180000, loop: true, callback: ask }); }
    this.bandX = (topL + midR) / 2; this.bandW = Math.max(150, midR - topL - 52);
    // tutorial banner under the title
    this.tutG = this.add.graphics(); this.tutTx = k.text(this.bandX, 60, '', 8.5, '#fff4c8', { wordWrap: { width: Math.min(360, this.bandW - 16) }, align: 'center' }).setOrigin(0.5, 0);
    this.tutSkip = k.button(this.VW / 2 + 190, 28, 40, 16, 'ข้าม', () => { const st = S() as ReturnType<typeof S> & { tut?: number }; st.tut = 99; if (!('refused' in act('tutorialDone', {}))) this.toast('🎓 ข้ามการสอน — ได้รับของเริ่มต้นแล้ว', '#ffd84a'); saveGame(st); this.refresh(); }, { size: 7.5, color: 0x3a2a1a });
    this.root.add([this.tutG, this.tutTx, this.tutSkip]);
    this.root.add([this.hud, this.portrait, ring, this.lvText, this.hpText, this.expText, this.mpText, this.stageText]);
    // tap the portrait for the profile
    { const pz = this.add.zone(6, 6, 46, 48).setOrigin(0).setInteractive({ useHandCursor: true }); pz.on('pointerup', () => this.panels.open('profile')); this.root.add(pz); }
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
      // guild war: switch between watching / fighting in our village and the enemy's (shown only while a war is on)
      this.warBtn = this.add.container(x - 28, y - 34); this.warBg = this.add.graphics(); this.warTx = k.text(0, 0, '', 8.5, '#ffffff').setOrigin(0.5);
      const wz = this.add.zone(0, 0, 110, 26).setInteractive(); wz.on('pointerup', () => { sfx.click(); bus.emit('td:warSwap'); });
      this.warBtn.add([this.warBg, this.warTx, wz]); this.root.add(this.warBtn); this.warBtn.setVisible(false);
      // ride / get off (or open the mounts window when you have none yet)
      this.rideBtn = this.add.container(x - 64, y); this.rideBg = this.add.graphics(); this.rideTx = k.text(0, 0, '🐎', 12, '#ffffff').setOrigin(0.5);
      const rz = this.add.zone(0, 0, 40, 26).setInteractive();
      rz.on('pointerup', () => { sfx.click(); const st = S(); if (!mountsOf(st).length) { this.panels.open('mounts'); return; } act('mountSelect', { id: nextRide(st) }); saveGame(st); });
      this.rideBtn.add([this.rideBg, this.rideTx, rz]); this.root.add(this.rideBtn);
    }

    // quest tracker under the status box: tap to claim when done
    this.questG = this.add.graphics();
    this.questText = k.text(14, 66, '', 7.5, '#f3e6c4', { wordWrap: { width: 186 }, lineSpacing: 1 });
    this.questZone = this.add.zone(8, 60, 200, 30).setOrigin(0).setInteractive();
    this.questZone.on('pointerup', () => {
      const s = S(), q = act('claimTdQuest', {});
      if (q && (q as { skillPt?: number }).skillPt) this.time.delayedCall(900, () => this.toast('✨ เควสต์สายหลักครบ 4 เควสต์ — ได้แต้มสกิล +1!', '#9fffb0'));
      if (q) { bus.emit('td:fx', 'fx_quest'); sfx.levelUp(); this.toast(`✔ ${q.title} — ได้รับ ${rewardText(q.reward, id => itemDef(id).name)}`, '#9fffb0'); saveGame(s); bus.emit(EV.STATE_CHANGED); this.td.levelUpFx(); }
    });
    this.root.add([this.questG, this.questText, this.questZone]);
    // offline (signed up but not connected): what is won now is not kept — say so plainly
    this.offText = k.text(this.VW / 2, 34, '⚠ ออฟไลน์ — กำลังเชื่อมต่อเซิร์ฟ... ของที่ได้ตอนนี้จะไม่ถูกบันทึก', 8, '#ffd0c0', { backgroundColor: 'rgba(110,20,20,0.85)', padding: { x: 6, y: 3 } }).setOrigin(0.5, 0).setVisible(false);
    this.root.add(this.offText); this.offSince = 0;
    // chat with the players in this map (net/room.ts): 💬 opens the typing box, the last lines show under it
    this.chatLines = [];
    { const cb = k.button(8, 94, 30, 20, '💬', () => {
        // channels: this map (the room), the whole world (Lv5+), my guild
        const link = (this.td as unknown as { link?: { chat(t: string): void; online: boolean } }).link, s = S() as { level: number; guildId?: string };
        const open = { map: !!link?.online, world: chatHub.online('world'), guild: chatHub.online('guild') };
        if (!open.map && !open.world && !open.guild) { this.toast('ยังไม่ได้เชื่อมต่อเซิร์ฟ (เล่นออฟไลน์อยู่)', '#c8b89a'); return; }
        askChat((t, ch) => { if (ch === 'map') link?.chat(t); else chatHub.send(ch, t); }, open,
          { map: 'ที่นี่ไม่มีแชตแมพ (ในอาคาร / ดันเจี้ยน)', world: s.level < WORLD_LV ? `แชตโลกเปิดที่เลเวล ${WORLD_LV}` : 'กำลังเชื่อมต่อแชตโลก...', guild: s.guildId ? 'กำลังเชื่อมต่อแชตกิลด์...' : 'ยังไม่มีกิลด์' });
      }, { size: 10, color: 0x2a4a5a }); this.root.add(cb); }
    this.chatText = k.text(44, 96, '', 7, '#e8f4ff', { lineSpacing: 2, backgroundColor: 'rgba(0,0,0,0.35)', padding: { x: 3, y: 2 }, wordWrap: { width: 230 } }).setAlpha(0);
    this.root.add(this.chatText);
    const onChat = (e: { id: string; name: string; text: string; ch?: 'map' | 'world' | 'guild'; old?: boolean }) => {
      const tag = e.ch === 'world' ? '[โลก] ' : e.ch === 'guild' ? '[กิลด์] ' : '';
      if (!e.old) { this.chatLines = [...this.chatLines, { line: `${tag}${e.name}: ${e.text}`, t: this.time.now }].slice(-4); this.drawChat(); }
      const link = (this.td as unknown as { link?: { me: string } }).link;
      if (e.id && e.id !== link?.me) this.chatLog = [...this.chatLog, { id: e.id, name: e.name, text: e.text }].slice(-10);   // (for 🚩 reports)
    };
    // 🚩 report a chat line (net/report.ts)
    { const rb = k.button(8, 118, 30, 18, '🚩', () => { const link = (this.td as unknown as { link?: { room: string } }).link; openReport([...this.chatLog].reverse(), link?.room ?? '', (t, c) => this.toast(t, c)); }, { size: 9, color: 0x4a2a2a }); this.root.add(rb); }
    bus.on('td:chat', onChat); bus.on('chat:line', onChat); this.events.once('shutdown', () => { bus.off('td:chat', onChat); bus.off('chat:line', onChat); });

    // top-right menu: icon buttons
    if (!this.textures.exists('ui_diamond')) {   // 💎 icon drawn once
      const cv = document.createElement('canvas'); cv.width = 40; cv.height = 40; const q = cv.getContext('2d')!;
      const gr = q.createLinearGradient(0, 4, 0, 36); gr.addColorStop(0, '#d8fbff'); gr.addColorStop(0.5, '#5ad2f0'); gr.addColorStop(1, '#1a6aa8');
      q.fillStyle = gr; q.beginPath(); q.moveTo(8, 14); q.lineTo(14, 5); q.lineTo(26, 5); q.lineTo(32, 14); q.lineTo(20, 36); q.closePath(); q.fill();
      q.strokeStyle = '#0b2a40'; q.lineWidth = 2; q.stroke(); q.strokeStyle = 'rgba(255,255,255,0.6)'; q.lineWidth = 1; q.beginPath(); q.moveTo(8, 14); q.lineTo(32, 14); q.moveTo(14, 5); q.lineTo(18, 14); q.lineTo(20, 36); q.moveTo(26, 5); q.lineTo(22, 14); q.stroke();
      this.textures.addCanvas('ui_diamond', cv);
    }
    if (!this.textures.exists('ui_mail')) {   // the mailbox button's envelope (drawn here: no picture file needed)
      const g = this.add.graphics();
      g.fillStyle(0xf3e6c4, 1).fillRect(1, 2, 22, 15).lineStyle(1.5, 0x5a3a1a, 1).strokeRect(1, 2, 22, 15);
      g.lineBetween(1, 2, 12, 11).lineBetween(23, 2, 12, 11).lineBetween(1, 17, 9, 9).lineBetween(23, 17, 15, 9);
      g.fillStyle(0xc0392b, 1).fillCircle(12, 11, 3);
      g.generateTexture('ui_mail', 24, 19); g.destroy();
    }
    const menu: [string, string, () => void][] = [['ui_mail', 'จดหมาย', () => this.panels.open('mail')], ['ui_diamond', 'ร้าน💎', () => this.panels.open('premium')], ['ui_res0', 'ตลาด', () => this.panels.open('market')], ['icon_armor0', 'ชุด', () => this.panels.open('wardrobe')], ['ui_hud0', 'กระเป๋า', () => this.panels.open('bag')], ['ui_hud1', 'ตัวละคร', () => this.panels.open('stats')], ['ui_hud3', 'เมนู', () => this.panels.open('menu')]];
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
      if (ic === 'ui_mail') {   // letters waiting: a red count on the envelope
        this.mailDot = this.add.circle(x + 11, y - 10, 6, 0xd03020).setStrokeStyle(1, 0xffffff); this.mailTxt = k.text(x + 11, y - 15, '', 7, '#ffffff').setOrigin(0.5, 0);
        this.root.add([this.mailDot, this.mailTxt]);
      }
    });
    // class change ready
    this.loot = new LootPopup(this as never); this.news = new NewsTicker(this as never);
    const onLoot = (p: { id: string; rar: number; set?: string }) => this.loot?.push(p);
    bus.on('loot:popup', onLoot); this.events.once('shutdown', () => bus.off('loot:popup', onLoot));
    this.minimap = new Minimap(this as never, () => (this.td as unknown as { mapInfo(): MapInfo | null }).mapInfo());
    this.formBtn = k.button(this.bandX - 97, 58, 194, 22, '✨ เปลี่ยนร่างได้! (แตะ)', () => this.panels.open('job'), { size: 9, color: 0x6a3a8a });
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
    // daily login calendar pops up in the village once a day (after the tutorial)
    if (st.introSeen && !tutActive(st)) this.time.delayedCall(1500, () => showNews(S().playTime ?? 0));   // 📢 what's new since this device last looked (core/changelog.ts)
    if (st.introSeen && !tutActive(st) && loginInfo(st).ready && !(this.td as unknown as { stageN: number }).stageN && !WC.side) this.time.delayedCall(1200, () => { if (!this.panels.isOpen) this.panels.open('login'); });
    if (!st.introSeen) {
      st.introSeen = true;
      this.time.delayedCall(800, () => this.panels.openDialog('elder', 'คำสาปดำกำลังกลืนแผ่นดินเอลเดอร์โกรฟ... เจ้าเป็นแค่ชาวบ้านถือดาบไม้ ออกไปทางประตูแผนที่ทางเหนือ ล่ามอนสเตอร์ เก็บเหรียญและไอเทม ส่วนไม้ หิน แร่ อาหาร ไปหาที่ป่าดงดิบทางประตูซ้าย ยิ่งเลเวลสูงยิ่งไปแผนที่ที่ไกลขึ้นได้ ถึงเลเวล 10 แล้วมาหาข้า จะได้เลือกเส้นทางนักรบของเจ้า!'));
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

  bandX = 0; bandW = 300;
  tutG!: Phaser.GameObjects.Graphics; tutTx!: Phaser.GameObjects.Text; tutSkip!: Phaser.GameObjects.Container;
  /** letters waiting last time (a new one: a note) */
  mailN = -1; mailDot?: Phaser.GameObjects.Arc; mailTxt?: Phaser.GameObjects.Text;
  refresh() {
    { const n = mailWaiting(S()); if (this.mailN >= 0 && n > this.mailN) this.toast(`📬 มีจดหมายใหม่ ${n - this.mailN} ฉบับ — กดซองจดหมายด้านบน`, '#ffd84a'); this.mailN = n; this.mailDot?.setVisible(n > 0); this.mailTxt?.setText(n > 9 ? '9+' : n ? String(n) : '').setVisible(n > 0); }
    if (!this.hud) return;
    const s = S(), d = derive(s), k = this.kit, g = this.hud;
    { const t = (this.td as unknown as { tutText(): string }).tutText?.() ?? ''; this.tutTx.setText(t); this.tutG.clear(); this.tutSkip.setVisible(!!t);
      if (t) { const w = Math.min(this.bandW, this.tutTx.width + 24), h = this.tutTx.height + 8, bx = this.bandX; this.tutG.fillStyle(0x1a1208, 0.85).fillRoundedRect(bx - w / 2, 57, w, h, 5).lineStyle(1, 0xffd84a, 0.9).strokeRoundedRect(bx - w / 2, 57, w, h, 5); this.tutSkip.setPosition(bx + w / 2 + 4, 57); }
      this.formBtn?.setPosition(this.bandX - 97, t ? 62 + this.tutTx.height + 10 : 58); }
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
    { const cap = resCap(s); [1, 2].forEach(i => this.resTexts[i]?.setColor([0, s.res.wood, s.res.stone][i] >= cap ? '#ff6a5a' : '#ffe7a0'));   // warehouse full = red
      this.resTexts[3]?.setColor((s as unknown as { hungry?: boolean }).hungry || s.res.food >= cap ? '#ff6a5a' : '#ffe7a0'); }
    const key = this.td.heroKey();
    if (key !== this.lastKey && this.textures.exists(`c_${key}_idle`)) {
      this.lastKey = key;
      this.portrait.setTexture(`c_${key}_idle`, 0);
      const f = this.portrait.frame, ch = Math.round(f.height * 0.55);
      this.portrait.setCrop(0, Math.round(f.height * 0.12), f.width, ch).setScale(32 / ch).setOrigin(0.5, 0.36);
    }
    { const el = activeElixir(s); this.stageText.setText(`${this.td.stageTitle()} • ร่าง ${formName(s.cls, activeTier(s))}` + (el ? `  ✨${el.name} ${Math.ceil((el.until - Date.now()) / 60000)} นาที` : '')); }
    this.formBtn.setVisible(nextForm(s) !== null && !this.panels.isOpen);
    if (this.rideBtn && this.rideBg) {
      const on = !!mountOn(s);
      this.rideBtn.setVisible(s.level >= 10 && !this.panels.isOpen);
      if (on !== this.rideOn) { this.rideOn = on; this.rideBg.clear().fillStyle(on ? 0x6a4a10 : 0x1a140e, 0.92).fillRoundedRect(-20, -11, 40, 22, 6).lineStyle(1.5, on ? 0xffd84a : 0x8a6a40, 1).strokeRoundedRect(-20, -11, 40, 22, 6); }
    }
    if (this.warBtn && this.warBg && this.warTx) {
      const on = !!WC.war && !WC.war.over && !this.panels.isOpen;
      this.warBtn.setVisible(on);
      if (on) { const lb = WC.side === 'enemy' ? '🏠 กลับป้องกันบ้าน' : WC.side === 'home' ? '⚔ ไปบุกศัตรู' : '⚔ ดูสงคราม'; if (this.warTx.text !== lb) { this.warTx.setText(lb); this.warBg.clear().fillStyle(0x7a1a10, 0.95).fillRoundedRect(-55, -12, 110, 24, 6).lineStyle(1.5, 0xffb080, 1).strokeRoundedRect(-55, -12, 110, 24, 6); } }
    }
    if (this.autoBg) {
      const on = !!s.auto, w = 54, h2 = 22;
      this.autoBg.clear().fillStyle(on ? 0x1f6a2a : 0x1a140e, 0.92).fillRoundedRect(-w / 2, -h2 / 2, w, h2, 6).lineStyle(1.5, on ? 0x9fffb0 : 0x8a6a40, 1).strokeRoundedRect(-w / 2, -h2 / 2, w, h2, 6);
      this.autoTx.setText(on ? '⚔ AUTO' : 'AUTO').setColor(on ? '#ffffff' : '#c8b898');
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

  minimap?: Minimap; loot?: LootPopup; news?: NewsTicker; newsT = 0;
  update(time: number) {
    if (this.news && time > this.newsT) { this.newsT = time + 2000; for (const n of act('news', { since: this.news.since })) { this.news.since = Math.max(this.news.since, n.t); this.news.push(`📢 ประกาศทั้งเซิร์ฟ: ${n.name} ได้รับ [${RN[n.rar]}] ${idef(n.item).name}!!`); } }
    this.minimap?.update(time);
    if (time - this.refreshT > 300) { this.refreshT = time; this.refresh(); }
    const sel = !!(this.td as unknown as { selectUi: unknown }).selectUi;
    this.root.setVisible(!sel).setAlpha(uiOpt(S()).alpha);
    this.village(uiOpt(S()).names);
    this.updateSkills(this.td.time.now);
  }
}

