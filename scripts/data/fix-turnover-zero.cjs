/**
 * 任务4：回填 daily_quotes 中 turnover=0 的 1257 行（上游重拉真值）
 *
 * ## 缺陷
 * 13 只标的共 1257 行 turnover=0（该列 NOT NULL，不能置 NULL）。经查这些行 volume>0、
 * turnover_rate 亦为 0 —— 属整列未写入，不是真实零成交。
 *
 * ## 修法（禁止任何推算/造数）
 * 上游腾讯 day K 线（不复权）idx8 = 成交额(万元) → turnover = round(idx8) * 10000
 * 上游无该日 bar 的行保持 0，逐行列明，不硬造。
 * 口径已对照：同标的既有 turnover>0 的行与 round(idx8)*10000 逐位一致（见报告）。
 *
 * ## 可选：--rate 补 turnover_rate（默认不开，需另行授权）
 * 另发现 turnover_rate=0 共 1472 行（含本批 1257 + 另 215 行 turnover>0 但 TR=0），
 * 默认值取上游 idx7。本开关与 turnover 修复相互独立，可重复执行（幂等）。
 *
 * ## 边界
 * 1. 备份表 daily_quotes_turnover0_bak_20261021（改哪列备哪列）
 * 2. 行级乐观锁：WHERE id=? AND turnover=? （/ turnover_rate=?）
 * 3. 上游重拉后才写；上游不可达直接拒绝执行
 */
const { execFileSync } = require("node:child_process");
const APPLY = process.argv.includes("--apply");
const WITH_RATE = process.argv.includes("--rate");
const PSQL = "/opt/homebrew/opt/postgresql@15/bin/psql";
const DB = process.env.DB_URL ?? "clair";
const BAK = "daily_quotes_turnover0_bak_20261021";
const sql = (q) => execFileSync(PSQL, ["-d", DB, "-t", "-A", "-F", "|", "-c", q], { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 })
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
  console.log(`fix-turnover-zero  apply=${APPLY} rate=${WITH_RATE}`);
  const busy = sql(`SELECT count(*) FROM pg_stat_activity
    WHERE datname = current_database() AND pid <> pg_backend_pid()
      AND xact_start IS NOT NULL AND state <> 'idle'`);
  if (Number(busy[0]?.[0] ?? "0") > 0) { console.error("✗ 有其他未提交事务，拒绝"); process.exit(2); }
  console.log("并发守卫 ✓");

  const rows = sql(`SELECT q.id, s.symbol, q.trade_date::text, q.turnover::text, q.turnover_rate::text
    FROM daily_quotes q JOIN stocks s ON s.id = q.stock_id
    WHERE q.turnover = 0${WITH_RATE ? " OR q.turnover_rate = 0" : ""}
    ORDER BY q.id`);
  console.log(`圈定行数: ${rows.length}`);

  const symbols = [...new Set(rows.map(r => r[1]))];
  const cache = new Map();
  const queue = [...symbols];
  const worker = async () => {
    while (queue.length) {
      const s = queue.shift();
      cache.set(s, await fetchKline(txOf(s)));
      await sleep(150);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  const dead = symbols.filter(s => !cache.get(s));
  if (dead.length) { console.error(`✗ 上游不可达: ${dead.join(",")}，拒绝执行`); process.exit(2); }
  console.log(`上游拉取 ✓ (${symbols.length} 只)`);

  const fixT = [], fixR = [], skip = [];
  for (const [id, symbol, td, t, tr] of rows) {
    const bar = cache.get(symbol).find(b => b[0] === td);
    if (!bar) { skip.push({ id: +id, symbol, td }); continue; }
    if (+t === 0) fixT.push({ id: +id, symbol, td, newT: Math.round(+bar[8]) * 10000 });
    if (WITH_RATE && +tr === 0) fixR.push({ id: +id, symbol, td, newR: +bar[7] });
  }
  console.log(`可修 turnover: ${fixT.length}${WITH_RATE ? `   可修 turnover_rate: ${fixR.length}` : ""}`);
  console.log(`上游无该日（保持原值）: ${skip.length}`);
  skip.slice(0, 10).forEach(s => console.log(`  ${s.symbol} ${s.td} id=${s.id}`));
  if (fixT.length + fixR.length === 0) { console.log("无需修改，结束。"); return; }

  const ids = [...new Set([...fixT, ...fixR].map(f => f.id))];
  const bakExists = sql(`SELECT to_regclass('${BAK}') IS NOT NULL`)[0][0];
  if (bakExists === "t") {
    const have = new Set(sql(`SELECT id FROM ${BAK}`).map(r => +r[0]));
    const missing = ids.filter(i => !have.has(i));
    if (missing.length) {
      sql(`INSERT INTO ${BAK} SELECT q.id, q.trade_date, q.stock_id, q.turnover, q.turnover_rate, s.symbol
        FROM daily_quotes q JOIN stocks s ON s.id=q.stock_id WHERE q.id IN (${missing.join(",")})`);
      console.log(`备份表已存在，补备 ${missing.length} 行 → ${BAK}`);
    } else console.log(`备份表已存在: ${BAK}（已覆盖全部目标行）`);
  } else {
    sql(`CREATE TABLE ${BAK} AS SELECT q.id, q.trade_date, q.stock_id, q.turnover, q.turnover_rate, s.symbol
      FROM daily_quotes q JOIN stocks s ON s.id=q.stock_id WHERE q.id IN (${ids.join(",")})`);
    console.log(`备份表已创建: ${BAK} (${ids.length} 行)`);
  }

  if (!APPLY) {
    console.log("\n干跑结束（未加 --apply）。样例:");
    fixT.slice(0, 6).forEach(f => console.log(`  T  ${f.symbol} ${f.td}  0 → ${f.newT}`));
    fixR.slice(0, 6).forEach(f => console.log(`  TR ${f.symbol} ${f.td}  0 → ${f.newR}`));
    return;
  }

  let doneT = 0, doneR = 0;
  for (const f of fixT) {
    const n = Number(sql(`WITH u AS (UPDATE daily_quotes SET turnover = ${f.newT}
      WHERE id = ${f.id} AND turnover = 0 RETURNING id) SELECT count(*) FROM u`)[0]?.[0] ?? 0);
    if (n !== 1) { console.error(`✗ id=${f.id} turnover 触达 ${n}（预期 1），中止（已改 ${doneT}）`); process.exit(2); }
    doneT++;
  }
  for (const f of fixR) {
    const n = Number(sql(`WITH u AS (UPDATE daily_quotes SET turnover_rate = ${f.newR}
      WHERE id = ${f.id} AND turnover_rate = 0 RETURNING id) SELECT count(*) FROM u`)[0]?.[0] ?? 0);
    if (n !== 1) { console.error(`✗ id=${f.id} turnover_rate 触达 ${n}（预期 1），中止（已改 ${doneR}）`); process.exit(2); }
    doneR++;
  }
  console.log(`\n写入完成: turnover ${doneT} 行, turnover_rate ${doneR} 行`);

  console.log("\n=== 验证 ===");
  console.log(`  剩余 turnover=0: ${sql(`SELECT count(*) FROM daily_quotes WHERE turnover = 0`)[0][0]}（应 1，000003.SZ 2001-08-10）`);
  console.log(`  剩余 turnover_rate=0: ${sql(`SELECT count(*) FROM daily_quotes WHERE turnover_rate = 0`)[0][0]}`);
  const moved = sql(`SELECT count(*) FROM daily_quotes q JOIN ${BAK} b ON b.id=q.id
    WHERE b.turnover = 0 AND q.turnover <> 0`)[0][0];
  console.log(`  备份行 turnover 由 0 变正: ${moved}（应 ${doneT}）`);
  const untouched = sql(`SELECT count(*) FROM daily_quotes q JOIN ${BAK} b ON b.id=q.id
    WHERE b.turnover > 0 AND q.turnover <> b.turnover`)[0][0];
  console.log(`  备份中原本有值的行被改动: ${untouched}（应 0）`);
})();
