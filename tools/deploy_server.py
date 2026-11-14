"""Deploy the Mourncrown game server to Cloudflare (Workers + D1, free plan).
python3 -I tools/deploy_server.py            bundle server/worker.ts, make the D1 database if missing, apply server/schema.sql,
                                             upload the worker 'mourncrown' and turn on its workers.dev address
The API token is NOT here: the session's network proxy adds it to requests to api.cloudflare.com (never commit a token).
Never touches other workers on the account (e.g. 'pixeldeck-pay')."""
import json, os, subprocess, sys, urllib.request, urllib.error, uuid

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CFG = os.path.join(ROOT, 'server', 'cf.json')          # account id, database id, Google client id: not secrets
cfg = json.load(open(CFG))
ACC, NAME = cfg['account'], cfg['worker']
API = f'https://api.cloudflare.com/client/v4/accounts/{ACC}'
assert NAME.startswith('mourncrown'), 'only mourncrown* workers are ours'

def call(method, path, body=None, raw=None, ctype='application/json', ok_errors=()):
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(API + path, method=method, data=data, headers={'Content-Type': ctype, 'Authorization': 'Bearer proxy-injected'})
    try:
        with urllib.request.urlopen(req, timeout=120) as r: out = json.loads(r.read())
    except urllib.error.HTTPError as e:
        out = json.loads(e.read() or b'{}'); out.setdefault('success', False)
    if not out.get('success'):
        if any(e in str(out.get('errors')) for e in ok_errors): return None   # e.g. a column added by an earlier deploy
        sys.exit(f'{method} {path} failed: {out.get("errors")}')
    return out['result']

# 1. the database
if not cfg.get('db'):
    found = [d for d in call('GET', '/d1/database?name=' + cfg['dbName']) if d['name'] == cfg['dbName']]
    cfg['db'] = found[0]['uuid'] if found else call('POST', '/d1/database', {'name': cfg['dbName']})['uuid']
    json.dump(cfg, open(CFG, 'w'), indent=2); open(CFG, 'a').write('\n')
    print('database', cfg['dbName'], cfg['db'])
schema = '\n'.join(l.split('--')[0] for l in open(os.path.join(ROOT, 'server', 'schema.sql')).read().splitlines())   # comments out
for stmt in [s.strip() for s in schema.split(';') if s.strip()]:
    call('POST', f'/d1/database/{cfg["db"]}/query', {'sql': stmt}, ok_errors=('duplicate column name',))
print('schema applied')

# 2. the code
out = os.path.join(ROOT, 'server', '.build', 'worker.js'); os.makedirs(os.path.dirname(out), exist_ok=True)
subprocess.run([os.path.join(ROOT, 'node_modules', '.bin', 'esbuild'), os.path.join(ROOT, 'server', 'worker.ts'), '--bundle', '--format=esm',
                '--target=es2022', '--platform=neutral', '--minify', '--outfile=' + out], check=True)
code = open(out, 'rb').read()
meta = {'main_module': 'worker.js', 'compatibility_date': '2025-01-01', 'keep_bindings': ['secret_text', 'secret_key'],   # keep secrets the director adds in the dashboard (THUNDER_API_KEY)
        'bindings': [{'type': 'd1', 'name': 'DB', 'id': cfg['db']}, {'type': 'durable_object_namespace', 'name': 'ROOM', 'class_name': 'Room'}, {'type': 'durable_object_namespace', 'name': 'PLAYER', 'class_name': 'Player'}, {'type': 'durable_object_namespace', 'name': 'GUILD', 'class_name': 'Guild'}]
                    + ([{'type': 'plain_text', 'name': 'GOOGLE_CLIENT_ID', 'text': cfg['googleClientId']}] if cfg.get('googleClientId') else [])
                    + [{'type': 'plain_text', 'name': 'ADMINS', 'text': ','.join(cfg.get('admins', []))}]
                    + [{'type': 'plain_text', 'name': 'MAX_ONLINE', 'text': str(cfg.get('limits', {}).get('maxOnline', 0))}, {'type': 'plain_text', 'name': 'DAY_HOURS', 'text': str(cfg.get('limits', {}).get('dayHours', 0))}]}   # (the money cap: server/cf.json limits)
# Durable Object classes: each migration once (the tag applied last is kept in cf.json)
MIGRATIONS = [('v1', {'new_sqlite_classes': ['Room']}), ('v2', {'new_sqlite_classes': ['Player']}), ('v3', {'new_sqlite_classes': ['Guild']})]
done = cfg.get('migrationTag'); todo = MIGRATIONS[[t for t, _ in MIGRATIONS].index(done) + 1:] if done else MIGRATIONS
if todo:
    meta['migrations'] = {'old_tag': done, 'new_tag': todo[-1][0], 'steps': [m for _, m in todo]} if done else {'new_tag': todo[-1][0], 'steps': [m for _, m in todo]}
b = uuid.uuid4().hex
body = (f'--{b}\r\nContent-Disposition: form-data; name="metadata"; filename="metadata.json"\r\nContent-Type: application/json\r\n\r\n{json.dumps(meta)}\r\n'
        f'--{b}\r\nContent-Disposition: form-data; name="worker.js"; filename="worker.js"\r\nContent-Type: application/javascript+module\r\n\r\n').encode() + code + f'\r\n--{b}--\r\n'.encode()
call('PUT', f'/workers/scripts/{NAME}', raw=body, ctype=f'multipart/form-data; boundary={b}')
print('uploaded', NAME, len(code), 'bytes')
if todo:
    cfg['migrationTag'] = todo[-1][0]; json.dump(cfg, open(CFG, 'w'), indent=2); open(CFG, 'a').write('\n')

# 3. the public address  https://<worker>.<subdomain>.workers.dev
call('POST', f'/workers/scripts/{NAME}/subdomain', {'enabled': True, 'previews_enabled': False})
sub = call('GET', '/workers/subdomain')['subdomain']
print('live at', f'https://{NAME}.{sub}.workers.dev')
