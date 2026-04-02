/**
 * 跨资产相关性分析引擎
 * - 滚动相关性矩阵
 * - 动态条件相关性 (DCC)
 * - 相关性结构突变检测
 * - 跨市场传导效应分析
 * - 分位数相关性
 */

export interface CorrelationPair {
  asset1: string;
  asset2: string;
  correlation: number;
  pValue: number;
  period: number;
}

export interface CorrelationMatrix {
  assets: string[];
  matrix: number[][];
  timestamp: number;
  window: number;
}

export interface DCCResult {
  unconditionalCorr: number[];
  dynamicCorrs: number[][];
  alpha: number;
  beta: number;
  logLikelihood: number;
}

export interface StructuralBreak {
  timestamp: number;
  beforeCorr: number;
  afterCorr: number;
  changePoint: number;
  confidence: number;
}

export interface ContagionEffect {
  source: string;
  target: string;
  lagDays: number;
  coefficient: number;
  rSquared: number;
  isSignificant: boolean;
}

export interface QuantileCorrelation {
  asset1: string;
  asset2: string;
  lowerTail: number;    // 5th percentile correlation
  upperTail: number;    // 95th percentile correlation
  median: number;
  normalCorr: number;
}

export class CrossAssetCorrelationEngine {
  /**
   * 计算皮尔逊相关系数
   */
  pearsonCorrelation(x: number[], y: number[]): { corr: number; pValue: number } {
    const n = Math.min(x.length, y.length);
    if (n < 3) return { corr: 0, pValue: 1 };

    const meanX = x.slice(0, n).reduce((s, v) => s + v, 0) / n;
    const meanY = y.slice(0, n).reduce((s, v) => s + v, 0) / n;

    let num = 0, denX = 0, denY = 0;
    for (let i = 0; i < n; i++) {
      const dx = x[i] - meanX;
      const dy = y[i] - meanY;
      num += dx * dy;
      denX += dx * dx;
      denY += dy * dy;
    }

    const den = Math.sqrt(denX * denY);
    if (den === 0) return { corr: 0, pValue: 1 };

    const corr = num / den;
    // t-statistic for p-value approximation
    const t = corr * Math.sqrt((n - 2) / (1 - corr * corr));
    const pValue = this.tDistributionPValue(Math.abs(t), n - 2);

    return { corr: Math.max(-1, Math.min(1, corr)), pValue };
  }

  /**
   * 滚动相关性
   */
  rollingCorrelation(
    series1: number[],
    series2: number[],
    window: number
  ): Array<{ timestamp: number; corr: number }> {
    const n = Math.min(series1.length, series2.length);
    if (n < window) return [];

    const results: Array<{ timestamp: number; corr: number }> = [];
    for (let i = window; i <= n; i++) {
      const x = series1.slice(i - window, i);
      const y = series2.slice(i - window, i);
      const { corr } = this.pearsonCorrelation(x, y);
      results.push({ timestamp: i, corr });
    }
    return results;
  }

  /**
   * 构建相关性矩阵
   */
  correlationMatrix(
    assets: string[],
    returns: Map<string, number[]>,
    window: number
  ): CorrelationMatrix {
    const matrix: number[][] = [];
    for (let i = 0; i < assets.length; i++) {
      matrix[i] = [];
      for (let j = 0; j < assets.length; j++) {
        if (i === j) {
          matrix[i][j] = 1;
        } else if (j < i) {
          matrix[i][j] = matrix[j][i];
        } else {
          const s1 = returns.get(assets[i]) || [];
          const s2 = returns.get(assets[j]) || [];
          const { corr } = this.pearsonCorrelation(
            s1.slice(-window),
            s2.slice(-window)
          );
          matrix[i][j] = corr;
        }
      }
    }
    return { assets, matrix, timestamp: Date.now(), window };
  }

  /**
   * DCC (Dynamic Conditional Correlation) 简化实现
   */
  fitDCC(returns1: number[], returns2: number[], alpha = 0.05, beta = 0.93): DCCResult | null {
    const n = Math.min(returns1.length, returns2.length);
    if (n < 30) return null;

    // Unconditional correlation
    const { corr: uncondCorr } = this.pearsonCorrelation(returns1.slice(0, n), returns2.slice(0, n));

    // Standardize returns
    const mean1 = returns1.slice(0, n).reduce((s, v) => s + v, 0) / n;
    const mean2 = returns2.slice(0, n).reduce((s, v) => s + v, 0) / n;
    const std1 = Math.sqrt(returns1.slice(0, n).reduce((s, v) => s + (v - mean1) ** 2, 0) / n);
    const std2 = Math.sqrt(returns2.slice(0, n).reduce((s, v) => s + (v - mean2) ** 2, 0) / n);

    if (std1 === 0 || std2 === 0) return null;

    // Dynamic correlations
    const dynamicCorrs: number[][] = [];
    let q11 = 1, q22 = 1, q12 = uncondCorr;

    for (let t = 0; t < n; t++) {
      const z1 = (returns1[t] - mean1) / std1;
      const z2 = (returns2[t] - mean2) / std2;

      if (t > 0) {
        q11 = (1 - alpha - beta) + alpha * z1 * z1 + beta * q11;
        q22 = (1 - alpha - beta) + alpha * z2 * z2 + beta * q22;
        q12 = (1 - alpha - beta) * uncondCorr + alpha * z1 * z2 + beta * q12;
      }

      const rho = q12 / Math.sqrt(q11 * q22);
      dynamicCorrs.push([Math.max(-1, Math.min(1, rho))]);
    }

    // Log-likelihood
    let logLikelihood = 0;
    for (let t = 0; t < n; t++) {
      const z1 = (returns1[t] - mean1) / std1;
      const z2 = (returns2[t] - mean2) / std2;
      const rho = dynamicCorrs[t][0];
      const det = 1 - rho * rho;
      if (det > 0) {
        logLikelihood -= 0.5 * Math.log(det) + 0.5 * (z1 * z1 - 2 * rho * z1 * z2 + z2 * z2) / det;
      }
    }

    return {
      unconditionalCorr: [uncondCorr],
      dynamicCorrs,
      alpha,
      beta,
      logLikelihood
    };
  }

  /**
   * 结构突变检测 (CUSUM-based)
   */
  detectStructuralBreaks(
    series1: number[],
    series2: number[],
    window: number = 30
  ): StructuralBreak[] {
    const n = Math.min(series1.length, series2.length);
    if (n < window * 2) return [];

    const breaks: StructuralBreak[] = [];
    const rolling = this.rollingCorrelation(series1, series2, window);

    for (let i = window; i < rolling.length - window; i++) {
      const before = rolling.slice(i - window, i).map(r => r.corr);
      const after = rolling.slice(i, i + window).map(r => r.corr);

      const meanBefore = before.reduce((s, v) => s + v, 0) / before.length;
      const meanAfter = after.reduce((s, v) => s + v, 0) / after.length;
      const change = Math.abs(meanAfter - meanBefore);

      // Simple significance: change > 2 * pooled std
      const stdBefore = Math.sqrt(before.reduce((s, v) => s + (v - meanBefore) ** 2, 0) / before.length);
      const stdAfter = Math.sqrt(after.reduce((s, v) => s + (v - meanAfter) ** 2, 0) / after.length);
      const pooledStd = Math.sqrt((stdBefore ** 2 + stdAfter ** 2) / 2);

      const confidence = pooledStd > 0 ? change / pooledStd : 0;

      if (confidence > 2) {
        breaks.push({
          timestamp: rolling[i].timestamp,
          beforeCorr: meanBefore,
          afterCorr: meanAfter,
          changePoint: i,
          confidence
        });
      }
    }

    return breaks;
  }

  /**
   * 跨市场传导效应 (Granger-like)
   */
  contagionAnalysis(
    sourceReturns: number[],
    targetReturns: number[],
    maxLag: number = 5
  ): ContagionEffect[] {
    const n = Math.min(sourceReturns.length, targetReturns.length);
    if (n < maxLag * 3) return [];

    const effects: ContagionEffect[] = [];

    for (let lag = 1; lag <= maxLag; lag++) {
      // Simple lagged regression: target[t] = a + b * source[t-lag]
      const x: number[] = [];
      const y: number[] = [];
      for (let t = lag; t < n; t++) {
        x.push(sourceReturns[t - lag]);
        y.push(targetReturns[t]);
      }

      const { slope, rSquared } = this.linearRegression(x, y);
      const tStat = Math.abs(slope) * Math.sqrt(x.length) /
        Math.sqrt((1 - rSquared) * y.reduce((s, v, i) => s + (v - slope * x[i]) ** 2, 0) / (y.length - 1) || 1);

      effects.push({
        source: 'source',
        target: 'target',
        lagDays: lag,
        coefficient: slope,
        rSquared,
        isSignificant: tStat > 1.96
      });
    }

    return effects;
  }

  /**
   * 分位数相关性 (tail dependence)
   */
  quantileCorrelation(
    returns1: number[],
    returns2: number[],
    quantiles: number[] = [0.05, 0.5, 0.95]
  ): QuantileCorrelation | null {
    const n = Math.min(returns1.length, returns2.length);
    if (n < 20) return null;

    const { corr: normalCorr } = this.pearsonCorrelation(returns1.slice(0, n), returns2.slice(0, n));

    // For each quantile threshold, compute conditional correlation
    const sorted1 = [...returns1.slice(0, n)].sort((a, b) => a - b);
    const q05 = sorted1[Math.floor(n * 0.05)];
    const q95 = sorted1[Math.floor(n * 0.95)];

    // Lower tail: only consider when both are in lower tail
    const lowerPairs = returns1.slice(0, n)
      .map((v, i) => ({ v1: v, v2: returns2[i] }))
      .filter(p => p.v1 <= q05);

    const upperPairs = returns1.slice(0, n)
      .map((v, i) => ({ v1: v, v2: returns2[i] }))
      .filter(p => p.v1 >= q95);

    const lowerCorr = lowerPairs.length >= 3
      ? this.pearsonCorrelation(lowerPairs.map(p => p.v1), lowerPairs.map(p => p.v2)).corr
      : normalCorr;

    const upperCorr = upperPairs.length >= 3
      ? this.pearsonCorrelation(upperPairs.map(p => p.v1), upperPairs.map(p => p.v2)).corr
      : normalCorr;

    return {
      asset1: 'asset1',
      asset2: 'asset2',
      lowerTail: lowerCorr,
      upperTail: upperCorr,
      median: normalCorr,
      normalCorr
    };
  }

  /**
   * 特征值分解 (PCA-like) 用于相关性矩阵
   */
  eigenAnalysis(matrix: number[][]): {
    eigenvalues: number[];
    explainedVariance: number[];
    cumulativeVariance: number[];
  } {
    const n = matrix.length;
    if (n === 0) return { eigenvalues: [], explainedVariance: [], cumulativeVariance: [] };

    // Power iteration for dominant eigenvalues
    const eigenvalues: number[] = [];
    const workingMatrix = matrix.map(row => [...row]);

    for (let k = 0; k < n; k++) {
      let v = Array(n).fill(0).map(() => Math.random());
      let norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
      v = v.map(x => x / norm);

      for (let iter = 0; iter < 100; iter++) {
        const Av = Array(n).fill(0);
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < n; j++) {
            Av[i] += workingMatrix[i][j] * v[j];
          }
        }
        norm = Math.sqrt(Av.reduce((s, x) => s + x * x, 0));
        if (norm === 0) break;
        v = Av.map(x => x / norm);
      }

      // Rayleigh quotient
      let eigenvalue = 0;
      for (let i = 0; i < n; i++) {
        let Avi = 0;
        for (let j = 0; j < n; j++) Avi += workingMatrix[i][j] * v[j];
        eigenvalue += v[i] * Avi;
      }
      eigenvalues.push(eigenvalue);

      // Deflate
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          workingMatrix[i][j] -= eigenvalue * v[i] * v[j];
        }
      }
    }

    const total = eigenvalues.reduce((s, e) => s + Math.abs(e), 0) || 1;
    const explainedVariance = eigenvalues.map(e => Math.abs(e) / total);
    const cumulativeVariance: number[] = [];
    explainedVariance.reduce((cum, v) => {
      cumulativeVariance.push(cum + v);
      return cum + v;
    }, 0);

    return { eigenvalues, explainedVariance, cumulativeVariance };
  }

  /**
   * 相关性稳定性评分
   */
  stabilityScore(rollingCorrs: number[]): number {
    if (rollingCorrs.length < 2) return 0;

    const mean = rollingCorrs.reduce((s, v) => s + v, 0) / rollingCorrs.length;
    const variance = rollingCorrs.reduce((s, v) => s + (v - mean) ** 2, 0) / rollingCorrs.length;
    const std = Math.sqrt(variance);

    // Coefficient of variation inverted
    const cv = mean !== 0 ? std / Math.abs(mean) : 1;
    return Math.max(0, Math.min(1, 1 - cv));
  }

  // Helper methods
  private linearRegression(x: number[], y: number[]): { slope: number; intercept: number; rSquared: number } {
    const n = x.length;
    if (n < 2) return { slope: 0, intercept: 0, rSquared: 0 };

    const mx = x.reduce((s, v) => s + v, 0) / n;
    const my = y.reduce((s, v) => s + v, 0) / n;

    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      num += (x[i] - mx) * (y[i] - my);
      den += (x[i] - mx) ** 2;
    }

    const slope = den !== 0 ? num / den : 0;
    const intercept = my - slope * mx;

    const predicted = x.map(v => slope * v + intercept);
    const ssRes = y.reduce((s, v, i) => s + (v - predicted[i]) ** 2, 0);
    const ssTot = y.reduce((s, v) => s + (v - my) ** 2, 0);
    const rSquared = ssTot !== 0 ? 1 - ssRes / ssTot : 0;

    return { slope, intercept, rSquared: Math.max(0, Math.min(1, rSquared)) };
  }

  private tDistributionPValue(t: number, df: number): number {
    // Approximation using normal distribution for large df
    if (df > 30) {
      return 2 * (1 - this.normalCDF(Math.abs(t)));
    }
    // Simple approximation for small df
    const x = df / (df + t * t);
    return this.betaIncomplete(df / 2, 0.5, x);
  }

  private normalCDF(x: number): number {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
    const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    const ax = Math.abs(x) / Math.sqrt(2);
    const t = 1 / (1 + p * ax);
    const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
    return 0.5 * (1 + sign * y);
  }

  private betaIncomplete(a: number, b: number, x: number): number {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    // Simple approximation
    const bt = Math.exp(
      this.logGamma(a + b) - this.logGamma(a) - this.logGamma(b) +
      a * Math.log(x) + b * Math.log(1 - x)
    );
    if (x < (a + 1) / (a + b + 2)) {
      return bt * this.betaContinued(a, b, x) / a;
    } else {
      return 1 - bt * this.betaContinued(b, a, 1 - x) / b;
    }
  }

  private betaContinued(a: number, b: number, x: number): number {
    let qab = a + b, qap = a + 1, qam = a - 1;
    let c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= 100; m++) {
      const m2 = 2 * m;
      let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30; c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30; c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30;
      d = 1 / d; const del = d * c; h *= del;
      if (Math.abs(del - 1) < 1e-7) break;
    }
    return h;
  }

  private logGamma(x: number): number {
    const cof = [76.18009172947146, -86.50532032941677, 24.01409824083091,
      -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let y = x, tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (let j = 0; j < 6; j++) ser += cof[j] / ++y;
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }
}
