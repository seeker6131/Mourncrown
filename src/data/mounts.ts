// Mounts (director): ride for speed — the dragon faster than the horse. The animal is drawn alone with an empty saddle
// and the game seats the hero's own picture on it (world/mount.ts), so every hero form rides every mount.
// The dragon is LIMITED and rare: earned only by playing (bounty lords, season #1) — never sold, since it is faster
// (no pay-to-win). The horse is bought with gold (a gold sink).
export type MountId = 'horse' | 'dragon';
/** seat: per direction (S, SE, E, NE, N, NW, W, SW) the point in the mount picture (px of its frame) where the rider's hips go */
export interface MountDef { id: MountId; name: string; key: string; speed: number; scale: number; seat: [number, number][]; /** per direction, extra parts of the animal drawn in front of the rider: [x0, x1, y0] rects (the head / neck when it is on the near side); the body under the saddle is always in front */ front?: [number, number, number][][]; desc: string; price?: { gold: number; lv: number }; limited?: string; fire?: boolean }
export const MOUNTS: Record<MountId, MountDef> = {
  horse: { id: 'horse', name: 'ม้าศึก', key: 'mt_horse', speed: 1.3, scale: 0.92, desc: 'ม้าแข็งแรงพร้อมอาน วิ่งเร็วขึ้น 30%', price: { gold: 30000, lv: 15 },
    seat: [[56, 34], [44, 31], [52, 32], [50, 34], [55, 36], [54, 34], [52, 32], [60, 31]], front: [[[44, 68, 34]], [[56, 84, 18]], [[62, 92, 16]], [], [[44, 70, 34]], [], [[12, 42, 16]], [[20, 48, 18]]] },
  dragon: { id: 'dragon', name: 'มังกรเพลิงนิรันดร์', key: 'mt_dragon', speed: 1.5, scale: 0.92, fire: true, desc: '✦ ลิมิเต็ด ✦ มังกรไฟในตำนาน วิ่งเร็วขึ้น 50% — ได้จากการเล่นเท่านั้น (บอสค่าหัว / อันดับ 1 ฤดูกาล)', limited: 'ได้จากบอสค่าหัว (หายากมาก) หรืออันดับ 1 ฤดูกาลกิลด์วอร์',
    seat: [[59, 40], [50, 46], [60, 46], [56, 46], [58, 52], [60, 46], [60, 46], [72, 45]], front: [[[44, 74, 16]], [[60, 96, 18]], [[66, 100, 18]], [], [[46, 72, 50]], [], [[20, 54, 18]], [[24, 62, 18]]] },
};
export const MOUNT_ORDER: MountId[] = ['horse', 'dragon'];
/** a bounty lord drops the dragon this rarely (never shown to players) */
export const DRAGON_BOUNTY = 0.004;
