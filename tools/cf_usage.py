# Cloudflare usage by hour (DO requests, duration GB-s, worker requests, D1 rows) — read-only analytics. Usage: python3 -I tools/cf_usage.py 2026-11-14T00:00:00Z 2026-11-15T00:00:00Z (UTC). Cost: DO requests $0.15/M over 1M/month, duration over 400k GB-s; player-hours today: curl https://mourncrown.egowenit.workers.dev/online (h)
import json, urllib.request, sys
ACC = '2a23c3f4cabf7dee140f122ac5876004'
s0, s1 = sys.argv[1], sys.argv[2]
q = """query($a:String!,$s:Time!,$e:Time!){viewer{accounts(filter:{accountTag:$a}){
 i:durableObjectsInvocationsAdaptiveGroups(limit:200,filter:{datetime_geq:$s,datetime_leq:$e}){sum{requests} dimensions{datetimeHour}}
 p:durableObjectsPeriodicGroups(limit:200,filter:{datetimeMinute_geq:$s,datetimeMinute_leq:$e}){sum{activeTime inboundWebsocketMsgCount} dimensions{datetimeHour}}
 w:workersInvocationsAdaptive(limit:200,filter:{datetime_geq:$s,datetime_leq:$e}){sum{requests} dimensions{datetimeHour}}
 d:d1AnalyticsAdaptiveGroups(limit:200,filter:{datetime_geq:$s,datetime_leq:$e}){sum{readQueries writeQueries rowsRead rowsWritten} dimensions{datetimeHour}}
}}}"""
r = urllib.request.Request('https://api.cloudflare.com/client/v4/graphql', data=json.dumps({'query': q, 'variables': {'a': ACC, 's': s0, 'e': s1}}).encode(), headers={'content-type': 'application/json'})
d = json.load(urllib.request.urlopen(r, timeout=60))
if d.get('errors'): print(d['errors']); raise SystemExit
a = d['data']['viewer']['accounts'][0]
H = {}
for x in a['i']: H.setdefault(x['dimensions']['datetimeHour'], {})['req'] = H.get(x['dimensions']['datetimeHour'], {}).get('req', 0) + x['sum']['requests']
for x in a['p']: h = H.setdefault(x['dimensions']['datetimeHour'], {}); h['act'] = h.get('act', 0) + x['sum']['activeTime']; h['wsin'] = h.get('wsin', 0) + (x['sum'].get('inboundWebsocketMsgCount') or 0)
for x in a['w']: h = H.setdefault(x['dimensions']['datetimeHour'], {}); h['wrk'] = h.get('wrk', 0) + x['sum']['requests']
for x in a['d']: h = H.setdefault(x['dimensions']['datetimeHour'], {}); h['d1r'] = h.get('d1r', 0) + x['sum']['rowsRead']; h['d1w'] = h.get('d1w', 0) + x['sum']['rowsWritten']
T = {'req': 0, 'act': 0, 'wsin': 0, 'wrk': 0, 'd1r': 0, 'd1w': 0}
for k in sorted(H):
    v = H[k]; print(k[:13], 'DOreq', v.get('req', 0), 'GBs', round(v.get('act', 0) / 1e6 * 0.125), 'wsIn', v.get('wsin', 0), 'worker', v.get('wrk', 0), 'D1 rows r/w', v.get('d1r', 0), v.get('d1w', 0))
    for t in T: T[t] += v.get(t, 0)
print('TOTAL DOreq', T['req'], 'GBs', round(T['act'] / 1e6 * 0.125), 'wsIn', T['wsin'], 'worker', T['wrk'], 'D1 rows read', T['d1r'], 'written', T['d1w'])
