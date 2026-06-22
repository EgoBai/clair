#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Probe2: find Tencent member-stock endpoint (native SW) + Sina SW node list. Fail fast."""
import urllib.request, ssl, json, time
ctx = ssl.create_default_context(); ctx.check_hostname=False; ctx.verify_mode=ssl.CERT_NONE
def get(url, gbk=False, ref='https://finance.qq.com', timeout=8):
    req=urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0','Referer':ref})
    raw=urllib.request.urlopen(req,timeout=timeout,context=ctx).read()
    return raw.decode('gbk',errors='replace') if gbk else raw.decode('utf-8',errors='replace')
def t(label,url,**kw):
    try:
        a=time.time(); r=get(url,**kw); print(f"[OK] {label} ({time.time()-a:.1f}s) len={len(r)}"); return r
    except Exception as e:
        print(f"[FAIL] {label}: {type(e).__name__} {e}"); return None

CODE='pt01801120'  # 食品饮料 SW801120
print("=== Tencent member-stock candidates ===")
cands=[
 ("getMemRank", f"https://proxy.finance.qq.com/cgi/cgi-bin/rank/pt/getMemRank?board_code={CODE}&offset=0&count=5"),
 ("getCompRank", f"https://proxy.finance.qq.com/cgi/cgi-bin/rank/pt/getCompRank?board_code={CODE}&offset=0&count=5"),
 ("hs getRank bk", f"https://proxy.finance.qq.com/cgi/cgi-bin/rank/hs/getRank?board_type=hy&board_code={CODE}&sort_type=price&direct=down&offset=0&count=5"),
 ("getRank stock_type", f"https://proxy.finance.qq.com/cgi/cgi-bin/rank/pt/getRank?board_type={CODE}&sort_type=price&direct=down&offset=0&count=5&type=mem"),
 ("bkphw getMemberList", f"https://proxy.finance.qq.com/cgi/cgi-bin/bkphw/getMemberList?bk={CODE}&offset=0&count=5"),
 ("ifzq pmenu", f"https://web.ifzq.gtimg.cn/appstock/app/mod/menu?code={CODE}"),
]
for lbl,u in cands:
    r=t(lbl,u)
    if r: print("   ",r[:260])

print("\n=== Sina SW industry list candidates ===")
sw_lists=[
 ("sinaSW newSinaHy?type=sw", "http://vip.stock.finance.sina.com.cn/q/view/newSinaHy.php?type=sw"),
 ("sw_industry php", "http://vip.stock.finance.sina.com.cn/q/view/newSinaHy_sw.php"),
]
for lbl,u in sw_lists:
    r=t(lbl,u,gbk=True,ref='http://finance.sina.com.cn')
    if r: print("   ",r[:200])

print("\n=== Sina node format probes for SW ===")
for node in ['sw_801120','swhy_801120','sw1_801120','申万食品饮料']:
    import urllib.parse
    n=urllib.parse.quote(node)
    r=t(f"node {node}", f"http://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData?page=1&num=3&sort=symbol&asc=1&node={n}", gbk=True, ref='http://finance.sina.com.cn')
    if r: print(f"    {node}:",r[:120])
print("DONE")
