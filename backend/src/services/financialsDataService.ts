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

// ==================== 东财 F10 companyType 口径 ====================

/**
 * 东财 F10 财报接口（zcfzbAjaxNew / lrbAjaxNew / xjllbAjaxNew）用 companyType
 * 区分四套报表模板，**四者字段口径不同、不可互换**：
 *
 *   1 = 证券   2 = 保险   3 = 银行   4 = 工商业（通用）
 *
 * 实测（2026-11，600000 浦发 / 601318 中国平安 / 600030 中信证券 / 600519 茅台）：
 * 请求的 companyType 与标的实际类型不匹配时，接口返回 HTTP 200 + `{"$type":"1"}`
 * （**没有 data 字段**），不会返回错口径的数据。因此「按候选顺序试、首个非空即用」
 * 是安全的——错类型只会得到空，不会得到错数。
 *
 * 另注：银行/保险模板不披露 TOTAL_OPERATE_INCOME，营业收入只落在 OPERATE_INCOME；
 * 且两者均无「营业成本」概念（OPERATE_COST 缺失），故毛利率等成本类指标不能现算（见 mapIncomeStatement）。
 */
const COMPANY_TYPE = { SECURITIES: 1, INSURANCE: 2, BANK: 3, INDUSTRIAL: 4 } as const;

/** 类型未知时的回退链：工商业 → 银行 → 保险 → 证券（按 A 股标的分布，非金融占绝大多数） */
const COMPANY_TYPE_FALLBACK_CHAIN: number[] = [
  COMPANY_TYPE.INDUSTRIAL,
  COMPANY_TYPE.BANK,
  COMPANY_TYPE.INSURANCE,
  COMPANY_TYPE.SECURITIES,
];

/** companyType 是公司固有属性，命中后缓存 1 小时，避免每次请求都试错 */
const COMPANY_TYPE_TTL_MS = 60 * 60 * 1000;
const companyTypeCache = new Map<string, { type: number; at: number }>();

/** 清空 companyType 解析缓存（供单测隔离用） */
export function resetCompanyTypeCache(): void {
  companyTypeCache.clear();
}

/** 报表标识：缓存键与对外 companyTypeUsed 均以此区分（三表各自独立解析） */
export type StatementKind = 'balance-sheet' | 'income-statement' | 'cash-flow';

const STATEMENT_ENDPOINT: Record<StatementKind, string> = {
  'balance-sheet': 'zcfzbAjaxNew',
  'income-statement': 'lrbAjaxNew',
  'cash-flow': 'xjllbAjaxNew',
};

/** 上一次解析实际采用的 companyType（供路由层回填 companyTypeUsed，便于事后排查口径） */
export function getCompanyTypeUsed(symbol: string, kind: StatementKind): number | null {
  const entry = companyTypeCache.get(`${kind}|${normalizeSymbol(symbol).digits}`);
  return entry ? entry.type : null;
}

/**
 * 由 stocks.industry（+ name 用于细分「非银金融」）推导首选 companyType。
 * industry 缺失（如库未初始化 / 上市新股）时返回 null，交由纯回退链处理。
 */
function primaryCompanyType(industry: string | null, name: string | null): number | null {
  const ind = industry ?? '';
  const nm = name ?? '';
  if (/银行/.test(ind)) return COMPANY_TYPE.BANK;
  if (/保险/.test(ind)) return COMPANY_TYPE.INSURANCE;
  if (/证券|券商/.test(ind)) return COMPANY_TYPE.SECURITIES;
  if (/非银金融|多元金融|其他金融|金融服务/.test(ind)) {
    // 「非银金融」是粗分类（保险 + 证券 + 信托 + 金控混装），用名称细分；
    // 细分不出时按保险模板起步，错类型只会返回空，回退链会继续试证券。
    return /证券|券商|投行/.test(nm) ? COMPANY_TYPE.SECURITIES : COMPANY_TYPE.INSURANCE;
  }
  // 明确属于非金融行业 → 工商业模板
  return ind ? COMPANY_TYPE.INDUSTRIAL : null;
}

/** 读取标的行业；库未初始化/降级时诚实返回 null（不阻断财报抓取） */
async function lookupStockProfile(symbol: string): Promise<{ industry: string | null; name: string | null }> {
  try {
    const { db } = await import('../db/dbFactory');
    const stock = await db.getStockBySymbol(symbol);
    return { industry: stock?.industry ?? null, name: stock?.name ?? null };
  } catch {
    // 单测/未初始化场景：退化为纯 companyType 回退链
    return { industry: null, name: null };
  }
}

/**
 * 候选 companyType 序列（首位 = 行业推导的首选类型，其后为回退链）。
 * 上限 4 个，**只走一轮**，不做无限重试。
 */
async function companyTypeCandidates(symbol: string): Promise<number[]> {
  const { industry, name } = await lookupStockProfile(symbol);
  const primary = primaryCompanyType(industry, name);
  if (primary === null) return [...COMPANY_TYPE_FALLBACK_CHAIN];
  return [primary, ...COMPANY_TYPE_FALLBACK_CHAIN.filter((c) => c !== primary)];
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
  /**
   * 销售毛利率（%）。**null = 该标的无此口径**：
   * 东财指标源 XSMLL 对银行/保险为空（这两类公司没有「营业成本/毛利」概念），
   * 不得用 0 顶替 —— 0 会被前端渲染成真实存在的「0.00%」。
   */
  grossMargin: number | null;
  revenueGrowth: number; // 营收同比 %
  profitGrowth: number; // 归母净利同比 %
  dividendYield: number; // 股息率 %
  /**
   * **归母净利率**（%）= 归母净利润 / 营业总收入。
   * 全站唯一净利率口径（对外可比：东财/同花顺均用归母）；
   * 营收 ≤ 0（取不到）时返回 null，不用 0 冒充分母缺失。
   */
  netMargin: number | null;
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
      // XSMLL 缺失（银行/保险）→ null，不用 0 冒充「毛利率 0.00%」
      grossMargin: r.XSMLL === null || r.XSMLL === undefined ? null : fmt(num(r.XSMLL)),
      revenueGrowth: num(r.YSTZ),
      profitGrowth: num(r.SJLTZ),
      dividendYield: num(r.ZXGXL),
      netMargin: revenue > 0 ? fmt((parentNetProfit / revenue) * 100) : null,
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
  /** 单位：元。null = 该标的报表无「营业成本」口径（银行/保险），毛利润无从计算 */
  grossProfit: number | null;
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
  /** 毛利率（%）。null = 无营业成本口径，不得现算 */
  grossMargin: number | null;
  operatingMargin: number;
  netMargin: number;
  /**
   * ROE/ROA（%）。**恒为 null**：利润表单期数据无法独立算出 ROE/ROA
   * （需要资产负债表期初期末净资产/总资产）。历史实现硬编码 0，会被前端渲染成
   * 「ROE 0.00%」冒充真实值，并与 summary.indicators.roe 形成同页两个 ROE。
   * 唯一可信来源是 summary.indicators.roe（东财 WEIGHTAVG_ROE 加权净资产收益率）。
   */
  roe: null;
  roa: null;
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
  // 银行/保险模板不披露 TOTAL_OPERATE_INCOME，营业收入只落在 OPERATE_INCOME；
  // 缺 TOTAL_OPERATE_INCOME 时用它兜底（两者都是真实披露字段，非估算）。
  const totalRevenue = num(r.TOTAL_OPERATE_INCOME) || num(r.OPERATE_INCOME);
  const operatingRevenue = num(r.OPERATE_INCOME);
  const operatingCost = num(r.OPERATE_COST);
  // 营业成本缺失（银行/保险无此科目）时 num() 会得到 0，若继续现算毛利率会得到
  // 虚高的假毛利率（实测银行股 98.82%）。此种情形毛利率/毛利润一律 null。
  const hasOperatingCost =
    r.OPERATE_COST !== null && r.OPERATE_COST !== undefined && Number(r.OPERATE_COST) > 0;
  // 毛利口径：营业收入 − 营业成本。
  // **不减「税金及附加」**：东财指标源 XSMLL（销售毛利率）实测就是 (营业收入−营业成本)/营业收入
  // （茅台 2025 年报：15394.58亿/16883.81亿 = 91.1795%，与 XSMLL 完全一致）。
  // 历史实现多减了 OPERATE_TAX_ADD，白酒/烟草等消费税重的行业会凭空低十几个点
  // （茅台 74.98% vs 91.18%），同页出现两个互相矛盾的毛利率。
  const grossProfit = operatingRevenue - operatingCost;
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
    grossProfit: hasOperatingCost ? fmt(grossProfit) : null,
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
    grossMargin:
      hasOperatingCost && operatingRevenue > 0 ? fmt((grossProfit / operatingRevenue) * 100) : null,
    operatingMargin: totalRevenue > 0 ? fmt((num(r.OPERATE_PROFIT) / totalRevenue) * 100) : 0,
    netMargin: totalRevenue > 0 ? fmt((netProfit / totalRevenue) * 100) : 0,
    // ROE/ROA 需资产负债表（期初/期末净资产、总资产），利润表端无法独立计算。
    // 诚实置 null（而非 0）：0 会被渲染成「0.00%」冒充真实值，且与 summary 的
    // indicators.roe 并存时同页出现两个互相矛盾的 ROE。
    roe: null,
    roa: null,
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

/** 单期单模板抓取：返回该报告期的原始行（无数据时返回 []） */
async function fetchStatementRows(
  endpoint: string,
  emCode: string,
  date: string,
  companyType: number,
): Promise<any[]> {
  let json: any;
  try {
    json = await fetchJson(
      `https://emweb.securities.eastmoney.com/PC_HSF10/NewFinanceAnalysis/${endpoint}` +
        `?companyType=${companyType}&reportDateType=0&reportType=1&dates=${date}&code=${emCode}`,
      { 'User-Agent': 'Mozilla/5.0', Referer: 'https://emweb.securities.eastmoney.com/' },
    );
  } catch (e) {
    throw new FinancialsUnavailableError(e instanceof Error ? e.message : '财报源请求失败');
  }
  const rows = json?.data;
  return Array.isArray(rows) ? rows : [];
}

async function fetchStatement<T>(
  symbol: string,
  kind: StatementKind,
  periods: number,
  mapper: (symbol: string, r: any) => T,
): Promise<T[]> {
  const { emCode, digits } = normalizeSymbol(symbol);
  const endpoint = STATEMENT_ENDPOINT[kind];
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

  // ---- 第 1 步：按候选 companyType 逐类型试最新报告期，首个非空即定案 ----
  // 「新希望 = 行业首选类型」；缓存的类型排最前，命中后其余类型不再请求。
  const cacheKey = `${kind}|${digits}`;
  const cached = companyTypeCache.get(cacheKey);
  const cachedFresh = cached && Date.now() - cached.at < COMPANY_TYPE_TTL_MS ? cached.type : null;
  if (cached && cachedFresh === null) companyTypeCache.delete(cacheKey);

  const candidates = await companyTypeCandidates(symbol);
  const tryOrder = cachedFresh !== null ? [cachedFresh, ...candidates.filter((c) => c !== cachedFresh)] : candidates;

  let companyTypeUsed: number | null = null;
  let firstRows: any[] = [];
  for (const ct of tryOrder) {
    const rows = await fetchStatementRows(endpoint, emCode, want[0], ct);
    if (rows.length > 0) {
      companyTypeUsed = ct;
      firstRows = rows;
      break;
    }
  }
  if (companyTypeUsed === null) {
    throw new FinancialsUnavailableError(
      `未获取到 ${symbol} 的报表数据（companyType 依次尝试 ${tryOrder.join('/')} 均无数据）`,
    );
  }
  companyTypeCache.set(cacheKey, { type: companyTypeUsed, at: Date.now() });

  const out: T[] = [mapper(symbol, firstRows[0])];
  // ---- 第 2 步：其余报告期用已定案的 companyType 并行拉取 ----
  // 某期无数据则跳过（诚实，不补伪造），也不再跨类型回退（类型已定案，换类型只会是空）。
  if (want.length > 1) {
    const rest = await Promise.all(
      want.slice(1).map((d) => fetchStatementRows(endpoint, emCode, d, companyTypeUsed as number)),
    );
    rest.forEach((rows) => {
      if (rows.length > 0) out.push(mapper(symbol, rows[0]));
    });
  }
  return out;
}

export async function getBalanceSheet(symbol: string, periods: number): Promise<BalanceSheet[]> {
  return fetchStatement(symbol, 'balance-sheet', periods, mapBalanceSheet);
}

export async function getIncomeStatement(symbol: string, periods: number): Promise<IncomeStatement[]> {
  return fetchStatement(symbol, 'income-statement', periods, mapIncomeStatement);
}

export async function getCashFlow(symbol: string, periods: number): Promise<CashFlow[]> {
  return fetchStatement(symbol, 'cash-flow', periods, mapCashFlow);
}

// ==================== 汇总 ====================

export interface FinancialSummary {
  symbol: string;
  period: string;
  balanceSheet: BalanceSheet | null;
  incomeStatement: IncomeStatement | null;
  cashFlow: CashFlow | null;
  indicators: {
    /** 销售毛利率（%）。null = 该标的无此口径（银行/保险无营业成本） */
    grossMargin: number | null;
    /** **归母净利率**（%）。null = 营收缺失，不可算 */
    netMargin: number | null;
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
      // 口径优先级：东财指标源（XSMLL，与 Wind/Choice 同口径）> 利润表现算。
      // 用 ?? 而非 ||：指标源为 0（真实 0%）时不能被现算值顶掉；
      // 两者都为 null（银行/保险无营业成本）时诚实给 null，前端渲染「—」。
      grossMargin: ind.grossMargin ?? incomeStatement.grossMargin,
      // **归母净利率唯一口径**：只取指标源（归母净利/营收）。
      // 历史实现用 `ind.netMargin || incomeStatement.netMargin` 回退到利润表口径
      // （净利润含少数股东），导致同页并列 49.58% 与 47.85% 两个「净利率」。
      // 裁决：归母口径对外可比；取不到就 null（渲染「—」），**不回退**到利润表口径。
      netMargin: ind.netMargin,
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
