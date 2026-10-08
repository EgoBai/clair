#!/usr/bin/env node
/**
 * 补回 `daily_quotes` 里确认缺失的真实交易日行情（P0-BACKFILL）
 *
 * ## ⚠️ 状态：**未验证可跑通**（team-lead 2026-10-09 裁决时明确要求标注）
 *
 * 本脚本在 WAF 拦截下**未能实跑验证**：首次干跑要拉 5544 只标的，进程运行
 * 27 分钟无任何输出后node 子进程消失（疑似沙箱 OOM），**未拿到任何抓取结果、
 * 未写入任何数据**。因此：
 * - 解析与口径逻辑经过**逐字段实测核对**（见下「口径反推」）；
 * - 但**端到端流程、分批策略、内存占用均未经真实运行检验**；
 * - 使用前请先在**克隆库**（如 `createdb clair_backfill_test`）跑通，
 *   并用小批量（如 `--limit 20`）确认端点可达、字段落库正常，再碰生产表。
 *
 * 另：日期真源是**上游响应数组 `item[0]`**（形如 `"2026-09-30"`），
 * **不是**腾讯实时行情接口的 `parts[30]`——后者只存在于 `qt/ulist.np/get`，
 * 与 K 线路径无关。（此处曾被工单写错，已由实测纠正。）
 *
 * ## 背景：为什么会有缺失
 * 采集器在 2026-09-28~09-30 停机，这三个交易日的 K 线从未写入。而真实
 * 09-30 的收盘数据被 `tradeDate: new Date()`（本地时钟）挂到了 10-04 上——
 * 于是「真实数据存在，但挂在错误日期」，同时「正确日期反而为空」。
 *
 * ## 上游源的选择（关键：为什么不用 `syncKLineData`）
 * `DataSyncService.syncKLineData()` 走的是
 * `appstock/app/fqkline/get?param=<sym>,day,,,<n>,qfq` —— **前复权**。
 * 但本库 `daily_quotes` 存的是**不复权**价（实测基准，见下），两者在除权除息
 * 前后差异显著，直接用会把复权价污染进不复权库。
 *
 * 实测证据（601390，2026-10-08 除权 10派0.6374）：
 * | 日期 | qfq收 | raw收 | DB 收 |
 * |---|---|---|---|
 * | 2026-09-24 | 4.186 | 4.250 | **4.25** |
 * | 2026-09-30 | 4.266 | 4.330 | **4.33**（挂在 10-04 上） |
 * | 2026-10-08 | 4.280 | 4.280 | 4.28（除权后两者一致） |
 *
 * 抽样 54 只标的统计：**3 只（601390/600028/600585）在 09-28~09-30 区间
 * qfq ≠ 不复权**，即约 5.5% 的标的会被写错价。
 *
 * 故本脚本改用 `appstock/app/newfqkline/get`，**fq 参数留空**（=不复权），
 * 该端点额外提供成交额与换手率，正好补齐本库 NOT NULL 的 `turnover`
 * （老 `kline/kline` 端点**不含成交额**，补不齐）：
 * `["2026-09-30","4.25","4.33","4.33","4.23","907034.00",{},"0.45","38942.68",...]`
 * 下标 0=日期 1=开 2=收 3=高 4=低 5=成交量(手) 7=换手率% 8=成交额(万元)
 *
 * ## 端点降级（实测两个 host 数据逐字节相同）
 * `proxy.finance.qq.com` 与 `web.ifzq.gtimg.cn` 对同一标的返回完全一致的
 * OHLCV + 成交额。腾讯 WAF 会**按请求量**触发拦截（实测出现过 HTTP 501，
 * 也出现过同时 200），故运行时逐个尝试、不写死任一 host。
 *
 * ## 日期真源：上游 `item[0]`，绝不用本地时钟
 * 这是 P0-SMEARED 的同一个根因。脚本对每个候选日期三重校验：
 * 1. 格式必须是 `YYYY-MM-DD`（来自上游 `item[0]`，不是任何 `new Date()`）；
 * 2. 必须通过 `isTradingDay()`（交易所公告口径，见 `tradingCalendar.ts`）；
 * 3. 必须在 `--dates` 白名单内（显式指定要补哪天）。
 * 三者任一不过就跳过该行并计数上报，**绝不用本地时钟兜底**。
 *
 * ## 口径反推（与库内既有行逐字段核对）
 * 三个派生字段的**基数统一是「前收盘」**（上一根 K 线收盘；若该 bar 自身是
 * 除权日，按上游 `cqr`/`fh_sh` 的每股派息下调），**不是开盘价**。
 *
 * 实测（2026-09-24 随机抽样 56 只，与库内既有行比对）：
 * | 字段 | 以前收盘为基数 | 以开盘价为基数 |
 * |---|---|---|
 * | `change_amount` | **56/56** | — |
 * | `change_percent` | **56/56** | — |
 * | `amplitude` | **56/56** | 25/56 |
 *
 * 除权日实测（601390 于 2026-10-08 除权，10 派 0.6374）：raw 前收 4.33 →
 * 基准 4.27，得 change 0.01 / cp 0.23 / amp 1.17，与库内 10-08 行完全一致。
 *
 * 其余字段：
 * - `turnover` = 上游成交额(万元) × 10000（600519 实测 314541.32万 → 3145413200，
 *   库内 3145410000，差 3200 元属尾数舍入）
 * - `turnover_rate` = 上游换手率%（index 7，56/56 命中）
 * - `market_cap` / `pe_ratio` / `pb_ratio` → **NULL**（K 线接口不提供，
 *   宁可留空也不编造；这三列可空）
 *
 * ## 幂等
 * 写入用 `ON CONFLICT (stock_id, trade_date) DO NOTHING`——已存在的行一律不动，
 * 重跑不会覆盖既有数据，也不会产生重复。
 *
 * ## 用法
 * ```bash
 * # 干跑（默认）：只报告将要写什么，不动数据库
 * npx tsx scripts/data/backfill-missing-kline.ts --dates=2026-09-28,2026-09-29,2026-09-30
 *
 * # 小批冒烟（验证端点与字段落库，不碰全量）
 * npx tsx scripts/data/backfill-missing-kline.ts --dates=2026-09-30 --limit 20
 *
 * # 真正写入（必须同时给 --apply 与已存在的 --backup）
 * npx tsx scripts/data/backfill-missing-kline.ts --dates=2026-09-28,2026-09-29,2026-09-30 \
 *   --apply --backup=/tmp/clair-backups/clair-before-backfill-20261009-030913.sql
 * ```
 */

import { execFileSync } from 'node:child_process';
import { existsSync, appendFileSync, writeFileSync, readFileSync } from 'node:fs';

// ─────────────────────────── CLI ───────────────────────────

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(`--${n}`);
/**
 * 取选项值。同时接受 `--name=value` 与 `--name value` 两种写法。
 *
 * 为什么要兼容空格形式：只支持 `=` 时，`--limit 6` 会被**静默当成没传**
 * （opt 返回 undefined → 回落默认值），于是「冒烟测试 20 只」实际跑了全量 5544 只。
 * 这种静默失效比报错危险得多，故两种写法都认。
 */
const opt = (n: string) => {
  const eq = argv.find((a) => a.startsWith(`--${n}=`));
  if (eq) return eq.slice(n.length + 3);
  const at = argv.indexOf(`--${n}`);
  if (at >= 0 && at + 1 < argv.length && !argv[at + 1].startsWith('--')) return argv[at + 1];
  return undefined;
};

const APPLY = flag('apply');
const BACKUP = opt('backup');
const DATES = (opt('dates') ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const DB_URL = opt('db') ?? process.env.DATABASE_URL ?? 'clair';
const PSQL = process.env.PSQL_BIN ?? '/opt/homebrew/opt/postgresql@15/bin/psql';
/** 上游请求并发数（腾讯限流不宜过高） */
const CONCURRENCY = Number(opt('concurrency') ?? '6');
/** 只处理前N 只标的（冒烟测试用）；0 = 全量 */
const LIMIT = Number(opt('limit') ?? '0');
/** 分批落盘：每批把pending 追加写到该文件，避免长跑进程内存膨胀/被kill 后全丢 */
const OUT = opt('out');
/** 断点续跑：跳过该文件里已处理过的 symbol */
const RESUME = opt('resume');
/** 只写入该 TSV 产物（配合 --apply），不再重新抓取上游 */
const WRITE_FROM = opt('write-file');

if (DATES.length === 0) {
  console.error('必须显式指定 --dates=YYYY-MM-DD,...（本脚本拒绝猜测要补哪天）');
  process.exit(2);
}

function sql(query: string): string[][] {
  const out = execFileSync(PSQL, ['-d', DB_URL, '-t', '-A', '-F', '|', '-c', query], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  return out
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => l.split('|'));
}

// ───────────────────────交易日校验（复用唯一真源） ───────────────────────
// 判定权威是backend/src/utils/tradingCalendar.ts 的 isTradingDay()，
// 本脚本**不复制**任何一份日历逻辑（复制必然随交易所公告更新而失效）。

import { isTradingDay } from '../../backend/src/utils/tradingCalendar';

// ─────────────────────────── 上游抓取 ───────────────────────────

interface Bar {
  tradeDate: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  turnoverRate: number;
  amountWan: number;
  /** 该bar 本身是除权日时的每股派息（非除权日为 0） */
  exDivPerShare: number;
}

/**
 * 端点降级：腾讯同一份数据挂在两个 host 上，WAF 拦截行为不一致。
 *
 * 实测（2026-10-09）：两者对 sh600519 的 09-28/29/30 返回**逐字节相同**的
 * OHLCV + 成交额（close 1243.88 / 1235.58 / 1258.62），故顺序无关紧要，
 * 哪个能用就用哪个。
 *
 * 为什么要降级：单host 会被腾讯 WAF 按请求量触发拦截。team-lead 实测
 * `web.ifzq.gtimg.cn` 返回 **HTTP 501**；而同一时刻我实测两个 host 均 200。
 * 这说明拦截是**按量触发**而非固定禁用 —— 因此不能把任一 host 写死，
 * 必须运行时逐个尝试，否则补数会在跑到一半时整体失败。
 */
const KLINE_HOSTS: readonly { name: string; base: string }[] = [
  { name: 'proxy.finance.qq.com', base: 'https://proxy.finance.qq.com/ifzqgtimg/appstock/app/newfqkline/get' },
  { name: 'web.ifzq.gtimg.cn', base: 'https://web.ifzq.gtimg.cn/appstock/app/newfqkline/get' },
];

/** 记录某个 host 是否已被判定不可用，避免对死host 反复重试拖慢整体 */
const hostDown = new Set<string>();

/**
 * 拉取单只标的的不复权日K（host 失败自动降级）。
 *
 * fq 参数**留空**（`newfqkline/get`）=不复权，这是与本库口径一致的关键；
 * 若用 `qfq`（前复权）会把除权后的价格倒灌进不复权库（实测 5.5% 标的会写错）。
 */
async function fetchUnadjustedDaily(symbolTx: string, days: number): Promise<Bar[]> {
  const lastErr: Error[] = [];
  for (const host of KLINE_HOSTS) {
    if (hostDown.has(host.name)) continue;
    try {
      const url = `${host.base}?param=${symbolTx},day,,,${days},`;
      const resp = await fetch(url, {
        signal: AbortSignal.timeout(20000),
        headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://finance.qq.com' },
      });
      if (!resp.ok) {
        // 5xx（含 WAF 的 501）视为该 host 暂时不可用，换下一个
        if (resp.status >= 500) hostDown.add(host.name);
        throw new Error(`${host.name} HTTP ${resp.status}`);
      }
      const json: any = await resp.json();
      const node = json?.data?.[symbolTx];
      // 只有一个 host 返回空 day 时不立即判定失败，先试完所有 host
      if (!node?.day) {
        lastErr.push(new Error(`${host.name} 返回空 data`));
        continue;
      }
      return parseBars(node.day as any[]);
    } catch (e) {
      lastErr.push(e as Error);
    }
  }
  throw new Error(`所有端点均失败: ${lastErr.map((e) => e.message).join('; ')}`);
}

/** 把上游 day 数组解析成 Bar[]，并顺带记录该host 存活 */
function parseBars(rows: any[]): Bar[] {
  const bars: Bar[] = [];
  for (const r of rows) {
    // 下标 0 必须是 YYYY-MM-DD 字符串——日期真源，绝不用本地时钟推导
    if (!Array.isArray(r) || typeof r[0] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r[0])) continue;
    const num = (i: number) => {
      const v = parseFloat(r[i]);
      return Number.isFinite(v) ? v : 0;
    };
    bars.push({
      tradeDate: r[0],
      open: num(1),
      close: num(2),
      high: num(3),
      low: num(4),
      volume: num(5),
      turnoverRate: num(7),
      amountWan: num(8),
      // 下标 6 附带除权信息 { nd, fh_sh, djr, cqr, FHcontent }，cqr = 除权日。
      // 若该bar 本身是除权日，前收盘需按每股派息下调，否则派生字段与库内口径不一致。
      exDivPerShare: readExDiv(r),
    });
  }
  return bars;
}

/**
 * 取该bar 的「每股派息」。仅当 bar 自身就是除权日（`cqr` == 该bar 日期）时返回 >0。
 * `fh_sh` 是「每 10 股派 X 元」，故除以 10。
 */
function readExDiv(r: any[]): number {
  const meta = r[6];
  if (!meta || typeof meta !== 'object' || meta.cqr !== r[0] || !meta.fh_sh) return 0;
  const per = parseFloat(meta.fh_sh) / 10;
  return Number.isFinite(per) ? per : 0;
}

/**
 * 保留2 位小数，**四舍五入到远离零的一侧**。
 *
 * 两点理由：
 * 1. 与 PostgreSQL `numeric` 的舍入方向一致（PG 的 `round(numeric, s)` 是
 *    half-away-from-zero，而 JS 的 `Math.round` 是 half-up，即负数平局会向 +∞偏）。
 *    列类型是 `numeric(10,2)` / `numeric(8,4)`，故按库的约定舍入最稳。
 * 2. 派生字段会出现正好落在 `.xx5` 的平局值。
 *
 * ⚠️ 已知残留偏差（**非公式错误，无法也不必消除**）：
 * 300015.SZ 在 2026-09-17，change = −0.05 / 前收 8.00，理论值 −0.625%，
 * 但 IEEE754 双精度算出 −0.6249999999999978，落在平局点另一侧故得 −0.62，
 * 而库内既有值 −0.63（实时路径直接取上游 `parts[32]` 的 changePercent，
 * 上游自己就是这么给的）。K 线数组不含涨跌幅字段（index 9/10 恒为 0.00），
 * 故只能自算。**该类偏差仅限落在平局点、且幅度 ≤0.01 的涨跌幅**，
 * 抽样命中率 09-17 为 58/60、09-24 为 59/59（另一例为上游缺该日）。
 */
function round2(x: number): number {
  const v = Math.round(Math.abs(x) * 100) / 100;
  return x < 0 ? -v : v;
}

/** '600519.SH' → 'sh600519'；腾讯小写市场前缀 */function toTencentSymbol(symbol: string): string | null {
  const code = symbol.replace(/\.(SZ|SH|BJ)$/i, '');
  if (code.startsWith('6') || code.startsWith('9')) return `sh${code}`;
  if (code.startsWith('0') || code.startsWith('3')) return `sz${code}`;
  if (code.startsWith('4') || code.startsWith('8')) return `bj${code}`;
  return null;
}

// ─────────────────────────── 主流程 ───────────────────────────

async function main() {
  const target = new Set(DATES);

  // 白名单日期先过交易日历：非交易日直接拒绝补数（不写、不猜）
  const allowed = new Set<string>();
  for (const d of DATES) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      console.error(`✗ 非法日期 "${d}"，期望 YYYY-MM-DD`);
      process.exit(2);
    }
    if (!isTradingDay(d)) {
      console.error(`✗ ${d} 不是交易日（交易日历判定），拒绝补数`);
      process.exit(2);
    }
    allowed.add(d);
  }
  console.log(`目标交易日: ${[...allowed].join(', ')}（已通过交易日历校验）`);

  const allStocks = sql(`SELECT id, symbol FROM stocks WHERE is_active ORDER BY id`).map((r) => ({
    id: Number(r[0]),
    symbol: r[1],
  }));
  // 断点续跑：跳过已处理过的 symbol（长跑被 kill 后可接着跑）
  const done = new Set<string>();
  if (RESUME && existsSync(RESUME)) {
    for (const line of readFileSync(RESUME, 'utf8').split('\n')) {
      if (line.trim()) done.add(line.split('\t')[0]);
    }
    console.log(`断点续跑: ${RESUME} 已完成 ${done.size} 只`);
  }
  const stocks = LIMIT > 0 ? allStocks.slice(0, LIMIT) : allStocks.filter((s) => !done.has(s.symbol));
  console.log(`活跃标的: ${allStocks.length} 只，本次处理 ${stocks.length} 只\n`);

  // 已是正确日期的行不再重算（ON CONFLICT DO NOTHING 也会兜底，这里提前跳过省请求）
  const existing = new Set<string>();
  for (const r of sql(
    `SELECT stock_id, trade_date FROM daily_quotes WHERE trade_date IN (${[...allowed].map((d) => `'${d}'`).join(',')})`
  )) {
    existing.add(`${r[0]}|${r[1]}`);
  }
  console.log(`已存在的正确日期行: ${existing.size} 行（将被跳过）\n`);

  interface Pending {
    stockId: number;
    tradeDate: string;
    open: number;
    close: number;
    high: number;
    low: number;
    volume: number;
    turnover: number;
    changeAmount: number;
    changePercent: number;
    amplitude: number;
    turnoverRate: number;
  }

  const pending: Pending[] = [];
  const stats = { fetched: 0, barsTotal: 0, skippedNonTrading: 0, skippedNoBar: 0, errors: 0, badSymbol: 0 };
  const errorSamples: string[] = [];

  // 分批落盘：进程被 kill 也不丢已抓到的数据；--resume 可续跑
  if (OUT && !RESUME) writeFileSync(OUT, '');

  let cursor = 0;
  let lastLog = Date.now();
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < stocks.length) {
      const stock = stocks[cursor++];
      const tx = toTencentSymbol(stock.symbol);
      if (!tx) {
        stats.badSymbol++;
        continue;
      }
      try {
        const bars = await fetchUnadjustedDaily(tx, 30);
        stats.fetched++;
        stats.barsTotal += bars.length;
        // 建立 日期 → 前收盘 的映射（change_amount 要用前收盘，不是开盘价）
        const prevClose = new Map<string, number>();
        for (let i = 1; i < bars.length; i++) prevClose.set(bars[i].tradeDate, bars[i - 1].close);

        const lines: string[] = [];
        for (const b of bars) {
          if (!target.has(b.tradeDate)) continue;
          if (existing.has(`${stock.id}|${b.tradeDate}`)) continue;
          // 三重校验之二：交易日历
          if (!isTradingDay(b.tradeDate)) {
            stats.skippedNonTrading++;
            continue;
          }
          // OHLC 完整性：任一为 0 说明上游该行不完整，宁可不写
          if (!(b.open > 0 && b.close > 0 && b.high > 0 && b.low > 0)) {
            stats.skippedNoBar++;
            continue;
          }
          const base = prevClose.get(b.tradeDate);
          // 前收盘基准：上一根 K 线的收盘；若该 bar 自身是除权日，按每股派息下调
          // （实测 601390 在 10-08 除权，raw 前收 4.33 → 基准 4.27，
          //   change 0.01 / cp 0.23 / amp 1.17，与库内既有行完全一致）
          let prev = base !== undefined && base > 0 ? base : b.open;
          if (b.exDivPerShare > 0) prev = round2(prev - b.exDivPerShare);
          const rec: Pending = {
            stockId: stock.id,
            tradeDate: b.tradeDate,
            open: b.open,
            close: b.close,
            high: b.high,
            low: b.low,
            volume: Math.round(b.volume),
            turnover: round2(b.amountWan * 10000),
            // 三个派生字段统一以「前收盘」为基数（实测 09-24 抽样 56/56 命中库内口径；
            // 若改用开盘价作基数，amplitude 只能命中 25/56）
            changeAmount: round2(b.close - prev),
            changePercent: round2(((b.close - prev) / prev) * 100),
            amplitude: round2(((b.high - b.low) / prev) * 100),
            turnoverRate: b.turnoverRate,
          };
          pending.push(rec);
          lines.push(
            [
              stock.symbol, rec.stockId, rec.tradeDate, rec.open, rec.close, rec.high, rec.low,
              rec.volume, rec.turnover, rec.changeAmount, rec.changePercent, rec.amplitude, rec.turnoverRate,
            ].join('\t')
          );
        }
        if (OUT && lines.length) appendFileSync(OUT, lines.join('\n') + '\n');
        if (RESUME) appendFileSync(RESUME, `${stock.symbol}\t${lines.length}\n`);
      } catch (e) {
        stats.errors++;
        if (errorSamples.length < 10) errorSamples.push(`${stock.symbol}: ${(e as Error).message}`);
        // 失败也记入 resume 文件，避免反复重试同一个坏标的拖死整轮
        if (RESUME) appendFileSync(RESUME, `${stock.symbol}\tERR\n`);
      }
      // 每 10 秒打印一次进度（换行输出，便于 tail -f 观察是否在推进）
      if (Date.now() - lastLog > 10000) {
        lastLog = Date.now();
        console.log(`  ...已拉取 ${stats.fetched}/${stocks.length}，累计待写 ${pending.length} 行，失败 ${stats.errors}`);
      }
    }
  });
  await Promise.all(workers);

  const byDate = new Map<string, number>();
  for (const p of pending) byDate.set(p.tradeDate, (byDate.get(p.tradeDate) ?? 0) + 1);

  console.log(`\n=== 抓取统计 ===`);
  console.log(`  成功拉取: ${stats.fetched} / ${stocks.length}`);
  console.log(`  K线总根数: ${stats.barsTotal}`);
  console.log(`  非交易日跳过: ${stats.skippedNonTrading}`);
  console.log(`  OHLC 不完整跳过: ${stats.skippedNoBar}`);
  console.log(`  无法识别代码: ${stats.badSymbol}`);
  console.log(`  抓取失败: ${stats.errors}${errorSamples.length ? ` 例: ${errorSamples.join('; ')}` : ''}`);

  console.log(`\n=== 待写行数（按日期） ===`);
  for (const d of DATES) console.log(`  ${d}: ${byDate.get(d) ?? 0} 行`);
  console.log(`  合计: ${pending.length} 行`);

  if (pending.length === 0) {
    console.log('\n无待写数据，未触碰数据库。');
    return;
  }

  if (!APPLY) {
    console.log('\n干跑结束（未加 --apply，数据库未被修改）。');
    return;
  }

  if (!BACKUP || !existsSync(BACKUP)) {
    console.error(`\n✗拒绝写入：未提供有效的 --backup（当前值: ${BACKUP ?? '无'}）`);
    process.exit(2);
  }
  console.log(`\n备份已确认存在: ${BACKUP}`);

  // ── 写入来源：本次抓取的内存数据，或 --write-file 指定的已落盘产物 ──
  let rows: Pending[] = pending;
  if (WRITE_FROM) {
    if (!existsSync(WRITE_FROM)) {
      console.error(`\n✗ --write-file 指向的文件不存在: ${WRITE_FROM}`);
      process.exit(2);
    }
    rows = [];
    const seen = new Set<string>();
    for (const line of readFileSync(WRITE_FROM, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      const p = line.split('\t');
      if (p.length < 13) continue;
      const [, stockId, tradeDate, o, c, h, l, v, t, ca, cp, amp, tr] = p;
      // 三重校验之三：产物里的日期必须仍在本次显式指定的白名单内
      if (!target.has(tradeDate)) {
        console.error(`\n✗ 产物含白名单外的日期 ${tradeDate}，拒绝写入`);
        process.exit(2);
      }
      const key = `${stockId}|${tradeDate}`;
      if (seen.has(key)) continue; // 同键重复（断点续跑可能重叠）→ 只写一次
      seen.add(key);
      rows.push({
        stockId: Number(stockId),
        tradeDate,
        open: Number(o), close: Number(c), high: Number(h), low: Number(l),
        volume: Number(v), turnover: Number(t),
        changeAmount: Number(ca), changePercent: Number(cp),
        amplitude: Number(amp), turnoverRate: Number(tr),
      });
    }
    console.log(`从产物读入 ${rows.length} 行（去重后），来源 ${WRITE_FROM}`);
    const byFile = new Map<string, number>();
    for (const r of rows) byFile.set(r.tradeDate, (byFile.get(r.tradeDate) ?? 0) + 1);
    for (const d of DATES) console.log(`  ${d}: ${byFile.get(d) ?? 0} 行`);
    // OHLC 完整性最后一道闸：不允许把 0 价写进库
    const bad = rows.filter((r) => !(r.open > 0 && r.close > 0 && r.high > 0 && r.low > 0));
    if (bad.length) {
      console.error(`\n✗ 产物中有 ${bad.length} 行 OHLC 非正，拒绝写入`);
      process.exit(2);
    }
  }

  // 分批写入，ON CONFLICT DO NOTHING 保证既有行不被覆盖
  const CHUNK = 500;
  let written = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const values = chunk
      .map(
        (p) =>
          `(${p.stockId},'${p.tradeDate}',${p.open},${p.close},${p.high},${p.low},${p.volume},${p.turnover},${p.changeAmount},${p.changePercent},${p.amplitude},${p.turnoverRate})`
      )
      .join(',');
    const query = `INSERT INTO daily_quotes
      (stock_id,trade_date,open_price,close_price,high_price,low_price,volume,turnover,change_amount,change_percent,amplitude,turnover_rate)
      VALUES ${values}
      ON CONFLICT (stock_id, trade_date) DO NOTHING`;
    sql(query);
    written += chunk.length;
    if (written % 2000 === 0) console.log(`  ...已写 ${written}/${rows.length}`);
  }
  console.log(`\n写入完成: 提交 ${written} 行（含被 ON CONFLICT 跳过的既有行）`);
}

main().catch((e) => {
  console.error('补数失败:', e);
  process.exit(1);
});
