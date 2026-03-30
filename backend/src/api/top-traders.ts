/**
 * 龙虎榜 API
 * 龙虎榜数据、席位分析、上榜统计
 * 参考东方财富龙虎榜功能
 */

import { Request, Response, Router } from 'express';
import type { TopTraderRecord, TopTraderEntry, TopTraderOverview } from '../../shared/types';

const router = Router();

// 常见营业部名称
const BROKER_SEATS = [
  '华泰证券深圳益田路荣超商务中心',
  '国泰君安证券上海江苏路',
  '东方财富证券拉萨团结路第二',
  '中国银河证券绍兴',
  '中信证券上海溧阳路',
  '财通证券杭州上塘路',
  '光大证券佛山绿景路',
  '华鑫证券上海宛平南路',
  '申万宏源证券上海闵行区东川路',
  '招商证券深圳蛇口招商南路',
  '机构专用-1',
  '机构专用-2',
  '机构专用-3',
];

// 上榜原因
const REASONS = [
  '日涨幅偏离值达7%',
  '日跌幅偏离值达7%',
  '日振幅值达15%',
  '日换手率达20%',
  '连续三个交易日涨幅偏离值累计达20%',
  '无价格涨跌幅限制的证券',
];

// 生成模拟龙虎榜记录
function generateTopTraderRecord(symbol: string, name: string): TopTraderRecord {
  const buyTotal = parseFloat((5e7 + Math.random() * 2e9).toFixed(2));
  const sellTotal = parseFloat((4e7 + Math.random() * 1.8e9).toFixed(2));
  const changePercent = parseFloat((Math.random() * 20 - 10).toFixed(2));

  const entries: TopTraderEntry[] = BROKER_SEATS.slice(0, 10).map((seat, i) => {
    const buyAmount = parseFloat((1e7 + Math.random() * 5e8).toFixed(2));
    const sellAmount = parseFloat((5e6 + Math.random() * 4e8).toFixed(2));
    return {
      rank: i + 1,
      seatName: seat,
      buyAmount,
      sellAmount,
      netAmount: parseFloat((buyAmount - sellAmount).toFixed(2)),
      symbol,
      name,
      reason: REASONS[Math.floor(Math.random() * REASONS.length)],
      isOrganizational: seat.startsWith('机构'),
    };
  });

  return {
    symbol,
    name,
    tradeDate: new Date().toISOString().split('T')[0],
    closePrice: parseFloat((10 + Math.random() * 190).toFixed(2)),
    changePercent,
    turnover: parseFloat((1e8 + Math.random() * 5e9).toFixed(2)),
    reason: REASONS[Math.floor(Math.random() * REASONS.length)],
    buyTotal,
    sellTotal,
    netTotal: parseFloat((buyTotal - sellTotal).toFixed(2)),
    entries,
  };
}

// 生成龙虎榜概览
function generateTopTraderOverview(date?: string): TopTraderOverview {
  const stocks = [
    { symbol: '600519.SH', name: '贵州茅台', reason: '日涨幅偏离值达7%' },
    { symbol: '000858.SZ', name: '五粮液', reason: '日换手率达20%' },
    { symbol: '300750.SZ', name: '宁德时代', reason: '日振幅值达15%' },
    { symbol: '002594.SZ', name: '比亚迪', reason: '连续三个交易日涨幅偏离值累计达20%' },
    { symbol: '601012.SH', name: '隆基绿能', reason: '日跌幅偏离值达7%' },
  ];

  return {
    tradeDate: date || new Date().toISOString().split('T')[0],
    totalStocks: 15 + Math.floor(Math.random() * 20),
    buyDominantCount: 8 + Math.floor(Math.random() * 10),
    sellDominantCount: 5 + Math.floor(Math.random() * 8),
    totalBuyAmount: parseFloat((1e10 + Math.random() * 5e10).toFixed(2)),
    totalSellAmount: parseFloat((8e9 + Math.random() * 4e10).toFixed(2)),
    totalNetAmount: parseFloat((Math.random() * 1e10 - 5e9).toFixed(2)),
    topBuyStocks: stocks.slice(0, 3).map(s => ({
      ...s,
      netAmount: parseFloat((Math.random() * 2e9).toFixed(2)),
    })),
    topSellStocks: stocks.slice(3).map(s => ({
      ...s,
      netAmount: parseFloat((-Math.random() * 1.5e9).toFixed(2)),
    })),
    industryDistribution: {
      '白酒': 3, '新能源': 4, '半导体': 2, '银行': 1, '医药': 2, '消费电子': 1,
    },
  };
}

// 龙虎榜概览
router.get('/top-traders/overview', (req: Request, res: Response) => {
  try {
    const date = req.query.date as string;
    const data = generateTopTraderOverview(date);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: '获取龙虎榜概览失败' });
  }
});

// 个股龙虎榜
router.get('/top-traders/:symbol', (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const name = req.query.name as string || '未知';
    const data = generateTopTraderRecord(symbol, name);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: '获取龙虎榜数据失败' });
  }
});

// 龙虎榜历史
router.get('/top-traders/history/:symbol', (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const days = parseInt(req.query.days as string) || 10;
    const name = req.query.name as string || '未知';

    const records: TopTraderRecord[] = [];
    for (let i = 0; i < Math.min(days, 30); i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const record = generateTopTraderRecord(symbol, name);
      record.tradeDate = date.toISOString().split('T')[0];
      records.push(record);
    }

    res.json({ success: true, data: { symbol, records } });
  } catch (error) {
    res.status(500).json({ success: false, error: '获取龙虎榜历史失败' });
  }
});

// 营业部排行
router.get('/top-traders/seat/rank', (_req: Request, res: Response) => {
  try {
    const count = parseInt(_req.query.count as string) || 20;
    const rank = BROKER_SEATS.slice(0, Math.min(count, BROKER_SEATS.length)).map((seat, i) => ({
      rank: i + 1,
      seatName: seat,
      totalBuyAmount: parseFloat((5e8 + Math.random() * 5e9).toFixed(2)),
      totalSellAmount: parseFloat((4e8 + Math.random() * 4e9).toFixed(2)),
      netAmount: parseFloat((Math.random() * 2e9 - 1e9).toFixed(2)),
      appearCount: Math.floor(3 + Math.random() * 20),
      isOrganizational: seat.startsWith('机构'),
    }));

    res.json({ success: true, data: { rank } });
  } catch (error) {
    res.status(500).json({ success: false, error: '获取营业部排行失败' });
  }
});

export { generateTopTraderRecord, generateTopTraderOverview };
export default router;
