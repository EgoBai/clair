import { describe, it, expect } from 'vitest';
import {
  calculateATR,
  calculateBollingerBands,
  calculateEMA,
  calculateMACD,
} from '../indicators/technical';

/**
 * 技术指标测试（批次 7：绑定生产实现）
 *
 * 生产实现（唯一真源）：backend/src/indicators/technical.ts
 * - EMA：前 period-1 个 null，index=period-1 用 SMA 作种子，之后按 2/(period+1) 平滑。
 * - MACD：返回 { macd, signal, histogram }，histogram = macd - signal（不是 (DIF-DEA)*2）；
 *   macd 首个有效值在 index=longPeriod-1，signal 还需再累积 signalPeriod 个有效 macd。
 * - 布林带：返回 { upper, middle, lower }，middle 为 MA，标准差为总体口径（除以 period）。
 * - ATR：返回 { atr, trueRange }，trueRange[0] 为 null（首根 K 线缺前收），
 *   atr 首个有效值在 index=period，之后 Wilder 平滑。
 *
 * 未迁移（后端无生产实现，保留本地 helper，不虚构生产代码）：
 * - OBV / CCI / WR 在 backend/src/indicators/technical.ts 中无导出，后端其余非测试代码
 *   也没有同名实现；前端 featureEngineeringEngine 虽有副本，但未被产品页面引用，
 *   且口径不同（OBV 首值为 volume[0]、WilliamsR 在 range=0 时返回 -50、预热期为 NaN），
 *   因此保留以下本地实现，仅作为待迁移的测试口径。
 */

describe('MACD指标计算', () => {
  it('MACD = 快速EMA - 慢速EMA', () => {
    const data = Array.from({ length: 30 }, (_, i) => 10 + i * 0.5);
    const { macd } = calculateMACD(data);
    const fastEMA = calculateEMA(data, 12);
    const slowEMA = calculateEMA(data, 26);

    expect(macd[25]).not.toBeNull();
    for (let i = 0; i < data.length; i++) {
      if (fastEMA[i] === null || slowEMA[i] === null) {
        expect(macd[i]).toBeNull();
      } else {
        expect(macd[i]!).toBeCloseTo(fastEMA[i]! - slowEMA[i]!, 3);
      }
    }
  });

  it('数据不足时全部为 null 且长度与输入一致', () => {
    const data = Array.from({ length: 20 }, (_, i) => 10 + i);
    const { macd, signal, histogram } = calculateMACD(data);
    expect(macd).toHaveLength(20);
    expect(macd.every(v => v === null)).toBe(true);
    expect(signal.every(v => v === null)).toBe(true);
    expect(histogram.every(v => v === null)).toBe(true);
  });

  it('上升趋势MACD为正', () => {
    const data = Array.from({ length: 50 }, (_, i) => 10 + i * 0.1);
    const { macd } = calculateMACD(data);
    const lastMacd = macd.filter(v => v !== null).pop();
    expect(lastMacd).toBeGreaterThan(0);
  });

  it('下降趋势MACD为负', () => {
    const data = Array.from({ length: 50 }, (_, i) => 20 - i * 0.1);
    const { macd } = calculateMACD(data);
    const lastMacd = macd.filter(v => v !== null).pop();
    expect(lastMacd).toBeLessThan(0);
  });

  it('柱状图 = MACD - SIGNAL', () => {
    const data = Array.from({ length: 50 }, (_, i) => 10 + Math.sin(i * 0.2) * 2);
    const { macd, signal, histogram } = calculateMACD(data);
    const validCount = histogram.filter(v => v !== null).length;
    expect(validCount).toBeGreaterThan(0);
    for (let i = 0; i < data.length; i++) {
      if (macd[i] !== null && signal[i] !== null && histogram[i] !== null) {
        expect(histogram[i]!).toBeCloseTo(macd[i]! - signal[i]!, 4);
      }
    }
  });

  it('返回数组长度与输入一致', () => {
    const data = Array.from({ length: 40 }, (_, i) => 10 + i);
    const { macd, signal, histogram } = calculateMACD(data);
    expect(macd).toHaveLength(40);
    expect(signal).toHaveLength(40);
    expect(histogram).toHaveLength(40);
  });

  it('平坦数据MACD接近零', () => {
    const data = new Array(50).fill(100);
    const { macd } = calculateMACD(data);
    const lastMacd = macd.filter(v => v !== null).pop();
    expect(Math.abs(lastMacd!)).toBeLessThan(0.1);
  });

  it('空数据返回空数组', () => {
    const { macd, signal, histogram } = calculateMACD([]);
    expect(macd).toHaveLength(0);
    expect(signal).toHaveLength(0);
    expect(histogram).toHaveLength(0);
  });
});

describe('布林带计算', () => {
  it('上轨 > 中轨 > 下轨', () => {
    const data = Array.from({ length: 30 }, (_, i) => 10 + Math.sin(i * 0.3) * 2);
    const { upper, middle, lower } = calculateBollingerBands(data);
    for (let i = 0; i < upper.length; i++) {
      if (upper[i] !== null) {
        expect(upper[i]).toBeGreaterThan(middle[i]!);
        expect(middle[i]).toBeGreaterThan(lower[i]!);
      }
    }
  });

  it('平坦数据带宽接近零', () => {
    const data = new Array(30).fill(50);
    const { upper, lower } = calculateBollingerBands(data);
    const lastUpper = upper.filter(v => v !== null).pop();
    const lastLower = lower.filter(v => v !== null).pop();
    expect(Math.abs(lastUpper! - lastLower!)).toBeLessThan(0.01);
  });

  it('空值期处理', () => {
    const data = Array.from({ length: 25 }, (_, i) => 10 + i);
    const { upper, middle, lower } = calculateBollingerBands(data);
    expect(upper.slice(0, 19).every(v => v === null)).toBe(true);
    expect(middle[19]).not.toBeNull();
  });

  it('返回数组长度与输入一致', () => {
    const data = Array.from({ length: 25 }, (_, i) => 10);
    const { upper, middle, lower } = calculateBollingerBands(data);
    expect(upper).toHaveLength(25);
    expect(middle).toHaveLength(25);
    expect(lower).toHaveLength(25);
  });

  it('带宽 = (上轨-下轨)/中轨', () => {
    const data = Array.from({ length: 30 }, (_, i) => 10 + Math.sin(i * 0.3) * 2);
    const { upper, middle, lower } = calculateBollingerBands(data);
    for (let i = 0; i < upper.length; i++) {
      if (upper[i] !== null) {
        const bandwidth = (upper[i]! - lower[i]!) / middle[i]!;
        expect(bandwidth).toBeGreaterThan(0);
      }
    }
  });

  it('标准差2倍宽度', () => {
    const data = Array.from({ length: 25 }, (_, i) => 10 + (i % 2 === 0 ? 1 : -1));
    const { upper, lower } = calculateBollingerBands(data, 20, 2);
    const boll1 = calculateBollingerBands(data, 20, 1);
    for (let i = 20; i < upper.length; i++) {
      const width2 = upper[i]! - lower[i]!;
      const width1 = boll1.upper[i]! - boll1.lower[i]!;
      expect(width2).toBeCloseTo(width1 * 2, 4);
    }
  });
});

// 未迁移：backend/src/indicators/technical.ts 无 OBV 生产实现（后端其余代码也无）。
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

describe('ATR真实波幅', () => {
  it('返回数组长度与输入一致', () => {
    const n = 20;
    const highs = Array.from({ length: n }, (_, i) => 10 + i * 0.5);
    const lows = Array.from({ length: n }, (_, i) => 9 + i * 0.5);
    const closes = Array.from({ length: n }, (_, i) => 9.5 + i * 0.5);
    const { atr, trueRange } = calculateATR(highs, lows, closes);
    expect(atr).toHaveLength(n);
    expect(trueRange).toHaveLength(n);
    // 首根 K 线没有前收，TR 从第 2 根起算
    expect(trueRange[0]).toBeNull();
  });

  it('空值期处理', () => {
    const n = 20;
    const highs = Array.from({ length: n }, () => 10);
    const lows = Array.from({ length: n }, () => 9);
    const closes = Array.from({ length: n }, () => 9.5);
    const { atr } = calculateATR(highs, lows, closes);
    // 前 period 个点为 null（含 index=period-1），首个 ATR 在 index=period
    expect(atr.slice(0, 14).every(v => v === null)).toBe(true);
    expect(atr[14]).not.toBeNull();
  });

  it('ATR为正数', () => {
    const n = 20;
    const highs = Array.from({ length: n }, (_, i) => 10 + i * 0.1 + 0.3 * Math.sin(i));
    const lows = Array.from({ length: n }, (_, i) => 9 + i * 0.1 - 0.2 * Math.cos(i));
    const closes = Array.from({ length: n }, (_, i) => 9.5 + i * 0.1 + 0.1 * Math.sin(i * 1.3));
    const { atr } = calculateATR(highs, lows, closes);
    const valid = atr.filter((v): v is number => v !== null);
    expect(valid.length).toBeGreaterThan(0);
    expect(valid.every(v => v > 0)).toBe(true);
  });

  it('长度不一致时不抛错且按收盘价长度返回预热 null', () => {
    // 生产实现不校验三个数组等长：以 closeData.length 为准，缺失的 high/low 产生 NaN TR，
    // 但不抛错；数据不足 period 时 atr 全为 null。
    const { atr, trueRange } = calculateATR([10], [9], [9, 9.5]);
    expect(atr).toHaveLength(2);
    expect(atr.every(v => v === null)).toBe(true);
    expect(trueRange[0]).toBeNull();
  });

  it('平坦数据ATR很小', () => {
    const n = 20;
    const highs = new Array(n).fill(10.01);
    const lows = new Array(n).fill(9.99);
    const closes = new Array(n).fill(10);
    const { atr } = calculateATR(highs, lows, closes);
    const lastAtr = atr.filter(v => v !== null).pop();
    expect(lastAtr).toBeCloseTo(0.02, 2);
  });
});

// 未迁移：backend/src/indicators/technical.ts 无 CCI 生产实现（后端其余代码也无）。
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

// 未迁移：backend/src/indicators/technical.ts 无 WR 生产实现（后端其余代码也无）。
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
