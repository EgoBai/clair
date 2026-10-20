#!/usr/bin/env node
/**
 * P0-INTRADAY：盘中快照污染只读定性探针
 *
 * ## 要回答的问题
 * `daily_quotes` 里`created_at` 落在 13:00~15:00 的行，其 close/volume 是
 * **盘中值还是终盘值**？只有与上游不复权日 K 逐值比对才能定性。
 *
 * ## ⚠️ 一个必须先纠正的方法论错误：`created_at` 不是「首次落库时间」
 * `Database.createDailyQuote` 用 `.onConflict(['stock_id','trade_date']).merge()`，
 * **merge() 不带列清单 → 冲突时整行覆盖，含 created_at**（Database.ts:363-369）。
 * 采集器每 5 分钟跑一次，于是 `created_at` 记录的是**最后一次写入**时刻，
 * 不是首次。所以：
 * - `created_at` 早于 15:00 ⟹ **该行至今最后一次写仍发生在收盘前** ⟹ 高度可疑
 * - 但它不能证明「第一次就是盘中值」，也不能靠它直接判定污染——仍须逐值比对
 *
 * ## 分类口径
 * - A类 `consistent`        : close/volume 均与上游一致 → 侥幸未被污染
 * - B 类 `price_diff`       : close 不一致 → 整行重写（close/volume/turnover 全不可信）
 * - C 类 `volume_diff`      : close 一致但 volume 偏小 → 整行重写
 * - X 类`upstream_absent`  : 上游该日无数据（停牌/退市），无法定性
 * - U 类 `upstream_unreachable`: 取数失败
 *
 * ## 只读保证
 * 只执行 `SELECT`。产物写 /tmp。不碰库、不碰数据。
 *
 * ## 必守：用 `day`（不复权），不是 `qfqday`
 * 用法：
 *   cd backend && ./node_modules/.bin/tsx ../scripts/data/probe-intraday-snapshot.ts \
 *     --dates=2026-06-09,2026-08-10 --out=/tmp/intraday.json
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
const DATES = (opt('dates') ?? '2026-06-09').split(',').map((s) => s.trim()).filter(Boolean);
const OUT = opt('out') ?? '/tmp/intraday.json';
const LIMIT = opt('limit') ? Number(opt('limit')) : 0; // 0 = 全量
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

/** 上游不复权日 K（`day`），双 host 降级 */
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

type Verdict = 'A_consistent' | 'B_price_diff' | 'C_volume_diff' | 'X_upstream_absent' | 'U_unreachable';

async function main() {
  const t0 = Date.now();
  console.log(`P0-INTRADAY 只读定性探针  目标日期: ${DATES.join(', ')}`);
  console.log(`DB: ${DB_URL.replace(/:[^:@]*@/, ':***@')}\n`);

  const dateList = DATES.map((d) => `'${d}'`).join(',');
  const limitClause = LIMIT > 0 ? ` LIMIT ${LIMIT}` : '';

  const rows = sql(`
    SELECT s.symbol, q.trade_date, q.open_price, q.close_price, q.high_price, q.low_price,
           q.volume, q.turnover, q.created_at
    FROM daily_quotes q JOIN stocks s ON s.id = q.stock_id
    WHERE q.trade_date IN (${dateList})
      AND EXTRACT(HOUR FROM q.created_at) BETWEEN 13 AND 15
      AND q.created_at::date = q.trade_date
    ORDER BY s.symbol${limitClause}`);
  console.log(`目标行数(同日created_at, 13~15时): ${rows.length}`);

  const bySym = new Map<string, string[][]>();
  for (const r of rows) {
    if (!bySym.has(r[0])) bySym.set(r[0], []);
    bySym.get(r[0])!.push(r);
  }
  const syms = [...bySym.keys()];
  console.log(`涉及标的: ${syms.length} 只`);

  // 每只标的从今天回溯到最早目标日
  const earliest = DATES.slice().sort()[0];
  const nowMs = Date.now();
  const needDays = Math.ceil(((nowMs - new Date(`${earliest}T00:00:00Z`).getTime()) / 86_400_000 / 0.6645) * 1.35) + 10;
  console.log(`每只拉取 K 线根数: ${needDays}\n`);

  const tally: Record<Verdict, number> = {
    A_consistent: 0, B_price_diff: 0, C_volume_diff: 0, X_upstream_absent: 0, U_unreachable: 0,
  };
  const perDate: Record<string, Record<Verdict, number>> = {};
  const mismatches: any[] = [];
  const detail: any[] = [];

  let cursor = 0;
  const workers = Array.from({ length: CONC }, async () => {
    while (cursor < syms.length) {
      const sym = syms[cursor++];
      const tx = toTx(sym);
      const myRows = bySym.get(sym)!;
      if (!tx) {
        for (const r of myRows) {
          tally.U_unreachable++;
          perDate[r[1]] ??= tally0();
          perDate[r[1]].U_unreachable++;
        }
        continue;
      }
      const day = await fetchUnadjusted(tx, needDays);
      if (!day) {
        for (const r of myRows) {
          tally.U_unreachable++;
          perDate[r[1]] ??= tally0();
          perDate[r[1]].U_unreachable++;
        }
        continue;
      }
      // 上游按日期建索引：day 行格式 [date, open, close, high, low, volume, ...]
      const upMap = new Map<string, any>();
      for (const d of day) upMap.set(String(d[0]).slice(0, 10), d);

      for (const r of myRows) {
        const [, date, o, c, h, l, v, t, created] = r;
        perDate[date] ??= tally0();
        const up = upMap.get(date);
        if (!up) {
          tally.X_upstream_absent++;
          perDate[date].X_upstream_absent++;
          continue;
        }
        const upC = Number(up[2]);
        const upV = Number(up[5]);
        const dbC = Number(c);
        const dbV = Number(v);
        const dbO = Number(o);
        const upO = Number(up[1]);

        /**
         * ⚠️ 判据必须用**相对**偏差，不能用绝对阈值。
         * 第一版用 `Math.abs(upC-dbC) < 0.005`（半分钱），对 1278 元的贵州茅台
         * 相当于 0.0004% 的相对容差 —— 任何真实跳动都会被判成 B 类，
         * 直接把「close 基本正确、仅 volume 偏小」的 C 类误分类成 B。
         * 这正是 team-lead 实测 600519（差 2.54 元 = 0.2%）与我B=4094 冲突的根源。
         * 故此处同时记录绝对差与相对差，分类交给下游按口径切。
         */
        const cDiffAbs = upC - dbC;
        const cDiffRel = upC !== 0 ? cDiffAbs / upC : 0;
        const vRatio = upV !== 0 ? dbV / upV : 0;

        // 相对容差 0.1%：A 股最小价格变动单位 0.01 元，对 10元股≈0.1%、对百元股≈0.01%，
        // 取 0.1% 可覆盖一个最小价位而不会放宽到掩盖真实跳空。
        const PRICE_TOL_REL = 0.001;
        const VOL_TOL_REL = 0.001;

        const priceOK = Math.abs(cDiffRel) < PRICE_TOL_REL;
        const volOK = Math.abs(1 - vRatio) < VOL_TOL_REL;

        let vd: Verdict;
        if (priceOK && volOK) vd = 'A_consistent';
        else if (!priceOK) vd = 'B_price_diff';
        else vd = 'C_volume_diff';

        tally[vd]++;
        perDate[date][vd]++;
        // 全量落盘，供下游按任意口径重新切分，避免反复打上游
        detail.push({
          symbol: sym, date, verdict: vd,
          dbC, upC, cDiffAbs: +cDiffAbs.toFixed(4), cDiffRel: +cDiffRel.toFixed(6),
          dbV, upV, vRatio: +vRatio.toFixed(6), created,
        });
        if (vd !== 'A_consistent' && mismatches.length < 400) {
          mismatches.push({
            symbol: sym, date, verdict: vd,
            db: { o: dbO, c: dbC, v: dbV, t: t ? Number(t) : null, created },
            up: { o: upO, c: upC, v: upV, raw: Array.isArray(up) ? up[6] : null },
            volRatio: upV ? +(dbV / upV).toFixed(4) : null,
            cDiffRel: +cDiffRel.toFixed(6),
          });
        }
      }
    }
  });

  await Promise.all(workers);

  const sec = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n===== 分类汇总 (${sec}s) =====`);
  const tot = Object.values(tally).reduce((a, b) => a + b, 0);
  for (const [k, v] of Object.entries(tally)) {
    console.log(`  ${k.padEnd(18)} ${String(v).padStart(6)}  ${((v / Math.max(tot, 1)) * 100).toFixed(2)}%`);
  }

  console.log(`\n===== 按日期 =====`);
  for (const d of Object.keys(perDate).sort()) {
    const t = perDate[d];
    const s = Object.entries(t).filter(([, v]) => v > 0).map(([k, v]) => `${k}=${v}`).join(' ');
    console.log(`  ${d}: ${s}`);
  }

  console.log(`\n===== 样本 (前 12条不一致) =====`);
  for (const m of mismatches.slice(0, 12)) {
    console.log(
      `  ${m.symbol}@${m.date} [${m.verdict}] db C=${m.db.c} V=${m.db.v} O=${m.db.o} | up C=${m.up.c} V=${m.up.v} O=${m.up.o} | vol比=${m.volRatio} | created=${m.db.created}`,
    );
  }

  writeFileSync(OUT, JSON.stringify({ dates: DATES, tally, perDate, mismatches, detail, rows: rows.length }, null, 2));
  console.log(`\n产物: ${OUT}(含全量 detail，供下游按任意口径重切)`);
}

function tally0(): Record<Verdict, number> {
  return { A_consistent: 0, B_price_diff: 0, C_volume_diff: 0, X_upstream_absent: 0, U_unreachable: 0 };
}

main().catch((e) => {
  console.error('探针失败:', e);
  process.exit(1);
});