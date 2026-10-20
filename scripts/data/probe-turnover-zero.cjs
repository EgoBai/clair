/**
 * 任务4：turnover=0 的 1257 行上游重拉定性（只读）
 *
 * ## 背景
 * daily_quotes.turnover 是 NOT NULL，13 只标的共 1257 行为 0，且经查这些行
 * volume>0、turnover_rate 亦为 0 —— 属于「整列未写入」而非真实零成交。
 *
 * ## 本脚本只做定性，不写库
 * 上游：腾讯 day K 线（不复权），idx8=成交额(万元)、idx7=换手率(%)
 * 判定：上游有该日 bar → 可补真值 round(idx8)*10000；无 bar → 保持 0 并列明
 *
 * ## 边界
 * 只读。不 UPDATE、不 CREATE。
 */
const { execFileSync } = require("node:child_process");
const PSQL = "/opt/homebrew/opt/postgresql@15/bin/psql";
const DB = process.env.DB_URL ?? "clair";

const sql = (q) => execFileSync(PSQL, ["-d", DB, "-t", "-A", "-F", "|", "-c", q], { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 })
  .split("\n").filter(l => l.trim()).map(l => l.split("|"));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 交易所前缀：.SH -> sh，.SZ -> sz
const txOf = (symbol) => (symbol.endsWith(".SH") ? "sh" : "sz") + symbol.slice(0, 6);

async function fetchKline(tx) {
  for (const count of [2000, 1000]) {
    for (const host of ["https://proxy.finance.qq.com/ifzqgtimg/appstock/app/newfqkline/get",
      "https://web.ifzq.gtimg.cn/appstock/app/newfqkline/get"]) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const r = await fetch(`${host}?param=${tx},day,,,${count},`, {
            signal: AbortSignal.timeout(25000), headers: { Referer: "https://finance.qq.com" },
          });
          if (!r.ok) { await sleep(400 * (attempt + 1)); continue; }
          const j = await r.json();
          const d = j?.data?.[tx]?.day;
          if (Array.isArray(d) && d.length) return d;
        } catch { await sleep(400 * (attempt + 1)); }
      }
    }
  }
  return null;
}

(async () => {
  const rows = sql(`SELECT q.id, s.symbol, q.trade_date::text, q.open_price::text, q.close_price::text,
      q.high_price::text, q.low_price::text, q.volume::text, q.turnover::text, q.turnover_rate::text
    FROM daily_quotes q JOIN stocks s ON s.id = q.stock_id
    WHERE q.turnover = 0
    ORDER BY s.symbol, q.trade_date`);
  console.log(`turnover=0 行数: ${rows.length}`);

  const symbols = [...new Set(rows.map(r => r[1]))];
  console.log(`涉及标的: ${symbols.length} 只`);

  // 3 路并发 + 150ms（历史踩坑：8 路会被上游黑洞）
  const cache = new Map();
  const queue = [...symbols];
  const worker = async () => {
    while (queue.length) {
      const s = queue.shift();
      const bars = await fetchKline(txOf(s));
      cache.set(s, bars);
      await sleep(150);
    }
  };
  await Promise.all([worker(), worker(), worker()]);

  const dead = symbols.filter(s => !cache.get(s));
  if (dead.length) console.log(`✗ 上游拉取失败: ${dead.join(",")}`);
  console.log(`上游可达: ${symbols.length - dead.length}/${symbols.length}`);

  const bySym = new Map();
  const noBar = [];
  const ohlcvBad = [];
  const fixable = [];
  const E = 0.005;
  for (const [id, symbol, td, o, c, h, l, v, t, tr] of rows) {
    const bars = cache.get(symbol);
    const bar = bars ? bars.find(b => b[0] === td) : null;
    const rec = bySym.get(symbol) ?? { n: 0, hit: 0, miss: 0, ohlcvBad: 0 };
    rec.n++;
    if (!bars) { noBar.push({ id, symbol, td, why: "上游不可达" }); rec.miss++; bySym.set(symbol, rec); continue; }
    if (!bar) { noBar.push({ id, symbol, td, why: `上游无该日(区间 ${bars[0][0]}~${bars[bars.length - 1][0]}, ${bars.length}根)` }); rec.miss++; bySym.set(symbol, rec); continue; }
    rec.hit++;
    const idx7 = +bar[7], idx8 = +bar[8];
    const newT = Math.round(idx8) * 10000;
    const newO = +bar[1], newC = +bar[2], newH = +bar[3], newL = +bar[4], newV = Math.round(+bar[5]);
    const badOHLCV = Math.abs(+o - newO) >= E || Math.abs(+c - newC) >= E ||
      Math.abs(+h - newH) >= E || Math.abs(+l - newL) >= E || Math.abs(+v - newV) >= 1;
    if (badOHLCV) { rec.ohlcvBad++; ohlcvBad.push({ id, symbol, td, o, c, h, l, v, newO, newC, newH, newL, newV }); }
    fixable.push({ id: +id, symbol, td, oldT: +t, oldTR: +tr, newT, newTR: idx7, badOHLCV });
    bySym.set(symbol, rec);
  }

  console.log("\n=== 分标的 ===");
  console.log("标的        行数  上游有该日  上游无该日  OHLCV不符");
  for (const s of symbols) {
    const r = bySym.get(s) ?? { n: 0, hit: 0, miss: 0, ohlcvBad: 0 };
    console.log(`${s}  ${String(r.n).padStart(4)}  ${String(r.hit).padStart(9)}  ${String(r.miss).padStart(9)}  ${String(r.ohlcvBad).padStart(8)}`);
  }
  const totHit = [...bySym.values()].reduce((a, b) => a + b.hit, 0);
  const totMiss = [...bySym.values()].reduce((a, b) => a + b.miss, 0);
  console.log(`合计      ${String(totHit + totMiss).padStart(4)}  ${String(totHit).padStart(9)}  ${String(totMiss).padStart(9)}  ${String(ohlcvBad.length).padStart(8)}`);

  if (noBar.length) {
    console.log(`\n=== 上游无该日（保持 0）: ${noBar.length} 行 ===`);
    const g = new Map();
    for (const r of noBar) {
      const k = `${r.symbol} ${r.why}`;
      g.set(k, (g.get(k) ?? 0) + 1);
    }
    for (const [k, n] of g) console.log(`  ${k}  ×${n}`);
    console.log("  样例:");
    noBar.slice(0, 10).forEach(r => console.log(`    id=${r.id} ${r.symbol} ${r.td}`));
  }

  console.log(`\n=== 可补真值: ${fixable.length} 行 ===`);
  console.log(`  其中 OHLCV 与上游不符: ${ohlcvBad.length} 行（本次不动，仅报告）`);
  console.log("  样例（每标的 1 行）:");
  for (const s of symbols) {
    const f = fixable.find(x => x.symbol === s);
    if (f) console.log(`    ${f.symbol} ${f.td}  T ${f.oldT} → ${f.newT}   TR ${f.oldTR} → ${f.newTR}`);
  }

  // 抽检：补值后 r = T/(C*V) 是否落在各板块正常簇
  console.log("\n=== 补值后比值自检 ===");
  let bad = 0;
  for (const f of fixable) {
    const row = rows.find(r => +r[0] === f.id);
    const c = +row[3], v = +row[7];
    const r = f.newT / (c * v);
    const lo = f.symbol.startsWith("688") ? 0.5 : 50, hi = f.symbol.startsWith("688") ? 2.5 : 200;
    if (!(r >= lo && r <= hi)) { bad++; if (bad <= 8) console.log(`  ✗ ${f.symbol} ${f.td} r=${r.toFixed(2)} T=${f.newT} C=${c} V=${v}`); }
  }
  console.log(`  越界行: ${bad} / ${fixable.length}`);
})();
