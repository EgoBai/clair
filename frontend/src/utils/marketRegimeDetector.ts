/**
 * 市场状态识别引擎
 * 使用HMM启发式方法检测: 牛市/熊市/震荡市
 * 基于: 趋势强度、波动率聚类、动量指标、成交量特征
 */

export type MarketRegime = 'bull' | 'bear' | 'sideways';

export interface RegimeDetectionResult {
  regime: MarketRegime;
  confidence: number; // 0-1
  metrics: RegimeMetrics;
  transitions: RegimeTransition[];
}

export interface RegimeMetrics {
  trendStrength: number; // -1 to 1
  volatilityRegime: 'low' | 'medium' | 'high';
  momentumScore: number; // -1 to 1
  volumeConfirmation: boolean;
  adx: number; // Average Directional Index
  hurstExponent: number;
}

export interface RegimeTransition {
  from: MarketRegime;
  to: MarketRegime;
  date: number; // index
  strength: number;
}

export interface PriceData {
  close: number;
  high: number;
  low: number;
  volume: number;
  date?: number;
}

/**
 * 检测市场状态 (内部, 不含状态转换)
 */
function detectRegimeInternal(
  data: PriceData[],
  lookback: number = 60
): { regime: MarketRegime; confidence: number; metrics: RegimeMetrics } {
  if (data.length < lookback) {
    return {
      regime: 'sideways',
      confidence: 0,
      metrics: {
        trendStrength: 0,
        volatilityRegime: 'medium',
        momentumScore: 0,
        volumeConfirmation: false,
        adx: 0,
        hurstExponent: 0.5
      }
    };
  }

  const closes = data.map(d => d.close);
  const highs = data.map(d => d.high);
  const lows = data.map(d => d.low);
  const volumes = data.map(d => d.volume);

  const trendStrength = calculateTrendStrength(closes, lookback);
  const volatilityRegime = classifyVolatility(closes, lookback);
  const momentumScore = calculateMomentumScore(closes, lookback);
  const adx = calculateADX(highs, lows, closes, lookback);
  const hurstExponent = calculateHurst(closes.slice(-lookback));
  const volumeConfirmation = checkVolumeConfirmation(closes, volumes, lookback);

  const regime = classifyRegime(trendStrength, momentumScore, adx, hurstExponent);
  const confidence = calculateConfidence(trendStrength, adx, hurstExponent, volumeConfirmation);

  return {
    regime,
    confidence,
    metrics: {
      trendStrength,
      volatilityRegime,
      momentumScore,
      volumeConfirmation,
      adx,
      hurstExponent
    }
  };
}

/**
 * 检测市场状态 (公开API, 含状态转换)
 */
export function detectMarketRegime(
  data: PriceData[],
  lookback: number = 60
): RegimeDetectionResult {
  const { regime, confidence, metrics } = detectRegimeInternal(data, lookback);

  // 检测状态转换点 (使用内部函数避免递归)
  const transitions = detectTransitions(data, lookback);

  return {
    regime,
    confidence,
    metrics,
    transitions
  };
}

/**
 * 滚动窗口状态检测
 */
export function rollingRegimeDetection(
  data: PriceData[],
  windowSize: number = 60,
  stepSize: number = 20
): { index: number; regime: MarketRegime; confidence: number }[] {
  const results: { index: number; regime: MarketRegime; confidence: number }[] = [];

  for (let i = windowSize; i <= data.length; i += stepSize) {
    const window = data.slice(i - windowSize, i);
    const result = detectRegimeInternal(window, windowSize);
    results.push({
      index: i - 1,
      regime: result.regime,
      confidence: result.confidence
    });
  }

  return results;
}

/**
 * 趋势强度: 基于线性回归斜率和R²
 */
function calculateTrendStrength(closes: number[], lookback: number): number {
  const recent = closes.slice(-lookback);
  const n = recent.length;
  if (n < 2) return 0;

  const x = Array.from({ length: n }, (_, i) => i);
  const { slope, rSquared } = linearRegression(x, recent);

  // 标准化斜率
  const meanPrice = recent.reduce((a, b) => a + b, 0) / n;
  const normalizedSlope = (slope * n) / meanPrice;

  // 用R²加权
  return Math.max(-1, Math.min(1, normalizedSlope * 10 * rSquared));
}

/**
 * 波动率分类
 */
function classifyVolatility(closes: number[], lookback: number): 'low' | 'medium' | 'high' {
  const returns: number[] = [];
  for (let i = Math.max(1, closes.length - lookback); i < closes.length; i++) {
    if (closes[i - 1] > 0) returns.push(Math.log(closes[i] / closes[i - 1]));
  }

  if (returns.length < 2) return 'medium';

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / (returns.length - 1);
  const annualizedVol = Math.sqrt(variance * 252);

  if (annualizedVol < 0.15) return 'low';
  if (annualizedVol > 0.30) return 'high';
  return 'medium';
}

/**
 * 动量得分: 综合短中长期动量
 */
function calculateMomentumScore(closes: number[], lookback: number): number {
  const n = closes.length;
  if (n < 2) return 0;

  const shortPeriod = Math.min(10, lookback);
  const midPeriod = Math.min(30, lookback);
  const longPeriod = lookback;

  const shortMom = n > shortPeriod ? (closes[n - 1] - closes[n - 1 - shortPeriod]) / closes[n - 1 - shortPeriod] : 0;
  const midMom = n > midPeriod ? (closes[n - 1] - closes[n - 1 - midPeriod]) / closes[n - 1 - midPeriod] : 0;
  const longMom = n > longPeriod ? (closes[n - 1] - closes[n - 1 - longPeriod]) / closes[n - 1 - longPeriod] : 0;

  // 加权: 短期0.5, 中期0.3, 长期0.2
  const score = shortMom * 0.5 + midMom * 0.3 + longMom * 0.2;
  return Math.max(-1, Math.min(1, score * 10));
}

/**
 * ADX (Average Directional Index)
 */
function calculateADX(highs: number[], lows: number[], closes: number[], period: number): number {
  const n = closes.length;
  if (n < period + 1) return 0;

  const start = Math.max(1, n - period * 2);

  let sumPlusDI = 0;
  let sumMinusDI = 0;
  let count = 0;

  for (let i = start + 1; i < n; i++) {
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];

    const plusDM = upMove > downMove && upMove > 0 ? upMove : 0;
    const minusDM = downMove > upMove && downMove > 0 ? downMove : 0;

    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );

    if (tr > 0) {
      sumPlusDI += (plusDM / tr) * 100;
      sumMinusDI += (minusDM / tr) * 100;
      count++;
    }
  }

  if (count === 0) return 0;

  const plusDI = sumPlusDI / count;
  const minusDI = sumMinusDI / count;
  const diSum = plusDI + minusDI;

  if (diSum === 0) return 0;
  return Math.abs(plusDI - minusDI) / diSum * 100;
}

/**
 * Hurst指数 (简化版)
 */
function calculateHurst(prices: number[]): number {
  if (prices.length < 20) return 0.5;

  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0) returns.push(Math.log(prices[i] / prices[i - 1]));
  }

  const lags: number[] = [];
  const rsValues: number[] = [];

  for (let lag = 5; lag <= 20 && lag < returns.length / 2; lag++) {
    const chunks = Math.floor(returns.length / lag);
    let totalRS = 0;

    for (let c = 0; c < chunks; c++) {
      const chunk = returns.slice(c * lag, (c + 1) * lag);
      const mean = chunk.reduce((a, b) => a + b, 0) / chunk.length;

      let cumDev = 0;
      let maxC = -Infinity;
      let minC = Infinity;
      for (const v of chunk) {
        cumDev += v - mean;
        maxC = Math.max(maxC, cumDev);
        minC = Math.min(minC, cumDev);
      }
      const range = maxC - minC;
      const std = Math.sqrt(chunk.reduce((a, v) => a + (v - mean) ** 2, 0) / chunk.length);

      if (std > 1e-10) totalRS += range / std;
    }

    lags.push(Math.log(lag));
    rsValues.push(Math.log(totalRS / chunks));
  }

  if (lags.length < 2) return 0.5;

  const { slope } = linearRegression(lags, rsValues);
  return Math.max(0, Math.min(1, slope));
}

/**
 * 成交量确认
 */
function checkVolumeConfirmation(closes: number[], volumes: number[], lookback: number): boolean {
  const n = closes.length;
  if (n < 2 || volumes.length < lookback) return false;

  const recentVolumes = volumes.slice(-lookback);
  const avgVolume = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;

  // 趋势方向的成交量确认
  const trend = closes[n - 1] - closes[n - 1 - Math.min(lookback, n - 1)];
  const recentVol = volumes[n - 1];

  if (trend > 0) {
    return recentVol > avgVolume; // 上涨放量
  } else if (trend < 0) {
    return recentVol > avgVolume; // 下跌放量
  }
  return false;
}

/**
 * 综合分类市场状态
 */
function classifyRegime(
  trendStrength: number,
  momentum: number,
  adx: number,
  hurst: number
): MarketRegime {
  // 牛市: 正趋势 + 正动量 + ADX > 25 + Hurst > 0.5
  // 熊市: 负趋势 + 负动量 + ADX > 25
  // 震荡: ADX < 20 或 Hurst < 0.5

  const bullScore =
    (trendStrength > 0.1 ? 1 : 0) +
    (momentum > 0.1 ? 1 : 0) +
    (adx > 25 ? 1 : 0) +
    (hurst > 0.5 ? 1 : 0);

  const bearScore =
    (trendStrength < -0.1 ? 1 : 0) +
    (momentum < -0.1 ? 1 : 0) +
    (adx > 25 ? 1 : 0);

  if (bullScore >= 3) return 'bull';
  if (bearScore >= 2) return 'bear';
  return 'sideways';
}

/**
 * 计算置信度
 */
function calculateConfidence(
  trendStrength: number,
  adx: number,
  hurst: number,
  volumeConfirmation: boolean
): number {
  let score = 0;

  // 趋势强度贡献
  score += Math.abs(trendStrength) * 0.3;

  // ADX贡献
  score += Math.min(adx / 50, 1) * 0.3;

  // Hurst贡献
  score += Math.abs(hurst - 0.5) * 2 * 0.2;

  // 成交量确认
  if (volumeConfirmation) score += 0.2;

  return Math.max(0, Math.min(1, score));
}

/**
 * 检测状态转换点
 */
function detectTransitions(
  data: PriceData[],
  windowSize: number
): RegimeTransition[] {
  const transitions: RegimeTransition[] = [];
  const stepSize = Math.max(10, Math.floor(windowSize / 3));

  let currentRegime: MarketRegime | null = null;

  for (let i = windowSize; i <= data.length; i += stepSize) {
    const window = data.slice(i - windowSize, i);
    const result = detectRegimeInternal(window, windowSize);

    if (currentRegime !== null && result.regime !== currentRegime) {
      transitions.push({
        from: currentRegime,
        to: result.regime,
        date: i - 1,
        strength: result.confidence
      });
    }
    currentRegime = result.regime;
  }

  return transitions;
}

/**
 * 线性回归
 */
function linearRegression(
  x: number[],
  y: number[]
): { slope: number; intercept: number; rSquared: number } {
  const n = Math.min(x.length, y.length);
  if (n < 2) return { slope: 0, intercept: 0, rSquared: 0 };

  const sumX = x.slice(0, n).reduce((a, b) => a + b, 0);
  const sumY = y.slice(0, n).reduce((a, b) => a + b, 0);
  const sumXY = x.slice(0, n).reduce((acc, xi, i) => acc + xi * y[i], 0);
  const sumX2 = x.slice(0, n).reduce((acc, xi) => acc + xi * xi, 0);
  const _sumY2 = y.slice(0, n).reduce((acc, yi) => acc + yi * yi, 0);

  const denom = n * sumX2 - sumX * sumX;
  if (Math.abs(denom) < 1e-10) return { slope: 0, intercept: sumY / n, rSquared: 0 };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  // R²
  const ssRes = y.slice(0, n).reduce((acc, yi, i) => {
    const predicted = slope * x[i] + intercept;
    return acc + (yi - predicted) ** 2;
  }, 0);
  const meanY = sumY / n;
  const ssTot = y.slice(0, n).reduce((acc, yi) => acc + (yi - meanY) ** 2, 0);

  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  return { slope, intercept, rSquared: Math.max(0, rSquared) };
}
