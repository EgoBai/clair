/**
 * P0-TURNOVER-IDX18 探针：3 只指数 × 6 天 = 18 行，逐行与腾讯上游终盘比对
 * 裁决 A（修满终盘）：O/C/H/L/V/T/TR 六列若与上游不符一并校齐，保持同源同日
 */
const { execFileSync } = require("node:child_process");
const PSQL = "/opt/homebrew/opt/postgresql@15/bin/psql";
const DB = process.env.DB_URL ?? "clair";
const sql = (q) => execFileSync(PSQL, ["-d", DB, "-t", "-A", "-F", "|", "-c", q], { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 })
  .split("\n").filter(l => l.trim()).map(l => l.split("|"));
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

const TX = { "000300.SZ": "sh000300", "399001.SZ": "sz399001", "399006.SZ": "sz399006" };

(async () => {
  const rows = sql(`SELECT q.id, s.symbol, q.trade_date::text, q.open_price::text, q.close_price::text,
      q.high_price::text, q.low_price::text, q.volume::text, q.turnover::text, q.turnover_rate::text
    FROM daily_quotes q JOIN stocks s ON s.id=q.stock_id
    WHERE s.symbol IN ('000300.SZ','399001.SZ','399006.SZ')
      AND q.trade_date IN ('2026-06-01','2026-06-03','2026-06-04','2026-06-05','2026-06-08','2026-06-09')
    ORDER BY s.symbol, q.trade_date`);
  console.log(`库内行数: ${rows.length}`);

  const cache = new Map();
  for (const tx of new Set(Object.values(TX))) { cache.set(tx, await fetchDay(tx)); await sleep(150); }
  const nfail = [...new Set(Object.values(TX))].filter(tx => !cache.get(tx));
  if (nfail.length) { console.error(`上游不可达: ${nfail.join(",")}`); process.exit(2); }

  const E = 0.005;
  const plan = [];
  let sameCount = 0;
  for (const [id, symbol, td, o, c, h, l, v, t, tr] of rows) {
    const bar = cache.get(TX[symbol])?.find(r => r[0] === td);
    if (!bar) { console.log(`  ✗ ${symbol} ${td} 上游无该日`); continue; }
    const upO = +bar[1], upC = +bar[2], upH = +bar[3], upL = +bar[4], upV = +bar[5];
    const idx8 = +bar[8], idx7 = +bar[7];
    const newT = Math.round(idx8) * 10000;
    const diff = [];
    if (Math.abs(+o - upO) >= E) diff.push(`O ${o}→${upO}`);
    if (Math.abs(+c - upC) >= E) diff.push(`C ${c}→${upC}`);
    if (Math.abs(+h - upH) >= E) diff.push(`H ${h}→${upH}`);
    if (Math.abs(+l - upL) >= E) diff.push(`L ${l}→${upL}`);
    if (Math.abs(+v - upV) >= 1) diff.push(`V ${v}→${upV}`);
    if (Math.abs(+t - newT) >= 0.01) diff.push(`T ${t}→${newT}`);
    if (Math.abs(+tr - idx7) >= 0.005) diff.push(`TR ${tr}→${idx7}`);
    if (diff.length === 0) { sameCount++; continue; }
    plan.push({
      id: +id, symbol, td,
      oldT: t, oldTR: tr, oldO: o, oldC: c, oldH: h, oldL: l, oldV: v,
      newO: upO, newC: upC, newH: upH, newL: upL, newV: upV, newT, newTR: idx7,
      diff,
    });
  }
  console.log(`与上游完全一致(无需修): ${sameCount}   需修: ${plan.length}`);
  for (const p of plan) console.log(`  ${p.symbol} ${p.td} (id=${p.id})  ${p.diff.join(" | ")}`);
  require("node:fs").writeFileSync("/tmp/idx18-plan.json", JSON.stringify(plan, null, 1));
  console.log(`\n计划已写 /tmp/idx18-plan.json (${plan.length} 行)`);
})();
