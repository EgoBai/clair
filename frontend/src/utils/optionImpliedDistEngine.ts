/**
 * 期权隐含概率分布引擎
 * 从期权链价格反推标的资产隐含概率分布
 */

export interface OptionChainInput {
  strike: number;
  callPrice: number;
  putPrice: number;
  expiry: number; // days
}

export interface ImpliedDistribution {
  strikes: number[];
  probabilities: number[];
  cdf: number[];
  mean: number;
  median: number;
  mode: number;
  skewness: number;
  kurtosis: number;
  var95: number;
  var99: number;
  confidenceInterval: [number, number];
}

/**
 * Breeden-Litzenberger公式从期权价格推导隐含概率密度
 */
export function impliedProbabilityDensity(
  options: OptionChainInput[],
  riskFreeRate: number = 0.03
): ImpliedDistribution {
  const sorted = [...options].sort((a, b) => a.strike - b.strike);
  const n = sorted.length;
  if (n < 3) {
    return {
      strikes: [], probabilities: [], cdf: [],
      mean: 0, median: 0, mode: 0, skewness: 0, kurtosis: 0,
      var95: 0, var99: 0, confidenceInterval: [0, 0],
    };
  }

  const T = sorted[0].expiry / 365;
  const df = Math.exp(-riskFreeRate * T);

  // 二阶差分求概率密度: f(K) ≈ e^(rT) * ∂²C/∂K²
  const densities: number[] = [];
  const strikes: number[] = [];

  for (let i = 1; i < n - 1; i++) {
    const h1 = sorted[i].strike - sorted[i - 1].strike;
    const h2 = sorted[i + 1].strike - sorted[i].strike;
    const d2c = (sorted[i + 1].callPrice - sorted[i].callPrice) / h2
              - (sorted[i].callPrice - sorted[i - 1].callPrice) / h1;
    const density = (1 / df) * (2 * d2c / (h1 + h2));
    densities.push(Math.max(0, density));
    strikes.push(sorted[i].strike);
  }

  // 归一化
  let totalDensity = 0;
  for (let i = 0; i < strikes.length - 1; i++) {
    const avgDensity = (densities[i] + densities[i + 1]) / 2;
    totalDensity += avgDensity * (strikes[i + 1] - strikes[i]);
  }
  const normFactor = totalDensity > 0 ? 1 / totalDensity : 1;
  const probabilities = densities.map(d => d * normFactor);

  // CDF
  const cdf: number[] = [0];
  for (let i = 0; i < strikes.length - 1; i++) {
    const avgDensity = (probabilities[i] + probabilities[i + 1]) / 2;
    cdf.push(cdf[i] + avgDensity * (strikes[i + 1] - strikes[i]));
  }

  // 统计量
  let mean = 0, secondMoment = 0, thirdMoment = 0, fourthMoment = 0;
  for (let i = 0; i < strikes.length - 1; i++) {
    const mid = (strikes[i] + strikes[i + 1]) / 2;
    const prob = (probabilities[i] + probabilities[i + 1]) / 2 * (strikes[i + 1] - strikes[i]);
    mean += mid * prob;
    secondMoment += mid * mid * prob;
    thirdMoment += mid * mid * mid * prob;
    fourthMoment += mid * mid * mid * mid * prob;
  }

  const variance = secondMoment - mean * mean;
  const std = Math.sqrt(Math.max(0, variance));
  const skewness = std > 0 ? (thirdMoment - 3 * mean * variance - mean * mean * mean) / (std * std * std) : 0;
  const kurtosis = std > 0 ? (fourthMoment - 4 * mean * thirdMoment + 6 * mean * mean * secondMoment - 3 * mean * mean * mean * mean) / (variance * variance) - 3 : 0;

  // Median
  const medianIdx = cdf.findIndex(c => c >= 0.5);
  const median = medianIdx > 0 ? strikes[medianIdx] : strikes[Math.floor(strikes.length / 2)];

  // Mode
  const modeIdx = probabilities.indexOf(Math.max(...probabilities));
  const mode = strikes[modeIdx];

  // VaR
  const var95Idx = cdf.findIndex(c => c >= 0.05);
  const var99Idx = cdf.findIndex(c => c >= 0.01);
  const var95 = var95Idx > 0 ? strikes[var95Idx] : strikes[0];
  const var99 = var99Idx > 0 ? strikes[var99Idx] : strikes[0];

  // Confidence interval (68%)
  const loIdx = cdf.findIndex(c => c >= 0.16);
  const hiIdx = cdf.findIndex(c => c >= 0.84);
  const ciLow = loIdx > 0 ? strikes[loIdx] : strikes[0];
  const ciHigh = hiIdx > 0 ? strikes[hiIdx] : strikes[strikes.length - 1];

  return {
    strikes, probabilities, cdf,
    mean: Math.round(mean * 100) / 100,
    median, mode,
    skewness: Math.round(skewness * 1000) / 1000,
    kurtosis: Math.round(kurtosis * 1000) / 1000,
    var95, var99,
    confidenceInterval: [ciLow, ciHigh],
  };
}

/**
 * 隐含分布形态判断
 */
export function distributionShape(dist: ImpliedDistribution): {
  type: 'normal' | 'left_skew' | 'right_skew' | 'fat_tail' | 'bimodal';
  description: string;
} {
  const { skewness, kurtosis } = dist;

  if (Math.abs(skewness) < 0.3 && Math.abs(kurtosis) < 1) {
    return { type: 'normal', description: '接近正态分布，市场预期平稳' };
  }
  if (skewness < -0.5) {
    return { type: 'left_skew', description: '左偏分布，市场担忧下跌风险' };
  }
  if (skewness > 0.5) {
    return { type: 'right_skew', description: '右偏分布，市场偏向看涨' };
  }
  if (kurtosis > 2) {
    return { type: 'fat_tail', description: '厚尾分布，市场预期极端波动' };
  }
  return { type: 'normal', description: '基本对称分布' };
}

/**
 * 隐含波动率微笑/偏度分析
 */
export function volatilitySmile(options: OptionChainInput[], spot: number): {
  strike: number;
  moneyness: number;
  smile: number;
  skew: number;
}[] {
  return options.map(o => {
    const moneyness = o.strike / spot;
    const avgPrice = (o.callPrice + o.putPrice) / 2;
    const smile = avgPrice / spot;
    const skew = o.callPrice - o.putPrice;
    return { strike: o.strike, moneyness: Math.round(moneyness * 1000) / 1000, smile: Math.round(smile * 10000) / 10000, skew: Math.round(skew * 100) / 100 };
  });
}
