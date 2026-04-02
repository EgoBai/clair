/**
 * ChartDataEngine - 图表数据处理引擎
 * K线数据聚合、指标计算、缩放等前端逻辑
 */

export interface OHLCV { date: string; open: number; high: number; low: number; close: number; volume: number; }

export function aggregateKlines(data: OHLCV[], factor: number): OHLCV[] {
  if (factor <= 1) return data;
  const result: OHLCV[] = [];
  for (let i = 0; i < data.length; i += factor) {
    const slice = data.slice(i, i + factor);
    result.push({
      date: slice[0].date,
      open: slice[0].open,
      high: Math.max(...slice.map(d => d.high)),
      low: Math.min(...slice.map(d => d.low)),
      close: slice[slice.length - 1].close,
      volume: slice.reduce((a, b) => a + b.volume, 0),
    });
  }
  return result;
}

export function calcBollingerBands(data: number[], period: number, mult: number): Array<{upper: number; mid: number; lower: number}> {
  const result = [];
  for (let i = period - 1; i < data.length; i++) {
    const slice = data.slice(i - period + 1, i + 1);
    const mid = slice.reduce((a, b) => a + b, 0) / period;
    const std = Math.sqrt(slice.reduce((a, b) => a + (b - mid) ** 2, 0) / period);
    result.push({ upper: mid + mult * std, mid, lower: mid - mult * std });
  }
  return result;
}

export function calcRSI(data: number[], period: number): number[] {
  const rsi: number[] = [];
  if (data.length < period + 1) return rsi;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = data[i] - data[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period, avgLoss = losses / period;
  rsi.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  for (let i = period + 1; i < data.length; i++) {
    const diff = data[i] - data[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
    rsi.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  }
  return rsi;
}

export function normalizeToRange(data: number[], min: number, max: number): number[] {
  const dMin = Math.min(...data), dMax = Math.max(...data);
  if (dMax === dMin) return data.map(() => (min + max) / 2);
  return data.map(v => min + ((v - dMin) / (dMax - dMin)) * (max - min));
}
