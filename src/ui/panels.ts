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
import { buffClash, clock, type Incoming } from '../systems/buffs';
import { lootOpt, toggleLoot, LOOT_RARS, LOOT_MAX } from '../systems/lootOpt';
import { WHEEL_SEGS, WHEEL_PRICE, WHEEL_OPEN, pickChoices, type WheelPrize } from '../systems/wheel';
import { DWHEEL_SEGS, DWHEEL_PRICE, DWHEEL_PRICE10, DWHEEL_OPEN, DIAMOND_ODDS_SHOWN, STAR_TRADE, dChance } from '../systems/diamondWheel';
import { SKILL_MAX, currentSkills, nextForm, activeTier } from '../systems/stats';
import { formKeyOf, loadIdle } from '../world/chars';
import { ensureDaily, dailyProgress, DAILY_NAMES, dayKey } from '../systems/daily';
import { derive, expToNext } from '../systems/stats';
import { rarOf, rarMult, affixText, isGear, GEAR_BASES } from '../systems/loot';
import { SHOP_SHARD_DAILY, itemDef, RARITY_COLORS, RARITY_NAMES, SHOP_STOCK, upgradeCost, upgradeMult, MAX_UPGRADE, type ItemDef } from '../data/items';
import { clampVitals, isEquipped, sellPrice, countItem } from '../systems/inventory';
import { QUESTS, QUEST_BY_ID } from '../data/quests';
import { activeQuest, nextAvailable, refreshCollect } from '../systems/quests';
import { SKILL_BY_ID } from '../data/skills';
import { CLASSES, FORM_LEVEL, formName, formCode, classSkills, ALL_FORMS, type ClassId } from '../data/classes';
import { saveGame, loadGame, deleteSave } from '../core/save';
import { MOUNTS, MOUNT_ORDER } from '../data/mounts';
import { DEV_TOOLS } from '../server/config';
import { TEST_HOOKS } from '../core/testHooks';
import { mountOn, hasMount } from '../systems/mounts';

import { STAGES, LANDS, WILD, DUNGEON, DUNGEON_WAVES, DUNGEON_SECS, dungeonStage } from '../world/stages';
import { RECIPES } from '../data/alchemy';
import { act, actServer, isOnline, refused } from '../net/client';
import { isAdmin, SERVER, accountToken, googleLinked, accountName, signOut, accountId } from '../net/cloud';
import { openLinkGoogle } from '../net/linkGoogle';
import { showWait } from '../core/wait';
import { askName } from '../net/namePrompt';
import { canBrew, activeElixir } from '../systems/alchemy';
import { LOGIN_REWARDS, loginInfo } from '../systems/progress';
import { SETS, LAND_SET, fxText, setBonus } from '../data/sets';
import { vipActive, vipLeftMs as vipLeft2 } from '../systems/premium';
import { CBT_ACTIVE, CBT_VIP_DAYS, CBT_TITLE, CBT_PACK, cbtGot, cbtReady } from '../systems/cbtGift';
import { mailOf, mailWaiting, hasGift, mailLive, giftText } from '../systems/mail';
import { ACHS, CODEX, achProgress, titlesOf, titleOf, pstats, achDone, SPECIAL_TITLES } from '../data/achievements';
import { MARKET_FEE, MAX_LISTINGS, LISTING_HOURS, feeOf, suggestPrice, myListings, sampleListings, priceRange, DAILY_LISTINGS, listedToday } from '../systems/market';
import { openTopup } from './topupDom';
import { cosOwned, cosOn, stormAuraLeft, activeHorseSkin, rideSpeed, type CosKind } from '../systems/cosmetics';
import { SKIN_TINT } from '../world/mount';
import { DIAMOND_PACKS, VIP_CARDS, VIP_PERKS, DIAMOND_SHOP, FX_COLOR, diamonds, vipLeftMs, vipGiftReady } from '../systems/premium';
import { stageFood, supplyMinutes } from '../systems/supplies';
import { potOf, setPot, potCount, HP_STEPS, MP_STEPS, type PotSet } from '../systems/potions';
import { farmGoal, setFarmGoal, farmDone, FARM_KEYS, FARM_NAMES, FARM_STEPS } from '../systems/farm';
import { energyLeft } from '../systems/economy';
import { lang, setLang } from '../core/i18n';
import { uiOpt, setUiOpt, RANGES, type UiOpt } from '../core/uiOptions';
import { sfx, audioState, setVolume } from '../audio/sfx';
import { testBots, BOT_STEPS } from '../core/testBots';
import { buildGuild, buildStash, buildTrophy, type GuildTab, type GuildHost } from './guildPanels';
import type { DefenseId } from '../data/guild';

type PanelId = 'wardrobe' | 'bag' | 'stats' | 'quest' | 'menu' | 'shop' | 'smith' | 'dialog' | 'plot' | 'job' | 'forms' | 'uiopt' | 'stages' | 'premium' | 'market' | 'alchemy' | 'login' | 'collection' | 'dungeon' | 'profile' | 'guild' | 'stash' | 'trophy' | 'bounty' | 'mounts' | 'potion' | 'farm' | 'cbt' | 'mail' | 'lootopt' | 'wheel' | 'pick' | 'dwheel';

const NPC_INFO: Record<string, { name: string; tex: string }> = {
  elder: { name: 'ผู้เฒ่าอัลดริค', tex: 'npc_elder' },
  merchant: { name: 'พ่อค้ามิร่า', tex: 'npc_merchant' },
  smith: { name: 'ช่างตีเหล็กบรอม', tex: 'npc_smith' },
};

/** roaming bosses alive now (server /bosses), refreshed every 20 s while the map select is open */
const stageBosses: { at: number; list: { n: number; name: string; left: number }[] } = { at: 0, list: [] };
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
  /** the buff that asked "replace?" once (a second tap uses it) — 'i'+uid (bag) or 'm'+meal (kitchen) */
  buffAsk = '';

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
    if (id === 'market') { this.mhItem = {}; this.mhKey = ''; }   // (fresh sales history each time the market opens)
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
    // windows are laid out for a 360-high screen: a bigger UI size (fewer units on screen) shrinks them to fit, never off
    // the screen (director: windows ran off the bottom); a smaller one centres them
    const VH = (ui as unknown as { VH?: number }).VH ?? 360, f = Math.min(1, (VH - 4) / 360);
    const c = ui.add.container(ui.VW * (1 - f) / 2, (VH - 360 * f) / 2).setScale(f);
    this.c = c;
    // backdrop (the whole screen, whatever the shrink)
    const bd = ui.add.rectangle(-c.x / f, -c.y / f, ui.VW / f, VH / f, 0x000000, this.cur === 'dialog' ? 0.25 : 0.55).setOrigin(0).setInteractive();
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
      case 'lootopt': this.buildLootOpt(c); break;
      case 'wheel': this.buildWheel(c); break;
      case 'dwheel': this.buildDWheel(c); break;
      case 'pick': this.buildPick(c); break;
      case 'dialog': this.buildDialog(c); break;
      case 'shop': this.buildShop(c); break;
      case 'smith': this.buildSmith(c); break;
      case 'uiopt': this.buildUiOpt(c); break;
      case 'stages': this.buildStages(c); break;
      case 'potion': this.buildPotion(c); break;
      case 'farm': this.buildFarm(c); break;
      case 'premium': this.buildPremium(c); break;
      case 'market': this.buildMarket(c); break;
      case 'alchemy': this.buildAlchemy(c); break;
      case 'login': this.buildLogin(c); break;
      case 'collection': this.buildCollection(c); break;
      case 'dungeon': this.buildDungeon(c); break;
      case 'profile': this.buildProfile(c); break;
      case 'guild': buildGuild(this, c); break;
      case 'stash': buildStash(this, c); break;
      case 'trophy': buildTrophy(this, c); break;
      case 'bounty': this.buildBounty(c); break;
      case 'mounts': this.buildMounts(c); break;
      case 'cbt': this.buildCbt(c); break;
      case 'mail': this.buildMail(c); break;
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

  bagPage = 0;
  /** a second tap on the same item within a moment */
  private lastTap = { uid: -1, t: 0 };
  dbl(uid: number) { const now = Date.now(), d = this.lastTap.uid === uid && now - this.lastTap.t < 380; this.lastTap = d ? { uid: -1, t: 0 } : { uid, t: now }; return d; }
  /** wear a piece of gear, or take it off if it is worn — at once */
  toggleWear(uid: number) {
    const s = S(), it = s.inventory.find(i => i.uid === uid); if (!it) return;
    const on = isEquipped(s, uid); act(on ? 'unequip' : 'equip', { uid }); sfx.equip();
    bus.emit(EV.TOAST, `${on ? 'ถอด' : 'สวมใส่'} ${itemDef(it.id).name}`, '#ffe7a0');
    this.selUid = uid; saveGame(s); bus.emit(EV.STATE_CHANGED); this.rebuild();
  }
  // ---------------- BAG ----------------
  buildBag(c: Phaser.GameObjects.Container) {
    const s = S(), ui = this.ui, k = this.k;
    const W = Math.min(640, ui.VW - 20), H = 344;
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
        z.on('pointerup', () => { if (this.dbl(it.uid)) { this.toggleWear(it.uid); return; } sfx.click(); this.selUid = it.uid; this.rebuild(); });   // double tap = take off
        c.add(z);
      }
    }
    const d = derive(s);
    c.add(k.text(ex + 6, ey + 146, `ATK ${d.atk}   MATK ${d.matk}\nDEF ${d.def}   HP ${d.maxHp}\nคริ ${(d.crit * 100).toFixed(1)}%`, 8, '#f3e6c4', { lineSpacing: 3 }));
    c.add(k.button(ex + 4, ey + 204, 104, 20, '👑 ตั้งค่าเก็บของ', () => this.open('lootopt'), { size: 8, color: 0x4a2a6a }));   // (VIP: pick-up filter + auto-dismantle)
    c.add(ui.add.image(ex + 10, ey + H - 66, 'icon_gold').setScale(0.4));
    c.add(k.text(ex + 20, ey + H - 72, s.gold.toLocaleString() + ' G', 10, '#ffd84a'));

    // grid
    // director: bigger items, 6 to a row; pages of 6 rows when the bag holds more
    const N = invSize(s), cols = 6, cs = 38, gap = 4, rows = 6, per = cols * rows, pages = Math.ceil(N / per);
    this.bagPage = Math.min(this.bagPage, pages - 1);
    const gx = ex + 122, gy = ey + 24;
    // tabs: items / mounts / followers (director: use and take off right from the bag)
    ([['items', '🎒 ไอเทม'], ['mounts', '🐎 พาหนะ'], ['pets', '⛈ ผู้ติดตาม']] as const).forEach(([id, label], i) => c.add(k.button(gx + i * 86, ey - 2, 82, 20, label, () => { this.bagTab = id; this.rebuild(); }, { size: 8.5, color: this.bagTab === id ? 0x6a4a10 : 0x2a1d12 })));
    if (this.bagTab !== 'items') { this.bagRides(c, g, gx, gy, x + W - 14 - gx, H - 44 - 24); return; }
    for (let j = 0; j < Math.min(per, N - this.bagPage * per); j++) {
      const i = this.bagPage * per + j;
      const cx = gx + (j % cols) * (cs + gap), cy = gy + Math.floor(j / cols) * (cs + gap);
      const it = s.inventory[i];
      const def = it ? itemDef(it.id) : null;
      k.iconSlot(g, cx, cy, cs, it ? RARITY_COLORS[rarOf(it)] : undefined, !!it && it.uid === this.selUid);
      if (it && def) {
        c.add(this.ico(cx + cs / 2, cy + cs / 2, `icon_${def.icon}`, cs));
        if (it.qty > 1) c.add(k.text(cx + cs - 2, cy + cs - 1, String(it.qty), 8.5, '#ffffff').setOrigin(1, 1));
        if (it.upg) c.add(k.text(cx + cs - 2, cy + 1, '+' + it.upg, 8, '#9fffb0').setOrigin(1, 0));
        if (isEquipped(s, it.uid)) c.add(k.text(cx + 2, cy + 1, 'E', 8, '#ffd84a'));
        if (it.set) c.add(k.text(cx + cs - 2, cy + cs - 12, '◆', 8, '#' + SETS[it.set].col.toString(16).padStart(6, '0')).setOrigin(1, 0));
        const z = ui.add.zone(cx, cy, cs, cs).setOrigin(0).setInteractive();
        z.on('pointerup', () => { if (this.dbl(it.uid) && ['weapon', 'armor', 'accessory'].includes(def.type)) { this.toggleWear(it.uid); return; } sfx.click(); this.selUid = it.uid; this.rebuild(); });   // double tap = wear / take off
        c.add(z);
      }
    }
    if (pages > 1) {   // more than one page: ▲ ▼ under the grid
      const py = gy + rows * (cs + gap) + 2, pw = cols * (cs + gap) - gap;
      c.add(k.button(gx, py, 60, 18, '◀', () => { this.bagPage = Math.max(0, this.bagPage - 1); this.rebuild(); }, { size: 9, disabled: this.bagPage === 0 }));
      c.add(k.text(gx + pw / 2, py + 4, `หน้า ${this.bagPage + 1}/${pages}`, 8.5, '#d9b45a').setOrigin(0.5, 0));
      c.add(k.button(gx + pw - 60, py, 60, 18, '▶', () => { this.bagPage = Math.min(pages - 1, this.bagPage + 1); this.rebuild(); }, { size: 9, disabled: this.bagPage >= pages - 1 }));
    }
    // detail
    const dx = gx + cols * (cs + gap) + 6, dw = x + W - 14 - dx;
    if (dw > 80) this.itemDetail(c, g, dx, ey, dw, H - 44, 'bag');
  }

  /** the bag's 🐎 mounts / ⛈ followers tabs: what you own, tap one, ride / take off — use / put away */
  bagRides(c: Phaser.GameObjects.Container, g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number) {
    const s = S(), ui = this.ui, k = this.k, pets = this.bagTab === 'pets';
    type E = { id: string; name: string; desc: string; tex: string; frame: number; tint?: number; on: boolean; use: () => void; off: () => void; emoji?: string };
    const list: E[] = [];
    if (pets) {
      if (cosOwned(s, 'pet')) list.push({ id: 'cloud', name: '⛈ เมฆพายุ', desc: 'ลอยเหนือหัว มีฟ้าแลบ ผู้เล่นคนอื่นเห็น\n💨 วิ่งเร็วขึ้น 5%\n⚡ ลูกศรชี้ทางไปบอสเร่ร่อน + จุดบนแผนที่เล็ก\n⚡ บอกเมื่อบอสโผล่แผนที่อื่น', tex: 'pet_cloud', frame: 0, emoji: '⛈', on: cosOn(s, 'pet'),
        use: () => act('cosmetic', { k: 'pet', on: true }), off: () => act('cosmetic', { k: 'pet', on: false }) });
    } else {
      const ride = mountOn(s), black = !!activeHorseSkin(s);
      for (const id of MOUNT_ORDER) {
        if (!hasMount(s, id)) continue;
        const d = MOUNTS[id], vs: (string | null)[] = id === 'horse' && cosOwned(s, 'horse') ? [null, 'horse_black'] : [null];
        for (const skin of vs) list.push({ id: id + (skin ?? ''), name: skin ? '🐴 ม้าดำนิล' : d.name, desc: `💨 วิ่งเร็วขึ้น ${Math.round((rideSpeed(d.speed, skin) - 1) * 100)}%\n${skin ? 'ม้าศึกสีดำนิล — เร็วกว่าม้าปกติ' : d.desc}`, tex: `m_${d.key}_idle`, frame: 1, tint: skin ? SKIN_TINT[skin] : undefined,
          on: ride === id && (id !== 'horse' || black === !!skin),
          use: () => { if (id === 'horse' && cosOwned(s, 'horse')) act('cosmetic', { k: 'horse', on: !!skin }); act('mountSelect', { id }); },
          off: () => act('mountSelect', { id: null }) });
      }
    }
    if (!list.length) { c.add(k.text(x + w / 2, y + h / 2, pets ? 'ยังไม่มีผู้ติดตาม\nได้จาก 💎 กงล้อเพชร (หรือแลกดาว ⭐)' : 'ยังไม่มีพาหนะ\nซื้อม้าได้ที่ เมนู → 🐎 สัตว์ขี่', 9, '#8a7a60', { align: 'center' }).setOrigin(0.5)); return; }
    const sel = list.find(q => q.id === this.rideSel) ?? list[0], cs = 56, gap = 6, gw = Math.min(3, list.length) * (cs + gap);
    list.forEach((q, i) => {
      const cx = x + (i % 3) * (cs + gap), cy = y + Math.floor(i / 3) * (cs + gap + 12);
      k.iconSlot(g, cx, cy, cs, q.on ? 0xffd84a : 0x8a6a40, q === sel);
      if (ui.textures.exists(q.tex)) { const im = ui.add.image(cx + cs / 2, cy + cs / 2 + (pets ? 0 : 6), q.tex, ui.textures.get(q.tex).has(String(q.frame)) || pets ? (pets ? undefined : q.frame) : undefined); im.setScale(Math.min((cs - 6) / im.width, (cs - 6) / im.height) * (pets ? 1.3 : 1.25)); if (q.tint) im.setTint(q.tint); c.add(im); }
      else c.add(k.text(cx + cs / 2, cy + cs / 2, q.emoji ?? '🐎', 22).setOrigin(0.5));
      if (q.on) c.add(k.text(cx + 3, cy + 2, 'E', 9, '#ffd84a'));
      c.add(k.text(cx + cs / 2, cy + cs + 1, q.name.replace(/^[^\s]+ /, ''), 7, q.on ? '#ffd84a' : '#d9c8a0').setOrigin(0.5, 0));
      const z = ui.add.zone(cx, cy, cs, cs).setOrigin(0).setInteractive();
      z.on('pointerup', () => { if (this.dbl(i + 9000)) { (q.on ? q.off : q.use)(); this.rideDone(); return; } sfx.click(); this.rideSel = q.id; this.rebuild(); });   // double tap = use / take off
      c.add(z);
    });
    // the detail on the right
    const dx = x + gw + 6, dw = x + w - dx;
    if (dw < 90) return;
    g.fillStyle(0x0a0705, 0.6).fillRoundedRect(dx, y, dw, h, 4).lineStyle(1, GOLD_D, 1).strokeRoundedRect(dx, y, dw, h, 4);
    c.add(k.text(dx + 8, y + 8, sel.name, 11, '#ffe7a0'));
    c.add(k.text(dx + 8, y + 28, sel.on ? (pets ? '✅ กำลังใช้อยู่' : '✅ กำลังขี่อยู่') : '✔ เป็นของคุณ', 8, '#9fffb0'));
    c.add(k.text(dx + 8, y + 46, sel.desc, 8, '#e8dcc0', { wordWrap: { width: dw - 16 }, lineSpacing: 3 }));
    c.add(k.button(dx + 8, y + h - 32, dw - 16, 24, sel.on ? (pets ? '📦 ถอด (เก็บ)' : '🚶 ลงจากหลัง') : (pets ? '✨ ใช้' : '🐎 ขี่'), () => { (sel.on ? sel.off : sel.use)(); this.rideDone(); }, { size: 9.5, color: sel.on ? 0x3a2a2a : 0x1f4a2a }));
  }
  rideDone() { sfx.click(); bus.emit(EV.STATE_CHANGED); saveGame(S()); this.rebuild(); }
  bagTab: 'items' | 'mounts' | 'pets' = 'items'; rideSel = '';

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
      const inc: Incoming | null = def.buff ? { slot: 'buff', stat: def.buff.stat, pct: def.buff.pct } : def.elixir ? { slot: 'elixir', name: def.name } : null, clash = inc ? buffClash(s, inc) : null, ask = !!clash && this.buffAsk !== `i${it.uid}`;
      if (def.pick !== undefined) btn('🎁 เปิดหีบ เลือกอุปกรณ์', () => { sfx.click(); this.pickUid = it.uid; this.open('pick'); }, 0x6a4a10);
      else if (def.type === 'consumable') btn(ask || !clash ? 'ใช้' : '⚠ ยืนยัน ใช้ทับบัพเดิม', () => {
        if (ask) { sfx.click(); this.buffAsk = `i${it.uid}`; bus.emit(EV.TOAST, `⚠ จะทับบัพ ${clash} — คนละบัพจะทับกัน (บัพเดียวกันจะบวกเวลา) • แตะอีกครั้งเพื่อยืนยัน`, '#ffd84a'); this.rebuild(); return; }
        this.buffAsk = '';
        const r = act('useItem', { uid: it.uid }); if (!r) return;
        if (r.full) { sfx.error(); bus.emit(EV.TOAST, `⏳ ${r.buff} สะสมเวลาเต็มแล้ว (สูงสุด ${vipActive(s) ? '3 ชม. • VIP' : '1 ชม. • VIP ได้ 3 ชม.'})`, '#ffd84a'); return; }
        sfx.potion();
        bus.emit(EV.TOAST, r.recall ? 'วาร์ปกลับหมู่บ้าน...' : r.buff && r.stacked && r.left ? `⏳ ${r.buff} ต่อเวลา → เหลือ ${clock(r.left)}` : r.buff ? `${r.buff} ทำงานแล้ว` : r.food ? `อาหารในคลัง +${r.food}` : `ฟื้นฟู ${r.heal ? 'HP +' + r.heal : 'MP +' + r.mana}`, '#9fffb0');
        if (!s.inventory.find(i => i.uid === it.uid)) this.selUid = null; saveGame(s); bus.emit(EV.STATE_CHANGED);
        if (r.recall) { this.close(); bus.emit('td:recall'); } else this.rebuild();
      }, 0x1f4a2a);
      if (def.type === 'weapon' || def.type === 'armor' || def.type === 'accessory') {
        if (isEquipped(s, it.uid)) btn('ถอดออก', () => { act('unequip', { uid: it.uid }); sfx.equip(); saveGame(s); bus.emit(EV.STATE_CHANGED); this.rebuild(); });
        else {
          btn('สวมใส่', () => { act('equip', { uid: it.uid }); sfx.equip(); bus.emit(EV.TOAST, `สวมใส่ ${def.name}`, '#ffe7a0'); saveGame(s); bus.emit(EV.STATE_CHANGED); this.rebuild(); }, 0x1f3a5a);   // the item jumps into its slot at once
          btn('ย่อยเป็นวัตถุดิบ', () => { const r = act('dismantle', { uid: it.uid }); if (r) { sfx.upgradeOk(); bus.emit(EV.TOAST, `ได้ผลึกมานา x${r.shards}${r.cores ? ` แก่นโบราณ x${r.cores}` : ''}`, '#c89aff'); this.selUid = null; saveGame(s); bus.emit(EV.STATE_CHANGED); this.rebuild(); } }, 0x4a2a5a);
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
    if (isOnline()) { if (this.busyAct) return; this.busyAct = true; actServer('upgradeItem', { uid }).then(r => { this.busyAct = false; this.upgradeDone(uid, r); }); return; }   // the server rolls the dice
    this.upgradeDone(uid, act('upgradeItem', { uid }));
  }
  busyAct = false;
  upgradeDone(uid: number, r: ReturnType<typeof act<'upgradeItem'>>) {
    const s = S();
    const msg: Record<string, [string, string]> = {
      ok: ['ตีบวกสำเร็จ!', '#9fffb0'], fail: ['ตีบวกล้มเหลว... (เสียวัตถุดิบ)', '#ff8a8a'], max: ['ระดับสูงสุดแล้ว', '#ffe7a0'],
      no_gold: ['ทองไม่พอ', '#ff8a8a'], no_shard: ['ผลึกมานาไม่พอ (ดรอปจากมอนสเตอร์/ซื้อที่ร้าน)', '#ff8a8a'], invalid: ['ตีบวกไม่ได้', '#ff8a8a'],
    };
    const [t, col] = msg[r];
    if (r === 'ok') { sfx.upgradeOk(); bus.emit('td:fx', 'fx_upgrade_ok'); } else if (r === 'fail') { sfx.upgradeFail(); bus.emit('td:fx', 'fx_upgrade_fail'); } else sfx.error();
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
    c.add(k.text(lx + 8, ly + 6, `${s.name} • ${formName(s.cls, activeTier(s))} (ร่าง ${activeTier(s) + 1})   Lv ${s.level}   EXP ${s.exp}/${expToNext(s.level)}`, 9, '#ffe7a0'));
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
    // skill points: big and clear; every + shows what it gives, uses a point, and greys out with no points / at the top
    g.fillStyle(s.skillPts ? 0x1f3a1f : 0x2a1d12, 1).fillRoundedRect(rx + 6, ly + 4, rw - 12, 20, 4);
    c.add(k.text(rx + 12, ly + 7, `✨ แต้มสกิล: ${s.skillPts}`, 10, s.skillPts ? '#9fffb0' : '#a89878'));
    c.add(k.text(rx + rw - 12, ly + 9, s.skillPts ? 'กด + เพื่ออัปสกิล' : 'แต้มได้จาก: เลเวลอัป • บอสครั้งแรก • เควสต์หลัก • ล็อกอิน 7 วัน', 7.5, s.skillPts ? '#c8f0c0' : '#8a7a60').setOrigin(1, 0));
    currentSkills(s).map(id => SKILL_BY_ID[id]).forEach((sk, i) => {
      const sy = ly + 30 + i * 62;
      c.add(ui.add.image(rx + 20, sy + 16, skillIconKey(ui, sk)).setDisplaySize(30, 30));
      const slv = s.skillLv[sk.id] ?? 1, max = slv >= SKILL_MAX, can = !max && s.skillPts >= 1;
      const pct = (lv: number) => Math.round(sk.power * (1 + 0.15 * (lv - 1)) * 100), st = sk.stat === 'matk' ? 'MATK' : 'ATK';
      c.add(k.text(rx + 38, sy, `${sk.name}  Lv ${slv}${max ? ' (MAX)' : `/${SKILL_MAX}`}`, 9, '#9ad8ff'));
      c.add(k.text(rx + 38, sy + 13, `ตอนนี้: ${pct(slv)}% ${st}  •  MP ${sk.mp}  •  คูลดาวน์ ${sk.cooldown / 1000} วิ`, 7.5, '#d8ccb0', { wordWrap: { width: rw - 90 } }));
      c.add(k.text(rx + 38, sy + 26, max ? '✔ อัปเต็มแล้ว' : `อัป Lv ${slv + 1}: ${pct(slv)}% → ${pct(slv + 1)}% ${st} (แรงขึ้น +${pct(slv + 1) - pct(slv)}%)`, 7.5, max ? '#ffd84a' : can ? '#9fffb0' : '#8a7a60', { wordWrap: { width: rw - 90 } }));
      c.add(k.button(x + W - 54, sy + 4, 34, 24, max ? 'MAX' : '+', () => {
        if (!can) { sfx.error(); bus.emit(EV.TOAST, max ? 'สกิลนี้อัปเต็มแล้ว' : 'แต้มสกิลไม่พอ — เลเวลอัปเพื่อรับแต้มเพิ่ม', '#ffb080'); return; }
        const before = s.skillPts;
        if (act('upSkill', { id: sk.id })) {
          sfx.levelUp(); bus.emit(EV.STATE_CHANGED);
          bus.emit(EV.TOAST, `✨ ${sk.name} Lv ${slv + 1}! ${pct(slv)}% → ${pct(slv + 1)}% ${st} • แต้มสกิล ${before} → ${s.skillPts}`, '#9fffb0');
          this.rebuild();   // the points and the button change at once
        }
      }, { size: max ? 8 : 12, disabled: !can, color: 0x1f4a2a }));
    });
  }

  // ---------------- VILLAGE PLOT ----------------
  openPlot(i: number) { this.plot = i; this.open('plot'); }
  /** the bounty board: this slot's wandering lord, where, how long, what it pays */
  buildBounty(c: Phaser.GameObjects.Container) {
    const s = S(), ui = this.ui, k = this.k, b = act('bountyInfo', {});
    const W = Math.min(480, ui.VW - 16), H = 250, { x, y, g } = this.window(c, W, H, '📜 กระดานค่าหัว');
    const st = STAGES[b.n - 1], left = Math.max(0, b.until - Date.now()), mm = Math.floor(left / 60000), ss = Math.floor(left / 1000) % 60;
    g.fillStyle(0x2a1d12, 0.95).fillRoundedRect(x + 14, y + 32, W - 28, 150, 6).lineStyle(1, GOLD_D, 1).strokeRoundedRect(x + 14, y + 32, W - 28, 150, 6);
    const pk = `c_${b.mob.key}_idle`;
    if (ui.textures.exists(pk)) { const im = ui.add.image(x + 70, y + 100, pk, 0); im.setScale(96 / Math.max(im.width, im.height)); c.add(im); }
    else loadIdle(ui, [b.mob.key], () => { if (this.cur === 'bounty') this.rebuild(); });
    c.add(k.text(x + 130, y + 42, `👑 ${b.name}`, 13, '#ffb04a'));
    c.add(k.text(x + 130, y + 66, `📍 แผนที่ ${b.n} ${st.land.name} (มอน Lv${st.level})`, 9.5, '#e8dcc0'));
    c.add(k.text(x + 130, y + 84, b.killed ? '✅ คุณปราบไปแล้วในรอบนี้ — รอค่าหัวรอบถัดไป' : `⏱ เร่ร่อนอยู่อีก ${mm}:${String(ss).padStart(2, '0')} นาที`, 9.5, b.killed ? '#9fffb0' : '#ffe7a0'));
    c.add(k.text(x + 130, y + 104, `ค่าหัว: 💰${b.gold.toLocaleString()} + แก่นโบราณ 1 + ของดรอประดับบอส (Rare ขึ้นไป + ชิ้นส่วนเซ็ต)`, 8, '#9ad8ff', { wordWrap: { width: W - 160 } }));
    c.add(k.text(x + 130, y + 140, 'ตัวใหญ่ เลือดเยอะ ตีแรง — ชวนเพื่อนไปด้วยได้ • ค่าหัวใหม่ทุก 20 นาที', 7.5, '#a89878', { wordWrap: { width: W - 160 } }));
    c.add(k.button(x + W / 2 - 90, y + H - 50, 180, 26, b.killed ? 'รอรอบถัดไป' : `⚔ ไปแผนที่ ${b.n}`, () => { this.close(); bus.emit('td:goStage', b.n); }, { size: 10, color: 0x7a3a10, disabled: b.killed || s.level < st.req }));
  }
  /** mounts: the horse for gold, the limited fire dragon from playing; choose what you ride */
  buildMounts(c: Phaser.GameObjects.Container) {
    const s = S(), ui = this.ui, k = this.k, on = mountOn(s);
    const kinds = (['pet', 'horse', 'name'] as CosKind[]).filter(q => cosOwned(s, q)), aura = stormAuraLeft(s), extra = kinds.length || aura ? 40 : 0;
    const W = Math.min(560, ui.VW - 16), H = 270 + extra, { x, y, g } = this.window(c, W, H, '🐎 สัตว์ขี่');
    c.add(k.text(x + 16, y + 30, 'ขี่แล้ววิ่งเร็วขึ้น • ฮีโร่ทุกร่างขึ้นขี่ได้ • ตี/ใช้สกิล/เก็บของ = ลงจากหลังชั่วครู่ แล้วขึ้นขี่ต่อเอง • ในอาคารลงเดิน', 8, '#9ad8ff', { wordWrap: { width: W - 32 } }));
    const cw = (W - 44) / 2;
    MOUNT_ORDER.forEach((id, i) => {
      const d = MOUNTS[id], cx = x + 16 + i * (cw + 12), cy = y + 54, ch = H - 70 - extra, own = hasMount(s, id), riding = on === id;
      g.fillStyle(d.limited ? 0x2a1210 : 0x2a1d12, 0.95).fillRoundedRect(cx, cy, cw, ch, 6).lineStyle(d.limited ? 2 : 1, d.limited ? 0xff7a3a : GOLD_D, 1).strokeRoundedRect(cx, cy, cw, ch, 6);
      const tk = `m_${d.key}_idle`;
      const skin = id === 'horse' ? activeHorseSkin(s) : null;
      if (ui.textures.exists(tk)) { const im = ui.add.image(cx + cw / 2, cy + 74, tk, 1).setOrigin(0.5, 0.75); im.setScale(Math.min(1.25, 110 / im.width)); if (skin && SKIN_TINT[skin]) im.setTint(SKIN_TINT[skin]); c.add(im); }
      if (d.limited) c.add(k.text(cx + cw - 8, cy + 6, '✦ LIMITED ✦', 8, '#ffb04a').setOrigin(1, 0));
      c.add(k.text(cx + 10, cy + 96, `${d.name}${skin ? ' (ดำนิล)' : ''}`, 11, d.limited ? '#ffb04a' : '#ffe7a0'));
      c.add(k.text(cx + 10, cy + 114, `💨 วิ่งเร็วขึ้น ${Math.round((rideSpeed(d.speed, skin) - 1) * 100)}%`, 9, '#9fffb0'));
      c.add(k.text(cx + 10, cy + 130, own ? (riding ? '✅ กำลังใช้อยู่' : '✔ เป็นของคุณแล้ว') : d.price ? `ราคา 💰${d.price.gold.toLocaleString()} • ต้อง Lv${d.price.lv}` : `ได้จาก: ${d.limited}`, 8, own ? '#9fffb0' : '#e8dcc0', { wordWrap: { width: cw - 20 } }));
      const bx = cx + 10, by = cy + ch - 34, bw = cw - 20;
      if (own) c.add(k.button(bx, by, bw, 24, riding ? '🚶 ลงเดิน' : '🐎 ขี่ตัวนี้', () => { act('mountSelect', { id: riding ? null : id }); sfx.click(); bus.emit(EV.STATE_CHANGED); saveGame(s); this.rebuild(); }, { size: 9.5, color: riding ? 0x3a2a2a : 0x1f4a2a }));
      else if (d.price) c.add(k.button(bx, by, bw, 24, `🛒 ซื้อ 💰${d.price.gold.toLocaleString()}`, () => { const r = act('mountBuy', { id }); if (refused(r)) { sfx.error(); bus.emit(EV.TOAST, r.refused === 'gold' ? 'ทองไม่พอ' : r.refused === 'level' ? `ต้องเลเวล ${d.price!.lv}` : 'ซื้อไม่ได้', '#ff8a8a'); return; } sfx.levelUp(); bus.emit(EV.TOAST, `🐎 ได้ ${d.name} แล้ว! ขึ้นขี่เลย`, '#9fffb0'); bus.emit(EV.STATE_CHANGED); saveGame(s); this.rebuild(); }, { size: 9.5, color: 0x4a3a10, disabled: s.gold < d.price.gold || s.level < d.price.lv }));
      else c.add(k.text(cx + cw / 2, by + 6, DWHEEL_OPEN ? '🔒 ยังไม่ได้รับ' : '🔒 ยังไม่ได้รับ — ซื้อด้วยเงินจริงไม่ได้', 8, '#a89878').setOrigin(0.5, 0));
    });
    // ✨ the diamond wheel's looks (systems/cosmetics.ts): each on / off
    if (extra) {
      const ry = y + H - 46, NAMES: Record<CosKind, string> = { pet: '⛈ เมฆพายุ', horse: '🐴 สกินม้าดำนิล', name: '🏷 ชื่อสีทอง' };
      c.add(k.text(x + 16, ry, '✨ ของพิเศษ', 9, '#ffe7a0'));
      const bw = Math.min(150, (W - 110) / Math.max(1, kinds.length));
      kinds.forEach((q, i) => { const isOn = cosOn(s, q); c.add(k.button(x + 92 + i * (bw + 6), ry - 4, bw, 22, `${NAMES[q]}: ${isOn ? 'เปิด' : 'ปิด'}`, () => { act('cosmetic', { k: q, on: !isOn }); sfx.click(); bus.emit(EV.STATE_CHANGED); saveGame(s); this.rebuild(); }, { size: 8.5, color: isOn ? 0x1f4a2a : 0x3a2a2a })); });
      c.add(k.text(x + 16, ry + 22, (aura ? `🌩 ออร่าพายุ เหลือ ${Math.floor(aura / 86400000)} วัน ${Math.floor(aura / 3600000) % 24} ชม. • ` : '') + (kinds.includes('pet') ? 'เมฆพายุ: วิ่งเร็วขึ้น 5% + ⚡ ลูกศรชี้ทางไปบอสเร่ร่อน และบอกเมื่อบอสโผล่แผนที่อื่น' : '') + (kinds.includes('horse') ? ' • ม้าดำนิล: วิ่งเร็วขึ้น 35% (ม้าปกติ 30%)' : ''), 7.5, '#c8b898', { wordWrap: { width: W - 32 } }));
    }
  }
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
          if (isOnline()) { if (this.busyAct) return; this.busyAct = true; actServer('craft', { slot }).then(res => { this.busyAct = false; crafted(res); }); return; }   // the server rolls the dice
          crafted(act('craft', { slot }));
        }, { size: 10, color: 0x6a3a10 }));
        const crafted = (res: ReturnType<typeof act<'craft'>>) => {
          if (res.ok) {
            for (const t of dailyProgress(s, 'craft')) bus.emit(EV.TOAST, `✔ ภารกิจประจำวัน: ${DAILY_NAMES[t.kind]} สำเร็จ! +${t.gold} G`, '#9fffb0');
            sfx.upgradeOk(); bus.emit('td:fx', res.rar >= 4 ? 'fx_ore_rare' : 'fx_upgrade_ok'); const col = '#' + RARITY_COLORS[res.rar].toString(16).padStart(6, '0');
            bus.emit(EV.TOAST, `หลอมได้ [${RARITY_NAMES[res.rar]}] ${itemDef(res.id).name}!`, col);
            const fl = ui.add.rectangle(0, 0, ui.VW, 360, RARITY_COLORS[res.rar], 0.35).setOrigin(0);
            ui.tweens.add({ targets: fl, alpha: 0, duration: 500, onComplete: () => fl.destroy() });
            bus.emit(EV.STATE_CHANGED); this.rebuild();
          } else { sfx.error(); bus.emit(EV.TOAST, { no_res: 'วัตถุดิบไม่พอ', no_shard: 'ผลึกมานาไม่พอ', bag_full: 'กระเป๋าเต็ม', no_forge: 'ยังไม่มีโรงหลอม' }[res.reason], '#ff8a8a'); }
        };
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
        const clash = buffClash(s, { slot: 'buff', stat: md.stat, pct: p.pct, meal: true }), ask = !!clash && this.buffAsk !== `m${m}`;
        c.add(k.button(rx + rw - 90, yy + 20, 78, 26, ask || !clash ? 'ทำ' : '⚠ ยืนยัน', () => {
          if (ask) { sfx.click(); this.buffAsk = `m${m}`; bus.emit(EV.TOAST, `⚠ จะทับบัพ ${clash} — คนละบัพจะทับกัน (บัพเดียวกันจะบวกเวลา) • แตะอีกครั้งเพื่อยืนยัน`, '#ffd84a'); this.rebuild(); return; }
          this.buffAsk = '';
          const r = act('cook', { meal: m });
          if (r === 'ok') { sfx.heal(); const left = (s.buff?.until ?? 0) - Date.now(); bus.emit(EV.TOAST, `กิน${md.name}! +${p.pct}% • เหลือ ${clock(left)}`, '#9fffb0'); bus.emit(EV.STATE_CHANGED); this.rebuild(); }
          else { sfx.error(); bus.emit(EV.TOAST, r === 'full' ? `⏳ สะสมเวลาเต็มแล้ว (สูงสุด ${vipActive(s) ? '3 ชม. • VIP' : '1 ชม. • VIP ได้ 3 ชม.'})` : r === 'no_food' ? 'อาหารไม่พอ — ล่าสัตว์ใน 🌿 ป่าดงดิบ' : 'ยังทำไม่ได้', '#ff8a8a'); }
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
        if (ar.refund) bus.emit(EV.TOAST, `✨ คืนแต้มสกิล ${ar.refund} แต้ม — ไปอัปสกิลชุดใหม่ได้เลย (หน้าตัวละคร)`, '#9fffb0');
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
  // ---------------- 🎡 the gold lucky wheel (systems/wheel.ts) ----------------
  // ---------------- 🎁 selector chest: choose one piece of gear of its rarity ----------------
  pickUid = -1; pickSel = ''; pickPage = 0;
  buildPick(c: Phaser.GameObjects.Container) {
    const s = S(), ui = this.ui, k = this.k, ch = s.inventory.find(i => i.uid === this.pickUid), cd = ch ? itemDef(ch.id) : null;
    const W = Math.min(620, ui.VW - 16), H = 330;
    const { x, y, g } = this.window(c, W, H, cd ? `🎁 ${cd.name}` : '🎁 หีบเลือกอุปกรณ์');
    if (!ch || !cd || cd.pick === undefined) { c.add(k.text(x + W / 2, y + 140, 'ไม่พบหีบ', 11, '#8a7a60').setOrigin(0.5)); return; }
    const list = pickChoices(cd.pick, s.cls), per = 12, pages = Math.max(1, Math.ceil(list.length / per)); this.pickPage = Math.min(this.pickPage, pages - 1);
    const col = '#' + RARITY_COLORS[cd.pick].toString(16).padStart(6, '0');
    c.add(k.text(x + 16, y + 34, `เลือกอุปกรณ์ ${RARITY_NAMES[cd.pick]} ได้ 1 ชิ้น (มีหีบ ${ch.qty}) • ของตรงอาชีพคุณขึ้นก่อน • ค่าพิเศษสุ่มเหมือนของดรอป`, 8, '#c8b898'));
    const T: Record<string, string> = { weapon: 'อาวุธ', armor: 'เกราะ', accessory: 'เครื่องประดับ' };
    list.slice(this.pickPage * per, this.pickPage * per + per).forEach((d, i) => {
      const cx = x + 14 + (i % 2) * ((W - 28) / 2 + 0), cy = y + 52 + Math.floor(i / 2) * 36, cw = (W - 34) / 2, on = this.pickSel === d.id, other = !!d.cls && d.cls !== s.cls && s.cls !== 'novice';
      g.fillStyle(on ? 0x3a2a10 : 0x1a140e, 0.92).fillRoundedRect(cx, cy, cw, 32, 3).lineStyle(on ? 2 : 1, on ? GOLD : RARITY_COLORS[cd.pick!], on ? 1 : 0.5).strokeRoundedRect(cx, cy, cw, 32, 3);
      c.add(this.ico(cx + 16, cy + 16, `icon_${d.icon}`, 26));
      c.add(k.text(cx + 34, cy + 3, `${d.name}${other ? '  (อาชีพอื่น)' : ''}`, 8.5, other ? '#8a7a60' : col));
      c.add(k.text(cx + 34, cy + 17, [T[d.type] ?? d.type, ...statLines(d, { uid: -1, id: d.id, qty: 1, upg: 0 } as InvItem).slice(0, 2)].join('  •  '), 6.8, '#c8b898'));
      const z = ui.add.zone(cx, cy, cw, 32).setOrigin(0).setInteractive(); z.on('pointerup', () => { sfx.click(); this.pickSel = d.id; this.rebuild(); }); c.add(z);
    });
    if (pages > 1) {
      c.add(k.button(x + 14, y + H - 30, 30, 18, '◀', () => { this.pickPage = (this.pickPage + pages - 1) % pages; this.rebuild(); }, { size: 8 }));
      c.add(k.text(x + 54, y + H - 27, `${this.pickPage + 1}/${pages}`, 8, '#c8b898'));
      c.add(k.button(x + 90, y + H - 30, 30, 18, '▶', () => { this.pickPage = (this.pickPage + 1) % pages; this.rebuild(); }, { size: 8 }));
    }
    const sel = list.find(d => d.id === this.pickSel);
    c.add(k.button(x + W - 214, y + H - 32, 200, 24, sel ? `✔ รับ ${sel.name}` : 'แตะเลือกอุปกรณ์ก่อน', () => {
      if (!sel) return;
      actServer('openPick', { uid: ch.uid, id: sel.id }).then(r => {
        if (refused(r)) { sfx.error(); bus.emit(EV.TOAST, r.refused === 'bag' ? 'กระเป๋าเต็ม' : 'เปิดไม่สำเร็จ ลองใหม่', '#ff8a8a'); return; }
        sfx.levelUp(); bus.emit('loot:popup', { id: r.id, rar: r.rar }); bus.emit(EV.STATE_CHANGED); this.pickSel = '';
        if (S().inventory.some(i => i.uid === ch.uid)) this.rebuild(); else this.open('bag');
      });
    }, { size: 9, color: 0x1f4a2a, disabled: !sel }));
  }
  wheelRot = 0; wheelBusy = false; wheelLast: string[] = [];
  /** one lucky-wheel window for both wheels (gold 🎡 and diamond 💎) */
  wheelPanel(c: Phaser.GameObjects.Container, o: {
    title: string; segs: readonly { key: string; label: string; item: string; color: number; keep?: boolean }[];
    line1: string; line2: string; btn1: string; btn10: string; can: (n: number) => string | null;
    spin: (n: number) => Promise<unknown>; text: (p: { seg: number; rar?: number }) => string; odds?: (i: number) => number;
    gearRar?: (key: string) => number; extra?: (c: Phaser.GameObjects.Container, x: number, y: number, w: number) => void; note?: string;
  }) {
    const ui = this.ui, k = this.k;
    const W = Math.min(620, ui.VW - 16), H = 330;
    const { x, y } = this.window(c, W, H, o.title);
    { // switch between the two wheels (both reachable from the top bar's 🎡 button)
      const gold = this.cur === 'wheel', other = gold ? 'dwheel' : 'wheel'; this.lastWheel = this.cur as 'wheel' | 'dwheel';
      if (gold ? DWHEEL_OPEN || isAdmin() : WHEEL_OPEN || isAdmin()) c.add(k.button(x + W - 140, y + 6, 104, 20, gold ? '💎 กงล้อเพชร ▸' : '🎡 กงล้อทอง ▸', () => this.open(other), { size: 8.5, color: gold ? 0x3a2a6a : 0x6a4a10 }));
    }
    const R = 112, cx = x + 20 + R, cy = y + 40 + R + 6, N = o.segs.length, step = Math.PI * 2 / N;
    // the wheel: a container turned by the spin (segment i is centred at angle i*step from the top, clockwise)
    const wh = ui.add.container(cx, cy); c.add(wh); wh.rotation = this.wheelRot;
    const wg = ui.add.graphics(); wh.add(wg);
    o.segs.forEach((sg, i) => {
      const a0 = -Math.PI / 2 + i * step - step / 2, a1 = a0 + step;
      wg.fillStyle(sg.color, 1).slice(0, 0, R, a0, a1, false).fillPath();
      wg.lineStyle(2, 0x1a120c, 1).beginPath().moveTo(0, 0).lineTo(Math.cos(a0) * R, Math.sin(a0) * R).strokePath();
      const am = a0 + step / 2, ir = R * 0.66, gr = o.gearRar?.(sg.key) ?? -1;
      const icon = sg.item ? `icon_${itemDef(sg.item).icon}` : '';
      if (icon && ui.textures.exists(icon)) { const im = this.ico(Math.cos(am) * ir, Math.sin(am) * ir, icon, 26); im.setRotation(am + Math.PI / 2); wh.add(im); }
      else { const em = sg.label.match(/^\p{Extended_Pictographic}/u)?.[0] ?? '🪵'; const t = k.text(Math.cos(am) * ir, Math.sin(am) * ir, em, 15, '#ffffff').setOrigin(0.5).setRotation(am + Math.PI / 2); wh.add(t); }
      const tag = gr >= 0 ? (gr >= 4 ? 'L' : gr >= 3 ? 'SR' : 'R') : sg.keep ? '🔒' : '';
      if (tag) { const t = k.text(Math.cos(am) * R * 0.38, Math.sin(am) * R * 0.38, tag, 9, '#ffffff', { fontStyle: 'bold', stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5).setRotation(am + Math.PI / 2); wh.add(t); }
    });
    wg.lineStyle(4, 0xd9b45a, 1).strokeCircle(0, 0, R).fillStyle(0x2a1d12, 1).fillCircle(0, 0, 16).lineStyle(2, 0xd9b45a, 1).strokeCircle(0, 0, 16);
    for (let i = 0; i < N; i++) { const a = -Math.PI / 2 + i * step - step / 2; wg.fillStyle(0xffe7a0, 1).fillCircle(Math.cos(a) * (R - 5), Math.sin(a) * (R - 5), 2.5); }
    { const pg = ui.add.graphics(); c.add(pg);   // (the pointer on top of the wheel — director: it was covered)
      pg.fillStyle(0x000000, 0.35).fillTriangle(cx - 12, cy - R - 13, cx + 12, cy - R - 13, cx + 1, cy - R + 13);
      pg.fillStyle(0xffd84a, 1).fillTriangle(cx - 12, cy - R - 16, cx + 12, cy - R - 16, cx, cy - R + 12).lineStyle(2.5, 0x5a3a10, 1).strokeTriangle(cx - 12, cy - R - 16, cx + 12, cy - R - 16, cx, cy - R + 12);
      pg.fillStyle(0xfff4c8, 1).fillCircle(cx, cy - R - 10, 3); }
    const rx = cx + R + 24, rw = x + W - 14 - rx;
    c.add(k.text(rx, y + 36, o.line1, 10, '#ffe7a0'));
    c.add(k.text(rx, y + 52, o.line2, 8, '#c8b898'));
    const spin = (n: number) => {
      if (this.wheelBusy) return;
      const why = o.can(n); if (why) { sfx.error(); bus.emit(EV.TOAST, why, '#ff8a8a'); return; }
      this.wheelBusy = true; sfx.click();
      o.spin(n).then(r0 => {
        const r = r0 as { prizes: { seg: number; rar?: number; id?: string; set?: string }[] } | { refused: string };
        if (refused(r)) { this.wheelBusy = false; sfx.error(); bus.emit(EV.TOAST, r.refused === 'bag' ? `กระเป๋าต้องว่างอย่างน้อย ${n} ช่อง` : r.refused === 'gold' ? 'ทองไม่พอ' : r.refused === 'diamonds' ? 'เพชรไม่พอ' : r.refused === 'closed' ? 'กงล้อยังไม่เปิด' : 'หมุนไม่สำเร็จ ลองใหม่', '#ff8a8a'); if (this.cur) this.rebuild(); return; }
        // land on the rarest prize of the spin (the smallest weight = the rarest)
        const wOf = (p: { seg: number }) => (o.segs[p.seg] as { w?: number }).w ?? 999;
        const best = r.prizes.reduce((b, p) => wOf(p) < wOf(b) ? p : b, r.prizes[r.prizes.length - 1]);
        const target = -best.seg * step, turns = Math.PI * 2 * (5 + Math.floor(Math.random() * 2));
        const from = this.wheelRot % (Math.PI * 2), to = target - turns + (Math.random() - 0.5) * step * 0.6;
        wh.rotation = from;
        ui.tweens.add({ targets: wh, rotation: to, duration: 3200, ease: 'Cubic.easeOut', onComplete: () => {
          this.wheelRot = to; this.wheelBusy = false; this.wheelLast = r.prizes.map(p => o.text(p)); sfx.levelUp();
          for (const p of r.prizes) if (p.id && (p.rar ?? 0) >= 2) bus.emit('loot:popup', { id: p.id, rar: p.rar, set: p.set });
          bus.emit(EV.TOAST, `🎡 ได้: ${this.wheelLast.slice(0, 3).join(' • ')}${this.wheelLast.length > 3 ? ` และอีก ${this.wheelLast.length - 3}` : ''}`, '#ffd84a');
          bus.emit(EV.STATE_CHANGED); if (this.cur) this.rebuild();
        } });
      });
    };
    c.add(k.button(rx, y + 70, rw, 26, o.btn1, () => spin(1), { size: 9.5, color: 0x6a4a10, disabled: this.wheelBusy }));
    c.add(k.button(rx, y + 100, rw, 26, o.btn10, () => spin(10), { size: 9, color: 0x8a5a10, disabled: this.wheelBusy }));
    c.add(k.text(rx, y + 134, 'รางวัลในกงล้อ', 9, '#ffd84a'));
    c.add(k.text(rx, y + 150, o.segs.map((q, i) => `${q.keep ? '🔒' : ''}${q.label}${o.odds ? ` ${o.odds(i).toFixed(1)}%` : ''}`).join(' • '), 7.2, '#c8b898', { wordWrap: { width: rw } }));
    if (o.note) c.add(k.text(rx, y + 192, o.note, 7, '#9ad8ff', { wordWrap: { width: rw } }));
    const ly = o.note ? y + 214 : y + 196;
    c.add(k.text(rx, ly, this.wheelLast.length ? 'รอบล่าสุดได้:' : 'กระเป๋าต้องว่างเท่าจำนวนครั้งที่หมุน', 9, this.wheelLast.length ? '#9fffb0' : '#8a7a60'));
    if (this.wheelLast.length) c.add(k.text(rx, ly + 16, this.wheelLast.join(' • '), 7.5, '#f3e6c4', { wordWrap: { width: rw } }));
    o.extra?.(c, rx, y + H - 40, rw);
  }
  buildWheel(c: Phaser.GameObjects.Container) {
    const s = S();
    this.wheelPanel(c, { title: '🎡 กงล้อนำโชค', segs: WHEEL_SEGS,
      line1: `หมุนด้วยทอง • ครั้งละ 💰 ${WHEEL_PRICE.toLocaleString()}`, line2: `มี 💰 ${s.gold.toLocaleString()}  •  รางวัลใหญ่สุด: อุปกรณ์ Legend`,
      btn1: `หมุน 1 ครั้ง  •  💰 ${WHEEL_PRICE.toLocaleString()}`, btn10: `หมุน 10 ครั้ง  •  💰 ${(WHEEL_PRICE * 10).toLocaleString()}`,
      can: n => S().gold < WHEEL_PRICE * n ? 'ทองไม่พอ' : null, spin: n => actServer('wheelSpin', { n }),
      text: p => this.wheelName(p as WheelPrize), gearRar: key => key === 'legend' ? 4 : key === 'sr' ? 3 : key === 'rare' ? 2 : -1 });
  }
  buildDWheel(c: Phaser.GameObjects.Container) {
    const s = S() as ReturnType<typeof S> & { diamonds?: number; stars?: number };
    this.wheelPanel(c, { title: '💎 กงล้อเพชร', segs: DWHEEL_SEGS,
      line1: `หมุนด้วยเพชร • ครั้งละ 💎 ${DWHEEL_PRICE} • 10 ครั้ง 💎 ${DWHEEL_PRICE10}`, line2: `มี 💎 ${(s.diamonds ?? 0).toLocaleString()}  •  ⭐ ${s.stars ?? 0}/${STAR_TRADE}`,
      btn1: `หมุน 1 ครั้ง  •  💎 ${DWHEEL_PRICE}`, btn10: `หมุน 10 ครั้ง  •  💎 ${DWHEEL_PRICE10} (ลด 10%)`,
      can: n => ((S() as typeof s).diamonds ?? 0) < (n === 10 ? DWHEEL_PRICE10 : DWHEEL_PRICE) ? 'เพชรไม่พอ — เติมเพชรที่ร้าน 💎' : null, spin: n => actServer('dwheelSpin', { n }),
      text: p => (p as unknown as { text: string }).text, odds: DIAMOND_ODDS_SHOWN ? dChance : undefined,
      note: '🔒 = ได้ไปต่อ OBT • ของอื่นจะหายตอนเปิด OBT • หมุนทุกครั้งได้ ⭐ 1 เหรียญ (ไปต่อ OBT)',
      extra: (cc, ex, ey, ew) => {
        const k = this.k, st = s.stars ?? 0, ok = st >= STAR_TRADE, half = (ew - 6) / 2;
        const trade = (what: 'dragon' | 'cloud') => actServer('starTrade', { what }).then(r => { if (refused(r)) { sfx.error(); bus.emit(EV.TOAST, r.refused === 'owned' ? 'มีอยู่แล้ว' : r.refused === 'stars' ? `ต้องมี ⭐ ${STAR_TRADE}` : 'แลกไม่สำเร็จ', '#ff8a8a'); return; } sfx.levelUp(); bus.emit(EV.TOAST, what === 'dragon' ? '🐉 ได้มังกรเพลิงนิรันดร์!' : '⛈ ได้เมฆพายุ!', '#ffd84a'); bus.emit(EV.STATE_CHANGED); this.rebuild(); });
        cc.add(k.button(ex, ey, half, 24, `⭐${STAR_TRADE} → 🐉 มังกร`, () => trade('dragon'), { size: 8, color: 0x6a1a1a, disabled: !ok }));
        cc.add(k.button(ex + half + 6, ey, half, 24, `⭐${STAR_TRADE} → ⛈ เมฆ`, () => trade('cloud'), { size: 8, color: 0x3a2a6a, disabled: !ok }));
      } });
  }
  wheelName(p: WheelPrize) { return p.res ? `${p.res === 'wood' ? '🪵 ไม้' : p.res === 'stone' ? '🪨 หิน' : '🍖 อาหาร'} ${p.qty}` : `${itemDef(p.id!).name}${p.qty > 1 ? ' x' + p.qty : ''}${p.rar !== undefined && p.rar >= 2 ? ` [${RARITY_NAMES[p.rar]}]` : ''}`; }
  // ---------------- 👑 VIP loot settings (systems/lootOpt.ts) ----------------
  buildLootOpt(c: Phaser.GameObjects.Container) {
    const s = S(), ui = this.ui, k = this.k, vip = vipActive(s);
    const W = Math.min(560, ui.VW - 16), H = 300;
    const { x, y, g } = this.window(c, W, H, '👑 ตั้งค่าเก็บของ (VIP)');
    const top = y + 34, names = RARITY_NAMES, col = (r: number) => '#' + RARITY_COLORS[r].toString(16).padStart(6, '0');
    if (!vip) {
      c.add(k.text(x + W / 2, top + 50, '🔒 เฉพาะ VIP\nเลือกเก็บเฉพาะอุปกรณ์ระดับที่ต้องการ + ย่อยอุปกรณ์ระดับต่ำเป็นเศษมานาอัตโนมัติ', 11, '#ffe7a0', { align: 'center' }).setOrigin(0.5, 0));
      c.add(k.button(x + W / 2 - 70, top + 120, 140, 26, '👑 ดู VIP', () => this.open('premium'), { size: 10, color: 0x4a2a6a }));
      return;
    }
    // tick boxes: up to 3 rarities each (Legend / SL are always picked up and never dismantled)
    const row = (yy: number, which: 'keep' | 'dis', title: string, note: string) => {
      const cur = lootOpt(s)[which];
      c.add(k.text(x + 16, yy, `${title}  (${cur.length}/${LOOT_MAX})`, 10.5, '#ffd84a')); c.add(k.text(x + 16, yy + 16, note, 7.5, '#c8b898', { wordWrap: { width: W - 32 } }));
      const bw = (W - 32 - (LOOT_RARS.length - 1) * 6) / LOOT_RARS.length;
      LOOT_RARS.forEach((r, i) => {
        const on = cur.includes(r), bx = x + 16 + i * (bw + 6), by = yy + 40;
        g.fillStyle(on ? 0x3a2a10 : 0x2a1d12, 0.95).fillRoundedRect(bx, by, bw, 34, 4).lineStyle(on ? 2 : 1, on ? GOLD : GOLD_D, 1).strokeRoundedRect(bx, by, bw, 34, 4);
        c.add(k.text(bx + bw / 2, by + 10, `${on ? '☑' : '☐'} ${names[r]}`, 9, r ? col(r) : '#f3e6c4').setOrigin(0.5, 0));
        const z = ui.add.zone(bx, by, bw, 34).setOrigin(0).setInteractive();
        z.on('pointerup', () => { if (!toggleLoot(s, which, r)) { sfx.error(); bus.emit(EV.TOAST, `เลือกได้ไม่เกิน ${LOOT_MAX} อย่าง — เอาอันเดิมออกก่อน`, '#ff8a8a'); return; } sfx.click(); saveGame(s); this.rebuild(); });
        c.add(z);
      });
    };
    row(top, 'keep', '⛏ เก็บอุปกรณ์ระดับ (ติ๊กได้ไม่เกิน 3)', 'ไม่ติ๊กเลย = เก็บทุกระดับ • ระดับที่ไม่ได้ติ๊กจะทิ้งไว้บนพื้น • Legend / SL เก็บเสมอ • วัตถุดิบ ยา ของอื่นเก็บเสมอ');
    row(top + 92, 'dis', '⚙ ย่อยอัตโนมัติเมื่อเก็บ (ติ๊กได้ไม่เกิน 3)', 'ระดับที่ติ๊ก → เก็บแล้วกลายเป็นเศษมานาทันที (ไม่กินช่องกระเป๋า) • ไม่ย่อย Legend / SL และชุดเซ็ต');
    const o = lootOpt(s), nm = (l: number[]) => l.map(r => names[r]).join(', ');
    c.add(k.text(x + W / 2, top + 196, `ตอนนี้: เก็บ ${o.keep.length ? nm(o.keep) + ' + Legend/SL' : 'ทุกระดับ'} • ${o.dis.length ? 'ย่อย ' + nm(o.dis) : 'ไม่ย่อยอัตโนมัติ'}`, 8, '#9ad8ff', { align: 'center', wordWrap: { width: W - 32 } }).setOrigin(0.5, 0));
  }
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
      const pk = `c_${formKeyOf(s.cls, t, s.look)}_idle`;
      if (ui.textures.exists(pk)) { const im = ui.add.image(bx + bw / 2, by + 44, pk, 0); im.setScale(70 / Math.max(im.width, im.height)); c.add(im); }
      c.add(k.text(bx + bw / 2, by + 84, formName(s.cls, t) + (on ? ' ✔' : ''), 9.5, on ? '#ffd84a' : '#f3e6c4').setOrigin(0.5, 0));
      c.add(k.text(bx + bw / 2, by + 100, classSkills(s.cls, t).map(q => SKILL_BY_ID[q].name).join(' • '), 6.5, '#9ad8ff', { align: 'center', wordWrap: { width: bw - 8 } }).setOrigin(0.5, 0));
      const z = ui.add.zone(bx, by, bw, 128).setOrigin(0).setInteractive();
      z.on('pointerup', () => { s.useTier = t; sfx.levelUp(); bus.emit(EV.TOAST, `สวมร่าง ${formName(s.cls, t)}`, '#ffd84a'); this.close(); bus.emit(EV.STATE_CHANGED); });
      c.add(z);
    });
    // the first form's look (free to change any time)
    c.add(k.text(x + 16, y + H - 46, 'รูปลักษณ์ร่างแรก (ชาวบ้าน)', 9, '#ffe7a0'));
    ([['m', '👨 ชาวบ้านชาย'], ['f', '👩 ชาวบ้านหญิง']] as const).forEach(([lk, label], i) => c.add(k.button(x + 16 + i * 128, y + H - 30, 120, 20, label + ((s.look ?? 'm') === lk ? ' ✔' : ''), () => {
      s.look = lk; sfx.cloth(); saveGame(s); bus.emit(EV.STATE_CHANGED); this.rebuild();
    }, { size: 8.5, color: (s.look ?? 'm') === lk ? 0x6a4a10 : 0x2a1d12 })));
    if (s.cls === 'novice') c.add(k.text(x + 180, top + 170, `ถึง Lv${FORM_LEVEL[1]} แล้วไปคุยกับผู้เฒ่าเพื่อเลือกสายอาชีพ`, 9, '#a89878'));
  }

  // ---------------- TEST: FORM SWITCHER ----------------
  buildForms(c: Phaser.GameObjects.Container) {
    const s = S(), ui = this.ui, k = this.k;
    const W = Math.min(600, ui.VW - 16), H = 330;
    const { x, y } = this.window(c, W, H, '👑 แอดมิน: เปลี่ยนอาชีพ / ร่าง');
    const cols = 4, bw = (W - 28 - (cols - 1) * 6) / cols;
    ALL_FORMS.forEach((f, i) => {
      const r = i === 0 ? 0 : 1 + Math.floor((i - 1) / 3), col = i === 0 ? 0 : Math.floor((i - 1) / 3);
      const row = i === 0 ? 0 : 1 + ((i - 1) % 3);
      void r;
      const bx = x + 14 + col * (bw + 6), by = y + 32 + row * 52;
      const cur = s.cls === f.cls && s.tier === f.tier;
      c.add(k.button(bx, by, bw, 44, `${formName(f.cls, f.tier)}\nร่าง ${f.tier + 1} • Lv${FORM_LEVEL[f.tier]}+`, () => {
        if (refused(act('adminForm', { cls: f.cls, tier: f.tier }))) { sfx.error(); return; }   // (the server checks it is the director's account)
        sfx.levelUp(); bus.emit(EV.TOAST, `สลับเป็น ${formName(f.cls, f.tier)}`, '#9ad8ff');
        this.close(); bus.emit(EV.STATE_CHANGED);
      }, { size: 8.5, color: cur ? 0x6a4a10 : 0x2a1d12 }));
    });
    c.add(k.text(x + 14, y + H - 22, 'เฉพาะบัญชีแอดมิน (ผู้กำกับ) — คนอื่นไม่เห็นปุ่มนี้', 8, '#ffd84a'));
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
  confirmOut = false;
  buildMenu(c: Phaser.GameObjects.Container) {
    const s = S(), ui = this.ui, k = this.k;
    // two columns so the window fits short phone screens (the close button must stay visible)
    const W = Math.min(520, ui.VW - 16), H = 302, colW = (W - 46) / 2;
    const { x, y } = this.window(c, W, H, 'เมนู');
    let n = 0;
    const b = (label: string, cb: () => void, color?: number) => { const col = n % 2, row = Math.floor(n / 2); c.add(k.button(x + 16 + col * (colW + 14), y + 34 + row * 26, colW, 22, label, cb, { size: 8.5, color })); n++; };
    { const n = mailWaiting(s); b(`📬 จดหมาย${n ? ` (${n})` : ''}`, () => this.open('mail'), n ? 0x7a4a10 : 0x4a3a10); }
    b(`📅 ล็อกอินรายวัน${loginInfo(s).ready ? ' (รับได้!)' : ''}`, () => this.open('login'), 0x4a3a10);
    b('🏛 กิลด์ & หมู่บ้านกิลด์', () => this.openGuild('home'), 0x4a3a10);
    b('📜 กระดานค่าหัว (บอสเร่ร่อน)', () => this.open('bounty'), 0x4a3a10);
    b('🐎 สัตว์ขี่', () => this.open('mounts'), 0x4a3a10);
    if (CBT_ACTIVE) b(`🎁 ของขวัญ CBT${cbtReady(s) ? ' (รับได้!)' : ''}`, () => this.open('cbt'), 0x5a2a6a);
    b(`🏆 สะสม & ฉายา${ACHS.some(a => !titlesOf(s).includes(a.id) && achProgress(s, a) >= a.need) ? ' (รับได้!)' : ''}`, () => this.open('collection'), 0x4a3a10);
    // a guest links a Google account here and keeps everything (director)
    if (accountToken() && !googleLinked()) b('🔗 ผูกบัญชี Google (ของไม่หาย)', () => {
      this.close(); saveGame(s);
      openLinkGoogle(r => {
        if (r === 'switched') { location.reload(); return; }   // that Google account had a hero: load it
        bus.emit(EV.TOAST, '✔ ผูก Google แล้ว — เข้าเครื่องไหนก็เล่นตัวละครนี้ต่อได้', '#9fffb0');
        if (!accountName()) askName(n => bus.emit(EV.TOAST, `✔ ยินดีต้อนรับ ${n}!`, '#ffd84a'));
      });
    }, 0x1f4a6a);
    b('💾 บันทึกเกม', () => { const ok = saveGame(s); bus.emit(EV.TOAST, ok ? 'บันทึกเกมแล้ว' : 'บันทึกไม่สำเร็จ', ok ? '#9fffb0' : '#ff8a8a'); this.close(); }, 0x1f4a2a);
    b('📂 โหลดเกมล่าสุด', () => {
      const st = loadGame();
      if (!st) { bus.emit(EV.TOAST, 'ไม่พบเซฟ', '#ff8a8a'); return; }
      runtime.state = st;
      this.close();
      ui.reloadWorld();
    });
    b(`🔊 เสียง: ${s.sfx ? Math.round(uiOpt(s).vol * 100) + '%' : 'ปิด'} (แตะเพื่อปรับ)`, () => this.open('uiopt'));
    b('⛶ เต็มจอ', () => { this.close(); ui.toggleFullscreen(); });
    b('🖥 ปรับ UI & เสียง (แถบเลื่อน)', () => this.open('uiopt'), 0x2a4a5a);
    b(lang() === 'en' ? '🌐 ภาษาไทย' : '🌐 Language: English', () => { saveGame(s); setLang(lang() === 'en' ? 'th' : 'en'); location.reload(); }, 0x2a4a5a);
    if (DWHEEL_OPEN || isAdmin()) b(DWHEEL_OPEN ? '💎 กงล้อเพชร' : '💎 กงล้อเพชร (แอดมินทดสอบ — ผู้เล่นยังไม่เห็น)', () => this.open('dwheel'), 0x3a2a6a);
    if (WHEEL_OPEN || isAdmin()) b(WHEEL_OPEN ? '🎡 กงล้อนำโชค' : '🎡 กงล้อนำโชค (แอดมินทดสอบ — ผู้เล่นยังไม่เห็น)', () => this.open('wheel'), 0x6a4a10);
    if (isAdmin()) b('👑 แอดมิน: เปลี่ยนอาชีพ / ร่าง', () => this.open('forms'), 0x5a4a10);   // (the director's account only)
    if (isAdmin()) b('👑 เว็บหลังบ้าน (ดูทุกอย่างในเกม)', () => { window.open('./admin.html', '_blank'); }, 0x5a4a10);
    // sign out (Google accounts only — a guest who signs out could never come back to that hero)
    if (googleLinked()) {
      if (!this.confirmOut) b('🚪 ออกจากระบบ', () => { this.confirmOut = true; this.rebuild(); }, 0x4a2a2a);
      else b('⚠ ยืนยันออกจากระบบ (ตัวละครอยู่กับ Google)', () => { saveGame(s); showWait(); signOut().then(() => location.reload()); }, 0x8a1a1a);
    }
    if (!this.confirmNew) b('🆕 เริ่มเกมใหม่', () => { this.confirmNew = true; this.rebuild(); }, 0x5a1a1a);
    else b('⚠ ยืนยัน! ลบเซฟและเริ่มใหม่', () => { deleteSave(); location.reload(); }, 0x8a1a1a);
    c.add(k.text(x + W / 2, y + H - 16, `เวลาเล่น ${Math.floor(s.playTime / 60)} นาที  •  v0.3`, 7.5, '#8a7a60').setOrigin(0.5));
  }

  // ---------------- 💎 PREMIUM: top-up / VIP / diamond shop ----------------
  premTab: 'topup' | 'vip' | 'shop' = 'vip';
  buildPremium(c: Phaser.GameObjects.Container) {
    const s = S(), ui = this.ui, k = this.k;
    const W = Math.min(620, ui.VW - 16), H = 330;
    const { x, y, g } = this.window(c, W, H, '🏪 ร้านค้า');
    const tabs: [typeof this.premTab, string][] = [['vip', '👑 บัตร VIP'], ['shop', '💎 ร้านเพชร'], ['topup', '💳 เติมเพชร']];
    tabs.forEach(([id, label], i) => c.add(k.button(x + 14 + i * 104, y + 30, 98, 22, label, () => { this.premTab = id; this.rebuild(); }, { size: 9, color: this.premTab === id ? 0x6a4a10 : 0x2a1d12 })));
    c.add(k.text(x + W - 16, y + 34, `💎 ${diamonds(s).toLocaleString()}`, 11, '#8fe8ff').setOrigin(1, 0));
    const top = y + 60;
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
        c.add(k.button(cx + 6, top + 124, cw - 12, 20, 'ซื้อ', () => { void openTopup(v.id, (t, col) => bus.emit(EV.TOAST, t, col ?? '#ffd84a'), () => { if (this.cur === 'premium') this.rebuild(); }); }, { size: 9, color: 0x1f4a2a }));
      });
      c.add(k.text(cx0, top + 160, 'บัตรใหม่ต่อเวลาจากที่เหลือได้ • ไม่ขายของแรงหรือเพิ่มโอกาสดรอปของแรร์ (ไม่ pay to win)', 7.5, '#c8b898', { wordWrap: { width: W - 276 } }));
      c.add(k.text(cx0, top + 196, 'กดซื้อ → สแกน QR ด้วยแอปธนาคาร → อัปโหลดสลิป → ได้ VIP อัตโนมัติ', 7.5, '#9fe8ff', { wordWrap: { width: W - 276 } }));
    } else if (this.premTab === 'topup') {
      const cw = (W - 28 - 4 * 6) / 5;
      DIAMOND_PACKS.forEach((p, i) => {
        const cx = x + 14 + i * (cw + 6);
        g.fillStyle(0x16222a, 0.95).fillRoundedRect(cx, top, cw, 170, 6).lineStyle(1.5, 0x5ac8e8, 1).strokeRoundedRect(cx, top, cw, 170, 6);
        c.add(k.text(cx + cw / 2, top + 14, '💎'.repeat(Math.min(3, i + 1)), 14).setOrigin(0.5, 0));
        c.add(k.text(cx + cw / 2, top + 50, p.diamonds.toLocaleString(), 15, '#8fe8ff', { fontStyle: 'bold' }).setOrigin(0.5, 0));
        if (p.bonus) c.add(k.text(cx + cw / 2, top + 72, `+${p.bonus} โบนัส`, 8, '#9fffb0').setOrigin(0.5, 0));
        c.add(k.text(cx + cw / 2, top + 100, `฿${p.thb.toLocaleString()}`, 13, '#ffffff').setOrigin(0.5, 0));
        c.add(k.button(cx + 6, top + 138, cw - 12, 22, 'เติม', () => { void openTopup(p.id, (t, col) => bus.emit(EV.TOAST, t, col ?? '#ffd84a'), () => { if (this.cur === 'premium') this.rebuild(); }); }, { size: 9, color: 0x1f4a5a }));
      });
      c.add(k.text(x + 14, top + 184, 'เพชรได้จากการเติมเงินจริงเท่านั้น • เติมครั้งแรก (ครั้งเดียวต่อไอดี) ได้เพชรหลัก x2 • ใช้ซื้อของในร้านเพชร (ความสะดวก / ความสวย)', 8, '#c8b898', { wordWrap: { width: W - 28 } }));
      c.add(k.text(x + 14, top + 214, 'กดเติม → สแกน QR ด้วยแอปธนาคาร (ยอดขึ้นเอง) → อัปโหลดสลิป → ระบบตรวจและส่งเพชรให้อัตโนมัติ', 8, '#9fe8ff', { wordWrap: { width: W - 28 } }));
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
  /** the wheel the top bar's 🎡 opens (the one looked at last) */
  lastWheel: 'wheel' | 'dwheel' = DWHEEL_OPEN ? 'dwheel' : 'wheel';

  // ---------------- 🏪 PLAYER MARKET ----------------
  mkKey = ''; mkLoaded: { list: import('../systems/market').Listing[]; total: number } | null = null;
  /** buy a real player's listing (the server checks and takes it off the market in one step) */
  marketBuy(id: string) {
    if (this.busyAct) return; this.busyAct = true;
    actServer('marketBuy', { id }).then(r => {
      this.busyAct = false;
      if (refused(r)) { sfx.error(); bus.emit(EV.TOAST, ({ gone: 'มีคนซื้อไปแล้ว / หมดเวลา', gold: 'ทองไม่พอ', bag: 'กระเป๋าเต็ม', own: 'เป็นของที่คุณลงขายเอง' } as Record<string, string>)[r.refused] ?? 'ซื้อไม่ได้', '#ff8a6a'); }
      else { sfx.coin(); bus.emit(EV.TOAST, `ซื้อ ${itemDef(r.id).name}${r.qty > 1 ? ' x' + r.qty : ''} แล้ว (-${r.price.toLocaleString()} 💰)`, '#9fffb0'); saveGame(S()); bus.emit(EV.STATE_CHANGED); }
      this.mkKey = ''; if (this.cur === 'market') this.rebuild();
    });
  }
  /** 📜 the server's sales history (everyone sees it; no names) and one item's recent real prices (sell tab) */
  mhKey = ''; mhLoaded: { list: { item: import('../systems/market').Listing['item']; price: number; at: number }[]; total: number } | null = null;
  mhItem: Record<string, { n: number; avg: number; lo: number; hi: number } | null | 'loading'> = {};
  mkTab: 'buy' | 'sell' | 'mine' | 'hist' = 'buy'; mkType = 0; mkRar = -1; mkPage = 0; mkPrice = 0; mkSel: string | null = null;
  buildMarket(c: Phaser.GameObjects.Container) {
    const s = S(), ui = this.ui, k = this.k;
    const W = Math.min(620, ui.VW - 16), H = 330;
    const { x, y, g } = this.window(c, W, H, '🏪 ตลาดกลาง');
    const tabs: [typeof this.mkTab, string][] = [['buy', 'ซื้อ'], ['sell', 'ลงขาย'], ['mine', `ของที่ลงขาย (${myListings(s).length}/${MAX_LISTINGS})`]];
    tabs.push(['hist', '📜 ขายแล้ว']);
    tabs.forEach(([id, label], i) => c.add(k.button(x + 14 + i * 90 + (i === 3 ? 46 : 0), y + 30, i === 2 ? 130 : 84, 22, label, () => { this.mkTab = id; this.mkPage = 0; this.selUid = null; this.mkSel = null; this.rebuild(); }, { size: 9, color: this.mkTab === id ? 0x6a4a10 : 0x2a1d12 })));
    c.add(k.text(x + W - 16, y + 34, `💰 ${s.gold.toLocaleString()}`, 10, '#ffd84a').setOrigin(1, 0));
    const top = y + 60;
    const rcol = (r: number) => '#' + RARITY_COLORS[r].toString(16).padStart(6, '0');
    const fakeInv = (it: Omit<InvItem, 'uid'>) => ({ ...it, uid: -1 }) as InvItem;
    if (this.mkTab === 'buy') {
      const TYPES: [string, (t: string) => boolean][] = [['ทั้งหมด', () => true], ['อาวุธ', t => t === 'weapon'], ['เกราะ', t => t === 'armor'], ['เครื่องประดับ', t => t === 'accessory'], ['ของใช้/วัตถุดิบ', t => t === 'consumable' || t === 'material']];
      TYPES.forEach(([n], i) => c.add(k.button(x + 14 + i * 74, top, 70, 18, n, () => { this.mkType = i; this.mkPage = 0; this.rebuild(); }, { size: 7.5, color: this.mkType === i ? 0x4a3a10 : 0x1a140e })));
      c.add(k.button(x + 14 + 5 * 74 + 6, top, 104, 18, this.mkRar < 0 ? 'ทุกระดับ' : RARITY_NAMES[this.mkRar] + '+', () => { this.mkRar = this.mkRar >= 5 ? -1 : this.mkRar + 1; this.mkPage = 0; this.rebuild(); }, { size: 7.5 }));
      // online: real players' listings from the server (one page at a time); offline: the sample market
      const online = isOnline(), key = `${this.mkType}/${this.mkRar}/${this.mkPage}`;
      if (online && this.mkKey !== key) { this.mkKey = key; this.mkLoaded = null; actServer('marketBrowse', { type: this.mkType, rar: this.mkRar, page: this.mkPage }).then(r => { if (this.mkKey !== key) return; this.mkLoaded = refused(r) ? { list: [], total: 0 } : r; if (this.cur === 'market') this.rebuild(); }); }
      const sample = (TEST_HOOKS ? sampleListings() : []).filter(l => TYPES[this.mkType][1](itemDef(l.item.id).type) && (this.mkRar < 0 || (l.item.rar ?? 0) >= this.mkRar)).sort((a, b) => a.price - b.price);
      const per = 7, total = online ? this.mkLoaded?.total ?? 0 : sample.length, pages = Math.max(1, Math.ceil(total / per)); if (!online) this.mkPage = Math.min(this.mkPage, pages - 1);
      const shown = online ? this.mkLoaded?.list ?? [] : sample.slice(this.mkPage * per, this.mkPage * per + per);
      if (online && !this.mkLoaded) c.add(k.text(x + W / 2, top + 110, 'กำลังโหลดตลาด...', 10, '#c8b898').setOrigin(0.5));
      else if (online && !shown.length) c.add(k.text(x + W / 2, top + 110, 'ยังไม่มีใครลงขายของประเภทนี้', 10, '#8a7a60').setOrigin(0.5));
      else if (!online && !shown.length) c.add(k.text(x + W / 2, top + 110, 'ตลาดผู้เล่นใช้ได้เมื่อออนไลน์เท่านั้น', 10, '#8a7a60').setOrigin(0.5));
      shown.forEach((l, i) => {
        const ry = top + 24 + i * 30, d = itemDef(l.item.id), rr = l.item.rar ?? d.rarity;
        g.fillStyle(this.mkSel === l.id ? 0x3a2a10 : 0x1a140e, 0.9).fillRoundedRect(x + 14, ry, W - 28, 27, 3).lineStyle(1, RARITY_COLORS[rr], 0.5).strokeRoundedRect(x + 14, ry, W - 28, 27, 3);
        c.add(this.ico(x + 28, ry + 13, `icon_${d.icon}`, 26));
        c.add(k.text(x + 44, ry + 3, `${d.name}${l.item.upg ? ' +' + l.item.upg : ''}${l.item.qty > 1 ? ' x' + l.item.qty : ''}`, 8.5, rcol(rr)));
        c.add(k.text(x + 44, ry + 15, [isGear(d) ? RARITY_NAMES[rr] : '', ...statLines(d, fakeInv(l.item)).slice(0, 2), (l.item.aff?.length ? `✦${l.item.aff.length} ค่าพิเศษ` : '')].filter(Boolean).join('  •  '), 6.8, '#c8b898'));
        c.add(k.text(x + W - 200, ry + 8, l.seller, 7.5, '#9ad8ff'));
        c.add(k.text(x + W - 110, ry + 7, `💰 ${l.price.toLocaleString()}`, 9, '#ffd84a').setOrigin(1, 0));
        c.add(k.button(x + W - 98, ry + 3, 78, 21, 'ซื้อ', () => { if (!online) { bus.emit(EV.TOAST, 'ตัวอย่างตลาด — ซื้อขายกับผู้เล่นจริงได้เมื่อเชื่อมต่อเซิร์ฟ', '#ffd84a'); return; } this.marketBuy(l.id); }, { size: 8.5, color: 0x1f4a2a }));
      });
      c.add(k.button(x + 14, y + H - 30, 30, 18, '◀', () => { this.mkPage = (this.mkPage + pages - 1) % pages; this.rebuild(); }, { size: 8 }));
      c.add(k.text(x + 60, y + H - 27, `${this.mkPage + 1}/${pages}  •  ${total} รายการ  •  ${online ? 'จากผู้เล่นจริง' : 'ตัวอย่างจากผู้เล่นจำลอง (ออฟไลน์)'}`, 7.5, online ? '#9fffb0' : '#c8b898'));
      c.add(k.button(x + 290, y + H - 30, 30, 18, '▶', () => { this.mkPage = (this.mkPage + 1) % pages; this.rebuild(); }, { size: 8 }));
    } else if (this.mkTab === 'hist') {
      // 📜 everything sold on the server, newest first — what sold, for how much, when (no buyer / seller names)
      const TYPES = ['ทั้งหมด', 'อาวุธ', 'เกราะ', 'เครื่องประดับ', 'อื่นๆ'];
      TYPES.forEach((n, i) => c.add(k.button(x + 14 + i * 74, top, 70, 18, n, () => { this.mkType = i; this.mkPage = 0; this.rebuild(); }, { size: 7.5, color: this.mkType === i ? 0x4a3a10 : 0x1a140e })));
      c.add(k.button(x + 14 + 5 * 74 + 6, top, 104, 18, this.mkRar < 0 ? 'ทุกระดับ' : RARITY_NAMES[this.mkRar] + '+', () => { this.mkRar = this.mkRar >= 5 ? -1 : this.mkRar + 1; this.mkPage = 0; this.rebuild(); }, { size: 7.5 }));
      const online = isOnline(), key = `h${this.mkType}/${this.mkRar}/${this.mkPage}`;
      if (online && this.mhKey !== key) { this.mhKey = key; this.mhLoaded = null; actServer('marketHistory', { type: this.mkType, rar: this.mkRar, page: this.mkPage }).then(r => { if (this.mhKey !== key) return; this.mhLoaded = refused(r) ? { list: [], total: 0 } : r; if (this.cur === 'market') this.rebuild(); }); }
      const shown = this.mhLoaded?.list ?? [], total = this.mhLoaded?.total ?? 0, pages = Math.max(1, Math.ceil(total / 7));
      if (!online) c.add(k.text(x + W / 2, top + 110, 'ประวัติการขายดูได้เมื่อออนไลน์เท่านั้น', 10, '#8a7a60').setOrigin(0.5));
      else if (!this.mhLoaded) c.add(k.text(x + W / 2, top + 110, 'กำลังโหลด...', 10, '#c8b898').setOrigin(0.5));
      else if (!shown.length) c.add(k.text(x + W / 2, top + 110, 'ยังไม่มีการซื้อขายประเภทนี้', 10, '#8a7a60').setOrigin(0.5));
      const ago = (t: number) => { const m = Math.max(0, Math.floor((Date.now() - t) / 60000)); return m < 1 ? 'เมื่อกี้' : m < 60 ? `${m} นาทีที่แล้ว` : m < 1440 ? `${Math.floor(m / 60)} ชม.ที่แล้ว` : `${Math.floor(m / 1440)} วันที่แล้ว`; };
      shown.forEach((l, i) => {
        const ry = top + 24 + i * 30, d = itemDef(l.item.id), rr = l.item.rar ?? d.rarity;
        g.fillStyle(0x1a140e, 0.9).fillRoundedRect(x + 14, ry, W - 28, 27, 3).lineStyle(1, RARITY_COLORS[rr], 0.5).strokeRoundedRect(x + 14, ry, W - 28, 27, 3);
        c.add(this.ico(x + 28, ry + 13, `icon_${d.icon}`, 26));
        c.add(k.text(x + 44, ry + 3, `${d.name}${l.item.upg ? ' +' + l.item.upg : ''}${l.item.qty > 1 ? ' x' + l.item.qty : ''}`, 8.5, rcol(rr)));
        c.add(k.text(x + 44, ry + 15, [isGear(d) ? RARITY_NAMES[rr] : '', ...statLines(d, fakeInv(l.item)).slice(0, 2), (l.item.aff?.length ? `✦${l.item.aff.length} ค่าพิเศษ` : '')].filter(Boolean).join('  •  '), 6.8, '#c8b898'));
        c.add(k.text(x + W - 150, ry + 8, ago(l.at), 7.5, '#9ad8ff').setOrigin(1, 0));
        c.add(k.text(x + W - 22, ry + 3, `💰 ${l.price.toLocaleString()}`, 9, '#ffd84a').setOrigin(1, 0));
        if (l.item.qty > 1) c.add(k.text(x + W - 22, ry + 15, `(${Math.round(l.price / l.item.qty).toLocaleString()}/ชิ้น)`, 6.8, '#c8b898').setOrigin(1, 0));
      });
      c.add(k.button(x + 14, y + H - 30, 30, 18, '◀', () => { this.mkPage = (this.mkPage + pages - 1) % pages; this.rebuild(); }, { size: 8 }));
      c.add(k.text(x + 60, y + H - 27, `${this.mkPage + 1}/${pages}  •  ขายไปแล้ว ${total} รายการ (ทั้งเซิร์ฟ)`, 8, '#c8b898'));
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
        { // 📜 what this item really sold for on the server this week (helps setting a price)
          const h = this.mhItem[it.id];
          if (h === undefined && isOnline()) { this.mhItem[it.id] = 'loading'; actServer('marketHistory', { id: it.id }).then(r => { this.mhItem[it.id] = refused(r) || !r.week ? null : r.week; if (this.cur === 'market') this.rebuild(); }); }
          const txt = h === 'loading' || h === undefined ? (isOnline() ? 'ราคาขายจริง: กำลังโหลด...' : '') : !h || !h.n ? 'ราคาขายจริง 7 วัน: ยังไม่มีคนขาย' : `ราคาขายจริง 7 วัน: เฉลี่ย ${h.avg.toLocaleString()}/ชิ้น (${h.lo.toLocaleString()}–${h.hi.toLocaleString()}, ${h.n} ครั้ง)`;
          if (txt) c.add(k.text(dx + 10, top + 46, txt, 7, '#9ad8ff', { wordWrap: { width: dw - 20 } }));
        }
        const fee = feeOf(this.mkPrice);
        c.add(k.text(dx + dw / 2, top + 62, `ราคาตั้งขาย`, 8, '#c8b898').setOrigin(0.5, 0));
        c.add(k.text(dx + dw / 2, top + 76, `💰 ${this.mkPrice.toLocaleString()}`, 16, '#ffd84a', { fontStyle: 'bold' }).setOrigin(0.5, 0));
        const pr = priceRange(it, it.qty);   // (30% .. 5x the fair price — anti gold-laundering)
        const step = (f: number) => () => { this.mkPrice = Math.max(pr.min, Math.min(pr.max, Math.round(this.mkPrice * f))); this.rebuild(); };
        [['-50%', 0.5], ['-10%', 0.9], ['+10%', 1.1], ['x2', 2]].forEach(([l, f], i) => c.add(k.button(dx + 8 + i * ((dw - 16) / 4), top + 104, (dw - 16) / 4 - 4, 20, l as string, step(f as number), { size: 8.5 })));
        c.add(k.text(dx + 10, top + 134, `ราคาแนะนำ ${(suggestPrice(it) * it.qty).toLocaleString()}  •  NPC รับซื้อ ${(sellPrice(it) * it.qty).toLocaleString()}\nภาษีตลาด 8%: -${fee.toLocaleString()}  →  ได้รับ ${(this.mkPrice - fee).toLocaleString()} 💰\nขึ้นขาย ${LISTING_HOURS} ชม. ไม่มีคนซื้อ = คืนของ\nราคา ${pr.min.toLocaleString()}–${pr.max.toLocaleString()} • วันนี้ลงแล้ว ${listedToday(s)}/${DAILY_LISTINGS}`, 7.5, '#e8dcc0', { lineSpacing: 3 }));
        const away = !!(this.ui as unknown as { td?: { stageN: number } }).td?.stageN && !vipActive(s);   // out of the village: VIP only
        if (away) c.add(k.text(dx + dw / 2, top + H - 124, '👑 ลงขายนอกหมู่บ้านได้เฉพาะ VIP', 8, '#ffd84a').setOrigin(0.5, 0));
        c.add(k.button(dx + 8, top + H - 108, dw - 16, 24, away ? 'กลับหมู่บ้านเพื่อลงขาย' : `ลงขาย (${myListings(s).length}/${MAX_LISTINGS})`, () => {
          const r = act('marketList', { uid: it.uid, qty: it.qty, price: this.mkPrice });
          if (r === 'away') { sfx.error(); bus.emit(EV.TOAST, '👑 ลงขายนอกหมู่บ้านได้เฉพาะ VIP — กลับหมู่บ้านก่อน', '#ffd84a'); return; }
          if (typeof r === 'string') { sfx.error(); bus.emit(EV.TOAST, { equipped: 'ถอดก่อนจึงจะลงขายได้', missing: 'ไม่พบของ', full: 'ลงขายได้สูงสุด 10 รายการ', price: 'ราคาต้องอยู่ระหว่าง 30% ถึง 5 เท่าของราคาแนะนำ', daily: `วันนี้ลงขายครบ ${DAILY_LISTINGS} ชิ้นแล้ว` }[r], '#ff8a6a'); return; }
          sfx.coin(); bus.emit(EV.TOAST, `ลงขาย ${d.name} ราคา ${this.mkPrice.toLocaleString()} 💰 แล้ว`, '#9fffb0'); this.selUid = null; saveGame(s); bus.emit(EV.STATE_CHANGED); this.rebuild();
        }, { size: 9.5, color: 0x1f4a2a, disabled: away }));
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
        c.add(k.button(x + W - 90, ry + 2, 70, 19, 'ยกเลิก', () => { const done = (ok: boolean) => { if (ok) bus.emit(EV.TOAST, 'คืนของเข้ากระเป๋าแล้ว', '#9fffb0'); else bus.emit(EV.TOAST, isOnline() ? 'ขายไปแล้ว / กระเป๋าเต็ม' : 'กระเป๋าเต็ม', '#ff8a6a'); saveGame(s); bus.emit(EV.STATE_CHANGED); this.rebuild(); }; if (isOnline()) actServer('marketCancel', { id: l.id }).then(r => done(r === true)); else done(act('marketCancel', { id: l.id }) === true); }, { size: 8, color: 0x5a1a1a }));
      });
    }
  }

  // ---------------- POTION SETTINGS (the ⚙ beside the potion buttons) ----------------
  buildPotion(c: Phaser.GameObjects.Container) {
    const s = S(), k = this.k, p = potOf(s);
    const W = Math.min(460, this.ui.VW - 20), H = 312, vip = vipActive(s);
    const { x, y, g } = this.window(c, W, H, '⚗ ตั้งค่าการใช้ยา');
    const set = (ch: Partial<PotSet>) => { sfx.click(); setPot(s, ch); saveGame(s); this.rebuild(); };
    const lx = x + 16, bx = x + 176, bw = (W - 176 - 16 - 3 * 4) / 4;
    const row = (i: number, label: string, opts: [string, boolean, () => void][], dim = false) => {
      const ry = y + 34 + i * 30;
      g.fillStyle(0x0a0705, 0.45).fillRoundedRect(x + 10, ry - 3, W - 20, 26, 4);
      c.add(k.text(lx, ry + 4, label, 9, dim ? '#7a6a58' : '#f3e6c4'));
      const w = opts.length === 2 ? bw * 2 + 4 : bw;
      opts.forEach(([t, on, cb], j) => c.add(k.button(bx + j * (w + 4), ry, w, 20, t, cb, { size: 8.5, color: on ? 0x1f5a2a : 0x3a3a3a, disabled: dim })));
    };
    row(0, '❤ ดื่มยา HP อัตโนมัติ', [['เปิด', p.auto, () => set({ auto: true })], ['ปิด', !p.auto, () => set({ auto: false })]]);
    row(1, 'ดื่มเมื่อ HP ต่ำกว่า', HP_STEPS.map(v => [`${v}%`, p.hp === v, () => set({ hp: v })] as [string, boolean, () => void]), !p.auto);
    row(2, 'ใช้ยา HP ไหนก่อน', [['ยาใหญ่ก่อน', p.big, () => set({ big: true })], ['ยาเล็กก่อน', !p.big, () => set({ big: false })]]);
    row(3, '💧 ดื่มยา MP อัตโนมัติ', [['เปิด', p.mpAuto, () => set({ mpAuto: true })], ['ปิด', !p.mpAuto, () => set({ mpAuto: false })]], !p.auto);
    row(4, 'ดื่มเมื่อ MP ต่ำกว่า', MP_STEPS.map(v => [`${v}%`, p.mp === v, () => set({ mp: v })] as [string, boolean, () => void]), !p.auto || !p.mpAuto);
    // VIP: buy potions here, away from the shop — and whether the system buys one by itself when out
    const vy = y + 186;
    g.fillStyle(vip ? 0x3a2a08 : 0x1a1612, 0.6).fillRoundedRect(x + 10, vy - 4, W - 20, 64, 5).lineStyle(1, vip ? 0xd9b45a : 0x4a3a2a, 1).strokeRoundedRect(x + 10, vy - 4, W - 20, 64, 5);
    c.add(k.text(lx, vy + 2, vip ? '👑 VIP: ยาหมดให้ระบบซื้อให้เอง' : '👑 VIP เท่านั้น: ซื้อยาได้ทุกที่ ไม่ต้องกลับบ้าน', 9, vip ? '#ffe7a0' : '#8a7a60'));
    if (vip) [['ซื้อให้เอง', p.vipAuto, () => set({ vipAuto: true })], ['ฉันซื้อเอง', !p.vipAuto, () => set({ vipAuto: false })]].forEach(([t, on, cb], j) =>
      c.add(k.button(bx + j * (bw * 2 + 8), vy - 1, bw * 2 + 4, 20, t as string, cb as () => void, { size: 8.5, color: on ? 0x1f5a2a : 0x3a3a3a })));
    const buys: [string, string, number][] = [['hp_potion', '❤ เล็ก', 5], ['hp_potion', '❤ เล็ก', 20], ['hp_potion_l', '❤ ใหญ่', 5], ['mp_potion', '💧 MP', 5]];
    const pw = (W - 32 - 3 * 6) / 4;
    buys.forEach(([id, nm, q], j) => {
      const cost = itemDef(id).price * q;
      c.add(k.button(x + 16 + j * (pw + 6), vy + 26, pw, 26, `${nm} x${q}  💰${cost}`, () => {
        const r = act('vipBuyPotion', { id, qty: q });
        if (refused(r)) { sfx.error(); bus.emit(EV.TOAST, r.refused === 'gold' ? 'ทองไม่พอ' : r.refused === 'bag' ? 'กระเป๋าเต็ม' : 'เฉพาะ VIP', '#ff8a6a'); return; }
        sfx.coin(); bus.emit(EV.TOAST, `ซื้อ ${itemDef(id).name} x${q} แล้ว (-${cost}💰)`, '#9fffb0'); saveGame(s); bus.emit(EV.STATE_CHANGED); this.rebuild();
      }, { size: 8, color: 0x2a4a5a, disabled: !vip || s.gold < cost }));
    });
    c.add(k.text(x + W / 2, y + H - 44, `มียา ❤ ${potCount(s, 'hp')}  •  💧 ${potCount(s, 'mp')}  •  💰 ${s.gold.toLocaleString()}`, 8, '#ffd8a0').setOrigin(0.5, 0));
    c.add(k.text(x + W / 2, y + H - 30, 'ใช้ได้ทั้งตอนเปิดและปิด AUTO • กดปุ่มยาข้างสกิลเพื่อดื่มเองได้ทุกเมื่อ', 7.5, '#c8b898').setOrigin(0.5, 0));
  }

  // ---------------- DEEPWILD AUTO FARM (AUTO in the Deepwild) ----------------
  buildFarm(c: Phaser.GameObjects.Container) {
    const s = S(), k = this.k, goal = farmGoal(s);
    const W = Math.min(460, this.ui.VW - 20), H = 238;
    const { x, y, g } = this.window(c, W, H, '👑 ฟาร์มทรัพยากรออโต้ (VIP)');
    c.add(k.text(x + W / 2, y + 30, 'เลือกว่าจะเก็บอะไร เท่าไร แล้วกดเริ่ม — ครบแล้วหยุดเอง', 8.5, '#c8b898').setOrigin(0.5, 0));
    const bx = x + 130, bw = (W - 130 - 16 - 4 * 4) / 5;
    FARM_KEYS.forEach((key, i) => {
      const ry = y + 50 + i * 30, have = key === 'ore' ? '' : `มี ${s.res[key].toLocaleString()}`;
      g.fillStyle(0x0a0705, 0.45).fillRoundedRect(x + 10, ry - 3, W - 20, 26, 4);
      c.add(k.text(x + 18, ry + 1, FARM_NAMES[key], 10, '#f3e6c4'));
      if (have) c.add(k.text(x + 18, ry + 13, have, 7, '#9a8a70'));
      FARM_STEPS.forEach((v, j) => c.add(k.button(bx + j * (bw + 4), ry, bw, 20, v ? String(v) : 'ไม่เอา', () => { sfx.click(); setFarmGoal(s, { [key]: v }); saveGame(s); this.rebuild(); }, { size: 8.5, color: goal[key] === v ? 0x1f5a2a : 0x3a3a3a })));
    });
    const en = energyLeft(s);
    c.add(k.text(x + W / 2, y + H - 52, `⚡ แรงวันนี้เหลือ ${en}  •  แร่ต้องมีเลเวลถึงเหมืองนั้น  •  ขยับเองเมื่อไหร่ก็ควบคุมได้ทันที`, 7.5, '#ffd8a0').setOrigin(0.5, 0));
    c.add(k.button(x + W / 2 - 90, y + H - 34, 180, 26, '▶ เริ่มฟาร์มออโต้', () => { this.close(); (this.ui as unknown as { td: { startFarm(): void } }).td.startFarm(); }, { size: 11, color: 0x1f4a2a, disabled: farmDone(goal) || en <= 0 || !vipActive(s) }));
  }

  // ---------------- STAGE SELECT ----------------
  // A compact card carousel (director: the old full-screen grid was too big): the chosen map sits in the middle, larger
  // and lit, its neighbours shrink and fade to the sides. ◀ ▶ or a swipe moves one map; the land pills jump between lands.
  stSel = 0; stDir = 0;
  buildStages(c: Phaser.GameObjects.Container) {
    const s = S(), ui = this.ui, k = this.k;
    // maps unlock by hero level; the 'recommended' map is the highest one the hero can enter
    const all = !!(s as unknown as { tdUnlockAll?: boolean }).tdUnlockAll;
    const canEnter = (st: (typeof STAGES)[number]) => all || s.level >= st.req;
    const best = [...STAGES].reverse().find(canEnter)?.n ?? 1;
    // roaming bosses alive now (the server's list; no boss pictures any more — director: they come at random)
    const wb = new Map((stageBosses.list ?? []).map(b => [b.n, b]));
    if (Date.now() - stageBosses.at > 20000) { stageBosses.at = Date.now(); fetch(SERVER + '/bosses').then(r => r.json()).then((j: { list: { n: number; name: string; left: number }[] }) => { stageBosses.list = j.list; if (this.cur === 'stages') this.rebuild(); }).catch(() => undefined); }
    if (this.stSel < 1 || this.stSel > STAGES.length) this.stSel = best;
    const COL = [0x2e5a3a, 0x4a3a6a, 0x7a3a1a, 0x3a5a7a, 0x3a3a40], HI = ['#9fe0a0', '#c8a8ff', '#ffb080', '#a8d8ff', '#c8c8d0'];
    const sel = STAGES[this.stSel - 1], li = Math.floor((sel.n - 1) / 10), L = LANDS[li];
    const W = Math.min(600, ui.VW - 20), H = 236;
    const { x, y, g } = this.window(c, W, H, 'เลือกแผนที่');
    // this land's monsters + boss, and the next land's, load on demand (card portraits)
    const near = [li, Math.min(LANDS.length - 1, li + 1), Math.max(0, li - 1)].flatMap(i => LANDS[i].mobs.map(m => m.key));
    loadIdle(ui, [...new Set(near)], () => { if (this.cur === 'stages') this.rebuild(); });
    const go = (n: number) => { sfx.click(); this.close(); (ui as unknown as { enterStage?: (n: number) => void }).enterStage?.(n); };
    const step = (d: number) => { const n = Math.max(1, Math.min(STAGES.length, this.stSel + d)); if (n === this.stSel) return; sfx.click(); this.stDir = d; this.stSel = n; this.rebuild(); };

    // top row: the Deepwild and the daily dungeon on the left, the five lands as pills on the right
    const ty = y + 28;
    c.add(k.button(x + 12, ty, 92, 20, '🌿 ป่าดงดิบ', () => go(WILD), { size: 8.5, color: 0x1f5a2a }));
    { const di = act('dungeonInfo', {}); c.add(k.button(x + 108, ty, 104, 20, `⚔ ดันเจี้ยน ${di.max - di.used}/${di.max}`, () => this.open('dungeon'), { size: 8.5, color: 0x6a2a10 })); }
    const pw = 22, px0 = x + W - 14 - LANDS.length * (pw + 5);
    LANDS.forEach((_, i) => {
      const open = canEnter(STAGES[i * 10]), on = i === li, px = px0 + i * (pw + 5);
      g.fillStyle(open ? COL[i] : 0x1a1612, on ? 1 : 0.6).fillRoundedRect(px, ty + 2, pw, 16, 8);
      if (on) g.lineStyle(2, 0xffd84a, 1).strokeRoundedRect(px, ty + 2, pw, 16, 8);
      c.add(k.text(px + pw / 2, ty + 4, open ? String(i + 1) : '🔒', 8, open ? '#ffffff' : '#6a6050').setOrigin(0.5, 0));
      const z = ui.add.zone(px, ty, pw, 20).setOrigin(0).setInteractive({ useHandCursor: true });
      z.on('pointerup', () => { const target = i === Math.floor((best - 1) / 10) ? best : i * 10 + 1; step(target - this.stSel); });
      c.add(z);
    });
    // the land's name over the cards
    c.add(k.text(x + W / 2, y + 54, `${L.name}`, 11, HI[li], { fontStyle: 'bold' }).setOrigin(0.5, 0));
    c.add(k.text(x + W / 2, y + 69, `มอน Lv${STAGES[li * 10].level}-${STAGES[li * 10 + 9].level}  •  แผนที่ ${li * 10 + 1}-${li * 10 + 10}`, 7.5, '#c8b898').setOrigin(0.5, 0));

    // the carousel
    const cy = y + 140, slots = W >= 520 ? 2 : 1, gap = 8;
    const card = (st: (typeof STAGES)[number], off: number) => {
      const big = off === 0, cw = big ? 92 : 74 - (Math.abs(off) - 1) * 8, ch = big ? 104 : 84 - (Math.abs(off) - 1) * 10;
      const open = canEnter(st), stL = LANDS[Math.floor((st.n - 1) / 10)], lc = COL[Math.floor((st.n - 1) / 10)];
      const ox = off === 0 ? 0 : Math.sign(off) * (46 + gap + 37 + (Math.abs(off) - 1) * (74 + gap - 4));
      const box = ui.add.container(x + W / 2 + ox, cy); box.setAlpha(big ? 1 : Math.abs(off) === 1 ? 0.78 : 0.45);
      const cg = ui.add.graphics();
      cg.fillStyle(0x000000, 0.35).fillRoundedRect(-cw / 2 + 3, -ch / 2 + 4, cw, ch, 8);                    // drop shadow
      const rb = wb.get(st.n);   // a roaming boss is on this map right now
      cg.fillStyle(open ? (rb ? 0x4a1a14 : lc) : 0x15120e, 1).fillRoundedRect(-cw / 2, -ch / 2, cw, ch, 8);
      cg.fillStyle(0xffffff, open ? 0.08 : 0.03).fillRoundedRect(-cw / 2 + 3, -ch / 2 + 3, cw - 6, ch * 0.42, 6);   // glassy top
      cg.lineStyle(big ? 2.5 : 1.5, !open ? 0x3a3228 : rb ? 0xff6a3a : big ? 0xffd84a : 0x8a7a5a, 1).strokeRoundedRect(-cw / 2, -ch / 2, cw, ch, 8);
      box.add(cg);
      const who = stL.mobs[(st.n - 1) % stL.mobs.length].key;
      if (ui.textures.exists(`c_${who}_idle`)) {
        const im = ui.add.image(0, ch / 2 - 18, `c_${who}_idle`, 0).setOrigin(0.5, 1); im.setScale((big ? 58 : 44) / im.height);
        if (!open) im.setTint(0x101010); box.add(im);
      }
      box.add(k.text(-cw / 2 + 7, -ch / 2 + 4, String(st.n), big ? 17 : 13, open ? '#ffffff' : '#5a5040', { fontStyle: 'bold' }));
      if (rb) { const t = k.text(cw / 2 - 5, -ch / 2 + 4, '👹', big ? 14 : 10).setOrigin(1, 0); box.add(t); ui.tweens.add({ targets: t, scale: { from: 1, to: 1.25 }, duration: 450, yoyo: true, repeat: -1 }); }
      if (st.n === best && open && !big) box.add(k.text(cw / 2 - 6, -ch / 2 + 5, '★', 10, '#ffd84a').setOrigin(1, 0));
      box.add(k.text(0, ch / 2 - 15, open ? `Lv${st.level}` : `🔒 Lv${st.req}`, big ? 8.5 : 7.5, open ? '#e8dcc0' : '#8a7a60').setOrigin(0.5, 0));
      c.add(box);
      if (this.stDir) { box.x += this.stDir * 40; box.alpha *= 0.4; ui.tweens.add({ targets: box, x: box.x - this.stDir * 40, alpha: box.alpha / 0.4, duration: 170, ease: 'Cubic.easeOut' }); }
      return { ox, cw };
    };
    const shown: { n: number; ox: number; cw: number }[] = [];
    for (const off of [-slots, ...(slots > 1 ? [-1] : []), 1, ...(slots > 1 ? [slots] : []), 0]) {   // the middle card last = on top
      const n = this.stSel + off; if (n < 1 || n > STAGES.length) continue;
      shown.push({ n, ...card(STAGES[n - 1], off) });
    }
    this.stDir = 0;
    // arrows
    const ah = 44, aw = 30;
    c.add(k.button(x + 10, cy - ah / 2, aw, ah, '◀', () => step(-1), { size: 14, color: 0x2a2018, disabled: this.stSel <= 1 }));
    c.add(k.button(x + W - 10 - aw, cy - ah / 2, aw, ah, '▶', () => step(1), { size: 14, color: 0x2a2018, disabled: this.stSel >= STAGES.length }));
    // swipe / tap over the cards: a swipe moves, a tap on a side card picks it, a tap on the middle card goes
    {
      const zx = x + 10 + aw + 4, zw = W - 2 * (10 + aw + 4), z = ui.add.zone(zx, cy - 56, zw, 112).setOrigin(0).setInteractive();
      let downX = 0;
      z.on('pointerdown', (p: Phaser.Input.Pointer) => { downX = p.x; });
      z.on('pointerup', (p: Phaser.Input.Pointer) => {
        const dx = p.x - downX;
        if (Math.abs(dx) > 26) { step(dx < 0 ? 1 : -1); return; }
        const hit = shown.find(h => Math.abs(p.x - (x + W / 2 + h.ox)) <= h.cw / 2);
        if (!hit) return;
        if (hit.n === this.stSel) { if (canEnter(sel)) go(sel.n); else { sfx.error(); bus.emit(EV.TOAST, `ต้องเลเวล ${sel.req} ขึ้นไป`, '#ff8a6a'); } }
        else step(hit.n - this.stSel);
      });
      c.add(z);
    }

    // the chosen map: what lives there, the food it costs, and the go button
    const by = y + H - 36, open = canEnter(sel), food = stageFood(sel.n);
    g.fillStyle(0x0a0705, 0.55).fillRoundedRect(x + 12, by - 4, W - 24, 30, 6);
    L.mobs.slice(0, 5).forEach((m, i) => {
      const key = `c_${m.key}_idle`; if (!ui.textures.exists(key)) return;
      const im = ui.add.image(x + 30 + i * 26, by + 24, key, 0).setOrigin(0.5, 1); im.setScale(Math.min(24 / im.height, 1)); c.add(im);
    });
    const sb = wb.get(sel.n);
    const info = `แผนที่ ${sel.n}${sb ? `  👹 ${sb.name} อยู่ตอนนี้! (อีก ~${Math.max(1, Math.ceil(sb.left / 60000))} นาที)` : ''}  •  มอน Lv${sel.level}  •  ${food ? `เสบียง 🍖${food}/5 นาที` : 'เสบียงฟรี'}`;
    c.add(k.text(x + 30 + Math.min(5, L.mobs.length) * 26, by + 5, info, 8.5, open ? (!food || supplyMinutes(s, sel.n) >= 10 ? '#ffe7a0' : '#ff8a6a') : '#8a7a60'));
    c.add(k.button(x + W - 12 - 118, by - 2, 114, 26, open ? `▶ เข้าแผนที่ ${sel.n}` : `🔒 ต้อง Lv${sel.req}`, () => go(sel.n), { size: 10, color: sb ? 0x7a2a14 : 0x1f4a2a, disabled: !open }));
    // where the roaming bosses are now: in the free space of the top row (between the dungeon button and the land pills),
    // clear of the cards — tap one to jump to that map (they come at random — nobody knows ahead)
    const now = [...wb.values()].sort((a, b2) => a.n - b2.n), mx0 = x + 218, mx1 = px0 - 6, mw = mx1 - mx0;
    if (!now.length) c.add(k.text(mx0 + mw / 2, ty + 5, '👹 บอสเร่ร่อนสุ่มโผล่ — มีประกาศในแชตโลก', 7, '#c8a090').setOrigin(0.5, 0));
    const fit = Math.max(1, Math.min(now.length, Math.floor((mw + 4) / 64)));
    now.slice(0, fit).forEach((b, i, arr) => {
      const bw = Math.min(84, (mw - (arr.length - 1) * 4) / arr.length), bx0 = mx0 + (mw - (arr.length * (bw + 4) - 4)) / 2;
      c.add(k.button(bx0 + i * (bw + 4), ty + 1, bw, 18, `👹 แผนที่ ${b.n}`, () => step(b.n - this.stSel), { size: 7.5, color: 0x7a2a14 }));
    });
  }

  // ---------------- PROFILE (tap the portrait) ----------------
  buildProfile(c: Phaser.GameObjects.Container) {
    const s = S(), ui = this.ui, k = this.k, d = derive(s), ps = pstats(s);
    const W = Math.min(640, ui.VW - 12), H = 340;
    const { x, y, g } = this.window(c, W, H, '👤 โปรไฟล์');
    // the form being WORN (the same picture as on the map / the top-left portrait) — not the highest one unlocked
    const t = activeTier(s), pk = this.ui.world.hero.portrait().key, sx = x + 14, sy = y + 32, cw = 190;
    // left: the hero
    g.fillStyle(0x0a0705, 0.6).fillRoundedRect(sx, sy, cw, H - 44, 5);
    if (ui.textures.exists(pk)) { const im = ui.add.image(sx + cw / 2, sy + 116, pk, 0).setOrigin(0.5, 1); im.setScale(104 / im.height); c.add(im); }
    const title = titleOf(s);
    c.add(k.text(sx + cw / 2, sy + 6, s.name || 'ผู้กล้า', 12, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5, 0));
    if (title) c.add(k.text(sx + cw / 2, sy + 22, `「${title}」`, 8.5, '#ffd84a').setOrigin(0.5, 0));
    const cls = s.cls && s.cls !== 'novice' ? ({ sword: '⚔ สายดาบ', archer: '🏹 สายธนู', mage: '✦ สายเวท', cleric: '✚ สายนักบวช' } as Record<string, string>)[s.cls] : 'ชาวบ้าน (ยังไม่เลือกสาย)';
    c.add(k.text(sx + cw / 2, sy + 122, `${formName(s.cls, t)} • ร่างที่ ${t + 1}` + ((s.tier ?? 0) > t ? ` (ปลดล็อกถึงร่าง ${(s.tier ?? 0) + 1})` : ''), (s.tier ?? 0) > t ? 8.5 : 10, '#ffe7a0').setOrigin(0.5, 0));
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
    // the player's code: copied and sent to the admin (bug reports, compensation from the back office)
    { const id = accountId();
      c.add(k.text(sx + 10, sy + H - 50, id ? `🆔 ${id}` : '🆔 (ออฟไลน์ — ยังไม่มีรหัส)', 7, '#9fd4ff'));
      if (id) c.add(k.button(sx + cw - 48, sy + H - 53, 40, 16, '📋 คัดลอก', () => {
        const done = () => bus.emit(EV.TOAST, '📋 คัดลอกรหัสผู้เล่นแล้ว — ส่งให้แอดมินได้เลย', '#9fffb0');
        navigator.clipboard?.writeText(id).then(done, () => window.prompt('รหัสผู้เล่นของคุณ (คัดลอกได้)', id)) ?? window.prompt('รหัสผู้เล่นของคุณ (คัดลอกได้)', id);
      }, { size: 6.5, color: 0x1f4a6a })); }
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
      ['ความสำเร็จ', `${achDone(s)}/${ACHS.length}`], ['สมุดมอน', `${CODEX.filter(m => (ps.kinds[m.kind] ?? 0) > 0).length}/${CODEX.length}`], ['ล็อกอิน', `${sv.login?.n ?? 0} วัน`], ['เวลาเล่น', `${Math.floor(s.playTime / 3600)} ชม. ${Math.floor(s.playTime / 60) % 60} นาที`]];
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
    // event titles (the CBT testers' title) are not goals: a button to wear it again
    Object.entries(SPECIAL_TITLES).filter(([id]) => titlesOf(s).includes(id)).forEach(([id, name], i) => {
      const using = (s as unknown as { title?: string }).title === id;
      c.add(k.button(x + 320 + i * 136, y + 28, 130, 20, using ? `「${name}」ใช้อยู่` : `ใช้ฉายา「${name}」`, () => { act('setTitle', { id: using ? null : id }); saveGame(s); bus.emit(EV.STATE_CHANGED); this.rebuild(); }, { size: 8, color: using ? 0x3a5a2a : 0x5a2a6a }));
    });
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
      if (!refused(r) && (r as { skillPt?: number }).skillPt) bus.emit(EV.TOAST, '✨ ล็อกอินครบ 7 วัน — ได้แต้มสกิล +1!', '#9fffb0');
      if (refused(r)) { sfx.error(); bus.emit(EV.TOAST, r.refused === 'bag' ? 'กระเป๋าเต็ม — เคลียร์ช่องว่างก่อนแล้วกดรับใหม่ (ของไม่หาย)' : 'รับไปแล้ววันนี้', '#ff9a6a'); return; }
      sfx.levelUp(); bus.emit(EV.TOAST, `รับของล็อกอินวันที่ ${info.day + 1}: ${r.label}`, '#ffd84a'); saveGame(s); bus.emit(EV.STATE_CHANGED); this.rebuild();
    }, { size: 10, color: 0x6a4a10, disabled: !info.ready }));
  }

  // ---------------- MAILBOX ----------------
  mailSel = ''; mailPage = 0;
  buildMail(c: Phaser.GameObjects.Container) {
    const s = S(), ui = this.ui, k = this.k, now = Date.now(), box = mailOf(s);
    const W = Math.min(620, ui.VW - 12), H = 320;
    const { x, y, g } = this.window(c, W, H, '📬 จดหมาย');
    if (!box.length) { c.add(k.text(x + W / 2, y + H / 2 - 10, 'ยังไม่มีจดหมาย — ของขวัญและรางวัลจากทีมงานจะส่งมาที่นี่', 9, '#a89878').setOrigin(0.5)); return; }
    if (!box.some(m => m.id === this.mailSel)) this.mailSel = box[0].id;
    // left: the letters
    const lw = Math.min(230, W * 0.42), per = 7, pages = Math.ceil(box.length / per); this.mailPage = Math.min(this.mailPage, pages - 1);
    box.slice(this.mailPage * per, this.mailPage * per + per).forEach((m, i) => {
      const ry = y + 30 + i * 36, on = m.id === this.mailSel, live = mailLive(m, now), gift = hasGift(m) && !m.claimed && live;
      g.fillStyle(on ? 0x4a3a10 : 0x1a140e, 0.95).fillRoundedRect(x + 10, ry, lw, 32, 4).lineStyle(1, on ? 0xffd84a : gift ? 0xc89a4a : 0x4a3a2a, 1).strokeRoundedRect(x + 10, ry, lw, 32, 4);
      c.add(k.text(x + 18, ry + 7, gift ? '🎁' : !m.read ? '✉' : '📭', 12));
      c.add(k.text(x + 40, ry + 3, m.title.length > 22 ? m.title.slice(0, 21) + '…' : m.title, 8.5, gift || !m.read ? '#ffffff' : '#a89878'));
      c.add(k.text(x + 40, ry + 18, `${m.from} • ${new Date(m.at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}${!live ? ' • หมดอายุ' : ''}`, 6.5, '#8a7a60'));
      const z = ui.add.zone(x + 10, ry, lw, 32).setOrigin(0).setInteractive({ useHandCursor: true });
      z.on('pointerup', () => { this.mailSel = m.id; if (!m.read) act('mailRead', { id: m.id }); sfx.click(); this.rebuild(); }); c.add(z);
    });
    if (pages > 1) for (let i = 0; i < pages; i++) c.add(k.button(x + 10 + i * 30, y + H - 30, 26, 18, String(i + 1), () => { this.mailPage = i; this.rebuild(); }, { size: 8, color: i === this.mailPage ? 0x6a4a10 : 0x2a1d12 }));
    // right: the letter
    const m = box.find(q => q.id === this.mailSel)!, rx = x + lw + 20, rw = W - lw - 30, live = mailLive(m, now);
    if (!m.read) act('mailRead', { id: m.id });
    g.fillStyle(0x0a0705, 0.6).fillRoundedRect(rx, y + 30, rw, H - 44, 5);
    c.add(k.text(rx + 10, y + 38, m.title, 11, '#ffd84a', { fontStyle: 'bold', wordWrap: { width: rw - 20 } }));
    c.add(k.text(rx + 10, y + 58, `จาก ${m.from} • ${new Date(m.at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}`, 7.5, '#a89878'));
    c.add(k.text(rx + 10, y + 76, m.text || '—', 8.5, '#e8dcc0', { wordWrap: { width: rw - 20 } }));
    if (hasGift(m)) {
      const gy = y + H - 104;
      g.fillStyle(m.claimed ? 0x1a2a1a : 0x3a2a10, 0.95).fillRoundedRect(rx + 8, gy, rw - 16, 50, 5).lineStyle(1, m.claimed ? 0x7ad88a : 0xffd84a, 1).strokeRoundedRect(rx + 8, gy, rw - 16, 50, 5);
      c.add(k.text(rx + 16, gy + 5, m.claimed ? '✔ รับแล้ว' : '🎁 ของในจดหมาย', 8, m.claimed ? '#9fffb0' : '#ffd84a'));
      c.add(k.text(rx + 16, gy + 20, giftText(m), 8.5, '#ffffff', { wordWrap: { width: rw - 32 } }));
      if (m.until) c.add(k.text(rx + rw - 14, gy + 5, live ? `หมดอายุ ${new Date(m.until).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}` : 'หมดอายุแล้ว', 7, live ? '#c8b898' : '#ff8a6a').setOrigin(1, 0));
    }
    const canClaim = hasGift(m) && !m.claimed && live, canDel = !canClaim;
    if (canClaim) c.add(k.button(rx + rw / 2 - 70, y + H - 44, 140, 24, '🎁 รับของ', () => {
      const r = act('mailClaim', { id: m.id });
      if (r === 'bag') { sfx.error(); bus.emit(EV.TOAST, 'กระเป๋าเต็ม — ทิ้งหรือขายของก่อนแล้วกลับมารับ', '#ff8a8a'); return; }
      if (typeof r !== 'object') { sfx.error(); bus.emit(EV.TOAST, 'รับไม่ได้', '#ff8a8a'); this.rebuild(); return; }
      sfx.levelUp(); bus.emit(EV.TOAST, `🎁 ได้รับ ${r.got}`, '#ffd84a'); saveGame(s); bus.emit(EV.STATE_CHANGED); this.rebuild();
    }, { size: 10, color: 0x6a4a10 }));
    else c.add(k.button(rx + rw - 84, y + H - 40, 76, 20, '🗑 ลบจดหมาย', () => { act('mailDelete', { id: m.id }); this.mailSel = ''; this.rebuild(); }, { size: 8, color: 0x3a2a2a, disabled: !canDel }));
  }

  // ---------------- CBT GIFT ----------------
  buildCbt(c: Phaser.GameObjects.Container) {
    const s = S(), ui = this.ui, k = this.k, online = isOnline(), got = cbtGot(s);
    const W = Math.min(460, ui.VW - 16), H = 270;
    const { x, y, g } = this.window(c, W, H, '🎁 ของขวัญผู้ทดสอบ CBT');
    c.add(k.text(x + W / 2, y + 30, 'ขอบคุณที่มาช่วยทดสอบเกม! รับได้บัญชีละ 1 ครั้ง', 9, '#ffe7a0').setOrigin(0.5, 0));
    const bx = x + 40, bw = W - 80, by = y + 52;
    g.fillStyle(got ? 0x1a2a1a : 0x3a2a10, 0.95).fillRoundedRect(bx, by, bw, 116, 6).lineStyle(2, got ? 0x7ad88a : 0xffd84a, 1).strokeRoundedRect(bx, by, bw, 116, 6);
    ([['👑', `VIP ${CBT_VIP_DAYS} วัน (ออร่าม่วง)`], ['🏷', `ฉายา「${CBT_TITLE.title}」`], ['💰', `${CBT_PACK.gold.toLocaleString()} ทอง`], ['🧪', `ยาฟื้นพลังใหญ่ x${CBT_PACK.potL}`], ['📜', `ม้วนกลับหมู่บ้าน x${CBT_PACK.scroll}`]] as const)
      .forEach(([ic, line], j) => { c.add(k.text(bx + 20, by + 10 + j * 20, ic, 9)); c.add(k.text(bx + 42, by + 10 + j * 20, line, 9, got ? '#9fb89a' : '#ffffff')); });   // (an emoji in front makes the line measure short and lose its end)
    c.add(k.text(x + W / 2, by + 124, '⚠ ตอนเปิด OBT ข้อมูลทั้งหมดจาก CBT จะถูกล้าง\n(ยกเว้นของ limited ที่จะประกาศภายหลัง)', 8, '#ff9a8a', { align: 'center', padding: { right: 6 } }).setOrigin(0.5, 0));
    const label = got ? '✔ รับแล้ว' : !online ? 'ต้องเล่นแบบออนไลน์' : '🎁 รับของขวัญ';
    c.add(k.button(x + W / 2 - 80, y + H - 38, 160, 26, label, () => {
      if (this.busyAct) return; this.busyAct = true;
      actServer('cbtClaim', {}).then(r => {
        this.busyAct = false;
        if (refused(r)) { sfx.error(); bus.emit(EV.TOAST, r.refused === 'claimed' ? 'รับไปแล้ว' : 'รับไม่ได้', '#ff8a8a'); }
        else { sfx.levelUp(); bus.emit(EV.TOAST, `🎁 ได้ VIP ${CBT_VIP_DAYS} วัน + ฉายา「${CBT_TITLE.title}」!`, '#ffd84a'); }
        saveGame(s); bus.emit(EV.STATE_CHANGED); if (this.cur === 'cbt') this.rebuild();
      });
    }, { size: 10, color: 0x6a4a10, disabled: got || !online }));
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
  /** a slider the player drags (not just taps): track, gold fill, knob, live value; onDone when let go */
  slider(c: Phaser.GameObjects.Container, x: number, y: number, w: number, v: number, lo: number, hi: number, fmt: (v: number) => string, onMove: (v: number) => void, onDone: (v: number) => void) {
    const ui = this.ui, k = this.k, g = ui.add.graphics(), lab = k.text(x + w + 10, y - 7, fmt(v), 10, '#ffe7a0');
    let cur = v;
    const draw = () => {
      const f = (cur - lo) / (hi - lo), kx = x + f * w;
      g.clear().fillStyle(0x0b0805, 0.9).fillRoundedRect(x - 2, y - 5, w + 4, 10, 5).fillStyle(0x3a2a18, 1).fillRoundedRect(x, y - 3, w, 6, 3)
        .fillStyle(0xd9b45a, 1).fillRoundedRect(x, y - 3, Math.max(6, f * w), 6, 3)
        .fillStyle(0x1a1006, 1).fillCircle(kx, y, 9).fillStyle(0xffe7a0, 1).fillCircle(kx, y, 7).fillStyle(0xd9b45a, 1).fillCircle(kx, y, 4);
      lab.setText(fmt(cur));
    };
    const zone = ui.add.zone(x - 12, y - 14, w + 24, 28).setOrigin(0).setInteractive({ useHandCursor: true });
    let drag = false;
    const at = (p: Phaser.Input.Pointer) => {
      const pt = zone.getWorldTransformMatrix().applyInverse(p.worldX, p.worldY);   // (the window may be scaled: use the zone's own space)
      const f = Math.max(0, Math.min(1, (pt.x - 12) / w)); cur = Math.round((lo + f * (hi - lo)) * 100) / 100; draw(); onMove(cur);
    };
    zone.on('pointerdown', (p: Phaser.Input.Pointer) => { drag = true; at(p); });
    const move = (p: Phaser.Input.Pointer) => { if (drag && p.isDown) at(p); };
    const up = () => { if (drag) { drag = false; onDone(cur); } };
    ui.input.on('pointermove', move); ui.input.on('pointerup', up); ui.input.on('pointerupoutside', up);
    zone.once('destroy', () => { ui.input.off('pointermove', move); ui.input.off('pointerup', up); ui.input.off('pointerupoutside', up); });
    draw(); c.add([g, zone, lab]);
  }
  buildUiOpt(c: Phaser.GameObjects.Container) {
    const s = S(), ui = this.ui, k = this.k, o = uiOpt(s);
    const W = 340, H = 300;
    const { x, y } = this.window(c, W, H, 'ตั้งค่าเสียง & UI');
    const apply = () => { saveGame(s); bus.emit(EV.STATE_CHANGED); (ui as unknown as { applyUiOpt?: () => void }).applyUiOpt?.(); };
    const pct = (v: number) => Math.round(v * 100) + '%';
    let yy = y + 48;
    const row = (label: string, key: 'vol' | 'scale' | 'btn' | 'alpha' | 'zoom', live?: (v: number) => void) => {
      c.add(k.text(x + 18, yy - 7, label, 9.5, '#f3e6c4'));
      const [lo, hi] = RANGES[key];
      this.slider(c, x + 130, yy, 140, o[key], lo, hi, pct, v => live?.(v), v => {
        setUiOpt(s, { [key]: v } as Partial<UiOpt>);
        if (key === 'vol') { s.sfx = v > 0; audioState.sfx = s.sfx; saveGame(s); sfx.coinSoft(); return; }   // (sound: no need to redraw the screen)
        if (key === 'zoom') { saveGame(s); bus.emit('td:zoom', v, false); return; }
        apply();
      });
      yy += 40;
    };
    row('🔊 เสียงเอฟเฟกต์', 'vol', v => { setVolume(v); audioState.sfx = v > 0; });
    row('🔍 ซูมกล้อง', 'zoom', v => bus.emit('td:zoom', v, false));
    row('🖥 ขนาด UI', 'scale');
    row('⚔ ขนาดปุ่มต่อสู้', 'btn');
    row('🌫 ความชัดแถบบน', 'alpha');
    c.add(k.text(x + 18, yy - 6, 'ลากปุ่มกลมเพื่อปรับ • ขนาด UI เปลี่ยนเมื่อปล่อยนิ้ว • ซูมในเกม: สองนิ้วถ่าง/หุบ หรือหมุนลูกกลิ้งเมาส์', 7.5, '#a89878', { wordWrap: { width: W - 36 } }));
    yy += 8;
    yy += 12;
    c.add(k.button(x + 18, yy, 130, 22, `ชื่อบนหัวชาวบ้าน: ${o.names ? 'แสดง' : 'ซ่อน'}`, () => { setUiOpt(s, { names: !o.names }); apply(); }, { size: 8.5 }));
    c.add(k.button(x + 156, yy, 80, 22, 'ค่าเริ่มต้น', () => { setUiOpt(s, { scale: 0.9, btn: 1, alpha: 1, names: true, vol: 0.8, zoom: 1 }); setVolume(0.8); bus.emit('td:zoom', 1, false); s.sfx = true; audioState.sfx = true; apply(); }, { size: 8.5, color: 0x5a3a1a }));
    c.add(k.button(x + W - 96, yy, 80, 22, '◀ กลับเมนู', () => this.open('menu'), { size: 8.5 }));
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
        const sd = (s as unknown as { shopDay?: { d: string; shards: number } }), today = dayKey();
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
