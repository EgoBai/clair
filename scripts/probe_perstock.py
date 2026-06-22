#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Probe per-stock industry endpoints (Tencent + Sina). Fail fast."""
import urllib.request, ssl, time
ctx=ssl.create_default_context(); ctx.check_hostname=False; ctx.verify_mode=ssl.CERT_NONE
def get(url,gbk=False,ref='https://gu.qq.com',timeout=8):
    req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0','Referer':ref})
    raw=urllib.request.urlopen(req,timeout=timeout,context=ctx).read()
    return raw.decode('gbk',errors='replace') if gbk else raw.decode('utf-8',errors='replace')
def t(label,url,**kw):
    try:
        a=time.time(); r=get(url,**kw); print(f"[OK] {label} ({time.time()-a:.1f}s) len={len(r)}\n   {r[:400]}\n"); return r
    except Exception as e:
        print(f"[FAIL] {label}: {type(e).__name__} {e}"); return None

C='sz000001'  # 平安银行 (银行)
print("=== Tencent per-stock ===")
t("f10 getF10Info", f"https://proxy.finance.qq.com/cgi/cgi-bin/f10/getF10Info?code={C}")
t("getStockBoard", f"https://proxy.finance.qq.com/cgi/cgi-bin/rank/pt/getStockBoard?code={C}")
t("getStockPlate", f"https://proxy.finance.qq.com/cgi/cgi-bin/rank/pt/getStockPlate?code={C}")
t("web.ifzq finance", f"https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param={C},day,,,1,qfq")  # not industry, sanity reach
t("qt batch", f"https://qt.gtimg.cn/q={C}")
print("=== Sina per-stock corp info ===")
t("sina corp hangye", f"http://vip.stock.finance.sina.com.cn/corp/go.php/vCI_CorpInfo/stockid/000001.phtml", gbk=True, ref='http://finance.sina.com.cn')
print("DONE")
