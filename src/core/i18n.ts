// Language: English by default (first visit), Thai as an option. The game's text is written in Thai; every text object
// passes through tr() (main.ts patches Phaser's Text.setText), which swaps Thai phrases for English — longest first,
// so whole sentences win over the words inside them. Add a line here whenever new Thai text appears in the game.
export type Lang = 'en' | 'th';
let cur: Lang = 'en';
try { const v = localStorage.getItem('lang'); if (v === 'th' || v === 'en') cur = v; } catch { /* storage blocked */ }
export const lang = () => cur;
export function setLang(l: Lang) { cur = l; try { localStorage.setItem('lang', l); } catch { /* ignore */ } }

const EN: Record<string, string> = {
  // NPCs & dialogue
  'ผู้เฒ่าอัลดริค': 'Elder Aldric', 'พ่อค้ามิร่า': 'Mira the Merchant', 'ช่างตีเหล็กบรอม': 'Brom the Blacksmith',
  'เจ้ากลับมาแล้ว! ภารกิจสำเร็จหรือยัง?': 'You are back! Is the task done?', 'ยังไม่เสร็จ': 'Not done yet',
  'เจ้าคือวีรบุรุษแห่งเอลเดอร์โกรฟ ขอบคุณสำหรับทุกสิ่ง': 'You are the hero of Eldergrove. Thank you for everything.',
  'พักผ่อนก่อนเถิด แล้วค่อยกลับมาหาข้า': 'Rest a while, then come back to me.',
  'ข้ามีภารกิจใหม่ แต่เจ้ายังอ่อนเกินไป กลับมาเมื่อถึงเลเวล': 'I have a new task, but you are still too weak. Come back at level',
  'ยินดีต้อนรับสู่ร้านของมิร่า! มียา อาวุธ และเครื่องประดับชั้นดี จะซื้อหรือขายดีล่ะ?': "Welcome to Mira's shop! Potions, weapons and fine trinkets — buying or selling?",
  'อยากให้อาวุธคมขึ้นหรือเกราะแกร่งขึ้นหรือ? เอาผลึกมานากับทองมา ข้าจะตีบวกให้!': 'Want a sharper blade or tougher armour? Bring mana crystals and gold and I will upgrade it!',
  'คำสาปดำกำลังกลืนแผ่นดินเอลเดอร์โกรฟ... เจ้าเป็นแค่ชาวบ้านถือดาบไม้ ออกไปทางประตูด่านทางเหนือ ล่ามอนสเตอร์ เก็บไม้ หิน อาหาร กลับมาสร้างหมู่บ้านที่แปลงว่าง ถึงเลเวล 10 แล้วมาหาข้า จะได้เลือกเส้นทางนักรบของเจ้า!':
    'A black curse is swallowing Eldergrove... You are only a villager with a wooden sword. Go out through the stage gate to the north, hunt monsters, gather wood, stone and food, and come back to build your home. Reach level 10 and see me to choose your path as a warrior!',
  'คำสาปดำกำลังกลืนแผ่นดินเอลเดอร์โกรฟ... หมู่บ้านเราคือที่หลบภัยสุดท้าย เจ้าเป็นแค่ชาวบ้านถือดาบไม้ แต่ถ้าแกร่งพอถึงเลเวล 10 กลับมาหาข้า แล้วเลือกเส้นทางนักรบของเจ้า ล่ามอนสเตอร์ เก็บวัตถุดิบ สร้างหมู่บ้านทางใต้ แล้วชำระคำสาปให้สิ้น!':
    'A black curse is swallowing Eldergrove... our village is the last refuge. You are only a villager with a wooden sword, but reach level 10 and come back to choose your warrior path. Hunt, gather, build, and lift the curse!',
  'เจ้าเลเวล': 'You are level', 'แล้ว ถึงเลเวล 10 กลับมาหาข้า จะได้เลือกสายอาชีพ — ดาบ ธนู เวท หรือแทงค์': '. Reach level 10 and come back to choose a class — sword, bow, magic or tank.',
  'เจ้าแกร่งขึ้นมากแล้ว ร่างต่อไปจะปลดล็อกที่เลเวล': 'You have grown strong. Your next form unlocks at level',
  // HUD / bag / stats
  'กระเป๋า': 'Bag', 'อุปกรณ์': 'Equipment', 'สวมใส่': 'Equipped', 'อาวุธ': 'Weapon', 'เกราะ': 'Armour', 'เครื่องประดับ': 'Accessory',
  'แตะไอเทม': 'Tap an item', 'เพื่อดูรายละเอียด': 'to see details', 'สายดาบ': 'Sword line', 'สายธนู': 'Bow line', 'สายเวท': 'Magic line', 'สายนักบวช': 'Tank line', 'ทุกสาย': 'Any class',
  'ไม่ตรงสาย: ค่าพลังเหลือ 60%': 'Other class: stats at 60%', 'พลังรบ': 'Power', 'ใช้': 'Use', 'ฟื้นฟู': 'Restore', 'ถอดออก': 'Unequip', 'ต้อง': 'Needs', 'ถึงจะใส่ได้': 'to equip',
  'ย่อยเป็นวัตถุดิบ': 'Dismantle', 'ได้ผลึกมานา': 'get mana crystals', 'แก่นโบราณ': 'Ancient Core', 'ขาย (+': 'Sell (+', 'ถอดก่อนจึงจะขายได้': 'Unequip before selling',
  'ระดับสูงสุดแล้ว': 'Max level', 'ค่าใช้จ่าย': 'Cost', 'ผลึกมานา': 'Mana Crystal', 'โอกาสสำเร็จ': 'Success', 'ตีบวก': 'Upgrade', 'ตีบวกสำเร็จ!': 'Upgrade succeeded!',
  'ตีบวกล้มเหลว... (เสียวัตถุดิบ)': 'Upgrade failed... (materials lost)', 'ทองไม่พอ': 'Not enough gold', 'ผลึกมานาไม่พอ (ดรอปจากมอนสเตอร์/ซื้อที่ร้าน)': 'Not enough mana crystals (monster drops / shop)',
  'ตีบวกไม่ได้': 'Cannot upgrade', 'ตัวละคร': 'Character', 'สกิล   แต้มสกิล': 'Skills   points', 'สกิล': 'Skills', 'ร่าง': 'Form', 'คริติคอล %': 'Crit %', 'คริติคอล': 'Crit', 'ความเร็วโจมตี %': 'Attack speed %', 'ความเร็วโจมตี': 'Attack speed',
  'วิ': 's', 'ความเร็วเดิน %': 'Move speed %', 'ความเร็วเดิน': 'Move speed', 'ดูดเลือด %': 'Lifesteal %', 'ดูดเลือด': 'Lifesteal', 'โอกาสดรอปของแรร์ %': 'Magic find %', 'โอกาสดรอปของแรร์': 'Magic find',
  'พลังมาจาก เลเวล (ปลดล็อกอุปกรณ์ขั้นสูง + แต้มสกิล) และอุปกรณ์ (ยิ่งแรร์ ขาว': 'Power comes from level (better gear + skill points) and gear (rarer = stronger: white', 'เขียว': 'green', 'ฟ้า': 'blue', 'ม่วง': 'purple', 'ส้ม ยิ่งแรง)': 'orange)',
  'บัฟอาหาร +': 'Meal buff +', 'เหลือ': 'left', 'นาที': 'min', 'คูลดาวน์': 'Cooldown', 'ทอง': 'Gold', 'ไม้': 'Wood', 'หิน': 'Stone', 'อาหาร': 'Food',
  // building
  'สร้างแล้ว': 'Built', 'สร้างบ้าน': 'Build home', 'สร้าง': 'Build', 'ที่ดินแปลง': 'Plot', 'เลือกสิ่งก่อสร้าง': 'choose a building', 'เริ่มก่อสร้าง': 'Construction started:', 'วัตถุดิบไม่พอ — ออกล่ามอนสเตอร์เพื่อหาวัตถุดิบ': 'Not enough materials — go hunting',
  'วัตถุดิบไม่พอ': 'Not enough materials', 'ตอนนี้': 'Now', 'กำลังก่อสร้าง': 'Under construction', 'เสร็จใน': 'done in', 'วินาที': 'sec', 'อัปเกรดเป็น': 'Upgrade to', 'เริ่มอัปเกรด': 'Upgrading', 'อัปเกรด': 'Upgrade', 'เลเวลสูงสุดแล้ว': 'Max level',
  'หลอมของ (ใช้ผลึกมานา': 'Forge (uses mana crystals', 'ชิ้น • มี': 'pcs • have', 'ขั้นต่ำ': 'min.', 'หลอมของ': 'Forge', 'หลอมได้': 'Forged', 'หลอม': 'Forge', 'ภารกิจประจำวัน (รีเซ็ตทุกวัน)': 'Daily tasks (reset every day)', 'ภารกิจประจำวัน': 'Daily task',
  'สำเร็จ! +': 'done! +', 'ผลึกมานาไม่พอ': 'Not enough mana crystals', 'กระเป๋าเต็ม!': 'Bag full!', 'กระเป๋าเต็ม': 'Bag full', 'ยังไม่มีโรงหลอม': 'No forge yet', 'ทำอาหาร (ใช้อาหาร': 'Cook (uses food', 'ครัว': 'Kitchen', 'นาน 10 วินาที': 'for 10 s', 'นาน 12 วินาที': 'for 12 s', 'นาน': 'for',
  'ทำ': 'Cook', 'กิน': 'Ate', 'อาหารไม่พอ — ล่ามอนสเตอร์เพื่อหาอาหาร': 'Not enough food — go hunting', 'ยังทำไม่ได้': 'Not yet', 'ผลผลิตสะสม': 'Stored output',
  'ผลิตต่อเนื่องแม้ไม่ได้เล่น (เก็บได้สูงสุด 2 ชั่วโมง) • เดินเข้าใกล้อาคารเพื่อเก็บ': 'Keeps producing while you are away (up to 2 hours) • walk close to collect',
  'กระเป๋าตอนนี้': 'Bag now', 'ช่อง': 'slots', 'ยิ่งกระเป๋าใหญ่ ยิ่งเก็บของดรอปได้มากก่อนต้องกลับเมือง': 'A bigger bag holds more loot before you must go home',
  'ที่ดินของคุณ — สร้างบ้าน': 'Your plot — build a home', 'ที่ดินว่าง': 'Empty plot', 'บ้านของฉัน': 'My Home', 'อาคาร': 'Building',
  'โรงหลอม': 'Forge', 'หลอมอาวุธ เกราะ เครื่องประดับ — ยิ่งเลเวลสูงยิ่งได้ของแรร์': 'Forge weapons, armour and trinkets — higher level, rarer items', 'หลอมของขั้น': 'Forges tier', 'การันตีความแรร์ขั้นต่ำ': 'guaranteed minimum rarity',
  'ทำอาหารบัฟก่อนออกล่า (ใช้อาหารจากการล่า)': 'Cook buff meals before hunting (uses food)', 'บัฟแรงขึ้น +': 'Buff +', 'โกดัง': 'Warehouse', 'ขยายกระเป๋า เก็บของดรอปได้มากขึ้น': 'Bigger bag for more loot', 'กระเป๋า +': 'Bag +',
  'โรงไม้': 'Lumber Mill', 'คนตัดไม้ผลิตไม้ให้เรื่อยๆ (แม้ออฟไลน์)': 'Woodcutters keep making wood (even offline)', 'กลายเป็นโรงเลื่อยกังหันน้ำ': 'becomes a water sawmill', 'ผลิตไม้': 'Wood', 'เหมืองหิน': 'Quarry',
  'คนงานสกัดหินให้เรื่อยๆ (ช้ากว่าไม้ เพราะหินหายากกว่า)': 'Workers keep cutting stone (slower than wood)', 'ผลิตหิน': 'Stone', 'คอกสัตว์': 'Barn',
  'เลี้ยงวัว แกะ ไก่ หมู — อาหารส่วนหนึ่งของหมู่บ้าน (แต่ไม่พอเลี้ยงทั้งหมู่บ้าน ต้องออกล่าสัตว์ด้วย)': 'Cows, sheep, hens and pigs — some of the village food (not enough for everyone, you must hunt too)',
  'ผลิตอาหาร': 'Food', 'โรงเตี๊ยม': 'Tavern', 'นักผจญภัยมาแลกเรื่องเล่า — ได้': 'Adventurers swap stories —', 'จากทุกอย่างเพิ่มขึ้น': 'from everything', 'ตลาด': 'Market', 'พ่อค้าเร่มาตั้งแผง เก็บภาษีเป็นทองให้หมู่บ้าน': 'Travelling traders pay the village gold',
  'หอป้องกัน': 'Watchtower', 'ป้องกันหมู่บ้าน (สงครามปล้นหมู่บ้านในโหมดออนไลน์) • ทหารฝึกให้เราแกร่งขึ้น': 'Defends the village (raids in online mode) • soldiers train you',
  'บ้านของคุณเองในหมู่บ้าน — พักฟื้นเร็วขึ้น เก็บของได้มากขึ้น (ออนไลน์: เพื่อนมาเยี่ยมได้)': 'Your own house in the village — faster rest, more storage (online: friends can visit)', 'ฟื้น HP ในหมู่บ้าน': 'Village HP regen', 'ในหมู่บ้าน': 'in the village',
  'สตูว์นักล่า': "Hunter's Stew", 'เพิ่ม': '+', 'ขนมปังอัศวิน': "Knight's Bread", 'สูงสุด และพลังป้องกัน': 'max and defence', 'สูงสุด และพลังเวท': 'max and magic', 'สูงสุด และ': 'max and', 'สูงสุด': 'max',
  // class / forms
  'เลือกสายอาชีพ — ร่างที่ 2': 'Choose a class — form 2', 'เปลี่ยนร่างที่': 'Change to form', 'กลายเป็น': 'Became', 'คริ +': 'Crit +', 'ตีเร็ว +25% นาน 12 วินาที': 'Attack speed +25% for 12 s', 'ตีเร็ว +': 'Atk speed +', 'คริ': 'Crit',
  'โบนัสต่อร่าง': 'Bonus per form', 'ร่างถัดไป': 'Next forms', 'เลือกสายนี้': 'Choose', 'โบนัสสายเพิ่มอีกขั้น • ชุดใหม่': 'Class bonus up one step • new outfit', 'สกิลใหม่': 'new skills', 'เปลี่ยนร่างได้แล้ว! แตะปุ่ม': 'You can change form! Tap the', 'เปลี่ยนร่างได้! (แตะ)': 'New form ready! (tap)', 'เปลี่ยนร่าง': 'Change form',
  'ห้องแต่งตัว — เตรียมตัวก่อนออกเดินทาง': 'Wardrobe — get ready to head out', 'ชุดสำหรับการออกเดินทาง': 'Outfit for the trip', 'ชุดล่ามอนสเตอร์': 'Hunting outfit', 'สวมชุดนักรบ พลังโจมตีเต็มที่': 'Warrior gear, full attack', 'เหมาะกับการล่ามอนและหาไอเทม': 'Best for hunting and loot',
  'ชุดหาทรัพยากร': 'Gathering outfit', 'ใส่ชุดชาวบ้าน เก็บไม้/หินได้': 'Villager clothes, can gather wood/stone', 'แต่ตีมอน -40%': 'but -40% damage', 'เลือกร่างที่จะสวม (แต่ละร่างมีสกิลของตัวเอง)': 'Choose a form to wear (each has its own skills)', 'สวมร่าง': 'Wear',
  'แล้วไปคุยกับผู้เฒ่าเพื่อเลือกสายอาชีพ': 'then talk to the elder to choose a class', 'ทดสอบ: สลับร่าง (สำหรับหาบั๊ก)': 'Test: switch form (bug hunting)', 'สลับเป็น': 'Switch to', 'ปุ่มนี้สำหรับทดสอบเท่านั้น จะเอาออกก่อนเปิดให้คนอื่นเล่น': 'Testing only — removed before release',
  'ชาวบ้าน': 'Villager', 'ชาวบ้านธรรมดากับดาบไม้': 'An ordinary villager with a wooden sword', 'นักดาบ': 'Swordsman', 'อัศวิน': 'Knight', 'ลอร์ดอัศวิน': 'Lord Knight', 'สายประชิดล้วน ฟันหนัก พุ่งชน ไม่มีเวท': 'Pure melee: heavy slashes and charges, no magic',
  'นักธนู': 'Archer', 'พรานป่า': 'Ranger', 'เรนเจอร์ราชันย์': 'Royal Ranger', 'สายระยะไกล ยิงไว คริติคอลสูง': 'Ranged: fast shots, high crit', 'จอมเวท': 'Mage', 'ปราชญ์เวท': 'Sage', 'อาร์คเมจทมิฬ': 'Dark Archmage', 'สายเวท ระเบิดวงกว้าง พลังเวทสูงมาก แต่ตัวบาง': 'Magic: wide blasts, huge magic power, fragile',
  'ผู้พิทักษ์': 'Guardian', 'อัศวินเหล็กกล้า': 'Steel Knight', 'ป้อมปราการมนุษย์': 'Living Fortress', 'สายแทงค์ เลือดหนามาก เกราะหนา ฟื้นตัวเองได้': 'Tank: huge HP, thick armour, self-healing',
  // quests / menu
  'บันทึกภารกิจ': 'Quest log', 'ผลึก': 'crystals', 'ต้องการ': 'Need', 'ยังไม่ได้รับ': 'Not taken', 'ส่งเควสต์ได้!': 'Ready to hand in!', 'สำเร็จ': 'Done', 'กำจัด': 'Defeat', 'ตัว': '', 'เก็บไม้': 'Gather wood', 'เก็บหิน': 'Gather stone', 'เก็บ': 'Collect', 'ชิ้น': 'pcs', 'รางวัล': 'Reward', 'เมนู': 'Menu',
  'บันทึกเกมแล้ว': 'Game saved', 'บันทึกไม่สำเร็จ': 'Save failed', 'บันทึกเกม': 'Save game', 'โหลดเกมล่าสุด': 'Load last save', 'ไม่พบเซฟ': 'No save found', 'เสียงเอฟเฟกต์': 'Sound effects', 'เปิด': 'On', 'ปิด': 'Off', 'เพลง': 'Music', 'เต็มจอ': 'Fullscreen',
  'ปรับ': 'Adjust', 'ขนาด / ปุ่ม / ความโปร่ง)': 'size / buttons / opacity)', 'ทดสอบ: สลับร่างตัวละคร': 'Test: switch form', 'ทดสอบ: ชุด': 'Test:', 'ทรัพยากร + ปลดล็อก 50 ด่าน': 'set + resources + unlock 50 stages', 'ได้รับ': 'Received', 'ทอง/ไม้/หิน/วัตถุดิบ • ปลดล็อกครบ 50 ด่าน': 'gold/wood/stone/materials • all 50 stages unlocked',
  'ทดสอบ: เลเวล +10 (ตอนนี้': 'Test: level +10 (now', 'เลเวล': 'Level', 'เส้นขอบตัวละคร/วัตถุ': 'Sprite outlines', 'เริ่มเกมใหม่': 'New game', 'ยืนยัน! ลบเซฟและเริ่มใหม่': 'Confirm! Delete save and restart', 'เวลาเล่น': 'Play time',
  'ขนาดปุ่มต่อสู้': 'Combat buttons', 'ขนาด': 'size', 'ความชัดแถบบน': 'HUD opacity', 'ชื่อบนหัวชาวบ้าน': 'Villager names', 'แสดง': 'Show', 'ซ่อน': 'Hide', 'ค่าเริ่มต้น': 'Defaults', 'กลับเมนู': 'Back to menu',
  'ส่งภารกิจ': 'Hand in', 'ของไม่ครบ': 'Missing items', 'รับภารกิจ': 'Accept', 'ร้านค้าของมิร่า': "Mira's Shop", 'ร้านค้า': 'Shop', 'ลาก่อน': 'Goodbye', 'ซื้อ': 'Buy', 'ขาย': 'Sell', 'โรงตีเหล็กของบรอม': "Brom's Smithy", 'ไม่มีอุปกรณ์': 'No equipment',
  'ความเร็วโจมตี +': 'Attack speed +', 'โอกาสดรอปของแรร์ +': 'Magic find +', 'ฟื้น': 'Restores',
  // skills
  'ฟาดไม้': 'Club Smash', 'ฟาดดาบไม้แรงๆ 220%': 'A heavy wooden-sword smack 220%', 'ฟันผ่าหิน': 'Rock Splitter', 'ฟันหนักข้างหน้า 300%': 'Heavy slash ahead 300%', 'ดาบวงพายุ': 'Storm Blade', 'หมุนฟันรอบตัว 2 ครั้ง ครั้งละ 110%': 'Spin slash twice, 110% each',
  'ตั้งการ์ด': 'Guard Up', 'พุ่งทะลวง': 'Piercing Charge', 'พุ่งไปข้างหน้า ชนทุกตัวในเส้นทาง 220%': 'Charge ahead hitting all in the way 220%', 'คมดาบอัศวิน': "Knight's Edge", 'ฟันกากบาท 2 ครั้ง ครั้งละ 200%': 'Cross slash twice, 200% each', 'ใจกล้าอัศวิน': "Knight's Valor",
  'และตีเร็วขึ้น 20% นาน 12 วินาที': 'and attack speed +20% for 12 s', 'คำพิพากษาสวรรค์': 'Heavenly Judgment', 'กระโดดฟาดลงพื้น ระเบิดแสงวงกว้าง 320%': 'Leap and smash, a wide burst of light 320%', 'ดาบศักดิ์สิทธิ์พันเล่ม': 'Thousand Holy Blades', 'ดาบแสงตกใส่ศัตรู 6 ตัว ตัวละ 240%': 'Light blades fall on 6 foes, 240% each',
  'โล่ทองคำ': 'Golden Aegis', 'โล่ดูดซับดาเมจ 40% ของ': 'Shield absorbs damage: 40% of', 'โล่ดูดซับดาเมจ 35% ของ': 'Shield absorbs damage: 35% of', 'ยิงคู่': 'Double Shot', 'ยิงธนู 2 ดอกติดกัน ดอกละ 150%': 'Two arrows in a row, 150% each', 'ธนูกระจาย': 'Fan Shot', 'ยิงธนู 5 ดอกเป็นรูปพัด ดอกละ 110%': '5 arrows in a fan, 110% each',
  'สมาธินักล่า': "Hunter's Focus", 'ตีเร็วขึ้น 30% นาน 10 วินาที': 'Attack speed +30% for 10 s', 'ธนูทะลวงใจ': 'Heartpiercer', 'ธนูทะลุทุกตัวในแนวตรง 280%': 'An arrow through every foe in a line 280%', 'ห่าธนู': 'Arrow Rain', 'ธนูตกใส่ศัตรู 6 ตัว ตัวละ 180%': 'Arrows fall on 6 foes, 180% each',
  'กับดักเถาวัลย์': 'Vine Trap', 'เถาวัลย์ระเบิดรอบตัว 160%': 'Vines burst around you 160%', 'ผลักศัตรูออก': 'knocks foes back', 'ศรวิญญาณพงไพร': 'Forest Spirit Arrows', 'ยิงศรแสง 3 ดอกทะลุแนว ดอกละ 260%': '3 piercing spirit arrows, 260% each', 'พายุศรมรกต': 'Emerald Arrow Storm',
  'ศรมรกตตกใส่ศัตรู 8 ตัว ตัวละ 260%': 'Emerald arrows fall on 8 foes, 260% each', 'วายุราชันย์': 'Royal Gale', 'ศรน้ำแข็ง': 'Ice Shard', 'ยิงลูกเวทน้ำแข็ง 230%': 'An ice bolt 230%', 'ลูกไฟอัคคี': 'Fireball', 'ลูกไฟระเบิดวงกว้าง 220%': 'An exploding fireball 220%', 'แสงเยียวยา': 'Healing Light',
  'สายฟ้าลูกโซ่': 'Chain Lightning', 'สายฟ้าฟาดศัตรู 5 ตัว ตัวละ 190%': 'Lightning strikes 5 foes, 190% each', 'ระเบิดดวงดาว': 'Starburst', 'ระเบิดเวทรอบตัว 240%': 'Arcane blast around you 240%', 'ห่ากระสุนเวท': 'Arcane Volley', 'ยิงกระสุนเวท 4 ลูก ลูกละ 150%': '4 magic bolts, 150% each',
  'อุกกาบาตโลหิต': 'Blood Meteor', 'อุกกาบาตเลือดถล่มศัตรู 6 ตัว ตัวละ 300%': 'Blood meteors crush 6 foes, 300% each', 'หอกแห่งความว่างเปล่า': 'Void Lance', 'หอกเวทดำทะลุทุกตัวในแนว 340%': 'A dark lance through every foe in a line 340%', 'คลื่นมรณะ': 'Death Wave', 'คลื่นพลังมืดรอบตัว 280%': 'Dark wave around you 280%',
  'ทุบโล่': 'Shield Bash', 'กระแทกโล่ข้างหน้า 240%': 'Shield slam ahead 240%', 'ผลักกระเด็น': 'knockback', 'กำแพงเหล็ก': 'Iron Wall', 'ตั้งหลัก': 'Second Wind', 'ค้อนแผ่นดินไหว': 'Earthquake Hammer', 'ทุบพื้นรอบตัว 220%': 'Smash the ground around you 220%', 'พุ่งชนเหล็กกล้า': 'Steel Ram',
  'พุ่งชนทุกตัวในเส้นทาง 200%': 'Ram through everything in the way 200%', 'ป้อมโล่': 'Bulwark', 'ไททันกระแทก': 'Titan Slam', 'กระโดดทุบพื้น 300%': 'Leap and smash 300%', 'วงกว้าง': 'wide area', 'ป้อมปราการ': 'Fortress', 'คำรามสิงห์': 'Lion Roar', 'หมุนค้อนรอบตัว 3 ครั้ง ครั้งละ 150%': 'Spin the hammer 3 times, 150% each',
  'ไม่มีเป้าหมาย': 'No target',
  // items
  'ดาบไม้ฝึกหัด': 'Training Sword', 'ดาบไม้สำหรับนักผจญภัยมือใหม่': 'A wooden sword for beginners', 'ดาบเหล็กกล้า': 'Steel Sword', 'ดาบเหล็กคมกริบจากช่างตีเหล็ก': 'A razor-sharp steel blade from the smith', 'ดาบอัศวินเงิน': 'Silver Knight Blade', 'ดาบเงินของอัศวินแห่งเอลเดอร์โกรฟ': 'Silver sword of the Eldergrove knights',
  'ดาบเพลิงอัคคี': 'Flame Saber', 'ดาบที่ลุกโชนด้วยไฟนิรันดร์ เพิ่มพลังเวท': 'Burns with eternal fire, adds magic', 'คทาไม้โอ๊ค': 'Oak Staff', 'คทาเวทที่ขยายพลังเวทมนตร์': 'A staff that amplifies magic', 'ไม้กายสิทธิ์ฝึกหัด': 'Apprentice Wand', 'ไม้กายสิทธิ์อันแรกของจอมเวท': "A mage's first wand",
  'คทาจันทราปราชญ์': "Sage's Moon Staff", 'คทาประดับจันทร์เสี้ยว เพิ่มพลังเวทและมานา': 'Crescent-moon staff, more magic and mana', 'คทาหัวกะโหลกทมิฬ': 'Dark Skull Staff', 'คทาอัญมณีม่วงจากเหวลึก พลังเวทมหาศาล': 'Purple abyss gem, immense magic',
  'ธนูสั้นไม้ยู': 'Yew Short Bow', 'ธนูเบาสำหรับนักธนูมือใหม่': 'A light bow for new archers', 'ธนูพรานโค้งกลับ': "Hunter's Recurve", 'ธนูโค้งกลับของพรานป่า ยิงแรงและแม่น': 'Strong and accurate', 'ธนูยาวเอลฟ์เงิน': 'Silver Elven Longbow', 'ธนูยาวสีเงินของเอลฟ์ ยิงเร็วขึ้น': 'Silver elven longbow, faster shots',
  'ธนูวิญญาณมรกต': 'Emerald Spirit Bow', 'ธนูที่วิญญาณพงไพรสถิต คริติคอลสูงมาก': 'Home of a forest spirit, very high crit', 'กระบองเหล็ก': 'Iron Mace', 'กระบองหนักของผู้พิทักษ์ เพิ่มความทนทาน': "A guardian's heavy mace, more toughness", 'ค้อนศึก': 'War Hammer', 'ค้อนศึกหัวเหล็ก ทุบแรงและป้องกันดี': 'Hits hard and guards well',
  'ค้อนป้อมเหล็กกล้า': 'Bulwark Hammer', 'ค้อนหนักของอัศวินเหล็กกล้า เกราะหนาขึ้นมาก': "Steel knight's hammer, much thicker armour", 'ค้อนยักษ์ไททัน': 'Titan Maul', 'ค้อนยักษ์จารึกอักษรรูน ทั้งแรงทั้งทน': 'Rune-carved maul, strong and tough',
  'เสื้อผ้าป่าน': 'Linen Tunic', 'เสื้อผ้าธรรมดา': 'Plain clothes', 'เกราะหนังพราน': "Hunter's Leather", 'เกราะหนังเบา คล่องตัว': 'Light and nimble', 'เกราะโซ่ถัก': 'Chain Mail', 'เกราะโซ่ที่แข็งแรง': 'Sturdy chain armour', 'เกราะอัศวินทองคำ': 'Golden Knight Plate', 'เกราะเต็มตัวประดับทอง พร้อมผ้าคลุมแดง': 'Gilded full plate with a red cape',
  'แหวนทองแดง': 'Copper Ring', 'เพิ่มโชคเล็กน้อย': 'A little luck', 'สร้อยทับทิม': 'Ruby Amulet', 'เพิ่มพลังโจมตีและพลังชีวิต': 'More attack and life', 'จี้ปราชญ์': "Sage's Pendant", 'เพิ่มมานาและพลังเวท': 'More mana and magic', 'หัวใจแห่งพงไพร': 'Heart of the Forest', 'อัญมณีจากผู้พิทักษ์ป่า': 'A gem from the forest guardian',
  'ยาฟื้นพลังใหญ่': 'Large Health Potion', 'ยาฟื้นพลัง': 'Health Potion', 'ยามานา': 'Mana Potion', 'เจลสไลม์': 'Slime Gel', 'เจลเหนียวหนืด ขายได้': 'Sticky gel, sells', 'หมวกเห็ดสปอร์': 'Spore Cap', 'วัตถุดิบเควสต์และยา': 'Quest and potion material', 'หนังหมาป่า': 'Wolf Pelt', 'หนังนุ่มคุณภาพดี': 'Soft quality hide',
  'เขี้ยวก็อบลิน': 'Goblin Fang', 'ของสะสมจากก็อบลิน': 'A goblin trophy', 'แก่นวิญญาณ': 'Spirit Essence', 'พลังงานเวทบริสุทธิ์': 'Pure magic energy', 'แกนพลังจากของแรร์/บอส ใช้อัปเกรดอาคารขั้นสูง': 'Power core from bosses, for high building upgrades', 'ใช้ในการตีบวกอุปกรณ์': 'Used to upgrade gear',
  'ธรรมดา': 'Common', 'ดี': 'Good', 'หายาก': 'Rare',
  // stages / world
  'ประตูด่าน': 'Stage Gate', 'กลับหมู่บ้าน': 'Back to village', 'จบเกม! กลับหมู่บ้าน': 'The end! Back to village', 'ผ่านด่าน': 'Cleared stage', 'ด่าน': 'Stage', 'อาหารไม่พอ! ด่าน': 'Not enough food! Stage', 'ต้องใช้เสบียง': 'needs supplies', 'ล่าสัตว์ป่าหรือเก็บจากคอกสัตว์': 'hunt wild animals or collect from the barn',
  'ใช้เสบียง': 'Supplies used', 'เลือกด่าน (ผ่านแล้ว': 'Choose a stage (cleared', 'มอน': 'monsters', 'หมู่บ้านเอลเดอร์โกรฟ': 'Eldergrove Village', 'ประตูถัดไป': 'Next gate', 'ก้าว': 'steps', 'ไม่พอ': 'not enough', 'หมู่บ้าน': 'Village',
  'ถึงเลเวล 10! กลับหมู่บ้านไปหาผู้เฒ่าเพื่อเลือกสายอาชีพ': 'Level 10! Go back to the village and see the elder to choose a class', 'ด้านบน': 'at the top', 'ชาวบ้านหิว! อาหารหมดคลัง อาคารผลิตได้แค่ครึ่งเดียว — ออกล่าสัตว์ป่าหาเนื้อ': 'The villagers are hungry! The larder is empty, buildings make only half — go hunt for meat',
  'ป่าเอลเดอร์โกรฟ': 'Eldergrove Forest', 'ป่าผีสิง': 'Haunted Woods', 'ดินแดนลาวา': 'Lava Lands', 'ภูเขาหิมะนิรันดร์': 'Everfrost Peaks', 'คุกใต้ดินเหวลึก': 'Abyssal Dungeon',
  'มารดารากเน่า': 'Rotroot Mother', 'ก้อนโคลนกลืนกิน': 'Devouring Mud', 'ซากเห็ดเน่า': 'Rotting Fungus', 'หมาป่ากลวงโหว่': 'Hollow Wolf', 'ภูตหนามสวมหน้ากาก': 'Masked Thorn Sprite', 'ผีเสื้อกลางคืนหน้ากะโหลก': 'Skull Moth', 'ราชากวางโครงกระดูก': 'Bone Stag King', 'หนูแทะซาก': 'Carrion Rat',
  'อัศวินเปลือกกลวง': 'Hollow Shell Knight', 'นักธนูกระดูกเขากวาง': 'Antlered Bone Archer', 'วิญญาณผ้าคลุมหน้า': 'Veiled Wraith', 'แมงมุมปากคน': 'Maw Spider', 'อสรพิษแก้วดำ': 'Obsidian Serpent', 'ปีศาจเถ้าถ่าน': 'Ash Fiend', 'ยักษ์ตะกรันโซ่ตรวน': 'Chained Slag Colossus', 'กิ้งก่าแมกมาหกขา': 'Six-legged Magma Lizard',
  'ผู้คุมเหมันต์': 'Frost Warden', 'นักล่าเหมันต์': 'Frost Stalker', 'ยักษ์หน้ากากน้ำแข็ง': 'Ice-masked Giant', 'มงกุฎกลวง': 'The Hollow Crown',
  'สไลม์เขียว': 'Green Slime', 'เห็ดพิษ': 'Poison Mushroom', 'หมาป่าเงา': 'Shadow Wolf', 'ก็อบลินพราน': 'Goblin Hunter', 'วิญญาณพงไพร': 'Forest Wisp', 'ผู้พิทักษ์ธอร์นวูด': 'Thornwood Guardian', 'กวางป่า': 'Wild Deer', 'หมูป่าเขี้ยวตัน': 'Tusked Boar', 'หมูป่า': 'Wild Boar',
  'หนูยักษ์ตาแดง': 'Red-eyed Rat', 'โครงกระดูกนักรบ': 'Skeleton Warrior', 'โครงกระดูกพลธนู': 'Skeleton Archer', 'วิญญาณถือตะเกียง': 'Lantern Wraith', 'แมงมุมพิษ': 'Venom Spider', 'อิมป์ไฟ': 'Fire Imp', 'ซาลาแมนเดอร์ไฟ': 'Fire Salamander', 'โกเลมลาวา': 'Lava Golem', 'หมาป่าน้ำแข็ง': 'Ice Wolf',
  'เยติ': 'Yeti', 'กวางยักษ์คำสาป': 'Cursed Giant Stag', 'มังกรลาวา': 'Lava Dragon', 'ยักษ์น้ำแข็ง': 'Frost Giant', 'ราชาโครงกระดูก': 'Skeleton King',
  // quests (top-down)
  'ปราบมอนสเตอร์ 5 ตัว': 'Defeat 5 monsters', 'ผ่านด่าน 1': 'Clear stage 1', 'สร้างบ้านของคุณในหมู่บ้าน': 'Build your home in the village', 'ถึงเลเวล 5': 'Reach level 5', 'ใช้สกิล 10 ครั้ง': 'Use skills 10 times', 'ผ่านด่าน 5': 'Clear stage 5', 'ถึงเลเวล 10': 'Reach level 10',
  'เลือกสายอาชีพกับผู้เฒ่า': 'Choose a class with the elder', 'ปราบบอสด่าน 10 — มารดารากเน่า': 'Defeat the stage 10 boss — Rotroot Mother', 'อัปเกรดบ้านเป็น': 'Upgrade your home to', 'ปราบมอนสเตอร์ 150 ตัว': 'Defeat 150 monsters', 'ปราบบอสด่าน 20 — ราชากวางโครงกระดูก': 'Defeat the stage 20 boss — Bone Stag King',
  'ถึงเลเวล 40': 'Reach level 40', 'เปลี่ยนเป็นร่างที่ 3': 'Reach form 3', 'ปราบบอสด่าน 30 — อสรพิษแก้วดำ': 'Defeat the stage 30 boss — Obsidian Serpent', 'ปราบบอสด่าน 40 — ผู้คุมเหมันต์': 'Defeat the stage 40 boss — Frost Warden', 'ถึงเลเวล 80': 'Reach level 80', 'เปลี่ยนเป็นร่างสุดท้าย': 'Reach the final form',
  'ปราบบอสด่าน 50 — มงกุฎกลวง ชำระคำสาป!': 'Defeat the stage 50 boss — The Hollow Crown, lift the curse!', 'แตะเพื่อรับรางวัล!': 'Tap to claim!', 'ปราบบอสสำเร็จ!': 'Boss defeated!', 'ถึงเลเวล': 'Reach level', 'ถึง': 'Reach',
  // villagers
  'ช่างตีเหล็ก': 'Blacksmith', 'ช่างเหล็ก': 'Smith', 'พ่อค้า': 'Merchant', 'คนตัดไม้': 'Woodcutter', 'คนขุดแร่': 'Miner', 'แม่ครัว': 'Cook', 'สาวโรงเตี๊ยม': 'Barmaid', 'ยาม': 'Guard', 'เด็ก': 'Kid', 'เอลฟ์': 'Elf', 'แมว': 'Cat', 'แกะ': 'Sheep', 'วัว': 'Cow', 'หมู': 'Pig', 'ไก่': 'Hen', 'ผู้เฒ่า': 'Elder',
  // title / misc
  'ป่าต้องสาป': 'Mourncrown', 'ชำระคำสาป ปกป้องหมู่บ้านสุดท้าย': 'Lift the curse • defend the last village', 'เล่นต่อ': 'Continue', 'เริ่มผจญภัย': 'Start adventure', 'แนะนำ: เล่นแนวนอน + เต็มจอ': 'Tip: play in landscape + fullscreen',
  'ล่ามอนสเตอร์': 'Hunt monsters', 'ปราบบอส': 'Defeat a boss', 'หลอมอุปกรณ์': 'Forge gear', 'กำลังโหลด': 'Loading', 'กำลังสร้างโลก': 'Building the world', 'พลังโจมตีกายภาพ': 'Physical attack', 'ความเร็วโจมตี/เคลื่อนที่ หลบหลีก': 'Attack/move speed, evasion', 'โอกาสคริติคอล และดรอปไอเทม': 'Crit chance and item drops',
  'มี': 'have', 'ขั้น': 'tier', 'เพิ่มขึ้น': 'more', 'แล้ว': '', 'ครั้ง': 'times', 'ลูก': '', 'ดอก': '', 'ทดลอง: มองจากบน • ร่าง ชาวบ้าน (แตะมุมขวาบน': 'Preview', 'เปลี่ยนร่าง • แตะข้อความนี้': '', 'ทดสอบท่าตาย)': '',
  'ฟาดดาบ': 'Slash', 'โล่': 'Shield', 'ได้รับ SL': 'Got SL', 'กำลังโหลดหมู่บ้าน': 'Loading village', 'ปลดล็อกครบ 50 ด่าน': 'all 50 stages unlocked', 'ปลดล็อก': 'Unlock', 'ใช้สกิล': 'Use skill', 'MP ไม่พอ': 'Not enough MP',
  'ป่า': 'Forest', 'ผีสิง': 'Haunted', 'ลาวา': 'Lava', 'หิมะ': 'Snow', 'คุก': 'Dungeon',
  'อยากตัดไม้/ขุดหิน? สวมชุดหาทรัพยากรที่ปุ่ม 👕 ชุด ด้านบน': 'Want to chop wood or mine stone? Wear the gathering outfit (👕 Outfit, top right)',
  'ตัดไม้': 'Chop wood', 'ขุดหิน': 'Mine stone', 'ชุด': 'Outfit',
  'ออโต้: ตัดไม้/ขุดหินเอง': 'Auto: chopping and mining', 'ออโต้: ตีมอนเอง': 'Auto: hunting monsters', 'ปิดออโต้': 'Auto off',
  'ออโต้ตีมอนทำงานในด่าน — ในหมู่บ้านใส่ชุดหาทรัพยากรเพื่อออโต้ตัดไม้/ขุดหิน': 'Auto hunting works in stages — in the village wear the gathering outfit to auto chop/mine',
  'กลับ': 'Back', 'ยืนยัน': 'Confirm', 'เพื่อ': 'to', 'และ': 'and', 'หรือ': 'or',
};

// longest phrases first so sentences beat the words inside them
const KEYS = Object.keys(EN).sort((a, b) => b.length - a.length);
const THAI = /[฀-๿]/;
const cache = new Map<string, string>();
export function tr(s: string): string {
  if (cur === 'th' || !s || !THAI.test(s)) return s;
  const hit = cache.get(s); if (hit !== undefined) return hit;
  let o = s;
  for (const k of KEYS) if (o.includes(k)) o = o.split(k).join(EN[k]);
  o = o.replace(/ {2,}/g, ' ').replace(/ ([,.!?:)])/g, '$1');
  if (cache.size > 4000) cache.clear();
  cache.set(s, o);
  return o;
}
