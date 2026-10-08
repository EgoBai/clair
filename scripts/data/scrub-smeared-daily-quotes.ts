#!/usr/bin/env node
/**
 * 清洗 daily_quotes 表里的「假期抹布行」（P0-SMEARED）
 *
 * ## 什么是抹布行（smeared row）
 * `daily_quotes.trade_date` 上出现了**非交易日**（周末 / 交易所公告休市日）的行情行。
 * 实测特征（2026 国庆）：10-04/05/06/07 四天各 5541 行，且**四天的 OHLCV 完全相同**——
 * 它们不是「那天的行情」，而是同一批真实数据被复制到了随后的日历日。
 *
 * ## 危害（为什么这是数据源层面的红线）
 * 任何不经过 `resolveQueryDate()`、直接 `MAX(trade_date)` 取数的端点，
 * 都会把10-06 这种法定休市日当成「今天的真实行情」上报。
 * 端点接入越多，暴露面越大—— 故必须在**数据源层**清掉，而不只是让端点各自 if。
 *
 * ## 判定权威：交易日历，不是 PG
 * 判定唯一真源是 `backend/src/utils/tradingCalendar.ts` 的 `isTradingDay()`
 * （交易所公告休市表 + 周末规则）。本脚本**不复制**任何一份日历逻辑，也不改动它——
 * 复制日历必然随交易所公告更新而失效，且两处漂移会制造新的误判。
 * 绝不能反过来「用 PG 里有哪些日期反推哪天是交易日」——
 * 那正是抹布行能长期潜伏的机制本身（tradingCalendar.ts 文件头有实测反例）。
 *
 * ## 幂等性
 * 重复跑不会误删：
 * 1. 只删「非交易日」的行 → 跑第二遍时这些行已不存在，删 0 行；
 * 2. 不依赖任何「上一次状态」，无计数器、无偏移；
 * 3. 🔒 **白名单硬约束**：裁决保护的 5 个日期在所有分支之后统一收口，
 *    任何路径（含 `--force-unique`）都删不到它们，除非显式
 *    `--override-leadership-decision`。
 *
 * ## 三层防线（从硬到软）
 * 1. 🔒 **白名单**（`PROTECTED_DATES`）：主理人裁决，硬约束，优先级最高。
 *    - **保留原因**：这些日期的**真身尚未补齐**。载体日虽然本身确属抹布行
 *      （都是周末，`isTradingDay=false`，值=前一真实交易日收盘盖上来），
 *      但其载荷对应的**真实交易日**在库中残缺，载体日目前是那几天行情的
 *      唯一完整记录：
 *        ```
 *载体日      真身       真身行数   载体日载荷真为
 *        2026-05-30  05-29      10★严重缺失   05-29 收盘
 *        2026-06-06  06-05      114        06-05 收盘
 *        2026-07-11  07-10      0          完全缺失   07-10 收盘
 *        2026-09-06  09-04      0          完全缺失   09-04 收盘
 *        2026-10-04  09-30      5185       ✓ 已由 backfill-kline 补齐
 *        ```
 *    - **解封条件**：真身补齐并**逐行覆盖**载体日的每一条标的之后，
 *      才能删除载体日。**当前只有 `2026-10-04` 满足真身已补齐**，
 *      但仍需先转正 358 行缺失标的。
 * 2. 载荷指纹分组：**算出来的量，仅作分类工具，不承载保留语义**。
 *    ⚠️ 不要再用「载荷唯一」当作保留理由 —— 该理由已于 2026-10-09 被证伪
 *    （见下方「本裁决已被复验推翻」小节）。
 * 3. `--apply` 强制要求 `--backup` 指向已存在的备份文件。
 *
 * 之所以要有第 1 层：**保留是裁决（不可变量），指纹是算出来的变量**。
 * 且裁决的解封条件必须显式可判定，不能靠「指纹恰好不同」这种间接推断。
 *
 * ## 关键教训：不是所有抹布行都能直接删（P0-SMEARED 实测）
 * 抹布行的本质是「同一批数据被复制到多个日历日」，但**并非每个抹布日都是冗余的**。
 * 实测（2026 国庆）指纹分类：
 * - `10-05/06/07` 的载荷与 `10-04` **完全相同** → 纯复制，删掉不丢数据；
 * - 而 `10-04` 的载荷与库里任何其他日期都不同 —— 它是**真实 2026-09-30 收盘**
 *   （腾讯 K 线交叉验证 38 只样本全中；600519 收 1258.62 = 真实 09-30）。
 *   原因：采集器在 09-28~09-30 停机，09-30 的真实数据没被写进 09-30，
 *   却在 10-04 补采时被 `tradeDate: new Date()` 挂到了 10-04 上。
 *
 * 若无差别删除 10-04，就等于**删掉了全库唯一的 09-30 真实行情**。
 * 故本脚本对「载荷唯一」的抹布日默认**只报告不删**，需显式 `--force-unique`。
 *
 * ## 🔒 主理人裁决：5 个日期「保留，不删」
 * 下列日期**明知是非交易日、却必须保留**，禁止「顺手清理」：
 *
 * | 日期 | 载荷实为 | 行数 |
 * |---|---|---|
 * | 2026-05-30 | 唯一载体（另含指数串位，见下） | 109 |
 * | 2026-06-06 | 唯一载体（另含指数串位，见下） | 109 |
 * | 2026-07-11 | 真实 2026-07-10 收盘 | 5,541 |
 * | 2026-09-06 | 真实 2026-09-04 收盘 | 5,541 |
 * | 2026-10-04 | 真实 2026-09-30 收盘 | 5,541 |
 *
 * 裁决理由（team-lead）：
 * 1. 删的代价**不可逆**（丢真实行情），留的代价只是「非交易日行仍在库」；
 * 2. 项目当前核心矛盾是**缺数据**，不是「多几行脏数据」，为清理而丢真实行情是本末倒置；
 * 3. 它们仍是非交易日，端点若直接 `MAX(trade_date)` 可能命中 —— 但这**应靠
 *    `resolveQueryDate()` 的交易日校验解决，不是靠删数据解决**；
 * 4. 待补数把它们转正到正确日期后，用 `--override-leadership-decision` 清理。
 *
 * 计划：先重跑 K 线同步补齐 09-28/29/30 等缺口，再清理。
 *
 * 另注：`2026-05-30` / `2026-06-06` 那 109 行内含**指数串位**
 * （`000001 平安银行` 收 4068.57 实为沪深300 指数点位，指数被写进了个股行）。
 * 这是与抹布行**不同的另一个缺陷**，已另立一票（P0-IDXBLEED），本脚本未覆盖其根因。
 *
 * ⚠️ **本裁决已被复验推翻，勿再据此保留载体日**（2026-10-09 修正）
 *
 * `fix-qfq-caliber` 指出本节原话「其余 105 / 59 行全部与真实交易日收盘一致」
 * 表述有误，我复核确认**他对**：`2026-05-30` / `2026-06-06` 都是周六，
 * `isTradingDay()` 返回 false —— **当天根本不是交易日**，
 * 不存在「与真实交易日收盘一致」这回事。实测 `000002`：
 * 上游 `05-29`(真实交易日) C=3.55 = 库内 `05-30`(周六) C=3.55。
 * ⟹ 载体日的值 = **前一真实交易日收盘价盖到非交易日**，
 * 它们和其余 99% 的抹布行（`open>0` 那种）**性质完全相同**，
 * 只是因为恰好落在`05-30/06-06` 这两个只有 109 行的小日子上，才被我的指纹机制误判为「唯一载体」。
 *
 * 原裁决「保留载体日」的**真正依据**其实只有一条：
 * 删除会不会**永久丢失别处没有的真实数据**。逐日实测（补数已落库后）：
 * ```
 * 载体日    载荷实为真实日   真实日行数   该标的是否在真实日也���   删了会永久丢
 * 2026-05-30  05-29         10           104/109 在库中不存在    ★ 会丢 104 行
 * 2026-06-06  06-05         114          0（108/109 同值）     ○ 不会丢
 * 2026-07-11  07-10         0（仍缺失）  5541 全部不存在        ★★ 会丢 5541 行
 * 2026-09-06  09-04         0（仍缺失）  5541 全部不存在        ★★ 会丢 5541 行
 * 2026-10-04  09-30         5185         358 缺失/5183 同值     ★ 会丢 358 行
 * ```
 * ⟹ **正确处置不是「全保」也不是「全删」**，而是：
 * ①这些日期本身确属抹布行（`isTradingDay=false`），数据放在这里就是错的；
 * ② 但其中承载的真实日数据必须**先转正回真实日期**，再删载体日；
 * ③ 当前 `2026-07-10` / `2026-09-04` 仍未补数 → 这两天是**唯一副本**，
 *    **在补数完成前绝不能删**，否则永久丢失 11082 行真实行情。
 *
 * **本裁决的前提已随补数落库而变化**：当初保留是因为 09-28/29/30 全库缺失；
 * 现 `backfill-kline` 已补齐 09-28/29/30，故 `2026-10-04` 的保留理由已不成立。
 * ⟹ **白名单不应再无条件保护**，应改为「真实日已补齐 ⇒ 可删；未补齐 ⇒ 保留」。
 * ⚠️ 该条件化逻辑**尚未实现**（属team-lead待裁决项），在此之前白名单仍是无条件保护，
 * 也就是说 `2026-06-06` / `2026-10-04` 现在技术上可删，但仍会被白名单拦住 —— 这是**故意的**，
 * 避免在裁决未更新前被误删。
 *
 * ## 用法
 * ```bash
 * # 干跑（默认）：只报告要删什么，不动数据
 * npx tsx scripts/data/scrub-smeared-daily-quotes.ts
 *
 * # 真正删除（必须带--backup 指向已存在的备份文件）
 * npx tsx scripts/data/scrub-smeared-daily-quotes.ts \
 *   --apply --backup=/tmp/clair-backups/clair-before-scrub.sql
 *
 * # 只看某段时间
 * npx tsx scripts/data/scrub-smeared-daily-quotes.ts --from=2026-10-01 --to=2026-10-09
 *
 * # 连「载荷唯一」的抹布日一并删（白名单仍受保护）
 * npx tsx scripts/data/scrub-smeared-daily-quotes.ts --apply --force-unique \
 *   --backup=/tmp/clair-backups/clair-before-scrub.sql
 *
 * # ⚠️⚠️ 连裁决保护的 5 个载体日也删（推翻主理人裁决，仅在明确授权时用）
 * npx tsx scripts/data/scrub-smeared-daily-quotes.ts --apply --override-leadership-decision \
 *   --backup=/tmp/clair-backups/clair-before-scrub.sql
 * ```
 *
 * ## 诚实边界：为什么默认不删日历未覆盖的年份
 * `calendarPrecisionOfYear()` 对内置表以外的年份返回 `'unavailable'`，
 * 此时 `isTradingDay()` 退化为「仅周末规则」——只能排除周末，**无法确证**节假日。
 * 若照样删，就可能删掉那些年份的真实节假日数据。故默认跳过并显式列出，
 * 需人工确认后加 `--all-years`。
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// ─────────────────────────── CLI 参数解析 ───────────────────────────

const argv = process.argv.slice(2);
const flag = (name: string): boolean => argv.includes(`--${name}`);
const opt = (name: string): string | undefined => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};

const APPLY = flag('apply');
const ALL_YEARS = flag('all-years');
/** 连「载荷唯一」的抹布日也删（⚠️ 会丢失其承载的真实交易日数据） */
const FORCE_UNIQUE = flag('force-unique');
/**
 * 显式覆盖「保留载体日」裁决（⚠️⚠️ 极危险，仅供主理人推翻自己裁决时使用）
 *
 * 存在理由：白名单是**人的裁决**，而载荷指纹是**算出来的变量**。
 * 若补数改变了某载体日的载荷、使其指纹与其他日期重复，旧的「载荷唯一才保留」
 * 机制就会把它当纯复制行删掉——用变量保障不可变量本身是脆弱的。
 */
const OVERRIDE_DECISION = flag('override-leadership-decision');

/**
 * ## 🔒 白名单：主理人裁决「永不删除」的日期（硬约束）
 *
 * 这些日期**无论载荷指纹如何变化、无论是否出现新的重复载荷，一律不删**。
 *
 * ## 为什么必须是显式白名单，而不是「载荷唯一才保留」
 * 「保留载体日」是**人的裁决**（不可变量），而载荷指纹是**算出来的变量**。
 * 用变量保障不可变量是脆弱的：补数覆盖了载体日内某些行后，其指纹可能变得
 * 与其他日期重复，旧的「载荷唯一才保留」机制就会把它当纯复制行删掉——
 * **裁决会被一个算出来的量推翻**。
 *
 * 叠加 P0-IDXBLEED 后这个风险更现实：载体日同时又是「含坏数据的可疑日」，
 * 补数时极易顺手整日删除，那会连带丢掉承载的真实行情。
 *
 * ⚠️ **本白名单的已知局限（2026-10-09 复验）**：
 * `fix-qfq-caliber` 已证明这些日期**确属抹布行**（都是周六/周日，
 * `isTradingDay=false`，值=前一真实交易日收盘盖到非交易日上）。
 * 白名单只是「防止误删真实数据」的**保守兜底**，**不代表它们是干净数据**。
 * 详见下方「本裁决已被复验推翻」小节的逐日实测表。
 *
 * 依据：team-lead裁决（commit c56ad2b0b 收口、320e6b080 批准加固）。
 * 若要推翻这条裁决，必须显式传 `--override-leadership-decision`，
 * 且脚本会打出二次警告——**绕过裁决应当是刻意行为，而非默认行为**。
 */
const PROTECTED_DATES: ReadonlySet<string> = new Set([
  '2026-05-30',
  '2026-06-06',
  '2026-07-11',
  '2026-09-06',
  '2026-10-04',
]);
const FROM = opt('from');
const TO = opt('to');
const BACKUP = opt('backup');
/** psql 连接目标；默认走本机 socket + clair 库 */
const DB_URL = opt('db') ?? process.env.DATABASE_URL ?? 'clair';
const PSQL = process.env.PSQL_BIN ?? '/opt/homebrew/opt/postgresql@15/bin/psql';

// ─────────────────────────── psql 小工具 ───────────────────────────

/** 跑一条 SQL，返回按行切分的字符串数组 */
function sql(query: string): string[][] {
  const out = execFileSync(PSQL, ['-d', DB_URL, '-t', '-A', '-F', '|', '-c', query], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => l.split('|'));
}

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

const DOW_CN = ['日', '一', '二', '三', '四', '五', '六'];
const weekdayCn = (date: string) => DOW_CN[new Date(`${date}T00:00:00Z`).getUTCDay()];

// ─────────────────────────── 主流程 ───────────────────────────

async function main(): Promise<void> {
  // 交易日历是唯一判定真源。这里只静态引用其**纯日历函数**；
  // 该模块虽import 了 dbFactory，但 dbFactory 仅在 initDatabase() 时才连库，
  // import 期无副作用，故不会在此触发任何数据库访问。
  const CALENDAR_MODULE = resolve(process.cwd(), 'backend/src/utils/tradingCalendar.ts');
  if (!existsSync(CALENDAR_MODULE)) {
    console.error(`✗ 找不到交易日历模块：${CALENDAR_MODULE}`);
    console.error('  请在仓库根目录运行本脚本。');
    process.exit(2);
  }

  const calendarMod = (await import(CALENDAR_MODULE)) as {
    isTradingDay: (d: string) => boolean;
    nonTradingReason: (d: string) => string | null;
    calendarPrecisionOfYear: (y: number) => 'official' | 'provisional' | 'unavailable';
  };
  const { isTradingDay, nonTradingReason, calendarPrecisionOfYear } = calendarMod;

  console.log('━━━ P0-SMEARED · daily_quotes 假期抹布行清洗 ━━━\n');
  console.log(`数据库    : ${DB_URL}`);
  console.log(
    `日历真源  : backend/src/utils/tradingCalendar.ts（${calendarPrecisionOfYear(
      new Date().getUTCFullYear(),
    )} 精度）`,
  );
  console.log(`模式      : ${APPLY ? '⚠️  --apply（将真的删除数据）' : '干跑 dry-run（不动数据）'}\n`);

  // ── 1. 摸清现状 ──
  let candidates = sql(
    `SELECT to_char(trade_date,'YYYY-MM-DD'), count(*)::text
       FROM daily_quotes GROUP BY trade_date ORDER BY trade_date`,
  );

  if (candidates.length === 0) {
    console.log('✓ daily_quotes 为空，无需清洗。');
    return;
  }

  if (FROM || TO) {
    candidates = candidates.filter(([d]) => (!FROM || d >= FROM) && (!TO || d <= TO));
    console.log(`区间过滤: ${FROM ?? '(不限)'} ~ ${TO ?? '(不限)'} → ${candidates.length} 个日期\n`);
  }

  // ── 2. 判定抹布行 ──
  interface SmearedDate {
    date: string;
    rows: string;
    reason: string;
    precision: 'official' | 'provisional' | 'unavailable';
  }

  const smeared: SmearedDate[] = [];
  const skippedUnverified: Array<{ date: string; rows: string }> = [];

  for (const [date, rows] of candidates) {
    if (isTradingDay(date)) continue;
    const precision = calendarPrecisionOfYear(Number(date.slice(0, 4)));
    const reason = nonTradingReason(date) ?? '非交易日';

    // 精度不可信的年份默认不删：此时「非交易日」仅排除了周末，
    // 法定节假日无从确证，删了可能误伤真实数据。见文件头「诚实边界」。
    if (precision === 'unavailable' && !ALL_YEARS) {
      skippedUnverified.push({ date, rows });
      continue;
    }
    smeared.push({ date, rows, reason, precision });
  }

  if (smeared.length === 0) {
    console.log('✓ 未发现抹布行（非交易日行情），无需清洗。');
    return;
  }

  const totalRows = smeared.reduce((n, s) => n + Number(s.rows), 0);
  console.log(`发现抹布行：${smeared.length} 个非交易日，共 ${totalRows.toLocaleString('en-US')} 行\n`);

  console.log('日期        星期  原因     精度        行数');
  console.log('─'.repeat(62));
  for (const s of smeared) {
    console.log(
      `${s.date}  周${weekdayCn(s.date)}  ${s.reason.padEnd(6)}  ${s.precision.padEnd(10)}  ${Number(
        s.rows,
      ).toLocaleString('en-US')}`,
    );
  }
  console.log('');

  if (skippedUnverified.length > 0) {
    const rows = skippedUnverified.reduce((n, s) => n + Number(s.rows), 0);
    console.log(
      `⚠️ 另有 ${skippedUnverified.length} 个非交易日落在「日历未覆盖」的年份` +
        `（共 ${rows.toLocaleString('en-US')} 行），判定精度仅「周末规则」，无法确证 → 默认不删。`,
    );
    console.log(`   例：${skippedUnverified.slice(0, 8).map((s) => s.date).join(', ')}`);
    console.log('   如确认要清，加 --all-years（请自行承担该年节假日误判风险）。\n');
  }

  // ── 3. 安全守卫：按「载荷指纹」区分纯复制行与唯一载体行 ──
  const fpRows = sql(
    `SELECT to_char(trade_date,'YYYY-MM-DD'),
            md5(string_agg(stock_id||':'||close_price||':'||volume||':'||open_price, ',' ORDER BY stock_id))
       FROM daily_quotes GROUP BY trade_date`,
  );
  /** 日期 → 载荷指纹。指纹相同 = 那天的行情数值完全是同一批。 */
  const fingerprint = new Map(fpRows.map(([d, f]) => [d, f]));
  const smearedDates = new Set(smeared.map((s) => s.date));

  /**
   * 把抹布日按载荷指纹分组，逐组判断「删掉会不会丢数据」。
   *
   * 关键陷阱：**不能只看「有没有同指纹的别的日期」**。10-04~10-07 四天指纹相同，
   * 若逐日判断「有孪生日→可删」，会把这四天**全部**删掉，而它们承载的真实
   * 09-30 行情就彻底没了。故必须按组判断，并以「交易日是否也持有该指纹」为准：
   * - 交易日也持有该指纹 → 整组都是纯复制，全删不丢信息；
   * - 无交易日持有 → 该组是唯一载体，**保留最早一天**（真实数据就挂在它上面），
   *   只删组内其余重复日，并如实报告被保留的那天。
   */
  const deletable: typeof smeared = [];
  const uniqueCarrier: typeof smeared = [];
  const groups = new Map<string, typeof smeared>();
  for (const s of smeared) {
    const f = fingerprint.get(s.date) ?? '';
    const g = groups.get(f);
    if (g) g.push(s);
    else groups.set(f, [s]);
  }
  for (const [, group] of groups) {
    const heldByTradingDay = fpRows.some(
      ([d, f]) => f === fingerprint.get(group[0].date) && !smearedDates.has(d),
    );
    if (heldByTradingDay) {
      deletable.push(...group);
      continue;
    }
    const sorted = [...group].sort((a, b) => a.date.localeCompare(b.date));
    uniqueCarrier.push(sorted[0]);
    deletable.push(...sorted.slice(1));
  }

  if (uniqueCarrier.length > 0) {
    console.log(`─── 安全守卫：${uniqueCarrier.length} 个抹布日的载荷在库中独一无二 ───`);
    console.log('这些行不是冗余复制，而是**当前唯一**承载某个真实交易日数据的载体');
    console.log('（同组的重复日可删，但这一天的数据删掉就永久没了）。\n');
    console.log('保留       星期  原因     行数      说明');
    console.log('─'.repeat(66));
    for (const s of uniqueCarrier) {
      console.log(
        `${s.date}  周${weekdayCn(s.date)}  ${s.reason.padEnd(6)}  ${Number(s.rows).toLocaleString('en-US').padStart(9)}  同组重复日已单列删除`,
      );
    }
    console.log(
      '\n实测例证：2026-10-04 的载荷 = 真实 2026-09-30 收盘（腾讯 K 线交叉验证通过）——',
    );
    console.log('采集器在 09-28~09-30 停机，真实数据被挂到了 10-04。');
    if (!FORCE_UNIQUE) {
      console.log('\n以上唯一载体日同时也在 🔒 白名单中（主理人裁决，见下节），双重保护。');
      console.log('计划：先重跑 K 线同步补齐缺口、把数据转正到正确日期，再考虑清理。\n');
    }
  }

  const deleteCandidates = FORCE_UNIQUE ? smeared : deletable;

  // ── 🔒 白名单硬约束：裁决保护的日期一律不删，且在所有分支之后统一收口 ──
  // 放在最后是刻意的：无论前面走了「载荷唯一」「--force-unique」还是
  // 「交易日也持有该指纹」哪条路径，白名单都不可被绕过。
  const whitelistKept = deleteCandidates.filter((s) => PROTECTED_DATES.has(s.date));
  const toDelete = OVERRIDE_DECISION
    ? deleteCandidates
    : deleteCandidates.filter((s) => !PROTECTED_DATES.has(s.date));

  // 白名单里「库中已不存在」的日期也要报出来：说明它已被别的清洗删过，属异常
  const absentFromDb = [...PROTECTED_DATES].filter(
    (d) => !smeared.some((s) => s.date === d),
  );

  console.log('━━━ 🔒 白名单：主理人裁决「永不删除」 ━━━');
  console.log('以下日期无论指纹如何变化、无论是否出现新的重复载荷，一律不删：\n');
  console.log('日期          星期  库内行数   状态');
  console.log('─'.repeat(58));
  for (const d of [...PROTECTED_DATES].sort()) {
    const hit = smeared.find((s) => s.date === d);
    const dow = weekdayCn(d);
    if (hit) {
      console.log(
        `${d}  周${dow}  ${Number(hit.rows).toLocaleString('en-US').padStart(9)}   在库· 本次受保护${
          whitelistKept.some((k) => k.date === d) ? '（原会被列入删除，已拦截）' : ''
        }`,
      );
    } else {
      console.log(`${d}  周${dow}  ${'—'.padStart(9)}   ⚠️ 库中已无此日（应保留，请核查是否被误删）`);
    }
  }
  if (absentFromDb.length > 0) {
    console.log(`\n⚠️ 白名单中有 ${absentFromDb.length} 天在库中已不存在：${absentFromDb.join(', ')}`);
    console.log('   这说明它们可能已被其它清洗删除——若非有意，请从备份恢复。');
  }
  if (OVERRIDE_DECISION) {
    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║ ⚠️⚠️  已启用 --override-leadership-decision                ║');
    console.log('║ 本次将**无视白名单**，连裁决保护的载体日也一并删除。      ║');
    console.log('║ 这会永久丢失真实交易日数据，且不可逆。                    ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
  }
  console.log('');

  if (toDelete.length === 0) {
    console.log('✓ 本次无可删除的日期（白名单之外的纯复制行已全部清完）。');
    return;
  }

  const dateList = toDelete.map((s) => q(s.date)).join(',');
  const deleteRows = toDelete.reduce((n, s) => n + Number(s.rows), 0);

  // ── 4. 干跑 / 执行 ──
  if (!APPLY) {
    console.log('─── 干跑结果（未删除任何数据）───');
    console.log('若加 --apply，将执行：');
    console.log(`  DELETE FROM daily_quotes WHERE trade_date IN (${dateList});`);
    console.log(`  影响行数：${deleteRows.toLocaleString('en-US')}\n`);
    report({ beforeRows: 0, smeared: toDelete, dateList, since: FROM ?? '2026-09-01', isTradingDay });
    return;
  }

  console.log('─── 执行删除 ───');
  if (!BACKUP) {
    console.error('✗ 未提供 --backup=<路径>，拒绝删除。');
    console.error('  请先备份：/opt/homebrew/opt/postgresql@15/bin/pg_dump -d clair -f /tmp/clair-before-scrub.sql');
    process.exit(4);
  }
  if (!existsSync(BACKUP)) {
    console.error(`✗ 指定的备份文件不存在：${BACKUP}`);
    process.exit(4);
  }
  console.log(`✓ 备份已确认存在：${BACKUP}`);

  execFileSync(
    PSQL,
    ['-d', DB_URL, '-v', 'ON_ERROR_STOP=1', '-c', `DELETE FROM daily_quotes WHERE trade_date IN (${dateList});`],
    { stdio: 'inherit' },
  );

  console.log('');
  report({ beforeRows: deleteRows, smeared: toDelete, dateList, since: FROM ?? '2026-09-01', isTradingDay });
}

/**
 * 清洗后校验：抹布行是否清零 + 真实交易日数据是否未受影响。
 */
function report(ctx: {
  beforeRows: number;
  smeared: Array<{ date: string; rows: string }>;
  dateList: string;
  since: string;
  isTradingDay: (d: string) => boolean;
}): void {
  const { beforeRows, smeared, dateList, since, isTradingDay } = ctx;
  const remainRows = Number(sql(`SELECT count(*)::text FROM daily_quotes WHERE trade_date IN (${dateList});`)[0][0]);

  console.log('─── 校验 ───');
  if (beforeRows > 0) console.log(`已删除 ${beforeRows.toLocaleString('en-US')} 行`);
  console.log(
    `抹布行残留（${smeared.length} 个目标日期上的行数）: ${remainRows} ${
      remainRows === 0 ? '✓ 已清零' : '✗ 未清零'
    }`,
  );
  console.log('');

  const recent = sql(
    `SELECT to_char(trade_date,'YYYY-MM-DD'), count(*)::text
       FROM daily_quotes WHERE trade_date >= ${q(since)}
      GROUP BY trade_date ORDER BY trade_date`,
  );

  console.log(`${since} 之后的日期行数（交易日=真实数据应保留；非交易日=抹布行应清零）：`);
  console.log('日期          星期  交易日?  行数');
  console.log('─'.repeat(52));
  for (const [date, rows] of recent) {
    const td = isTradingDay(date);
    console.log(
      `${date}  周${weekdayCn(date)}  ${td ? '是 ✓  ' : '否 ✗  '}  ${Number(rows).toLocaleString('en-US')}`,
    );
  }
  console.log('');

  const [rows, days, maxDate] = sql(
    `SELECT count(*)::text, count(DISTINCT trade_date)::text, max(trade_date)::text FROM daily_quotes;`,
  )[0];
  console.log(
    `全库：${Number(rows).toLocaleString('en-US')} 行 / ${days} 个日期 / 最大日期 ${maxDate}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
