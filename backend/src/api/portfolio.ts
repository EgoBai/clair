/**
 * 投资组合管理 API 路由
 * 持仓管理、收益计算、资产配置
 * 参考雪球投资组合功能
 */

import { Router, Request, Response } from 'express';
import { db } from '../db/dbFactory';
import { queryCache } from '../utils/queryCache';
import { validateQuery, validateBody, validateParams, schemas } from '../middleware/validation';
import { asyncHandler, sendSuccess, sendNotFound, sendInternalError } from '../utils/apiResponse';

const router = Router();

// ==================== 类型 ====================

interface PortfolioPosition {
  id: number;
  portfolioId: number;
  symbol: string;
  name: string;
  quantity: number;
  costPrice: number;
  currentPrice: number;
  marketValue: number;
  costTotal: number;
  profit: number;
  profitPercent: number;
  weight: number;
  buyDate: string;
  notes: string;
  updatedAt: string;
}

interface PortfolioSummary {
  id: number;
  name: string;
  description: string;
  totalCost: number;
  totalMarketValue: number;
  totalProfit: number;
  totalProfitPercent: number;
  cashBalance: number;
  positionCount: number;
  positions: PortfolioPosition[];
  allocation: { name: string; value: number; weight: number }[];
  profitHistory: { date: string; value: number }[];
}

// ==================== 类型 ====================

interface RawPosition {
  symbol: string;
  name: string;
  quantity: number;
  costPrice: number;
  buyDate: string;
  notes: string;
}

interface PortfolioData {
  id: number;
  name: string;
  description: string;
  cashBalance: number;
  positions: RawPosition[];
  createdAt: string;
}

// ==================== 模拟数据存储（实际应用中用数据库表）====================

const portfolios = new Map<number, PortfolioData>();
let nextId = 1;

// 默认投资组合
function initDefaultPortfolios() {
  if (portfolios.size === 0) {
    portfolios.set(1, {
      id: 1,
      name: '我的主仓位',
      description: '长期价值投资组合',
      cashBalance: 50000,
      positions: [
        { symbol: '000001.SZ', name: '平安银行', quantity: 1000, costPrice: 12.50, buyDate: '2026-01-15', notes: '银行板块龙头' },
        { symbol: '600519.SH', name: '贵州茅台', quantity: 100, costPrice: 1680.00, buyDate: '2026-02-01', notes: '消费白马' },
        { symbol: '000858.SZ', name: '五粮液', quantity: 200, costPrice: 155.00, buyDate: '2026-02-10', notes: '白酒板块' },
        { symbol: '300750.SZ', name: '宁德时代', quantity: 300, costPrice: 195.00, buyDate: '2026-03-01', notes: '新能源龙头' },
      ],
      createdAt: '2026-01-15',
    });
    nextId = 2;
  }
}
initDefaultPortfolios();

// ==================== 获取投资组合列表 ====================

router.get('/portfolio', validateQuery(schemas.watchlistQuery), async (_req: Request, res: Response) => {
  try {
    const list: Array<{
      id: number; name: string; description: string; positionCount: number;
      totalCost: number; totalMarketValue: number; totalProfit: number;
      totalProfitPercent: number; cashBalance: number; totalValue: number; createdAt: string;
    }> = [];
    for (const [_id, portfolio] of portfolios) {
      const positions = await enrichPositionsWithQuotes(portfolio.positions);
      const totalCost = positions.reduce((s, p) => s + p.costTotal, 0);
      const totalMarketValue = positions.reduce((s, p) => s + p.marketValue, 0);
      const totalProfit = totalMarketValue - totalCost;
      const totalValue = totalMarketValue + portfolio.cashBalance;

      list.push({
        id: portfolio.id,
        name: portfolio.name,
        description: portfolio.description,
        positionCount: positions.length,
        totalCost: Math.round(totalCost),
        totalMarketValue: Math.round(totalMarketValue),
        totalProfit: Math.round(totalProfit),
        totalProfitPercent: totalCost > 0 ? Math.round(totalProfit / totalCost * 10000) / 100 : 0,
        cashBalance: portfolio.cashBalance,
        totalValue: Math.round(totalValue),
        createdAt: portfolio.createdAt,
      });
    }

    res.json({ success: true, data: { portfolios: list } });
  } catch (error) {
    console.error('获取投资组合失败:', error);
    res.status(500).json({ success: false, error: '获取投资组合失败' });
  }
});

// ==================== 获取投资组合详情 ====================

router.get('/portfolio/:id', validateParams(schemas.portfolioId), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const portfolio = portfolios.get(id);
    if (!portfolio) {
      return res.status(404).json({ success: false, error: '投资组合不存在' });
    }

    const positions = await enrichPositionsWithQuotes(portfolio.positions);
    const totalCost = positions.reduce((s, p) => s + p.costTotal, 0);
    const totalMarketValue = positions.reduce((s, p) => s + p.marketValue, 0);
    const totalProfit = totalMarketValue - totalCost;
    const totalValue = totalMarketValue + portfolio.cashBalance;

    // 资产配置（按行业）
    const allocation = calculateAllocation(positions, portfolio.cashBalance);

    res.json({
      success: true,
      data: {
        id: portfolio.id,
        name: portfolio.name,
        description: portfolio.description,
        totalCost: Math.round(totalCost),
        totalMarketValue: Math.round(totalMarketValue),
        totalProfit: Math.round(totalProfit),
        totalProfitPercent: totalCost > 0 ? Math.round(totalProfit / totalCost * 10000) / 100 : 0,
        cashBalance: portfolio.cashBalance,
        totalValue: Math.round(totalValue),
        positions,
        allocation,
        createdAt: portfolio.createdAt,
      },
    });
  } catch (error) {
    console.error('获取投资组合详情失败:', error);
    res.status(500).json({ success: false, error: '获取投资组合详情失败' });
  }
});

// ==================== 创建投资组合 ====================

router.post('/portfolio', validateBody(schemas.portfolioCreate), (req: Request, res: Response) => {
  const { name, description, cashBalance } = req.body;
  if (!name) {
    return res.status(400).json({ success: false, error: '缺少组合名称' });
  }

  const portfolio = {
    id: nextId++,
    name,
    description: description || '',
    cashBalance: cashBalance || 100000,
    positions: [],
    createdAt: new Date().toISOString().split('T')[0],
  };
  portfolios.set(portfolio.id, portfolio);

  res.json({ success: true, data: portfolio });
});

// ==================== 添加持仓 ====================

router.post('/portfolio/:id/positions', validateParams(schemas.portfolioId), validateBody(schemas.positionAdd), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const portfolio = portfolios.get(id);
    if (!portfolio) {
      return res.status(404).json({ success: false, error: '投资组合不存在' });
    }

    const { symbol, name, quantity, costPrice, buyDate, notes } = req.body;
    if (!symbol || !quantity || !costPrice) {
      return res.status(400).json({ success: false, error: '缺少必要参数' });
    }

    // 检查是否已持有该股票
    const existing = portfolio.positions.find((p: RawPosition) => p.symbol === symbol);
    if (existing) {
      // 加仓：更新均价和数量
      const totalCost = existing.costPrice * existing.quantity + costPrice * quantity;
      const totalQty = existing.quantity + quantity;
      existing.costPrice = Math.round(totalCost / totalQty * 100) / 100;
      existing.quantity = totalQty;
      existing.notes = notes || existing.notes;
    } else {
      portfolio.positions.push({
        symbol,
        name: name || symbol,
        quantity,
        costPrice,
        buyDate: buyDate || new Date().toISOString().split('T')[0],
        notes: notes || '',
      });
    }

    // 扣除现金
    const cost = quantity * costPrice;
    portfolio.cashBalance -= cost;

    res.json({ success: true, data: { message: '持仓添加成功' } });
  } catch (error) {
    console.error('添加持仓失败:', error);
    res.status(500).json({ success: false, error: '添加持仓失败' });
  }
});

// ==================== 编辑持仓 ====================

router.put('/portfolio/:id/positions/:symbol', validateParams(schemas.portfolioPositionSymbol), validateBody(schemas.positionUpdate), (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const symbol = req.params.symbol;
  const portfolio = portfolios.get(id);
  if (!portfolio) {
    return res.status(404).json({ success: false, error: '投资组合不存在' });
  }

  const pos = portfolio.positions.find((p: RawPosition) => p.symbol === symbol);
  if (!pos) {
    return res.status(404).json({ success: false, error: '持仓不存在' });
  }

  const { quantity, costPrice, notes } = req.body;
  if (quantity !== undefined) pos.quantity = quantity;
  if (costPrice !== undefined) pos.costPrice = costPrice;
  if (notes !== undefined) pos.notes = notes;

  res.json({ success: true, data: { message: '持仓更新成功' } });
});

// ==================== 删除持仓 ====================

router.delete('/portfolio/:id/positions/:symbol', validateParams(schemas.portfolioPositionSymbol), (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const symbol = req.params.symbol;
  const portfolio = portfolios.get(id);
  if (!portfolio) {
    return res.status(404).json({ success: false, error: '投资组合不存在' });
  }

  const idx = portfolio.positions.findIndex((p: RawPosition) => p.symbol === symbol);
  if (idx === -1) {
    return res.status(404).json({ success: false, error: '持仓不存在' });
  }

  const pos = portfolio.positions[idx];
  // 退回现金
  portfolio.cashBalance += pos.costPrice * pos.quantity;
  portfolio.positions.splice(idx, 1);

  res.json({ success: true, data: { message: '持仓删除成功' } });
});

// ==================== 删除投资组合 ====================

router.delete('/portfolio/:id', validateParams(schemas.portfolioId), (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  if (!portfolios.has(id)) {
    return res.status(404).json({ success: false, error: '投资组合不存在' });
  }
  portfolios.delete(id);
  res.json({ success: true, data: { message: '投资组合删除成功' } });
});

// ==================== 辅助函数 ====================

async function enrichPositionsWithQuotes(positions: RawPosition[]): Promise<PortfolioPosition[]> {
  if (positions.length === 0) return [];

  // 获取所有持仓股票的最新行情
  const symbols = positions.map((p: RawPosition) => p.symbol);
  const quotes = await db.connection('daily_quotes')
    .join('stocks', 'stocks.id', 'daily_quotes.stock_id')
    .whereIn('stocks.symbol', symbols)
    .select(
      'stocks.symbol',
      'close_price as closePrice'
    )
    .orderBy('trade_date', 'desc')
    .limit(symbols.length * 100); // 多取一些确保每只股票都有数据

  // 取每只股票的最新价格
  const latestPrices = new Map<string, number>();
  for (const q of quotes) {
    if (!latestPrices.has(q.symbol)) {
      latestPrices.set(q.symbol, parseFloat(q.closePrice));
    }
  }

  return positions.map((pos: RawPosition, idx: number) => {
    const currentPrice = latestPrices.get(pos.symbol) || pos.costPrice;
    const costTotal = pos.costPrice * pos.quantity;
    const marketValue = currentPrice * pos.quantity;
    const profit = marketValue - costTotal;
    const profitPercent = costTotal > 0 ? (profit / costTotal) * 100 : 0;

    return {
      id: idx + 1,
      portfolioId: 0,
      symbol: pos.symbol,
      name: pos.name,
      quantity: pos.quantity,
      costPrice: pos.costPrice,
      currentPrice: Math.round(currentPrice * 100) / 100,
      marketValue: Math.round(marketValue * 100) / 100,
      costTotal: Math.round(costTotal * 100) / 100,
      profit: Math.round(profit * 100) / 100,
      profitPercent: Math.round(profitPercent * 100) / 100,
      weight: 0, // 后面计算
      buyDate: pos.buyDate,
      notes: pos.notes,
      updatedAt: new Date().toISOString(),
    };
  });
}

/** 供组合风控中心复用：返回默认组合（id=1）的持仓（已 enrich 实时行情） */
export async function getDefaultPortfolio() {
  const pf = portfolios.get(1);
  if (!pf) return [];
  return enrichPositionsWithQuotes(pf.positions);
}

function calculateAllocation(positions: PortfolioPosition[], cashBalance: number) {
  const totalMarketValue = positions.reduce((s, p) => s + p.marketValue, 0);
  const totalValue = totalMarketValue + cashBalance;

  const allocation: { name: string; value: number; weight: number }[] = [];

  // 按持仓分组
  for (const pos of positions) {
    allocation.push({
      name: pos.name,
      value: pos.marketValue,
      weight: totalValue > 0 ? Math.round(pos.marketValue / totalValue * 10000) / 100 : 0,
    });
  }

  // 加入现金
  if (cashBalance > 0) {
    allocation.push({
      name: '现金',
      value: cashBalance,
      weight: totalValue > 0 ? Math.round(cashBalance / totalValue * 10000) / 100 : 0,
    });
  }

  return allocation;
}

export default router;
