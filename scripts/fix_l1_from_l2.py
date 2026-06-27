#!/usr/bin/env python3
"""Fix L1 industry classification using SW2021 L2->L1 reverse mapping.
779 stocks labeled '综合' at L1 already have correct L2; derive L1 from L2.
"""
import json
import psycopg2

# Load SW2021 L1->L2 map, build L2->L1 reverse
with open('/Users/ego_bai/.openclaw/workspace/a-stock-website/data/sw2021_l1_l2_map.json') as f:
    L1_TO_L2 = json.load(f)

L2_TO_L1 = {}
for l1, l2_list in L1_TO_L2.items():
    for l2 in l2_list:
        L2_TO_L1[l2] = l1

print(f"L2->L1 mapping: {len(L2_TO_L1)} entries")

# Connect to PostgreSQL
conn = psycopg2.connect(
    host='localhost',
    port=5432,
    database='clair',
    user='postgres'
)
cur = conn.cursor()

# Find stocks with '综合' L1 that have L2 classification
cur.execute("""
    SELECT id, symbol, name, industry, industry_level2
    FROM stocks
    WHERE is_active = true AND industry = '综合' AND industry_level2 IS NOT NULL
""")
stocks = cur.fetchall()
print(f"\nStocks with industry='综合' and L2 classified: {len(stocks)}")

# Classify
updated_l2 = 0
updated_keyword = 0
still_unk = 0
results = []

for stock_id, symbol, name, old_l1, l2 in stocks:
    # Try L2->L1 mapping first
    if l2 in L2_TO_L1:
        new_l1 = L2_TO_L1[l2]
        results.append((stock_id, symbol, name, old_l1, new_l1, f'L2: {l2}'))
        updated_l2 += 1
    else:
        # L2 not in standard mapping — keep '综合' for now
        still_unk += 1

print(f"  L2->L1 mapped: {updated_l2}")
print(f"  Still unknown: {still_unk}")

# Show samples
print("\nSample updates:")
for r in results[:20]:
    print(f"  {r[1]} {r[2][:8]:8s} {r[3]:6s} -> {r[4]:8s}  ({r[5]})")

# Actually update the database
print(f"\nExecuting {updated_l2} updates...")
for stock_id, symbol, name, old_l1, new_l1, reason in results:
    cur.execute(
        "UPDATE stocks SET industry = %s WHERE id = %s",
        (new_l1, stock_id)
    )

conn.commit()
print(f"Done. Updated {updated_l2} stocks.")

# Verify
cur.execute("""
    SELECT industry, COUNT(*) as cnt
    FROM stocks WHERE is_active = true
    GROUP BY industry
    ORDER BY cnt DESC
""")
print("\nFinal L1 distribution (top 15):")
for row in cur.fetchall()[:15]:
    print(f"  {row[0]:10s}: {row[1]}")

cur.execute("SELECT COUNT(*) FROM stocks WHERE is_active = true AND industry = '综合'")
remaining = cur.fetchone()[0]
print(f"\nRemaining '综合': {remaining}")

cur.close()
conn.close()
