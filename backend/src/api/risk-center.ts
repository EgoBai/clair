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
import { optionalAuthMiddleware } from '../middleware/auth';

const router = Router();

// 鉴权口径：此处用 optionalAuthMiddleware 而非 authMiddleware（强制鉴权）。
// 为什么不用 authMiddleware：本项目用户体系**尚未启用**（前端 authToken 恒为 null，
// 请求不带 Authorization 头），authMiddleware 无 token 直接 401。本端点的强制鉴权
// 是后加的，直接让 GET /api/risk-center/portfolio 对全部请求 401，并把 CI 的
// Unit tests (vitest) 打红（fabricatedEndpointsRemoved.test.ts 断言该端点 200 +
// dataSource:'unavailable'）——属功能回归。optionalAuthMiddleware 有 token 则解析、
// 无 token 放行，恢复端点可用。
// 必须保留 '/risk-center' 路径收敛写法：本路由挂在 '/api' 前缀下，
// 若写 router.use(middleware)（无路径），会误伤挂载在其后的其它 /api 子路由
// （watchlist.ts 与 portfolio.ts 的注释都记载过这个坑）。
// TODO：用户体系正式启用（前端登录后会带 Authorization）时，必须切回
// authMiddleware，否则任何人可读取他人持仓。
router.use('/risk-center', optionalAuthMiddleware);

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
      // 诚实契约：顶层与 data 内**同时**标 unavailable（此前只有 data 内有，
      // 顶层缺失，前端按顶层判定时会误判为有数据——qa 蜂群 P2-⑨ 同类问题）。
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.status(200).json({
        success: true,
        dataSource: 'unavailable',
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
    const ds = withReturns.length ? 'real' : 'partial';
    // 顶层与 data 内同标（qa P2-⑩ 同类：顶层不得缺 dataSource）
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json({
      success: true,
      dataSource: ds,
      data: {
        holdings: withReturns,
        dataSource: ds,
        notes: withReturns.length
          ? '持仓由用户经鉴权接口自行录入，收益序列来自本地真实行情库（daily_quotes）'
          : '持仓存在但本地行情库无足够历史收益数据',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    // 顶层与 data 内同标 unavailable；error 改中文说明，不透传上游细节
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json({
      success: false,
      dataSource: 'unavailable',
      data: { holdings: [], dataSource: 'unavailable' },
      error: '组合风控计算失败',
      timestamp: new Date().toISOString(),
    });
  }
}));

export default router;
