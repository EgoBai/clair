#!/usr/bin/env node
/**
 * P0-BACKFILL-B 第二轮：A/B/C 三分类量化（只读）
 *
 * ## 为什么要改成三分类
 * 上轮我把 68110 行统称「额不符」，其中 67831 行其实只是**万元/元单位差**，
 * 混在一起会得出错误结论。本轮把口径拆开，每一类对应不同的修法。
 *
 * ## 分类流程（严格按team-lead 的两段式，省请求量）
 * 阶段① **用 `created_at` 筛候选**（纯 SQL，不请求上游）：
 *   `daily_quotes.created_at` 落在 13:00~15:00 的行，是「盘中落库」候选。
 *   注意：落在盘中**不等于错** —— 该行若close/volume 恰好等于上游终盘值，仍是对的。
 * 阶段② **只对候选逐值比对上游**，分成：
 *   A 类：盘时段但值与上游终盘一致 ⟹ **不是缺陷，不修**
 *   B 类：盘时段且值≠上游终盘⟹ 确为盘中快照污染（`fix-intraday-snapshot` 负责，**我不碰**）
 *   C 类：非盘时段但价/量仍错        ⟹ **另一套机制，需定性（我的范围）**
 *   X 类：`turnover=0` 但 OHLCV 正确 ⟹ 只补 turnover（#94，我的工作）
 *
 * ## 只读保证
 * 只执行 SELECT，产物写 /tmp。**不碰库。**
 *
 * 用法：
 *   cd backend && ./node_modules/.bin/tsx ../scripts/data/probe-bclass-abc.ts \
 *     --from=2026-05-01 --to=2026-07-01 --out=/tmp/bclass-abc.json
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const opt = (n: string) => {
  const eq = argv.find((a) => a.startsWith(`--${n}=`));
  if (eq) return eq.slice(n.length + 3);
  const at = argv.indexOf(`--${n}`);
  if (at >= 0 && at + 1 < argv.length && !argv[at + 1].startsWith('--')) return argv[at + 1];
  return undefined;
};
const FROM = opt('from') ?? '2026-05-01';
const TO = opt('to') ?? '2026-07-01';
const OUT = opt('out') ?? '/tmp/bclass-abc.json';
const DB_URL = opt('db') ?? process.env.DATABASE_URL ?? 'clair';
const PSQL = process.env.PSQL_BIN ?? '/opt/homebrew/opt/postgresql@15/bin/psql';
const CONC = Number(opt('concurrency') ?? '16');
/** X 类是否也逐值比对上游（确认「价对额缺」而不是「价也不对」） */
const CHECK_X = (opt('check-x') ?? 'true') !== 'false';

function sql(q: string): string[][] {
  return execFileSync(PSQL, ['-d', DB_URL, '-t', '-A', '-F', '|', '-c', q], {
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
  })
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => l.split('|'));
}

const toTx = (s: string): string | null => {
  const c = s.replace(/\.(SZ|SH|BJ)$/i, '');
  if (c.startsWith('6') || c.startsWith('9')) return `sh${c}`;
  if (c.startsWith('0') || c.startsWith('3')) return `sz${c}`;
  if (c.startsWith('4') || c.startsWith('8')) return `bj${c}`;
  return null;
};

async function fetchUnadjusted(tx: string, days: number): Promise<any[] | null> {
  for (const h of [
    'https://proxy.finance.qq.com/ifzqgtimg/appstock/app/newfqkline/get',
    'https://web.ifzq.gtimg.cn/appstock/app/newfqkline/get',
  ]) {
    try {
      const r = await fetch(`${h}?param=${tx},day,,,${days},`, {
        signal: AbortSignal.timeout(25000),
        headers: { Referer: 'https://finance.qq.com' },
      });
      if (!r.ok) continue;
      const j: any = await r.json();
      const day = j?.data?.[tx]?.day; // 只取 day（不复权），不取 qfqday
      if (Array.isArray(day) && day.length) return day;
    } catch { /* 换下一个 host */ }
  }
  return null;
}

interface Row {
  symbol: string; date: string;
  o: number; c: number; h: number; l: number; v: number; t: number;
  created_at: string; intraday: boolean;
}

async function main() {
  const t0 = Date.now();
  console.log(`A/B/C 三分类量化（只读）  范围 ${FROM} ~ ${TO}\n`);

  // 阶段①：纯 SQL 取全量（字段少，含 created_at 与盘时段标记）
  const raw = sql(`
    SELECT s.symbol, q.trade_date, q.open_price, q.close_price, q.high_price, q.low_price,
           q.volume, q.turnover, q.created_at,
           (EXTRACT(HOUR FROM q.created_at) BETWEEN 13 AND 15) AS intraday
    FROM daily_quotes q JOIN stocks s ON s.id = q.stock_id
    WHERE q.trade_date BETWEEN '${FROM}' AND '${TO}'
    ORDER BY s.symbol, q.trade_date`);

  const all: Row[] = raw.map((r) => ({
    symbol: r[0], date: r[1],
    o: +r[2], c: +r[3], h: +r[4], l: +r[5], v: +r[6], t: +r[7],
    created_at: r[8], intraday: r[9] === 't',
  }));
  console.log(`库内行数: ${all.length}   盘时段候选: ${all.filter((r) => r.intraday).length}`);

  // 候选 = 盘时段行 ∪ turnover=0 行（后者是 X 类）
  const cand = all.filter((r) => r.intraday || (r.t === 0 && r.v > 0 && r.o > 0));
  console.log(`待逐值比对候选: ${cand.length}（盘时段 ${all.filter((r) => r.intraday).length} + X类 ${all.filter((r) => r.t === 0 && r.v > 0 && r.o > 0).length}）`);

  const needDays =
    Math.ceil(((Date.now() - new Date(`${FROM}T00:00:00Z`).getTime()) / 86_400_000 / 0.6645) * 1.35) + 10;

  const bySym = new Map<string, Row[]>();
  for (const r of cand) {
    if (!bySym.has(r.symbol)) bySym.set(r.symbol, []);
    bySym.get(r.symbol)!.push(r);
  }

  const A: any[] = []; const B: any[] = []; const C: any[] = []; const X: any[] = [];
  const unreachable = new Set<string>();
  let cursor = 0; let done = 0;

  const workers = Array.from({ length: CONC }, async () => {
    while (cursor < bySym.size) {
      const sym = [...bySym.keys()][cursor++];
      const tx = toTx(sym);
      if (!tx) { unreachable.add(sym); continue; }
      const day = await fetchUnadjusted(tx, needDays);
      if (!day) { unreachable.add(sym); continue; }
      const oldest = day[0][0];
      for (const r of bySym.get(sym)!) {
        if (r.date < oldest) continue; // 窗口未覆盖，不参与判定
        const bar = day.find((x) => x[0] === r.date);
        if (!bar) continue;
        const E = 0.005;
        const up = { o: +bar[1], c: +bar[2], h: +bar[3], l: +bar[4], v: +bar[5], amt: +bar[8] * 10000 };
        const priceOK = Math.abs(up.o - r.o) < E && Math.abs(up.c - r.c) < E &&
          Math.abs(up.h - r.h) < E && Math.abs(up.l - r.l) < E;
        const volOK = Math.abs(up.v - r.v) < 1;
        const rec = {
          symbol: sym, date: r.date, created_at: r.created_at,
          db: { o: r.o, c: r.c, h: r.h, l: r.l, v: r.v, t: r.t },
          up: { o: up.o, c: up.c, h: up.h, l: up.l, v: up.v, amt: up.amt },
          openMatched: Math.abs(up.o - r.o) < E,
          volRatio: up.v > 0 ? r.v / up.v : null,
        };
        if (r.intraday) {
          // 盘时段：值与终盘一致 ⟹ A(不是缺陷)，否则 ⟹ B(盘中快照污染)
          if (priceOK && volOK) A.push(rec); else B.push(rec);
        } else if (r.t === 0 && r.v > 0 && r.o > 0) {
          // X 类候选：只有当 OHLCV 与上游一致时，才成立「价对额缺」
          if (CHECK_X) {
            if (priceOK && volOK) X.push(rec);
            else C.push({ ...rec, note: 'X类候选但价量亦不符 → 归 C' });
          } else X.push(rec);
        }
      }
      if (++done % 200 === 0) {
        process.stdout.write(`  ...${done}/${bySym.size}标的，${Math.round((Date.now() - t0) / 1000)}s\n`);
      }
    }
  });
  await Promise.all(workers);

  const byDate = (arr: any[]) => {
    const m: Record<string, number> = {};
    for (const x of arr) m[x.date] = (m[x.date] ?? 0) + 1;
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 12);
  };

  console.log(`\n=== A/B/C/X 分类结果（${FROM} ~ ${TO}） ===`);
  console.log(`  A 盘时段但值=终盘 (不是缺陷): ${A.length}`);
  console.log(`  B 盘时段且值≠终盘 (盘中污染) : ${B.length}   ⟹ fix-intraday-snapshot 负责，我不动`);
  console.log(`  C 非盘时段但价量仍错         : ${C.length}   ⟹ 我的范围，需定性`);
  console.log(`  X turnover=0 但 OHLCV 正确   : ${X.length}   ⟹ #94，只补 turnover`);
  console.log(`  上游不可达: ${unreachable.size} 只标的`);

  console.log(`\n--- B 类按日期 TOP12 ---`);
  byDate(B).forEach(([d, n]) => console.log(`  ${d}: ${n}`));
  console.log(`\n--- C 类按日期 TOP12 ---`);
  byDate(C).forEach(([d, n]) => console.log(`  ${d}: ${n}`));
  console.log(`\n--- X 类按日期 TOP12 ---`);
  byDate(X).forEach(([d, n]) => console.log(`  ${d}: ${n}`));

  console.log(`\n--- B 类特征抽样（volume 比值应 <1） ---`);
  const vr = B.map((x) => x.volRatio).filter((x) => x != null && x > 0);
  if (vr.length) {
    vr.sort((a, b) => a - b);
    console.log(`  volume比值 min=${vr[0].toFixed(4)} 中位=${vr[Math.floor(vr.length / 2)].toFixed(4)} max=${vr[vr.length - 1].toFixed(4)}`);
    console.log(`  比值<1 (量未走完) 的占比: ${(vr.filter((x) => x < 0.999).length / vr.length * 100).toFixed(1)}%`);
  }
  console.log(`\n--- C 类特征抽样 ---`);
  C.slice(0, 8).forEach((x) => console.log(
    `  ${x.symbol} ${x.date} created=${x.created_at} openMatched=${x.openMatched} 量比=${x.volRatio?.toFixed(4)}` +
    ` DB c=${x.db.c} v=${x.db.v} | UP c=${x.up.c} v=${x.up.v}`));

  writeFileSync(OUT, JSON.stringify({ range: [FROM, TO], total: all.length, counts: { A: A.length, B: B.length, C: C.length, X: X.length }, A, B, C, X }, null, 1));
  console.log(`\n明细已写: ${OUT}`);
  console.log(`总用时: ${Math.round((Date.now() - t0) / 1000)}s`);
}

main().catch((e) => { console.error('失败:', e); process.exit(1); });
