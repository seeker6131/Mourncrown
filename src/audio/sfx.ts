// Sound effects via WebAudio: recorded Kenney samples with synthesised fallbacks. No background music.
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
export const audioState = { sfx: true, music: true };

function ac(): AudioContext | null {
  if (!ctx) {
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
    } catch { return null; }
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function unlockAudio() { if (ac()) loadSamples(); }
if (typeof document !== 'undefined') document.addEventListener('pointerdown', () => unlockAudio(), { once: true });

// ---- recorded sounds: Kenney "RPG Audio" (CC0, src/assets/sfx/KENNEY_LICENSE.txt) ----
// Loaded once after the first tap; every call picks a random variant with a slight pitch change so repeats don't sound robotic.
// If a file is not loaded yet the synthesised fallback plays instead.
const FILES = import.meta.glob('../assets/sfx/*.ogg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const bufs = new Map<string, AudioBuffer>();
let loading = false;
function loadSamples() {
  const c = ac(); if (!c || loading) return; loading = true;
  for (const [p, url] of Object.entries(FILES)) {
    const name = p.split('/').pop()!.replace('.ogg', '');
    fetch(url).then(r => r.arrayBuffer()).then(b => c.decodeAudioData(b)).then(buf => bufs.set(name, buf)).catch(() => undefined);
  }
}
function sample(names: string[], vol = 0.5, pitch = 0.06): boolean {
  const c = ac(); if (!c || !master) return false;
  const b = bufs.get(names[Math.floor(Math.random() * names.length)]); if (!b) return false;
  const src = c.createBufferSource(); src.buffer = b; src.playbackRate.value = 1 + (Math.random() * 2 - 1) * pitch;
  const g = c.createGain(); g.gain.value = vol; src.connect(g); g.connect(master); src.start();
  return true;
}
const STEPS = Array.from({ length: 10 }, (_, i) => 'footstep0' + i);

function tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.2, slide = 0, delay = 0, dest?: AudioNode) {
  const c = ac(); if (!c || !master) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator(); const g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(dest ?? master);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur: number, vol = 0.2, freq = 1000, delay = 0, q = 1) {
  const c = ac(); if (!c || !master) return;
  const t = c.currentTime + delay;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = c.createBufferSource(); s.buffer = buf;
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(t);
}

export const sfx = {
  swing() { if (!audioState.sfx) return; if (!sample(['knifeSlice', 'knifeSlice2'], 0.45)) noise(0.12, 0.25, 2400, 0, 0.7); },
  chop() { if (!audioState.sfx) return; if (!sample(['chop'], 0.6, 0.1)) noise(0.1, 0.3, 700); },
  mine() { if (!audioState.sfx) return; if (!sample(['metalPot1', 'metalPot2', 'metalPot3'], 0.4, 0.12)) noise(0.08, 0.3, 2500); },
  step() { if (!audioState.sfx) return; sample(STEPS, 0.18, 0.1); },
  equip() { if (!audioState.sfx) return; if (!sample(['beltHandle1', 'beltHandle2'], 0.55)) tone(500, 0.08, 'triangle', 0.12); },
  cloth() { if (!audioState.sfx) return; if (!sample(['cloth1', 'cloth2', 'cloth3'], 0.55)) noise(0.15, 0.2, 1200); },
  open() { if (!audioState.sfx) return; if (!sample(['bookOpen'], 0.45)) tone(1200, 0.04, 'square', 0.06); },
  close() { if (!audioState.sfx) return; sample(['bookClose'], 0.4); },
  page() { if (!audioState.sfx) return; if (!sample(['bookFlip1', 'bookFlip2', 'bookFlip3'], 0.45)) tone(1200, 0.04, 'square', 0.06); },
  door() { if (!audioState.sfx) return; sample(['doorOpen_1', 'doorOpen_2'], 0.5); },
  chest() { if (!audioState.sfx) return; sample(['creak1', 'creak2'], 0.55); sample(['metalLatch'], 0.5); },
  cast() { if (!audioState.sfx) return; sample(['drawKnife1', 'drawKnife2', 'drawKnife3'], 0.45); },
  hit() { if (!audioState.sfx) return; noise(0.08, 0.35, 900); tone(140, 0.1, 'square', 0.12, -60); },
  crit() { if (!audioState.sfx) return; noise(0.12, 0.4, 1400); tone(220, 0.15, 'sawtooth', 0.14, -120); tone(880, 0.08, 'square', 0.06, 0, 0.02); },
  hurt() { if (!audioState.sfx) return; tone(220, 0.18, 'sawtooth', 0.15, -140); },
  die() { if (!audioState.sfx) return; tone(300, 0.25, 'square', 0.12, -250); noise(0.25, 0.2, 500); },
  coin() { if (!audioState.sfx) return; if (!sample(['handleCoins', 'handleCoins2'], 0.5)) { tone(988, 0.07, 'square', 0.08); tone(1318, 0.12, 'square', 0.08, 0, 0.06); } },
  coinSoft() { if (!audioState.sfx) return; sample(['handleCoins', 'handleCoins2'], 0.18, 0.15); },
  pickup() { if (!audioState.sfx) return; if (!sample(['dropLeather', 'handleSmallLeather', 'handleSmallLeather2'], 0.5)) { tone(660, 0.06, 'triangle', 0.15); tone(990, 0.1, 'triangle', 0.15, 0, 0.05); } },
  potion() { if (!audioState.sfx) return; for (let i = 0; i < 4; i++) tone(400 + i * 120, 0.08, 'sine', 0.15, 80, i * 0.05); },
  levelUp() { if (!audioState.sfx) return; [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'square', 0.1, 0, i * 0.09)); tone(1318, 0.5, 'triangle', 0.12, 0, 0.36); },
  cyclone() { if (!audioState.sfx) return; noise(0.4, 0.3, 1800, 0, 0.5); tone(200, 0.35, 'sawtooth', 0.06, 400); },
  flame() { if (!audioState.sfx) return; noise(0.3, 0.25, 600, 0, 0.8); tone(180, 0.25, 'sawtooth', 0.08, -100); },
  boom() { if (!audioState.sfx) return; noise(0.45, 0.45, 300, 0, 0.6); tone(90, 0.4, 'sine', 0.3, -50); },
  thunder() { if (!audioState.sfx) return; noise(0.6, 0.5, 200, 0, 0.4); noise(0.15, 0.4, 3000); },
  heal() { if (!audioState.sfx) return; [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.25, 'sine', 0.1, 0, i * 0.07)); },
  click() { if (!audioState.sfx) return; if (!sample(['metalClick'], 0.35, 0.1)) tone(1200, 0.04, 'square', 0.06); },
  error() { if (!audioState.sfx) return; tone(160, 0.15, 'square', 0.1); },
  bossRoar() { if (!audioState.sfx) return; tone(80, 0.9, 'sawtooth', 0.25, -30); noise(0.9, 0.3, 250, 0, 0.5); },
  arrow() { if (!audioState.sfx) return; noise(0.1, 0.18, 3000); },
  magic() { if (!audioState.sfx) return; tone(600, 0.25, 'sine', 0.1, 600); },
  upgradeOk() { if (!audioState.sfx) return; tone(880, 0.1, 'square', 0.1); tone(1320, 0.3, 'square', 0.1, 0, 0.1); noise(0.1, 0.3, 4000); },
  upgradeFail() { if (!audioState.sfx) return; tone(300, 0.3, 'sawtooth', 0.12, -200); },
};

/** background music was removed (director); kept as a no-op so old saves / callers still work */
export function setMusic(on: boolean) { audioState.music = on; }
