/**
 * P0-TURNOVER-SCI688 全量验证探针（干跑）
 * 簇：r∈[7e-5,1.2e-4]，688/689 标的。逐行与腾讯上游 idx8 比对分类。
 * 分类：FIXABLE(库值=idx8 且 OHLCV 一致) / TURNOVER_ONLY_MISMATCH(库值=idx8 但 OHLCV 不符) / VALUE_MISMATCH(库值≠idx8)
 */
const { execFileSync } = require("node:child_process");
const PSQL = "/opt/homebrew/opt/postgresql@15/bin/psql";
const DB = process.env.DB_URL ?? "clair";
const sql = (q) => execFileSync(PSQL, ["-d", DB, "-t", "-A", "-F", "|", "-c", q], { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 })
  .split("\n").filter(l => l.trim()).map(l => l.split("|"));
const CONCURRENCY = 3;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchDay(tx) {
  for (const h of ["https://proxy.finance.qq.com/ifzqgtimg/appstock/app/newfqkline/get",
    "https://web.ifzq.gtimg.cn/appstock/app/newfqkline/get"]) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch(`${h}?param=${tx},day,,,160,`, { signal: AbortSignal.timeout(25000), headers: { Referer: "https://finance.qq.com" } });
        if (!r.ok) { await sleep(500 * (attempt + 1)); continue; }
        const j = await r.json();
        const d = j?.data?.[tx]?.day;
        if (Array.isArray(d) && d.length) return d;
      } catch { await sleep(500 * (attempt + 1)); }
    }
  }
  return null;
}

async function pool(items, worker, n) {
  const ret = []; let i = 0;
  const runners = Array.from({ length: n }, async () => {
    while (i < items.length) { const idx = i++; ret[idx] = await worker(items[idx]).catch(e => ({ err: String(e) })); await sleep(100); }
  });
  await Promise.all(runners);
  return ret;
}

(async () => {
  const rows = sql(`SELECT q.id, s.symbol, q.trade_date::text AS td, q.turnover::text,
      q.open_price::text, q.close_price::text, q.high_price::text, q.low_price::text, q.volume::text, q.created_at::text
    FROM daily_quotes q JOIN stocks s ON s.id = q.stock_id
    WHERE q.close_price > 0 AND q.volume > 0 AND q.turnover > 0
      AND q.turnover / (q.close_price * q.volume) BETWEEN 7e-5 AND 1.2e-4
      AND s.symbol LIKE '68%'
    ORDER BY s.symbol, q.trade_date`);
  console.log(`簇内行数(688/689): ${rows.length}`);
  const syms = [...new Set(rows.map(r => r[1]))];
  console.log(`标的数: ${syms.length}`);

  const txOf = (s) => "sh" + s.replace(/\.(SH|SZ)$/, "");
  const txMap = new Map(syms.map(s => [s, txOf(s)]));
  console.log("并发拉取上游 ...");
  const txs = syms.map(s => txMap.get(s));
  const days = await pool(txs, fetchDay, CONCURRENCY);
  const dayMap = new Map();
  let fetchFail = 0;
  syms.forEach((s, i) => { if (days[i]) dayMap.set(s, days[i]); else fetchFail++; });
  console.log(`上游成功: ${dayMap.size}  失败: ${fetchFail}`);
  if (fetchFail > 0) console.log(`失败标的: ${syms.filter(s => !dayMap.has(s)).join(",")}`);

  const stat = { FIXABLE: 0, TURNOVER_ONLY_MISMATCH: 0, VALUE_MISMATCH: 0, NO_UPSTREAM_BAR: 0, FETCH_FAIL: 0 };
  const mismatches = [];
  const fixable = [];
  const byRatio = {};
  for (const [id, symbol, td, now, o, c, h, l, v, created] of rows) {
    const day = dayMap.get(symbol);
    if (!day) { stat.FETCH_FAIL++; continue; }
    const bar = day.find(r => r[0] === td);
    if (!bar) { stat.NO_UPSTREAM_BAR++; mismatches.push([id, symbol, td, now, "NO_UPSTREAM_BAR"]); continue; }
    const idx8 = +bar[8];
    const ratio = +now / idx8;
    const rk = ratio < 0.9 ? "<0.9" : ratio < 0.999 ? "0.9~0.999" : ratio < 1.001 ? "≈1" : ratio < 1.1 ? "1.001~1.1" : ">1.1";
    byRatio[rk] = (byRatio[rk] || 0) + 1;
    const E = 0.005;
    const ohlcvOK = Math.abs(+bar[1] - +o) < E && Math.abs(+bar[2] - +c) < E &&
      Math.abs(+bar[3] - +h) < E && Math.abs(+bar[4] - +l) < E && Math.abs(+bar[5] - +v) < 1;
    if (Math.abs(+now - idx8) <= 0.51) {
      if (ohlcvOK) { stat.FIXABLE++; fixable.push(+id); }
      else { stat.TURNOVER_ONLY_MISMATCH++; mismatches.push([id, symbol, td, now, `OHLCV不符 DB=${o}/${c}/${h}/${l}/${v} UP=${bar[1]}/${bar[2]}/${bar[3]}/${bar[4]}/${bar[5]}`]); }
    } else {
      stat.VALUE_MISMATCH++;
      mismatches.push([id, symbol, td, now, `库值≠idx8  idx8=${idx8}  比值=${ratio.toFixed(6)}`]);
    }
  }
  console.log("\n=== 分类统计 ===");
  for (const [k, v] of Object.entries(stat)) console.log(`  ${k}: ${v}`);
  console.log("\n比值分布:", JSON.stringify(byRatio));
  if (mismatches.length) {
    console.log(`\n=== 异常/不符明细 (${mismatches.length}) ===`);
    for (const m of mismatches.slice(0, 40)) console.log("  " + m.join("  "));
    if (mismatches.length > 40) console.log(`  ... 其余 ${mismatches.length - 40} 行见 /tmp/sci688-mismatches.txt`);
    require("node:fs").writeFileSync("/tmp/sci688-mismatches.txt", mismatches.map(m => m.join("\t")).join("\n"));
  }
  require("node:fs").writeFileSync("/tmp/sci688-fixable-ids.txt", fixable.join("\n"));
  console.log(`\n可修行 id 清单: /tmp/sci688-fixable-ids.txt (${fixable.length})`);
})();
