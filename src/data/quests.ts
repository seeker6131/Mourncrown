import type { MonsterKind } from './monsters';

export interface QuestDef {
  id: string;
  title: string;
  giver: string; // npc id
  intro: string;
  done: string;
  kind: 'kill' | 'collect';
  target: MonsterKind | string; // monster kind or item id
  count: number;
  reward: { exp: number; gold: number; items?: { id: string; qty: number }[] };
  minLevel: number;
}

export const QUESTS: QuestDef[] = [
  {
    id: 'q_slime', title: 'สไลม์บุกทุ่งหญ้า', giver: 'elder', kind: 'kill', target: 'slime', count: 8, minLevel: 1,
    intro: 'คำสาปทำให้สไลม์ล้นทุ่งหญ้าทางตะวันออก ฝึกดาบไม้ของเจ้ากับพวกมันสัก 8 ตัว แล้วกลับมาหาข้า',
    done: 'ยอดเยี่ยม! ทุ่งหญ้าปลอดภัยขึ้นแล้ว รับยาและเงินนี้ไปเถิด',
    reward: { exp: 60, gold: 80, items: [{ id: 'hp_potion', qty: 4 }, { id: 'mp_potion', qty: 2 }] },
  },
  {
    id: 'q_spore', title: 'สปอร์ปริศนา', giver: 'elder', kind: 'collect', target: 'spore_cap', count: 5, minLevel: 2,
    intro: 'เห็ดพิษเริ่มแพร่สปอร์ ข้าต้องการหมวกเห็ด 5 ชิ้นเพื่อปรุงยาแก้ ช่วยข้าหน่อย',
    done: 'ขอบใจมาก นี่คือเกราะหนังที่ข้าเก็บไว้ จงสวมมันซะ',
    reward: { exp: 120, gold: 100, items: [{ id: 'leather_armor', qty: 1 }] },
  },
  {
    id: 'q_wolf', title: 'ฝูงหมาป่าเงา', giver: 'elder', kind: 'kill', target: 'wolf', count: 6, minLevel: 4,
    intro: 'หมาป่าเงาจากป่าลึกโจมตีพ่อค้า จงล่าพวกมัน 6 ตัว ข้าจะมอบดาบเหล็กให้',
    done: 'เจ้าแข็งแกร่งขึ้นมาก! ดาบเหล็กนี้คู่ควรกับเจ้า',
    reward: { exp: 300, gold: 200, items: [{ id: 'iron_sword', qty: 1 }, { id: 'mana_shard', qty: 3 }] },
  },
  {
    id: 'q_goblin', title: 'ค่ายก็อบลิน', giver: 'elder', kind: 'kill', target: 'goblin', count: 6, minLevel: 6,
    intro: 'ก็อบลินพรานตั้งค่ายในป่า ยิงธนูใส่ชาวบ้าน กำจัด 6 ตัว!',
    done: 'หมู่บ้านปลอดภัยแล้ว รับสร้อยทับทิมนี้ไป',
    reward: { exp: 600, gold: 350, items: [{ id: 'ruby_amulet', qty: 1 }] },
  },
  {
    id: 'q_wisp', title: 'แสงในป่าศักดิ์สิทธิ์', giver: 'elder', kind: 'kill', target: 'wisp', count: 5, minLevel: 9,
    intro: 'วิญญาณพงไพรคลุ้มคลั่งในสวนมนตราทางเหนือ สงบพวกมัน 5 ดวง',
    done: 'วิญญาณสงบลงแล้ว... แต่ต้นเหตุคือผู้พิทักษ์ธอร์นวูดทางตะวันออก!',
    reward: { exp: 1000, gold: 500, items: [{ id: 'chain_mail', qty: 1 }, { id: 'hp_potion_l', qty: 3 }] },
  },
  {
    id: 'q_boss', title: 'ผู้พิทักษ์ธอร์นวูด', giver: 'elder', kind: 'kill', target: 'treant', count: 1, minLevel: 11,
    intro: 'ผู้พิทักษ์ธอร์นวูดถูกคำสาปกลืนกิน ไปที่ซากวิหารตะวันออกสุดแล้วปลดปล่อยมัน!',
    done: 'เจ้าคือวีรบุรุษแห่งเอลเดอร์โกรฟ! ตำนานของเจ้าเพิ่งเริ่มต้น...',
    reward: { exp: 2500, gold: 2000, items: [{ id: 'knight_blade', qty: 1 }] },
  },
];

export const QUEST_BY_ID: Record<string, QuestDef> = Object.fromEntries(QUESTS.map(q => [q.id, q]));
