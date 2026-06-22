#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Fast-fail exploration of Tencent/Sina industry constituent endpoints.
NO EastMoney. Each endpoint <=3 attempts, short timeout, abort fast."""
import urllib.request, ssl, json, sys, time

ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE

def get(url, gbk=False, ref='https://finance.qq.com', timeout=10):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0', 'Referer': ref})
    raw = urllib.request.urlopen(req, timeout=timeout, context=ctx).read()
    return raw.decode('gbk', errors='replace') if gbk else raw.decode('utf-8', errors='replace')

def try_get(label, url, **kw):
    for i in range(2):  # <=2 attempts then move on (fail fast)
        try:
            t = time.time()
            r = get(url, **kw)
            print(f"[OK] {label} ({time.time()-t:.1f}s) len={len(r)}")
            return r
        except Exception as e:
            print(f"[FAIL {i+1}] {label}: {type(e).__name__} {e}")
    return None

# 1) Tencent industry list
print("=== STEP 1: Tencent industry list (board_type=hy) ===")
r = try_get("tencent-hy-list", "https://proxy.finance.qq.com/cgi/cgi-bin/rank/pt/getRank?board_type=hy&sort_type=price&direct=down&offset=0&count=100")
inds = []
if r:
    d = json.loads(r)
    rl = d.get('data', {}).get('rank_list', [])
    print("industries:", len(rl))
    for x in rl[:5]:
        print("  ", x.get('code'), x.get('name'), "keys=", list(x.keys()))
    inds = [(x.get('code'), x.get('name')) for x in rl]
    json.dump(inds, open('/tmp/tencent_inds.json','w'), ensure_ascii=False)

# 2) Tencent constituent attempts using first industry code
if inds:
    code, name = inds[0]
    print(f"\n=== STEP 2: Tencent constituents for {code} {name} ===")
    cands = [
        ("hy+board_code", f"https://proxy.finance.qq.com/cgi/cgi-bin/rank/pt/getRank?board_type=hy&board_code={code}&sort_type=price&direct=down&offset=0&count=20"),
        ("plate getplatecomp", f"https://proxy.finance.qq.com/cgi/cgi-bin/plate/getPlateComp?plate_code={code}&offset=0&count=20"),
        ("rank pt code", f"https://proxy.finance.qq.com/cgi/cgi-bin/rank/pt/getRank?board_type={code}&sort_type=price&direct=down&offset=0&count=20"),
    ]
    for lbl, u in cands:
        rr = try_get(lbl, u)
        if rr:
            print("   sample:", rr[:300])

# 3) Sina industry list
print("\n=== STEP 3: Sina industry list ===")
r2 = try_get("sina-hy-list", "http://vip.stock.finance.sina.com.cn/q/view/newSinaHy.php", gbk=True, ref='http://finance.sina.com.cn')
if r2:
    print("   sample:", r2[:400])

# 4) Sina constituents getHQNodeData (need a node code) - test with a guessed sw node
print("\n=== STEP 4: Sina getHQNodeData (sw node test) ===")
for node in ['sw2_801010','new_blhy','sw2_801780']:
    rr = try_get(f"sina-node-{node}", f"http://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData?page=1&num=5&sort=symbol&asc=1&node={node}", gbk=True, ref='http://finance.sina.com.cn')
    if rr:
        print(f"   {node} sample:", rr[:300])
print("\nDONE")
