// Atlas pages (tools/pack_atlas.py): many small pictures in a few files (director: faster loading). After a page loads,
// each picture becomes its own texture again under its usual key ('o_<name>', 'icon_<name>', 'sk_<name>'), pointing at
// its spot on the page — the rest of the game uses the keys as before.
import Phaser from 'phaser';

const IMG = import.meta.glob('../assets/td/atlas/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const META = import.meta.glob('../assets/td/atlas/*.json', { eager: true, import: 'default' }) as Record<string, { frames: Record<string, { frame: { w: number; h: number } }> }>;
const base = (p: string) => p.split('/').pop()!.replace(/\.(webp|json)$/, '');
const pages = (set: string) => Object.keys(IMG).map(base).filter(n => n.startsWith(set + '_')).sort();

export function loadAtlas(sc: Phaser.Scene, set: string) {
  for (const n of pages(set)) {
    const img = Object.entries(IMG).find(([p]) => base(p) === n)?.[1], meta = Object.entries(META).find(([p]) => base(p) === n)?.[1];
    if (img && meta && !sc.textures.exists('atl_' + n)) sc.load.atlas('atl_' + n, img, meta as never);
  }
}
/** make the per-picture textures (skips keys that exist unless `replace`: the item icons replace the drawn fallbacks) */
export function unpackAtlas(sc: Phaser.Scene, set: string, prefix: string, replace = false) {
  for (const n of pages(set)) {
    const meta = Object.entries(META).find(([p]) => base(p) === n)?.[1]; if (!meta || !sc.textures.exists('atl_' + n)) continue;
    for (const [name, f] of Object.entries(meta.frames)) {
      const key = prefix + name;
      if (sc.textures.exists(key)) { if (!replace || sc.textures.get(key).source[0]?.image === sc.textures.get('atl_' + n).source[0]?.image) continue; sc.textures.remove(key); }
      share(sc, key, 'atl_' + n, name); void f;
    }
  }
}
/** a texture under `key` that SHARES the atlas page already on the GPU (its own frame = the picture's spot) — making
 *  hundreds of textures from one page otherwise uploads the whole page once per picture (seconds of 'please wait') */
const TINY = (() => { const c = document.createElement('canvas'); c.width = c.height = 1; return c; })();
function share(sc: Phaser.Scene, key: string, atlas: string, frame: string) {
  const atl = sc.textures.get(atlas), fr = atl.get(frame), t = sc.textures.create(key, TINY as unknown as HTMLImageElement); if (!t) return;
  t.source[0].destroy(); t.source = [atl.source[0]];
  t.add('__BASE', 0, fr.cutX, fr.cutY, fr.cutWidth, fr.cutHeight); t.add(0, 0, fr.cutX, fr.cutY, fr.cutWidth, fr.cutHeight);
}
/** the pixels of one picture (its first frame) on its own canvas — for code that reads pixels (ruins, picture bounds) */
export function framePixels(sc: Phaser.Scene, key: string): HTMLCanvasElement {
  const tex = sc.textures.get(key), fr = tex.get(), src = tex.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const c = document.createElement('canvas'); c.width = fr.cutWidth; c.height = fr.cutHeight;
  c.getContext('2d')!.drawImage(src, fr.cutX, fr.cutY, fr.cutWidth, fr.cutHeight, 0, 0, fr.cutWidth, fr.cutHeight);
  return c;
}
