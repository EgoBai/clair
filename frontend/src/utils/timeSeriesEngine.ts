/**
 * 时间序列分析引擎
 * 支持: ARIMA简化、季节性分解、趋势预测、异常检测
 */

export interface TimeSeriesPoint {
  date: number;
  value: number;
}

export interface SeasonalDecomposition {
  trend: number[];
  seasonal: number[];
  residual: number[];
  seasonalStrength: number;
  trendStrength: number;
}

export interface ARIMAResult {
  coefficients: number[];
  predictions: number[];
  residuals: number[];
  aic: number;
  mse: number;
  order: [number, number, number]; // p, d, q
}

export interface AnomalyPoint {
  index: number;
  value: number;
  expectedValue: number;
  zScore: number;
  type: 'spike' | 'dip' | 'level_shift' | 'variance_change';
}

export interface ForecastResult {
  predictions: number[];
  confidenceUpper: number[];
  confidenceLower: number[];
  horizon: number;
}

/**
 * 移动平均分解 (趋势+季节+残差)
 */
export function seasonalDecompose(
  series: number[],
  period: number = 5 // 交易周
): SeasonalDecomposition {
  const n = series.length;
  if (n < period * 2) {
    return {
      trend: [...series],
      seasonal: new Array(n).fill(0),
      residual: new Array(n).fill(0),
      seasonalStrength: 0,
      trendStrength: 0
    };
  }

  // 趋势: 中心移动平均
  const trend: number[] = new Array(n).fill(0);
  const halfPeriod = Math.floor(period / 2);

  for (let i = halfPeriod; i < n - halfPeriod; i++) {
    let sum = 0;
    for (let j = i - halfPeriod; j <= i + halfPeriod; j++) {
      sum += series[j];
    }
    trend[i] = sum / (period + 1);
  }

  // 边缘填充
  for (let i = 0; i < halfPeriod; i++) {
    trend[i] = trend[halfPeriod];
    trend[n - 1 - i] = trend[n - 1 - halfPeriod];
  }

  // 去趋势
  const detrended = series.map((v, i) => v - trend[i]);

  // 季节性: 同期平均
  const seasonalAvg: number[] = new Array(period).fill(0);
  const seasonalCount: number[] = new Array(period).fill(0);

  for (let i = 0; i < n; i++) {
    const idx = i % period;
    seasonalAvg[idx] += detrended[i];
    seasonalCount[idx]++;
  }

  for (let i = 0; i < period; i++) {
    seasonalAvg[i] = seasonalCount[i] > 0 ? seasonalAvg[i] / seasonalCount[i] : 0;
  }

  // 使季节分量和为0
  const seasonMean = seasonalAvg.reduce((a, b) => a + b, 0) / period;
  for (let i = 0; i < period; i++) {
    seasonalAvg[i] -= seasonMean;
  }

  // 扩展季节分量
  const seasonal = series.map((_, i) => seasonalAvg[i % period]);

  // 残差
  const residual = series.map((v, i) => v - trend[i] - seasonal[i]);

  // 强度指标
  const seriesVariance = variance(series);
  const residualVariance = variance(residual);
  const trendVariance = variance(trend);

  const seasonalStrength = seriesVariance > 0
    ? 1 - residualVariance / seriesVariance
    : 0;
  const trendStrength = seriesVariance > 0
    ? trendVariance / seriesVariance
    : 0;

  return { trend, seasonal, residual, seasonalStrength, trendStrength };
}

/**
 * 简化AR预测 (AR(p))
 */
export function autoRegressive(
  series: number[],
  order: number = 2,
  horizon: number = 5
): ForecastResult {
  const n = series.length;
  if (n < order + 1) {
    const last = series[n - 1] ?? 0;
    return {
      predictions: new Array(horizon).fill(last),
      confidenceUpper: new Array(horizon).fill(last),
      confidenceLower: new Array(horizon).fill(last),
      horizon
    };
  }

  // 差分
  const diff: number[] = [];
  for (let i = 1; i < n; i++) {
    diff.push(series[i] - series[i - 1]);
  }

  // 拟合AR(p) 使用Yule-Walker
  const coefficients = yuleWalker(diff, order);

  // 预测
  const predictions: number[] = [];
  const diffHistory = [...diff];

  for (let h = 0; h < horizon; h++) {
    let pred = 0;
    for (let i = 0; i < order && i < diffHistory.length; i++) {
      pred += coefficients[i] * diffHistory[diffHistory.length - 1 - i];
    }
    diffHistory.push(pred);
    predictions.push(series[series.length - 1] + predictions.reduce((a, b) => a + b, 0) + pred);
  }

  // 置信区间 (简化)
  const std = Math.sqrt(variance(diff)) * Math.sqrt(1 + horizon * 0.1);
  const confidenceUpper = predictions.map(p => p + 1.96 * std);
  const confidenceLower = predictions.map(p => p - 1.96 * std);

  return { predictions, confidenceUpper, confidenceLower, horizon };
}

/**
 * 异常检测 (基于滚动Z-Score)
 */
export function detectAnomalies(
  series: number[],
  windowSize: number = 20,
  threshold: number = 3.0
): AnomalyPoint[] {
  const n = series.length;
  if (n < windowSize) return [];

  const anomalies: AnomalyPoint[] = [];

  for (let i = windowSize; i < n; i++) {
    const window = series.slice(i - windowSize, i);
    const mean = window.reduce((a, b) => a + b, 0) / windowSize;
    const std = Math.sqrt(window.reduce((a, v) => a + (v - mean) ** 2, 0) / (windowSize - 1));

    if (std < 1e-10) continue;

    const zScore = (series[i] - mean) / std;

    if (Math.abs(zScore) > threshold) {
      // 检测类型
      let type: AnomalyPoint['type'] = zScore > 0 ? 'spike' : 'dip';

      // 检测水平漂移
      if (i >= windowSize * 2) {
        const prevWindow = series.slice(i - windowSize * 2, i - windowSize);
        const prevMean = prevWindow.reduce((a, b) => a + b, 0) / prevWindow.length;
        if (Math.abs(mean - prevMean) > std * 2) {
          type = 'level_shift';
        }
      }

      anomalies.push({
        index: i,
        value: series[i],
        expectedValue: mean,
        zScore,
        type
      });
    }
  }

  return anomalies;
}

/**
 * 趋势预测 (线性+二次外推)
 */
export function trendForecast(
  series: number[],
  horizon: number = 10
): ForecastResult {
  const n = series.length;
  if (n < 3) {
    const last = series[n - 1] ?? 0;
    return {
      predictions: new Array(horizon).fill(last),
      confidenceUpper: new Array(horizon).fill(last),
      confidenceLower: new Array(horizon).fill(last),
      horizon
    };
  }

  // 二次回归
  const { a, b, c } = quadraticRegression(series);

  const predictions: number[] = [];
  for (let h = 1; h <= horizon; h++) {
    const x = n + h - 1;
    predictions.push(a * x * x + b * x + c);
  }

  // 置信区间
  const residuals: number[] = [];
  for (let i = 0; i < n; i++) {
    const predicted = a * i * i + b * i + c;
    residuals.push(series[i] - predicted);
  }
  const std = Math.sqrt(residuals.reduce((a, r) => a + r * r, 0) / (n - 3));

  const confidenceUpper = predictions.map((p, h) => p + 1.96 * std * Math.sqrt(1 + h * 0.1));
  const confidenceLower = predictions.map((p, h) => p - 1.96 * std * Math.sqrt(1 + h * 0.1));

  return { predictions, confidenceUpper, confidenceLower, horizon };
}

/**
 * 变点检测 (CUSUM)
 */
export function detectChangePoints(
  series: number[],
  threshold: number = 5.0
): number[] {
  const n = series.length;
  if (n < 10) return [];

  const mean = series.reduce((a, b) => a + b, 0) / n;
  const std = Math.sqrt(series.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1));

  if (std < 1e-10) return [];

  const changePoints: number[] = [];
  let cusumPos = 0;
  let cusumNeg = 0;

  for (let i = 0; i < n; i++) {
    const normalized = (series[i] - mean) / std;
    cusumPos = Math.max(0, cusumPos + normalized - 0.5);
    cusumNeg = Math.max(0, cusumNeg - normalized - 0.5);

    if (cusumPos > threshold || cusumNeg > threshold) {
      changePoints.push(i);
      cusumPos = 0;
      cusumNeg = 0;
    }
  }

  return changePoints;
}

// ===== Helpers =====

function variance(arr: number[]): number {
  const n = arr.length;
  if (n < 2) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / n;
  return arr.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1);
}

function yuleWalker(series: number[], order: number): number[] {
  const n = series.length;
  const mean = series.reduce((a, b) => a + b, 0) / n;

  // 自协方差
  const acf: number[] = [];
  for (let k = 0; k <= order; k++) {
    let sum = 0;
    for (let i = 0; i < n - k; i++) {
      sum += (series[i] - mean) * (series[i + k] - mean);
    }
    acf.push(sum / n);
  }

  // Yule-Walker方程 (简化: 只用ACF)
  const coefficients: number[] = [];
  if (acf[0] > 1e-10) {
    for (let i = 1; i <= order && i < acf.length; i++) {
      coefficients.push(acf[i] / acf[0]);
    }
  }

  // 填充到order长度
  while (coefficients.length < order) {
    coefficients.push(0);
  }

  return coefficients;
}

function quadraticRegression(series: number[]): { a: number; b: number; c: number } {
  const n = series.length;
  if (n < 3) return { a: 0, b: 0, c: series[0] ?? 0 };

  // 简化: 使用普通最小二乘法
  let sumX = 0, sumY = 0, sumX2 = 0, sumX3 = 0, sumX4 = 0, sumXY = 0, sumX2Y = 0;

  for (let i = 0; i < n; i++) {
    const x = i;
    const y = series[i];
    sumX += x;
    sumY += y;
    sumX2 += x * x;
    sumX3 += x * x * x;
    sumX4 += x * x * x * x;
    sumXY += x * y;
    sumX2Y += x * x * y;
  }

  // 解正规方程 (简化)
  const meanX = sumX / n;
  const meanY = sumY / n;

  // 线性回归作为基础
  const denom = n * sumX2 - sumX * sumX;
  const b = Math.abs(denom) > 1e-10 ? (n * sumXY - sumX * sumY) / denom : 0;
  const c = meanY - b * meanX;

  // 二次项估计 (简化)
  let a = 0;
  for (let i = 0; i < n; i++) {
    const predicted = b * i + c;
    a += (series[i] - predicted) * (i - meanX) * (i - meanX);
  }
  a = n * sumX4 > 0 ? a / (n * sumX4) : 0;
  a *= 0.001; // 缩小二次项

  return { a, b, c };
}
