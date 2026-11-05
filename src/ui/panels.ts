// Modal panels: Bag/Equipment, Stats/Skills, Quests, Menu, NPC dialog, Shop, Blacksmith.
import Phaser from 'phaser';
import type { UIScene } from '../scenes/UIScene';
import { GOLD, GOLD_D } from './kit';
import { S, bus, EV, runtime } from '../core/events';
import { STAT_KEYS, STAT_NAMES, STAT_DESC, INV_SIZE, type InvItem } from '../core/state';
import { derive, allocate, expToNext } from '../systems/stats';
import { itemDef, RARITY_COLORS, RARITY_NAMES, SHOP_STOCK, upgradeChance, upgradeCost, upgradeMult, MAX_UPGRADE, type ItemDef } from '../data/items';
import { equip, unequipUid, isEquipped, useItem, addItem, removeUid, sellPrice, tryUpgrade, countItem } from '../systems/inventory';
import { QUESTS, QUEST_BY_ID } from '../data/quests';
import { activeQuest, nextAvailable, acceptQuest, completeQuest, refreshCollect } from '../systems/quests';
import { SKILLS } from '../data/skills';
import { saveGame, loadGame, deleteSave } from '../core/save';
import { sfx, setMusic, audioState } from '../audio/sfx';

type PanelId = 'bag' | 'stats' | 'quest' | 'menu' | 'shop' | 'smith' | 'dialog';

const NPC_INFO: Record<string, { name: string; tex: string }> = {
  elder: { name: 'ผู้เฒ่าอัลดริค', tex: 'npc_elder' },
  merchant: { name: 'พ่อค้ามิร่า', tex: 'npc_merchant' },
  smith: { name: 'ช่างตีเหล็กบรอม', tex: 'npc_smith' },
};

export class Panels {
  cur: PanelId | null = null;
  c: Phaser.GameObjects.Container | null = null;
  selUid: number | null = null;
  shopTab: 'buy' | 'sell' = 'buy';
  dialogNpc = '';
  dialogText = '';
  confirmNew = false;

  constructor(private ui: UIScene) {}

  get isOpen() { return this.cur !== null; }
  get k() { return this.ui.kit; }

  open(id: PanelId) {
    sfx.click();
    this.cur = id;
    this.selUid = null;
    this.confirmNew = false;
    this.ui.controlsReset();
    this.rebuild();
  }

  close() {
    this.cur = null;
    this.c?.destroy(); this.c = null;
  }

  openDialog(npc: string) {
    this.dialogNpc = npc;
    const s = S();
    if (npc === 'elder') {
      const a = activeQuest(s);
      if (a?.status === 'ready') this.dialogText = 'เจ้ากลับมาแล้ว! ภารกิจสำเร็จหรือยัง?';
      else if (a) this.dialogText = `ภารกิจ "${QUEST_BY_ID[a.id].title}" ยังไม่เสร็จ\n${QUEST_BY_ID[a.id].intro}`;
      else {
        const n = nextAvailable(s, 'elder');
        if (!n) this.dialogText = s.quests.length >= QUESTS.length ? 'เจ้าคือวีรบุรุษแห่งเอลเดอร์โกรฟ ขอบคุณสำหรับทุกสิ่ง' : 'พักผ่อนก่อนเถิด แล้วค่อยกลับมาหาข้า';
        else if (s.level < n.minLevel) this.dialogText = `ข้ามีภารกิจใหม่ แต่เจ้ายังอ่อนเกินไป กลับมาเมื่อถึงเลเวล ${n.minLevel}`;
        else this.dialogText = n.intro;
      }
    } else if (npc === 'merchant') this.dialogText = 'ยินดีต้อนรับสู่ร้านของมิร่า! มียา อาวุธ และเครื่องประดับชั้นดี จะซื้อหรือขายดีล่ะ?';
    else this.dialogText = 'อยากให้อาวุธคมขึ้นหรือเกราะแกร่งขึ้นหรือ? เอาผลึกมานากับทองมา ข้าจะตีบวกให้!';
    this.open('dialog');
  }

  rebuild() {
    this.c?.destroy();
    if (!this.cur) return;
    const ui = this.ui;
    const c = ui.add.container(0, 0);
    this.c = c;
    // backdrop
    const bd = ui.add.rectangle(0, 0, ui.VW, 360, 0x000000, this.cur === 'dialog' ? 0.25 : 0.55).setOrigin(0).setInteractive();
    bd.on('pointerup', () => { if (this.cur === 'dialog') this.close(); });
    c.add(bd);
    switch (this.cur) {
      case 'bag': this.buildBag(c); break;
      case 'stats': this.buildStats(c); break;
      case 'quest': this.buildQuest(c); break;
      case 'menu': this.buildMenu(c); break;
      case 'dialog': this.buildDialog(c); break;
      case 'shop': this.buildShop(c); break;
      case 'smith': this.buildSmith(c); break;
    }
  }

  /** Standard window, returns content origin. */
  window(c: Phaser.GameObjects.Container, w: number, h: number, title: string) {
    const ui = this.ui;
    const x = Math.round(ui.VW / 2 - w / 2), y = Math.round(180 - h / 2);
    const g = ui.add.graphics();
    this.k.frame(g, x, y, w, h, 0.97, true);
    const blocker = ui.add.zone(x, y, w, h).setOrigin(0).setInteractive();
    c.add([blocker, g]);
    c.add(this.k.text(x + w / 2, y + 13, title, 12, '#ffe7a0').setOrigin(0.5));
    const close = this.k.button(x + w - 28, y + 3, 22, 18, '✕', () => this.close(), { size: 10, color: 0x5a1a1a });
    c.add(close);
    return { x, y, w, h, g };
  }

  // ---------------- BAG ----------------
  buildBag(c: Phaser.GameObjects.Container) {
    const s = S(), ui = this.ui, k = this.k;
    const W = Math.min(560, ui.VW - 20), H = 320;
    const { x, y, g } = this.window(c, W, H, 'กระเป๋า & อุปกรณ์');
    // equipment column
    const ex = x + 14, ey = y + 32;
    g.fillStyle(0x0a0705, 0.6).fillRoundedRect(ex, ey, 112, H - 44, 4);
    c.add(k.text(ex + 56, ey + 4, 'สวมใส่', 9, '#d9b45a').setOrigin(0.5, 0));
    const pr = this.ui.world.hero.portrait();
    const heroImg = ui.add.image(ex + 56, ey + 62, pr.key, pr.frame).setScale(this.ui.world.hero.ai ? 1.5 : 1.8);
    c.add(heroImg);
    const slots: [keyof typeof s.equip, string, number, number][] = [['weapon', 'อาวุธ', ex + 8, ey + 100], ['armor', 'เกราะ', ex + 42, ey + 100], ['accessory', 'เครื่องประดับ', ex + 76, ey + 100]];
    for (const [slot, label, sx, sy] of slots) {
      const uid = s.equip[slot];
      const it = uid != null ? s.inventory.find(i => i.uid === uid) : undefined;
      k.iconSlot(g, sx, sy, 28, it ? RARITY_COLORS[itemDef(it.id).rarity] : undefined, it?.uid === this.selUid && !!it);
      c.add(k.text(sx + 14, sy + 30, label, 6.5, '#b8a078').setOrigin(0.5, 0));
      if (it) {
        c.add(ui.add.image(sx + 14, sy + 14, `icon_${itemDef(it.id).icon}`).setScale(0.7));
        if (it.upg) c.add(k.text(sx + 27, sy + 1, '+' + it.upg, 7, '#9fffb0').setOrigin(1, 0));
        const z = ui.add.zone(sx, sy, 28, 28).setOrigin(0).setInteractive();
        z.on('pointerup', () => { sfx.click(); this.selUid = it.uid; this.rebuild(); });
        c.add(z);
      }
    }
    const d = derive(s);
    c.add(k.text(ex + 6, ey + 146, `ATK ${d.atk}   MATK ${d.matk}\nDEF ${d.def}   HP ${d.maxHp}\nคริ ${(d.crit * 100).toFixed(1)}%`, 8, '#f3e6c4', { lineSpacing: 3 }));
    c.add(ui.add.image(ex + 10, ey + H - 66, 'icon_gold').setScale(0.4));
    c.add(k.text(ex + 20, ey + H - 72, s.gold.toLocaleString() + ' G', 10, '#ffd84a'));

    // grid
    const gx = ex + 122, gy = ey, cols = 6, cs = 30;
    for (let i = 0; i < INV_SIZE; i++) {
      const cx = gx + (i % cols) * (cs + 3), cy = gy + Math.floor(i / cols) * (cs + 3);
      const it = s.inventory[i];
      const def = it ? itemDef(it.id) : null;
      k.iconSlot(g, cx, cy, cs, def ? RARITY_COLORS[def.rarity] : undefined, !!it && it.uid === this.selUid);
      if (it && def) {
        c.add(ui.add.image(cx + cs / 2, cy + cs / 2, `icon_${def.icon}`).setScale(0.75));
        if (it.qty > 1) c.add(k.text(cx + cs - 2, cy + cs - 1, String(it.qty), 7.5, '#ffffff').setOrigin(1, 1));
        if (it.upg) c.add(k.text(cx + cs - 2, cy + 1, '+' + it.upg, 7, '#9fffb0').setOrigin(1, 0));
        if (isEquipped(s, it.uid)) c.add(k.text(cx + 2, cy + 1, 'E', 7, '#ffd84a'));
        const z = ui.add.zone(cx, cy, cs, cs).setOrigin(0).setInteractive();
        z.on('pointerup', () => { sfx.click(); this.selUid = it.uid; this.rebuild(); });
        c.add(z);
      }
    }
    // detail
    const dx = gx + cols * (cs + 3) + 6, dw = x + W - 14 - dx;
    if (dw > 80) this.itemDetail(c, g, dx, ey, dw, H - 44, 'bag');
  }

  itemDetail(c: Phaser.GameObjects.Container, g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, mode: 'bag' | 'sell' | 'smith') {
    const s = S(), k = this.k, ui = this.ui;
    g.fillStyle(0x0a0705, 0.6).fillRoundedRect(x, y, w, h, 4);
    g.lineStyle(1, GOLD_D, 1).strokeRoundedRect(x, y, w, h, 4);
    const it = s.inventory.find(i => i.uid === this.selUid);
    if (!it) { c.add(k.text(x + w / 2, y + h / 2, 'แตะไอเทม\nเพื่อดูรายละเอียด', 9, '#8a7a60', { align: 'center' }).setOrigin(0.5)); return; }
    const def = itemDef(it.id);
    k.iconSlot(g, x + 6, y + 6, 30, RARITY_COLORS[def.rarity]);
    c.add(ui.add.image(x + 21, y + 21, `icon_${def.icon}`).setScale(0.8));
    c.add(k.text(x + 42, y + 6, def.name + (it.upg ? ` +${it.upg}` : ''), 9.5, '#' + RARITY_COLORS[def.rarity].toString(16).padStart(6, '0'), { wordWrap: { width: w - 46 } }));
    c.add(k.text(x + 42, y + 24, RARITY_NAMES[def.rarity], 7.5, '#a89878'));
    c.add(k.text(x + 6, y + 42, statLines(def, it.upg).join('\n') + (statLines(def, it.upg).length ? '\n' : '') + def.desc, 8, '#e8dcc0', { wordWrap: { width: w - 12 }, lineSpacing: 2 }));
    let by = y + h - 26;
    const bw = w - 12;
    const btn = (label: string, cb: () => void, color?: number, disabled = false) => {
      c.add(k.button(x + 6, by, bw, 22, label, cb, { size: 9, color, disabled }));
      by -= 26;
    };
    if (mode === 'bag') {
      if (def.type === 'consumable') btn('ใช้', () => { const r = useItem(s, it.uid); if (r) { sfx.potion(); bus.emit(EV.TOAST, `ฟื้นฟู ${r.heal ? 'HP +' + r.heal : 'MP +' + r.mana}`, '#9fffb0'); } this.selUid = null; bus.emit(EV.STATE_CHANGED); }, 0x1f4a2a);
      if (def.type === 'weapon' || def.type === 'armor' || def.type === 'accessory') {
        if (isEquipped(s, it.uid)) btn('ถอดออก', () => { unequipUid(s, it.uid); bus.emit(EV.STATE_CHANGED); });
        else btn('สวมใส่', () => { equip(s, it.uid); sfx.pickup(); bus.emit(EV.TOAST, `สวมใส่ ${def.name}`, '#ffe7a0'); bus.emit(EV.STATE_CHANGED); }, 0x1f3a5a);
      }
    } else if (mode === 'sell') {
      const price = sellPrice(it);
      btn(`ขาย (+${price} G)`, () => { s.gold += price; removeUid(s, it.uid, 1); sfx.coin(); if (!s.inventory.find(i => i.uid === it.uid)) this.selUid = null; refreshCollect(s); bus.emit(EV.STATE_CHANGED); }, 0x5a3a10, isEquipped(s, it.uid));
      if (isEquipped(s, it.uid)) c.add(k.text(x + 6, by + 4, 'ถอดก่อนจึงจะขายได้', 7.5, '#ff9a8a'));
    } else if (mode === 'smith') {
      if (def.type === 'weapon' || def.type === 'armor' || def.type === 'accessory') {
        if (it.upg >= MAX_UPGRADE) btn('ระดับสูงสุดแล้ว', () => undefined, undefined, true);
        else {
          const cost = upgradeCost(it.upg, def);
          const chance = Math.round(upgradeChance(it.upg) * 100);
          c.add(k.text(x + 6, y + h - 74, `ค่าใช้จ่าย: ${cost.gold} G\nผลึกมานา: ${cost.shards} (มี ${countItem(s, 'mana_shard')})\nโอกาสสำเร็จ: ${chance}%`, 8, '#ffe7a0', { lineSpacing: 2 }));
          btn(`ตีบวก → +${it.upg + 1}`, () => this.doUpgrade(it.uid), 0x6a3a10);
        }
      }
    }
  }

  doUpgrade(uid: number) {
    const s = S();
    const r = tryUpgrade(s, uid);
    const msg: Record<string, [string, string]> = {
      ok: ['ตีบวกสำเร็จ!', '#9fffb0'], fail: ['ตีบวกล้มเหลว... (เสียวัตถุดิบ)', '#ff8a8a'], max: ['ระดับสูงสุดแล้ว', '#ffe7a0'],
      no_gold: ['ทองไม่พอ', '#ff8a8a'], no_shard: ['ผลึกมานาไม่พอ (ดรอปจากมอนสเตอร์/ซื้อที่ร้าน)', '#ff8a8a'], invalid: ['ตีบวกไม่ได้', '#ff8a8a'],
    };
    const [t, col] = msg[r];
    if (r === 'ok') sfx.upgradeOk(); else if (r === 'fail') sfx.upgradeFail(); else sfx.error();
    bus.emit(EV.TOAST, t, col);
    if (r === 'ok' || r === 'fail') {
      const ui = this.ui;
      const fl = ui.add.rectangle(0, 0, ui.VW, 360, r === 'ok' ? 0xfff0a0 : 0xff2020, 0.35).setOrigin(0);
      ui.tweens.add({ targets: fl, alpha: 0, duration: 400, onComplete: () => fl.destroy() });
    }
    bus.emit(EV.STATE_CHANGED);
  }

  // ---------------- STATS ----------------
  buildStats(c: Phaser.GameObjects.Container) {
    const s = S(), ui = this.ui, k = this.k;
    const W = Math.min(560, ui.VW - 20), H = 320;
    const { x, y, g } = this.window(c, W, H, 'สเตตัส & สกิล');
    const d = derive(s);
    const lx = x + 14, ly = y + 32;
    g.fillStyle(0x0a0705, 0.6).fillRoundedRect(lx, ly, 250, H - 44, 4);
    c.add(k.text(lx + 8, ly + 6, `${s.name}   Lv ${s.level}   EXP ${s.exp}/${expToNext(s.level)}`, 9, '#ffe7a0'));
    c.add(k.text(lx + 8, ly + 22, `แต้มคงเหลือ: ${s.statPoints}`, 10, s.statPoints ? '#9fffb0' : '#a89878'));
    STAT_KEYS.forEach((key, i) => {
      const ry = ly + 42 + i * 34;
      g.fillStyle(0x2a1d12, 0.8).fillRoundedRect(lx + 6, ry, 238, 30, 3);
      c.add(k.text(lx + 12, ry + 3, STAT_NAMES[key], 11, '#ffd84a'));
      c.add(k.text(lx + 50, ry + 4, String(d[key]), 11, '#ffffff'));
      if (d[key] !== s.base[key]) c.add(k.text(lx + 74, ry + 6, `(+${d[key] - s.base[key]})`, 8, '#9fffb0'));
      c.add(k.text(lx + 12, ry + 18, STAT_DESC[key], 7, '#b8a078'));
      const can = s.statPoints > 0;
      c.add(k.button(lx + 160, ry + 4, 36, 22, '+1', () => { if (allocate(s, key)) { sfx.pickup(); bus.emit(EV.STATE_CHANGED); } }, { size: 10, disabled: !can, color: 0x1f4a2a }));
      c.add(k.button(lx + 200, ry + 4, 38, 22, '+5', () => { if (allocate(s, key, Math.min(5, s.statPoints))) { sfx.pickup(); bus.emit(EV.STATE_CHANGED); } }, { size: 10, disabled: !can, color: 0x1f4a2a }));
    });
    const rx = lx + 260, rw = x + W - 14 - rx;
    g.fillStyle(0x0a0705, 0.6).fillRoundedRect(rx, ly, rw, H - 44, 4);
    c.add(k.text(rx + 8, ly + 6, `HP ${d.maxHp}   MP ${d.maxMp}\nATK ${d.atk}   MATK ${d.matk}   DEF ${d.def}\nคริ ${(d.crit * 100).toFixed(1)}%  หลบ ${(d.evade * 100).toFixed(1)}%\nความเร็วโจมตี ${(1000 / d.attackInterval).toFixed(2)}/วิ  เดิน ${Math.round(d.moveSpeed)}`, 8, '#f3e6c4', { lineSpacing: 2, wordWrap: { width: rw - 12 } }));
    SKILLS.forEach((sk, i) => {
      const sy = ly + 74 + i * 52;
      const locked = s.level < sk.unlockLevel;
      c.add(ui.add.image(rx + 20, sy + 16, `icon_${sk.icon}`).setScale(0.7).setAlpha(locked ? 0.4 : 1));
      c.add(k.text(rx + 38, sy + 2, sk.name + (locked ? `  🔒 Lv${sk.unlockLevel}` : ''), 9, locked ? '#8a7a60' : '#9ad8ff'));
      c.add(k.text(rx + 38, sy + 15, `${sk.desc}\nMP ${sk.mp}  คูลดาวน์ ${sk.cooldown / 1000} วิ`, 7.5, '#d8ccb0', { wordWrap: { width: rw - 46 }, lineSpacing: 1 }));
    });
  }

  // ---------------- QUEST ----------------
  buildQuest(c: Phaser.GameObjects.Container) {
    const s = S(), ui = this.ui, k = this.k;
    const W = Math.min(440, ui.VW - 20), H = 300;
    const { x, y, g } = this.window(c, W, H, 'บันทึกภารกิจ');
    let yy = y + 34;
    for (const q of QUESTS) {
      const p = s.quests.find(z => z.id === q.id);
      const status = !p ? (q.minLevel > s.level ? `ต้องการ Lv ${q.minLevel}` : 'ยังไม่ได้รับ') : p.status === 'done' ? '✔ สำเร็จ' : p.status === 'ready' ? 'ส่งเควสต์ได้!' : `${p.progress}/${q.count}`;
      const col = !p ? '#8a7a60' : p.status === 'done' ? '#7a9a7a' : p.status === 'ready' ? '#9fffb0' : '#ffe7a0';
      g.fillStyle(0x2a1d12, p && p.status !== 'done' ? 0.9 : 0.4).fillRoundedRect(x + 12, yy, W - 24, 40, 3);
      if (p && p.status !== 'done') g.lineStyle(1, GOLD, 1).strokeRoundedRect(x + 12, yy, W - 24, 40, 3);
      c.add(k.text(x + 20, yy + 4, `◆ ${q.title}`, 10, col));
      c.add(k.text(x + W - 20, yy + 5, status, 9, col).setOrigin(1, 0));
      const tgt = q.kind === 'kill' ? `กำจัด ${q.count} ตัว` : `เก็บ ${itemDef(q.target).name} ${q.count} ชิ้น`;
      c.add(k.text(x + 20, yy + 22, `${tgt}  •  รางวัล ${q.reward.exp} EXP, ${q.reward.gold} G${q.reward.items ? ', ' + q.reward.items.map(i => itemDef(i.id).name).join(', ') : ''}`, 7.5, '#c8b898', { wordWrap: { width: W - 40 } }));
      yy += 43;
    }
  }

  // ---------------- MENU ----------------
  buildMenu(c: Phaser.GameObjects.Container) {
    const s = S(), ui = this.ui, k = this.k;
    const W = 260, H = 270;
    const { x, y } = this.window(c, W, H, 'เมนู');
    let yy = y + 34;
    const b = (label: string, cb: () => void, color?: number) => { c.add(k.button(x + 20, yy, W - 40, 26, label, cb, { size: 10, color })); yy += 31; };
    b('💾 บันทึกเกม', () => { const ok = saveGame(s); bus.emit(EV.TOAST, ok ? 'บันทึกเกมแล้ว' : 'บันทึกไม่สำเร็จ', ok ? '#9fffb0' : '#ff8a8a'); this.close(); }, 0x1f4a2a);
    b('📂 โหลดเกมล่าสุด', () => {
      const st = loadGame();
      if (!st) { bus.emit(EV.TOAST, 'ไม่พบเซฟ', '#ff8a8a'); return; }
      runtime.state = st;
      this.close();
      ui.scene.stop('UI');
      ui.scene.get('World').scene.restart();
    });
    b(`🔊 เสียงเอฟเฟกต์: ${s.sfx ? 'เปิด' : 'ปิด'}`, () => { s.sfx = !s.sfx; audioState.sfx = s.sfx; this.rebuild(); });
    b(`🎵 เพลง: ${s.music ? 'เปิด' : 'ปิด'}`, () => { s.music = !s.music; setMusic(s.music); this.rebuild(); });
    b('⛶ เต็มจอ', () => { this.close(); ui.toggleFullscreen(); });
    if (!this.confirmNew) b('🆕 เริ่มเกมใหม่', () => { this.confirmNew = true; this.rebuild(); }, 0x5a1a1a);
    else b('⚠ ยืนยัน! ลบเซฟและเริ่มใหม่', () => { deleteSave(); location.reload(); }, 0x8a1a1a);
    c.add(k.text(x + W / 2, y + H - 16, `เวลาเล่น ${Math.floor(s.playTime / 60)} นาที  •  v0.3`, 7.5, '#8a7a60').setOrigin(0.5));
  }

  // ---------------- DIALOG ----------------
  buildDialog(c: Phaser.GameObjects.Container) {
    const s = S(), ui = this.ui, k = this.k;
    const info = NPC_INFO[this.dialogNpc];
    const W = Math.min(520, ui.VW - 20), H = 110;
    const x = ui.VW / 2 - W / 2, y = 360 - H - 8;
    const g = ui.add.graphics();
    k.frame(g, x, y, W, H, 0.96);
    const blocker = ui.add.zone(x, y, W, H).setOrigin(0).setInteractive();
    c.add([blocker, g]);
    g.fillStyle(0x0a0705, 1).fillRoundedRect(x + 10, y + 10, 64, 64, 4);
    g.lineStyle(1.5, GOLD, 1).strokeRoundedRect(x + 10, y + 10, 64, 64, 4);
    const por = ui.add.sprite(x + 42, y + 44, info.tex, 'idle_0').setScale(2.2);
    c.add(por);
    c.add(k.text(x + 42, y + 78, info.name, 8.5, '#ffd84a').setOrigin(0.5, 0));
    c.add(k.text(x + 84, y + 10, this.dialogText, 9.5, '#f3e6c4', { wordWrap: { width: W - 96 }, lineSpacing: 3 }));
    const btns: [string, () => void, number?][] = [];
    if (this.dialogNpc === 'elder') {
      const a = activeQuest(s);
      if (a?.status === 'ready') btns.push(['✔ ส่งภารกิจ', () => {
        const def = QUEST_BY_ID[a.id];
        const lv = completeQuest(s, a.id);
        if (lv < 0) { bus.emit(EV.TOAST, 'ของไม่ครบ', '#ff8a8a'); return; }
        sfx.levelUp();
        bus.emit(EV.TOAST, `สำเร็จ! +${def.reward.exp} EXP +${def.reward.gold} G`, '#9fffb0');
        for (const it of def.reward.items ?? []) bus.emit(EV.TOAST, `ได้รับ ${itemDef(it.id).name} x${it.qty}`, '#6fb6ff');
        if (lv > 0) bus.emit(EV.LEVEL_UP, s.level);
        this.dialogText = def.done;
        saveGame(s);
        bus.emit(EV.STATE_CHANGED);
      }, 0x1f4a2a]);
      else if (!a) {
        const n = nextAvailable(s, 'elder');
        if (n && s.level >= n.minLevel) btns.push(['📜 รับภารกิจ', () => { acceptQuest(s, n.id); sfx.pickup(); bus.emit(EV.TOAST, `รับภารกิจ: ${n.title}`, '#ffe7a0'); this.close(); bus.emit(EV.STATE_CHANGED); }, 0x1f3a5a]);
      }
    } else if (this.dialogNpc === 'merchant') btns.push(['🛒 ร้านค้า', () => { this.shopTab = 'buy'; this.open('shop'); }, 0x1f3a5a]);
    else btns.push(['⚒ ตีบวกอุปกรณ์', () => this.open('smith'), 0x6a3a10]);
    btns.push(['ลาก่อน', () => this.close()]);
    btns.forEach(([label, cb, col], i) => c.add(k.button(x + W - 10 - (btns.length - i) * 104, y + H - 32, 98, 24, label, cb, { size: 9.5, color: col })));
  }

  // ---------------- SHOP ----------------
  buildShop(c: Phaser.GameObjects.Container) {
    const s = S(), ui = this.ui, k = this.k;
    const W = Math.min(560, ui.VW - 20), H = 320;
    const { x, y, g } = this.window(c, W, H, 'ร้านค้าของมิร่า');
    c.add(k.button(x + 14, y + 28, 70, 20, 'ซื้อ', () => { this.shopTab = 'buy'; this.selUid = null; this.rebuild(); }, { size: 9.5, color: this.shopTab === 'buy' ? 0x6a4a10 : 0x2a1d12 }));
    c.add(k.button(x + 88, y + 28, 70, 20, 'ขาย', () => { this.shopTab = 'sell'; this.selUid = null; this.rebuild(); }, { size: 9.5, color: this.shopTab === 'sell' ? 0x6a4a10 : 0x2a1d12 }));
    c.add(ui.add.image(x + W - 90, y + 38, 'icon_gold').setScale(0.4));
    c.add(k.text(x + W - 80, y + 31, s.gold.toLocaleString() + ' G', 10, '#ffd84a'));
    const top = y + 54;
    if (this.shopTab === 'buy') {
      const cols = 2, cw = (W - 34) / cols, ch = 40;
      SHOP_STOCK.forEach((id, i) => {
        const def = itemDef(id);
        const cx = x + 14 + (i % cols) * (cw + 6), cy = top + Math.floor(i / cols) * (ch + 4);
        g.fillStyle(0x2a1d12, 0.85).fillRoundedRect(cx, cy, cw, ch, 3);
        g.lineStyle(1, RARITY_COLORS[def.rarity], 0.6).strokeRoundedRect(cx, cy, cw, ch, 3);
        c.add(ui.add.image(cx + 20, cy + ch / 2, `icon_${def.icon}`).setScale(0.8));
        c.add(k.text(cx + 38, cy + 4, def.name, 9, '#' + RARITY_COLORS[def.rarity].toString(16).padStart(6, '0')));
        c.add(k.text(cx + 38, cy + 20, statLines(def, 0).join('  ') || def.desc, 7, '#c8b898', { wordWrap: { width: cw - 110 } }));
        const can = s.gold >= def.price;
        c.add(k.button(cx + cw - 66, cy + 9, 60, 22, `${def.price} G`, () => {
          if (s.gold < def.price) { sfx.error(); bus.emit(EV.TOAST, 'ทองไม่พอ', '#ff8a8a'); return; }
          if (!addItem(s, id, 1)) { sfx.error(); bus.emit(EV.TOAST, 'กระเป๋าเต็ม', '#ff8a8a'); return; }
          s.gold -= def.price; sfx.coin(); bus.emit(EV.TOAST, `ซื้อ ${def.name}`, '#9fffb0'); bus.emit(EV.STATE_CHANGED);
        }, { size: 9, disabled: !can, color: 0x5a3a10 }));
      });
    } else {
      // sell grid + detail
      const cols = 7, cs = 30;
      s.inventory.forEach((it, i) => {
        const def = itemDef(it.id);
        const cx = x + 14 + (i % cols) * (cs + 3), cy = top + Math.floor(i / cols) * (cs + 3);
        k.iconSlot(g, cx, cy, cs, RARITY_COLORS[def.rarity], it.uid === this.selUid);
        c.add(ui.add.image(cx + cs / 2, cy + cs / 2, `icon_${def.icon}`).setScale(0.75));
        if (it.qty > 1) c.add(k.text(cx + cs - 2, cy + cs - 1, String(it.qty), 7.5, '#ffffff').setOrigin(1, 1));
        if (isEquipped(s, it.uid)) c.add(k.text(cx + 2, cy + 1, 'E', 7, '#ffd84a'));
        const z = ui.add.zone(cx, cy, cs, cs).setOrigin(0).setInteractive();
        z.on('pointerup', () => { sfx.click(); this.selUid = it.uid; this.rebuild(); });
        c.add(z);
      });
      const dx = x + 14 + cols * (cs + 3) + 6;
      this.itemDetail(c, g, dx, top, x + W - 14 - dx, H - 66, 'sell');
    }
  }

  // ---------------- SMITH ----------------
  buildSmith(c: Phaser.GameObjects.Container) {
    const s = S(), ui = this.ui, k = this.k;
    const W = Math.min(520, ui.VW - 20), H = 300;
    const { x, y, g } = this.window(c, W, H, 'โรงตีเหล็กของบรอม');
    const gear = s.inventory.filter(i => ['weapon', 'armor', 'accessory'].includes(itemDef(i.id).type));
    c.add(k.text(x + 14, y + 30, `ผลึกมานา: ${countItem(s, 'mana_shard')}   ทอง: ${s.gold.toLocaleString()} G`, 9, '#ffe7a0'));
    const cols = 6, cs = 32, top = y + 48;
    gear.forEach((it, i) => {
      const def = itemDef(it.id);
      const cx = x + 14 + (i % cols) * (cs + 4), cy = top + Math.floor(i / cols) * (cs + 4);
      k.iconSlot(g, cx, cy, cs, RARITY_COLORS[def.rarity], it.uid === this.selUid);
      c.add(ui.add.image(cx + cs / 2, cy + cs / 2, `icon_${def.icon}`).setScale(0.8));
      if (it.upg) c.add(k.text(cx + cs - 2, cy + 1, '+' + it.upg, 7.5, '#9fffb0').setOrigin(1, 0));
      if (isEquipped(s, it.uid)) c.add(k.text(cx + 2, cy + 1, 'E', 7, '#ffd84a'));
      const z = ui.add.zone(cx, cy, cs, cs).setOrigin(0).setInteractive();
      z.on('pointerup', () => { sfx.click(); this.selUid = it.uid; this.rebuild(); });
      c.add(z);
    });
    if (!gear.length) c.add(k.text(x + 14, top, 'ไม่มีอุปกรณ์', 9, '#8a7a60'));
    const dx = x + 14 + cols * (cs + 4) + 6;
    this.itemDetail(c, g, dx, top - 18, x + W - 14 - dx, H - 48, 'smith');
  }
}

function statLines(def: ItemDef, upg: number): string[] {
  const m = upgradeMult(upg);
  const out: string[] = [];
  if (def.atk) out.push(`ATK +${Math.round(def.atk * m)}`);
  if (def.matk) out.push(`MATK +${Math.round(def.matk * m)}`);
  if (def.def) out.push(`DEF +${Math.round(def.def * m)}`);
  if (def.hp) out.push(`HP +${Math.round(def.hp * m)}`);
  if (def.mp) out.push(`MP +${def.mp}`);
  if (def.crit) out.push(`คริ +${def.crit}%`);
  for (const k of STAT_KEYS) if (def[k]) out.push(`${STAT_NAMES[k]} +${def[k]}`);
  if (def.heal) out.push(`ฟื้น HP ${def.heal}`);
  if (def.mana) out.push(`ฟื้น MP ${def.mana}`);
  return out;
}

export type { InvItem };
void GOLD;
