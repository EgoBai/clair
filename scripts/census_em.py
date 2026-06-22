#!/usr/bin/env python3
"""Census: fetch ALL stocks, dump full f100 distribution to f100_census.txt"""
import json, sys, time, urllib.request
from collections import Counter

PORT = sys.argv[1] if len(sys.argv) > 1 else '64951'
p = urllib.request.ProxyHandler({'http': f'http://127.0.0.1:{PORT}', 'https': f'http://127.0.0.1:{PORT}'})
urllib.request.install_opener(urllib.request.build_opener(p))

def fetch(pn, pz=500):
    m = 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23'
    f = 'f12,f14,f100,f102,f103,f129,f130,f131'
    url = (f'https://push2.eastmoney.com/api/qt/clist/get?pn={pn}&pz={pz}&po=1&np=1'
           f'&fltt=2&invt=2&fid=f3&fs={m}&fields={f}')
    req = urllib.request.Request(url, headers={
        'Referer': 'https://quote.eastmoney.com',
        'User-Agent': 'Mozilla/5.0'})
    last = None
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode('utf-8'))
        except Exception as e:
            last = e
            time.sleep(1.5 * (attempt + 1))
    raise last

allrows, pn = [], 1
while True:
    d = fetch(pn)
    diffs = d.get('data', {}).get('diff') or []
    if not diffs:
        break
    allrows.extend(diffs)
    total = d['data']['total']
    if pn * 500 >= total:
        break
    pn += 1
    time.sleep(0.3)

c = Counter(x.get('f100') or '(empty)' for x in allrows)
lines = [f"TOTAL={len(allrows)} UNIQUE_F100={len(c)}"]
for k, v in c.most_common():
    lines.append(f"{v}\t{k}")
open('f100_census.txt', 'w', encoding='utf-8').write('\n'.join(lines))
print('\n'.join(lines))
