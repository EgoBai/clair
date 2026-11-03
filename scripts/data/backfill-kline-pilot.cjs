#!/usr/bin/env node
/**
 * PILOT：沪深300 + 中证500 成分股「不复权」日线回填 → daily_quotes_hist
 *
 * 设计文档：docs/harness/KLINE-STORAGE-DESIGN.md
 * 实测报告：docs/harness/KLINE-BACKFILL-PILOT.md
 *
 * ## 为什么是双源拼装（不是凑数，是有硬证据的）
 * 2026-11-02 实测上游可用性：
 *   - 腾讯 fqkline `...,bfq`：**唯一可用的不复权 OHLCV 源**（东财 push2his/push2 全 HTTP 000，网易 502）
 *     返回数组顺序 = [date, open, close, high, low, volume]，volume 单位「主板手 / 科创板股」（原样）
 *   - 同花顺 `d.10jqka.com.cn/v6/line/hs_<code>/01/<year>.js`：**价格是 qfq（不可用）**，但**成交额(元)真实**
 * 成交额是「当天真实成交的钱」，与复权口径无关，因此可以跨源拼装。
 * 库内 529k 行的 turnover 已实测全部来自同花顺（round 到万元逐日精确吻合），本次只是把价格换成腾讯 bfq。
 *
 * ## 口径（写死，不接受参数覆盖）
 *   price = 不复权（腾讯 bfq），表内 CHECK (price_adj='N') 物理拒绝 qfq
 *   volume_shares = 股（主板 = 腾讯手 × 100，科创板 688/689 = 腾讯原值）
 *   turnover_cny = 元（同花顺 成交额 原值，两位小数，**不做万元取整**）
 *   market_cap / pe / pb = NULL（上游不提供，禁止估算）
 *
 * ## 幂等 / 断点续传
 *   - PRIMARY KEY (stock_id, trade_date) + ON CONFLICT DO NOTHING
 *   - checkpoint 在「事务提交之后」写盘 ⇒ 已 checkpoint 必然已入库；未 checkpoint 但已入库会被 DO NOTHING 吃掉
 *   - 启动时可选 --recheck：用库内实际行数校正 checkpoint
 *
 * ## 用法
 *   node scripts/data/backfill-kline-pilot.cjs --limit 5                 # dry-run，不写库
 *   node scripts/data/backfill-kline-pilot.cjs --limit 5 --apply         # 实写
 *   node scripts/data/backfill-kline-pilot.cjs --index csi300 --apply
 *   node scripts/data/backfill-kline-pilot.cjs --symbols 600519.SH,000001.SZ --apply
 *   node scripts/data/backfill-kline-pilot.cjs --start 2023-11-01 --apply
 *   node scripts/data/backfill-kline-pilot.cjs --limit 800 --apply --concurrency 6
 *   node scripts/data/backfill-kline-pilot.cjs --verify 600519.SH,000001.SZ,688981.SH --verify-days 5
 *   node scripts/data/backfill-kline-pilot.cjs --universe all --apply --rps 6      # 全市场缺口（近期有行情且 hist 无行）
 *   node scripts/data/backfill-kline-pilot.cjs --universe all --recheck --apply    # 启动时用库内行数校正 checkpoint
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { Client } = (() => {
  const cands = [
    '../../backend/node_modules/pg', // scripts/data → repo/backend
    '../../node_modules/pg',
    'pg',
  ];
  for (const c of cands) {
    try { return require(c); } catch { /* next */ }
  }
  throw new Error(`找不到 pg 模块（尝试过：${cands.join(', ')}）`);
})();

// ---------------- CLI ----------------
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};

const APPLY = has('--apply');
const OVERWRITE = has('--overwrite');
const LIMIT = Number(val('--limit', '0')); // 0 = 不限制
const START = val('--start', '2023-11-01');
const END = val('--end', new Date().toISOString().slice(0, 10));
const INDEX = val('--index', 'both'); // both | csi300 | csi500
const UNIVERSE = val('--universe', 'index'); // index | all（all=近期有行情且 hist 无行的全市场缺口）
const SYMBOLS_ARG = val('--symbols', '');
const CONCURRENCY = Number(val('--concurrency', '6'));
const SLEEP_MS = Number(val('--sleep-ms', '120'));
const VERIFY_SYMBOLS = val('--verify', '');
const VERIFY_DAYS = Number(val('--verify-days', '5'));
// 全局请求节流（次/秒）。实测：不限速跑 800 只（约 4000 次请求 / 146s ≈ 27 rps）
// 会在末段触发上游 501 限流，cool-down 数分钟才恢复。全量 5,200 只必须限速。
const RPS = Number(val('--rps', '8'));

const SCRIPT_DIR = __dirname;
const CACHE_DIR = path.join(SCRIPT_DIR, '.cache');
const THS_CACHE = path.join(CACHE_DIR, 'ths');
const CKPT = val('--checkpoint', path.join(SCRIPT_DIR, '.backfill-kline-pilot.ckpt.json'));
const REPORT = val('--report', path.join(SCRIPT_DIR, '.backfill-kline-pilot.report.json'));

const DB = process.env.PGDATABASE || 'clair';
const HOST = process.env.PGHOST || '/tmp';

if (!['both', 'csi300', 'csi500'].includes(INDEX)) {
  console.error(`--index 只支持 both|csi300|csi500，收到 ${INDEX}`);
  process.exit(1);
}
for (const d of [CACHE_DIR, THS_CACHE]) fs.mkdirSync(d, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 简单令牌桶：全局吞吐上限 RPS 次/秒 */
let _nextSlot = 0;
async function throttle() {
  if (!(RPS > 0)) return;
  const gap = 1000 / RPS;
  const now = Date.now();
  const slot = Math.max(now, _nextSlot);
  _nextSlot = slot + gap;
  const wait = slot - now;
  if (wait > 0) await sleep(wait);
}
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
// 网络请求计数（含重试，供回填审计报告用）
let reqCount = 0; const _fetch = globalThis.fetch;
globalThis.fetch = (...a) => { reqCount++; return _fetch(...a); };

// ---------------- 日志 ----------------
const T0 = Date.now();
const log = (...a) => console.log(`[+${((Date.now() - T0) / 1000).toFixed(0)}s]`, ...a);
const warn = (...a) => console.warn(`[+${((Date.now() - T0) / 1000).toFixed(0)}s] ⚠`, ...a);

// ---------------- PG ----------------
let client;
async function connect() {
  client = new Client({ host: HOST, database: DB });
  await client.connect();
}
async function q(text, params) {
  const r = await client.query(text, params);
  return r.rows;
}

// ---------------- 指数成分（真实源：东财数据中心 RPT_INDEX_TS_COMPONENT） ----------------
const EM_TYPES = { csi300: '1', csi500: '3' };

async function fetchConstituentsOnce(emType) {
  const out = [];
  for (let page = 1; page <= 5; page++) {
    const url =
      'https://datacenter-web.eastmoney.com/api/data/v1/get' +
      '?reportName=RPT_INDEX_TS_COMPONENT&columns=SECUCODE,SECURITY_NAME_ABBR,WEIGHT' +
      `&filter=(TYPE%3D%22${emType}%22)&pageSize=1000&pageNumber=${page}&source=WEB&client=WEB`;
    let j = null;
    for (let i = 0; i < 3; i++) {
      try {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 20000);
        await throttle();
        const resp = await fetch(url, { headers: { 'User-Agent': UA }, signal: ctl.signal });
        clearTimeout(timer);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        j = await resp.json();
        break;
      } catch (e) {
        if (i === 2) throw new Error(`成分源不可达（TYPE=${emType}）：${e.message}`);
        await sleep(800 * (i + 1));
      }
    }
    const rows = j?.result?.data;
    if (!Array.isArray(rows)) throw new Error(`成分源返回异常（TYPE=${emType}）：${j?.message ?? 'result 空'}`);
    for (const r of rows) {
      const sym = String(r.SECUCODE ?? '');
      if (!/^\d{6}\.(SH|SZ)$/.test(sym)) continue; // 剔除指数/北交所/异常代码
      out.push({ symbol: sym, name: String(r.SECURITY_NAME_ABBR ?? '') });
    }
    if (rows.length < 1000) break;
  }
  return out;
}

async function loadConstituents() {
  const cacheFile = path.join(CACHE_DIR, `constituents-${new Date().toISOString().slice(0, 10)}.json`);
  if (fs.existsSync(cacheFile)) {
    const c = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    log(`成分清单命中当日缓存：${c.symbols.length} 只（${c.source}）`);
    return c;
  }
  const want = INDEX === 'both' ? ['csi300', 'csi500'] : [INDEX];
  const set = new Map();
  const detail = {};
  for (const k of want) {
    const rows = await fetchConstituentsOnce(EM_TYPES[k]);
    detail[k] = rows.length;
    for (const r of rows) set.set(r.symbol, r);
    log(`成分源 ${k}：${rows.length} 只`);
  }
  const symbols = [...set.keys()].sort();
  const payload = {
    source: 'eastmoney RPT_INDEX_TS_COMPONENT (TYPE 1=沪深300, 3=中证500)',
    fetchedAt: new Date().toISOString(),
    counts: detail,
    symbols,
  };
  fs.writeFileSync(cacheFile, JSON.stringify(payload, null, 2));
  log(`成分清单合计去重 ${symbols.length} 只 → ${cacheFile}`);
  return payload;
}

// ---------------- 腾讯 bfq（价格/成交量） ----------------
/**
 * @returns {Promise<Array<{date,open,close,high,low,volume}>>}
 * 注意：腾讯返回数组顺序 = [date, open, close, high, low, volume]（实测，非 OHLC 顺序）
 */
// 腾讯同一接口有多个域名；实测 web.ifzq 被限流返回 501 时，ifzq 仍然 200。
// 故按列表轮换，任一域名成功即止。
const TX_HOSTS = (process.env.TX_HOSTS || 'web.ifzq.gtimg.cn,ifzq.gtimg.cn').split(',');
let txHostIdx = 0;

/**
 * 单次请求最多返回 800 根（实测硬上限）——3 年 726 根刚好够，但 `--start 2020-01-01` 会被静默截断。
 * 故按「窗口回退」翻页：若返回的最早日期仍晚于 start，则以 (最早日期 - 1 天) 为新 end 继续拉，直到覆盖 start。
 */
async function fetchTencentBfq(symbol, start, end) {
  const byDate = new Map();
  let curEnd = end;
  let guard = 0;
  for (;;) {
    if (++guard > 40) break; // 40 窗口 × 800 根 ≈ 128 年，防御性上限
    const page = await fetchTencentBfqPage(symbol, start, curEnd);
    for (const b of page) byDate.set(b.date, b);
    if (page.length < 700) break;                       // 未打满，说明已到 start
    const earliest = page[0].date;
    if (earliest <= start) break;                       // 已覆盖 start
    const d = new Date(`${earliest}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    const nextEnd = d.toISOString().slice(0, 10);
    if (nextEnd >= curEnd) break;                       // 无进展，防死循环
    curEnd = nextEnd;
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

async function fetchTencentBfqPage(symbol, start, end, tries = 4) {
  const m = /^(\d{6})\.(SH|SZ)$/.exec(symbol);
  if (!m) throw new Error(`非法 symbol：${symbol}`);
  const tx = `${m[2] === 'SH' ? 'sh' : 'sz'}${m[1]}`;
  for (let i = 0; i < tries; i++) {
    const host = TX_HOSTS[(txHostIdx + i) % TX_HOSTS.length];
    const url =
      `https://${host}/appstock/app/fqkline/get` +
      `?param=${tx},day,${start},${end},800,bfq`;
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 25000);
      await throttle();
      const resp = await fetch(url, { headers: { 'User-Agent': UA }, signal: ctl.signal });
      clearTimeout(timer);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const j = await resp.json();
      const node = j?.data?.[tx];
      const raw = node?.day || node?.bfqday; // bfq 参数下键名为 day
      if (!Array.isArray(raw)) throw new Error(`返回结构异常 code=${j?.code} msg=${j?.msg}`);
      txHostIdx = (txHostIdx + i) % TX_HOSTS.length; // 记住可用域名
      return raw
        .filter((r) => Array.isArray(r) && /^\d{4}-\d{2}-\d{2}$/.test(r[0]))
        .map((r) => ({
          date: r[0],
          open: Number(r[1]),
          close: Number(r[2]),
          high: Number(r[3]),
          low: Number(r[4]),
          volume: Number(r[5]),
        }))
        .filter((b) => [b.open, b.close, b.high, b.low, b.volume].every((x) => Number.isFinite(x)));
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(700 * 2 ** i + Math.floor(Math.random() * 300));
    }
  }
  return [];
}

// ---------------- 同花顺（成交额，元） ----------------
/** @returns {Promise<Map<string,'NODATA'|{amount:number,turnRate:number|null}>>} */
const thsCache = new Map();
async function fetchThsYear(code, year, tries = 5) {
  const key = `${code}/${year}`;
  if (thsCache.has(key)) return thsCache.get(key);

  const disk = path.join(THS_CACHE, `${code}-${year}.json`);
  if (fs.existsSync(disk)) {
    try {
      const obj = JSON.parse(fs.readFileSync(disk, 'utf8'));
      const mp = new Map(Object.entries(obj));
      thsCache.set(key, mp);
      return mp;
    } catch { /* 缓存坏了就重拉 */ }
  }

  const url = `https://d.10jqka.com.cn/v6/line/hs_${code}/01/${year}.js`;
  let result = null;
  for (let i = 0; i < tries; i++) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 25000);
      await throttle();
      const resp = await fetch(url, {
        headers: { 'User-Agent': UA, Referer: 'https://stockpage.10jqka.com.cn/', Accept: '*/*' },
        signal: ctl.signal,
      });
      clearTimeout(timer);
      if (resp.status === 404) { result = 'NODATA'; break; }
      if (resp.status === 501 || resp.status === 429 || resp.status === 503) {
        // 同花顺限流（实测：连续请求约 3000 次后开始返回 501，cool-down 后恢复）
        throw new Error(`RATE_LIMITED_${resp.status}`);
      }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const text = await resp.text();
      const mm = text.match(/\(([\s\S]*)\)/);
      if (!mm) throw new Error('JSONP 外壳解析失败');
      const d = JSON.parse(mm[1]);
      if (typeof d?.data !== 'string') throw new Error('data 字段缺失');
      const mp = new Map();
      for (const line of d.data.split(';')) {
        const p = line.split(',');
        if (p.length < 7 || !/^\d{8}$/.test(p[0].trim())) continue;
        const ds = `${p[0].slice(0, 4)}-${p[0].slice(4, 6)}-${p[0].slice(6, 8)}`;
        const amt = Number(p[6]);
        const tr = p.length > 7 ? Number(p[7]) : NaN;
        if (!Number.isFinite(amt)) continue;
        mp.set(ds, { amount: amt, turnRate: Number.isFinite(tr) ? tr : null });
      }
      result = mp;
      try { fs.writeFileSync(disk, JSON.stringify(Object.fromEntries(mp))); } catch { /* 缓存失败不影响主流程 */ }
      break;
    } catch (e) {
      if (i === tries - 1) { result = null; break; }
      const limited = String(e.message).startsWith('RATE_LIMITED');
      await sleep((limited ? 2500 : 700) * 2 ** i + Math.floor(Math.random() * 400));
    }
  }
  if (result !== 'NODATA' && result === null) {
    thsCache.set(key, null); // 网络故障，本次不缓存
    return null;
  }
  thsCache.set(key, result);
  return result;
}

/** 拉某标的全区间成交额 */
async function loadThsAmounts(code, years) {
  const out = new Map();
  let failed = 0;
  const chunks = [];
  for (let i = 0; i < years.length; i += 3) chunks.push(years.slice(i, i + 3));
  for (const ch of chunks) {
    const res = await Promise.all(ch.map((y) => fetchThsYear(code, y)));
    ch.forEach((y, k) => {
      const r = res[k];
      if (r == null) { failed++; return; }
      if (r === 'NODATA') return;
      for (const [d, v] of r) out.set(d, v);
    });
    await sleep(SLEEP_MS);
  }
  return { amounts: out, failed };
}

// ---------------- 成交量单位判定（价格锚定，实测不猜） ----------------
/**
 * 上游（腾讯）成交量单位不统一：主板/创业板 = 手，科创板 688/689 = 股。
 * 判定方法（价格锚定，可自证）：成交额 ÷ 成交量 = 每单位对应的钱。
 *   - 若 amount/volume      落在当日 [low, high] 区间 → volume 单位 = 股
 *   - 若 amount/(volume×100) 落在当日 [low, high] 区间 → volume 单位 = 手
 * 用最近若干有效交易日投票，容差 ±5%（日内 VWAP 必在高低之间，故判定近乎确定）。
 * 该方法同时充当「元 ↔ 万元」10000 倍错位的检测器（错位后两种假设都不落在区间内）。
 */
const volUnitCache = new Map();
function detectUnitByPriceAnchor(bars, amounts) {
  let voteShares = 0, voteHand = 0, tested = 0;
  const probes = [];
  for (let i = bars.length - 1; i >= 0 && probes.length < 8; i--) {
    const b = bars[i];
    const a = amounts.get(b.date);
    if (!a || !(a.amount > 0) || !(b.volume > 0)) continue;
    probes.push({ b, a });
  }
  for (const { b, a } of probes) {
    const lo = b.low * 0.95, hi = b.high * 1.05;
    const pShares = a.amount / b.volume;         // 假设 volume 是「股」
    const pHand = a.amount / (b.volume * 100);   // 假设 volume 是「手」
    const okShares = pShares >= lo && pShares <= hi;
    const okHand = pHand >= lo && pHand <= hi;
    tested++;
    if (okShares && !okHand) voteShares++;
    else if (okHand && !okShares) voteHand++;
  }
  if (!tested) return null;
  if (voteShares > voteHand) return { unit: 'shares', tested, voteShares, voteHand };
  if (voteHand > voteShares) return { unit: 'hand', tested, voteShares, voteHand };
  return null;
}

async function resolveVolumeUnit(stockId, symbol, tencentBars, amounts) {
  if (volUnitCache.has(symbol)) return volUnitCache.get(symbol);
  let r = null;
  const det = detectUnitByPriceAnchor(tencentBars, amounts);
  if (det) {
    r = { unit: det.unit, basis: `价格锚定投票 ${det.unit}:${Math.max(det.voteShares, det.voteHand)}/${det.tested}（股票=${det.voteShares} 手票=${det.voteHand}）` };
  }
  if (!r) {
    const prefixShares = /^68[89]/.test(symbol.slice(0, 3));
    r = { unit: prefixShares ? 'shares' : 'hand', basis: `价格锚定失败 → 代码段兜底(${prefixShares ? 'shares' : 'hand'})` };
  }
  // 附带一项独立旁证：库内已有一行与腾讯同日的 volume 比值（应为 1.0000，说明库内是"腾讯原样落库"）
  try {
    const rows = await q(
      `SELECT to_char(trade_date,'YYYY-MM-DD') AS d, volume FROM daily_quotes
        WHERE stock_id = $1 AND trade_date >= $2::date - 400 AND trade_date <= $2::date
        ORDER BY trade_date DESC LIMIT 1`,
      [stockId, tencentBars[tencentBars.length - 1].date]
    );
    if (rows.length) {
      const bar = tencentBars.find((b) => b.date === rows[0].d);
      if (bar && bar.volume > 0) r.dbRatio = +(Number(rows[0].volume) / bar.volume).toFixed(4);
    }
  } catch { /* 旁证失败不影响主判定 */ }
  volUnitCache.set(symbol, r);
  return r;
}

// ---------------- checkpoint ----------------
function loadCkpt() {
  if (!fs.existsSync(CKPT)) return { done: {}, startedAt: new Date().toISOString() };
  try { return JSON.parse(fs.readFileSync(CKPT, 'utf8')); } catch { return { done: {}, startedAt: new Date().toISOString() }; }
}
function saveCkpt(c) {
  fs.writeFileSync(CKPT, JSON.stringify(c, null, 0));
}

// ---------------- 单标的处理 ----------------
const r4 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10000) / 10000);

async function processSymbol(st, thsYears) {
  let bars;
  try {
    bars = await fetchTencentBfq(st.symbol, START, END);
  } catch (e) {
    return { status: 'FETCH_ERROR', stage: 'tencent', inserted: 0, skipped: 0, bars: 0, detail: e.message };
  }
  if (!bars.length) return { status: 'NO_UPSTREAM', inserted: 0, skipped: 0, bars: 0 };

  // OHLC 自洽（上游给错就整只拒绝，不硬塞）
  for (const b of bars) {
    if (!(b.high >= b.low) || !(b.high >= b.open) || !(b.high >= b.close) ||
        !(b.low <= b.open) || !(b.low <= b.close) || !(b.close > 0)) {
      return { status: 'BAD_UPSTREAM_OHLC', inserted: 0, skipped: 0, bars: bars.length, detail: JSON.stringify(b) };
    }
  }

  const { amounts, failed } = await loadThsAmounts(st.symbol.slice(0, 6), thsYears);
  if (failed > 0 && amounts.size === 0) {
    return { status: 'FETCH_ERROR', stage: 'ths', inserted: 0, skipped: 0, bars: bars.length, detail: `同花顺 ${failed} 个年份全部失败` };
  }
  const { unit, basis } = await resolveVolumeUnit(st.id, st.symbol, bars, amounts);
  const mult = unit === 'hand' ? 100 : 1;

  const rows = [];
  let noAmount = 0;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const a = amounts.get(b.date);
    if (!a) { noAmount++; continue; } // 成交额缺失 → 该日整行不写（turnover NOT NULL，绝不填 0）
    const prevClose = i > 0 ? bars[i - 1].close : null;
    const chg = prevClose ? b.close - prevClose : null;
    const chgPct = prevClose ? (chg / prevClose) * 100 : null;
    const amp = prevClose ? ((b.high - b.low) / prevClose) * 100 : null;
    rows.push([
      st.id, b.date, b.open, b.high, b.low, b.close, prevClose,
      Math.round(b.volume * mult), a.amount,
      chg == null ? null : r4(chg), r4(chgPct), r4(amp),
      a.turnRate == null ? null : r4(a.turnRate),
      'N', // price_adj：不复权（表上 CHECK 只允许 N）
    ]);
  }
  if (!rows.length) return { status: 'NO_AMOUNT', inserted: 0, skipped: 0, bars: bars.length, noAmount, failed };

  if (!APPLY) return { status: 'DRY', inserted: 0, skipped: 0, bars: bars.length, rows: rows.length, noAmount, failed, unit, basis };

  // 单标的单事务
  const cols = 14;
  const values = [];
  const params = [];
  rows.forEach((r, ri) => {
    const ph = [];
    for (let c = 0; c < cols; c++) { params.push(r[c]); ph.push(`$${ri * cols + c + 1}`); }
    values.push(`(${ph.join(',')})`);
  });
  const conflict = OVERWRITE
    ? `ON CONFLICT (stock_id, trade_date) DO UPDATE SET
         open_price=EXCLUDED.open_price, high_price=EXCLUDED.high_price,
         low_price=EXCLUDED.low_price, close_price=EXCLUDED.close_price,
         volume_shares=EXCLUDED.volume_shares, turnover_cny=EXCLUDED.turnover_cny,
         prev_close=EXCLUDED.prev_close, change_amount=EXCLUDED.change_amount,
         change_percent=EXCLUDED.change_percent, amplitude=EXCLUDED.amplitude,
         turnover_rate=EXCLUDED.turnover_rate, ingested_at=now()
       WHERE daily_quotes_hist.ingested_at < now() - interval '1 day'`
    : `ON CONFLICT (stock_id, trade_date) DO NOTHING`;

  const sqlText = `
    INSERT INTO daily_quotes_hist
      (stock_id, trade_date, open_price, high_price, low_price, close_price, prev_close,
       volume_shares, turnover_cny, change_amount, change_percent, amplitude, turnover_rate,
       price_adj)
    VALUES ${values.join(',')}
    ${conflict}
    RETURNING 1`;

  await client.query('BEGIN');
  try {
    const res = await client.query(sqlText, params);
    await client.query('COMMIT');
    return { status: 'OK', inserted: res.rowCount, skipped: rows.length - res.rowCount, bars: bars.length, rows: rows.length, noAmount, failed, unit, basis };
  } catch (e) {
    await client.query('ROLLBACK');
    return { status: 'DB_ERROR', inserted: 0, skipped: 0, bars: bars.length, detail: e.message };
  }
}

// ---------------- 校验模式 ----------------
async function verifyMode(symbols) {
  const out = [];
  for (const symbol of symbols) {
    const st = (await q('SELECT id, symbol FROM stocks WHERE symbol = $1', [symbol]))[0];
    if (!st) { out.push({ symbol, error: 'stocks 无此标的' }); continue; }
    const tencent = await fetchTencentBfq(st.symbol, START, END);
    // 只取 START~END 覆盖年份（原先固定 6 年，会请求 2027+ 触发重试，校验被拖到 7 分钟）
    const years = [...new Set([...Array(Number(END.slice(0, 4)) - Number(START.slice(0, 4)) + 1)].map((_, i) => Number(START.slice(0, 4)) + i))];
    const { amounts } = await loadThsAmounts(symbol.slice(0, 6), years);
    const { unit } = await resolveVolumeUnit(st.id, st.symbol, tencent, amounts);
    const mult = unit === 'hand' ? 100 : 1;

    const dbRows = await q(
      `SELECT to_char(trade_date,'YYYY-MM-DD') AS d, open_price, high_price, low_price, close_price, volume_shares, turnover_cny
         FROM daily_quotes_hist WHERE stock_id = $1 AND trade_date BETWEEN $2 AND $3
         ORDER BY trade_date`,
      [st.id, START, END]
    );
    if (!dbRows.length) { out.push({ symbol, error: 'daily_quotes_hist 无行（未回填？）' }); continue; }

    // 随机抽 N 天（固定种子式伪随机：按日期哈希，保证可复现）
    const dbMap = new Map(dbRows.map((r) => [r.d, r]));
    const dates = [...dbMap.keys()].sort();
    const picked = [];
    for (let i = 0; i < dates.length && picked.length < VERIFY_DAYS; i++) {
      const h = [...dates[i]].reduce((s, ch) => (s * 31 + ch.charCodeAt(0)) % 9973, 7);
      if (h % 7 === 0) picked.push(dates[i]);
    }
    while (picked.length < Math.min(VERIFY_DAYS, dates.length)) {
      const d = dates[Math.floor((picked.length * 37 + 11) % dates.length)];
      if (!picked.includes(d)) picked.push(d);
    }

    const checks = [];
    for (const d of picked.slice(0, VERIFY_DAYS)) {
      const up = tencent.find((b) => b.date === d);
      const ths = amounts.get(d);
      const db = dbMap.get(d);
      if (!up || !ths || !db) { checks.push({ date: d, error: '三源缺一' }); continue; }
      const NN = (x) => (x == null ? null : Number(x));
      const rec = {
        date: d,
        upstream: { open: up.open, high: up.high, low: up.low, close: up.close, volume_shares: Math.round(up.volume * mult), turnover_cny: ths.amount },
        db: { open: NN(db.open_price), high: NN(db.high_price), low: NN(db.low_price), close: NN(db.close_price), volume_shares: Number(db.volume_shares), turnover_cny: NN(db.turnover_cny) },
      };
      rec.diff = {
        open: +(rec.db.open - rec.upstream.open).toFixed(2),
        high: +(rec.db.high - rec.upstream.high).toFixed(2),
        low: +(rec.db.low - rec.upstream.low).toFixed(2),
        close: +(rec.db.close - rec.upstream.close).toFixed(2),
        volume_shares: rec.db.volume_shares - rec.upstream.volume_shares,
        turnover_cny: +(rec.db.turnover_cny - rec.upstream.turnover_cny).toFixed(2),
      };
      checks.push(rec);
    }
    const maxAbs = (k) => Math.max(...checks.filter((c) => c.diff).map((c) => Math.abs(c.diff[k])), 0);
    out.push({
      symbol, unit, rows: dbRows.length, picked: picked.slice(0, VERIFY_DAYS),
      maxAbsDiff: { open: maxAbs('open'), high: maxAbs('high'), low: maxAbs('low'), close: maxAbs('close'), volume_shares: maxAbs('volume_shares'), turnover_cny: maxAbs('turnover_cny') },
      checks,
    });
  }
  return out;
}

// ---------------- 主流程 ----------------
async function main() {
  await connect();

  if (VERIFY_SYMBOLS) {
    const res = await verifyMode(VERIFY_SYMBOLS.split(',').map((s) => s.trim()).filter(Boolean));
    console.log(JSON.stringify(res, null, 2));
    fs.writeFileSync(REPORT.replace(/\.json$/, '.verify.json'), JSON.stringify(res, null, 2));
    await client.end();
    return;
  }

  // 目标清单
  let targets = [];
  if (UNIVERSE === 'all' && !SYMBOLS_ARG) {
    targets = await q(`SELECT s.id, s.symbol, s.name FROM stocks s
      WHERE EXISTS (SELECT 1 FROM daily_quotes q WHERE q.stock_id = s.id AND q.trade_date >= $1::date - 150)
        AND NOT EXISTS (SELECT 1 FROM daily_quotes_hist h WHERE h.stock_id = s.id) ORDER BY s.symbol`, [END]);
  } else if (SYMBOLS_ARG) {
    const list = SYMBOLS_ARG.split(',').map((s) => s.trim()).filter(Boolean);
    const rows = await q(
      `SELECT id, symbol, name FROM stocks WHERE symbol = ANY($1::text[]) ORDER BY symbol`, [list]
    );
    targets = rows;
    const missing = list.filter((s) => !rows.some((r) => r.symbol === s));
    if (missing.length) warn(`以下 ${missing.length} 只不在 stocks 表，跳过：${missing.join(',')}`);
  } else {
    const cons = await loadConstituents();
    const rows = await q(
      `SELECT id, symbol, name FROM stocks WHERE symbol = ANY($1::text[]) ORDER BY symbol`, [cons.symbols]
    );
    targets = rows;
    const missing = cons.symbols.filter((s) => !rows.some((r) => r.symbol === s));
    if (missing.length) warn(`成分中有 ${missing.length} 只不在 stocks 表（多为北交所/新上市），跳过：${missing.slice(0, 20).join(',')}${missing.length > 20 ? ' ...' : ''}`);
  }
  if (LIMIT > 0) targets = targets.slice(0, LIMIT);
  log(`目标标的：${targets.length} 只  start=${START} end=${END} apply=${APPLY} overwrite=${OVERWRITE}`);

  const ckpt = loadCkpt();
  if (has('--recheck') && Object.keys(ckpt.done).length) {
    const have = new Map((await q(
      `SELECT s.symbol, count(*)::int n FROM daily_quotes_hist h JOIN stocks s ON s.id = h.stock_id
        WHERE h.trade_date BETWEEN $1 AND $2 GROUP BY s.symbol`, [START, END])).map((r) => [r.symbol, r.n]));
    for (const sym of Object.keys(ckpt.done)) if (!(have.get(sym) > 0)) delete ckpt.done[sym];
    saveCkpt(ckpt); log(`--recheck：checkpoint 校正为 ${Object.keys(ckpt.done).length} 只`);
  }
  const thsYears = [];
  for (let y = Number(START.slice(0, 4)); y <= Number(END.slice(0, 4)); y++) thsYears.push(y);

  const stat = { OK: 0, DRY: 0, NO_UPSTREAM: 0, NO_AMOUNT: 0, BAD_UPSTREAM_OHLC: 0, DB_ERROR: 0, FETCH_ERROR: 0, SKIP_CKPT: 0 };
  const insertTotal = [];
  const failures = [];
  let doneCount = 0;

  const queue = targets.slice();
  async function worker() {
    for (;;) {
      const st = queue.shift();
      if (!st) return;
      if (ckpt.done[st.symbol]) { stat.SKIP_CKPT++; doneCount++; continue; }
      let r;
      try {
        r = await processSymbol(st, thsYears);
      } catch (e) {
        r = { status: 'DB_ERROR', detail: e.message, inserted: 0, skipped: 0, bars: 0 };
      }
      stat[r.status] = (stat[r.status] || 0) + 1;
      if (r.status === 'OK' || r.status === 'DRY') {
        insertTotal.push({ symbol: st.symbol, ...r });
        // 只有真正落库（APPLY + OK）才写 checkpoint，避免 dry-run 污染断点
        if (APPLY && r.status === 'OK') {
          ckpt.done[st.symbol] = { at: new Date().toISOString(), inserted: r.inserted, rows: r.rows };
          saveCkpt(ckpt);
        }
      } else {
        failures.push({ symbol: st.symbol, ...r });
      }
      doneCount++;
      if (doneCount % 25 === 0 || doneCount === targets.length) {
        const ins = insertTotal.reduce((s, x) => s + (x.inserted || 0), 0);
        log(`进度 ${doneCount}/${targets.length}  OK=${stat.OK} 本次新增行=${ins}  失败=${failures.length}`);
      }
      await sleep(SLEEP_MS);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, CONCURRENCY) }, worker));

  const insertedRows = insertTotal.reduce((s, x) => s + (x.inserted || 0), 0);
  const skippedRows = insertTotal.reduce((s, x) => s + (x.skipped || 0), 0);
  const noAmountRows = insertTotal.reduce((s, x) => s + (x.noAmount || 0), 0);

  // 分区表本身不算大小，必须对分区求和（pg_partition_tree 只返回叶与非叶，relkind='r' 过滤掉虚拟父表）
  const sizeRow = (await q(
    `SELECT pg_size_pretty(COALESCE(SUM(pg_total_relation_size(relid)),0)) total,
            pg_size_pretty(COALESCE(SUM(pg_relation_size(relid)),0)) heap,
            pg_size_pretty(COALESCE(SUM(pg_indexes_size(relid)),0)) idx,
            COALESCE(SUM(pg_total_relation_size(relid)),0)::bigint total_bytes
       FROM pg_partition_tree('daily_quotes_hist') t
       JOIN pg_class c ON c.oid = t.relid
      WHERE c.relkind = 'r'`
  ))[0];
  const cnt = (await q(
    `SELECT count(*)::int n, count(DISTINCT stock_id)::int syms,
            to_char(min(trade_date),'YYYY-MM-DD') mn, to_char(max(trade_date),'YYYY-MM-DD') mx
       FROM daily_quotes_hist`))[0];
  const perPart = await q(
    `SELECT c.relname, (SELECT count(*) FROM daily_quotes_hist h WHERE h.tableoid = c.oid)::int rows,
            pg_size_pretty(pg_total_relation_size(c.oid)) sz
       FROM pg_partition_tree('daily_quotes_hist') t
       JOIN pg_class c ON c.oid = t.relid
      WHERE c.relkind = 'r' ORDER BY c.relname`);

  const report = {
    ranAt: new Date().toISOString(),
    elapsedSec: +((Date.now() - T0) / 1000).toFixed(1),
    requests: reqCount,
    params: { start: START, end: END, index: INDEX, apply: APPLY, overwrite: OVERWRITE, limit: LIMIT, concurrency: CONCURRENCY, targets: targets.length },
    statusCounts: stat,
    insertedRows, skippedRows, skippedNoAmountDays: noAmountRows,
    table: { ...sizeRow, rows: cnt.n, symbols: cnt.syms, minDate: cnt.mn, maxDate: cnt.mx },
    partitions: perPart,
    volumeUnitSample: [...volUnitCache.entries()].slice(0, 5).map(([k, v]) => ({ symbol: k, ...v })),
    failures: failures.slice(0, 50),
    failureCount: failures.length,
  };
  fs.writeFileSync(REPORT, JSON.stringify({ ...report, perSymbol: insertTotal }, null, 2));
  console.log('\n===== 汇总 =====');
  console.log(JSON.stringify({ ...report, perSymbol: undefined }, null, 2));
  log(`报告：${REPORT}`);
  await client.end();
}

main().catch(async (e) => {
  console.error('FATAL', e);
  try { await client?.end(); } catch { /* noop */ }
  process.exit(1);
});
