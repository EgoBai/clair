/**
 * 波动率建模引擎
 * - GARCH(1,1) 波动率模型
 * - 隐含波动率计算
 * - 波动率曲面构建
 * - 波动率突破信号
 * - 历史波动率锥
 */

export interface VolatilityPoint {
  timestamp: number;
  realizedVol: number;
  impliedVol?: number;
}

export interface GARCHResult {
  omega: number;
  alpha: number;
  beta: number;
  unconditionalVariance: number;
  forecasts: number[];
  logLikelihood: number;
}

export interface VolatilityCone {
  horizon: number; // days
  min: number;
  percentile25: number;
  median: number;
  percentile75: number;
  max: number;
  current: number;
  percentile: number; // where current sits
}

export interface VolatilityBreakout {
  timestamp: number;
  type: 'expansion' | 'contraction';
  currentVol: number;
  threshold: number;
  duration: number;
  signal: 'long' | 'short' | 'neutral';
}

export interface VolSurface {
  strikes: number[];
  expiries: number[];
  impliedVols: number[][];
  skew: number; // 25-delta put vol - 25-delta call vol
  termStructure: number[]; // vol at different expiries
  atmVol: number;
}

export interface VolatilityRegime {
  regime: 'low' | 'normal' | 'high' | 'extreme';
  currentVol: number;
  percentileVol: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  persistence: number; // 0-1
}

export class VolatilityEngine {
  /**
   * 计算历史波动率
   */
  historicalVolatility(prices: number[], window: number = 20): number[] {
    if (prices.length < window + 1) return [];

    const logReturns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      logReturns.push(Math.log(prices[i] / prices[i - 1]));
    }

    const vols: number[] = [];
    for (let i = window; i <= logReturns.length; i++) {
      const windowReturns = logReturns.slice(i - window, i);
      const mean = windowReturns.reduce((a, b) => a + b, 0) / window;
      const variance = windowReturns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / window;
      vols.push(Math.sqrt(variance * 252));
    }

    return vols;
  }

  /**
   * GARCH(1,1) 模型估计
   */
  fitGARCH(returns: number[], maxIterations: number = 100): GARCHResult | null {
    if (returns.length < 50) return null;

    const n = returns.length;
    const mean = returns.reduce((a, b) => a + b, 0) / n;
    const residuals = returns.map(r => r - mean);
    const initialVariance = residuals.reduce((sum, r) => sum + r ** 2, 0) / n;

    // Simplified MLE using grid search
    let bestOmega = initialVariance * 0.1;
    let bestAlpha = 0.1;
    let bestBeta = 0.85;
    let bestLikelihood = -Infinity;

    const alphaRange = [0.05, 0.1, 0.15, 0.2];
    const betaRange = [0.7, 0.8, 0.85, 0.9, 0.93];

    for (const alpha of alphaRange) {
      for (const beta of betaRange) {
        if (alpha + beta >= 1) continue;

        const omega = initialVariance * (1 - alpha - beta);
        let variance = initialVariance;
        let logLik = 0;

        for (let t = 0; t < n; t++) {
          variance = omega + alpha * residuals[t] ** 2 + beta * variance;
          if (variance <= 0) { logLik = -Infinity; break; }
          logLik += -0.5 * Math.log(2 * Math.PI) - 0.5 * Math.log(variance) - 0.5 * residuals[t] ** 2 / variance;
        }

        if (logLik > bestLikelihood) {
          bestLikelihood = logLik;
          bestOmega = omega;
          bestAlpha = alpha;
          bestBeta = beta;
        }
      }
    }

    // Generate forecasts
    let variance = bestOmega / (1 - bestAlpha - bestBeta);
    const forecasts: number[] = [];
    for (let t = 0; t < n; t++) {
      variance = bestOmega + bestAlpha * residuals[t] ** 2 + bestBeta * variance;
    }

    // Multi-step forecasts
    const unconditional = bestOmega / (1 - bestAlpha - bestBeta);
    for (let h = 1; h <= 5; h++) {
      const forecast = unconditional + (bestAlpha + bestBeta) ** h * (variance - unconditional);
      forecasts.push(Math.sqrt(Math.abs(forecast) * 252));
    }

    return {
      omega: bestOmega,
      alpha: bestAlpha,
      beta: bestBeta,
      unconditionalVariance: unconditional,
      forecasts,
      logLikelihood: bestLikelihood
    };
  }

  /**
   * 波动率锥
   */
  buildVolCone(prices: number[], horizons: number[] = [5, 10, 20, 60, 120]): VolatilityCone[] {
    const cones: VolatilityCone[] = [];

    for (const horizon of horizons) {
      const vols = this.historicalVolatility(prices, horizon);
      if (vols.length < 10) continue;

      const sorted = [...vols].sort((a, b) => a - b);
      const current = vols[vols.length - 1];

      const min = sorted[0];
      const max = sorted[sorted.length - 1];
      const p25 = sorted[Math.floor(sorted.length * 0.25)];
      const median = sorted[Math.floor(sorted.length * 0.5)];
      const p75 = sorted[Math.floor(sorted.length * 0.75)];

      const percentileRank = sorted.filter(v => v <= current).length / sorted.length;

      cones.push({
        horizon,
        min,
        percentile25: p25,
        median,
        percentile75: p75,
        max,
        current,
        percentile: percentileRank
      });
    }

    return cones;
  }

  /**
   * 波动率突破检测
   */
  detectBreakouts(prices: number[], window: number = 20, threshold: number = 1.5): VolatilityBreakout[] {
    const vols = this.historicalVolatility(prices, window);
    if (vols.length < window * 2) return [];

    const breakouts: VolatilityBreakout[] = [];

    for (let i = window; i < vols.length; i++) {
      const history = vols.slice(i - window, i);
      const mean = history.reduce((a, b) => a + b, 0) / history.length;
      const std = this.std(history);

      if (std === 0) continue;

      const current = vols[i];
      const zScore = (current - mean) / std;

      if (zScore > threshold) {
        // Count duration of expansion
        let duration = 0;
        for (let j = i; j >= 0 && vols[j] > mean; j--) duration++;

        breakouts.push({
          timestamp: i,
          type: 'expansion',
          currentVol: current,
          threshold: mean + threshold * std,
          duration,
          signal: zScore > 2 ? 'short' : 'neutral' // High vol often means sell
        });
      } else if (zScore < -threshold) {
        let duration = 0;
        for (let j = i; j >= 0 && vols[j] < mean; j--) duration++;

        breakouts.push({
          timestamp: i,
          type: 'contraction',
          currentVol: current,
          threshold: mean - threshold * std,
          duration,
          signal: 'long' // Low vol often precedes rallies
        });
      }
    }

    return breakouts;
  }

  /**
   * 波动率曲面构建 (简化版)
   */
  buildVolSurface(
    strikes: number[],
    expiries: number[],
    spotPrice: number,
    atmVol: number
  ): VolSurface {
    const impliedVols: number[][] = [];

    for (const expiry of expiries) {
      const row: number[] = [];

      for (const strike of strikes) {
        const moneyness = Math.log(strike / spotPrice);
        const timeToExpiry = expiry / 365;

        // Simplified volatility smile
        const skew = -0.1 * moneyness; // negative skew
        const smile = 0.05 * moneyness ** 2; // convexity
        const term = 0.02 * Math.sqrt(timeToExpiry); // term structure

        const iv = Math.max(0.05, atmVol + skew + smile + term);
        row.push(iv);
      }

      impliedVols.push(row);
    }

    // Calculate skew (25-delta approx)
    const skew = impliedVols[0]?.[0] && impliedVols[0]?.[strikes.length - 1]
      ? impliedVols[0][0] - impliedVols[0][strikes.length - 1]
      : 0;

    const termStructure = expiries.map((_, i) => {
      const atmIndex = Math.floor(strikes.length / 2);
      return impliedVols[i]?.[atmIndex] || atmVol;
    });

    return { strikes, expiries, impliedVols, skew, termStructure, atmVol };
  }

  /**
   * 波动率状态识别
   */
  detectRegime(prices: number[], window: number = 60): VolatilityRegime {
    const vols = this.historicalVolatility(prices, window);

    if (vols.length < 10) {
      return { regime: 'normal', currentVol: 0, percentileVol: 50, trend: 'stable', persistence: 0 };
    }

    const currentVol = vols[vols.length - 1];
    const sorted = [...vols].sort((a, b) => a - b);
    const percentile = sorted.filter(v => v <= currentVol).length / sorted.length;

    let regime: VolatilityRegime['regime'];
    if (percentile > 0.9) regime = 'extreme';
    else if (percentile > 0.7) regime = 'high';
    else if (percentile < 0.3) regime = 'low';
    else regime = 'normal';

    // Trend
    const recentVols = vols.slice(-10);
    const oldVols = vols.slice(-20, -10);
    const recentAvg = recentVols.reduce((a, b) => a + b, 0) / recentVols.length;
    const oldAvg = oldVols.length > 0 ? oldVols.reduce((a, b) => a + b, 0) / oldVols.length : recentAvg;

    let trend: 'increasing' | 'decreasing' | 'stable';
    if (recentAvg > oldAvg * 1.1) trend = 'increasing';
    else if (recentAvg < oldAvg * 0.9) trend = 'decreasing';
    else trend = 'stable';

    // Persistence (autocorrelation)
    let persistence = 0;
    if (vols.length >= 20) {
      const mean = vols.reduce((a, b) => a + b, 0) / vols.length;
      let num = 0;
      let den = 0;
      for (let i = 1; i < vols.length; i++) {
        num += (vols[i] - mean) * (vols[i - 1] - mean);
        den += (vols[i - 1] - mean) ** 2;
      }
      persistence = den > 0 ? Math.min(1, Math.abs(num / den)) : 0;
    }

    return { regime, currentVol, percentileVol: percentile * 100, trend, persistence };
  }

  private std(data: number[]): number {
    if (data.length === 0) return 0;
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    return Math.sqrt(data.reduce((sum, v) => sum + (v - mean) ** 2, 0) / data.length);
  }
}

export default new VolatilityEngine();
