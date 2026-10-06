/**
 * 市场实时总览（公开端点）
 * - 真实指数（上证/深证/创业）+ 涨跌分布，源自 services/realMarketData（腾讯财经 + 东方财富，免 key）
 * - 遵守「诚实数据」红线：指数源不可用直接返回 dataSource:'unavailable'，绝不回填演示/硬编码
 */
import { Router, Response } from 'express';
import { getRealMarketData } from '../services/realMarketData';
import {
  getKline,
  KlineUnavailableError,
  DEFAULT_KLINE_DAYS,
} from '../services/klineDataService';
import { queryCache } from '../utils/queryCache';
import { asyncHandler } from '../utils/apiResponse';

const router = Router();

/**
 * 诚实数据契约发送器（本文件统一出口）
 *
 * 为什么不用 sendSuccess：本项目「诚实数据红线」要求 **响应顶层** 有 dataSource，
 * 而 sendSuccess 只输出 { success, data, timestamp }，dataSource 会被埋在 data 里，
 * 前端无法与 { code, data } 形态的端点统一判定。
 *
 * 为什么顶层与 data 内**由同一个入参**写出：IP-20 曾踩过「两级 dataSource 互相矛盾」的坑
 * （顶层 real / 行级 unavailable）。这里让两处都从唯一的 dataSource 变量派生，
 * 结构上就不可能漂移。
 */
function sendHonest(
  res: Response,
  dataSource: 'real' | 'unavailable',
  data: Record<string, unknown>,
): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(200).json({
    success: true,
    dataSource,
    data: { ...data, dataSource },
    timestamp: new Date().toISOString(),
  });
}

router.get(
  '/realtime',
  asyncHandler(async (_req, res) => {
    try {
      const data = await getRealMarketData();
      sendHonest(res, 'real', data);
    } catch (e) {
      // 诚实降级：指数源失败时如实标注不可达，不编造数据
      sendHonest(res, 'unavailable', {
        error: e instanceof Error ? e.message : 'unknown',
        message: '真实指数源不可达：本端点不返回任何指数数值，请勿以 0 或空值当作行情',
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
      sendHonest(res, 'real', { symbol, ...data });
    } catch (e) {
      if (e instanceof KlineUnavailableError) {
        sendHonest(res, 'unavailable', {
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
