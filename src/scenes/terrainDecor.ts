// Terrain dressing on top of the generated maps: bridges, waterfalls, shores, hills, cliffs + stairs,
// foreground canopy, parallax sky, village defences / growth, goblin siege camp. Uses the Director's art (ai_pr_*).
import Phaser from 'phaser';
import { G, MAP_W, MAP_H, iso, unIso } from '../world/mapgen';
import { S } from '../core/events';
import type { WorldScene } from './WorldScene';

type Img = Phaser.GameObjects.Image;

function rng(seed: number) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

export class TerrainDecor {
  canopies: Img[] = [];
  falls: { img: Img; t: number }[] = [];
  par: Phaser.GameObjects.TileSprite[] = [];
  sky: Phaser.GameObjects.Image | null = null;
  growth: Phaser.GameObjects.GameObject[] = [];
  constructor(private w: WorldScene) {}

  has(k: string) { return this.w.textures.exists('ai_' + k); }
  g(tx: number, ty: number) { return tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H ? -1 : this.w.map.ground[ty * MAP_W + tx]; }
  block(tx: number, ty: number, v = 1) { if (tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H) this.w.map.blocked[ty * MAP_W + tx] = v; }
  /** clear existing small objects drawn at a tile (props are images in the scene; we just avoid placing on solid spots) */
  freeTile(tx: number, ty: number) { const g = this.g(tx, ty); return g === G.Grass || g === G.Forest || g === G.Grove; }

  put(key: string, x: number, y: number, o: { depth?: number; flip?: boolean; shadow?: number; origin?: number; scale?: number } = {}): Img | null {
    if (!this.has(key)) return null;
    const im = this.w.fit(this.w.add.image(x, y, 'ai_' + key).setOrigin(0.5, o.origin ?? 0.95));
    if (o.scale) im.setScale(im.scaleX * o.scale);
    im.setDepth(o.depth ?? y).setFlipX(!!o.flip);
    if (o.shadow) this.w.castShadow(im, o.shadow);
    return im;
  }

  build() {
    const m = this.w.map, th = m.theme;
    const r = rng(m.id.length * 977 + 13);
    this.parallax();
    this.bridges(th === 'lava' || th === 'snow' ? 'pr_bridge0' : 'pr_bridge1');
    if (th !== 'dung' && th !== 'lava') this.shores(r);
    if (m.id === 'main' || m.id === 'gather') this.waterfall();
    if (m.id === 'main') { this.hills(r, [[36, 46], [42, 33], [30, 30], [60, 60], [88, 60], [20, 70]]); this.ridge(); this.siegeCamp(); this.villageProps(r); this.canopy(r, 6); this.villageGrowth(); }
    if (m.id === 'gather') { this.hills(r, [[54, 30], [58, 46], [28, 46], [70, 50]]); this.cliffHill(); this.canopy(r, 4); }
    if (th === 'haunt') this.canopy(r, 4, 'pr_canopy2');
    if (th === 'snow') this.cliffRing(r, 'pr_cliff');
    if (th === 'dung') this.cliffRing(r, 'pr_dwall');
  }

  // ---------- parallax sky behind the world's edges ----------
  parallax() {
    const th = this.w.map.theme;
    if (!(th === 'main' || th === 'haunt' || th === 'snow') || !this.has('bg_par0')) return;
    const cam = this.w.cameras.main;
    const sky = th === 'snow' ? ['#cfe0f0', '#eef4fa'] : th === 'haunt' ? ['#2a2440', '#d08a5a'] : ['#7ab0e0', '#f4d8b0'];
    const key = 'sky_' + th;
    if (!this.w.textures.exists(key)) {
      const cv = document.createElement('canvas'); cv.width = 4; cv.height = 256;
      const c = cv.getContext('2d')!; const gr = c.createLinearGradient(0, 0, 0, 256);
      gr.addColorStop(0, sky[0]); gr.addColorStop(1, sky[1]); c.fillStyle = gr; c.fillRect(0, 0, 4, 256);
      this.w.textures.addCanvas(key, cv);
    }
    this.sky = this.w.add.image(0, 0, key).setOrigin(0.5).setScrollFactor(0).setDepth(-20);
    for (let i = 0; i < 3; i++) {
      const tex = this.w.textures.get('ai_bg_par' + i).getSourceImage() as HTMLImageElement;
      const ts = this.w.add.tileSprite(0, 0, tex.width * 3, tex.height, 'ai_bg_par' + i).setScrollFactor(0).setDepth(-19 + i).setOrigin(0.5, 1);
      if (th === 'haunt') ts.setTint(i === 0 ? 0x9a7aa0 : i === 1 ? 0xb08a60 : 0xc07040);
      if (th === 'snow') ts.setTint(i === 0 ? 0xffffff : 0xdfe8f4);
      this.par.push(ts);
    }
    void cam;
  }

  update(time: number) {
    const cam = this.w.cameras.main, z = cam.zoom, W = cam.width / z, H = cam.height / z;
    if (this.sky) this.sky.setPosition(cam.width / 2, cam.height / 2).setDisplaySize(W + 4, H + 4);
    this.par.forEach((p, i) => {
      const s = (H / 3) / p.height * (i === 0 ? 1.4 : 1.1);
      p.setScale(s).setPosition(cam.width / 2, cam.height / 2 - H / 2 + H * [0.42, 0.62, 0.8][i]);
      p.width = (W / s) + 4;
      p.tilePositionX = cam.scrollX * [0.05, 0.12, 0.22][i] / s;
    });
    // waterfall frames
    for (const f of this.falls) { const k = 'ai_pr_fall' + (Math.floor(time / 110 + f.t) % 4); if (f.img.texture.key !== k && this.w.textures.exists(k)) f.img.setTexture(k); }
    // canopy fades when the hero walks underneath
    const h = this.w.hero;
    for (const c of this.canopies) {
      const near = Math.abs(h.x - c.x) < c.displayWidth * 0.45 && h.y < c.y + 10 && h.y > c.y - c.displayHeight;
      c.setAlpha(Phaser.Math.Linear(c.alpha, near ? 0.35 : 1, 0.12));
    }
  }

  // ---------- water ----------
  bridges(key: string) {
    const m = this.w.map, seen = new Uint8Array(MAP_W * MAP_H), placed: [number, number][] = [];
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      if (m.ground[y * MAP_W + x] !== G.Bridge || seen[y * MAP_W + x]) continue;
      const q: [number, number][] = [[x, y]]; seen[y * MAP_W + x] = 1; const cells: [number, number][] = [];
      while (q.length) {
        const [cx, cy] = q.pop()!; cells.push([cx, cy]);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H || seen[ny * MAP_W + nx] || m.ground[ny * MAP_W + nx] !== G.Bridge) continue;
          seen[ny * MAP_W + nx] = 1; q.push([nx, ny]);
        }
      }
      if (cells.length < 4) continue;
      const xs = cells.map(c => c[0]), ys = cells.map(c => c[1]);
      const cx = (Math.min(...xs) + Math.max(...xs) + 1) / 2, cy = (Math.min(...ys) + Math.max(...ys) + 1) / 2;
      const alongX = Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys);
      const p = iso(cx, cy);
      if (placed.some(q => Math.hypot(q[0] - p.x, q[1] - p.y) < 90)) continue;
      placed.push([p.x, p.y]);
      // art runs lower-left -> upper-right (tile -y); flip for crossings along tile x
      this.put(key, p.x, p.y + 18, { depth: 1.4, flip: alongX, origin: 0.85, scale: 0.75 });
    }
  }

  shores(r: () => number) {
    const m = this.w.map;
    let docks = 0;
    for (let y = 2; y < MAP_H - 2; y++) for (let x = 2; x < MAP_W - 2; x++) {
      if (m.ground[y * MAP_W + x] !== G.Sand || m.blocked[y * MAP_W + x]) continue;
      const nearWater = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => this.g(x + dx, y + dy) === G.Water);
      if (!nearWater) continue;
      const v = r();
      const p = iso(x + 0.5, y + 0.5);
      if (docks < 2 && v < 0.02 && this.w.map.id !== 'dung') { this.put(docks ? 'pr_shore4' : 'pr_shore5', p.x, p.y + 10, { depth: p.y - 2, scale: 0.8 }); docks++; continue; }
      if (v < 0.07) this.put(['pr_shore2', 'pr_shore1', 'pr_shore3'][Math.floor(r() * 3)], p.x, p.y + 8, { depth: p.y - 4, scale: 0.7 });
    }
  }

  waterfall() {
    // where the river meets the northern forest edge
    const m = this.w.map;
    for (let y = 2; y < MAP_H; y++) {
      const xs: number[] = [];
      for (let x = 0; x < MAP_W; x++) if (m.ground[y * MAP_W + x] === G.Water) xs.push(x);
      if (xs.length && xs.length < 8) {
        const cx = (Math.min(...xs) + Math.max(...xs) + 1) / 2, p = iso(cx, y + 0.2);
        const img = this.put('pr_fall0', p.x, p.y + 12, { depth: p.y + 6, scale: 1.1 });
        if (img) { this.falls.push({ img, t: 0 }); this.w.nightLights.push(this.w.addGlow(p.x, p.y - 8, 0x9ae0ff, 0.7, true)); }
        for (let j = -2; j <= 2; j++) for (let i = -3; i <= 3; i++) this.block(Math.floor(cx) + i, y + j - 1);
        return;
      }
    }
  }

  // ---------- relief ----------
  hills(r: () => number, spots: [number, number][]) {
    for (const [tx, ty] of spots) {
      if (!this.freeTile(tx, ty) || this.w.map.blocked[ty * MAP_W + tx]) continue;
      const k = 'pr_hill' + Math.floor(r() * 6);
      const p = iso(tx + 0.5, ty + 0.5);
      this.put(k, p.x, p.y + 10, { depth: p.y, shadow: 0.5, flip: r() < 0.5 });
      this.block(tx, ty); this.block(tx + 1, ty);
    }
  }

  /** Earth ledge separating the meadow from the raised northern grove, with stone stairs on the road. */
  ridge() {
    const m = this.w.map;
    for (let tx = 57; tx <= 104; tx++) {
      // first grove tile from the south
      let ty = -1;
      for (let y = 30; y > 8; y--) if (m.ground[y * MAP_W + tx] === G.Grove) { ty = y; break; }
      if (ty < 0) continue;
      const g = this.g(tx, ty + 1);
      const p = iso(tx + 0.5, ty + 1);
      if (g === G.Path || this.g(tx, ty) === G.Path) { if (tx % 2 === 0) this.put('pr_stairs0', p.x, p.y + 10, { depth: p.y + 2, flip: true, scale: 0.85 }); continue; }
      if (g === G.Water || this.g(tx, ty) === G.Water) continue;
      this.put('pr_ledge' + (tx % 3 === 0 ? 7 : tx % 2), p.x, p.y + 12, { depth: p.y + 1, shadow: 0.5, flip: true });
      this.block(tx, ty);
    }
  }

  /** Rocky hill in the hunting grounds: cliff faces with a cave and a rope ladder. */
  cliffHill() {
    const cx = 66, cy = 15, rx = 9, ry = 6;
    for (let a = 0.15; a < Math.PI * 0.95; a += 0.16) {
      const tx = Math.round(cx + Math.cos(a) * rx), ty = Math.round(cy + Math.sin(a) * ry);
      if (this.g(tx, ty) === G.Path) { const p = iso(tx + 0.5, ty + 0.5); this.put('pr_stairs4', p.x, p.y + 10, { depth: p.y + 2 }); continue; }
      const p = iso(tx + 0.5, ty + 0.5);
      const k = Math.abs(a - Math.PI / 2) < 0.12 ? 'pr_cliff6' : 'pr_cliff' + (Math.floor(a * 10) % 2);
      this.put(k, p.x, p.y + 12, { depth: p.y + 1, shadow: 0.5, flip: a > Math.PI / 2 });
      this.block(tx, ty);
    }
  }

  /** Rock formations / ruined wall pieces scattered as clusters (blocking). */
  cliffRing(r: () => number, pre: string) {
    const m = this.w.map;
    let made = 0;
    for (let tries = 0; tries < 600 && made < 16; tries++) {
      const tx = 8 + Math.floor(r() * 68), ty = 10 + Math.floor(r() * 56);
      let ok = true;
      for (let i = -1; i <= 3 && ok; i++) for (let j = -1; j <= 1; j++) { const g = this.g(tx + i, ty + j); if (m.blocked[(ty + j) * MAP_W + tx + i] || !(g === G.Grass || g === G.Forest)) { ok = false; break; } }
      if (!ok) continue;
      const n = 2 + Math.floor(r() * 2);
      for (let i = 0; i < n; i++) {
        const p = iso(tx + i + 0.5, ty + 0.5);
        const k = pre + (i === n - 1 && r() < 0.4 ? 2 + Math.floor(r() * 2) : r() < 0.15 ? 4 + Math.floor(r() * 3) : Math.floor(r() * 2));
        this.put(k, p.x, p.y + 12, { depth: p.y + 1, shadow: 0.6 });
        this.block(tx + i, ty);
      }
      made++;
    }
  }

  // ---------- foreground canopy ----------
  canopy(r: () => number, n: number, only?: string) {
    const m = this.w.map;
    let placed = 0;
    for (let tries = 0; tries < 400 && placed < n; tries++) {
      const tx = 6 + Math.floor(r() * (MAP_W - 12)), ty = 6 + Math.floor(r() * (MAP_H - 12));
      if (m.ground[ty * MAP_W + tx] !== G.Forest) continue;
      const pp = iso(tx + 0.5, ty + 0.5);
      if (this.canopies.some(c => Math.hypot(c.x - pp.x, c.y - pp.y) < 260)) continue;
      // next to a walkable road so the player actually passes under it
      let road = false;
      for (let j = -3; j <= 3 && !road; j++) for (let i = -3; i <= 3; i++) if (this.g(tx + i, ty + j) === G.Path) { road = true; break; }
      if (!road) continue;
      const p = iso(tx + 0.5, ty + 0.5);
      const k = only ?? ['pr_canopy0', 'pr_canopy1', 'pr_canopy0', 'pr_canopy2'][Math.floor(r() * (m.id === 'main' ? 3 : 4))];
      const im = this.put(k, p.x, p.y + 30, { depth: 99000 + p.y, flip: r() < 0.5, origin: 1, scale: 0.8 });
      if (im) { this.canopies.push(im); this.w.swayers.push({ img: im, amp: 0.008, ph: r() * 6, bend: 0, freq: 0.6 }); placed++; }
    }
  }

  // ---------- main map set pieces ----------
  siegeCamp() {
    // the goblin war camp shows what raids will look like
    const spots: [string, number, number][] = [['pr_siege0', 86, 53], ['pr_siege2', 78, 46], ['pr_siege3', 88, 45], ['pr_siege4', 80, 54], ['pr_siege5', 84, 47], ['pr_siege1', 86, 31]];
    for (const [k, tx, ty] of spots) {
      if (this.w.map.blocked[ty * MAP_W + tx]) continue;
      const p = iso(tx + 0.5, ty + 0.5);
      this.put(k, p.x, p.y + 8, { depth: p.y, shadow: 0.7, flip: tx > 83 });
      this.block(tx, ty);
    }
    for (const [tx, ty] of [[76, 50], [77, 52]] as const) { const p = iso(tx + 0.5, ty + 0.5); this.put('pr_def5', p.x, p.y + 6, { depth: p.y, shadow: 0.6 }); this.block(tx, ty); }
  }

  villageProps(r: () => number) {
    const spots: [number, number][] = [[5, 34], [10, 30], [19, 30], [24, 33], [4, 41], [26, 45], [9, 47], [20, 49], [3, 52], [25, 54], [27, 60], [3, 63]];
    spots.forEach(([tx, ty], i) => {
      if (this.w.map.blocked[ty * MAP_W + tx]) return;
      const p = iso(tx + 0.5, ty + 0.5);
      this.put('pr_vil' + (i % 12), p.x, p.y + 6, { depth: p.y, shadow: 0.7, flip: r() < 0.5 });
      this.block(tx, ty);
    });
  }

  /** The village grows with progress: houses, town hall, and defences from the tower level. */
  villageGrowth() {
    for (const o of this.growth) o.destroy();
    this.growth = [];
    const s = S(), bosses = s.bossDefeated, tower = s.buildings.find(b => b.type === 'tower')?.level ?? 0;
    const add = (im: Img | null) => { if (im) this.growth.push(im); };
    // homes for new villagers east of the building plots
    const homes: [number, number, number][] = [];
    const okBlock = (x: number, y: number) => { for (let j = -3; j <= 4; j++) for (let i = -4; i <= 4; i++) { const g = this.g(x + i, y + j); if (!(g === G.Grass || g === G.Path) || this.w.map.blocked[(y + j) * MAP_W + x + i]) return false; } return true; };
    for (let y = 30; y <= 68 && homes.length < 3; y += 1) for (let x = 30; x <= 46 && homes.length < 3; x += 1)
      if (okBlock(x, y) && homes.every(([hx, hy]) => Math.hypot(hx - x, hy - y) > 7)) homes.push([x, y, homes.length + 1]);
    for (const [tx, ty, need] of homes) {
      if (bosses < need) continue;
      const p = iso(tx + 0.5, ty + 0.5);
      add(this.put(bosses >= need + 1 ? 'bld_house_2' : 'bld_house_1', p.x, p.y + 16, { depth: p.y + 10, shadow: 0.85 }));
      for (let j = -1; j <= 0; j++) for (let i = -1; i <= 1; i++) this.block(tx + i, ty + j);
    }
    // town hall replaces the elder's tower once the curse starts to lift
    if (bosses >= 1) {
      const p = iso(12, 31.5);
      const k = bosses >= 3 ? 'bld_townhall_3' : 'bld_townhall_2';
      const im = this.put(k, p.x, p.y + 18, { depth: p.y + 12, shadow: 0.85 });
      if (im) { add(im); this.w.elderTower?.setVisible(false); (this.w.elderTower?.getData('sh') as Img | undefined)?.setVisible(false); }
    }
    // defences
    const towers: [string, number, number, number][] = [['pr_def0', 29, 39, 1], ['pr_def0', 3, 31, 2], ['pr_def1', 29, 33, 3], ['pr_def1', 3, 47, 4], ['pr_def2', 15, 27, 5]];
    for (const [k, tx, ty, need] of towers) {
      if (tower < need || this.w.map.ground[ty * MAP_W + tx] === G.Water) continue;
      const p = iso(tx + 0.5, ty + 0.5);
      add(this.put(k, p.x, p.y + 8, { depth: p.y, shadow: 0.8 }));
      if (k === 'pr_def2') this.w.nightLights.push(this.w.addGlow(p.x, p.y - 44, 0x8ae0ff, 1, true));
      this.block(tx, ty);
    }
    if (tower >= 2) for (const [tx, ty] of [[30, 41], [30, 37], [1, 40]] as const) {
      if (this.w.map.ground[ty * MAP_W + tx] === G.Path) continue;
      const p = iso(tx + 0.5, ty + 0.5);
      add(this.put(tower >= 4 ? 'pr_def4' : 'pr_def3', p.x, p.y + 4, { depth: 2, origin: 0.8 }));
    }
    if (tower >= 3) {
      const p = iso(30.5, 39.5);
      add(this.put(tower >= 5 ? 'pr_wall5' : 'pr_wall2', p.x, p.y + 12, { depth: p.y + 4, shadow: 0.8, flip: true, scale: 0.85 }));
    }
  }
}

export { unIso };
