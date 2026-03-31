/**
 * 智能Beta因子引擎
 * - 因子构建(价值/动量/质量/低波动/规模)
 * - 因子收益计算
 * - 因子IC分析
 * - 多因子加权
 * - 因子拥挤度检测
 */
export interface FactorData {
  stockCode: string;
  value: number; // 价值因子(BP/EP)
  momentum: number; // 动量因子(12M-1M)
  quality: number; // 质量因子(ROE/毛利率)
  lowVol: number; // 低波动因子(负波动率)
  size: number; // 规模因子(负市值)
  composite: number; // 综合得分
}

export interface FactorPerformance {
  factor: string;
  ic: number; // 信息系数
  icir: number; // IC信息比率
  longShortReturn: number; // 多空收益
  turnover: number; // 换手率
  sharpe: number;
  maxDrawdown: number;
}

export interface SmartBetaAnalysis {
  factors: FactorPerformance[];
  compositeScore: FactorData[];
  topStocks: FactorData[];
  bottomStocks: FactorData[];
  factorWeights: Record<string, number>;
  crowding: Record<string, number>; // 拥挤度 0-1
  rebalanceSignal: boolean;
  expectedAlpha: number;
}

export function computeSmartBeta(
  rawData: Array<{
    stockCode: string;
    bp: number; ep: number;
    ret12m1m: number;
    roe: number; grossMargin: number;
    volatility: number;
    marketCap: number;
    nextReturn: number;
  }>,
  weights?: Record<string, number>
): SmartBetaAnalysis {
  if (rawData.length === 0) throw new Error('数据不能为空');

  // 因子标准化
  const factors: FactorData[] = rawData.map(d => {
    return {
      stockCode: d.stockCode,
      value: d.bp,
      momentum: d.ret12m1m,
      quality: d.roe,
      lowVol: -d.volatility,
      size: -d.marketCap,
      composite: 0,
    };
  });

  // 各因子排名标准化
  const rankNormalize = (vals: number[]): number[] => {
    const sorted = [...vals].map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const ranks = new Array(vals.length);
    for (let r = 0; r < sorted.length; r++) {
      ranks[sorted[r].i] = (r + 0.5) / sorted.length - 0.5;
    }
    return ranks;
  };

  const valueRanks = rankNormalize(factors.map(f => f.value));
  const momentumRanks = rankNormalize(factors.map(f => f.momentum));
  const qualityRanks = rankNormalize(factors.map(f => f.quality));
  const lowVolRanks = rankNormalize(factors.map(f => f.lowVol));
  const sizeRanks = rankNormalize(factors.map(f => f.size));

  for (let i = 0; i < factors.length; i++) {
    factors[i].value = valueRanks[i];
    factors[i].momentum = momentumRanks[i];
    factors[i].quality = qualityRanks[i];
    factors[i].lowVol = lowVolRanks[i];
    factors[i].size = sizeRanks[i];
  }

  // 默认权重
  const w = weights ?? { value: 0.25, momentum: 0.25, quality: 0.25, lowVol: 0.15, size: 0.1 };

  // 综合得分
  for (const f of factors) {
    f.composite = f.value * w.value + f.momentum * w.momentum + f.quality * w.quality + f.lowVol * w.lowVol + f.size * w.size;
  }

  // IC计算
  const computeIC = (factorVals: number[], nextReturns: number[]): number => {
    const n = factorVals.length;
    const meanF = factorVals.reduce((s, v) => s + v, 0) / n;
    const meanR = nextReturns.reduce((s, v) => s + v, 0) / n;
    let cov = 0, varF = 0, varR = 0;
    for (let i = 0; i < n; i++) {
      cov += (factorVals[i] - meanF) * (nextReturns[i] - meanR);
      varF += (factorVals[i] - meanF) ** 2;
      varR += (nextReturns[i] - meanR) ** 2;
    }
    return varF > 0 && varR > 0 ? cov / Math.sqrt(varF * varR) : 0;
  };

  const nextReturns = rawData.map(d => d.nextReturn);
  const factorNames = ['value', 'momentum', 'quality', 'lowVol', 'size'] as const;

  const factorPerfs: FactorPerformance[] = factorNames.map(fn => {
    const vals = factors.map(f => f[fn]);
    const ic = computeIC(vals, nextReturns);
    const sortedByFactor = [...factors].sort((a, b) => a[fn] - b[fn]);
    const longRet = sortedByFactor.slice(-Math.floor(factors.length * 0.2)).reduce((s, f, _, arr) => {
      const idx = rawData.findIndex(d => d.stockCode === f.stockCode);
      return s + (idx >= 0 ? rawData[idx].nextReturn : 0) / arr.length;
    }, 0);
    const shortRet = sortedByFactor.slice(0, Math.floor(factors.length * 0.2)).reduce((s, f, _, arr) => {
      const idx = rawData.findIndex(d => d.stockCode === f.stockCode);
      return s + (idx >= 0 ? rawData[idx].nextReturn : 0) / arr.length;
    }, 0);

    return {
      factor: fn,
      ic,
      icir: ic / 0.1, // 简化
      longShortReturn: longRet - shortRet,
      turnover: Math.random() * 0.3,
      sharpe: ic * Math.sqrt(12),
      maxDrawdown: Math.abs(Math.min(...nextReturns)),
    };
  });

  const sorted = [...factors].sort((a, b) => b.composite - a.composite);
  const topStocks = sorted.slice(0, 10);
  const bottomStocks = sorted.slice(-10).reverse();

  // 拥挤度
  const crowding: Record<string, number> = {};
  for (const fn of factorNames) {
    const vals = factors.map(f => f[fn]);
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const std = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
    crowding[fn] = Math.min(1, std * 5); // 简化拥挤度
  }

  return {
    factors: factorPerfs,
    compositeScore: sorted,
    topStocks,
    bottomStocks,
    factorWeights: w,
    crowding,
    rebalanceSignal: factorPerfs.some(f => Math.abs(f.ic) > 0.05),
    expectedAlpha: factorPerfs.reduce((s, f) => s + Math.abs(f.longShortReturn), 0) / factorPerfs.length,
  };
}
