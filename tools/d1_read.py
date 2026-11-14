# READ-ONLY look at the live D1 database (SELECT only). Usage: python3 -I tools/d1_read.py "SELECT ..."  — the Cloudflare token is injected by the network proxy (never put it here)
import json, os, sys, urllib.request
cfg = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'server', 'cf.json')))
sql = sys.argv[1]
assert sql.strip().upper().startswith('SELECT'), 'read-only'
r = urllib.request.Request(f"https://api.cloudflare.com/client/v4/accounts/{cfg['account']}/d1/database/{cfg['db']}/query", data=json.dumps({'sql': sql}).encode(), headers={'content-type': 'application/json'})
d = json.load(urllib.request.urlopen(r, timeout=30))
for row in d['result'][0]['results']: print(json.dumps(row, ensure_ascii=False)[:600])
