/**
 * 技术指标计算模块
 * 实现 MA、MACD、KDJ、RSI、布林带等技术指标的计算
 */

export interface OHLCV {
  tradeDate: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
}

export interface TechnicalIndicatorResult {
  tradeDate: string;
  ma5?: number;
  ma10?: number;
  ma20?: number;
  ma60?: number;
  rsi?: number;
  macd?: number;
  macdSignal?: number;
  macdHistogram?: number;
  kdjK?: number;
  kdjD?: number;
  kdjJ?: number;
  bollUpper?: number;
  bollMiddle?: number;
  bollLower?: number;
}

/**
 * 移动平均线 (MA)
 */
export function calculateMA(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += data[i - j];
      }
      result.push(parseFloat((sum / period).toFixed(4)));
    }
  }
  return result;
}

/**
 * 指数移动平均线 (EMA)
 */
export function calculateEMA(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  const multiplier = 2 / (period + 1);

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else if (i === period - 1) {
      // 第一个EMA值使用SMA
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += data[i - j];
      }
      result.push(parseFloat((sum / period).toFixed(4)));
    } else {
      const prevEMA = result[i - 1]!;
      const ema = (data[i] - prevEMA) * multiplier + prevEMA;
      result.push(parseFloat(ema.toFixed(4)));
    }
  }
  return result;
}

/**
 * MACD 指标
 * 返回 { macd, signal, histogram }
 */
export function calculateMACD(
  data: number[],
  shortPeriod: number = 12,
  longPeriod: number = 26,
  signalPeriod: number = 9
): { macd: (number | null)[]; signal: (number | null)[]; histogram: (number | null)[] } {
  const emaShort = calculateEMA(data, shortPeriod);
  const emaLong = calculateEMA(data, longPeriod);

  // MACD线 = 短期EMA - 长期EMA
  const macd: (number | null)[] = [];
  for (let i = 0; i < data.length; i++) {
    if (emaShort[i] === null || emaLong[i] === null) {
      macd.push(null);
    } else {
      macd.push(parseFloat((emaShort[i]! - emaLong[i]!).toFixed(4)));
    }
  }

  // 信号线 = MACD的EMA
  const macdValues = macd.map(v => v ?? 0);
  const signalRaw = calculateEMA(macdValues, signalPeriod);
  const signal: (number | null)[] = signalRaw.map((v, i) => {
    if (macd[i] === null) return null;
    return v;
  });

  // 柱状图 = MACD - 信号线
  const histogram: (number | null)[] = [];
  for (let i = 0; i < data.length; i++) {
    if (macd[i] === null || signal[i] === null) {
      histogram.push(null);
    } else {
      histogram.push(parseFloat((macd[i]! - signal[i]!).toFixed(4)));
    }
  }

  return { macd, signal, histogram };
}

/**
 * RSI 指标
 */
export function calculateRSI(data: number[], period: number = 14): (number | null)[] {
  const result: (number | null)[] = [];
  const gains: number[] = [];
  const losses: number[] = [];

  // 计算价格变化
  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      gains.push(0);
      losses.push(0);
    } else {
      const change = data[i] - data[i - 1];
      gains.push(change > 0 ? change : 0);
      losses.push(change < 0 ? Math.abs(change) : 0);
    }
  }

  for (let i = 0; i < data.length; i++) {
    if (i < period) {
      result.push(null);
    } else {
      let avgGain = 0;
      let avgLoss = 0;

      if (i === period) {
        // 首次计算使用简单平均
        for (let j = 1; j <= period; j++) {
          avgGain += gains[i - period + j];
          avgLoss += losses[i - period + j];
        }
        avgGain /= period;
        avgLoss /= period;
      } else {
        // 使用平滑方法
        const prevAvgGain = result[i - 1] !== null
          ? (100 / (100 - result[i - 1]!) - 1) * (result[i - 1]! === 100 ? 0.001 : 1)
          : 0;
        const prevAvgLoss = result[i - 1] !== null
          ? (100 / result[i - 1]! - 1) * prevAvgGain
          : 0;

        avgGain = ((prevAvgGain || 0) * (period - 1) + gains[i]) / period;
        avgLoss = ((prevAvgLoss || 0) * (period - 1) + losses[i]) / period;
      }

      if (avgLoss === 0) {
        result.push(100);
      } else {
        const rs = avgGain / avgLoss;
        result.push(parseFloat((100 - (100 / (1 + rs))).toFixed(4)));
      }
    }
  }

  return result;
}

/**
 * KDJ 指标
 */
export function calculateKDJ(
  highData: number[],
  lowData: number[],
  closeData: number[],
  period: number = 9,
  smoothK: number = 3,
  smoothD: number = 3
): { k: (number | null)[]; d: (number | null)[]; j: (number | null)[] } {
  const rsv: (number | null)[] = [];
  const k: (number | null)[] = [];
  const d: (number | null)[] = [];
  const j: (number | null)[] = [];

  for (let i = 0; i < closeData.length; i++) {
    if (i < period - 1) {
      rsv.push(null);
      k.push(null);
      d.push(null);
      j.push(null);
      continue;
    }

    // 计算周期内最高价和最低价
    let highest = highData[i];
    let lowest = lowData[i];
    for (let j = 0; j < period; j++) {
      highest = Math.max(highest, highData[i - j]);
      lowest = Math.min(lowest, lowData[i - j]);
    }

    // RSV = (收盘价 - 最低价) / (最高价 - 最低价) * 100
    let rsvValue: number;
    if (highest === lowest) {
      rsvValue = 50;
    } else {
      rsvValue = ((closeData[i] - lowest) / (highest - lowest)) * 100;
    }
    rsv.push(parseFloat(rsvValue.toFixed(4)));

    // K = 2/3 * 前一日K + 1/3 * RSV
    let kValue: number;
    if (i === period - 1) {
      kValue = 50; // 初始K值
    } else {
      kValue = (2 / 3) * (k[i - 1] ?? 50) + (1 / 3) * rsvValue;
    }
    k.push(parseFloat(kValue.toFixed(4)));

    // D = 2/3 * 前一日D + 1/3 * K
    let dValue: number;
    if (i === period - 1) {
      dValue = 50; // 初始D值
    } else {
      dValue = (2 / 3) * (d[i - 1] ?? 50) + (1 / 3) * kValue;
    }
    d.push(parseFloat(dValue.toFixed(4)));

    // J = 3K - 2D
    j.push(parseFloat((3 * kValue - 2 * dValue).toFixed(4)));
  }

  return { k, d, j };
}

/**
 * 布林带 (Bollinger Bands)
 */
export function calculateBollingerBands(
  data: number[],
  period: number = 20,
  multiplier: number = 2
): { upper: (number | null)[]; middle: (number | null)[]; lower: (number | null)[] } {
  const middle = calculateMA(data, period);
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];

  for (let i = 0; i < data.length; i++) {
    if (middle[i] === null) {
      upper.push(null);
      lower.push(null);
      continue;
    }

    // 计算标准差
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += Math.pow(data[i - j] - middle[i]!, 2);
    }
    const stdDev = Math.sqrt(sum / period);

    upper.push(parseFloat((middle[i]! + multiplier * stdDev).toFixed(4)));
    lower.push(parseFloat((middle[i]! - multiplier * stdDev).toFixed(4)));
  }

  return { upper, middle, lower };
}

/**
 * 计算所有技术指标
 */
export function calculateAllIndicators(ohlcvData: OHLCV[]): TechnicalIndicatorResult[] {
  const closePrices = ohlcvData.map(d => d.close);
  const highPrices = ohlcvData.map(d => d.high);
  const lowPrices = ohlcvData.map(d => d.low);

  // 计算各指标
  const ma5 = calculateMA(closePrices, 5);
  const ma10 = calculateMA(closePrices, 10);
  const ma20 = calculateMA(closePrices, 20);
  const ma60 = calculateMA(closePrices, 60);
  const rsi = calculateRSI(closePrices, 14);
  const macdResult = calculateMACD(closePrices);
  const kdjResult = calculateKDJ(highPrices, lowPrices, closePrices);
  const bollResult = calculateBollingerBands(closePrices);

  const results: TechnicalIndicatorResult[] = [];

  for (let i = 0; i < ohlcvData.length; i++) {
    results.push({
      tradeDate: ohlcvData[i].tradeDate,
      ma5: ma5[i] ?? undefined,
      ma10: ma10[i] ?? undefined,
      ma20: ma20[i] ?? undefined,
      ma60: ma60[i] ?? undefined,
      rsi: rsi[i] ?? undefined,
      macd: macdResult.macd[i] ?? undefined,
      macdSignal: macdResult.signal[i] ?? undefined,
      macdHistogram: macdResult.histogram[i] ?? undefined,
      kdjK: kdjResult.k[i] ?? undefined,
      kdjD: kdjResult.d[i] ?? undefined,
      kdjJ: kdjResult.j[i] ?? undefined,
      bollUpper: bollResult.upper[i] ?? undefined,
      bollMiddle: bollResult.middle[i] ?? undefined,
      bollLower: bollResult.lower[i] ?? undefined,
    });
  }

  return results;
}
