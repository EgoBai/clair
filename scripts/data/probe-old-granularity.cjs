/**
 * 复核 backfill-kline 提出的「旧粒度 17,769 行」结论（只读）
 *
 * ## 他的主张
 * turnover%10000<>0 的行是「idx8×10000 未取整」写入，属旧粒度，应归一为 round(idx8)×10000。
 *
 * ## 本脚本要验的三件事（不采信推论，逐值比对上游）
 * 1. 这些行的 turnover/10000 是否 == 上游 idx8（真值）—— 若是，说明「单位没错、只是粒度旧」
 * 2. round(turnover/10000)*10000 是否 == round(上游 idx8)*10000 —— 若是，说明归一是无损等价的
 * 3. 有没有 magnitude 本身就错的行混在里面（那就不是粒度问题，归一反而会固化错值）
 */
const { execFileSync } = require("node:child_process");
const PSQL = "/opt/homebrew/opt/postgresql@15/bin/psql";
const DB = process.env.DB_URL ?? "clair";
const sql = (q) => execFileSync(PSQL, ["-d", DB, "-t", "-A", "-F", "|", "-c", q], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 })
  .split("\n").filter(l => l.trim()).map(l => l.split("|"));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const txOf = (s) => (s.endsWith(".SH") ? "sh" : "sz") + s.slice(0, 6);

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
  // 分批次分层取样：4 个写入批次 × 主板个股/科创板/指数
  const rows = sql(`SELECT d.id, s.symbol, d.trade_date::text, d.turnover::text,
      date_trunc('day', d.created_at)::text AS created, s.industry
    FROM daily_quotes d JOIN stocks s ON s.id = d.stock_id
    WHERE d.turnover > 0 AND d.turnover % 10000 <> 0
    ORDER BY date_trunc('day', d.created_at), s.symbol, d.trade_date`);

  const byCreated = new Map();
  for (const r of rows) {
    const k = r[4];
    if (!byCreated.has(k)) byCreated.set(k, []);
    byCreated.get(k).push(r);
  }

  // 每批次取样：前 6（任意标的）+ 科创板 2 + 指数 2
  const picks = [];
  const perKey = new Map();
  for (const r of rows) {
    const k = r[4];
    const key = r[5] === "指数" ? "idx" : r[1].startsWith("68") ? "star" : "main";
    const cnt = key === "idx" ? 2 : key === "star" ? 2 : 6;
    const tag = `${k}|${key}`;
    const n = perKey.get(tag) ?? 0;
    if (n < cnt) { perKey.set(tag, n + 1); picks.push(r); }
  }

  const syms = [...new Set(picks.map(p => p[1]))];
  console.log(`采样 ${picks.length} 行 / ${syms.length} 只标的（覆盖 4 个写入批次 × 主板/科创板/指数）`);
  const cache = new Map();
  for (const s of syms) { cache.set(s, await fetchKline(txOf(s))); await sleep(150); }

  let exact = 0, closeTo = 0, mismatch = 0, noBar = 0, noUp = 0;
  let eqRound = 0;
  console.log("\n标的        日期        created    库值/1e4        上游idx8     差      归一后==round(上游)×1e4");
  for (const p of picks) {
    const [, symbol, td, t] = p;
    const bars = cache.get(symbol);
    if (!bars) { noUp++; console.log(`${symbol} ${td} 上游不可达`); continue; }
    const bar = bars.find(b => b[0] === td);
    if (!bar) { noBar++; console.log(`${symbol} ${td} 上游无该日`); continue; }
    const idx8 = +bar[8];
    const storedWan = +t / 10000;
    const diff = storedWan - idx8;
    const proposed = Math.round(storedWan) * 10000;
    const upstreamForm = Math.round(idx8) * 10000;
    const same = proposed === upstreamForm;
    if (same) eqRound++;
    if (Math.abs(diff) < 1e-9) exact++;
    else if (Math.abs(diff) <= 0.005 + 1e-9) closeTo++;
    else { mismatch++; console.log(`  ✗ magnitude 不符: ${symbol} ${td} 库/1e4=${storedWan} 上游=${idx8}`); }
    console.log(`${symbol.padEnd(11)} ${td} ${p[4]} ${String(storedWan).padEnd(14)} ${String(idx8).padEnd(12)} ${diff.toExponential(2).padEnd(8)} ${same ? "✓" : "✗"}`);
  }
  console.log(`\n=== 汇总 ===`);
  console.log(`  库值/1e4 与上游 idx8 逐位相同: ${exact}`);
  console.log(`  库值/1e4 与上游 idx8 差≤0.005万元(即取整误差): ${closeTo}`);
  console.log(`  magnitude 本身不符: ${mismatch}`);
  console.log(`  上游无该日/不可达: ${noBar}/${noUp}`);
  console.log(`  归一后 == round(上游idx8)×1e4: ${eqRound}/${exact + closeTo + mismatch}`);
})();
