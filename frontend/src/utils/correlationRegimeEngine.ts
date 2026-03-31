/**
 * 相关性体制检测引擎
 * 动态检测资产间相关性的变化和体制转换
 */

// ==================== 类型定义 ====================
export interface CorrelationMatrix {
  assets: string[];
  matrix: number[][];
  timestamp: number;
}

export interface CorrelationRegime {
  regime: 'low' | 'normal' | 'high' | 'crisis';
  avgCorrelation: number;
  maxCorrelation: number;
  minCorrelation: number;
  dispersion: number; // 相关性离散度
  eigenvalueRatio: number; // 主成分集中度
  riskOnOff: 'risk_on' | 'risk_off' | 'neutral';
}

export interface CorrelationBreakpoint {
  timestamp: number;
  beforeAvg: number;
  afterAvg: number;
  changePercent: number;
  significance: number; // 0-1
  affectedPairs: [string, string][];
}

export interface DynamicCorrelation {
  asset1: string;
  asset2: string;
  rollingCorr: number[];
  ewmaCorr: number[];
  dccCorr: number[]; // DCC-GARCH简化
  timestamps: number[];
  trend: 'increasing' | 'decreasing' | 'stable';
  currentRegime: string;
}

export interface TailDependency {
  asset1: string;
  asset2: string;
  lowerTailDep: number; // 下尾依赖
  upperTailDep: number; // 上尾依赖
  asymmetry: number;
  crisisAmplification: number;
}

export interface CorrelationStability {
  overallStability: number; // 0-100
  mostStablePairs: [string, string, number][];
  leastStablePairs: [string, string, number][];
  structuralBreaks: number;
  regimePersistence: number; // 体制持续性
}

// ==================== 核心引擎 ====================
export class CorrelationRegimeEngine {
  /**
   * 计算相关性矩阵
   */
  calculateCorrelation(returns: Map<string, number[]>): CorrelationMatrix {
    const assets = Array.from(returns.keys());
    const n = assets.length;
    const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

    for (let i = 0; i < n; i++) {
      matrix[i][i] = 1;
      for (let j = i + 1; j < n; j++) {
        const r1 = returns.get(assets[i])!;
        const r2 = returns.get(assets[j])!;
        const corr = this.pearsonCorrelation(r1, r2);
        matrix[i][j] = corr;
        matrix[j][i] = corr;
      }
    }

    return { assets, matrix, timestamp: Date.now() };
  }

  /**
   * 检测相关性体制
   */
  detectRegime(corrMatrix: CorrelationMatrix): CorrelationRegime {
    const { matrix } = corrMatrix;
    const n = matrix.length;

    if (n < 2) {
      return {
        regime: 'normal', avgCorrelation: 0, maxCorrelation: 0,
        minCorrelation: 0, dispersion: 0, eigenvalueRatio: 0, riskOnOff: 'neutral'
      };
    }

    // 提取非对角线元素
    const correlations: number[] = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        correlations.push(matrix[i][j]);
      }
    }

    const avgCorrelation = correlations.reduce((s, v) => s + v, 0) / correlations.length;
    const maxCorrelation = Math.max(...correlations);
    const minCorrelation = Math.min(...correlations);

    // 离散度
    const variance = correlations.reduce((s, v) => s + (v - avgCorrelation) ** 2, 0) / correlations.length;
    const dispersion = Math.sqrt(variance);

    // 特征值集中度 (简化: 最大特征值占比)
    const eigenvalues = this.estimateEigenvalues(matrix);
    const maxEigenvalue = Math.max(...eigenvalues);
    const totalEigenvalue = eigenvalues.reduce((s, v) => s + Math.abs(v), 0);
    const eigenvalueRatio = totalEigenvalue > 0 ? maxEigenvalue / totalEigenvalue : 0;

    // 体制判断
    let regime: CorrelationRegime['regime'];
    if (avgCorrelation > 0.7) regime = 'crisis';
    else if (avgCorrelation > 0.4) regime = 'high';
    else if (avgCorrelation > 0.1) regime = 'normal';
    else regime = 'low';

    // Risk on/off
    let riskOnOff: CorrelationRegime['riskOnOff'];
    if (avgCorrelation > 0.5) riskOnOff = 'risk_off';
    else if (avgCorrelation < 0.2) riskOnOff = 'risk_on';
    else riskOnOff = 'neutral';

    return {
      regime,
      avgCorrelation: Math.round(avgCorrelation * 10000) / 10000,
      maxCorrelation: Math.round(maxCorrelation * 10000) / 10000,
      minCorrelation: Math.round(minCorrelation * 10000) / 10000,
      dispersion: Math.round(dispersion * 10000) / 10000,
      eigenvalueRatio: Math.round(eigenvalueRatio * 10000) / 10000,
      riskOnOff
    };
  }

  /**
   * 检测相关性断点
   */
  detectBreakpoints(
    correlationSeries: CorrelationMatrix[],
    windowSize: number = 20
  ): CorrelationBreakpoint[] {
    if (correlationSeries.length < windowSize * 2) return [];

    const breakpoints: CorrelationBreakpoint[] = [];
    const avgCorrs = correlationSeries.map(cm => {
      const n = cm.matrix.length;
      let sum = 0;
      let count = 0;
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          sum += cm.matrix[i][j];
          count++;
        }
      }
      return count > 0 ? sum / count : 0;
    });

    for (let i = windowSize; i < avgCorrs.length - windowSize; i++) {
      const before = avgCorrs.slice(i - windowSize, i);
      const after = avgCorrs.slice(i, i + windowSize);

      const avgBefore = before.reduce((s, v) => s + v, 0) / before.length;
      const avgAfter = after.reduce((s, v) => s + v, 0) / after.length;
      const change = avgAfter - avgBefore;

      // t检验简化
      const varBefore = before.reduce((s, v) => s + (v - avgBefore) ** 2, 0) / before.length;
      const varAfter = after.reduce((s, v) => s + (v - avgAfter) ** 2, 0) / after.length;
      const pooledStd = Math.sqrt((varBefore + varAfter) / 2);
      const tStat = pooledStd > 0 ? Math.abs(change) / (pooledStd * Math.sqrt(2 / windowSize)) : 0;

      if (tStat > 2) { // 约95%置信度
        // 找受影响最大的资产对
        const affectedPairs: [string, string][] = [];
        const cm = correlationSeries[i];
        const assets = cm.assets;
        for (let a = 0; a < assets.length; a++) {
          for (let b = a + 1; b < assets.length; b++) {
            if (Math.abs(cm.matrix[a][b]) > 0.5) {
              affectedPairs.push([assets[a], assets[b]]);
            }
          }
        }

        breakpoints.push({
          timestamp: correlationSeries[i].timestamp,
          beforeAvg: Math.round(avgBefore * 10000) / 10000,
          afterAvg: Math.round(avgAfter * 10000) / 10000,
          changePercent: Math.round(change * 10000) / 100,
          significance: Math.min(1, tStat / 5),
          affectedPairs: affectedPairs.slice(0, 5)
        });
      }
    }

    return breakpoints;
  }

  /**
   * 动态相关性分析
   */
  analyzeDynamicCorrelation(
    asset1Returns: number[],
    asset2Returns: number[],
    asset1Name: string,
    asset2Name: string,
    windowSize: number = 20
  ): DynamicCorrelation {
    const len = Math.min(asset1Returns.length, asset2Returns.length);
    const timestamps: number[] = [];
    const rollingCorr: number[] = [];
    const ewmaCorr: number[] = [];
    const dccCorr: number[] = [];

    let ewmaPrev = 0;
    const lambda = 0.94;

    for (let i = windowSize; i < len; i++) {
      const window1 = asset1Returns.slice(i - windowSize, i);
      const window2 = asset2Returns.slice(i - windowSize, i);
      const corr = this.pearsonCorrelation(window1, window2);
      rollingCorr.push(corr);
      timestamps.push(i);

      // EWMA
      ewmaPrev = i === windowSize ? corr : lambda * ewmaPrev + (1 - lambda) * corr;
      ewmaCorr.push(ewmaPrev);

      // DCC简化
      dccCorr.push(lambda * (dccCorr[dccCorr.length - 1] || corr) + (1 - lambda) * corr * corr);
    }

    // 趋势
    const recent = rollingCorr.slice(-10);
    const earlier = rollingCorr.slice(-20, -10);
    const avgRecent = recent.length > 0 ? recent.reduce((s, v) => s + v, 0) / recent.length : 0;
    const avgEarlier = earlier.length > 0 ? earlier.reduce((s, v) => s + v, 0) / earlier.length : avgRecent;

    let trend: DynamicCorrelation['trend'];
    if (avgRecent > avgEarlier + 0.05) trend = 'increasing';
    else if (avgRecent < avgEarlier - 0.05) trend = 'decreasing';
    else trend = 'stable';

    // 当前体制
    const currentCorr = rollingCorr.length > 0 ? rollingCorr[rollingCorr.length - 1] : 0;
    let currentRegime: string;
    if (currentCorr > 0.7) currentRegime = '高度正相关';
    else if (currentCorr > 0.3) currentRegime = '中度正相关';
    else if (currentCorr > -0.3) currentRegime = '低相关';
    else if (currentCorr > -0.7) currentRegime = '中度负相关';
    else currentRegime = '高度负相关';

    return {
      asset1: asset1Name,
      asset2: asset2Name,
      rollingCorr: rollingCorr.map(v => Math.round(v * 10000) / 10000),
      ewmaCorr: ewmaCorr.map(v => Math.round(v * 10000) / 10000),
      dccCorr: dccCorr.map(v => Math.round(v * 10000) / 10000),
      timestamps,
      trend,
      currentRegime
    };
  }

  /**
   * 尾部依赖分析
   */
  analyzeTailDependency(
    returns1: number[],
    returns2: number[],
    asset1: string,
    asset2: string,
    quantile: number = 0.1
  ): TailDependency {
    const len = Math.min(returns1.length, returns2.length);
    if (len < 10) {
      return { asset1, asset2, lowerTailDep: 0, upperTailDep: 0, asymmetry: 0, crisisAmplification: 0 };
    }

    const sorted1 = [...returns1.slice(0, len)].sort((a, b) => a - b);
    const sorted2 = [...returns2.slice(0, len)].sort((a, b) => a - b);

    const q1Lower = sorted1[Math.floor(len * quantile)];
    const q1Upper = sorted1[Math.floor(len * (1 - quantile))];
    const q2Lower = sorted2[Math.floor(len * quantile)];
    const q2Upper = sorted2[Math.floor(len * (1 - quantile))];

    // 下尾依赖: P(X < q1 | Y < q2)
    let lowerTailCount = 0;
    let upperTailCount = 0;
    let lowerTotal = 0;
    let upperTotal = 0;

    for (let i = 0; i < len; i++) {
      if (returns2[i] < q2Lower) {
        lowerTotal++;
        if (returns1[i] < q1Lower) lowerTailCount++;
      }
      if (returns2[i] > q2Upper) {
        upperTotal++;
        if (returns1[i] > q1Upper) upperTailCount++;
      }
    }

    const lowerTailDep = lowerTotal > 0 ? lowerTailCount / lowerTotal : 0;
    const upperTailDep = upperTotal > 0 ? upperTailCount / upperTotal : 0;
    const asymmetry = upperTailDep - lowerTailDep;

    // 危机放大效应
    const normalCorr = this.pearsonCorrelation(returns1, returns2);
    const crisisReturns1 = returns1.filter((_, i) => returns2[i] < q2Lower);
    const crisisReturns2 = returns2.filter((_, i) => returns2[i] < q2Lower);
    const crisisCorr = crisisReturns1.length > 5 ? this.pearsonCorrelation(crisisReturns1, crisisReturns2) : normalCorr;
    const crisisAmplification = crisisCorr - normalCorr;

    return {
      asset1,
      asset2,
      lowerTailDep: Math.round(lowerTailDep * 10000) / 10000,
      upperTailDep: Math.round(upperTailDep * 10000) / 10000,
      asymmetry: Math.round(asymmetry * 10000) / 10000,
      crisisAmplification: Math.round(crisisAmplification * 10000) / 10000
    };
  }

  /**
   * 相关性稳定性分析
   */
  analyzeStability(
    correlationSeries: CorrelationMatrix[]
  ): CorrelationStability {
    if (correlationSeries.length < 2) {
      return {
        overallStability: 50, mostStablePairs: [], leastStablePairs: [],
        structuralBreaks: 0, regimePersistence: 0
      };
    }

    const assets = correlationSeries[0].assets;
    const n = assets.length;
    const pairStabilities: [string, string, number][] = [];

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const series = correlationSeries.map(cm => cm.matrix[i][j]);
        const mean = series.reduce((s, v) => s + v, 0) / series.length;
        const variance = series.reduce((s, v) => s + (v - mean) ** 2, 0) / series.length;
        const stability = Math.max(0, 100 - Math.sqrt(variance) * 200);
        pairStabilities.push([assets[i], assets[j], Math.round(stability)]);
      }
    }

    pairStabilities.sort((a, b) => b[2] - a[2]);

    const mostStablePairs = pairStabilities.slice(0, 5);
    const leastStablePairs = pairStabilities.slice(-5).reverse();
    const overallStability = pairStabilities.length > 0
      ? Math.round(pairStabilities.reduce((s, p) => s + p[2], 0) / pairStabilities.length)
      : 50;

    // 结构性断点计数
    const avgCorrs = correlationSeries.map(cm => {
      let sum = 0, count = 0;
      for (let a = 0; a < n; a++) {
        for (let b = a + 1; b < n; b++) { sum += cm.matrix[a][b]; count++; }
      }
      return count > 0 ? sum / count : 0;
    });

    let structuralBreaks = 0;
    for (let i = 10; i < avgCorrs.length - 10; i++) {
      const before = avgCorrs.slice(i - 10, i);
      const after = avgCorrs.slice(i, i + 10);
      const avgB = before.reduce((s, v) => s + v, 0) / before.length;
      const avgA = after.reduce((s, v) => s + v, 0) / after.length;
      if (Math.abs(avgA - avgB) > 0.2) structuralBreaks++;
    }

    // 体制持续性
    let regimeChanges = 0;
    let prevRegime = avgCorrs[0] > 0.4 ? 'high' : 'low';
    for (const c of avgCorrs) {
      const curr = c > 0.4 ? 'high' : 'low';
      if (curr !== prevRegime) regimeChanges++;
      prevRegime = curr;
    }
    const regimePersistence = avgCorrs.length > 1 ? 1 - regimeChanges / (avgCorrs.length - 1) : 0;

    return {
      overallStability,
      mostStablePairs,
      leastStablePairs,
      structuralBreaks,
      regimePersistence: Math.round(Math.max(0, regimePersistence) * 10000) / 10000
    };
  }

  // ==================== 辅助方法 ====================
  private pearsonCorrelation(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);
    if (n < 2) return 0;

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
    return den > 0 ? num / den : 0;
  }

  private estimateEigenvalues(matrix: number[][]): number[] {
    const n = matrix.length;
    if (n === 0) return [];

    // 简化: 返回各行和作为特征值近似
    return matrix.map(row => row.reduce((s, v) => s + v, 0));
  }
}

export default CorrelationRegimeEngine;
