/**
 * AI 财报解读 — 确定性演示与结构化摘要
 *
 * 后端财报接口可能缺失，本模块提供两层确定性能力：
 *   1. generateDeterministicFinancials: 基于 LCG 线性同余种子
 *      (seed=20260725 联合 symbol 的 FNV-1a 哈希) 生成可复现的多期三表数据，
 *      用于接口缺失时兜底，保证页面渲染稳定。
 *   2. computeFinancialInsight: 基于三表（利润/资产负债/现金流）多期数据，
 *      动态计算 5 个维度的结构化摘要（盈利/成长/偿债/现金流/综合评分），
 *      结论文字由计算结果推导，不写死。
 *
 * 配色遵循中国习惯「涨红跌绿」：
 *   改善 / 正增长 → 红 #f5222d ；恶化 / 负增长 → 绿 #52c41a ；持平 → 灰。
 */

// ==================== 与 FinancialsPage 对齐的最小类型 ====================

export interface FIncomeStatement {
  symbol: string;
  period: string;
  totalRevenue: number;
  operatingCost: number;
  grossProfit: number;
  operatingProfit: number;
  netProfit: number;
  eps: number;
  grossMargin: number;
  netMargin: number;
  roe: number;
  roa: number;
}

export interface FBalanceSheet {
  symbol: string;
  period: string;
  totalAssets: number;
  currentAssets: number;
  nonCurrentAssets: number;
  cash: number;
  accountsReceivable: number;
  inventory: number;
  fixedAssets: number;
  totalLiabilities: number;
  currentLiabilities: number;
  totalEquity: number;
  currentRatio: number;
  debtToAssetRatio: number;
}

export interface FCashFlow {
  symbol: string;
  period: string;
  netOperatingCashFlow: number;
  netInvestingCashFlow: number;
  netFinancingCashFlow: number;
  netCashFlow: number;
  freeCashFlow: number;
  operatingCashToNetProfit: number;
}

export interface FIndicators {
  grossMargin: number;
  netMargin: number;
  roe: number;
  roa: number;
  currentRatio: number;
  debtToAssetRatio: number;
  revenueGrowth: number;
  profitGrowth: number;
}

export interface FFinancialSummary {
  balanceSheet: FBalanceSheet;
  incomeStatement: FIncomeStatement;
  cashFlow: FCashFlow;
  indicators: FIndicators;
}

export interface DeterministicFinancials {
  summary: FFinancialSummary;
  balanceHistory: FBalanceSheet[];
  incomeHistory: FIncomeStatement[];
  cashFlowHistory: FCashFlow[];
}

// ==================== 确定性随机（LCG） ====================

const LCG_A = 1103515245;
const LCG_C = 12345;
const LCG_M = 4294967296; // 2^32

/** FNV-1a 字符串哈希，使不同 symbol 派生出不同种子 */
function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 线性同余发生器，返回 [0,1) 确定性序列 */
function makeLcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(LCG_A, s) + LCG_C) >>> 0;
    return s / LCG_M;
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function round(v: number, digits = 2): number {
  const f = Math.pow(10, digits);
  return Math.round(v * f) / f;
}

/** 全局基础种子（按任务约定） */
const BASE_SEED = 20260725;

// ==================== 确定性三表数据生成 ====================

const DEMO_PERIODS = ['2025Q1', '2025Q2', '2025Q3', '2025Q4'];

export function generateDeterministicFinancials(
  symbol: string,
  baseSeed: number = BASE_SEED,
): DeterministicFinancials {
  const seed = (baseSeed ^ hashString(symbol)) >>> 0;
  const rng = makeLcg(seed);

  const income: FIncomeStatement[] = [];
  const balance: FBalanceSheet[] = [];
  const cash: FCashFlow[] = [];

  let revenue = 200 + rng() * 1500; // 200~1700 亿
  let assets = revenue * (1.2 + rng() * 0.8);
  const shares = 5 + rng() * 20; // 亿股

  for (let i = 0; i < DEMO_PERIODS.length; i++) {
    const period = DEMO_PERIODS[i];

    if (i > 0) {
      const g = -0.05 + rng() * 0.3; // -5% ~ +25%
      revenue = revenue * (1 + g);
    }

    const grossMargin = 0.35 + rng() * 0.2; // 35% ~ 55%
    const operatingCost = revenue * (1 - grossMargin);
    const grossProfit = revenue - operatingCost;
    const netMargin = grossMargin - (0.06 + rng() * 0.1); // 净利率 < 毛利率
    const netProfit = revenue * netMargin;
    const roe = netMargin * (1 + rng() * 0.6);
    const roa = roe * (0.4 + rng() * 0.4);
    const eps = netProfit / shares;
    const operatingProfit = grossProfit * (0.7 + rng() * 0.2);

    income.push({
      symbol,
      period,
      totalRevenue: round(revenue),
      operatingCost: round(operatingCost),
      grossProfit: round(grossProfit),
      operatingProfit: round(operatingProfit),
      netProfit: round(netProfit),
      eps: round(eps),
      grossMargin: round(grossMargin * 100),
      netMargin: round(netMargin * 100),
      roe: round(roe * 100),
      roa: round(roa * 100),
    });

    const debtRatio = 0.3 + rng() * 0.35; // 30% ~ 65%
    const totalLiabilities = assets * debtRatio;
    const totalEquity = assets - totalLiabilities;
    const currentRatio = 1.0 + rng() * 1.5; // 1.0 ~ 2.5
    const currentLiabilities = totalLiabilities * (0.4 + rng() * 0.3);
    const currentAssets = currentLiabilities * currentRatio;
    const cashAmt = assets * (0.05 + rng() * 0.15);
    const ar = assets * (0.05 + rng() * 0.12);
    const inv = assets * (0.05 + rng() * 0.12);
    const fixed = assets * (0.2 + rng() * 0.3);

    balance.push({
      symbol,
      period,
      totalAssets: round(assets),
      currentAssets: round(currentAssets),
      nonCurrentAssets: round(assets - currentAssets),
      cash: round(cashAmt),
      accountsReceivable: round(ar),
      inventory: round(inv),
      fixedAssets: round(fixed),
      totalLiabilities: round(totalLiabilities),
      currentLiabilities: round(currentLiabilities),
      totalEquity: round(totalEquity),
      currentRatio: round(currentRatio),
      debtToAssetRatio: round(debtRatio * 100),
    });

    const opCf = netProfit * (0.8 + rng() * 0.5); // 0.8 ~ 1.3 倍净利润
    const invCf = -assets * (0.02 + rng() * 0.08);
    const finCf = -netProfit * rng() * 0.3;
    const netCf = opCf + invCf + finCf;
    const fcf = opCf - Math.abs(invCf);

    cash.push({
      symbol,
      period,
      netOperatingCashFlow: round(opCf),
      netInvestingCashFlow: round(invCf),
      netFinancingCashFlow: round(finCf),
      netCashFlow: round(netCf),
      freeCashFlow: round(fcf),
      operatingCashToNetProfit: netProfit !== 0 ? round(opCf / netProfit) : 0,
    });

    // 下一期资产随留存收益温和增长
    assets = assets + netProfit * 0.3 + rng() * assets * 0.02;
  }

  const last = income[income.length - 1];
  const prev = income[income.length - 2];
  const lastBal = balance[balance.length - 1];
  const lastCash = cash[cash.length - 1];

  const summary: FFinancialSummary = {
    balanceSheet: lastBal,
    incomeStatement: last,
    cashFlow: lastCash,
    indicators: {
      grossMargin: last.grossMargin,
      netMargin: last.netMargin,
      roe: last.roe,
      roa: last.roa,
      currentRatio: lastBal.currentRatio,
      debtToAssetRatio: lastBal.debtToAssetRatio,
      revenueGrowth:
        prev.totalRevenue !== 0
          ? round(((last.totalRevenue - prev.totalRevenue) / prev.totalRevenue) * 100)
          : 0,
      profitGrowth:
        prev.netProfit !== 0
          ? round(((last.netProfit - prev.netProfit) / prev.netProfit) * 100)
          : 0,
    },
  };

  return { summary, balanceHistory: balance, incomeHistory: income, cashFlowHistory: cash };
}

// ==================== 结构化摘要计算 ====================

export type TrendDirection = 'up' | 'down' | 'flat';

export interface InsightDetail {
  label: string;
  value: string;
}

export interface DimensionResult {
  title: string;
  /** 主指标数值（用于 Statistic） */
  headline: number;
  headlineSuffix: string;
  headlinePrecision: number;
  /** 趋势方向（决定红/绿） */
  trend: TrendDirection;
  /** 趋势文字，如 "ROE 12.3% → 15.6%" */
  trendText: string;
  /** 一句话结论（动态生成） */
  conclusion: string;
  /** 涨红跌绿配色 */
  color: string;
  /** 标签文字：改善/稳定/恶化 等 */
  tagText: string;
  tagColor: string;
  details: InsightDetail[];
}

export interface FinancialInsight {
  profitability: DimensionResult;
  growth: DimensionResult;
  solvency: DimensionResult;
  cashQuality: DimensionResult;
  overallScore: number;
  rating: '优秀' | '良好' | '一般' | '关注';
  risks: string[];
  generatedAt: string;
  isDemo: boolean;
}

const UP_COLOR = '#f5222d'; // 改善/正增长 = 红（中国习惯）
const DOWN_COLOR = '#52c41a'; // 恶化/负增长 = 绿
const NEUTRAL_COLOR = '#8c8c8c';

interface TrendStat {
  dir: TrendDirection;
  first: number;
  last: number;
  pct: number;
}

function trendOf(series: number[]): TrendStat {
  if (series.length < 2) {
    const v = series.length ? series[0] : 0;
    return { dir: 'flat', first: v, last: v, pct: 0 };
  }
  const first = series[0];
  const last = series[series.length - 1];
  const pct = first !== 0 ? ((last - first) / Math.abs(first)) * 100 : 0;
  const dir: TrendDirection = pct > 1 ? 'up' : pct < -1 ? 'down' : 'flat';
  return { dir, first, last, pct };
}

function colorForTrend(dir: TrendDirection): string {
  return dir === 'up' ? UP_COLOR : dir === 'down' ? DOWN_COLOR : NEUTRAL_COLOR;
}

function trendTag(dir: TrendDirection, upText: string, downText: string, flatText: string) {
  if (dir === 'up') return { text: upText, color: 'red' };
  if (dir === 'down') return { text: downText, color: 'green' };
  return { text: flatText, color: 'default' };
}

export function computeFinancialInsight(
  summary: FFinancialSummary,
  incomeHistory: FIncomeStatement[],
  balanceHistory: FBalanceSheet[],
  cashFlowHistory: FCashFlow[],
  isDemo = false,
): FinancialInsight {
  const ind = summary.indicators;
  const lastIncome = summary.incomeStatement;
  const lastBal = summary.balanceSheet;
  const lastCash = summary.cashFlow;

  // 多期序列
  const grossMargins = incomeHistory.map((i) => i.grossMargin);
  const netMargins = incomeHistory.map((i) => i.netMargin);
  const roes = incomeHistory.map((i) => i.roe);
  const revenues = incomeHistory.map((i) => i.totalRevenue);
  const profits = incomeHistory.map((i) => i.netProfit);
  const debtRatios = balanceHistory.map((b) => b.debtToAssetRatio);
  const currentRatios = balanceHistory.map((b) => b.currentRatio);
  const cashRatios = cashFlowHistory.map((c) => c.operatingCashToNetProfit);

  const roeTrend = trendOf(roes);
  const revTrend = trendOf(revenues);
  const profitTrend = trendOf(profits);
  const debtTrend = trendOf(debtRatios);
  const cashTrend = trendOf(cashRatios);

  const fmt = (v: number, d = 2) => `${v >= 0 ? '' : ''}${v.toFixed(d)}`;

  // ---------- 1. 盈利能力 ----------
  const profTag = trendTag(roeTrend.dir, '改善', '恶化', '稳定');
  const profConclusion =
    roeTrend.dir === 'up'
      ? '盈利能力持续改善，ROE 与利润率均呈上行趋势。'
      : roeTrend.dir === 'down'
        ? '盈利能力有所弱化，需关注利润率下行风险。'
        : '盈利能力保持平稳，未见明显趋势性变化。';
  const profitability: DimensionResult = {
    title: '盈利能力',
    headline: round(lastIncome.roe),
    headlineSuffix: '%',
    headlinePrecision: 2,
    trend: roeTrend.dir,
    trendText: `ROE ${fmt(roeTrend.first)}% → ${fmt(roeTrend.last)}%`,
    conclusion: profConclusion,
    color: colorForTrend(roeTrend.dir),
    tagText: profTag.text,
    tagColor: profTag.color,
    details: [
      { label: '毛利率', value: `${fmt(lastIncome.grossMargin)}%` },
      { label: '净利率', value: `${fmt(lastIncome.netMargin)}%` },
      { label: 'ROE', value: `${fmt(lastIncome.roe)}%` },
    ],
  };

  // ---------- 2. 成长性 ----------
  const growthUp = ind.revenueGrowth >= 0 && ind.profitGrowth >= 0;
  const growthDown = ind.revenueGrowth < 0 && ind.profitGrowth < 0;
  const growthTag = trendTag(revTrend.dir, '高景气', '承压', '分化');
  const growthConclusion = growthDown
    ? '营收与净利润同比双双下滑，成长性承压。'
    : growthUp
      ? '营收与净利润同步增长，成长性良好。'
      : '营收与利润增长出现分化，需甄别结构驱动。';
  const growth: DimensionResult = {
    title: '成长性',
    headline: round(ind.revenueGrowth),
    headlineSuffix: '%',
    headlinePrecision: 2,
    trend: growthUp ? 'up' : growthDown ? 'down' : 'flat',
    trendText: `营收 YoY ${fmt(ind.revenueGrowth)}% / 净利 YoY ${fmt(ind.profitGrowth)}%`,
    conclusion: growthConclusion,
    color: growthUp ? UP_COLOR : growthDown ? DOWN_COLOR : NEUTRAL_COLOR,
    tagText: growthTag.text,
    tagColor: growthTag.color,
    details: [
      { label: '营收同比', value: `${fmt(ind.revenueGrowth)}%` },
      { label: '净利同比', value: `${fmt(ind.profitGrowth)}%` },
      { label: '最新营收', value: `${fmt(lastIncome.totalRevenue)} 亿` },
    ],
  };

  // ---------- 3. 偿债能力 ----------
  const debtRatio = lastBal.debtToAssetRatio;
  const currentRatio = lastBal.currentRatio;
  const solvencyHealthy = debtRatio <= 50 && currentRatio >= 1.5;
  const solvencyRisk = debtRatio > 65 || currentRatio < 1;
  const solvencyTag = solvencyRisk
    ? { text: '偏高风险', color: 'red' }
    : solvencyHealthy
      ? { text: '健康', color: 'green' }
      : { text: '中等', color: 'gold' };
  const solvencyConclusion = solvencyRisk
    ? '偿债压力偏高，存在流动性或杠杆风险，需密切关注。'
    : solvencyHealthy
      ? '偿债能力强健，财务结构稳健安全。'
      : '偿债能力处于中等水平，整体可控但留有观察空间。';
  const solvency: DimensionResult = {
    title: '偿债能力',
    headline: round(debtRatio),
    headlineSuffix: '%',
    headlinePrecision: 2,
    trend: debtTrend.dir,
    trendText: `资产负债率 ${fmt(debtTrend.first)}% → ${fmt(debtTrend.last)}%`,
    conclusion: solvencyConclusion,
    color: solvencyRisk ? DOWN_COLOR : solvencyHealthy ? UP_COLOR : NEUTRAL_COLOR,
    tagText: solvencyTag.text,
    tagColor: solvencyTag.color,
    details: [
      { label: '资产负债率', value: `${fmt(debtRatio)}%` },
      { label: '流动比率', value: `${fmt(currentRatio)} 倍` },
      { label: '股东权益', value: `${fmt(lastBal.totalEquity)} 亿` },
    ],
  };

  // ---------- 4. 现金流质量 ----------
  const cashRatio = lastCash.operatingCashToNetProfit;
  const cashTag =
    cashRatio >= 1 ? { text: '高含量', color: 'green' } : cashRatio >= 0.8 ? { text: '尚可', color: 'gold' } : { text: '偏低', color: 'red' };
  const cashConclusion =
    cashRatio >= 1
      ? '利润现金含量高，盈利质量扎实、回款健康。'
      : cashRatio >= 0.8
        ? '现金流基本覆盖净利润，盈利质量尚可。'
        : '利润含金量偏低，需关注应收与回款节奏。';
  const cashQuality: DimensionResult = {
    title: '现金流质量',
    headline: round(cashRatio),
    headlineSuffix: 'x',
    headlinePrecision: 2,
    trend: cashTrend.dir,
    trendText: `经营现金流/净利润 ${fmt(cashTrend.first)}x → ${fmt(cashTrend.last)}x`,
    conclusion: cashConclusion,
    color: cashRatio >= 1 ? UP_COLOR : cashRatio >= 0.8 ? NEUTRAL_COLOR : DOWN_COLOR,
    tagText: cashTag.text,
    tagColor: cashTag.color,
    details: [
      { label: '现金含量', value: `${fmt(cashRatio)}x` },
      { label: '经营现金流', value: `${fmt(lastCash.netOperatingCashFlow)} 亿` },
      { label: '净利润', value: `${fmt(lastIncome.netProfit)} 亿` },
    ],
  };

  // ---------- 5. 综合健康度评分 ----------
  const profScore = clamp(Math.round(lastIncome.roe * 2 + lastIncome.grossMargin * 0.3 + lastIncome.netMargin * 0.5), 0, 100);
  const growthScore = clamp(Math.round(50 + ind.revenueGrowth * 1.5 + ind.profitGrowth * 1.0), 0, 100);
  let solvencyScore = Math.round(100 - debtRatio);
  if (currentRatio >= 2) solvencyScore += 10;
  else if (currentRatio < 1) solvencyScore -= 20;
  solvencyScore = clamp(solvencyScore, 0, 100);
  const cashScore = clamp(Math.round(cashRatio * 60), 0, 100);

  const overallScore = Math.round(
    profScore * 0.35 + growthScore * 0.25 + solvencyScore * 0.25 + cashScore * 0.15,
  );
  const rating: FinancialInsight['rating'] =
    overallScore >= 85 ? '优秀' : overallScore >= 70 ? '良好' : overallScore >= 55 ? '一般' : '关注';

  // 动态风险提示
  const risks: string[] = [];
  if (debtRatio > 60) risks.push(`资产负债率 ${debtRatio.toFixed(1)}% 偏高，长期偿债压力需关注。`);
  if (currentRatio < 1.2) risks.push(`流动比率仅 ${currentRatio.toFixed(2)} 倍，短期偿债缓冲不足。`);
  if (cashRatio < 0.9) risks.push(`经营现金流/净利润为 ${cashRatio.toFixed(2)}，利润含金量一般。`);
  if (ind.profitGrowth < 0) risks.push(`净利润同比 ${ind.profitGrowth.toFixed(1)}%，成长性承压。`);
  if (ind.revenueGrowth < 0) risks.push(`营收同比 ${ind.revenueGrowth.toFixed(1)}%，市场需求或走弱。`);
  if (risks.length === 0)
    risks.push('各项核心指标稳健，建议持续跟踪行业景气度与宏观流动性变化。');
  const topRisks = risks.slice(0, 3);

  return {
    profitability,
    growth,
    solvency,
    cashQuality,
    overallScore,
    rating,
    risks: topRisks,
    generatedAt: new Date().toLocaleString('zh-CN'),
    isDemo,
  };
}
