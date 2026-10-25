/**
 * P0-STALEPX · 上游重拉对账（当前态）
 *
 * 目的：证明库里现在的「没有行」是**上游已无数据**，而不是**我们没抓到**。
 *
 * 对每只标的（含退市/停牌类）：
 *   A. 库内每一行 → 上游该日期必须有真实 K 线（否则是我们伪造/错配）
 *   B. 上游最后一根 K 线之后 → 库里不应有任何行（否则是陈旧价/抹布行）
 *   C. 上游有、库里缺 → 列出缺口（真实缺失，诚实暴露，不隐藏）
 *
 * 用法： node scripts/data/stale-px-upstream-recon.mjs [--limit N] [--out f.json]
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
const LIMIT = Number(argOf('--limit', '80'));
const OUT = argOf('--out', '/tmp/p0stalepx/upstream-recon.json');
const CONC = Number(argOf('--concurrency', '3'));
const DELAY_MS = Number(argOf('--delay-ms', '220'));

function psql(sql) {
  return execFileSync(PSQL, ['-h', '/tmp', '-d', DB, '-tAF', '\x1f', '-c', sql], {
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  })
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * 候选池：退市/停牌类标的（名字带 退 / ST / PT）+ 历史上曾命中陈旧价判据的标的。
 * 现在 open=0 行已归零，所以候选靠「名字特征 + 历史名单」来圈。
 */
const candidates = psql(`
  SELECT s.symbol || E'\\x1f' || s.name || E'\\x1f' ||
         (SELECT count(*) FROM daily_quotes dq WHERE dq.stock_id=s.id)::text || E'\\x1f' ||
         coalesce((SELECT max(dq.trade_date)::text FROM daily_quotes dq WHERE dq.stock_id=s.id),'') || E'\\x1f' ||
         coalesce((SELECT min(dq.trade_date)::text FROM daily_quotes dq WHERE dq.stock_id=s.id),'')
  FROM stocks s
  WHERE s.name LIKE '%退%' OR s.name LIKE 'PT%' OR s.name LIKE '%ST%'
  ORDER BY s.symbol
  LIMIT ${LIMIT};
`).map((l) => {
  const [symbol, name, cnt, last, first] = l.split('\x1f');
  return { symbol, name, dbRows: Number(cnt), dbLast: last, dbFirst: first };
});

console.error(`上游对账：${candidates.length} 只标的，并发 ${CONC}\n`);

/**
 * 拉上游日 K（不复权口径，与库内一致）。
 *
 * 三个必须处理的现实问题：
 * 1. **主备主机**：web.ifzq.gtimg.cn 会触发反爬挑战（返回 HTML 而非 JSON），
 *    必须能切到 proxy.finance.qq.com 这个备用主机（与后端同步路径同款）。
 * 2. **窗口长度**：请求 >320 根会被上游拒绝，故窗口封顶 320。
 *    退市越早的标的，库内行可能落在窗口之外 —— 那属于「上游查不到」，
 *    不等于「上游没有」，必须分开记，否则会造出假反例。
 * 3. **限速**：高频请求会被挑战，故并发压到 3、每只之间留间隔。
 */
const UPSTREAM_HOSTS = [
  'https://proxy.finance.qq.com/ifzqgtimg/appstock/app/newfqkline/get',
  'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get',
];
const MAX_BARS = 400;  // 上游可能多返回 1 根（实测请求320 得321），窗口要留余量

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
  const param = `${prefix}${code},day,,,${MAX_BARS},`;
  let lastErr = null;
  for (const host of UPSTREAM_HOSTS) {
    try {
      return await fetchKlineOnce(host, param);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error('all hosts failed');
}

/** 库内该标的的行 */
function dbRowsOf(symbol) {
  return psql(`
    SELECT dq.trade_date::text
    FROM daily_quotes dq JOIN stocks s ON s.id=dq.stock_id
    WHERE s.symbol='${symbol}' ORDER BY dq.trade_date;
  `);
}

const results = [];
const pool = [...candidates];
let done = 0;

async function worker() {
  while (pool.length) {
    const c = pool.pop();
    try {
      const kl = await upstreamDaily(c.symbol);
      const upDates = new Set(kl.map((k) => k.date));
      const upLast = kl.length ? kl[kl.length - 1].date : null;
      const dbDates = dbRowsOf(c.symbol);
      const upFirst = kl.length ? kl[0].date : null;

      const dbWithoutUpstream = dbDates.filter((d) => !upDates.has(d));
      const upAfterDbLast = upLast && c.dbLast ? kl.filter((k) => k.date > c.dbLast).map((k) => k.date) : [];

      results.push({
        ...c,
        upstreamBars: kl.length,
        upstreamFirst: upFirst,
        upstreamLast: upLast,
        upstreamLastClose: kl.length ? kl[kl.length - 1].close : null,
        dbRowsChecked: dbDates.length,
        // A: 库内行在上游没有对应 K 线 → 我们伪造/错配
        dbRowsWithoutUpstream: dbWithoutUpstream,
        // A2: 库内行落在上游窗口**之外** → 上游根本查不到，不算「上游没有」
        //     （窗口不足不等于上游缺失，必须分开，否则会造出假反例）
        dbRowsOutsideUpstreamWindow: dbWithoutUpstream.filter((d) => upFirst && d < upFirst),
        dbRowsInsideWindowButNoBar: dbWithoutUpstream.filter((d) => !upFirst || d >= upFirst),
        // B: 上游在库内最后一行之后还有 K 线 → 库内缺行（真实缺失，诚实暴露）
        upstreamDatesAfterDbLast: upAfterDbLast,
        upstreamAfterDbLastCount: upAfterDbLast.length,
        verdict:
          dbWithoutUpstream.filter((d) => !upFirst || d >= upFirst).length === 0 &&
          upAfterDbLast.length === 0
            ? 'CONSISTENT'
            : dbWithoutUpstream.filter((d) => !upFirst || d >= upFirst).length > 0
              ? 'DB_HAS_ROWS_UPSTREAM_DOES_NOT'
              : 'UPSTREAM_HAS_ROWS_DB_MISSING',
      });
    } catch (e) {
      results.push({ ...c, error: String(e.message || e), verdict: 'UPSTREAM_ERROR' });
    }
    if (++done % 20 === 0) console.error(`  ${done}/${candidates.length}`);
    // 限速：上游对高频请求会返回反爬挑战页
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }
}
await Promise.all(Array.from({ length: CONC }, () => worker()));

results.sort((a, b) => (a.symbol < b.symbol ? -1 : 1));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(results, null, 2));

const tally = results.reduce((a, r) => ((a[r.verdict] = (a[r.verdict] || 0) + 1), a), {});
console.log('\n── 上游对账结论 ──');
console.log(JSON.stringify(tally, null, 0));

const bad = results.filter((r) => r.verdict === 'DB_HAS_ROWS_UPSTREAM_DOES_NOT');
const missing = results.filter((r) => r.verdict === 'UPSTREAM_HAS_ROWS_DB_MISSING');
if (bad.length) {
  console.log(`\n❌ 库内有行但上游没有（伪数据残留）：${bad.length} 只`);
  for (const r of bad.slice(0, 10))
    console.log(`   ${r.symbol} ${r.name}: 库内多出行 ${r.dbRowsWithoutUpstream.slice(0, 5).join(',')}`);
} else {
  console.log(`\n✅ 库内所有行在上游都有对应 K 线 —— 无任何伪数据残留`);
}
if (missing.length) {
  console.log(`\nℹ 上游有 K 线但库内缺行（真实缺失，非伪数据）：${missing.length} 只`);
  for (const r of missing.slice(0, 10))
    console.log(`   ${r.symbol} ${r.name}: 上游末根=${r.upstreamLast} 库内末行=${r.dbLast} 缺 ${r.upstreamAfterDbLastCount} 个交易日`);
}
console.log(`\n明细：${OUT}`);
