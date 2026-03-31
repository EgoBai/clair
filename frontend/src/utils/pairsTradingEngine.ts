/**
 * 配对交易引擎
 * - 协整性检验
 * - 价差/Z-Score计算
 * - 交易信号生成
 * - 回测绩效
 */

export interface PairData {
  assetA: number[];
  assetB: number[];
  timestamps: string[];
}

export interface CointegrationResult {
  isCointegrated: boolean;
  hedgeRatio: number;
  spreadMean: number;
  spreadStd: number;
  halfLife: number;
  adfStatistic: number;
  pValue: number;
}

export interface SpreadSignal {
  timestamp: string;
  spread: number;
  zScore: number;
  signal: 'long_spread' | 'short_spread' | 'exit' | 'hold';
  confidence: number;
}

export interface PairsBacktestResult {
  totalReturn: number;
  annualizedReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  totalTrades: number;
  profitFactor: number;
}

export class PairsTradingEngine {
  /**
   * 简单线性回归
   */
  private linearRegression(x: number[], y: number[]): { slope: number; intercept: number; residuals: number[] } {
    const n = Math.min(x.length, y.length);
    const xMean = x.slice(0, n).reduce((a, b) => a + b, 0) / n;
    const yMean = y.slice(0, n).reduce((a, b) => a + b, 0) / n;

    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      num += (x[i] - xMean) * (y[i] - yMean);
      den += (x[i] - xMean) ** 2;
    }

    const slope = den > 0 ? num / den : 0;
    const intercept = yMean - slope * xMean;
    const residuals = [];
    for (let i = 0; i < n; i++) {
      residuals.push(y[i] - (slope * x[i] + intercept));
    }

    return { slope, intercept, residuals };
  }

  /**
   * 协整性检验(简化ADF)
   */
  testCointegration(data: PairData, lookback: number = 60): CointegrationResult {
    const a = data.assetA.slice(-lookback);
    const b = data.assetB.slice(-lookback);

    // 回归 B ~ A
    const reg = this.linearRegression(a, b);
    const hedgeRatio = Math.round(reg.slope * 10000) / 10000;
    const spread = reg.residuals;

    const n = spread.length;
    const spreadMean = spread.reduce((s, v) => s + v, 0) / n;
    const spreadVar = spread.reduce((s, v) => s + (v - spreadMean) ** 2, 0) / n;
    const spreadStd = Math.sqrt(spreadVar);

    // 半衰期(AR(1)模型)
    let num = 0, den = 0;
    for (let i = 1; i < n; i++) {
      num += (spread[i - 1] - spreadMean) * (spread[i] - spread[i - 1]);
      den += (spread[i - 1] - spreadMean) ** 2;
    }
    const beta = den > 0 ? num / den : 0;
    const halfLife = beta < 0 ? Math.round(-Math.log(2) / Math.log(1 + beta) * 100) / 100 : n;

    // ADF统计量(简化)
    const adfStatistic = Math.round(beta / (spreadStd / Math.sqrt(n)) * 100) / 100;

    // 简化p值判断
    const isCointegrated = adfStatistic < -2.5 && halfLife > 0 && halfLife < 100;
    const pValue = isCointegrated ? 0.05 : 0.5;

    return {
      isCointegrated,
      hedgeRatio,
      spreadMean: Math.round(spreadMean * 10000) / 10000,
      spreadStd: Math.round(spreadStd * 10000) / 10000,
      halfLife,
      adfStatistic,
      pValue,
    };
  }

  /**
   * 生成价差交易信号
   */
  generateSignals(
    data: PairData,
    hedgeRatio: number,
    entryThreshold: number = 2,
    exitThreshold: number = 0.5,
    lookback: number = 60,
  ): SpreadSignal[] {
    const signals: SpreadSignal[] = [];
    const n = data.assetA.length;

    // 计算滚动均值和标准差
    for (let i = lookback; i < n; i++) {
      const windowA = data.assetA.slice(i - lookback, i);
      const windowB = data.assetB.slice(i - lookback, i);

      const spreads = windowA.map((a, j) => a - hedgeRatio * windowB[j]);
      const mean = spreads.reduce((s, v) => s + v, 0) / spreads.length;
      const std = Math.sqrt(spreads.reduce((s, v) => s + (v - mean) ** 2, 0) / spreads.length);

      const currentSpread = data.assetA[i] - hedgeRatio * data.assetB[i];
      const zScore = std > 0 ? (currentSpread - mean) / std : 0;

      let signal: SpreadSignal['signal'];
      let confidence: number;

      if (zScore > entryThreshold) {
        signal = 'short_spread';
        confidence = Math.min(1, Math.abs(zScore) / 3);
      } else if (zScore < -entryThreshold) {
        signal = 'long_spread';
        confidence = Math.min(1, Math.abs(zScore) / 3);
      } else if (Math.abs(zScore) < exitThreshold) {
        signal = 'exit';
        confidence = 1 - Math.abs(zScore) / exitThreshold;
      } else {
        signal = 'hold';
        confidence = 0;
      }

      signals.push({
        timestamp: data.timestamps[i] || `${i}`,
        spread: Math.round(currentSpread * 10000) / 10000,
        zScore: Math.round(zScore * 10000) / 10000,
        signal,
        confidence: Math.round(confidence * 100) / 100,
      });
    }

    return signals;
  }

  /**
   * 简化回测
   */
  backtest(signals: SpreadSignal[], data: PairData, hedgeRatio: number): PairsBacktestResult {
    let position = 0; // 1=long spread, -1=short spread
    let entrySpread = 0;
    const returns: number[] = [];
    let wins = 0, losses = 0, totalTrades = 0;
    let totalWin = 0, totalLoss = 0;

    for (let i = 1; i < signals.length; i++) {
      const sig = signals[i];
      const prevIdx = i + 60; // offset for lookback

      if (position === 0) {
        if (sig.signal === 'long_spread') { position = 1; entrySpread = sig.spread; }
        else if (sig.signal === 'short_spread') { position = -1; entrySpread = sig.spread; }
      } else {
        const pnl = position * (sig.spread - entrySpread);
        returns.push(pnl);

        if (sig.signal === 'exit' || (position === 1 && sig.zScore > 0) || (position === -1 && sig.zScore < 0)) {
          totalTrades++;
          if (pnl >= 0) { wins++; totalWin += pnl; }
          else { losses++; totalLoss += Math.abs(pnl); }
          position = 0;
        }
      }
    }

    const totalReturn = returns.reduce((a, b) => a + b, 0);
    const mean = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const std = returns.length > 1 ? Math.sqrt(returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length) : 1;
    const sharpeRatio = std > 0 ? mean / std * Math.sqrt(252) : 0;

    // Max drawdown
    let peak = 0, cumReturn = 0, maxDD = 0;
    for (const r of returns) {
      cumReturn += r;
      if (cumReturn > peak) peak = cumReturn;
      const dd = peak - cumReturn;
      if (dd > maxDD) maxDD = dd;
    }

    return {
      totalReturn: Math.round(totalReturn * 10000) / 10000,
      annualizedReturn: Math.round(totalReturn / Math.max(1, signals.length) * 252 * 10000) / 10000,
      sharpeRatio: Math.round(sharpeRatio * 10000) / 10000,
      maxDrawdown: Math.round(maxDD * 10000) / 10000,
      winRate: totalTrades > 0 ? Math.round(wins / totalTrades * 100) / 100 : 0,
      avgWin: wins > 0 ? Math.round(totalWin / wins * 10000) / 10000 : 0,
      avgLoss: losses > 0 ? Math.round(totalLoss / losses * 10000) / 10000 : 0,
      totalTrades,
      profitFactor: totalLoss > 0 ? Math.round(totalWin / totalLoss * 10000) / 10000 : totalWin > 0 ? Infinity : 0,
    };
  }

  /**
   * 最优对冲比例(最小方差)
   */
  optimalHedgeRatio(assetA: number[], assetB: number[]): number {
    const n = Math.min(assetA.length, assetB.length);
    const returnsA = [];
    const returnsB = [];
    for (let i = 1; i < n; i++) {
      returnsA.push(assetA[i] / assetA[i - 1] - 1);
      returnsB.push(assetB[i] / assetB[i - 1] - 1);
    }

    const m = returnsA.length;
    const meanA = returnsA.reduce((a, b) => a + b, 0) / m;
    const meanB = returnsB.reduce((a, b) => a + b, 0) / m;

    let cov = 0, varB = 0;
    for (let i = 0; i < m; i++) {
      cov += (returnsA[i] - meanA) * (returnsB[i] - meanB);
      varB += (returnsB[i] - meanB) ** 2;
    }

    return varB > 0 ? Math.round(cov / varB * 10000) / 10000 : 1;
  }
}

export default new PairsTradingEngine();
