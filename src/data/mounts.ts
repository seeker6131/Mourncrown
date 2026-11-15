// Mounts (director): ride for speed — the dragon faster than the horse. The animal is drawn alone with an empty saddle
// and the game seats the hero's own picture on it (world/mount.ts), so every hero form rides every mount.
// The dragon is LIMITED and rare: earned only by playing (bounty lords, season #1) — never sold, since it is faster
// (no pay-to-win). The horse is bought with gold (a gold sink).
export type MountId = 'horse' | 'dragon' | 'wolf' | 'bear' | 'stag' | 'panther' | 'gdragon';
/** seat: per direction (S, SE, E, NE, N, NW, W, SW) the point in the mount picture (px of its frame) where the rider's hips go */
export interface MountDef { id: MountId; name: string; key: string; speed: number; scale: number; seat: [number, number][]; /** per direction, extra parts of the animal drawn in front of the rider: [x0, x1, y0] rects (the head / neck when it is on the near side); the body under the saddle is always in front */ front?: [number, number, number][][]; desc: string; price?: { gold: number; lv: number }; limited?: string; fire?: boolean; /** flies (px above the ground): the flap loops even standing still, the shadow stays on the ground */ fly?: number }
export const MOUNTS: Record<MountId, MountDef> = {
  horse: { id: 'horse', name: 'ม้าศึก', key: 'mt_horse', speed: 1.3, scale: 0.92, desc: 'ม้าแข็งแรงพร้อมอาน วิ่งเร็วขึ้น 30%', price: { gold: 30000, lv: 15 },
    seat: [[56, 34], [44, 31], [52, 32], [50, 34], [55, 36], [54, 34], [52, 32], [60, 31]], front: [[[44, 68, 34]], [[56, 84, 18]], [[62, 92, 16]], [], [[44, 70, 34]], [], [[12, 42, 16]], [[20, 48, 18]]] },
  dragon: { id: 'dragon', name: 'มังกรเพลิงนิรันดร์', key: 'mt_dragon', speed: 1.5, scale: 0.92, fire: true, desc: '✦ ลิมิเต็ด ✦ มังกรไฟในตำนาน วิ่งเร็วขึ้น 50% — ได้จากบอสค่าหัว / อันดับ 1 ฤดูกาล / กงล้อเพชร', limited: 'บอสค่าหัว (หายากมาก) • อันดับ 1 ฤดูกาลกิลด์วอร์ • 💎 กงล้อเพชร (หรือแลก ⭐ 150)',
    seat: [[59, 40], [50, 46], [60, 46], [56, 46], [58, 52], [60, 46], [60, 46], [72, 45]], front: [[[44, 74, 16]], [[60, 96, 18]], [[66, 100, 18]], [], [[46, 72, 50]], [], [[20, 54, 18]], [[24, 62, 18]]] },
  // 14 Nov (director): Legend 140% wolf / bear · SL 145% stag / panther · Limited 150% golden dragon (it flies). Seats read by eye
  // on the grid (tools/mount_grid.py → tools/mount_seats_manual.json), checked in the game.
  wolf: { id: 'wolf', name: 'หมาป่าเงาจันทร์', key: 'mt_wolf2', speed: 1.4, scale: 0.9, desc: 'หมาป่ายักษ์ขนดำเทา ตาเรืองฟ้า วิ่งเร็วขึ้น 40%', seat: [[52,34],[49,34],[54,33],[56,35],[49,35],[52,35],[56,33],[59,34]], front: [[[34,72,40]],[[59,108,38]],[[68,108,0]],[[21,56,46]],[[34,66,44]],[[56,108,46]],[[16,42,0]],[[16,54,38]]] },
  bear: { id: 'bear', name: 'หมีศึกเกราะเหล็ก', key: 'mt_bear2', speed: 1.4, scale: 1.0, desc: 'หมีศึกใส่เกราะเหล็ก วิ่งเร็วขึ้น 40%', seat: [[60,32],[54,32],[53,32],[60,32],[60,32],[58,34],[66,33],[63,33]], front: [[[32,90,40]],[[62,120,36]],[[66,120,0]],[[18,63,44]],[[36,84,40]],[[58,120,44]],[[18,54,0]],[[18,66,38]]] },
  stag: { id: 'stag', name: 'กวางวิญญาณพงไพร', key: 'mt_stag2', speed: 1.45, scale: 1.0, desc: 'กวางขาว เขาเถาวัลย์เรืองแสง วิ่งเร็วขึ้น 45%', seat: [[56,40],[48,46],[48,46],[54,47],[56,47],[56,49],[64,46],[60,44]], front: [[[42,70,44]],[[56,112,44]],[[60,112,0]],[[14,59,56]],[[40,72,54]],[[54,112,56]],[[14,50,0]],[[14,54,42]]] },
  panther: { id: 'panther', name: 'เสือดำทมิฬ', key: 'mt_panther2', speed: 1.45, scale: 1.05, desc: 'เสือดำลายม่วง ตาเหลือง วิ่งเร็วขึ้น 45%', seat: [[50,32],[46,34],[47,33],[50,34],[50,34],[49,36],[54,33],[58,34]], front: [[[34,66,38]],[[54,104,38]],[[60,104,0]],[[14,46,44]],[[36,64,42]],[[52,104,46]],[[14,42,0]],[[14,54,40]]] },
  gdragon: { id: 'gdragon', name: 'มังกรทองเหินฟ้า', key: 'mt_gdragon2', speed: 1.5, scale: 0.9, fire: true, desc: '✦ ลิมิเต็ด ✦ มังกรทองบินได้ วิ่งเร็วขึ้น 50%', limited: 'ตู้สุ่ม', seat: [[65,54],[56,56],[61,58],[68,58],[65,54],[66,60],[66,58],[70,54]], front: [[[48,82,58]],[[70,132,48]],[[80,132,0],[38,80,65]],[[68,132,62]],[[50,80,66]],[[18,66,62]],[[18,52,0],[52,94,65]],[[18,64,48]]], fly: 12 },
};
export const MOUNT_ORDER: MountId[] = ['horse', 'dragon', 'wolf', 'bear', 'stag', 'panther', 'gdragon'];
/** a bounty lord drops the dragon this rarely (never shown to players) */
export const DRAGON_BOUNTY = 0.004;
