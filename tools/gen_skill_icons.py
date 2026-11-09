"""One unique skill icon per skill (37), PixelLab map objects 64x64 -> art-source/pixellab/skills/<id>.png (1 gen each)."""
import os, sys, concurrent.futures as cf
sys.path.insert(0, os.path.dirname(__file__))
import pixellab_api as P
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'art-source', 'pixellab', 'skills')
ST = ', square skill icon for an RPG, pixel art, bold readable silhouette, dark vignette background filling the square, dramatic lighting'
ICONS = {
 'v_bash': 'a wooden training sword smacking down with a burst of dust and motion lines',
 's2_cleave': 'a heavy steel sword splitting a grey boulder in half with sparks',
 's2_whirl': 'a sword spinning in a circle leaving a white whirlwind trail',
 's2_guard': 'a raised steel round shield with a blue glow, defensive stance',
 's3_charge': 'a knight lance charging forward with orange speed streaks',
 's3_crusade': 'two crossing sword slashes forming a glowing white X',
 's3_valor': 'a red banner with a golden lion and rising orange aura',
 's4_judgment': 'a golden holy sword plunging down from the sky into a ring of light',
 's4_blades': 'many glowing golden spectral swords raining down',
 's4_aegis': 'a radiant golden kite shield with wings',
 'a2_double': 'two arrows flying side by side',
 'a2_fan': 'five arrows spreading out in a fan shape',
 'a2_focus': 'a hunter eye with a green crosshair reticle',
 'a3_pierce': 'one long arrow piercing straight through three red hearts in a line',
 'a3_rain': 'dozens of arrows falling diagonally from dark clouds',
 'a3_trap': 'thorny green vines bursting out of the ground in a circle',
 'a4_spirit': 'three glowing pale green spirit arrows with ghostly trails',
 'a4_storm': 'a storm of emerald green arrows swirling in a tornado',
 'a4_wind': 'a crowned eagle made of swirling wind',
 'm2_bolt': 'a sharp ice crystal shard flying with frost mist',
 'm2_fire': 'a blazing fireball exploding',
 'm2_heal': 'a pair of hands holding a soft green healing light with a leaf',
 'm3_chain': 'a jagged purple lightning bolt chaining between three points',
 'm3_arcane': 'a starburst explosion of blue arcane stars around a glowing core',
 'm3_volley': 'four small violet magic orbs flying in a row',
 'm4_meteor': 'a blood red meteor with a fiery tail crashing down',
 'm4_void': 'a black and purple void spear with a dark crackling tip',
 'm4_dread': 'a dark purple shockwave ring with a skull in the center',
 't2_slam': 'a big iron tower shield bashing forward with an impact burst',
 't2_wall': 'a wall of grey iron shields locked together',
 't2_recover': 'a red potion style heart with a bandage cross',
 't3_quake': 'a giant war hammer smashing the ground, cracks spreading',
 't3_ram': 'a charging ram skull helmet with brown dust streaks',
 't3_bulwark': 'a small stone fortress tower with a shield emblem',
 't4_titan': 'a huge stone fist punching down into the earth with rock debris',
 't4_fortress': 'a massive castle gate with glowing orange runes',
 't4_lion': 'a roaring golden lion head with sound waves',
}
def run(k):
    out = os.path.join(OUT, k + '.png')
    if os.path.exists(out): return k, 'skip'
    try: P.map_object(ICONS[k] + ST, 64, 64, out, 'side'); return k, 'ok'
    except Exception as e: return k, f'err {e}'
if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    with cf.ThreadPoolExecutor(3) as ex:
        for r in ex.map(run, sys.argv[1:] or list(ICONS)): print(*r, flush=True)
    print(P.call('GET', '/balance')['subscription'], flush=True)
