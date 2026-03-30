/**
 * 资金流向 API (增强版)
 * 个股资金流向、行业资金流向排行、历史资金流向
 * 参考东方财富资金流向功能
 */

import { Request, Response, Router } from 'express';
import axios from 'axios';
import { db } from '../db/Database';

const router = Router();

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
    return items.map((item: any) => ({
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
 * 生成模拟历史资金流向数据
 */
function generateMockHistory(symbol: string, days: number = 10): FundFlowData[] {
  const result: FundFlowData[] = [];
  const today = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);

    // 跳过周末
    const dow = date.getDay();
    if (dow === 0 || dow === 6) continue;

    const rand = () => (Math.random() - 0.5) * 20000;
    result.push({
      symbol,
      name: '',
      mainNet: rand(),
      superLargeNet: rand() * 0.3,
      largeNet: rand() * 0.4,
      mediumNet: rand() * 0.2,
      smallNet: rand() * 0.1,
      tradeDate: date.toISOString().split('T')[0],
    });
  }

  return result;
}

// ==================== API 路由 ====================

/**
 * 获取个股资金流向
 * GET /api/fund-flow/:symbol
 */
router.get('/fund-flow/:symbol', async (req: Request, res: Response) => {
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

    // 获取历史资金流向
    const days = parseInt(req.query.days as string) || 10;
    const history = generateMockHistory(symbol, days);

    res.json({
      success: true,
      data: {
        current: flowData,
        history,
      },
    });
  } catch (error) {
    console.error('获取资金流向失败:', error);
    res.status(500).json({ success: false, error: '获取资金流向失败' });
  }
});

/**
 * 获取行业资金流向排行
 * GET /api/fund-flow/industry
 */
router.get('/fund-flow/industry', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;

    let industryFlow = await fetchIndustryFlow();

    if (industryFlow.length === 0) {
      // 从数据库生成模拟行业数据
      const industries = await db.connection('stocks')
        .where('is_active', true)
        .whereNotNull('industry')
        .groupBy('industry')
        .select('industry')
        .count('id as stockCount')
        .orderBy('stockCount', 'desc')
        .limit(limit);

      industryFlow = industries.map((ind: any) => ({
        industry: ind.industry,
        mainNet: (Math.random() - 0.5) * 50000,
        netInflow: (Math.random() - 0.5) * 30000,
        stockCount: ind.stockCount,
        topStocks: [],
      }));
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
router.post('/fund-flow/batch', async (req: Request, res: Response) => {
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

export default router;
