/**
 * P0-STALEPX 全量证伪扫描（476 只标的 / 21558 行）
 *
 * 逐行核对：`open_price=0 AND volume=0` 的行，其日期在上游是否存在真实 K 线。
 * 只要有一行「当日确有真实成交」，判据即被证伪 → 必须停止清洗。
 *
 * 用法： node scripts/data/stale-px-full-verify.mjs [--out f.json]
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const PSQL = '/opt/homebrew/opt/postgresql@15/bin/psql';
const DB = 'clair';
const argv = process.argv.slice(2);
const argOf = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : d;
};
const OUT = argOf('--out', '/tmp/p0stalepx/full-verify.json');
const CONCURRENCY = Number(argOf('--concurrency', '6'));

function psql(sql) {
  return execFileSync(PSQL, ['-d', DB, '-tAF', '\x1f', '-c', sql], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  })
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

const symbols = psql(`
  SELECT s.symbol || E'\\x1f' || s.name || E'\\x1f' || s.market
  FROM daily_quotes dq JOIN stocks s ON s.id = dq.stock_id
  WHERE dq.open_price = 0 AND dq.volume = 0
  GROUP BY s.symbol, s.name, s.market
  ORDER BY s.symbol;
`).map((l) => {
  const [symbol, name, market] = l.split('\x1f');
  return { symbol, name, market };
});

console.error(`全量证伪：${symbols.length} 只标的，并发 ${CONCURRENCY}\n`);

const rowsBySym = new Map();
for (const l of psql(`
  SELECT s.symbol || E'\\x1f' || dq.trade_date::text || E'\\x1f' || dq.close_price::text
  FROM daily_quotes dq JOIN stocks s ON s.id = dq.stock_id
  WHERE dq.open_price = 0 AND dq.volume = 0
  ORDER BY s.symbol, dq.trade_date;
`)) {
  const [symbol, date, close] = l.split('\x1f');
  if (!rowsBySym.has(symbol)) rowsBySym.set(symbol, []);
  rowsBySym.get(symbol).push({ date, close: Number(close) });
}

async function fetchDates(symbol) {
  const [code, mkt] = symbol.split('.');
  const prefix = mkt === 'SH' ? 'sh' : mkt === 'SZ' ? 'sz' : 'bj';
  const res = await fetch(
    `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${prefix}${code},day,,,320,`,
    { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://gu.qq.com/' } },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const node = json?.data?.[`${prefix}${code}`];
  const kl = node?.day || node?.qfqday;
  if (!Array.isArray(kl)) throw new Error('no kline');
  return new Set(kl.map((r) => r[0]));
}

const results = [];
let done = 0;
let totalRows = 0;
let conflictRows = 0;
const conflicts = [];
const errors = [];

async function worker(pool) {
  while (pool.length) {
    const sym = pool.pop();
    const rows = rowsBySym.get(sym.symbol) || [];
    try {
      const dates = await fetchDates(sym.symbol);
      const bad = rows.filter((r) => dates.has(r.date));
      totalRows += rows.length;
      if (bad.length) {
        conflictRows += bad.length;
        conflicts.push({ symbol: sym.symbol, name: sym.name, rows: bad });
      }
      results.push({ ...sym, rows: rows.length, conflicts: bad.length });
    } catch (e) {
      errors.push({ symbol: sym.symbol, error: String(e.message || e) });
      results.push({ ...sym, rows: rows.length, conflicts: null, error: String(e.message || e) });
    }
    done++;
    if (done % 50 === 0) console.error(`  进度 ${done}/${symbols.length}`);
  }
}

const pool = [...symbols];
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(pool)));

results.sort((a, b) => (a.symbol < b.symbol ? -1 : 1));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ scannedAt: new Date().toISOString(), totalRows, conflictRows, conflicts, errors, results }, null, 2));

console.log(`\n── 全量证伪结论 ──`);
console.log(`扫描标的      : ${symbols.length}`);
console.log(`伪行总数      : ${totalRows}`);
console.log(`上游有真实K线的伪行 ⚠ : ${conflictRows}`);
console.log(`取数失败标的  : ${errors.length}`);
if (conflicts.length) {
  console.log(`\n❌ 判据被证伪，以下标的的 open=0 行当日确有真实成交：`);
  for (const c of conflicts) console.log(`   ${c.symbol} ${c.name}: ${JSON.stringify(c.rows)}`);
} else {
  console.log(`\n✅ 无任何伪行在上游对应到真实 K 线 —— 判据成立`);
}
console.log(`明细：${OUT}`);
