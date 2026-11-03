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
import {
  getIndexTech,
  getIndexConstituents,
  getIndexTopMovers,
  IndexDataUnavailableError,
} from '../services/indexDataService';
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
 *
 * 【三态语义（#107-C7）】取值沿用项目既有枚举，不自创：
 *   - 'real'        本端点供的数全部是真实值
 *   - 'partial'     真拿到一部分，另一部分缺失（如：三大指数真实、涨跌分布 null）
 *   - 'unavailable' 一条真实数据都没拿到
 * 'partial' 必须配 unavailableReason 说明**缺的是哪一段**，否则下游只知道「部分缺」却无法处置。
 * 字段名沿用 hkConnect.ts / margin.ts 既有约定 unavailableReason（不新造 availableReason）。
 */
function sendHonest(
  res: Response,
  dataSource: 'real' | 'partial' | 'unavailable',
  data: Record<string, unknown>,
  unavailableReason?: string,
): void {
  // 顶层与 data 内同源同值：结构上不可能出现「顶层 partial / 行级 real」这类漂移
  const honestFields = {
    dataSource,
    ...(unavailableReason ? { unavailableReason } : {}),
  };
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(200).json({
    success: true,
    ...honestFields,
    data: { ...data, ...honestFields },
    timestamp: new Date().toISOString(),
  });
}

router.get(
  '/realtime',
  asyncHandler(async (_req, res) => {
    try {
      const data = await getRealMarketData();
      // RealMarketData 为具体 interface（无索引签名），不能直接赋给 Record<string, unknown>；
      // 展开为普通对象即可，字段与运行期行为完全不变。
      //
      // 【#107-C7】getRealMarketData() 的契约是「三大指数必返回（失败即抛）+ 涨跌分布可选
      // （fetchBreadth 失败 → breadth=null）」。旧实现无条件标 'real'，于是 breadth:null 的
      // 响应仍对外声称「全部真实」——涨跌家数/成交额/涨跌停全不可用却带 real 背书。
      // 现按实际可用性分档：指数真实 + 广度缺失 = 'partial'，并说明缺的是哪一段。
      const breadthMissing = data.breadth === null;
      sendHonest(
        res,
        breadthMissing ? 'partial' : 'real',
        { ...data },
        breadthMissing
          ? '涨跌分布数据源不可达（breadth=null）：三大指数为真实值；上涨/下跌/涨停家数与成交额不可用'
          : undefined,
      );
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
      // KlineData 自带归一化后的 symbol（getKline 返回 norm.digits），
      // 原 `{ symbol, ...data }` 会让 data.symbol 静默覆盖入参 symbol。
      // 此处显式以 data.symbol 为准，行为与改前完全一致，仅消除 TS2783 重复键告警。
      sendHonest(res, 'real', { ...data, symbol: data.symbol ?? symbol });
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

// ==================== 指数详情页三件套（技术分析 / 成分股 / 成分股涨跌榜） ====================
// 契约与降级语义见 services/indexDataService.ts 头注释；
// 任一真实源不可得 → dataSource:'unavailable' + 中文 message（HTTP 200，诚实空，不抛 500）。

router.get(
  '/index-tech/:symbol',
  asyncHandler(async (req, res) => {
    const symbol = req.params.symbol || '';
    try {
      const data = await queryCache.query(
        `market:index-tech:${symbol}`,
        () => getIndexTech(symbol),
        10 * 60 * 1000, // 技术指标随日线变动，TTL 10 分钟
      );
      sendHonest(res, 'real', { ...data });
    } catch (e) {
      if (e instanceof IndexDataUnavailableError) {
        sendHonest(res, 'unavailable', {
          indexSymbol: symbol,
          message: e.message,
        });
        return;
      }
      throw e;
    }
  }),
);

router.get(
  '/index-constituents/:symbol',
  asyncHandler(async (req, res) => {
    const symbol = req.params.symbol || '';
    try {
      const data = await getIndexConstituents(symbol);
      sendHonest(res, 'real', { ...data });
    } catch (e) {
      if (e instanceof IndexDataUnavailableError) {
        sendHonest(res, 'unavailable', {
          indexSymbol: symbol,
          message: e.message,
        });
        return;
      }
      throw e;
    }
  }),
);

router.get(
  '/index-top-movers/:symbol',
  asyncHandler(async (req, res) => {
    const symbol = req.params.symbol || '';
    const rawLimit = parseInt(req.query.limit as string, 10);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 50) : 10;
    try {
      const data = await queryCache.query(
        `market:index-movers:${symbol}:${limit}`,
        () => getIndexTopMovers(symbol, limit),
        5 * 60 * 1000, // 榜单随当日行情变动，TTL 5 分钟
      );
      sendHonest(res, 'real', { ...data });
    } catch (e) {
      if (e instanceof IndexDataUnavailableError) {
        sendHonest(res, 'unavailable', {
          indexSymbol: symbol,
          message: e.message,
        });
        return;
      }
      throw e;
    }
  }),
);

export default router;
