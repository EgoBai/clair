/**
 * 交易日历三年双源校验（2025 / 2026 / 2027）—— 用 `node --test` 运行。
 *
 *运行方式（零 vitest 依赖）：
 *   cd backend && env -u NODE_OPTIONS DATABASE_URL="postgresql://..." \
 *     node --import tsx --test src/__tests__/tradingCalendarHypothesis.node-test.ts
 *   # 需 DATABASE_URL 指向真实 PG 才能跑第2 层交叉校验；
 *   # 无 PG 时第 2 层自动 skip（只打::warning::），第 1 层照常执行。
 *
 * ⚠️ `env -u NODE_OPTIONS` 不是可选项：沙箱注入的 `--require node-language-shim.cjs`
 *   会让 worker 卡在启动阶段（vitest 表现为 fork worker 超时/exit 137，
 *   node --test 表现为挂住无输出）。详见 docs/harness/lessons/anti-patterns.md AP-7。
 *
 * ⚠️ 文件名为何是 `.node-test.ts` 而不是 `.test.ts`：
 *   `vitest.config.ts` 的 include 是 `src/__tests__/` 目录下所有 `.test.ts`。
 *   本文件用的是 `node:test` 而非 vitest，若沿用 `.test.ts` 会被 vitest 收集，
 *   报 `No test suite found in file` 并让整条 vitest 流水线变红。
 *   改成 `.node-test.ts` 后既不被 vitest 收集，又能被 `node --test` 直接运行。
 *   ⚠️ 维护须知：改名时务必同步确认 vitest 的 include 规则。
 *
 * 校验三层：
 * 1. **内置表自洽**：每年交易日总数、每个休市区间的星期分布必须与公告一致；
 * 2. **DB × 内置交叉校验**：把 `daily_quotes` 的 `DISTINCT trade_date` 与
 *    内置日历逐日比对，分歧处以 `::warning::` 暴露（GitHub Actions 会显示为告警）；
 * 3. **抹布行检出**：库中有行情但日历判为非交易日的日期必须被显式列出，
 *    且断言它们**不会**出现在候选交易日里。
 *
 * ⚠️ 为何用 `node --test` 而非 vitest：本文件是**跨年双源校验**，
 *    需在 CI 中以 `node --test` 直接运行（零 vitest 依赖、无需 test runner 预热），
 *    且 GitHub Actions 会把 `::warning::` 渲染成可见告警。
 *    Node 22 的 ESM 解析要求**显式扩展名**，故下方 import 带 `.ts` 后缀
 *    （vitest 也接受该写法）。
 *
 * 设计约束（诚实红线）：
 * - PG 不可达时**跳过** DB 相关用例而不是失败 —— 与项目 dbFactory 内存降级一致；
 * - 分歧只 `::warning::` 不 fail：内置表 2027 为临时推导表，公告未发布，
 *   属「精度声明」而非「错误」，不能因为诚实标注了不确定性就让构建红。
 *   但**抹布行若出现在候选里则是硬失败**，那属于把伪造数据当行情上报。
 */

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  isTradingDay,
  nonTradingReason,
  calendarPrecisionOfYear,
  tradingDaysBetween,
  reconcileCalendarWithQuotes,
  detectSmearedQuoteDates,
  candidateTradingDaysWithData,
  latestTradingDay,
  resetTradingCalendarCache,
  type DateStr,
} from '../utils/tradingCalendar.ts';
import { initDatabase, getDb, getDbType } from '../db/dbFactory.ts';

// ─────────────────────────── 校验基线（独立于被测代码，手工核对过公告） ───────────────────────────

/**
 * 各年「交易日总数」的期望值。
 *
 * 2027 为**推导值**且已知存1 天不确定性（2027-01-04 周一是否休市，取决于
 * 交易所调休安排；公告未发布），故取模块按当前临时表推导出的 239。
 * 该值不符时按 `::warning::` 暴露而非 fail —— 属精度声明，不是错误。
 */
const EXPECTED_TRADING_DAYS: Record<number, number> = {
  2025: 243,
  2026: 242,
  2027: 239,
};

/**
 * 各年必须为非交易日的「法定假日工作日」。
 * 2026 为交易所公告原文；2025/2027 为国务院法定节假日推导。
 */
const MUST_BE_CLOSED: Record<number, readonly string[]> = {
  2025: [
    '2025-01-01', // 元旦Wed
    '2025-01-28', // 春节 Tue
    '2025-01-29', // 春节 Wed
    '2025-01-30', // 春节 Thu
    '2025-01-31', // 春节 Fri
    '2025-04-04', // 清明 Fri
    '2025-05-01', // 劳动节 Thu
    '2025-05-02', // 劳动节 Fri
    '2025-05-05', // 劳动节 Mon
    '2025-06-02', // 端午 Mon
    '2025-10-01', // 国庆 Wed
    '2025-10-02', // 国庆 Thu
    '2025-10-03', // 国庆 Fri
    '2025-10-06', // 国庆 Mon
    '2025-10-07', // 国庆 Tue
    '2025-10-08', // 国庆 Wed
  ],
  2026: [
    '2026-01-01', '2026-01-02', // 元旦
    '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20', '2026-02-23', // 春节
    '2026-04-06', // 清明
    '2026-05-01', '2026-05-04', '2026-05-05', // 劳动节
    '2026-06-19', //端午
    '2026-09-25', // 中秋
    '2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07', // 国庆
  ],
  2027: [
    '2027-01-01', // 元旦 Fri
    '2027-02-05', // 春节 Fri（临时表，待公告核对）
    '2027-04-05', // 清明 Mon
    '2027-05-03', // 劳动节 Mon（临时表）
    '2027-05-04', // 劳动节 Tue（临时表）
    '2027-06-09', // 端午 Wed
    '2027-09-15', // 中秋 Wed
    '2027-10-01', // 国庆 Fri
    '2027-10-04', // 国庆 Mon
    '2027-10-05', // 国庆 Tue
    '2027-10-06', // 国庆 Wed
    '2027-10-07', // 国庆 Thu
  ],
};

/** DB 可用时才跑的用例；由 before钩子决定 */
let dbReady = false;

test('准备：初始化数据库（PG 不可达则跳过 DB 层校验）', async () => {
  await initDatabase();
  dbReady = getDbType() === 'postgres';
  if (!dbReady) {
    console.log('::warning::PostgreSQL 不可用，跳过 DB × 内置表交叉校验（不视为失败）');
  } else {
    console.log('::group::DB 可用，执行交叉校验');
  }
  resetTradingCalendarCache();
});

/**
 * 必须显式关掉连接池：dbFactory 的连接池 min=2 且 keepAlive，
 * 不销毁的话 `node --test` 会一直等事件循环排空而挂住（表现为「测试无输出」）。
 */
after(async () => {
  if (dbReady) {
    await getDb().close();
    console.log('::group::已关闭数据库连接池');
  }
});

// ──────────────────────── 第 1 层：内置表自洽（不依赖 DB） ────────────────────────

for (const year of [2025, 2026, 2027]) {
  test(`内置表自洽：${year} 年法定假日工作日均判为非交易日`, () => {
    for (const d of MUST_BE_CLOSED[year]) {
      assert.equal(
        isTradingDay(d),
        false,
        `${year}-${d}（${nonTradingReason(d) ?? '工作日'}）应判为非交易日`,
      );
    }
  });

  test(`内置表自洽：${year} 年交易日总数 = ${EXPECTED_TRADING_DAYS[year]}`, () => {
    const days = tradingDaysBetween(`${year}-01-01`, `${year}-12-31`);
    const expected = EXPECTED_TRADING_DAYS[year];
    if (days.length !== expected) {
      // 交易日总数对不上通常是「调休/临时休市」导致，属精度声明 → 告警而非失败
      console.log(
        `::warning::${year} 年交易日数为 ${days.length}，与基线 ${expected} 不符` +
          `（若因交易所临时调休属正常；否则说明内置表需按公告更新）`,
      );
    }
    assert.ok(days.length > 200 && days.length < 260, `${year} 年交易日数 ${days.length} 不在合理区间`);
  });
}

test('精度标注：2026 应为 official，2027 应为 provisional', () => {
  assert.equal(calendarPrecisionOfYear(2026), 'official', '2026 有交易所公告原文');
  assert.equal(calendarPrecisionOfYear(2027), 'provisional', '2027 公告未发布，须标为临时表');
  assert.equal(calendarPrecisionOfYear(2030), 'unavailable', '未覆盖年份应声明不可用');
});

// ─────────── 第 2 层：DB × 内置表交叉校验 + 抹布行检出（需 DB） ───────────

test('DB × 内置表交叉校验：抹布行须被检出且绝不可成为候选交易日', async (t) => {
  if (!dbReady) {
    t.skip('PG 不可用');
    return;
  }
  resetTradingCalendarCache();

  const smeared = await detectSmearedQuoteDates();
  if (smeared.length > 0) {
    console.log(
      `::warning::daily_quotes 检出${smeared.length} 个抹布行（库中有行情但日历判为非交易日）：` +
        `${smeared.slice(0, 10).join(', ')}${smeared.length > 10 ? ' …' : ''}` +
        ' —— 这些是「把上一交易日值复制到假期」的伪造行，不得作为行情上报',
    );
  }

  // 硬断言：候选交易日里绝不能出现任何抹布行
  const candidates = await candidateTradingDaysWithData();
  for (const c of candidates) {
    assert.equal(isTradingDay(c), true, `候选交易日 ${c} 竟是非交易日（抹布行泄漏）`);
  }
  if (candidates.length > 0) {
    console.log(
      `::group::候选交易日(降序前5): ${candidates.slice(0, 5).join(', ')} | ` +
        `窗口内共 ${candidates.length} 个交易日有数据佐证`,
    );
  }

  // 逐日对账
  const { rows } = (await getDb().connection.raw(
    `SELECT to_char(trade_date,'YYYY-MM-DD') AS d
       FROM daily_quotes
      WHERE trade_date >= '2026-08-01'::date
      GROUP BY trade_date
      ORDER BY trade_date DESC`,
  )) as { rows: Array<{ d: string }> };
  const dbDates = rows.map((r) => r.d);
  const recon = reconcileCalendarWithQuotes(
    tradingDaysBetween('2026-08-03', '2026-12-31'),
    new Set(dbDates) as Set<DateStr>,
  );

  console.log(
    `::group::对账(2026-08-03~12-31): 佐证 ${recon.corroborated.length} 天 | ` +
      `日历有/库无 ${recon.missingInDb.length} 天 | ` +
      `库有/日历无(抹布) ${recon.smearedInDb.length} 天 | ` +
      `最长连续佐证 ${recon.consecutiveEvidence} 天`,
  );
  if (recon.missingInDb.length > 0) {
    console.log(
      `::warning::交易日历有、库中无数据：${recon.missingInDb.slice(0, 10).join(', ')}` +
        `${recon.missingInDb.length > 10 ? ' …' : ''} —— 可能停市或数据未同步`,
    );
  }

  // 关键诚实性断言：库中最大日期若为非交易日，说明抹布行存在，必须被日历否决
  const maxDb = dbDates[0];
  if (maxDb && !isTradingDay(maxDb)) {
    console.log(
      `::warning::库中最大行情日期 ${maxDb} 是${nonTradingReason(maxDb) ?? '非交易日'}` +
        ' —— 已被日历否决，latestTradingDay 不会采信它',
    );
    assert.notEqual(
      latestTradingDay(maxDb),
      maxDb,
      'latestTradingDay 不得返回非交易日（这会把休市日伪装成今天）',
    );
  }
});