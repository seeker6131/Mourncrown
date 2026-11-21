"""Re-make boss bs3 (Obsidian Serpent) on a big canvas so the wings are not cut: character + walk & attack (S, E, N;
west is mirrored in the importer). State: art-source/pixellab/chars/state.json['bs3b'], zip -> chars/bs3b.zip"""
import os, sys, time, urllib.request, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pixellab_api as P
import gen_chars as G
DESC = ('huge serpent dragon made of black volcanic glass with glowing lava cracks, large bat-like wings with orange lava membranes '
        'held close and fully inside the frame, crown of jagged obsidian horns, long coiled tail, top-down pixel art, dark fantasy, soft shading')
ACT = {'walk': 'slithering forward slowly, wings slightly moving', 'attack': 'rearing up and striking forward with its jaws'}
st = G.STATE.setdefault('bs3b', {})
step = sys.argv[1]
if step == 'create':
    r = P.call('POST', '/create-character-v3', {'description': DESC, 'image_size': {'width': 176, 'height': 176}, 'view': 'low top-down',
                                               'outline': 'single color black outline', 'detail': 'high detail', 'name': 'bs3b'})
    st['cid'] = r['character_id']; G.save(); print('create', G.jwait(r['background_job_id'])['status'])
elif step == 'anim':
    anim, d = sys.argv[2], sys.argv[3]
    body = {'character_id': st['cid'], 'action_description': ACT[anim], 'animation_name': anim, 'mode': 'pixminimax', 'frame_count': 8, 'directions': [d]}
    if st.get(anim + '_g'): body['animation_group_id'] = st[anim + '_g']
    r = P.call('POST', '/characters/animations', body); st[anim + '_g'] = r.get('animation_group_id', st.get(anim + '_g')); G.save()
    print(anim, d, [G.jwait(j)['status'] for j in r['background_job_ids']])
elif step == 'zip':
    z = urllib.request.urlopen(urllib.request.Request(f'{P.API}/characters/{st["cid"]}/zip', headers=P.HDR), timeout=300).read()
    open(os.path.join(G.OUT, 'bs3b.zip'), 'wb').write(z); print('zip', len(z))
print('BAL', P.call('GET', '/balance')['subscription']['generations'])
