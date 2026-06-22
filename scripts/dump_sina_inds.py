#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Dump full Sina industry list (new_xxx code, name, stock count)."""
import urllib.request, ssl, json, re
ctx=ssl.create_default_context(); ctx.check_hostname=False; ctx.verify_mode=ssl.CERT_NONE
def get(url,gbk=True,ref='http://finance.sina.com.cn',timeout=10):
    req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0','Referer':ref})
    raw=urllib.request.urlopen(req,timeout=timeout,context=ctx).read()
    return raw.decode('gbk',errors='replace') if gbk else raw.decode('utf-8',errors='replace')
r=get("http://vip.stock.finance.sina.com.cn/q/view/newSinaHy.php")
m=re.search(r'\{.*\}', r, re.S)
d=json.loads(m.group(0))
out=[]
total=0
for k,v in d.items():
    parts=v.split(',')
    name=parts[1]; cnt=int(parts[2]); total+=cnt
    out.append((k,name,cnt))
out.sort(key=lambda x:-x[2])
print("industries:",len(out)," total_stock_slots:",total)
for k,name,cnt in out:
    print(f"{k}\t{name}\t{cnt}")
json.dump(out, open('/tmp/sina_inds.json','w'), ensure_ascii=False)
