#!/usr/bin/env python3
"""
A股真实行情数据源 — 东方财富API
实时行情 + K线数据获取
"""
import json
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime

# 东方财富API基础URL
EM_QUOTE_URL = "https://push2.eastmoney.com/api/qt/stock/get"
EM_KLINE_URL = "https://push2his.eastmoney.com/api/qt/stock/kline/get"

# 股票代码映射: symbol -> secid (东方财富格式)
def symbol_to_secid(symbol: str) -> str:
    """600519.SH -> 1.600519, 000858.SZ -> 0.000858"""
    code, market = symbol.split(".")
    prefix = "1" if market == "SH" else "0"
    return f"{prefix}.{code}"

def fetch_json(url: str, referer: str = "https://quote.eastmoney.com") -> dict:
    """带UA和Referer的HTTP GET"""
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Referer": referer,
    })
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode("utf-8"))

def get_realtime_quote(symbol: str) -> dict:
    """获取单只股票实时行情"""
    secid = symbol_to_secid(symbol)
    fields = "f43,f44,f45,f46,f47,f48,f57,f58,f59,f60,f107,f170,f171,f177"
    url = f"{EM_QUOTE_URL}?secid={secid}&fields={fields}"
    data = fetch_json(url)
    
    if data.get("rc") != 0 or not data.get("data"):
        return None
    
    d = data["data"]
    # 东方财富价格字段需要除以100（存储为整数避免浮点精度）
    return {
        "symbol": symbol,
        "code": d.get("f57", ""),
        "name": d.get("f58", ""),
        "current_price": d.get("f43", 0) / 100 if d.get("f43") and d["f43"] != "-" else 0,
        "open_price": d.get("f46", 0) / 100 if d.get("f46") else 0,
        "high_price": d.get("f44", 0) / 100 if d.get("f44") else 0,
        "low_price": d.get("f45", 0) / 100 if d.get("f45") else 0,
        "prev_close": d.get("f60", 0) / 100 if d.get("f60") else 0,
        "volume": d.get("f47", 0),
        "turnover": d.get("f48", 0),
        "change_percent": d.get("f170", 0) / 100 if d.get("f170") else 0,
        "market": "SH" if symbol.endswith("SH") else "SZ",
    }

def get_batch_quotes(symbols: list) -> list:
    """批量获取实时行情（东方财富支持逗号分隔）"""
    secids = ",".join(symbol_to_secid(s) for s in symbols)
    fields = "f43,f44,f45,f46,f47,f48,f57,f58,f60,f107,f170"
    url = f"{EM_QUOTE_URL}?secids={secids}&fields={fields}&ut=fa5fd1943c7b386f172d6893dbfba10b"
    data = fetch_json(url)
    
    results = []
    if data.get("rc") != 0:
        return results
    
    items = data.get("data", {}).get("diff", [])
    for item in items:
        results.append({
            "code": item.get("f57", ""),
            "name": item.get("f58", ""),
            "current_price": item.get("f43", 0) / 100,
            "change_percent": item.get("f170", 0) / 100,
            "volume": item.get("f47", 0),
            "turnover": item.get("f48", 0),
        })
    return results

def get_kline(symbol: str, days: int = 120, klt: int = 101) -> list:
    """
    获取K线数据
    klt: 101=日K, 102=周K, 103=月K, 60=60分钟, 30=30分钟
    """
    secid = symbol_to_secid(symbol)
    url = (f"{EM_KLINE_URL}?secid={secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61"
           f"&klt={klt}&fqt=1&end=20500101&lmt={days}")
    data = fetch_json(url, referer="https://quote.eastmoney.com")
    
    if data.get("rc") != 0 or not data.get("data") or not data["data"].get("klines"):
        return []
    
    klines = []
    for line in data["data"]["klines"]:
        parts = line.split(",")
        # 日期,开,收,高,低,成交量,成交额,振幅,涨跌幅,涨跌额,换手率
        klines.append({
            "date": parts[0],
            "open": float(parts[1]),
            "close": float(parts[2]),
            "high": float(parts[3]),
            "low": float(parts[4]),
            "volume": int(parts[5]),
            "turnover": float(parts[6]),
            "amplitude": float(parts[7]),
            "change_percent": float(parts[8]),
            "change_amount": float(parts[9]),
            "turnover_rate": float(parts[10]),
        })
    return klines

def sync_to_postgres(symbols: list):
    """将实时行情同步到PostgreSQL"""
    import psycopg2
    conn = psycopg2.connect(
        host="localhost", port=5432, user="ego_bai",
        password="", database="a_stock"
    )
    cur = conn.cursor()
    
    success = 0
    for symbol in symbols:
        try:
            q = get_realtime_quote(symbol)
            if not q or q["current_price"] == 0:
                print(f"  ⚠️ {symbol}: 无数据")
                continue
            
            cur.execute("""
                UPDATE stocks SET
                    current_price = %s, open_price = %s, high_price = %s,
                    low_price = %s, prev_close = %s, volume = %s,
                    turnover = %s, change_percent = %s,
                    updated_at = NOW()
                WHERE symbol = %s
            """, (
                q["current_price"], q["open_price"], q["high_price"],
                q["low_price"], q["prev_close"], q["volume"],
                q["turnover"], q["change_percent"], symbol
            ))
            success += 1
        except Exception as e:
            print(f"  ❌ {symbol}: {e}")
    
    conn.commit()
    cur.close()
    conn.close()
    return success

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python3 eastmoney_data.py quote 600519.SH        # 单股实时行情")
        print("  python3 eastmoney_data.py kline 600519.SH 30     # K线数据")
        print("  python3 eastmoney_data.py sync                   # 同步全部到数据库")
        print("  python3 eastmoney_data.py test                   # 测试API连通性")
        sys.exit(0)
    
    cmd = sys.argv[1]
    
    if cmd == "test":
        print("🧪 测试东方财富API...")
        q = get_realtime_quote("600519.SH")
        if q:
            print(f"  ✅ 贵州茅台: ¥{q['current_price']} ({q['change_percent']:+.2f}%)")
            print(f"     今开: {q['open_price']}  最高: {q['high_price']}  最低: {q['low_price']}")
            print(f"     成交量: {q['volume']//10000}万  成交额: {q['turnover']//100000000:.2f}亿")
        else:
            print("  ❌ 获取失败")
            sys.exit(1)
    
    elif cmd == "quote":
        symbol = sys.argv[2]
        q = get_realtime_quote(symbol)
        print(json.dumps(q, ensure_ascii=False, indent=2))
    
    elif cmd == "kline":
        symbol = sys.argv[2]
        days = int(sys.argv[3]) if len(sys.argv) > 3 else 120
        klines = get_kline(symbol, days)
        print(json.dumps(klines[:5], ensure_ascii=False, indent=2))
        print(f"... 共 {len(klines)} 条K线")
    
    elif cmd == "sync":
        # 获取数据库中所有股票代码
        import psycopg2
        conn = psycopg2.connect(host="localhost", port=5432, user="ego_bai", password="", database="a_stock")
        cur = conn.cursor()
        cur.execute("SELECT symbol FROM stocks WHERE is_active = true")
        symbols = [row[0] for row in cur.fetchall()]
        cur.close()
        conn.close()
        
        print(f"🔄 同步 {len(symbols)} 只股票行情...")
        n = sync_to_postgres(symbols)
        print(f"✅ 成功同步 {n}/{len(symbols)} 只")
