/**
 * AI 财报解读 — 结构化摘要计算
 *
 * 诚实数据红线：本模块不生成任何伪随机/确定性兜底三表数据。
 * 仅提供 computeFinancialInsight：基于三表（利润/资产负债/现金流）多期真实数据，
 * 动态计算 5 个维度的结构化摘要（盈利/成长/偿债/现金流/综合评分），
 * 结论文字由计算结果推导，不写死、不伪造。
 * 真实源缺失时由调用方（FinancialsPage）诚实置空或标记 unavailable。
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
  /** 单位：元。null = 无营业成本口径（银行/保险） */
  grossProfit: number | null;
  operatingProfit: number;
  netProfit: number;
  eps: number;
  /** 毛利率（%）。null = 无营业成本口径，不得现算 */
  grossMargin: number | null;
  netMargin: number;
  /** 后端利润表端恒为 null（ROE 需资产负债表，唯一可信来源是 summary.indicators.roe） */
  roe: number | null;
  roa: number | null;
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
  grossMargin: number | null;
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

// ==================== 计算辅助 ====================

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function round(v: number, digits = 2): number {
  const f = Math.pow(10, digits);
  return Math.round(v * f) / f;
}

// ==================== 结构化摘要计算 ====================

export type TrendDirection = 'up' | 'down' | 'flat';

export interface InsightDetail {
  label: string;
  value: string;
}

export interface DimensionResult {
  title: string;
  /** 主指标数值（用于 Statistic）。null = 该标的本期无此口径（如银行无毛利率），渲染为「—」 */
  headline: number | null;
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
  const netMargins = incomeHistory.map((i) => i.netMargin);
  const revenues = incomeHistory.map((i) => i.totalRevenue);
  const profits = incomeHistory.map((i) => i.netProfit);
  const debtRatios = balanceHistory.map((b) => b.debtToAssetRatio);
  const currentRatios = balanceHistory.map((b) => b.currentRatio);
  const cashRatios = cashFlowHistory.map((c) => c.operatingCashToNetProfit);

  const netMarginTrend = trendOf(netMargins);
  const revTrend = trendOf(revenues);
  const profitTrend = trendOf(profits);
  const debtTrend = trendOf(debtRatios);
  const cashTrend = trendOf(cashRatios);

  const fmt = (v: number, d = 2) => `${v >= 0 ? '' : ''}${v.toFixed(d)}`;
  /** 百分比渲染：null（无此口径）→ 「—」（带百分号会变成「—%」） */
  const fmtPct = (v: number | null | undefined, d = 2) => (v === null || v === undefined ? '—' : `${fmt(v, d)}%`);
  /**
   * 金额渲染：后端三表金额单位是「元」，展示统一按「亿元」。
   * 曾是 `${fmt(元值)} 亿` → 页面出现「61522204989.35 亿」这种量级错乱。
   */
  const YI = 1e8;
  const fmtYi = (v: number | null | undefined, d = 2) =>
    v === null || v === undefined ? '—' : `${fmt(v / YI, d)} 亿`;

  // ---------- 1. 盈利能力 ----------
  // ROE 全页唯一口径 = summary.indicators.roe（东财 WEIGHTAVG_ROE 加权净资产收益率）。
  // 利润表端 roe 恒为 null，历史实现把它当 0 渲染 → 同页并列出现「ROE 0.00%」与
  // 「ROE 32.53%」两个互相矛盾的值。
  const roe = ind.roe;
  const grossMargin = ind.grossMargin;
  const profTag = trendTag(netMarginTrend.dir, '改善', '恶化', '稳定');
  const profConclusion =
    netMarginTrend.dir === 'up'
      ? '盈利能力持续改善，净利率与 ROE 均呈上行趋势。'
      : netMarginTrend.dir === 'down'
        ? '盈利能力有所弱化，需关注利润率下行风险。'
        : '盈利能力保持平稳，未见明显趋势性变化。';
  const profitability: DimensionResult = {
    title: '盈利能力',
    headline: roe === null || roe === undefined ? null : round(roe),
    headlineSuffix: '%',
    headlinePrecision: 2,
    trend: netMarginTrend.dir,
    trendText: `净利率 ${fmtPct(netMarginTrend.first)} → ${fmtPct(netMarginTrend.last)}`,
    conclusion: profConclusion,
    color: colorForTrend(netMarginTrend.dir),
    tagText: profTag.text,
    tagColor: profTag.color,
    details: [
      { label: '毛利率', value: fmtPct(grossMargin) },
      { label: '净利率', value: `${fmt(lastIncome.netMargin)}%` },
      // ROE 只在上方 headline 展示一次；此处不再重复，避免同页并列两个 ROE 百分比
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
      { label: '最新营收', value: fmtYi(lastIncome.totalRevenue) },
    ],
  };

  // ---------- 3. 偿债能力 ----------
  const debtRatio = lastBal.debtToAssetRatio;
  // 流动比率只在「有流动资产负债科目」时才有意义：银行/保险报表不区分流动/非流动，
  // 后端这两项缺失被 num() 记为 0，继续现算就是「流动比率 0.00 倍」的假数
  // （浦发银行实测），还会凭空生成「短期偿债缓冲不足」的风险结论。
  const hasCurrentItems = lastBal.currentLiabilities > 0 && lastBal.currentAssets > 0;
  const currentRatio: number | null = hasCurrentItems ? lastBal.currentRatio : null;
  const solvencyHealthy = debtRatio <= 50 && currentRatio !== null && currentRatio >= 1.5;
  const solvencyRisk = debtRatio > 65 || (currentRatio !== null && currentRatio < 1);
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
      { label: '流动比率', value: currentRatio === null ? '—' : `${fmt(currentRatio)} 倍` },
      { label: '股东权益', value: fmtYi(lastBal.totalEquity) },
    ],
  };

  // ---------- 4. 现金流质量 ----------
  // 后端 operatingCashToNetProfit = 经营现金流/净利润 × 100，是**百分数**（72.12 = 72.12%），
  // 不是倍数。历史实现直接配 'x' 后缀，页面写出「现金含量 72.12x」。
  const cashRatioPct = lastCash.operatingCashToNetProfit;
  const cashRatio = cashRatioPct / 100; // 真正的倍数，用于阈值与评分
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
    headline: round(cashRatioPct),
    headlineSuffix: '%',
    headlinePrecision: 2,
    trend: cashTrend.dir,
    trendText: `经营现金流/净利润 ${fmt(cashTrend.first)}% → ${fmt(cashTrend.last)}%`,
    conclusion: cashConclusion,
    color: cashRatio >= 1 ? UP_COLOR : cashRatio >= 0.8 ? NEUTRAL_COLOR : DOWN_COLOR,
    tagText: cashTag.text,
    tagColor: cashTag.color,
    details: [
      { label: '现金含量', value: `${fmt(cashRatioPct)}%` },
      { label: '经营现金流', value: fmtYi(lastCash.netOperatingCashFlow) },
      { label: '净利润', value: fmtYi(lastIncome.netProfit) },
    ],
  };

  // ---------- 5. 综合健康度评分 ----------
  const profScore = clamp(
    Math.round((roe ?? 0) * 2 + (grossMargin ?? 0) * 0.3 + lastIncome.netMargin * 0.5),
    0,
    100,
  );
  const growthScore = clamp(Math.round(50 + ind.revenueGrowth * 1.5 + ind.profitGrowth * 1.0), 0, 100);
  let solvencyScore = Math.round(100 - debtRatio);
  if (currentRatio !== null) {
    if (currentRatio >= 2) solvencyScore += 10;
    else if (currentRatio < 1) solvencyScore -= 20;
  }
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
  if (currentRatio !== null && currentRatio < 1.2)
    risks.push(`流动比率仅 ${currentRatio.toFixed(2)} 倍，短期偿债缓冲不足。`);
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
