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

// 完整行业树（支持 ?level=2 返回真实 PostgreSQL L2 数据）
router.get('/industries', asyncHandler(async (req: Request, res: Response) => {
  const level = (req.query.level as string) || '1';

  if (level === '2') {
    const db = getDb();
    const rows = await (db.connection as any)('stocks as s')
      .join('daily_quotes as dq', function(this: any) {
        this.on('s.id', '=', 'dq.stock_id')
          .andOn('dq.trade_date', '=', db.connection.raw(
            '(SELECT MAX(trade_date) FROM daily_quotes WHERE stock_id = s.id)'
          ));
      })
      .where('s.is_active', true)
      .whereNotNull('s.industry_level2')
      .whereNot('s.industry_level2', '综合')
      .groupBy('s.industry_level2')
      .select(
        's.industry_level2 as name',
        db.connection.raw('COUNT(*)::int as stock_count'),
        db.connection.raw('ROUND(AVG(dq.change_percent)::numeric, 2) as avg_change'),
        db.connection.raw('ROUND(AVG(dq.turnover_rate)::numeric, 2) as avg_turnover'),
        db.connection.raw('ROUND(SUM(dq.market_cap)::numeric / 10000, 2) as total_cap')
      )
      .orderBy('stock_count', 'desc');

    res.json({
      success: true,
      data: {
        standard: '申万2021 二级(自研分类引擎 v3)',
        level: 2,
        count: rows.length,
        industries: rows,
      },
    });
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

// 按二级行业查询股票（直接读 stocks.industry_level2）
router.get('/industries/level2/stocks', asyncHandler(async (req: Request, res: Response) => {
  const name = req.query.name as string;
  if (!name) {
    res.status(400).json({ success: false, error: '请提供 ?name=二级行业名称' });
    return;
  }

  const db = getDb();
  const stocks = await db.connection('stocks')
    .where('is_active', true)
    .where('industry_level2', name)
    .select('symbol', 'name', 'industry', 'industry_level2', 'market_cap', 'pe_ratio', 'turnover_rate')
    .orderBy('market_cap', 'desc')
    .limit(200);

  // 附加最新行情
  const symbols = stocks.map((s: any) => s.symbol);
  const quotes = symbols.length > 0 ? await db.getStocksWithLatestQuotes(symbols) : [];

  res.json({
    success: true,
    data: {
      industry: name,
      count: stocks.length,
      stocks: stocks.map((s: any, i: number) => {
        const q = quotes[i] || {};
        return {
          symbol: s.symbol,
          name: s.name,
          l1: s.industry,
          l2: s.industry_level2,
          marketCap: Number(s.market_cap) || 0,
          peRatio: s.pe_ratio ? Number(s.pe_ratio) : null,
          price: q.latestQuote?.closePrice ?? null,
          changePercent: q.latestQuote?.changePercent ?? null,
          turnoverRate: s.turnover_rate ? Number(s.turnover_rate) : null,
        };
      }),
    },
  });
}));

export default router;
