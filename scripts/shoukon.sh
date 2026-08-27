#!/usr/bin/env bash
# 收口脚本：将 a-stock-website 合法在途改动提交并推送，清空脏树以解除 D19 红线 PAUSE。
# 用法：bash scripts/shoukon.sh
# 安全约束：排除循环运行时记忆(.workbuddy/automations/)、构建缓存、.env；命中密钥文件立即中止。
set -euo pipefail
cd /Users/ego_bai/.openclaw/workspace/a-stock-website

echo "=== 当前在途条目数 ==="
git status --porcelain | wc -l

git status --porcelain > /tmp/clair_status.txt
: > /tmp/clair_add.txt

while IFS= read -r line; do
  code="${line:0:2}"
  if [[ "$code" == R* || "$code" == C* ]]; then
    path="${line#* -> }"        # 重命名/复制：取目标路径
  else
    path="${line#?? }"          # 去掉两字符状态码+空格
  fi
  # 排除项
  case "$path" in
    .workbuddy/automations/*) continue;;
    node_modules/*|*/node_modules/*) continue;;
    *.swc|*.swc/*|.swc/*) continue;;
    dist/*|*/dist/*|build/*|*/build/*|.next/*|*/.next/*) continue;;
    *.env|*.env.*) continue;;
    playwright-report/*|test-results/*|ui-guard-report/*|coverage/*) continue;;
  esac
  # 密钥闸门
  case "$path" in
    *.pem|*.key|*.p12|id_rsa|*.secret|*credentials*) echo "ABORT secret-like: $path"; exit 9;;
  esac
  echo "$path" >> /tmp/clair_add.txt
done < /tmp/clair_status.txt

sort -u /tmp/clair_add.txt | while read -r p; do
  [ -n "$p" ] && git add -- "$p"
done

if git diff --cached --quiet; then
  echo "NO_STAGED_CHANGES（脏树已空或无可收口项）"
else
  git commit -m "chore: 收口在途改动（用户授权·排除循环运行时记忆与构建缓存）"
  bash scripts/git-push-retry.sh
fi

echo "=== 已收口文件数 ==="; wc -l < /tmp/clair_add.txt
echo "=== 收口后脏树条目数 ==="; git status --short | wc -l
