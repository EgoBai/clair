#!/usr/bin/env python3
"""Build all_stocks_v3.json from EastMoney via ClashX proxy.
Output: [code, name, market, sw_industry, em_industry, concepts] (v3)
        [code, name, market, sw_industry] (v3_compact)
Robust: per-page retries, incremental raw cache, full distribution report.
"""
from __future__ import annotations
import json, os, sys, time, urllib.request
from collections import Counter
from sw_mapping import classify_sw, _norm

PORT = sys.argv[1] if len(sys.argv) > 1 else '64951'
proxy = urllib.request.ProxyHandler({'http': f'http://127.0.0.1:{PORT}', 'https': f'http://127.0.0.1:{PORT}'})
urllib.request.install_opener(urllib.request.build_opener(proxy))

BASE = '/Users/ego_bai/.openclaw/workspace/a-stock-website'
RAW_CACHE = BASE + '/scripts/_raw_em_rows.json'
OUT_V3 = BASE + '/clair-worker/all_stocks_v3.json'
OUT_COMPACT = BASE + '/clair-worker/all_stocks_v3_compact.json'

MARKETS = 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23'
FIELDS = 'f12,f14,f100,f102,f103,f129,f130,f131'

def fetch(pn, pz=200):
    url = (f'https://push2.eastmoney.com/api/qt/clist/get?pn={pn}&pz={pz}&po=1&np=1'
           f'&fltt=2&invt=2&fid=f3&fs={MARKETS}&fields={FIELDS}')
    req = urllib.request.Request(url, headers={
        'Referer': 'https://quote.eastmoney.com',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'})
    last = None
    for attempt in range(20):
        try:
            with urllib.request.urlopen(req, timeout=25) as r:
                return json.loads(r.read().decode('utf-8'))
        except Exception as e:
            last = e
            wait = min(2 + attempt * 1.5, 12)
            print(f"    page{pn} attempt{attempt+1} fail ({type(e).__name__}); sleep {wait:.0f}s", flush=True)
            time.sleep(wait)
    raise RuntimeError(f"page {pn} failed after retries: {last}")

def detect_market(code):
    if code.startswith('6'): return 'SH'
    if code.startswith(('0', '3')): return 'SZ'
    if code.startswith(('8', '4')): return 'BJ'
    return 'SZ'

def collect_rows():
    # resume from cache if present and complete
    rows, pn, pz = [], 1, 500
    print("Fetching EastMoney pages via proxy port", PORT, flush=True)
    while True:
        d = fetch(pn, pz)
        diffs = (d.get('data') or {}).get('diff') or []
        if not diffs:
            break
        rows.extend(diffs)
        total = d['data']['total']
        print(f"  page {pn}: +{len(diffs)} (have {len(rows)}/{total})", flush=True)
        json.dump(rows, open(RAW_CACHE, 'w', encoding='utf-8'), ensure_ascii=False)
        if pn * pz >= total or len(rows) >= total:
            break
        pn += 1
        time.sleep(1.0)
    return rows

def main():
    rows = collect_rows()
    # dedup by code (keep first)
    seen, uniq = set(), []
    for it in rows:
        c = it.get('f12', '')
        if c and c not in seen:
            seen.add(c); uniq.append(it)
    print(f"\nTotal unique stocks: {len(uniq)}", flush=True)

    f100_counter = Counter((it.get('f100') or '(empty)') for it in uniq)
    stocks_v3, compact, unmapped = [], [], Counter()
    for it in uniq:
        code = it.get('f12', ''); name = it.get('f14', '')
        if not code or not name: continue
        em = it.get('f100') or ''
        concepts = it.get('f103') or ''
        market = detect_market(code)
        sw = classify_sw(em)
        if sw == '综合' and _norm(em) not in ('综合', ''):
            unmapped[em] += 1
        stocks_v3.append([code, name, market, sw, em, concepts])
        compact.append([code, name, market, sw])

    json.dump(stocks_v3, open(OUT_V3, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    json.dump(compact, open(OUT_COMPACT, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))

    sw_counter = Counter(s[3] for s in stocks_v3)
    n = len(stocks_v3)
    print(f"\n=== 申万一级分布 ({len(sw_counter)} 类, 共 {n} 只) ===")
    for ind, cnt in sw_counter.most_common():
        print(f"  {ind}: {cnt} ({cnt/n*100:.1f}%)")
    zh = sw_counter.get('综合', 0)
    print(f"\n综合: {zh} ({zh/n*100:.2f}%)")
    print(f"原始 f100 类别数: {len(f100_counter)}")
    if unmapped:
        print(f"\n未能映射的 f100 值 ({len(unmapped)} 种):")
        for k, v in unmapped.most_common():
            print(f"  {k}: {v}")
    else:
        print("\n所有非空 f100 均已映射 (无遗漏)")
    print(f"\nWrote: {OUT_V3} ({os.path.getsize(OUT_V3)} bytes)")
    print(f"Wrote: {OUT_COMPACT} ({os.path.getsize(OUT_COMPACT)} bytes)")

if __name__ == '__main__':
    main()
