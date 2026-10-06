/**
 * ETF 数据 API（真实源版）
 * - 实时行情：腾讯 qt.gtimg.cn（免key，GBK），价格/涨跌幅/成交额/总市值
 * - 单位净值(NAV) 与净值历史：东方财富 fundf10 lsjz（免 key），替换原 Math.random 模拟
 * - 静态分类（代码/名称/跟踪标的/费率）为公开事实参考目录，非模拟数据
 * - 遵守「诚实数据」红线：行情/净值源不可达 → 返回 dataSource:'unavailable'，绝不回填演示/正弦伪造
 *
 * 数据获取逻辑见 services/etfDataService.ts，本文件仅负责路由编排与诚实空降级。
 * 路由层 dataSource 必须按**实际可用性**判定：不能因为「拿到了列表」就无条件标 'real'，
 * 也不能顶层标 'real' 而行级字段是 0/null —— 那是本项目出现过的两级漂移。
 */

import { Router, Request, Response } from 'express';
import { validateQuery, validateParams, schemas } from '../middleware/validation';
import { asyncHandler, sendSuccess, sendNotFound } from '../utils/apiResponse';
import { toBareCode } from '../utils/symbolUtils';
import {
  getEtfList,
  getEtfDetail,
  getEtfNavHistory,
  EtfUnavailableError,
  type EtfItem,
} from '../services/etfDataService';

const router = Router();

/** 行情源标识：与 etfDataService 实际使用的源保持一致 */
const QUOTE_SOURCE = 'tencent';
/** 净值源标识：东财 fundf10（本机可达，未换源） */
const NAV_SOURCE = 'eastmoney-fund';

/** 列表级诚实契约：行情段与净值段分别标注，不可用字段不掩盖 */
function buildListEnvelope(data: EtfItem[]) {
  const quoted = data.filter((e) => e.price > 0).length;
  const navd = data.filter((e) => e.nav > 0).length;
  const premium = data.filter((e) => e.premiumRate !== null).length;
  // 行情是列表的主体：一只都取不到 → 整体 unavailable；部分缺失 → 标注 covered 比例
  const hasQuotes = quoted > 0;
  const notes: string[] = [];
  if (navd < data.length) notes.push(`${data.length - navd} 只净值源无数据（nav=0，premiumRate=null）`);
  if (quoted < data.length) notes.push(`${data.length - quoted} 只行情源无报价（price=0）`);
  return {
    quoteSource: QUOTE_SOURCE,
    navSource: NAV_SOURCE,
    quoteCoverage: `${quoted}/${data.length}`,
    navCoverage: `${navd}/${data.length}`,
    premiumCoverage: `${premium}/${data.length}`,
    ...(notes.length ? { notes: notes.join('；') } : {}),
    hasQuotes,
  };
}

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
      const env = buildListEnvelope(data);
      sendSuccess(res, {
        data,
        count: data.length,
        // 顶层与行级同源：行情真取到才标 real，否则 unavailable
        dataSource: env.hasQuotes ? 'real' : 'unavailable',
        ...(env.hasQuotes ? {} : { message: 'ETF 行情源未返回任何报价，列表价格字段不可用' }),
        ...env,
      });
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
 *
 * premiumRate 现为 number | null（缺真实净值/行情时诚实不可用），
 * 排序与切片**必须先剔除 null**，否则 null 会被当 0 排进榜单 = 伪造折溢价排名。
 */
router.get(
  '/premium/rank',
  asyncHandler(async (_req: Request, res: Response) => {
    try {
      const list = await getEtfList();
      const rated = list.filter((e): e is EtfItem & { premiumRate: number } => e.premiumRate !== null);
      const sorted = [...rated].sort((a, b) => b.premiumRate - a.premiumRate);
      if (sorted.length === 0) {
        sendSuccess(res, {
          data: { premium: [], discount: [] },
          count: 0,
          dataSource: 'unavailable',
          quoteSource: QUOTE_SOURCE,
          navSource: NAV_SOURCE,
          message: `无任何 ETF 同时具备真实行情与真实净值（${list.length} 只候选），无法计算折溢价排行；不以 0 冒充折溢价`,
        });
        return;
      }
      sendSuccess(res, {
        data: {
          premium: sorted.slice(0, 5).map((e) => ({ symbol: e.symbol, name: e.name, premiumRate: e.premiumRate })),
          discount: sorted.slice(-5).reverse().map((e) => ({ symbol: e.symbol, name: e.name, premiumRate: e.premiumRate })),
        },
        count: sorted.length,
        // 仅当覆盖全部候选时才敢标real，否则如实标 unavailable 并说明漏掉了多少
        dataSource: sorted.length === list.length ? 'real' : 'unavailable',
        quoteSource: QUOTE_SOURCE,
        navSource: NAV_SOURCE,
        ...(sorted.length === list.length
          ? {}
          : { message: `${list.length - sorted.length} 只 ETF 缺真实净值或行情（premiumRate=null），已排除出折溢价排行` }),
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
    const symbol = toBareCode(req.params.symbol);
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
    const symbol = toBareCode(req.params.symbol);
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
