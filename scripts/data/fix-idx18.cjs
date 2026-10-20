/**
 * P0-TURNOVER-IDX18：3 只指数 × 6 天 = 18 行修满终盘（裁决 A）
 *
 * ## 缺陷
 * - 12 行（06-01/03/05/08，盘后写入）：仅 turnover 为万元原值（库值=idx8 精确），O/C/H/L/V/TR 与上游一致
 * - 6 行（06-04/06-09，14:08/14:42 盘中写入）：C/H/L/V/T/TR 均为盘中值，需全列校齐
 *
 * ## 修法（禁止简单 ×1e4 —— 6 行盘中行的数值本身也是错的）
 * T = round(idx8) × 10000，TR = idx7，O/C/H/L/V 取上游终盘（保持同源同日）
 *
 * ## 边界
 * 1. 备份表 daily_quotes_idx18_bak_20261021（含 OHLCV 全列供回滚）
 * 2. 行级乐观锁：id + turnover 现值 + turnover_rate 现值
 * 3. 上游重拉校验后才写，禁止用静态清单
 */
const { execFileSync } = require("node:child_process");
const APPLY = process.argv.includes("--apply");
const PSQL = "/opt/homebrew/opt/postgresql@15/bin/psql";
const DB = process.env.DB_URL ?? "clair";
const BAK = "daily_quotes_idx18_bak_20261021";
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
const E = 0.005;

(async () => {
  console.log(`P0-TURNOVER-IDX18  apply=${APPLY}`);
  const busy = sql(`SELECT count(*) FROM pg_stat_activity
    WHERE datname = current_database() AND pid <> pg_backend_pid()
      AND xact_start IS NOT NULL AND state <> 'idle'`);
  if (Number(busy[0]?.[0] ?? "0") > 0) { console.error("✗ 有其他未提交事务，拒绝"); process.exit(2); }
  console.log("并发守卫 ✓");

  const rows = sql(`SELECT q.id, s.symbol, q.trade_date::text, q.open_price::text, q.close_price::text,
      q.high_price::text, q.low_price::text, q.volume::text, q.turnover::text, q.turnover_rate::text
    FROM daily_quotes q JOIN stocks s ON s.id=q.stock_id
    WHERE s.symbol IN ('000300.SZ','399001.SZ','399006.SZ')
      AND q.trade_date IN ('2026-06-01','2026-06-03','2026-06-04','2026-06-05','2026-06-08','2026-06-09')
    ORDER BY q.id`);
  console.log(`圈定行数: ${rows.length}`);

  const cache = new Map();
  for (const tx of new Set(Object.values(TX))) { cache.set(tx, await fetchDay(tx)); await sleep(150); }
  if ([...new Set(Object.values(TX))].some(tx => !cache.get(tx))) { console.error("✗ 上游不可达，拒绝"); process.exit(2); }
  console.log("上游拉取 ✓");

  const fix = [];
  for (const [id, symbol, td, o, c, h, l, v, t, tr] of rows) {
    const bar = cache.get(TX[symbol])?.find(r => r[0] === td);
    if (!bar) { console.log(`  SKIP ${symbol} ${td} 上游无该日`); continue; }
    const idx8 = +bar[8], idx7 = +bar[7];
    const newT = Math.round(idx8) * 10000;
    const newO = +bar[1], newC = +bar[2], newH = +bar[3], newL = +bar[4], newV = Math.round(+bar[5]);
    const changed = Math.abs(+o - newO) >= E || Math.abs(+c - newC) >= E || Math.abs(+h - newH) >= E ||
      Math.abs(+l - newL) >= E || Math.abs(+v - newV) >= 1 || Math.abs(+t - newT) >= 0.01 || Math.abs(+tr - idx7) >= 0.005;
    if (!changed) continue;
    fix.push({ id: +id, symbol, td, oldT: t, oldTR: tr, newO, newC, newH, newL, newV, newT, newTR: idx7 });
  }
  console.log(`需修: ${fix.length} / ${rows.length}`);
  if (fix.length === 0) { console.log("无需修改，结束。"); return; }

  const bakExists = sql(`SELECT to_regclass('${BAK}') IS NOT NULL`)[0][0];
  if (bakExists === "t") {
    console.log(`备份表已存在: ${BAK} (${sql(`SELECT count(*) FROM ${BAK}`)[0][0]} 行)`);
  } else {
    sql(`CREATE TABLE ${BAK} AS SELECT q.id, q.trade_date, q.stock_id, q.turnover, q.turnover_rate,
        q.open_price, q.close_price, q.high_price, q.low_price, q.volume, s.symbol
      FROM daily_quotes q JOIN stocks s ON s.id=q.stock_id
      WHERE q.id IN (${fix.map(f => f.id).join(",")})`);
    console.log(`备份表已创建: ${BAK} (${fix.length} 行)`);
  }

  if (!APPLY) { console.log("\n干跑结束（未加 --apply）。样例:");
    fix.slice(0, 6).forEach(f => console.log(`  ${f.symbol} ${f.td}  T ${f.oldT}→${f.newT}  TR ${f.oldTR}→${f.newTR}`)); return; }

  let done = 0;
  for (const f of fix) {
    const r = sql(`WITH u AS (UPDATE daily_quotes SET
        open_price = ${f.newO}, close_price = ${f.newC}, high_price = ${f.newH}, low_price = ${f.newL},
        volume = ${f.newV}, turnover = ${f.newT}, turnover_rate = ${f.newTR}
      WHERE id = ${f.id} AND turnover = ${f.oldT} AND turnover_rate = ${f.oldTR}
      RETURNING id) SELECT count(*) FROM u`);
    const n = Number(r[0]?.[0] ?? 0);
    if (n !== 1) { console.error(`✗ id=${f.id} 触达 ${n}（预期 1），中止（已改 ${done}）`); process.exit(2); }
    done++;
  }
  console.log(`\n迁移完成: ${done} 行（O/C/H/L/V/T/TR 校齐至上游终盘）`);

  // 验证
  console.log("\n=== 验证 ===");
  const bad = sql(`SELECT count(*) FROM daily_quotes q JOIN ${BAK} b ON b.id=q.id
    WHERE q.turnover <> b.turnover`)[0][0];
  console.log(`  备份表 turnover 仍一致(未改)行: ${bad}（应 0）`);
  for (const [tx, sym] of [[TX["000300.SZ"], "000300.SZ"], [TX["399001.SZ"], "399001.SZ"], [TX["399006.SZ"], "399006.SZ"]]) {
    const bar = (cache.get(tx) || []).find(r => r[0] === "2026-06-04");
    const cur = sql(`SELECT q.trade_date::text, q.turnover::text, q.turnover_rate, q.close_price, q.volume
      FROM daily_quotes q JOIN stocks s ON s.id=q.stock_id WHERE s.symbol='${sym}' AND q.trade_date='2026-06-04'`)[0];
    if (!bar || !cur) continue;
    const ok = Math.abs(+cur[1] - Math.round(+bar[8]) * 10000) < 0.01 && Math.abs(+cur[2] - +bar[7]) < 0.005;
    console.log(`  ${sym} 06-04: T=${cur[1]} (期望 ${Math.round(+bar[8]) * 10000})  TR=${cur[2]} (期望 ${bar[7]})  ${ok ? "✓" : "✗"}`);
  }
})();
