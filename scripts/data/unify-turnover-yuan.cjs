#!/usr/bin/env node
/**
 * P0-TURNOVER-UNIT：全库 turnover 单位统一为「元」（万元簇 ×10000）
 *
 * ## 背景
 * 库内 turnover 存在两种单位并存：
 * - 元（r = turnover/(close*volume) ≈ 100）：采集器 DataSyncService.ts:364/:909 写入，正确
 * - 万元（r ≈ 0.01）：backfill 批次（含 2c365662f 的 215 行按 team-lead 当时误裁的万元口径）
 *
 * team-lead 2026-10-16 裁决：全库统一为「元」（前端 8+ 格式化点与后端引擎均假设元），
 * 万元簇 ×10000 迁移。判别式 r=turnover/(close_price*volume)，volume 单位手（1手=100股）。
 *
 * ## 圈定（2026-10-16 实测直方图，簇间无歧义）
 *   r<0.0001:5677  0.0001~0.005:3524（另一性质缺陷，本单不碰）
 *   0.0075~0.0125: 60,266 行 ← 本次迁移对象（预期 60,266，与工单完全一致）
 *   0.05~0.5:5  0.5~5:33,445（元但成交均价偏离收盘价，不动）
 *   50~200:254,024（元，正确，不动）
 *
 * ## 硬约束（team-lead 定）
 * 1. 行级判别（r 簇），严禁按日期段批量改 —— 同日存在元/万元混合
 * 2. 只 UPDATE turnover 一列；UPDATE WHERE 内二次校验 r 仍属万元簇
 * 3. 改前备份表 daily_quotes_turnover_unit_bak_20261016（id/trade_date/stock_id/turnover/close_price/volume）
 * 4. 分批 5000 行/批，批间校验实际更新数 = 预期数
 * 5. 不改任何 src/ 代码，不做 git 提交
 *
 * ## 用法
 *   node scripts/data/unify-turnover-yuan.cjs            # 干跑：只圈定报告
 *   node scripts/data/unify-turnover-yuan.cjs --apply    # 真正迁移
 *
 * ## 为什么是 .cjs 不是工单写的 .ts
 * fill-turnover-only.cjs 已记录：本机 npx tsx 会弹安装确认挂起，且 @shared/* 别名
 * 只在 backend/ 下解析。本脚本只需 psql，故刻意用纯 node + psql（同先例）。
 */
const { execFileSync } = require('node:child_process');

const APPLY = process.argv.includes('--apply');
const PSQL = process.env.PSQL_BIN ?? '/opt/homebrew/opt/postgresql@15/bin/psql';
const DB_URL = process.env.DATABASE_URL ?? 'clair';
const BATCH = 5000;
const BAK_TABLE = 'daily_quotes_turnover_unit_bak_20261016';

function sql(q) {
  return execFileSync(PSQL, ['-d', DB_URL, '-t', '-A', '-F', '|', '-c', q], {
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
  })
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => l.split('|'));
}

const WAN_LO = 0.0075, WAN_HI = 0.0125;
const GUARD = `close_price > 0 AND volume > 0 AND turnover > 0
  AND turnover / (close_price * volume) BETWEEN ${WAN_LO} AND ${WAN_HI}`;

async function main() {
  console.log(`P0-TURNOVER-UNIT 全库 turnover 统一为元（万元簇 ×10000）  apply=${APPLY}`);

  // ── 0. 并发守卫 ──
  const busy = sql(
    `SELECT count(*) FROM pg_stat_activity
     WHERE datname = current_database() AND pid <> pg_backend_pid()
       AND xact_start IS NOT NULL AND state <> 'idle'`);
  if (Number(busy[0]?.[0] ?? '0') > 0) {
    console.error(`✗ 拒绝执行：检测到 ${busy[0][0]} 个其他会话持有未提交事务`);
    process.exit(2);
  }
  console.log('并发守卫: 无其他未提交事务 ✓');

  // ── 1. 圈定（实时重算，不信任任何缓存） ──
  const rows = sql(`SELECT id FROM daily_quotes WHERE ${GUARD} ORDER BY id`);
  const ids = rows.map((r) => Number(r[0]));
  console.log(`圈定万元簇行数: ${ids.length}`);

  // ── 2. 备份表必须已存在且覆盖全部圈定行 ──
  const bakCnt = sql(`SELECT count(*) FROM ${BAK_TABLE}`)[0][0];
  if (Number(bakCnt) !== ids.length) {
    console.error(`✗ 备份表 ${BAK_TABLE} 行数(${bakCnt}) ≠ 圈定行数(${ids.length})，拒绝执行`);
    process.exit(2);
  }
  const missing = sql(
    `SELECT count(*) FROM ${BAK_TABLE} b WHERE NOT EXISTS
     (SELECT 1 FROM daily_quotes q WHERE q.id = b.id AND q.turnover = b.turnover)`)[0][0];
  if (Number(missing) > 0) {
    console.error(`✗ 备份表与当前库不一致（${missing} 行 turnover 已变化），拒绝执行`);
    process.exit(2);
  }
  console.log(`备份表校验: ${BAK_TABLE} ${bakCnt} 行，与当前库逐值一致 ✓`);

  if (!APPLY) {
    console.log('\n干跑结束（未加 --apply，数据库未被修改）。');
    return;
  }

  // ── 3. 分批迁移：批内二次校验 r 仍属万元簇 ──
  let done = 0;
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    const updated = sql(
      `WITH moved AS (
         UPDATE daily_quotes SET turnover = turnover * 10000
         WHERE id IN (${chunk.join(',')}) AND ${GUARD}
         RETURNING id)
       SELECT count(*) FROM moved`)[0][0];
    if (Number(updated) !== chunk.length) {
      console.error(`\n✗ 第 ${i / BATCH + 1} 批预期 ${chunk.length} 行实改 ${updated} 行，中止（已改 ${done} 行，备份表可回滚）`);
      process.exit(2);
    }
    done += Number(updated);
    console.log(`  批 ${Math.floor(i / BATCH) + 1}/${Math.ceil(ids.length / BATCH)}: +${updated} (累计 ${done})`);
  }
  console.log(`\n迁移完成: ${done} 行 turnover ×10000（仅 turnover 列）`);

  // ── 4. 验证 ──
  const residue = sql(`SELECT count(*) FROM daily_quotes WHERE ${GUARD}`)[0][0];
  console.log(`\n=== 验证 ===`);
  console.log(`  a. 万元簇残留: ${residue}  ${Number(residue) === 0 ? '✓' : '✗ 打回'}`);

  const yuanCnt = sql(
    `SELECT count(*) FROM daily_quotes
     WHERE close_price > 0 AND volume > 0 AND turnover > 0
       AND turnover / (close_price * volume) BETWEEN 50 AND 200`)[0][0];
  console.log(`  元簇(50~200)行数: ${yuanCnt}（迁移前 254,024，应 ≈ ${254024 + done}）`);

  const backupDiff = sql(
    `SELECT count(*) FROM ${BAK_TABLE} b JOIN daily_quotes q ON q.id = b.id
     WHERE q.turnover <> b.turnover * 10000`)[0][0];
  console.log(`  备份对照不一致行: ${backupDiff}  ${Number(backupDiff) === 0 ? '✓ 全部 ×10000 精确' : '✗'}`);
}

main().catch((e) => { console.error('失败:', e); process.exit(1); });
