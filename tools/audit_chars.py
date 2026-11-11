"""Look at characters the way the game anchors them: idle | walk f0 | walk f3 | attack f0 (| chop | mine), south + east,
all frames standing on the red line. A pose that is smaller, floats or misses its weapon shows up at once.
python3 -I tools/audit_chars.py <out.png> hr2,hr7,hr10   (reads src/assets/td)"""
import json, sys, os
from PIL import Image, ImageDraw
D=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),'src','assets','td'); man=json.load(open(D+'/chars.json')); out=sys.argv[1]; keys=sys.argv[2].split(',')
rows=[]
for k in keys:
    v=man[k]; idle=Image.open(f'{D}/{k}_idle.webp').convert('RGBA'); fs=v['idleFs']
    for dn in ('south','east'):
        i=v['dirs'].index(dn); cells=[('idle',idle.crop((i*fs,0,(i+1)*fs,fs)), v['idleFoot'])]
        for a in ('walk','attack','chop','mine'):
            if a in v['anims'] and dn in v['anims'][a]['dirs']:
                x=v['anims'][a]; sh=Image.open(f'{D}/{k}_{a}.webp').convert('RGBA'); r=x['dirs'].index(dn); F=x['fs']
                for f in ((0,3) if a=='walk' else (0,)): cells.append((f'{a}{f}', sh.crop((f*F,r*F,(f+1)*F,(r+1)*F)), x['foot']))
        rows.append((k+' '+dn, cells))
S=3; W=70; H=66; NC=max(len(c) for _,c in rows)
o=Image.new('RGBA',(W*S*NC+70, H*S*len(rows)),(46,40,52,255)); d=ImageDraw.Draw(o)
for r,(lab,cells) in enumerate(rows):
    d.text((W*S*NC+4, r*H*S+20), lab, fill='white'); base=r*H*S+H*S-14
    d.line((0,base,W*S*NC,base),fill=(150,60,60,255)); d.line((0,base-44*S,W*S*NC,base-44*S),fill=(60,90,60,255))
    for c,(n,im,foot) in enumerate(cells):
        im2=im.resize((im.width*S,im.height*S),Image.NEAREST)
        o.alpha_composite(im2,(c*W*S+W*S//2-im2.width//2, base-foot*S)); d.text((c*W*S+4,r*H*S+4),n,fill='yellow')
        d.line((c*W*S+W*S//2, r*H*S, c*W*S+W*S//2, r*H*S+H*S), fill=(70,70,110,255))
o=o.resize((o.width//2,o.height//2),Image.BILINEAR)
o.convert('RGB').save(out); print(o.size)
