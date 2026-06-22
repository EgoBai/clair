#!/usr/bin/env python3
"""Replace FULL_STOCK_LIST in worker.js with the re-classified v2 data."""
import re

WORKER_DIR = '/Users/ego_bai/.openclaw/workspace/a-stock-website/clair-worker'

# Read the v2 list (JS format)
with open(f'{WORKER_DIR}/full_stock_list_v2.js', 'r') as f:
    v2_js = f.read()

# Read worker.js
with open(f'{WORKER_DIR}/worker.js', 'r') as f:
    worker_content = f.read()

# Find and replace FULL_STOCK_LIST
old_pattern = r'const FULL_STOCK_LIST = \[\[.*?\]\];'
new_replacement = v2_js.strip()

if re.search(old_pattern, worker_content, re.DOTALL):
    new_content = re.sub(old_pattern, new_replacement, worker_content, flags=re.DOTALL)
    
    # Write updated worker.js
    with open(f'{WORKER_DIR}/worker.js', 'w') as f:
        f.write(new_content)
    
    # Copy to _worker.js (Pages Functions entry)
    with open(f'{WORKER_DIR}/_worker.js', 'w') as f:
        f.write(new_content)
    
    # Count the improvement
    old_match = re.search(old_pattern, worker_content, re.DOTALL)
    if old_match:
        old_data = old_match.group(0)
        old_stocks = len(old_data.split('],['))
        new_stocks = len(v2_js.split('],['))
        print(f"Replaced FULL_STOCK_LIST: {old_stocks} stocks → {new_stocks} stocks (re-classified)")
    
    # Count industries
    import json
    match = re.search(r'const FULL_STOCK_LIST = (\[\[.*?\]\]);', v2_js, re.DOTALL)
    if match:
        data = json.loads(match.group(1))
        from collections import Counter
        dist = Counter(item[3] for item in data)
        zonghe = dist.get('综合', 0)
        print(f"'综合' stocks: {zonghe} (of {len(data)})")
        print(f"Top industries: {dist.most_common(5)}")
    
    print(f"\nWorker files updated:")
    print(f"  {WORKER_DIR}/worker.js")
    print(f"  {WORKER_DIR}/_worker.js")
else:
    print("ERROR: Could not find FULL_STOCK_LIST pattern in worker.js")
