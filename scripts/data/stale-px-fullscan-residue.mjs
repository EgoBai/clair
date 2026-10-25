/**
 * P0-STALEPX · 全库「上游无对应 K 线」行扫描（不限标的类型）
 *
 * 目的：找遍全库，找出「库里有行、但上游该日期没有真实 K 线」的行 ——
 * 即真正的伪数据残留（陈旧价盖到无行情的日期、抹布行、串位行等）。
 *
 * 方法：先取全库每个标的的 (trade_date, close, volume)，
 * 再对每只标的拉上游日 K，比对日期集合。
 * 只报「库内有、上游无」的行；上游窗口之外的行单独归类（查不到≠没有）。
 *
 * 用法： node scripts/data/stale-px-fullscan-residue.mjs [--limit N] [--out f.json]
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const PSQL = '/opt/homebrew/opt/postgresql@15/bin/psql';
const argv = process.argv.slice(2);
const argOf = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : d;
};
const LIMIT = Number(argOf('--limit', '200'));
const OUT = argOf('--out', '/tmp/p0stalepx/fullscan-residue.json');
const CONC = Number(argOf('--concurrency', '3'));
const DELAY_MS = Number(argOf('--delay-ms', '250'));

const UPSTREAM_HOSTS = [
  'https://proxy.finance.qq.com/ifzqgtimg/appstock/app/newfqkline/get',
  'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get',
];
const MAX_BARS = 400;  // 上游可能多返回 1 根（实测请求320 得321），窗口要留余量

function psql(sql) {
  return execFileSync(PSQL, ['-h', '/tmp', '-d', 'clair', '-tAF', '\x1f', '-c', sql], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  })
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

async function fetchKlineOnce(host, param) {
  const res = await fetch(`${host}?param=${param}`, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      Referer: 'https://gu.qq.com/',
      Accept: '*/*',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw = await res.text();
  if (raw.trimStart().startsWith('<')) throw new Error('反爬挑战（非 JSON）');
  const json = JSON.parse(raw);
  const key = Object.keys(json?.data || {})[0];
  if (!key) throw new Error('no data node');
  const node = json.data[key];
  const kl = node.day || node.qfqday;
  if (!Array.isArray(kl)) throw new Error('no kline');
  return kl.map((r) => ({ date: r[0], close: Number(r[2]), vol: Number(r[5]) }));
}

async function upstreamDaily(symbol) {
  const [code, mkt] = symbol.split('.');
  const prefix = mkt === 'SH' ? 'sh' : mkt === 'SZ' ? 'sz' : 'bj';
  // 指数的库内 market 字段不可信：沪深300 存成 000300.SZ，但上游只有 sh000300。
  // 故对指数代码（000xxx 沪市指数 / 399xxx 深市指数），**两个前缀都试**，
  // 取能返回 K 线的那个。否则会把真数据误判成「上游没有」= 假反例。
  // 注意 000300 是 3 个 0 开头，不能用 /^0{2}\d{3}$/（那要求恰好 2 个 0）。
  const isIndexCode = /^000\d{3}$/.test(code) || /^399\d{3}$/.test(code);
  const prefixes = isIndexCode ? ['sh', 'sz'] : [prefix];
  const paramList = prefixes.map((p) => `${p}${code}`);
  let lastErr = null;
  for (const param of paramList) {
    for (const host of UPSTREAM_HOSTS) {
      try {
        const kl = await fetchKlineOnce(host, `${param},day,,,${MAX_BARS},`);
        if (kl.length) return { param, bars: kl };
      } catch (e) {
        lastErr = e;
      }
    }
  }
  // 全部组合都拿不到 K 线：区分「取数失败」与「上游确实为空」
  try {
    const kl = await fetchKlineOnce(UPSTREAM_HOSTS[0], `${paramList[0]},day,,,${MAX_BARS},`);
    return { param: paramList[0], bars: kl }; // 空数组 = 上游确实无该标的 K 线
  } catch (e) {
    throw lastErr ?? e;
  }
}

/** 全库标的清单（按行数倒序，先查行多的） */
const symbols = psql(`
  SELECT s.symbol || E'\\x1f' || s.name || E'\\x1f' || count(dq.id)::text
  FROM stocks s JOIN daily_quotes dq ON dq.stock_id = s.id
  GROUP BY s.symbol, s.name ORDER BY count(dq.id) DESC, s.symbol
  LIMIT ${LIMIT};
`).map((l) => {
  const [symbol, name, cnt] = l.split('\x1f');
  return { symbol, name, dbRows: Number(cnt) };
});

console.error(`全库扫描：${symbols.length} 只标的，并发 ${CONC}\n`);

function dbRowsOf(symbol) {
  return psql(`
    SELECT dq.trade_date::text || E'\\x1f' || dq.close_price::text || E'\\x1f' || dq.volume::text
    FROM daily_quotes dq JOIN stocks s ON s.id=dq.stock_id
    WHERE s.symbol='${symbol}' ORDER BY dq.trade_date;
  `).map((l) => {
    const [date, close, vol] = l.split('\x1f');
    return { date, close: Number(close), vol: Number(vol) };
  });
}

const results = [];
const residue = [];
const pool = [...symbols];
let done = 0;

async function worker() {
  while (pool.length) {
    const s = pool.pop();
    try {
      const up = await upstreamDaily(s.symbol);
      const kl = up.bars;
      const upDates = new Set(kl.map((k) => k.date));
      const upFirst = kl.length ? kl[0].date : null;
      const rows = dbRowsOf(s.symbol);
      const missing = rows.filter((r) => !upDates.has(r.date));
      const inside = missing.filter((r) => !upFirst || r.date >= upFirst);
      const outside = missing.filter((r) => upFirst && r.date < upFirst);
      if (inside.length) residue.push({ ...s, upstreamParam: up.param, upstreamBars: kl.length, upstreamFirst: upFirst, rows: inside });
      results.push({ ...s, upstreamParam: up.param, checked: rows.length, missingInside: inside.length, missingOutside: outside.length });
    } catch (e) {
      results.push({ ...s, error: String(e.message || e), missingInside: null });
    }
    if (++done % 20 === 0) console.error(`  ${done}/${symbols.length}`);
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }
}
await Promise.all(Array.from({ length: CONC }, () => worker()));

const ok = results.filter((r) => !r.error);
const errs = results.filter((r) => r.error);
const outsideRows = ok.reduce((n, r) => n + r.missingOutside, 0);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify({ scannedAt: new Date().toISOString(), results, residue }, null, 2),
);

console.log('\n── 全库残留扫描结论 ──');
console.log(`扫描标的        : ${symbols.length}（成功 ${ok.length} / 失败 ${errs.length}）`);
console.log(`上游窗口外的行  : ${outsideRows}（查不到 ≠ 上游没有，不算残留）`);
console.log(`**上游确无的行** : ${residue.reduce((n, r) => n + r.rows.length, 0)} 行，分布在 ${residue.length} 只标的`);
if (residue.length) {
  console.log('\n残留明细（前 20 只）：');
  for (const r of residue.slice(0, 20)) {
    console.log(`  ${r.symbol} ${r.name} (库内${r.dbRows}行) 上游窗口${r.upstreamFirst}起:`);
    for (const row of r.rows.slice(0, 6))
      console.log(`     ${row.date} close=${row.close} vol=${row.vol}`);
    if (r.rows.length > 6) console.log(`     … 共 ${r.rows.length} 行`);
  }
}
console.log(`\n明细：${OUT}`);
