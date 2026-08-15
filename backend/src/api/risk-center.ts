/**
 * 组合风控中心 API（P1-3）
 *
 * 诚实红线：不再使用前端 LCG 伪数据。组合持仓来自真实默认组合（portfolio 模块），
 * 历史收益序列来自本地真实行情库 daily_quotes，全部真实。
 *
 * 真实数据源：
 *   - 持仓：portfolio.getDefaultPortfolio()（内存默认组合，含 enrich 实时行情）
 *   - 历史收益：db daily_quotes 收盘价序列 → 日收益率
 *
 * 沙箱下若默认组合为空或无历史行情，则返回 dataSource: 'unavailable' + 空 holdings，
 * 前端据此展示空态，绝不填充伪数据。
 */

import { Router, Request, Response } from 'express';
import { asyncHandler, sendSuccess } from '../utils/apiResponse';
import { getDb } from '../db/dbFactory';
import { getDefaultPortfolio } from './portfolio';

const router = Router();

const TRADING_DAYS = 252;

/** 从 daily_quotes 计算单只股票真实日收益率序列 */
async function fetchReturnSeries(symbol: string, days = TRADING_DAYS): Promise<number[]> {
  try {
    const db = getDb();
    const rows = await (db.connection('daily_quotes') as any)
      .join('stocks', 'stocks.id', 'daily_quotes.stock_id')
      .where('stocks.symbol', symbol)
      .select('daily_quotes.close_price')
      .orderBy('daily_quotes.trade_date', 'asc')
      .limit(days);
    const closes = (rows || []).map((r: any) => Number(r.close_price)).filter((v: number) => v > 0);
    const rets: number[] = [];
    for (let i = 1; i < closes.length; i++) {
      const prev = closes[i - 1];
      if (prev > 0) rets.push(closes[i] / prev - 1);
    }
    return rets;
  } catch {
    return [];
  }
}

interface RiskHolding {
  symbol: string;
  name: string;
  quantity: number;
  costPrice: number;
  currentPrice: number;
  weight: number;
  returns: number[];
}

router.get('/risk-center/portfolio', asyncHandler(async (_req: Request, res: Response) => {
  try {
    const positions = await getDefaultPortfolio();
    if (!positions || positions.length === 0) {
      res.json({
        success: true,
        data: {
          holdings: [],
          dataSource: 'unavailable',
          notes: '组合风控：当前无持仓数据（默认组合未初始化或为空），后端未接入兜底。',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const enriched = await Promise.all(
      (positions as any[]).map(async (p) => {
        const returns = await fetchReturnSeries(p.symbol, TRADING_DAYS);
        return {
          symbol: p.symbol,
          name: p.name,
          quantity: p.quantity,
          costPrice: p.costPrice,
          currentPrice: p.currentPrice,
          weight: 0, // 前端按市值归一
          returns,
        } as RiskHolding;
      }),
    );

    const withReturns = enriched.filter((h) => h.returns.length >= 2);
    res.json({
      success: true,
      data: {
        holdings: withReturns,
        dataSource: withReturns.length ? 'real' : 'partial',
        notes: withReturns.length
          ? '持仓行情与历史收益来自本地真实行情库（daily_quotes）'
          : '持仓存在但本地行情库无足够历史收益数据',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    res.json({
      success: false,
      data: { holdings: [] },
      dataSource: 'unavailable',
      error: e instanceof Error ? e.message : 'unknown',
      timestamp: new Date().toISOString(),
    });
  }
}));

export default router;
