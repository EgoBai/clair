#!/usr/bin/env python3
"""Update PostgreSQL stock industries from the re-classified v2 data."""
import json, sys

# Load v2 re-classified data
with open('/Users/ego_bai/.openclaw/workspace/a-stock-website/clair-worker/all_stocks_v2.json') as f:
    data = json.load(f)

# Generate SQL updates (batch by transaction for safety)
lines = [
    'BEGIN;',
]
updated = 0
for item in data:
    code, name, market, industry = item[0], item[1], item[2], item[3]
    symbol = f'{code}.{market}'
    # Escape single quotes in name and industry
    name_esc = name.replace("'", "''")
    ind_esc = industry.replace("'", "''")
    lines.append(
        f"UPDATE stocks SET industry = '{ind_esc}', name = '{name_esc}', "
        f"updated_at = NOW() WHERE symbol = '{symbol}' AND is_active = true;"
    )
    updated += 1

lines.append('COMMIT;')
lines.append(f'-- Updated {updated} stocks')

sql_path = '/Users/ego_bai/.openclaw/workspace/a-stock-website/backend/update_industries.sql'
with open(sql_path, 'w') as f:
    f.write('\n'.join(lines))

print(f"SQL generated: {sql_path}")
print(f"  {updated} UPDATE statements")
print(f"\nExecute with:")
print(f"  psql -h localhost -U postgres -d clair -f {sql_path}")
