// Mounts (director): ride for speed — the dragon faster than the horse. The animal is drawn alone with an empty saddle
// and the game seats the hero's own picture on it (world/mount.ts), so every hero form rides every mount.
// The dragon is LIMITED and rare: earned only by playing (bounty lords, season #1) — never sold, since it is faster
// (no pay-to-win). The horse is bought with gold (a gold sink).
export type MountId = 'horse' | 'dragon' | 'wolf' | 'bear' | 'stag' | 'panther' | 'gdragon';
/** seat: per direction (S, SE, E, NE, N, NW, W, SW) the point in the mount picture (px of its frame) where the rider's hips go */
export interface MountDef { id: MountId; name: string; key: string; speed: number; scale: number; seat: [number, number][]; /** per direction, extra parts of the animal drawn in front of the rider: [x0, x1, y0] rects (the head / neck when it is on the near side); the body under the saddle is always in front */ front?: [number, number, number][][]; desc: string; price?: { gold: number; lv: number }; limited?: string; fire?: boolean }
export const MOUNTS: Record<MountId, MountDef> = {
  horse: { id: 'horse', name: 'ม้าศึก', key: 'mt_horse', speed: 1.3, scale: 0.92, desc: 'ม้าแข็งแรงพร้อมอาน วิ่งเร็วขึ้น 30%', price: { gold: 30000, lv: 15 },
    seat: [[56, 34], [44, 31], [52, 32], [50, 34], [55, 36], [54, 34], [52, 32], [60, 31]], front: [[[44, 68, 34]], [[56, 84, 18]], [[62, 92, 16]], [], [[44, 70, 34]], [], [[12, 42, 16]], [[20, 48, 18]]] },
  dragon: { id: 'dragon', name: 'มังกรเพลิงนิรันดร์', key: 'mt_dragon', speed: 1.5, scale: 0.92, fire: true, desc: '✦ ลิมิเต็ด ✦ มังกรไฟในตำนาน วิ่งเร็วขึ้น 50% — ได้จากบอสค่าหัว / อันดับ 1 ฤดูกาล / กงล้อเพชร', limited: 'บอสค่าหัว (หายากมาก) • อันดับ 1 ฤดูกาลกิลด์วอร์ • 💎 กงล้อเพชร (หรือแลก ⭐ 150)',
    seat: [[59, 40], [50, 46], [60, 46], [56, 46], [58, 52], [60, 46], [60, 46], [72, 45]], front: [[[44, 74, 16]], [[60, 96, 18]], [[66, 100, 18]], [], [[46, 72, 50]], [], [[20, 54, 18]], [[24, 62, 18]]] },
  // 14 Nov (director): Legend 140% wolf / bear · SL 145% stag / panther · Limited 150% golden dragon (it flies). Seats read by eye
  // on the grid (tools/mount_grid.py → tools/mount_seats_manual.json), checked in the game.
  wolf: { id: 'wolf', name: 'หมาป่าเงาจันทร์', key: 'mt_wolf2', speed: 1.4, scale: 0.9, desc: 'หมาป่ายักษ์ขนดำเทา ตาเรืองฟ้า วิ่งเร็วขึ้น 40%', seat: [[36,18],[33,18],[38,17],[40,19],[33,19],[36,19],[40,17],[43,18]], front: [[[18,56,24]],[[43,76,22]],[[52,76,0]],[[5,40,30]],[[18,50,28]],[[40,76,30]],[[0,26,0]],[[0,38,22]]] },
  bear: { id: 'bear', name: 'หมีศึกเกราะเหล็ก', key: 'mt_bear2', speed: 1.4, scale: 1.0, desc: 'หมีศึกใส่เกราะเหล็ก วิ่งเร็วขึ้น 40%', seat: [[42,14],[36,14],[35,14],[42,14],[42,14],[40,16],[48,15],[45,15]], front: [[[14,72,22]],[[44,84,18]],[[48,84,0]],[[0,45,26]],[[18,66,22]],[[40,84,26]],[[0,36,0]],[[0,48,20]]] },
  stag: { id: 'stag', name: 'กวางวิญญาณพงไพร', key: 'mt_stag2', speed: 1.45, scale: 1.0, desc: 'กวางขาว เขาเถาวัลย์เรืองแสง วิ่งเร็วขึ้น 45%', seat: [[42,26],[34,32],[34,32],[40,33],[42,33],[42,35],[50,32],[46,30]], front: [[[28,56,30]],[[42,84,30]],[[46,84,0]],[[0,45,42]],[[26,58,40]],[[40,84,42]],[[0,36,0]],[[0,40,28]]] },
  panther: { id: 'panther', name: 'เสือดำทมิฬ', key: 'mt_panther2', speed: 1.45, scale: 1.05, desc: 'เสือดำลายม่วง ตาเหลือง วิ่งเร็วขึ้น 45%', seat: [[36,18],[32,20],[33,19],[36,20],[36,20],[35,22],[40,19],[44,20]], front: [[[20,52,24]],[[40,76,24]],[[46,76,0]],[[0,32,30]],[[22,50,28]],[[38,76,32]],[[0,28,0]],[[0,40,26]]] },
  gdragon: { id: 'gdragon', name: 'มังกรทองเหินฟ้า', key: 'mt_gdragon', speed: 1.5, scale: 1.15, fire: true, desc: '✦ ลิมิเต็ด ✦ มังกรทองบินได้ วิ่งเร็วขึ้น 50%', limited: 'ตู้สุ่ม', seat: [[47,40],[49,40],[42,45],[38,45],[47,47],[57,45],[50,45],[44,40]], front: [[[31,63,47]],[[58,96,30]],[[62,96,0]],[],[[32,62,56]],[],[[0,30,0]],[[0,38,30]]] },
};
export const MOUNT_ORDER: MountId[] = ['horse', 'dragon'];
/** a bounty lord drops the dragon this rarely (never shown to players) */
export const DRAGON_BOUNTY = 0.004;
