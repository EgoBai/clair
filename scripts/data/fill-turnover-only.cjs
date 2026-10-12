#!/usr/bin/env node
/**
 * P0-TURNOVER0 / Step 3a：只补 turnover 的修复脚本（不碰 OHLCV）
 *
 * ## 修什么
 * `daily_quotes` 里有一批行**价格是对的、成交额为 0**：
 * ```
 * 600519.SH@05-28  O=1290.00 C=1275.98 H=1304.00 L=1271.00 V=45890  turnover=0.00
 * 上游 sh600519    O=1290.00 C=1275.98 H=1304.00 L=1271.00 V=45890  额=589547.50万
 * ```
 * 全库 `turnover=0 AND volume>0 AND open_price>0` 共 1,472 行 / 283 日期；
 * 本脚本范围限定为**已逐值确证 OHLCV 正确**的那批（2026-05-01~07-01 内 42 行）。
 *
 * 它比 `open=0` 那类脏数据更隐蔽：价格对得上，任何校验 OHLCV 的检查都会判它合格。
 * 而且它卡在补数逻辑的缝里 —— `existing` 判据只看 `(stock_id, trade_date)` 是否存在，
 * 所以补数脚本会永远跳过它们，不补。
 *
 * ## ⚠️ 单位口径：按「万元」补，不乘任何系数（team-lead 裁决）
 *
 * ## 背景：这里有过一次判断反转，完整记录以免后人重踩
 *
 * **第一版判断：应补「元」** —— 依据是代码两条写库路径都乘 10000：
 * ```
 * DataSyncService.ts:364  turnover: quote.turnover * 10000        // 实时→库
 * DataSyncService.ts:909  turnover: Math.round(turnoverWan) * 10000 // K线→库
 * ```
 * 且 909 注释说明"先 round 再乘，与实时路径逐位一致"。
 * 万元行写入时间 2026-06-05~06-09，而口径修复 commit `16ede6613` 落地
 * 2026-10-09（**晚于写入**）⟹ 万元是 pre-fix 遗留。
 *
 * **第二版判断（最终执行）：应补「万元」** —— team-lead 裁决，依据是我没有的信息：
 * > `fix-qfq-caliber` 将做**全库单位统一**：把采集器+补数的 ×1e4 去掉，统一为万元。
 * > 这才是普适解法；X 类属万元批次，现在按万元补与统一方向一致，不会白做。
 *
 * 即：**"元"是代码当前行为，"万元"是已定的目标口径。** 既然库要统一到万元，
 * 新数据就该按万元写，否则统一时又要再改一次。
 *
 * ⚠️ 残留风险（已明示给 team-lead）：若全库统一**未执行**，这 42 行会与
 * 采集器继续产出的「元」不一致。回滚文件见 `--rollback-out`，可随时还原。
 *
 * 实测同批次邻居行（支持万元）：
 * ```
 * 600519.SH  写入日 2026-05-31  邻居 → 万元 9/12
 * 688008.SH  写入日 2026-06-01  邻居 → 万元 9/12
 * 688036.SH  写入日 2026-06-01  邻居 → 万元 9/12
 * ```
 *
 * ## 安全边界（team-lead 定的四条）
 * 1. 只 UPDATE `turnover` 一列，**绝不碰 OHLCV**
 * 2. 精确 WHERE stock_id + trade_date，不按日期范围批量扫
 * 3. 补前导出待修行三列（stock_id/trade_date/turnover）供回滚
 * 4. 补后逐行比对 OHLCV，确认一字节未变
 *
 * ## 用法
 *   # 干跑（默认）：只报告将补什么，不动数据库
 *   node scripts/data/fill-turnover-only.cjs --dates=2026-05-01..2026-07-01
 *
 *   # 真正写入（必须同时给 --apply 与已存在的 --backup）
 *   node scripts/data/fill-turnover-only.cjs --apply --backup=/path/to/backup.sql
 *
 * ## 为什么不用 tsx
 * 本机 `npx tsx` 会弹安装确认挂起；且 `tradingCalendar → dbFactory` 的 `@shared/*`
 * 路径别名只在 `backend/` 目录下解析。本脚本只需 psql，故刻意用纯 node + psql。
 */
const { execFileSync } = require('node:child_process');
const { existsSync, writeFileSync } = require('node:fs');

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n) => {
  const eq = argv.find((a) => a.startsWith(`--${n}=`));
  if (eq) return eq.slice(n.length + 3);
  const at = argv.indexOf(`--${n}`);
  if (at >= 0 && at + 1 < argv.length && !argv[at + 1].startsWith('--')) return argv[at + 1];
  return undefined;
};

const APPLY = flag('apply');
const BACKUP = opt('backup');
const PSQL = process.env.PSQL_BIN ?? '/opt/homebrew/opt/postgresql@15/bin/psql';
const DB_URL = opt('db') ?? process.env.DATABASE_URL ?? 'clair';

/** 待修范围：默认 2026-05-01~07-01（已逐值确证 OHLCV 正确的那 42 行） */
const FROM = opt('from') ?? '2026-05-01';
const TO = opt('to') ?? '2026-07-01';
/** 回滚导出路径 */
const ROLLBACK_OUT = opt('rollback-out') ?? `/tmp/turnover0-rollback-${FROM}-${TO}.csv`;

function sql(q) {
  return execFileSync(PSQL, ['-d', DB_URL, '-t', '-A', '-F', '|', '-c', q], {
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
  })
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => l.split('|'));
}

/** '600519.SH' → 'sh600519'；腾讯小写市场前缀 */
function toTx(symbol) {
  const c = symbol.replace(/\.(SZ|SH|BJ)$/i, '');
  if (c.startsWith('6') || c.startsWith('9')) return `sh${c}`;
  if (c.startsWith('0') || c.startsWith('3')) return `sz${c}`;
  if (c.startsWith('4') || c.startsWith('8')) return `bj${c}`;
  return null;
}

/** 上游不复权日 K（只用 day，不用 qfqday）；双 host 降级 */
async function fetchUnadjusted(tx, days) {
  for (const h of [
    'https://proxy.finance.qq.com/ifzqgtimg/appstock/app/newfqkline/get',
    'https://web.ifzq.gtimg.cn/appstock/app/newfqkline/get',
  ]) {
    try {
      const r = await fetch(`${h}?param=${tx},day,,,${days},`, {
        signal: AbortSignal.timeout(25000),
        headers: { Referer: 'https://finance.qq.com' },
      });
      if (!r.ok) continue;
      const j = await r.json();
      const day = j?.data?.[tx]?.day;
      if (Array.isArray(day) && day.length) return day;
    } catch {
      /* 换下一个 host */
    }
  }
  return null;
}

async function main() {
  console.log(`P0-TURNOVER0 只补 turnover  范围 ${FROM} ~ ${TO}`);
  console.log(`DB: ${DB_URL.replace(/:[^:@]*@/, ':***@')}\n`);

  // ── 候选：turnover=0 但量>0、开>0（价格真实、仅额缺） ──
  const cand = sql(`
    SELECT s.symbol, q.stock_id, q.trade_date, q.open_price, q.close_price, q.high_price,
           q.low_price, q.volume, q.turnover
    FROM daily_quotes q JOIN stocks s ON s.id = q.stock_id
    WHERE q.trade_date BETWEEN '${FROM}' AND '${TO}'
      AND q.turnover = 0 AND q.volume > 0 AND q.open_price > 0
    ORDER BY s.symbol, q.trade_date`);
  console.log(`候选行(turnover=0 且量>0 且开>0): ${cand.length}`);

  const needDays =
    Math.ceil(((Date.now() - new Date(`${FROM}T00:00:00Z`).getTime()) / 86_400_000 / 0.6645) * 1.35) + 10;

  // ── 逐值核对 OHLCV，只对"价量全对"的行动手 ──
  const fixable = [];
  const rejected = [];
  const unreachable = new Set();
  for (const [symbol, stockId, date, o, c, h, l, v, t] of cand) {
    const tx = toTx(symbol);
    if (!tx) { unreachable.add(symbol); continue; }
    const day = await fetchUnadjusted(tx, needDays);
    if (!day) { unreachable.add(symbol); continue; }
    const bar = day.find((r) => r[0] === date);
    if (!bar) { rejected.push({ symbol, date, why: '上游无该日' }); continue; }
    const E = 0.005;
    const priceOK = Math.abs(+bar[1] - +o) < E && Math.abs(+bar[2] - +c) < E &&
      Math.abs(+bar[3] - +h) < E && Math.abs(+bar[4] - +l) < E;
    const volOK = Math.abs(+bar[5] - +v) < 1;
    if (priceOK && volOK) {
      // 单位口径：team-lead 裁决按「万元」补（全库将统一为万元，见文件头说明）
      fixable.push({ symbol, stockId, date, newTurnover: +bar[8] });
    } else {
      rejected.push({
        symbol, date,
        why: priceOK ? '量不符' : '价格不符',
        db: { o, c, h, l, v }, up: { o: bar[1], c: bar[2], h: bar[3], l: bar[4], v: bar[5] },
      });
    }
  }

  console.log(`\n=== 判定结果 ===`);
  console.log(`  可补(OHLCV 全对)  : ${fixable.length}`);
  console.log(`  拒绝(价或量不符)  : ${rejected.length}   ⟹ 这些行价格本身就错，不该只补 turnover`);
  console.log(`  上游不可达        : ${unreachable.size} 只标的`);
  if (rejected.length) {
    console.log(`\n--- 被拒绝的行（需另定性，不在本脚本范围）---`);
    rejected.slice(0, 10).forEach((r) =>
      console.log(`  ${r.symbol} ${r.date} [${r.why}]` +
        (r.db ? ` DB=${r.db.o}/${r.db.c}/${r.db.h}/${r.db.l}/${r.db.v} UP=${r.up.o}/${r.up.c}/${r.up.h}/${r.up.l}/${r.up.v}` : '')));
  }

  if (fixable.length === 0) {
    console.log('\n无可补行，结束。');
    return;
  }

  // ── 补前导出三列（回滚用） ──
  const rollbackLines = ['stock_id,trade_date,turnover_old'];
  for (const f of fixable) rollbackLines.push(`${f.stockId},${f.date},0`);
  writeFileSync(ROLLBACK_OUT, rollbackLines.join('\n') + '\n');
  console.log(`\n回滚导出: ${ROLLBACK_OUT}  (${fixable.length} 行，含 stock_id/trade_date/turnover_old)`);

  if (!APPLY) {
    console.log('\n干跑结束（未加 --apply，数据库未被修改）。');
    console.log(`将补 ${fixable.length} 行，样例:`);
    fixable.slice(0, 8).forEach((f) =>
      console.log(`  ${f.symbol} ${f.date}  turnover: 0 → ${f.newTurnover}（万元口径 = 上游 idx8，不乘系数）`));
    return;
  }

  // ── 写入前置校验 ──
  if (!BACKUP || !existsSync(BACKUP)) {
    console.error(`\n✗ 拒绝写入：未提供有效的 --backup（当前值: ${BACKUP ?? '无'}）`);
    process.exit(2);
  }
  console.log(`\n备份已确认存在: ${BACKUP}`);

  // 并发守卫：有其他未提交事务则拒绝
  const busy = sql(
    `SELECT count(*) FROM pg_stat_activity
     WHERE datname = current_database() AND pid <> pg_backend_pid()
       AND xact_start IS NOT NULL AND state <> 'idle'`);
  if (Number(busy[0]?.[0] ?? '0') > 0) {
    console.error(
      `\n✗ 拒绝写入：检测到 ${busy[0][0]} 个其他会话持有未提交事务。` +
      `\n  采集器每 5 分钟写一次，确认无并发可加 --skip-concurrency-check。`);
    process.exit(2);
  }
  console.log('并发守卫: 无其他未提交事务 ✓');

  // ── 精确 UPDATE，只写 turnover ──
  // 用 heredoc 方式逐条执行，避免参数化拼接
  for (const f of fixable) {
    sql(
      `UPDATE daily_quotes SET turnover = ${f.newTurnover} ` +
      `WHERE stock_id = ${f.stockId} AND trade_date = '${f.date}'`);
  }
  console.log(`\n已写入 ${fixable.length} 行（仅 turnover 列）`);

  // ── 补后校验：OHLCV 一字节未变 ──
  let ohChanged = 0;
  const after = sql(`
    SELECT q.stock_id, q.trade_date, q.open_price, q.close_price, q.high_price, q.low_price,
           q.volume, q.turnover
    FROM daily_quotes q WHERE q.trade_date BETWEEN '${FROM}' AND '${TO}'
      AND (q.stock_id, q.trade_date) IN (${fixable.map((f) => `(${f.stockId},'${f.date}')`).join(',')})`);
  const beforeMap = new Map(cand.map((c) => [`${c[1]}|${c[2]}`, c]));
  for (const a of after) {
    const key = `${a[0]}|${a[1]}`;
    const b = beforeMap.get(key);
    if (!b) continue;
    if (+a[2] !== +b[3] || +a[3] !== +b[4] || +a[4] !== +b[5] || +a[5] !== +b[6] || +a[6] !== +b[7]) ohChanged++;
  }
  console.log(`\n=== 补后校验 ===`);
  console.log(`  OHLCV 发生变化的行: ${ohChanged}  ${ohChanged === 0 ? '✓ 一字节未变' : '✗ 异常，需检查'}`);
  const filled = sql(
    `SELECT count(*) FROM daily_quotes
     WHERE trade_date BETWEEN '${FROM}' AND '${TO}'
       AND turnover = 0 AND volume > 0 AND open_price > 0`);
  console.log(`  剩余 turnover=0 且价对的行: ${filled[0][0]}`);

  // ── team-lead 要求的第⑤项：抽 3 行与上游 idx8 比对，证明单位正确 ──
  console.log(`\n--- 抽 3 行与上游 idx8 比对（证明是万元值，既没 ×1e4 也没漏乘）---`);
  for (const f of [fixable[0], fixable[Math.floor(fixable.length / 2)], fixable[fixable.length - 1]]) {
    if (!f) continue;
    const tx = toTx(f.symbol);
    const day = await fetchUnadjusted(tx, needDays);
    const bar = day?.find((r) => r[0] === f.date);
    if (!bar) { console.log(`  ${f.symbol} ${f.date}: 上游无该日，跳过`); continue; }
    const now = sql(
      `SELECT turnover FROM daily_quotes WHERE stock_id = ${f.stockId} AND trade_date = '${f.date}'`)[0][0];
    const upWan = +bar[8];
    const asYuan = Math.abs(+now - upWan * 1e4) / (upWan * 1e4) < 0.001;
    const asWan = Math.abs(+now - upWan) / upWan < 0.001;
    console.log(`  ${f.symbol} ${f.date}`);
    console.log(`    库内 turnover = ${now}`);
    console.log(`    上游 idx8(万元) = ${upWan}    ×1e4 = ${upWan * 1e4}`);
    console.log(`    ⟹ ${asWan ? '✓ 等于上游万元值（正确）' : asYuan ? '✗ 等于 ×1e4 后的元值（单位错了）' : '✗ 两者都不等，需检查'}`);
  }
}

main().catch((e) => { console.error('失败:', e); process.exit(1); });
