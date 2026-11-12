"""Create characters + animations via PixelLab API, then download each as ZIP into art-source/pixellab/chars/<key>.zip.
State is kept in art-source/pixellab/chars/state.json so the script can be re-run safely.
python3 -I tools/gen_chars.py [only_key ...]"""
import sys, os, json, time, urllib.request, concurrent.futures as cf
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pixellab_api as P
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'art-source', 'pixellab', 'chars'); os.makedirs(OUT, exist_ok=True)
SF = os.path.join(OUT, 'state.json')
STATE = json.load(open(SF)) if os.path.exists(SF) else {}
def save():
    """merge into the file key by key, so two tools running at the same time do not erase each other's entries"""
    cur = json.load(open(SF)) if os.path.exists(SF) else {}
    for k, v in STATE.items(): cur.setdefault(k, {}).update(v)
    json.dump(cur, open(SF, 'w'), indent=1)
PL = ', top-down pixel art, muted desaturated dark-forest colours, soft shading'
D8 = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west']
D4 = ['south', 'east', 'north', 'west']
HERO = 'young man with short messy brown hair, '
SPECS = [  # key, size, dirs, description, [(anim name, action)]
 ('hr1', 48, D8, HERO + 'blue tunic with leather shoulder guard, red headband, green scarf, steel short sword and small round shield', [('walk', 'walking'), ('attack', 'swinging the sword in a strong slash attack')]),
 ('hr2', 48, D8, HERO + 'in polished steel plate armour, blue tabard, red cape, closed knight helmet with red plume, longsword and kite shield', [('walk', 'walking'), ('attack', 'swinging the longsword in a strong slash attack')]),
 ('hr5', 48, D8, HERO + 'in layered green-brown leather armour, fur-lined hood, cloth mask over nose and mouth, carved longbow', [('walk', 'walking'), ('attack', 'drawing the bow and shooting an arrow forward')]),
 ('hr6', 48, D8, HERO + 'in emerald-and-gold elven armour, leaf-pattern cape, golden half mask, glowing bow of light', [('walk', 'walking'), ('attack', 'drawing the glowing bow and shooting a light arrow forward')]),
 ('hr7', 48, D8, HERO + 'in purple hooded robe with gold trim, potion pouches, wooden staff with a blue crystal', [('walk', 'walking'), ('attack', 'thrusting the staff forward and casting a glowing magic bolt')]),
 ('hr8', 48, D8, HERO + 'in long violet star-embroidered robe, tall pointed wizard hat, face veil, silver staff with orbiting crystal', [('walk', 'walking'), ('attack', 'thrusting the staff forward and casting a glowing magic bolt')]),
 ('hr10', 48, D8, HERO + 'in thick iron armour over chainmail, open-face iron helmet, huge rectangular tower shield, short heavy mace', [('walk', 'walking'), ('attack', 'smashing forward with the mace while holding the shield')]),
 ('hr11', 48, D8, HERO + 'in massive dark steel plate armour with spiked pauldrons, closed great-helm with glowing visor slit, spiked tower shield, war hammer', [('walk', 'walking'), ('attack', 'smashing forward with the war hammer while holding the shield')]),
 ('hr12', 48, D8, HERO + 'in colossal black-and-gold plate armour with glowing orange runes, horned helmet with iron face mask, castle-gate tower shield, glowing war hammer', [('walk', 'walking'), ('attack', 'smashing forward with the glowing war hammer while holding the shield')]),
 ('mo1', 32, D4, 'pulsing blob of black bog tar with a ring of tiny needle teeth on top and three pale staring eyes, dripping', [('walk', 'oozing forward'), ('attack', 'stretching up and lunging forward to bite')]),
 ('mo2', 48, D4, 'hunched rotting corpse-like fungus creature, sickly mushroom caps sprouting from its bony back, glowing spore-filled eye sockets', [('walk', 'shambling forward'), ('attack', 'swinging its long arms and coughing a cloud of spores')]),
 ('mo3', 48, D4, 'gaunt skinless wolf with exposed ribs, cracked bark-like hide, ember red eyes and a jaw too long for its skull', [('walk', 'prowling forward'), ('attack', 'lunging forward with a vicious bite')]),
 ('mo4', 48, D4, 'small wiry creature made of black thorny briars wearing a cracked carved wooden mask, holding a sharpened bone knife', [('walk', 'creeping forward'), ('attack', 'stabbing forward fast with the bone knife')]),
 ('mo5', 48, D4, 'giant moth with a pale skull-like face, tattered dusty wings glowing faintly like a lantern, long thin legs', [('walk', 'fluttering forward'), ('attack', 'diving forward with a flash of wing dust')]),
 ('mo6', 32, D4, 'hairless giant plague rat with a split lower jaw, pale sores and milky blind eyes', [('walk', 'scurrying forward'), ('attack', 'lunging forward with its split jaw')]),
 ('mo7', 48, D4, 'headless rusted suit of armour filled with twisting roots, green glow from the empty neck, cracked rusty greatsword', [('walk', 'marching forward'), ('attack', 'swinging the rusty greatsword in a heavy slash')]),
 ('mo8', 48, D4, 'skeletal archer with deer antlers growing from its skull, ragged hood, bow strung with sinew', [('walk', 'walking forward'), ('attack', 'drawing the bow and shooting an arrow')]),
 ('mo9', 48, D4, 'tall faceless ghost woman in a long tattered grey veil, very long thin fingers, floating above the ground', [('walk', 'floating forward'), ('attack', 'reaching forward fast with long clawed fingers')]),
 ('mo10', 48, D4, 'giant black spider whose whole body is a gaping mouth full of human-like teeth, eight bristly legs', [('walk', 'crawling forward'), ('attack', 'rearing up and snapping its giant mouth forward')]),
 ('mo11', 32, D4, 'small horned fiend with cracked obsidian skin, a mouth glowing with fire and smoking claws', [('walk', 'stalking forward'), ('attack', 'spitting a burst of fire forward')]),
 ('mo12', 64, D4, 'hulking colossus of cooled black slag bound in rusted chains, a glowing furnace heart in its open chest', [('walk', 'stomping forward'), ('attack', 'raising chained fists and smashing the ground')]),
 ('mo13', 48, D4, 'six-legged lizard with cooling lava plates on its back, glowing cracks and a long whip tail', [('walk', 'crawling forward'), ('attack', 'whipping its tail and spitting molten rock')]),
 ('mo14', 48, D4, 'lean wolf-like beast with icicle spines along its back, a frozen exposed jaw and cold blue eyes', [('walk', 'prowling forward'), ('attack', 'lunging forward with a freezing bite')]),
 ('mo15', 64, D4, 'hunched furred giant wearing a frozen skull mask, arms encased in jagged ice', [('walk', 'lumbering forward'), ('attack', 'swinging an ice-covered arm down')]),
 ('mo18', 48, D4, 'hulking undead prison jailer in a rusted iron mask, dragging heavy chains with a big iron key ring and a spiked flail', [('walk', 'trudging forward dragging its chains'), ('attack', 'swinging the spiked flail down hard')]),
 ('mo16', 48, D4, 'large dark forest stag with black branching antlers and scars', [('walk', 'walking'), ('attack', 'kicking backwards with the hind legs')]),
 ('mo17', 48, D4, 'huge scarred wild boar with broken tusks and bristly black mane', [('walk', 'trotting forward'), ('attack', 'charging forward with its tusks')]),
 ('bs1', 128, D4, 'colossal rotten tree woman with a hollow screaming face in the bark, root fingers dragging on the ground, cages of trapped glowing souls hanging from her branches', [('walk', 'dragging forward on roots'), ('attack', 'sweeping a huge root arm forward'), ('special', 'slamming her roots down so thorny roots burst from the ground'), ('die', 'splitting apart and collapsing like a dead tree')]),
 ('bs2', 128, D4, 'giant skeletal stag with candle-lit antlers dripping wax and a ribcage holding a cold blue flame', [('walk', 'walking'), ('attack', 'charging forward with its burning antlers'), ('special', 'rearing up and releasing a wave of blue ghost fire'), ('die', 'collapsing into bones as the blue flame goes out')]),
 ('bs3', 128, D4, 'huge wingless serpent dragon made of black volcanic glass with lava flowing through its cracks and a crown of jagged obsidian horns', [('walk', 'slithering forward'), ('attack', 'striking forward with its jaws'), ('special', 'breathing a stream of molten lava forward'), ('die', 'cracking and shattering as the lava cools')]),
 ('bs4', 128, D4, 'towering giant in frozen armour, face hidden under a crown of ice, carrying a huge frozen bell as a mace', [('walk', 'stomping forward'), ('attack', 'swinging the frozen bell mace down'), ('special', 'ringing the bell so ice spikes burst from the ground'), ('die', 'falling to its knees and shattering into ice')]),
 ('bs5', 128, D4, 'towering rotting king with four arms, a crown of rusted nails and a glowing purple hole where his face should be, holding two great swords', [('walk', 'walking forward'), ('attack', 'swinging two great swords in a wide slash'), ('special', 'raising the swords as purple ghost fire erupts around him'), ('die', 'crumbling into bones with the crown rolling away')]),
] + [(k, s, D4, d, [('walk', 'walking')]) for k, s, d in [
 ('np1', 48, 'old village elder with a long white beard, hooded grey-green robe and a gnarled staff'), ('np2', 48, 'plump travelling merchant with a big backpack, felt hat and coin pouch'),
 ('np3', 48, 'burly blacksmith with a leather apron, rolled sleeves and a hammer'), ('np4', 48, 'lumberjack in a plaid shirt with an axe over his shoulder'),
 ('np5', 48, 'miner with a helmet lamp and a pickaxe'), ('np6', 48, 'cook woman with a white apron and a wooden ladle'),
 ('np7', 48, 'tavern barmaid with braided hair carrying a mug'), ('np8', 48, 'village guard in a padded gambeson with a spear'),
 ('np9', 32, 'small village kid with messy hair and patched clothes'), ('np10', 48, 'blonde elf archer girl with a green hood and a longbow'),
 ('an1', 32, 'small tabby cat'), ('an2', 32, 'fluffy cream sheep'), ('an3', 48, 'brown and white cow'), ('an4', 32, 'pink farm pig'), ('an5', 32, 'white hen')]]

def jwait(jid, tries=200):
    for _ in range(tries):
        try: j = P.call('GET', f'/background-jobs/{jid}')
        except Exception: time.sleep(5); continue
        if j.get('status') in ('completed', 'failed'): return j
        time.sleep(5)
    return {'status': 'timeout'}

def run(spec):
    key, size, dirs, desc, anims = spec
    st = STATE.setdefault(key, {})
    try:
        if 'cid' not in st:
            r = P.call('POST', '/create-character-v3', {'description': desc + PL, 'image_size': {'width': size, 'height': size}, 'view': 'low top-down',
                                                        'outline': 'single color black outline', 'detail': 'high detail', 'name': key})
            st['cid'] = r['character_id']; save()
            j = jwait(r['background_job_id'])
            if j['status'] != 'completed': return key, 'create ' + j['status']
        for name, act in anims:
            if st.get(name) == 'done': continue
            r = P.call('POST', '/characters/animations', {'character_id': st['cid'], 'action_description': act, 'animation_name': name, 'mode': 'pixminimax',
                                                          'frame_count': 8, 'directions': dirs})
            res = [jwait(x)['status'] for x in r['background_job_ids']]
            st[name] = 'done' if all(x == 'completed' for x in res) else 'partial'; save()
        z = urllib.request.urlopen(urllib.request.Request(f'{P.API}/characters/{st["cid"]}/zip', headers=P.HDR), timeout=300).read()
        open(os.path.join(OUT, key + '.zip'), 'wb').write(z); st['zip'] = 1; save()
        return key, 'ok'
    except Exception as e:
        return key, f'err {e}'

if __name__ == '__main__':
    only = set(sys.argv[1:])
    pri = lambda k: (0 if k in ('mo1', 'mo3', 'mo2', 'mo4', 'mo5', 'mo16', 'mo17', 'bs1') else 1 if k.startswith('mo') else 2 if k.startswith('hr') else 3 if k.startswith('np') else 4)
    todo = sorted([s for s in SPECS if (not only or s[0] in only) and not STATE.get(s[0], {}).get('zip')], key=lambda s: pri(s[0]))
    with cf.ThreadPoolExecutor(4) as ex:
        for r in ex.map(run, todo): print(*r, flush=True)
    print(P.call('GET', '/balance')['subscription'])
