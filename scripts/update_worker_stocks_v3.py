#!/usr/bin/env python3
"""Replace FULL_STOCK_LIST in worker.js / _worker.js with the v3 (accurate) data.

Source: clair-worker/all_stocks_v3_compact.json  format: [[code,name,market,sw_industry],...]
v3 brings '综合' (uncategorized) ratio down from ~33% to ~14%.
"""
import re
import json
from collections import Counter

WORKER_DIR = '/Users/ego_bai/.openclaw/workspace/a-stock-website/clair-worker'
SRC = f'{WORKER_DIR}/all_stocks_v3_compact.json'

# 1. Read v3 data
with open(SRC, 'r', encoding='utf-8') as f:
    data = json.load(f)

# 2. Build compact JS string (json.dumps separators=(',',':') per item)
items_js = ','.join(
    json.dumps(item, ensure_ascii=False, separators=(',', ':')) for item in data
)
new_decl = f'const FULL_STOCK_LIST = [{items_js}];'

# 3. Read worker.js + locate old declaration
with open(f'{WORKER_DIR}/worker.js', 'r', encoding='utf-8') as f:
    worker_content = f.read()

old_pattern = r'const FULL_STOCK_LIST = \[\[.*?\]\];'
m = re.search(old_pattern, worker_content, re.DOTALL)
if not m:
    raise SystemExit('ERROR: Could not find FULL_STOCK_LIST pattern in worker.js')

# Stats: before
old_data = json.loads(m.group(0)[len('const FULL_STOCK_LIST = '):-1])
old_dist = Counter(it[3] for it in old_data)
old_total = len(old_data)
old_zh = old_dist.get('综合', 0)

# 4. Replace + write worker.js
new_content = re.sub(old_pattern, lambda _: new_decl, worker_content, flags=re.DOTALL)
with open(f'{WORKER_DIR}/worker.js', 'w', encoding='utf-8') as f:
    f.write(new_content)

# 5. cp worker.js -> _worker.js (full sync)
with open(f'{WORKER_DIR}/_worker.js', 'w', encoding='utf-8') as f:
    f.write(new_content)

# Stats: after
new_dist = Counter(it[3] for it in data)
new_total = len(data)
new_zh = new_dist.get('综合', 0)

print('=== FULL_STOCK_LIST updated (v3) ===')
print(f'BEFORE: {old_total} stocks, 综合={old_zh} ({old_zh/old_total*100:.1f}%)')
print(f'AFTER : {new_total} stocks, 综合={new_zh} ({new_zh/new_total*100:.1f}%)')
print(f'Top industries (after): {new_dist.most_common(8)}')
print(f'Wrote: {WORKER_DIR}/worker.js and {WORKER_DIR}/_worker.js')
