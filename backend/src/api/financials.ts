/**
 * 财务报表 API
 * 资产负债表、利润表、现金流量表
 * 参考 Wind / Bloomberg 数据展示风格，统一响应格式
 */

import { Router } from 'express';
import { validateQuery, schemas } from '../middleware/validation';
import { asyncHandler, sendSuccess, sendValidationError } from '../utils/apiResponse';

const router = Router();

// ==================== 模拟财务数据生成 ====================

function generateBalanceSheet(symbol: string, period: string) {
  const base = Math.random() * 500 + 100;
  const multiplier = symbol.charCodeAt(0) % 5 + 1;
  return {
    symbol,
    period,
    reportType: 'annual',
    totalAssets: +(base * multiplier * 100).toFixed(2),
    currentAssets: +(base * multiplier * 40).toFixed(2),
    nonCurrentAssets: +(base * multiplier * 60).toFixed(2),
    cash: +(base * multiplier * 15).toFixed(2),
    accountsReceivable: +(base * multiplier * 8).toFixed(2),
    inventory: +(base * multiplier * 10).toFixed(2),
    fixedAssets: +(base * multiplier * 30).toFixed(2),
    intangibleAssets: +(base * multiplier * 5).toFixed(2),
    goodwill: +(base * multiplier * 3).toFixed(2),
    totalLiabilities: +(base * multiplier * 55).toFixed(2),
    currentLiabilities: +(base * multiplier * 30).toFixed(2),
    nonCurrentLiabilities: +(base * multiplier * 25).toFixed(2),
    shortTermBorrowing: +(base * multiplier * 12).toFixed(2),
    longTermBorrowing: +(base * multiplier * 18).toFixed(2),
    accountsPayable: +(base * multiplier * 8).toFixed(2),
    totalEquity: +(base * multiplier * 45).toFixed(2),
    paidInCapital: +(base * multiplier * 10).toFixed(2),
    capitalReserve: +(base * multiplier * 15).toFixed(2),
    retainedEarnings: +(base * multiplier * 18).toFixed(2),
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
    symbol, period, reportType: 'annual',
    totalRevenue: +revenue.toFixed(2),
    operatingRevenue: +(revenue * 0.95).toFixed(2),
    otherRevenue: +(revenue * 0.05).toFixed(2),
    operatingCost: +cost.toFixed(2),
    grossProfit: +grossProfit.toFixed(2),
    sellingExpenses: +(operatingExpenses * 0.3).toFixed(2),
    adminExpenses: +(operatingExpenses * 0.4).toFixed(2),
    financeExpenses: +(operatingExpenses * 0.3).toFixed(2),
    rdExpenses: +(revenue * 0.05).toFixed(2),
    operatingProfit: +operatingProfit.toFixed(2),
    nonOperatingIncome: +(revenue * 0.02).toFixed(2),
    nonOperatingExpense: +(revenue * 0.01).toFixed(2),
    totalProfit: +(operatingProfit + revenue * 0.01).toFixed(2),
    incomeTax: +tax.toFixed(2),
    netProfit: +netProfit.toFixed(2),
    parentNetProfit: +(netProfit * 0.92).toFixed(2),
    minorityInterest: +(netProfit * 0.08).toFixed(2),
    eps: +(netProfit / (Math.random() * 10 + 5)).toFixed(4),
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
    symbol, period, reportType: 'annual',
    cashFromSales: +(operatingCash * 1.2).toFixed(2),
    cashToEmployees: -(operatingCash * 0.3).toFixed(2),
    cashToSuppliers: -(operatingCash * 0.5).toFixed(2),
    taxPaid: -(operatingCash * 0.15).toFixed(2),
    netOperatingCashFlow: +operatingCash.toFixed(2),
    purchaseFixedAssets: +(investingCash * 0.6).toFixed(2),
    purchaseInvestments: +(investingCash * 0.3).toFixed(2),
    disposalProceeds: +(Math.abs(investingCash) * 0.2).toFixed(2),
    netInvestingCashFlow: +investingCash.toFixed(2),
    borrowings: +(Math.abs(financingCash) * 2).toFixed(2),
    repaymentBorrowings: -(Math.abs(financingCash) * 1.5).toFixed(2),
    dividendsPaid: -(Math.abs(financingCash) * 0.8).toFixed(2),
    netFinancingCashFlow: +financingCash.toFixed(2),
    netCashFlow: +(operatingCash + investingCash + financingCash).toFixed(2),
    beginningCash: +(base * multiplier * 25).toFixed(2),
    endingCash: +(base * multiplier * 25 + operatingCash + investingCash + financingCash).toFixed(2),
    operatingCashToNetProfit: +(operatingCash / (base * multiplier * 15) * 100).toFixed(2),
    freeCashFlow: +(operatingCash + investingCash * 0.5).toFixed(2),
  };
}

function generateMultiPeriod(generateFn: (symbol: string, period: string) => Record<string, unknown>, symbol: string, periods: number) {
  const results = [];
  const currentYear = 2025;
  for (let i = 0; i < periods; i++) {
    results.push(generateFn(symbol, `${currentYear - i}-12-31`));
  }
  return results;
}

// ==================== API 路由 ====================

router.get('/financials/balance-sheet', validateQuery(schemas.stockSearch), asyncHandler(async (req, res) => {
  const symbol = (req.query.symbol as string) || '600519';
  const periods = Math.min(parseInt(req.query.periods as string) || 4, 10);
  const data = generateMultiPeriod(generateBalanceSheet, symbol, periods);
  sendSuccess(res, { symbol, type: 'balance_sheet', periods: data, updatedAt: new Date().toISOString() });
}));

router.get('/financials/income-statement', validateQuery(schemas.stockSearch), asyncHandler(async (req, res) => {
  const symbol = (req.query.symbol as string) || '600519';
  const periods = Math.min(parseInt(req.query.periods as string) || 4, 10);
  const data = generateMultiPeriod(generateIncomeStatement, symbol, periods);
  sendSuccess(res, { symbol, type: 'income_statement', periods: data, updatedAt: new Date().toISOString() });
}));

router.get('/financials/cash-flow', validateQuery(schemas.stockSearch), asyncHandler(async (req, res) => {
  const symbol = (req.query.symbol as string) || '600519';
  const periods = Math.min(parseInt(req.query.periods as string) || 4, 10);
  const data = generateMultiPeriod(generateCashFlow, symbol, periods);
  sendSuccess(res, { symbol, type: 'cash_flow', periods: data, updatedAt: new Date().toISOString() });
}));

router.get('/financials/summary', validateQuery(schemas.stockSearch), asyncHandler(async (req, res) => {
  const symbol = (req.query.symbol as string) || '600519';
  const latest = {
    balanceSheet: generateBalanceSheet(symbol, '2025-12-31'),
    incomeStatement: generateIncomeStatement(symbol, '2025-12-31'),
    cashFlow: generateCashFlow(symbol, '2025-12-31'),
  };
  const indicators = {
    grossMargin: latest.incomeStatement.grossMargin,
    netMargin: latest.incomeStatement.netMargin,
    roe: latest.incomeStatement.roe,
    roa: latest.incomeStatement.roa,
    currentRatio: latest.balanceSheet.currentRatio,
    quickRatio: latest.balanceSheet.quickRatio,
    debtToAssetRatio: latest.balanceSheet.debtToAssetRatio,
    totalAssetTurnover: +(latest.incomeStatement.totalRevenue / latest.balanceSheet.totalAssets).toFixed(2),
    inventoryTurnover: +(latest.incomeStatement.operatingCost / latest.balanceSheet.inventory).toFixed(2),
    operatingCashToNetProfit: latest.cashFlow.operatingCashToNetProfit,
    freeCashFlow: latest.cashFlow.freeCashFlow,
    revenueGrowth: +(Math.random() * 30 - 5).toFixed(2),
    profitGrowth: +(Math.random() * 40 - 10).toFixed(2),
  };
  sendSuccess(res, { symbol, period: '2025-12-31', ...latest, indicators, updatedAt: new Date().toISOString() });
}));

const VALID_METRICS = ['roe', 'roa', 'netMargin', 'grossMargin', 'currentRatio', 'debtToAssetRatio', 'eps', 'revenueGrowth', 'profitGrowth'];

router.get('/financials/trends', validateQuery(schemas.stockSearch), asyncHandler(async (req, res) => {
  const symbol = (req.query.symbol as string) || '600519';
  const metric = (req.query.metric as string) || 'roe';
  const periods = Math.min(parseInt(req.query.periods as string) || 8, 12);

  if (!VALID_METRICS.includes(metric)) {
    return sendValidationError(res, `无效指标，可选: ${VALID_METRICS.join(', ')}`);
  }

  const data: { period: string; value: number }[] = [];
  for (let i = 0; i < periods; i++) {
    const year = 2025 - i;
    const income = generateIncomeStatement(symbol, `${year}-12-31`);
    let value = 0;
    switch (metric) {
      case 'roe': value = income.roe; break;
      case 'roa': value = income.roa; break;
      case 'netMargin': value = income.netMargin; break;
      case 'grossMargin': value = income.grossMargin; break;
      case 'eps': value = income.eps; break;
      default: value = +(Math.random() * 50).toFixed(2);
    }
    data.push({ period: `${year}`, value: +value.toFixed(2) });
  }
  sendSuccess(res, { symbol, metric, values: data.reverse() });
}));

export default router;
