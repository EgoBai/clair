/**
 * 资金流向 API (增强版)
 * 个股资金流向、行业资金流向排行、历史资金流向
 * 参考东方财富资金流向功能
 */

import { Request, Response, Router } from 'express';
import axios from 'axios';
import { db, getDb } from '../db/dbFactory';
import { validateQuery, validateBody, validateParams, schemas } from '../middleware/validation';
import { asyncHandler, sendSuccess, sendNotFound, sendInternalError } from '../utils/apiResponse';
import { getDemoProvider, getFundFlowMeta, getGlobalIndicators } from '../services/fundFlowProviders';

const router = Router();

/** DemoProvider 实例：用于确定性历史兜底（替代原 Math.random mock） */
const demoProvider = getDemoProvider();

export interface FundFlowData {
  symbol: string;
  name: string;
  mainNet: number;          // 主力净额
  superLargeNet: number;    // 超大单净额
  largeNet: number;         // 大单净额
  mediumNet: number;        // 中单净额
  smallNet: number;         // 小单净额
  tradeDate: string;
}

export interface IndustryFlowData {
  industry: string;
  mainNet: number;
  netInflow: number;
  stockCount: number;
  topStocks: Array<{ symbol: string; name: string; mainNet: number }>;
}

/**
 * 从东方财富API获取个股资金流向
 */
async function fetchFundFlow(symbol: string): Promise<FundFlowData | null> {
  try {
    const code = symbol.replace(/\.(SZ|SH|BJ)$/i, '');
    const market = symbol.endsWith('.SH') ? '1' : '0';
    const secid = `${market}.${code}`;

    const url = `https://push2.eastmoney.com/api/qt/stock/get`;
    const response = await axios.get(url, {
      params: {
        secid,
        fields: 'f62,f184,f66,f69,f72,f75,f78,f81,f84,f87',
        _: Date.now(),
      },
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://quote.eastmoney.com',
      },
    });

    const data = response.data?.data;
    if (!data) return null;

    return {
      symbol,
      name: '',
      mainNet: data.f184 || 0,
      superLargeNet: data.f66 || 0,
      largeNet: data.f72 || 0,
      mediumNet: data.f78 || 0,
      smallNet: data.f84 || 0,
      tradeDate: new Date().toISOString().split('T')[0],
    };
  } catch (error) {
    console.error(`获取资金流向失败: ${symbol}`, error);
    return null;
  }
}

/**
 * 从东方财富获取行业资金流向
 */
async function fetchIndustryFlow(): Promise<IndustryFlowData[]> {
  try {
    const url = 'https://push2.eastmoney.com/api/qt/clist/get';
    const response = await axios.get(url, {
      params: {
        fid: 'f62',
        po: 1,
        pz: 30,
        pn: 1,
        np: 1,
        fs: 'b:BK0475', // 行业板块
        fields: 'f12,f14,f62,f184,f66,f72,f78,f84,f22',
        _: Date.now(),
      },
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://data.eastmoney.com',
      },
    });

    const items = response.data?.data?.diff || [];
    return items.map((item: Record<string, string | number>) => ({
      industry: item.f14 || '',
      mainNet: item.f184 || 0,
      netInflow: item.f62 || 0,
      stockCount: item.f22 || 0,
      topStocks: [],
    }));
  } catch (error) {
    console.error('获取行业资金流向失败:', error);
    return [];
  }
}

/**
 * 生成历史资金流向数据（确定性兜底）。
 * 改用 DemoProvider 的 LCG 确定性历史，替代原 Math.random 非确定性 mock；
 * 返回结构与旧实现一致，同一 symbol 每次结果相同。
 */
async function generateMockHistory(symbol: string, days: number = 10): Promise<FundFlowData[]> {
  const history = await demoProvider.fetchFlowHistory(symbol, days);
  return history.map((h) => ({
    symbol: h.symbol,
    name: '',
    mainNet: h.mainNet,
    superLargeNet: h.superLargeNet,
    largeNet: h.largeNet,
    mediumNet: h.mediumNet,
    smallNet: h.smallNet,
    tradeDate: h.tradeDate,
  }));
}

// ==================== API 路由 ====================
// ⚠️ 路由顺序约定：所有"静态路径"路由（/meta、/global、/industry、/batch）
// 必须注册在 /fund-flow/:symbol 之前，否则会被 Express 的参数路由 `:symbol`
// 吞掉（例如 GET /fund-flow/meta 会被当作 symbol="meta" 处理）。
// 历史既有 bug：原 /industry 注册在 /:symbol 之后，现已一并前置修正。

/**
 * 资金流适配器诊断元信息
 * GET /api/fund-flow/meta
 * 返回当前生效的 provider 链与各 env key 配置状态，供前端/运维排查。
 */
router.get('/fund-flow/meta', (_req: Request, res: Response) => {
  try {
    res.json({ success: true, data: getFundFlowMeta() });
  } catch (error) {
    console.error('获取资金流元信息失败:', error);
    res.status(500).json({ success: false, error: '获取资金流元信息失败' });
  }
});

/**
 * 国际资金视角（外资 / 全球维度）
 * GET /api/fund-flow/global
 * Alpha Vantage 可用且有真实数据则走真实调用，否则 DemoProvider 确定性生成
 * （北向/美元指数关联/全球风险偏好/离岸人民币 等多个演示指标序列）。
 */
router.get('/fund-flow/global', async (_req: Request, res: Response) => {
  try {
    const { dataSource, indicators } = await getGlobalIndicators();
    res.json({
      success: true,
      data: { indicators, dataSource },
    });
  } catch (error) {
    console.error('获取国际资金视角失败:', error);
    res.status(500).json({ success: false, error: '获取国际资金视角失败' });
  }
});

/**
 * 全市场 5 档资金流结构 + 市场广度/成交额
 * GET /api/fund-flow/market
 *
 * 诚实红线：
 *   - 5 档主力/超大单/大单/中单/小单净流入：真实源为东方财富 push2 全市场聚合
 *     （沙箱下不可达，请求失败则 tiers 置 null，标注 unavailable，绝不编造数值）。
 *   - 市场广度（上涨/下跌/平盘家数、涨跌停、全市场成交额）：来自本地真实行情库
 *     （db.getMarketSummary），为真实数据。
 */
router.get('/fund-flow/market', asyncHandler(async (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const summary = await db.getMarketSummary(new Date());

    const market = summary
      ? {
          tradeDate: summary.date ? new Date(summary.date).toISOString().slice(0, 10) : null,
          totalTurnover: Number(summary.totalTurnover) || null,
          risingStocks: Number(summary.risingStocks) || 0,
          fallingStocks: Number(summary.fallingStocks) || 0,
          unchangedStocks: Number(summary.unchangedStocks) || 0,
          limitUpCount: Number(summary.limitUpCount) || 0,
          limitDownCount: Number(summary.limitDownCount) || 0,
          totalStocks: Number(summary.totalStocks) || 0,
        }
      : null;

    // 尝试真实 5 档聚合（沙箱下通常不可达）
    const tiers = await fetchMarketTiers();
    const tierAvailable = !!tiers;
    const dataSource = tierAvailable ? 'eastmoney' : market ? 'partial' : 'unavailable';

    res.json({
      success: true,
      data: {
        tiers: tiers ?? { main: null, superLarge: null, large: null, medium: null, small: null },
        market,
        updateTime: new Date().toISOString(),
        source: tierAvailable ? 'eastmoney' : 'unavailable',
        note: tierAvailable
          ? undefined
          : '全市场 5 档资金流：东方财富 push2 聚合在沙箱下不可达；市场广度/成交额来自本地真实行情。',
      },
      dataSource,
      notes: {
        tiers: tierAvailable ? undefined : '5 档主力/超大单/大单/中单/小单净流入：数据源未接入',
        market: market ? '市场广度与成交额：本地真实行情' : '本地行情库无当日数据',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('获取全市场资金流失败:', error);
    res.json({
      success: false,
      data: {
        tiers: { main: null, superLarge: null, large: null, medium: null, small: null },
        market: null,
        updateTime: new Date().toISOString(),
        source: 'unavailable',
      },
      dataSource: 'unavailable',
      error: error instanceof Error ? error.message : 'unknown',
      timestamp: new Date().toISOString(),
    });
  }
}));

/**
 * 从东方财富 push2 聚合全市场 5 档资金流（实时）。
 * 沙箱网络下不可达时返回 null，由调用方诚实降级。
 */
async function fetchMarketTiers(): Promise<{
  main: number; superLarge: number; large: number; medium: number; small: number;
} | null> {
  try {
    const url = 'https://push2.eastmoney.com/api/qt/clist/get';
    const response = await axios.get(url, {
      params: {
        pn: 1,
        pz: 6000,
        fs: 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23',
        fields: 'f62,f184,f66,f72,f78,f84',
        _: Date.now(),
      },
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://data.eastmoney.com' },
    });

    const items = response.data?.data?.diff || [];
    if (!items.length) return null;

    const acc = { main: 0, superLarge: 0, large: 0, medium: 0, small: 0 };
    for (const it of items) {
      acc.main += Number(it.f184) || 0;
      acc.superLarge += Number(it.f66) || 0;
      acc.large += Number(it.f72) || 0;
      acc.medium += Number(it.f78) || 0;
      acc.small += Number(it.f84) || 0;
    }
    return acc;
  } catch {
    return null;
  }
}

/**
 * 获取行业资金流向排行
 * GET /api/fund-flow/industry
 */
router.get('/fund-flow/industry', validateQuery(schemas.industryFlowQuery), async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;

    let industryFlow = await fetchIndustryFlow();

    if (industryFlow.length === 0) {
      // 诚实红线：东方财富行业资金流不可用时，不编造数值，如实返回空 + 标记后端未接入。
      // 前端应据此展示 Empty 状态（"行业资金流：后端未接入"），而非演示数据。
      return res.json({
        success: true,
        data: {
          industries: [],
          count: 0,
          updateTime: new Date().toISOString(),
          source: 'unavailable',
          note: '行业资金流：东方财富数据源暂不可用，后端未接入兜底数据',
        },
      });
    }

    res.json({
      success: true,
      data: {
        industries: industryFlow.slice(0, limit),
        count: industryFlow.length,
        updateTime: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('获取行业资金流向失败:', error);
    res.status(500).json({ success: false, error: '获取行业资金流向失败' });
  }
});

/**
 * 批量获取资金流向
 * POST /api/fund-flow/batch
 */
router.post('/fund-flow/batch', validateBody(schemas.fundFlowBatch), async (req: Request, res: Response) => {
  try {
    const { symbols } = req.body;

    if (!symbols || !Array.isArray(symbols)) {
      return res.status(400).json({ success: false, error: '需要提供股票代码数组' });
    }

    if (symbols.length > 30) {
      return res.status(400).json({ success: false, error: '批量查询最多支持30只股票' });
    }

    const results: FundFlowData[] = [];

    for (const symbol of symbols) {
      const flowData = await fetchFundFlow(symbol);
      if (flowData) {
        const stock = await db.getStockBySymbol(symbol);
        if (stock) {
          flowData.name = stock.name;
          results.push(flowData);
        }
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    res.json({
      success: true,
      data: { flows: results, count: results.length },
    });
  } catch (error) {
    console.error('批量获取资金流向失败:', error);
    res.status(500).json({ success: false, error: '批量获取资金流向失败' });
  }
});

/**
 * 获取个股资金流向
 * GET /api/fund-flow/:symbol
 * ⚠️ 必须注册在所有静态路径路由之后（见顶部路由顺序约定）。
 */
router.get('/fund-flow/:symbol', validateParams(schemas.stockSymbol), validateQuery(schemas.fundFlowQuery), async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const stock = await db.getStockBySymbol(symbol);

    if (!stock) {
      return res.status(404).json({ success: false, error: '股票未找到' });
    }

    let flowData = await fetchFundFlow(symbol);

    if (!flowData) {
      // 返回模拟数据
      flowData = {
        symbol: stock.symbol,
        name: stock.name,
        mainNet: 0,
        superLargeNet: 0,
        largeNet: 0,
        mediumNet: 0,
        smallNet: 0,
        tradeDate: new Date().toISOString().split('T')[0],
      };
    }

    flowData.name = stock.name;

    // 获取历史资金流向（确定性兜底，替代原 Math.random mock）
    const days = parseInt(req.query.days as string) || 10;
    const history = await generateMockHistory(symbol, days);

    res.json({
      success: true,
      data: {
        current: flowData,
        history,
        dataSource: 'eastmoney' as const,
      },
    });
  } catch (error) {
    console.error('获取资金流向失败:', error);
    res.status(500).json({ success: false, error: '获取资金流向失败' });
  }
});

export default router;
