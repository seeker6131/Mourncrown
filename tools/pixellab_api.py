"""Tiny PixelLab v2 client (token injected by the session proxy; never stored here).
python3 tools/pixellab_api.py object "<desc>" W H out.png [view]
python3 tools/pixellab_api.py balance"""
import json, sys, time, base64, urllib.request

API = 'https://api.pixellab.ai/v2'
HDR = {'Authorization': 'Bearer proxy-injected', 'Content-Type': 'application/json'}

def call(method, path, body=None, retries=12):
    import urllib.error
    for i in range(retries):
        req = urllib.request.Request(API + path, method=method, headers=HDR, data=json.dumps(body).encode() if body is not None else None)
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.loads(r.read() or b'{}')
        except urllib.error.HTTPError as e:
            if e.code == 429 and i < retries - 1: time.sleep(15 + i * 10); continue
            raise

def fetch(url):
    with urllib.request.urlopen(urllib.request.Request(url), timeout=120) as r: return r.read()

def wait(get_path, key=None, tries=120):
    import urllib.error
    for _ in range(tries):
        try: d = call('GET', get_path)
        except urllib.error.HTTPError as e:
            if e.code in (423, 404, 425): time.sleep(3); continue   # still processing
            raise
        st = (d.get('status') or d.get('data', {}).get('status') or '').lower()
        if st in ('completed', 'complete', 'succeeded', 'done', 'ready'): return d
        if st in ('failed', 'error'): raise RuntimeError(json.dumps(d)[:500])
        time.sleep(3)
    raise TimeoutError(get_path)

def save_any_image(d, out):
    """Find the first image in a response (base64 or URL) and save it."""
    def walk(x):
        if isinstance(x, dict):
            if x.get('type') == 'base64' and x.get('base64'): return ('b64', x['base64'])
            for k, v in x.items():
                if isinstance(v, str) and k in ('url', 'download_url', 'image_url') and v.startswith('http'): return ('url', v)
                r = walk(v)
                if r: return r
        if isinstance(x, list):
            for v in x:
                r = walk(v)
                if r: return r
    r = walk(d)
    if not r: raise RuntimeError('no image in ' + json.dumps(d)[:600])
    data = base64.b64decode(r[1].split(',')[-1]) if r[0] == 'b64' else fetch(r[1])
    open(out, 'wb').write(data)

def map_object(desc, w, h, out, view='low top-down', **kw):
    body = {'description': desc, 'image_size': {'width': w, 'height': h}, 'view': view, 'outline': 'single color outline', 'detail': 'high detail', **kw}
    r = call('POST', '/map-objects', body)
    print('queued', json.dumps(r)[:200], file=sys.stderr)
    oid = r.get('object_id') or r.get('id') or r.get('data', {}).get('object_id')
    d = wait(f'/map-objects/{oid}')
    save_any_image(d, out)
    return d

if __name__ == '__main__':
    a = sys.argv[1:]
    if a[0] == 'balance': print(call('GET', '/balance'))
    elif a[0] == 'object':
        d = map_object(a[1], int(a[2]), int(a[3]), a[4], *(a[5:6] or []))
        print(json.dumps(d)[:400])
