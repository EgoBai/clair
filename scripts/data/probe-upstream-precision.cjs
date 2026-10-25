/**
 * 上游 idx8 精度事实核查（只读）
 *
 * ## 争点
 * 库内两种粒度形态：
 *   formA: turnover % 10000 == 0  → 库值/1e4 是整数万元  （= round(idx8)×1e4）
 *   formB: turnover % 10000 != 0  → 库值/1e4 == idx8 精确值（含 2 位小数）
 * 争点：哪个才是「与上游逐位一致」的目标形态？round 掉万元小数是否算有损？
 *
 * ## 本脚本统计
 * 1. 上游 idx8 的小数位分布（整数 / 1位 / 2位）
 * 2. formA 行：库值 == round(idx8)×1e4 且 idx8 是否带小数 → 量化 round 的有损程度
 * 3. formB 行：库值 == idx8×1e4 精确 → 确认无信息丢失
 * 4. 实时快照 parts[37] 的精度（对比 kline idx8）
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

const decOf = (x) => {
  const s = String(x);
  const i = s.indexOf(".");
  if (i < 0) return 0;
  const d = s.slice(i + 1).replace(/0+$/, "");
  return d.length;
};

(async () => {
  // formA 抽样：跨板块跨日期
  const formA = sql(`SELECT d.id, s.symbol, d.trade_date::text, d.turnover::text
    FROM daily_quotes d JOIN stocks s ON s.id=d.stock_id
    WHERE d.turnover > 0 AND d.turnover % 10000 = 0
    ORDER BY random() LIMIT 60`);
  const formB = sql(`SELECT d.id, s.symbol, d.trade_date::text, d.turnover::text
    FROM daily_quotes d JOIN stocks s ON s.id=d.stock_id
    WHERE d.turnover > 0 AND d.turnover % 10000 <> 0
    ORDER BY random() LIMIT 60`);

  const syms = [...new Set([...formA, ...formB].map(r => r[1]))];
  console.log(`抽样: formA ${formA.length} + formB ${formB.length} 行 / ${syms.length} 只标的`);
  const cache = new Map();
  for (const s of syms) { cache.set(s, await fetchKline(txOf(s))); await sleep(120); }

  const stat = { A: { n: 0, eq: 0, upInt: 0, upDec: 0, lossMax: 0, lossSum: 0, noBar: 0 },
                 B: { n: 0, eq: 0, upInt: 0, upDec: 0, lossMax: 0, lossSum: 0, noBar: 0 } };
  const upDecDist = new Map();
  const examples = [];

  for (const [tag, list] of [["A", formA], ["B", formB]]) {
    for (const [, symbol, td, tRaw] of list) {
      const bars = cache.get(symbol);
      const bar = bars?.find(b => b[0] === td);
      if (!bar) { stat[tag].noBar++; continue; }
      const idx8 = +bar[8];
      const dec = decOf(bar[8]);
      upDecDist.set(dec, (upDecDist.get(dec) ?? 0) + 1);
      const t = +tRaw;
      const st = stat[tag];
      st.n++;
      if (dec === 0) st.upInt++; else st.upDec++;
      if (tag === "A") {
        if (Math.abs(t - Math.round(idx8) * 10000) < 0.01) st.eq++;
        const loss = Math.abs(t - idx8 * 10000);
        st.lossMax = Math.max(st.lossMax, loss); st.lossSum += loss;
        if (loss > 0 && examples.length < 8) examples.push({ symbol, td, t, idx8, loss });
      } else {
        if (Math.abs(t - idx8 * 10000) < 0.01) st.eq++;
        const loss = Math.abs(t - Math.round(idx8) * 10000);
        st.lossMax = Math.max(st.lossMax, loss); st.lossSum += loss;
      }
    }
  }

  console.log("\n=== 上游 idx8 小数位分布（抽样合计）===");
  for (const [d, n] of [...upDecDist.entries()].sort((a, b) => a[0] - b[0]))
    console.log(`  ${d} 位小数: ${n} 根`);

  console.log("\n=== formA 行（库值=round(idx8)×1e4）===");
  console.log(`  抽样: ${stat.A.n}（上游无该日 ${stat.A.noBar}）`);
  console.log(`  库值 == round(上游idx8)×1e4: ${stat.A.eq}/${stat.A.n}`);
  console.log(`  上游 idx8 为整数万元: ${stat.A.upInt}   带小数: ${stat.A.upDec}`);
  console.log(`  相对「上游精确值 idx8×1e4」的偏差: max ${stat.A.lossMax.toFixed(2)} 元, 平均 ${(stat.A.lossSum / Math.max(1, stat.A.n)).toFixed(2)} 元`);
  console.log("  样例:");
  examples.forEach(e => console.log(`    ${e.symbol} ${e.td} 库值=${e.t} 上游idx8=${e.idx8} 偏差=${e.loss.toFixed(2)}元`));

  console.log("\n=== formB 行（库值=idx8×1e4 精确）===");
  console.log(`  抽样: ${stat.B.n}（上游无该日 ${stat.B.noBar}）`);
  console.log(`  库值 == 上游idx8×1e4（零信息丢失）: ${stat.B.eq}/${stat.B.n}`);
  console.log(`  上游 idx8 为整数万元: ${stat.B.upInt}   带小数: ${stat.B.upDec}`);
  console.log(`  归一成 round 口径会引入的偏差: max ${stat.B.lossMax.toFixed(2)} 元, 平均 ${(stat.B.lossSum / Math.max(1, stat.B.n)).toFixed(2)} 元`);

  // 实时快照 parts[37] 精度
  console.log("\n=== 实时快照 parts[37] 精度抽样 ===");
  for (const sym of ["sz000001", "sh600519", "sh688981"]) {
    try {
      const r = await fetch(`https://qt.gtimg.cn/q=${sym}`, { signal: AbortSignal.timeout(15000), headers: { Referer: "https://finance.qq.com" } });
      const txt = await r.text();
      const gbk = Buffer.from(txt, "latin1").toString("utf8");
      const parts = gbk.split("~");
      const p37 = parts[37];
      console.log(`  ${sym} parts[37]=${p37}  小数位=${decOf(p37)}  parts[6](量)=${parts[6]}`);
    } catch (e) { console.log(`  ${sym} 拉取失败: ${e.message}`); }
    await sleep(150);
  }
})();
