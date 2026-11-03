#!/usr/bin/env bash
# ============================================================================
# scripts/dev/down.sh — 收工：只杀 up.sh 记录过的 PID
#
# 铁律：**不做任何 `pkill -f` 模式匹配**。历史上 `pkill -f "tsx src/index.ts"`
# 误杀过共享机上别人正在用的实例 —— 那条命令对所有跑同一条 dev 命令的进程都成立，
# 无法区分"我起的"和"别人起的"。本脚本因此只认 /tmp/clair-dev-*.pid 里的数字。
#
# 三重防误杀：
#   ① 只读 PID 文件，不做进程名匹配；
#   ② 杀之前用 lsof 反查「该 PID 是否正监听对应端口」，PID 被系统复用给别的进程时一律
#      ｜跳过不杀（不用 `ps` 读 cmdline：受限环境会禁掉 ps，且子串匹配本身不牢靠）；
#   ③ 只杀该 PID，不发 -g / 不杀进程组 —— 不会连带干掉 shell 里的其他东西。
#
# 用法：
#   bash scripts/dev/down.sh                                  # 收掉所有端口组
#   CLAIR_BACKEND_PORT=3471 CLAIR_FRONTEND_PORT=5271 bash scripts/dev/down.sh
# 退出码：0 处理完毕（含"本来就没在跑"）；1 有进程未能在超时内退出
# ============================================================================
set -uo pipefail

BACKEND_PORT=${CLAIR_BACKEND_PORT:-}
FRONTEND_PORT=${CLAIR_FRONTEND_PORT:-}

FILES=()
if [ -n "$BACKEND_PORT" ]; then FILES+=("/tmp/clair-dev-backend-$BACKEND_PORT.pid"); fi
if [ -n "$FRONTEND_PORT" ]; then FILES+=("/tmp/clair-dev-frontend-$FRONTEND_PORT.pid"); fi
if [ ${#FILES[@]} -eq 0 ]; then
  # 未指定端口 → 收全部（只枚举本脚本的命名空间，不会碰到别的东西）
  for f in /tmp/clair-dev-backend-*.pid /tmp/clair-dev-frontend-*.pid; do
    [ -e "$f" ] && FILES+=("$f")
  done
fi

if [ ${#FILES[@]} -eq 0 ]; then
  echo "NOTHING_RUNNING 没有 /tmp/clair-dev-*.pid 记录，无需收工"
  exit 0
fi

rc=0
for f in "${FILES[@]}"; do
  [ -f "$f" ] || continue
  pid=$(cat "$f" 2>/dev/null | tr -dc '0-9')
  if [ -z "$pid" ]; then
    echo "WARN $f 内容不是 PID，直接删除该记录文件"
    rm -f "$f"
    continue
  fi
  if ! kill -0 "$pid" 2>/dev/null; then
    echo "STALE $f 记录的 pid=$pid 已不存在，删除记录"
    rm -f "$f"
    continue
  fi
  # 身份核对：PID 必须是「正监听该端口」的那个进程。
  # 为什么不用 `ps -p PID -o command=`：① 某些受限环境（沙箱/无 TTY）会禁掉 ps；
  # ② ps 的输出是自由文本，靠子串匹配判断"是不是我的进程"本身就不牢靠。
  # 端口号写在文件名里（/tmp/clair-dev-<role>-<port>.pid），拿 lsof 反查监听者
  # 是最硬的身份证明：PID 若被系统复用给别的进程，它几乎不可能正好占着同一个端口。
  port=$(basename "$f" .pid | sed 's/.*-//')
  listeners=$(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | tr '\n' ' ')
  case " $listeners " in
    *" $pid "*)
      ;;
    *)
      echo "SKIP $f 记录的 pid=$pid 并未监听端口 ${port}（监听者: ${listeners:-无}），判定为已被复用，拒绝杀；删除记录"
      rm -f "$f"
      continue
      ;;
  esac
  kill "$pid" 2>/dev/null
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.5
  done
  if kill -0 "$pid" 2>/dev/null; then
    echo "FAIL pid=$pid 5s 内未退出（${f}），请人工确认后处理"
    rc=1
    continue
  fi
  echo "STOPPED pid=$pid （$(basename "$f")）"
  rm -f "$f"
  # 收工后端口若仍有监听者，说明"杀了记录的 PID 却没停掉服务"（典型原因：启动方式
  # 多套了一层包装进程）。这里只报告、不擅自扩大击杀范围 —— 端口上跑的可能是别人的东西。
  left=$(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | tr '\n' ' ')
  if [ -n "${left// /}" ]; then
    echo "WARN LEAK 端口 ${port} 仍有监听者 ${left}（不是本脚本记录的 PID，未处理）"
    rc=1
  fi
done
exit "$rc"
