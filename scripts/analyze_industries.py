#!/usr/bin/env python3
"""Analyze industry distribution in FULL_STOCK_LIST and improve classification."""
import json, re
from collections import Counter

# Load the FULL_STOCK_LIST from worker.js
with open('/Users/ego_bai/.openclaw/workspace/a-stock-website/clair-worker/worker.js', 'r') as f:
    content = f.read()

# Extract the JSON array
match = re.search(r'const FULL_STOCK_LIST = (\[\[.*?\]\]);', content, re.DOTALL)
if not match:
    print("Could not find FULL_STOCK_LIST")
    exit(1)

data = json.loads(match.group(1))
print(f"Total stocks: {len(data)}")

# Raw industry distribution
raw_ind = Counter(item[3] for item in data if item[3])
print(f"\nDistinct raw industries: {len(raw_ind)}")
for ind, cnt in raw_ind.most_common(40):
    print(f"  {ind}: {cnt}")

# The "综合" problem — what are the company names of those?
zonghe = [item for item in data if item[3] == '综合']
print(f"\n'综合' stocks: {len(zonghe)}")
print("Sample names:")
for item in zonghe[:20]:
    print(f"  {item[0]} {item[1]}")
