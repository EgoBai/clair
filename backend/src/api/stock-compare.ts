/**
 * 股票对比分析 API
 * 多指标雷达图 + 横向对比
 */

import { Request, Response, Router } from 'express';
import { validateQuery, validateParams, schemas } from '../middleware/validation';
import { asyncHandler, sendSuccess, sendNotFound, sendInternalError } from '../utils/apiResponse';

const router = Router();

interface CompareMetric {
  label: string;
  key: string;
  unit: string;
  higher: 'better' | 'worse' | 'neutral';
}

const COMPARE_METRICS: CompareMetric[] = [
  { label: '市盈率(PE)', key: 'pe', unit: '倍', higher: 'worse' },
  { label: '市净率(PB)', key: 'pb', unit: '倍', higher: 'worse' },
  { label: '净资产收益率(ROE)', key: 'roe', unit: '%', higher: 'better' },
  { label: '毛利率', key: 'grossMargin', unit: '%', higher: 'better' },
  { label: '净利率', key: 'netMargin', unit: '%', higher: 'better' },
  { label: '营收增长率', key: 'revenueGrowth', unit: '%', higher: 'better' },
  { label: '净利润增长率', key: 'profitGrowth', unit: '%', higher: 'better' },
  { label: '资产负债率', key: 'debtRatio', unit: '%', higher: 'worse' },
  { label: '流动比率', key: 'currentRatio', unit: '倍', higher: 'better' },
  { label: '股息率', key: 'dividendYield', unit: '%', higher: 'better' },
];

function generateStockMetrics(symbol: string, name: string) {
  const seed = symbol.charCodeAt(0) + symbol.charCodeAt(1);
  return {
    symbol,
    name,
    metrics: {
      pe: +(10 + (seed % 40)).toFixed(2),
      pb: +(0.5 + (seed % 8) * 0.5).toFixed(2),
      roe: +(5 + (seed % 25)).toFixed(2),
      grossMargin: +(15 + (seed % 50)).toFixed(2),
      netMargin: +(5 + (seed % 30)).toFixed(2),
      revenueGrowth: +(seed % 60 - 15).toFixed(2),
      profitGrowth: +(seed % 70 - 20).toFixed(2),
      debtRatio: +(20 + (seed % 50)).toFixed(2),
      currentRatio: +(0.8 + (seed % 5) * 0.3).toFixed(2),
      dividendYield: +(0.5 + (seed % 6)).toFixed(2),
    },
    radarScores: {
      profitability: +(40 + (seed % 55)).toFixed(1),
      growth: +(30 + (seed % 60)).toFixed(1),
      valuation: +(35 + (seed % 50)).toFixed(1),
      stability: +(45 + (seed % 45)).toFixed(1),
      cashflow: +(30 + (seed % 55)).toFixed(1),
      dividend: +(20 + (seed % 60)).toFixed(1),
    },
    price: +(10 + (seed % 200)).toFixed(2),
    changePercent: +(seed % 20 - 10).toFixed(2),
    marketCap: +((seed % 500 + 50) * 100).toFixed(2),
    volume: +((seed % 100 + 10) * 10000).toFixed(0),
  };
}

/**
 * 获取股票对比数据
 * GET /api/compare?symbols=600519,000858,000001
 */
router.get('/compare', validateQuery(schemas.batchQuotes), async (req: Request, res: Response) => {
  try {
    const symbolsParam = (req.query.symbols as string) || '600519,000858,000001';
    const symbols = symbolsParam.split(',').map(s => s.trim()).slice(0, 5); // 最多5只

    const stockNames: Record<string, string> = {
      '600519': '贵州茅台', '000858': '五粮液', '000001': '平安银行',
      '000333': '美的集团', '000651': '格力电器', '002415': '海康威视',
      '601318': '中国平安', '600036': '招商银行', '002594': '比亚迪',
      '300750': '宁德时代', '601012': '隆基绿能', '002714': '牧原股份',
    };

    const stocks = symbols.map(symbol => {
      const name = stockNames[symbol] || `股票${symbol}`;
      return generateStockMetrics(symbol, name);
    });

    res.json({
      success: true,
      data: {
        stocks,
        metrics: COMPARE_METRICS,
        count: stocks.length,
      },
    });
  } catch (error) {
    console.error('获取对比数据失败:', error);
    res.status(500).json({ success: false, message: '获取对比数据失败' });
  }
});

/**
 * 获取雷达图数据（归一化 0-100）
 * GET /api/compare/radar?symbols=600519,000858
 */
router.get('/compare/radar', validateQuery(schemas.batchQuotes), async (req: Request, res: Response) => {
  try {
    const symbolsParam = (req.query.symbols as string) || '600519,000858';
    const symbols = symbolsParam.split(',').map(s => s.trim()).slice(0, 5);

    const stockNames: Record<string, string> = {
      '600519': '贵州茅台', '000858': '五粮液', '000001': '平安银行',
      '000333': '美的集团', '000651': '格力电器', '002415': '海康威视',
    };

    const indicators = [
      { key: 'profitability', label: '盈利能力', fullMark: 100 },
      { key: 'growth', label: '成长能力', fullMark: 100 },
      { key: 'valuation', label: '估值水平', fullMark: 100 },
      { key: 'stability', label: '财务稳健', fullMark: 100 },
      { key: 'cashflow', label: '现金流', fullMark: 100 },
      { key: 'dividend', label: '分红能力', fullMark: 100 },
    ];

    const radarData = symbols.map(symbol => {
      const stock = generateStockMetrics(symbol, stockNames[symbol] || symbol);
      return {
        symbol,
        name: stock.name,
        scores: stock.radarScores,
      };
    });

    res.json({
      success: true,
      data: {
        indicators,
        stocks: radarData,
      },
    });
  } catch (error) {
    console.error('获取雷达图数据失败:', error);
    res.status(500).json({ success: false, message: '获取雷达图数据失败' });
  }
});

export default router;
