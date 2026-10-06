/**
 * A 股交易日历 — 交易日判定 + 查询日期解析（P0-5D）
 *
 * ## 解决什么问题
 * 「节假日页面全空」的系统性根因：大量日频端点把「今天」当默认查询日期。
 * 法定长假期间 A 股休市，行情表里根本没有那些日期的��据 → 页面全空。
 * 该问题**每年复发**，必须由基础设施层统一收口，而不是每个端点各自 if。
 *
 * ## 诚实红线（本模块最高优先级约束）
 * 1. **绝不允许**把「最近交易日」伪装成「今天」。回退时必须 `isFallback: true`，
 *    且note 用中文讲清「你看到的其实是哪一天」，让上层能如实告知用户。
 * 2. **交易日历与「库里有数据」是两件事**，不可互相冒充：
 *    - 交易日历回答「市场那天开没开市」→ 由交易所公告的休市安排 + 周末规则判定；
 *    - 数据可用性回答「我们库里那天有没有行情」→ 由 PostgreSQL 判定。
 *    二者交叉校验：PG 里出现的日期**只有落在交易日历上**才被承认。
 *
 * ## 为什么交易日历不直接「反推自 PG」（实测反例，勿轻易推翻）
 * 本地`daily_quotes`（5544 只 / 371 个日期）**包含抹布化的伪造行**，直接
 * `SELECT DISTINCT trade_date ... ORDER BY trade_date DESC LIMIT 1` 会给出
 * **2026-10-06**，而当天是国庆节休市。实测证据：
 *   - 2026-10-04(周日)、10-05(周一·节假日)、10-06(周二·节假日) 各有 5541 行；
 *   - 贵州茅台 600519.SH 在 10-04/05/06 三天的 OHLCV **完全相同**
 *     (1258.62 / 38331) —— 典型「把上一交易日值复制到假期日期」的抹布特征；
 *   - 反向缺失：真实交易日 2026-09-28/29/30 各有 **0 行**。
 * 若以 PG 为唯一权威源，`latestTradingDay('2026-10-06')` 会返回 '2026-10-06'
 * 且 `isFallback: false` —— 等于在法定休市日告诉用户「这是今天的行情」，
 * 正是本模块诚实红线明令禁止的行为。故采用**日历权威 + PG 交叉校验**。
 *
 * @see 内置休市表来源：沪深北交易所 2025-12-22《关于2026年部分节假日休市安排的公告》
 *      （经中国经济网/央广网/中新网多方转载核对一致）
 */

import { getDb, getDbType } from '../db/dbFactory';

/** 市场时区。交易日以**交易所所在地时间**为准，不能用服务器本地时区，更不能用 UTC。 */
export const MARKET_TZ = 'Asia/Shanghai';

/** 标准日期字符串格式 */
type DateStr = string;
/** 调用方可传入的日期形态 */
export type DateInput = Date | string;

/** 休市规则的数据精度来源，供上层如实告知用户 */
export type CalendarSource =
  /** PostgreSQL 可用：交易日历 = 内置交易所公告 + PG 行情数据交叉校验（精度高） */
  | 'pg-cross-checked'
  /** PostgreSQL 不可用：仅用内置交易所公告 + 周末规则推算（精度为公告级） */
  | 'builtin-holiday-table';

interface HolidayRange {
  /** 休市起始日（含） */
  readonly from: DateStr;
  /** 休市结束日（含） */
  readonly to: DateStr;
  /** 节日名，用于生成中文 note */
  readonly name: string;
}

/**
 * 内置 2026 年沪深北交易所休市安排（兜底/权威日历基线）。
 *
 * 依据：沪深北交易所 2025-12-22 公告。范围含区间内的周末日（周末规则本就覆盖，
 * 这里保留完整区间是为了让note 里的节日名准确，也便于未来年份扩展）。
 *
 *⚠️ 维护须知：每年年底须在交易所公告后更新次年安排。缺失年份会退化为
 * 「仅周末规则」，届时note 会自动声明精度来源（诚实红线：不静默假装精确）。
 */
const HOLIDAY_RANGES_2026: readonly HolidayRange[] = [
  { from: '2026-01-01', to: '2026-01-03', name: '元旦' },
  { from: '2026-02-15', to: '2026-02-23', name: '春节' },
  { from: '2026-04-04', to: '2026-04-06', name: '清明节' },
  { from: '2026-05-01', to: '2026-05-05', name: '劳动节' },
  { from: '2026-06-19', to: '2026-06-21', name: '端午节' },
  { from: '2026-09-25', to: '2026-09-27', name: '中秋节' },
  { from: '2026-10-01', to: '2026-10-07', name: '国庆节' },
] as const;

/**
 * 内置 2025 年休市安排 —— 交易所公告原文（2024-12-23 沪深北交易所发布）。
 *
 * 之所以补 2025：本地 `daily_quotes` 覆盖 2025 年，历史数据校验
 * （historicalDataValidator）与「数据截至某日」类查询都会命中该年，
 * 若缺表会把 2025 的法定假日误判为交易日。
 */
const HOLIDAY_RANGES_2025: readonly HolidayRange[] = [
  { from: '2025-01-01', to: '2025-01-01', name: '元旦' },
  { from: '2025-01-28', to: '2025-02-04', name: '春节' },
  { from: '2025-04-04', to: '2025-04-06', name: '清明节' },
  { from: '2025-05-01', to: '2025-05-05', name: '劳动节' },
  { from: '2025-05-31', to: '2025-06-02', name: '端午节' },
  { from: '2025-10-01', to: '2025-10-08', name: '国庆节、中秋节' },
] as const;

/**
 * 内置 2027 年休市安排 —— **临时表（provisional），精度低于 2025/2026**。
 *
 * 截至本模块编写时（2026-10），沪深北交易所**尚未发布 2027 年休市安排**
 * （历年均在头一年 12 月中下旬发布，2026 年安排即2025-12-22 公告）。
 * 因此下表按「国务院公布的 2027 年法定节假日 + A 股惯例」推导，**不是官方公告原文**。
 *
 * 推导依据（法定节假日，来源为国务院办公厅2027 年放假安排公开信息）：
 *   元旦 1/1(五)｜春节 2/5(五)–2/11(四)｜清明 4/5(一)｜劳动节 5/1(六)–5/5(三)
 *   端午 6/9(三)｜中秋 9/15(三)｜国庆 10/1(五)–10/7(四)
 *
 * ⚠️ **已知不确定项**（公告发布后必须逐项核对，此处先按惯例取值）：
 *   - 春节 2027-02-06 为周六，2/5(五) 与 2/11(四) 是否休市取决于调休安排；
 *   - 劳动节 2027-05-01 为周六，5/4(周二) 是否补休取决于官方安排；
 *   - **元旦 2027-01-04(周一) 是否休市存疑**：本表按「1/1–1/3 休市、1/4 上班」取值
 *     （因1/1 是周五、1/2–1/3 为周末）；若官方安排调休，则该日应休市、交易日数
 *     将由 239 变为 238。`tradingCalendarHypothesis.test.ts` 会就此发出
 *     `::warning::`，提示按公告更新。
 *   故 2027 年 isTradingDay() 的返回应视为**近似**，note 会显式声明精度来源。
 *
 * 维护须知：交易所公告发布后，用公告原文替换本表，并把
 * {@link CALENDAR_PRECISION} 中2027 的标注升级为 'official'。
 */
const HOLIDAY_RANGES_2027_PROVISIONAL: readonly HolidayRange[] = [
  { from: '2027-01-01', to: '2027-01-03', name: '元旦' },
  { from: '2027-02-05', to: '2027-02-11', name: '春节' },
  { from: '2027-04-03', to: '2027-04-05', name: '清明节' },
  { from: '2027-04-30', to: '2027-05-05', name: '劳动节' },
  { from: '2027-06-09', to: '2027-06-11', name: '端午节' },
  { from: '2027-09-15', to: '2027-09-17', name: '中秋节' },
  { from: '2027-10-01', to: '2027-10-07', name: '国庆节' },
] as const;

/** 每年内置休市表及其精度等级 */
interface YearCalendar {
  readonly ranges: readonly HolidayRange[];
  /**
   * `'official'`= 交易所公告原文（2026）
   * `'provisional'` = 法定节假日推导，交易所公告未发布（2027）
   * `null` = 该年无内置表，退化为「仅周末规则」
   */
  readonly precision: 'official' | 'provisional' | null;
}

/** 内置日历表总表。未列出的年份 → 精度为 null（仅周末规则） */
const BUILTIN_CALENDARS: Readonly<Record<number, YearCalendar>> = {
  2025: { ranges: HOLIDAY_RANGES_2025, precision: 'official' },
  2026: { ranges: HOLIDAY_RANGES_2026, precision: 'official' },
  2027: { ranges: HOLIDAY_RANGES_2027_PROVISIONAL, precision: 'provisional' },
};

/**
 * 取某年内置日历的精度等级。
 * @returns `'official'` / `'provisional'` / `'unavailable'`（无内置表）
 */
export function calendarPrecisionOfYear(year: number): 'official' | 'provisional' | 'unavailable' {
  return BUILTIN_CALENDARS[year]?.precision ?? 'unavailable';
}

/** PG 行情日期缓存有效期：交易日集合变化极慢，10 分钟足够，避免端点高频打库。 */
const PG_CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * 候选交易日回退窗口上限（单位：**交易日**，非日历日）。
 *
 * 取20 的依据：
 * - A 股最长法定长假为 9 个连续休市日（国庆 10/1–10/7 含调休，2027 年可能更长），
 *   折算「须跳过的交易日」约 6–8 个；
 * - 数据滞后（如节后未同步）会额外拉长窗口；
 * - 主理人要求「≥ 2× 最长法定长假」以避免长假期间 `isFallback`频繁误报，
 *   而误报会让上层不再信任该标志、进而失去诚实约束能力。
 *
 * 代价：窗口越大，越可能回退到「更早但确有数据」的日期。这是**刻意选择**——
 * 宁可让用户看到稍旧但真实的数据，也不展示当天并不存在的行情。
 */
const CANDIDATE_LOOKBACK_TRADING_DAYS = 20;

/** 单次向 PG 拉取的近期行情日期个数（须 ≥ 窗口跨度 + 长假冗余，故取 60 天） */
const PG_FETCH_LIMIT = 60;

/**
 * 自适应降级所需的最少「连续交易日证据」条数。
 *
 * 当日历判定为交易日、但库中无该日数据时，不能直接断言「今天没有行情」——
 * 也可能是数据未同步。此时若库中存在**连续多个**被日历标记为交易日的日期，
 * 说明「日历本身可用、只是这一天缺数据」，可据此继续回退到有数据的交易日。
 * 阈值取 3：单日无法区分偶发缺失，连续 3 日才有足够证据。
 */
const MIN_CONSECUTIVE_TRADING_DAY_EVIDENCE = 3;

/**
 * 判定「内置日历在该区间内是否与库内数据一致」。
 *
 * 用途：日历说交易日、库说没数据时，二者必有一方失真。逐项列举并给出
 * 诚实结论，避免上层静默采用其中一方。
 *
 * @param calendarDays 日历判定为交易日的日期（降序即可）
 * @param quoteDates 库中实际有行情的日期集合
 */
export function reconcileCalendarWithQuotes(
  calendarDays: readonly DateStr[],
  quoteDates: ReadonlySet<DateStr>,
): {
  /** 日历说交易、库也有 → 强证据 */
  corroborated: DateStr[];
  /** 日历说交易、库无 → 疑似停市/数据未同步 */
  missingInDb: DateStr[];
  /** 库有、日历说非交易日 → 疑似抹布行/日历漏项（绝不可当行情上报） */
  smearedInDb: DateStr[];
  /** 连续交易日证据条数（库中有数据且日历认定为交易日的连续段） */
  consecutiveEvidence: number;
} {
  const corroborated: DateStr[] = [];
  const missingInDb: DateStr[] = [];
  for (const d of calendarDays) {
    if (quoteDates.has(d)) corroborated.push(d);
    else missingInDb.push(d);
  }

  const smearedInDb: DateStr[] = [];
  for (const d of quoteDates) {
    if (!isTradingDay(d)) smearedInDb.push(d);
  }

  // 连续段长度：以降序遍历 corroborated，遇到断点即重置
  let best = 0;
  let run = 0;
  let prev: DateStr | null = null;
  for (const d of [...corroborated].sort()) {
    run = prev !== null && daysBetween(prev, d) === 1 ? run + 1 : 1;
    if (run > best) best = run;
    prev = d;
  }

  return {
    corroborated,
    missingInDb,
    smearedInDb,
    consecutiveEvidence: best,
  };
}

// ─────────────────────────── 纯日期工具（无副作用、可单测） ───────────────────────────

const DATE_STR_RE = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * 把各种日期形态规整为 `YYYY-MM-DD`。
 *
 * 关键点：字符串一律按「日历日」解析，**不做时区换算**。历史写法
 * `new Date('2026-10-06').toISOString().slice(0,10)` 在 CST 下会因UTC 偏移
 * 退化成 `2026-10-05`，是日期错位的隐性来源。
 *
 * @throws 输入无法解析或不是合法日历日时抛错（调用方应在边界处校验用户输入）
 */
export function toDateString(date: DateInput): DateStr {
  if (typeof date === 'string') {
    const m = DATE_STR_RE.exec(date.trim());
    if (!m) throw new Error(`tradingCalendar: 无法解析日期字符串 "${date}"，期望 YYYY-MM-DD`);
    const [, y, mo, d] = m;
    const year = Number(y);
    const month = Number(mo);
    const day = Number(d);
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      throw new Error(`tradingCalendar: 日期 "${date}" 超出合法范围`);
    }
    // 校验真实日历日（排除 2026-02-30 这类不存在的日期）
    const probe = new Date(Date.UTC(year, month - 1, day));
    if (
      probe.getUTCFullYear() !== year ||
      probe.getUTCMonth() !== month - 1 ||
      probe.getUTCDate() !== day
    ) {
      throw new Error(`tradingCalendar: 日期 "${date}" 不是合法日历日`);
    }
    return `${y}-${mo}-${d}`;
  }

  if (date instanceof Date) {
    if (Number.isNaN(date.getTime())) throw new Error('tradingCalendar: 无效的 Date 对象');
    // Date 对象代表「某个绝对时刻」，按交易所时区落到日历日
    return dateInMarketTz(date);
  }

  throw new Error('tradingCalendar: 未知日期类型，仅支持 Date 或 YYYY-MM-DD 字符串');
}

/**
 * 取某一绝对时刻在**交易所时区**下的日历日。
 *
 * 为什么不用 `new Date().toISOString().slice(0,10)`：那是 UTC 日历日。
 * CST 凌晨 0~8 点时它会返回「昨天」，导致交易日整体错位一天 ——
 * 这正是本模块要收敛的那类日期 bug 的根源之一。
 */
export function dateInMarketTz(now: Date = new Date()): DateStr {
  // en-CA 区域格式恰好产出 YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MARKET_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** 今天（交易所时区）的日历日 */
export function today(): DateStr {
  return dateInMarketTz(new Date());
}

/** 在 `YYYY-MM-DD` 上加减天数，返回新的 `YYYY-MM-DD` */
export function addDays(date: DateInput, days: number): DateStr {
  const base = toDateString(date);
  const [y, m, d] = base.split('-').map(Number);
  const ts = Date.UTC(y, m - 1, d) + days * 86_400_000;
  const next = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

/** 两个日历日相差的天数（`to - from`） */
export function daysBetween(from: DateInput, to: DateInput): number {
  const [fy, fm, fd] = toDateString(from).split('-').map(Number);
  const [ty, tm, td] = toDateString(to).split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/** 是否为周末（ISO 星期：6=周六, 7=周日）。以 UTC 构造避免本地时区偏移影响。 */
export function isWeekend(date: DateInput): boolean {
  const [y, m, d] = toDateString(date).split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 || dow === 6;
}

/**
 * 查询日期落在哪个内置休市区间。
 * @returns 节日名；非内置休市区间返回 null
 */
function builtinHolidayName(date: DateStr): string | null {
  const year = Number(date.slice(0, 4));
  const ranges = BUILTIN_CALENDARS[year]?.ranges;
  if (!ranges) return null;
  for (const range of ranges) {
    if (date >= range.from && date <= range.to) return range.name;
  }
  return null;
}

// ────────────────────────────── 交易日判定（同步、日历权威） ──────────────────────────────

/**
 * 判断某日是否为 A 股交易日。
 *
 * 判定依据（优先级从高到低）：
 * 1. 周末 → 非交易日；
 * 2. 交易所公告的法定休市日 → 非交易日；
 * 3. 其余 → 交易日。
 *
 * 注意：这是**纯日历判定，不查库**，因此不受PG 可用性影响、结果稳定可测。
 * 「那天库里有没有行情」是另一件事，见 {@link hasQuoteData}。
 *
 * ⚠️ 内置表仅覆盖 2026 年。查询其他年份时退化为「仅周末规则」，
 *    调用方应通过 {@link getCalendarSource} / {@link resolveQueryDate} 的note
 *    向用户声明精度，不要静默假装全年精确。
 */
export function isTradingDay(date: DateInput): boolean {
  const ds = toDateString(date);
  if (isWeekend(ds)) return false;
  if (builtinHolidayName(ds) !== null) return false;
  return true;
}

/**
 * 非交易日的原因（中文），用于生成可对用户展示的说明。
 * @returns `'周末'` / `'国庆节'` / `null`（是交易日）
 */
export function nonTradingReason(date: DateInput): string | null {
  const ds = toDateString(date);
  if (isWeekend(ds)) return '周末';
  return builtinHolidayName(ds);
}

/**
 * ≤ from 的最近交易日。
 *
 * 从 from 逐日回溯直到交易日；因日历为纯规则实现，结果与 PG 无关、稳定可预测。
 * 若 from 早于内置表首年（如 1990 年）会一直回溯到 1970 附近，
 * 故设置 60 天护栏并对超范围场景显式抛错，避免产出荒谬日期。
 *
 * @param from 缺省为今天（交易所时区）
 * @returns `YYYY-MM-DD`
 */
export function latestTradingDay(from: DateInput = today()): DateStr {
  let cursor = toDateString(from);
  for (let i = 0; i <= 60; i += 1) {
    if (isTradingDay(cursor)) return cursor;
    cursor = addDays(cursor, -1);
  }
  /* c8 ignore next */
  throw new Error(`tradingCalendar: 从 "${from}" 回溯 60 天内未找到交易日，请检查内置日历表`);
}

/** > from 的最近交易日 */
export function nextTradingDay(from: DateInput = today()): DateStr {
  let cursor = toDateString(from);
  for (let i = 0; i <= 60; i += 1) {
    cursor = addDays(cursor, 1);
    if (isTradingDay(cursor)) return cursor;
  }
  /* c8 ignore next 2 */
  throw new Error(`tradingCalendar: 从 "${from}" 前进 60 天内未找到交易日，请检查内置日历表`);
}

/** < from 的最近交易日 */
export function prevTradingDay(from: DateInput = today()): DateStr {
  return latestTradingDay(addDays(from, -1));
}

/**
 * `(from, to)` **开区间**内的交易日数 —— 不含两端。
 *
 * 专治「把端点算进缺失」这一类回溯误判：相邻两条记录的区间里，
 * `from` 本身就是一条存在的记录，若用闭区间 {@link tradingDaysBetween}
 * 统计，会把 `from` 重复计入「本应有」而凭空造出一个缺口。
 *
 * @example
 * // 01-05(Thu) → 01-06(Sat) 区间内无中间交易日 → 0（闭区间会算成 1）
 * tradingDaysStrictlyBetween('2026-01-05', '2026-01-06') === 0
 */
export function tradingDaysStrictlyBetween(from: DateInput, to: DateInput): number {
  const start = addDays(from, 1);
  const end = addDays(to, -1);
  if (start > end) return 0; // 相邻或倒序
  return tradingDaysBetween(start, end).length;
}

/**
 * 闭区间 `[start, end]` 内的交易日列表（升序）。
 * 起止颠倒时自动纠正为升序。
 */
export function tradingDaysBetween(start: DateInput, end: DateInput): DateStr[] {
  let from = toDateString(start);
  let to = toDateString(end);
  if (from > to) [from, to] = [to, from];
  const out: DateStr[] = [];
  let cursor = from;
  while (cursor <= to) {
    if (isTradingDay(cursor)) out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

// ─────────────────────── PostgreSQL 交叉校验层（数据可用性） ───────────────────────

interface QuoteDateCache {
  /** 由近及远的行情日期（YYYY-MM-DD） */
  readonly dates: readonly DateStr[];
  readonly fetchedAt: number;
}

let pgDateCache: QuoteDateCache | null = null;
/** PG 不可达只告警一次，避免端点每次调用刷屏 */
let pgUnavailableWarned = false;

/**
 * 从 `daily_quotes` 读取近期行情日期（降序）。
 *
 * @returns 由近及远的日期列表；PG 不可达/未初始化/查询失败时返回 `null`
 *
 * 注意：这里**不做**「取最大日期即最近交易日」的判定 —— 返回的列表仍需
 * 经 {@link isTradingDay} 过滤，因为库中存在假期/周末的抹布行（见文件头实测反例）。
 *
 * 必须用 `GROUP BY trade_date`（等价于 `DISTINCT trade_date`）：抹布行是
 * 同一交易日被复制到多个日期，**按行判断会重复计数**、按单股判断会放大噪声，
 * 唯有对日期集合去重才能得到「市场实际开市日」。
 */
export async function fetchQuoteDatesFromDb(): Promise<DateStr[] | null> {
  // 内存库（未初始化 / 已降级）没有可信行情，一律视为「PG 不可用」
  if (getDbType() !== 'postgres') return null;

  try {
    const rows = (await getDb().connection.raw(
      `SELECT to_char(trade_date, 'YYYY-MM-DD') AS d
         FROM daily_quotes
        WHERE trade_date <= ?::date
        GROUP BY trade_date
        ORDER BY trade_date DESC
        LIMIT ?`,
      [today(), PG_FETCH_LIMIT],
    )) as { rows?: Array<{ d: string }> } & { rows?: Array<{ d: string }> };

    const list = rows?.rows;
    if (!Array.isArray(list)) return null;
    return list.map((r) => r.d).filter((d): d is DateStr => typeof d === 'string');
  } catch {
    if (!pgUnavailableWarned) {
      pgUnavailableWarned = true;
      console.warn(
        '[tradingCalendar] 读取 daily_quotes 失败，本次按内置节假日表推算（PG 不可达）',
      );
    }
    return null;
  }
}

/** 带缓存的 PG 行情日期读取（TTL 10 分钟） */
async function cachedQuoteDates(): Promise<readonly DateStr[] | null> {
  const now = Date.now();
  if (pgDateCache && now - pgDateCache.fetchedAt < PG_CACHE_TTL_MS) {
    return pgDateCache.dates;
  }
  const dates = await fetchQuoteDatesFromDb();
  if (dates === null) {
    // 查询失败时**不覆盖**既有缓存：旧的真实数据优于立刻退化为近似
    return pgDateCache ? pgDateCache.dates : null;
  }
  pgDateCache = { dates, fetchedAt: now };
  return dates;
}

/**
 * 库中是否存在某日的行情数据。
 *
 * 与 {@link isTradingDay} 严格区分：本函数只回答「有没有数据」，
 * 不回答「那天开没开市」。
 *
 * @returns `true/false` 表示确知；`null` 表示 PG 不可用、无法判定
 */
export async function hasQuoteData(date: DateInput): Promise<boolean | null> {
  const ds = toDateString(date);
  const dates = await cachedQuoteDates();
  if (dates === null) return null;
  return dates.includes(ds);
}

/**
 * 最近的「既是交易日、库里又有数据」的日期（≤ limit）。
 *
 * 这是 PG参与决策的**正确姿势**：PG 只在交易日历认可的日期里做优选，
 * 而不用于否定交易所公告的休市安排。
 *
 * @returns `null` 表示 PG 不可用，或库内近期无任何有效交易日数据
 */
export async function latestTradingDayWithData(
  limit: DateInput = today(),
): Promise<DateStr | null> {
  const candidates = await candidateTradingDaysWithData(limit);
  return candidates.length > 0 ? candidates[0] : null;
}

/**
 * 自 `limit` 起向前取「既是交易日、库里又有数据」的候选日期（降序）。
 *
 * 窗口为 {@link CANDIDATE_LOOKBACK_TRADING_DAYS} 个**交易日**（≥ 2× 最长法定长假，
 * 避免长假期间频繁耗尽窗口导致 `isFallback` 误报）。
 *
 * 双重过滤是本模块的核心防线：
 * - `isTradingDay(d)`：剔除库中的周末/假期**抹布行**（它们不在交易日历上）；
 * - `quoteDates.has(d)`：要求库中确有该日行情。
 * 二者缺一不可 —— 只做前者会把抹布行当行情上报，只做后者会把休市日当数据日。
 *
 * @returns 候选日期降序列表；PG 不可用或窗口内无合格候选时为空数组
 */
export async function candidateTradingDaysWithData(
  limit: DateInput = today(),
): Promise<DateStr[]> {
  const ds = toDateString(limit);
  const dates = await cachedQuoteDates();
  if (dates === null || dates.length === 0) return [];

  const quoteDates = new Set(dates);

  // 先按交易日历展开窗口（最多 20 个交易日），再与库内实际数据求交集
  const window: DateStr[] = [];
  let cursor = ds;
  for (let i = 0; i < CANDIDATE_LOOKBACK_TRADING_DAYS; i += 1) {
    if (isTradingDay(cursor)) window.push(cursor);
    cursor = addDays(cursor, -1);
  }

  return window.filter((d) => quoteDates.has(d));
}

/**
 * 生成人类可读的「库中抹布行」清单，供运维排查与 CI 告警。
 *
 * 抹布行 = 库中有行情、但日历判定为非交易日的日期（如国庆假期的复制行）。
 * 它们**绝不可**被当作行情上报，但必须可见 —— 否则数据源造假会静默存在。
 *
 * @returns 降序的抹布日期列表；PG 不可用时返回空数组
 */
export async function detectSmearedQuoteDates(
  limit: DateInput = today(),
): Promise<DateStr[]> {
  const dates = await cachedQuoteDates();
  if (dates === null) return [];
  return dates.filter((d) => !isTradingDay(d));
}

/**
 * 以 `anchor` 为基准，对「窗口内交易日历」与「库内实际数据」做对账。
 *
 * @returns 对账结果；PG 不可用时返回 `null`
 */
export async function reconcileWithDb(anchor: DateInput): Promise<ReturnType<
  typeof reconcileCalendarWithQuotes
> | null> {
  const dates = await cachedQuoteDates();
  if (dates === null) return null;

  const ds = toDateString(anchor);
  const window: DateStr[] = [];
  let cursor = ds;
  for (let i = 0; i < CANDIDATE_LOOKBACK_TRADING_DAYS; i += 1) {
    if (isTradingDay(cursor)) window.push(cursor);
    cursor = addDays(cursor, -1);
  }

  return reconcileCalendarWithQuotes(window, new Set(dates));
}

/** 丢弃 PG 日期缓存（测试与长驻进程的显式刷新用） */
export function resetTradingCalendarCache(): void {
  pgDateCache = null;
  pgUnavailableWarned = false;
}

/**
 * 当前**进程级**交易日历的精度来源。
 *
 * ⚠️ 注意语义：它反映的是「本进程此前是否成功加载过 PG 行情日期」，
 * 因此**不能**用来判断某一次 {@link resolveQueryDate} 是否做了交叉校验 ——
 * 那次调用若传了 `useDatabase: false`，即使本函数返回 `'pg-cross-checked'`
 * 也依然是纯日历路径。`resolveQueryDate` 返回的 `calendarSource` 才是该次调用的真值。
 *
 * @returns `'pg-cross-checked'` 进程内已有 PG 数据；`'builtin-holiday-table'` 尚未加载过
 */
export function getCalendarSource(): CalendarSource {
  return pgDateCache ? 'pg-cross-checked' : 'builtin-holiday-table';
}

// ──────────────────────────────── 统一入口 ────────────────────────────────

export interface ResolveQueryDateOptions {
  /**
   * 是否用 PG 做数据可用性交叉校验。
   * 默认 `true`；测试或纯离线场景可传 `false` 走纯日历路径。
   */
  readonly useDatabase?: boolean;
  /**
   * 当日历解析出的交易日在库中确实无数据时，是否继续向前回退到有数据的交易日。
   * 默认 `true`。
   *
   * 关闭时行为是「只按日历回退，不看数据」——此时可能返回一个库中无数据的日期，
   * 上层应把 note 原样透出，不应再宣称数据可用。
   */
  readonly fallbackUntilDataAvailable?: boolean;
}

export interface ResolvedQueryDate {
  /** 最终应使用的查询日期（YYYY-MM-DD） */
  readonly date: DateStr;
  /**
   * **是否发生了回退**（是否偏离了用户实际指定的日期）。
   * 上层必须据此决定是否告知用户「你看到的不是今天的数据」。
   */
  readonly isFallback: boolean;
  /** 中文说明：无回退时也可能存在（例如声明数据源精度）。回退时必填。 */
  readonly note?: string;
  /** 调用方传入的原始日期；未传则为 null */
  readonly requestedDate: DateStr | null;
  /** 回退原因（非交易日原因 / 数据缺失），无回退时为 null */
  readonly reason: string | null;
  /** 最终日期在库中是否有数据；`null` = PG 不可用，未知 */
  readonly dataAvailable: boolean | null;
  /** 交易日历精度来源 */
  readonly calendarSource: CalendarSource;
}

/**
 * 统一查询日期入口 —— 所有日频端点的默认日期都应经过这里。
 *
 * 行为：
 * 1. 调用方指定日期且是交易日 → 原样返回，`isFallback: false`；
 * 2. 未指定日期 → 取今天；今天是交易日则 `isFallback: false`，
 *    否则回退到最近交易日并标记 `isFallback: true`；
 * 3. 指定日期非交易日 → 回退到最近交易日并标记 `isFallback: true`；
 * 4. PG 可用时进一步交叉校验：若目标交易日库中确无数据，继续向前回退到
 *    「既是交易日又有数据」的日期，并在 note 中说明两层原因。
 *
 * @param requested 用户指定的日期（YYYY-MM-DD）；不传表示「用户要今天」
 *
 * @example
 * const q = await resolveQueryDate();
 * if (q.isFallback) log.warn(q.note); // "2026-10-06 是国庆节休市…已回退至2026-09-30"
 */
export async function resolveQueryDate(
  requested?: string,
  options: ResolveQueryDateOptions = {},
): Promise<ResolvedQueryDate> {
  const { useDatabase = true, fallbackUntilDataAvailable = true } = options;

  const requestedDate = requested === undefined ? null : toDateString(requested);
  const todayStr = today();
  const origin = requestedDate ?? todayStr;

  const resolveNotes: string[] = [];

  // ── 第 0 层：声明内置日历的精度等级（诚实红线：不得静默假装全年精确）
  const originYear = Number(origin.slice(0, 4));
  const precision = calendarPrecisionOfYear(originYear);
  if (precision === 'provisional') {
    resolveNotes.push(
      `${originYear} 年交易所休市安排尚未发布，当前按法定节假日推导（近似），建议以交易所公告为准`,
    );
  } else if (precision === 'unavailable') {
    resolveNotes.push(`内置日历未覆盖 ${originYear} 年，仅按周末规则推算（精度较低）`);
  }

  // ── 第 1 层：日历回退（非交易日 → 最近交易日）
  let date = origin;
  let isFallback = false;
  let reason: string | null = null;

  if (!isTradingDay(origin)) {
    date = latestTradingDay(origin);
    isFallback = true;
    const why = nonTradingReason(origin);
    reason = why ? `${why}休市` : '非交易日';
    resolveNotes.push(
      requestedDate === null
        ? `${origin} 是${reason}（A股非交易日），未指定日期，已回退至最近交易日 ${date}`
        : `${origin} 是${reason}（A股非交易日），已回退至最近交易日 ${date}`,
    );
  }

  // ── 第 2 层：数据可用性交叉校验（仅在日历判定为交易日、且 PG 可用时）
  let dataAvailable: boolean | null = null;
  // 本次调用是否真的用上了 PG。不能直接读 getCalendarSource()：那反映的是
  // 进程级缓存状态，若调用方传 useDatabase:false，会误报成已交叉校验。
  let pgConsulted = false;

  if (useDatabase) {
    dataAvailable = await hasQuoteData(date);

    if (dataAvailable === null) {
      resolveNotes.push('行情库不可用，本次按内置节假日表推算交易日');
    } else {
      pgConsulted = true;
    }

    if (dataAvailable === false && fallbackUntilDataAvailable) {
      // 自适应降级：先在 20 个交易日窗口内找「既是交易日又有数据」的日期
      const candidates = await candidateTradingDaysWithData(date);

      if (candidates.length > 0) {
        const withData = candidates[0];
        if (withData !== date) {
          const span = daysBetween(withData, date);
          resolveNotes.push(
            `${date} 虽是交易日，但本地行情库无该日数据，已继续回退至最近有数据的交易日 ${withData}` +
              `（相隔 ${span} 天，候选窗口 ${CANDIDATE_LOOKBACK_TRADING_DAYS} 个交易日）`,
          );
          date = withData;
          isFallback = true;
          if (reason === null) reason = '库内无该日数据';
          dataAvailable = true;
        }
      } else {
        // 窗口内没有任何「交易日 + 有数据」的候选：证据不足，不得断言，
        // 只能如实告知「本地库无该日数据佐证」，并保留 isFallback 标记。
        const recon = await reconcileWithDb(date);
        if (recon !== null && recon.consecutiveEvidence >= MIN_CONSECUTIVE_TRADING_DAY_EVIDENCE) {
          resolveNotes.push(
            `${date} 交易日历与本地库不一致（可能停市或数据未同步）：` +
              `窗口内虽有 ${recon.consecutiveEvidence} 个连续交易日有数据佐证，但均早于该日`,
          );
        } else {
          resolveNotes.push(
            `${date} 虽是交易日，但本地行情库无该日数据佐证（证据不足，按交易日历推算）`,
          );
        }
        isFallback = true;
        if (reason === null) reason = '库内无该日数据佐证';
      }
    }
  }

  return {
    date,
    isFallback,
    note: resolveNotes.length > 0 ? resolveNotes.join('；') : undefined,
    requestedDate,
    reason,
    dataAvailable,
    calendarSource: pgConsulted ? 'pg-cross-checked' : 'builtin-holiday-table',
  };
}