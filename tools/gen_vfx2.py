"""Animated effects from PixelLab's VFX artist (POST /vfx, 'lite' = about half a cent each).
Each result is a spritesheet + JSON (frames, durations, anchor); the game loads them as atlases (src/world/fx2.ts).
With `sprite` the effect is made around one of our objects (brazier fire sits in the bowl, the fountain sprays from its spout)
and the object is part of every frame.
python3 -I tools/gen_vfx2.py [key ...]   -> art-source/pixellab/vfx2/<key>.png/.json/.gif, copied to src/assets/td/fx/
The files come from api.pixellab.ai/mcp/... links (no auth); urllib is refused there, so they are fetched with curl.
"""
import os, sys, json, time, base64, shutil, subprocess, concurrent.futures as cf
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pixellab_api as P

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'art-source', 'pixellab', 'vfx2'); os.makedirs(OUT, exist_ok=True)
GAME = os.path.join(ROOT, 'src', 'assets', 'td', 'fx'); os.makedirs(GAME, exist_ok=True)
G = os.path.join(ROOT, 'art-source', 'pixellab', 'guild')
STYLE = ' Pixel art for a muted, dark-forest fantasy game seen from the front and above; keep it readable at small size.'
JOBS = [   # key, description, sprite to build around (or None)
    ('fx_brazier', 'a small looping fire burning in the iron bowl of this brazier: orange and yellow flames flickering upward with a few rising embers, seamless loop, about 1 second', 'dc_brazier'),
    ('fx_fountain', 'water spouting from the top of this stone fountain and splashing down into the basin, soft white-blue droplets and ripples, seamless loop, about 1.5 seconds', 'dc_fountain'),
    ('fx_cannon', 'this cannon fires once: a bright muzzle flash at the round muzzle facing the viewer, a puff of grey smoke drifting up, the cannon jolts back slightly, about 0.8 seconds, no loop', 'def_cannon'),
    ('fx_shield', 'a faint protective magic dome of pale blue light shimmering over a village, hexagon pattern glinting now and then, seamless loop, 2 seconds, mostly transparent', None),
    ('fx_boom', 'a building hit by a heavy blow: a burst of wood splinters, stones and brown dust exploding outward and settling, about 0.7 seconds, no loop', None),
    ('fx_collapse', 'a building collapses: a big rolling cloud of grey dust and smoke rising and spreading, with falling debris, about 1.2 seconds, no loop', None),
    ('fx_coins', 'a burst of shiny gold coins popping up and sparkling, then fading, about 0.8 seconds, no loop', None),
    ('fx_build', 'construction work: small puffs of sawdust and little sparks of hammer hits popping up here and there, seamless loop, 1.5 seconds', None),
    # map gates
    ('fx_portal', 'a magic dimension gate standing on the ground: an upright oval swirl of glowing cyan and violet energy spinning inward, sparkles orbiting it, light spilling on the ground, seamless loop, 1.5 seconds', None),
    # hero normal hits (played on the monster that is hit)
    ('fx_hit_sword', 'a sword hit: a sharp white crescent slash flash across the target with a few bright sparks, very fast, 0.35 seconds, no loop', None),
    ('fx_hit_arrow', 'an arrow hit: a small burst of wood splinters and yellow-white sparks where an arrow strikes, very fast, 0.35 seconds, no loop', None),
    ('fx_hit_magic', 'a magic bolt hit: a small burst of violet and cyan arcane energy with tiny runes scattering, 0.4 seconds, no loop', None),
    ('fx_hit_holy', 'a holy hammer hit: a golden flash with a short cross-shaped burst of light and small golden sparks, 0.4 seconds, no loop', None),
    ('fx_hit_punch', 'a small punch hit: a little white impact star and a puff of dust, very fast, 0.3 seconds, no loop', None),
    ('fx_hit_crit', 'a critical hit: a big bright yellow-white star burst with sharp rays and sparks flying out, 0.45 seconds, no loop', None),
    # boss attacks (hit = lands on the hero, special = big ground attack)
    ('fx_bs1_hit', 'a rotten tree monster lashes with a root: dark green sap and splinters burst, with a puff of sickly green spores, 0.5 seconds, no loop', None),
    ('fx_bs1_special', 'thorny dark roots burst up out of the ground in a ring, green poison spores puff out, then the roots sink back, 1 second, no loop, seen from the front and above', None),
    ('fx_bs2_hit', 'a ghostly skeleton stag strikes with its antlers: pale blue spectral fire bursts with bone shards, 0.5 seconds, no loop', None),
    ('fx_bs2_special', 'a ring of pale blue ghost fire spreads across the ground with wailing wisps rising, 1 second, no loop, seen from the front and above', None),
    ('fx_bs3_hit', 'an obsidian serpent bites: a burst of orange lava and black glass shards, 0.5 seconds, no loop', None),
    ('fx_bs3_special', 'lava erupts from the ground: a fiery explosion with molten rock chunks and black smoke, 1 second, no loop, seen from the front and above', None),
    ('fx_bs4_hit', 'a frost giant punch: a burst of ice shards and white frost mist, 0.5 seconds, no loop', None),
    ('fx_bs4_special', 'a frost giant slams the ground: a ring of sharp ice spikes shoots up and shatters, cold mist rolls out, 1 second, no loop, seen from the front and above', None),
    ('fx_bs5_hit', 'a cursed skeleton king strikes: a burst of dark purple curse energy with small skull-shaped wisps, 0.5 seconds, no loop', None),
    # big moments (pro artist for the three showpieces)
    ('fx_levelup', 'PRO a triumphant level up: a column of golden light bursts up around a hero standing in the middle, a ring of light expands on the ground, golden sparks and small stars spiral upward and fade, 1.4 seconds, no loop, leave the middle clear for the character', None),
    ('fx_transform', 'PRO a class transformation: swirling ribbons of white and gold magic wrap around a standing hero, rise into a bright vertical flash, then burst into a shockwave ring and falling glitter, 1.6 seconds, no loop, leave the middle clear for the character', None),
    ('fx_boss_death', 'PRO a huge boss dies: a blinding white-orange explosion, a shockwave ring across the ground, then a tall plume of dark smoke and drifting embers with a ghostly soul rising out of it, 1.6 seconds, no loop', None),
    ('fx_drop_epic', 'a pillar of soft violet light rising from the ground where a rare item lies, gentle sparkles drifting up, seamless loop, 1.2 seconds', None),
    ('fx_drop_legend', 'a tall pillar of golden light rising from the ground where a legendary item lies, golden sparkles and a slowly turning ring of light on the ground, seamless loop, 1.2 seconds', None),
    ('fx_drop_sl', 'a tall blazing pillar of crimson and rainbow light where the rarest item lies, crackling sparks and a pulsing ring on the ground, seamless loop, 1.2 seconds', None),
    ('fx_golden_spawn', 'a golden monster appears: a burst of gold coins and golden light with a bright ring expanding on the ground, 0.8 seconds, no loop', None),
    ('fx_mon_death', 'a small monster dies: a puff of pale smoke with a tiny glowing soul wisp floating up and fading, 0.7 seconds, no loop', None),
    ('fx_recall', 'a teleport home: a column of blue-white light swirls up from a magic circle on the ground and shoots into the sky, 1 second, no loop, leave the middle clear for the character', None),
    ('fx_heal', 'a healing spell on a character: green and white light rises from the ground with leaves and plus-shaped sparkles floating up, 1 second, no loop, leave the middle clear for the character', None),
    ('fx_buff', 'a power-up aura: red-orange flames of energy flare up around a character and settle into a glowing outline, 1 second, no loop, leave the middle clear for the character', None),
    ('fx_shield_up', 'a protective barrier forms around a character: a golden hexagon shield bubble flashes into place, 0.8 seconds, no loop', None),
    ('fx_upgrade_ok', 'an upgrade succeeds: a bright blue-white star flash with radiating sparks and a rising sparkle, 0.8 seconds, no loop', None),
    ('fx_upgrade_fail', 'an upgrade fails: a dark grey puff of smoke with a few dim red sparks falling, 0.7 seconds, no loop', None),
    ('fx_chop', 'chopping wood: wood chips and splinters fly out from an axe hit, 0.4 seconds, no loop', None),
    ('fx_mine', 'mining rock: stone chips and bright yellow sparks fly out from a pickaxe hit, 0.4 seconds, no loop', None),
    ('fx_ore_rare', 'a rare gem is found: a burst of rainbow sparkles and a bright twinkling star, 0.9 seconds, no loop', None),
    ('fx_quest', 'a quest is complete: a golden scroll-shaped burst of light with confetti-like golden sparks, 1 second, no loop', None),
    ('fx_ult_sword', 'a holy judgment: a giant golden sword of light slams down from the sky into the ground, a cross-shaped burst of light and a shockwave ring, 1.2 seconds, no loop', None),
    ('fx_ult_bow', 'an emerald arrow storm hits: dozens of glowing green arrows rain down into one spot and burst into emerald light and leaves, 1 second, no loop', None),
    ('fx_ult_mage', 'a blood meteor impact: a crimson flaming meteor crashes into the ground and explodes into red fire and black smoke, 1.1 seconds, no loop', None),
    ('fx_ult_tank', 'a titan ground smash: the ground cracks in a big ring, rocks fly up and an orange shockwave spreads out, 1 second, no loop', None),
    ('fx_boss_spawn', 'PRO a boss arrives: a dark red magic circle tears open on the ground, black-red lightning crackles and a pillar of dark energy erupts, then settles into swirling smoke, 1.5 seconds, no loop, leave the middle clear for the monster', None),
    ('fx_elite_aura', 'a golden aura around a monster: golden flames flicker gently upward with tiny sparkles, seamless loop, 1 second, mostly transparent, leave the middle clear', None),
    # skills of every class (one designed effect each, same palette per class line; tools/gen_vfx2.py SK placement in tdCombat SK_FX)
    ('fx_sk_v_bash', 'a quick wooden sword whack: a short pale-tan crescent swoosh and a small puff of dust, 0.7 seconds, no loop', None),
    ('fx_sk_s2_cleave', 'a heavy downward sword cleave: one thick pale steel-blue crescent arc slamming down with rock chips, 0.7 seconds, no loop', None),
    ('fx_sk_s2_whirl', 'a whirlwind sword spin: two pale steel-blue circular slash rings sweeping around the middle, 0.7 seconds, no loop, leave the middle clear for the character', None),
    ('fx_sk_s2_guard', 'a guard stance: a steel-blue shield sigil flashes in front of the middle and settles into a faint glow, 0.7 seconds, no loop, leave the middle clear for the character', None),
    ('fx_sk_s3_charge', 'a charging thrust: a golden spear-like streak of light with speed lines and a burst at the tip, 0.7 seconds, no loop', None),
    ('fx_sk_s3_crusade', 'a knight double cross slash: two golden crossed slash arcs forming an X with sparks, 0.7 seconds, no loop', None),
    ('fx_sk_s3_valor', 'a knight war cry: golden-orange flames of courage flare up around the middle and fade, 0.7 seconds, no loop, leave the middle clear for the character', None),
    ('fx_sk_s4_blades', 'a holy blade storm: four pale-blue swords of light spin in a ring around the middle with glinting trails, 0.7 seconds, no loop, leave the middle clear for the character', None),
    ('fx_sk_s4_aegis', 'a golden aegis: a large golden shield of light with a crest forms around the middle and pulses, 0.7 seconds, no loop, leave the middle clear for the character', None),
    ('fx_sk_a2_double', 'two arrows hit in quick succession: two small green-white impact bursts with leaf flecks, 0.7 seconds, no loop', None),
    ('fx_sk_a2_fan', 'an arrow volley impact: a small spray of green-white sparks and splinters, 0.7 seconds, no loop', None),
    ('fx_sk_a2_focus', 'a hunter focus: soft green leaves swirl upward around the middle with a calm glow, 0.7 seconds, no loop, leave the middle clear for the character', None),
    ('fx_sk_a3_pierce', 'a piercing arrow hit: a sharp lime-green streak bursts through with a ring of wind, 0.7 seconds, no loop', None),
    ('fx_sk_a3_rain', 'an arrow from the sky strikes the ground: a small burst of dirt and green sparks, 0.7 seconds, no loop', None),
    ('fx_sk_a3_trap', 'a vine trap erupts: thorny green vines burst out of the ground in a circle and lash outward, 0.7 seconds, no loop, leave the middle clear for the character', None),
    ('fx_sk_a4_spirit', 'a forest spirit arrow hit: a glowing emerald stag-shaped burst of light with leaves, 0.7 seconds, no loop', None),
    ('fx_sk_a4_wind', 'a king of winds buff: a swirling green-white wind spiral rises around the middle, 0.7 seconds, no loop, leave the middle clear for the character', None),
    ('fx_sk_m2_bolt', 'an ice bolt hit: a burst of pale blue ice shards and frost mist, 0.7 seconds, no loop', None),
    ('fx_sk_m2_fire', 'a fireball hit: a round orange-red fire explosion with embers, 0.7 seconds, no loop', None),
    ('fx_sk_m2_heal', 'a healing light: soft green and white sparkles rise from a glowing circle under the middle, 0.7 seconds, no loop, leave the middle clear for the character', None),
    ('fx_sk_m3_chain', 'a chain lightning strike: a jagged blue-white lightning bolt hits from above with crackling sparks, 0.7 seconds, no loop', None),
    ('fx_sk_m3_arcane', 'a starburst of arcane magic: a violet magic circle flashes and a ring of star-shaped light bursts outward, 0.7 seconds, no loop, leave the middle clear for the character', None),
    ('fx_sk_m3_volley', 'a magic missile hit: a small violet energy burst with tiny stars, 0.7 seconds, no loop', None),
    ('fx_sk_m4_void', 'a void spear hit: a dark crimson-black energy spear pierces and bursts into dark shards, 0.7 seconds, no loop', None),
    ('fx_sk_m4_dread', 'a wave of dread: a dark crimson shockwave ring with shadowy wisps spreads out from the middle, 0.7 seconds, no loop, leave the middle clear for the character', None),
    ('fx_sk_t2_slam', 'a shield bash: a thick silver-grey impact shockwave with dust in front, 0.7 seconds, no loop', None),
    ('fx_sk_t2_wall', 'an iron wall stance: grey-blue steel plates of light lock together around the middle, 0.7 seconds, no loop, leave the middle clear for the character', None),
    ('fx_sk_t2_recover', 'a recovery: warm green-gold light rises gently around the middle, 0.7 seconds, no loop, leave the middle clear for the character', None),
    ('fx_sk_t3_quake', 'an earthquake hammer slam: the ground cracks in a ring with brown dust and flying stones, 0.7 seconds, no loop, leave the middle clear for the character', None),
    ('fx_sk_t3_ram', 'a steel charge impact: a grey-silver burst with dust and speed lines, 0.7 seconds, no loop', None),
    ('fx_sk_t3_bulwark', 'a bulwark shield: a large pale-blue hexagon barrier forms around the middle, 0.7 seconds, no loop, leave the middle clear for the character', None),
    ('fx_sk_t4_fortress', 'a fortress stance: golden-orange stone-like armor of light builds up around the middle with a glow, 0.7 seconds, no loop, leave the middle clear for the character', None),
    ('fx_sk_t4_lion', 'a lion roar hammer spin: three orange-gold circular hammer shockwaves sweep around the middle with a roaring lion-shaped aura, 0.7 seconds, no loop, leave the middle clear for the character', None),
    ('fx_raid_victory', 'a victory celebration: golden stars burst up and explode like fireworks with streamers of light, 1.4 seconds, no loop', None),
    # ground auras (circles on the floor under the hero, monsters and bosses — seen from the front and above, so a flat ellipse)
    ('fx_ring_hero', 'a soft magic circle glowing flat on the ground under a hero, seen from above at an angle so it is a wide flat ellipse: a thin ring of pale gold and cyan light with small runes slowly turning and a few tiny motes drifting up, subtle, seamless loop, 2 seconds, empty middle', None),
    ('fx_ring_mon', 'a thin dim red ring glowing flat on the ground under a monster, seen from above at an angle so it is a wide flat ellipse, faint dark red light slowly pulsing, subtle, seamless loop, 1.5 seconds, empty middle', None),
    ('fx_boss_aura', 'PRO a menacing boss aura on the ground: a large dark crimson and violet magic circle with jagged runes slowly rotating, seen from above at an angle so it is a wide flat ellipse, dark red energy flames and black smoke wisps rising from its edge, glowing cracks, seamless loop, 2 seconds, empty middle for the boss to stand in', None),
    # burning buildings (guild village raids): fire on a damaged building, smoke, small flames left in the ruins
    ('fx_bld_fire', 'a building on fire: several tall tongues of orange and yellow flame licking upward from a wide base, sparks and embers flying up, dark red glow at the bottom, seamless loop, 1 second, no ground, no building', None),
    ('fx_smoke', 'a column of thick dark grey smoke rising and billowing slowly upward from a fire, puffs drifting and fading at the top, seamless loop, 2 seconds', None),
    ('fx_ruin_fire', 'small low flames flickering among burnt rubble: three or four little orange fires spread out on the ground with glowing embers and thin wisps of smoke, seamless loop, 1 second, no rubble drawn, just the fires', None),
    # VIP aura (director: a blazing energy aura wrapped around the hero while walking the maps)
    ('fx_aura_gold', 'a fierce blazing energy aura wrapped around a standing hero: tall spiky golden-yellow flames of power rise from the feet and surround the whole body outline from head to toe, flickering upward, with tiny white electric sparks and light motes rising, bright at the edges, seamless loop, 0.8 seconds, leave the middle clear for the character, transparent background', None),
    ('fx_aura_void', 'a fierce blazing energy aura wrapped around a standing hero: tall spiky deep violet and magenta flames of dark power rise from the feet and surround the whole body outline from head to toe, flickering upward, with small purple lightning crackles and dark motes rising, seamless loop, 0.8 seconds, leave the middle clear for the character, transparent background', None),
    ('fx_bs5_special', 'a dark curse explodes on the ground: a purple-black magic circle flares, then a pillar of dark violet flame bursts up, 1 second, no loop, seen from the front and above', None),
]


def one(key, desc, sprite):
    if os.path.exists(os.path.join(OUT, key + '.json')): return key, 'exists'
    pro = desc.startswith('PRO ')
    body = {'description': desc[4:] + STYLE if pro else desc + STYLE, 'artist': 'pro' if pro else 'lite', 'name': key}
    if sprite: body['sprite'] = {'type': 'base64', 'base64': base64.b64encode(open(os.path.join(G, sprite + '.png'), 'rb').read()).decode()}
    try:
        r = P.call('POST', '/vfx', body); jid = r['background_job_id']
        for _ in range(60):
            j = P.call('GET', f'/background-jobs/{jid}')
            if j.get('status') in ('completed', 'failed'): break
            time.sleep(8)
        if j.get('status') != 'completed': return key, f"job {j.get('status')}"
        files = j['last_response']['files']
        for name, url in files.items():
            ext = name[name.rfind('.'):]
            if name.endswith('-normals.png'): continue
            subprocess.run(['curl', '-sSf', '-o', os.path.join(OUT, key + ext), url], check=True)
        lr = j['last_response']
        return key, f"{lr.get('frames')}f {lr.get('fps')}fps loop={lr.get('loop')} {lr.get('canvas')}"
    except Exception as e:
        return key, f'err {e!r}'


def copy_to_game():
    for f in os.listdir(OUT):
        if f.endswith('.png') or f.endswith('.json'): shutil.copyfile(os.path.join(OUT, f), os.path.join(GAME, f))


if __name__ == '__main__':
    only = set(sys.argv[1:])
    jobs = [j for j in JOBS if not only or j[0] in only]
    b0 = P.call('GET', '/balance')['credits']['usd']
    with cf.ThreadPoolExecutor(3) as ex:
        for r in ex.map(lambda j: one(*j), jobs): print(*r, flush=True)
    copy_to_game()
    b1 = P.call('GET', '/balance')['credits']['usd']
    print(f'BALANCE ${b0:.3f} -> ${b1:.3f} (used ${b0 - b1:.3f})', flush=True)
