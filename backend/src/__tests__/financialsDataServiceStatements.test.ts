/**
 * financialsDataService 三大报表 + 财务汇总测试（诚实数据版）
 *
 * 补充既有 financialsDataService.test.ts（仅覆盖 getFinancialIndicators / normalizeSymbol），
 * 本文件覆盖：getBalanceSheet / getIncomeStatement / getCashFlow / getFinancialSummary。
 *
 * 数据源（东方财富，免 key）：
 * - 报告期列表：datacenter-web RPT_LICO_FN_CPD（年报 DATEMMDD='年报'，REPORTDATE=YYYY-12-31）
 * - 三表：emweb zcfzbAjaxNew / lrbAjaxNew / xjllbAjaxNew（按 dates 逐期拉取）
 *
 * 约定：真实源不可达 → 抛 FinancialsUnavailableError；绝不回填伪造数据。
 * 策略：stub 全局 fetch 按 URL 分发样例响应，无需真实外网。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getBalanceSheet,
  getIncomeStatement,
  getCashFlow,
  getFinancialSummary,
  FinancialsUnavailableError,
} from '../services/financialsDataService';

function jsonResponse(body: unknown, init?: { ok?: boolean; status?: number }) {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    json: () => Promise.resolve(body),
  } as Response;
}

// 指标源样例：两个年报报告期（2025 / 2024），外加一条季报（应被 annual 过滤）
const INDICATOR_ROWS = [
  {
    REPORTDATE: '2025-12-31 00:00:00',
    DATEMMDD: '年报',
    DATATYPE: '2025年 年报',
    DATAYEAR: '2025',
    BASIC_EPS: 58.5,
    DEDUCT_BASIC_EPS: 57.9,
    TOTAL_OPERATE_INCOME: 1.5e11,
    PARENT_NETPROFIT: 7.5e10,
    WEIGHTAVG_ROE: 32.1,
    BPS: 180.2,
    MGJYXJJE: 60.1,
    XSMLL: 91.5,
    YSTZ: 15.2,
    SJLTZ: 16.8,
    ZXGXL: 2.4,
  },
  {
    REPORTDATE: '2024-12-31 00:00:00',
    DATEMMDD: '年报',
    DATATYPE: '2024年 年报',
    DATAYEAR: '2024',
    BASIC_EPS: 50.1,
    TOTAL_OPERATE_INCOME: 1.3e11,
    PARENT_NETPROFIT: 6.4e10,
  },
  {
    REPORTDATE: '2025-09-30 00:00:00',
    DATEMMDD: '三季报',
    DATATYPE: '2025年 三季报',
    DATAYEAR: '2025',
    BASIC_EPS: 40.0,
  },
];

const BALANCE_ROW = {
  REPORT_DATE: '2025-12-31 00:00:00',
  REPORT_TYPE: '年报',
  TOTAL_ASSETS: 2.6e11,
  TOTAL_CURRENT_ASSETS: 2.0e11,
  TOTAL_NONCURRENT_ASSETS: 6.0e10,
  MONETARYFUNDS: 1.5e11,
  ACCOUNTS_RECE: 5.0e9,
  INVENTORY: 4.0e10,
  FIXED_ASSET: 1.5e10,
  INTANGIBLE_ASSET: 8.0e9,
  GOODWILL: 0,
  TOTAL_LIABILITIES: 5.0e10,
  TOTAL_CURRENT_LIAB: 4.0e10,
  TOTAL_NONCURRENT_LIAB: 1.0e10,
  SHORT_LOAN: 0,
  LONG_LOAN: 0,
  ACCOUNTS_PAYABLE: 3.0e9,
  TOTAL_EQUITY: 2.1e11,
  SHARE_CAPITAL: 1.256e9,
  CAPITAL_RESERVE: 1.4e9,
  UNASSIGN_RPOFIT: 1.9e11,
  SURPLUS_RESERVE: 1.7e10,
};

const INCOME_ROW = {
  REPORT_DATE: '2025-12-31 00:00:00',
  REPORT_TYPE: '年报',
  TOTAL_OPERATE_INCOME: 1.5e11,
  OPERATE_INCOME: 1.48e11,
  OPERATE_COST: 1.2e10,
  OPERATE_TAX_ADD: 2.0e9,
  SALE_EXPENSE: 3.0e9,
  MANAGE_EXPENSE: 1.0e10,
  FINANCE_EXPENSE: -1.5e9,
  RESEARCH_EXPENSE: 5.0e8,
  OPERATE_PROFIT: 1.0e11,
  TOTAL_PROFIT: 1.01e11,
  INCOME_TAX: 2.5e10,
  NETPROFIT: 7.6e10,
  PARENT_NETPROFIT: 7.5e10,
  BASIC_EPS: 58.5,
};

const CASH_ROW = {
  REPORT_DATE: '2025-12-31 00:00:00',
  REPORT_TYPE: '年报',
  SALES_SERVICES: 1.6e11,
  PAY_STAFF_CASH: 5.0e9,
  BUY_SERVICES: 2.0e10,
  PAY_ALL_TAX: 4.0e10,
  NETCASH_OPERATE: 8.0e10,
  CONSTRUCT_LONG_ASSET: 3.0e9,
  INVEST_PAY_CASH: 1.0e10,
  WITHDRAW_INVEST: 8.0e9,
  RECEIVE_INVEST_INCOME: 2.0e9,
  NETCASH_INVEST: -5.0e9,
  TOTAL_FINANCE_INFLOW: 0,
  PAY_DEBT_CASH: 1.0e9,
  ASSIGN_DIVIDEND_PORFIT: 3.5e10,
  NETCASH_FINANCE: -3.6e10,
  NETPROFIT: 7.6e10,
  BEGIN_CCE: 1.1e11,
  END_CCE: 1.5e11,
};

interface StubOpts {
  indicatorRows?: unknown[] | null;
  indicatorOk?: boolean;
  statementOk?: boolean;
  statementStatus?: number;
  balanceRows?: unknown[];
  incomeRows?: unknown[];
  cashRows?: unknown[];
}

/** 按 URL 分发：datacenter → 指标；emweb 三表 → 对应报表行 */
function stubFetch(opts: StubOpts = {}) {
  const fn = vi.fn().mockImplementation(async (url: string) => {
    const u = String(url);
    if (u.includes('datacenter-web.eastmoney.com')) {
      if (opts.indicatorOk === false) {
        return jsonResponse({}, { ok: false, status: 500 });
      }
      const rows = opts.indicatorRows === undefined ? INDICATOR_ROWS : opts.indicatorRows;
      return jsonResponse({ result: rows === null ? null : { data: rows, pages: 1 } });
    }
    if (u.includes('emweb.securities.eastmoney.com')) {
      if (opts.statementOk === false) {
        return jsonResponse({}, { ok: false, status: opts.statementStatus ?? 500 });
      }
      if (u.includes('zcfzbAjaxNew')) return jsonResponse({ data: opts.balanceRows ?? [BALANCE_ROW] });
      if (u.includes('lrbAjaxNew')) return jsonResponse({ data: opts.incomeRows ?? [INCOME_ROW] });
      if (u.includes('xjllbAjaxNew')) return jsonResponse({ data: opts.cashRows ?? [CASH_ROW] });
    }
    throw new Error(`unexpected url: ${u}`);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('financialsDataService 三大报表 (honest-data)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('(a) 真实样例响应 → 字段映射正确', () => {
    it('getBalanceSheet 映射资产负债表并计算衍生比率', async () => {
      stubFetch();
      const rows = await getBalanceSheet('600519', 1);

      expect(rows).toHaveLength(1);
      const bs = rows[0];
      expect(bs.symbol).toBe('600519');
      expect(bs.period).toBe('2025-12-31');
      expect(bs.reportType).toBe('年报');
      expect(bs.totalAssets).toBe(2.6e11);
      expect(bs.cash).toBe(1.5e11);
      expect(bs.inventory).toBe(4.0e10);
      expect(bs.totalLiabilities).toBe(5.0e10);
      expect(bs.totalEquity).toBe(2.1e11);
      // retainedEarnings = UNASSIGN_RPOFIT + SURPLUS_RESERVE
      expect(bs.retainedEarnings).toBe(1.9e11 + 1.7e10);
      // currentRatio = 2.0e11 / 4.0e10 = 5
      expect(bs.currentRatio).toBe(5);
      // quickRatio = (2.0e11 - 4.0e10) / 4.0e10 = 4
      expect(bs.quickRatio).toBe(4);
      // debtToAssetRatio = 5.0e10 / 2.6e11 * 100 ≈ 19.23
      expect(bs.debtToAssetRatio).toBeCloseTo(19.23, 2);
      // equityRatio = 2.1e11 / 5.0e10 * 100 = 420
      expect(bs.equityRatio).toBe(420);
    });

    it('getIncomeStatement 映射利润表并计算毛利率/净利率', async () => {
      stubFetch();
      const rows = await getIncomeStatement('600519', 1);

      expect(rows).toHaveLength(1);
      const inc = rows[0];
      expect(inc.totalRevenue).toBe(1.5e11);
      expect(inc.operatingRevenue).toBe(1.48e11);
      // grossProfit = 1.48e11 - 1.2e10 - 2.0e9 = 1.34e11
      expect(inc.grossProfit).toBe(1.34e11);
      // minorityInterest = NETPROFIT - PARENT_NETPROFIT = 1e9
      expect(inc.minorityInterest).toBe(1.0e9);
      // grossMargin = 1.34e11 / 1.48e11 * 100 ≈ 90.54
      expect(inc.grossMargin).toBeCloseTo(90.54, 2);
      // netMargin = 7.6e10 / 1.5e11 * 100 ≈ 50.67
      expect(inc.netMargin).toBeCloseTo(50.67, 2);
      // ROE/ROA 利润表端诚实置 0（由 summary 结合资产负债表计算）
      expect(inc.roe).toBe(0);
      expect(inc.roa).toBe(0);
    });

    it('getCashFlow 映射现金流量表（支出项取负）', async () => {
      stubFetch();
      const rows = await getCashFlow('600519', 1);

      expect(rows).toHaveLength(1);
      const cf = rows[0];
      expect(cf.cashFromSales).toBe(1.6e11);
      expect(cf.cashToEmployees).toBe(-5.0e9);
      expect(cf.cashToSuppliers).toBe(-2.0e10);
      expect(cf.taxPaid).toBe(-4.0e10);
      expect(cf.netOperatingCashFlow).toBe(8.0e10);
      expect(cf.purchaseFixedAssets).toBe(-3.0e9);
      // disposalProceeds = WITHDRAW_INVEST + RECEIVE_INVEST_INCOME
      expect(cf.disposalProceeds).toBe(8.0e9 + 2.0e9);
      expect(cf.dividendsPaid).toBe(-3.5e10);
      // netCashFlow = 8.0e10 - 5.0e9 - 3.6e10 = 3.9e10
      expect(cf.netCashFlow).toBe(3.9e10);
      // freeCashFlow = 8.0e10 + (-5.0e9) = 7.5e10
      expect(cf.freeCashFlow).toBe(7.5e10);
      // operatingCashToNetProfit = 8.0e10 / 7.6e10 * 100 ≈ 105.26
      expect(cf.operatingCashToNetProfit).toBeCloseTo(105.26, 2);
    });

    it('getFinancialSummary 汇总三表 + 指标并计算 ROA/周转率', async () => {
      stubFetch();
      const summary = await getFinancialSummary('600519');

      expect(summary.symbol).toBe('600519');
      expect(summary.period).toBe('2025-12-31');
      expect(summary.balanceSheet).not.toBeNull();
      expect(summary.incomeStatement).not.toBeNull();
      expect(summary.cashFlow).not.toBeNull();
      const ind = summary.indicators!;
      expect(ind).not.toBeNull();
      expect(ind.roe).toBe(32.1);
      expect(ind.grossMargin).toBe(91.5); // 指标源优先
      // roa = 7.5e10 / 2.6e11 * 100 ≈ 28.85
      expect(ind.roa).toBeCloseTo(28.85, 2);
      // totalAssetTurnover = 1.5e11 / 2.6e11 ≈ 0.58
      expect(ind.totalAssetTurnover).toBeCloseTo(0.58, 2);
      // inventoryTurnover = 1.2e10 / 4.0e10 = 0.3
      expect(ind.inventoryTurnover).toBe(0.3);
      expect(ind.eps).toBe(58.5);
      expect(ind.revenueGrowth).toBe(15.2);
    });

    it('periods=2 时按两个年报期分别拉取报表', async () => {
      const fetchMock = stubFetch();
      const rows = await getBalanceSheet('600519', 2);
      expect(rows).toHaveLength(2);
      const emwebCalls = fetchMock.mock.calls
        .map((c) => String(c[0]))
        .filter((u) => u.includes('zcfzbAjaxNew'));
      expect(emwebCalls).toHaveLength(2);
      expect(emwebCalls[0]).toContain('dates=2025-12-31');
      expect(emwebCalls[1]).toContain('dates=2024-12-31');
    });
  });

  describe('(b) 源不可达 → 抛 FinancialsUnavailableError', () => {
    it('指标源 HTTP 500 → getBalanceSheet 抛 FinancialsUnavailableError', async () => {
      stubFetch({ indicatorOk: false });
      await expect(getBalanceSheet('600519', 1)).rejects.toBeInstanceOf(FinancialsUnavailableError);
    });

    it('指标源返回空 → getIncomeStatement 抛 FinancialsUnavailableError', async () => {
      stubFetch({ indicatorRows: [] });
      await expect(getIncomeStatement('600519', 1)).rejects.toBeInstanceOf(FinancialsUnavailableError);
    });

    it('指标源 result 结构缺失 → getCashFlow 抛 FinancialsUnavailableError', async () => {
      stubFetch({ indicatorRows: null });
      await expect(getCashFlow('600519', 1)).rejects.toBeInstanceOf(FinancialsUnavailableError);
    });

    it('无有效年报报告期（全是季报）→ 抛 FinancialsUnavailableError', async () => {
      stubFetch({
        indicatorRows: [
          { REPORTDATE: '2025-09-30 00:00:00', DATEMMDD: '三季报', DATATYPE: '2025年 三季报', DATAYEAR: '2025' },
        ],
      });
      await expect(getBalanceSheet('600519', 1)).rejects.toBeInstanceOf(FinancialsUnavailableError);
    });

    it('报表接口 HTTP 500 → 抛 FinancialsUnavailableError', async () => {
      stubFetch({ statementOk: false, statementStatus: 500 });
      await expect(getBalanceSheet('600519', 1)).rejects.toBeInstanceOf(FinancialsUnavailableError);
    });

    it('报表接口返回空 data → 抛 FinancialsUnavailableError（不补伪造）', async () => {
      stubFetch({ balanceRows: [] });
      await expect(getBalanceSheet('600519', 1)).rejects.toBeInstanceOf(FinancialsUnavailableError);
    });

    it('fetch reject（网络不可达）→ 抛 FinancialsUnavailableError', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
      await expect(getFinancialSummary('600519')).rejects.toBeInstanceOf(FinancialsUnavailableError);
    });
  });

  describe('(c) symbol 归一化（通过请求 URL 断言）', () => {
    it('600519 → emCode=SH600519', async () => {
      const fetchMock = stubFetch();
      await getBalanceSheet('600519', 1);
      const emweb = fetchMock.mock.calls.map((c) => String(c[0])).find((u) => u.includes('zcfzbAjaxNew'))!;
      expect(emweb).toContain('code=SH600519');
    });

    it('SZ000001 → emCode=SZ000001；secucode 用于指标源', async () => {
      const fetchMock = stubFetch();
      await getBalanceSheet('SZ000001', 1);
      const urls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(urls.find((u) => u.includes('zcfzbAjaxNew'))!).toContain('code=SZ000001');
      expect(urls.find((u) => u.includes('datacenter-web'))!).toContain(
        encodeURIComponent('000001.SZ'),
      );
    });

    it('000001.SZ（后缀形式）→ emCode=SZ000001', async () => {
      const fetchMock = stubFetch();
      await getBalanceSheet('000001.SZ', 1);
      const emweb = fetchMock.mock.calls.map((c) => String(c[0])).find((u) => u.includes('zcfzbAjaxNew'))!;
      expect(emweb).toContain('code=SZ000001');
    });

    it('830799（8 开头）→ 北交所 emCode=BJ830799', async () => {
      const fetchMock = stubFetch();
      await getBalanceSheet('830799', 1);
      const emweb = fetchMock.mock.calls.map((c) => String(c[0])).find((u) => u.includes('zcfzbAjaxNew'))!;
      expect(emweb).toContain('code=BJ830799');
    });
  });
});
