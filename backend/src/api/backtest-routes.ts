/**
 * 回测系统 API 路由
 */

import { Router } from 'express';
import { db } from '../db/Database';
import { validateBody, validateParams, schemas } from '../middleware/validation';
import { asyncHandler, sendSuccess, sendValidationError } from '../utils/apiResponse';
import { runBacktest, STRATEGY_PRESETS } from '../utils/backtestEngine';
import type { KLineData } from '../../../shared/types';

const router = Router();

// ==================== 运行回测 ====================

router.post('/backtest/run', validateBody(schemas.backtestRun), async (req, res) => {
  try {
    const { symbol, strategy, params = {} } = req.body;

    if (!symbol) {
      return res.status(400).json({ success: false, error: '缺少股票代码' });
    }
    if (!strategy) {
      return res.status(400).json({ success: false, error: '缺少策略类型' });
    }

    // 查询K线数据
    const klineRows = await db.connection('daily_quotes')
      .join('stocks', 'stocks.id', 'daily_quotes.stock_id')
      .where('stocks.symbol', symbol)
      .select(
        'trade_date as tradeDate',
        'open_price as open',
        'close_price as close',
        'high_price as high',
        'low_price as low',
        'volume',
        'turnover'
      )
      .orderBy('trade_date', 'asc')
      .limit(params.limit || 500);

    if (klineRows.length < 20) {
      return res.status(400).json({
        success: false,
        error: 'K线数据不足，至少需要20条记录',
      });
    }

    const klineData: KLineData[] = klineRows.map((r: any) => ({
      ...r,
      open: parseFloat(r.open),
      close: parseFloat(r.close),
      high: parseFloat(r.high),
      low: parseFloat(r.low),
      volume: parseFloat(r.volume),
      turnover: parseFloat(r.turnover),
    }));

    // 执行回测
    const result = runBacktest(klineData, {
      type: strategy,
      ...params,
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
    const { symbol, strategies } = req.body;

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
        'trade_date as tradeDate',
        'open_price as open',
        'close_price as close',
        'high_price as high',
        'low_price as low',
        'volume',
        'turnover'
      )
      .orderBy('trade_date', 'asc')
      .limit(500);

    if (klineRows.length < 20) {
      return res.status(400).json({
        success: false,
        error: 'K线数据不足',
      });
    }

    const klineData: KLineData[] = klineRows.map((r: any) => ({
      ...r,
      open: parseFloat(r.open),
      close: parseFloat(r.close),
      high: parseFloat(r.high),
      low: parseFloat(r.low),
      volume: parseFloat(r.volume),
      turnover: parseFloat(r.turnover),
    }));

    // 运行所有策略
    const results = strategies.map((strat: any) => {
      try {
        const result = runBacktest(klineData, {
          type: strat.type,
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
