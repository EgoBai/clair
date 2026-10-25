/**
 * 旧粒度归一：turnover % 10000 <> 0 → round(turnover/10000)*10000
 *
 * ## 背景（backfill-kline 提出，我独立复核后成立）
 * 全库 17,769 行 turnover 是「idx8×10000 未取整」形态（formB），与全库写入路径
 * DataSyncService.ts:910 `Math.round(turnoverWan) * WAN_TO_YUAN` 的 formA 口径不一致。
 *
 * ## 已验证的事实（scripts/data/probe-old-granularity.cjs / probe-upstream-precision.cjs）
 * - 采样 32 行：库值/1e4 与上游 idx8 **逐位相同**（0 误差）→ formB 是上游真值的无损表达
 * - 采样 60 行 formB：库值 == idx8×1e4 零丢失 60/60
 * - 上游 kline idx8 **恒带小数**（实测 1~2 位），故 formA 相对上游精确值固有偏差 ≤5000 元
 * - formB 归一后 == round(上游 idx8)×1e4，采样 32/32 ✓
 * → 归一 = 与既有 45 万行 formA 口径对齐，不引入新的偏差类别
 *
 * ## 边界
 * 1. 备份表 daily_quotes_granularity_bak_20261021（改前原值）
 * 2. 行级乐观锁：WHERE id=? AND turnover=?（被并发改过则中止，不覆盖）
 * 3. 并发守卫：库内有其他未提交事务则拒绝执行
 * 4. 零信息丢失论证：只改 turnover 一列，且改后值 == round(上游idx8)×1e4
 */
const { execFileSync } = require("node:child_process");
const APPLY = process.argv.includes("--apply");
const PSQL = "/opt/homebrew/opt/postgresql@15/bin/psql";
const DB = process.env.DB_URL ?? "clair";
const BAK = "daily_quotes_granularity_bak_20261021";
const sql = (q) => execFileSync(PSQL, ["-d", DB, "-t", "-A", "-F", "|", "-c", q], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 })
  .split("\n").filter(l => l.trim()).map(l => l.split("|"));

(async () => {
  console.log(`normalize-turnover-granularity  apply=${APPLY}`);

  const busy = sql(`SELECT count(*) FROM pg_stat_activity
    WHERE datname = current_database() AND pid <> pg_backend_pid()
      AND xact_start IS NOT NULL AND state <> 'idle'`);
  if (Number(busy[0]?.[0] ?? "0") > 0) { console.error("✗ 有其他未提交事务，拒绝执行"); process.exit(2); }
  console.log("并发守卫 ✓");

  const rows = sql(`SELECT id, turnover::text, stock_id::text, trade_date::text
    FROM daily_quotes
    WHERE turnover > 0 AND turnover % 10000 <> 0
    ORDER BY id`);
  console.log(`圈定行数: ${rows.length}`);

  // 干跑统计
  let changed = 0, same = 0, maxDelta = 0, sumDelta = 0;
  const byCreated = new Map();
  for (const [id, t, sid, td] of rows) {
    const v = +t;
    const nv = Math.round(v / 10000) * 10000;
    if (nv === v) { same++; continue; }
    changed++;
    const d = Math.abs(nv - v);
    maxDelta = Math.max(maxDelta, d);
    sumDelta += d;
    const k = td.slice(0, 7);
    byCreated.set(k, (byCreated.get(k) ?? 0) + 1);
  }
  console.log(`需改: ${changed}   幂等无变化: ${same}`);
  console.log(`单行最大偏差: ${maxDelta} 元   平均: ${(sumDelta / Math.max(1, changed)).toFixed(2)} 元`);
  console.log("按交易月份分布:");
  [...byCreated.entries()].sort().forEach(([k, v]) => console.log(`  ${k}: ${v}`));
  console.log("样例:");
  rows.slice(0, 6).forEach(([id, t, sid, td]) => {
    const v = +t;
    console.log(`  id=${id} ${td} ${t} → ${Math.round(v / 10000) * 10000}`);
  });

  if (!APPLY) { console.log("\n干跑结束（未加 --apply）。"); return; }

  // 备份
  const bakExists = sql(`SELECT to_regclass('${BAK}') IS NOT NULL`)[0][0];
  if (bakExists === "t") {
    const have = new Set(sql(`SELECT id FROM ${BAK}`).map(r => +r[0]));
    const ids = rows.map(r => +r[0]);
    const missing = ids.filter(i => !have.has(i));
    if (missing.length) {
      sql(`INSERT INTO ${BAK} SELECT id, turnover, stock_id, trade_date FROM daily_quotes WHERE id IN (${missing.join(",")})`);
      console.log(`备份表已存在，补备 ${missing.length} 行`);
    } else console.log(`备份表已存在: ${BAK}（已覆盖全部 ${ids.length} 行）`);
  } else {
    sql(`CREATE TABLE ${BAK} AS SELECT id, turnover, stock_id, trade_date FROM daily_quotes
      WHERE turnover > 0 AND turnover % 10000 <> 0`);
    console.log(`备份表已创建: ${BAK} (${sql(`SELECT count(*) FROM ${BAK}`)[0][0]} 行)`);
  }

  // 逐行乐观锁更新
  let done = 0;
  for (const [id, t] of rows) {
    const v = +t;
    const nv = Math.round(v / 10000) * 10000;
    if (nv === v) continue;
    const n = Number(sql(`WITH u AS (UPDATE daily_quotes SET turnover = ${nv}
      WHERE id = ${id} AND turnover = ${v} RETURNING id) SELECT count(*) FROM u`)[0]?.[0] ?? 0);
    if (n !== 1) { console.error(`✗ id=${id} 触达 ${n}（预期 1）—— 该行被并发改过，中止（已改 ${done}）`); process.exit(2); }
    done++;
    if (done % 2000 === 0) console.log(`  ... 已改 ${done}`);
  }
  console.log(`\n归一完成: ${done} 行`);

  console.log("\n=== 验证 ===");
  console.log(`  剩余 %10000<>0 的行: ${sql(`SELECT count(*) FROM daily_quotes WHERE turnover>0 AND turnover%10000<>0`)[0][0]}（应 0）`);
  console.log(`  备份行被改动数: ${sql(`SELECT count(*) FROM daily_quotes q JOIN ${BAK} b ON b.id=q.id WHERE q.turnover <> b.turnover`)[0][0]}（应 = ${done}）`);
  console.log(`  备份行仍与原值相同: ${sql(`SELECT count(*) FROM daily_quotes q JOIN ${BAK} b ON b.id=q.id WHERE q.turnover = b.turnover`)[0][0]}（应 0）`);
  console.log(`  全库 turnover>0 且 %10000=0 的行: ${sql(`SELECT count(*) FROM daily_quotes WHERE turnover>0 AND turnover%10000=0`)[0][0]}`);
  console.log(`  turnover=0 行数: ${sql(`SELECT count(*) FROM daily_quotes WHERE turnover=0`)[0][0]}（应 1）`);
  console.log(`  归一后总量偏差(元): ${sql(`SELECT sum(q.turnover-b.turnover)::text FROM daily_quotes q JOIN ${BAK} b ON b.id=q.id`)[0][0]}`);
})();
