#!/usr/bin/env node
/**
 * P0-TURNOVER-SCI688：科创板（688/689）turnover「漏乘 1e4」修复
 *
 * ## 定性（2026-10-16 全量上游验证，probe-sci688-full.cjs）
 * 簇 r∈[7e-5,1.2e-4]，688/689 标的，05-06~06-26，created_at=trade_date 当日（采集器实时路径写入）。
 * 全量 7,925 行与腾讯 day 不复权 idx8 逐行比对：
 *   - 7,922 行 库值 = idx8 的整数化值（x.5 时 trunc 语义），比值 ≈1.000000，OHLCV 逐值一致 → 可修
 *   - 3 行（688008/688036/688981 @06-04，created 14:08 盘中）比值 0.78~0.84 = 盘中快照污染，不动（P0-INTRADAY 范畴）
 * 根因：缺陷期采集器实时路径漏乘 1e4（qt.gtimg parts[37] 万元原样入库），06-26 后已修复（DataSyncService.ts:364 现状 ×10000）。
 * 与 60,266 行万元簇（cbd052dc8 迁移）同一缺陷根因，volume 单位差异（科创板=股/主板=手）使 r 表现不同。
 *
 * ## 修复值
 * turnover = round(idx8) × 10000（与 K 线路径 DataSyncService.ts:909 及 60,266 行迁移验证语义一致）。
 * 不能简单 ×1e4：库值是 idx8 的 trunc 整数化，对 x.5 行会与 round 差 1 万。
 *
 * ## 边界
 * 1. 只 UPDATE turnover 一列；WHERE id=… AND turnover=<验证时值> 乐观锁
 * 2. 备份表 daily_quotes_turnover_sci_bak_20261016
 * 3. 3 行盘中异常 + 399006 指数行不在圈定内（r 判别式 + 68% 前缀双重限定）
 * 4. 分批 2000 行/批，批间校验
 *
 * ## 用法
 *   node scripts/data/fix-sci688-turnover.cjs           # 干跑
 *   node scripts/data/fix-sci688-turnover.cjs --apply   # 写入
 */
const { execFileSync } = require("node:child_process");
const APPLY = process.argv.includes("--apply");
const PSQL = "/opt/homebrew/opt/postgresql@15/bin/psql";
const DB = process.env.DB_URL ?? "clair";
const BAK = "daily_quotes_turnover_sci_bak_20261016";
const BATCH = 2000;
const CONCURRENCY = 3;

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

async function pool(items, worker, n) {
  const ret = []; let i = 0;
  const runners = Array.from({ length: n }, async () => {
    while (i < items.length) { const idx = i++; ret[idx] = await worker(items[idx]).catch(() => null); await sleep(100); }
  });
  await Promise.all(runners);
  return ret;
}

(async () => {
  console.log(`P0-TURNOVER-SCI688  apply=${APPLY}`);

  // ── 0. 并发守卫 ──
  const busy = sql(`SELECT count(*) FROM pg_stat_activity
    WHERE datname = current_database() AND pid <> pg_backend_pid()
      AND xact_start IS NOT NULL AND state <> 'idle'`);
  if (Number(busy[0]?.[0] ?? "0") > 0) { console.error("✗ 有其他未提交事务，拒绝"); process.exit(2); }
  console.log("并发守卫 ✓");

  // ── 1. 圈定 ──
  const rows = sql(`SELECT q.id, s.symbol, q.trade_date::text AS td, q.turnover::text,
      q.open_price::text, q.close_price::text, q.high_price::text, q.low_price::text, q.volume::text
    FROM daily_quotes q JOIN stocks s ON s.id = q.stock_id
    WHERE q.close_price > 0 AND q.volume > 0 AND q.turnover > 0
      AND q.turnover / (q.close_price * q.volume) BETWEEN 7e-5 AND 1.2e-4
      AND s.symbol LIKE '68%'
    ORDER BY q.id`);
  console.log(`圈定行数: ${rows.length}`);
  const syms = [...new Set(rows.map(r => r[1]))];

  // ── 2. 上游拉取 + 逐行验证 ──
  const txOf = (s) => "sh" + s.replace(/\.(SH|SZ)$/, "");
  console.log(`拉取上游 ${syms.length} 标的 ...`);
  const days = await pool(syms.map(txOf), fetchDay, CONCURRENCY);
  const dayMap = new Map(syms.map((s, i) => [s, days[i]]));
  const nfail = syms.filter(s => !dayMap.get(s)).length;
  if (nfail > 0) { console.error(`✗ ${nfail} 标的上游不可达，拒绝执行`); process.exit(2); }

  const fix = []; // {id, symbol, td, oldT, newT}
  const skip = [];
  for (const [id, symbol, td, now, o, c, h, l, v] of rows) {
    const bar = dayMap.get(symbol)?.find(r => r[0] === td);
    if (!bar) { skip.push([id, symbol, td, "上游无该日"]); continue; }
    const idx8 = +bar[8];
    const E = 0.005;
    const ohlcvOK = Math.abs(+bar[1] - +o) < E && Math.abs(+bar[2] - +c) < E &&
      Math.abs(+bar[3] - +h) < E && Math.abs(+bar[4] - +l) < E && Math.abs(+bar[5] - +v) < 1;
    if (Math.abs(+now - idx8) <= 0.51 && ohlcvOK) {
      fix.push({ id: +id, symbol, td, oldT: now, newT: Math.round(idx8) * 10000 });
    } else {
      skip.push([id, symbol, td, `库值=${now} idx8=${idx8} ohlcvOK=${ohlcvOK}`]);
    }
  }
  console.log(`可修: ${fix.length}  跳过(异常保留): ${skip.length}`);
  for (const s of skip) console.log(`  SKIP ${s.join("  ")}`);
  if (fix.length === 0) { console.log("无可修行，结束。"); return; }

  // ── 3. 备份表 ──
  const bakExists = sql(`SELECT to_regclass('${BAK}') IS NOT NULL`)[0][0];
  if (bakExists === "t") {
    const n = sql(`SELECT count(*) FROM ${BAK}`)[0][0];
    console.log(`备份表已存在: ${BAK} (${n} 行)`);
  } else {
    sql(`CREATE TABLE ${BAK} AS SELECT id, trade_date, stock_id, turnover, close_price, volume
        FROM daily_quotes WHERE id IN (${fix.map(f => f.id).join(",")})`);
    console.log(`备份表已创建: ${BAK} (${fix.length} 行)`);
  }
  const bakCnt = Number(sql(`SELECT count(*) FROM ${BAK}`)[0][0]);
  // 续跑容忍：备份表可包含先前批次已修复的行（它们已不在万元簇圈定内），但必须覆盖本次全部可修行
  const notInBak = Number(sql(`SELECT count(*) FROM (SELECT unnest(ARRAY[${fix.map(f => f.id).join(",")}]) AS id
    EXCEPT SELECT id FROM ${BAK}) t`)[0][0]);
  if (bakCnt < fix.length || notInBak !== 0) { console.error(`✗ 备份 ${bakCnt} 行不能覆盖可修 ${fix.length}（缺 ${notInBak}），拒绝`); process.exit(2); }

  if (!APPLY) { console.log(`\n干跑结束（未加 --apply）。将修 ${fix.length} 行，样例:`);
    fix.slice(0, 5).forEach(f => console.log(`  ${f.symbol} ${f.td}  ${f.oldT} → ${f.newT}`)); return; }

  // ── 4. 分批 UPDATE（批量 CTE；行级守卫：turnover∈{旧值,目标值} 才触达，目标值=先前批次已完成） ──
  let totalNewly = 0, totalAlready = 0;
  for (let i = 0; i < fix.length; i += BATCH) {
    const chunk = fix.slice(i, i + BATCH);
    const values = chunk.map(f => `(${f.id},${f.oldT},${f.newT})`).join(",");
    const r = sql(`WITH v(id, oldt, newt) AS (VALUES ${values}),
      u AS (UPDATE daily_quotes q SET turnover = v.newt FROM v
            WHERE q.id = v.id AND q.turnover IN (v.oldt, v.newt)
            RETURNING q.id)
      SELECT
        (SELECT count(*) FROM u) AS touched,
        (SELECT count(*) FROM daily_quotes q JOIN v ON v.id = q.id
          WHERE q.turnover = v.oldt) AS still_old,
        (SELECT count(*) FROM daily_quotes q JOIN v ON v.id = q.id
          WHERE q.turnover <> v.oldt AND q.turnover <> v.newt) AS bad`);
    const [touched, stillOld, bad] = r[0].map(Number);
    if (bad !== 0) { console.error(`✗ 批 ${Math.floor(i / BATCH) + 1} 有 ${bad} 行值异常（既非旧值也非目标值），中止`); process.exit(2); }
    if (touched !== chunk.length) { console.error(`✗ 批 ${Math.floor(i / BATCH) + 1} 触达 ${touched}/${chunk.length}，中止`); process.exit(2); }
    // CTE 快照语义：still_old 是本语句 UPDATE 前的旧值行数 ⟹ 本次真实新改 = stillOld，
    // touched 中其余为"改前已在目标值"（先前批次完成，被重复 UPDATE 为相同值，无害）
    const newly = stillOld, already = touched - stillOld;
    totalNewly += newly; totalAlready += already;
    console.log(`  批 ${Math.floor(i / BATCH) + 1}/${Math.ceil(fix.length / BATCH)}: 新改 ${newly}，先前已完成 ${already}，异常 0`);
  }
  console.log(`\n迁移完成: 本次新改 ${totalNewly} + 先前已完成 ${totalAlready} = ${totalNewly + totalAlready} 行`);

  // ── 5. 验证 ──
  const residue = sql(`SELECT count(*) FROM daily_quotes q JOIN stocks s ON s.id=q.stock_id
    WHERE q.close_price > 0 AND q.volume > 0 AND q.turnover > 0
      AND q.turnover / (q.close_price * q.volume) BETWEEN 7e-5 AND 1.2e-4
      AND s.symbol LIKE '68%'`)[0][0];
  console.log(`\n=== 验证 ===`);
  console.log(`  68 前缀万元簇残留: ${residue}（3 行盘中异常除外，应为 ${skip.length}）`);
  const yuan688 = sql(`SELECT count(*) FROM daily_quotes q JOIN stocks s ON s.id=q.stock_id
    WHERE s.symbol LIKE '68%' AND q.close_price > 0 AND q.volume > 0 AND q.turnover > 0
      AND q.turnover / (q.close_price * q.volume) BETWEEN 0.5 AND 2.5`)[0][0];
  console.log(`  68 前缀元/股簇行数: ${yuan688}（迁移前 33,385，应 ≈ ${33385 + totalNewly + totalAlready}）`);
  const bakDiff = sql(`SELECT count(*) FROM ${BAK} b JOIN daily_quotes q ON q.id=b.id
    WHERE q.turnover <> b.turnover`)[0][0];
  console.log(`  备份表 turnover 与库不一致行数: ${bakDiff}（应 = 已修行数，即备份保留旧值供回滚）`);
  const ohlcvChk = sql(`SELECT count(*) FROM ${BAK} b JOIN daily_quotes q ON q.id=b.id
    WHERE q.close_price <> b.close_price OR q.volume <> b.volume`)[0][0];
  console.log(`  OHLCV 变化行数: ${ohlcvChk}（应为 0）`);
})();
