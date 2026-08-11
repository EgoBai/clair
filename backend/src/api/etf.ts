/**
 * ETF 数据 API（真实源版）
 * - 实时行情：东方财富 push2 ulist（免 key），价格/涨跌幅/规模/成交额
 * - 单位净值(NAV) 与净值历史：东方财富 fundf10 lsjz（免 key），替换原 Math.random 模拟
 * - 静态分类（代码/名称/跟踪标的/费率）为公开事实参考目录，非模拟数据
 * - 遵守「诚实数据」红线：行情/净值源不可达 → 返回 dataSource:'unavailable'，绝不回填演示/正弦伪造
 *
 * 数据获取逻辑见 services/etfDataService.ts，本文件仅负责路由编排与诚实空降级。
 */

import { Router, Request, Response } from 'express';
import { validateQuery, validateParams, schemas } from '../middleware/validation';
import { asyncHandler, sendSuccess, sendNotFound } from '../utils/apiResponse';
import {
  getEtfList,
  getEtfDetail,
  getEtfNavHistory,
  EtfUnavailableError,
  type EtfItem,
} from '../services/etfDataService';

const router = Router();

/**
 * 获取 ETF 列表（真实源）
 * GET /api/etf/list
 */
router.get(
  '/list',
  validateQuery(schemas.etfListQuery),
  asyncHandler(async (req: Request, res: Response) => {
    const { type, sortBy = 'totalAssets', sortOrder = 'desc' } = req.query as Record<string, string>;
    try {
      let data = await getEtfList();
      if (type) data = data.filter((e) => e.type === type);
      const sortKey = (sortBy as keyof EtfItem) ?? 'totalAssets';
      data.sort((a, b) => {
        const av = (a[sortKey] as number) ?? 0;
        const bv = (b[sortKey] as number) ?? 0;
        return sortOrder === 'desc' ? bv - av : av - bv;
      });
      sendSuccess(res, { data, count: data.length, dataSource: 'real' });
    } catch (e) {
      // 诚实降级：行情源不可达 → 空数据 + 明确标注
      sendSuccess(res, {
        data: [],
        count: 0,
        dataSource: 'unavailable',
        message: e instanceof Error ? e.message : 'unknown',
      });
    }
  }),
);

/**
 * ETF 折溢价排行（基于真实 premiumRate）
 * GET /api/etf/premium/rank
 */
router.get(
  '/premium/rank',
  asyncHandler(async (_req: Request, res: Response) => {
    try {
      const list = await getEtfList();
      const sorted = [...list].sort((a, b) => b.premiumRate - a.premiumRate);
      sendSuccess(res, {
        data: {
          premium: sorted.slice(0, 5).map((e) => ({ symbol: e.symbol, name: e.name, premiumRate: e.premiumRate })),
          discount: sorted.slice(-5).reverse().map((e) => ({ symbol: e.symbol, name: e.name, premiumRate: e.premiumRate })),
        },
        dataSource: 'real',
      });
    } catch (e) {
      sendSuccess(res, {
        data: { premium: [], discount: [] },
        dataSource: 'unavailable',
        message: e instanceof Error ? e.message : 'unknown',
      });
    }
  }),
);

/**
 * 获取 ETF 详情（真实源）
 * GET /api/etf/:symbol
 */
router.get(
  '/:symbol',
  validateParams(schemas.etfSymbol),
  asyncHandler(async (req: Request, res: Response) => {
    const symbol = req.params.symbol;
    try {
      const data = await getEtfDetail(symbol);
      if (!data) return sendNotFound(res, 'ETF 未找到');
      // topHoldings 暂无真实源，诚实置空，不编造持仓
      sendSuccess(res, { data: { ...data, topHoldings: [] }, dataSource: 'real' });
    } catch (e) {
      if (e instanceof EtfUnavailableError) {
        sendSuccess(res, {
          data: null,
          dataSource: 'unavailable',
          message: e.message,
        });
        return;
      }
      throw e;
    }
  }),
);

/**
 * 获取 ETF 净值历史（真实源，替换原 Math.random 模拟）
 * GET /api/etf/:symbol/nav-history
 */
router.get(
  '/:symbol/nav-history',
  validateParams(schemas.etfSymbol),
  validateQuery(schemas.etfNavHistory),
  asyncHandler(async (req: Request, res: Response) => {
    const symbol = req.params.symbol;
    const days = parseInt(req.query.days as string) || 30;
    try {
      const data = await getEtfNavHistory(symbol, days);
      if (!data) return sendNotFound(res, 'ETF 未找到');
      sendSuccess(res, {
        data,
        dataSource: 'real',
      });
    } catch (e) {
      sendSuccess(res, {
        data: { symbol, history: [] },
        dataSource: 'unavailable',
        message: e instanceof Error ? e.message : 'unknown',
      });
    }
  }),
);

export default router;
