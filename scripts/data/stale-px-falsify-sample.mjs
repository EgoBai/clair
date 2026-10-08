/**
 * P0-STALEPX 证伪取样器（逐行严格版）
 *
 * 对每只标的的**每一行** open=0 AND volume=0 的伪行：
 *   a) 拉上游（腾讯 newfqkline）日 K 全历史
 *   b) 找出「该伪行日期当日或之前」的最后一根真实 K 线 → 基准收盘价
 *   c) 判定该伪行 close 是否 == 基准收盘价（陈旧价吻合）
 *
 * 关键修正：不能拿「上游最后一根 K 线」去比 —— 活股今天仍在交易，
 * 最后一根是今天的，必须按每行日期取「该日期之前」的最后一根。
 *
 * 另有一项独立判据：伪行日期当天上游是否**根本没有 K 线**（无成交 → 不该有行）。
 *
 * 用法： node scripts/data/stale-px-falsify-sample.mjs [--limit N] [--out f.json]
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
const LIMIT = Number(argOf('--limit', '26'));
const OUT = argOf('--out', '/tmp/p0stalepx/falsify-sample.json');

function psql(sql) {
  const out = execFileSync(PSQL, ['-d', DB, '-tAF', '|', '-c', sql], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

function pickSymbols(limit) {
  return psql(`
    WITH t AS (
      SELECT stock_id, close_price, trade_date, s.symbol, s.name, s.market
      FROM daily_quotes dq JOIN stocks s ON s.id = dq.stock_id
      WHERE dq.open_price = 0 AND dq.volume = 0
    ),
    per AS (SELECT stock_id, count(DISTINCT close_price) d FROM t GROUP BY 1)
    SELECT t.symbol, min(t.name), min(t.market), max(per.d),
           string_agg(DISTINCT t.close_price::text, ',' ORDER BY t.close_price::text),
           min(t.trade_date)::text, max(t.trade_date)::text
    FROM t JOIN per ON per.stock_id = t.stock_id
    GROUP BY t.symbol
    ORDER BY (max(per.d) > 1) DESC, t.symbol
    LIMIT ${limit};
  `);
}

function badRowsFor(symbol) {
  return psql(`
    SELECT dq.trade_date::text, dq.close_price::text, dq.volume::text,
           dq.high_price::text, dq.low_price::text
    FROM daily_quotes dq JOIN stocks s ON s.id = dq.stock_id
    WHERE s.symbol = '${symbol}' AND dq.open_price = 0 AND dq.volume = 0
    ORDER BY dq.trade_date;
  `).map((r) => {
    const [date, close, vol, high, low] = r.split('|');
    return { date, close: Number(close), vol: Number(vol), high: Number(high), low: Number(low) };
  });
}

/**
 * 拉日 K。返回 { adjusted, unadjusted } 两条序列。
 *
 * 为什么要两条：库内 `close_price` 是**不复权**口径（见 fix-qfq-caliber），
 * 而上游 `qfqday` 是前复权。若只拿前复权去比，除权股会整片不吻合，
 * 会被误读成「这些行是真行情」——那是假结论。故两口径都取，逐行分别比对。
 */
async function upstreamDailyKline(symbol) {
  const [code, mkt] = symbol.split('.');
  const prefix = mkt === 'SH' ? 'sh' : mkt === 'SZ' ? 'sz' : 'bj';
  const fetchOne = async (adj) => {
    const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${prefix}${code},day,,,320,${adj}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://gu.qq.com/' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const node = json?.data?.[`${prefix}${code}`];
    if (!node) throw new Error('no data node');
    const kl = adj === 'qfq' ? node.qfqday || node.day : node.day || node.qfqday;
    if (!Array.isArray(kl) || !kl.length) throw new Error('empty kline');
    // [date, open, close, high, low, volume]
    return kl
      .map((r) => ({ date: r[0], open: Number(r[1]), close: Number(r[2]), vol: Number(r[5]) }))
      .filter((r) => Number.isFinite(r.close))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
  };
  const adjusted = await fetchOne('qfq');
  let unadjusted = adjusted;
  try {
    unadjusted = await fetchOne('');
  } catch {
    /* 上游未返回不复权序列时退化为同一序列 */
  }
  return { adjusted, unadjusted };
}

async function upstreamSnapshot(symbol) {
  const [code, mkt] = symbol.split('.');
  const prefix = mkt === 'SH' ? 'sh' : mkt === 'SZ' ? 'sz' : 'bj';
  const res = await fetch(`https://qt.gtimg.cn/q=${prefix}${code}`, {
    headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://gu.qq.com/' },
  });
  const txt = new TextDecoder('gbk').decode(Buffer.from(await res.arrayBuffer()));
  const body = txt.split('"')[1];
  if (!body) throw new Error('empty snapshot');
  const p = body.split('~');
  return {
    name: p[1],
    cur: Number(p[3]),
    prevClose: Number(p[4]),
    open: Number(p[5]),
    volume: Number(p[6]),
    session: p[30],
  };
}

const main = async () => {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const syms = pickSymbols(LIMIT);
  console.error(`严格逐行证伪：${syms.length} 只标的\n`);

  const results = [];
  let totalRows = 0;
  let matchRows = 0;
  let noBarRows = 0;
  let conflictRows = 0;

  for (const line of syms) {
    const [symbol, name, market, dClose, dbCloses, firstBad, lastBad] = line.split('|');
    const rows = badRowsFor(symbol);
    let kl = { adjusted: [], unadjusted: [] };
    let klErr = null;
    try {
      kl = await upstreamDailyKline(symbol);
    } catch (e) {
      klErr = String(e.message || e);
    }
    let snap = null;
    let snapErr = null;
    try {
      snap = await upstreamSnapshot(symbol);
    } catch (e) {
      snapErr = String(e.message || e);
    }

    const barsOf = (arr, date) => arr.find((k) => k.date === date) || null;
    const lastAtOrBefore = (arr, date) =>
      [...arr].reverse().find((k) => k.date <= date) || null;

    const rowRecs = rows.map((r) => {
      const adjSame = barsOf(kl.adjusted, r.date);
      const unSame = barsOf(kl.unadjusted, r.date);
      const adjBefore = lastAtOrBefore(kl.adjusted, r.date);
      const unBefore = lastAtOrBefore(kl.unadjusted, r.date);
      return {
        ...r,
        upstreamBarSameDay: unSame || adjSame,
        baselineUnadjusted: unBefore,
        baselineAdjusted: adjBefore,
        stalePriceMatch:
          unBefore && adjBefore
            ? unBefore.close === r.close || adjBefore.close === r.close
            : (unBefore || adjBefore)?.close === r.close,
        matchedOn: unBefore?.close === r.close ? 'unadjusted' : adjBefore?.close === r.close ? 'adjusted' : null,
        hasRealBarThatDay: !!(unSame || adjSame),
      };
    });

    const rec = {
      symbol,
      name,
      market,
      distinctClosePerSymbol: Number(dClose),
      dbCloses: dbCloses.split(',').map(Number),
      badDateRange: [firstBad, lastBad],
      badRowCount: rows.length,
      upstreamKlineError: klErr,
      upstreamLastBar: kl.unadjusted.length ? kl.unadjusted[kl.unadjusted.length - 1] : null,
      upstreamBarCount: kl.unadjusted.length,
      snapshot: snap,
      snapshotError: snapErr,
      rows: rowRecs,
      rowTally: {
        rows: rowRecs.length,
        matchStalePrice: rowRecs.filter((r) => r.stalePriceMatch === true).length,
        matchOnUnadjusted: rowRecs.filter((r) => r.matchedOn === 'unadjusted').length,
        matchOnAdjusted: rowRecs.filter((r) => r.matchedOn === 'adjusted').length,
        noBarThatDay: rowRecs.filter((r) => !r.hasRealBarThatDay).length,
        hasBarThatDay: rowRecs.filter((r) => r.hasRealBarThatDay).length,
      },
    };
    results.push(rec);

    for (const r of rowRecs) {
      totalRows++;
      if (!r.hasRealBarThatDay) noBarRows++;
      if (r.stalePriceMatch) matchRows++;
      if (r.hasRealBarThatDay) conflictRows++;
    }

    const t = rec.rowTally;
    console.log(
      `${symbol.padEnd(11)} ${String(name).padEnd(8)} 行=${String(t.rows).padStart(3)} ` +
        `陈旧价吻合=${String(t.matchStalePrice).padStart(3)}` +
        `(不复权${t.matchOnUnadjusted}/复权${t.matchOnAdjusted}) ` +
        `当日无K线=${String(t.noBarThatDay).padStart(3)} ` +
        `当日有K线=${t.hasBarThatDay}` +
        (klErr ? ` [K线ERR:${klErr}]` : ` 上游末根=${kl.unadjusted[kl.unadjusted.length - 1]?.date}`),
    );
  }

  fs.writeFileSync(OUT, JSON.stringify(results, null, 2));

  console.log(`\n── 逐行汇总 ──`);
  console.log(`总伪行数        : ${totalRows}`);
  console.log(`陈旧价吻合      : ${matchRows}`);
  console.log(`当日上游无K线   : ${noBarRows}`);
  console.log(`当日上游有K线 ⚠ : ${conflictRows}`);
  console.log(`\n明细已写入 ${OUT}`);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
