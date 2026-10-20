#!/usr/bin/env node
/**
 * P0-INTRADAY 4b 写后复验（只读）
 *
 * ## 为什么需要它
 * Step 3/4 是 4b **第一次真正写入数据**。写完之后不能只看行数——
 * 必须回答三个问题：
 *   ① 改后的值是否真的等于上游终盘值（而不是"改过了"）
 *   ② turnover / turnover_rate 是否**一格未动**（4b 只写 OHLCV，交 P0-TURNOVER0）
 *   ③ 载体日是否被牵连（硬约束）
 *
 * ## 只读保证
 * 只执行 SELECT。上游用 `day`（不复权），不用 `qfqday`。
 *
 * 用法：
 *   cd backend && ./node_modules/.bin/tsx ../scripts/data/verify-intraday-rewrite.ts \
 *     --plan=/tmp/4b-0604-plan.json
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const opt = (n: string) => {
  const eq = argv.find((a) => a.startsWith(`--${n}=`));
  if (eq) return eq.slice(n.length + 3);
  const at = argv.indexOf(`--${n}`);
  if (at >= 0 && at + 1 < argv.length && !argv[at + 1].startsWith('--')) return argv[at + 1];
  return undefined;
};
const PLAN = opt('plan') ?? '/tmp/4b-0604-plan.json';
/**
 * 与 fix-intraday-rewrite.ts 的 `--with-turnover` 对应。
 * 开启时 turnover/turnover_rate **应当**被改为上游终盘值，复验口径随之切换
 * （不再要求"未改动"，改为要求"等于 round(idx8)×10000"）。
 */
const WITH_TURNOVER = argv.includes('--with-turnover');
const DB_URL = opt('db') ?? process.env.DATABASE_URL ?? 'clair';
const PSQL = process.env.PSQL_BIN ?? '/opt/homebrew/opt/postgresql@15/bin/psql';
const CARRIER_DAYS = ['2026-05-30', '2026-06-06', '2026-07-11', '2026-09-06', '2026-10-04'];

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
  // 用 readFileSync 而非 execFileSync('cat')：后者受 1MB maxBuffer 限制，
  // 5182 行的计划文件约 1.1MB，会直接 ENOBUFS 崩在"读计划"这一步。
  const plan = JSON.parse(readFileSync(PLAN, 'utf8'));
  const DATE: string = plan.date;
  /**
   * 计划文件字段归一化。
   * 主脚本（`--date` 路径）落盘的字段名是 `new.turnover` / `new.turnover_rate`（已换算成元）；
   * 补写周转路径（`--from-plan`）沿用的是**原始量纲**字段名
   * `turnover_upstream_wan` / `turnover_rate_upstream_pct`。
   * 这里统一折算成元，使复验口径只有一套，避免"换个路径就少验一列"。
   */
  for (const p of plan.plan ?? []) {
    if (p.new.turnover === undefined && p.new.turnover_upstream_wan !== undefined) {
      p.new.turnover = Math.round(Number(p.new.turnover_upstream_wan)) * 10000;
      p.new.turnover_rate = Number(p.new.turnover_rate_upstream_pct);
    }
  }
  console.log(`P0-INTRADAY 4b 写后复验  date=${DATE}  计划行数=${plan.plan.length}\n`);

  // ── ③ 载体日断言 ──
  if (CARRIER_DAYS.includes(DATE)) {
    console.error(`✗ ${DATE} 是载体日，本不应出现在 4b 范围内`);
    process.exit(2);
  }
  console.log(`✓ 载体日：${DATE} 不在白名单内`);

  // ── 取库内现值（只读）──
  const rows = sql(`
    SELECT s.symbol, q.open_price, q.close_price, q.high_price, q.low_price,
           q.volume, q.turnover, q.turnover_rate
    FROM daily_quotes q JOIN stocks s ON s.id=q.stock_id
    WHERE q.trade_date='${DATE}'
    ORDER BY s.symbol`);
  const cur = new Map(rows.map((r) => [r[0], r]));

  let okO = 0, okC = 0, okH = 0, okL = 0, okV = 0, missing = 0;
  let turnoverUntouched = 0, turnoverRateUntouched = 0;
  const bad: string[] = [];
  const bySym = new Map<string, any[]>();
  for (const p of plan.plan) {
    if (!bySym.has(p.symbol)) bySym.set(p.symbol, []);
    bySym.get(p.symbol)!.push(p);
  }

  // ① ② 逐行核对：计划值 vs 库内现值
  for (const p of plan.plan) {
    const r = cur.get(p.symbol);
    if (!r) { missing++; bad.push(`${p.symbol}: 库内无该行`); continue; }
    const [, o, c, h, l, v, t, tr] = r;
    const same = (a: string, b: number) => Math.abs(Number(a) - b) < 1e-6;
    if (same(o, p.new.open_price)) okO++; else bad.push(`${p.symbol}: open ${o} != ${p.new.open_price}`);
    if (same(c, p.new.close_price)) okC++; else bad.push(`${p.symbol}: close ${c} != ${p.new.close_price}`);
    if (same(h, p.new.high_price)) okH++; else bad.push(`${p.symbol}: high ${h} != ${p.new.high_price}`);
    if (same(l, p.new.low_price)) okL++; else bad.push(`${p.symbol}: low ${l} != ${p.new.low_price}`);
    if (same(v, p.new.volume)) okV++; else bad.push(`${p.symbol}: volume ${v} != ${p.new.volume}`);
    // ② turnover / turnover_rate：按模式切换口径
    if (WITH_TURNOVER) {
      // 开启时应等于上游终盘值 round(idx8)×10000 / idx7
      if (Number(t) === Number(p.new.turnover)) turnoverUntouched++;
      else bad.push(`${p.symbol}: turnover ${t} != 上游终盘 ${p.new.turnover}`);
      if (Number(tr) === Number(p.new.turnover_rate)) turnoverRateUntouched++;
      else bad.push(`${p.symbol}: turnover_rate ${tr} != 上游 ${p.new.turnover_rate}`);
    } else {
      // 未开启时必须仍等于改前旧值（4b 不写这两列）
      if (Number(t) === Number(p.old.t)) turnoverUntouched++;
      else bad.push(`${p.symbol}: turnover 被改动 ${p.old.t} -> ${t}（未开 --with-turnover 不应写此列）`);
      if (Number(tr) === Number(p.old.tr)) turnoverRateUntouched++;
      else bad.push(`${p.symbol}: turnover_rate 被改动 ${p.old.tr} -> ${tr}（未开 --with-turnover 不应写此列）`);
    }
  }

  const n = plan.plan.length;
  console.log(`\n===== ① 计划值是否已落库 =====`);
  console.log(`  open   ${okO}/${n}   close  ${okC}/${n}   high ${okH}/${n}`);
  console.log(`  low    ${okL}/${n}   volume ${okV}/${n}`);
  if (missing) console.log(`  缺失 ${missing} 行`);

  console.log(`\n===== ② turnover 两列核对（模式: ${WITH_TURNOVER ? 'WITH-TURNOVER（应等于上游终盘）' : 'OHLCV-ONLY（应未改动）'}）=====`);
  console.log(`  turnover      ${turnoverUntouched}/${n}`);
  console.log(`  turnover_rate ${turnoverRateUntouched}/${n}`);

  // ── ① 独立复核对上游（抽样全部）──
  console.log(`\n===== ①' 与上游 day 逐值复核（独立重拉）=====`);
  const needDays = Math.ceil(((Date.now() - new Date(`${DATE}T00:00:00Z`).getTime()) / 86_400_000 / 0.6645) * 1.35) + 10;
  let upOk = 0, upBad = 0; const upBadList: string[] = [];
  let cursor = 0;
  const syms = [...bySym.keys()];
  const upVals = new Map<string, any>();
  // 并发可调。默认 8 而非 16：上游对高频请求返回 429，
  // 而 429 会被误读成"脚本有问题"，实际是基础设施限流。
  await Promise.all(Array.from({ length: Number(opt('concurrency') ?? '8') }, async () => {
    while (cursor < syms.length) {
      const sym = syms[cursor++];
      const tx = toTx(sym);
      if (!tx) continue;
      const day = await fetchUnadjusted(tx, needDays);
      if (!day) { upBad++; upBadList.push(`${sym}: 上游不可达`); continue; }
      const up = day.find((d: any) => String(d[0]).slice(0, 10) === DATE);
      if (!up) { upBad++; upBadList.push(`${sym}: 上游无该日`); continue; }
      upVals.set(sym, up);
      const r = cur.get(sym)!;
      const match =
        Math.abs(Number(r[1]) - Number(up[1])) < 1e-6 &&
        Math.abs(Number(r[2]) - Number(up[2])) < 1e-6 &&
        Math.abs(Number(r[3]) - Number(up[3])) < 1e-6 &&
        Math.abs(Number(r[4]) - Number(up[4])) < 1e-6 &&
        Math.abs(Number(r[5]) - Number(up[5])) < 1e-6;
      if (match) upOk++; else {
        upBad++;
        upBadList.push(`${sym}: db O${r[1]} C${r[2]} H${r[3]} L${r[4]} V${r[5]} | up O${up[1]} C${up[2]} H${up[3]} L${up[4]} V${up[5]}`);
      }
    }
  }));
  console.log(`  与上游一致 ${upOk}/${syms.length}，不一致 ${upBad}`);
  if (upBadList.length) upBadList.slice(0, 10).forEach((s) => console.log('    ' + s));

  /**
   * ②' 明文样例：把「库内值 vs 上游原始报文」逐值摊开打印。
   * 汇总式的 "5182/5182 一致" 只是一句话，验收方无法自行核对。
   * 给出 ≥15 行明文对照，任何人都能拿去和上游接口对。
   */
  const SHOW = Number(opt('show') ?? '0');
  if (SHOW > 0) {
    console.log(`\n===== ②' 库内 vs 上游 明文对照（前 ${SHOW} 行）=====`);
    console.log('  symbol         | 库 O/C/H/L            | 上 O/C/H/L            | 库V       | 上V       | 库T(元)        | 上T(元)        | 库TR  | 上TR');
    for (const p of plan.plan.slice(0, SHOW)) {
      const r = cur.get(p.symbol); if (!r) continue;
      const up = upVals.get(p.symbol); if (!up) continue;
      const upT = Math.round(Number(up[8])) * 10000;
      console.log(
        `  ${p.symbol.padEnd(10)} | ${r[1]}/${r[2]}/${r[3]}/${r[4]}`.padEnd(28) +
        ` | ${up[1]}/${up[2]}/${up[3]}/${up[4]}`.padEnd(26) +
        ` | ${r[5]}`.padEnd(12) + ` | ${up[5]}`.padEnd(12) +
        ` | ${r[6]}`.padEnd(16) + ` | ${upT}`.padEnd(16) +
        ` | ${r[7]} | ${up[7]}`,
      );
    }
  }

  const allGood = okO === n && okC === n && okH === n && okL === n && okV === n &&
    turnoverUntouched === n && turnoverRateUntouched === n && upBad === 0 && missing === 0;
  console.log(`\n===== 结论：${allGood ? '✓ 全部通过' : '✗ 存在问题，见上'} =====`);
  if (bad.length) { console.log(`库内核对失败明细(前10):`); bad.slice(0, 10).forEach((s) => console.log('  ' + s)); }
  process.exit(allGood ? 0 : 1);
}

main().catch((e) => { console.error('复验失败:', e); process.exit(1); });