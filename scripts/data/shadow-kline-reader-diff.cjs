#!/usr/bin/env node
/**
 * Phase 4 步骤 2：K 线 Reader shadow 比对（只读，不切换任何消费方）
 *
 * 目的：切换前对 20 只样本股比较「现 Reader（daily_quotes）」与「合并视图 v_daily_quotes_all
 *       （hist 优先 + live + _qfq_suspect 标记）」的输出，差异逐条分类解释；出现无法解释的
 *       差异则退出码 1（阻断切换）。
 *
 * 覆盖两个现 Reader 取数形态：
 *   A) /api/stocks/:symbol/quotes → Database.getDailyQuotes：按区间取 daily_quotes
 *   B) /api/stocks/:symbol/kline   → 直接取 daily_quotes，ORDER BY trade_date ASC LIMIT 250
 *
 * 样本：20 只 = 11 只已知 qfq 残污标的 + 6 只 pilot 干净标的 + 3 只本轮刚回填标的
 *
 * 差异分类（EXPECTED_* 为可解释，UNEXPLAINED_* 阻断）：
 *   EXPECTED_QFQ_FIX          价格由 qfq 残污行修正为 bfq（视图 _qfq_suspect=true 佐证）
 *   EXPECTED_QFQ_DERIVED      change_amount 随 close 同差偏移（前复权段位移）
 *   EXPECTED_ROUNDING_*       volume≤1手 / turnover≤1万元 / 派生字段≤0.02 的舍入差
 *   EXPECTED_LEGACY_DERIVED   旧 daily_quotes 行派生字段与其自身价序列不自洽（存量缺陷，hist 重算）
 *   EXPECTED_LEGACY_MISSING_TR 旧行 turnover_rate=0/空，hist 用真实换手率补正
 *   EXPECTED_VALUATION_NULL   hist 历史行 market_cap/pe/pb 恒 NULL（诚实口径，不估算）
 *
 * 用法：node scripts/data/shadow-kline-reader-diff.cjs [--json .shadow-reader-diff.json]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const { Client } = (() => {
  const cands = ['../../backend/node_modules/pg', '../../node_modules/pg', 'pg'];
  for (const c of cands) { try { return require(c); } catch { /* next */ } }
  throw new Error('找不到 pg 模块');
})();

// 已知 qfq 残污 11 只（见 KLINE-STORAGE-DESIGN.md §7.5）
const QFQ = ['002594.SZ', '300308.SZ', '600519.SH', '300750.SZ', '601398.SH', '601288.SH',
  '601939.SH', '600941.SH', '000001.SZ', '688111.SH', '688036.SH'];
const CLEAN = ['000858.SZ', '600036.SH', '601318.SH', '000333.SZ', '002415.SZ', '000651.SZ'];
const NEW = ['002156.SZ', '000958.SZ', '688820.SH'];
const SAMPLE = [...QFQ, ...CLEAN, ...NEW];

const RANGE = { start: '2023-11-01', end: '2026-11-03' };
const BOUNDARY = '2026-06-09';
const READER_A_COLS = "stock_id, to_char(trade_date,'YYYY-MM-DD') AS trade_date, open_price, close_price, high_price, low_price, volume, turnover, change_amount, change_percent, amplitude, turnover_rate, market_cap, pe_ratio, pb_ratio";
const KLINE_LIMIT = 250;

const num = (x) => (x == null ? null : Number(x));
const eq = (a, b, tol = 0) => {
  const x = num(a), y = num(b);
  if (x == null && y == null) return true;
  if (x == null || y == null) return false;
  return Math.abs(x - y) <= tol;
};
const PRICE = ['open_price', 'close_price', 'high_price', 'low_price'];
const ROUND_TOL = 0.02;       // 派生字段舍入容差（旧数据两位小数）
const SELF_TOL = 0.02;        // 旧行派生字段自洽容差

/** 判定旧行派生字段是否与其自身价序列自洽（不自洽 = 存量缺陷，非视图问题） */
function readerSelfConsistent(prev, row) {
  const c = num(row.close_price), p = num(prev.close_price);
  if (c == null || p == null || p === 0) return { chg: true, pct: true, amp: true };
  const okChg = eq(row.change_amount, c - p, SELF_TOL);
  const okPct = eq(row.change_percent, ((c - p) / p) * 100, SELF_TOL);
  const okAmp = eq(row.amplitude, ((num(row.high_price) - num(row.low_price)) / p) * 100, SELF_TOL);
  return { chg: okChg, pct: okPct, amp: okAmp };
}

function classifyDiff(symbol, date, reader, view, prevReader, out) {
  const isQfq = QFQ.includes(symbol) && date < BOUNDARY;
  const codes = [];
  const priceDiff = PRICE.some((k) => !eq(reader[k], view[k], 0));
  const self = readerSelfConsistent(prevReader || {}, reader);

  if (priceDiff) {
    if (isQfq && view._qfq_suspect === true) codes.push('EXPECTED_QFQ_FIX');
    else { codes.push(isQfq ? 'UNEXPLAINED_QFQ_UNFLAGGED' : 'UNEXPLAINED_PRICE'); out.unexplained++; }
  }
  // qfq 残污行的派生字段按 bfq 序列重算：加法位移会让 pct/振幅（分母是复权价）一并变化，属预期修正
  if (!eq(reader.change_amount, view.change_amount, ROUND_TOL)) {
    if (isQfq) codes.push('EXPECTED_QFQ_DERIVED');
    else if (!self.chg) codes.push('EXPECTED_LEGACY_DERIVED');
    else { codes.push('UNEXPLAINED_CHANGE_AMOUNT'); out.unexplained++; }
  }
  if (!eq(reader.change_percent, view.change_percent, ROUND_TOL)) {
    if (isQfq) codes.push('EXPECTED_QFQ_DERIVED');
    else if (!self.pct) codes.push('EXPECTED_LEGACY_DERIVED');
    else { codes.push('UNEXPLAINED_CHANGE_PERCENT'); out.unexplained++; }
  }
  if (!eq(reader.amplitude, view.amplitude, ROUND_TOL)) {
    if (isQfq) codes.push('EXPECTED_QFQ_DERIVED');
    else if (!self.amp) codes.push('EXPECTED_LEGACY_DERIVED');
    else { codes.push('UNEXPLAINED_AMPLITUDE'); out.unexplained++; }
  }
  if (!eq(reader.turnover_rate, view.turnover_rate, ROUND_TOL)) {
    const rtr = num(reader.turnover_rate);
    const vtr = num(view.turnover_rate);
    if ((rtr == null || rtr === 0) && vtr != null && vtr > 0) codes.push('EXPECTED_LEGACY_MISSING_TR');
    else if (!self.pct) codes.push('EXPECTED_LEGACY_DERIVED');
    else { codes.push('UNEXPLAINED_TURNOVER_RATE'); out.unexplained++; }
  }
  if (!eq(reader.volume, view.volume, 0)) {
    if (Math.abs((num(reader.volume) ?? 0) - (num(view.volume) ?? 0)) <= 100) codes.push('EXPECTED_ROUNDING_VOL');
    else { codes.push('UNEXPLAINED_VOLUME'); out.unexplained++; }
  }
  if (!eq(reader.turnover, view.turnover, 0)) {
    if (Math.abs((num(reader.turnover) ?? 0) - (num(view.turnover) ?? 0)) <= 10000) codes.push('EXPECTED_ROUNDING_TURNOVER');
    else { codes.push('UNEXPLAINED_TURNOVER'); out.unexplained++; }
  }
  const valNull = (view.market_cap == null && reader.market_cap != null) ||
    (view.pe_ratio == null && reader.pe_ratio != null) || (view.pb_ratio == null && reader.pb_ratio != null);
  if (valNull) codes.push('EXPECTED_VALUATION_NULL');
  return codes;
}

function cmpRows(symbol, readerRows, viewRows, out, withDerived) {
  const rows = [...readerRows].sort((a, b) => (a.trade_date < b.trade_date ? -1 : 1));
  const prevByDate = new Map();
  rows.forEach((r, i) => prevByDate.set(r.trade_date, rows[i - 1]));
  const rmap = new Map(rows.map((r) => [r.trade_date, r]));
  const vmap = new Map(viewRows.map((r) => [r.trade_date, r]));
  const readerOnly = [...rmap.keys()].filter((d) => !vmap.has(d));
  const viewOnly = [...vmap.keys()].filter((d) => !rmap.has(d));
  const common = [...rmap.keys()].filter((d) => vmap.has(d)).sort();
  const byCode = {};
  const samples = [];
  const allDiffs = []; // 逐条列出（审计用，落 JSON）
  for (const d of common) {
    let codes;
    if (withDerived) codes = classifyDiff(symbol, d, rmap.get(d), vmap.get(d), prevByDate.get(d), out);
    else {
      // K 线形态仅含 OHLCV+turnover，做价格/量额比对
      const r = rmap.get(d), v = vmap.get(d);
      codes = [];
      if (PRICE.some((k) => !eq(r[k], v[k], 0))) {
        if (v._qfq_suspect === true) codes.push('EXPECTED_QFQ_FIX');
        else { codes.push('UNEXPLAINED_PRICE'); out.unexplained++; }
      }
      if (!eq(r.volume, v.volume, 0) && Math.abs(num(r.volume) - num(v.volume)) > 100) { codes.push('UNEXPLAINED_VOLUME'); out.unexplained++; }
      if (!eq(r.turnover, v.turnover, 0) && Math.abs(num(r.turnover) - num(v.turnover)) > 10000) { codes.push('UNEXPLAINED_TURNOVER'); out.unexplained++; }
    }
    if (!codes.length) continue;
    allDiffs.push({ date: d, codes, a: rmap.get(d), b: vmap.get(d) });
    for (const c of codes) byCode[c] = (byCode[c] || 0) + 1;
    if (samples.length < 5) samples.push({ date: d, codes, reader: { close: num(rmap.get(d).close_price), volume: num(rmap.get(d).volume), turnover_rate: num(rmap.get(d).turnover_rate) }, view: { close: num(vmap.get(d).close_price), volume: num(vmap.get(d).volume), turnover_rate: num(vmap.get(d).turnover_rate), _src: vmap.get(d)._src, _qfq_suspect: vmap.get(d)._qfq_suspect } });
  }
  out.readerOnly += readerOnly.length;
  out.viewOnly += viewOnly.length;
  out.common += common.length;
  for (const [k, v] of Object.entries(byCode)) out.byCode[k] = (out.byCode[k] || 0) + v;
  return { readerRows: rows.length, viewRows: viewRows.length, common: common.length, readerOnly: readerOnly.length, viewOnly: viewOnly.length, byCode, samples, allDiffs };
}

async function main() {
  const client = new Client({ host: process.env.PGHOST || '/tmp', database: process.env.PGDATABASE || 'clair' });
  await client.connect();
  const q = (text, params) => client.query(text, params).then((r) => r.rows);
  const mkOut = () => ({ readerOnly: 0, viewOnly: 0, common: 0, byCode: {}, unexplained: 0 });
  const totals = { A: mkOut(), B: mkOut() };
  const perSymbol = [];
  for (const symbol of SAMPLE) {
    const st = (await q('SELECT id FROM stocks WHERE symbol = $1', [symbol]))[0];
    if (!st) { perSymbol.push({ symbol, error: 'stocks 无此标的' }); continue; }
    // A) getDailyQuotes 形态（区间）
    const rA = await q(`SELECT ${READER_A_COLS} FROM daily_quotes WHERE stock_id = $1 AND trade_date BETWEEN $2 AND $3`, [st.id, RANGE.start, RANGE.end]);
    const vA = await q(`SELECT ${READER_A_COLS}, _src, _qfq_suspect FROM v_daily_quotes_all WHERE stock_id = $1 AND trade_date BETWEEN $2 AND $3`, [st.id, RANGE.start, RANGE.end]);
    const a = cmpRows(symbol, rA, vA, totals.A, true);
    // B) /kline 形态（ASC LIMIT 250）
    const bcols = "stock_id, to_char(trade_date,'YYYY-MM-DD') AS trade_date, open_price, close_price, high_price, low_price, volume, turnover";
    const rB = await q(`SELECT ${bcols} FROM daily_quotes WHERE stock_id = $1 ORDER BY trade_date ASC LIMIT ${KLINE_LIMIT}`, [st.id]);
    const vB = await q(`SELECT ${bcols}, _src, _qfq_suspect FROM v_daily_quotes_all WHERE stock_id = $1 ORDER BY trade_date ASC LIMIT ${KLINE_LIMIT}`, [st.id]);
    const b = cmpRows(symbol, rB, vB, totals.B, false);
    perSymbol.push({
      symbol, isQfq: QFQ.includes(symbol), A: a, B: b,
      windowB: { readerFirst: rB[0]?.trade_date || null, readerLast: rB[rB.length - 1]?.trade_date || null,
                 viewFirst: vB[0]?.trade_date || null, viewLast: vB[vB.length - 1]?.trade_date || null },
    });
  }
  await client.end();
  const report = { ranAt: new Date().toISOString(), range: RANGE, boundary: BOUNDARY, sample: SAMPLE,
    readerA: { readerOnly: totals.A.readerOnly, viewOnly: totals.A.viewOnly, common: totals.A.common, byCode: totals.A.byCode },
    readerB: { readerOnly: totals.B.readerOnly, viewOnly: totals.B.viewOnly, common: totals.B.common, byCode: totals.B.byCode },
    unexplainedCount: totals.A.unexplained + totals.B.unexplained, perSymbol };
  const jsonPath = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : path.join(__dirname, '.shadow-reader-diff.json');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  console.log('样本:', SAMPLE.length, '只 区间:', RANGE.start, '~', RANGE.end, ' 分界:', BOUNDARY);
  console.log('A) getDailyQuotes 形态: readerOnly=' + totals.A.readerOnly + ' viewOnly(新增历史)=' + totals.A.viewOnly + ' 共同=' + totals.A.common);
  console.log('   差异分类:', JSON.stringify(totals.A.byCode));
  console.log('B) kline ASC LIMIT ' + KLINE_LIMIT + ': readerOnly=' + totals.B.readerOnly + ' viewOnly=' + totals.B.viewOnly + ' 共同=' + totals.B.common + ' 差异:', JSON.stringify(totals.B.byCode));
  for (const s of perSymbol) {
    if (s.error) { console.log(' -', s.symbol, s.error); continue; }
    const u = Object.keys(s.A.byCode).filter((k) => k.startsWith('UNEXPLAINED'));
    console.log(` - ${s.symbol} A: reader=${s.A.readerRows} view=${s.A.viewRows} viewOnly=${s.A.viewOnly} 差异=${JSON.stringify(s.A.byCode)}${u.length ? ' ⚠' + u : ''}`);
    console.log(`   B: 现 Reader ${s.B.readerRows} 行 [${s.windowB.readerFirst}~${s.windowB.readerLast}] → 视图 ${s.B.viewRows} 行 [${s.windowB.viewFirst}~${s.windowB.viewLast}] 共同=${s.B.common} 差异=${JSON.stringify(s.B.byCode)}`);
  }
  console.log('unexplained=' + report.unexplainedCount, ' JSON:', jsonPath);
  process.exit(report.unexplainedCount > 0 ? 1 : 0);
}

main().catch((e) => { console.error('FATAL', e); process.exit(2); });
