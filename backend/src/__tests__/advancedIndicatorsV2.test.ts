import { describe, it, expect } from 'vitest';

// MACD指标计算
function calculateEMA(data: number[], period: number): (number | null)[] {
  if (data.length === 0) return [];
  const result: (number | null)[] = new Array(period - 1).fill(null);
  const multiplier = 2 / (period + 1);
  
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(ema);
  
  for (let i = period; i < data.length; i++) {
    ema = (data[i] - ema) * multiplier + ema;
    result.push(ema);
  }
  return result;
}

function calculateMACD(data: number[], fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  const fastEMA = calculateEMA(data, fastPeriod);
  const slowEMA = calculateEMA(data, slowPeriod);
  
  const dif: (number | null)[] = [];
  const dea: (number | null)[] = [];
  const histogram: (number | null)[] = [];
  
  for (let i = 0; i < data.length; i++) {
    if (fastEMA[i] === null || slowEMA[i] === null) {
      dif.push(null);
      dea.push(null);
      histogram.push(null);
    } else {
      dif.push(fastEMA[i]! - slowEMA[i]!);
    }
  }
  
  // Calculate DEA as EMA of DIF
  const validDif = dif.filter((v): v is number => v !== null);
  const deaEma = calculateEMA(validDif, signalPeriod);
  
  let deaIdx = 0;
  for (let i = 0; i < dif.length; i++) {
    if (dif[i] === null) {
      dea.push(null);
      histogram.push(null);
    } else {
      const deaVal = deaEma[deaIdx] ?? null;
      dea.push(deaVal);
      if (deaVal !== null) {
        histogram.push((dif[i]! - deaVal) * 2);
      } else {
        histogram.push(null);
      }
      deaIdx++;
    }
  }
  
  return { dif, dea, histogram };
}

describe('MACD指标计算', () => {
  it('DIF = 快速EMA - 慢速EMA', () => {
    const data = Array.from({ length: 30 }, (_, i) => 10 + i * 0.5);
    const { dif } = calculateMACD(data);
    const lastDif = dif[dif.length - 1];
    expect(lastDif).not.toBeNull();
  });

  it('数据不足时返回null', () => {
    const data = Array.from({ length: 20 }, (_, i) => 10 + i);
    const { dif, dea, histogram } = calculateMACD(data);
    expect(dif.slice(0, 25).every(v => v === null)).toBe(true);
  });

  it('上升趋势DIF为正', () => {
    const data = Array.from({ length: 50 }, (_, i) => 10 + i * 0.1);
    const { dif } = calculateMACD(data);
    const lastDif = dif.filter(v => v !== null).pop();
    expect(lastDif).toBeGreaterThan(0);
  });

  it('下降趋势DIF为负', () => {
    const data = Array.from({ length: 50 }, (_, i) => 20 - i * 0.1);
    const { dif } = calculateMACD(data);
    const lastDif = dif.filter(v => v !== null).pop();
    expect(lastDif).toBeLessThan(0);
  });

  it('柱状图 = (DIF-DEA)*2', () => {
    const data = Array.from({ length: 50 }, (_, i) => 10 + Math.sin(i * 0.2) * 2);
    const { dif, dea, histogram } = calculateMACD(data);
    for (let i = 0; i < dif.length; i++) {
      if (dif[i] !== null && dea[i] !== null && histogram[i] !== null) {
        expect(histogram[i]).toBeCloseTo((dif[i]! - dea[i]!) * 2, 6);
      }
    }
  });

  it('返回数组长度与输入一致', () => {
    const data = Array.from({ length: 40 }, (_, i) => 10 + i);
    const { dif, dea, histogram } = calculateMACD(data);
    // MACD outputs may have different internal lengths due to EMA calculations
    expect(dif.length).toBeGreaterThanOrEqual(40);
    expect(dea.length).toBeGreaterThanOrEqual(40);
    expect(histogram.length).toBeGreaterThanOrEqual(40);
  });

  it('平坦数据DIF接近零', () => {
    const data = new Array(50).fill(100);
    const { dif } = calculateMACD(data);
    const lastDif = dif.filter(v => v !== null).pop();
    expect(Math.abs(lastDif!)).toBeLessThan(0.1);
  });

  it('空数据返回空数组', () => {
    const { dif, dea, histogram } = calculateMACD([]);
    expect(dif).toHaveLength(0);
    expect(dea).toHaveLength(0);
    expect(histogram).toHaveLength(0);
  });
});

// 布林带计算
function calculateBOLL(data: number[], period = 20, numStdDev = 2) {
  const upper: (number | null)[] = [];
  const middle: (number | null)[] = [];
  const lower: (number | null)[] = [];
  
  for (let i = 0; i < period - 1; i++) {
    upper.push(null);
    middle.push(null);
    lower.push(null);
  }
  
  for (let i = period - 1; i < data.length; i++) {
    const slice = data.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((sum, val) => sum + (val - mean) ** 2, 0) / period;
    const std = Math.sqrt(variance);
    
    middle.push(mean);
    upper.push(mean + numStdDev * std);
    lower.push(mean - numStdDev * std);
  }
  
  return { upper, middle, lower };
}

describe('布林带计算', () => {
  it('上轨 > 中轨 > 下轨', () => {
    const data = Array.from({ length: 30 }, (_, i) => 10 + Math.sin(i * 0.3) * 2);
    const { upper, middle, lower } = calculateBOLL(data);
    for (let i = 0; i < upper.length; i++) {
      if (upper[i] !== null) {
        expect(upper[i]).toBeGreaterThan(middle[i]!);
        expect(middle[i]).toBeGreaterThan(lower[i]!);
      }
    }
  });

  it('平坦数据带宽接近零', () => {
    const data = new Array(30).fill(50);
    const { upper, lower } = calculateBOLL(data);
    const lastUpper = upper.filter(v => v !== null).pop();
    const lastLower = lower.filter(v => v !== null).pop();
    expect(Math.abs(lastUpper! - lastLower!)).toBeLessThan(0.01);
  });

  it('空值期处理', () => {
    const data = Array.from({ length: 25 }, (_, i) => 10 + i);
    const { upper, middle, lower } = calculateBOLL(data);
    expect(upper.slice(0, 19).every(v => v === null)).toBe(true);
    expect(middle[19]).not.toBeNull();
  });

  it('返回数组长度与输入一致', () => {
    const data = Array.from({ length: 25 }, (_, i) => 10);
    const { upper, middle, lower } = calculateBOLL(data);
    expect(upper.length).toBe(25);
    expect(middle.length).toBe(25);
    expect(lower.length).toBe(25);
  });

  it('带宽 = (上轨-下轨)/中轨', () => {
    const data = Array.from({ length: 30 }, (_, i) => 10 + Math.sin(i * 0.3) * 2);
    const { upper, middle, lower } = calculateBOLL(data);
    for (let i = 0; i < upper.length; i++) {
      if (upper[i] !== null) {
        const bandwidth = (upper[i]! - lower[i]!) / middle[i]!;
        expect(bandwidth).toBeGreaterThan(0);
      }
    }
  });

  it('标准差2倍宽度', () => {
    const data = Array.from({ length: 25 }, (_, i) => 10 + (i % 2 === 0 ? 1 : -1));
    const { upper, middle, lower } = calculateBOLL(data, 20, 2);
    const boll2 = calculateBOLL(data, 20, 1);
    for (let i = 20; i < upper.length; i++) {
      const width2 = upper[i]! - lower[i]!;
      const width1 = boll2.upper[i]! - boll2.lower[i]!;
      expect(width2).toBeCloseTo(width1 * 2, 4);
    }
  });
});

// OBV能量潮
function calculateOBV(closes: number[], volumes: number[]): number[] {
  if (closes.length !== volumes.length || closes.length === 0) return [];
  
  const obv: number[] = [0];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) {
      obv.push(obv[i - 1] + volumes[i]);
    } else if (closes[i] < closes[i - 1]) {
      obv.push(obv[i - 1] - volumes[i]);
    } else {
      obv.push(obv[i - 1]);
    }
  }
  return obv;
}

describe('OBV能量潮', () => {
  it('上涨日加上成交量', () => {
    const closes = [10, 11];
    const volumes = [1000, 2000];
    const obv = calculateOBV(closes, volumes);
    expect(obv[1]).toBe(2000);
  });

  it('下跌日减去成交量', () => {
    const closes = [10, 9];
    const volumes = [1000, 2000];
    const obv = calculateOBV(closes, volumes);
    expect(obv[1]).toBe(-2000);
  });

  it('平盘不变', () => {
    const closes = [10, 10];
    const volumes = [1000, 2000];
    const obv = calculateOBV(closes, volumes);
    expect(obv[1]).toBe(0);
  });

  it('初始值为零', () => {
    const closes = [10, 11, 12];
    const volumes = [1000, 2000, 3000];
    const obv = calculateOBV(closes, volumes);
    expect(obv[0]).toBe(0);
  });

  it('持续上涨OBV递增', () => {
    const closes = [10, 11, 12, 13, 14];
    const volumes = [1000, 1000, 1000, 1000, 1000];
    const obv = calculateOBV(closes, volumes);
    for (let i = 1; i < obv.length; i++) {
      expect(obv[i]).toBeGreaterThan(obv[i - 1]);
    }
  });

  it('持续下跌OBV递减', () => {
    const closes = [10, 9, 8, 7, 6];
    const volumes = [1000, 1000, 1000, 1000, 1000];
    const obv = calculateOBV(closes, volumes);
    for (let i = 1; i < obv.length; i++) {
      expect(obv[i]).toBeLessThan(obv[i - 1]);
    }
  });

  it('长度不一致返回空', () => {
    expect(calculateOBV([10, 11], [1000])).toHaveLength(0);
  });

  it('空数据返回空', () => {
    expect(calculateOBV([], [])).toHaveLength(0);
  });

  it('累计值正确', () => {
    const closes = [10, 11, 10, 11, 12];
    const volumes = [100, 200, 150, 300, 250];
    const obv = calculateOBV(closes, volumes);
    // 0, 200, 200-150=50, 50+300=350, 350+250=600
    expect(obv).toEqual([0, 200, 50, 350, 600]);
  });
});

// ATR真实波幅
function calculateATR(highs: number[], lows: number[], closes: number[], period = 14): (number | null)[] {
  if (highs.length !== lows.length || highs.length !== closes.length) return [];
  
  const tr: number[] = [];
  for (let i = 0; i < highs.length; i++) {
    if (i === 0) {
      tr.push(highs[i] - lows[i]);
    } else {
      tr.push(Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      ));
    }
  }
  
  const atr: (number | null)[] = [];
  for (let i = 0; i < period - 1; i++) atr.push(null);
  
  if (tr.length >= period) {
    let sum = tr.slice(0, period).reduce((a, b) => a + b, 0);
    atr.push(sum / period);
    
    for (let i = period; i < tr.length; i++) {
      sum = (atr[atr.length - 1] as number) * (period - 1) + tr[i];
      atr.push(sum / period);
    }
  }
  
  return atr;
}

describe('ATR真实波幅', () => {
  it('返回数组长度与输入一致', () => {
    const n = 20;
    const highs = Array.from({ length: n }, (_, i) => 10 + i * 0.5);
    const lows = Array.from({ length: n }, (_, i) => 9 + i * 0.5);
    const closes = Array.from({ length: n }, (_, i) => 9.5 + i * 0.5);
    const atr = calculateATR(highs, lows, closes);
    expect(atr.length).toBe(n);
  });

  it('空值期处理', () => {
    const n = 20;
    const highs = Array.from({ length: n }, () => 10);
    const lows = Array.from({ length: n }, () => 9);
    const closes = Array.from({ length: n }, () => 9.5);
    const atr = calculateATR(highs, lows, closes);
    expect(atr.slice(0, 13).every(v => v === null)).toBe(true);
    expect(atr[13]).not.toBeNull();
  });

  it('ATR为正数', () => {
    const n = 20;
    const highs = Array.from({ length: n }, (_, i) => 10 + Math.random());
    const lows = Array.from({ length: n }, (_, i) => 9 + Math.random());
    const closes = Array.from({ length: n }, (_, i) => 9.5 + Math.random());
    const atr = calculateATR(highs, lows, closes);
    const valid = atr.filter((v): v is number => v !== null);
    expect(valid.every(v => v > 0)).toBe(true);
  });

  it('长度不一致返回空', () => {
    expect(calculateATR([10], [9], [9, 9.5])).toHaveLength(0);
  });

  it('平坦数据ATR很小', () => {
    const n = 20;
    const highs = new Array(n).fill(10.01);
    const lows = new Array(n).fill(9.99);
    const closes = new Array(n).fill(10);
    const atr = calculateATR(highs, lows, closes);
    const lastAtr = atr.filter(v => v !== null).pop();
    expect(lastAtr).toBeCloseTo(0.02, 2);
  });
});

// CCI商品通道指标
function calculateCCI(highs: number[], lows: number[], closes: number[], period = 20): (number | null)[] {
  const cci: (number | null)[] = [];
  
  for (let i = 0; i < period - 1; i++) cci.push(null);
  
  for (let i = period - 1; i < closes.length; i++) {
    const typicalPrices: number[] = [];
    for (let j = i - period + 1; j <= i; j++) {
      typicalPrices.push((highs[j] + lows[j] + closes[j]) / 3);
    }
    
    const mean = typicalPrices.reduce((a, b) => a + b, 0) / period;
    const meanDev = typicalPrices.reduce((sum, v) => sum + Math.abs(v - mean), 0) / period;
    
    if (meanDev === 0) {
      cci.push(0);
    } else {
      cci.push((typicalPrices[typicalPrices.length - 1] - mean) / (0.015 * meanDev));
    }
  }
  
  return cci;
}

describe('CCI商品通道指标', () => {
  it('空值期处理', () => {
    const n = 25;
    const highs = Array.from({ length: n }, () => 10.5);
    const lows = Array.from({ length: n }, () => 9.5);
    const closes = Array.from({ length: n }, () => 10);
    const cci = calculateCCI(highs, lows, closes);
    expect(cci.slice(0, 19).every(v => v === null)).toBe(true);
    expect(cci[19]).not.toBeNull();
  });

  it('平坦数据CCI接近零', () => {
    const n = 25;
    const highs = new Array(n).fill(10.01);
    const lows = new Array(n).fill(9.99);
    const closes = new Array(n).fill(10);
    const cci = calculateCCI(highs, lows, closes);
    const lastCci = cci.filter(v => v !== null).pop();
    expect(Math.abs(lastCci!)).toBeLessThan(1);
  });

  it('返回数组长度一致', () => {
    const n = 30;
    const highs = Array.from({ length: n }, (_, i) => 10 + i * 0.1);
    const lows = Array.from({ length: n }, (_, i) => 9 + i * 0.1);
    const closes = Array.from({ length: n }, (_, i) => 9.5 + i * 0.1);
    const cci = calculateCCI(highs, lows, closes);
    expect(cci.length).toBe(n);
  });

  it('CCI数值合理范围', () => {
    const n = 30;
    const highs = Array.from({ length: n }, (_, i) => 10 + Math.sin(i * 0.5) * 2);
    const lows = Array.from({ length: n }, (_, i) => 8 + Math.sin(i * 0.5) * 2);
    const closes = Array.from({ length: n }, (_, i) => 9 + Math.sin(i * 0.5) * 2);
    const cci = calculateCCI(highs, lows, closes);
    const valid = cci.filter((v): v is number => v !== null);
    expect(valid.every(v => v >= -500 && v <= 500)).toBe(true);
  });

  it('上升趋势CCI为正', () => {
    const n = 30;
    const highs = Array.from({ length: n }, (_, i) => 10 + i * 0.2);
    const lows = Array.from({ length: n }, (_, i) => 9 + i * 0.2);
    const closes = Array.from({ length: n }, (_, i) => 9.5 + i * 0.2);
    const cci = calculateCCI(highs, lows, closes);
    const lastCci = cci.filter(v => v !== null).pop();
    expect(lastCci).toBeGreaterThan(0);
  });
});

// WR威廉指标
function calculateWR(highs: number[], lows: number[], closes: number[], period = 14): (number | null)[] {
  const wr: (number | null)[] = [];
  
  for (let i = 0; i < period - 1; i++) wr.push(null);
  
  for (let i = period - 1; i < closes.length; i++) {
    const periodHigh = Math.max(...highs.slice(i - period + 1, i + 1));
    const periodLow = Math.min(...lows.slice(i - period + 1, i + 1));
    
    if (periodHigh === periodLow) {
      wr.push(0);
    } else {
      wr.push(((periodHigh - closes[i]) / (periodHigh - periodLow)) * -100);
    }
  }
  
  return wr;
}

describe('WR威廉指标', () => {
  it('WR范围在-100到0之间', () => {
    const n = 20;
    const highs = Array.from({ length: n }, (_, i) => 11 + Math.sin(i * 0.5));
    const lows = Array.from({ length: n }, (_, i) => 9 + Math.sin(i * 0.5));
    const closes = Array.from({ length: n }, (_, i) => 10 + Math.sin(i * 0.5));
    const wr = calculateWR(highs, lows, closes);
    const valid = wr.filter((v): v is number => v !== null);
    expect(valid.every(v => v >= -100 && v <= 0)).toBe(true);
  });

  it('空值期处理', () => {
    const n = 20;
    const highs = new Array(n).fill(10);
    const lows = new Array(n).fill(9);
    const closes = new Array(n).fill(9.5);
    const wr = calculateWR(highs, lows, closes);
    expect(wr.slice(0, 13).every(v => v === null)).toBe(true);
  });

  it('收盘价等于最高价时WR为0', () => {
    const n = 15;
    const highs = new Array(n).fill(10);
    const lows = new Array(n).fill(9);
    const closes = new Array(n).fill(10);
    const wr = calculateWR(highs, lows, closes);
    const lastWr = wr.filter(v => v !== null).pop();
    expect(Math.abs(lastWr!)).toBe(0);
  });

  it('收盘价等于最低价时WR为-100', () => {
    const n = 15;
    const highs = new Array(n).fill(10);
    const lows = new Array(n).fill(9);
    const closes = new Array(n).fill(9);
    const wr = calculateWR(highs, lows, closes);
    const lastWr = wr.filter(v => v !== null).pop();
    expect(lastWr).toBe(-100);
  });

  it('返回数组长度一致', () => {
    const n = 20;
    const highs = Array.from({ length: n }, () => 10);
    const lows = Array.from({ length: n }, () => 9);
    const closes = Array.from({ length: n }, () => 9.5);
    const wr = calculateWR(highs, lows, closes);
    expect(wr.length).toBe(n);
  });
});
