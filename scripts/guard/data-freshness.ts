#!/usr/bin/env node
/**
 * E5 数据及时性门禁 —— `daily_quotes` 是否落后真实交易日（只读，本地态）
 *
 * ## 为什么要有它
 * 2026-10 的真实事故：长假休市期间库里被写入 5541 行「抹布化」伪造行，
 * 而真实交易日 09-28/29/30 各有 0 行。只看「最新一行是哪天」会得到
 * 2026-10-06（国庆休市）——既是假数据，又会把缺失掩盖成「最新」。
 * 本脚本用**交易日历真源**判定应到日期，再用 PG 的最大 trade_date 对比，
 * 输出 lagTradingDays，超过阈值即 FAIL。
 *
 * ## 判据（E5）
 *   realLatest = 19:00 前 → 今日之前最近交易日；19:00 后 → 今日（若开市）
 *   lagTradingDays = 开区间 (maxTradeDate, realLatest] 内的交易日数
 *   PASS: lag <= --max-lag（默认 1）；WARN: 当年日历 provisional；
 *   FAIL: lag > maxLag；exit 2: 参数/环境错误（psql 不可用、连不上库、空表）
 *
 * ## 绝不用的判据
 *   `SELECT DISTINCT trade_date ... LIMIT 1` 反推「应到哪天」——见文件头事故，
 *   以及 docs/harness/TRADING-CALENDAR.md。日历只来自 backend/src/utils/tradingCalendar.ts。
 *
 * ## 用法
 *   cd backend && ./node_modules/.bin/tsx ../scripts/guard/data-freshness.ts
 *   cd backend && ./node_modules/.bin/tsx ../scripts/guard/data-freshness.ts --json --ticket T-2611-01
 *   # 自证不是恒绿：把观测值往前挪 N 个交易日，N 必须大于 maxLag + 当前 (expected - observed) 差
 *   # 例：库最新=11-04、expected=11-03、maxLag=1 时，N=3 → lag=2 > 1 → FAIL（exit 1）
 *   cd backend && ./node_modules/.bin/tsx ../scripts/guard/data-freshness.ts --simulate-lag 3
 *   # 发布生产可观测快照（Worker /api/health/data-freshness 第 2 层读它）
 *   cd backend && ./node_modules/.bin/tsx ../scripts/guard/data-freshness.ts --publish /tmp/e5.json
 *
 * ## 状态口径（禁止混同）
 *   本地态：本脚本可跑，**不进 CI、不阻断**。
 *   生产态：两层可观测，互不冒充 ——
 *     第 1 层 realtime 由 Worker 直接回答（此刻实时源能看到的最新交易日）；
 *     第 2 层 database 读 KV meta:freshness，内容由本脚本 --publish 产出后发布。
 *   --publish 只写本地文件，不代替发布动作；--simulate-lag 的结果**拒绝发布**（模拟值不得进生产）。
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MARKET_TZ,
  addDays,
  calendarPrecisionOfYear,
  dateInMarketTz,
  latestTradingDay,
  prevTradingDay,
  tradingDaysStrictlyBetween,
} from '../../backend/src/utils/tradingCalendar';

const argv = process.argv.slice(2);
const opt = (n: string): string | undefined => {
  const eq = argv.find((a) => a.startsWith(`--${n}=`));
  if (eq) return eq.slice(n.length + 3);
  const at = argv.indexOf(`--${n}`);
  if (at >= 0 && at + 1 < argv.length && !argv[at + 1].startsWith('--')) return argv[at + 1];
  return undefined;
};
const flag = (n: string) => argv.includes(`--${n}`);

const JSON_OUT = flag('json');
const PUBLISH = opt('publish') ?? (flag('publish') ? '/tmp/e5-freshness-snapshot.json' : undefined);
const TICKET = opt('ticket');
const MAX_LAG = Number(opt('max-lag') ?? '1');
const SIMULATE_LAG = Number(opt('simulate-lag') ?? '0');
const PSQL = process.env.PSQL_BIN ?? 'psql';
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');

/** backend/.env 里的 DATABASE_URL（仅本地态使用；CI 不跑本脚本） */
function readLocalDbUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = resolve(repoRoot, 'backend/.env');
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = /^DATABASE_URL=(.*)$/.exec(line.trim());
      if (m) return m[1].trim().replace(/^["']|["']$/g, '');
    }
  }
  return opt('db') ?? 'clair';
}

function failEnv(msg: string): never {
  console.error(`E5 ERROR ${msg}`);
  process.exit(2);
}

function query(sql: string): string[][] {
  try {
    return execFileSync(PSQL, ['-d', DB_URL, '-t', '-A', '-F', '|', '-c', sql], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => l.split('|'));
  } catch (e) {
    const err = e as { stderr?: Buffer | string; message?: string };
    const detail = (err.stderr?.toString() || err.message || '').trim().split('\n').slice(0, 3).join(' ');
    failEnv(`psql 执行失败（DB=${DB_URL.replace(/:[^:@/]+@/, ':***@')}）：${detail}`);
  }
}

const DB_URL = readLocalDbUrl();
const now = new Date();
// 交易所时区的当前小时（19:00 是当日收盘数据可用的分界；宁可保守用 T-1）
const hourInTz = Number(
  new Intl.DateTimeFormat('en-GB', { timeZone: MARKET_TZ, hour: '2-digit', hour12: false }).format(now),
);
const today = dateInMarketTz(now);
const expected = hourInTz >= 19 ? latestTradingDay(today) : latestTradingDay(addDays(today, -1));

const rows = query(
  `SELECT max(trade_date)::text, count(*)::text FROM daily_quotes WHERE trade_date IS NOT NULL`,
);
if (!rows[0] || !rows[0][0] || rows[0][0] === '') {
  failEnv('daily_quotes 无任何 trade_date（空表或表不存在），无法判定及时性');
}
const observedRaw = rows[0][0];
const rowCount = Number(rows[0][1] ?? '0');

// --simulate-lag N：自证用。把观测值往前挪 N 个交易日，其余判据不变。
let observed = observedRaw;
const simulated = SIMULATE_LAG > 0;
if (simulated) {
  let cursor = observedRaw;
  for (let i = 0; i < SIMULATE_LAG; i += 1) cursor = prevTradingDay(cursor);
  observed = cursor;
}

const precision = calendarPrecisionOfYear(Number(expected.slice(0, 4)));
const lagTradingDays =
  observed >= expected ? 0 : tradingDaysStrictlyBetween(observed, expected) + 1;
const formatted = observed !== observedRaw ? `${observed}(SIMULATED from ${observedRaw})` : observed;

const base = {
  evaluator: 'E5',
  table: 'daily_quotes',
  observedMaxTradeDate: observed,
  observedRaw,
  simulated,
  realLatestTradingDay: expected,
  lagTradingDays,
  maxLag: MAX_LAG,
  calendarPrecision: precision,
  marketTz: MARKET_TZ,
  nowInMarketTz: `${today} ${String(hourInTz).padStart(2, '0')}:00`,
  rowCount,
  ticket: TICKET ?? null,
} as const;

let verdict: 'PASS' | 'WARN' | 'FAIL';
let reason = '';
if (lagTradingDays > MAX_LAG) {
  verdict = 'FAIL';
  reason = `lagTradingDays=${lagTradingDays} 超过 maxLag=${MAX_LAG}`;
} else if (precision === 'provisional') {
  verdict = 'WARN';
  reason = `当年日历为 provisional（${expected} 来源待官方公告确认），按规范降级 WARN`;
} else {
  verdict = 'PASS';
  reason = `lagTradingDays=${lagTradingDays} <= maxLag=${MAX_LAG}`;
}

const suffix = TICKET ? ` ticket=${TICKET}` : '';
const head = `E5 ${verdict} daily_quotes max(trade_date)=${formatted} expected=${expected} lagTradingDays=${lagTradingDays} maxLag=${MAX_LAG} calendar=${precision}`;
// FAIL/WARN 必须把判据原因写在同一条机器可读行里；PASS 不加冗余尾注
const line = verdict === 'PASS' ? `${head}${suffix}` : `${head} ${reason}${suffix}`;

if (JSON_OUT) {
  console.log(JSON.stringify({ ...base, verdict, reason, line }, null, 2));
} else {
  console.log(line);
  console.log(
    `E5 INFO rows=${rowCount} now=${base.nowInMarketTz} simulated=${simulated} precision=${precision}`,
  );
}

// ── 生产可观测快照（第 2 层）──
// 字段名与 clair-worker /api/health/data-freshness 的 database 段一一对应。
// 只在真实（非模拟）运行时产出；模拟值进生产等于用假数据冒充新鲜度。
if (PUBLISH) {
  if (simulated) {
    console.error('E5 ERROR 模拟运行（--simulate-lag）的结果不得发布；请去掉该参数后重跑 --publish');
    process.exit(2);
  }
  const snapshot = {
    maxTradeDate: observedRaw,
    expectedTradeDate: expected,
    lagTradingDays,
    maxLag: MAX_LAG,
    calendarPrecision: precision,
    rows: rowCount,
    verdict,
    checkedAt: now.toISOString(),
    source: 'scripts/guard/data-freshness.ts',
    marketTz: MARKET_TZ,
  };
  const target = resolve(PUBLISH);
  writeFileSync(target, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
  console.error('E5 PUBLISH 快照已写入 ' + target + '（还需发布到 KV meta:freshness 才对生产可见）');
}

process.exit(verdict === 'FAIL' ? 1 : 0);
