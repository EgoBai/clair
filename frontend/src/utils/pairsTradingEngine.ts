/**
 * 配对交易引擎
 * - 协整检验(ADF/KPSS近似)
 * - 价差计算与标准化
 * - 均值回归信号
 * - 半衰期计算
 * - 配对评分(协整强度+相关性+流动性)
 * - 进出场信号
 * - 风险控制
 */

export interface CointegrationResult {
  isCointegrated: boolean;
  adfStatistic: number;
  pValue: number; // 近似p值
  halfLife: number;
  hedgeRatio: number;
}

export interface SpreadAnalysis {
  mean: number;
  std: number;
  currentZScore: number;
  maxZScore: number;
  minZScore: number;
  meanReversionStrength: number;
}

export interface PairSignal {
  action: 'long_spread' | 'short_spread' | 'close' | 'hold';
  zScore: number;
  entryThreshold: number;
  exitThreshold: number;
  stopLoss: number;
  confidence: number;
}

export interface PairScore {
  cointegrationScore: number; // 0-100
  correlationScore: number; // 0-100
  liquidityScore: number; // 0-100
  totalScore: number; // 0-100
  rating: 'excellent' | 'good' | 'fair' | 'poor';
}

export interface PairsBacktest {
  totalTrades: number;
  winRate: number;
  avgReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
  profitFactor: number;
  avgHoldingDays: number;
}

export class PairsTradingEngine {
  private entryZ: number;
  private exitZ: number;
  private stopZ: number;

  constructor(entryZ = 2.0, exitZ = 0.5, stopZ = 3.5) {
    this.entryZ = entryZ;
    this.exitZ = exitZ;
    this.stopZ = stopZ;
  }

  /**
   * 协整检验(ADF近似)
   */
  testCointegration(series1: number[], series2: number[]): CointegrationResult {
    if (series1.length !== series2.length || series1.length < 30) {
      return { isCointegrated: false, adfStatistic: 0, pValue: 1, halfLife: 0, hedgeRatio: 0 };
    }

    // OLS回归: series1 = α + β * series2 + ε
    const { beta: hedgeRatio, residuals } = this.olsRegress(series1, series2);

    // ADF检验残差
    const { adfStatistic, pValue } = this.adfTest(residuals);

    // 半衰期
    const halfLife = this.calcHalfLife(residuals);

    // 协整判断: ADF统计量 < -3.0 近似 p < 0.05
    const isCointegrated = adfStatistic < -3.0 && halfLife > 0 && halfLife < 120;

    return {
      isCointegrated,
      adfStatistic: Math.round(adfStatistic * 1000) / 1000,
      pValue: Math.round(pValue * 10000) / 10000,
      halfLife: Math.round(halfLife * 10) / 10,
      hedgeRatio: Math.round(hedgeRatio * 10000) / 10000,
    };
  }

  /**
   * 分析价差
   */
  analyzeSpread(series1: number[], series2: number[], hedgeRatio?: number): SpreadAnalysis {
    const hr = hedgeRatio ?? this.olsRegress(series1, series2).beta;
    const spread = series1.map((s1, i) => s1 - hr * series2[i]);

    const mean = spread.reduce((a, b) => a + b, 0) / spread.length;
    const std = Math.sqrt(spread.reduce((s, v) => s + (v - mean) ** 2, 0) / (spread.length - 1));

    const zScores = spread.map(s => std > 0 ? (s - mean) / std : 0);
    const currentZScore = zScores[zScores.length - 1];
    const maxZScore = Math.max(...zScores);
    const minZScore = Math.min(...zScores);

    // 均值回归强度: AR(1)系数
    const ar1 = this.calcAR1(spread);
    const meanReversionStrength = Math.max(0, 1 - ar1);

    return {
      mean: Math.round(mean * 10000) / 10000,
      std: Math.round(std * 10000) / 10000,
      currentZScore: Math.round(currentZScore * 100) / 100,
      maxZScore: Math.round(maxZScore * 100) / 100,
      minZScore: Math.round(minZScore * 100) / 100,
      meanReversionStrength: Math.round(meanReversionStrength * 10000) / 10000,
    };
  }

  /**
   * 生成交易信号
   */
  generateSignal(spread: SpreadAnalysis, lookback = 60): PairSignal {
    const z = spread.currentZScore;

    let action: PairSignal['action'];
    let confidence: number;

    if (z > this.entryZ) {
      action = 'short_spread';
      confidence = Math.min(1, 0.5 + (z - this.entryZ) / 4);
    } else if (z < -this.entryZ) {
      action = 'long_spread';
      confidence = Math.min(1, 0.5 + (-z - this.entryZ) / 4);
    } else if (Math.abs(z) < this.exitZ) {
      action = 'close';
      confidence = 0.8;
    } else {
      action = 'hold';
      confidence = 0.5;
    }

    return {
      action,
      zScore: z,
      entryThreshold: this.entryZ,
      exitThreshold: this.exitZ,
      stopLoss: this.stopZ,
      confidence: Math.round(confidence * 100) / 100,
    };
  }

  /**
   * 配对评分
   */
  scorePair(
    series1: number[],
    series2: number[],
    avgVolume1: number,
    avgVolume2: number,
  ): PairScore {
    const coint = this.testCointegration(series1, series2);

    // 协整评分
    const cointegrationScore = coint.isCointegrated
      ? Math.min(100, Math.max(0, (Math.abs(coint.adfStatistic) - 2) * 25))
      : 0;

    // 相关性评分
    const corr = this.calcCorrelation(series1, series2);
    const correlationScore = Math.abs(corr) * 100;

    // 流动性评分(对数体积)
    const avgVol = (avgVolume1 + avgVolume2) / 2;
    const liquidityScore = Math.min(100, Math.log10(avgVol + 1) * 20);

    const totalScore = cointegrationScore * 0.5 + correlationScore * 0.3 + liquidityScore * 0.2;

    let rating: PairScore['rating'];
    if (totalScore > 75) rating = 'excellent';
    else if (totalScore > 55) rating = 'good';
    else if (totalScore > 35) rating = 'fair';
    else rating = 'poor';

    return {
      cointegrationScore: Math.round(cointegrationScore * 10) / 10,
      correlationScore: Math.round(correlationScore * 10) / 10,
      liquidityScore: Math.round(liquidityScore * 10) / 10,
      totalScore: Math.round(totalScore * 10) / 10,
      rating,
    };
  }

  /**
   * 配对交易回测
   */
  backtestPairs(
    series1: number[],
    series2: number[],
    lookback: number = 60,
  ): PairsBacktest {
    if (series1.length < lookback + 20) {
      return { totalTrades: 0, winRate: 0, avgReturn: 0, maxDrawdown: 0, sharpeRatio: 0, profitFactor: 0, avgHoldingDays: 0 };
    }

    const { beta: hr } = this.olsRegress(series1, series2);
    const spread = series1.map((s1, i) => s1 - hr * series2[i]);

    const trades: Array<{ return: number; days: number }> = [];
    let position = 0;
    let entryIdx = 0;

    for (let i = lookback; i < spread.length; i++) {
      const window = spread.slice(i - lookback, i);
      const mean = window.reduce((a, b) => a + b, 0) / lookback;
      const std = Math.sqrt(window.reduce((s, v) => s + (v - mean) ** 2, 0) / (lookback - 1));
      const z = std > 0 ? (spread[i] - mean) / std : 0;

      if (position === 0) {
        if (z > this.entryZ) { position = -1; entryIdx = i; }
        else if (z < -this.entryZ) { position = 1; entryIdx = i; }
      } else if (position === 1) {
        if (z >= this.exitZ || z < -this.stopZ) {
          trades.push({ return: (spread[i] - spread[entryIdx]) / Math.abs(spread[entryIdx] || 1), days: i - entryIdx });
          position = 0;
        }
      } else {
        if (z <= -this.exitZ || z > this.stopZ) {
          trades.push({ return: (spread[entryIdx] - spread[i]) / Math.abs(spread[entryIdx] || 1), days: i - entryIdx });
          position = 0;
        }
      }
    }

    if (trades.length === 0) {
      return { totalTrades: 0, winRate: 0, avgReturn: 0, maxDrawdown: 0, sharpeRatio: 0, profitFactor: 0, avgHoldingDays: 0 };
    }

    const returns = trades.map(t => t.return);
    const winRate = returns.filter(r => r > 0).length / returns.length;
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const avgHoldingDays = trades.reduce((s, t) => s + t.days, 0) / trades.length;

    let peak = 0, cumRet = 0, maxDD = 0;
    returns.forEach(r => { cumRet += r; peak = Math.max(peak, cumRet); maxDD = Math.min(maxDD, cumRet - peak); });

    const stdRet = Math.sqrt(returns.reduce((s, r) => s + (r - avgReturn) ** 2, 0) / (returns.length - 1));
    const sharpeRatio = stdRet > 0 ? (avgReturn / stdRet) * Math.sqrt(252 / avgHoldingDays) : 0;

    const wins = returns.filter(r => r > 0).reduce((a, b) => a + b, 0);
    const losses = Math.abs(returns.filter(r => r < 0).reduce((a, b) => a + b, 0));

    return {
      totalTrades: trades.length,
      winRate: Math.round(winRate * 10000) / 10000,
      avgReturn: Math.round(avgReturn * 10000) / 10000,
      maxDrawdown: Math.round(maxDD * 10000) / 10000,
      sharpeRatio: Math.round(sharpeRatio * 100) / 100,
      profitFactor: losses > 0 ? Math.round((wins / losses) * 100) / 100 : wins > 0 ? 10 : 0,
      avgHoldingDays: Math.round(avgHoldingDays * 10) / 10,
    };
  }

  // --- Helpers ---

  private olsRegress(y: number[], x: number[]): { alpha: number; beta: number; residuals: number[] } {
    const n = x.length;
    const meanX = x.reduce((a, b) => a + b, 0) / n;
    const meanY = y.reduce((a, b) => a + b, 0) / n;

    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      num += (x[i] - meanX) * (y[i] - meanY);
      den += (x[i] - meanX) ** 2;
    }
    const beta = den > 0 ? num / den : 0;
    const alpha = meanY - beta * meanX;
    const residuals = y.map((yi, i) => yi - (alpha + beta * x[i]));

    return { alpha, beta, residuals };
  }

  private adfTest(series: number[]): { adfStatistic: number; pValue: number } {
    const n = series.length;
    const y = series.slice(1);
    const x = series.slice(0, -1);
    const dy = y.map((yi, i) => yi - x[i]);

    const meanX = x.reduce((a, b) => a + b, 0) / x.length;
    const meanDy = dy.reduce((a, b) => a + b, 0) / dy.length;

    let num = 0, den = 0;
    for (let i = 0; i < x.length; i++) {
      num += (x[i] - meanX) * (dy[i] - meanDy);
      den += (x[i] - meanX) ** 2;
    }
    const gamma = den > 0 ? num / den : 0;

    const residuals = dy.map((d, i) => d - (meanDy + gamma * (x[i] - meanX)));
    const se = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / (n - 2) / den);
    const adfStatistic = se > 0 ? gamma / se : 0;

    // 简化p值估计
    const pValue = adfStatistic < -3.5 ? 0.01 : adfStatistic < -3.0 ? 0.05 : adfStatistic < -2.6 ? 0.1 : 0.5;

    return { adfStatistic, pValue };
  }

  private calcHalfLife(series: number[]): number {
    const y = series.slice(1);
    const x = series.slice(0, -1);
    const dy = y.map((yi, i) => yi - x[i]);

    const meanX = x.reduce((a, b) => a + b, 0) / x.length;
    const meanDy = dy.reduce((a, b) => a + b, 0) / dy.length;

    let num = 0, den = 0;
    for (let i = 0; i < x.length; i++) {
      num += (x[i] - meanX) * (dy[i] - meanDy);
      den += (x[i] - meanX) ** 2;
    }
    const gamma = den > 0 ? num / den : 0;

    return gamma < 0 ? Math.round(-Math.log(2) / gamma * 10) / 10 : 999;
  }

  private calcAR1(series: number[]): number {
    const x = series.slice(0, -1);
    const y = series.slice(1);
    const meanX = x.reduce((a, b) => a + b, 0) / x.length;
    const meanY = y.reduce((a, b) => a + b, 0) / y.length;
    let num = 0, den = 0;
    for (let i = 0; i < x.length; i++) {
      num += (x[i] - meanX) * (y[i] - meanY);
      den += (x[i] - meanX) ** 2;
    }
    return den > 0 ? num / den : 0;
  }

  private calcCorrelation(a: number[], b: number[]): number {
    const n = Math.min(a.length, b.length);
    const meanA = a.slice(0, n).reduce((x, y) => x + y, 0) / n;
    const meanB = b.slice(0, n).reduce((x, y) => x + y, 0) / n;
    let num = 0, denA = 0, denB = 0;
    for (let i = 0; i < n; i++) {
      num += (a[i] - meanA) * (b[i] - meanB);
      denA += (a[i] - meanA) ** 2;
      denB += (b[i] - meanB) ** 2;
    }
    return denA > 0 && denB > 0 ? num / Math.sqrt(denA * denB) : 0;
  }
}

export default new PairsTradingEngine();
