import { describe, it, expect } from 'vitest';
import { qrMatrix } from '../src/core/qr';

// an independent reader for the codes we make: format bits (BCH), the mask, the zigzag, Reed–Solomon check, the text
const ECC_M = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26];
const BLOCKS_M = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16];
const EXP: number[] = [], LOG: number[] = [];
for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
const mul = (a: number, b: number) => (a && b ? EXP[(LOG[a] + LOG[b]) % 255] : 0);

function read(M: boolean[][]): string {
  const size = M.length, v = (size - 17) / 4;
  let f = 0; for (let i = 0; i <= 5; i++) f |= +M[i][8] << i;
  f |= +M[7][8] << 6; f |= +M[8][8] << 7; f |= +M[8][7] << 8; for (let i = 9; i < 15; i++) f |= +M[8][14 - i] << i;
  let f2 = 0; for (let i = 0; i < 8; i++) f2 |= +M[8][size - 1 - i] << i; for (let i = 8; i < 15; i++) f2 |= +M[size - 15 + i][8] << i;
  expect(f2).toBe(f);
  const fmt = f ^ 0x5412; let r = fmt >>> 10; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
  expect(r & 0x3ff).toBe(fmt & 0x3ff);   // (valid BCH)
  expect(fmt >>> 13).toBe(0);            // (level M)
  const mask = (fmt >>> 10) & 7;
  // which modules are fixed patterns
  const F = M.map(row => row.map(() => false)), mark = (x: number, y: number) => { if (x >= 0 && y >= 0 && x < size && y < size) F[y][x] = true; };
  for (let i = 0; i < size; i++) { mark(6, i); mark(i, 6); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) mark(cx + dx, cy + dy);
  if (v > 1) {
    const n = Math.floor(v / 7) + 2, step = Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2, al = [6]; for (let p = size - 7; al.length < n; p -= step) al.splice(1, 0, p);
    al.forEach((ay, i) => al.forEach((ax, j) => { if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) return; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) mark(ax + dx, ay + dy); }));
  }
  for (let i = 0; i < 9; i++) { mark(8, i); mark(i, 8); } for (let i = 0; i < 8; i++) { mark(size - 1 - i, 8); mark(8, size - 1 - i); }
  if (v >= 7) for (let i = 0; i < 18; i++) { mark(size - 11 + i % 3, Math.floor(i / 3)); mark(Math.floor(i / 3), size - 11 + i % 3); }
  const MASK = [(x: number, y: number) => (x + y) % 2 === 0, (_x: number, y: number) => y % 2 === 0, (x: number) => x % 3 === 0, (x: number, y: number) => (x + y) % 3 === 0,
    (x: number, y: number) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x: number, y: number) => (x * y) % 2 + (x * y) % 3 === 0,
    (x: number, y: number) => ((x * y) % 2 + (x * y) % 3) % 2 === 0, (x: number, y: number) => ((x + y) % 2 + (x * y) % 3) % 2 === 0][mask];
  const bits: number[] = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
      if (!F[y][x]) bits.push(+(M[y][x] !== MASK(x, y)));
    }
  }
  const raw: number[] = []; for (let i = 0; i + 8 <= bits.length; i += 8) raw.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  // de-interleave, check each block's Reed–Solomon syndromes are all zero
  const nb = BLOCKS_M[v], ecl = ECC_M[v], total = raw.length, short = nb - total % nb, shortLen = Math.floor(total / nb);
  const blocks: number[][] = Array.from({ length: nb }, () => []); let k = 0;
  for (let i = 0; i < shortLen + 1; i++) for (let j = 0; j < nb; j++) { if (i === shortLen - ecl && j < short) continue; if (k < total) blocks[j].push(raw[k++]); }
  const data: number[] = [];
  for (const b of blocks) {
    for (let s = 0; s < ecl; s++) { let acc = 0; for (const c of b) acc = mul(acc, EXP[s]) ^ c; expect(acc).toBe(0); }
    data.push(...b.slice(0, b.length - ecl));
  }
  const db = data.flatMap(b => [7, 6, 5, 4, 3, 2, 1, 0].map(i => (b >>> i) & 1)), num = (a: number, n: number) => parseInt(db.slice(a, a + n).join(''), 2);
  expect(num(0, 4)).toBe(4);
  const cc = v <= 9 ? 8 : 16, len = num(4, cc), bytes = Array.from({ length: len }, (_, i) => num(4 + cc + i * 8, 8));
  return new TextDecoder().decode(new Uint8Array(bytes));
}

describe('qr', () => {
  for (const t of ['hi', 'HELLO WORLD 123', '00020101021229370016A000000677010111011300668123456785802TH530376454052900.0063041234', 'x'.repeat(150), 'ทดสอบ 💎', 'y'.repeat(300)])
    it(`reads back (${t.length} chars)`, () => { const m = qrMatrix(t); expect(m.length).toBe(m[0].length); expect(read(m)).toBe(t); });
  it('picks the smallest version', () => { expect(qrMatrix('hi').length).toBe(21); });
});
