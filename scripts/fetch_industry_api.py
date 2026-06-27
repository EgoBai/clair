#!/usr/bin/env python3
"""Fetch SW industry from Tencent API for unclassified stocks."""
import psycopg2
import urllib.request
import json
import time

conn = psycopg2.connect(host='localhost', port=5432, database='clair', user='postgres')
cur = conn.cursor()

# Get unclassified real stocks
cur.execute("""
    SELECT symbol, name FROM stocks 
    WHERE is_active = true AND industry = '综合'
    AND name NOT LIKE '%退%' AND name NOT LIKE '%ST%' AND name NOT LIKE '%PT%'
""")
stocks = [(r[0], r[1]) for r in cur.fetchall()]
print(f"Stocks to classify via API: {len(stocks)}")

def fetch_industry(symbol):
    """Fetch industry from Tencent stock info API."""
    try:
        url = f"https://proxy.finance.qq.com/ifzqgtimg/appstock/app/newstockinfo/query?_var=info&symbol={symbol}"
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0',
            'Referer': 'https://finance.qq.com'
        })
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = resp.read().decode('utf-8', errors='replace')
        
        # Parse: var info={...}
        if data.startswith('info='):
            info = json.loads(data[5:])
            industry = info.get('data', {}).get('hy', '')  # SW industry name
            return industry if industry else None
    except Exception as e:
        pass
    return None

# Batch fetch
classified = 0
batch_size = 20
for i in range(0, len(stocks), batch_size):
    batch = stocks[i:i+batch_size]
    for symbol, name in batch:
        industry = fetch_industry(symbol)
        if industry and industry != '综合':
            cur.execute(
                "UPDATE stocks SET industry = %s WHERE symbol = %s",
                (industry, symbol)
            )
            classified += 1
            if classified <= 30:
                print(f"  {symbol} {name[:8]:8s} -> {industry}")
    
    if i % 100 == 0 or i + batch_size >= len(stocks):
        conn.commit()
        remaining = len(stocks) - (i + len(batch))
        pct = i / len(stocks) * 100 if stocks else 0
        print(f"  Progress: {min(i+len(batch), len(stocks))}/{len(stocks)} ({pct:.0f}%), classified: {classified}")

    time.sleep(0.1)  # Rate limiting

conn.commit()
print(f"\nTotal classified via API: {classified}")

# Final count
cur.execute("""
    SELECT COUNT(*) FROM stocks 
    WHERE is_active = true AND industry = '综合'
    AND name NOT LIKE '%退%' AND name NOT LIKE '%ST%' AND name NOT LIKE '%PT%'
""")
remaining = cur.fetchone()[0]
print(f"Remaining '综合' (real stocks): {remaining}")

# Total remaining
cur.execute("SELECT COUNT(*) FROM stocks WHERE is_active = true AND industry = '综合'")
total = cur.fetchone()[0]
print(f"Total remaining '综合': {total} ({total/55.44:.1f}%)")

cur.close()
conn.close()
