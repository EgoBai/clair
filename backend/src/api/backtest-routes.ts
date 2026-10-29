/**
 * 回测系统 API 路由
 */

import { Request, Response, Router } from 'express';
import { db } from '../db/dbFactory';
import { validateBody, schemas } from '../middleware/validation';
import { asyncHandler } from '../utils/apiResponse';
import { normalizeSymbol } from '../utils/symbolUtils';
import { runBacktest, STRATEGY_PRESETS, type StrategyType } from '../utils/backtestEngine';
import type { KLineData } from '@shared/types';

const router = Router();

// ==================== 回测区间约束 ====================

/** 引擎要求的最小 K 线条数（见 backtestEngine.runBacktest） */
const MIN_KLINE_ROWS = 20;
/** 最小自然日跨度：约 20 个交易日，低于此无法产生有效信号 */
const MIN_RANGE_DAYS = 30;
/** 最大自然日跨度：10 年，超出后单次查询与指标计算成本过高 */
const MAX_RANGE_DAYS = 3650;
/** 单次回测最多载入的 K 线条数（约 10 年日线） */
const MAX_KLINE_ROWS = 2600;

/**
 * 请求体 strategy 取值（middleware/validation.ts 的 backtestRunSchema 枚举）
 * → backtestEngine 的 StrategyType 映射。
 *
 * 两处枚举历史上不一致（schema: rsi_reversal/macd_trend/breakout，
 * engine: rsi/macd/boll），导致除 ma_cross 外的策略在校验层即被 400 拦截。
 * 此处做适配，根治方案是同步 validation.ts 的枚举（属他人文件，见跨界诉求）。
 */
const STRATEGY_ALIAS: Record<string, StrategyType> = {
  ma_cross: 'ma_cross',
  rsi_reversal: 'rsi',
  macd_trend: 'macd',
  breakout: 'boll',
  custom: 'custom',
};

/**
 * 归一化为 YYYY-MM-DD；Joi.date() 会把入参转成 Date，DB 亦可能返回 Date。
 *
 * ⚠️ 禁止 toISOString().slice(0,10)：node-pg 把 DATE 列解析为**本地零点**的
 * Date（东八区下 trade_date=2026-06-01 → Date(2026-05-31T16:00:00Z)），按 UTC
 * 取日期会把回测区间整体偏移 -1 天（实测 06-01~09-30 被报成 05-31~09-29）。
 * 故字符串直接截取 YYYY-MM-DD 日历段（不经 Date 时区往返），Date 用本地
 * 日历分量还原（与 node-pg 的本地零点解析互为逆操作）。
 */
export function toDateStr(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  }
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  // 两种 Date 来源要分别还原：
  //  - node-pg 的 DATE 列 → **本地零点** Date → 用本地日历分量；
  //  - date-only 字符串（Joi / new Date('2026-06-01')）→ **UTC 零点** Date → 用 UTC 分量；
  // 两者都不命中时（带时刻的完整时间戳）按本地分量。
  const midnightOf = (get: (i: number) => number) =>
    get(0) === 0 && get(1) === 0 && get(2) === 0 && get(3) === 0;
  const isLocalMidnight = midnightOf((i) => [d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()][i]);
  const isUtcMidnight = midnightOf((i) => [d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()][i]);
  const y = isUtcMidnight && !isLocalMidnight ? d.getUTCFullYear() : d.getFullYear();
  const mIdx = isUtcMidnight && !isLocalMidnight ? d.getUTCMonth() : d.getMonth();
  const dayNum = isUtcMidnight && !isLocalMidnight ? d.getUTCDate() : d.getDate();
  const mo = String(mIdx + 1).padStart(2, '0');
  const day = String(dayNum).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

const dayDiff = (start: string, end: string) =>
  Math.round((Date.parse(end) - Date.parse(start)) / 86400000);

/**
 * 诚实数据契约发送器：顶层 dataSource 与 data 内同源。
 * backtest/presets 返回的是**静态策略参数目录**（无任何行情数据），
 * 故置 unavailable 并说明，避免前端把「内置策略清单」当成「真实回测结果」。
 */
function sendHonest(
  res: Response,
  dataSource: 'real' | 'unavailable',
  data: Record<string, unknown>
): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(200).json({
    success: true,
    dataSource,
    data: { ...data, dataSource },
    timestamp: new Date().toISOString(),
  });
}

// ==================== 运行回测 ====================

router.post('/backtest/run', validateBody(schemas.backtestRun), async (req, res) => {
  try {
    const { symbol: rawSymbol, strategy, startDate, endDate, params = {} } = req.body;
    const symbol = normalizeSymbol(rawSymbol);

    if (!symbol) {
      return res.status(400).json({
        success: false,
        dataSource: 'unavailable',
        error: '缺少股票代码',
        message: '缺少必需参数 symbol，未查询任何 K 线数据',
      });
    }
    if (!strategy) {
      return res.status(400).json({
        success: false,
        dataSource: 'unavailable',
        error: '缺少策略类型',
        message: '缺少必需参数 strategy，未执行任何回测',
      });
    }

    const engineStrategy = STRATEGY_ALIAS[strategy];
    if (!engineStrategy) {
      return res.status(400).json({
        success: false,
        dataSource: 'unavailable',
        error: `不支持的策略类型: ${strategy}`,
        message: '策略类型不在引擎支持范围内，未执行任何回测',
      });
    }

    // ---------- 回测区间校验（失败均返回可读原因，不静默兜底） ----------
    const start = toDateStr(startDate);
    const end = toDateStr(endDate);

    if (!start || !end) {
      return res.status(400).json({
        success: false,
        dataSource: 'unavailable',
        error: '回测区间无效，起止日期需为 YYYY-MM-DD 格式',
        message: '起止日期缺失或格式非法，未查询任何 K 线数据',
      });
    }
    if (start > end) {
      return res.status(400).json({
        success: false,
        dataSource: 'unavailable',
        error: `回测起始日期（${start}）不能晚于结束日期（${end}）`,
        message: '回测区间起止倒置，未查询任何 K 线数据',
      });
    }

    // A股交易日按东八区计；服务器若跑在 UTC，00:00-08:00 CST 期间用 UTC 日期会误伤"今天"
    const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    if (end > today) {
      return res.status(400).json({
        success: false,
        dataSource: 'unavailable',
        error: `回测结束日期（${end}）不能晚于今天（${today}）`,
        message: '回测区间包含未来日期，未查询任何 K 线数据',
      });
    }

    const span = dayDiff(start, end);
    if (span < MIN_RANGE_DAYS) {
      return res.status(400).json({
        success: false,
        error: `回测区间过短（${span} 天），至少需要 ${MIN_RANGE_DAYS} 个自然日才能覆盖 ${MIN_KLINE_ROWS} 个交易日`,
      });
    }
    if (span > MAX_RANGE_DAYS) {
      return res.status(400).json({
        success: false,
        error: `回测区间过长（${span} 天），单次最多支持 ${MAX_RANGE_DAYS} 天（约 10 年）`,
      });
    }

    // 查询K线数据（按用户所选区间过滤）
    const klineRows = await db.connection('daily_quotes')
      .join('stocks', 'stocks.id', 'daily_quotes.stock_id')
      .where('stocks.symbol', symbol)
      .whereBetween('daily_quotes.trade_date', [start, end])
      .select(
        'daily_quotes.trade_date as tradeDate',
        'daily_quotes.open_price as open',
        'daily_quotes.close_price as close',
        'daily_quotes.high_price as high',
        'daily_quotes.low_price as low',
        'daily_quotes.volume',
        'daily_quotes.turnover'
      )
      .orderBy('daily_quotes.trade_date', 'asc')
      .limit(Math.min(Number(params.limit) || MAX_KLINE_ROWS, MAX_KLINE_ROWS));

    if (klineRows.length < MIN_KLINE_ROWS) {
      // 诚实空态：真实 K 线不足 → 无法回测，不用空结果冒充「已回测但无信号」
      return res.status(400).json({
        success: false,
        dataSource: 'unavailable',
        error: `${start} 至 ${end} 区间内仅有 ${klineRows.length} 条K线数据，不足 ${MIN_KLINE_ROWS} 条，请扩大回测区间或更换股票`,
        message: '本地真实行情库在该区间内 K 线条数不足，未执行任何回测',
      });
    }

    // ── P2-⑦ 区间截断披露 ──
    // 查询带 .limit(MAX_KLINE_ROWS) 且按 trade_date **升序**，因此超长区间下
    // 只会保留**最早**的 N 条，后半段被静默丢弃。用户请求 2015→2026，
    // 实际只回测了 2015→2019，而响应此前没有任何提示——回测区间与请求
    // 不符却看不出来，属**事实性错误**（qa 蜂群 P2-⑦）。
    // 判据：取到的行数触达 limit 即认为可能被截断（极少恰好相等，但保守
    // 提示好过静默；实际区间用首尾 K 线日期算出，不猜）。
    const truncated = klineRows.length >= Math.min(Number(params.limit) || MAX_KLINE_ROWS, MAX_KLINE_ROWS);
    const actualStart = toDateStr(klineRows[0]?.tradeDate ?? klineRows[0]?.trade_date) ?? start;
    const actualEnd = toDateStr(klineRows[klineRows.length - 1]?.tradeDate ?? klineRows[klineRows.length - 1]?.trade_date) ?? end;
    const rangeNote = truncated
      ? `注意：请求区间 ${start}~${end} 的 K 线超过单次上限 ${MAX_KLINE_ROWS} 条，本次实际仅回测最早的一段 ${actualStart}~${actualEnd}（共 ${klineRows.length} 条）；若需覆盖完整区间，请缩短时间范围后分段回测`
      : `本次回测区间 ${actualStart}~${actualEnd}，共 ${klineRows.length} 条 K 线`;

    const klineData: KLineData[] = klineRows.map((r: Record<string, unknown>) => ({
      tradeDate: toDateStr(r.tradeDate ?? r.trade_date) ?? '',
      open: parseFloat(String(r.open)),
      close: parseFloat(String(r.close)),
      high: parseFloat(String(r.high)),
      low: parseFloat(String(r.low)),
      volume: parseFloat(String(r.volume)),
      turnover: parseFloat(String(r.turnover)),
    }));

    // 执行回测
    // ⚠️ initialCapital 必须**显式**从顶层传入，不能只靠 ...params 展开：
    // Joi schema（validation.ts:417）把 initialCapital 定义在**顶层**字段
    // （与 strategy/symbol/startDate 平级），而前端回测页的「初始本金」输入框
    // 也发在顶层。此前这里只展开 params，顶层 initialCapital 被静默丢弃，
    // 引擎回退到默认 1000000 —— 用户输入 50 万却按 100 万算，
    // 收益率/最终资产/回撤全部按错误本金计算，属**事实性错误**（qa P2-③）。
    //
    // 兼容两种调用形态：顶层 initialCapital（schema 正规形态）优先，
    // params.initialCapital（历史/内部调用形态）作兜底。
    const requestedCapital = Number(
      (req.body as { initialCapital?: unknown }).initialCapital
      ?? params.initialCapital
      ?? 0,
    );
    const result = runBacktest(klineData, {
      ...params,
      // 用户显式给了本金就必须用它；没给才让引擎用默认值
      ...(requestedCapital > 0 ? { initialCapital: requestedCapital } : {}),
      type: engineStrategy,
    });

    result.symbol = symbol;

    // 把实际生效的本金回显，前端可校验「我输入的」与「系统用的」一致
    (result as unknown as Record<string, unknown>).requestedInitialCapital =
      requestedCapital > 0 ? requestedCapital : undefined;
    // P2-⑦：区间截断/实际覆盖范围必须透出，前端展示给用户
    (result as unknown as Record<string, unknown>).requestedRange = { start, end };
    (result as unknown as Record<string, unknown>).actualRange = {
      start: actualStart,
      end: actualEnd,
      klineCount: klineRows.length,
      truncated,
    };
    (result as unknown as Record<string, unknown>).rangeNote = rangeNote;

    sendHonest(res, 'real', result as unknown as Record<string, unknown>);
  } catch (error) {
    console.error('回测执行失败:', error);
    res.status(500).json({
      success: false,
      dataSource: 'unavailable',
      error: '回测执行失败',
      details: error instanceof Error ? error.message : '未知错误',
      message: '回测流程异常（K 线查询或引擎执行失败），未产出任何回测结果',
    });
  }
});

// ==================== 获取策略预设 ====================

router.get('/backtest/presets', (_req, res) => {
  // 诚实契约：这是**静态策略参数目录**，不含任何行情/回测结果数据，
  // 置 unavailable 以免前端把它当成「真实回测产出」。
  sendHonest(res, 'unavailable', {
    presets: STRATEGY_PRESETS,
    message: '返回的是内置静态策略参数目录，不含任何行情或回测结果数据',
  });
});

// ==================== 对比多个策略 ====================

router.post('/backtest/compare', validateBody(schemas.backtestCompare), async (req, res) => {
  try {
    // 契约以 validation.ts 的 backtestCompareSchema 为准（前端 api.ts 已对齐）：
    // strategies 是**策略对象数组** [{ strategy, parameters? }]（≥2 个），
    // 顶层另需 symbol/startDate/endDate。历史上前端发 strategies: string[] 且
    // 不带日期，被 schema 稳定 400 —— 统一以后端 schema 为准。
    const { symbol: rawSymbol, strategies, startDate, endDate } = req.body;
    const symbol = normalizeSymbol(rawSymbol);

    if (!symbol) {
      return res.status(400).json({
        success: false,
        dataSource: 'unavailable',
        error: '需要股票代码和至少一个策略配置',
        message: '缺少必需参数 symbol/strategies（策略对象数组，每项形如 { strategy: "ma_cross", parameters: {} }），未查询任何 K 线数据',
      });
    }

    // ---------- 回测区间校验（与 /backtest/run 同一契约） ----------
    const start = toDateStr(startDate);
    const end = toDateStr(endDate);

    if (!start || !end) {
      return res.status(400).json({
        success: false,
        dataSource: 'unavailable',
        error: '回测区间无效，起止日期需为 YYYY-MM-DD 格式',
        message: '起止日期缺失或格式非法，未查询任何 K 线数据',
      });
    }
    if (start > end) {
      return res.status(400).json({
        success: false,
        dataSource: 'unavailable',
        error: `回测起始日期（${start}）不能晚于结束日期（${end}）`,
        message: '回测区间起止倒置，未查询任何 K 线数据',
      });
    }

    // 查询K线数据（按用户所选区间过滤；与 /backtest/run 一样按日历字符串透传，
    // 不经 Date 时区转换 —— 否则区间整体偏移一天）
    const klineRows = await db.connection('daily_quotes')
      .join('stocks', 'stocks.id', 'daily_quotes.stock_id')
      .where('stocks.symbol', symbol)
      .whereBetween('daily_quotes.trade_date', [start, end])
      .select(
        'daily_quotes.trade_date as tradeDate',
        'daily_quotes.open_price as open',
        'daily_quotes.close_price as close',
        'daily_quotes.high_price as high',
        'daily_quotes.low_price as low',
        'daily_quotes.volume',
        'daily_quotes.turnover'
      )
      .orderBy('daily_quotes.trade_date', 'asc')
      .limit(500);

    if (klineRows.length < 20) {
      return res.status(400).json({
        success: false,
        dataSource: 'unavailable',
        error: `K线数据不足（${start} 至 ${end} 区间内仅 ${klineRows.length} 条，至少 20 条）`,
        message: '本地真实行情库该股票在所选区间内 K 线条数不足 20，未执行任何对比回测',
      });
    }

    // ⚠️ select 已把 trade_date 别名为 tradeDate，必须读 tradeDate（兜底
    // trade_date），且经 toDateStr 归一化 —— 裸用 r.trade_date 会得到 undefined，
    // 直接把 Date 塞进 tradeDate 又会经 JSON 序列化偏移时区。
    const klineData: KLineData[] = klineRows.map((r: Record<string, unknown>) => ({
      tradeDate: toDateStr(r.tradeDate ?? r.trade_date) ?? '',
      open: parseFloat(String(r.open)),
      close: parseFloat(String(r.close)),
      high: parseFloat(String(r.high)),
      low: parseFloat(String(r.low)),
      volume: parseFloat(String(r.volume)),
      turnover: parseFloat(String(r.turnover)),
    }));

    // 运行所有策略
    // 与 /backtest/run 同修：initialCapital 在 schema 里是**顶层**字段，
    // 只展开 strat.parameters 会把它静默丢弃 → 全部策略按默认 100 万算（qa P2-③）。
    const compareCapital = Number(
      (req.body as { initialCapital?: unknown }).initialCapital ?? 0,
    );
    const results = strategies.map((strat: { strategy?: string; parameters?: Record<string, unknown> }) => {
      try {
        const engineStrategy = STRATEGY_ALIAS[strat.strategy ?? ''];
        if (!engineStrategy) {
          return {
            strategy: strat.strategy,
            error: `不支持的策略类型: ${strat.strategy}（支持 ma_cross/rsi_reversal/macd_trend/breakout）`,
          };
        }
        const result = runBacktest(klineData, {
          type: engineStrategy,
          ...strat.parameters,
          ...(compareCapital > 0 ? { initialCapital: compareCapital } : {}),
        });
        result.symbol = symbol;
        return result;
      } catch (err) {
        return {
          strategy: strat.strategy,
          error: err instanceof Error ? err.message : '回测失败',
        };
      }
    });

    // 区间披露（与 /backtest/run 同契约）：actualRange 用首尾 K 线日期算出，不猜
    const actualStart = klineData[0]?.tradeDate || start;
    const actualEnd = klineData[klineData.length - 1]?.tradeDate || end;

    sendHonest(res, 'real', {
      symbol,
      requestedRange: { start, end },
      actualRange: {
        start: actualStart,
        end: actualEnd,
        klineCount: klineRows.length,
      },
      ...(compareCapital > 0 ? { initialCapital: compareCapital } : {}),
      results,
    });
  } catch (error) {
    console.error('策略对比失败:', error);
    res.status(500).json({
      success: false,
      dataSource: 'unavailable',
      error: '策略对比失败',
      message: '对比流程异常（K 线查询或引擎执行失败），未产出任何对比结果',
    });
  }
});

export default router;
