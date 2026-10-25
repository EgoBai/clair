#!/usr/bin/env bash
# =============================================================================
# 澄观 Clair · 本地 PostgreSQL → Render PostgreSQL 数据迁移脚本
#
# 为什么需要它：Render 上一开始是**空库**。后端连上空库不会崩，
#   但 /health 会返回 dbType='postgresql' 且查不到任何行情，
#   与连内存库在用户侧看起来一样「功能不可用」。所以历史数据必须搬过去。
#
# 使用前提（缺一不可）：
#   1) 源端：本机 PostgreSQL 15 已在跑
#        pg_ctl -D /opt/homebrew/var/postgresql@15 -l /tmp/pg-startup.log start
#      若报 postmaster.pid 残留 → 确认进程已死后再删 pid 文件。
#      socket 在 /tmp（Homebrew 默认），故默认 --source-host /tmp。
#   2) 工具：pg_dump / pg_restore / psql 需在 PATH 里，或设 PGBIN。
#         export PATH=/opt/homebrew/opt/postgresql@15/bin:$PATH
#      三者版本建议 >= 源库主版本（本机实测 15.17）。
#   3) 目标端：Render Postgres 实例已创建（render.yaml 的 databases 段），
#      从 Dashboard → 数据库 Info 页复制 **External Database URL**
#      （本机不在 Render 私有网络内，必须用 External 而不是 Internal）。
#   4) 目标库网络可达；若 Render 侧配了 ipAllowList，需先把本机公网 IP 加进去。
#
# ⚠️ 风险（重要，执行前请读完）：
#   - 还原使用 pg_restore --clean --if-exists，会**先 DROP 目标库同名表再重建**，
#     即目标库里同名表的现有数据会被**覆盖**；目标库里其它不同名的对象不受影响。
#   - 目标方向的写入是**不可逆**的（Render 快照按 plan 保留 3 天，且 Duke 不 Handling）。
#     正式执行前请务必先跑 --dry-run，并在 Render 上确认已有近期快照。
#   - 本脚本**不会**动源库（只读 pg_dump），也不会 DROP 目标库本身，只动同名表。
#
# 默认只迁 **10 张核心表**（--mode core），不迁 *_bak_*/archive_*/tmp_* 这类
#   数据清洗过程里留下的归档表（实测 11 张、合计 91,049 行、本地约 8MB）。
#
# 使用：
#   scripts/deploy/render-migrate-data.sh --source-db clair --target-url <url> --out /tmp/x.dump --dry-run
#   scripts/deploy/render-migrate-data.sh --source-db clair --target-url <url> --out /tmp/x.dump
#   scripts/deploy/render-migrate-data.sh --source-db clair --target-url <url> --out /tmp/x.dump --dump-only
#   scripts/deploy/render-migrate-data.sh --mode full --source-db clair --target-url <url> --out /tmp/x.dump
# =============================================================================

set -euo pipefail

# ------------------------------ 参数默认值 ------------------------------
SOURCE_DB=""
SOURCE_HOST="${SOURCE_HOST:-/tmp}"
SOURCE_PORT="${SOURCE_PORT:-5432}"
SOURCE_USER="${SOURCE_USER:-$(whoami)}"
SOURCE_URL=""                 # 也可用完整 URL 指定源端（优先级高于上面四个）
TARGET_URL=""
OUT_FILE=""
MODE="core"                   # core | full
DRY_RUN=0
DUMP_ONLY=0
NO_RESTORE=0                  # 兼容别名
PGBIN="${PGBIN:-}"

# 10 张核心业务表（后端运行时实际读写的对象；视图与两个触发器函数另行处理）
CORE_TABLES=(
  stocks daily_quotes concepts industries alerts watchlist
  money_flow minute_quotes market_snapshots collection_logs
)
# 4 个只读视图（init-db.sql 里定义，后端运行期未直接引用，但 Schema 完整性需要）
CORE_VIEWS=(
  v_market_summary v_top_gainers v_top_losers v_top_turnover
)

usage() {
  sed -n '2,52p' "$0" | sed 's/^# \{0,1\}//'
  cat <<'EOM'

参数：
  --source-db <name>      源数据库名（必填，本机实测真源为 clair）
  --source-url <url>      源端完整连接串（可选；给出则忽略 --source-* 分项）
  --source-host <host>    源端主机，默认 /tmp（unix socket）
  --source-port <port>    源端端口，默认 5432
  --source-user <user>    源端用户名，默认当前系统用户
  --target-url <url>      目标 Render PostgreSQL 连接串（必填，postgresql://...）
  --out <path>            dump 文件路径（默认 /tmp/clair-migrate-<mode>-<ts>.dump）
  --mode core|full        core=仅 10 张核心表+4 视图（默认）；full=整库（含 dblink 扩展与归档表）
  --dry-run               只打印计划，不连数据库、不落盘
  --dump-only             只导出，不还原到目标库
  -h | --help             显示本帮助
EOM
}

# ------------------------------ 参数解析 ------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --source-db)   SOURCE_DB="${2:-}";  shift 2;;
    --source-url)  SOURCE_URL="${2:-}"; shift 2;;
    --source-host) SOURCE_HOST="${2:-}"; shift 2;;
    --source-port) SOURCE_PORT="${2:-}"; shift 2;;
    --source-user) SOURCE_USER="${2:-}"; shift 2;;
    --target-url)  TARGET_URL="${2:-}"; shift 2;;
    --out)         OUT_FILE="${2:-}";   shift 2;;
    --mode)        MODE="${2:-}";       shift 2;;
    --dry-run)     DRY_RUN=1;           shift;;
    --dump-only)   DUMP_ONLY=1;         shift;;
    --no-restore)  NO_RESTORE=1;        shift;;
    -h|--help)     usage; exit 0;;
    *) echo "✗ 未知参数: $1（用 --help 查看用法）" >&2; exit 2;;
  esac
done

# ------------------------------ 前置校验 ------------------------------
[[ -n "$PGBIN" ]] && PATH="$PGBIN:$PATH"

for bin in pg_dump pg_restore psql; do
  command -v "$bin" >/dev/null 2>&1 || {
    echo "✗ 找不到 $bin。请先 export PATH=/opt/homebrew/opt/postgresql@15/bin:\$PATH" >&2
    exit 3
  }
done

if [[ -z "$SOURCE_DB" && -z "$SOURCE_URL" ]]; then
  echo "✗ 必须显式指定源库：--source-db <name> 或 --source-url <url>" >&2
  echo "  本机候选库可用 psql -h /tmp -l 查看；本次迁移实测真源为 'clair'。" >&2
  exit 2
fi

# 目标 URL 校验：非空 + 形如 postgresql://... 且解析得出 host
if [[ -z "$TARGET_URL" ]]; then
  echo "✗ 缺少 --target-url（目标 Render PostgreSQL 连接串）" >&2
  exit 2
fi
if [[ ! "$TARGET_URL" =~ ^postgres(ql)?:// ]]; then
  echo "✗ --target-url 不是 postgresql:// 形式: ${TARGET_URL%%\/\/*}://***" >&2
  exit 2
fi
TARGET_HOST="$(node -e '
  const u = new URL(process.argv[1]);
  process.stdout.write(u.hostname || "");
' "$TARGET_URL" 2>/dev/null || echo "")"
if [[ -z "$TARGET_HOST" ]]; then
  echo "✗ --target-url 解析不出 host，请检查连接串是否完整" >&2
  exit 2
fi
# 掩码后再打印，避免口令落到终端/日志
TARGET_URL_MASKED="$(printf '%s' "$TARGET_URL" | sed -E 's#(postgres(ql)?://[^:/@]*):[^@]*@#\1:***@#')"

# 组装源端连接串
if [[ -z "$SOURCE_URL" ]]; then
  if [[ "$SOURCE_HOST" == /* ]]; then
    # unix socket 形式：host 需 URL 编码
    SOURCE_URL="postgresql://${SOURCE_USER}@%2F${SOURCE_HOST#/}:${SOURCE_PORT}/${SOURCE_DB}"
    SOURCE_DISPLAY="postgresql://${SOURCE_USER}@${SOURCE_HOST}:${SOURCE_PORT}/${SOURCE_DB}"
  else
    SOURCE_URL="postgresql://${SOURCE_USER}@${SOURCE_HOST}:${SOURCE_PORT}/${SOURCE_DB}"
    SOURCE_DISPLAY="$SOURCE_URL"
  fi
else
  SOURCE_DISPLAY="$(printf '%s' "$SOURCE_URL" | sed -E 's#(postgres(ql)?://[^:/@]*):[^@]*@#\1:***@#')"
fi

[[ -n "$OUT_FILE" ]] || OUT_FILE="/tmp/clair-migrate-${MODE}-$(date +%Y%m%d-%H%M%S).dump"

# 拼装 pg_dump 的表选择参数
DUMP_ARGS=()
if [[ "$MODE" == "core" ]]; then
  for t in "${CORE_TABLES[@]}" "${CORE_VIEWS[@]}"; do DUMP_ARGS+=( -t "$t" ); done
elif [[ "$MODE" == "full" ]]; then
  DUMP_ARGS=()
else
  echo "✗ --mode 只接受 core 或 full，收到: $MODE" >&2; exit 2
fi

# ------------------------------------------------------------------
# dry-run：只打印计划
# ------------------------------------------------------------------
if [[ "$DRY_RUN" -eq 1 ]]; then
  cat <<EOM
==================== DRY RUN（不落盘、不连接任何数据库）====================
  源端      : ${SOURCE_DISPLAY}
  源端模式  : ${MODE}（core=10 表 + 4 视图；full=整库）
  目标端    : ${TARGET_URL_MASKED}
  目标 host : ${TARGET_HOST}
  dump 路径 : ${OUT_FILE}

将依次执行：
  1) 导出（自定义格式 -Fc，压缩）
     pg_dump --no-owner --no-privileges -Fc ${DUMP_ARGS[*]} -f '${OUT_FILE}' '<源端连接串>'
  2) 结构校验
     pg_restore --list '${OUT_FILE}'
EOM
  if [[ "$DUMP_ONLY" -eq 1 || "$NO_RESTORE" -eq 1 ]]; then
    echo "  3) 还原：已指定 --dump-only/--no-restore，跳过"
  else
    cat <<'EOM'
  3) 目标库预置触发器依赖函数（pg_dump -t 不带出函数，缺它会导致
     CREATE TRIGGER 失败；此步为 CREATE OR REPLACE，幂等）
     psql '<目标连接串>' -v ON_ERROR_STOP=1 <<< CREATE OR REPLACE FUNCTION public.update_updated_at() ...
                                                 CREATE OR REPLACE FUNCTION public.update_updated_at_column() ...
  4) 还原（会 DROP 并重建目标库同名表）
     pg_restore --clean --if-exists --no-owner --dbname '<目标连接串>' '<dump 文件>'
  5) 行数校验（见下方 SQL）
EOM
  fi
  cat <<'EOM'

还原后校验 SQL（期望值与本机实测一致）：
  SELECT count(*) FROM stocks;         -- 期望 5546
  SELECT count(*) FROM daily_quotes;   -- 期望 503534
  SELECT count(*) FROM concepts;       -- 期望 808
  SELECT max(trade_date) FROM daily_quotes;  -- 期望 2026-10-23
========================================================================
Dry run 结束，未执行任何真实操作。去掉 --dry-run 才会真正跑。
EOM
  exit 0
fi

# ------------------------------------------------------------------
# 真实执行
# ------------------------------------------------------------------
log() { printf '\n\033[1m[%s]\033[0m %s\n' "$(date +%H:%M:%S)" "$*"; }

DUMP_START=$(date +%s)
log "1/4 导出源库 ${SOURCE_DISPLAY} → ${OUT_FILE}"
set -x
pg_dump --no-owner --no-privileges -Fc "${DUMP_ARGS[@]}" -f "$OUT_FILE" "$SOURCE_URL"
set +x
DUMP_END=$(date +%s)
DUMP_SIZE=$(wc -c < "$OUT_FILE" | tr -d ' ')
echo "✓ 导出完成：$(du -h "$OUT_FILE" | cut -f1)（${DUMP_SIZE} bytes），耗时 $((DUMP_END-DUMP_START))s"

log "2/4 校验 dump 可读性（pg_restore --list）"
pg_restore --list "$OUT_FILE" | sed -n '1,12p'
TOC_COUNT=$(pg_restore --list "$OUT_FILE" | grep -c "TABLE DATA" || true)
echo "✓ dump 可读，TABLE DATA 条目数：${TOC_COUNT}"

if [[ "$DUMP_ONLY" -eq 1 || "$NO_RESTORE" -eq 1 ]]; then
  log "已指定 --dump-only，跳过还原"
  exit 0
fi

RESTORE_START=$(date +%s)
log "3/4 目标库预置触发器依赖函数（幂等；缺它会让 CREATE TRIGGER 失败）"
# 依据：本机实测 —— pg_dump -t 会带出 TRIGGER trigger_stocks_updated_at，
# 但不带出它依赖的 update_updated_at()/update_updated_at_column()，
# 直接 pg_restore 会报 "ERROR: function public.update_updated_at() does not exist"。
psql "$TARGET_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
CREATE OR REPLACE FUNCTION public.update_updated_at()
  RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
  RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = CURRENT_TIMESTAMP; RETURN NEW; END; $$;
SQL

log "4/4 还原到目标 Render PostgreSQL（--clean --if-exists：先 DROP 同名表再重建）"
set -x
pg_restore --clean --if-exists --no-owner --dbname "$TARGET_URL" "$OUT_FILE"
set +x
RESTORE_END=$(date +%s)
echo "✓ 还原完成，耗时 $((RESTORE_END-RESTORE_START))s"

log "还原后行数校验"
psql "$TARGET_URL" -At -F' | ' -c "
SELECT 'stocks'        AS tbl, count(*)::text AS rows FROM stocks
UNION ALL SELECT 'daily_quotes',  count(*)::text FROM daily_quotes
UNION ALL SELECT 'concepts',      count(*)::text FROM concepts
UNION ALL SELECT 'max(trade_date)', max(trade_date)::text FROM daily_quotes;"
echo
echo "期望（本机源库实测）：stocks=5546  daily_quotes=503534  concepts=808  max(trade_date)=2026-10-23"
echo "若行数一致，即可把 VITE_API_BASE 切到 Render 域名（见 RENDER-DEPLOY.md 第 6 节）。"
