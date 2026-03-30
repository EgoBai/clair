/**
 * 行业对比分析引擎
 * 多维度行业对比、景气度评估、产业链分析
 */

export interface IndustryData {
  name: string;
  code: string;
  pe: number;
  pb: number;
  ps: number;
  roe: number;
  grossMargin: number;
  netMargin: number;
  revenueGrowth: number;
  profitGrowth: number;
  debtToEquity: number;
  dividendYield: number;
  marketCap: number;
  turnoverRate: number;
  stockCount: number;
  upCount: number;
  downCount: number;
}

export interface IndustryRanking {
  industry: string;
  rank: number;
  score: number;
  valuationRank: number;
  growthRank: number;
  profitabilityRank: number;
  riskRank: number;
}

export interface ProsperityIndex {
  industry: string;
  index: number; // 0-100 景气度
  level: 'boom' | 'recover' | 'stable' | 'decline' | 'trough';
  trend: 'up' | 'down' | 'flat';
  signals: string[];
}

export interface ChainPosition {
  industry: string;
  upstream: string[];
  downstream: string[];
  position: 'upstream' | 'midstream' | 'downstream';
  marginPressure: 'expanding' | 'stable' | 'compressing';
}

/**
 * 多维度行业评分排名
 */
export function rankIndustries(industries: IndustryData[]): IndustryRanking[] {
  const scored = industries.map((ind) => {
    // 估值分 (越低越好)
    const valuationScore =
      normalize(ind.pe, 5, 80, true) * 0.4 +
      normalize(ind.pb, 0.5, 10, true) * 0.3 +
      normalize(ind.ps, 0.2, 8, true) * 0.3;

    // 成长分 (越高越好)
    const growthScore =
      normalize(ind.revenueGrowth, -10, 50) * 0.5 +
      normalize(ind.profitGrowth, -20, 60) * 0.5;

    // 盈利能力分
    const profitabilityScore =
      normalize(ind.roe, 0, 0.3) * 0.4 +
      normalize(ind.grossMargin, 0, 0.6) * 0.3 +
      normalize(ind.netMargin, -0.1, 0.3) * 0.3;

    // 风险分 (越低越好)
    const riskScore =
      normalize(ind.debtToEquity, 0, 3, true) * 0.5 +
      normalize(ind.turnoverRate, 0.5, 10, true) * 0.3 +
      (ind.dividendYield > 0 ? normalize(ind.dividendYield, 0, 0.08) * 0.2 : 0.1);

    // 综合分
    const totalScore =
      valuationScore * 0.25 +
      growthScore * 0.3 +
      profitabilityScore * 0.25 +
      riskScore * 0.2;

    return {
      industry: ind.name,
      rank: 0,
      score: Math.round(totalScore * 100) / 100,
      valuationRank: 0,
      growthRank: 0,
      profitabilityRank: 0,
      riskRank: 0,
    };
  });

  // 排名
  const byTotal = [...scored].sort((a, b) => b.score - a.score);
  byTotal.forEach((s, i) => (s.rank = i + 1));

  return byTotal;
}

/**
 * 景气度指数计算
 */
export function calculateProsperityIndex(
  industries: IndustryData[],
  previousPeriod: IndustryData[]
): ProsperityIndex[] {
  const prevMap = new Map(previousPeriod.map((i) => [i.code, i]));

  return industries.map((ind) => {
    const prev = prevMap.get(ind.code);

    // 基础景气度 (0-100)
    let index = 50;

    // 盈利增速贡献
    if (ind.profitGrowth > 20) index += 15;
    else if (ind.profitGrowth > 10) index += 10;
    else if (ind.profitGrowth > 0) index += 5;
    else if (ind.profitGrowth < -10) index -= 15;
    else if (ind.profitGrowth < 0) index -= 5;

    // 营收增速贡献
    if (ind.revenueGrowth > 15) index += 10;
    else if (ind.revenueGrowth > 5) index += 5;
    else if (ind.revenueGrowth < -5) index -= 10;

    // 涨跌家数比
    const advDec = ind.upCount / Math.max(1, ind.downCount);
    if (advDec > 2) index += 10;
    else if (advDec < 0.5) index -= 10;

    // 换手率活跃度
    if (ind.turnoverRate > 3) index += 5;
    else if (ind.turnoverRate < 1) index -= 5;

    // 环比改善
    if (prev) {
      if (ind.profitGrowth > prev.profitGrowth) index += 5;
      else index -= 3;
      if (ind.revenueGrowth > prev.revenueGrowth) index += 3;
    }

    index = Math.max(0, Math.min(100, index));

    let level: ProsperityIndex['level'];
    if (index >= 75) level = 'boom';
    else if (index >= 60) level = 'recover';
    else if (index >= 40) level = 'stable';
    else if (index >= 25) level = 'decline';
    else level = 'trough';

    let trend: 'up' | 'down' | 'flat' = 'flat';
    if (prev) {
      const delta = ind.profitGrowth - prev.profitGrowth;
      if (delta > 3) trend = 'up';
      else if (delta < -3) trend = 'down';
    }

    const signals: string[] = [];
    if (index >= 75) signals.push('行业高景气');
    if (index <= 25) signals.push('行业处于低谷');
    if (trend === 'up') signals.push('景气度上行');
    if (trend === 'down') signals.push('景气度下行');
    if (ind.turnoverRate > 5) signals.push('交易活跃');
    if (advDec > 3) signals.push('普涨格局');

    return {
      industry: ind.name,
      index: Math.round(index),
      level,
      trend,
      signals,
    };
  });
}

/**
 * 行业对比报告
 */
export interface ComparisonMetric {
  metric: string;
  values: { industry: string; value: number; rank: number }[];
  winner: string;
}

export function compareIndustries(
  industries: IndustryData[],
  metrics: (keyof IndustryData)[] = ['pe', 'pb', 'roe', 'revenueGrowth', 'profitGrowth', 'grossMargin']
): ComparisonMetric[] {
  const lowerBetter = new Set(['pe', 'pb', 'ps', 'debtToEquity', 'turnoverRate']);

  return metrics
    .filter((m) => typeof industries[0]?.[m] === 'number')
    .map((metric) => {
      const values = industries
        .map((ind) => ({ industry: ind.name, value: ind[metric] as number, rank: 0 }))
        .sort((a, b) => (lowerBetter.has(metric) ? a.value - b.value : b.value - a.value));

      values.forEach((v, i) => (v.rank = i + 1));

      return {
        metric,
        values,
        winner: values[0]?.industry ?? '',
      };
    });
}

/**
 * 产业链定位分析
 */
export function analyzeChainPosition(
  industry: string,
  relationships: Map<string, { upstream: string[]; downstream: string[] }>
): ChainPosition | null {
  const rel = relationships.get(industry);
  if (!rel) return null;

  // 通过上下游数量判断位置
  let position: ChainPosition['position'];
  const hasUpstream = rel.upstream.length > 0;
  const hasDownstream = rel.downstream.length > 0;

  if (hasUpstream && !hasDownstream) position = 'downstream';
  else if (!hasUpstream && hasDownstream) position = 'upstream';
  else position = 'midstream';

  return {
    industry,
    upstream: rel.upstream,
    downstream: rel.downstream,
    position,
    marginPressure: 'stable', // 需要外部数据进一步判断
  };
}

/**
 * 0-1 归一化, reverse=true 表示越小越好
 */
function normalize(value: number, min: number, max: number, reverse = false): number {
  if (max === min) return 0.5;
  let norm = (value - min) / (max - min);
  norm = Math.max(0, Math.min(1, norm));
  return reverse ? 1 - norm : norm;
}
