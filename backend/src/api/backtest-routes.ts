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

/** 归一化为 YYYY-MM-DD；Joi.date() 会把入参转成 Date，DB 亦可能返回 Date */
function toDateStr(value: unknown): string | null {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

const dayDiff = (start: string, end: string) =>
  Math.round((Date.parse(end) - Date.parse(start)) / 86400000);

// ==================== 运行回测 ====================

router.post('/backtest/run', validateBody(schemas.backtestRun), async (req, res) => {
  try {
    const { symbol: rawSymbol, strategy, startDate, endDate, params = {} } = req.body;
    const symbol = normalizeSymbol(rawSymbol);

    if (!symbol) {
      return res.status(400).json({ success: false, error: '缺少股票代码' });
    }
    if (!strategy) {
      return res.status(400).json({ success: false, error: '缺少策略类型' });
    }

    const engineStrategy = STRATEGY_ALIAS[strategy];
    if (!engineStrategy) {
      return res.status(400).json({ success: false, error: `不支持的策略类型: ${strategy}` });
    }

    // ---------- 回测区间校验（失败均返回可读原因，不静默兜底） ----------
    const start = toDateStr(startDate);
    const end = toDateStr(endDate);

    if (!start || !end) {
      return res.status(400).json({ success: false, error: '回测区间无效，起止日期需为 YYYY-MM-DD 格式' });
    }
    if (start > end) {
      return res.status(400).json({
        success: false,
        error: `回测起始日期（${start}）不能晚于结束日期（${end}）`,
      });
    }

    const today = new Date().toISOString().slice(0, 10);
    if (end > today) {
      return res.status(400).json({
        success: false,
        error: `回测结束日期（${end}）不能晚于今天（${today}）`,
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
      return res.status(400).json({
        success: false,
        error: `${start} 至 ${end} 区间内仅有 ${klineRows.length} 条K线数据，不足 ${MIN_KLINE_ROWS} 条，请扩大回测区间或更换股票`,
      });
    }

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
    const result = runBacktest(klineData, {
      ...params,
      type: engineStrategy,
    });

    result.symbol = symbol;

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('回测执行失败:', error);
    res.status(500).json({
      success: false,
      error: '回测执行失败',
      details: error instanceof Error ? error.message : '未知错误',
    });
  }
});

// ==================== 获取策略预设 ====================

router.get('/backtest/presets', (_req, res) => {
  res.json({
    success: true,
    data: { presets: STRATEGY_PRESETS },
  });
});

// ==================== 对比多个策略 ====================

router.post('/backtest/compare', validateBody(schemas.backtestCompare), async (req, res) => {
  try {
    const { symbol: rawSymbol, strategies } = req.body;
    const symbol = normalizeSymbol(rawSymbol);

    if (!symbol || !Array.isArray(strategies) || strategies.length === 0) {
      return res.status(400).json({
        success: false,
        error: '需要股票代码和至少一个策略配置',
      });
    }

    if (strategies.length > 5) {
      return res.status(400).json({
        success: false,
        error: '最多同时对比5个策略',
      });
    }

    // 查询K线数据
    const klineRows = await db.connection('daily_quotes')
      .join('stocks', 'stocks.id', 'daily_quotes.stock_id')
      .where('stocks.symbol', symbol)
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
        error: 'K线数据不足',
      });
    }

    const klineData: KLineData[] = klineRows.map((r: Record<string, string>) => ({
      tradeDate: r.trade_date,
      open: parseFloat(r.open),
      close: parseFloat(r.close),
      high: parseFloat(r.high),
      low: parseFloat(r.low),
      volume: parseFloat(r.volume),
      turnover: parseFloat(r.turnover),
    }));

    // 运行所有策略
    const results = strategies.map((strat: { name: string; description: string; type: string; params: Record<string, unknown> }) => {
      try {
        const result = runBacktest(klineData, {
          type: strat.type as StrategyType,
          ...strat.params,
        });
        result.symbol = symbol;
        return result;
      } catch (err) {
        return {
          strategy: strat.type,
          error: err instanceof Error ? err.message : '回测失败',
        };
      }
    });

    res.json({
      success: true,
      data: { symbol, results },
    });
  } catch (error) {
    console.error('策略对比失败:', error);
    res.status(500).json({
      success: false,
      error: '策略对比失败',
    });
  }
});

export default router;
