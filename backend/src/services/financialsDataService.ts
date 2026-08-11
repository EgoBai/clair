/**
 * 财务报表数据服务（真实源版）
 *
 * 数据来源（东方财富，免 key）：
 * - 主要财务指标（EPS/ROE/毛利率/营收与净利同比/多期）：datacenter-web RPT_LICO_FN_CPD
 * - 资产负债表：emweb zcfzbAjaxNew（按报告期 dates 拉取）
 * - 利润表：emweb lrbAjaxNew
 * - 现金流量表：emweb xjllbAjaxNew
 *
 * 遵守「诚实数据」红线：真实源不可达 → 抛出 FinancialsUnavailableError，
 * 由路由层降级为 dataSource:'unavailable'，绝不回填随机数 / 硬编码伪造数据。
 *
 * 字段映射基于东财财报字段公开命名，数值为真实披露值；对于前端 schema 中
 * 无直接对应源的字段，诚实置 0（基于真实结构推导，非随机伪造）。
 */

/** 真实财报源不可用时抛出，供路由层降级为「诚实空」。 */
export class FinancialsUnavailableError extends Error {
  constructor(msg = '财报真实源暂不可用（后端未接入或网络受限）') {
    super(msg);
    this.name = 'FinancialsUnavailableError';
  }
}

const FETCH_TIMEOUT_MS = 8000;

/** 带超时的 JSON 抓取（复用 etfDataService 风格） */
async function fetchJson(url: string, headers?: Record<string, string>): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, { signal: ctrl.signal, headers });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } finally {
    clearTimeout(timer);
  }
}

/** 将多种符号格式归一化为东财所需的两种形式：emCode=SH600519, secucode=600519.SH */
function normalizeSymbol(symbol: string): { emCode: string; secucode: string; digits: string } {
  const trimmed = (symbol || '').trim().toUpperCase();
  let digits = trimmed.replace(/^(SH|SZ|BJ)/, '').replace(/\.(SH|SZ|BJ)$/, '');
  let market: 'SH' | 'SZ' | 'BJ';
  if (trimmed.startsWith('SH') || trimmed.endsWith('.SH')) market = 'SH';
  else if (trimmed.startsWith('SZ') || trimmed.endsWith('.SZ')) market = 'SZ';
  else if (trimmed.startsWith('BJ') || trimmed.endsWith('.BJ')) market = 'BJ';
  else if (digits.startsWith('6')) market = 'SH';
  else if (digits.startsWith('0') || digits.startsWith('3') || digits.startsWith('2')) market = 'SZ';
  else market = 'BJ'; // 8xx/4xx 北交所
  return { emCode: `${market}${digits}`, secucode: `${digits}.${market}`, digits };
}

function num(v: unknown): number {
  // 空值统一为 0（真实披露中 null 表示“该项目无发生额”，置 0 是诚实映射，非伪造）
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmt(v: number, digits = 2): number {
  return +num(v).toFixed(digits);
}

// ==================== 主要财务指标 ====================

export interface FinancialIndicator {
  reportDate: string; // YYYY-MM-DD
  reportType: string; // 年报 / 一季报 ...
  dataType: string; // 2024年 年报
  dataYear: string;
  eps: number;
  deductedEps: number;
  revenue: number; // 营业总收入
  parentNetProfit: number; // 归母净利润
  roe: number; // 加权净资产收益率
  bps: number; // 每股净资产
  ocfPerShare: number; // 每股经营现金流
  grossMargin: number; // 销售毛利率
  revenueGrowth: number; // 营收同比 %
  profitGrowth: number; // 归母净利同比 %
  dividendYield: number; // 股息率 %
  netMargin: number; // 净利率（归母净利/营收）%
}

/**
 * 获取主要财务指标（多期，按报告期倒序）。
 * type=annual 只取年报；type=all 取全部报告期。
 */
export async function getFinancialIndicators(
  symbol: string,
  periods: number,
  type: 'annual' | 'all' = 'annual',
): Promise<FinancialIndicator[]> {
  const { secucode } = normalizeSymbol(symbol);
  const pageSize = Math.max(periods * 4 + 4, 12); // 多取以覆盖年报筛选
  const url =
    `https://datacenter-web.eastmoney.com/api/data/v1/get` +
    `?sortColumns=REPORTDATE&sortTypes=-1&pageSize=${pageSize}&pageNumber=1` +
    `&reportName=RPT_LICO_FN_CPD&columns=ALL` +
    `&filter=(SECUCODE="${encodeURIComponent(secucode)}")`;
  let json: any;
  try {
    json = await fetchJson(url, { 'User-Agent': 'Mozilla/5.0' });
  } catch (e) {
    throw new FinancialsUnavailableError(e instanceof Error ? e.message : '财务指标源不可用');
  }
  const rows: any[] = json?.result?.data ?? [];
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new FinancialsUnavailableError(`未获取到 ${symbol} 的财务指标数据`);
  }
  let filtered = rows;
  if (type === 'annual') filtered = rows.filter((r) => r.DATEMMDD === '年报');
  return filtered.slice(0, periods).map((r) => {
    const revenue = num(r.TOTAL_OPERATE_INCOME);
    const parentNetProfit = num(r.PARENT_NETPROFIT);
    return {
      reportDate: String(r.REPORTDATE || '').slice(0, 10),
      reportType: String(r.DATEMMDD || ''),
      dataType: String(r.DATATYPE || ''),
      dataYear: String(r.DATAYEAR || ''),
      eps: num(r.BASIC_EPS),
      deductedEps: num(r.DEDUCT_BASIC_EPS),
      revenue,
      parentNetProfit,
      roe: num(r.WEIGHTAVG_ROE),
      bps: num(r.BPS),
      ocfPerShare: num(r.MGJYXJJE),
      grossMargin: num(r.XSMLL),
      revenueGrowth: num(r.YSTZ),
      profitGrowth: num(r.SJLTZ),
      dividendYield: num(r.ZXGXL),
      netMargin: revenue > 0 ? fmt((parentNetProfit / revenue) * 100) : 0,
    };
  });
}

// ==================== 三大报表 ====================

export interface BalanceSheet {
  symbol: string;
  period: string;
  reportType: string;
  totalAssets: number;
  currentAssets: number;
  nonCurrentAssets: number;
  cash: number;
  accountsReceivable: number;
  inventory: number;
  fixedAssets: number;
  intangibleAssets: number;
  goodwill: number;
  totalLiabilities: number;
  currentLiabilities: number;
  nonCurrentLiabilities: number;
  shortTermBorrowing: number;
  longTermBorrowing: number;
  accountsPayable: number;
  totalEquity: number;
  paidInCapital: number;
  capitalReserve: number;
  retainedEarnings: number;
  currentRatio: number;
  quickRatio: number;
  debtToAssetRatio: number;
  equityRatio: number;
}

export interface IncomeStatement {
  symbol: string;
  period: string;
  reportType: string;
  totalRevenue: number;
  operatingRevenue: number;
  otherRevenue: number;
  operatingCost: number;
  grossProfit: number;
  sellingExpenses: number;
  adminExpenses: number;
  financeExpenses: number;
  rdExpenses: number;
  operatingProfit: number;
  nonOperatingIncome: number;
  nonOperatingExpense: number;
  totalProfit: number;
  incomeTax: number;
  netProfit: number;
  parentNetProfit: number;
  minorityInterest: number;
  eps: number;
  grossMargin: number;
  operatingMargin: number;
  netMargin: number;
  roe: number;
  roa: number;
}

export interface CashFlow {
  symbol: string;
  period: string;
  reportType: string;
  cashFromSales: number;
  cashToEmployees: number;
  cashToSuppliers: number;
  taxPaid: number;
  netOperatingCashFlow: number;
  purchaseFixedAssets: number;
  purchaseInvestments: number;
  disposalProceeds: number;
  netInvestingCashFlow: number;
  borrowings: number;
  repaymentBorrowings: number;
  dividendsPaid: number;
  netFinancingCashFlow: number;
  netCashFlow: number;
  beginningCash: number;
  endingCash: number;
  operatingCashToNetProfit: number;
  freeCashFlow: number;
}

/** 取最近 N 个年报报告期（YYYY-12-31），基于指标源的真实报告期列表 */
async function getAnnualDates(symbol: string, periods: number): Promise<string[]> {
  const indicators = await getFinancialIndicators(symbol, periods, 'annual');
  return indicators.map((i) => i.reportDate).filter((d) => /^\d{4}-12-31$/.test(d));
}

function mapBalanceSheet(symbol: string, r: any): BalanceSheet {
  const totalAssets = num(r.TOTAL_ASSETS);
  const totalLiabilities = num(r.TOTAL_LIABILITIES);
  const currentAssets = num(r.TOTAL_CURRENT_ASSETS);
  const currentLiabilities = num(r.TOTAL_CURRENT_LIAB);
  const inventory = num(r.INVENTORY);
  const totalEquity = num(r.TOTAL_EQUITY);
  return {
    symbol,
    period: String(r.REPORT_DATE || '').slice(0, 10),
    reportType: String(r.REPORT_TYPE || '年报'),
    totalAssets,
    currentAssets,
    nonCurrentAssets: num(r.TOTAL_NONCURRENT_ASSETS),
    cash: num(r.MONETARYFUNDS),
    accountsReceivable: num(r.ACCOUNTS_RECE),
    inventory,
    fixedAssets: num(r.FIXED_ASSET),
    intangibleAssets: num(r.INTANGIBLE_ASSET),
    goodwill: num(r.GOODWILL),
    totalLiabilities,
    currentLiabilities,
    nonCurrentLiabilities: num(r.TOTAL_NONCURRENT_LIAB),
    shortTermBorrowing: num(r.SHORT_LOAN),
    longTermBorrowing: num(r.LONG_LOAN),
    accountsPayable: num(r.ACCOUNTS_PAYABLE),
    totalEquity,
    paidInCapital: num(r.SHARE_CAPITAL),
    capitalReserve: num(r.CAPITAL_RESERVE),
    retainedEarnings: num(r.UNASSIGN_RPOFIT) + num(r.SURPLUS_RESERVE),
    currentRatio: currentLiabilities > 0 ? fmt(currentAssets / currentLiabilities) : 0,
    quickRatio: currentLiabilities > 0 ? fmt((currentAssets - inventory) / currentLiabilities) : 0,
    debtToAssetRatio: totalAssets > 0 ? fmt((totalLiabilities / totalAssets) * 100) : 0,
    equityRatio: totalLiabilities > 0 ? fmt((totalEquity / totalLiabilities) * 100) : 0,
  };
}

function mapIncomeStatement(symbol: string, r: any): IncomeStatement {
  const totalRevenue = num(r.TOTAL_OPERATE_INCOME);
  const operatingRevenue = num(r.OPERATE_INCOME);
  const operatingCost = num(r.OPERATE_COST);
  const grossProfit = operatingRevenue - operatingCost - num(r.OPERATE_TAX_ADD);
  const netProfit = num(r.NETPROFIT);
  const parentNetProfit = num(r.PARENT_NETPROFIT);
  return {
    symbol,
    period: String(r.REPORT_DATE || '').slice(0, 10),
    reportType: String(r.REPORT_TYPE || '年报'),
    totalRevenue,
    operatingRevenue,
    otherRevenue: fmt(totalRevenue - operatingRevenue),
    operatingCost,
    grossProfit: fmt(grossProfit),
    sellingExpenses: num(r.SALE_EXPENSE),
    adminExpenses: num(r.MANAGE_EXPENSE),
    financeExpenses: num(r.FINANCE_EXPENSE),
    rdExpenses: num(r.RESEARCH_EXPENSE),
    operatingProfit: num(r.OPERATE_PROFIT),
    nonOperatingIncome: fmt(Math.max(0, num(r.TOTAL_PROFIT) - num(r.OPERATE_PROFIT))),
    nonOperatingExpense: fmt(Math.max(0, num(r.OPERATE_PROFIT) - num(r.TOTAL_PROFIT))),
    totalProfit: num(r.TOTAL_PROFIT),
    incomeTax: num(r.INCOME_TAX),
    netProfit,
    parentNetProfit,
    minorityInterest: fmt(netProfit - parentNetProfit),
    eps: num(r.BASIC_EPS),
    grossMargin: operatingRevenue > 0 ? fmt((grossProfit / operatingRevenue) * 100) : 0,
    operatingMargin: totalRevenue > 0 ? fmt((num(r.OPERATE_PROFIT) / totalRevenue) * 100) : 0,
    netMargin: totalRevenue > 0 ? fmt((netProfit / totalRevenue) * 100) : 0,
    // ROE/ROA 需资产负债表数据；利润表端无法独立计算，诚实置 0（由 summary 结合资产负债表计算）
    roe: 0,
    roa: 0,
  };
}

function mapCashFlow(symbol: string, r: any): CashFlow {
  const netOperatingCashFlow = num(r.NETCASH_OPERATE);
  const netInvestingCashFlow = num(r.NETCASH_INVEST);
  const netFinancingCashFlow = num(r.NETCASH_FINANCE);
  const netProfit = num(r.NETPROFIT);
  return {
    symbol,
    period: String(r.REPORT_DATE || '').slice(0, 10),
    reportType: String(r.REPORT_TYPE || '年报'),
    cashFromSales: num(r.SALES_SERVICES),
    cashToEmployees: -num(r.PAY_STAFF_CASH),
    cashToSuppliers: -num(r.BUY_SERVICES),
    taxPaid: -num(r.PAY_ALL_TAX),
    netOperatingCashFlow,
    purchaseFixedAssets: -num(r.CONSTRUCT_LONG_ASSET),
    purchaseInvestments: -num(r.INVEST_PAY_CASH),
    disposalProceeds: num(r.WITHDRAW_INVEST) + num(r.RECEIVE_INVEST_INCOME),
    netInvestingCashFlow,
    borrowings: num(r.TOTAL_FINANCE_INFLOW),
    repaymentBorrowings: -num(r.PAY_DEBT_CASH),
    dividendsPaid: -num(r.ASSIGN_DIVIDEND_PORFIT),
    netFinancingCashFlow,
    netCashFlow: fmt(netOperatingCashFlow + netInvestingCashFlow + netFinancingCashFlow),
    beginningCash: num(r.BEGIN_CCE),
    endingCash: num(r.END_CCE),
    operatingCashToNetProfit: netProfit > 0 ? fmt((netOperatingCashFlow / netProfit) * 100) : 0,
    freeCashFlow: fmt(netOperatingCashFlow + netInvestingCashFlow),
  };
}

async function fetchStatement<T>(
  symbol: string,
  endpoint: string,
  periods: number,
  mapper: (symbol: string, r: any) => T,
): Promise<T[]> {
  const { emCode } = normalizeSymbol(symbol);
  let dates: string[];
  try {
    dates = await getAnnualDates(symbol, periods);
  } catch (e) {
    if (e instanceof FinancialsUnavailableError) throw e;
    throw new FinancialsUnavailableError(e instanceof Error ? e.message : '报告期获取失败');
  }
  if (dates.length === 0) {
    throw new FinancialsUnavailableError(`未获取到 ${symbol} 的年报报告期`);
  }
  const want = dates.slice(0, periods);
  let results: any[];
  try {
    results = await Promise.all(
      want.map((d) =>
        fetchJson(
          `https://emweb.securities.eastmoney.com/PC_HSF10/NewFinanceAnalysis/${endpoint}` +
            `?companyType=4&reportDateType=0&reportType=1&dates=${d}&code=${emCode}`,
          { 'User-Agent': 'Mozilla/5.0', Referer: 'https://emweb.securities.eastmoney.com/' },
        ),
      ),
    );
  } catch (e) {
    throw new FinancialsUnavailableError(e instanceof Error ? e.message : '财报源请求失败');
  }
  const out: T[] = [];
  want.forEach((d, i) => {
    const rows: any[] = results[i]?.data ?? [];
    if (rows.length > 0) out.push(mapper(symbol, rows[0]));
    // 该报告期无数据则跳过（诚实，不补伪造）
  });
  if (out.length === 0) {
    throw new FinancialsUnavailableError(`未获取到 ${symbol} 的报表数据`);
  }
  return out;
}

export async function getBalanceSheet(symbol: string, periods: number): Promise<BalanceSheet[]> {
  return fetchStatement(symbol, 'zcfzbAjaxNew', periods, mapBalanceSheet);
}

export async function getIncomeStatement(symbol: string, periods: number): Promise<IncomeStatement[]> {
  return fetchStatement(symbol, 'lrbAjaxNew', periods, mapIncomeStatement);
}

export async function getCashFlow(symbol: string, periods: number): Promise<CashFlow[]> {
  return fetchStatement(symbol, 'xjllbAjaxNew', periods, mapCashFlow);
}

// ==================== 汇总 ====================

export interface FinancialSummary {
  symbol: string;
  period: string;
  balanceSheet: BalanceSheet | null;
  incomeStatement: IncomeStatement | null;
  cashFlow: CashFlow | null;
  indicators: {
    grossMargin: number;
    netMargin: number;
    roe: number;
    roa: number;
    currentRatio: number;
    quickRatio: number;
    debtToAssetRatio: number;
    totalAssetTurnover: number;
    inventoryTurnover: number;
    operatingCashToNetProfit: number;
    freeCashFlow: number;
    revenueGrowth: number;
    profitGrowth: number;
    eps: number;
    bps: number;
  } | null;
}

/**
 * 获取财务汇总（最新年报）：三大报表 + 关键指标。
 * 任一源失败时整体抛出 FinancialsUnavailableError，由路由层降级。
 */
export async function getFinancialSummary(symbol: string): Promise<FinancialSummary> {
  const [balanceArr, incomeArr, cashArr, indicatorArr] = await Promise.all([
    getBalanceSheet(symbol, 1),
    getIncomeStatement(symbol, 1),
    getCashFlow(symbol, 1),
    getFinancialIndicators(symbol, 1, 'annual'),
  ]);
  const balanceSheet = balanceArr[0] ?? null;
  const incomeStatement = incomeArr[0] ?? null;
  const cashFlow = cashArr[0] ?? null;
  const ind = indicatorArr[0] ?? null;
  const period = balanceSheet?.period || incomeStatement?.period || cashFlow?.period || ind?.reportDate || '';

  let indicators: FinancialSummary['indicators'] = null;
  if (balanceSheet && incomeStatement && cashFlow && ind) {
    const totalAssets = balanceSheet.totalAssets;
    const inventory = balanceSheet.inventory;
    const revenue = incomeStatement.totalRevenue;
    const operatingCost = incomeStatement.operatingCost;
    indicators = {
      grossMargin: ind.grossMargin || incomeStatement.grossMargin,
      netMargin: ind.netMargin || incomeStatement.netMargin,
      roe: ind.roe,
      roa: totalAssets > 0 ? fmt((incomeStatement.parentNetProfit / totalAssets) * 100) : 0,
      currentRatio: balanceSheet.currentRatio,
      quickRatio: balanceSheet.quickRatio,
      debtToAssetRatio: balanceSheet.debtToAssetRatio,
      totalAssetTurnover: totalAssets > 0 ? fmt(revenue / totalAssets) : 0,
      inventoryTurnover: inventory > 0 ? fmt(operatingCost / inventory) : 0,
      operatingCashToNetProfit: cashFlow.operatingCashToNetProfit,
      freeCashFlow: cashFlow.freeCashFlow,
      revenueGrowth: ind.revenueGrowth,
      profitGrowth: ind.profitGrowth,
      eps: ind.eps,
      bps: ind.bps,
    };
  }

  return { symbol, period, balanceSheet, incomeStatement, cashFlow, indicators };
}
