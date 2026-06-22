#!/usr/bin/env python3
"""Probe: confirm ClashX proxy works, fetch a couple pages, dump unique f100 values + sample."""
import json, sys, urllib.request
from collections import Counter

PORT = sys.argv[1] if len(sys.argv) > 1 else '64951'
proxy = urllib.request.ProxyHandler({'http': f'http://127.0.0.1:{PORT}', 'https': f'http://127.0.0.1:{PORT}'})
opener = urllib.request.build_opener(proxy)
urllib.request.install_opener(opener)

def fetch(pn, pz=500):
    markets = 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23'
    fields = 'f12,f14,f100,f102,f103,f129,f130,f131'
    url = (f'https://push2.eastmoney.com/api/qt/clist/get?pn={pn}&pz={pz}&po=1&np=1'
           f'&fltt=2&invt=2&fid=f3&fs={markets}&fields={fields}')
    req = urllib.request.Request(url, headers={
        'Referer': 'https://quote.eastmoney.com',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode('utf-8'))

d = fetch(1, 200)
total = d['data']['total']
diffs = d['data']['diff']
print(f"PROXY OK on {PORT}. total={total}, page1 returned {len(diffs)} rows")
print("SAMPLE ROW:", json.dumps(diffs[0], ensure_ascii=False))
c = Counter(x.get('f100') or '(empty)' for x in diffs)
print(f"\nUnique f100 in page1 ({len(c)}):")
for k, v in c.most_common():
    print(f"  {k}: {v}")
