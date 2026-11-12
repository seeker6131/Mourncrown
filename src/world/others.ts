// Other real players in this map (net/room.ts): their own hero form, name over the head with the HP bar under it, the
// VIP aura by card, a chat bubble when they talk. Positions are smoothed between the updates the server relays.
import Phaser from 'phaser';
import { CH, setIdle, playAnim, hasAnim } from './chars';
import { hpBar } from './hpBar';
import { pxShadow } from './pxShadow';
import { VIP_AURA } from '../systems/premium';
import type { RoomLink, RoomEvent } from '../net/room';

interface View { sp: Phaser.GameObjects.Sprite; sh: Phaser.GameObjects.Image; tag: Phaser.GameObjects.Text; bubble?: Phaser.GameObjects.Text; bubbleT: number; form: string; aura: number; glow?: Phaser.FX.Glow; busy: number; dir: number; moving: boolean }

export class OtherPlayers {
  views = new Map<string, View>(); bars: Phaser.GameObjects.Graphics;
  constructor(public sc: Phaser.Scene, public link: RoomLink) { this.bars = sc.add.graphics().setDepth(99990); }
  /** the room's news: a swing to animate, a chat line to show over the speaker, someone left */
  event(e: RoomEvent, heroBubble: (text: string) => void) {
    if (e.t === 'bye') { this.drop(e.id); return; }
    if (e.t === 'c') { if (e.id === this.link.me) heroBubble(e.text); else { const v = this.views.get(e.id); if (v) this.say(v, e.text); } return; }
    if (e.t === 'hit') { const v = this.views.get(e.id); if (v && hasAnim(v.form, e.k)) { v.dir = e.d; v.busy = this.sc.time.now + 450; playAnim(v.sp, v.form, e.k, e.d, false); } }
  }
  say(v: View, text: string) {
    v.bubble?.destroy();
    v.bubble = this.sc.add.text(0, 0, text, { fontFamily: 'sans-serif', fontSize: '7px', color: '#1a1410', backgroundColor: '#f3ead6', padding: { x: 3, y: 2 }, wordWrap: { width: 110 }, resolution: 6 }).setOrigin(0.5, 1).setDepth(99993);
    v.bubbleT = this.sc.time.now + 4500;
  }
  private drop(id: string) { const v = this.views.get(id); if (!v) return; v.sp.destroy(); v.sh.destroy(); v.tag.destroy(); v.bubble?.destroy(); this.views.delete(id); }
  update(dt: number) {
    const now = this.sc.time.now; this.bars.clear();
    for (const id of [...this.views.keys()]) if (!this.link.others.has(id)) this.drop(id);
    for (const o of this.link.others.values()) {
      const form = CH[o.f] && this.sc.textures.exists(`c_${o.f}_idle`) ? o.f : 'hero';
      let v = this.views.get(o.id);
      if (!v) {
        const sp = this.sc.add.sprite(o.tx, o.ty, `c_${form}_idle`, 0);
        v = { sp, sh: pxShadow(this.sc, o.tx, o.ty, 18, 6, 0.5), tag: this.sc.add.text(o.tx, o.ty, o.name, { fontFamily: 'sans-serif', fontSize: '7px', color: '#bfe8ff', stroke: '#06121a', strokeThickness: 3, resolution: 6 }).setOrigin(0.5, 1).setDepth(99990), bubbleT: 0, form: '', aura: 0, busy: 0, dir: o.d, moving: false };
        this.views.set(o.id, v); o.x = o.tx; o.y = o.ty;
      }
      // glide toward the last reported spot (a jump if far: they teleported / just arrived)
      const dx = o.tx - o.x, dy = o.ty - o.y, dist = Math.hypot(dx, dy);
      if (dist > 220) { o.x = o.tx; o.y = o.ty; } else { const k = Math.min(1, dt / 1000 * 10); o.x += dx * k; o.y += dy * k; }
      const moving = !!o.mv || dist > 2;
      if (form !== v.form || (now > v.busy && (moving !== v.moving || o.d !== v.dir))) {
        v.form = form; v.moving = moving; v.dir = o.d;
        if (moving && hasAnim(form, 'walk')) playAnim(v.sp, form, 'walk', o.d, true); else setIdle(v.sp, form, o.d);
      }
      v.sp.setPosition(Math.round(o.x), Math.round(o.y)).setDepth(o.y);
      v.sh.setPosition(Math.round(o.x), Math.round(o.y));
      const by = o.y - 36;
      hpBar(this.bars, o.x, by, o.hp / 100, 22);
      v.tag.setText(o.name).setPosition(Math.round(o.x), Math.round(by - 2));
      if (v.bubble) { if (now > v.bubbleT) { v.bubble.destroy(); v.bubble = undefined; } else v.bubble.setPosition(Math.round(o.x), Math.round(by - 12)); }
      // the VIP aura by card
      if (o.a !== v.aura) {
        if (v.glow) { v.sp.preFX?.remove(v.glow); v.glow = undefined; }
        v.aura = o.a; const c = VIP_AURA[o.a]; if (c && v.sp.preFX) v.glow = v.sp.preFX.addGlow(c.col, 1.6, 0, false, 0.1, 4);
      }
      if (v.glow) v.glow.outerStrength = 1.5 + Math.sin(now / 90 + o.x) * 0.5;
    }
  }
  destroy() { for (const id of [...this.views.keys()]) this.drop(id); this.bars.destroy(); }
}
