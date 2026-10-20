#!/usr/bin/env node
/**
 * P0-INTRADAY 4b：批量确认「干净日期」是否真的 0 命中（只读）
 *
 * ## 为什么单独写它，而不复用 fix-intraday-rewrite.ts 跑 5 次
 * 判据 `dbV < upV` 每确认一天就要把该日全量标的拉一遍上游。
 * 5 天 × ~5200 只 = 约 26,000 次请求 —— 既慢又容易触发上游 429，
 * 而 429 会让人误判成「脚本有问题」。
 *
 * 判据本身**按 (symbol, date) 独立**，不要求一天一次全量拉取。
 * 故改为：**每只标的只拉一次**，窗口覆盖所有待测日期，再在本地按日切分。
 * 请求量降到 ~5200 次（1/5），结论完全等价。
 *
 * ## 输出
 * 每个待测日期给出：候选行数、命中数、命中清单（若有）。
 * 命中数 = 0 才可作为「跳过」的证据。
 *
 * 用法：
 *   cd backend && ./node_modules/.bin/tsx ../scripts/data/check-clean-dates.ts \
 *     --dates=2026-06-09,2026-08-10,2026-06-05,2026-05-28,2026-05-29
 */
import { execFileSync } from 'node:child_process';

const argv = process.argv.slice(2);
const opt = (n: string) => {
  const eq = argv.find((a) => a.startsWith(`--${n}=`));
  if (eq) return eq.slice(n.length + 3);
  const at = argv.indexOf(`--${n}`);
  if (at >= 0 && at + 1 < argv.length && !argv[at + 1].startsWith('--')) return argv[at + 1];
  return undefined;
};
const DATES = (opt('dates') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const DB_URL = opt('db') ?? process.env.DATABASE_URL ?? 'clair';
const PSQL = process.env.PSQL_BIN ?? '/opt/homebrew/opt/postgresql@15/bin/psql';
const CONC = Number(opt('concurrency') ?? '8');
const INDEX_SYMBOLS = ['000300.SZ', '399001.SZ', '399006.SZ'];
const EXCLUDE_IDX = `s.symbol NOT IN ('${INDEX_SYMBOLS.join("','")}')`;
/**
 * 个股串位行必须与主脚本口径一致地排除。
 * 000905.SZ（厦门港务）在 05-30~06-08 被写入中证500 的行情：它的 volume 是
 * **指数的成交额口径**，拿它跟个股上游比必然不等，会污染"命中数"。
 * 这类行归 P0-IDXBLEED，本脚本只回答「4b 该不该动」，不回答串位问题。
 */
const BLEED_ROWS: Array<[string, string]> = [
  ['000905.SZ', '2026-05-30'], ['000905.SZ', '2026-06-01'], ['000905.SZ', '2026-06-03'],
  ['000905.SZ', '2026-06-04'], ['000905.SZ', '2026-06-05'], ['000905.SZ', '2026-06-06'],
  ['000905.SZ', '2026-06-08'],
];
const mkExcl = (d: string) =>
  `NOT (${BLEED_ROWS.filter(([, bd]) => bd === d).map(([s]) => `s.symbol='${s}'`).join(' OR ') || 'false'})`;

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
      const day = (await r.json() as any)?.data?.[tx]?.day;
      if (Array.isArray(day) && day.length) return day;
    } catch { /* 下一个 host */ }
  }
  return null;
}

async function main() {
  if (!DATES.length) {
    console.error('必须指定 --dates=YYYY-MM-DD,...');
    process.exit(1);
  }
  console.log(`干净日期批量确认（只读）  dates=${DATES.join(',')}\n`);

  // ── 取各日候选行，同时记 created_at 分布（用于解释「为何干净」）──
  const perDate = new Map<string, Map<string, { dbV: number; created: string }>>();
  for (const d of DATES) {
    const rows = sql(`
      SELECT s.symbol, q.volume, q.created_at
      FROM daily_quotes q JOIN stocks s ON s.id=q.stock_id
      WHERE q.trade_date='${d}' AND ${EXCLUDE_IDX} AND ${mkExcl(d)}
      ORDER BY s.symbol`);
    const m = new Map<string, { dbV: number; created: string }>();
    for (const r of rows) m.set(r[0], { dbV: Number(r[1]), created: r[2] });
    perDate.set(d, m);
    const excl = Number(sql(`
      SELECT count(*) FROM daily_quotes q JOIN stocks s ON s.id=q.stock_id
      WHERE q.trade_date='${d}' AND (NOT (${EXCLUDE_IDX}) OR NOT (${mkExcl(d)}))`)[0][0]);
    console.log(`${d}: 候选 ${m.size} 行（已排除指数行/串位行 ${excl} 行）`);
  }

  // ── 标的并集，每只只拉一次，窗口覆盖最早日期 ──
  const syms = [...new Set(DATES.flatMap((d) => [...perDate.get(d)!.keys()]))].sort();
  const earliest = DATES.slice().sort()[0];
  const needDays =
    Math.ceil(((Date.now() - new Date(`${earliest}T00:00:00Z`).getTime()) / 86_400_000 / 0.6645) * 1.35) + 10;
  console.log(`\n标的并集 ${syms.length} 只，窗口自 ${earliest} 起共 ${needDays} 根日K（每只只拉一次）\n`);

  const got = new Map<string, Map<string, any>>();
  const unavailable: string[] = [];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: CONC }, async () => {
      while (cursor < syms.length) {
        const sym = syms[cursor++];
        const tx = toTx(sym);
        if (!tx) continue;
        const day = await fetchUnadjusted(tx, needDays);
        if (!day) { unavailable.push(sym); continue; }
        const m = new Map<string, any>();
        for (const d of day) m.set(String(d[0]).slice(0, 10), d);
        got.set(sym, m);
      }
    }),
  );
  if (unavailable.length) console.log(`⚠ 上游不可达 ${unavailable.length} 只（不参与判定，见下方覆盖度）`);
  console.log(`上游取回 ${got.size} / ${syms.length} 只\n`);

  // ── 逐日判定 ──
  let allClean = true;
  for (const d of DATES) {
    const m = perDate.get(d)!;
    let hits = 0; let compared = 0; let noUp = 0;
    const hitList: string[] = [];
    for (const [sym, v] of m) {
      const up = got.get(sym)?.get(d);
      if (!up) { noUp++; continue; }
      compared++;
      if (Number(up[5]) > 0 && v.dbV < Number(up[5])) {
        hits++;
        hitList.push(`${sym} dbV=${v.dbV} upV=${up[5]}`);
      }
    }
    const clean = hits === 0;
    if (!clean) allClean = false;
    console.log(
      `${d}: 候选 ${m.size} ｜ 已比对 ${compared} ｜ volume 判据命中 ${hits}` +
      `${noUp ? ` ｜ 上游缺该日 ${noUp}` : ''}  → ${clean ? '✓ 0 命中，跳过' : '✗ 有命中，需重写'}`,
    );
    if (hitList.length) hitList.slice(0, 10).forEach((h) => console.log('    ' + h));
    // created_at 分布：解释「为何干净」——收盘后写的行本来就是终盘值
    const times = [...m.values()].map((v) => v.created);
    const pre = times.filter((t) => t.slice(11) < '15:00:00').length;
    console.log(`      created_at<15:00 的行数 = ${pre} / ${times.length}（仅作解释，不作判据）`);
  }

  console.log(`\n===== 结论：${allClean ? '✓ 全部 0 命中，均可跳过' : '✗ 存在命中日，不可跳过'} =====`);
  process.exit(allClean ? 0 : 1);
}

main().catch((e) => { console.error('执行失败:', e); process.exit(1); });
