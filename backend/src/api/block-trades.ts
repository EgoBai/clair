/**
 * 大宗交易 API（诚实数据版）
 *
 * 数据来源：真实源（东方财富大宗交易接口），经由 blockTradesDataService 获取。
 * 遵守「诚实数据」红线：
 *   - 不再使用任何硬编码 / 随机函数伪造数据；
 *   - 真实源不可达 → 捕获 BlockTradesUnavailableError，降级为 dataSource:'unavailable' 的诚实空，
 *     绝不回填伪造 / 随机记录；
 *   - 行业分布无法从真实源推导（真实接口不含行业字段、且无可靠的 symbol→行业映射），
 *     则诚实地返回空数组 industryDistribution: []，绝不随机编造行业。
 */

import { Router, Request, Response } from 'express';
import { queryCache } from '../utils/queryCache';
import { validateQuery, validateParams, schemas } from '../middleware/validation';
import { asyncHandler, sendSuccess } from '../utils/apiResponse';
import {
  getBlockTrades,
  normalizeSymbol,
  BlockTradesUnavailableError,
  BlockTrade,
} from '../services/blockTradesDataService';

const router = Router();

/** 为真实记录生成稳定 id（基于 代码+日期+序号，确定性，非随机） */
function withStableId(trades: BlockTrade[]): Array<BlockTrade & { id: string }> {
  return trades.map((t, i) => ({
    ...t,
    id: `${t.symbol}-${t.tradeDate}-${i + 1}`,
  }));
}

/** 统一降级为「诚实空」 */
function sendUnavailable(res: Response, payload: Record<string, unknown>): void {
  sendSuccess(res, { dataSource: 'unavailable', ...payload });
}

// 大宗交易列表
router.get(
  '/block-trades',
  validateQuery(schemas.blockTradeQuery),
  asyncHandler(async (req: Request, res: Response) => {
    const date = req.query.date as string;
    const symbol = req.query.symbol as string;
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;

    const cacheKey = `block-trades:${date || 'latest'}:${symbol || 'all'}`;

    try {
      const trades = await queryCache.query(
        cacheKey,
        () => getBlockTrades(date, symbol),
        300000
      );

      const sorted = [...trades].sort((a, b) => b.amount - a.amount);
      const total = sorted.length;
      const start = (page - 1) * pageSize;
      const paginated = withStableId(sorted.slice(start, start + pageSize));

      const totalAmount = sorted.reduce((sum, t) => sum + t.amount, 0);
      const totalVolume = sorted.reduce((sum, t) => sum + t.volume, 0);
      const avgDiscount = sorted.length
        ? Math.round((sorted.reduce((sum, t) => sum + t.discount, 0) / sorted.length) * 100) / 100
        : 0;
      const premiumCount = sorted.filter((t) => t.discount > 0).length;
      const discountCount = sorted.filter((t) => t.discount < 0).length;

      sendSuccess(res, {
        dataSource: 'realtime',
        trades: paginated,
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
        summary: {
          totalAmount,
          totalVolume,
          avgDiscount,
          premiumCount,
          discountCount,
          tradeCount: total,
        },
      });
    } catch (e) {
      if (e instanceof BlockTradesUnavailableError) {
        sendUnavailable(res, {
          trades: [],
          pagination: { page, pageSize, total: 0, totalPages: 0 },
          summary: {
            totalAmount: 0,
            totalVolume: 0,
            avgDiscount: 0,
            premiumCount: 0,
            discountCount: 0,
            tradeCount: 0,
          },
          message: e.message,
        });
        return;
      }
      throw e;
    }
  })
);

// 大宗交易统计概览
router.get(
  '/block-trades/overview',
  asyncHandler(async (_req: Request, res: Response) => {
    const cacheKey = 'block-trades:overview';
    const today = new Date().toISOString().slice(0, 10);

    try {
      const todayTrades = await queryCache.query(
        cacheKey,
        () => getBlockTrades(today),
        300000
      );

      const totalAmount = todayTrades.reduce((s, t) => s + t.amount, 0);

      // topBuyers：基于真实记录聚合（诚实，非随机编排）
      const buyerCount: Record<string, number> = {};
      todayTrades.forEach((t) => {
        if (t.buyer) buyerCount[t.buyer] = (buyerCount[t.buyer] || 0) + 1;
      });
      const topBuyers = Object.entries(buyerCount)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);

      // 行业分布：真实大宗交易接口不含行业字段，且无可靠的 symbol→行业 真实映射，
      // 故诚实地返回空数组，绝不随机编造行业。
      const industryDistribution: Array<{ industry: string; count: number; amount: number }> = [];

      sendSuccess(res, {
        dataSource: 'realtime',
        date: today,
        totalTrades: todayTrades.length,
        totalAmount,
        avgAmount: Math.round(totalAmount / (todayTrades.length || 1)),
        premiumTrades: todayTrades.filter((t) => t.discount > 0).length,
        discountTrades: todayTrades.filter((t) => t.discount < 0).length,
        flatTrades: todayTrades.filter((t) => t.discount === 0).length,
        topBuyers,
        industryDistribution,
      });
    } catch (e) {
      if (e instanceof BlockTradesUnavailableError) {
        sendUnavailable(res, {
          date: today,
          totalTrades: 0,
          totalAmount: 0,
          avgAmount: 0,
          premiumTrades: 0,
          discountTrades: 0,
          flatTrades: 0,
          topBuyers: [],
          industryDistribution: [],
          message: e.message,
        });
        return;
      }
      throw e;
    }
  })
);

// 个股大宗交易历史
router.get(
  '/block-trades/:symbol',
  validateParams(schemas.stockSymbol),
  validateQuery(schemas.blockTradeHistory),
  asyncHandler(async (req: Request, res: Response) => {
    const { symbol } = req.params;
    const days = parseInt(req.query.days as string) || 30;
    const cacheKey = `block-trades:stock:${symbol}:${days}`;

    try {
      const trades = await queryCache.query(
        cacheKey,
        async () => {
          // 逐日查询真实源并合并（日期范围由校验约束最大 365 天）
          const norm = normalizeSymbol(symbol);
          const digits = norm?.digits;
          const collected: BlockTrade[] = [];
          const today = new Date();
          for (let d = days - 1; d >= 0; d--) {
            const date = new Date(today);
            date.setDate(date.getDate() - d);
            const dateStr = date.toISOString().slice(0, 10);
            const dayTrades = await getBlockTrades(dateStr, symbol);
            collected.push(...dayTrades);
          }
          return collected
            .map((t, i) => ({ ...t, id: `${digits ?? t.symbol}-${i + 1}` }))
            .sort((a, b) => b.tradeDate.localeCompare(a.tradeDate));
        },
        600000
      );

      sendSuccess(res, {
        dataSource: 'realtime',
        symbol,
        trades,
        total: trades.length,
      });
    } catch (e) {
      if (e instanceof BlockTradesUnavailableError) {
        sendUnavailable(res, {
          symbol,
          trades: [],
          total: 0,
          message: e.message,
        });
        return;
      }
      throw e;
    }
  })
);

export default router;
