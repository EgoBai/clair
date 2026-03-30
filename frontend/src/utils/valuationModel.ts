/**
 * 估值模型引擎
 * 支持 DCF / 相对估值 / SOTP 等模型
 */

export interface FinancialData {
  revenue: number;
  netIncome: number;
  freeCashFlow: number;
  totalDebt: number;
  cash: number;
  shares: number;
  bookValue: number;
  eps: number;
  pe: number;
  pb: number;
  roe: number;
  roic: number;
  growthRate: number;
  beta: number;
  dividendYield: number;
}

export interface DCFParams {
  freeCashFlow: number;
  growthRate: number;
  terminalGrowthRate: number;
  discountRate: number;
  projectionYears: number;
  shares: number;
  netDebt: number;
}

export interface ValuationResult {
  intrinsicValue: number;
  currentPrice: number;
  upside: number;
  fairValueRange: { low: number; high: number };
  confidence: 'high' | 'medium' | 'low';
  model: string;
  details: Record<string, number>;
}

export interface PeerComparison {
  ticker: string;
  name: string;
  pe: number;
  pb: number;
  ps: number;
  evEbitda: number;
  roe: number;
  grossMargin: number;
  netMargin: number;
  premium: number; // 估值溢价率
}

/**
 * DCF 折现现金流估值
 */
export function dcfValuation(params: DCFParams): ValuationResult {
  const {
    freeCashFlow,
    growthRate,
    terminalGrowthRate,
    discountRate,
    projectionYears,
    shares,
    netDebt,
  } = params;

  if (discountRate <= terminalGrowthRate) {
    return {
      intrinsicValue: 0,
      currentPrice: 0,
      upside: 0,
      fairValueRange: { low: 0, high: 0 },
      confidence: 'low',
      model: 'DCF',
      details: { error: 1 },
    };
  }

  let pvCashFlows = 0;
  let currentFCF = freeCashFlow;
  const yearlyProjections: number[] = [];

  for (let i = 1; i <= projectionYears; i++) {
    currentFCF *= 1 + growthRate;
    const pv = currentFCF / Math.pow(1 + discountRate, i);
    pvCashFlows += pv;
    yearlyProjections.push(currentFCF);
  }

  // Terminal Value (Gordon Growth Model)
  const terminalFCF = currentFCF * (1 + terminalGrowthRate);
  const terminalValue = terminalFCF / (discountRate - terminalGrowthRate);
  const pvTerminalValue = terminalValue / Math.pow(1 + discountRate, projectionYears);

  const enterpriseValue = pvCashFlows + pvTerminalValue;
  const equityValue = enterpriseValue - netDebt;
  const intrinsicValue = equityValue / shares;

  // 敏感性分析生成范围
  const sensitivityLow = intrinsicValue * 0.7;
  const sensitivityHigh = intrinsicValue * 1.3;

  return {
    intrinsicValue: Math.round(intrinsicValue * 100) / 100,
    currentPrice: 0,
    upside: 0,
    fairValueRange: {
      low: Math.round(sensitivityLow * 100) / 100,
      high: Math.round(sensitivityHigh * 100) / 100,
    },
    confidence: Math.abs(growthRate - terminalGrowthRate) > 0.03 ? 'high' : 'medium',
    model: 'DCF',
    details: {
      pvCashFlows: Math.round(pvCashFlows * 100) / 100,
      pvTerminalValue: Math.round(pvTerminalValue * 100) / 100,
      enterpriseValue: Math.round(enterpriseValue * 100) / 100,
      equityValue: Math.round(equityValue * 100) / 100,
      terminalValue: Math.round(terminalValue * 100) / 100,
    },
  };
}

/**
 * 相对估值法 (PE/PB/PS)
 */
export function relativeValuation(
  data: FinancialData,
  peerAverages: { avgPE: number; avgPB: number; avgPS: number },
  revenue: number,
  currentPrice: number
): ValuationResult {
  const peValue = data.eps * peerAverages.avgPE;
  const pbValue = (data.bookValue / data.shares) * peerAverages.avgPB;
  const psValue = (revenue / data.shares) * peerAverages.avgPS;

  const avgValue = (peValue + pbValue + psValue) / 3;

  return {
    intrinsicValue: Math.round(avgValue * 100) / 100,
    currentPrice,
    upside: Math.round(((avgValue - currentPrice) / currentPrice) * 10000) / 100,
    fairValueRange: {
      low: Math.round(Math.min(peValue, pbValue, psValue) * 100) / 100,
      high: Math.round(Math.max(peValue, pbValue, psValue) * 100) / 100,
    },
    confidence: 'medium',
    model: 'Relative',
    details: {
      peBased: Math.round(peValue * 100) / 100,
      pbBased: Math.round(pbValue * 100) / 100,
      psBased: Math.round(psValue * 100) / 100,
    },
  };
}

/**
 * PEG 估值
 */
export function pegValuation(eps: number, growthRate: number, currentPE: number): {
  peg: number;
  fairPE: number;
  signal: 'undervalued' | 'fair' | 'overvalued';
} {
  if (growthRate <= 0) {
    return { peg: Infinity, fairPE: 0, signal: 'overvalued' };
  }
  const peg = currentPE / (growthRate * 100);
  const fairPE = growthRate * 100 * 1; // PEG = 1 基准
  let signal: 'undervalued' | 'fair' | 'overvalued';
  if (peg < 0.8) signal = 'undervalued';
  else if (peg > 1.2) signal = 'overvalued';
  else signal = 'fair';

  return { peg: Math.round(peg * 100) / 100, fairPE: Math.round(fairPE * 100) / 100, signal };
}

/**
 * SOTP 分部估值
 */
export interface SegmentValue {
  name: string;
  revenue: number;
  margin: number;
  multiple: number; // EV/Revenue or EV/EBITDA
  type: 'revenue' | 'ebitda' | 'assets';
}

export function sotpValuation(segments: SegmentValue[], netDebt: number, shares: number): {
  totalValue: number;
  perShare: number;
  breakdown: { name: string; value: number; percentage: number }[];
} {
  const segmentValues = segments.map((s) => {
    let value = 0;
    if (s.type === 'revenue') value = s.revenue * s.multiple;
    else if (s.type === 'ebitda') value = s.revenue * s.margin * s.multiple;
    else value = s.revenue * s.multiple;
    return { name: s.name, value };
  });

  const totalEV = segmentValues.reduce((sum, s) => sum + s.value, 0);
  const equityValue = totalEV - netDebt;
  const perShare = equityValue / shares;

  const breakdown = segmentValues.map((s) => ({
    name: s.name,
    value: Math.round(s.value * 100) / 100,
    percentage: Math.round((s.value / totalEV) * 10000) / 100,
  }));

  return {
    totalValue: Math.round(equityValue * 100) / 100,
    perShare: Math.round(perShare * 100) / 100,
    breakdown,
  };
}

/**
 * 同业比较分析
 */
export function peerComparisonAnalysis(
  target: PeerComparison,
  peers: PeerComparison[]
): {
  ranking: Record<string, number>;
  percentileRank: Record<string, number>;
  summary: string;
} {
  const all = [...peers, target];
  const metrics = ['pe', 'pb', 'ps', 'evEbitda', 'roe', 'grossMargin', 'netMargin'] as const;

  const ranking: Record<string, number> = {};
  const percentileRank: Record<string, number> = {};

  for (const metric of metrics) {
    const sorted = [...all].sort((a, b) => {
      // 估值指标越低越好，盈利指标越高越好
      if (['pe', 'pb', 'ps', 'evEbitda'].includes(metric)) {
        return a[metric] - b[metric];
      }
      return b[metric] - a[metric];
    });
    const rank = sorted.findIndex((s) => s.ticker === target.ticker) + 1;
    ranking[metric] = rank;
    percentileRank[metric] = Math.round(((all.length - rank) / all.length) * 100);
  }

  const avgPercentile =
    Object.values(percentileRank).reduce((a, b) => a + b, 0) / metrics.length;
  let summary: string;
  if (avgPercentile > 75) summary = '行业中表现优异';
  else if (avgPercentile > 50) summary = '行业中表现中等偏上';
  else if (avgPercentile > 25) summary = '行业中表现中等偏下';
  else summary = '行业中表现较弱';

  return { ranking, percentileRank, summary };
}

/**
 * 加权综合估值评分 (0-100)
 */
export function valuationScore(financials: FinancialData): {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  factors: { name: string; score: number; weight: number }[];
} {
  const factors = [
    {
      name: 'PE估值',
      score: financials.pe < 15 ? 90 : financials.pe < 25 ? 70 : financials.pe < 40 ? 50 : 30,
      weight: 0.2,
    },
    {
      name: 'PB估值',
      score: financials.pb < 1.5 ? 90 : financials.pb < 3 ? 70 : financials.pb < 5 ? 50 : 30,
      weight: 0.15,
    },
    {
      name: 'ROE',
      score: financials.roe > 0.2 ? 90 : financials.roe > 0.15 ? 75 : financials.roe > 0.1 ? 60 : 40,
      weight: 0.2,
    },
    {
      name: '成长性',
      score:
        financials.growthRate > 0.3
          ? 90
          : financials.growthRate > 0.15
            ? 75
            : financials.growthRate > 0.05
              ? 60
              : 40,
      weight: 0.25,
    },
    {
      name: '现金流',
      score:
        financials.freeCashFlow > financials.netIncome * 0.8
          ? 85
          : financials.freeCashFlow > 0
            ? 65
            : 40,
      weight: 0.2,
    },
  ];

  const weightedScore = factors.reduce((sum, f) => sum + f.score * f.weight, 0);
  const score = Math.round(weightedScore);

  let grade: 'A' | 'B' | 'C' | 'D' | 'F';
  if (score >= 80) grade = 'A';
  else if (score >= 65) grade = 'B';
  else if (score >= 50) grade = 'C';
  else if (score >= 35) grade = 'D';
  else grade = 'F';

  return { score, grade, factors };
}
