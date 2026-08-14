/**
 * 市场实时总览（公开端点）
 * - 真实指数（上证/深证/创业）+ 涨跌分布，源自 services/realMarketData（腾讯财经 + 东方财富，免 key）
 * - 遵守「诚实数据」红线：指数源不可用直接返回 dataSource:'unavailable'，绝不回填演示/硬编码
 */
import { Router } from 'express';
import { getRealMarketData } from '../services/realMarketData';
import {
  getKline,
  KlineUnavailableError,
  DEFAULT_KLINE_DAYS,
} from '../services/klineDataService';
import { queryCache } from '../utils/queryCache';
import { asyncHandler, sendSuccess } from '../utils/apiResponse';

const router = Router();

router.get(
  '/realtime',
  asyncHandler(async (_req, res) => {
    try {
      const data = await getRealMarketData();
      sendSuccess(res, { ...data, dataSource: 'real' });
    } catch (e) {
      // 诚实降级：指数源失败时如实标注不可达，不编造数据
      sendSuccess(res, {
        dataSource: 'unavailable',
        error: e instanceof Error ? e.message : 'unknown',
      });
    }
  }),
);

// 历史日线 K 线（真实源：东方财富 push2his，日线 + 前复权）
// 契约：GET /api/market/kline?symbol=600519|600519.SH|SH600519&days=250
// 成功：{ symbol, dataSource:'real', dates[], opens[], highs[], lows[], prices[], volumes[], amounts[] }
// 源不可达/参数非法：dataSource:'unavailable' + 空数组 + message（诚实空，HTTP 200）
router.get(
  '/kline',
  asyncHandler(async (req, res) => {
    const symbol = (req.query.symbol as string) || '';
    const rawDays = parseInt(req.query.days as string, 10);
    const days = Number.isFinite(rawDays) && rawDays > 0 ? rawDays : DEFAULT_KLINE_DAYS;
    const cacheKey = `market:kline:${symbol}:${days}`;
    const empty = {
      dates: [] as string[],
      opens: [] as number[],
      highs: [] as number[],
      lows: [] as number[],
      prices: [] as number[],
      volumes: [] as number[],
      amounts: [] as number[],
    };

    try {
      const data = await queryCache.query(
        cacheKey,
        () => getKline(symbol, days),
        10 * 60 * 1000 // 日线数据 TTL 10 分钟
      );
      sendSuccess(res, { dataSource: 'real', ...data });
    } catch (e) {
      if (e instanceof KlineUnavailableError) {
        sendSuccess(res, {
          dataSource: 'unavailable',
          symbol,
          ...empty,
          message: e.message,
        });
        return;
      }
      throw e;
    }
  }),
);

export default router;
