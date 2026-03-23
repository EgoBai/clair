/**
 * 资金流向 API
 * 提供个股和板块资金流向数据
 */

import { Request, Response, Router } from 'express';
import axios from 'axios';
import { db } from '../db/Database';

const router = Router();

export interface FundFlowData {
  symbol: string;
  name: string;
  mainInflow: number;      // 主力净流入
  mainOutflow: number;     // 主力净流出
  mainNet: number;         // 主力净额
  retailInflow: number;    // 散户净流入
  retailOutflow: number;   // 散户净流出
  retailNet: number;       // 散户净额
  superLargeInflow: number; // 超大单净流入
  largeInflow: number;      // 大单净流入
  mediumInflow: number;     // 中单净流入
  smallInflow: number;      // 小单净流入
  tradeDate: string;
}

/**
 * 从东方财富API获取资金流向数据
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
        fields: 'f62,f184,f66,f69,f72,f75,f78,f81,f84,f87,f64,f65,f70,f71,f76,f77,f82,f83',
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
      mainInflow: data.f62 || 0,
      mainOutflow: 0,
      mainNet: data.f184 || 0,
      retailInflow: 0,
      retailOutflow: 0,
      retailNet: 0,
      superLargeInflow: data.f66 || 0,
      largeInflow: data.f72 || 0,
      mediumInflow: data.f78 || 0,
      smallInflow: data.f84 || 0,
      tradeDate: new Date().toISOString().split('T')[0],
    };
  } catch (error) {
    console.error(`获取资金流向失败: ${symbol}`, error);
    return null;
  }
}

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

    const flowData = await fetchFundFlow(symbol);

    if (!flowData) {
      // 返回模拟数据
      return res.json({
        success: true,
        data: {
          symbol: stock.symbol,
          name: stock.name,
          mainNet: 0,
          superLargeInflow: 0,
          largeInflow: 0,
          mediumInflow: 0,
          smallInflow: 0,
          tradeDate: new Date().toISOString().split('T')[0],
          note: '资金流向数据暂时不可用',
        },
      });
    }

    flowData.name = stock.name;

    res.json({
      success: true,
      data: flowData,
    });
  } catch (error) {
    console.error('获取资金流向失败:', error);
    res.status(500).json({
      success: false,
      error: '获取资金流向失败',
      details: error instanceof Error ? error.message : '未知错误',
    });
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

    if (symbols.length > 50) {
      return res.status(400).json({ success: false, error: '批量查询最多支持50只股票' });
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
      // 延迟避免限流
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    res.json({
      success: true,
      data: {
        flows: results,
        count: results.length,
      },
    });
  } catch (error) {
    console.error('批量获取资金流向失败:', error);
    res.status(500).json({
      success: false,
      error: '批量获取资金流向失败',
      details: error instanceof Error ? error.message : '未知错误',
    });
  }
});

export default router;
