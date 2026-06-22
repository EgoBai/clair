/**
 * 行业分类API — 申万2021二级行业（134类）
 */
import { Router, Request, Response } from 'express';
import asyncHandler from '../utils/asyncHandler';
import { getDb } from '../db/dbFactory';
import {
  SW_INDUSTRY_MAP, getAllSubIndustries,
  classifySubIndustry, getSubIndustries,
} from '../../../shared/industryClassification';

const router = Router();

// 完整行业树
router.get('/industries', asyncHandler(async (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      standard: '申万2021',
      primaryCount: Object.keys(SW_INDUSTRY_MAP).length,
      subCount: getAllSubIndustries().length,
      tree: SW_INDUSTRY_MAP,
    },
  });
}));

// 所有二级行业
router.get('/industries/sub', asyncHandler(async (_req: Request, res: Response) => {
  res.json({ success: true, data: getAllSubIndustries() });
}));

// 某一级下的子行业
router.get('/industries/:industry/sub', asyncHandler(async (req: Request, res: Response) => {
  const subs = getSubIndustries(req.params.industry);
  if (subs.length === 0) {
    res.status(404).json({ success: false, error: `未找到行业: ${req.params.industry}` });
    return;
  }
  res.json({ success: true, data: subs });
}));

// 子行业景气度（实时计算）
router.get('/industries/sub-sector/momentum', asyncHandler(async (_req: Request, res: Response) => {
  const db = getDb();
  
  // 获取板块景气度（一级行业粒度）
  const scores = await db.getSectorMomentumScore();
  
  // 为每个一级行业生成子行业信息
  const subSectors: Array<{
    subIndustry: string;
    parentIndustry: string;
    parentScore: number;
    parentChange: number;
    stockCount: number;
  }> = [];
  
  for (const s of (scores || [])) {
    const subs = getSubIndustries(s.industry);
    for (const sub of subs) {
      subSectors.push({
        subIndustry: sub,
        parentIndustry: s.industry,
        parentScore: s.score,
        parentChange: Number(s.avg_change_percent || 0),
        stockCount: Math.round(s.stock_count / subs.length), // 估算
      });
    }
  }
  
  // 按父行业评分排序，同一父行业下保持顺序
  res.json({
    success: true,
    data: {
      subSectors,
      total: subSectors.length,
    },
  });
}));

// 按子行业查询股票
router.get('/industries/sub-sector/:subIndustry/stocks', asyncHandler(async (req: Request, res: Response) => {
  const { subIndustry } = req.params;
  const db = getDb();
  
  // 找到父行业 → 用现有API获取该行业股票 → 客户端再细分
  const parentIndustry = Object.entries(SW_INDUSTRY_MAP)
    .find(([_, subs]) => subs.includes(subIndustry))?.[0];
  
  if (!parentIndustry) {
    res.status(404).json({ success: false, error: `未找到子行业: ${subIndustry}` });
    return;
  }
  
  const sectorStocks = await db.getSectorStocks(parentIndustry);
  
  // 按子行业筛选
  const filtered = sectorStocks.filter((st: any) => {
    const sub = classifySubIndustry(st.industry || parentIndustry, st.name, []);
    return sub === subIndustry;
  });
  
  // 获取行情
  const stocksWithQuote = await db.getStocksWithLatestQuotes(
    filtered.map((st: any) => st.symbol)
  );
  
  res.json({
    success: true,
    data: {
      subIndustry,
      parentIndustry,
      count: filtered.length,
      stocks: stocksWithQuote.map((st: any) => ({
        symbol: st.symbol,
        name: st.name,
        price: st.latestQuote?.closePrice,
        changePercent: st.latestQuote?.changePercent,
        peRatio: st.latestQuote?.peRatio,
        turnoverRate: st.latestQuote?.turnoverRate,
        marketCap: st.latestQuote?.marketCap,
      })),
    },
  });
}));

export default router;
