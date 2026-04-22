/**
 * TailRiskEngine - Bloomberg-grade 尾部风险引擎
 * VaR/CVaR (Historical, Parametric, Cornish-Fisher), 偏度/峰度, 极值理论
 * 对标: Bloomberg PORT<GO> Risk Analytics, Barra Risk Model
 */

// ============== 基础统计工具 ==============

function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function std(arr: number[], ddof: number = 1): number {
  const m = mean(arr);
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - ddof);
  return Math.sqrt(variance);
}

// 正态分布分位数 (Abramowitz & Stegun 近似)
function normalQuantile(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;
  if (p < 0.5) return -normalQuantile(1 - p);

  const a = [
    -3.969683028665376e1, 2.209460984245205e2,
    -2.759285104469687e2, 1.383577518672690e2,
    -3.066479806614716e1, 2.506628277459239e0,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2,
    -1.556989798598866e2, 6.680131188771972e1,
    -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1,
    -2.400758277161838e0, -2.549732539343734e0,
    4.374664141464968e0, 2.938163982698783e0,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1,
    2.445134137142996e0, 3.754408661907416e0,
  ];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let q: number, r: number;

  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]*q + c[1])*q + c[2])*q + c[3])*q + c[4])*q + c[5]) /
           ((((d[0]*q + d[1])*q + d[2])*q + d[3])*q + 1);
  } else if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (((((a[0]*r + a[1])*r + a[2])*r + a[3])*r + a[4])*r + a[5])*q /
           (((((b[0]*r + b[1])*r + b[2])*r + b[3])*r + b[4])*r + 1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0]*q + c[1])*q + c[2])*q + c[3])*q + c[4])*q + c[5]) /
            ((((d[0]*q + d[1])*q + d[2])*q + d[3])*q + 1);
  }
}

// 标准正态PDF
function normalPDF(x: number): number {
  return Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
}

// ============== VaR 方法 ==============

/**
 * 参数法VaR (假设正态分布)
 * Bloomberg对标: RISK<GO> Parametric VaR
 */
export function parametricVaR(returns: number[], confidence: number = 0.99): number {
  if (returns.length < 2) return 0;
  const mu = mean(returns);
  const sigma = std(returns);
  const z = normalQuantile(1 - confidence);
  return Math.abs(mu + z * sigma);
}

/**
 * 历史模拟法VaR
 * Bloomberg对标: Historical VaR
 */
export function historicalVaR(returns: number[], confidence: number = 0.99): number {
  if (returns.length === 0) return 0;
  const sorted = [...returns].sort((a, b) => a - b);
  const idx = (1 - confidence) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const w = idx - lo;
  // 线性插值
  const varValue = sorted[lo] * (1 - w) + sorted[hi] * w;
  return Math.abs(varValue);
}

/**
 * Cornish-Fisher VaR (调整偏度和峰度)
 * 对标: Bloomberg Cornish-Fisher Expansion
 * 公式: z_cf = z + (z²-1)*S/6 + (z³-3z)*K/24 - (2z³-5z)*S²/36
 */
export function cornishFisherVaR(returns: number[], confidence: number = 0.99): number {
  if (returns.length < 4) return 0;
  const mu = mean(returns);
  const sigma = std(returns);
  if (sigma === 0) return Math.abs(mu);

  const z = normalQuantile(1 - confidence);
  // 使用偏差修正的偏度和峰度 (样本估计量)
  const n = returns.length;
  const skewness = calcSkewness(returns);
  const kurtosis = calcKurtosis(returns); // 超额峰度

  const z_cf = z
    + (z ** 2 - 1) * skewness / 6
    + (z ** 3 - 3 * z) * kurtosis / 24
    - (2 * z ** 3 - 5 * z) * skewness ** 2 / 36;

  return Math.abs(mu + z_cf * sigma);
}

/**
 * CVaR / Expected Shortfall (条件风险价值)
 * 使用参数法 (正态假设) — 与Barra一致
 * 公式: ES = μ - σ × φ(z_α) / α
 */
export function calcCVaR(returns: number[], confidence: number = 0.95): number {
  if (returns.length < 2) return 0;
  const mu = mean(returns);
  const sigma = std(returns);
  if (sigma === 0) return Math.abs(mu);

  const alpha = 1 - confidence;
  const z = normalQuantile(alpha);
  const phiZ = normalPDF(z);
  const es = mu - sigma * phiZ / alpha;
  return Math.abs(es);
}

/**
 * 历史模拟法CVaR
 * 对标: Bloomberg Historical Expected Shortfall
 */
export function historicalCVaR(returns: number[], confidence: number = 0.95): number {
  if (returns.length === 0) return 0;
  const sorted = [...returns].sort((a, b) => a - b);
  const cutoff = Math.max(Math.ceil((1 - confidence) * sorted.length), 1);
  const tail = sorted.slice(0, cutoff);
  return -tail.reduce((a, b) => a + b, 0) / tail.length;
}

// ============== 分布特征 ==============

/**
 * 偏度 (样本偏差修正: adjusted Fisher-Pearson)
 */
export function calcSkewness(returns: number[]): number {
  const n = returns.length;
  if (n < 3) return 0;
  const m = mean(returns);
  const s = std(returns);
  if (s === 0) return 0;
  const m3 = returns.reduce((acc, r) => acc + ((r - m) / s) ** 3, 0) / n;
  // 小样本偏差修正
  return (n * n / ((n - 1) * (n - 2))) * m3;
}

/**
 * 超额峰度 (excess kurtosis, 样本偏差修正)
 */
export function calcKurtosis(returns: number[]): number {
  const n = returns.length;
  if (n < 4) return 0;
  const m = mean(returns);
  const s = std(returns);
  if (s === 0) return 0;
  const m4 = returns.reduce((acc, r) => acc + ((r - m) / s) ** 4, 0) / n;
  // 偏差修正的超额峰度
  return ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * n * m4
    - (3 * (n - 1) ** 2) / ((n - 2) * (n - 3));
}

// ============== 回撤分析 ==============

/**
 * 最大回撤及相关统计
 * 对标: Bloomberg MAXDD, MDD Duration
 */
export function maxDrawdown(prices: number[]): {
  maxDD: number; peak: number; trough: number; duration: number; recoveryTime: number;
} {
  if (prices.length === 0) return { maxDD: 0, peak: 0, trough: 0, duration: 0, recoveryTime: 0 };

  let peak = prices[0], maxDD = 0;
  let peakIdx = 0, troughIdx = 0;
  let curPeak = prices[0], curPeakIdx = 0;
  let curDuration = 0, maxDuration = 0;
  let recoveryTime = 0;

  for (let i = 1; i < prices.length; i++) {
    if (prices[i] > curPeak) {
      curPeak = prices[i];
      curPeakIdx = i;
      curDuration = 0;
    } else {
      curDuration++;
      const dd = (curPeak - prices[i]) / curPeak;
      if (dd > maxDD) {
        maxDD = dd;
        peak = curPeak;
        peakIdx = curPeakIdx;
        troughIdx = i;
        maxDuration = curDuration;
      }
    }
  }

  // 回复时间: 从谷底回到峰值的天数
  recoveryTime = Math.max(0, peakIdx > troughIdx ? peakIdx - troughIdx : 0);

  return { maxDD, peak: peakIdx, trough: troughIdx, duration: maxDuration, recoveryTime };
}

// ============== 综合风险评分 ==============

/**
 * 尾部风险综合评分 (0-100)
 * 对标: Bloomberg Risk Score
 */
export function tailRiskScore(returns: number[]): number {
  if (returns.length < 10) return 0;
  const skew = calcSkewness(returns);
  const kurt = calcKurtosis(returns);
  const cvar95 = calcCVaR(returns, 0.95);
  const cvar99 = calcCVaR(returns, 0.99);
  const cfVar = cornishFisherVaR(returns, 0.99);

  // 权重化评分
  const skewPenalty = Math.max(0, -skew) * 10; // 负偏度惩罚
  const kurtPenalty = Math.max(0, kurt) * 5;    // 超额峰度惩罚
  const cvarPenalty = cvar95 * 40 + cvar99 * 20;
  const cfPenalty = cfVar * 15;

  const rawScore = skewPenalty + kurtPenalty + cvarPenalty + cfPenalty;
  return Math.min(100, Math.max(0, rawScore));
}

/**
 * 风险归因分解
 * 对标: Bloomberg Risk Attribution / Barra Risk Decomposition
 */
export function riskAttribution(returns: number[][], labels: string[]): {
  factor: string; variance: number; contribution: number; pctContribution: number;
}[] {
  const n = returns.length;
  if (n === 0 || returns[0].length === 0) return [];

  const T = returns[0].length;
  const means = returns.map(r => mean(r));

  // 协方差矩阵
  const cov: number[][] = [];
  for (let i = 0; i < n; i++) {
    cov[i] = [];
    for (let j = 0; j < n; j++) {
      let s = 0;
      for (let t = 0; t < T; t++) {
        s += (returns[i][t] - means[i]) * (returns[j][t] - means[j]);
      }
      cov[i][j] = s / (T - 1);
    }
  }

  // 等权组合
  const w = new Array(n).fill(1 / n);
  let totalVariance = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      totalVariance += w[i] * w[j] * cov[i][j];
    }
  }

  // 边际风险贡献
  const results = labels.map((label, i) => {
    const mcr = cov[i].reduce((s, c, j) => s + w[j] * c, 0);
    const contribution = w[i] * mcr;
    return {
      factor: label,
      variance: cov[i][i],
      contribution,
      pctContribution: totalVariance > 0 ? (contribution / totalVariance) * 100 : 0,
    };
  });

  return results;
}

/**
 * 综合风险报告
 * 对标: Bloomberg RISK<GO> Summary
 */
export function riskReport(returns: number[], prices?: number[]): {
  var95: number; var99: number;
  cvar95: number; cvar99: number;
  cornishFisherVaR99: number;
  historicalVaR95: number;
  skewness: number; excessKurtosis: number;
  riskScore: number;
  maxDrawdown?: { maxDD: number; duration: number };
} {
  const report: any = {
    var95: parametricVaR(returns, 0.95),
    var99: parametricVaR(returns, 0.99),
    cvar95: calcCVaR(returns, 0.95),
    cvar99: calcCVaR(returns, 0.99),
    cornishFisherVaR99: cornishFisherVaR(returns, 0.99),
    historicalVaR95: historicalVaR(returns, 0.95),
    skewness: calcSkewness(returns),
    excessKurtosis: calcKurtosis(returns),
    riskScore: tailRiskScore(returns),
  };

  if (prices && prices.length > 1) {
    const dd = maxDrawdown(prices);
    report.maxDrawdown = { maxDD: dd.maxDD, duration: dd.duration };
  }

  return report;
}
