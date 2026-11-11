import { hasSkin, panelFrame, skillIconKey } from './skin';
// Modal panels: Bag/Equipment, Stats/Skills, Quests, Menu, NPC dialog, Shop, Blacksmith.
import Phaser from 'phaser';
import type { UIKit } from './kit';
/** the scene hosting the panels (TdUIScene) */
export interface UIScene extends Phaser.Scene {
  kit: UIKit; VW: number;
  world: { hero: { ai: boolean; portrait(): { key: string; frame?: string | number } }; levelUpFx(): void };
  controlsReset(): void; reloadWorld(): void; toggleFullscreen(): void;
}
import { GOLD, GOLD_D } from './kit';
import { S, bus, EV, runtime } from '../core/events';
import { invSize, type InvItem } from '../core/state';
import { BUILDINGS, RES_NAMES, levelCost, forgeRecipe, unlockedPlots, MEALS, mealPower, type BuildingId, type Cost, type MealId } from '../data/buildings';
import { buildingAt, canAfford, levelOf, underConstruction } from '../systems/settlement';
import { SKILL_MAX, currentSkills, nextForm, activeTier } from '../systems/stats';
import { formKeyOf, loadIdle } from '../world/chars';
import { ensureDaily, dailyProgress, DAILY_NAMES } from '../systems/daily';
import { derive, expToNext } from '../systems/stats';
import { rarOf, rarMult, affixText, isGear } from '../systems/loot';
import { SHOP_SHARD_DAILY, itemDef, RARITY_COLORS, RARITY_NAMES, SHOP_STOCK, upgradeCost, upgradeMult, MAX_UPGRADE, type ItemDef } from '../data/items';
import { clampVitals, isEquipped, sellPrice, countItem } from '../systems/inventory';
import { QUESTS, QUEST_BY_ID } from '../data/quests';
import { activeQuest, nextAvailable, refreshCollect } from '../systems/quests';
import { SKILL_BY_ID } from '../data/skills';
import { CLASSES, FORM_LEVEL, formName, formCode, classSkills, ALL_FORMS, type ClassId } from '../data/classes';
import { saveGame, loadGame, deleteSave } from '../core/save';

import { STAGES, LANDS, WILD, DUNGEON, DUNGEON_WAVES, DUNGEON_SECS, dungeonStage } from '../world/stages';
import { RECIPES } from '../data/alchemy';
import { act, refused } from '../net/client';
import { canBrew, activeElixir } from '../systems/alchemy';
import { LOGIN_REWARDS, loginInfo } from '../systems/progress';
import { SETS, LAND_SET, fxText, setBonus } from '../data/sets';
import { vipActive, vipLeftMs as vipLeft2 } from '../systems/premium';
import { ACHS, CODEX, achProgress, titlesOf, titleOf, pstats } from '../data/achievements';
import { MARKET_FEE, MAX_LISTINGS, LISTING_HOURS, feeOf, suggestPrice, myListings, sampleListings } from '../systems/market';
import { DIAMOND_PACKS, VIP_CARDS, VIP_PERKS, DIAMOND_SHOP, FX_COLOR, diamonds, vipLeftMs, vipGiftReady } from '../systems/premium';
import { stageFood } from '../systems/supplies';
import { lang, setLang } from '../core/i18n';
import { uiOpt, setUiOpt, cycle, UI_SCALES, BTN_SCALES, ALPHAS } from '../core/uiOptions';
import { sfx, audioState } from '../audio/sfx';
import { buildGuild, buildStash, buildTrophy, type GuildTab, type GuildHost } from './guildPanels';
import type { DefenseId } from '../data/guild';

type PanelId = 'wardrobe' | 'bag' | 'stats' | 'quest' | 'menu' | 'shop' | 'smith' | 'dialog' | 'plot' | 'job' | 'forms' | 'uiopt' | 'stages' | 'premium' | 'market' | 'alchemy' | 'rooms' | 'login' | 'collection' | 'dungeon' | 'profile' | 'guild' | 'stash' | 'trophy';

const NPC_INFO: Record<string, { name: string; tex: string }> = {
  elder: { name: 'ผู้เฒ่าอัลดริค', tex: 'npc_elder' },
  merchant: { name: 'พ่อค้ามิร่า', tex: 'npc_merchant' },
  smith: { name: 'ช่างตีเหล็กบรอม', tex: 'npc_smith' },
};

export class Panels implements GuildHost {
  cur: PanelId | null = null;
  guildTab: GuildTab = 'home'; guildSlot = -1; guildPick: DefenseId | null = null;
  get scene() { return this.ui; }
  c: Phaser.GameObjects.Container | null = null;
  selUid: number | null = null;
  plot = 0;
  shopTab: 'buy' | 'sell' = 'buy';
  shopPage = 0;
  junkRar = 0; junkConfirm = false;
  dialogNpc = '';
  dialogText = '';
  confirmNew = false;

  constructor(private ui: UIScene) {}

  get isOpen() { return this.cur !== null; }
  /** item icon fitted inside a slot of `box` px (keeps a margin so it sits inside the frame) */
  ico(x: number, y: number, key: string, box: number) {
    const im = this.ui.add.image(x, y, key);
    const f = (box * 0.66) / Math.max(im.width, im.height); im.setScale(f);
    return im;
  }
  get k() { return this.ui.kit; }

  open(id: PanelId) {
    if (this.cur) sfx.page(); else sfx.open();
    this.cur = id;
    this.selUid = null;
    this.confirmNew = false;
    this.ui.controlsReset();
    this.rebuild();
  }

  close() {
    if (this.cur) { saveGame(S()); sfx.close(); }
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
      case 'uiopt': this.buildUiOpt(c); break;
      case 'stages': this.buildStages(c); break;
      case 'premium': this.buildPremium(c); break;
      case 'market': this.buildMarket(c); break;
      case 'alchemy': this.buildAlchemy(c); break;
      case 'rooms': this.buildRooms(c); break;
      case 'login': this.buildLogin(c); break;
      case 'collection': this.buildCollection(c); break;
      case 'dungeon': this.buildDungeon(c); break;
      case 'profile': this.buildProfile(c); break;
      case 'guild': buildGuild(this, c); break;
      case 'stash': buildStash(this, c); break;
      case 'trophy': buildTrophy(this, c); break;
    }
  }

  /** Standard window, returns content origin. */
  window(c: Phaser.GameObjects.Container, w: number, h: number, title: string) {
    const ui = this.ui;
    const x = Math.round(ui.VW / 2 - w / 2), y = Math.max(10, Math.round(180 - h / 2));   // never above the screen top
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
        c.add(this.ico(sx + 14, sy + 14, `icon_${itemDef(it.id).icon}`, 28));
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
        c.add(this.ico(cx + cs / 2, cy + cs / 2, `icon_${def.icon}`, cs));
        if (it.qty > 1) c.add(k.text(cx + cs - 2, cy + cs - 1, String(it.qty), 7.5, '#ffffff').setOrigin(1, 1));
        if (it.upg) c.add(k.text(cx + cs - 2, cy + 1, '+' + it.upg, 7, '#9fffb0').setOrigin(1, 0));
        if (isEquipped(s, it.uid)) c.add(k.text(cx + 2, cy + 1, 'E', 7, '#ffd84a'));
        if (it.set) c.add(k.text(cx + cs - 2, cy + cs - 10, '◆', 7, '#' + SETS[it.set].col.toString(16).padStart(6, '0')).setOrigin(1, 0));
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
    c.add(this.ico(x + 21, y + 21, `icon_${def.icon}`, 30));
    c.add(k.text(x + 42, y + 6, def.name + (it.upg ? ` +${it.upg}` : ''), 9.5, rcol, { wordWrap: { width: w - 46 } }));
    const CLS_TH: Record<string, string> = { sword: '⚔ สายดาบ', archer: '🏹 สายธนู', mage: '✦ สายเวท', cleric: '✚ สายนักบวช' };
    const offCls = !!def.cls && !!s.cls && s.cls !== 'novice' && def.cls !== s.cls;
    c.add(k.text(x + 42, y + 24, (isGear(def) ? `★ ${RARITY_NAMES[rr]}` : RARITY_NAMES[def.rarity]) + (def.cls ? `  ${CLS_TH[def.cls]}` : isGear(def) ? '  ทุกสาย' : ''), 7.5, rcol));
    const lines = statLines(def, it);
    let info = lines.join('\n');
    if (offCls) info += '\n⚠ ไม่ตรงสาย: ค่าพลังเหลือ 60%';
    const aff = (it.aff ?? []).map(a => '✦ ' + affixText(a as never)).join('\n');
    if (aff) info += '\n' + aff;
    if (it.set) { const st = SETS[it.set], worn = (['weapon', 'armor', 'accessory'] as const).filter(sl => { const u = s.equip[sl]; return u != null && s.inventory.find(q => q.uid === u)?.set === it.set; }).length;
      info += `\n◆ ${st.name} (สวม ${worn}/3)\n  2 ชิ้น: ${fxText(st.b2)}\n  3 ชิ้น: ${fxText(st.b3)}`; }
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
      if (def.type === 'consumable') btn('ใช้', () => {
        const r = act('useItem', { uid: it.uid }); if (!r) return; sfx.potion();
        bus.emit(EV.TOAST, r.recall ? 'วาร์ปกลับหมู่บ้าน...' : r.buff ? `${r.buff} ทำงานแล้ว` : r.food ? `อาหารในคลัง +${r.food}` : `ฟื้นฟู ${r.heal ? 'HP +' + r.heal : 'MP +' + r.mana}`, '#9fffb0');
        if (!s.inventory.find(i => i.uid === it.uid)) this.selUid = null; saveGame(s); bus.emit(EV.STATE_CHANGED);
        if (r.recall) { this.close(); bus.emit('td:recall'); } else this.rebuild();
      }, 0x1f4a2a);
      if (def.type === 'weapon' || def.type === 'armor' || def.type === 'accessory') {
        if (isEquipped(s, it.uid)) btn('ถอดออก', () => { act('unequip', { uid: it.uid }); bus.emit(EV.STATE_CHANGED); });
        else {
          btn('สวมใส่', () => { act('equip', { uid: it.uid }); sfx.equip(); bus.emit(EV.TOAST, `สวมใส่ ${def.name}`, '#ffe7a0'); bus.emit(EV.STATE_CHANGED); }, 0x1f3a5a);
          btn('ย่อยเป็นวัตถุดิบ', () => { const r = act('dismantle', { uid: it.uid }); if (r) { sfx.upgradeOk(); bus.emit(EV.TOAST, `ได้ผลึกมานา x${r.shards}${r.cores ? ` แก่นโบราณ x${r.cores}` : ''}`, '#c89aff'); this.selUid = null; bus.emit(EV.STATE_CHANGED); } }, 0x4a2a5a);
        }
      }
    } else if (mode === 'sell') {
      const price = sellPrice(it), eq = isEquipped(s, it.uid);
      const sell = (n: number) => {
        const name = def.name, got = act('sell', { uid: it.uid, qty: n });
        if (!got) { sfx.error(); return; }
        sfx.coin(); bus.emit(EV.TOAST, `ขาย ${name} x${n} ได้ ${got.toLocaleString()} G`, '#ffd84a');
        if (!s.inventory.find(i => i.uid === it.uid)) this.selUid = null;
        refreshCollect(s); saveGame(s); bus.emit(EV.STATE_CHANGED); this.rebuild();
      };
      if (it.qty > 1) {
        btn(`ขายทั้งหมด x${it.qty}  (+${(price * it.qty).toLocaleString()} G)`, () => sell(it.qty), 0x6a4a10, eq);
        if (it.qty > 10) btn(`ขาย 10 ชิ้น  (+${(price * 10).toLocaleString()} G)`, () => sell(10), 0x5a3a10, eq);
        btn(`ขาย 1 ชิ้น  (+${price.toLocaleString()} G)`, () => sell(1), 0x5a3a10, eq);
      } else btn(`ขาย  (+${price.toLocaleString()} G)`, () => sell(1), 0x6a4a10, eq);
      c.add(k.text(x + 6, by + 4, eq ? '⚠ ใส่อยู่ — ถอดก่อนจึงจะขายได้' : `ราคาขายชิ้นละ ${price.toLocaleString()} G • มี ${it.qty} ชิ้น`, 7.5, eq ? '#ff9a8a' : '#ffe7a0'));
    } else if (mode === 'smith') {
      if (def.type === 'weapon' || def.type === 'armor' || def.type === 'accessory') {
        if (it.upg >= MAX_UPGRADE) btn('ระดับสูงสุดแล้ว', () => undefined, undefined, true);
        else {
          const cost = upgradeCost(it.upg, def);
          // success chances are never shown to players (director: rates stay behind the scenes)
          c.add(k.text(x + 6, y + h - 74, `ค่าใช้จ่าย: ${cost.gold} G\nผลึกมานา: ${cost.shards} (มี ${countItem(s, 'mana_shard')})\n${it.upg >= 6 ? '⚠ ยิ่งบวกสูงยิ่งเสี่ยง' : ''}`, 8, '#ffe7a0', { lineSpacing: 2 }));
          btn(`ตีบวก → +${it.upg + 1}`, () => this.doUpgrade(it.uid), 0x6a3a10);
        }
      }
    }
  }

  doUpgrade(uid: number) {
    const s = S();
    const r = act('upgradeItem', { uid });
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
      ['🍀 โชค', '+' + Math.round(d.mf)], ['EXP', '+' + Math.round((d.expBonus - 1) * 100) + '%'],
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
      if (!locked && slv < SKILL_MAX) c.add(k.button(x + W - 50, sy + 2, 30, 20, '+', () => { if (act('upSkill', { id: sk.id })) { sfx.levelUp(); bus.emit(EV.STATE_CHANGED); } }, { size: 11, disabled: s.skillPts < 1, color: 0x1f4a2a }));
      c.add(k.text(rx + 38, sy + 15, `${sk.desc}\nMP ${sk.mp}  คูลดาวน์ ${sk.cooldown / 1000} วิ`, 7.5, '#d8ccb0', { wordWrap: { width: rw - 46 }, lineSpacing: 1 }));
    });
  }

  // ---------------- VILLAGE PLOT ----------------
  openPlot(i: number) { this.plot = i; this.open('plot'); }
  /** the guild window on a tab (and a defense slot picked) */
  openGuild(tab: GuildTab, slot = -1) { this.guildTab = tab; if (slot >= 0) this.guildSlot = slot; this.guildPick = null; this.open('guild'); }

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
          if (act('build', { plot: this.plot, id })) { sfx.levelUp(); bus.emit(EV.TOAST, `เริ่มก่อสร้าง${d.name}!`, '#9fffb0'); bus.emit(EV.STATE_CHANGED); this.close(); }
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
        if (act('upgradeBuilding', { plot: this.plot })) { sfx.levelUp(); bus.emit(EV.TOAST, `เริ่มอัปเกรด ${d.name} → Lv ${b.level}`, '#9fffb0'); bus.emit(EV.STATE_CHANGED); this.close(); }
        else { sfx.error(); bus.emit(EV.TOAST, 'วัตถุดิบไม่พอ — ไปเก็บที่ 🌿 ป่าดงดิบ', '#ff8a8a'); }
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
          const res = act('craft', { slot });
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
      c.add(k.button(rx + rw - 96, top + 2, 88, 20, '⚗ ปรุงยาจากแร่', () => this.open('alchemy'), { size: 8.5, color: 0x4a1a6a }));
      (Object.keys(MEALS) as MealId[]).forEach((m, i) => {
        const md = MEALS[m], yy = top + 26 + i * 72, lockd = b.level < md.minLv;
        g.fillStyle(0x2a1d12, 0.9).fillRoundedRect(rx + 6, yy, rw - 12, 66, 3);
        c.add(k.text(rx + 12, yy + 4, md.name + (lockd ? `  🔒 ครัว Lv${md.minLv}` : ''), 10, lockd ? '#8a7a60' : '#ffd84a'));
        c.add(k.text(rx + 12, yy + 22, `${md.desc} +${p.pct}% นาน ${p.mins} นาที`, 8, '#e8dcc0', { wordWrap: { width: rw - 110 } }));
        c.add(k.button(rx + rw - 90, yy + 20, 78, 26, 'ทำ', () => {
          const r = act('cook', { meal: m });
          if (r === 'ok') { sfx.heal(); bus.emit(EV.TOAST, `กิน${md.name}! +${p.pct}%`, '#9fffb0'); bus.emit(EV.STATE_CHANGED); this.rebuild(); }
          else { sfx.error(); bus.emit(EV.TOAST, r === 'no_food' ? 'อาหารไม่พอ — ล่าสัตว์ใน 🌿 ป่าดงดิบ' : 'ยังทำไม่ได้', '#ff8a8a'); }
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
      const wasVillager = (s.tier ?? 0) === 0;
      const ar = act('advanceClass', { cls });
      if (ar.ok) {
        // a starter weapon for the new class line (given by the server; the NPC shop no longer sells gear)
        if (wasVillager && ar.weapon) bus.emit(EV.TOAST, `ได้รับอาวุธเริ่มต้น: ${itemDef(ar.weapon).name}`, '#9fffb0');
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
      ['gather', '⛏ ชุดหาทรัพยากร', 'ชุดชาวบ้าน ใช้ใน 🌿 ป่าดงดิบ\nตัดไม้ ขุดแร่ ล่าสัตว์'],
    ];
    const cw = (W - 38) / 2;
    opts.forEach(([id, t, d], i) => {
      const cx = x + 14 + i * (cw + 10), on = s.outfit === id;
      g.fillStyle(on ? 0x3a2a10 : 0x2a1d12, 0.95).fillRoundedRect(cx, top + 16, cw, 74, 4).lineStyle(on ? 2 : 1, on ? GOLD : GOLD_D, 1).strokeRoundedRect(cx, top + 16, cw, 74, 4);
      c.add(k.text(cx + 10, top + 22, t + (on ? '  ✔' : ''), 11, on ? '#ffd84a' : '#f3e6c4'));
      c.add(k.text(cx + 10, top + 42, d, 8, '#d8ccb0', { lineSpacing: 2 }));
      const z = ui.add.zone(cx, top + 16, cw, 74).setOrigin(0).setInteractive();
      z.on('pointerup', () => { s.outfit = id; sfx.cloth(); bus.emit(EV.STATE_CHANGED); this.rebuild(); });
      c.add(z);
    });
    c.add(k.text(x + 16, top + 102, 'เลือกร่างที่จะสวม (แต่ละร่างมีสกิลของตัวเอง)', 10, '#ffe7a0'));
    const tiers = s.cls === 'novice' ? [0] : Array.from({ length: s.tier }, (_, i) => i + 1);
    const bw = Math.min(150, (W - 28 - (tiers.length - 1) * 8) / Math.max(1, tiers.length));
    tiers.forEach((t, i) => {
      const bx = x + 14 + i * (bw + 8), by = top + 120, on = activeTier(s) === t;
      g.fillStyle(on ? 0x3a2a10 : 0x2a1d12, 0.95).fillRoundedRect(bx, by, bw, 128, 4).lineStyle(on ? 2 : 1, on ? GOLD : GOLD_D, 1).strokeRoundedRect(bx, by, bw, 128, 4);
      const pk = `c_${formKeyOf(s.cls, t)}_idle`;
      if (ui.textures.exists(pk)) { const im = ui.add.image(bx + bw / 2, by + 44, pk, 0); im.setScale(70 / Math.max(im.width, im.height)); c.add(im); }
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
    // two columns so the window fits short phone screens (the close button must stay visible)
    const W = Math.min(520, ui.VW - 16), H = 250, colW = (W - 46) / 2;
    const { x, y } = this.window(c, W, H, 'เมนู');
    let n = 0;
    const b = (label: string, cb: () => void, color?: number) => { const col = n % 2, row = Math.floor(n / 2); c.add(k.button(x + 16 + col * (colW + 14), y + 34 + row * 26, colW, 22, label, cb, { size: 8.5, color })); n++; };
    b(`📅 ล็อกอินรายวัน${loginInfo(s).ready ? ' (รับได้!)' : ''}`, () => this.open('login'), 0x4a3a10);
    b('🏛 กิลด์ & หมู่บ้านกิลด์', () => this.openGuild('home'), 0x4a3a10);
    b(`🏆 สะสม & ฉายา${ACHS.some(a => !titlesOf(s).includes(a.id) && achProgress(s, a) >= a.need) ? ' (รับได้!)' : ''}`, () => this.open('collection'), 0x4a3a10);
    b('💾 บันทึกเกม', () => { const ok = saveGame(s); bus.emit(EV.TOAST, ok ? 'บันทึกเกมแล้ว' : 'บันทึกไม่สำเร็จ', ok ? '#9fffb0' : '#ff8a8a'); this.close(); }, 0x1f4a2a);
    b('📂 โหลดเกมล่าสุด', () => {
      const st = loadGame();
      if (!st) { bus.emit(EV.TOAST, 'ไม่พบเซฟ', '#ff8a8a'); return; }
      runtime.state = st;
      this.close();
      ui.reloadWorld();
    });
    b(`🔊 เสียงเอฟเฟกต์: ${s.sfx ? 'เปิด' : 'ปิด'}`, () => { s.sfx = !s.sfx; audioState.sfx = s.sfx; this.rebuild(); });
    b('⛶ เต็มจอ', () => { this.close(); ui.toggleFullscreen(); });
    b('🖥 ปรับ UI (ขนาด / ปุ่ม / ความโปร่ง)', () => this.open('uiopt'), 0x2a4a5a);
    b(lang() === 'en' ? '🌐 ภาษาไทย' : '🌐 Language: English', () => { saveGame(s); setLang(lang() === 'en' ? 'th' : 'en'); location.reload(); }, 0x2a4a5a);
    b('🧪 ทดสอบ: สลับร่างตัวละคร', () => this.open('forms'), 0x2a3a5a);
    b('🧪 ทดสอบ: ชุด SL + ทรัพยากร + ปลดล็อก 50 ด่าน', () => { const got = act('dev', { op: 'kit' }); if (refused(got)) { sfx.error(); bus.emit(EV.TOAST, 'ปิดปุ่มทดสอบแล้ว', '#ff8a8a'); return; } sfx.levelUp(); bus.emit(EV.TOAST, `ได้รับ SL: ${got.got.join(', ')} • ทอง/ไม้/หิน/วัตถุดิบ • ปลดล็อกครบ 50 ด่าน`, '#ff4a5a'); saveGame(s); bus.emit(EV.STATE_CHANGED); this.rebuild(); }, 0x5a1a2a);
    b('🧪 ทดสอบ: VIP 3 วัน + 💎1000', () => { if (refused(act('dev', { op: 'vip', n: 3 }))) return; act('dev', { op: 'diamonds', n: 1000 }); sfx.levelUp(); bus.emit(EV.TOAST, 'ได้ VIP 3 วัน + เพชร 1000 (ทดสอบ)', '#ffd84a'); saveGame(s); bus.emit(EV.STATE_CHANGED); this.rebuild(); }, 0x5a3a1a);
    b(`🧪 ทดสอบ: เลเวล +10 (ตอนนี้ Lv${s.level})`, () => { if (refused(act('dev', { op: 'level', n: 10 }))) return; clampVitals(s); sfx.levelUp(); bus.emit(EV.TOAST, `เลเวล ${s.level}`, '#ffd84a'); saveGame(s); bus.emit(EV.STATE_CHANGED); this.rebuild(); }, 0x5a3a1a);
    if (!this.confirmNew) b('🆕 เริ่มเกมใหม่', () => { this.confirmNew = true; this.rebuild(); }, 0x5a1a1a);
    else b('⚠ ยืนยัน! ลบเซฟและเริ่มใหม่', () => { deleteSave(); location.reload(); }, 0x8a1a1a);
    c.add(k.text(x + W / 2, y + H - 16, `เวลาเล่น ${Math.floor(s.playTime / 60)} นาที  •  v0.3`, 7.5, '#8a7a60').setOrigin(0.5));
  }

  // ---------------- 💎 PREMIUM: top-up / VIP / diamond shop ----------------
  premTab: 'topup' | 'vip' | 'shop' = 'vip';
  buildPremium(c: Phaser.GameObjects.Container) {
    const s = S(), ui = this.ui, k = this.k;
    const W = Math.min(620, ui.VW - 16), H = 330;
    const { x, y, g } = this.window(c, W, H, '💎 ร้านพรีเมียม');
    const tabs: [typeof this.premTab, string][] = [['vip', '👑 บัตร VIP'], ['shop', '💎 ร้านเพชร'], ['topup', '💳 เติมเพชร']];
    tabs.forEach(([id, label], i) => c.add(k.button(x + 14 + i * 104, y + 30, 98, 22, label, () => { this.premTab = id; this.rebuild(); }, { size: 9, color: this.premTab === id ? 0x6a4a10 : 0x2a1d12 })));
    c.add(k.text(x + W - 16, y + 34, `💎 ${diamonds(s).toLocaleString()}`, 11, '#8fe8ff').setOrigin(1, 0));
    const top = y + 60, notice = '🔒 ซื้อด้วยเงินจริงได้เมื่อระบบออนไลน์ + ชำระเงินเปิด (ตอนนี้แสดงตัวอย่างร้าน)';
    if (this.premTab === 'vip') {
      const left = vipLeftMs(s), on = left > 0;
      g.fillStyle(on ? 0x3a2a08 : 0x1a140e, 0.9).fillRoundedRect(x + 14, top, 236, H - 76, 5).lineStyle(1.5, on ? 0xffd84a : 0x6a5a40, 1).strokeRoundedRect(x + 14, top, 236, H - 76, 5);
      c.add(k.text(x + 24, top + 8, on ? `👑 VIP เหลือ ${Math.floor(left / 86400000)} วัน ${Math.floor(left / 3600000) % 24} ชม.` : '👑 สิทธิ์ VIP', 10, '#ffd84a'));
      c.add(k.text(x + 24, top + 28, VIP_PERKS.map(p => '✔ ' + p).join('\n'), 7.8, '#f3e6c4', { lineSpacing: 3, wordWrap: { width: 220 } }));
      if (on) c.add(k.button(x + 24, top + H - 110, 216, 24, vipGiftReady(s) ? '🎁 รับของขวัญ VIP วันนี้' : '🎁 รับแล้ววันนี้', () => { if (act('vipGift', {})) { sfx.levelUp(); bus.emit(EV.TOAST, 'ได้รับ ม้วนกลับหมู่บ้าน x3 + ยาฟื้นพลังใหญ่ x5', '#ffd84a'); saveGame(s); bus.emit(EV.STATE_CHANGED); this.rebuild(); } }, { size: 9, color: 0x6a4a10, disabled: !vipGiftReady(s) }));
      const cx0 = x + 262, cw = (W - 276 - 12) / 3;
      VIP_CARDS.forEach((v, i) => {
        const cx = cx0 + i * (cw + 6), per = (v.thb / v.days).toFixed(1);
        g.fillStyle(0x2a1d12, 0.95).fillRoundedRect(cx, top, cw, 150, 6).lineStyle(2, [0xc0a060, 0xffd84a, 0xff8a3a][i], 1).strokeRoundedRect(cx, top, cw, 150, 6);
        c.add(k.text(cx + cw / 2, top + 10, `VIP ${v.days} วัน`, 12, '#ffd84a').setOrigin(0.5, 0));
        c.add(k.text(cx + cw / 2, top + 36, '👑', 26).setOrigin(0.5, 0));
        c.add(k.text(cx + cw / 2, top + 78, `฿${v.thb}`, 16, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5, 0));
        c.add(k.text(cx + cw / 2, top + 100, `ตกวันละ ฿${per}`, 7.5, i ? '#9fffb0' : '#c8b898').setOrigin(0.5, 0));
        if (i) c.add(k.text(cx + cw / 2, top + 112, `ประหยัด ${Math.round((1 - v.thb / v.days / (VIP_CARDS[0].thb / 3)) * 100)}%`, 7.5, '#ffb070').setOrigin(0.5, 0));
        c.add(k.button(cx + 6, top + 124, cw - 12, 20, 'ซื้อ', () => bus.emit(EV.TOAST, notice, '#ffd84a'), { size: 9, color: 0x1f4a2a }));
      });
      c.add(k.text(cx0, top + 160, 'บัตรใหม่ต่อเวลาจากที่เหลือได้ • ไม่ขายของแรงหรือเพิ่มโอกาสดรอปของแรร์ (ไม่ pay to win)', 7.5, '#c8b898', { wordWrap: { width: W - 276 } }));
      c.add(k.text(cx0, top + 196, notice, 7.5, '#ff9a6a', { wordWrap: { width: W - 276 } }));
    } else if (this.premTab === 'topup') {
      const cw = (W - 28 - 4 * 6) / 5;
      DIAMOND_PACKS.forEach((p, i) => {
        const cx = x + 14 + i * (cw + 6);
        g.fillStyle(0x16222a, 0.95).fillRoundedRect(cx, top, cw, 170, 6).lineStyle(1.5, 0x5ac8e8, 1).strokeRoundedRect(cx, top, cw, 170, 6);
        c.add(k.text(cx + cw / 2, top + 14, '💎'.repeat(Math.min(3, i + 1)), 14).setOrigin(0.5, 0));
        c.add(k.text(cx + cw / 2, top + 50, p.diamonds.toLocaleString(), 15, '#8fe8ff', { fontStyle: 'bold' }).setOrigin(0.5, 0));
        if (p.bonus) c.add(k.text(cx + cw / 2, top + 72, `+${p.bonus} โบนัส`, 8, '#9fffb0').setOrigin(0.5, 0));
        c.add(k.text(cx + cw / 2, top + 100, `฿${p.thb.toLocaleString()}`, 13, '#ffffff').setOrigin(0.5, 0));
        c.add(k.button(cx + 6, top + 138, cw - 12, 22, 'เติม', () => bus.emit(EV.TOAST, notice, '#ffd84a'), { size: 9, color: 0x1f4a5a }));
      });
      c.add(k.text(x + 14, top + 184, 'เพชรได้จากการเติมเงินจริงเท่านั้น • เติมครั้งแรกได้เพชร x2 • ใช้ซื้อของในร้านเพชร (ความสะดวก / ความสวย)', 8, '#c8b898', { wordWrap: { width: W - 28 } }));
      c.add(k.text(x + 14, top + 214, notice, 8, '#ff9a6a', { wordWrap: { width: W - 28 } }));
    } else {
      const cols = 3, cw = (W - 28 - (cols - 1) * 6) / cols, ch = 56;
      const pageN = Math.ceil(DIAMOND_SHOP.length / 12); this.premPage = Math.min(this.premPage, pageN - 1);
      DIAMOND_SHOP.slice(this.premPage * 12, this.premPage * 12 + 12).forEach((it, i) => {
        const cx = x + 14 + (i % cols) * (cw + 6), cy = top + Math.floor(i / cols) * (ch + 4);
        const owned = it.id.startsWith('fx_') && ((s as unknown as { fxOwned?: string[] }).fxOwned ?? []).includes(it.id), worn = (s as unknown as { fx?: string }).fx === it.id;
        g.fillStyle(it.soon ? 0x15120e : 0x22301f, 0.95).fillRoundedRect(cx, cy, cw, ch, 4).lineStyle(1, worn ? 0xffd84a : 0x5a4a3a, 1).strokeRoundedRect(cx, cy, cw, ch, 4);
        if (it.id.startsWith('fx_')) g.fillStyle(FX_COLOR[it.id], 1).fillCircle(cx + 12, cy + 12, 5);
        c.add(k.text(cx + (it.id.startsWith('fx_') ? 22 : 8), cy + 5, it.name, 8.5, it.soon ? '#8a7a60' : '#ffe7a0', { wordWrap: { width: cw - 30 } }));
        c.add(k.text(cx + 8, cy + 24, it.desc, 6.8, '#c8b898', { wordWrap: { width: cw - 84 } }));
        const label = it.soon ? 'เร็วๆ นี้' : owned ? (worn ? 'ใช้อยู่' : 'ใช้') : `💎 ${it.price}`;
        c.add(k.button(cx + cw - 72, cy + ch - 26, 66, 20, label, () => {
          const r = act('buyDiamond', { id: it.id });
          if (r === 'ok' || r === 'owned') { sfx.coin(); bus.emit(EV.TOAST, r === 'ok' ? `ซื้อ ${it.name} แล้ว` : `ใช้ ${it.name}`, '#9fffb0'); saveGame(s); bus.emit(EV.STATE_CHANGED); }
          else bus.emit(EV.TOAST, r === 'diamonds' ? 'เพชรไม่พอ — เติมได้เมื่อระบบชำระเงินเปิด' : r === 'max' ? 'ขยายครบแล้ว' : 'เร็วๆ นี้', '#ff9a6a');
          this.rebuild();
        }, { size: 8.5, color: it.soon ? 0x2a2420 : 0x1f4a5a, disabled: it.soon || worn }));
      });
    }
  }
  premPage = 0;

  // ---------------- 🏪 PLAYER MARKET ----------------
  mkTab: 'buy' | 'sell' | 'mine' = 'buy'; mkType = 0; mkRar = -1; mkPage = 0; mkPrice = 0; mkSel: string | null = null;
  buildMarket(c: Phaser.GameObjects.Container) {
    const s = S(), ui = this.ui, k = this.k;
    const W = Math.min(620, ui.VW - 16), H = 330;
    const { x, y, g } = this.window(c, W, H, '🏪 ตลาดกลาง');
    const tabs: [typeof this.mkTab, string][] = [['buy', 'ซื้อ'], ['sell', 'ลงขาย'], ['mine', `ของที่ลงขาย (${myListings(s).length}/${MAX_LISTINGS})`]];
    tabs.forEach(([id, label], i) => c.add(k.button(x + 14 + i * 90, y + 30, i === 2 ? 130 : 84, 22, label, () => { this.mkTab = id; this.mkPage = 0; this.selUid = null; this.mkSel = null; this.rebuild(); }, { size: 9, color: this.mkTab === id ? 0x6a4a10 : 0x2a1d12 })));
    c.add(k.text(x + W - 16, y + 34, `💰 ${s.gold.toLocaleString()}`, 10, '#ffd84a').setOrigin(1, 0));
    const top = y + 60;
    const rcol = (r: number) => '#' + RARITY_COLORS[r].toString(16).padStart(6, '0');
    const fakeInv = (it: Omit<InvItem, 'uid'>) => ({ ...it, uid: -1 }) as InvItem;
    if (this.mkTab === 'buy') {
      const TYPES: [string, (t: string) => boolean][] = [['ทั้งหมด', () => true], ['อาวุธ', t => t === 'weapon'], ['เกราะ', t => t === 'armor'], ['เครื่องประดับ', t => t === 'accessory'], ['ของใช้/วัตถุดิบ', t => t === 'consumable' || t === 'material']];
      TYPES.forEach(([n], i) => c.add(k.button(x + 14 + i * 74, top, 70, 18, n, () => { this.mkType = i; this.mkPage = 0; this.rebuild(); }, { size: 7.5, color: this.mkType === i ? 0x4a3a10 : 0x1a140e })));
      c.add(k.button(x + 14 + 5 * 74 + 6, top, 104, 18, this.mkRar < 0 ? 'ทุกระดับ' : RARITY_NAMES[this.mkRar] + '+', () => { this.mkRar = this.mkRar >= 5 ? -1 : this.mkRar + 1; this.mkPage = 0; this.rebuild(); }, { size: 7.5 }));
      const list = sampleListings().filter(l => TYPES[this.mkType][1](itemDef(l.item.id).type) && (this.mkRar < 0 || (l.item.rar ?? 0) >= this.mkRar)).sort((a, b) => a.price - b.price);
      const per = 7, pages = Math.max(1, Math.ceil(list.length / per)); this.mkPage = Math.min(this.mkPage, pages - 1);
      list.slice(this.mkPage * per, this.mkPage * per + per).forEach((l, i) => {
        const ry = top + 24 + i * 30, d = itemDef(l.item.id), rr = l.item.rar ?? d.rarity;
        g.fillStyle(this.mkSel === l.id ? 0x3a2a10 : 0x1a140e, 0.9).fillRoundedRect(x + 14, ry, W - 28, 27, 3).lineStyle(1, RARITY_COLORS[rr], 0.5).strokeRoundedRect(x + 14, ry, W - 28, 27, 3);
        c.add(this.ico(x + 28, ry + 13, `icon_${d.icon}`, 26));
        c.add(k.text(x + 44, ry + 3, `${d.name}${l.item.upg ? ' +' + l.item.upg : ''}${l.item.qty > 1 ? ' x' + l.item.qty : ''}`, 8.5, rcol(rr)));
        c.add(k.text(x + 44, ry + 15, [isGear(d) ? RARITY_NAMES[rr] : '', ...statLines(d, fakeInv(l.item)).slice(0, 2), (l.item.aff?.length ? `✦${l.item.aff.length} ค่าพิเศษ` : '')].filter(Boolean).join('  •  '), 6.8, '#c8b898'));
        c.add(k.text(x + W - 200, ry + 8, l.seller, 7.5, '#9ad8ff'));
        c.add(k.text(x + W - 110, ry + 7, `💰 ${l.price.toLocaleString()}`, 9, '#ffd84a').setOrigin(1, 0));
        c.add(k.button(x + W - 98, ry + 3, 78, 21, 'ซื้อ', () => bus.emit(EV.TOAST, 'ตัวอย่างตลาด — ซื้อขายกับผู้เล่นจริงได้เมื่อระบบออนไลน์เปิด', '#ffd84a'), { size: 8.5, color: 0x1f4a2a }));
      });
      c.add(k.button(x + 14, y + H - 30, 30, 18, '◀', () => { this.mkPage = (this.mkPage + pages - 1) % pages; this.rebuild(); }, { size: 8 }));
      c.add(k.text(x + 60, y + H - 27, `${this.mkPage + 1}/${pages}  •  ${list.length} รายการ  •  ตัวอย่างจากผู้เล่นจำลอง`, 7.5, '#c8b898'));
      c.add(k.button(x + 290, y + H - 30, 30, 18, '▶', () => { this.mkPage = (this.mkPage + 1) % pages; this.rebuild(); }, { size: 8 }));
    } else if (this.mkTab === 'sell') {
      const cols = 7, cs = 30;
      const sellable = s.inventory.filter(it => !isEquipped(s, it.uid));
      sellable.slice(0, 35).forEach((it, i) => {
        const d = itemDef(it.id), cx = x + 14 + (i % cols) * (cs + 3), cy = top + Math.floor(i / cols) * (cs + 3);
        k.iconSlot(g, cx, cy, cs, RARITY_COLORS[rarOf(it)], it.uid === this.selUid);
        c.add(this.ico(cx + cs / 2, cy + cs / 2, `icon_${d.icon}`, cs));
        if (it.qty > 1) c.add(k.text(cx + cs - 2, cy + cs - 1, String(it.qty), 7.5, '#ffffff').setOrigin(1, 1));
        const z = ui.add.zone(cx, cy, cs, cs).setOrigin(0).setInteractive();
        z.on('pointerup', () => { sfx.click(); this.selUid = it.uid; this.mkPrice = suggestPrice(it) * it.qty; this.rebuild(); });
        c.add(z);
      });
      const dx = x + 14 + cols * (cs + 3) + 8, dw = x + W - 14 - dx;
      g.fillStyle(0x0a0705, 0.6).fillRoundedRect(dx, top, dw, H - 76, 4);
      const it = s.inventory.find(i => i.uid === this.selUid);
      if (!it) c.add(k.text(dx + dw / 2, top + 100, 'เลือกของที่จะลงขาย\n(ของที่ใส่อยู่ลงขายไม่ได้)', 9, '#8a7a60', { align: 'center' }).setOrigin(0.5));
      else {
        const d = itemDef(it.id), rr = rarOf(it);
        c.add(this.ico(dx + 22, top + 22, `icon_${d.icon}`, 32));
        c.add(k.text(dx + 44, top + 8, `${d.name}${it.upg ? ' +' + it.upg : ''} x${it.qty}`, 9.5, rcol(rr)));
        c.add(k.text(dx + 44, top + 24, isGear(d) ? RARITY_NAMES[rr] : d.desc, 7.5, rcol(rr), { wordWrap: { width: dw - 50 } }));
        const fee = feeOf(this.mkPrice);
        c.add(k.text(dx + dw / 2, top + 62, `ราคาตั้งขาย`, 8, '#c8b898').setOrigin(0.5, 0));
        c.add(k.text(dx + dw / 2, top + 76, `💰 ${this.mkPrice.toLocaleString()}`, 16, '#ffd84a', { fontStyle: 'bold' }).setOrigin(0.5, 0));
        const step = (f: number) => () => { this.mkPrice = Math.max(1, Math.round(this.mkPrice * f)); this.rebuild(); };
        [['-50%', 0.5], ['-10%', 0.9], ['+10%', 1.1], ['x2', 2]].forEach(([l, f], i) => c.add(k.button(dx + 8 + i * ((dw - 16) / 4), top + 104, (dw - 16) / 4 - 4, 20, l as string, step(f as number), { size: 8.5 })));
        c.add(k.text(dx + 10, top + 134, `ราคาแนะนำ ${(suggestPrice(it) * it.qty).toLocaleString()}  •  NPC รับซื้อ ${(sellPrice(it) * it.qty).toLocaleString()}\nภาษีตลาด 8%: -${fee.toLocaleString()}  →  ได้รับ ${(this.mkPrice - fee).toLocaleString()} 💰\nขึ้นขาย ${LISTING_HOURS} ชม. ไม่มีคนซื้อ = คืนของ`, 7.5, '#e8dcc0', { lineSpacing: 3 }));
        c.add(k.button(dx + 8, top + H - 108, dw - 16, 24, `ลงขาย (${myListings(s).length}/${MAX_LISTINGS})`, () => {
          const r = act('marketList', { uid: it.uid, qty: it.qty, price: this.mkPrice });
          if (typeof r === 'string') { sfx.error(); bus.emit(EV.TOAST, { equipped: 'ถอดก่อนจึงจะลงขายได้', missing: 'ไม่พบของ', full: 'ลงขายได้สูงสุด 10 รายการ', price: 'ราคาไม่ถูกต้อง' }[r], '#ff8a6a'); return; }
          sfx.coin(); bus.emit(EV.TOAST, `ลงขาย ${d.name} ราคา ${this.mkPrice.toLocaleString()} 💰 แล้ว`, '#9fffb0'); this.selUid = null; saveGame(s); bus.emit(EV.STATE_CHANGED); this.rebuild();
        }, { size: 9.5, color: 0x1f4a2a }));
      }
    } else {
      const mine = myListings(s);
      if (!mine.length) c.add(k.text(x + W / 2, top + 100, 'ยังไม่มีของที่ลงขาย', 10, '#8a7a60').setOrigin(0.5));
      mine.forEach((l, i) => {
        const ry = top + i * 26, d = itemDef(l.item.id), rr = l.item.rar ?? d.rarity, left = l.until - Date.now();
        g.fillStyle(0x1a140e, 0.9).fillRoundedRect(x + 14, ry, W - 28, 23, 3);
        c.add(this.ico(x + 26, ry + 11, `icon_${d.icon}`, 22));
        c.add(k.text(x + 42, ry + 6, `${d.name}${l.item.upg ? ' +' + l.item.upg : ''}${l.item.qty > 1 ? ' x' + l.item.qty : ''}`, 8.5, rcol(rr)));
        c.add(k.text(x + W - 260, ry + 6, left > 0 ? `เหลือ ${Math.floor(left / 3600000)} ชม. • รอผู้ซื้อ (เมื่อออนไลน์)` : 'หมดเวลา', 7.5, '#c8b898'));
        c.add(k.text(x + W - 100, ry + 5, `💰 ${l.price.toLocaleString()}`, 9, '#ffd84a').setOrigin(1, 0));
        c.add(k.button(x + W - 90, ry + 2, 70, 19, 'ยกเลิก', () => { if (act('marketCancel', { id: l.id })) { bus.emit(EV.TOAST, 'คืนของเข้ากระเป๋าแล้ว', '#9fffb0'); saveGame(s); bus.emit(EV.STATE_CHANGED); } else bus.emit(EV.TOAST, 'กระเป๋าเต็ม', '#ff8a6a'); this.rebuild(); }, { size: 8, color: 0x5a1a1a }));
      });
    }
  }

  // ---------------- STAGE SELECT ----------------
  land = -1;
  buildStages(c: Phaser.GameObjects.Container) {
    const s = S(), ui = this.ui, k = this.k;
    // maps unlock by hero level; the 'recommended' map is the highest one the hero can enter
    const all = !!(s as unknown as { tdUnlockAll?: boolean }).tdUnlockAll;
    const canEnter = (st: (typeof STAGES)[number]) => all || s.level >= st.req;
    const best = [...STAGES].reverse().find(canEnter)?.n ?? 1;
    const bossDone = (s as unknown as { tdCleared?: number }).tdCleared ?? 0;
    if (this.land < 0) this.land = Math.floor((best - 1) / 10);
    const W = Math.min(620, ui.VW - 16), H = 336;
    const { x, y, g } = this.window(c, W, H, 'เลือกแผนที่');
    { const di = act('dungeonInfo', {}); c.add(k.button(x + 14, y + 4, 140, 20, `⚔ ดันเจี้ยนรายวัน ${di.max - di.used}/${di.max}`, () => this.open('dungeon'), { size: 8.5, color: 0x6a2a10 })); }
    const COL = [0x2e5a3a, 0x4a3a6a, 0x7a3a1a, 0x3a5a7a, 0x3a3a40], HI = ['#9fe0a0', '#c8a8ff', '#ffb080', '#a8d8ff', '#c8c8d0'];
    // previews of this land's monsters and boss (idle sheets load on demand)
    const L = LANDS[this.land];
    if (loadIdle(ui, [...L.mobs.map(m => m.key), L.boss.key], () => { if (this.cur === 'stages') this.rebuild(); })) { /* rebuilt when loaded */ }
    // land tabs
    const tx = x + 12, tw = 118, th = 46, ty0 = y + 34;
    LANDS.forEach((ld, i) => {
      const first = STAGES[i * 10], open = canEnter(first), ty = ty0 + i * (th + 6), sel = i === this.land;
      g.fillStyle(open ? COL[i] : 0x1a1612, sel ? 1 : 0.55).fillRoundedRect(tx, ty, tw, th, 5);
      g.lineStyle(sel ? 2 : 1, sel ? 0xffd84a : 0x5a4a3a, 1).strokeRoundedRect(tx, ty, tw, th, 5);
      c.add(k.text(tx + 8, ty + 6, ld.name, 9.5, open ? '#ffffff' : '#6a6050'));
      c.add(k.text(tx + 8, ty + 24, open ? `มอน Lv${first.level}-${STAGES[i * 10 + 9].level}` : `🔒 Lv${first.req}`, 8, open ? HI[i] : '#6a6050'));
      c.add(k.text(tx + tw - 6, ty + 6, '💰🎁', 8).setOrigin(1, 0));
      const z = ui.add.zone(tx, ty, tw, th).setOrigin(0).setInteractive();
      z.on('pointerup', () => { sfx.click(); this.land = i; this.rebuild(); });
      c.add(z);
    });
    // the Deepwild: one big shared gathering map (no monsters)
    {
      const wy = ty0 + LANDS.length * (th + 6), wh = y + H - 10 - wy;
      g.fillStyle(0x1f5a2a, 1).fillRoundedRect(tx, wy, tw, wh, 5).lineStyle(2, 0x9fe0a0, 1).strokeRoundedRect(tx, wy, tw, wh, 5);
      c.add(k.text(tx + 6, wy + 3, '🌿 ป่าดงดิบ', 9.5, '#ffffff'));
      c.add(k.text(tx + tw - 5, wy + 4, '⛏🍖💰', 8).setOrigin(1, 0));
      const z = ui.add.zone(tx, wy, tw, wh).setOrigin(0).setInteractive();
      z.on('pointerup', () => { sfx.click(); this.open('rooms'); });
      c.add(z);
    }
    // stage cards
    const gx = tx + tw + 12, gw = x + W - 14 - gx, cols = 5, cw = (gw - (cols - 1) * 6) / cols, ch = 92;
    STAGES.slice(this.land * 10, this.land * 10 + 10).forEach((st, i) => {
      const cx = gx + (i % cols) * (cw + 6), cy = y + 34 + Math.floor(i / cols) * (ch + 6);
      const open = canEnter(st), food = stageFood(st.n);
      g.fillStyle(open ? (st.boss ? 0x4a1a14 : 0x22301f) : 0x15120e, 0.95).fillRoundedRect(cx, cy, cw, ch, 5);
      g.lineStyle(st.boss ? 2 : 1, !open ? 0x3a3228 : st.boss ? 0xff6a3a : st.n === best ? 0xffd84a : COL[this.land] + 0x303030, 1).strokeRoundedRect(cx, cy, cw, ch, 5);
      if (st.boss && ui.textures.exists(`c_${L.boss.key}_idle`)) {
        const im = ui.add.image(cx + cw / 2, cy + ch - 18, `c_${L.boss.key}_idle`, 0).setOrigin(0.5, 1); im.setScale(52 / im.height); if (!open) im.setTint(0x202020); c.add(im);
      }
      c.add(k.text(cx + 6, cy + 4, String(st.n), st.boss ? 16 : 18, open ? '#ffffff' : '#5a5040', { fontStyle: 'bold' }));
      if (st.boss) c.add(k.text(cx + cw - 6, cy + 6, '👑', 11).setOrigin(1, 0));
      if (!st.boss) c.add(k.text(cx + cw / 2, cy + 40, open ? (st.n === best ? '▶' : '') : `🔒\nLv${st.req}`, open ? 18 : 9, '#ffd84a', { align: 'center' }).setOrigin(0.5));
      else if (st.n <= bossDone) c.add(k.text(cx + cw - 6, cy + 24, '✔', 10, '#9fffb0').setOrigin(1, 0));
      if (st.boss && !open) c.add(k.text(cx + cw / 2, cy + 40, `🔒 Lv${st.req}`, 9, '#ffd84a').setOrigin(0.5));
      c.add(k.text(cx + 6, cy + ch - 28, `Lv${st.level}`, 8.5, open ? '#e8dcc0' : '#5a5040'));
      c.add(k.text(cx + 6, cy + ch - 15, food ? `🍖${food}` : 'ฟรี', 8, open ? (s.res.food >= food ? '#ffd8a0' : '#ff8a6a') : '#5a5040'));
      if (open) {
        const z = ui.add.zone(cx, cy, cw, ch).setOrigin(0).setInteractive();
        z.on('pointerup', () => { sfx.click(); this.close(); (ui as unknown as { enterStage?: (n: number) => void }).enterStage?.(st.n); });
        c.add(z);
      }
    });
    // who lives here
    const my = y + 34 + 2 * (ch + 6) + 4;
    g.fillStyle(0x0a0705, 0.6).fillRoundedRect(gx, my, gw, y + H - 12 - my, 4);
    c.add(k.text(gx + 8, my + 6, 'มอนในดินแดนนี้', 8.5, HI[this.land]));
    c.add(k.text(gx + gw - 8, my + 6, '🌿 ป่าดงดิบ = แมพรวมทั้งเซิร์ฟ ไม่มีมอน ขุดแร่/ล่าสัตว์/ตัดไม้', 7.5, '#9fe0a0').setOrigin(1, 0));
    L.mobs.forEach((m, i) => {
      const key = `c_${m.key}_idle`; if (!ui.textures.exists(key)) return;
      const im = ui.add.image(gx + 30 + i * 52, y + H - 16, key, 0).setOrigin(0.5, 1); im.setScale(Math.min(40 / im.height, 1.2)); c.add(im);
    });
  }

  // ---------------- PROFILE (tap the portrait) ----------------
  buildProfile(c: Phaser.GameObjects.Container) {
    const s = S(), ui = this.ui, k = this.k, d = derive(s), ps = pstats(s);
    const W = Math.min(640, ui.VW - 12), H = 340;
    const { x, y, g } = this.window(c, W, H, '👤 โปรไฟล์');
    const t = s.tier ?? 0, key = formKeyOf(s.cls, t), sx = x + 14, sy = y + 32, cw = 190;
    // left: the hero
    g.fillStyle(0x0a0705, 0.6).fillRoundedRect(sx, sy, cw, H - 44, 5);
    if (ui.textures.exists(`c_${key}_idle`)) { const im = ui.add.image(sx + cw / 2, sy + 116, `c_${key}_idle`, 0).setOrigin(0.5, 1); im.setScale(104 / im.height); c.add(im); }
    const title = titleOf(s);
    c.add(k.text(sx + cw / 2, sy + 6, s.name || 'ผู้กล้า', 12, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5, 0));
    if (title) c.add(k.text(sx + cw / 2, sy + 22, `「${title}」`, 8.5, '#ffd84a').setOrigin(0.5, 0));
    const cls = s.cls && s.cls !== 'novice' ? ({ sword: '⚔ สายดาบ', archer: '🏹 สายธนู', mage: '✦ สายเวท', cleric: '✚ สายนักบวช' } as Record<string, string>)[s.cls] : 'ชาวบ้าน (ยังไม่เลือกสาย)';
    c.add(k.text(sx + cw / 2, sy + 122, `${formName(s.cls, t)} • ร่างที่ ${t + 1}`, 10, '#ffe7a0').setOrigin(0.5, 0));
    c.add(k.text(sx + cw / 2, sy + 138, cls, 8.5, '#c8b898').setOrigin(0.5, 0));
    c.add(k.text(sx + cw / 2, sy + 156, `Lv ${s.level}`, 16, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5, 0));
    const need = expToNext(s.level), f = Math.min(1, s.exp / need);
    g.fillStyle(0x1a120c, 1).fillRoundedRect(sx + 12, sy + 180, cw - 24, 8, 3).fillStyle(0x8a6aff, 1).fillRoundedRect(sx + 12, sy + 180, (cw - 24) * f, 8, 3);
    c.add(k.text(sx + cw / 2, sy + 190, `EXP ${Math.floor(f * 1000) / 10}%`, 7.5, '#c8b8ff').setOrigin(0.5, 0));
    g.fillStyle(0x2a1d12, 1).fillRoundedRect(sx + 12, sy + 206, cw - 24, 30, 4).lineStyle(1, GOLD, 1).strokeRoundedRect(sx + 12, sy + 206, cw - 24, 30, 4);
    c.add(k.text(sx + cw / 2, sy + 212, `พลังรบ ${d.power.toLocaleString()}`, 12, '#ffd84a').setOrigin(0.5, 0));
    const vip = vipActive(s);
    c.add(k.text(sx + cw / 2, sy + 244, vip ? `👑 VIP เหลือ ${Math.ceil(vipLeft2(s) / 86400000)} วัน` : 'ยังไม่ใช่ VIP', 8.5, vip ? '#ffd84a' : '#8a7a60').setOrigin(0.5, 0));
    c.add(k.button(sx + 20, sy + H - 76, cw - 40, 20, '🏆 เปลี่ยนฉายา', () => this.open('collection'), { size: 8.5, color: 0x4a3a10 }));
    // middle: stats
    const mx = sx + cw + 8, mw = 196;
    g.fillStyle(0x0a0705, 0.6).fillRoundedRect(mx, sy, mw, H - 44, 5);
    c.add(k.text(mx + 8, sy + 6, '📊 ค่าพลัง', 10, '#ffe7a0'));
    const rows: [string, string][] = [['HP', d.maxHp.toLocaleString()], ['MP', d.maxMp.toLocaleString()], ['ATK', d.atk.toLocaleString()], ['MATK', d.matk.toLocaleString()], ['DEF', d.def.toLocaleString()],
      ['คริ', (d.crit * 100).toFixed(1) + '%'], ['ตีเร็ว', (1000 / d.attackInterval).toFixed(2) + '/วิ'], ['ดูดเลือด', Math.round(d.leech * 100) + '%'], ['🍀 โชค', '+' + Math.round(d.mf)], ['EXP', '+' + Math.round((d.expBonus - 1) * 100) + '%']];
    rows.forEach(([a, b], i) => { const ry = sy + 26 + i * 18; c.add(k.text(mx + 12, ry, a, 9, '#c8b898')); c.add(k.text(mx + mw - 12, ry, b, 9, '#ffffff').setOrigin(1, 0)); });
    const sf = setBonus((['weapon', 'armor', 'accessory'] as const).map(sl => s.inventory.find(q => q.uid === s.equip[sl])?.set));
    c.add(k.text(mx + 12, sy + 214, Object.keys(sf).length ? `◆ โบนัสเซ็ต: ${fxText(sf)}` : '◆ ยังไม่มีโบนัสเซ็ต', 8, Object.keys(sf).length ? '#7ad88a' : '#8a7a60', { wordWrap: { width: mw - 20 } }));
    // right: records
    const rx = mx + mw + 8, rw = x + W - 14 - rx;
    g.fillStyle(0x0a0705, 0.6).fillRoundedRect(rx, sy, rw, H - 44, 5);
    c.add(k.text(rx + 8, sy + 6, '📜 บันทึกการผจญภัย', 10, '#ffe7a0'));
    const sv = s as unknown as { tdMaxMap?: number; login?: { n: number } };
    const rec: [string, string][] = [['ปราบมอน', ps.kills.toLocaleString()], ['มอนทอง', ps.golden.toLocaleString()], ['ปราบบอส', String(s.bossDefeated ?? 0)], ['ผ่านดันเจี้ยน', String(ps.dungeons)],
      ['ล่าสัตว์', ps.animals.toLocaleString()], ['ขุดแร่', ps.ore.toLocaleString()], ['แร่หายาก', String(ps.gems)], ['ปรุงยา', String(ps.brews)], ['แผนที่ไกลสุด', String(sv.tdMaxMap ?? 0)],
      ['ความสำเร็จ', `${titlesOf(s).length}/${ACHS.length}`], ['สมุดมอน', `${CODEX.filter(m => (ps.kinds[m.kind] ?? 0) > 0).length}/${CODEX.length}`], ['ล็อกอิน', `${sv.login?.n ?? 0} วัน`], ['เวลาเล่น', `${Math.floor(s.playTime / 3600)} ชม. ${Math.floor(s.playTime / 60) % 60} นาที`]];
    rec.forEach(([a, b], i) => { const ry = sy + 26 + i * 17; c.add(k.text(rx + 12, ry, a, 8.5, '#c8b898')); c.add(k.text(rx + rw - 12, ry, b, 8.5, '#ffffff').setOrigin(1, 0)); });
  }

  // ---------------- DAILY DUNGEON ----------------
  buildDungeon(c: Phaser.GameObjects.Container) {
    const s = S(), ui = this.ui, k = this.k, di = act('dungeonInfo', {}), st = dungeonStage(di.li, s.level), set = SETS[LAND_SET[st.land.id]];
    const W = Math.min(460, ui.VW - 20), H = 260, left = di.max - di.used;
    const { x, y, g } = this.window(c, W, H, '⚔ ดันเจี้ยนรายวัน — ถ้ำเงา');
    loadIdle(ui, [st.land.boss.key], () => { if (this.cur === 'dungeon') this.rebuild(); });
    g.fillStyle(0x0a0705, 0.6).fillRoundedRect(x + 14, y + 32, W - 28, H - 80, 4);
    if (ui.textures.exists(`c_${st.land.boss.key}_idle`)) { const im = ui.add.image(x + W - 70, y + 150, `c_${st.land.boss.key}_idle`, 0).setOrigin(0.5, 1); im.setScale(96 / im.height); c.add(im); }
    c.add(k.text(x + 24, y + 40, [
      `ดินแดน: ${st.land.name} (ตามเลเวลของคุณ) • มอน Lv${st.level}`,
      `คลื่นมอน ${DUNGEON_WAVES.join(' → ')} ตัว แล้วบอส ${st.land.boss.name}`,
      `เวลา ${DUNGEON_SECS / 60} นาที • ในดันเจี้ยนมอนจะไล่ตีคุณ!`,
      '',
      '🎁 รางวัล: ชิ้นส่วน ' + set.name + ' (Rare ขึ้นไป) 1-2 ชิ้น',
      '   + ทอง + ผลึกมานา 3-5 • มอนทองก็มีโอกาสเกิด',
      '',
      `เข้าได้วันละ ${di.max} ครั้ง (VIP 3) • วันนี้เหลือ ${left} ครั้ง`,
    ].join('\n'), 8.5, '#e8dcc0', { lineSpacing: 3 }));
    c.add(k.button(x + W / 2 - 80, y + H - 40, 160, 28, left > 0 ? '⚔ เข้าดันเจี้ยน' : 'วันนี้ครบแล้ว', () => {
      this.close(); (ui as unknown as { enterStage?: (n: number) => void }).enterStage?.(DUNGEON + di.li);
    }, { size: 11, color: 0x7a2a10, disabled: left <= 0 }));
  }

  // ---------------- COLLECTION: achievements / titles / monster codex ----------------
  colTab: 'ach' | 'codex' = 'ach'; colPage = 0;
  buildCollection(c: Phaser.GameObjects.Container) {
    const s = S(), ui = this.ui, k = this.k;
    const W = Math.min(640, ui.VW - 12), H = 340;
    const { x, y, g } = this.window(c, W, H, '🏆 สะสม & ฉายา');
    ([['ach', '🏆 ความสำเร็จ / ฉายา'], ['codex', '📖 สมุดมอน']] as const).forEach(([id, label], i) => c.add(k.button(x + 14 + i * 150, y + 28, 144, 20, label, () => { this.colTab = id; this.colPage = 0; this.rebuild(); }, { size: 9, color: this.colTab === id ? 0x6a4a10 : 0x2a1d12 })));
    const cur = titleOf(s);
    c.add(k.text(x + W - 16, y + 32, `ฉายาตอนนี้: ${cur ?? '-'}`, 8.5, '#ffd84a').setOrigin(1, 0));
    const top = y + 56;
    if (this.colTab === 'ach') {
      const per = 10, pages = Math.ceil(ACHS.length / per), list = ACHS.slice(this.colPage * per, this.colPage * per + per);
      const cw = (W - 34) / 2, ch = 46;
      list.forEach((a, i) => {
        const cx = x + 14 + (i % 2) * (cw + 6), cy = top + Math.floor(i / 2) * (ch + 4), p = achProgress(s, a), done = p >= a.need, own = titlesOf(s).includes(a.id), using = (s as unknown as { title?: string }).title === a.id;
        g.fillStyle(own ? 0x1f2a14 : done ? 0x4a3a10 : 0x1a140e, 0.95).fillRoundedRect(cx, cy, cw, ch, 4).lineStyle(1, using ? 0xffd84a : own ? 0x7ad88a : 0x4a3a2a, 1).strokeRoundedRect(cx, cy, cw, ch, 4);
        c.add(k.text(cx + 6, cy + 3, `「${a.title}」`, 9, own ? '#ffd84a' : done ? '#ffffff' : '#a89878'));
        c.add(k.text(cx + 6, cy + 17, `${a.desc} • 💰${a.gold.toLocaleString()}`, 7, '#c8b898'));
        g.fillStyle(0x0b0805, 1).fillRect(cx + 6, cy + 32, cw - 100, 6).fillStyle(done ? 0x7ad88a : 0xc89a4a, 1).fillRect(cx + 6, cy + 32, (cw - 100) * p / a.need, 6);
        c.add(k.text(cx + cw - 90, cy + 29, `${p.toLocaleString()}/${a.need.toLocaleString()}`, 7, '#e8dcc0').setOrigin(1, 0));
        const btn = own ? (using ? 'ใช้อยู่' : 'ใช้ฉายา') : done ? 'รับ!' : '🔒';
        c.add(k.button(cx + cw - 80, cy + 10, 72, 22, btn, () => {
          if (!own) { const r = act('achClaim', { id: a.id }); if (typeof r === 'object') { sfx.levelUp(); bus.emit(EV.TOAST, `🏆 ได้ฉายา「${a.title}」 + 💰${a.gold.toLocaleString()}`, '#ffd84a'); } }
          else act('setTitle', { id: using ? null : a.id });
          saveGame(s); bus.emit(EV.STATE_CHANGED); this.rebuild();
        }, { size: 8.5, color: own ? (using ? 0x3a5a2a : 0x2a3a5a) : 0x6a4a10, disabled: !own && !done }));
      });
      if (pages > 1) for (let i = 0; i < pages; i++) c.add(k.button(x + W / 2 - pages * 18 + i * 36, y + H - 30, 30, 18, String(i + 1), () => { this.colPage = i; this.rebuild(); }, { size: 8, color: i === this.colPage ? 0x6a4a10 : 0x2a1d12 }));
    } else {
      const ps = pstats(s), keys = CODEX.map(m => m.key);
      if (loadIdle(ui, keys, () => { if (this.cur === 'collection') this.rebuild(); })) { /* rebuilt when the sheets arrive */ }
      const cols = 8, cw = (W - 28 - (cols - 1) * 5) / cols, ch = 64, seen = CODEX.filter(m => (ps.kinds[m.kind] ?? 0) > 0).length;
      c.add(k.text(x + 14, top - 2, `พบแล้ว ${seen}/${CODEX.length} ชนิด — ปราบครบทุกชนิดได้ฉายา「นักสะสมมอน」`, 8, '#9fe0a0'));
      CODEX.forEach((m, i) => {
        const cx = x + 14 + (i % cols) * (cw + 5), cy = top + 14 + Math.floor(i / cols) * (ch + 5), n = ps.kinds[m.kind] ?? 0;
        g.fillStyle(n ? 0x22301f : 0x15120e, 0.95).fillRoundedRect(cx, cy, cw, ch, 4).lineStyle(1, n ? 0x5a8a5a : 0x3a3228, 1).strokeRoundedRect(cx, cy, cw, ch, 4);
        const key = `c_${m.key}_idle`;
        if (ui.textures.exists(key)) { const im = ui.add.image(cx + cw / 2, cy + ch - 16, key, 0).setOrigin(0.5, 1); im.setScale(Math.min(40 / im.height, (cw - 6) / im.width)); if (!n) im.setTintFill(0x0a0806); c.add(im); }
        c.add(k.text(cx + cw / 2, cy + ch - 13, n ? `x${n.toLocaleString()}` : '???', 7, n ? '#e8dcc0' : '#5a5040').setOrigin(0.5, 0));
      });
    }
  }

  // ---------------- DAILY LOGIN (7-day calendar) ----------------
  buildLogin(c: Phaser.GameObjects.Container) {
    const s = S(), ui = this.ui, k = this.k, info = loginInfo(s);
    const W = Math.min(560, ui.VW - 20), H = 220;
    const { x, y, g } = this.window(c, W, H, '📅 ล็อกอินรายวัน');
    c.add(k.text(x + 16, y + 32, `เข้าเกมทุกวัน รับของทุกวัน • ครบ 7 วันได้แร่หายาก • ล็อกอินแล้วทั้งหมด ${info.total} วัน`, 8, '#e8dcc0'));
    const cw = (W - 32 - 6 * 6) / 7, ch = 104;
    LOGIN_REWARDS.forEach((r, i) => {
      const cx = x + 16 + i * (cw + 6), cy = y + 52, got = i < info.day || (i === info.day && !info.ready), today = i === info.day && info.ready, big = i === 6;
      g.fillStyle(got ? 0x1a2a1a : today ? 0x4a3a10 : big ? 0x2a1236 : 0x22180f, 0.95).fillRoundedRect(cx, cy, cw, ch, 5).lineStyle(today ? 2 : 1, today ? 0xffd84a : big ? 0xc89cff : 0x5a4a3a, 1).strokeRoundedRect(cx, cy, cw, ch, 5);
      c.add(k.text(cx + cw / 2, cy + 6, `วันที่ ${i + 1}`, 9, today ? '#ffd84a' : '#e8dcc0').setOrigin(0.5, 0));
      const icon = Object.keys(r.items ?? {})[0], d = icon ? itemDef(icon) : null;
      if (d && ui.textures.exists(`icon_${d.icon}`)) c.add(this.ico(cx + cw / 2, cy + 44, `icon_${d.icon}`, 40).setAlpha(got ? 0.4 : 1));
      c.add(k.text(cx + cw / 2, cy + 68, r.label, 7, got ? '#7a8a70' : '#ffe7a0', { align: 'center', wordWrap: { width: cw - 6 } }).setOrigin(0.5, 0));
      if (got) c.add(k.text(cx + cw - 5, cy + 4, '✔', 11, '#9fffb0').setOrigin(1, 0));
    });
    c.add(k.button(x + W / 2 - 70, y + H - 40, 140, 26, info.ready ? '🎁 รับของวันนี้' : 'รับแล้ว พรุ่งนี้มาใหม่', () => {
      const r = act('loginClaim', {});
      if (refused(r)) { sfx.error(); return; }
      sfx.levelUp(); bus.emit(EV.TOAST, `รับของล็อกอินวันที่ ${info.day + 1}: ${r.label}`, '#ffd84a'); saveGame(s); bus.emit(EV.STATE_CHANGED); this.rebuild();
    }, { size: 10, color: 0x6a4a10, disabled: !info.ready }));
  }

  // ---------------- DEEPWILD ROOMS (100 players each) ----------------
  buildRooms(c: Phaser.GameObjects.Container) {
    const ui = this.ui, k = this.k, info = act('wildRooms', {});
    const W = Math.min(420, ui.VW - 20), H = 250;
    const { x, y, g } = this.window(c, W, H, '🌿 ป่าดงดิบ — เลือกห้อง');
    c.add(k.text(x + 16, y + 32, `${info.cap} คนต่อห้อง • ไม่มีมอน • ตัดไม้ ขุดแร่ ล่าสัตว์ • ใส่ชุดชาวบ้านให้อัตโนมัติ`, 8, '#9fe0a0', { wordWrap: { width: W - 32 } }));
    const cols = 3, cw = (W - 32 - (cols - 1) * 8) / cols, ch = 70;
    info.rooms.forEach((r, i) => {
      const cx = x + 16 + (i % cols) * (cw + 8), cy = y + 60 + Math.floor(i / cols) * (ch + 8), full = r.count >= info.cap, cur = r.id === info.room;
      g.fillStyle(full ? 0x2a1410 : 0x1f3a24, 0.95).fillRoundedRect(cx, cy, cw, ch, 5).lineStyle(cur ? 2 : 1, cur ? 0xffd84a : full ? 0x6a3a2a : 0x5a8a5a, 1).strokeRoundedRect(cx, cy, cw, ch, 5);
      c.add(k.text(cx + 8, cy + 6, `ห้อง ${r.id}`, 11, full ? '#a88878' : '#ffffff', { fontStyle: 'bold' }));
      const f = r.count / info.cap;
      g.fillStyle(0x0b0805, 1).fillRect(cx + 8, cy + 30, cw - 16, 7).fillStyle(f >= 1 ? 0xff5a4a : f > 0.75 ? 0xffb040 : 0x5ad86a, 1).fillRect(cx + 8, cy + 30, (cw - 16) * Math.min(1, f), 7);
      c.add(k.text(cx + 8, cy + 42, full ? `เต็ม ${r.count}/${info.cap}` : `👥 ${r.count}/${info.cap}`, 9, full ? '#ff8a6a' : '#c8e8c0'));
      if (!full) { const z = ui.add.zone(cx, cy, cw, ch).setOrigin(0).setInteractive(); z.on('pointerup', () => { sfx.click(); this.close(); (ui as unknown as { enterStage?: (n: number, room?: number) => void }).enterStage?.(WILD, r.id); }); c.add(z); }
    });
  }

  // ---------------- ALCHEMY (kitchen) ----------------
  buildAlchemy(c: Phaser.GameObjects.Container) {
    const s = S(), ui = this.ui, k = this.k;
    const W = Math.min(640, ui.VW - 12), H = 340;
    const { x, y, g } = this.window(c, W, H, '⚗ ปรุงยาจากแร่');
    const kl = levelOf(s, 'kitchen'), el = activeElixir(s);
    c.add(k.text(x + 14, y + 30, `ครัว Lv${kl} • 💰${s.gold.toLocaleString()} • 🍖${s.res.food}` + (el ? `   ✨ ${el.name} เหลือ ${Math.ceil((el.until - Date.now()) / 60000)} นาที` : '   แร่หาได้จาก 🌿 ป่าดงดิบ (เหมือง)'), 8.5, el ? '#ff9cff' : '#ffe7a0'));
    c.add(k.text(x + W - 14, y + 30, 'ยาใหม่จะแทนที่ยาเก่า', 7.5, '#a89878').setOrigin(1, 0));
    const cols = 2, top = y + 46, cw = (W - 28 - 6) / cols, ch = (H - 56 - 4 * 4) / 5;
    RECIPES.forEach((r, i) => {
      const d = itemDef(r.out), cx = x + 14 + (i % cols) * (cw + 6), cy = top + Math.floor(i / cols) * (ch + 4);
      const f = canBrew(s, r), rc = '#' + RARITY_COLORS[d.rarity].toString(16).padStart(6, '0');
      g.fillStyle(d.rarity >= 3 ? 0x2a1236 : 0x22180f, 0.95).fillRoundedRect(cx, cy, cw, ch, 4).lineStyle(1, RARITY_COLORS[d.rarity], d.rarity >= 3 ? 1 : 0.5).strokeRoundedRect(cx, cy, cw, ch, 4);
      k.iconSlot(g, cx + 4, cy + (ch - 34) / 2, 34, RARITY_COLORS[d.rarity], false);
      if (ui.textures.exists(`icon_${d.icon}`)) c.add(this.ico(cx + 21, cy + ch / 2, `icon_${d.icon}`, 34));
      const have = countItem(s, r.out);
      c.add(k.text(cx + 44, cy + 3, d.name + (have ? ` (มี ${have})` : ''), 9, rc));
      c.add(k.text(cx + 44, cy + 15, d.desc, 7, '#e8dcc0', { wordWrap: { width: cw - 100 } }));
      let nx = cx + 44; const ny = cy + ch - 15;
      for (const [id, n] of Object.entries(r.need)) {
        const ok = countItem(s, id) >= n, dd = itemDef(id);
        if (ui.textures.exists(`icon_${dd.icon}`)) { const im = ui.add.image(nx + 6, ny + 5, `icon_${dd.icon}`); im.setScale(13 / Math.max(im.width, im.height)); c.add(im); }
        const t = k.text(nx + 13, ny, `${countItem(s, id)}/${n}`, 7, ok ? '#9fffb0' : '#ff8a6a'); c.add(t); nx += 16 + t.width;
      }
      c.add(k.text(nx + 2, ny, `💰${r.gold} 🍖${r.food}`, 7, s.gold >= r.gold && s.res.food >= r.food ? '#ffe7a0' : '#ff8a6a'));
      const lock = kl < r.kitchen;
      c.add(k.button(cx + cw - 52, cy + 6, 46, 22, lock ? `🔒ครัว${r.kitchen}` : 'ปรุง', () => {
        const res = act('brew', { out: r.out });
        if (res === 'ok') { sfx.upgradeOk(); bus.emit(EV.TOAST, `ปรุงสำเร็จ! ${d.name} — ดื่มได้ในกระเป๋า`, rc); bus.emit(EV.STATE_CHANGED); saveGame(s); this.rebuild(); }
        else { sfx.error(); bus.emit(EV.TOAST, { kitchen: `ต้องอัปเกรดครัวเป็น Lv${r.kitchen}`, items: 'แร่ไม่พอ — ไปขุดที่เหมืองใน 🌿 ป่าดงดิบ', gold: 'ทองไม่พอ', food: 'อาหารไม่พอ — ล่าสัตว์ใน 🌿 ป่าดงดิบ', bag: 'กระเป๋าเต็ม' }[res], '#ff8a8a'); }
      }, { size: lock ? 7 : 9.5, color: d.rarity >= 3 ? 0x6a1a8a : 0x5a3a10, disabled: lock || !!f }));
    });
  }

  // ---------------- UI SETTINGS ----------------
  buildUiOpt(c: Phaser.GameObjects.Container) {
    const s = S(), ui = this.ui, k = this.k, o = uiOpt(s);
    const W = 300, H = 250;
    const { x, y } = this.window(c, W, H, 'ปรับ UI');
    let yy = y + 40;
    const row = (label: string, val: string, cb: () => void) => {
      c.add(k.text(x + 22, yy + 5, label, 10, '#ffe7a0'));
      c.add(k.button(x + W - 130, yy, 108, 24, val, () => { cb(); saveGame(s); bus.emit(EV.STATE_CHANGED); (ui as unknown as { applyUiOpt?: () => void }).applyUiOpt?.(); this.rebuild(); }, { size: 10 }));
      yy += 36;
    };
    const pct = (v: number) => Math.round(v * 100) + '%';
    row('ขนาด UI', pct(o.scale), () => setUiOpt(s, { scale: cycle(UI_SCALES, o.scale) }));
    row('ขนาดปุ่มต่อสู้', pct(o.btn), () => setUiOpt(s, { btn: cycle(BTN_SCALES, o.btn) }));
    row('ความชัดแถบบน', pct(o.alpha), () => setUiOpt(s, { alpha: cycle(ALPHAS, o.alpha) }));
    row('ชื่อบนหัวชาวบ้าน', o.names ? 'แสดง' : 'ซ่อน', () => setUiOpt(s, { names: !o.names }));
    c.add(k.button(x + 22, yy + 4, 120, 24, 'ค่าเริ่มต้น', () => { setUiOpt(s, { scale: 1, btn: 1, alpha: 1, names: true }); saveGame(s); (ui as unknown as { applyUiOpt?: () => void }).applyUiOpt?.(); this.rebuild(); }, { size: 9.5, color: 0x5a3a1a }));
    c.add(k.button(x + W - 130, yy + 4, 108, 24, '◀ กลับเมนู', () => this.open('menu'), { size: 9.5 }));
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
    // portrait: the villager's PixelLab character (elder np1, merchant np2, smith np3)
    const pk = `c_${({ elder: 'np1', merchant: 'np2', smith: 'np3' } as Record<string, string>)[this.dialogNpc] ?? 'np1'}_idle`;
    const por = ui.add.image(x + 42, y + 72, ui.textures.exists(pk) ? pk : '__DEFAULT', 0).setOrigin(0.5, 1);
    por.setScale(58 / por.height);
    c.add(por);
    c.add(k.text(x + 42, y + 78, info.name, 8.5, '#ffd84a').setOrigin(0.5, 0));
    c.add(k.text(x + 84, y + 10, this.dialogText, 9.5, '#f3e6c4', { wordWrap: { width: W - 96 }, lineSpacing: 3 }));
    const btns: [string, () => void, number?][] = [];
    if (this.dialogNpc === 'elder') {
      if (nextForm(s) !== null) btns.push(['✨ เปลี่ยนร่าง', () => this.open('job'), 0x6a3a8a]);
      const a = activeQuest(s);
      if (a?.status === 'ready') btns.push(['✔ ส่งภารกิจ', () => {
        const def = QUEST_BY_ID[a.id];
        const lv = act('completeQuest', { id: a.id });
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
        if (n && s.level >= n.minLevel) btns.push(['📜 รับภารกิจ', () => { act('acceptQuest', { id: n.id }); sfx.pickup(); bus.emit(EV.TOAST, `รับภารกิจ: ${n.title}`, '#ffe7a0'); this.close(); bus.emit(EV.STATE_CHANGED); }, 0x1f3a5a]);
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
      const cols = 2, cw = (W - 34) / cols, ch = 40, per = 10, pages = Math.ceil(SHOP_STOCK.length / per);
      this.shopPage = Math.min(this.shopPage, pages - 1);
      if (pages > 1) {
        c.add(k.button(x + 170, y + 28, 30, 20, '◀', () => { this.shopPage = (this.shopPage + pages - 1) % pages; this.rebuild(); }, { size: 9.5 }));
        c.add(k.text(x + 216, y + 31, `${this.shopPage + 1}/${pages}`, 9, '#ffe7a0').setOrigin(0.5, 0));
        c.add(k.button(x + 232, y + 28, 30, 20, '▶', () => { this.shopPage = (this.shopPage + 1) % pages; this.rebuild(); }, { size: 9.5 }));
      }
      SHOP_STOCK.slice(this.shopPage * per, this.shopPage * per + per).forEach((id, i) => {
        const def = itemDef(id);
        const cx = x + 14 + (i % cols) * (cw + 6), cy = top + Math.floor(i / cols) * (ch + 4);
        g.fillStyle(0x2a1d12, 0.85).fillRoundedRect(cx, cy, cw, ch, 3);
        g.lineStyle(1, RARITY_COLORS[def.rarity], 0.6).strokeRoundedRect(cx, cy, cw, ch, 3);
        c.add(this.ico(cx + 20, cy + ch / 2, `icon_${def.icon}`, 30));
        c.add(k.text(cx + 38, cy + 4, def.name, 9, '#' + RARITY_COLORS[def.rarity].toString(16).padStart(6, '0')));
        c.add(k.text(cx + 38, cy + 20, statLines(def).join('  ') || def.desc, 7, '#c8b898', { wordWrap: { width: cw - 110 } }));
        const sd = (s as unknown as { shopDay?: { d: string; shards: number } }), today = new Date().toDateString();
        if (sd.shopDay?.d !== today) sd.shopDay = { d: today, shards: 0 };
        const capped = id === 'mana_shard' && sd.shopDay.shards >= SHOP_SHARD_DAILY;
        const can = s.gold >= def.price && !capped;
        if (id === 'mana_shard') c.add(k.text(cx + cw - 70, cy + ch - 9, `วันนี้ ${sd.shopDay.shards}/${SHOP_SHARD_DAILY}`, 6.5, capped ? '#ff8a6a' : '#c8b898').setOrigin(1, 0.5));
        c.add(k.button(cx + cw - 66, cy + 9, 60, 22, `${def.price} G`, () => {
          const br = act('shopBuy', { id });
          if (refused(br)) { sfx.error(); bus.emit(EV.TOAST, ({ gold: 'ทองไม่พอ', bag: 'กระเป๋าเต็ม', cap: 'วันนี้ซื้อครบแล้ว' } as Record<string, string>)[br.refused] ?? 'ซื้อไม่ได้', '#ff8a8a'); return; }
          sfx.coin(); bus.emit(EV.TOAST, `ซื้อ ${def.name}`, '#9fffb0'); saveGame(s); bus.emit(EV.STATE_CHANGED); this.rebuild();
        }, { size: 9, disabled: !can, color: 0x5a3a10 }));
      });
    } else {
      // sell grid + detail
      const cols = 7, cs = 30;
      s.inventory.forEach((it, i) => {
        const def = itemDef(it.id);
        const cx = x + 14 + (i % cols) * (cs + 3), cy = top + Math.floor(i / cols) * (cs + 3);
        k.iconSlot(g, cx, cy, cs, RARITY_COLORS[def.rarity], it.uid === this.selUid);
        c.add(this.ico(cx + cs / 2, cy + cs / 2, `icon_${def.icon}`, cs));
        if (it.qty > 1) c.add(k.text(cx + cs - 2, cy + cs - 1, String(it.qty), 7.5, '#ffffff').setOrigin(1, 1));
        if (isEquipped(s, it.uid)) c.add(k.text(cx + 2, cy + 1, 'E', 7, '#ffd84a'));
        const z = ui.add.zone(cx, cy, cs, cs).setOrigin(0).setInteractive();
        z.on('pointerup', () => { sfx.click(); this.selUid = it.uid; this.rebuild(); });
        c.add(z);
      });
      const dx = x + 14 + cols * (cs + 3) + 6;
      this.itemDetail(c, g, dx, top, x + W - 14 - dx, H - 66, 'sell');
      // quick bulk sale of unequipped gear up to a rarity (tap twice to confirm)
      const junk = s.inventory.filter(it => { const d = itemDef(it.id); return (d.type === 'weapon' || d.type === 'armor' || d.type === 'accessory') && !isEquipped(s, it.uid) && (it.rar ?? 0) <= this.junkRar; });
      const jg = junk.reduce((a, it) => a + sellPrice(it) * it.qty, 0);
      c.add(k.button(x + 14, y + H - 34, 96, 22, `ระดับ: ${['Common', '≤ Uncommon', '≤ Rare'][this.junkRar]}`, () => { this.junkRar = (this.junkRar + 1) % 3; this.junkConfirm = false; this.rebuild(); }, { size: 8 }));
      c.add(k.button(x + 114, y + H - 34, cols * (cs + 3) - 100, 22, this.junkConfirm ? `ยืนยัน! ขาย ${junk.length} ชิ้น (+${jg.toLocaleString()} G)` : `ขายอุปกรณ์ที่ไม่ได้ใส่ ${junk.length} ชิ้น`, () => {
        if (!this.junkConfirm) { this.junkConfirm = true; this.rebuild(); return; }
        const r = act('sellJunk', { maxRar: this.junkRar }); this.junkConfirm = false; this.selUid = null;
        if (r.count) { sfx.coin(); bus.emit(EV.TOAST, `ขาย ${r.count} ชิ้น ได้ ${r.gold.toLocaleString()} G`, '#ffd84a'); saveGame(s); bus.emit(EV.STATE_CHANGED); }
        this.rebuild();
      }, { size: 8.5, color: this.junkConfirm ? 0x8a2a1a : 0x5a3a10, disabled: !junk.length }));
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
      c.add(this.ico(cx + cs / 2, cy + cs / 2, `icon_${def.icon}`, cs));
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
  if (def.mf) out.push(`🍀 โชค +${def.mf}`);
  if (def.heal) out.push(`ฟื้น HP ${def.heal}`);
  if (def.mana) out.push(`ฟื้น MP ${def.mana}`);
  return out;
}

export type { InvItem };
void GOLD;
