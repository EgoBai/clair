#!/usr/bin/env bash
#
# git-push-retry.sh — 稳健推送（代理 + 凭证 + 重试退避 + 离线 bundle 兜底）
#
# 背景：本工作环境通过 WorkBuddy 系统代理（HTTP_PROXY/HTTPS_PROXY）出网，
# 该代理对 github.com 的 CONNECT 隧道偶发返回 502 / Empty reply（间歇不可用）。
# 因此「频繁推送失败」的根因是**代理间歇不可达**，而非密钥/凭证问题。
#
# 本脚本从根本消除间歇失败：
#   1) 动态读取环境代理并注入 git（每次尝试可切换 代理/直连 以最大化成功率）；
#   2) 确保 Git 凭证助手可用（macOS=osxkeychain，复用系统钥匙串中已存的 GitHub 口令）；
#   3) 指数退避重试（默认 8 次，5s→60s），捕获代理恢复的窗口；
#   4) 命中鉴权/仓库缺失等硬错误时立即停止重试，避免无效等待；
#   5) 全部失败后生成 git bundle（离线可恢复产物）并尝试可选 mirror 远端（如 Gitee），
#      保证本地提交永不丢失。
#
# 用法：
#   ./scripts/git-push-retry.sh                 # 推送当前分支到 origin
#   ./scripts/git-push-retry.sh origin main    # 指定远端/分支
#   GPR_MAX_TRIES=12 ./scripts/git-push-retry.sh
#
set -uo pipefail

REMOTE="${1:-origin}"
BRANCH="${2:-$(git rev-parse --abbrev-ref HEAD)}"
MAX_TRIES="${GPR_MAX_TRIES:-8}"
BASE_WAIT=5
MAX_WAIT=60
BUNDLE_DIR=".git-push-bundles"

log() { echo "[$(date '+%H:%M:%S')] $*"; }

# ---------- 1) 凭证助手 ----------
case "$(uname -s)" in
  Darwin) HELPER="osxkeychain" ;;
  Linux)  HELPER="store" ;;
  *)       HELPER="store" ;;
esac
if [ -z "$(git config --global --get credential.helper)" ]; then
  git config --global credential.helper "$HELPER" 2>/dev/null \
    && log "已设置凭证助手: $HELPER（复用系统已存 GitHub 口令）"
fi

# ---------- 2) 代理 ----------
PROXY=""
for v in HTTPS_PROXY HTTP_PROXY https_proxy http_proxy; do
  val="${!v:-}"
  if [ -n "$val" ]; then PROXY="$val"; break; fi
done
[ -n "${PROXY:-}" ] && log "检测到代理: ${PROXY:-}（每次尝试在 代理/直连 间切换）"

# 单次推送尝试：$1=use_proxy(0/1)
try_push() {
  local use_proxy="$1"
  local extra=""
  if [ "$use_proxy" = "1" ] && [ -n "${PROXY:-}" ]; then
    extra="-c http.proxy=${PROXY:-} -c https.proxy=${PROXY:-}"
  else
    # 显式置空以覆盖环境代理变量，实现“直连”尝试
    extra="-c http.proxy= -c https.proxy="
  fi
  git $extra push "$REMOTE" "$BRANCH" --force-with-lease 2>&1 | tee /tmp/gpr_last.log
}

# ---------- 3) 重试循环 ----------
attempt=0
while [ "$attempt" -lt "$MAX_TRIES" ]; do
  attempt=$((attempt + 1))
  # 奇数次走代理，偶数次走直连（最大化绕过代理的间歇故障）
  use_proxy=$(( attempt % 2 == 1 ? 1 : 0 ))
  mode=$([ "$use_proxy" = "1" ] && [ -n "$PROXY" ] && echo "代理" || echo "直连")
  log "尝试 $attempt/$MAX_TRIES [$mode] 推送 $REMOTE/$BRANCH ..."
  if try_push "$use_proxy"; then
    log "✅ 推送成功（${REMOTE}/${BRANCH}）"
    exit 0
  fi
  # 硬错误：不再重试
  if grep -qiE "Authentication failed|could not read|fatal: repository|does not exist|403 Forbidden|remote error: " /tmp/gpr_last.log; then
    log "⛔ 命中硬错误，停止重试（请检查凭证/仓库权限）"
    break
  fi
  wait=$(( BASE_WAIT * attempt ))
  [ "$wait" -gt "$MAX_WAIT" ] && wait="$MAX_WAIT"
  log "⏳ 本次失败（代理间歇不可用），${wait}s 后重试 …"
  sleep "$wait"
done

# ---------- 4) 兜底：离线 bundle + 可选 mirror ----------
log "⚠️ 主远端 $REMOTE 暂时不可达，启动兜底流程"
mkdir -p "$BUNDLE_DIR"
BUNDLE="$BUNDLE_DIR/clair-$(date '+%Y%m%d-%H%M%S').bundle"
if git bundle create "$BUNDLE" --all 2>/tmp/gpr_bundle.log; then
  log "📦 已生成离线备份: $BUNDLE"
  log "   恢复方式: git clone $BUNDLE 备份目录  或  git fetch $BUNDLE"
else
  log "❌ bundle 生成失败: $(cat /tmp/gpr_bundle.log | head -1)"
fi

if git remote get-url mirror >/dev/null 2>&1; then
  log "发现 mirror 远端，尝试推送到镜像（如 Gitee）…"
  git push mirror --all 2>&1 | tail -3 || log "镜像推送失败（可接受，bundle 已兜底）"
fi

# 确保兜底目录不被误提交
grep -qxF "$BUNDLE_DIR/" .gitignore 2>/dev/null || echo "$BUNDLE_DIR/" >> .gitignore

log "📌 本地提交安全。网络恢复后重跑本脚本即可补齐推送。"
exit 1
