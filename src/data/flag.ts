// Guild flags: a 16x16 pixel cloth, stored as 256 hex digits (one per pixel, an index into PALETTE).
// Three ways to make one, all ending in the same pixels: pick a template (pattern + colours + symbol), let the game
// roll one at random, or draw it pixel by pixel. Only the leader / deputy can change it (systems/guild.ts setFlag).

export const FLAG_W = 16, FLAG_H = 16, FLAG_LEN = FLAG_W * FLAG_H;
/** 16 colours that read well small and on dark ground */
export const PALETTE = [
  0x1b2a4a, 0x2e4f8f, 0x5a9ad8, 0x2a7a6a, 0x2f6a2a, 0x7ab84a, 0xe8d8a8, 0xf4f0e6,
  0x9a9aa4, 0x2a2228, 0x6a3a22, 0xd8a032, 0xf0c848, 0xd85a2a, 0xa8202a, 0x6a2a8a,
];
export const PALETTE_NAMES = ['กรมท่า', 'น้ำเงิน', 'ฟ้า', 'เขียวหัวเป็ด', 'เขียวป่า', 'เขียวอ่อน', 'ครีม', 'ขาว', 'เทา', 'ดำ', 'น้ำตาล', 'ทอง', 'เหลือง', 'ส้ม', 'แดง', 'ม่วง'];

export const PATTERNS = ['solid', 'vsplit', 'hsplit', 'cross', 'diag', 'quarters', 'stripes', 'chevron', 'border', 'saltire'] as const;
export type Pattern = typeof PATTERNS[number];
export const PATTERN_NAMES: Record<Pattern, string> = { solid: 'สีเดียว', vsplit: 'แบ่งซ้ายขวา', hsplit: 'แบ่งบนล่าง', cross: 'กากบาท', diag: 'เฉียง', quarters: 'สี่ช่อง', stripes: 'ลายทาง', chevron: 'บั้ง', border: 'ขอบ', saltire: 'ไขว้' };

// symbols, 10x10 ('#' = symbol colour, '+' = a darker shade of it), drawn in the middle of the cloth
const ICON_ART: Record<string, string[]> = {
  sword: ['....##....', '....##....', '....##....', '....##....', '....##....', '....##....', '..######..', '...+##+...', '....##....', '....++....'],
  swords: ['#........#', '.#......#.', '..#....#..', '...#..#...', '....##....', '....##....', '...#..#...', '.+#....#+.', '++......++', '+........+'],
  shield: ['.########.', '.#++++++#.', '.#+####+#.', '.#+####+#.', '.#+####+#.', '.#+####+#.', '..#+##+#..', '..#++++#..', '...#++#...', '....##....'],
  crown: ['#...##...#', '#...##...#', '##.####.##', '##########', '##########', '#+##++##+#', '##########', '##########', '..........', '..........'],
  star: ['....##....', '....##....', '...####...', '##########', '.########.', '..######..', '..######..', '.###..###.', '.##....##.', '#........#'],
  tree: ['...####...', '..######..', '.########.', '.########.', '##########', '.########.', '...####...', '....++....', '....++....', '...++++...'],
  skull: ['..######..', '.########.', '##########', '#..####..#', '#..####..#', '##########', '.###..###.', '..######..', '..#.##.#..', '..........'],
  flame: ['....#.....', '...##.....', '...###..#.', '..####.##.', '..#######.', '.###++###.', '.##++++##.', '.##++++##.', '..##++##..', '...####...'],
  moon: ['...####...', '..###.....', '.###......', '.##.......', '###.......', '###.......', '.##.......', '.###......', '..###.....', '...####...'],
  tower: ['#.#.##.#.#', '##########', '.########.', '.##.##.##.', '.########.', '.###++###.', '.##++++##.', '.##++++##.', '.##++++##.', '##########'],
  hammer: ['.########.', '.########.', '.##++++##.', '....##....', '....##....', '....##....', '....##....', '....##....', '....++....', '....++....'],
  wolf: ['#........#', '##......##', '###....###', '##########', '#.######.#', '##########', '.########.', '..##++##..', '...####...', '....##....'],
};
export const ICONS = ['none', ...Object.keys(ICON_ART)] as const;
export const ICON_NAMES: Record<string, string> = { none: 'ไม่มี', sword: 'ดาบ', swords: 'ดาบไขว้', shield: 'โล่', crown: 'มงกุฎ', star: 'ดาว', tree: 'ต้นไม้', skull: 'หัวกะโหลก', flame: 'เปลวไฟ', moon: 'จันทร์', tower: 'หอคอย', hammer: 'ค้อน', wolf: 'หมาป่า' };

export interface FlagTpl { bg: Pattern; c1: number; c2: number; icon: string; ic: number }

/** a darker colour of the palette for the '+' shading of a symbol */
const SHADE: number[] = [9, 0, 1, 0, 9, 4, 11, 8, 9, 9, 9, 10, 11, 14, 9, 0];

export function renderTpl(t: FlagTpl): string {
  const px: number[] = [];
  for (let y = 0; y < FLAG_H; y++) for (let x = 0; x < FLAG_W; x++) {
    const a = t.c1, b = t.c2; let c = a;
    switch (t.bg) {
      case 'vsplit': c = x < 8 ? a : b; break;
      case 'hsplit': c = y < 8 ? a : b; break;
      case 'cross': c = (x >= 5 && x <= 7) || (y >= 7 && y <= 9) ? b : a; break;
      case 'diag': c = x + y < 16 ? a : b; break;
      case 'quarters': c = (x < 8) === (y < 8) ? a : b; break;
      case 'stripes': c = Math.floor(y / 4) % 2 ? b : a; break;
      case 'chevron': c = y > 6 + Math.abs(x - 7.5) * 0.9 ? b : a; break;
      case 'border': c = x < 2 || x > 13 || y < 2 || y > 13 ? b : a; break;
      case 'saltire': c = Math.abs(x - y) < 2 || Math.abs(x + y - 15) < 2 ? b : a; break;
    }
    px.push(c);
  }
  const art = ICON_ART[t.icon];
  if (art) art.forEach((row, ry) => [...row].forEach((ch, rx) => { if (ch !== '.') px[(ry + 3) * FLAG_W + rx + 3] = ch === '+' ? SHADE[t.ic] : t.ic; }));
  return px.map(n => n.toString(16)).join('');
}

/** a random but good-looking flag: two different colours, a symbol that stands out from the cloth */
export function randomTpl(rnd: () => number): FlagTpl {
  const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
  const c1 = Math.floor(rnd() * 16); let c2 = Math.floor(rnd() * 16); if (c2 === c1) c2 = (c1 + 7) % 16;
  const light = (c: number) => [2, 5, 6, 7, 11, 12].includes(c);
  const ic = light(c1) ? pick([0, 9, 14, 15, 10]) : pick([7, 12, 6, 11]);
  return { bg: pick(PATTERNS), c1, c2, icon: pick(ICONS.filter(i => i !== 'none')), ic };
}
function seeded(str: string) { let a = 2166136261; for (const ch of str) a = Math.imul(a ^ ch.charCodeAt(0), 16777619) >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/** the flag a guild flies: its own, or one the game makes from its name until somebody designs one */
export const flagFor = (name: string, own?: string) => own && isFlag(own) ? own : renderTpl(randomTpl(seeded(name)));
export const isFlag = (px: unknown): px is string => typeof px === 'string' && px.length === FLAG_LEN && /^[0-9a-f]+$/.test(px);
