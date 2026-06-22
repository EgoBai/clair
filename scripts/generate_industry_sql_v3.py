#!/usr/bin/env python3
"""Generate PostgreSQL UPDATE SQL for stocks.industry from the v3 (accurate SW) data.

Input : clair-worker/all_stocks_v3_compact.json  -> [[code,name,market,sw_industry],...]
Output: backend/update_industries_v3.sql  (BEGIN/COMMIT transaction)
Only updates the `industry` column (+ updated_at). symbol = '{code}.{market}'.
"""
import json
import os

BASE = '/Users/ego_bai/.openclaw/workspace/a-stock-website'
SRC = os.path.join(BASE, 'clair-worker/all_stocks_v3_compact.json')
OUT = os.path.join(BASE, 'backend/update_industries_v3.sql')

with open(SRC) as f:
    data = json.load(f)

lines = ['BEGIN;']
updated = 0
for item in data:
    code, name, market, industry = item[0], item[1], item[2], item[3]
    symbol = f'{code}.{market}'
    ind_esc = industry.replace("'", "''")
    sym_esc = symbol.replace("'", "''")
    lines.append(
        f"UPDATE stocks SET industry = '{ind_esc}', updated_at = NOW() "
        f"WHERE symbol = '{sym_esc}' AND is_active = true;"
    )
    updated += 1

lines.append('COMMIT;')
lines.append(f'-- Generated {updated} UPDATE statements from all_stocks_v3_compact.json')

with open(OUT, 'w') as f:
    f.write('\n'.join(lines) + '\n')

print(f"SQL generated: {OUT}")
print(f"  {updated} UPDATE statements")
