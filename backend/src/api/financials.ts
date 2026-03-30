/**
 * 财务报表 API
 * 资产负债表、利润表、现金流量表
 * 参考 Wind / Bloomberg 数据展示风格
 */

import { Request, Response, Router } from 'express';
import { validateQuery, schemas } from '../middleware/validation';

const router = Router();

// ==================== 模拟财务数据生成 ====================

function generateBalanceSheet(symbol: string, period: string) {
  const base = Math.random() * 500 + 100;
  const multiplier = symbol.charCodeAt(0) % 5 + 1;
  return {
    symbol,
    period,
    reportType: 'annual',
    // 资产
    totalAssets: +(base * multiplier * 100).toFixed(2),
    currentAssets: +(base * multiplier * 40).toFixed(2),
    nonCurrentAssets: +(base * multiplier * 60).toFixed(2),
    cash: +(base * multiplier * 15).toFixed(2),
    accountsReceivable: +(base * multiplier * 8).toFixed(2),
    inventory: +(base * multiplier * 10).toFixed(2),
    fixedAssets: +(base * multiplier * 30).toFixed(2),
    intangibleAssets: +(base * multiplier * 5).toFixed(2),
    goodwill: +(base * multiplier * 3).toFixed(2),
    // 负债
    totalLiabilities: +(base * multiplier * 55).toFixed(2),
    currentLiabilities: +(base * multiplier * 30).toFixed(2),
    nonCurrentLiabilities: +(base * multiplier * 25).toFixed(2),
    shortTermBorrowing: +(base * multiplier * 12).toFixed(2),
    longTermBorrowing: +(base * multiplier * 18).toFixed(2),
    accountsPayable: +(base * multiplier * 8).toFixed(2),
    // 所有者权益
    totalEquity: +(base * multiplier * 45).toFixed(2),
    paidInCapital: +(base * multiplier * 10).toFixed(2),
    capitalReserve: +(base * multiplier * 15).toFixed(2),
    retainedEarnings: +(base * multiplier * 18).toFixed(2),
    // 衍生指标
    currentRatio: +(base * multiplier * 40 / (base * multiplier * 30)).toFixed(2),
    quickRatio: +(base * multiplier * 30 / (base * multiplier * 30)).toFixed(2),
    debtToAssetRatio: +(55 / 100 * 100).toFixed(2),
    equityRatio: +(45 / 55 * 100).toFixed(2),
  };
}

function generateIncomeStatement(symbol: string, period: string) {
  const base = Math.random() * 200 + 50;
  const multiplier = symbol.charCodeAt(0) % 5 + 1;
  const revenue = base * multiplier * 80;
  const cost = revenue * (0.55 + Math.random() * 0.15);
  const grossProfit = revenue - cost;
  const operatingExpenses = revenue * (0.1 + Math.random() * 0.08);
  const operatingProfit = grossProfit - operatingExpenses;
  const tax = operatingProfit * 0.25;
  const netProfit = operatingProfit - tax;

  return {
    symbol,
    period,
    reportType: 'annual',
    // 营业收入
    totalRevenue: +revenue.toFixed(2),
    operatingRevenue: +(revenue * 0.95).toFixed(2),
    otherRevenue: +(revenue * 0.05).toFixed(2),
    // 营业成本
    operatingCost: +cost.toFixed(2),
    grossProfit: +grossProfit.toFixed(2),
    // 期间费用
    sellingExpenses: +(operatingExpenses * 0.3).toFixed(2),
    adminExpenses: +(operatingExpenses * 0.4).toFixed(2),
    financeExpenses: +(operatingExpenses * 0.3).toFixed(2),
    rdExpenses: +(revenue * 0.05).toFixed(2),
    // 利润
    operatingProfit: +operatingProfit.toFixed(2),
    nonOperatingIncome: +(revenue * 0.02).toFixed(2),
    nonOperatingExpense: +(revenue * 0.01).toFixed(2),
    totalProfit: +(operatingProfit + revenue * 0.01).toFixed(2),
    incomeTax: +tax.toFixed(2),
    netProfit: +netProfit.toFixed(2),
    // 归属
    parentNetProfit: +(netProfit * 0.92).toFixed(2),
    minorityInterest: +(netProfit * 0.08).toFixed(2),
    // 每股
    eps: +(netProfit / (Math.random() * 10 + 5)).toFixed(4),
    // 衍生指标
    grossMargin: +(grossProfit / revenue * 100).toFixed(2),
    operatingMargin: +(operatingProfit / revenue * 100).toFixed(2),
    netMargin: +(netProfit / revenue * 100).toFixed(2),
    roe: +(netProfit / (base * multiplier * 45) * 100).toFixed(2),
    roa: +(netProfit / (base * multiplier * 100) * 100).toFixed(2),
  };
}

function generateCashFlow(symbol: string, period: string) {
  const base = Math.random() * 100 + 30;
  const multiplier = symbol.charCodeAt(0) % 5 + 1;
  const operatingCash = base * multiplier * 20;
  const investingCash = -base * multiplier * 12;
  const financingCash = -base * multiplier * 5;

  return {
    symbol,
    period,
    reportType: 'annual',
    // 经营活动
    cashFromSales: +(operatingCash * 1.2).toFixed(2),
    cashToEmployees: -(operatingCash * 0.3).toFixed(2),
    cashToSuppliers: -(operatingCash * 0.5).toFixed(2),
    taxPaid: -(operatingCash * 0.15).toFixed(2),
    netOperatingCashFlow: +operatingCash.toFixed(2),
    // 投资活动
    purchaseFixedAssets: +(investingCash * 0.6).toFixed(2),
    purchaseInvestments: +(investingCash * 0.3).toFixed(2),
    disposalProceeds: +(Math.abs(investingCash) * 0.2).toFixed(2),
    netInvestingCashFlow: +investingCash.toFixed(2),
    // 筹资活动
    borrowings: +(Math.abs(financingCash) * 2).toFixed(2),
    repaymentBorrowings: -(Math.abs(financingCash) * 1.5).toFixed(2),
    dividendsPaid: -(Math.abs(financingCash) * 0.8).toFixed(2),
    netFinancingCashFlow: +financingCash.toFixed(2),
    // 汇总
    netCashFlow: +(operatingCash + investingCash + financingCash).toFixed(2),
    beginningCash: +(base * multiplier * 25).toFixed(2),
    endingCash: +(base * multiplier * 25 + operatingCash + investingCash + financingCash).toFixed(2),
    // 衍生指标
    operatingCashToNetProfit: +(operatingCash / (base * multiplier * 15) * 100).toFixed(2),
    freeCashFlow: +(operatingCash + investingCash * 0.5).toFixed(2),
  };
}

// 生成多期数据（同比）
function generateMultiPeriod(generateFn: typeof generateBalanceSheet, symbol: string, periods: number) {
  const results = [];
  const currentYear = 2025;
  for (let i = 0; i < periods; i++) {
    const year = currentYear - i;
    results.push(generateFn(symbol, `${year}-12-31`));
  }
  return results;
}

// ==================== API 路由 ====================

/**
 * 获取资产负债表
 * GET /api/financials/balance-sheet?symbol=600519&periods=4
 */
router.get('/financials/balance-sheet', validateQuery(schemas.stockSearch), async (req: Request, res: Response) => {
  try {
    const symbol = (req.query.symbol as string) || '600519';
    const periods = Math.min(parseInt(req.query.periods as string) || 4, 10);

    const data = generateMultiPeriod(generateBalanceSheet, symbol, periods);

    res.json({
      success: true,
      data: {
        symbol,
        type: 'balance_sheet',
        periods: data,
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('获取资产负债表失败:', error);
    res.status(500).json({ success: false, message: '获取资产负债表失败' });
  }
});

/**
 * 获取利润表
 * GET /api/financials/income-statement?symbol=600519&periods=4
 */
router.get('/financials/income-statement', validateQuery(schemas.stockSearch), async (req: Request, res: Response) => {
  try {
    const symbol = (req.query.symbol as string) || '600519';
    const periods = Math.min(parseInt(req.query.periods as string) || 4, 10);

    const data = generateMultiPeriod(generateIncomeStatement, symbol, periods);

    res.json({
      success: true,
      data: {
        symbol,
        type: 'income_statement',
        periods: data,
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('获取利润表失败:', error);
    res.status(500).json({ success: false, message: '获取利润表失败' });
  }
});

/**
 * 获取现金流量表
 * GET /api/financials/cash-flow?symbol=600519&periods=4
 */
router.get('/financials/cash-flow', validateQuery(schemas.stockSearch), async (req: Request, res: Response) => {
  try {
    const symbol = (req.query.symbol as string) || '600519';
    const periods = Math.min(parseInt(req.query.periods as string) || 4, 10);

    const data = generateMultiPeriod(generateCashFlow, symbol, periods);

    res.json({
      success: true,
      data: {
        symbol,
        type: 'cash_flow',
        periods: data,
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('获取现金流量表失败:', error);
    res.status(500).json({ success: false, message: '获取现金流量表失败' });
  }
});

/**
 * 获取财务摘要（三表联动）
 * GET /api/financials/summary?symbol=600519
 */
router.get('/financials/summary', validateQuery(schemas.stockSearch), async (req: Request, res: Response) => {
  try {
    const symbol = (req.query.symbol as string) || '600519';

    const latest = {
      balanceSheet: generateBalanceSheet(symbol, '2025-12-31'),
      incomeStatement: generateIncomeStatement(symbol, '2025-12-31'),
      cashFlow: generateCashFlow(symbol, '2025-12-31'),
    };

    // 关键财务指标汇总
    const indicators = {
      // 盈利能力
      grossMargin: latest.incomeStatement.grossMargin,
      netMargin: latest.incomeStatement.netMargin,
      roe: latest.incomeStatement.roe,
      roa: latest.incomeStatement.roa,
      // 偿债能力
      currentRatio: latest.balanceSheet.currentRatio,
      quickRatio: latest.balanceSheet.quickRatio,
      debtToAssetRatio: latest.balanceSheet.debtToAssetRatio,
      // 营运能力
      totalAssetTurnover: +(latest.incomeStatement.totalRevenue / latest.balanceSheet.totalAssets).toFixed(2),
      inventoryTurnover: +(latest.incomeStatement.operatingCost / latest.balanceSheet.inventory).toFixed(2),
      // 现金流
      operatingCashToNetProfit: latest.cashFlow.operatingCashToNetProfit,
      freeCashFlow: latest.cashFlow.freeCashFlow,
      // 成长性
      revenueGrowth: +(Math.random() * 30 - 5).toFixed(2),
      profitGrowth: +(Math.random() * 40 - 10).toFixed(2),
    };

    res.json({
      success: true,
      data: {
        symbol,
        period: '2025-12-31',
        balanceSheet: latest.balanceSheet,
        incomeStatement: latest.incomeStatement,
        cashFlow: latest.cashFlow,
        indicators,
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('获取财务摘要失败:', error);
    res.status(500).json({ success: false, message: '获取财务摘要失败' });
  }
});

/**
 * 获取财务指标趋势（多期对比）
 * GET /api/financials/trends?symbol=600519&metric=roe&periods=8
 */
router.get('/financials/trends', validateQuery(schemas.stockSearch), async (req: Request, res: Response) => {
  try {
    const symbol = (req.query.symbol as string) || '600519';
    const metric = (req.query.metric as string) || 'roe';
    const periods = Math.min(parseInt(req.query.periods as string) || 8, 12);

    const metrics = ['roe', 'roa', 'netMargin', 'grossMargin', 'currentRatio', 'debtToAssetRatio', 'eps', 'revenueGrowth', 'profitGrowth'];
    if (!metrics.includes(metric)) {
      return res.status(400).json({
        success: false,
        message: `无效指标，可选: ${metrics.join(', ')}`,
      });
    }

    const data: { period: string; value: number }[] = [];
    const currentYear = 2025;
    for (let i = 0; i < periods; i++) {
      const year = currentYear - i;
      const income = generateIncomeStatement(symbol, `${year}-12-31`);
      let value = 0;
      switch (metric) {
        case 'roe': value = income.roe; break;
        case 'roa': value = income.roa; break;
        case 'netMargin': value = income.netMargin; break;
        case 'grossMargin': value = income.grossMargin; break;
        case 'eps': value = income.eps; break;
        case 'revenueGrowth': value = income.totalRevenue * (0.8 + Math.random() * 0.4) / income.totalRevenue * 100 - 100; break;
        case 'profitGrowth': value = income.netProfit * (0.7 + Math.random() * 0.6) / income.netProfit * 100 - 100; break;
        default: value = +(Math.random() * 50).toFixed(2);
      }
      data.push({ period: `${year}`, value: +value.toFixed(2) });
    }

    res.json({
      success: true,
      data: {
        symbol,
        metric,
        values: data.reverse(),
      },
    });
  } catch (error) {
    console.error('获取财务趋势失败:', error);
    res.status(500).json({ success: false, message: '获取财务趋势失败' });
  }
});

export default router;
