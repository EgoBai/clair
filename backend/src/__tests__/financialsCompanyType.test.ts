/**
 * financialsDataService —— 东财 F10 companyType 解析 / 毛利率与 ROE 口径 测试
 *
 * 背景（2026-11 修复）：
 * 1. 旧实现把 `companyType=4` 写死在 URL 里，导致银行/保险/证券股三表全部空表
 *    （东财口径：1=证券 2=保险 3=银行 4=工商业；类型不匹配时返回 200 + {"$type":"1"} 无 data）。
 * 2. 旧实现把利润表 roe/roa 硬编码 0，前端渲染成「ROE 0.00%」冒充真实值。
 * 3. 旧实现对没有「营业成本」科目的银行/保险现算毛利率（成本缺失被当成 0 → 98.82%）。
 *
 * 本文件锁定以上三点的契约：
 * - 按 industry 选首选 companyType；首选为空时按 4→3→2→1 回退链只走一轮；
 * - 实际采用的类型可经 getCompanyTypeUsed() 取到（路由回填 companyTypeUsed）；
 * - 无营业成本口径 → grossMargin/grossProfit 为 null（不是 0、不是现算值）；
 * - 利润表 roe/roa 恒为 null。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getBalanceSheet,
  getIncomeStatement,
  getFinancialSummary,
  getCompanyTypeUsed,
  resetCompanyTypeCache,
} from '../services/financialsDataService';

const mocks = vi.hoisted(() => ({ getStockBySymbol: vi.fn() }));

vi.mock('../db/dbFactory', () => ({
  db: { getStockBySymbol: mocks.getStockBySymbol },
}));

function jsonResponse(body: unknown, init?: { ok?: boolean; status?: number }) {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    json: () => Promise.resolve(body),
  } as Response;
}

const ANNUAL_INDICATORS = [
  {
    REPORTDATE: '2025-12-31 00:00:00',
    DATEMMDD: '年报',
    DATATYPE: '2025年 年报',
    DATAYEAR: '2025',
    TOTAL_OPERATE_INCOME: 1.73964e11,
    PARENT_NETPROFIT: 5.0405e10,
    WEIGHTAVG_ROE: 6.76,
    XSMLL: null, // 银行无毛利率口径
  },
  {
    REPORTDATE: '2024-12-31 00:00:00',
    DATEMMDD: '年报',
    DATATYPE: '2024年 年报',
    DATAYEAR: '2024',
    TOTAL_OPERATE_INCOME: 1.7e11,
    PARENT_NETPROFIT: 4.5e10,
    WEIGHTAVG_ROE: 6.2,
    XSMLL: null,
  },
];

/** 银行资产负债表样例（字段名取自东财 zcfzbAjaxNew companyType=3 真实响应） */
const BANK_BALANCE_ROW = {
  REPORT_DATE: '2025-12-31 00:00:00',
  REPORT_TYPE: '年报',
  TOTAL_ASSETS: 1.0081746e13,
  TOTAL_LIABILITIES: 9.2e12,
  TOTAL_EQUITY: 8.8e11,
  TOTAL_CURRENT_ASSETS: null,
  TOTAL_CURRENT_LIAB: null,
  INVENTORY: null,
  MONETARYFUNDS: 1.1e12,
};

/** 银行利润表样例：无 OPERATE_COST / 无 TOTAL_OPERATE_INCOME，营收只落在 OPERATE_INCOME */
const BANK_INCOME_ROW = {
  REPORT_DATE: '2025-12-31 00:00:00',
  REPORT_TYPE: '年报',
  OPERATE_INCOME: 1.73964e11,
  OPERATE_COST: null,
  OPERATE_TAX_ADD: null,
  OPERATE_PROFIT: 5.9e10,
  TOTAL_PROFIT: 6.0e10,
  NETPROFIT: 5.0405e10,
  PARENT_NETPROFIT: 5.0405e10,
};

const CASH_ROW = {
  REPORT_DATE: '2025-12-31 00:00:00',
  REPORT_TYPE: '年报',
  NETCASH_OPERATE: 1.0e11,
  NETCASH_INVEST: -2.0e10,
  NETCASH_FINANCE: -3.0e10,
  NETPROFIT: 5.0405e10,
};

interface StubOpts {
  /** 只对该 companyType 返回 data，其余返回 {"$type":"1"}（模拟东财真实行为） */
  onlyCompanyType?: number;
  /** 全部 companyType 都返回 data（东财对 lrbAjaxNew 宽松，4 也能出数据） */
  anyCompanyType?: boolean;
  incomeRow?: typeof BANK_INCOME_ROW | Record<string, unknown>;
  /** 覆盖指标源行（用于构造「归母不可得」等场景） */
  indicatorRows?: unknown[];
}

/** 按 URL 分发：datacenter → 指标；emweb → 按 URL 里的 companyType 决定有无 data */
function stubEastmoney(opts: StubOpts = {}) {
  const fn = vi.fn().mockImplementation(async (url: string) => {
    const u = String(url);
    if (u.includes('datacenter-web.eastmoney.com')) {
      return jsonResponse({ result: { data: opts.indicatorRows ?? ANNUAL_INDICATORS, pages: 1 } });
    }
    if (!u.includes('emweb.securities.eastmoney.com')) {
      throw new Error(`unexpected url: ${u}`);
    }
    const ctMatch = /companyType=(\d+)/.exec(u);
    const ct = ctMatch ? Number(ctMatch[1]) : -1;
    const allowed = opts.anyCompanyType === true || opts.onlyCompanyType === undefined || ct === opts.onlyCompanyType;
    if (!allowed) return jsonResponse({ $type: '1' });
    if (u.includes('zcfzbAjaxNew')) return jsonResponse({ data: [BANK_BALANCE_ROW] });
    if (u.includes('lrbAjaxNew')) return jsonResponse({ data: [opts.incomeRow ?? BANK_INCOME_ROW] });
    if (u.includes('xjllbAjaxNew')) return jsonResponse({ data: [CASH_ROW] });
    throw new Error(`unexpected url: ${u}`);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

/** 让 stocks.industry / name 返回指定行业 */
function stubIndustry(industry: string | null, name: string | null = null) {
  mocks.getStockBySymbol.mockResolvedValue(
    industry === null && name === null ? null : { symbol: '600000.SH', industry, name },
  );
}

function companyTypesRequested(fetchMock: ReturnType<typeof stubEastmoney>, endpoint: string): number[] {
  return fetchMock.mock.calls
    .map((c) => String(c[0]))
    .filter((u) => u.includes(endpoint))
    .map((u) => Number(/companyType=(\d+)/.exec(u)?.[1] ?? NaN));
}

describe('financialsDataService companyType 解析（金融股三表不再空表）', () => {
  beforeEach(() => {
    resetCompanyTypeCache();
    mocks.getStockBySymbol.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetCompanyTypeCache();
  });

  it('industry=银行 → 直接用 companyType=3，且只请求一次（不回退）', async () => {
    stubIndustry('银行', '浦发银行');
    const fetchMock = stubEastmoney({ onlyCompanyType: 3 });

    const rows = await getBalanceSheet('600000', 1);

    expect(rows).toHaveLength(1);
    expect(rows[0].totalAssets).toBe(1.0081746e13);
    expect(companyTypesRequested(fetchMock, 'zcfzbAjaxNew')).toEqual([3]);
    expect(getCompanyTypeUsed('600000', 'balance-sheet')).toBe(3);
  });

  it('industry=保险 → companyType=2（601318 中国平安）', async () => {
    stubIndustry('非银金融', '中国平安');
    const fetchMock = stubEastmoney({ onlyCompanyType: 2 });

    const rows = await getBalanceSheet('601318', 1);

    expect(rows).toHaveLength(1);
    expect(getCompanyTypeUsed('601318', 'balance-sheet')).toBe(2);
    expect(companyTypesRequested(fetchMock, 'zcfzbAjaxNew')).toEqual([2]);
  });

  it('industry=非银金融 + 名称含「证券」→ companyType=1（600030 中信证券）', async () => {
    stubIndustry('非银金融', '中信证券');
    const fetchMock = stubEastmoney({ onlyCompanyType: 1 });

    await getBalanceSheet('600030', 1);

    expect(getCompanyTypeUsed('600030', 'balance-sheet')).toBe(1);
    expect(companyTypesRequested(fetchMock, 'zcfzbAjaxNew')).toEqual([1]);
  });

  it('行业缺失 → 按 4→3→2→1 回退链，首个非空即定案，且只走一轮', async () => {
    stubIndustry(null);
    const fetchMock = stubEastmoney({ onlyCompanyType: 3 }); // 只有银行模板有数据

    const rows = await getBalanceSheet('600000', 1);

    expect(rows).toHaveLength(1);
    expect(companyTypesRequested(fetchMock, 'zcfzbAjaxNew')).toEqual([4, 3]);
    expect(getCompanyTypeUsed('600000', 'balance-sheet')).toBe(3);
  });

  it('行业首选类型无数据时继续沿回退链（首选 2 空 → 4 空 → 3 空 → 1 命中）', async () => {
    stubIndustry('非银金融', '某金控'); // 首选 2
    const fetchMock = stubEastmoney({ onlyCompanyType: 1 });

    await getBalanceSheet('600030', 1);

    expect(companyTypesRequested(fetchMock, 'zcfzbAjaxNew')).toEqual([2, 4, 3, 1]);
    expect(getCompanyTypeUsed('600030', 'balance-sheet')).toBe(1);
  });

  it('四种 companyType 全空 → 抛 FinancialsUnavailableError（不伪造）', async () => {
    stubIndustry('银行');
    stubEastmoney({ onlyCompanyType: 99 });
    await expect(getBalanceSheet('600000', 1)).rejects.toThrow(/companyType/);
  });

  it('解析结果按 symbol+报表缓存：第二次调用不再试错', async () => {
    stubIndustry('银行');
    const fetchMock = stubEastmoney({ onlyCompanyType: 3 });

    await getBalanceSheet('600000', 1);
    const firstRound = companyTypesRequested(fetchMock, 'zcfzbAjaxNew');
    await getBalanceSheet('600000', 1);
    const secondRound = companyTypesRequested(fetchMock, 'zcfzbAjaxNew').slice(firstRound.length);

    expect(firstRound).toEqual([3]);
    expect(secondRound).toEqual([3]); // 命中缓存，没有 4/2/1 试探
  });

  it('多期：首个报告期定案 companyType 后，其余报告期并行且不重复试错', async () => {
    stubIndustry('银行');
    const fetchMock = stubEastmoney({ onlyCompanyType: 3 });

    const rows = await getBalanceSheet('600000', 2);

    expect(rows).toHaveLength(2);
    expect(companyTypesRequested(fetchMock, 'zcfzbAjaxNew')).toEqual([3, 3]);
  });
});

describe('financialsDataService 毛利率 / ROE 口径', () => {
  beforeEach(() => {
    resetCompanyTypeCache();
    mocks.getStockBySymbol.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetCompanyTypeCache();
  });

  it('无营业成本口径（银行）→ grossMargin / grossProfit 为 null，不现算出 98.82%', async () => {
    stubIndustry('银行');
    stubEastmoney({ onlyCompanyType: 3 });

    const rows = await getIncomeStatement('600000', 1);

    expect(rows).toHaveLength(1);
    expect(rows[0].operatingCost).toBe(0);
    expect(rows[0].grossMargin).toBeNull();
    expect(rows[0].grossProfit).toBeNull();
  });

  it('银行模板不披露 TOTAL_OPERATE_INCOME → 营业收入用 OPERATE_INCOME 兜底', async () => {
    stubIndustry('银行');
    stubEastmoney({ onlyCompanyType: 3 });

    const rows = await getIncomeStatement('600000', 1);

    expect(rows[0].totalRevenue).toBe(1.73964e11);
    expect(rows[0].netMargin).toBeCloseTo(28.97, 1);
  });

  it('利润表 roe / roa 恒为 null（不硬编码 0）', async () => {
    stubIndustry('食品饮料', '贵州茅台');
    stubEastmoney({ anyCompanyType: true });

    const rows = await getIncomeStatement('600519', 1);

    expect(rows[0].roe).toBeNull();
    expect(rows[0].roa).toBeNull();
  });

  it('有真实营业成本时毛利率照常现算（不得因本次修复丢失）', async () => {
    stubIndustry('食品饮料', '贵州茅台');
    stubEastmoney({
      anyCompanyType: true,
      incomeRow: { ...BANK_INCOME_ROW, TOTAL_OPERATE_INCOME: 1.5e11, OPERATE_COST: 1.2e10, OPERATE_TAX_ADD: 0 },
    });

    const rows = await getIncomeStatement('600519', 1);

    // grossProfit = OPERATE_INCOME 1.73964e11 - OPERATE_COST 1.2e10 = 1.61964e11
    // grossMargin = 1.61964e11 / 1.73964e11 ≈ 93.1%
    expect(rows[0].grossMargin).toBeCloseTo(93.1, 1);
    expect(rows[0].grossProfit).toBeCloseTo(1.61964e11, -6);
  });

  it('summary：毛利率优先取指标源（XSMLL），银行两者皆缺 → null 而非 0', async () => {
    stubIndustry('银行');
    stubEastmoney({ onlyCompanyType: 3 });

    const summary = await getFinancialSummary('600000');

    expect(summary.indicators).not.toBeNull();
    expect(summary.indicators!.grossMargin).toBeNull();
    expect(summary.indicators!.roe).toBe(6.76); // 唯一 ROE 口径来自指标源
    // 归母净利率 = 归母净利 5.0405e10 / 营收 1.73964e11 ≈ 28.97%
    expect(summary.indicators!.netMargin).toBeCloseTo(28.97, 1);
    // 三表 companyType 均留痕
    expect(getCompanyTypeUsed('600000', 'balance-sheet')).toBe(3);
    expect(getCompanyTypeUsed('600000', 'income-statement')).toBe(3);
    expect(getCompanyTypeUsed('600000', 'cash-flow')).toBe(3);
  });

  it('summary：归母净利率取不到时为 null，**不回退**利润表口径（净利率只有一个口径）', async () => {
    stubIndustry('食品饮料', '贵州茅台');
    stubEastmoney({
      anyCompanyType: true,
      // 指标源营收缺失（东财个别标的新上市/重述时会空）→ 归母净利率算不出
      indicatorRows: [
        {
          REPORTDATE: '2025-12-31 00:00:00',
          DATEMMDD: '年报',
          DATATYPE: '2025年 年报',
          DATAYEAR: '2025',
          TOTAL_OPERATE_INCOME: null,
          PARENT_NETPROFIT: 5.0405e10,
          WEIGHTAVG_ROE: 32.53,
          XSMLL: 91.18,
        },
      ],
      // 利润表口径算得出来（营收 1.73964e11、净利 5.0405e10 → 28.97%）
      incomeRow: { ...BANK_INCOME_ROW, OPERATE_COST: 1.2e10, OPERATE_TAX_ADD: 0 },
    });

    const summary = await getFinancialSummary('600519');

    // 利润表口径是 28.97%，但**不许**拿它顶替归母口径
    expect(summary.incomeStatement!.netMargin).toBeCloseTo(28.97, 1);
    expect(summary.indicators!.netMargin).toBeNull();
  });
});
