// Big skill sounds, synthesised in layers (no files needed): whooshes, sub booms, crackles, shimmering chords,
// all sent through a hall reverb so they feel huge. One recipe per skill kind / element.
import { audioOut } from './sfx';
import type { SkillDef } from '../data/skills';

let verb: ConvolverNode | null = null, comp: DynamicsCompressorNode | null = null, bus: GainNode | null = null;
function chain() {
  const a = audioOut(); if (!a) return null;
  const { c, out } = a;
  if (!bus) {
    comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6; comp.connect(out);
    bus = c.createGain(); bus.gain.value = 0.9; bus.connect(comp);
    // hall reverb from a generated impulse
    const len = Math.floor(c.sampleRate * 2.4), ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    verb = c.createConvolver(); verb.buffer = ir; const vg = c.createGain(); vg.gain.value = 0.42; verb.connect(vg); vg.connect(comp);
  }
  return { c, bus: bus!, verb: verb! };
}
type Ch = NonNullable<ReturnType<typeof chain>>;
const env = (ch: Ch, g: GainNode, t: number, a: number, peak: number, dur: number) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); };
function out(ch: Ch, node: AudioNode, wet = 0.5) { node.connect(ch.bus); if (wet > 0) { const w = ch.c.createGain(); w.gain.value = wet; node.connect(w); w.connect(ch.verb); } }
function noiseSrc(ch: Ch, dur: number) { const b = ch.c.createBuffer(1, Math.floor(ch.c.sampleRate * dur), ch.c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = ch.c.createBufferSource(); s.buffer = b; return s; }

/** air swoosh: band-passed noise sweeping f0 -> f1 */
function whoosh(ch: Ch, at: number, dur: number, f0: number, f1: number, vol = 0.5, wet = 0.3) {
  const t = ch.c.currentTime + at, n = noiseSrc(ch, dur), f = ch.c.createBiquadFilter(), g = ch.c.createGain();
  f.type = 'bandpass'; f.Q.value = 1.4; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  env(ch, g, t, dur * 0.35, vol, dur); n.connect(f); f.connect(g); out(ch, g, wet); n.start(t); n.stop(t + dur);
}
/** impact: sub sine drop + low noise thump */
function boom(ch: Ch, at: number, vol = 0.8, size = 1) {
  const t = ch.c.currentTime + at, o = ch.c.createOscillator(), g = ch.c.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(120 * (1.3 - size * 0.3), t); o.frequency.exponentialRampToValueAtTime(32, t + 0.5 * size);
  env(ch, g, t, 0.008, vol, 0.55 * size); o.connect(g); out(ch, g, 0.5); o.start(t); o.stop(t + 0.6 * size);
  const n = noiseSrc(ch, 0.7 * size), f = ch.c.createBiquadFilter(), g2 = ch.c.createGain(); f.type = 'lowpass'; f.frequency.setValueAtTime(1800, t); f.frequency.exponentialRampToValueAtTime(120, t + 0.6 * size);
  env(ch, g2, t, 0.005, vol * 0.7, 0.7 * size); n.connect(f); f.connect(g2); out(ch, g2, 0.6); n.start(t);
}
/** shimmering chord (bells / holy) */
function chord(ch: Ch, at: number, freqs: number[], dur: number, vol = 0.12, type: OscillatorType = 'sine', wet = 0.9) {
  const t = ch.c.currentTime + at;
  freqs.forEach((fr, i) => { for (const det of [-6, 6]) { const o = ch.c.createOscillator(), g = ch.c.createGain(); o.type = type; o.frequency.value = fr; o.detune.value = det; env(ch, g, t + i * 0.03, 0.04, vol, dur); o.connect(g); out(ch, g, wet); o.start(t + i * 0.03); o.stop(t + dur + 0.1); } });
}
/** rising / falling tone */
function sweep(ch: Ch, at: number, f0: number, f1: number, dur: number, vol = 0.15, type: OscillatorType = 'sawtooth', wet = 0.6) {
  const t = ch.c.currentTime + at, o = ch.c.createOscillator(), g = ch.c.createGain(), f = ch.c.createBiquadFilter();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  f.type = 'lowpass'; f.frequency.value = 2400; env(ch, g, t, dur * 0.6, vol, dur); o.connect(f); f.connect(g); out(ch, g, wet); o.start(t); o.stop(t + dur + 0.05);
}
/** electric crackle */
function crackle(ch: Ch, at: number, dur: number, vol = 0.4) {
  const t = ch.c.currentTime + at, n = noiseSrc(ch, dur), f = ch.c.createBiquadFilter(), g = ch.c.createGain();
  f.type = 'highpass'; f.frequency.value = 2200; g.gain.setValueAtTime(0, t);
  for (let i = 0; i < dur * 40; i++) g.gain.setValueAtTime(Math.random() < 0.45 ? vol * Math.random() : 0, t + i / 40);
  g.gain.setValueAtTime(0, t + dur); n.connect(f); f.connect(g); out(ch, g, 0.5); n.start(t);
}
/** fire roar: flickering low-passed noise */
function roar(ch: Ch, at: number, dur: number, vol = 0.45) {
  const t = ch.c.currentTime + at, n = noiseSrc(ch, dur), f = ch.c.createBiquadFilter(), g = ch.c.createGain();
  f.type = 'lowpass'; f.frequency.setValueAtTime(500, t); f.frequency.linearRampToValueAtTime(1600, t + dur * 0.3); f.frequency.exponentialRampToValueAtTime(300, t + dur);
  env(ch, g, t, dur * 0.2, vol, dur); n.connect(f); f.connect(g); out(ch, g, 0.5); n.start(t);
}

/** colour of the skill -> element */
export function element(sk: SkillDef): 'fire' | 'ice' | 'holy' | 'storm' | 'dark' | 'steel' {
  const c = sk.color ?? 0xffffff, r = c >> 16, g = (c >> 8) & 255, b = c & 255;
  if (sk.proj === 'dark') return 'dark';
  if (sk.fall === 'bolt' || /thunder|bolt|storm/.test(sk.id)) return 'storm';
  if (sk.fall === 'meteor' || sk.proj === 'fire' || /fire|flame|meteor/.test(sk.id) || (r > 200 && g < 170 && b < 120)) return 'fire';
  if (sk.kind === 'heal' || /holy|light|smite|heal/.test(sk.id) || (r > 220 && g > 200 && b < 170)) return 'holy';
  if (b > 200 && r < 190) return 'ice';
  if (r > 150 && b > 180 && g < 150) return 'dark';
  return 'steel';
}

/** play the sound for a skill cast (timed to match the visual effects in tdCombat.castSkill) */
export function playSkill(sk: SkillDef) {
  const ch = chain(); if (!ch) return;
  const el = element(sk), magic = sk.stat === 'matk';
  const accent = (at: number, big = false) => {
    if (el === 'fire') roar(ch, at, big ? 1.1 : 0.6, big ? 0.55 : 0.4);
    else if (el === 'ice') { crackle(ch, at, 0.25, 0.25); chord(ch, at, [1568, 2093, 2637], 0.9, 0.05); }
    else if (el === 'storm') { crackle(ch, at, big ? 0.6 : 0.3, 0.5); boom(ch, at + 0.02, 0.6, 0.8); }
    else if (el === 'holy') chord(ch, at, [523, 659, 784, 1046], 1.4, 0.07);
    else if (el === 'dark') { sweep(ch, at, 220, 70, 0.8, 0.14); chord(ch, at, [155, 233], 1.0, 0.06, 'sawtooth', 0.7); }
  };
  switch (sk.kind) {
    case 'strike': { const n = sk.count ?? 1; for (let i = 0; i < n; i++) { whoosh(ch, i * 0.16, 0.22, 900, 3800, 0.55); boom(ch, i * 0.16 + 0.12, 0.45, 0.6); } accent(0.1); break; }
    case 'spin': { const n = sk.count ?? 2; sweep(ch, 0, 200, 600, 0.35 * n, 0.08); for (let i = 0; i < n; i++) whoosh(ch, i * 0.2, 0.3, 600, 3000, 0.5); accent(0.05); break; }
    case 'dash': whoosh(ch, 0, 0.35, 400, 4200, 0.7, 0.4); boom(ch, 0.25, 0.7, 0.8); accent(0.25); break;
    case 'leap': whoosh(ch, 0, 0.33, 300, 2400, 0.5); sweep(ch, 0, 150, 500, 0.33, 0.08); boom(ch, 0.33, 1.0, 1.4); crackle(ch, 0.36, 0.25, 0.25); accent(0.33, true); break;
    case 'shot': case 'pierce': {
      const n = sk.count ?? 1;
      for (let i = 0; i < Math.min(n, 4); i++) {
        if (magic) { sweep(ch, i * 0.07, 380, 1400, 0.25, 0.12, 'square'); accent(i * 0.07 + 0.15); }
        else { sweep(ch, i * 0.07, 900, 240, 0.12, 0.12, 'triangle', 0.2); whoosh(ch, i * 0.07, 0.3, 5000, 1500, 0.35, 0.2); }
      }
      if (sk.kind === 'pierce') whoosh(ch, 0.05, 0.5, 2500, 300, 0.4);
      break;
    }
    case 'rain': {
      const f = sk.fall ?? 'arrow', n = sk.count ?? 6;
      if (f === 'meteor') { roar(ch, 0, 1.4, 0.4); sweep(ch, 0, 700, 90, 0.55, 0.12); for (let i = 0; i < Math.min(n, 5); i++) boom(ch, 0.5 + i * 0.12, 0.9, 1.3); }
      else if (f === 'bolt') { for (let i = 0; i < Math.min(n, 5); i++) { crackle(ch, i * 0.13, 0.25, 0.55); boom(ch, i * 0.13 + 0.03, 0.55, 0.8); } }
      else if (f === 'blade') { for (let i = 0; i < Math.min(n, 6); i++) { whoosh(ch, i * 0.1, 0.25, 4000, 900, 0.35); chord(ch, i * 0.1 + 0.2, [2093 + i * 120], 0.4, 0.04, 'triangle'); } }
      else { for (let i = 0; i < Math.min(n, 8); i++) whoosh(ch, i * 0.07, 0.35, 5200, 1200, 0.25, 0.25); }
      break;
    }
    case 'nova': sweep(ch, 0, 180, 900, 0.3, 0.1); whoosh(ch, 0, 0.3, 300, 2000, 0.3); boom(ch, 0.3, 1.0, 1.5); accent(0.3, true); break;
    case 'buff': sweep(ch, 0, 220, 880, 0.5, 0.1); chord(ch, 0.35, [392, 494, 587, 784], 1.2, 0.07, 'triangle'); break;
    case 'heal': chord(ch, 0, [523, 659, 784, 1046, 1318], 1.6, 0.07); whoosh(ch, 0, 0.8, 800, 4000, 0.15, 0.8); break;
    case 'shield': sweep(ch, 0, 110, 220, 0.6, 0.14, 'sawtooth'); chord(ch, 0.3, [330, 415, 494], 1.3, 0.07, 'triangle'); boom(ch, 0.05, 0.35, 0.6); break;
  }
}
