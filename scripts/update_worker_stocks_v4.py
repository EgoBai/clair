#!/usr/bin/env python3
"""将 all_stocks_v4.json 的真实概念数据注入 Worker FULL_STOCK_LIST (5元素格式含概念数组)"""
import json, re, os

ROOT = os.path.expanduser('~/.openclaw/workspace/a-stock-website')
V4_PATH = os.path.join(ROOT, 'clair-worker', 'all_stocks_v4.json')
WORKER_PATH = os.path.join(ROOT, 'clair-worker', 'worker.js')

# 读 v4 数据
with open(V4_PATH) as f:
    v4 = json.load(f)

print(f"v4 数据: {len(v4)}只")

# 生成 5 元素格式 FULL_STOCK_LIST: [code, name, market, industry, concepts]
items = []
for s in v4:
    code, name, market, industry, concepts = s[0], s[1], s[2], s[3], s[4]
    items.append(json.dumps([code, name, market, industry, concepts], ensure_ascii=False, separators=(',', ':')))

new_list = 'const FULL_STOCK_LIST = [' + ','.join(items) + '];'

# 替换 worker.js
with open(WORKER_PATH) as f:
    content = f.read()

old_pattern = r'const FULL_STOCK_LIST = \[\[.*?\]\];'
if not re.search(old_pattern, content, re.DOTALL):
    print("❌ 未找到 FULL_STOCK_LIST, 取代失败")
    exit(1)

new_content = re.sub(old_pattern, new_list, content, flags=re.DOTALL)
with open(WORKER_PATH, 'w') as f:
    f.write(new_content)

# 同步 _worker.js
with open(WORKER_PATH) as f:
    content = f.read()
with open(WORKER_PATH.replace('.js', '/_worker.js'), 'w') as f:
    f.write(content)

# 验证语法
import subprocess
r = subprocess.run(['node', '--check', WORKER_PATH], capture_output=True, text=True)
syntax_ok = r.returncode == 0

print(f"✓ FULL_STOCK_LIST 已更新 ({len(v4)}只,带真实概念)")
print(f"✓ _worker.js 已同步")
print(f"✓ node --check: {'PASS' if syntax_ok else 'FAIL'}")
if not syntax_ok:
    print(r.stderr)

# 统计概念覆盖率
with_concepts = sum(1 for s in v4 if s[4] and len(s[4]) > 0)
print(f"\n概念覆盖率: {with_concepts}/{len(v4)} ({with_concepts/len(v4)*100:.1f}%)")
if v4 and v4[0]:
    sample = v4[0]
    print(f"样本: {sample[0]} {sample[1]} → 概念: {sample[4][:5] if sample[4] else '(无)'}")
