/**
 * 均值回归分析引擎
 * - Bollinger Band Z-Score
 * - Hurst Exponent
 * - Half-Life of Mean Reversion
 * - Ornstein-Uhlenbeck Process
 * - Pairs Cointegration (Engle-Granger)
 * - Mean Reversion Signal Generation
 */

export interface PriceSeries {
  symbol: string;
  prices: number[];
  timestamps?: number[];
}

export interface ZScoreResult {
  current: number;
  mean: number;
  std: number;
  zScore: number;
  percentile: number;
  signal: 'oversold' | 'overbought' | 'neutral';
  bollingerUpper: number;
  bollingerLower: number;
  width: number;
}

export interface HurstResult {
  exponent: number;
  interpretation: 'trending' | 'mean_reverting' | 'random_walk';
  confidence: number;
  lags: number[];
  rescaledRanges: number[];
}

export interface HalfLifeResult {
  halfLife: number;
  isValid: boolean;
  lambda: number;
  rSquared: number;
  adfStatistic: number;
  isStationary: boolean;
}

export interface OUParams {
  mu: number;       // long-term mean
  theta: number;    // speed of reversion
  sigma: number;    // volatility
  halfLife: number;
  stationaryDistribution: { mean: number; std: number };
}

export interface CointegrationResult {
  isCointegrated: boolean;
  hedgeRatio: number;
  spread: number[];
  spreadMean: number;
  spreadStd: number;
  currentSpreadZScore: number;
  adfStatistic: number;
  halfLife: number;
  pValue: number;
}

export interface MeanReversionSignal {
  symbol: string;
  signal: 'buy' | 'sell' | 'hold';
  strength: number; // 0-1
  zScore: number;
  halfLife: number;
  hurst: number;
  reasons: string[];
}

export interface RollingMeanReversion {
  window: number;
  periods: Array<{
    endIndex: number;
    zScore: number;
    hurst: number;
    halfLife: number;
    isReverting: boolean;
  }>;
}

export class MeanReversionEngine {
  /**
   * Bollinger Band Z-Score 均值回归指标
   */
  calculateZScore(prices: number[], period: number = 20, numStd: number = 2): ZScoreResult | null {
    if (prices.length < period) return null;

    const window = prices.slice(-period);
    const mean = window.reduce((a, b) => a + b, 0) / period;
    const variance = window.reduce((sum, p) => sum + (p - mean) ** 2, 0) / period;
    const std = Math.sqrt(variance);
    const current = prices[prices.length - 1];

    if (std === 0) return null;

    const zScore = (current - mean) / std;
    const sorted = [...window].sort((a, b) => a - b);
    const rank = sorted.filter(v => v <= current).length;
    const percentile = (rank / period) * 100;

    let signal: 'oversold' | 'overbought' | 'neutral' = 'neutral';
    if (zScore <= -numStd) signal = 'oversold';
    else if (zScore >= numStd) signal = 'overbought';

    return {
      current,
      mean,
      std,
      zScore,
      percentile,
      signal,
      bollingerUpper: mean + numStd * std,
      bollingerLower: mean - numStd * std,
      width: (2 * numStd * std) / mean
    };
  }

  /**
   * Hurst Exponent - 判断序列是否均值回归
   * H < 0.5: 均值回归
   * H = 0.5: 随机游走
   * H > 0.5: 趋势性
   */
  calculateHurstExponent(prices: number[], maxLag: number = 20): HurstResult | null {
    if (prices.length < maxLag * 2) return null;

    const returns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push(Math.log(prices[i] / prices[i - 1]));
    }

    const lags: number[] = [];
    const rescaledRanges: number[] = [];

    for (let lag = 10; lag <= maxLag && lag < returns.length / 2; lag++) {
      const chunks = Math.floor(returns.length / lag);
      let totalRS = 0;

      for (let c = 0; c < chunks; c++) {
        const chunk = returns.slice(c * lag, (c + 1) * lag);
        const mean = chunk.reduce((a, b) => a + b, 0) / chunk.length;

        // Cumulative deviations
        let cumDev = 0;
        let maxCum = -Infinity;
        let minCum = Infinity;

        for (const val of chunk) {
          cumDev += val - mean;
          maxCum = Math.max(maxCum, cumDev);
          minCum = Math.min(minCum, cumDev);
        }

        const range = maxCum - minCum;
        const std = Math.sqrt(chunk.reduce((sum, v) => sum + (v - mean) ** 2, 0) / chunk.length);

        if (std > 0) {
          totalRS += range / std;
        }
      }

      lags.push(lag);
      rescaledRanges.push(totalRS / chunks);
    }

    if (lags.length < 2) return null;

    // Linear regression of log(R/S) on log(lag)
    const logLags = lags.map(l => Math.log(l));
    const logRS = rescaledRanges.map(r => Math.log(Math.max(r, 1e-10)));

    const { slope } = this.linearRegression(logLags, logRS);
    const exponent = Math.max(0, Math.min(1, slope));

    let interpretation: 'trending' | 'mean_reverting' | 'random_walk';
    if (exponent < 0.45) interpretation = 'mean_reverting';
    else if (exponent > 0.55) interpretation = 'trending';
    else interpretation = 'random_walk';

    const confidence = Math.min(1, Math.abs(exponent - 0.5) * 4);

    return { exponent, interpretation, confidence, lags, rescaledRanges };
  }

  /**
   * Half-Life of Mean Reversion - 均值回归半衰期
   */
  calculateHalfLife(prices: number[]): HalfLifeResult | null {
    if (prices.length < 10) return null;

    // Δy(t) = α + β*y(t-1) + ε
    const y = prices.slice(1);
    const yLag = prices.slice(0, -1);

    const { slope, intercept, rSquared } = this.linearRegression(yLag, y);

    // half-life = -ln(2) / β
    const halfLife = slope >= 0 ? Infinity : -Math.log(2) / slope;

    // ADF-like test statistic
    const adfStatistic = this.computeADFStatistic(y, yLag, slope);

    // Simple stationary test: |β| should be significant and negative
    const isStationary = slope < 0 && Math.abs(slope) > 0.05;

    return {
      halfLife: isFinite(halfLife) ? Math.round(halfLife) : 999,
      isValid: isFinite(halfLife) && halfLife > 0,
      lambda: -slope,
      rSquared,
      adfStatistic,
      isStationary
    };
  }

  /**
   * Ornstein-Uhlenbeck 过程参数估计
   */
  estimateOUParams(prices: number[]): OUParams | null {
    if (prices.length < 20) return null;

    // Δp = θ(μ - p(t))Δt + σε
    const dp: number[] = [];
    const pLag: number[] = [];

    for (let i = 1; i < prices.length; i++) {
      dp.push(prices[i] - prices[i - 1]);
      pLag.push(prices[i - 1]);
    }

    // OLS: dp = a + b*pLag + ε
    const { slope: b, intercept: a } = this.linearRegression(pLag, dp);

    // θ = -b, μ = a/θ
    const theta = Math.max(0.001, -b);
    const mu = a / theta;

    // σ = std(dp - θ(μ - pLag))
    const residuals = dp.map((d, i) => d - theta * (mu - pLag[i]));
    const residMean = residuals.reduce((a, b) => a + b, 0) / residuals.length;
    const sigma = Math.sqrt(residuals.reduce((sum, r) => sum + (r - residMean) ** 2, 0) / residuals.length);

    const halfLife = Math.log(2) / theta;
    const stationStd = sigma / Math.sqrt(2 * theta);

    return {
      mu,
      theta,
      sigma,
      halfLife,
      stationaryDistribution: { mean: mu, std: stationStd }
    };
  }

  /**
   * Engle-Granger 协整检验（简化版）
   */
  testCointegration(series1: number[], series2: number[]): CointegrationResult | null {
    const len = Math.min(series1.length, series2.length);
    if (len < 20) return null;

    const s1 = series1.slice(-len);
    const s2 = series2.slice(-len);

    // Step 1: OLS regression s1 = α + β*s2
    const { slope: hedgeRatio, intercept } = this.linearRegression(s2, s1);

    // Step 2: Calculate spread (residuals)
    const spread = s1.map((v, i) => v - (intercept + hedgeRatio * s2[i]));

    // Step 3: ADF test on spread
    const spreadY = spread.slice(1);
    const spreadLag = spread.slice(0, -1);
    const { slope: adfSlope, rSquared } = this.linearRegression(spreadLag, spreadY);
    const adfStatistic = adfSlope / this.stdError(spreadLag, spreadY, adfSlope);

    // Half-life
    const halfLife = adfSlope >= 0 ? Infinity : -Math.log(2) / adfSlope;

    // Simple p-value estimation (rough)
    const isCointegrated = adfStatistic < -2.58 && adfSlope < 0;

    const spreadMean = spread.reduce((a, b) => a + b, 0) / spread.length;
    const spreadStd = this.std(spread);
    const currentZScore = spreadStd === 0 ? 0 : (spread[spread.length - 1] - spreadMean) / spreadStd;

    return {
      isCointegrated,
      hedgeRatio,
      spread,
      spreadMean,
      spreadStd,
      currentSpreadZScore: currentZScore,
      adfStatistic,
      halfLife: isFinite(halfLife) ? Math.round(halfLife) : 999,
      pValue: this.estimatePValue(adfStatistic)
    };
  }

  /**
   * 综合均值回归信号
   */
  generateSignal(prices: number[], period: number = 20): MeanReversionSignal | null {
    if (prices.length < period * 2) return null;

    const zScoreResult = this.calculateZScore(prices, period);
    const hurstResult = this.calculateHurstExponent(prices, Math.min(20, Math.floor(prices.length / 3)));
    const halfLifeResult = this.calculateHalfLife(prices);

    if (!zScoreResult || !hurstResult || !halfLifeResult) return null;

    const reasons: string[] = [];
    let signal: 'buy' | 'sell' | 'hold' = 'hold';
    let strength = 0;

    // Z-Score contribution
    if (zScoreResult.zScore < -2) {
      strength += 0.4;
      reasons.push(`Z-Score极度偏低(${zScoreResult.zScore.toFixed(2)})`);
      signal = 'buy';
    } else if (zScoreResult.zScore < -1) {
      strength += 0.2;
      reasons.push(`Z-Score偏低(${zScoreResult.zScore.toFixed(2)})`);
    } else if (zScoreResult.zScore > 2) {
      strength += 0.4;
      reasons.push(`Z-Score极度偏高(${zScoreResult.zScore.toFixed(2)})`);
      signal = 'sell';
    } else if (zScoreResult.zScore > 1) {
      strength += 0.2;
      reasons.push(`Z-Score偏高(${zScoreResult.zScore.toFixed(2)})`);
    }

    // Hurst exponent contribution
    if (hurstResult.interpretation === 'mean_reverting') {
      strength += 0.3;
      reasons.push(`均值回归特征明显(H=${hurstResult.exponent.toFixed(3)})`);
    } else if (hurstResult.interpretation === 'trending') {
      strength -= 0.2;
      reasons.push(`趋势性强(H=${hurstResult.exponent.toFixed(3)})，不宜均值回归`);
    }

    // Half-life contribution
    if (halfLifeResult.isValid && halfLifeResult.halfLife > 0 && halfLifeResult.halfLife < 30) {
      strength += 0.3;
      reasons.push(`半衰期适中(${halfLifeResult.halfLife}天)`);
    } else if (halfLifeResult.halfLife > 60) {
      strength -= 0.1;
      reasons.push(`半衰期过长(${halfLifeResult.halfLife}天)`);
    }

    // Stationarity
    if (halfLifeResult.isStationary) {
      strength += 0.1;
      reasons.push('序列平稳性确认');
    }

    strength = Math.max(0, Math.min(1, strength));

    if (signal === 'hold' && strength > 0.5) {
      signal = zScoreResult.zScore < 0 ? 'buy' : 'sell';
    }

    return {
      symbol: '',
      signal,
      strength,
      zScore: zScoreResult.zScore,
      halfLife: halfLifeResult.halfLife,
      hurst: hurstResult.exponent,
      reasons
    };
  }

  /**
   * 滚动窗口均值回归分析
   */
  rollingAnalysis(prices: number[], window: number = 60, step: number = 5): RollingMeanReversion | null {
    if (prices.length < window) return null;

    const periods: RollingMeanReversion['periods'] = [];

    for (let i = window; i <= prices.length; i += step) {
      const windowPrices = prices.slice(i - window, i);
      const zResult = this.calculateZScore(windowPrices, window);
      const hurstResult = this.calculateHurstExponent(windowPrices, Math.min(15, Math.floor(window / 3)));
      const hlResult = this.calculateHalfLife(windowPrices);

      if (zResult && hurstResult && hlResult) {
        periods.push({
          endIndex: i - 1,
          zScore: zResult.zScore,
          hurst: hurstResult.exponent,
          halfLife: hlResult.halfLife,
          isReverting: hurstResult.exponent < 0.5
        });
      }
    }

    return { window, periods };
  }

  /**
   * 配对交易价差分析
   */
  analyzePairSpread(series1: number[], series2: number[]): {
    cointegration: CointegrationResult | null;
    entrySignals: Array<{ index: number; action: 'long_spread' | 'short_spread'; zScore: number }>;
    exitSignals: Array<{ index: number; zScore: number }>;
  } {
    const cointegration = this.testCointegration(series1, series2);
    const entrySignals: Array<{ index: number; action: 'long_spread' | 'short_spread'; zScore: number }> = [];
    const exitSignals: Array<{ index: number; zScore: number }> = [];

    if (!cointegration || !cointegration.isCointegrated) {
      return { cointegration, entrySignals, exitSignals };
    }

    const { spread, spreadMean, spreadStd } = cointegration;
    let inPosition = false;

    for (let i = 0; i < spread.length; i++) {
      const z = spreadStd === 0 ? 0 : (spread[i] - spreadMean) / spreadStd;

      if (!inPosition) {
        if (z < -2) {
          entrySignals.push({ index: i, action: 'long_spread', zScore: z });
          inPosition = true;
        } else if (z > 2) {
          entrySignals.push({ index: i, action: 'short_spread', zScore: z });
          inPosition = true;
        }
      } else {
        if (Math.abs(z) < 0.5) {
          exitSignals.push({ index: i, zScore: z });
          inPosition = false;
        }
      }
    }

    return { cointegration, entrySignals, exitSignals };
  }

  // --- Utility Methods ---

  private linearRegression(x: number[], y: number[]): { slope: number; intercept: number; rSquared: number } {
    const n = x.length;
    if (n === 0) return { slope: 0, intercept: 0, rSquared: 0 };

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);

    const denom = n * sumX2 - sumX * sumX;
    if (denom === 0) return { slope: 0, intercept: sumY / n, rSquared: 0 };

    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;

    // R-squared
    const yMean = sumY / n;
    const ssTotal = y.reduce((sum, yi) => sum + (yi - yMean) ** 2, 0);
    const ssRes = y.reduce((sum, yi, i) => sum + (yi - (intercept + slope * x[i])) ** 2, 0);
    const rSquared = ssTotal === 0 ? 0 : 1 - ssRes / ssTotal;

    return { slope, intercept, rSquared };
  }

  private std(data: number[]): number {
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    return Math.sqrt(data.reduce((sum, v) => sum + (v - mean) ** 2, 0) / data.length);
  }

  private stdError(x: number[], y: number[], slope: number): number {
    const residuals = y.map((yi, i) => yi - slope * x[i]);
    const se = this.std(residuals);
    const xVar = this.std(x);
    return xVar === 0 ? 1 : se / (xVar * Math.sqrt(x.length));
  }

  private computeADFStatistic(y: number[], yLag: number[], slope: number): number {
    const se = this.stdError(yLag, y, slope);
    return slope / se;
  }

  private estimatePValue(stat: number): number {
    // Rough approximation
    if (stat < -3.43) return 0.01;
    if (stat < -2.86) return 0.05;
    if (stat < -2.57) return 0.10;
    return 0.25;
  }
}

export default new MeanReversionEngine();
