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
  getBlockTradesInRange,
  getLatestBlockTrades,
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

/**
 * 上游「源可达但当日无记录」的原始文案（东财 code=9201）。
 * 它与「源不可达」是**两种不同事实**，绝不可混为一谈：
 * 前者应诚实返回 realtime + 空数组，后者才是 unavailable。
 */
const UPSTREAM_EMPTY_MESSAGE = '返回数据为空';

/** 上游对用户无意义的参数类报错（东财 code=9501），转成可理解的真实原因。 */
const UPSTREAM_PARAM_MESSAGES = ['返回字段参数不能为空'];

function isUpstreamEmptySignal(message: string): boolean {
  return message.includes(UPSTREAM_EMPTY_MESSAGE);
}

/**
 * 把上游原始报错翻译为**对用户诚实**的原因描述。
 * 直接把「返回字段参数不能为空」透给用户是误导——它既不是用户参数问题，
 * 也不是页面无数据的原因，而是上游报表接口本身不可用。
 */
function describeUpstreamFailure(message: string): string {
  if (UPSTREAM_PARAM_MESSAGES.some((m) => message.includes(m))) {
    return '上游大宗交易报表接口不可用（东方财富报表接口返回异常，非请求参数问题）';
  }
  return message;
}

/**
 * 生成中文可展示的数据日期说明。
 * 休市日返回「今天 + 空数组」本身就是失真（会让人误以为当天零成交），
 * 故必须明确告知数据实际截至哪个交易日。
 */
function buildDataDateNote(tradeDate: string): string {
  const today = new Date().toISOString().slice(0, 10);
  if (!tradeDate) return '真实源暂无可用的大宗交易记录';
  if (tradeDate === today) return `数据截至 ${tradeDate}`;
  return `数据截至 ${tradeDate}（${today} 为休市日或当日无大宗交易）`;
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

    try {
      // 未指定日期时取真实源中最近一个**有成交的交易日**：
      // 休市日（如长假）按「今天」查必然为空，会被误读成当天零成交。
      const resolved = date
        ? { tradeDate: date, trades: await queryCache.query(`block-trades:${date}:${symbol || 'all'}`, () => getBlockTrades(date, symbol), 300000) }
        : await queryCache.query(`block-trades:latest:${symbol || 'all'}`, () => getLatestBlockTrades(symbol), 300000);
      const trades = resolved.trades;

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
        // 如实上报数据所属交易日；空态时回落为请求日期/今天
        date: resolved.tradeDate || date || new Date().toISOString().slice(0, 10),
        dataDateNote: buildDataDateNote(resolved.tradeDate || date),
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
        // 源可达但当日无成交 → 诚实空（realtime），不是「不可用」
        if (isUpstreamEmptySignal(e.message)) {
          sendSuccess(res, {
            dataSource: 'realtime',
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
            message: `${date || '最近交易日'} 真实源无大宗交易记录`,
          });
          return;
        }
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
          message: describeUpstreamFailure(e.message),
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
      // 概览代表「最近一个真实有成交的交易日」，不硬编码今天：
      // 长假/休市期间按今天查必然为空，会被误读成当天零成交。
      const { tradeDate, trades: todayTrades } = await queryCache.query(
        cacheKey,
        () => getLatestBlockTrades(),
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

      // 日期取自真实记录本身（tradeDate 来自上游首条记录），空态时回落为今天
      const reportedDate = tradeDate || today;

      sendSuccess(res, {
        dataSource: 'realtime',
        date: reportedDate,
        dataDateNote: buildDataDateNote(tradeDate),
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
          message: describeUpstreamFailure(e.message),
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
          // 单次区间查询取代逐日 N 次往返（days 上限 365，逐日会打爆上游）
          const norm = normalizeSymbol(symbol);
          const digits = norm?.digits;
          const today = new Date();
          const endDate = today.toISOString().slice(0, 10);
          const start = new Date(today);
          start.setDate(start.getDate() - (days - 1));
          const startDate = start.toISOString().slice(0, 10);

          const collected = await getBlockTradesInRange(symbol, startDate, endDate);
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
          message: describeUpstreamFailure(e.message),
        });
        return;
      }
      throw e;
    }
  })
);

export default router;
