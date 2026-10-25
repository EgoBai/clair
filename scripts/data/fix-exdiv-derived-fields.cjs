#!/usr/bin/env node
/**
 * 定向修正「送转股除权日」的派生字段（P0-BACKFILL 自检发现）
 *
 * ## 问题
 * `backfill-missing-kline.ts` 最初只按「每股派息」下调前收盘（`prev - 派息`），
 * 但 A 股除权除息还有**送转股**（10转4股/ 10送2股），它是**除法**不是减法：
 * 每股成本价应除以 `(1 + 转/送比例)`。漏掉它会把除权当天下算出腰斩级假跌幅。
 *
 * ## 实测两例（DB 里确实写错了）
 * | 标的 | 日期 | 除权方案 | raw 前收 | 正确基准 | 收盘 | 错误 cp | 正确 cp |
 * |---|---|---|---|---|---|---|---|
 * | 300980.SZ | 2026-09-30 | 10转4股 | 22.90 | 22.90/1.4=16.36 | 15.98 | **-30.22%** | -2.32% |
 * | 688808.SH | 2026-09-29 | 10转4.8股 | 2174.99 | 2174.99/1.48=1469.59 | 1496.00 | **-31.22%** | +1.80% |
 *
 * ## 口径锚点（用库内既有行反推出来的，不是猜的）
 * 601390 在 2026-10-08 除权「10派0.6374」，库内既有值为
 * `change_amount=0.01 / change_percent=0.23/ amplitude=1.17`。
 * 反推：基准 = round2(4.33 − 0.06374) = **4.27**，则
 * - change = round2(4.28 − 4.27) = 0.01 ✓
 * - cp     = round2(0.01 / 4.27 × 100) = 0.23 ✓
 * - amp= round2((4.31 − 4.26) / 4.27 × 100) = 1.17 ✓
 * 三个字段全部命中 ⟹ 库内约定是：**先把基准舍入到 2 位，再派生**。本脚本照此实现。
 *
 * ## 安全边界
 * - 只 UPDATE 明确列出的 (stock_id, trade_date)，不改 OHLCV/成交额/成交量；
 * - 前置条件：该行 OHLCV 必须与上游逐值一致（不一致则跳过并报告）；
 * - 必须传 `--apply --backup=<存在的文件>` 才会写库，否则只报告。
 */
const { execFileSync } = require('node:child_process');
const { existsSync } = require('node:fs');

const argv = process.argv.slice(2);
const opt = (n) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : undefined;
};
const APPLY = argv.includes('--apply');
const BACKUP = opt('backup');
const PSQL = process.env.PSQL_BIN || '/opt/homebrew/opt/postgresql@15/bin/psql';

const sql = (q) =>
  execFileSync(PSQL, ['-d', 'clair', '-t', '-A', '-F', '|', '-c', q], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => l.split('|'));

/** PG `round(numeric,s)` 是 half-away-from-zero；JS Math.round 是 half-up（负数平局偏 +∞） */
const round2 = (x) => (x < 0 ? -Math.round(-x * 100) / 100 : Math.round(x * 100) / 100);
const round4 = (x) => (x < 0 ? -Math.round(-x * 10000) / 10000 : Math.round(x * 10000) / 10000);

function toTencent(symbol) {
  const code = symbol.replace(/\.(SZ|SH|BJ)$/i, '');
  if (code.startsWith('6') || code.startsWith('9')) return `sh${code}`;
  if (code.startsWith('0') || code.startsWith('3')) return `sz${code}`;
  return `bj${code}`;
}

async function fetchRawDaily(tx, days = 60) {
  for (const base of [
    'https://web.ifzq.gtimg.cn/appstock/app/newfqkline/get',
    'https://proxy.finance.qq.com/ifzqgtimg/appstock/app/newfqkline/get',
  ]) {
    try {
      const r = await fetch(`${base}?param=${tx},day,,,${days},`, {
        headers: { Referer: 'https://finance.qq.com' },
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) continue;
      const j = await r.json();
      const rows = j?.data?.[tx]?.day ?? [];
      if (rows.length) return rows;
    } catch (e) {
      /* 试下一个 host */
    }
  }
  return [];
}

/** 解析 FHcontent → {每股派息, 每股送转比例} */
function parseFh(content) {
  const text = String(content ?? '');
  const cashM = /10\s*派\s*([\d.]+)\s*元/.exec(text);
  const cash = cashM ? parseFloat(cashM[1]) / 10 : 0;
  const m = /10\s*[转送]\s*([\d.]+)\s*股/.exec(text);
  const ratio = m ? parseFloat(m[1]) / 10 : 0;
  return { cash: Number.isFinite(cash) ? cash : 0, ratio: Number.isFinite(ratio) ? ratio : 0 };
}

/** 待修正的 (标的, 日期) —— 由全库扫描上游除权元数据得出，不猜 */
const TARGET_DATES = ['2026-07-10', '2026-09-04', '2026-09-28', '2026-09-29', '2026-09-30'];

async function main() {
  // 从库里取这五天的全部标的（而不是硬编码 9 个，避免漏）
  const stocks = sql(`
    SELECT DISTINCT s.id, s.symbol FROM daily_quotes q JOIN stocks s ON s.id=q.stock_id
    WHERE q.trade_date IN (${TARGET_DATES.map((d) => `'${d}'`).join(',')})
    ORDER BY s.id
  `);
  console.log(`扫描 ${stocks.length} 只标的 × ${TARGET_DATES.length} 天…\n`);

  const fixes = [];
  let scanned = 0;
  for (const [idStr, symbol] of stocks) {
    const stockId = Number(idStr);
    scanned++;
    if (scanned % 500 === 0) console.log(`  ...${scanned}/${stocks.length}`);
    const rows = await fetchRawDaily(toTencent(symbol));
    if (!rows.length) continue;

    const dbRows = sql(
      `SELECT trade_date, open_price, close_price, high_price, low_price, volume
       FROM daily_quotes WHERE stock_id=${stockId} AND trade_date IN (${TARGET_DATES.map((d) => `'${d}'`).join(',')})`
    );
    const dbByDate = new Map(dbRows.map((r) => [r[0], r]));

    for (let i = 1; i < rows.length; i++) {
      const bar = rows[i];
      const d = bar[0];
      if (!dbByDate.has(d)) continue;
      const meta = bar[6];
      if (!meta || typeof meta !== 'object' || meta.cqr !== d || !meta.FHcontent) continue;
      const { cash, ratio } = parseFh(meta.FHcontent);
      if (cash <= 0 && ratio <= 0) continue;

      const db = dbByDate.get(d);
      const o = Number(bar[1]);
      const c = Number(bar[2]);
      const h = Number(bar[3]);
      const l = Number(bar[4]);
      const v = Math.round(Number(bar[5]));
      // 前置守卫：DB 的 OHLCV 必须与上游逐值一致，否则说明这行另有问题，不碰
      const ohlcvOk =
        Math.abs(Number(db[1]) - o) < 0.005 &&
        Math.abs(Number(db[2]) - c) < 0.005 &&
        Math.abs(Number(db[3]) - h) < 0.005 &&
        Math.abs(Number(db[4]) - l) < 0.005 &&
        Number(db[5]) === v;
      if (!ohlcvOk) {
        console.log(`⛔ ${symbol} ${d}: DB OHLCV 与上游不一致，跳过（需人工核查）`);
        continue;
      }

      const prevRaw = Number(rows[i - 1][2]);
      let base = prevRaw;
      if (cash > 0) base -= cash;
      if (ratio > 0) base /= 1 + ratio;
      base = round2(base); // 库内约定：先舍入基准，再派生（601390 10-08 反推验证）
      if (!(base > 0)) continue;

      // 派生字段一律 round2：实测库内既有日期（09-24）的 5182 行**全部**满足
      // `change_percent = round(change_percent, 2)`，即库内口径是 2 位小数
      // （列类型虽是 numeric(8,4)，但实时路径直接取上游 parts[32] 的 2 位值）。
      // 若这里用 round4，会把本来正确的行改成 4 位，制造 81 行无意义漂移。
      const changeAmount = round2(c - base);
      const changePercent = round2(((c - base) / base) * 100);
      const amplitude = round2(((h - l) / base) * 100);
      const cur = db.length; // db 行只取了 6 列，无 change字段，另查
      fixes.push({ stockId, symbol, date: d, fh: meta.FHcontent, base, close: c, changeAmount, changePercent, amplitude, cur });
    }
  }

  console.log(`\n=== 需修正的送转股除权行: ${fixes.length} ===`);
  for (const f of fixes) {
    const now = sql(
      `SELECT change_amount, change_percent, amplitude FROM daily_quotes WHERE stock_id=${f.stockId} AND trade_date='${f.date}'`
    )[0];
    const changed = now && (Number(now[0]) !== f.changeAmount || Number(now[1]) !== f.changePercent);
    console.log(
      `${changed ? '✏' : '·'} ${f.symbol} ${f.date} [${f.fh}]\n` +
        `    基准=${f.base} 收=${f.close} → change=${f.changeAmount} cp=${f.changePercent} amp=${f.amplitude}` +
        (now ? `\n    库内现值: change=${now[0]} cp=${now[1]} amp=${now[2]}` : ' (库内无此行)')
    );
  }

  const todo = fixes.filter((f) => {
    const now = sql(`SELECT change_amount, change_percent FROM daily_quotes WHERE stock_id=${f.stockId} AND trade_date='${f.date}'`)[0];
    return now && (Number(now[0]) !== f.changeAmount || Number(now[1]) !== f.changePercent);
  });
  console.log(`\n实际需要 UPDATE 的行: ${todo.length}`);

  if (!APPLY) {
    console.log('干跑结束（未加 --apply，数据库未被修改）。');
    return;
  }
  if (!BACKUP || !existsSync(BACKUP)) {
    console.error(`✗ 拒绝写入：未提供有效 --backup（当前: ${BACKUP ?? '无'}）`);
    process.exit(2);
  }
  for (const f of todo) {
    sql(`UPDATE daily_quotes
         SET change_amount=${f.changeAmount}, change_percent=${f.changePercent}, amplitude=${f.amplitude}
         WHERE stock_id=${f.stockId} AND trade_date='${f.date}'`);
    console.log(`  ✔ 已更新 ${f.symbol} ${f.date}`);
  }
  console.log(`\n完成：修正 ${todo.length} 行。`);
}

main().catch((e) => {
  console.error('修正失败:', e);
  process.exit(1);
});
