#!/usr/bin/env node
/**
 * P0-KLINE-DEPTH：daily_quotes 历史 K 线回填（试点）
 *
 * ## 缺陷背景（2026-10-24 实测）
 * `daily_quotes` 共 481,728 行 / 5,210 只，但**最早日期只到 2025-11-27**，
 * 5,197 只（99.75%）不足 250 条 K 线，`POST /api/backtest/run` 请求
 * 2025-01-01~2026-10-22 时实际只回测 2025-11-26 起，近 10 个月被静默跳过。
 * 长周期回测 / 长周期技术指标 / 因子历史 / walk-forward 全部不可用。
 *
 * ## 上游选型（实测，勿照抄）
 * - **东财 push2his.eastmoney.com：本次实测 16 次请求全部 HTTP=000 / "Empty reply
 *   from server"，判定不可达。放弃。**
 * - 腾讯 web.ifzq.gtimg.cn：**可用，但无 turnover 字段**，而 daily_quotes.turnover
 *   是 NOT NULL。只用作价格交叉校验，不作主源。
 * - **同花顺 d.10jqka.com.cn（选定主源）**：`https://d.10jqka.com.cn/v6/line/hs_<code>/01/<year>.js`
 *   返回 `日期,开,高,低,收,成交量(股),成交额(元),换手率(%),...`。
 *   实测：沪深/创业板/科创板/ST/退市股代码统一 `hs_`+6位；2018~2026 年份文件可用；
 *   单次一整年（约 243 行）。
 *
 * ## 复权口径结论（实测，2026-10-24）
 * 库内存量行 = **前复权(qfq)，但基准日是「该行写入时刻」而非最新交易日**，
 * 即「写入时刻 qfq 快照」，每次除权后存量行就过期但不回溯更新。
 *
 * 证据（贵州茅台 600519.SH，全程 217 行逐日比对腾讯 bfq/qfq）：
 *   - 2025-11-27 ~ 2025-12-18：db = bfq - 23.96（扣了 2025-12-19 除权的 23.957）
 *   - 2025-12-19 ~ 2026-10-23：db = bfq（无扣减）
 *   - 2026-06-26 有一次 28.024 除权，存量行**没扣** → 存量基准日 ∈ [2025-12-19, 2026-06-25]
 *   - 与「以 2026-10-23 为基准的标准 qfq」恒定相差 **28.02**
 *
 * 同花顺口径实测 = 标准 qfq（基准=最新交易日），与腾讯 qfq **逐日 0.00 偏差**。
 *
 * ## 同源性铁证（turnover）
 * 库内 turnover = round(同花顺 turnover / 10000) * 10000，**逐日精确吻合**：
 *   2025-12-01  同花顺 3,961,995,000 → 3,962,000,000 = 库内 3,962,000,000 ✓
 *   2026-03-10  同花顺 3,457,808,900 → 3,457,810,000 = 库内 3,457,810,000 ✓
 *   2026-06-15  同花顺 5,303,656,100 → 5,303,660,000 = 库内 5,303,660,000 ✓
 * → 存量数据就是同花顺同源、round 到万元写入的。
 *
 * ## 回填口径：为什么要 +C 对齐（`--caliber=align`，默认）
 * 存量首行 d0 的口径基准是 B（写入时刻）。对任意 d < d0：
 *     qfq_B(d)   = bfq(d) - Σ ex∈(d, B]
 *     qfq_now(d) = bfq(d) - Σ ex∈(d, B] - Σ ex∈(B, now]
 *     db(d0)     = qfq_now(d0) + Σ ex∈(B, now]
 *   ⇒ **C ≡ db(d0) - qfq_now(d0) = Σ ex∈(B, now]，与 d 无关**
 *   ⇒ 回填值 = 同花顺 qfq(d) + C  ⇒ 与存量首行**同口径、日收益率连续**
 * 若直接写标准 qfq（C≠0 时），d0-1 → d0 会出现 C 的假跳空（茅台约 2.2%），
 * 污染收益率序列。`--caliber=standard` 保留该选项用于对照。
 *
 * ## 诚实数据红线
 * - 无任何随机值、无 0 顶替、无估算成交额。turnover 直接取上游真实值再 round 到万元。
 * - turnover **已是元**，直接存，**不再乘 1e4**（本项目有过双乘 1e4 事故）。
 * - market_cap / pe_ratio / pb_ratio 上游不提供 → 显式 NULL（列可空），不伪造。
 * - change_amount/change_percent/amplitude 由同口径序列真实计算；前收未知时写 NULL。
 *
 * ## 幂等
 * 依赖唯一约束 `daily_quotes_stock_id_trade_date_key (stock_id, trade_date)`，
 * 用 `ON CONFLICT DO NOTHING`。已存在行**一律不改**（存量口径问题不在本脚本范围）。
 *
 * ## 用法
 *   node scripts/data/backfill-kline-history.cjs                      # dry-run，默认 20 只
 *   node scripts/data/backfill-kline-history.cjs --apply              # 真写库
 *   node scripts/data/backfill-kline-history.cjs --symbols 600519.SH,000001.SZ
 *   node scripts/data/backfill-kline-history.cjs --limit 5210         # 全量（需授权）
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');

const PSQL = process.env.PSQL_BIN || '/opt/homebrew/opt/postgresql@15/bin/psql';
const DB = process.env.DB_NAME || 'clair';

// ---------- CLI ----------
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};

const APPLY = has('--apply');
const DRY_RUN = !APPLY;
const LIMIT = Number(val('--limit', '20'));
const START = val('--start', '2020-01-01');
const CALIBER = val('--caliber', 'align'); // align | standard
const CONCURRENCY = Number(val('--concurrency', '4'));
const SLEEP_MS = Number(val('--sleep-ms', '350'));
const REPORT = val('--report', '/tmp/backfill-kline-history-report.json');
const RESUME = val('--resume-file', '/tmp/backfill-kline-history-resume.json');
const SYMBOLS_ARG = val('--symbols', '');
const LOG_EVERY = Number(val('--log-every', '5'));

if (!['align', 'standard'].includes(CALIBER)) {
  console.error(`--caliber 只支持 align|standard，收到 ${CALIBER}`);
  process.exit(1);
}

// ---------- DB helpers ----------
function sql(q) {
  return execFileSync(PSQL, ['-h', '/tmp', '-d', DB, '-t', '-A', '-F', '|', '-c', q], {
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
  });
}
function sqlInput(sqlText) {
  return execFileSync(PSQL, ['-h', '/tmp', '-d', DB, '-t', '-A', '-c', sqlText], {
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
  });
}
const q1 = (s) => `'${String(s).replace(/'/g, "''")}'`;

// ---------- upstream ----------
const THS_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  Referer: 'https://stockpage.10jqka.com.cn/',
  Accept: '*/*',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 拉同花顺某一年日线；失败重试 + 指数退避。
 * @returns {string[]} 原始行 | 'NODATA'（404，该年永久无数据，如退市股/上市前）| null（网络/5xx，重试后仍失败）
 */
async function fetchThsYear(code, year, tries = 4) {
  const url = `https://d.10jqka.com.cn/v6/line/hs_${code}/01/${year}.js`;
  for (let i = 0; i < tries; i++) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 25000);
      const resp = await fetch(url, { headers: THS_HEADERS, signal: ctl.signal });
      clearTimeout(timer);
      // 404 = 上游根本没有该年份文件（退市股实测全 404），不是网络故障，不再重试
      if (resp.status === 404) return 'NODATA';
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const text = await resp.text();
      const m = text.match(/\(([\s\S]*)\)/);
      if (!m) throw new Error('JSONP 外壳解析失败');
      const d = JSON.parse(m[1]);
      if (!d || typeof d.data !== 'string') throw new Error('data 字段缺失');
      return d.data.split(';').filter((x) => x.trim());
    } catch (e) {
      if (i === tries - 1) return null;
      await sleep(600 * 2 ** i + Math.floor(Math.random() * 300));
    }
  }
  return null;
}

/** 解析一行：`YYYYMMDD,open,high,low,close,volume(股),turnover(元),turnover_rate(%),...` */
function parseRow(raw) {
  const p = raw.split(',');
  if (p.length < 7) return null;
  const d = p[0].trim();
  if (!/^\d{8}$/.test(d)) return null;
  const num = (s) => {
    const v = Number(s);
    return Number.isFinite(v) ? v : null;
  };
  return {
    date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
    open: num(p[1]),
    high: num(p[2]),
    low: num(p[3]),
    close: num(p[4]),
    volume: num(p[5]), // 股
    turnover: num(p[6]), // 元
    turnoverRate: p.length > 7 ? num(p[7]) : null,
  };
}

// ---------- 选股 ----------
function loadTargets() {
  if (SYMBOLS_ARG) {
    const list = SYMBOLS_ARG.split(',').map((s) => s.trim()).filter(Boolean);
    const inClause = list.map(q1).join(',');
    const rows = sql(
      `SELECT s.id, s.symbol, s.name, s.market, COALESCE(q.mn::text, '') mn, COALESCE(q.ct, 0) ct
       FROM stocks s LEFT JOIN (SELECT stock_id, min(trade_date) mn, count(*) ct FROM daily_quotes GROUP BY 1) q
         ON q.stock_id = s.id
       WHERE s.symbol IN (${inClause}) AND s.industry <> '指数'
       ORDER BY s.symbol`
    )
      .trim()
      .split('\n')
      .filter(Boolean);
    return rows.map((r) => {
      const [id, symbol, name, market, mn, ct] = r.split('|');
      return { id: Number(id), symbol, name, market, firstDate: mn || null, count: Number(ct) };
    });
  }
  // 默认：有行情行、按条数倒序（优先补缺口最大的），排除指数
  const rows = sql(
    `SELECT s.id, s.symbol, s.name, s.market, q.mn, q.ct
     FROM stocks s JOIN (SELECT stock_id, min(trade_date) mn, count(*) ct FROM daily_quotes GROUP BY 1) q
       ON q.stock_id = s.id
     WHERE s.industry <> '指数'
     ORDER BY q.ct DESC, s.symbol
     LIMIT ${Number(LIMIT) | 0}`
  )
    .trim()
    .split('\n')
    .filter(Boolean);
  return rows.map((r) => {
    const [id, symbol, name, market, mn, ct] = r.split('|');
    return { id: Number(id), symbol, name, market, firstDate: mn, count: Number(ct) };
  });
}

/** 取某股票存量最早的 N 个交易日真实值，用于口径对齐与单位校验 */
function loadExistingHead(stockId, n = 5) {
  const out = sql(
    `SELECT trade_date, close_price, volume, turnover FROM daily_quotes
     WHERE stock_id = ${stockId} ORDER BY trade_date ASC LIMIT ${n | 0}`
  )
    .trim()
    .split('\n')
    .filter(Boolean);
  return out.map((r) => {
    const [d, c, v, t] = r.split('|');
    return { date: d, close: Number(c), volume: Number(v), turnover: Number(t) };
  });
}

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ---------- 主流程 ----------
async function processOne(st) {
  const code = st.symbol.split('.')[0];
  const startYear = Number(START.slice(0, 4));
  const endYear = st.firstDate ? Number(st.firstDate.slice(0, 4)) : new Date().getFullYear();
  const years = [];
  for (let y = startYear; y <= endYear; y++) years.push(y);

  const rawByYear = {};
  for (let i = 0; i < years.length; i += CONCURRENCY) {
    const chunk = years.slice(i, i + CONCURRENCY);
    const res = await Promise.all(chunk.map((y) => fetchThsYear(code, y)));
    chunk.forEach((y, k) => (rawByYear[y] = res[k]));
    await sleep(SLEEP_MS);
  }
  const series = new Map();
  for (const y of years) {
    const raws = rawByYear[y];
    if (!Array.isArray(raws)) continue; // null（网络故障）或 'NODATA'（永久无数据）
    for (const raw of raws) {
      const r = parseRow(raw);
      if (r && r.close != null && r.open != null && r.high != null && r.low != null) series.set(r.date, r);
    }
  }
  const allDates = [...series.keys()].sort();
  // 404（永久无数据）不算故障；只有网络/5xx 才算。
  // 此外：早于上游首日的年份失败 = 上市前，属预期，也不算故障（如 603406 天富龙 2025-08 上市）
  const minYear = allDates.length ? Number(allDates[0].slice(0, 4)) : null;
  const isPreIpo = (y) => minYear != null && y < minYear;
  const noDataYears = years.filter((y) => rawByYear[y] === 'NODATA');
  const failedYears = years.filter((y) => rawByYear[y] == null && !isPreIpo(y));
  if (!series.size) {
    return {
      ...st,
      status: failedYears.length ? 'FAIL_FETCH' : 'NO_DATA_UPSTREAM',
      failedYears,
      noDataYears,
      newRows: 0,
    };
  }

  // ---- 口径对齐系数 C 与 volume 单位比 ----
  let C = 0;
  let volRatio = 100; // 同花顺是股，库内主板是手 → 100；科创板库内是股 → 1
  let tovDelta = null;
  let alignBasis = null;
  const head = st.firstDate ? loadExistingHead(st.id, 5) : [];
  if (head.length) {
    const cDiffs = [], vRatios = [], tDiffs = [];
    for (const h of head) {
      const u = series.get(h.date);
      if (!u) continue;
      cDiffs.push(h.close - u.close);
      if (h.volume > 0 && u.volume > 0) vRatios.push(u.volume / h.volume);
      if (u.turnover > 0) tDiffs.push(h.turnover - Math.round(u.turnover / 10000) * 10000);
    }
    if (cDiffs.length) {
      C = median(cDiffs);
      alignBasis = { date: head[0].date, samples: cDiffs.length };
    }
    if (vRatios.length) {
      const mr = median(vRatios);
      // 只接受明确的 100（手）或 1（股），否则原样报告异常
      if (Math.abs(mr - 100) < 1) volRatio = 100;
      else if (Math.abs(mr - 1) < 0.05) volRatio = 1;
      else volRatio = mr;
    }
    if (tDiffs.length) tovDelta = median(tDiffs);
  }
  if (CALIBER === 'standard') C = 0;

  // ---- 待写入行：早于存量首行、且不晚于 START ----
  const existingDates = new Set(
    st.firstDate
      ? sql(`SELECT trade_date FROM daily_quotes WHERE stock_id = ${st.id} AND trade_date <= ${q1(st.firstDate)}`)
          .trim()
          .split('\n')
          .filter(Boolean)
      : []
  );

  const cutoff = st.firstDate || '9999-12-31';
  const rows = [];
  for (const d of allDates) {
    if (d < START || d >= cutoff) continue;
    if (existingDates.has(d)) continue;
    const u = series.get(d);
    if (u.close == null || u.volume == null || u.turnover == null) continue;
    rows.push({ date: d, u });
  }

  // ---- 派生字段（同口径序列真实计算） ----
  const insertRows = [];
  for (let i = 0; i < rows.length; i++) {
    const { date, u } = rows[i];
    const close = round2(u.close + C);
    const open = round2(u.open + C);
    const high = round2(u.high + C);
    const low = round2(u.low + C);
    const volume = Math.round(u.volume / volRatio);
    const turnover = Math.round(u.turnover / 10000) * 10000; // 元，round 到万元（与存量一致）
    // 前收：同花顺序列中上一交易日（已按 C 对齐）
    let prevClose = null;
    for (let j = i - 1; j >= 0; j--) {
      const p = series.get(rows[j].date);
      if (p) { prevClose = p.close + C; break; }
    }
    let changeAmount = null, changePercent = null, amplitude = null;
    if (prevClose != null && prevClose !== 0) {
      changeAmount = round2(close - prevClose);
      changePercent = round4((changeAmount / prevClose) * 100);
      amplitude = round4(((high - low) / prevClose) * 100);
    }
    insertRows.push({ date, open, high, low, close, volume, turnover, changeAmount, changePercent, amplitude, turnoverRate: u.turnoverRate });
  }

  let inserted = 0;
  if (insertRows.length) {
    const values = insertRows
      .map((r) => {
        const n = (v) => (v == null ? 'NULL' : String(v));
        return `(${st.id},${q1(r.date)},${n(r.open)},${n(r.close)},${n(r.high)},${n(r.low)},` +
          `${r.volume},${r.turnover},${n(r.changeAmount)},${n(r.changePercent)},` +
          `${n(r.amplitude)},${n(r.turnoverRate)})`;
      })
      .join(',\n');
    const stmt =
      `INSERT INTO daily_quotes (stock_id, trade_date, open_price, close_price, high_price, low_price, ` +
      `volume, turnover, change_amount, change_percent, amplitude, turnover_rate)\nVALUES ${values}\n` +
      `ON CONFLICT (stock_id, trade_date) DO NOTHING;`;
    if (DRY_RUN) {
      inserted = insertRows.length; // dry-run 只计数
    } else {
      sqlInput(stmt);
      const after = sql(`SELECT count(*) FROM daily_quotes WHERE stock_id = ${st.id} AND trade_date < ${q1(cutoff)}`).trim();
      inserted = Number(after);
    }
  }

  const newMinDate = insertRows.length ? insertRows[0].date : null;
  return {
    ...st,
    // PARTIAL = 有年份因网络故障没拉到（数据可能不全）；
    // 仅 noDataYears（404，上市前/退市）属预期，仍算 OK
    status: failedYears.length ? 'PARTIAL' : 'OK',
    failedYears,
    noDataYears,
    upstreamRows: series.size,
    upstreamMin: allDates[0],
    upstreamMax: allDates[allDates.length - 1],
    C: round4(C),
    volRatio,
    turnoverDeltaVsUpstream: tovDelta,
    alignBasis,
    newRows: insertRows.length,
    inserted,
    newMinDate,
    sampleFirst: insertRows[0] || null,
    sampleLast: insertRows[insertRows.length - 1] || null,
  };
}

const round2 = (v) => Math.round(v * 100) / 100;
const round4 = (v) => Math.round(v * 10000) / 10000;

(async () => {
  console.log(`== backfill-kline-history ==`);
  console.log(`模式: ${DRY_RUN ? 'DRY-RUN（不写库）' : 'APPLY（写库）'} | 口径: ${CALIBER} | 起点: ${START} | 并发: ${CONCURRENCY}`);

  const done = fs.existsSync(RESUME) ? JSON.parse(fs.readFileSync(RESUME, 'utf8')) : {};
  // 断点续跑：只跳过上次已成功（OK/PARTIAL）的，失败的重跑
  const targets = loadTargets().filter((t) => !['OK', 'PARTIAL'].includes(done[t.symbol]?.status));
  console.log(`目标股票: ${targets.length} 只（已跳过 resume 中 ${Object.keys(done).length} 只）`);

  const results = [];
  const failures = [];
  const upstreamMissing = [];
  const t0 = Date.now();
  for (let i = 0; i < targets.length; i += 1) {
    const st = targets[i];
    let r;
    try {
      r = await processOne(st);
    } catch (e) {
      r = { ...st, status: 'ERROR', error: e.message, newRows: 0 };
    }
    results.push(r);
    done[st.symbol] = { status: r.status, newRows: r.newRows };
    if (['FAIL_FETCH', 'FAIL_EMPTY', 'ERROR'].includes(r.status)) failures.push(`${st.symbol}(${r.status})`);
    if (r.status === 'NO_DATA_UPSTREAM') upstreamMissing.push(st.symbol);
    if ((i + 1) % LOG_EVERY === 0 || i === targets.length - 1) {
      const el = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`  [${i + 1}/${targets.length}] ${el}s 累计新增 ${results.reduce((a, b) => a + (b.newRows || 0), 0)} 行`);
    }
    fs.writeFileSync(RESUME, JSON.stringify(done, null, 2));
  }

  // ---- 报告 ----
  console.log('\n== 逐股结果 ==');
  console.log('symbol      | 存量首日   | 条数 | 上游起~止            | 上游行 | C(口径漂移) | vol比 | 新增 | 新首日');
  for (const r of results) {
    console.log(
      `${(r.symbol + ' ' + r.name).padEnd(24).slice(0, 24)} | ${String(r.firstDate || '-').padEnd(10)} | ${String(r.count).padStart(4)} | ` +
        `${String(r.upstreamMin || '-')}~${String(r.upstreamMax || '-')} | ${String(r.upstreamRows || 0).padStart(5)} | ` +
        `${String(r.C).padStart(10)} | ${String(r.volRatio).padStart(5)} | ${String(r.newRows).padStart(5)} | ${r.newMinDate || '-'} ${r.status}`
    );
  }

  const totalNew = results.reduce((a, b) => a + (b.newRows || 0), 0);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const drift = results.filter((r) => Math.abs(r.C || 0) > 0.01);
  const oddVol = results.filter((r) => r.upstreamRows && r.volRatio !== 100 && r.volRatio !== 1);
  console.log(`\n合计: 目标 ${results.length} 只，新增 ${totalNew} 行，耗时 ${elapsed}s`);
  console.log(`口径漂移(C≠0)股票: ${drift.length} 只 → ${drift.map((d) => `${d.symbol}:${d.C}`).join(', ')}`);
  console.log(`volume 单位异常(非100/非1): ${oddVol.length} 只 → ${oddVol.map((d) => `${d.symbol}:${d.volRatio}`).join(', ')}`);
  console.log(`上游无数据(非故障): ${upstreamMissing.length} 只 → ${upstreamMissing.join(', ') || '(无)'}`);
  console.log(`失败(网络/解析): ${failures.length} 只 → ${failures.join(', ') || '(无)'}`);

  fs.writeFileSync(
    REPORT,
    JSON.stringify({ startedAt: new Date().toISOString(), apply: APPLY, caliber: CALIBER, start: START, results, failures, upstreamMissing }, null, 2)
  );
  console.log(`报告: ${REPORT}`);
  if (DRY_RUN) console.log('（DRY-RUN：未写库。加 --apply 才会写入）');
})().catch((e) => {
  console.error('执行失败:', e.message, e.stack);
  process.exit(1);
});
