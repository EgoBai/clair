#!/usr/bin/env node
/**
 * 载体日载荷比对（P0-BACKFILL 第二步）
 *
 * ## 目的
 * `daily_quotes` 里有几个**非交易日**却承载了某个真实交易日收盘的行（载体日）。
 * 在补数把正确日期写入之后，需要逐值比对载体日载荷与「正确日期应有的载荷」：
 * - 完全一致 ⟹ 载体日的真身就是那个日期，错误日期那行应被处理；
 * - 有任何一项对不上 ⟹ **停下来报告，不许动它**。
 *
 * ## 为什么必须逐值比对，不能按指纹/行数批量改
 * 指纹匹配是粗粒度的：不同交易日的行情可能碰巧相似，而更危险的是
 * `2026-05-30` / `2026-06-06` 那 109 行内含**指数串位**
 * （`000001 平安银行` 行里装着沪深300 点位 4068.57）——那是另一个缺陷，
 * 性质未确证，绝不能被批量日期改写顺手带上。
 *
 * ## 用法
 * ```bash
 * npx tsx scripts/data/compare-carrier-days.ts --carrier=2026-10-04 --truth=2026-09-30
 * npx tsx scripts/data/compare-carrier-days.ts --carrier=2026-09-06 --truth=2026-09-04
 * npx tsx scripts/data/compare-carrier-days.ts --carrier=2026-07-11 --truth=2026-07-10
 * ```
 */

import { execFileSync } from 'node:child_process';

const argv = process.argv.slice(2);
const opt = (n: string) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : undefined;
};
const CARRIER = opt('carrier') ?? '2026-10-04';
const TRUTH = opt('truth') ?? '2026-09-30';
const DB_URL = opt('db') ?? process.env.DATABASE_URL ?? 'clair';
const PSQL = process.env.PSQL_BIN ?? '/opt/homebrew/opt/postgresql@15/bin/psql';

function sql(q: string): string[][] {
  return execFileSync(PSQL, ['-d', DB_URL, '-t', '-A', '-F', '|', '-c', q], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  })
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => l.split('|'));
}

console.log(`载体日 ${CARRIER} vs 真实日期 ${TRUTH} —— 逐值比对\n`);

// 逐值比对：同一 stock_id 的 OHLCV + turnover 是否一致
const rows = sql(`
  SELECT c.stock_id,
         c.open_price, c.close_price, c.high_price, c.low_price, c.volume, c.turnover,
         t.open_price, t.close_price, t.high_price, t.low_price, t.volume, t.turnover,
         s.symbol
  FROM daily_quotes c
  JOIN daily_quotes t ON t.stock_id = c.stock_id AND t.trade_date = '${TRUTH}'
  JOIN stocks s ON s.id = c.stock_id
  WHERE c.trade_date = '${CARRIER}'
  ORDER BY c.stock_id
`);

console.log(`可比对行数: ${rows.length}`);

const EPS = 0.005; // 价格两位小数，最小刻度 0.01
let same = 0;
const diffs: string[] = [];
for (const r of rows) {
  const eq = (a: string, b: string) => Math.abs(Number(a) - Number(b)) < EPS;
  const ok =
    eq(r[1], r[7]) && eq(r[2], r[8]) && eq(r[3], r[9]) && eq(r[4], r[10]) &&
    eq(r[5], r[11]) && eq(r[6], r[12]);
  if (ok) same++;
  else if (diffs.length < 15) {
    diffs.push(
      `${r[13]} stock_id=${r[0]}\n    载体 ${CARRIER}: O=${r[1]} C=${r[2]} H=${r[3]} L=${r[4]} V=${r[5]} T=${r[6]}\n    真实 ${TRUTH}: O=${r[7]} C=${r[8]} H=${r[9]} L=${r[10]} V=${r[11]} T=${r[12]}`
    );
  }
}

console.log(`完全一致: ${same}/${rows.length}`);
console.log(`存在差异: ${rows.length - same}`);
if (diffs.length) {
  console.log(`\n差异样例:`);
  diffs.forEach((d) => console.log('  ' + d));
}

// 载体日独有（真实日期缺失）的行—— 若有，说明载体日还承载了别的东西
const onlyCarrier = sql(`
  SELECT c.stock_id, s.symbol, c.open_price, c.close_price, c.high_price, c.low_price, c.volume, c.turnover
  FROM daily_quotes c JOIN stocks s ON s.id=c.stock_id
  WHERE c.trade_date='${CARRIER}'
    AND NOT EXISTS (SELECT 1 FROM daily_quotes t WHERE t.stock_id=c.stock_id AND t.trade_date='${TRUTH}')
  ORDER BY c.stock_id
`);
console.log(`\n仅载体日有、真实日期缺失的行: ${onlyCarrier.length}`);
onlyCarrier.slice(0, 15).forEach((r) => console.log(`  ${r[1]} stock_id=${r[0]} O=${r[2]} C=${r[3]} H=${r[4]} L=${r[5]} V=${r[6]} T=${r[7]}`));

// 结论
console.log(`\n=== 结论 ===`);
if (onlyCarrier.length === 0 && same === rows.length && rows.length > 0) {
  console.log(`✅ 载体日 ${CARRIER} 的载荷与 ${TRUTH} 逐值完全一致，且无独有行。`);
  console.log(`   ⟹ 真身确为 ${TRUTH}，错误日期那行可安全删除（真实数据已在 ${TRUTH}）。`);
} else if (onlyCarrier.length === 0 && rows.length === 0) {
  console.log(`⚠️ 两侧该日期都没有行，无法比对—— 需人工核查。`);
} else {
  console.log(`⛔ 不满足「逐值一致且无独有行」，**不要动这个载体日**，需人工核查。`);
}
