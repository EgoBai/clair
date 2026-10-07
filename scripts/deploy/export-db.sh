#!/usr/bin/env bash
# 澄观 Clair · 本地 PostgreSQL →托管 PostgreSQL 数据迁移
#
# 用途：把本机clair 库（5544 只股票 + daily_quotes 47.9 万行 / 372 交易日）
#       导出为可导入托管平台的 SQL dump。
#
# 为什么必须做这一步（不可跳过）：
#   后端 DATABASE_URL 缺失/不可达时会**静默退回 InMemoryDatabase**，
#   而内存库的行情是 generateQuotes() 用 Math.random 伪造的
#   （InMemoryDatabase.ts:294-340）。只部署容器不迁数据=
#   全站每只股票都是假K 线 + 假估值，比"接口 404"更危险（用户看不出是假的）。
#
# 用法：
#   1) 导出：  ./scripts/deploy/export-db.sh /tmp/clair-dump.sql
#   2) 在 Railway PostgreSQL 控制台（或 psql）导入：
#      psql "$RAILWAY_DATABASE_URL?sslmode=require" -f /tmp/clair-dump.sql
#      或用Railway 控制台的 SQL Editor 粘贴执行
#
# 校验（导入后必做）：见文件末尾的 SQL。

set -euo pipefail

PG_BIN="${PG_BIN:-/opt/homebrew/opt/postgresql@15/bin/psql}"
PG_DUMP="${PG_DUMP:-/opt/homebrew/opt/postgresql@15/bin/pg_dump}"
SOURCE_DB="${SOURCE_DB:-clair}"
OUT="${1:-/tmp/clair-dump.sql}"

if [ ! -x "$PG_DUMP" ]; then
  echo "找不到 pg_dump：$PG_DUMP" >&2
  echo "请设置 PG_DUMP 指向你的 pg_dump，或安装 postgresql@15" >&2
  exit 1
fi

echo "▸ 导出 $SOURCE_DB → $OUT"

# --clean --if-exists：目标库若有旧 schema 先清掉，避免残留脏表
# --no-owner --no-privileges：跨机器/跨账号导入必需（本地角色不存在于托管端）
# 原子性由导入侧保证：psql -1 -f（或 Railway SQL Editor 本身单事务执行）
"$PG_DUMP" -d "$SOURCE_DB" \
  --clean --if-exists --no-owner --no-privileges \
  -f "$OUT"

# 注意：变量紧跟全角括号时必须用 ${} 界定，否则 shell 会把「OUT（」当成变量名
SIZE=$(du -h "$OUT" | cut -f1)
echo "✓ 导出完成：${OUT}（${SIZE}）"

echo
echo "▸ 导出内容自检（应全部为真）"
"$PG_BIN" -d "$SOURCE_DB" -tAc "
  SELECT '  stocks='||count(*) FROM stocks
  UNION ALL SELECT '  daily_quotes='||count(*) FROM daily_quotes
  UNION ALL SELECT '  交易日='||count(DISTINCT trade_date) FROM daily_quotes;
"

cat <<'EOF'

▸ 导入目标库后，请跑这段 SQL 确认数据到位（不是可选，是必做）：
   SELECT count(*) AS stocks FROM stocks;              -- 期望 ≥ 5544
   SELECT count(*) AS quotes, count(DISTINCT trade_date) AS days FROM daily_quotes;
                                                     -- 期望 ≈ 478967 / 372
   SELECT trade_date, count(*) FROM daily_quotes
    GROUP BY trade_date ORDER BY trade_date DESC LIMIT 3;

▸ 然后验证应用层（不是只看数据库有数）：
   curl -s "$RAILWAY_URL/api/market/summary" | head -c 400
   → 必须看到 "dataSource":"real" 与非零 totalStocks；
     若看到 unavailable 或 totalStocks 异常，说明 DATABASE_URL 未注入，
     后端已静默退回内存库，此时页面上的每只股票都是 Math.random 假数据。
EOF
