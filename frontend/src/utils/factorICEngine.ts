/**
 * 因子IC分析引擎
 * 因子IC/ICIR/分层收益/因子衰减/因子相关性/因子合成
 */

export interface FactorData {
  date: string;
  ticker: string;
  factorValue: number;
  nextReturn: number;
}

export interface FactorICResult {
  factorName: string;
  ic: number;            // 信息系数
  icir: number;          // IC信息比率
  rankIC: number;        // 秩相关系数
  icMean: number;
  icStd: number;
  positiveRate: number;  // IC>0占比
  periods: number;
  validFlag: boolean;    // IC > 0.03
}

export interface FactorQuintileReturn {
  factorName: string;
  quintiles: {
    quintile: number;
    avgReturn: number;
    turnover: number;
    sharpe: number;
    count: number;
  }[];
  longShortReturn: number; // 多空收益
  monotonic: boolean;      // 是否单调递增
  topSpread: number;       // 最高组-最低组
}

export interface FactorDecay {
  factorName: string;
  lag: number;
  ic: number;
  decayRate: number;     // 衰减速率
}

export interface FactorCorrelation {
  factorA: string;
  factorB: string;
  correlation: number;
  absCorrelation: number;
  independent: boolean;  // |corr| < 0.3
}

export interface CompositeFactor {
  factors: { name: string; weight: number }[];
  ic: number;
  icir: number;
  stability: number;    // IC稳定性
}

/**
 * 计算IC (信息系数)
 */
export function calculateIC(data: FactorData[]): FactorICResult | null {
  if (data.length < 10) return null;

  const factorValues = data.map(d => d.factorValue);
  const returns = data.map(d => d.nextReturn);

  // Pearson相关系数
  const n = factorValues.length;
  const meanF = factorValues.reduce((s, v) => s + v, 0) / n;
  const meanR = returns.reduce((s, v) => s + v, 0) / n;

  let cov = 0, varF = 0, varR = 0;
  for (let i = 0; i < n; i++) {
    const df = factorValues[i] - meanF;
    const dr = returns[i] - meanR;
    cov += df * dr;
    varF += df * df;
    varR += dr * dr;
  }

  const ic = varF > 0 && varR > 0 ? cov / Math.sqrt(varF * varR) : 0;

  // Rank IC (Spearman)
  const rankF = rankArray(factorValues);
  const rankR = rankArray(returns);
  const meanRankF = rankF.reduce((s, v) => s + v, 0) / n;
  const meanRankR = rankR.reduce((s, v) => s + v, 0) / n;

  let rankCov = 0, rankVarF = 0, rankVarR = 0;
  for (let i = 0; i < n; i++) {
    const df = rankF[i] - meanRankF;
    const dr = rankR[i] - meanRankR;
    rankCov += df * dr;
    rankVarF += df * df;
    rankVarR += dr * dr;
  }

  const rankIC = rankVarF > 0 && rankVarR > 0
    ? rankCov / Math.sqrt(rankVarF * rankVarR) : 0;

  return {
    factorName: '',
    ic,
    icir: 0, // 需要时序数据
    rankIC,
    icMean: ic,
    icStd: 0,
    positiveRate: ic > 0 ? 1 : 0,
    periods: n,
    validFlag: Math.abs(ic) > 0.03,
  };
}

/**
 * 数组排名
 */
function rankArray(arr: number[]): number[] {
  const indexed = arr.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);
  const ranks = new Array(arr.length);
  indexed.forEach((item, rank) => { ranks[item.i] = rank + 1; });
  return ranks;
}

/**
 * 时序IC计算 (用于ICIR)
 */
export function calculateTimeSeriesIC(
  dataByDate: Map<string, FactorData[]>
): FactorICResult | null {
  const ics: number[] = [];

  dataByDate.forEach((data) => {
    const result = calculateIC(data);
    if (result) ics.push(result.ic);
  });

  if (ics.length < 3) return null;

  const icMean = ics.reduce((s, v) => s + v, 0) / ics.length;
  const icStd = Math.sqrt(ics.reduce((s, v) => s + (v - icMean) ** 2, 0) / ics.length);
  const icir = icStd > 0 ? icMean / icStd : 0;
  const positiveRate = ics.filter(ic => ic > 0).length / ics.length;

  return {
    factorName: '',
    ic: icMean,
    icir,
    rankIC: icMean,
    icMean,
    icStd,
    positiveRate,
    periods: ics.length,
    validFlag: Math.abs(icMean) > 0.03 && icir > 0.5,
  };
}

/**
 * 分层收益分析
 */
export function calculateQuintileReturns(
  data: FactorData[],
  factorName: string
): FactorQuintileReturn | null {
  if (data.length < 20) return null;

  // 按因子值排序分5组
  const sorted = [...data].sort((a, b) => a.factorValue - b.factorValue);
  const groupSize = Math.floor(sorted.length / 5);

  const quintiles: FactorQuintileReturn['quintiles'] = [];

  for (let q = 0; q < 5; q++) {
    const start = q * groupSize;
    const end = q === 4 ? sorted.length : (q + 1) * groupSize;
    const group = sorted.slice(start, end);

    const returns = group.map(d => d.nextReturn);
    const avgReturn = returns.reduce((s, r) => s + r, 0) / returns.length;

    const mean = avgReturn;
    const std = Math.sqrt(returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length);
    const sharpe = std > 0 ? mean / std : 0;

    quintiles.push({
      quintile: q + 1,
      avgReturn,
      turnover: 0.3, // 简化
      sharpe,
      count: group.length,
    });
  }

  const longShortReturn = quintiles[4].avgReturn - quintiles[0].avgReturn;
  const topSpread = quintiles[4].avgReturn - quintiles[0].avgReturn;

  // 单调性: 每组收益是否递增
  const monotonic = quintiles.every((q, i) =>
    i === 0 || q.avgReturn >= quintiles[i - 1].avgReturn
  );

  return {
    factorName,
    quintiles,
    longShortReturn,
    monotonic,
    topSpread,
  };
}

/**
 * 因子衰减分析
 */
export function calculateFactorDecay(
  dataByLag: Map<number, FactorData[]>
): FactorDecay[] {
  const decays: FactorDecay[] = [];

  dataByLag.forEach((data, lag) => {
    const ic = calculateIC(data);
    if (ic) {
      decays.push({
        factorName: '',
        lag,
        ic: ic.ic,
        decayRate: 0,
      });
    }
  });

  // 计算衰减速率
  decays.sort((a, b) => a.lag - b.lag);
  for (let i = 1; i < decays.length; i++) {
    if (decays[i - 1].ic !== 0) {
      decays[i].decayRate = 1 - decays[i].ic / decays[i - 1].ic;
    }
  }

  return decays;
}

/**
 * 因子相关性
 */
export function calculateFactorCorrelation(
  factorA: Map<string, number>, // ticker -> value
  factorB: Map<string, number>
): FactorCorrelation | null {
  const commonTickers = [...factorA.keys()].filter(t => factorB.has(t));
  if (commonTickers.length < 10) return null;

  const valsA = commonTickers.map(t => factorA.get(t)!);
  const valsB = commonTickers.map(t => factorB.get(t)!);

  const meanA = valsA.reduce((s, v) => s + v, 0) / valsA.length;
  const meanB = valsB.reduce((s, v) => s + v, 0) / valsB.length;

  let cov = 0, varA = 0, varB = 0;
  for (let i = 0; i < valsA.length; i++) {
    const da = valsA[i] - meanA;
    const db = valsB[i] - meanB;
    cov += da * db;
    varA += da * da;
    varB += db * db;
  }

  const corr = varA > 0 && varB > 0 ? cov / Math.sqrt(varA * varB) : 0;

  return {
    factorA: '',
    factorB: '',
    correlation: corr,
    absCorrelation: Math.abs(corr),
    independent: Math.abs(corr) < 0.3,
  };
}

/**
 * 因子合成
 */
export function compositeFactors(
  factors: { name: string; ic: number; icir: number }[],
  method: 'ic_weight' | 'equal' | 'icir_weight' = 'ic_weight'
): CompositeFactor {
  let weights: number[];

  if (method === 'equal') {
    weights = factors.map(() => 1 / factors.length);
  } else if (method === 'icir_weight') {
    const totalIcir = factors.reduce((s, f) => s + Math.abs(f.icir), 0) || 1;
    weights = factors.map(f => Math.abs(f.icir) / totalIcir);
  } else {
    const totalIc = factors.reduce((s, f) => s + Math.abs(f.ic), 0) || 1;
    weights = factors.map(f => Math.abs(f.ic) / totalIc);
  }

  const compositeIC = factors.reduce((s, f, i) => s + f.ic * weights[i], 0);
  const compositeICIR = factors.reduce((s, f, i) => s + f.icir * weights[i], 0);

  return {
    factors: factors.map((f, i) => ({ name: f.name, weight: weights[i] })),
    ic: compositeIC,
    icir: compositeICIR,
    stability: 1 - Math.abs(compositeICIR - compositeIC),
  };
}
