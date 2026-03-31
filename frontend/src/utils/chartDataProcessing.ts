/**
 * 图表数据处理工具
 * Chart Data Processing Utilities
 *
 * K线聚合、技术指标预计算、数据降采样
 */

export interface OHLCV {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * 将tick数据聚合为K线
 */
export function aggregateTicksToCandle(
  ticks: Array<{ price: number; volume: number; timestamp: number }>,
  intervalMs: number
): OHLCV[] {
  if (ticks.length === 0) return [];

  const buckets = new Map<number, typeof ticks>();

  for (const tick of ticks) {
    const bucketKey = Math.floor(tick.timestamp / intervalMs) * intervalMs;
    if (!buckets.has(bucketKey)) buckets.set(bucketKey, []);
    buckets.get(bucketKey)!.push(tick);
  }

  const candles: OHLCV[] = [];
  for (const [timestamp, bucketTicks] of buckets) {
    const prices = bucketTicks.map(t => t.price);
    candles.push({
      timestamp,
      open: bucketTicks[0].price,
      high: Math.max(...prices),
      low: Math.min(...prices),
      close: bucketTicks[bucketTicks.length - 1].price,
      volume: bucketTicks.reduce((s, t) => s + t.volume, 0),
    });
  }

  return candles.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * 数据降采样（减少数据点数量）
 */
export function downsampleData<T extends { timestamp: number }>(
  data: T[],
  maxPoints: number
): T[] {
  if (data.length <= maxPoints) return data;

  const step = data.length / maxPoints;
  const result: T[] = [];

  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.round(i * step);
    result.push(data[Math.min(idx, data.length - 1)]);
  }

  return result;
}

/**
 * 计算简单移动平均
 */
export function calculateSMA(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      result.push(sum / period);
    }
  }
  return result;
}

/**
 * 计算EMA
 */
export function calculateEMA(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  const multiplier = 2 / (period + 1);
  let ema: number | null = null;

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else if (i === period - 1) {
      ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
      result.push(ema);
    } else {
      ema = (data[i] - ema!) * multiplier + ema!;
      result.push(ema);
    }
  }
  return result;
}

/**
 * 计算RSI
 */
export function calculateRSI(closes: number[], period: number = 14): (number | null)[] {
  if (closes.length < period + 1) return closes.map(() => null);

  const result: (number | null)[] = [];
  for (let i = 0; i < period; i++) result.push(null);

  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;
  result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  }

  return result;
}

/**
 * 计算布林带
 */
export function calculateBollingerBands(
  closes: number[],
  period: number = 20,
  stdMultiplier: number = 2
): Array<{ upper: number; middle: number; lower: number } | null> {
  const result: Array<{ upper: number; middle: number; lower: number } | null> = [];

  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      const slice = closes.slice(i - period + 1, i + 1);
      const mean = slice.reduce((a, b) => a + b, 0) / period;
      const variance = slice.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / period;
      const std = Math.sqrt(variance);
      result.push({
        upper: mean + stdMultiplier * std,
        middle: mean,
        lower: mean - stdMultiplier * std,
      });
    }
  }

  return result;
}
