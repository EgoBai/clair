/**
 * 行业板块深度分析 API
 * 成分股、权重、估值、资金流向
 */

import { Request, Response, Router } from 'express';

const router = Router();

interface SectorStock {
  symbol: string;
  name: string;
  weight: number;
  price: number;
  changePercent: number;
  marketCap: number;
  pe: number;
  pb: number;
  turnover: number;
}

interface SectorDetail {
  name: string;
  code: string;
  stockCount: number;
  totalMarketCap: number;
  avgPE: number;
  avgPB: number;
  avgROE: number;
  changePercent: number;
  turnover: number;
  fundFlow: number;
  topStocks: SectorStock[];
  peDistribution: { range: string; count: number }[];
  marketCapDistribution: { range: string; count: number; total: number }[];
}

const SECTORS: Record<string, SectorDetail> = {};

function initSectors() {
  const sectorDefs = [
    { name: '白酒', code: 'BJ', stocks: [
      { symbol: '600519', name: '贵州茅台', weight: 35 },
      { symbol: '000858', name: '五粮液', weight: 20 },
      { symbol: '002304', name: '洋河股份', weight: 10 },
      { symbol: '000568', name: '泸州老窖', weight: 10 },
      { symbol: '000596', name: '古井贡酒', weight: 5 },
    ]},
    { name: '新能源汽车', code: 'NEV', stocks: [
      { symbol: '300750', name: '宁德时代', weight: 25 },
      { symbol: '002594', name: '比亚迪', weight: 20 },
      { symbol: '002466', name: '天齐锂业', weight: 10 },
      { symbol: '002460', name: '赣锋锂业', weight: 8 },
      { symbol: '603799', name: '华友钴业', weight: 7 },
    ]},
    { name: '半导体', code: 'SEMI', stocks: [
      { symbol: '688981', name: '中芯国际', weight: 20 },
      { symbol: '002371', name: '北方华创', weight: 15 },
      { symbol: '688012', name: '中微公司', weight: 10 },
      { symbol: '603501', name: '韦尔股份', weight: 8 },
      { symbol: '300782', name: '卓胜微', weight: 7 },
    ]},
    { name: '银行', code: 'BANK', stocks: [
      { symbol: '601398', name: '工商银行', weight: 15 },
      { symbol: '601939', name: '建设银行', weight: 12 },
      { symbol: '600036', name: '招商银行', weight: 12 },
      { symbol: '601288', name: '农业银行', weight: 10 },
      { symbol: '601988', name: '中国银行', weight: 8 },
    ]},
    { name: '医药', code: 'MED', stocks: [
      { symbol: '600276', name: '恒瑞医药', weight: 12 },
      { symbol: '300760', name: '迈瑞医疗', weight: 12 },
      { symbol: '000538', name: '云南白药', weight: 8 },
      { symbol: '603259', name: '药明康德', weight: 10 },
      { symbol: '002821', name: '凯莱英', weight: 6 },
    ]},
    { name: '光伏', code: 'PV', stocks: [
      { symbol: '601012', name: '隆基绿能', weight: 18 },
      { symbol: '300274', name: '阳光电源', weight: 15 },
      { symbol: '688599', name: '天合光能', weight: 10 },
      { symbol: '002129', name: '中环股份', weight: 10 },
      { symbol: '603806', name: '福斯特', weight: 6 },
    ]},
    { name: '消费电子', code: 'CE', stocks: [
      { symbol: '002415', name: '海康威视', weight: 15 },
      { symbol: '002475', name: '立讯精密', weight: 14 },
      { symbol: '601231', name: '环旭电子', weight: 8 },
      { symbol: '002241', name: '歌尔股份', weight: 8 },
      { symbol: '002236', name: '大华股份', weight: 6 },
    ]},
    { name: '地产', code: 'RE', stocks: [
      { symbol: '000002', name: '万科A', weight: 15 },
      { symbol: '600048', name: '保利发展', weight: 14 },
      { symbol: '001979', name: '招商蛇口', weight: 10 },
      { symbol: '600383', name: '金地集团', weight: 7 },
      { symbol: '600606', name: '绿地控股', weight: 6 },
    ]},
  ];

  sectorDefs.forEach(def => {
    const seed = def.code.charCodeAt(0);
    const topStocks: SectorStock[] = def.stocks.map(s => ({
      ...s,
      price: +(10 + (seed + s.symbol.charCodeAt(0)) % 200).toFixed(2),
      changePercent: +(seed % 20 - 10 + s.symbol.charCodeAt(0) % 10 - 5).toFixed(2),
      marketCap: +((seed % 500 + 50) * s.weight * 10).toFixed(2),
      pe: +(8 + (seed % 40)).toFixed(2),
      pb: +(0.8 + (seed % 6) * 0.5).toFixed(2),
      turnover: +(2 + (seed % 10)).toFixed(2),
    }));

    const avgPE = +(topStocks.reduce((s, t) => s + t.pe, 0) / topStocks.length).toFixed(2);
    const avgPB = +(topStocks.reduce((s, t) => s + t.pb, 0) / topStocks.length).toFixed(2);

    SECTORS[def.code] = {
      name: def.name,
      code: def.code,
      stockCount: def.stocks.length * 8 + (seed % 30),
      totalMarketCap: +(topStocks.reduce((s, t) => s + t.marketCap, 0) * 1.5).toFixed(2),
      avgPE,
      avgPB,
      avgROE: +(avgPB / avgPE * 100).toFixed(2),
      changePercent: +(seed % 15 - 7).toFixed(2),
      turnover: +(1 + (seed % 8)).toFixed(2),
      fundFlow: +(seed % 100 - 50).toFixed(2),
      topStocks,
      peDistribution: [
        { range: '<10', count: seed % 10 + 2 },
        { range: '10-20', count: seed % 15 + 5 },
        { range: '20-30', count: seed % 12 + 3 },
        { range: '30-50', count: seed % 8 + 2 },
        { range: '>50', count: seed % 5 + 1 },
      ],
      marketCapDistribution: [
        { range: '<100亿', count: seed % 20 + 5, total: +(seed % 500 + 200).toFixed(2) },
        { range: '100-500亿', count: seed % 10 + 3, total: +(seed % 1500 + 500).toFixed(2) },
        { range: '500-1000亿', count: seed % 5 + 1, total: +(seed % 3000 + 1000).toFixed(2) },
        { range: '>1000亿', count: seed % 3 + 1, total: +(seed % 5000 + 2000).toFixed(2) },
      ],
    };
  });
}

initSectors();

/**
 * 获取行业板块列表
 * GET /api/sectors/analysis
 */
router.get('/sectors/analysis', async (_req: Request, res: Response) => {
  try {
    const list = Object.values(SECTORS).map(s => ({
      name: s.name,
      code: s.code,
      stockCount: s.stockCount,
      avgPE: s.avgPE,
      avgPB: s.avgPB,
      avgROE: s.avgROE,
      changePercent: s.changePercent,
      totalMarketCap: s.totalMarketCap,
      turnover: s.turnover,
      fundFlow: s.fundFlow,
    }));

    list.sort((a, b) => b.changePercent - a.changePercent);

    res.json({
      success: true,
      data: {
        sectors: list,
        summary: {
          totalSectors: list.length,
          upCount: list.filter(s => s.changePercent > 0).length,
          downCount: list.filter(s => s.changePercent < 0).length,
          avgChange: +(list.reduce((s, d) => s + d.changePercent, 0) / list.length).toFixed(2),
          topGainer: list[0]?.name,
          topLoser: list[list.length - 1]?.name,
        },
      },
    });
  } catch (error) {
    console.error('获取行业板块失败:', error);
    res.status(500).json({ success: false, message: '获取行业板块失败' });
  }
});

/**
 * 获取行业板块详情
 * GET /api/sectors/analysis/:code
 */
router.get('/sectors/analysis/:code', async (req: Request, res: Response) => {
  try {
    const sector = SECTORS[req.params.code.toUpperCase()];
    if (!sector) {
      return res.status(404).json({ success: false, message: '行业板块不存在' });
    }

    res.json({
      success: true,
      data: sector,
    });
  } catch (error) {
    console.error('获取板块详情失败:', error);
    res.status(500).json({ success: false, message: '获取板块详情失败' });
  }
});

export default router;
