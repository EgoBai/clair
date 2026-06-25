/**
 * 未来价值发现 - 工具函数
 * 数据标准化、指标计算、评分归一化
 */

// ==================== 数据标准化 ====================

/**
 * Min-Max 标准化到 [0, 1]
 */
export function normalize(value: number, min: number, max: number): number {
  if (max === min) return 0.5;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

/**
 * Z-Score 标准化
 */
export function zScore(value: number, mean: number, std: number): number {
  if (std === 0) return 0;
  return (value - mean) / std;
}

/**
 * 百分位排名
 */
export function percentileRank(value: number, values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.filter((v) => v < value).length;
  return count / sorted.length;
}

// ==================== 指标计算 ====================

/**
 * 计算移动平均线
 */
export function calcMA(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(data.length).fill(null);
  if (data.length < period) return result;

  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i];
  }
  result[period - 1] = sum / period;

  for (let i = period; i < data.length; i++) {
    sum += data[i] - data[i - period];
    result[i] = sum / period;
  }
  return result;
}

/**
 * 计算RSI
 */
export function calcRSI(closes: number[], period: number = 14): (number | null)[] {
  const result: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return result;

  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}

/**
 * 计算EMA
 */
export function calcEMA(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(data.length).fill(null);
  if (data.length < period) return result;

  const multiplier = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i];
  }
  result[period - 1] = sum / period;

  for (let i = period; i < data.length; i++) {
    result[i] = (data[i] - (result[i - 1] as number)) * multiplier + (result[i - 1] as number);
  }
  return result;
}

/**
 * 计算MACD
 */
export function calcMACD(
  closes: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): { dif: (number | null)[]; dea: (number | null)[]; histogram: (number | null)[] } {
  const fastEMA = calcEMA(closes, fastPeriod);
  const slowEMA = calcEMA(closes, slowPeriod);

  const dif: (number | null)[] = new Array(closes.length).fill(null);
  for (let i = slowPeriod - 1; i < closes.length; i++) {
    if (fastEMA[i] !== null && slowEMA[i] !== null) {
      dif[i] = (fastEMA[i] as number) - (slowEMA[i] as number);
    }
  }

  const difNums = dif.map((v) => v ?? 0);
  const dea = calcEMA(difNums, signalPeriod);

  const deaOffset: (number | null)[] = new Array(closes.length).fill(null);
  const startIdx = slowPeriod - 1 + signalPeriod - 1;
  for (let i = startIdx; i < closes.length; i++) {
    const srcIdx = i - (slowPeriod - 1);
    if (srcIdx >= 0 && dea[srcIdx] !== null) {
      deaOffset[i] = dea[srcIdx];
    }
  }

  const histogram: (number | null)[] = new Array(closes.length).fill(null);
  for (let i = startIdx; i < closes.length; i++) {
    if (dif[i] !== null && deaOffset[i] !== null) {
      histogram[i] = 2 * ((dif[i] as number) - (deaOffset[i] as number));
    }
  }

  return { dif, dea: deaOffset, histogram };
}

/**
 * 计算成交量比率（相对均量）
 */
export function volumeRatio(volumes: number[], period: number = 20): number {
  if (volumes.length < period) return 1;
  const recent = volumes[volumes.length - 1];
  const avgVolume = volumes.slice(-period).reduce((a, b) => a + b, 0) / period;
  return avgVolume === 0 ? 1 : recent / avgVolume;
}

// ==================== 评分归一化 ====================

/**
 * 将PE评分映射到0-100
 * PE越低越好，但过低可能是价值陷阱
 */
export function scorePE(pe: number): number {
  if (pe <= 0 || pe > 200) return 0;
  if (pe < 10) return 90 + (10 - pe);
  if (pe < 20) return 70 + (20 - pe) * 2;
  if (pe < 30) return 50 + (30 - pe) * 2;
  if (pe < 50) return 30 + (50 - pe);
  if (pe < 100) return 10 + (100 - pe) * 0.4;
  return Math.max(0, 10 - (pe - 100) * 0.1);
}

/**
 * 将PB评分映射到0-100
 * PB越低越好
 */
export function scorePB(pb: number): number {
  if (pb <= 0 || pb > 20) return 0;
  if (pb < 1) return 90 + (1 - pb) * 10;
  if (pb < 2) return 70 + (2 - pb) * 20;
  if (pb < 3) return 50 + (3 - pb) * 20;
  if (pb < 5) return 30 + (5 - pb) * 10;
  if (pb < 10) return 10 + (10 - pb) * 4;
  return Math.max(0, 10 - (pb - 10) * 2);
}

/**
 * 将ROE评分映射到0-100
 * ROE越高越好
 */
export function scoreROE(roe: number): number {
  if (roe < 0) return 0;
  if (roe > 30) return 100;
  if (roe > 20) return 80 + (roe - 20);
  if (roe > 15) return 60 + (roe - 15) * 4;
  if (roe > 10) return 40 + (roe - 10) * 4;
  if (roe > 5) return 20 + (roe - 5) * 4;
  return roe * 4;
}

/**
 * 将增长率评分映射到0-100
 * 支持营收增长和利润增长
 */
export function scoreGrowth(growthRate: number): number {
  if (growthRate < -50) return 0;
  if (growthRate < -20) return 10 + (growthRate + 50);
  if (growthRate < 0) return 40 + (growthRate + 20) * 1.5;
  if (growthRate < 20) return 60 + growthRate;
  if (growthRate < 50) return 80 + (growthRate - 20) * 0.67;
  return Math.min(100, 100 + (growthRate - 50) * 0.2);
}

/**
 * 将RSI评分映射到0-100
 * RSI在30-70之间为中性，超卖高分，超买低分
 */
export function scoreRSI(rsi: number): number {
  if (rsi < 20) return 90 + (20 - rsi);
  if (rsi < 30) return 70 + (30 - rsi) * 2;
  if (rsi < 50) return 50 + (50 - rsi);
  if (rsi < 70) return 30 + (70 - rsi);
  if (rsi < 80) return 10 + (80 - rsi) * 2;
  return Math.max(0, 10 - (rsi - 80));
}

/**
 * 将成交量比率评分映射到0-100
 * 适度放量(1.5-3倍)得分最高
 */
export function scoreVolumeRatio(ratio: number): number {
  if (ratio < 0.5) return 20;
  if (ratio < 1) return 30 + (ratio - 0.5) * 80;
  if (ratio < 1.5) return 70 + (ratio - 1) * 60;
  if (ratio < 3) return 100 - (ratio - 1.5) * 20;
  if (ratio < 5) return 70 - (ratio - 3) * 15;
  return Math.max(10, 40 - (ratio - 5) * 5);
}

// ==================== 数据验证 ====================

/**
 * 安全获取数值，无效值返回默认值
 */
export function safeNumber(value: number | undefined | null, defaultValue: number = 0): number {
  if (value === undefined || value === null || isNaN(value) || !isFinite(value)) {
    return defaultValue;
  }
  return value;
}

/**
 * 限制数值在指定范围内
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * 计算简单线性回归斜率
 */
export function linearSlope(data: number[]): number {
  const n = data.length;
  if (n < 2) return 0;

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += data[i];
    sumXY += i * data[i];
    sumX2 += i * i;
  }

  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) return 0;

  return (n * sumXY - sumX * sumY) / denominator;
}

/**
 * 计算数据的波动率
 */
export function volatility(data: number[]): number {
  if (data.length < 2) return 0;
  const mean = data.reduce((a, b) => a + b, 0) / data.length;
  const squaredDiffs = data.map((r) => Math.pow(r - mean, 2));
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / data.length);
}
