/**
 * 财务报表 API（真实源版）
 * - 主要指标/三大报表：东方财富 datacenter + emweb F10（免 key）
 * - 遵守「诚实数据」红线：源不可达 → 返回 dataSource:'unavailable'，绝不回填随机伪造数据
 *
 * 数据获取逻辑见 services/financialsDataService.ts，本文件仅负责路由编排与诚实空降级。
 */

import { Router } from 'express';
import { validateQuery, schemas } from '../middleware/validation';
import { asyncHandler, sendSuccess, sendValidationError } from '../utils/apiResponse';
import {
  getFinancialIndicators,
  getBalanceSheet,
  getIncomeStatement,
  getCashFlow,
  getFinancialSummary,
  FinancialsUnavailableError,
} from '../services/financialsDataService';

const router = Router();

/** 诚实空降级：源不可达时统一返回 dataSource:'unavailable' + 空 data */
function unavailable(e: unknown) {
  const message = e instanceof Error ? e.message : 'unknown';
  return { dataSource: 'unavailable' as const, message, data: null };
}

// ==================== API 路由 ====================

/**
 * 资产负债表（真实源，多期年报）
 * GET /api/financials/balance-sheet?symbol=600519&periods=4
 */
router.get('/financials/balance-sheet', validateQuery(schemas.financialsQuery), asyncHandler(async (req, res) => {
  const symbol = (req.query.symbol as string) || '600519';
  const periods = Math.min(parseInt(req.query.periods as string) || 4, 10);
  try {
    const data = await getBalanceSheet(symbol, periods);
    sendSuccess(res, { symbol, type: 'balance_sheet', periods: data, updatedAt: new Date().toISOString(), dataSource: 'real' });
  } catch (e) {
    sendSuccess(res, { symbol, type: 'balance_sheet', periods: [], updatedAt: new Date().toISOString(), ...unavailable(e) });
  }
}));

/**
 * 利润表（真实源，多期年报）
 * GET /api/financials/income-statement?symbol=600519&periods=4
 */
router.get('/financials/income-statement', validateQuery(schemas.financialsQuery), asyncHandler(async (req, res) => {
  const symbol = (req.query.symbol as string) || '600519';
  const periods = Math.min(parseInt(req.query.periods as string) || 4, 10);
  try {
    const data = await getIncomeStatement(symbol, periods);
    sendSuccess(res, { symbol, type: 'income_statement', periods: data, updatedAt: new Date().toISOString(), dataSource: 'real' });
  } catch (e) {
    sendSuccess(res, { symbol, type: 'income_statement', periods: [], updatedAt: new Date().toISOString(), ...unavailable(e) });
  }
}));

/**
 * 现金流量表（真实源，多期年报）
 * GET /api/financials/cash-flow?symbol=600519&periods=4
 */
router.get('/financials/cash-flow', validateQuery(schemas.financialsQuery), asyncHandler(async (req, res) => {
  const symbol = (req.query.symbol as string) || '600519';
  const periods = Math.min(parseInt(req.query.periods as string) || 4, 10);
  try {
    const data = await getCashFlow(symbol, periods);
    sendSuccess(res, { symbol, type: 'cash_flow', periods: data, updatedAt: new Date().toISOString(), dataSource: 'real' });
  } catch (e) {
    sendSuccess(res, { symbol, type: 'cash_flow', periods: [], updatedAt: new Date().toISOString(), ...unavailable(e) });
  }
}));

/**
 * 财务汇总（真实源，最新年报：三大报表 + 关键指标）
 * GET /api/financials/summary?symbol=600519
 */
router.get('/financials/summary', validateQuery(schemas.financialsQuery), asyncHandler(async (req, res) => {
  const symbol = (req.query.symbol as string) || '600519';
  try {
    const summary = await getFinancialSummary(symbol);
    sendSuccess(res, { ...summary, updatedAt: new Date().toISOString(), dataSource: 'real' });
  } catch (e) {
    if (e instanceof FinancialsUnavailableError) {
      sendSuccess(res, { symbol, period: '', balanceSheet: null, incomeStatement: null, cashFlow: null, indicators: null, updatedAt: new Date().toISOString(), ...unavailable(e) });
      return;
    }
    throw e;
  }
}));

const VALID_METRICS = ['roe', 'roa', 'netMargin', 'grossMargin', 'currentRatio', 'debtToAssetRatio', 'eps', 'revenueGrowth', 'profitGrowth'];

/**
 * 财务指标趋势（真实源，多期年报）
 * GET /api/financials/trends?symbol=600519&metric=roe&periods=8
 * 指标来源：东方财富主要财务指标（RPT_LICO_FN_CPD），roa/currentRatio/debtToAssetRatio
 * 结合资产负债表真实值计算，绝不使用随机数伪造。
 */
router.get('/financials/trends', validateQuery(schemas.financialsTrendsQuery), asyncHandler(async (req, res) => {
  const symbol = (req.query.symbol as string) || '600519';
  const metric = (req.query.metric as string) || 'roe';
  const periods = Math.min(parseInt(req.query.periods as string) || 8, 12);

  if (!VALID_METRICS.includes(metric)) {
    return sendValidationError(res, `无效指标，可选: ${VALID_METRICS.join(', ')}`);
  }

  try {
    // 需要资产负债表辅助的指标：roa / currentRatio / debtToAssetRatio
    const needBalance = ['roa', 'currentRatio', 'debtToAssetRatio'].includes(metric);
    const indicators = await getFinancialIndicators(symbol, periods, 'annual');
    let balanceArr: Awaited<ReturnType<typeof getBalanceSheet>> = [];
    if (needBalance) {
      balanceArr = await getBalanceSheet(symbol, periods);
    }
    // 按报告期对齐（指标与资产负债表均按报告期倒序）
    const data: { period: string; value: number }[] = [];
    for (let i = 0; i < indicators.length; i++) {
      const ind = indicators[i];
      const bal = balanceArr[i];
      let value = 0;
      switch (metric) {
        case 'roe': value = ind.roe; break;
        case 'netMargin': value = ind.netMargin; break;
        case 'grossMargin': value = ind.grossMargin; break;
        case 'eps': value = ind.eps; break;
        case 'revenueGrowth': value = ind.revenueGrowth; break;
        case 'profitGrowth': value = ind.profitGrowth; break;
        case 'roa':
          value = bal && bal.totalAssets > 0 ? +((ind.parentNetProfit / bal.totalAssets) * 100).toFixed(2) : 0;
          break;
        case 'currentRatio':
          value = bal ? bal.currentRatio : 0;
          break;
        case 'debtToAssetRatio':
          value = bal ? bal.debtToAssetRatio : 0;
          break;
        default: value = 0;
      }
      data.push({ period: String(ind.dataYear || ind.reportDate.slice(0, 4)), value: +Number(value).toFixed(2) });
    }
    sendSuccess(res, { symbol, metric, values: data.reverse(), dataSource: 'real' });
  } catch (e) {
    sendSuccess(res, { symbol, metric, values: [], ...unavailable(e) });
  }
}));

export default router;
