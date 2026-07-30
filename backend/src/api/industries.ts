/**
 * 行业分类API — 申万2021二级行业（134类）
 */
import { Router, Request, Response } from 'express';
import { asyncHandler } from '../utils/apiResponse';
import { getDb } from '../db/dbFactory';
import {
  SW_INDUSTRY_MAP, getAllSubIndustries,
  classifySubIndustry, getSubIndustries,
} from '@shared/industryClassification';

const router = Router();

/** 市值(元) → 人类可读字符串（万亿/亿/万） */
function formatCap(yuan: number): string {
  if (!isFinite(yuan) || yuan <= 0) return '0';
  if (yuan >= 1e12) return `${(yuan / 1e12).toFixed(2)}万亿`;
  if (yuan >= 1e8) return `${(yuan / 1e8).toFixed(2)}亿`;
  if (yuan >= 1e4) return `${(yuan / 1e4).toFixed(2)}万`;
  return yuan.toFixed(0);
}

// 完整行业树（支持 ?level=2 返回真实二级行业数据）
router.get('/industries', asyncHandler(async (req: Request, res: Response) => {
  const level = (req.query.level as string) || '1';

  if (level === '2') {
    // 模式无关：对全部股票实时用 classifyStock(行业, 名称) 反推二级行业，
    // '综合'/'未分类'/NULL 强制按名称反推，补齐未分类股。
    const db = getDb();
    const rows = await db.getSubIndustryPerformance();
    const industries = rows.map((r) => ({
      parent: r.parent,
      name: r.name,
      stock_count: r.stock_count,
      avg_change: (r.avg_change_percent >= 0 ? '+' : '') + r.avg_change_percent.toFixed(2),
      avg_turnover: r.avg_turnover_percent.toFixed(2),
      total_cap: formatCap(r.total_market_cap),
    }));
    res.json({
      success: true,
      data: {
        standard: '申万2021 二级(自研分类引擎 v3)',
        level: 2,
        count: industries.length,
        industries,
      },
    });
    return;
  }

  // Default: L1 theoretical tree (backward-compatible)
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
  
  // TODO: getSectorStocks 仅在 InMemoryDatabase 上实现，Database(PostgreSQL) 缺失该方法，
  // 故 getDb() 的联合类型 (Database | InMemoryDatabase) 不暴露它。暂用 any 绕过类型检查。
  const sectorStocks = await (db as any).getSectorStocks(parentIndustry);
  
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

// 按二级行业查询股票（实时分类，模式无关）
router.get('/industries/level2/stocks', asyncHandler(async (req: Request, res: Response) => {
  const name = req.query.name as string;
  if (!name) {
    res.status(400).json({ success: false, error: '请提供 ?name=二级行业名称' });
    return;
  }

  const db = getDb();
  const stocks = await db.getStocksBySubIndustry(name);

  res.json({
    success: true,
    data: {
      industry: name,
      count: stocks.length,
      stocks: stocks.map((s) => ({
        symbol: s.symbol,
        name: s.name,
        l1: s.l1,
        l2: s.l2,
        marketCap: s.marketCap,
        peRatio: s.peRatio,
        price: s.price,
        changePercent: s.changePercent,
        turnoverRate: s.turnoverRate,
      })),
    },
  });
}));

export default router;
