#!/usr/bin/env node
/**
 * P0-BACKFILL-B：B 类只读量化探针
 *
 * ## 什么是 B 类
 * `daily_quotes` 里有存量行，其 **OHLC / volume / turnover 与上游不复权 K 线不符**——
 * 即「那一行的数据本身是别天的」，而不是单位或舍入问题。
 * 判例：`000027.SZ@2026-06-04` 库内 close=7.83/volume=644929，
 *而上游 06-04 是 close=7.79/volume=771093（相邻的 06-05 反而是对的）。
 *
 * ## 为什么必须逐值比对（不接受量级估算）
 * 上一轮我曾用 `turnover < 1e8` 判定「190679 行单位是万元」，那是**错的**：
 * 小盘股成交额本来就小，阈值本身无效。又试过 `close×volume` 估算量级，
 * 同样失败——`volume` 在库内单位不统一。**量级/阈值猜测这条路本身是错的。**
 * 故本探针只做逐值比对，且抽样必须与上游实测对账后才敢下结论。
 *
 * ## 只读保证
 * 只执行 `SELECT`，**没有任何 INSERT/UPDATE/DELETE/TRUNCATE**。
 * 所有产物写`/tmp`，不碰库、不碰仓库。
 *
 * ## 必守：用 `day`（不复权），不是 `qfqday`
 * 本库存不复权价。用 qfq 会把除权差异误判成 B 类。
 *
 * 用法：
 *   cd backend && ./node_modules/.bin/tsx ../scripts/data/probe-bclass-readonly.ts \
 *     --from=2026-05-01 --to=2026-07-01 --out=/tmp/bclass.json
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
const OUT = opt('out') ?? '/tmp/bclass.json';
const DB_URL = opt('db') ?? process.env.DATABASE_URL ?? 'clair';
const PSQL = process.env.PSQL_BIN ?? '/opt/homebrew/opt/postgresql@15/bin/psql';
const CONC = Number(opt('concurrency') ?? '16');

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

/** 取上游不复权日 K（`day`），双host 降级 */
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
      const node = j?.data?.[tx];
      const day = node?.day; // 只取 day，不取 qfqday
      if (Array.isArray(day) && day.length) return day;
    } catch {
      /* 换下一个 host */
    }
  }
  return null;
}

async function main() {
  const t0 = Date.now();
  console.log(`B 类只读探针  范围 ${FROM} ~ ${TO}`);
  console.log(`DB: ${DB_URL.replace(/:[^:@]*@/, ':***@')}\n`);

  // ── 读取库内存量行（只读）──
  const rows = sql(`
    SELECT s.symbol, q.trade_date, q.open_price, q.close_price, q.high_price, q.low_price,
           q.volume, q.turnover, q.turnover_rate, q.created_at
    FROM daily_quotes q JOIN stocks s ON s.id = q.stock_id
    WHERE q.trade_date BETWEEN '${FROM}' AND '${TO}'
    ORDER BY s.symbol, q.trade_date`);
  console.log(`库内目标范围行数: ${rows.length}`);

  const bySym = new Map<string, string[][]>();
  for (const r of rows) {
    if (!bySym.has(r[0])) bySym.set(r[0], []);
    bySym.get(r[0])!.push(r);
  }
  const syms = [...bySym.keys()];
  console.log(`涉及标的: ${syms.length} 只`);

  /**
   * 每只标的要拉多少根 K 线：窗口必须从**今天**回溯到 `FROM`。
   *
   * ⚠️ 第一版这里写错了：算的是 `(TO − FROM)`（区间跨度），
   * 于是 `--from=06-04 --to=06-05` 只拉到 13 根，覆盖不到 06-04，
   * 结果 1222 行被误判成「上游无该日」——**假阴性，且极具误导性**
   *（看上去像「上游没数据」，实际是自己窗口不够）。
   * 正确算法：从**今天**回溯到 `FROM`，用同一个 0.6645 实测系数 + 1.35 余量。
   */
  const nowMs = Date.now();
  const needDays = Math.ceil(((nowMs - new Date(`${FROM}T00:00:00Z`).getTime()) / 86_400_000 / 0.6645) * 1.35) + 10;
  console.log(`每只拉取 K 线根数: ${needDays}  (今天 ${new Date(nowMs).toISOString().slice(0, 10)} 回溯到 ${FROM})`);

  type Verdict =
    | 'match' | 'price_diff' | 'volume_diff' | 'turnover_diff'
    | 'upstream_absent' | 'upstream_unreachable' | 'window_miss';
  const tally: Record<Verdict, number> = {
    match: 0, price_diff: 0, volume_diff: 0, turnover_diff: 0,
    upstream_absent: 0, upstream_unreachable: 0, window_miss: 0,
  };
  const mismatches: any[] = [];
  const unreachable = new Set<string>();

  let cursor = 0;
  let done = 0;
  const workers = Array.from({ length: CONC }, async () => {
    while (cursor < syms.length) {
      const sym = syms[cursor++];
      const tx = toTx(sym);
      if (!tx) {
        for (const r of bySym.get(sym)!) tally.upstream_unreachable++;
        continue;
      }
      const day = await fetchUnadjusted(tx, needDays);
      if (!day) {
        unreachable.add(sym);
        for (const r of bySym.get(sym)!) tally.upstream_unreachable++;
        continue;
      }
      for (const r of bySym.get(sym)!) {
        const [, date, o, c, h, l, v, t] = r;
        const bar = day.find((x) => x[0] === date);
        if (!bar) {
          // ⚠️ 必须区分「上游真的没这天」与「我的窗口没覆盖到」。
          // 若库内这行日期比返回窗口的最早一根还早，说明是窗口不够而非上游缺失 ——
          // 不加这个判据就会重演第一版的假阴性（1222 行被误判成「上游无该日」）。
          const oldest = day[0][0];
          const windowMiss = date < oldest;
          const verdict: Verdict = windowMiss ? 'window_miss' : 'upstream_absent';
          tally[verdict]++;
          if (windowMiss) tally.window_miss++;
          mismatches.push({ symbol: sym, date, verdict, upstreamOldest: oldest });
          continue;
        }
        const up = { o: +bar[1], c: +bar[2], h: +bar[3], l: +bar[4], v: +bar[5], amt: +bar[8] * 10000 };
        const E = 0.005;
        const priceOK =
          Math.abs(up.o - +o) < E && Math.abs(up.c - +c) < E &&
          Math.abs(up.h - +h) < E && Math.abs(up.l - +l) < E;
        const volOK = Math.abs(up.v - +v) < 1;
        const amtOK = up.amt > 0 && Math.abs(up.amt - +t) / up.amt < 0.001;

        let verdict: Verdict;
        if (priceOK && volOK && amtOK) verdict = 'match';
        else if (!priceOK) verdict = 'price_diff';
        else if (!volOK) verdict = 'volume_diff';
        else verdict = 'turnover_diff';
        tally[verdict]++;
        if (verdict !== 'match') {
          mismatches.push({
            symbol: sym, date, verdict,
            db: { o: +o, c: +c, h: +h, l: +l, v: +v, t: +t, rate: +r[8], created_at: r[9] },
            up: { o: up.o, c: up.c, h: up.h, l: up.l, v: up.v, amt: up.amt },
          });
        }
      }
      if (++done % 200 === 0) {
        process.stdout.write(`  ...${done}/${syms.length}标的，用时${Math.round((Date.now() - t0) / 1000)}s\n`);
      }
    }
  });
  await Promise.all(workers);

  const total = rows.length;
  // B 类只统计「确实拉到上游 K 线」的行；window_miss / upstream_absent / unreachable 另计，
  // 绝不把它们混进「一致」或「B 类」——否则又是规模化误判。
  const compared = total - tally.window_miss - tally.upstream_absent - tally.upstream_unreachable;
  const bclass = compared - tally.match;
  console.log(`\n=== ① B 类规模（${FROM} ~ ${TO}） ===`);
  console.log(`  库内行数          : ${total}`);
  console.log(`  实际可比对行数    : ${compared}   (已排除窗口不足/上游缺失/不可达)`);
  console.log(`  完全一致          : ${tally.match} (${((tally.match / Math.max(compared, 1)) * 100).toFixed(2)}% of可比对)`);
  console.log(`  价格不符(B类核心) : ${tally.price_diff}`);
  console.log(`  量不符(价对)      : ${tally.volume_diff}`);
  console.log(`  额不符(价量对)    : ${tally.turnover_diff}`);
  console.log(`  ⟹ B 类合计        : ${bclass} (${((bclass / Math.max(compared, 1)) * 100).toFixed(2)}% of可比对)`);
  console.log(`  --- 以下不参与 B 类判定 ---`);
  console.log(`  上游无该日(真缺)  : ${tally.upstream_absent}`);
  console.log(`  窗口未覆盖(我的锅): ${tally.window_miss}`);
  console.log(`  上游不可达        : ${tally.upstream_unreachable} (${unreachable.size} 只标的)`);

  writeFileSync(OUT, JSON.stringify({
    range: [FROM, TO], total, tally, bclass,
    unreachableSymbols: [...unreachable], mismatches,
  }, null, 1));
  console.log(`\n明细已写: ${OUT}  (${mismatches.length} 条)`);
  console.log(`总用时: ${Math.round((Date.now() - t0) / 1000)}s`);
}

main().catch((e) => { console.error('探针失败:', e); process.exit(1); });
