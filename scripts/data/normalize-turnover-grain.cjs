#!/usr/bin/env node
/**
 * P0-TURNOVER-GRAIN：把「未 round 的旧粒度」turnover 归一化到整数万元
 *
 * ## 背景（用户决策 D27：维持元口径）
 * 库内 `daily_quotes.turnover` 权威口径是**元**，由上游万元值
 * `idx8 × WAN_TO_YUAN(10000)` 得到。K线写入路径用的是 **round 口径**：
 *   `Math.round(turnoverWan) * WAN_TO_YUAN`  →  整数万元
 * 但历史上若干批次写入时用的是**非 round 口径**（`turnoverWan * 10000`），
 * 结果同一张表里并存两种粒度。
 *
 * ## 修复前的实际分布（2026-10-22 实测，共 17,769 行）
 *   写入日      行数
 *   2026-10-09  15390
 *   2026-10-12   2190
 *   2026-06-09    171
 *   2026-05-31     18
 *
 * ## 安全性核查（修复前已做，勿跳）
 * 用比值 r = turnover/(close_price × volume) 分层确认这些行**不是**单位错误：
 *   - r_normal（0.9 ~ 111.6）：17,764 行 → 主板个股 r≈100（volume 单位为手），
 *     科创板 r≈1（volume 单位为股）。**都是正确的元口径**，只是没 round。
 *   - r_other（r≈0.1）：5 行 → 全部是指数行（399001.SZ / 399006.SZ）。
 *     close_price 是**点位**不是股价，r 天然偏离 100， turnover 本身正确。
 *   - 万元簇（r≈1e4，即双乘污染）：**0 行**
 *
 * ## 影响量级
 * 每行差值 ≤ 5,000 元（round 到万元的舍入半径），而 turnover 典型量级 1e7~1e11，
 * 相对误差 < 0.001%。纯机械操作，不改变任何行的语义。
 * 注意：早期报告说的「每行差 ≤100 元」不准确，正确上界是 5,000 元。
 *
 * ## 边界：不碰 turnover=0
 * `turnover=0` 单列统计，不算单位违规。唯一一行是 PT金田A @2001-08-10
 * （2002 年退市股，上游无数据）。按诚实数据纪律保持 0 列明，**不硬造**。
 *
 * ## 回滚
 * 改前备份：/tmp/clair-backups/turnover-oldgrain-before-20261022.psv
 *   格式 `id|stock_id|trade_date|turnover`
 * 回滚方式：按备份逐行 UPDATE 还原 turnover。
 *
 * ## 验证
 * 运行 scripts/data/check-turnover-unit.ts 应报「万元簇违规 0 行，未归类 0 行」。
 */

const { execFileSync } = require('node:child_process');

const PSQL = process.env.PSQL_BIN || '/opt/homebrew/opt/postgresql@15/bin/psql';
const DB = process.env.DB_NAME || 'clair';
const DRY_RUN = process.argv.includes('--dry-run');

/** 执行 SQL 并返回 stdout；失败直接抛（带 stderr） */
function sql(q) {
  return execFileSync(PSQL, ['-h', '/tmp', '-d', DB, '-t', '-A', '-F', '|', '-c', q], {
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
  });
}

(async () => {
  const before = sql(
    'SELECT count(*) FROM daily_quotes WHERE turnover > 0 AND turnover % 10000 <> 0'
  ).trim();
  console.log(`待归一化行数: ${before}`);

  if (Number(before) === 0) {
    console.log('无非整数万元行，无需归一化（幂等）');
    return;
  }

  // 修复前的安全自查：确认没有双乘污染行（r≈1e4）
  const suspect = sql(
    `SELECT count(*) FROM daily_quotes
     WHERE turnover > 0 AND turnover % 10000 <> 0
       AND volume > 0 AND close_price > 0
       AND turnover / (close_price * volume) BETWEEN 5000 AND 200000`
  ).trim();
  if (Number(suspect) > 0) {
    throw new Error(
      `检出 ${suspect} 行疑似双乘污染（r≈1e4）。` +
        '这是单位错误而非粒度问题，归一化会掩盖它 —— 请先修单位再跑本脚本'
    );
  }
  console.log('安全自查通过：无双乘污染行');

  if (DRY_RUN) {
    console.log('[DRY RUN] 将执行: UPDATE daily_quotes SET turnover = round(turnover/10000)*10000 WHERE turnover>0 AND turnover%10000<>0');
    return;
  }

  const res = sql(
    'UPDATE daily_quotes SET turnover = round(turnover / 10000) * 10000 WHERE turnover > 0 AND turnover % 10000 <> 0'
  );
  console.log(`UPDATE 结果: ${res.trim()}`);

  const after = sql(
    'SELECT count(*) FROM daily_quotes WHERE turnover > 0 AND turnover % 10000 <> 0'
  ).trim();
  console.log(`剩余非整数万元行数: ${after}（应为 0）`);

  const zeros = sql('SELECT count(*) FROM daily_quotes WHERE turnover = 0').trim();
  console.log(`turnover=0 行数（应保持 1，PT金田A @2001-08-10）: ${zeros}`);
})().catch((e) => {
  console.error('执行失败:', e.message);
  process.exit(1);
});
