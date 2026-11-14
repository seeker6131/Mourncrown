"""Render the game's impact sounds (director: mining sounded like banging a tin sheet). Physically inspired, short and
dry like pixel-RPG sounds: rock 'tock' + grit for the pickaxe, a meaty thump for weapon hits, a dull body hit when the
hero is struck, a soft magic swell before spells. Writes src/assets/sfx/g_*.ogg (CC0, made here).
python3 tools/gen_sfx.py"""
import os, subprocess, numpy as np
from scipy.signal import butter, sosfilt

SR = 44100
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'src', 'assets', 'sfx'); WAV = os.path.join(ROOT, 'art-source', 'audio', 'gen')
rng = np.random.default_rng(7)

def t(d): return np.arange(int(SR * d)) / SR
def bp(x, lo, hi, o=2): return sosfilt(butter(o, [lo, hi], 'bandpass', fs=SR, output='sos'), x)
def lp(x, f, o=2): return sosfilt(butter(o, f, 'lowpass', fs=SR, output='sos'), x)
def hp(x, f, o=2): return sosfilt(butter(o, f, 'highpass', fs=SR, output='sos'), x)
def noise(d): return rng.uniform(-1, 1, int(SR * d))
def dec(d, tau, a=0.0005): tt = t(d); return np.minimum(1, tt / a) * np.exp(-tt / tau)   # quick attack, exponential decay
def place(buf, x, at): i = int(at * SR); n = min(len(x), len(buf) - i); buf[i:i + n] += x[:n]; return buf
def sine(d, f0, f1=None, tau=0.05):
    tt = t(d); f = f0 if f1 is None else f1 + (f0 - f1) * np.exp(-tt / (tau * 0.6))
    return np.sin(2 * np.pi * np.cumsum(np.full_like(tt, 1.0) * f) / SR + rng.uniform(0, 6.28)) * dec(d, tau)
def norm(x, peak=0.9): x = x - np.mean(x); return x / (np.max(np.abs(x)) + 1e-9) * peak
def fade(x, ms=8): n = int(SR * ms / 1000); x[-n:] *= np.linspace(1, 0, n); return x

def mine(v):
    d = 0.42; b = np.zeros(int(SR * d)); j = lambda: 1 + rng.uniform(-0.08, 0.08)
    place(b, bp(noise(0.002), 2000, 6000) * 0.35, 0)                              # the pick's point bites
    for f, tau, a in [(1150, 0.020, 0.32), (1750, 0.016, 0.30), (2450, 0.012, 0.22), (3300, 0.009, 0.14)]:
        place(b, sine(0.08, f * j(), tau=tau) * a, 0.0005)                        # the rock 'tock' (dies fast: stone, not metal)
    place(b, sine(0.06, 4200 * j(), tau=0.010) * 0.05, 0.001)                     # a faint touch of steel
    place(b, bp(noise(0.12), 700, 3200) * dec(0.12, 0.03) * 0.6, 0)              # crack
    place(b, sine(0.14, 200 * j(), 85, tau=0.045) * 0.75, 0)                      # weight of the swing
    for k in range(rng.integers(6, 11)):                                          # chips and grit falling
        g = rng.uniform(0.002, 0.007); at = 0.03 + rng.uniform(0, 0.25) ** 1.4
        place(b, bp(noise(g), 1200, 4500) * dec(g, g / 3) * rng.uniform(0.04, 0.16) * (1 - at), at)
    return fade(norm(b, 0.85))

def hit(v, heavy=False):
    d = 0.32 if heavy else 0.24; b = np.zeros(int(SR * d)); j = lambda: 1 + rng.uniform(-0.1, 0.1)
    place(b, sine(0.2, (120 if heavy else 150) * j(), 48, tau=0.07 if heavy else 0.05) * 0.9, 0)   # thump
    place(b, lp(noise(0.12), 900) * dec(0.12, 0.045) * 0.7, 0)                                  # meat
    place(b, bp(noise(0.03), 2200, 7000) * dec(0.03, 0.008) * 0.35, 0)                         # the blade's slap
    if heavy:
        place(b, bp(noise(0.05), 1800, 5000) * dec(0.05, 0.012) * 0.35, 0.004)                  # crack
        place(b, sine(0.3, 70, 40, tau=0.12) * 0.6, 0)                                          # boom
    return fade(norm(b, 0.9 if heavy else 0.8))

def hurt(v):
    d = 0.26; b = np.zeros(int(SR * d)); j = 1 + rng.uniform(-0.1, 0.1)
    place(b, sine(0.22, 160 * j, 70, tau=0.06) * 0.9, 0)
    place(b, lp(noise(0.14), 650) * dec(0.14, 0.05) * 0.8, 0)
    place(b, bp(noise(0.04), 900, 2400) * dec(0.04, 0.01) * 0.25, 0)
    return fade(norm(b, 0.75))

def spell(v):
    d = 0.55; tt = t(d); b = np.zeros(int(SR * d))
    sw = bp(noise(d), 600, 5000) * np.sin(np.pi * np.minimum(1, tt / d)) ** 2 * 0.35                # air drawn in
    b += sw
    for f in (784, 1175, 1568):                                                                     # a soft shimmer
        b += np.sin(2 * np.pi * f * (1 + rng.uniform(-0.003, 0.003)) * tt) * np.exp(-((tt - 0.3) / 0.14) ** 2) * 0.12
    return fade(norm(b, 0.6), 30)

def write(name, x):
    w = os.path.join(WAV, name + '.wav'); o = os.path.join(OUT, name + '.ogg')
    pcm = (np.clip(x, -1, 1) * 32767).astype('<i2')
    import wave
    with wave.open(w, 'wb') as f: f.setnchannels(1); f.setsampwidth(2); f.setframerate(SR); f.writeframes(pcm.tobytes())
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', w, '-c:a', 'libvorbis', '-q:a', '4', o], check=True)
    print(name, f'{len(x) / SR:.2f}s', os.path.getsize(o), 'bytes')

if __name__ == '__main__':
    os.makedirs(WAV, exist_ok=True)
    for i in range(1, 5): write(f'g_mine{i}', mine(i))
    for i in range(1, 4): write(f'g_hit{i}', hit(i))
    for i in range(1, 3): write(f'g_crit{i}', hit(i, True))
    for i in range(1, 3): write(f'g_hurt{i}', hurt(i))
    write('g_spell', spell(1))
