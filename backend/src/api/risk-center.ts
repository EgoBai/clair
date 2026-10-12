/**
 * 组合风控中心 API（P1-3）
 *
 * 诚实红线（P0-FABRICATE）：本端点此前调用 portfolio.getDefaultPortfolio()，
 * 而后者返回的是 initDefaultPortfolios() 里**写死的 4 个持仓**（数量/成本价/买入日期
 * 全为编造），本端点却标 dataSource:'real' 并注明「持仓行情与历史收益来自本地真实行情库」
 * —— 价格确实真实，但仓位与成本纯属虚构，二者混在同一个 real 标签下。
 *
 * 事实：数据库无 portfolio 表，持仓无任何持久化真实来源。
 * 现 getDefaultPortfolio() 固定返回空数组（详见 portfolio.ts 注释），
 * 本端点在无真实持仓时如实返回 dataSource:'unavailable' + 空 holdings，
 * **不做「回退到默认组合」的兜底**，前端据此展示空态。
 *
 * 若将来接入真实用户持仓表，本端点的收益序列（fetchReturnSeries，daily_quotes 真算）
 * 可直接复用，无需改动。
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
          notes: '组合风控：持仓功能未接入真实用户持仓数据源（数据库无 portfolio 表），未返回任何编造持仓。',
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
          ? '持仓由用户经鉴权接口自行录入，收益序列来自本地真实行情库（daily_quotes）'
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
