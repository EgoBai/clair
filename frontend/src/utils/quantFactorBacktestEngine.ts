/**
 * 量化因子回测引擎 (Quant Factor Backtest Engine)
 * - 因子收益计算
 * - IC/IR分析
 * - 分层回测
 * - 因子衰减分析
 * - 多因子合成
 * - 换手率分析
 */

export interface FactorData {
  date: string;
  stock: string;
  factorValue: number;
  forwardReturn: number; // 前向收益
}

export interface FactorICResult {
  ic: number;           // 信息系数
  icStd: number;        // IC标准差
  ir: number;           // 信息比率 IC/ICStd
  rankIC: number;       // 秩相关IC
  icWinRate: number;    // IC为正的频率
  periods: number;
}

export interface QuantileReturn {
  quantile: number;
  avgReturn: number;
  annualizedReturn: number;
  sharpe: number;
  maxDrawdown: number;
  winRate: number;
  count: number;
}

export interface FactorDecay {
  lag: number;
  ic: number;
  returnSpread: number; // 多空收益差
}

export interface TurnoverAnalysis {
  avgTurnover: number;
  turnoverStd: number;
  icDecayFromTurnover: number;
  netAlpha: number;
}

export interface CompositeFactor {
  factors: { name: string; weight: number; ic: number }[];
  compositeIC: number;
  compositeIR: number;
  diversificationBenefit: number;
}

/**
 * 计算Pearson相关系数
 */
export function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 2) return 0;

  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let denX = 0;
  let denY = 0;

  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  const den = Math.sqrt(denX * denY);
  return den === 0 ? 0 : num / den;
}

/**
 * 计算Spearman秩相关系数
 */
export function spearmanCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 2) return 0;

  const rank = (arr: number[]): number[] => {
    const sorted = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const ranks = new Array(n);
    sorted.forEach((item, rank) => { ranks[item.i] = rank + 1; });
    return ranks;
  };

  return pearsonCorrelation(rank(x), rank(y));
}

/**
 * 计算因子IC
 */
export function calculateFactorIC(data: FactorData[]): FactorICResult {
  if (data.length < 2) {
    return { ic: 0, icStd: 0, ir: 0, rankIC: 0, icWinRate: 0, periods: 0 };
  }

  // 按日期分组
  const byDate = new Map<string, FactorData[]>();
  for (const d of data) {
    if (!byDate.has(d.date)) byDate.set(d.date, []);
    byDate.get(d.date)!.push(d);
  }

  const ics: number[] = [];
  const rankIcs: number[] = [];

  for (const [, group] of byDate) {
    if (group.length < 5) continue;
    const factors = group.map(g => g.factorValue);
    const returns = group.map(g => g.forwardReturn);

    ics.push(pearsonCorrelation(factors, returns));
    rankIcs.push(spearmanCorrelation(factors, returns));
  }

  const icMean = ics.length > 0 ? ics.reduce((a, b) => a + b, 0) / ics.length : 0;
  const icStd = ics.length > 1
    ? Math.sqrt(ics.reduce((s, ic) => s + (ic - icMean) ** 2, 0) / (ics.length - 1))
    : 0;
  const ir = icStd > 0 ? icMean / icStd : 0;
  const icWinRate = ics.length > 0 ? ics.filter(ic => ic > 0).length / ics.length : 0;
  const avgRankIC = rankIcs.length > 0 ? rankIcs.reduce((a, b) => a + b, 0) / rankIcs.length : 0;

  return {
    ic: Math.round(icMean * 10000) / 10000,
    icStd: Math.round(icStd * 10000) / 10000,
    ir: Math.round(ir * 10000) / 10000,
    rankIC: Math.round(avgRankIC * 10000) / 10000,
    icWinRate: Math.round(icWinRate * 10000) / 10000,
    periods: ics.length,
  };
}

/**
 * 分层回测
 */
export function quantileBacktest(data: FactorData[], quantiles: number = 5): QuantileReturn[] {
  if (data.length === 0) return [];

  // 按日期分组
  const byDate = new Map<string, FactorData[]>();
  for (const d of data) {
    if (!byDate.has(d.date)) byDate.set(d.date, []);
    byDate.get(d.date)!.push(d);
  }

  const quantileReturns: number[][] = Array.from({ length: quantiles }, () => []);

  for (const [, group] of byDate) {
    const sorted = [...group].sort((a, b) => a.factorValue - b.factorValue);
    const bucketSize = Math.max(1, Math.floor(sorted.length / quantiles));

    for (let q = 0; q < quantiles; q++) {
      const bucket = sorted.slice(q * bucketSize, (q + 1) * bucketSize);
      const avgReturn = bucket.reduce((s, d) => s + d.forwardReturn, 0) / bucket.length;
      quantileReturns[q].push(avgReturn);
    }
  }

  return quantileReturns.map((returns, i) => {
    const avgReturn = returns.reduce((a, b) => a + b, 0) / Math.max(returns.length, 1);
    const annualizedReturn = avgReturn * 252;
    const std = returns.length > 1
      ? Math.sqrt(returns.reduce((s, r) => s + (r - avgReturn) ** 2, 0) / (returns.length - 1))
      : 0;
    const sharpe = std > 0 ? (avgReturn / std) * Math.sqrt(252) : 0;
    const winRate = returns.length > 0 ? returns.filter(r => r > 0).length / returns.length : 0;

    // 最大回撤
    let peak = 0;
    let cumReturn = 0;
    let maxDD = 0;
    for (const r of returns) {
      cumReturn += r;
      if (cumReturn > peak) peak = cumReturn;
      const dd = peak - cumReturn;
      if (dd > maxDD) maxDD = dd;
    }

    return {
      quantile: i + 1,
      avgReturn: Math.round(avgReturn * 10000) / 10000,
      annualizedReturn: Math.round(annualizedReturn * 10000) / 10000,
      sharpe: Math.round(sharpe * 100) / 100,
      maxDrawdown: Math.round(maxDD * 10000) / 10000,
      winRate: Math.round(winRate * 10000) / 10000,
      count: returns.length,
    };
  });
}

/**
 * 因子衰减分析
 */
export function analyzeFactorDecay(
  data: FactorData[],
  maxLag: number = 10
): FactorDecay[] {
  const byDate = new Map<string, FactorData[]>();
  for (const d of data) {
    if (!byDate.has(d.date)) byDate.set(d.date, []);
    byDate.get(d.date)!.push(d);
  }

  const dates = [...byDate.keys()].sort();
  const results: FactorDecay[] = [];

  for (let lag = 1; lag <= maxLag; lag++) {
    const lagIcs: number[] = [];
    const longShortReturns: number[] = [];

    for (let i = 0; i < dates.length - lag; i++) {
      const currGroup = byDate.get(dates[i])!;
      const futGroup = byDate.get(dates[i + lag]);

      if (!futGroup || currGroup.length < 5 || futGroup.length < 5) continue;

      // 匹配股票的前向收益
      const futMap = new Map(futGroup.map(d => [d.stock, d.forwardReturn]));
      const matched = currGroup.filter(d => futMap.has(d.stock));

      if (matched.length < 5) continue;

      const factors = matched.map(d => d.factorValue);
      const returns = matched.map(d => futMap.get(d.stock)!);
      lagIcs.push(pearsonCorrelation(factors, returns));

      // 多空收益差
      const sorted = [...matched].sort((a, b) => a.factorValue - b.factorValue);
      const topN = Math.max(1, Math.floor(sorted.length * 0.2));
      const longRet = sorted.slice(-topN).reduce((s, d) => s + (futMap.get(d.stock) || 0), 0) / topN;
      const shortRet = sorted.slice(0, topN).reduce((s, d) => s + (futMap.get(d.stock) || 0), 0) / topN;
      longShortReturns.push(longRet - shortRet);
    }

    const avgIc = lagIcs.length > 0 ? lagIcs.reduce((a, b) => a + b, 0) / lagIcs.length : 0;
    const avgSpread = longShortReturns.length > 0
      ? longShortReturns.reduce((a, b) => a + b, 0) / longShortReturns.length : 0;

    results.push({
      lag,
      ic: Math.round(avgIc * 10000) / 10000,
      returnSpread: Math.round(avgSpread * 10000) / 10000,
    });
  }

  return results;
}

/**
 * 换手率分析
 */
export function analyzeTurnover(
  quantileReturns: QuantileReturn[],
  avgHoldingPeriod: number = 5
): TurnoverAnalysis {
  const avgTurnover = 1 / avgHoldingPeriod;
  const turnoverStd = avgTurnover * 0.3;
  const icDecayFromTurnover = avgTurnover * 0.02; // 换手带来的IC衰减
  const netAlpha = quantileReturns.length > 0
    ? (quantileReturns[quantileReturns.length - 1].avgReturn - quantileReturns[0].avgReturn) - icDecayFromTurnover
    : 0;

  return {
    avgTurnover: Math.round(avgTurnover * 10000) / 10000,
    turnoverStd: Math.round(turnoverStd * 10000) / 10000,
    icDecayFromTurnover: Math.round(icDecayFromTurnover * 10000) / 10000,
    netAlpha: Math.round(netAlpha * 10000) / 10000,
  };
}

/**
 * 多因子合成
 */
export function compositeFactors(
  factors: { name: string; weight: number; data: FactorData[] }[]
): CompositeFactor {
  const results: { name: string; weight: number; ic: number }[] = [];
  const allICs: number[] = [];

  for (const f of factors) {
    const ic = calculateFactorIC(f.data);
    results.push({ name: f.name, weight: f.weight, ic: ic.ic });
    allICs.push(ic.ic);
  }

  // 合成IC：加权平均（简化）
  const totalWeight = factors.reduce((s, f) => s + Math.abs(f.weight), 0);
  const compositeIC = totalWeight > 0
    ? results.reduce((s, r) => s + r.ic * r.weight, 0) / totalWeight
    : 0;

  // 合成IR
  const icStd = allICs.length > 1
    ? Math.sqrt(allICs.reduce((s, ic) => {
      const mean = allICs.reduce((a, b) => a + b, 0) / allICs.length;
      return s + (ic - mean) ** 2;
    }, 0) / (allICs.length - 1))
    : 0;
  const compositeIR = icStd > 0 ? compositeIC / icStd : 0;

  // 分散化收益（因子间相关性低则有正收益）
  const avgPairwiseCorr = factors.length > 1 ? 0.3 : 0; // 简化估计
  const diversificationBenefit = Math.max(0, 1 - avgPairwiseCorr);

  return {
    factors: results,
    compositeIC: Math.round(compositeIC * 10000) / 10000,
    compositeIR: Math.round(compositeIR * 10000) / 10000,
    diversificationBenefit: Math.round(diversificationBenefit * 10000) / 10000,
  };
}
