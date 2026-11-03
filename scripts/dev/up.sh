#!/usr/bin/env bash
# ============================================================================
# scripts/dev/up.sh — 一键起本地开发环境（后端 + 前端），后台常驻 + 就绪探测
#
# 为什么要这个脚本：此前起本地环境靠手敲两条 `npm run dev`，于是
#   ① 忘了起后端 → 前端页面全空，但没人报错；
#   ② 起完不知道"到底起来了没有"，靠肉眼刷浏览器；
#   ③ 收工时用 `pkill -f "tsx src/index.ts"` 一把收 → **误杀别人正在用的实例**
#      （共享开发机上不止一个 Agent 在跑同一条命令，进程名完全一样）。
# 所以本脚本对每条约束都做了明确处理：
#   · 端口没就绪就一直等到超时，超时算失败（不"看起来起起来了"）；
#   · 端口被别人占着就**报错退出**，绝不抢、绝不杀；
#   · PID 精确记录到 /tmp/clair-dev-<role>-<port>.pid，down.sh 只读这些文件，
#     **不做任何模式匹配**，因此不可能误杀同名的其他进程。
#
# 用法：
#   bash scripts/dev/up.sh                       # 后端 3001 + 前端 5173
#   CLAIR_BACKEND_PORT=3471 CLAIR_FRONTEND_PORT=5271 bash scripts/dev/up.sh
#   bash scripts/dev/down.sh                     # 收工（只杀上面记录的 PID）
#
# 退出码：0 两个服务都已就绪（或本来就在跑）；1 启动/等待失败（已回收本次起的进程）
# ============================================================================
set -uo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
BACKEND_PORT=${CLAIR_BACKEND_PORT:-3001}
FRONTEND_PORT=${CLAIR_FRONTEND_PORT:-5173}
WAIT=${CLAIR_DEV_WAIT:-90}

BE_PID=/tmp/clair-dev-backend-$BACKEND_PORT.pid
FE_PID=/tmp/clair-dev-frontend-$FRONTEND_PORT.pid
BE_LOG=/tmp/clair-dev-backend-$BACKEND_PORT.log
FE_LOG=/tmp/clair-dev-frontend-$FRONTEND_PORT.log

TRACKED_PIDS=()

cleanup_on_fail() {
  echo "FAIL: $1"
  for p in "${TRACKED_PIDS[@]:-}"; do
    [ -n "$p" ] && kill "$p" 2>/dev/null && echo "  已回收本次启动的 pid=$p"
  done
  exit 1
}

port_busy() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

# 只认 curl 的返回码：000 表示连不上，其余（含 5xx）都说明进程已在监听。
# 后端 /health 在 DB 不可用时按设计返回 503，那时"监听成功"仍是事实，
# 因此这里不把 503 当失败，而是把状态码如实打出来。
http_code() { curl --noproxy '*' -s -o /dev/null -m 2 -w '%{http_code}' "$1" 2>/dev/null || true; }

wait_ready() { # $1=url $2=名字 $3=最多等几秒
  local i=0
  while [ "$i" -lt "$3" ]; do
    local c
    c=$(http_code "$1")
    if [ -n "$c" ] && [ "$c" != "000" ]; then echo "$c"; return 0; fi
    i=$((i + 1))
    sleep 1
  done
  return 1
}

# ---------------------------------------------------------------- 幂等检查
if [ -f "$BE_PID" ] && kill -0 "$(cat "$BE_PID")" 2>/dev/null; then
  echo "SKIP 后端已在运行（pid=$(cat "$BE_PID")，端口 ${BACKEND_PORT}）；如需重启先跑 scripts/dev/down.sh"
else
  if port_busy "$BACKEND_PORT"; then
    cleanup_on_fail "端口 $BACKEND_PORT 已被其他进程占用（不是本脚本起的，拒绝抢占）：$(lsof -nP -iTCP:"$BACKEND_PORT" -sTCP:LISTEN | tail -1)"
  fi
  echo "START 后端 PORT=$BACKEND_PORT → $BE_LOG"
  # 为什么是 `node --import tsx` 而不是 `./node_modules/.bin/tsx`：
  # .bin/tsx 是个**包装进程**，它会再 fork 一个 node 子进程去跑业务代码，
  # 于是 pid 文件里记的是包装进程、真正监听端口的是它的子进程（实测过：
  # 记录 42891，监听者 42903）。那样 down.sh 杀包装进程只能算"碰巧干净"，
  # 一旦包装进程先退出，子进程就成孤儿、PID 文件彻底失准。
  # --import tsx 让 node 原地装载 TS 支持，单进程，pid 即监听者。
  ( cd "$ROOT/backend" && PORT="$BACKEND_PORT" exec nohup node --import tsx src/index.ts ) >"$BE_LOG" 2>&1 &
  echo $! >"$BE_PID"
  TRACKED_PIDS+=("$(cat "$BE_PID")")
fi

code=$(wait_ready "http://127.0.0.1:$BACKEND_PORT/health" backend "$WAIT") ||
  cleanup_on_fail "后端 ${WAIT}s 内未在 $BACKEND_PORT 就绪，日志尾部：$(tail -5 "$BE_LOG" 2>/dev/null)"
echo "READY 后端 http://127.0.0.1:$BACKEND_PORT/health → HTTP $code (pid=$(cat "$BE_PID"))"

# 自检：记录下来的 PID 必须**就是**监听该端口的那个进程，否则 down.sh 的
# 「只杀我自己记录的 PID」这条契约就名存实亡。宁可当场吵出来，也不要留一个
# 收工后还在偷偷跑的服务。
assert_owner() { # $1=port $2=pidfile $3=名字
  local want got
  want=$(cat "$2" 2>/dev/null | tr -dc '0-9')
  got=$(lsof -nP -tiTCP:"$1" -sTCP:LISTEN 2>/dev/null | tr '\n' ' ')
  case " $got " in
    *" $want "*) echo "OWNER_OK $3 pid=$want 是端口 $1 的监听者" ;;
    *) echo "WARN PID_MISMATCH $3 记录 pid=${want}，实际监听者=${got:-无}；down.sh 可能杀不干净，请检查启动方式" ;;
  esac
}
assert_owner "$BACKEND_PORT" "$BE_PID" 后端

# ---------------------------------------------------------------- 前端
if [ -f "$FE_PID" ] && kill -0 "$(cat "$FE_PID")" 2>/dev/null; then
  echo "SKIP 前端已在运行（pid=$(cat "$FE_PID")，端口 ${FRONTEND_PORT}）；如需重启先跑 scripts/dev/down.sh"
else
  if port_busy "$FRONTEND_PORT"; then
    cleanup_on_fail "端口 $FRONTEND_PORT 已被其他进程占用（不是本脚本起的，拒绝抢占）"
  fi
  echo "START 前端 --port $FRONTEND_PORT → $FE_LOG"
  # --strictPort：5173 被占时让 vite 立刻失败，而不是静默换到 5174 让人以为起对了
  ( cd "$ROOT/frontend" && exec nohup ./node_modules/.bin/vite --port "$FRONTEND_PORT" --strictPort --host 127.0.0.1 ) >"$FE_LOG" 2>&1 &
  echo $! >"$FE_PID"
  TRACKED_PIDS+=("$(cat "$FE_PID")")
fi

code=$(wait_ready "http://127.0.0.1:$FRONTEND_PORT/" frontend "$WAIT") ||
  cleanup_on_fail "前端 ${WAIT}s 内未在 $FRONTEND_PORT 就绪，日志尾部：$(tail -5 "$FE_LOG" 2>/dev/null)"
echo "READY 前端 http://127.0.0.1:$FRONTEND_PORT/ → HTTP $code (pid=$(cat "$FE_PID"))"
assert_owner "$FRONTEND_PORT" "$FE_PID" 前端

echo "OK 后端 pid=$(cat "$BE_PID") 前端 pid=$(cat "$FE_PID")；收工跑 bash scripts/dev/down.sh"
