// Building interiors of the guild village (docs/GUILD_WAR.md 4, 5, 13): one small room per building, furnished with the
// PixelLab furniture objects (fu_*). Every piece you can use is a hotspot: walking up to it offers its action.
// The room itself (floor, walls, door) is drawn in code.
import type { GuildTab } from '../ui/guildPanels';

export type RoomKind = 'hall' | 'warehouse' | 'barracks' | 'forge' | 'kitchen' | 'tavern' | 'market' | 'house';
/** what a hotspot does: a guild window tab, one of the existing windows, or a house action */
export type HotAct = { tab: GuildTab } | { panel: 'smith' | 'shop' | 'market' | 'wardrobe' | 'alchemy' | 'stash' | 'trophy' } | { plot: 'forge' | 'kitchen' } | { sleep: true };
export interface Furn { k: string; x: number; y: number; label?: string; act?: HotAct; sc?: number }
export interface Room { name: string; floor: 'plank' | 'stone'; wall: 'wood' | 'stone'; furn: Furn[] }

/** room size (the whole map): floor from y = WALL to RH - 16, walls round it, the door in the middle of the bottom wall */
export const RW = 448, RH = 320, WALL = 80;
export const DOOR = { x: RW / 2, y: RH - 22 };

export const ROOMS: Record<RoomKind, Room> = {
  hall: { name: 'หอกิลด์', floor: 'stone', wall: 'stone', furn: [
    { k: 'fu_throne', x: 224, y: 120, label: '👥 สมาชิกกิลด์', act: { tab: 'members' } },
    { k: 'fu_wartable', x: 224, y: 216, label: '⚔ โต๊ะวางแผนปล้น', act: { tab: 'raid' } },
    { k: 'fu_donation', x: 96, y: 150, label: '🎁 หีบบริจาค', act: { tab: 'donate' } },
    { k: 'fu_board', x: 352, y: 128, label: '📜 กระดานภารกิจกิลด์', act: { tab: 'goals' } },
    { k: 'fu_shelf', x: 96, y: 104, label: '🛒 ร้านกิลด์', act: { tab: 'shop' } },
    { k: 'fu_fireplace', x: 368, y: 214, label: '📖 บันทึกกิลด์', act: { tab: 'log' } },
    { k: 'def_banner', x: 160, y: 112 }, { k: 'def_banner', x: 288, y: 112 }, { k: 'fu_rug', x: 224, y: 264, sc: 0.9 },
  ] },
  warehouse: { name: 'โกดัง & ห้องนิรภัย', floor: 'stone', wall: 'stone', furn: [
    { k: 'fu_vault', x: 224, y: 128, label: '🔐 ห้องนิรภัย (บริจาคเข้าคลัง)', act: { tab: 'donate' } },
    { k: 'fu_desk', x: 112, y: 200, label: '📒 สมุดบัญชีคลัง', act: { tab: 'log' } },
    { k: 'fu_goods', x: 352, y: 120, label: '🏗 อาคารหมู่บ้าน', act: { tab: 'build' } },
    { k: 'fu_sacks', x: 80, y: 120 }, { k: 'barrel_1', x: 380, y: 220 }, { k: 'barrel_1', x: 404, y: 236 }, { k: 'fu_sacks', x: 340, y: 250 },
  ] },
  barracks: { name: 'ค่ายทหาร', floor: 'plank', wall: 'wood', furn: [
    { k: 'fu_weaponrack', x: 224, y: 116, label: '💂 จ้างทหาร', act: { tab: 'guards' } },
    { k: 'fu_dummy', x: 348, y: 200, label: '🛡 ป้อมรอบหมู่บ้าน', act: { tab: 'defense' } },
    { k: 'def_banner', x: 120, y: 112 }, { k: 'fu_bunk', x: 80, y: 200 }, { k: 'fu_bunk', x: 80, y: 262 }, { k: 'fu_table', x: 224, y: 230 },
  ] },
  forge: { name: 'โรงหลอมกิลด์', floor: 'stone', wall: 'stone', furn: [
    { k: 'fu_furnace', x: 120, y: 132, label: '⚒ หลอมของ', act: { plot: 'forge' } },
    { k: 'fu_anvil', x: 240, y: 196, label: '🔨 ตีบวก', act: { panel: 'smith' } },
    { k: 'fu_weaponrack', x: 352, y: 116 }, { k: 'barrel_0', x: 380, y: 236 }, { k: 'fu_shelf', x: 300, y: 108 },
  ] },
  kitchen: { name: 'ครัวกิลด์', floor: 'plank', wall: 'wood', furn: [
    { k: 'fu_cauldron', x: 224, y: 150, label: '🍲 ทำอาหาร', act: { plot: 'kitchen' } },
    { k: 'fu_shelf', x: 96, y: 108, label: '🧪 ปรุงยา', act: { panel: 'alchemy' } },
    { k: 'fu_fireplace', x: 352, y: 116 }, { k: 'fu_table', x: 330, y: 236 }, { k: 'fu_sacks', x: 96, y: 236 }, { k: 'barrel_1', x: 140, y: 250 },
  ] },
  tavern: { name: 'โรงเตี๊ยมกิลด์', floor: 'plank', wall: 'wood', furn: [
    { k: 'fu_bar', x: 160, y: 136, label: '🍺 ร้านกิลด์', act: { tab: 'shop' } },
    { k: 'fu_board', x: 352, y: 116, label: '📜 กระดานภารกิจ / ค่าหัว', act: { tab: 'goals' } },
    { k: 'fu_table', x: 300, y: 220 }, { k: 'fu_table', x: 120, y: 240 }, { k: 'fu_fireplace', x: 400, y: 200 }, { k: 'barrel_1', x: 56, y: 132 },
  ] },
  market: { name: 'ตลาดกิลด์', floor: 'stone', wall: 'wood', furn: [
    { k: 'fu_goods', x: 132, y: 120, label: '🏪 ตลาดกลาง', act: { panel: 'market' } },
    { k: 'fu_desk', x: 300, y: 180, label: '💰 ร้านค้า', act: { panel: 'shop' } },
    { k: 'fu_sacks', x: 360, y: 116 }, { k: 'barrel_1', x: 96, y: 236 }, { k: 'fu_sacks', x: 380, y: 250 }, { k: 'fu_table', x: 200, y: 250 },
  ] },
  house: { name: 'บ้านของฉัน', floor: 'plank', wall: 'wood', furn: [
    { k: 'fu_bed', x: 96, y: 136, label: '🛏 นอนพัก (สะสมพลังพักผ่อน)', act: { sleep: true } },
    { k: 'fu_chest', x: 224, y: 116, label: '🧰 หีบส่วนตัว', act: { panel: 'stash' } },
    { k: 'fu_trophy', x: 352, y: 120, label: '🏆 ตู้โชว์ของแรร์', act: { panel: 'trophy' } },
    { k: 'fu_wardrobe', x: 400, y: 214, label: '👕 ตู้เสื้อผ้า', act: { panel: 'wardrobe' } },
    { k: 'fu_rug', x: 224, y: 220 }, { k: 'fu_table', x: 120, y: 240 }, { k: 'fu_fireplace', x: 300, y: 112 },
  ] },
};

/** the building at a guild village plot, as a room (production buildings work outdoors and have none) */
export function roomOf(type: string): RoomKind | null { return type in ROOMS ? type as RoomKind : null; }

type RGB = [number, number, number];
const h2 = (x: number, y: number) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
/** paint the room: floor planks or flagstones, back wall with a skirting board and window light, side walls, the door */
export function paintRoom(ctx: CanvasRenderingContext2D, r: Room) {
  ctx.fillStyle = '#0b0d0c'; ctx.fillRect(0, 0, RW, RH);
  const px = (x: number, y: number, c: RGB, k = 1) => { ctx.fillStyle = `rgb(${c[0] * k | 0},${c[1] * k | 0},${c[2] * k | 0})`; ctx.fillRect(x, y, 1, 1); };
  // floor
  for (let y = WALL; y < RH - 16; y++) for (let x = 16; x < RW - 16; x++) {
    let c: RGB, k = 0.92 + h2(x, y) * 0.1;
    if (r.floor === 'plank') {
      const row = Math.floor((y - WALL) / 10), off = (row * 37) % 48, seam = (x + off) % 48 === 0 || (y - WALL) % 10 === 0;
      c = seam ? [58, 40, 28] : ([[112, 80, 54], [102, 72, 48], [120, 88, 58]] as RGB[])[Math.floor(h2(Math.floor((x + off) / 48), row) * 3)];
    } else {
      const row = Math.floor((y - WALL) / 16), off = (row % 2) * 12, seam = (x + off) % 24 === 0 || (y - WALL) % 16 === 0;
      c = seam ? [52, 54, 56] : ([[104, 106, 108], [96, 98, 102], [112, 112, 114]] as RGB[])[Math.floor(h2(Math.floor((x + off) / 24), row) * 3)];
    }
    px(x, y, c, k);
  }
  // soft shadow under the back wall
  for (let y = WALL; y < WALL + 10; y++) { ctx.fillStyle = `rgba(0,0,0,${0.4 * (1 - (y - WALL) / 10)})`; ctx.fillRect(16, y, RW - 32, 1); }
  // back wall
  for (let y = 8; y < WALL; y++) for (let x = 16; x < RW - 16; x++) {
    let c: RGB;
    if (r.wall === 'wood') { const seam = x % 16 === 0; c = seam ? [46, 32, 22] : ([[86, 60, 40], [80, 56, 38]] as RGB[])[Math.floor(h2(Math.floor(x / 16), 3) * 2)]; }
    else { const row = Math.floor(y / 12), seam = (x + (row % 2) * 10) % 20 === 0 || y % 12 === 0; c = seam ? [44, 44, 48] : ([[86, 86, 92], [78, 78, 84], [92, 90, 94]] as RGB[])[Math.floor(h2(Math.floor((x + (row % 2) * 10) / 20), row) * 3)]; }
    px(x, y, c, 0.8 + (y / WALL) * 0.25);
  }
  ctx.fillStyle = 'rgb(48,32,22)'; ctx.fillRect(16, WALL - 6, RW - 32, 6);          // skirting board
  ctx.fillStyle = 'rgb(70,50,34)'; ctx.fillRect(16, WALL - 6, RW - 32, 1);
  // two windows with evening light
  for (const wx of [96, RW - 96]) {
    ctx.fillStyle = 'rgb(38,28,20)'; ctx.fillRect(wx - 18, 20, 36, 34);
    const g = ctx.createLinearGradient(0, 22, 0, 52); g.addColorStop(0, '#f2c27a'); g.addColorStop(1, '#8a5a3a');
    ctx.fillStyle = g; ctx.fillRect(wx - 15, 23, 30, 28);
    ctx.fillStyle = 'rgb(38,28,20)'; ctx.fillRect(wx - 1, 23, 2, 28); ctx.fillRect(wx - 15, 36, 30, 2);
    const lg = ctx.createRadialGradient(wx, WALL + 40, 4, wx, WALL + 40, 70); lg.addColorStop(0, 'rgba(255,214,150,0.16)'); lg.addColorStop(1, 'rgba(255,214,150,0)');
    ctx.fillStyle = lg; ctx.fillRect(wx - 80, WALL, 160, 110);
  }
  // side walls + bottom wall with the door gap
  ctx.fillStyle = r.wall === 'wood' ? 'rgb(52,36,26)' : 'rgb(56,56,62)';
  ctx.fillRect(0, 0, 16, RH); ctx.fillRect(RW - 16, 0, 16, RH); ctx.fillRect(0, 0, RW, 8);
  ctx.fillRect(0, RH - 16, DOOR.x - 24, 16); ctx.fillRect(DOOR.x + 24, RH - 16, RW - DOOR.x - 24, 16);
  ctx.fillStyle = 'rgba(255,230,170,0.25)'; ctx.fillRect(DOOR.x - 24, RH - 16, 48, 16);   // light from outside
}
/** walkable floor (the door gap included) */
export const roomFloor = (x: number, y: number) => (x > 18 && x < RW - 18 && y > WALL + 2 && y < RH - 16) || (Math.abs(x - DOOR.x) < 22 && y >= RH - 16 && y < RH - 2);
