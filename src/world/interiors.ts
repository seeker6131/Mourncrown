// Building interiors of the guild village (docs/GUILD_WAR.md 4, 5, 13): one small room per building, furnished with the
// PixelLab furniture objects (fu_*). Every piece you can use is a hotspot: walking up to it offers its action.
// The room itself (floor, walls, door) is drawn in code.
import type { GuildTab } from '../ui/guildPanels';

export type RoomKind = 'hall' | 'warehouse' | 'barracks' | 'forge' | 'kitchen' | 'tavern' | 'market' | 'lumber' | 'quarry' | 'barn' | 'house';
/** what a hotspot does: a guild window tab, one of the existing windows, or a house action */
export type HotAct = { collect: 'lumber' | 'quarry' | 'barn' } | { tab: GuildTab } | { panel: 'smith' | 'shop' | 'market' | 'wardrobe' | 'alchemy' | 'stash' | 'trophy' } | { plot: 'forge' | 'kitchen' } | { sleep: true };
export interface Furn { k: string; x: number; y: number; label?: string; act?: HotAct; sc?: number }
export interface Room { name: string; floor: 'plank' | 'stone'; wall: 'wood' | 'stone'; furn: Furn[]; win?: number[] }

/** room size (the whole map): 14 x 10 cells of 32 px. Rows 0-2 = the back wall (its top, then its face, 2 rows tall),
 *  one cell of side wall left and right, the bottom wall with the door gap in the middle (src/assets/td/room tilesets). */
export const RW = 448, RH = 320, WALL = 96;
export const DOOR = { x: RW / 2, y: RH - 14 };
/** which tileset each room uses (floor / wall look) */
export const ROOM_SET: Record<RoomKind, string> = { hall: 'rt_stone', warehouse: 'rt_stone', barracks: 'rt_stone', forge: 'rt_stone', kitchen: 'rt_woodstone', tavern: 'rt_woodstone', market: 'rt_woodstone', lumber: 'rt_wood', quarry: 'rt_stone', barn: 'rt_wood', house: 'rt_wood' };

export const ROOMS: Record<RoomKind, Room> = {
  hall: { name: 'หอกิลด์', floor: 'stone', wall: 'stone', win: [128], furn: [
    { k: 'fu_throne', x: 224, y: 116, label: '👥 สมาชิกกิลด์', act: { tab: 'members' } },
    { k: 'def_banner', x: 178, y: 110 }, { k: 'def_banner', x: 270, y: 110 },
    { k: 'fu_shelf', x: 66, y: 112, label: '🛒 ร้านกิลด์', act: { tab: 'shop' } },
    { k: 'fu_board', x: 384, y: 112, label: '📜 กระดานภารกิจกิลด์', act: { tab: 'goals' } },
    { k: 'fu_fireplace', x: 314, y: 112, label: '📖 บันทึกกิลด์', act: { tab: 'log' } },
    { k: 'fu_rug', x: 224, y: 246, sc: 2 },
    { k: 'fu_wartable', x: 224, y: 206, label: '⚔ โต๊ะวางแผนปล้น', act: { tab: 'raid' } },
    { k: 'fu_donation', x: 52, y: 196, label: '🎁 หีบบริจาค', act: { tab: 'donate' } },
    { k: 'crate_0', x: 400, y: 200 }, { k: 'barrel_1', x: 404, y: 236 },
  ] },
  warehouse: { name: 'โกดัง & ห้องนิรภัย', floor: 'stone', wall: 'stone', win: [96], furn: [
    { k: 'fu_vault', x: 224, y: 116, label: '🔐 ห้องนิรภัย (บริจาคเข้าคลัง)', act: { tab: 'donate' } },
    { k: 'fu_goods', x: 352, y: 112, label: '🏗 อาคารหมู่บ้าน', act: { tab: 'build' } },
    { k: 'fu_desk', x: 112, y: 196, label: '📒 สมุดบัญชีคลัง', act: { tab: 'log' } },
    { k: 'crate_0', x: 52, y: 120 }, { k: 'crate_1', x: 84, y: 118 }, { k: 'crate_2', x: 60, y: 146 },
    { k: 'fu_sacks', x: 400, y: 170 }, { k: 'barrel_0', x: 404, y: 210 }, { k: 'barrel_2', x: 380, y: 226 }, { k: 'fu_sacks', x: 60, y: 276 }, { k: 'crate_3', x: 396, y: 282 },
  ] },
  barracks: { name: 'ค่ายทหาร', floor: 'stone', wall: 'stone', win: [70, 378], furn: [
    { k: 'fu_weaponrack', x: 224, y: 114, label: '💂 จ้างทหาร', act: { tab: 'guards' } },
    { k: 'def_banner', x: 150, y: 110 }, { k: 'def_banner', x: 298, y: 110 },
    { k: 'fu_bunk', x: 60, y: 170 }, { k: 'fu_bunk', x: 60, y: 262 }, { k: 'fu_bunk', x: 390, y: 170 },
    { k: 'fu_dummy', x: 330, y: 250, label: '🛡 ป้อมรอบหมู่บ้าน', act: { tab: 'defense' } },
    { k: 'fu_table', x: 210, y: 220 }, { k: 'barrel_2', x: 404, y: 270 },
  ] },
  forge: { name: 'โรงหลอมกิลด์', floor: 'stone', wall: 'stone', win: [224], furn: [
    { k: 'fu_furnace', x: 104, y: 120, label: '⚒ หลอมของ', act: { plot: 'forge' } },
    { k: 'fu_weaponrack', x: 340, y: 112 },
    { k: 'fu_anvil', x: 214, y: 196, label: '🔨 ตีบวก', act: { panel: 'smith' } },
    { k: 'barrel_0', x: 262, y: 200 }, { k: 'logs_1', x: 404, y: 170 }, { k: 'ore_1', x: 60, y: 262 }, { k: 'crate_1', x: 396, y: 270 },
  ] },
  kitchen: { name: 'ครัวกิลด์', floor: 'plank', wall: 'stone', win: [150, 290], furn: [
    { k: 'fu_cauldron', x: 224, y: 132, label: '🍲 ทำอาหาร', act: { plot: 'kitchen' } },
    { k: 'fu_shelf', x: 76, y: 112, label: '🧪 ปรุงยา', act: { panel: 'alchemy' } },
    { k: 'fu_fireplace', x: 366, y: 112 },
    { k: 'fu_table', x: 224, y: 226 }, { k: 'fu_sacks', x: 58, y: 250 }, { k: 'barrel_3', x: 404, y: 210 }, { k: 'crate_3', x: 396, y: 262 },
  ] },
  tavern: { name: 'โรงเตี๊ยมกิลด์', floor: 'plank', wall: 'stone', win: [270], furn: [
    { k: 'fu_bar', x: 150, y: 126, label: '🍺 ร้านกิลด์', act: { tab: 'shop' } },
    { k: 'fu_board', x: 372, y: 112, label: '📜 กระดานภารกิจ / ค่าหัว', act: { tab: 'goals' } },
    { k: 'fu_table', x: 310, y: 196 }, { k: 'fu_table', x: 120, y: 230 }, { k: 'fu_table', x: 330, y: 264 },
    { k: 'barrel_0', x: 404, y: 160 }, { k: 'barrel_1', x: 52, y: 166 },
  ] },
  market: { name: 'ตลาดกิลด์', floor: 'plank', wall: 'stone', win: [224], furn: [
    { k: 'fu_goods', x: 108, y: 112, label: '🏪 ตลาดกลาง', act: { panel: 'market' } },
    { k: 'fu_goods', x: 340, y: 112 },
    { k: 'fu_desk', x: 224, y: 190, label: '💰 ร้านค้า', act: { panel: 'shop' } },
    { k: 'fu_sacks', x: 58, y: 252 }, { k: 'crate_0', x: 396, y: 230 }, { k: 'crate_2', x: 404, y: 262 }, { k: 'barrel_1', x: 60, y: 200 },
  ] },
  lumber: { name: 'โรงไม้กิลด์', floor: 'plank', wall: 'wood', win: [224], furn: [
    { k: 'dc_woodpile', x: 110, y: 120, label: '📦 เก็บไม้เข้าคลังหมู่บ้าน', act: { collect: 'lumber' } },
    { k: 'logs_2', x: 330, y: 116 }, { k: 'logs_3', x: 376, y: 120 }, { k: 'logs_4', x: 56, y: 200 }, { k: 'logs_1', x: 400, y: 200 },
    { k: 'stump_1', x: 200, y: 210, label: '🏗 อาคารหมู่บ้าน', act: { tab: 'build' } }, { k: 'stump_2', x: 250, y: 236 }, { k: 'crate_1', x: 60, y: 270 }, { k: 'barrel_2', x: 404, y: 270 },
  ] },
  quarry: { name: 'เหมืองหินกิลด์', floor: 'stone', wall: 'stone', win: [224], furn: [
    { k: 'ore_2', x: 110, y: 120, label: '📦 เก็บหินเข้าคลังหมู่บ้าน', act: { collect: 'quarry' } },
    { k: 'rock_3', x: 330, y: 118 }, { k: 'rock_5', x: 370, y: 124 }, { k: 'ore_4', x: 56, y: 200 }, { k: 'rock_1', x: 400, y: 196 },
    { k: 'fu_anvil', x: 214, y: 204, label: '🏗 อาคารหมู่บ้าน', act: { tab: 'build' } }, { k: 'cart_1', x: 300, y: 250 }, { k: 'crate_2', x: 60, y: 272 }, { k: 'fu_sacks', x: 400, y: 272 },
  ] },
  barn: { name: 'คอกสัตว์กิลด์', floor: 'plank', wall: 'wood', win: [110, 338], furn: [
    { k: 'hay_2', x: 224, y: 118, label: '📦 เก็บอาหารเข้าคลังหมู่บ้าน', act: { collect: 'barn' } },
    { k: 'hay_0', x: 64, y: 120 }, { k: 'hay_1', x: 92, y: 126 }, { k: 'dc_trough', x: 330, y: 196 }, { k: 'barrel_0', x: 404, y: 130 },
    { k: 'cart_0', x: 90, y: 250, label: '🏗 อาคารหมู่บ้าน', act: { tab: 'build' } }, { k: 'fu_sacks', x: 404, y: 270 }, { k: 'hay_0', x: 380, y: 250 },
  ] },
  house: { name: 'บ้านของฉัน', floor: 'plank', wall: 'wood', win: [412], furn: [
    { k: 'fu_bed', x: 66, y: 140, label: '🛏 นอนพัก (สะสมพลังพักผ่อน)', act: { sleep: true } },
    { k: 'fu_chest', x: 162, y: 114, label: '🧰 หีบส่วนตัว', act: { panel: 'stash' } },
    { k: 'fu_fireplace', x: 246, y: 112 },
    { k: 'fu_trophy', x: 340, y: 114, label: '🏆 ตู้โชว์ของแรร์', act: { panel: 'trophy' } },
    { k: 'fu_wardrobe', x: 408, y: 212, label: '👕 ตู้เสื้อผ้า', act: { panel: 'wardrobe' } },
    { k: 'fu_rug', x: 224, y: 220, sc: 2 }, { k: 'fu_table', x: 110, y: 246 }, { k: 'barrel_0', x: 404, y: 278 },
  ] },
};

/** the building at a guild village plot, as a room (production buildings work outdoors and have none) */
export function roomOf(type: string): RoomKind | null { return type in ROOMS ? type as RoomKind : null; }

/** terrain at a vertex of the room grid (15 x 11): u = wall top, t = wall face (below the back wall), l = floor */
export function roomVertex(i: number, j: number): 'u' | 't' | 'l' {
  if (j <= 1) return 'u';
  if (j === 2) return i === 0 || i === 14 ? 'u' : 't';
  if (j === 10) return i >= 6 && i <= 8 ? 'l' : 'u';
  return i === 0 || i === 14 ? 'u' : 'l';
}
const h2 = (x: number, y: number) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
/** paint the room from its tileset (Wang corners NW NE SW SE), then windows with evening light on the back wall */
export function paintRoom(ctx: CanvasRenderingContext2D, img: CanvasImageSource, corners: string[], windows: number[] = [128, RW - 128]) {
  ctx.fillStyle = '#0b0d0c'; ctx.fillRect(0, 0, RW, RH);
  for (let j = 0; j < 10; j++) for (let i = 0; i < 14; i++) {
    const key = roomVertex(i, j) + roomVertex(i + 1, j) + roomVertex(i, j + 1) + roomVertex(i + 1, j + 1);
    const all = corners.map((c, n) => c === key ? n : -1).filter(n => n >= 0);
    const n = all.length ? all[Math.floor(h2(i, j) * all.length)] : corners.indexOf(key.replace(/t/g, 'u'));
    if (n < 0) continue;
    ctx.drawImage(img, (n % 5) * 32, Math.floor(n / 5) * 32, 32, 32, i * 32, j * 32, 32, 32);
  }
  // windows on the wall face, a warm pixel light pool under each (dithered, no blur)
  for (const wx of windows) {
    ctx.fillStyle = '#2a1c12'; ctx.fillRect(wx - 15, 42, 30, 36);
    ctx.fillStyle = '#e8b06a'; ctx.fillRect(wx - 12, 45, 24, 30);
    ctx.fillStyle = '#f6d498'; ctx.fillRect(wx - 12, 45, 24, 10);
    ctx.fillStyle = '#2a1c12'; ctx.fillRect(wx - 1, 45, 2, 30); ctx.fillRect(wx - 12, 58, 24, 2);
    ctx.fillStyle = '#4a3220'; ctx.fillRect(wx - 17, 76, 34, 4);
    ctx.fillStyle = 'rgba(255,214,150,0.10)';
    for (let y = WALL; y < WALL + 70; y++) for (let x = wx - 34; x < wx + 34; x++) if ((x + y) % 2 === 0 && ((x - wx) / 34) ** 2 + ((y - WALL) / 70) ** 2 < 1) ctx.fillRect(x, y, 1, 1);
  }
}
/** walkable floor (the door gap included) */
export const roomFloor = (x: number, y: number) => (x > 20 && x < RW - 20 && y > WALL + 4 && y < RH - 18) || (Math.abs(x - DOOR.x) < 26 && y >= RH - 18 && y < RH - 1);
