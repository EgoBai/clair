import { describe, it, expect } from 'vitest';

// 市场宽度指标引擎
interface BreadthData {
  advancing: number;
  declining: number;
  unchanged: number;
  newHighs: number;
  newLows: number;
  aboveMA50: number;
  aboveMA200: number;
  totalStocks: number;
  date: string;
}

interface BreadthIndicator {
  adLine: number;
  adRatio: number;
  highLowRatio: number;
  mcclellanOscillator: number;
  percentAboveMA50: number;
  percentAboveMA200: number;
  breadthThrust: number;
  signal: 'bullish' | 'bearish' | 'neutral';
}

function calcADRatio(data: BreadthData): number {
  return data.declining > 0 ? data.advancing / data.declining : data.advancing > 0 ? 10 : 1;
}

function calcHighLowRatio(data: BreadthData): number {
  return data.newLows > 0 ? data.newHighs / data.newLows : data.newHighs > 0 ? 10 : 1;
}

function calcMcClellanOscillator(history: BreadthData[]): number {
  if (history.length < 20) return 0;
  const netAdvances = history.map(d => d.advancing - d.declining);
  const ema19 = calcEMA(netAdvances, 19);
  const ema39 = calcEMA(netAdvances, 39);
  return ema19[ema19.length - 1] - ema39[ema39.length - 1];
}

function calcEMA(data: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema: number[] = [data[0]];
  for (let i = 1; i < data.length; i++) {
    ema.push(data[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

function calcBreadthThrust(history: BreadthData[]): number {
  if (history.length < 10) return 0;
  const recent = history.slice(-10);
  const advSum = recent.reduce((s, d) => s + d.advancing, 0);
  const decSum = recent.reduce((s, d) => s + d.declining, 0);
  return (advSum + decSum) > 0 ? advSum / (advSum + decSum) : 0.5;
}

function analyzeBreadth(data: BreadthData, history: BreadthData[]): BreadthIndicator {
  const adRatio = calcADRatio(data);
  const highLowRatio = calcHighLowRatio(data);
  const mcclellan = calcMcClellanOscillator(history);
  const percentMA50 = data.totalStocks > 0 ? data.aboveMA50 / data.totalStocks : 0;
  const percentMA200 = data.totalStocks > 0 ? data.aboveMA200 / data.totalStocks : 0;
  const thrust = calcBreadthThrust(history);

  let bullishCount = 0;
  if (adRatio > 1.5) bullishCount++;
  if (adRatio < 0.67) bullishCount--;
  if (highLowRatio > 2) bullishCount++;
  if (highLowRatio < 0.5) bullishCount--;
  if (mcclellan > 50) bullishCount++;
  if (mcclellan < -50) bullishCount--;
  if (percentMA50 > 0.6) bullishCount++;
  if (percentMA50 < 0.4) bullishCount--;
  if (thrust > 0.6) bullishCount++;
  if (thrust < 0.4) bullishCount--;

  const signal = bullishCount >= 3 ? 'bullish' : bullishCount <= -3 ? 'bearish' : 'neutral';

  return {
    adLine: data.advancing - data.declining,
    adRatio,
    highLowRatio,
    mcclellanOscillator: mcclellan,
    percentAboveMA50: percentMA50,
    percentAboveMA200: percentMA200,
    breadthThrust: thrust,
    signal,
  };
}

describe('市场宽度指标引擎', () => {
  const today: BreadthData = {
    advancing: 2500, declining: 800, unchanged: 200, newHighs: 150, newLows: 30,
    aboveMA50: 2200, aboveMA200: 1800, totalStocks: 3500, date: '2024-03-15',
  };

  const history: BreadthData[] = Array.from({ length: 40 }, (_, i) => ({
    advancing: 1500 + Math.random() * 1500,
    declining: 800 + Math.random() * 1000,
    unchanged: 200,
    newHighs: 50 + Math.random() * 200,
    newLows: 20 + Math.random() * 100,
    aboveMA50: 1500 + Math.random() * 1500,
    aboveMA200: 1200 + Math.random() * 1200,
    totalStocks: 3500,
    date: `2024-02-${String(i + 1).padStart(2, '0')}`,
  }));

  it('应计算涨跌比', () => {
    const ratio = calcADRatio(today);
    expect(ratio).toBeCloseTo(3.125, 2);
  });

  it('涨跌比应大于1（涨多跌少）', () => {
    expect(calcADRatio(today)).toBeGreaterThan(1);
  });

  it('应计算新高新低比', () => {
    const ratio = calcHighLowRatio(today);
    expect(ratio).toBe(5);
  });

  it('应计算McClellan震荡指标', () => {
    const mcclellan = calcMcClellanOscillator(history);
    expect(typeof mcclellan).toBe('number');
  });

  it('应计算Breadth Thrust', () => {
    const thrust = calcBreadthThrust(history);
    expect(thrust).toBeGreaterThan(0);
    expect(thrust).toBeLessThanOrEqual(1);
  });

  it('应综合分析市场宽度', () => {
    const result = analyzeBreadth(today, history);
    expect(['bullish', 'bearish', 'neutral']).toContain(result.signal);
    expect(result.percentAboveMA50).toBeGreaterThan(0);
    expect(result.percentAboveMA200).toBeGreaterThan(0);
  });

  it('涨多跌少应为看涨', () => {
    const bullish: BreadthData = {
      ...today, advancing: 3000, declining: 300, newHighs: 200, newLows: 10,
      aboveMA50: 3000, aboveMA200: 2500,
    };
    const result = analyzeBreadth(bullish, history);
    expect(result.signal).toBe('bullish');
  });

  it('跌多涨少应为看跌', () => {
    const bearish: BreadthData = {
      ...today, advancing: 200, declining: 3200, newHighs: 5, newLows: 300,
      aboveMA50: 200, aboveMA200: 100,
    };
    const result = analyzeBreadth(bearish, history);
    expect(result.adRatio).toBeLessThan(0.1);
    expect(result.percentAboveMA50).toBeLessThan(0.1);
    expect(['bearish', 'neutral']).toContain(result.signal);
  });

  it('涨跌比下跌极端应为0', () => {
    const allDown: BreadthData = { ...today, advancing: 0, declining: 3000 };
    expect(calcADRatio(allDown)).toBe(0);
  });

  it('EMA应正确计算', () => {
    const ema = calcEMA([1, 2, 3, 4, 5], 3);
    expect(ema.length).toBe(5);
    expect(ema[0]).toBe(1);
  });
});
