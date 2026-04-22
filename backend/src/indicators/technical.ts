/**
 * 技术指标计算模块
 * 对标 TradingView / Bloomberg Terminal 级别技术分析
 * 实现 MA, MACD, KDJ, RSI, 布林带, Ichimoku云图, ADX, ATR, 多时间框架聚合
 */

export interface OHLCV {
  tradeDate: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
}

/** 多时间框架枚举 */
export type Timeframe = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w' | '1M';

/** 指标参数自定义配置 */
export interface IndicatorParams {
  // MA 周期
  maPeriods?: number[];
  // RSI
  rsiPeriod?: number;
  // MACD
  macdShort?: number;
  macdLong?: number;
  macdSignal?: number;
  // KDJ
  kdjPeriod?: number;
  kdjSmoothK?: number;
  kdjSmoothD?: number;
  // 布林带
  bollPeriod?: number;
  bollMultiplier?: number;
  // Ichimoku
  ichimokuTenkan?: number;
  ichimokuKijun?: number;
  ichimokuSenkouB?: number;
  ichimokuDisplacement?: number;
  // ADX
  adxPeriod?: number;
  // ATR
  atrPeriod?: number;
}

/** 默认参数 (TradingView 标准) */
export const DEFAULT_PARAMS: Required<IndicatorParams> = {
  maPeriods: [5, 10, 20, 60],
  rsiPeriod: 14,
  macdShort: 12,
  macdLong: 26,
  macdSignal: 9,
  kdjPeriod: 9,
  kdjSmoothK: 3,
  kdjSmoothD: 3,
  bollPeriod: 20,
  bollMultiplier: 2,
  ichimokuTenkan: 9,
  ichimokuKijun: 26,
  ichimokuSenkouB: 52,
  ichimokuDisplacement: 26,
  adxPeriod: 14,
  atrPeriod: 14,
};

/** Ichimoku 云图结果 */
export interface IchimokuResult {
  tenkanSen: (number | null)[];   // 转换线 (Conversion Line)
  kijunSen: (number | null)[];    // 基准线 (Base Line)
  senkouSpanA: (number | null)[]; // 先行带A (Leading Span A)
  senkouSpanB: (number | null)[]; // 先行带B (Leading Span B)
  chikouSpan: (number | null)[];  // 迟行带 (Lagging Span)
}

/** ADX 结果 */
export interface ADXResult {
  plusDI: (number | null)[];   // +DI 方向指标
  minusDI: (number | null)[];  // -DI 方向指标
  adx: (number | null)[];      // ADX 平均趋向指数
}

/** ATR 结果 */
export interface ATRResult {
  atr: (number | null)[];          // ATR 值
  trueRange: (number | null)[];    // 真实波幅
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
  // 高级指标 (Round 41)
  atr?: number;
  adx?: number;
  plusDI?: number;
  minusDI?: number;
  ichimokuTenkan?: number;
  ichimokuKijun?: number;
  ichimokuSenkouA?: number;
  ichimokuSenkouB?: number;
  ichimokuChikou?: number;
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
 * MACD 指标 (标准实现)
 * MACD Line = EMA(short) - EMA(long)
 * Signal Line = EMA(MACD, signalPeriod)
 * Histogram = MACD - Signal
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

  // 找到第一个非null的MACD值的索引
  const firstValidIndex = macd.findIndex(v => v !== null);
  
  // 信号线 = MACD的EMA，从第一个有效值开始计算
  const signal: (number | null)[] = new Array(data.length).fill(null);
  
  if (firstValidIndex !== -1) {
    // 提取有效的MACD值
    const validMacdValues: number[] = [];
    for (let i = firstValidIndex; i < macd.length; i++) {
      if (macd[i] !== null) {
        validMacdValues.push(macd[i]!);
      }
    }
    
    // 对有效值计算EMA
    const signalRaw = calculateEMA(validMacdValues, signalPeriod);
    
    // 将结果映射回原始数组
    let validIdx = 0;
    for (let i = firstValidIndex; i < data.length; i++) {
      if (macd[i] !== null && validIdx < signalRaw.length) {
        signal[i] = signalRaw[validIdx];
        validIdx++;
      }
    }
  }

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
 * RSI 指标 (Wilder's Smoothing Method)
 * 标准实现：使用Wilder平滑方法维护avgGain/avgLoss
 * RSI = 100 - 100 / (1 + RS), RS = avgGain / avgLoss
 */
export function calculateRSI(data: number[], period: number = 14): (number | null)[] {
  if (data.length < period + 1) {
    return data.map(() => null);
  }

  const result: (number | null)[] = [];

  // 前period个点没有RSI值
  for (let i = 0; i < period; i++) {
    result.push(null);
  }

  // 计算初始平均涨跌幅 (简单平均)
  let sumGain = 0;
  let sumLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = data[i] - data[i - 1];
    if (change > 0) sumGain += change;
    else sumLoss += Math.abs(change);
  }
  let avgGain = sumGain / period;
  let avgLoss = sumLoss / period;

  // 第一个RSI值
  if (avgLoss === 0) {
    result.push(parseFloat('100.0000'));
  } else {
    const rs = avgGain / avgLoss;
    result.push(parseFloat((100 - (100 / (1 + rs))).toFixed(4)));
  }

  // 后续RSI值使用Wilder平滑公式
  // avgGain = (prevAvgGain * (period - 1) + currentGain) / period
  // avgLoss = (prevAvgLoss * (period - 1) + currentLoss) / period
  for (let i = period + 1; i < data.length; i++) {
    const change = data[i] - data[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    if (avgLoss === 0) {
      result.push(parseFloat('100.0000'));
    } else {
      const rs = avgGain / avgLoss;
      result.push(parseFloat((100 - (100 / (1 + rs))).toFixed(4)));
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
 * 计算所有技术指标 (支持自定义参数)
 */
export function calculateAllIndicators(
  ohlcvData: OHLCV[],
  params: IndicatorParams = {}
): TechnicalIndicatorResult[] {
  const p = { ...DEFAULT_PARAMS, ...params };
  const closePrices = ohlcvData.map(d => d.close);
  const highPrices = ohlcvData.map(d => d.high);
  const lowPrices = ohlcvData.map(d => d.low);

  // 计算各指标
  const maResults: Record<string, (number | null)[]> = {};
  for (const period of p.maPeriods) {
    maResults[`ma${period}`] = calculateMA(closePrices, period);
  }

  const rsi = calculateRSI(closePrices, p.rsiPeriod);
  const macdResult = calculateMACD(closePrices, p.macdShort, p.macdLong, p.macdSignal);
  const kdjResult = calculateKDJ(highPrices, lowPrices, closePrices, p.kdjPeriod, p.kdjSmoothK, p.kdjSmoothD);
  const bollResult = calculateBollingerBands(closePrices, p.bollPeriod, p.bollMultiplier);

  // 高级指标 (Round 41)
  const atrResult = calculateATR(highPrices, lowPrices, closePrices, p.atrPeriod);
  const adxResult = calculateADX(highPrices, lowPrices, closePrices, p.adxPeriod);
  const ichimokuResult = calculateIchimoku(highPrices, lowPrices, closePrices, p.ichimokuTenkan, p.ichimokuKijun, p.ichimokuSenkouB, p.ichimokuDisplacement);

  const results: TechnicalIndicatorResult[] = [];

  for (let i = 0; i < ohlcvData.length; i++) {
    const entry: TechnicalIndicatorResult = {
      tradeDate: ohlcvData[i].tradeDate,
      ma5: maResults['ma5']?.[i] ?? undefined,
      ma10: maResults['ma10']?.[i] ?? undefined,
      ma20: maResults['ma20']?.[i] ?? undefined,
      ma60: maResults['ma60']?.[i] ?? undefined,
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
      // 高级指标
      atr: atrResult.atr[i] ?? undefined,
      adx: adxResult.adx[i] ?? undefined,
      plusDI: adxResult.plusDI[i] ?? undefined,
      minusDI: adxResult.minusDI[i] ?? undefined,
      ichimokuTenkan: ichimokuResult.tenkanSen[i] ?? undefined,
      ichimokuKijun: ichimokuResult.kijunSen[i] ?? undefined,
      ichimokuSenkouA: ichimokuResult.senkouSpanA[i] ?? undefined,
      ichimokuSenkouB: ichimokuResult.senkouSpanB[i] ?? undefined,
      ichimokuChikou: ichimokuResult.chikouSpan[i] ?? undefined,
    };
    results.push(entry);
  }

  return results;
}

// ============================================================================
// 高级技术指标 — Ichimoku 云图 / ADX / ATR (Round 41)
// ============================================================================

/**
 * ATR (Average True Range) 平均真实波幅
 * True Range = max(High-Low, |High-PrevClose|, |Low-PrevClose|)
 * ATR = Wilder's smoothed TR over period
 *
 * 对标 TradingView ATR 指标
 */
export function calculateATR(
  highData: number[],
  lowData: number[],
  closeData: number[],
  period: number = 14
): ATRResult {
  const len = closeData.length;
  const trueRange: (number | null)[] = new Array(len).fill(null);
  const atr: (number | null)[] = new Array(len).fill(null);

  if (len < 2) return { atr, trueRange };

  // TR 从第2根K线开始 (需要前一根收盘价)
  for (let i = 1; i < len; i++) {
    const hl = highData[i] - lowData[i];
    const hpc = Math.abs(highData[i] - closeData[i - 1]);
    const lpc = Math.abs(lowData[i] - closeData[i - 1]);
    trueRange[i] = parseFloat(Math.max(hl, hpc, lpc).toFixed(4));
  }

  // ATR 使用 Wilder 平滑: ATR = (prevATR * (period-1) + TR) / period
  // 初始 ATR = 前 period 个 TR 的简单平均
  if (len <= period) return { atr, trueRange };

  let sumTR = 0;
  for (let i = 1; i <= period; i++) {
    sumTR += trueRange[i]!;
  }
  atr[period] = parseFloat((sumTR / period).toFixed(4));

  for (let i = period + 1; i < len; i++) {
    atr[i] = parseFloat(((atr[i - 1]! * (period - 1) + trueRange[i]!) / period).toFixed(4));
  }

  return { atr, trueRange };
}

/**
 * ADX (Average Directional Index) 平均趋向指数
 * 完整实现: +DM, -DM, +DI, -DI, DX, ADX
 * 对标 TradingView / Bloomberg ADX 指标
 *
 * Steps:
 * 1. 计算 +DM / -DM
 * 2. Wilder 平滑 +DM / -DM
 * 3. 计算 +DI / -DI = smoothed_DM / ATR * 100
 * 4. DX = |+DI - -DI| / (+DI + -DI) * 100
 * 5. ADX = Wilder smoothed DX
 */
export function calculateADX(
  highData: number[],
  lowData: number[],
  closeData: number[],
  period: number = 14
): ADXResult {
  const len = closeData.length;
  const plusDI: (number | null)[] = new Array(len).fill(null);
  const minusDI: (number | null)[] = new Array(len).fill(null);
  const adx: (number | null)[] = new Array(len).fill(null);

  if (len < period + 1) return { plusDI, minusDI, adx };

  // Step 1: 计算 +DM / -DM
  const plusDM: number[] = new Array(len).fill(0);
  const minusDM: number[] = new Array(len).fill(0);

  for (let i = 1; i < len; i++) {
    const upMove = highData[i] - highData[i - 1];
    const downMove = lowData[i - 1] - lowData[i];

    if (upMove > downMove && upMove > 0) {
      plusDM[i] = upMove;
    }
    if (downMove > upMove && downMove > 0) {
      minusDM[i] = downMove;
    }
  }

  // Step 2: 计算 ATR (Wilder 平滑)
  const { atr } = calculateATR(highData, lowData, closeData, period);

  // Step 2: Wilder 平滑 +DM / -DM
  const smoothedPlusDM: (number | null)[] = new Array(len).fill(null);
  const smoothedMinusDM: (number | null)[] = new Array(len).fill(null);

  // 初始值: 前 period 个值的和
  let sumPlusDM = 0;
  let sumMinusDM = 0;
  for (let i = 1; i <= period; i++) {
    sumPlusDM += plusDM[i];
    sumMinusDM += minusDM[i];
  }
  smoothedPlusDM[period] = sumPlusDM;
  smoothedMinusDM[period] = sumMinusDM;

  for (let i = period + 1; i < len; i++) {
    smoothedPlusDM[i] = smoothedPlusDM[i - 1]! - smoothedPlusDM[i - 1]! / period + plusDM[i];
    smoothedMinusDM[i] = smoothedMinusDM[i - 1]! - smoothedMinusDM[i - 1]! / period + minusDM[i];
  }

  // Step 3: +DI / -DI
  const dxValues: (number | null)[] = new Array(len).fill(null);

  for (let i = period; i < len; i++) {
    if (atr[i] === null || atr[i] === 0) continue;
    plusDI[i] = parseFloat(((smoothedPlusDM[i]! / atr[i]!) * 100).toFixed(4));
    minusDI[i] = parseFloat(((smoothedMinusDM[i]! / atr[i]!) * 100).toFixed(4));

    // Step 4: DX
    const diSum = plusDI[i]! + minusDI[i]!;
    if (diSum > 0) {
      dxValues[i] = parseFloat(((Math.abs(plusDI[i]! - minusDI[i]!) / diSum) * 100).toFixed(4));
    } else {
      dxValues[i] = 0;
    }
  }

  // Step 5: ADX (Wilder 平滑 DX)
  // 初始 ADX = 前 period 个 DX 的平均 (从 index 2*period-1 开始有效)
  const adxStart = 2 * period;
  if (adxStart >= len) return { plusDI, minusDI, adx };

  let sumDX = 0;
  let dxCount = 0;
  for (let i = period; i < adxStart; i++) {
    if (dxValues[i] !== null) {
      sumDX += dxValues[i]!;
      dxCount++;
    }
  }
  if (dxCount > 0) {
    adx[adxStart - 1] = parseFloat((sumDX / dxCount).toFixed(4));
  }

  for (let i = adxStart; i < len; i++) {
    if (adx[i - 1] !== null && dxValues[i] !== null) {
      adx[i] = parseFloat(((adx[i - 1]! * (period - 1) + dxValues[i]!) / period).toFixed(4));
    }
  }

  return { plusDI, minusDI, adx };
}

/**
 * Ichimoku Cloud (一目均衡表 / Ichimoku Kinkō Hyō)
 * 五条线完整实现:
 *   Tenkan-sen  (转换线)  = (9-period high + 9-period low) / 2
 *   Kijun-sen   (基准线)  = (26-period high + 26-period low) / 2
 *   Senkou Span A (先行带A) = (Tenkan + Kijun) / 2, displaced forward by 26
 *   Senkou Span B (先行带B) = (52-period high + 52-period low) / 2, displaced forward by 26
 *   Chikou Span (迟行带)  = Close, displaced backward by 26
 *
 * 对标 TradingView Ichimoku Cloud 指标
 */
export function calculateIchimoku(
  highData: number[],
  lowData: number[],
  closeData: number[],
  tenkanPeriod: number = 9,
  kijunPeriod: number = 26,
  senkouBPeriod: number = 52,
  displacement: number = 26
): IchimokuResult {
  const len = closeData.length;
  const tenkanSen: (number | null)[] = new Array(len).fill(null);
  const kijunSen: (number | null)[] = new Array(len).fill(null);
  const senkouSpanA: (number | null)[] = new Array(len).fill(null);
  const senkouSpanB: (number | null)[] = new Array(len).fill(null);
  const chikouSpan: (number | null)[] = new Array(len).fill(null);

  // Helper: Donchian midpoint over period
  const donchian = (idx: number, period: number): number | null => {
    if (idx < period - 1) return null;
    let high = highData[idx];
    let low = lowData[idx];
    for (let j = 1; j < period; j++) {
      high = Math.max(high, highData[idx - j]);
      low = Math.min(low, lowData[idx - j]);
    }
    return parseFloat(((high + low) / 2).toFixed(4));
  };

  for (let i = 0; i < len; i++) {
    tenkanSen[i] = donchian(i, tenkanPeriod);
    kijunSen[i] = donchian(i, kijunPeriod);

    // Senkou Span A: (Tenkan + Kijun) / 2, 前移 displacement
    if (tenkanSen[i] !== null && kijunSen[i] !== null) {
      const spanA = parseFloat(((tenkanSen[i]! + kijunSen[i]!) / 2).toFixed(4));
      const targetIdx = i + displacement;
      if (targetIdx < len) {
        senkouSpanA[targetIdx] = spanA;
      }
    }

    // Senkou Span B: donchian(senkouBPeriod), 前移 displacement
    const spanB = donchian(i, senkouBPeriod);
    if (spanB !== null) {
      const targetIdx = i + displacement;
      if (targetIdx < len) {
        senkouSpanB[targetIdx] = spanB;
      }
    }

    // Chikou Span: 收盘价后移 displacement
    const chikouIdx = i - displacement;
    if (chikouIdx >= 0) {
      chikouSpan[chikouIdx] = parseFloat(closeData[i].toFixed(4));
    }
  }

  return { tenkanSen, kijunSen, senkouSpanA, senkouSpanB, chikouSpan };
}

// ============================================================================
// 多时间框架聚合 (Multi-Timeframe Aggregation)
// ============================================================================

/**
 * 将分钟级K线聚合为指定时间框架
 * 支持: 5m, 15m, 30m, 1h, 4h, 1d, 1w, 1M
 *
 * 对标 TradingView 多时间框架切换
 */
export function aggregateTimeframe(
  data: OHLCV[],
  targetTimeframe: Timeframe
): OHLCV[] {
  if (data.length === 0) return [];

  const TIMEFRAME_MINUTES: Record<Timeframe, number> = {
    '1m': 1,
    '5m': 5,
    '15m': 15,
    '30m': 30,
    '1h': 60,
    '4h': 240,
    '1d': 1440,
    '1w': 10080,
    '1M': 43200, // approximate
  };

  const intervalMinutes = TIMEFRAME_MINUTES[targetTimeframe];
  if (intervalMinutes <= 1) return [...data];

  // 按 tradeDate 分组聚合
  const grouped = new Map<string, OHLCV[]>();

  for (const candle of data) {
    // 生成分组 key
    const date = new Date(candle.tradeDate);
    let groupKey: string;

    if (targetTimeframe === '1w') {
      // ISO week start (Monday)
      const day = date.getDay();
      const diff = date.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(date);
      monday.setDate(diff);
      groupKey = monday.toISOString().slice(0, 10);
    } else if (targetTimeframe === '1M') {
      groupKey = candle.tradeDate.slice(0, 7) + '-01';
    } else {
      // 按时间间隔分桶
      const minutesOfDay = date.getHours() * 60 + date.getMinutes();
      const bucket = Math.floor(minutesOfDay / intervalMinutes);
      groupKey = candle.tradeDate.slice(0, 10) + `_${bucket}`;
    }

    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, []);
    }
    grouped.get(groupKey)!.push(candle);
  }

  // 合并每个分组为一根K线
  const result: OHLCV[] = [];
  const sortedKeys = [...grouped.keys()].sort();

  for (const key of sortedKeys) {
    const candles = grouped.get(key)!;
    result.push({
      tradeDate: candles[0].tradeDate,
      open: candles[0].open,
      close: candles[candles.length - 1].close,
      high: Math.max(...candles.map(c => c.high)),
      low: Math.min(...candles.map(c => c.low)),
      volume: candles.reduce((sum, c) => sum + c.volume, 0),
    });
  }

  return result;
}

/**
 * 多时间框架批量计算指标
 * 返回各时间框架的指标结果
 *
 * 对标 TradingView 多时间框架分析面板
 */
export function calculateMultiTimeframe(
  data: OHLCV[],
  timeframes: Timeframe[] = ['1d', '1w', '1M'],
  params: IndicatorParams = {}
): Record<string, TechnicalIndicatorResult[]> {
  const results: Record<string, TechnicalIndicatorResult[]> = {};

  for (const tf of timeframes) {
    const aggregated = aggregateTimeframe(data, tf);
    results[tf] = calculateAllIndicators(aggregated, params);
  }

  return results;
}
