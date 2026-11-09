import { hasSkin, panelFrame, skillIconKey } from './skin';
// Modal panels: Bag/Equipment, Stats/Skills, Quests, Menu, NPC dialog, Shop, Blacksmith.
import Phaser from 'phaser';
import type { UIScene } from '../scenes/UIScene';
import { GOLD, GOLD_D } from './kit';
import { S, bus, EV, runtime } from '../core/events';
import { invSize, type InvItem } from '../core/state';
import { BUILDINGS, RES_NAMES, levelCost, forgeRecipe, unlockedPlots, MEALS, mealPower, type BuildingId, type Cost, type MealId } from '../data/buildings';
import { build, upgrade, buildingAt, canAfford, craft, cook, levelOf, underConstruction } from '../systems/settlement';
import { upSkill, SKILL_MAX, currentSkills, nextForm, advanceClass, activeTier } from '../systems/stats';
import { portraitKey } from '../art/formAssets';
import { ensureDaily, dailyProgress, DAILY_NAMES } from '../systems/daily';
import { derive, expToNext } from '../systems/stats';
import { rarOf, rarMult, affixText, isGear } from '../systems/loot';
import { itemDef, RARITY_COLORS, RARITY_NAMES, SHOP_STOCK, upgradeChance, upgradeCost, upgradeMult, MAX_UPGRADE, type ItemDef } from '../data/items';
import { reqLevel, dismantle, equip, unequipUid, isEquipped, useItem, addItem, removeUid, sellPrice, tryUpgrade, countItem } from '../systems/inventory';
import { QUESTS, QUEST_BY_ID } from '../data/quests';
import { activeQuest, nextAvailable, acceptQuest, completeQuest, refreshCollect } from '../systems/quests';
import { SKILL_BY_ID } from '../data/skills';
import { CLASSES, FORM_LEVEL, formName, formCode, classSkills, ALL_FORMS, type ClassId } from '../data/classes';
import { saveGame, loadGame, deleteSave } from '../core/save';
import { strokeEnabled, setStroke } from '../art/stroke';
import { sfx, setMusic, audioState } from '../audio/sfx';

type PanelId = 'wardrobe' | 'bag' | 'stats' | 'quest' | 'menu' | 'shop' | 'smith' | 'dialog' | 'plot' | 'job' | 'forms';

const NPC_INFO: Record<string, { name: string; tex: string }> = {
  elder: { name: 'ผู้เฒ่าอัลดริค', tex: 'npc_elder' },
  merchant: { name: 'พ่อค้ามิร่า', tex: 'npc_merchant' },
  smith: { name: 'ช่างตีเหล็กบรอม', tex: 'npc_smith' },
};

export class Panels {
  cur: PanelId | null = null;
  c: Phaser.GameObjects.Container | null = null;
  selUid: number | null = null;
  plot = 0;
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
    if (this.cur) saveGame(S());
    this.cur = null;
    this.c?.destroy(); this.c = null;
  }

  openDialog(npc: string, text?: string) {
    if (npc === 'wardrobe') { this.open('wardrobe'); return; }
    this.dialogNpc = npc;
    const s = S();
    if (text) { this.dialogText = text; this.open('dialog'); return; }
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
      case 'plot': this.buildPlot(c); break;
      case 'job': this.buildJob(c); break;
      case 'forms': this.buildForms(c); break;
      case 'wardrobe': this.buildWardrobe(c); break;
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
    const blocker = ui.add.zone(x, y, w, h).setOrigin(0).setInteractive();
    if (hasSkin(ui)) {
      c.add([blocker, ...panelFrame(ui, x, y, w, h), g]);
      if (ui.textures.exists('ui_banner0')) { const bn = ui.add.image(x + w / 2, y + 6, 'ui_banner0'); bn.setScale(Math.min(w * 0.62, 30 + title.length * 7.5) / bn.width); c.add(bn); }
    } else { this.k.frame(g, x, y, w, h, 0.97, true); c.add([blocker, g]); }
    c.add(this.k.text(x + w / 2, y + 6, title, 12, '#ffe7a0').setOrigin(0.5));
    const close = this.k.button(x + w - 26, y - 4, 22, 18, '✕', () => this.close(), { size: 10, color: 0x5a1a1a });
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
    const heroImg = ui.add.image(ex + 56, ey + 62, pr.key, pr.frame).setScale(this.ui.world.hero.ai ? 0.75 : 1.8);
    c.add(heroImg);
    const slots: [keyof typeof s.equip, string, number, number][] = [['weapon', 'อาวุธ', ex + 8, ey + 100], ['armor', 'เกราะ', ex + 42, ey + 100], ['accessory', 'เครื่องประดับ', ex + 76, ey + 100]];
    for (const [slot, label, sx, sy] of slots) {
      const uid = s.equip[slot];
      const it = uid != null ? s.inventory.find(i => i.uid === uid) : undefined;
      k.iconSlot(g, sx, sy, 28, it ? RARITY_COLORS[rarOf(it)] : undefined, it?.uid === this.selUid && !!it);
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
    const N = invSize(s), cols = Math.ceil(N / 5), cs = Math.min(30, Math.floor(198 / cols) - 3);
    const gx = ex + 122, gy = ey;
    for (let i = 0; i < N; i++) {
      const cx = gx + (i % cols) * (cs + 3), cy = gy + Math.floor(i / cols) * (cs + 3);
      const it = s.inventory[i];
      const def = it ? itemDef(it.id) : null;
      k.iconSlot(g, cx, cy, cs, it ? RARITY_COLORS[rarOf(it)] : undefined, !!it && it.uid === this.selUid);
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
    const rr = rarOf(it), rcol = '#' + RARITY_COLORS[rr].toString(16).padStart(6, '0');
    k.iconSlot(g, x + 6, y + 6, 30, RARITY_COLORS[rr]);
    if (rr >= 2) g.fillStyle(RARITY_COLORS[rr], 0.18).fillRoundedRect(x + 7, y + 7, 28, 28, 3);
    c.add(ui.add.image(x + 21, y + 21, `icon_${def.icon}`).setScale(0.8));
    c.add(k.text(x + 42, y + 6, def.name + (it.upg ? ` +${it.upg}` : ''), 9.5, rcol, { wordWrap: { width: w - 46 } }));
    const CLS_TH: Record<string, string> = { sword: '⚔ สายดาบ', archer: '🏹 สายธนู', mage: '✦ สายเวท', cleric: '✚ สายนักบวช' };
    const offCls = !!def.cls && !!s.cls && s.cls !== 'novice' && def.cls !== s.cls;
    c.add(k.text(x + 42, y + 24, (isGear(def) ? `★ ${RARITY_NAMES[rr]}` : RARITY_NAMES[def.rarity]) + (def.cls ? `  ${CLS_TH[def.cls]}` : isGear(def) ? '  ทุกสาย' : ''), 7.5, rcol));
    const lines = statLines(def, it);
    let info = lines.join('\n');
    if (offCls) info += '\n⚠ ไม่ตรงสาย: ค่าพลังเหลือ 60%';
    const aff = (it.aff ?? []).map(a => '✦ ' + affixText(a as never)).join('\n');
    if (aff) info += '\n' + aff;
    if (isGear(def) && mode === 'bag' && !isEquipped(s, it.uid)) {
      const cur = derive(s).power;
      const slot = def.type as 'weapon' | 'armor' | 'accessory';
      const old = s.equip[slot];
      s.equip[slot] = it.uid; const nxt = derive(s).power; s.equip[slot] = old;
      const diff = nxt - cur;
      info += `\n${diff >= 0 ? '▲' : '▼'} พลังรบ ${diff >= 0 ? '+' : ''}${diff}`;
    }
    info += (info ? '\n' : '') + def.desc;
    c.add(k.text(x + 6, y + 42, info, 8, '#e8dcc0', { wordWrap: { width: w - 12 }, lineSpacing: 2 }));
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
        else {
          const rq = reqLevel(it.id);
          if (s.level < rq) btn(`ต้อง Lv ${rq} ถึงจะใส่ได้`, () => undefined, undefined, true);
          else btn('สวมใส่', () => { equip(s, it.uid); sfx.pickup(); bus.emit(EV.TOAST, `สวมใส่ ${def.name}`, '#ffe7a0'); bus.emit(EV.STATE_CHANGED); }, 0x1f3a5a);
          btn('ย่อยเป็นวัตถุดิบ', () => { const r = dismantle(s, it.uid); if (r) { sfx.upgradeOk(); bus.emit(EV.TOAST, `ได้ผลึกมานา x${r.shards}${r.cores ? ` แก่นโบราณ x${r.cores}` : ''}`, '#c89aff'); this.selUid = null; bus.emit(EV.STATE_CHANGED); } }, 0x4a2a5a);
        }
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

  // ---------------- CHARACTER ----------------
  buildStats(c: Phaser.GameObjects.Container) {
    const s = S(), ui = this.ui, k = this.k;
    const W = Math.min(560, ui.VW - 20), H = 320;
    const { x, y, g } = this.window(c, W, H, 'ตัวละคร & สกิล');
    const d = derive(s);
    const lx = x + 14, ly = y + 32;
    g.fillStyle(0x0a0705, 0.6).fillRoundedRect(lx, ly, 250, H - 44, 4);
    c.add(k.text(lx + 8, ly + 6, `${s.name} • ${formName(s.cls, s.tier)} (ร่าง ${s.tier + 1})   Lv ${s.level}   EXP ${s.exp}/${expToNext(s.level)}`, 9, '#ffe7a0'));
    g.fillStyle(0x2a1d12, 1).fillRoundedRect(lx + 6, ly + 22, 238, 34, 4);
    g.lineStyle(1, GOLD, 1).strokeRoundedRect(lx + 6, ly + 22, 238, 34, 4);
    c.add(k.text(lx + 125, ly + 27, `พลังรบ  ${d.power.toLocaleString()}`, 15, '#ffd84a').setOrigin(0.5, 0));
    const rows: [string, string][] = [
      ['HP', String(d.maxHp)], ['MP', String(d.maxMp)], ['ATK', String(d.atk)], ['MATK', String(d.matk)], ['DEF', String(d.def)],
      ['คริติคอล', (d.crit * 100).toFixed(1) + '%'], ['ความเร็วโจมตี', (1000 / d.attackInterval).toFixed(2) + '/วิ'],
      ['ความเร็วเดิน', String(Math.round(d.moveSpeed))], ['ดูดเลือด', (d.leech * 100).toFixed(0) + '%'],
      ['โอกาสดรอปของแรร์', '+' + Math.round(d.mf) + '%'], ['EXP', '+' + Math.round((d.expBonus - 1) * 100) + '%'],
    ];
    rows.forEach(([a, v], i) => {
      const col = i % 2, row = Math.floor(i / 2);
      c.add(k.text(lx + 12 + col * 120, ly + 64 + row * 20, a, 8, '#b8a078'));
      c.add(k.text(lx + 118 + col * 120, ly + 64 + row * 20, v, 9, '#ffffff').setOrigin(1, 0));
    });
    c.add(k.text(lx + 8, ly + H - 70, 'พลังมาจาก เลเวล (ปลดล็อกอุปกรณ์ขั้นสูง + แต้มสกิล) และอุปกรณ์ (ยิ่งแรร์ ขาว→เขียว→ฟ้า→ม่วง→ส้ม ยิ่งแรง)' + (s.buff && s.buff.until > Date.now() ? `\n🍲 บัฟอาหาร +${s.buff.pct}% เหลือ ${Math.ceil((s.buff.until - Date.now()) / 60000)} นาที` : ''), 7.5, '#d8ccb0', { wordWrap: { width: 232 } }));
    const rx = lx + 260, rw = x + W - 14 - rx;
    g.fillStyle(0x0a0705, 0.6).fillRoundedRect(rx, ly, rw, H - 44, 4);
    c.add(k.text(rx + 8, ly + 6, `สกิล   แต้มสกิล: ${s.skillPts}`, 10, s.skillPts ? '#9fffb0' : '#ffe7a0'));
    currentSkills(s).map(id => SKILL_BY_ID[id]).forEach((sk, i) => {
      const sy = ly + 24 + i * 56;
      const locked = false;
      c.add(ui.add.image(rx + 20, sy + 16, skillIconKey(ui, sk)).setDisplaySize(30, 30).setAlpha(locked ? 0.4 : 1));
      const slv = s.skillLv[sk.id] ?? 1;
      c.add(k.text(rx + 38, sy + 2, sk.name + `  Lv ${slv}`, 9, locked ? '#8a7a60' : '#9ad8ff'));
      if (!locked && slv < SKILL_MAX) c.add(k.button(x + W - 50, sy + 2, 30, 20, '+', () => { if (upSkill(s, sk.id)) { sfx.levelUp(); bus.emit(EV.STATE_CHANGED); } }, { size: 11, disabled: s.skillPts < 1, color: 0x1f4a2a }));
      c.add(k.text(rx + 38, sy + 15, `${sk.desc}\nMP ${sk.mp}  คูลดาวน์ ${sk.cooldown / 1000} วิ`, 7.5, '#d8ccb0', { wordWrap: { width: rw - 46 }, lineSpacing: 1 }));
    });
  }

  // ---------------- VILLAGE PLOT ----------------
  openPlot(i: number) { this.plot = i; this.open('plot'); }

  costText(c: Cost) {
    const s = S();
    const parts: [string, boolean][] = [];
    if (c.gold) parts.push([`ทอง ${c.gold}`, s.gold >= c.gold]);
    for (const k of ['wood', 'stone', 'food'] as const) if (c[k]) parts.push([`${RES_NAMES[k]} ${c[k]}`, s.res[k] >= c[k]!]);
    for (const [id, n] of Object.entries(c.items ?? {})) parts.push([`${itemDef(id).name} ${n}`, countItem(s, id) >= n]);
    return parts;
  }

  addCost(c: Phaser.GameObjects.Container, x: number, y: number, w: number, cost: Cost) {
    let cx = x, cy = y;
    for (const [t, ok] of this.costText(cost)) {
      const tx = this.k.text(cx, cy, t, 7.5, ok ? '#c8e8b0' : '#ff8a7a');
      if (cx + tx.width > x + w) { cx = x; cy += 11; tx.setPosition(cx, cy); }
      c.add(tx); cx += tx.width + 8;
    }
    return cy + 12;
  }

  buildPlot(c: Phaser.GameObjects.Container) {
    const s = S(), ui = this.ui, k = this.k;
    const b = buildingAt(s, this.plot);
    const only = (ui as unknown as { plotChoices?: (p: number) => string[] }).plotChoices?.(this.plot) ?? [];
    const single = !b && only.length === 1;
    const W = single ? 240 : Math.min(560, ui.VW - 20), H = single ? 230 : 300;
    const { x, y, g } = this.window(c, W, H, b ? `${BUILDINGS[b.type as BuildingId].name}  Lv ${b.level}` : single ? `สร้าง${BUILDINGS[only[0] as BuildingId].name}` : `ที่ดินแปลง ${this.plot + 1} — เลือกสิ่งก่อสร้าง`);
    const top = y + 34;
    if (!b) {
      const ids = (only.length ? only : Object.keys(BUILDINGS).filter(i => i !== 'home')) as BuildingId[];
      const cols = single ? 1 : 5, rows = Math.ceil(ids.length / cols);
      const cw = (W - 28 - (cols - 1) * 5) / cols, ch = (H - 44 - (rows - 1) * 5) / rows;
      ids.forEach((id, i) => {
        const d = BUILDINGS[id], cx = x + 14 + (i % cols) * (cw + 5), cy = top + Math.floor(i / cols) * (ch + 5);
        const have = s.buildings.some(q => q.type === id);
        g.fillStyle(have ? 0x1a140e : 0x2a1d12, 0.92).fillRoundedRect(cx, cy, cw, ch, 4).lineStyle(1, GOLD_D, 1).strokeRoundedRect(cx, cy, cw, ch, 4);
        const tk = `o_${id === 'home' ? 'house' : id}_0`, art = ui.textures.exists(tk) ? tk : `ai_bld_${id}_1`;   // top-down art when available
        if (ui.textures.exists(art)) { const im = ui.add.image(cx + cw - 4, cy + 4, art).setOrigin(1, 0); const sc = Math.min(40 / im.width, 34 / im.height); im.setScale(sc).setAlpha(have ? 0.4 : 1); c.add(im); }
        c.add(k.text(cx + 5, cy + 4, `${d.icon} ${d.name}`, 9.5, have ? '#8a7a60' : '#ffd84a'));
        c.add(k.text(cx + 5, cy + 20, d.effect(1), 7, '#9ad8ff', { wordWrap: { width: cw - 50 } }));
        this.addCost(c, cx + 5, cy + 42, cw - 10, levelCost(d, 1));
        const ok = !have && canAfford(s, levelCost(d, 1));
        c.add(k.button(cx + 5, cy + ch - 24, cw - 10, 19, have ? 'สร้างแล้ว' : 'สร้าง', () => {
          if (build(s, this.plot, id)) { sfx.levelUp(); bus.emit(EV.TOAST, `เริ่มก่อสร้าง${d.name}!`, '#9fffb0'); bus.emit(EV.STATE_CHANGED); this.close(); }
          else { sfx.error(); bus.emit(EV.TOAST, 'วัตถุดิบไม่พอ', '#ff8a8a'); }
        }, { size: 9, disabled: !ok, color: 0x1f4a2a }));
      });
      return;
    }
    const d = BUILDINGS[b.type as BuildingId];
    const lx = x + 14, lw = 230;
    g.fillStyle(0x0a0705, 0.6).fillRoundedRect(lx, top, lw, H - 48, 4);
    c.add(k.text(lx + 8, top + 6, d.desc, 8.5, '#e8dcc0', { wordWrap: { width: lw - 16 }, lineSpacing: 2 }));
    c.add(k.text(lx + 8, top + 50, `ตอนนี้: ${d.effect(b.level)}`, 8.5, '#9ad8ff', { wordWrap: { width: lw - 16 } }));
    if (underConstruction(b)) {
      c.add(k.text(lx + 8, top + 90, `🔨 กำลังก่อสร้าง Lv ${b.level}… เสร็จใน ${Math.ceil((b.done! - Date.now()) / 1000)} วินาที`, 9, '#ffd84a', { wordWrap: { width: lw - 16 } }));
    } else if (b.level < d.maxLevel) {
      c.add(k.text(lx + 8, top + 86, `อัปเกรดเป็น Lv ${b.level + 1}: ${d.effect(b.level + 1)}`, 8.5, '#9fffb0', { wordWrap: { width: lw - 16 } }));
      const ey = this.addCost(c, lx + 8, top + 122, lw - 16, levelCost(d, b.level + 1));
      c.add(k.button(lx + 8, Math.max(ey + 4, top + H - 82), lw - 16, 26, `⬆ อัปเกรด Lv ${b.level + 1}`, () => {
        if (upgrade(s, this.plot)) { sfx.levelUp(); bus.emit(EV.TOAST, `เริ่มอัปเกรด ${d.name} → Lv ${b.level}`, '#9fffb0'); bus.emit(EV.STATE_CHANGED); this.close(); }
        else { sfx.error(); bus.emit(EV.TOAST, 'วัตถุดิบไม่พอ — ออกล่ามอนสเตอร์เพื่อหาวัตถุดิบ', '#ff8a8a'); }
      }, { size: 10, color: 0x1f4a2a, disabled: !canAfford(s, levelCost(d, b.level + 1)) }));
    } else c.add(k.text(lx + 8, top + 90, 'เลเวลสูงสุดแล้ว', 9, '#ffd84a'));
    const rx = lx + lw + 8, rw = x + W - 14 - rx;
    g.fillStyle(0x0a0705, 0.6).fillRoundedRect(rx, top, rw, H - 48, 4);
    if (b.type === 'forge') {
      c.add(k.text(rx + 8, top + 6, `หลอมของ (ใช้ผลึกมานา ${b.level} ชิ้น • มี ${countItem(s, 'mana_shard')})`, 9, '#ffe7a0'));
      (['weapon', 'armor', 'accessory'] as const).forEach((slot, i) => {
        const r = forgeRecipe(b.level, slot), yy = top + 26 + i * 72;
        g.fillStyle(0x2a1d12, 0.9).fillRoundedRect(rx + 6, yy, rw - 12, 66, 3);
        c.add(k.text(rx + 12, yy + 4, `${['อาวุธ', 'เกราะ', 'เครื่องประดับ'][i]}  • ขั้นต่ำ ${RARITY_NAMES[r.minRarity]}`, 9, '#' + RARITY_COLORS[r.minRarity].toString(16).padStart(6, '0')));
        this.addCost(c, rx + 12, yy + 20, rw - 110, r.cost);
        c.add(k.button(rx + rw - 90, yy + 20, 78, 26, 'หลอม', () => {
          const res = craft(s, slot);
          if (res.ok) {
            for (const t of dailyProgress(s, 'craft')) bus.emit(EV.TOAST, `✔ ภารกิจประจำวัน: ${DAILY_NAMES[t.kind]} สำเร็จ! +${t.gold} G`, '#9fffb0');
            sfx.upgradeOk(); const col = '#' + RARITY_COLORS[res.rar].toString(16).padStart(6, '0');
            bus.emit(EV.TOAST, `หลอมได้ [${RARITY_NAMES[res.rar]}] ${itemDef(res.id).name}!`, col);
            const fl = ui.add.rectangle(0, 0, ui.VW, 360, RARITY_COLORS[res.rar], 0.35).setOrigin(0);
            ui.tweens.add({ targets: fl, alpha: 0, duration: 500, onComplete: () => fl.destroy() });
            bus.emit(EV.STATE_CHANGED); this.rebuild();
          } else { sfx.error(); bus.emit(EV.TOAST, { no_res: 'วัตถุดิบไม่พอ', no_shard: 'ผลึกมานาไม่พอ', bag_full: 'กระเป๋าเต็ม', no_forge: 'ยังไม่มีโรงหลอม' }[res.reason], '#ff8a8a'); }
        }, { size: 10, color: 0x7a2a10 }));
      });
    } else if (b.type === 'kitchen') {
      const p = mealPower(b.level);
      c.add(k.text(rx + 8, top + 6, `ทำอาหาร (ใช้อาหาร ${p.food} • มี ${s.res.food})`, 9, '#ffe7a0'));
      (Object.keys(MEALS) as MealId[]).forEach((m, i) => {
        const md = MEALS[m], yy = top + 26 + i * 72, lockd = b.level < md.minLv;
        g.fillStyle(0x2a1d12, 0.9).fillRoundedRect(rx + 6, yy, rw - 12, 66, 3);
        c.add(k.text(rx + 12, yy + 4, md.name + (lockd ? `  🔒 ครัว Lv${md.minLv}` : ''), 10, lockd ? '#8a7a60' : '#ffd84a'));
        c.add(k.text(rx + 12, yy + 22, `${md.desc} +${p.pct}% นาน ${p.mins} นาที`, 8, '#e8dcc0', { wordWrap: { width: rw - 110 } }));
        c.add(k.button(rx + rw - 90, yy + 20, 78, 26, 'ทำ', () => {
          const r = cook(s, m);
          if (r === 'ok') { sfx.heal(); bus.emit(EV.TOAST, `กิน${md.name}! +${p.pct}%`, '#9fffb0'); bus.emit(EV.STATE_CHANGED); this.rebuild(); }
          else { sfx.error(); bus.emit(EV.TOAST, r === 'no_food' ? 'อาหารไม่พอ — ล่ามอนสเตอร์เพื่อหาอาหาร' : 'ยังทำไม่ได้', '#ff8a8a'); }
        }, { size: 10, color: 0x5a3a10, disabled: lockd }));
      });
    } else if (d.produces) {
      const nm = d.produces === 'gold' ? 'ทอง' : RES_NAMES[d.produces];
      c.add(k.text(rx + 8, top + 6, `ผลผลิตสะสม: ${Math.floor(b.stored)} ${nm}`, 11, '#ffe7a0'));
      c.add(k.text(rx + 8, top + 30, `ผลิตต่อเนื่องแม้ไม่ได้เล่น (เก็บได้สูงสุด 2 ชั่วโมง) • เดินเข้าใกล้อาคารเพื่อเก็บ`, 8.5, '#e8dcc0', { wordWrap: { width: rw - 16 } }));
    } else if (b.type === 'warehouse') {
      c.add(k.text(rx + 8, top + 6, `กระเป๋าตอนนี้ ${invSize(s)} ช่อง`, 11, '#ffe7a0'));
      c.add(k.text(rx + 8, top + 30, 'ยิ่งกระเป๋าใหญ่ ยิ่งเก็บของดรอปได้มากก่อนต้องกลับเมือง', 8.5, '#e8dcc0', { wordWrap: { width: rw - 16 } }));
    }
  }

  // ---------------- CLASS / FORMS ----------------
  buildJob(c: Phaser.GameObjects.Container) {
    const s = S(), ui = this.ui, k = this.k;
    const W = Math.min(580, ui.VW - 16), H = 310;
    const nf = nextForm(s);
    const { x, y, g } = this.window(c, W, H, s.tier === 0 ? 'เลือกสายอาชีพ — ร่างที่ 2' : `เปลี่ยนร่างที่ ${(nf ?? s.tier) + 1}`);
    const top = y + 32;
    const doIt = (cls?: ClassId) => {
      if (advanceClass(s, cls)) {
        sfx.levelUp();
        const nm = formName(s.cls, s.tier);
        bus.emit(EV.TOAST, `กลายเป็น ${nm}!`, '#ffd84a');
        this.close();
        bus.emit(EV.STATE_CHANGED);
        (ui.world as unknown as { levelUpFx(): void }).levelUpFx();
      }
    };
    if (s.tier === 0) {
      const ids: ClassId[] = ['sword', 'archer', 'mage', 'cleric'];
      const cw = (W - 28 - 18) / 4;
      ids.forEach((id, i) => {
        const d = CLASSES[id], cx = x + 14 + i * (cw + 6);
        g.fillStyle(0x2a1d12, 0.9).fillRoundedRect(cx, top, cw, H - 46, 4).lineStyle(1, GOLD_D, 1).strokeRoundedRect(cx, top, cw, H - 46, 4);
        c.add(k.text(cx + cw / 2, top + 6, d.forms[1], 12, '#ffd84a').setOrigin(0.5, 0));
        c.add(k.text(cx + 6, top + 26, d.desc, 7.5, '#e8dcc0', { wordWrap: { width: cw - 12 }, lineSpacing: 2 }));
        const b = d.bonus;
        const bt = [b.atk && `ATK +${b.atk}%`, b.matk && `MATK +${b.matk}%`, b.hp && `HP +${b.hp}%`, b.crit && `คริ +${b.crit}%`, b.aspd && `ตีเร็ว +${b.aspd}%`].filter(Boolean).join('  ');
        c.add(k.text(cx + 6, top + 74, `โบนัสต่อร่าง: ${bt}`, 7.5, '#9fffb0', { wordWrap: { width: cw - 12 } }));
        c.add(k.text(cx + 6, top + 106, 'สกิล: ' + classSkills(id, 1).map(q => SKILL_BY_ID[q].name).join(', '), 7.5, '#9ad8ff', { wordWrap: { width: cw - 12 } }));
        c.add(k.text(cx + 6, top + 146, 'ร่างถัดไป:\n' + d.forms.slice(2).map((f, j) => `Lv${FORM_LEVEL[j + 2]} ${f}`).join('\n'), 7.5, '#c8b898', { lineSpacing: 2 }));
        c.add(k.button(cx + 6, top + H - 80, cw - 12, 24, 'เลือกสายนี้', () => doIt(id), { size: 9.5, color: 0x1f4a2a }));
      });
      return;
    }
    const d = CLASSES[s.cls];
    const t = nf ?? s.tier;
    c.add(k.text(x + W / 2, top + 10, `${d.forms[s.tier]}  ➜  ${d.forms[t]}`, 16, '#ffd84a').setOrigin(0.5, 0));
    const ns = CLASSES[s.cls].skills[t] ?? [];
    c.add(k.text(x + W / 2, top + 50, `โบนัสสายเพิ่มอีกขั้น • ชุดใหม่${ns.length ? ` • สกิลใหม่: ${ns.map(q => SKILL_BY_ID[q].name).join(', ')}` : ''}`, 9, '#9fffb0', { align: 'center', wordWrap: { width: W - 40 } }).setOrigin(0.5, 0));
    c.add(k.button(x + W / 2 - 80, top + H - 90, 160, 30, '✨ เปลี่ยนร่าง', () => doIt(), { size: 12, color: 0x6a3a8a, disabled: nf === null }));
  }

  // ---------------- CHANGING ROOM ----------------
  buildWardrobe(c: Phaser.GameObjects.Container) {
    const s = S(), ui = this.ui, k = this.k;
    const W = Math.min(600, ui.VW - 16), H = 330;
    const { x, y, g } = this.window(c, W, H, '👕 ห้องแต่งตัว — เตรียมตัวก่อนออกเดินทาง');
    const top = y + 32;
    c.add(k.text(x + 16, top, 'ชุดสำหรับการออกเดินทาง', 10, '#ffe7a0'));
    const opts: ['hunt' | 'gather', string, string][] = [
      ['hunt', '⚔ ชุดล่ามอนสเตอร์', 'สวมชุดนักรบ พลังโจมตีเต็มที่\nเหมาะกับการล่ามอนและหาไอเทม'],
      ['gather', '⛏ ชุดหาทรัพยากร', 'ใส่ชุดชาวบ้าน เก็บไม้/หินได้ x2\nแต่ตีมอน -40%'],
    ];
    const cw = (W - 38) / 2;
    opts.forEach(([id, t, d], i) => {
      const cx = x + 14 + i * (cw + 10), on = s.outfit === id;
      g.fillStyle(on ? 0x3a2a10 : 0x2a1d12, 0.95).fillRoundedRect(cx, top + 16, cw, 74, 4).lineStyle(on ? 2 : 1, on ? GOLD : GOLD_D, 1).strokeRoundedRect(cx, top + 16, cw, 74, 4);
      c.add(k.text(cx + 10, top + 22, t + (on ? '  ✔' : ''), 11, on ? '#ffd84a' : '#f3e6c4'));
      c.add(k.text(cx + 10, top + 42, d, 8, '#d8ccb0', { lineSpacing: 2 }));
      const z = ui.add.zone(cx, top + 16, cw, 74).setOrigin(0).setInteractive();
      z.on('pointerup', () => { s.outfit = id; sfx.pickup(); bus.emit(EV.STATE_CHANGED); this.rebuild(); });
      c.add(z);
    });
    c.add(k.text(x + 16, top + 102, 'เลือกร่างที่จะสวม (แต่ละร่างมีสกิลของตัวเอง)', 10, '#ffe7a0'));
    const tiers = s.cls === 'novice' ? [0] : Array.from({ length: s.tier }, (_, i) => i + 1);
    const bw = Math.min(150, (W - 28 - (tiers.length - 1) * 8) / Math.max(1, tiers.length));
    tiers.forEach((t, i) => {
      const bx = x + 14 + i * (bw + 8), by = top + 120, on = activeTier(s) === t;
      g.fillStyle(on ? 0x3a2a10 : 0x2a1d12, 0.95).fillRoundedRect(bx, by, bw, 128, 4).lineStyle(on ? 2 : 1, on ? GOLD : GOLD_D, 1).strokeRoundedRect(bx, by, bw, 128, 4);
      const pk = portraitKey(ui, formCode(s.cls, t));
      if (pk) { const im = ui.add.image(bx + bw / 2, by + 44, pk); im.setScale(70 / Math.max(im.width, im.height)); c.add(im); }
      c.add(k.text(bx + bw / 2, by + 84, formName(s.cls, t) + (on ? ' ✔' : ''), 9.5, on ? '#ffd84a' : '#f3e6c4').setOrigin(0.5, 0));
      c.add(k.text(bx + bw / 2, by + 100, classSkills(s.cls, t).map(q => SKILL_BY_ID[q].name).join(' • '), 6.5, '#9ad8ff', { align: 'center', wordWrap: { width: bw - 8 } }).setOrigin(0.5, 0));
      const z = ui.add.zone(bx, by, bw, 128).setOrigin(0).setInteractive();
      z.on('pointerup', () => { s.useTier = t; sfx.levelUp(); bus.emit(EV.TOAST, `สวมร่าง ${formName(s.cls, t)}`, '#ffd84a'); this.close(); bus.emit(EV.STATE_CHANGED); });
      c.add(z);
    });
    if (s.cls === 'novice') c.add(k.text(x + 180, top + 170, `ถึง Lv${FORM_LEVEL[1]} แล้วไปคุยกับผู้เฒ่าเพื่อเลือกสายอาชีพ`, 9, '#a89878'));
  }

  // ---------------- TEST: FORM SWITCHER ----------------
  buildForms(c: Phaser.GameObjects.Container) {
    const s = S(), ui = this.ui, k = this.k;
    const W = Math.min(600, ui.VW - 16), H = 330;
    const { x, y } = this.window(c, W, H, '🧪 ทดสอบ: สลับร่าง (สำหรับหาบั๊ก)');
    const cols = 4, bw = (W - 28 - (cols - 1) * 6) / cols;
    ALL_FORMS.forEach((f, i) => {
      const r = i === 0 ? 0 : 1 + Math.floor((i - 1) / 3), col = i === 0 ? 0 : Math.floor((i - 1) / 3);
      const row = i === 0 ? 0 : 1 + ((i - 1) % 3);
      void r;
      const bx = x + 14 + col * (bw + 6), by = y + 32 + row * 52;
      const cur = s.cls === f.cls && s.tier === f.tier;
      c.add(k.button(bx, by, bw, 44, `${formName(f.cls, f.tier)}\nร่าง ${f.tier + 1} • Lv${FORM_LEVEL[f.tier]}+`, () => {
        s.cls = f.cls; s.tier = f.tier; s.useTier = f.tier; s.level = Math.max(s.level, FORM_LEVEL[f.tier]);
        const d0 = derive(s); s.hp = d0.maxHp; s.mp = d0.maxMp;
        sfx.levelUp(); bus.emit(EV.TOAST, `สลับเป็น ${formName(f.cls, f.tier)}`, '#9ad8ff');
        this.close(); bus.emit(EV.STATE_CHANGED);
      }, { size: 8.5, color: cur ? 0x6a4a10 : 0x2a1d12 }));
    });
    c.add(k.text(x + 14, y + H - 22, 'ปุ่มนี้สำหรับทดสอบเท่านั้น จะเอาออกก่อนเปิดให้คนอื่นเล่น', 7.5, '#a89878'));
  }

  // ---------------- QUEST ----------------
  buildQuest(c: Phaser.GameObjects.Container) {
    const s = S(), ui = this.ui, k = this.k;
    const W = Math.min(500, ui.VW - 20), H = 360;
    const { x, y, g } = this.window(c, W, H, 'บันทึกภารกิจ');
    const dl = ensureDaily(s);
    c.add(this.k.text(x + 16, y + 30, '☀ ภารกิจประจำวัน (รีเซ็ตทุกวัน)', 9.5, '#ffd84a'));
    dl.tasks.forEach((t, i) => {
      const tx = x + 16 + i * ((W - 32) / 3);
      c.add(this.k.text(tx, y + 46, `${t.done ? '✔' : '◇'} ${DAILY_NAMES[t.kind]} ${t.got}/${t.need}\n   +${t.gold} G  ผลึก ${t.shards}`, 8, t.done ? '#9fffb0' : '#f3e6c4', { lineSpacing: 1 }));
    });
    let yy = y + 78;
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
    const W = 260, H = 330;
    const { x, y } = this.window(c, W, H, 'เมนู');
    let yy = y + 34;
    const b = (label: string, cb: () => void, color?: number) => { c.add(k.button(x + 20, yy, W - 40, 26, label, cb, { size: 10, color })); yy += 31; };
    b('💾 บันทึกเกม', () => { const ok = saveGame(s); bus.emit(EV.TOAST, ok ? 'บันทึกเกมแล้ว' : 'บันทึกไม่สำเร็จ', ok ? '#9fffb0' : '#ff8a8a'); this.close(); }, 0x1f4a2a);
    b('📂 โหลดเกมล่าสุด', () => {
      const st = loadGame();
      if (!st) { bus.emit(EV.TOAST, 'ไม่พบเซฟ', '#ff8a8a'); return; }
      runtime.state = st;
      this.close();
      ui.reloadWorld();
    });
    b(`🔊 เสียงเอฟเฟกต์: ${s.sfx ? 'เปิด' : 'ปิด'}`, () => { s.sfx = !s.sfx; audioState.sfx = s.sfx; this.rebuild(); });
    b(`🎵 เพลง: ${s.music ? 'เปิด' : 'ปิด'}`, () => { s.music = !s.music; setMusic(s.music); this.rebuild(); });
    b('⛶ เต็มจอ', () => { this.close(); ui.toggleFullscreen(); });
    b('🧪 ทดสอบ: สลับร่างตัวละคร', () => this.open('forms'), 0x2a3a5a);
    b(`✏ เส้นขอบตัวละคร/วัตถุ: ${strokeEnabled() ? 'เปิด' : 'ปิด'}`, () => { saveGame(s); setStroke(!strokeEnabled()); location.reload(); });
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
    const hi = ui.textures.exists(`an_${info.tex}_idle`);
    const por = hi ? ui.add.sprite(x + 42, y + 74, `an_${info.tex}_idle`, 0).setOrigin(0.5, 1) : ui.add.sprite(x + 42, y + 44, info.tex, 'idle_0').setScale(2.2);
    if (hi) por.setScale(60 / por.height);
    c.add(por);
    c.add(k.text(x + 42, y + 78, info.name, 8.5, '#ffd84a').setOrigin(0.5, 0));
    c.add(k.text(x + 84, y + 10, this.dialogText, 9.5, '#f3e6c4', { wordWrap: { width: W - 96 }, lineSpacing: 3 }));
    const btns: [string, () => void, number?][] = [];
    if (this.dialogNpc === 'elder') {
      if (nextForm(s) !== null) btns.push(['✨ เปลี่ยนร่าง', () => this.open('job'), 0x6a3a8a]);
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
    else {
      btns.push(['⚒ ตีบวก', () => this.open('smith'), 0x6a3a10]);
      const fp = s.buildings.find(b => b.type === 'forge');
      if (fp) btns.push(['🔥 หลอมของ', () => { this.plot = fp.plot; this.open('plot'); }, 0x7a2a10]);
    }
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
        c.add(k.text(cx + 38, cy + 20, statLines(def).join('  ') || def.desc, 7, '#c8b898', { wordWrap: { width: cw - 110 } }));
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

function statLines(def: ItemDef, it?: InvItem): string[] {
  const m = it ? upgradeMult(it.upg) * rarMult(it) : 1;
  const out: string[] = [];
  if (def.atk) out.push(`ATK +${Math.round(def.atk * m)}`);
  if (def.matk) out.push(`MATK +${Math.round(def.matk * m)}`);
  if (def.def) out.push(`DEF +${Math.round(def.def * m)}`);
  if (def.hp) out.push(`HP +${Math.round(def.hp * m)}`);
  if (def.mp) out.push(`MP +${def.mp}`);
  if (def.crit) out.push(`คริ +${def.crit}%`);
  if (def.aspd) out.push(`ความเร็วโจมตี +${def.aspd}%`);
  if (def.mf) out.push(`โอกาสดรอปของแรร์ +${def.mf}%`);
  if (def.heal) out.push(`ฟื้น HP ${def.heal}`);
  if (def.mana) out.push(`ฟื้น MP ${def.mana}`);
  return out;
}

export type { InvItem };
void GOLD;
