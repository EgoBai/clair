#!/usr/bin/env node
/**
 * 载体日载荷逐值比对（P0-BACKFILL 第二步，纯 SQL/PG 实现）
 *
 * 刻意不依赖 tsx / 交易日历模块：本机沙箱里 tsx 加载 `tradingCalendar`
 * 会连带拉起 dbFactory 而 OOM 被杀（实测 exit 137）。比对只需 PG，
 * 故直接走 psql，避免把「能不能跑起来」变成前置依赖。
 *
 * ## 比对口径：为什么 OHLCV 严格相等、turnover 允许尾差
 * 载体日那批行是**实时快照**路径写入的：`turnover = parts[37] * 10000`，
 * 而腾讯 `parts[37]` 是**整数万元**（如 `120581`），故其turnover 必然是
 * 万元的整数倍（尾数 4 个 0）。
 * 补数写入的是 **K 线**接口的成交额（万元带小数，如 `120581.49`），
 * 因此同一交易日的 turnover 会出现**小于 1 万元**的尾差。
 *
 * 实测载体 10-04 vs 真实 09-30：OHLCV **逐字节相同**，
 * turnover 差异均在 1 万元以内（如 1205810000 vs 1205814900）。
 * 故判定分两档：
 * - `ohlcv_identical` = 开/收/高/低/量 **严格相等**（这是行情身份的决定性特征）；
 * - `turnover_within_1wan` = 成交额尾差 < 10000 元（万元取整 artifact，非数据差异）。
 * 两者同时成立才判「同一交易日」。
 *
 * 判定规则：
 * - OHLCV 全等 + turnover 尾差 < 1 万 + 载体日无独有行 ⟹ 可安全删除错误日期那行；
 * - 任一不成立 ⟹ 打印 ⛔ 并**拒绝**给出可执行结论。
 *
 * 用法:
 *   node scripts/data/compare-carrier-days.cjs --carrier=2026-10-04 --truth=2026-09-30
 */
const { execFileSync } = require('node:child_process');

const argv = process.argv.slice(2);
// 用 startsWith 而非 indexOf：实测在本机 node22 上 argv.indexOf('--x=') 对
// 形如 `--carrier=2026-09-06` 的元素会返回 -1（字符串编码逐字节相同却匹配不上），
// 会静默退回默认日期、比对错对象。startsWith 实测可靠。
const opt = (n) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : undefined;
};
const CARRIER = opt('carrier') || '2026-10-04';
const TRUTH = opt('truth') || '2026-09-30';
const PSQL = process.env.PSQL_BIN || '/opt/homebrew/opt/postgresql@15/bin/psql';

const sql = (q) =>
  execFileSync(PSQL, ['-d', 'clair', '-t', '-A', '-F', '|', '-c', q], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  })
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => l.split('|'));

console.log(`载体日 ${CARRIER}  vs  真实日期 ${TRUTH} —— 逐值比对`);
console.log(`(OHLCV 严格相等；turnover 容许<1万元尾差 = 万元取整artifact)\n`);

const cmp = sql(`
  SELECT
    count(*) AS comparable,
    count(*) FILTER (WHERE c.open_price=t.open_price AND c.close_price=t.close_price
                       AND c.high_price=t.high_price AND c.low_price=t.low_price
                       AND c.volume=t.volume) AS ohlcv_identical,
    count(*) FILTER (WHERE abs(c.turnover - t.turnover) < 10000) AS turnover_within_1wan,
    count(*) FILTER (WHERE c.turnover = t.turnover) AS turnover_exact,
    coalesce(max(abs(c.turnover - t.turnover)), 0) AS max_turnover_diff,
    count(*) FILTER (WHERE c.open_price=t.open_price AND c.close_price=t.close_price
                       AND c.high_price=t.high_price AND c.low_price=t.low_price
                       AND c.volume=t.volume AND abs(c.turnover-t.turnover) < 10000) AS full_match
  FROM daily_quotes c
  JOIN daily_quotes t ON t.stock_id=c.stock_id AND t.trade_date='${TRUTH}'
  WHERE c.trade_date='${CARRIER}'
`);

const onlyCarrier = sql(`
  SELECT count(*) FROM daily_quotes c
  WHERE c.trade_date='${CARRIER}'
    AND NOT EXISTS (SELECT 1 FROM daily_quotes t WHERE t.stock_id=c.stock_id AND t.trade_date='${TRUTH}')
`);

const comparable = Number(cmp[0]?.[0] ?? 0);
const ohlcvIdentical = Number(cmp[0]?.[1] ?? 0);
const tWithin = Number(cmp[0]?.[2] ?? 0);
const tExact = Number(cmp[0]?.[3] ?? 0);
const maxDiff = Number(cmp[0]?.[4] ?? 0);
const fullMatch = Number(cmp[0]?.[5] ?? 0);
const nOnlyCarrier = Number(onlyCarrier[0]?.[0] ?? 0);

console.log(`可比对行数: ${comparable}`);
console.log(`OHLCV 严格相等: ${ohlcvIdentical} / ${comparable}`);
console.log(`turnover 完全相等: ${tExact}   尾差<1万元: ${tWithin}   最大尾差: ${maxDiff} 元`);
console.log(`全字段判定同一交易日: ${fullMatch} / ${comparable}`);
console.log(`仅载体日有(无真身对应): ${nOnlyCarrier}`);

// 真正的 OHLCV 差异（若有）
const diffs = sql(`
  SELECT s.symbol, c.stock_id,
         c.open_price||'/'||c.close_price||'/'||c.high_price||'/'||c.low_price||'/'||c.volume,
         t.open_price||'/'||t.close_price||'/'||t.high_price||'/'||t.low_price||'/'||t.volume
  FROM daily_quotes c
  JOIN daily_quotes t ON t.stock_id=c.stock_id AND t.trade_date='${TRUTH}'
  JOIN stocks s ON s.id=c.stock_id
  WHERE c.trade_date='${CARRIER}'
    AND NOT (c.open_price=t.open_price AND c.close_price=t.close_price
             AND c.high_price=t.high_price AND c.low_price=t.low_price AND c.volume=t.volume)
  ORDER BY c.stock_id LIMIT 10
`);
if (diffs.length) {
  console.log(`\n⛔ OHLCV 真实差异样例:`);
  diffs.forEach((d) => console.log(`  ${d[0]} id=${d[1]}\n    载体 ${CARRIER}: ${d[2]}\n    真实 ${TRUTH}: ${d[3]}`));
}

console.log(`\n=== 结论 ===`);
if (comparable > 0 && fullMatch === comparable && nOnlyCarrier === 0) {
  console.log(`✅ 载体日 ${CARRIER} 与 ${TRUTH} 判定为同一交易日：`);
  console.log(`   · OHLCV ${ohlcvIdentical}/${comparable} 严格相等`);
  console.log(`   · turnover 尾差最大 ${maxDiff} 元（<1 万元，万元取整 artifact）`);
  console.log(`   · 载体日无独有行`);
  console.log(`   ⟹ ${TRUTH} 已有独立数据，${CARRIER} 那行可安全删除。`);
} else if (comparable === 0) {
  console.log(`⚠️ 两侧无可比对行（真实日期 ${TRUTH} 为空或无交集）—— 需人工核查，勿动。`);
} else if (nOnlyCarrier > 0) {
  console.log(`⛔ 载体日有 ${nOnlyCarrier} 行在 ${TRUTH} 无对应 —— 可能承载了别的数据，**不要动**。`);
} else {
  console.log(`⛔ OHLCV 存在真实差异 —— **不要动这个载体日**，需人工核查。`);
}
