#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Re-examine Tencent board_code response: does rank_list contain member stocks?"""
import urllib.request, ssl, json, time
ctx=ssl.create_default_context(); ctx.check_hostname=False; ctx.verify_mode=ssl.CERT_NONE
def get(url,timeout=10):
    req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0','Referer':'https://finance.qq.com'})
    return urllib.request.urlopen(req,timeout=timeout,context=ctx).read().decode('utf-8',errors='replace')

CODE='pt01801120'  # 食品饮料
for cnt in [50]:
    url=f"https://proxy.finance.qq.com/cgi/cgi-bin/rank/pt/getRank?board_type=hy&board_code={CODE}&sort_type=price&direct=down&offset=0&count={cnt}"
    d=json.loads(get(url))
    rl=d['data']['rank_list']
    print(f"count param={cnt} -> rank_list len={len(rl)} total={d['data'].get('total')}")
    for x in rl[:8]:
        print("   ", x.get('code'), x.get('name'), x.get('stock_type'))
# Try offset to see if it pages members
print("\n-- offset=1 to skip parent? --")
url=f"https://proxy.finance.qq.com/cgi/cgi-bin/rank/pt/getRank?board_type=hy&board_code={CODE}&sort_type=price&direct=down&offset=1&count=50"
d=json.loads(get(url))
print("len",len(d['data']['rank_list']))
