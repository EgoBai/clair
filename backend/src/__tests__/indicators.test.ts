/**
 * 技术指标计算 - 单元测试
 * 金融软件测试最佳实践：边界条件、数值精度、大数据量
 */

import { describe, it, expect } from 'vitest';
import {
  calculateMA,
  calculateEMA,
  calculateMACD,
  calculateRSI,
  calculateKDJ,
  calculateBollingerBands,
  calculateAllIndicators,
  OHLCV,
} from '../indicators/technical';

// ==================== 测试数据 ====================

const sampleCloses = [10, 11, 12, 11, 13, 14, 15, 14, 16, 17, 18, 16, 15, 14, 13, 15, 17, 19, 20, 21];

function generateOHLCV(count: number): OHLCV[] {
  const data: OHLCV[] = [];
  let price = 100;
  for (let i = 0; i < count; i++) {
    const open = price;
    const change = (Math.random() - 0.5) * 4;
    const close = open + change;
    const high = Math.max(open, close) + Math.random() * 2;
    const low = Math.min(open, close) - Math.random() * 2;
    data.push({
      tradeDate: `2026-01-${String(i + 1).padStart(2, '0')}`,
      open: parseFloat(open.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      volume: Math.floor(Math.random() * 1000000),
    });
    price = close;
  }
  return data;
}

// ==================== MA 测试 ====================

describe('calculateMA', () => {
  it('应该正确计算5日均线', () => {
    const result = calculateMA(sampleCloses, 5);
    expect(result).toHaveLength(sampleCloses.length);

    // 前4个应为null
    expect(result[0]).toBeNull();
    expect(result[3]).toBeNull();

    // 第5个: (10+11+12+11+13)/5 = 11.4
    expect(result[4]).toBeCloseTo(11.4, 2);
  });

  it('周期为1应该等于原数据', () => {
    const result = calculateMA(sampleCloses, 1);
    result.forEach((val, i) => {
      expect(val).toBeCloseTo(sampleCloses[i], 2);
    });
  });

  it('空数组应该返回空数组', () => {
    const result = calculateMA([], 5);
    expect(result).toHaveLength(0);
  });

  it('数据不足应该返回null', () => {
    const result = calculateMA([1, 2], 5);
    expect(result).toEqual([null, null]);
  });

  it('应该处理所有相同值', () => {
    const result = calculateMA([10, 10, 10, 10, 10], 3);
    expect(result[4]).toBe(10);
  });
});

// ==================== EMA 测试 ====================

describe('calculateEMA', () => {
  it('应该正确计算EMA', () => {
    const result = calculateEMA(sampleCloses, 12);
    expect(result).toHaveLength(sampleCloses.length);

    // 前11个应为null
    for (let i = 0; i < 11; i++) {
      expect(result[i]).toBeNull();
    }

    // 第12个应该是SMA
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += sampleCloses[i];
    expect(result[11]).toBeCloseTo(sum / 12, 2);
  });

  it('EMA应该对近期数据赋更高权重', () => {
    const increasingData = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    const result = calculateEMA(increasingData, 5);

    // EMA应该跟随趋势上升
    const last3 = result.slice(-3);
    for (let i = 1; i < last3.length; i++) {
      expect(last3[i]).toBeGreaterThan(last3[i - 1]!);
    }
  });
});

// ==================== MACD 测试 ====================

describe('calculateMACD', () => {
  it('应该返回三个数组', () => {
    const result = calculateMACD(sampleCloses);
    expect(result.macd).toHaveLength(sampleCloses.length);
    expect(result.signal).toHaveLength(sampleCloses.length);
    expect(result.histogram).toHaveLength(sampleCloses.length);
  });

  it('Histogram = MACD - Signal', () => {
    const result = calculateMACD(sampleCloses);
    for (let i = 0; i < sampleCloses.length; i++) {
      if (result.macd[i] !== null && result.signal[i] !== null) {
        expect(result.histogram[i]).toBeCloseTo(
          result.macd[i]! - result.signal[i]!,
          3
        );
      }
    }
  });

  it('应该支持自定义参数', () => {
    const result = calculateMACD(sampleCloses, 5, 10, 3);
    // 更短的周期应该更早产生非null值
    const firstNonNull = result.macd.findIndex(v => v !== null);
    expect(firstNonNull).toBeLessThan(25);
  });

  it('大数据量不应该出错', () => {
    const bigData = Array.from({ length: 500 }, (_, i) => 100 + Math.sin(i / 10) * 20);
    const result = calculateMACD(bigData);
    expect(result.macd).toHaveLength(500);
  });
});

// ==================== RSI 测试 ====================

describe('calculateRSI', () => {
  it('RSI值应该在0-100之间', () => {
    const result = calculateRSI(sampleCloses, 14);
    result.forEach(val => {
      if (val !== null) {
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(100);
      }
    });
  });

  it('持续上涨RSI应该接近100', () => {
    const rising = Array.from({ length: 30 }, (_, i) => i + 1);
    const result = calculateRSI(rising, 14);
    const lastVal = result[result.length - 1];
    expect(lastVal).toBeGreaterThan(80);
  });

  it('持续下跌RSI应该接近0', () => {
    const falling = Array.from({ length: 30 }, (_, i) => 100 - i);
    const result = calculateRSI(falling, 14);
    const lastVal = result[result.length - 1];
    expect(lastVal).toBeLessThan(20);
  });

  it('数据不足应该返回null', () => {
    const result = calculateRSI([1, 2, 3], 14);
    result.forEach(val => expect(val).toBeNull());
  });
});

// ==================== KDJ 测试 ====================

describe('calculateKDJ', () => {
  it('应该返回K、D、J三个数组', () => {
    const high = sampleCloses.map(v => v + 1);
    const low = sampleCloses.map(v => v - 1);
    const result = calculateKDJ(high, low, sampleCloses);

    expect(result.k).toHaveLength(sampleCloses.length);
    expect(result.d).toHaveLength(sampleCloses.length);
    expect(result.j).toHaveLength(sampleCloses.length);
  });

  it('J = 3K - 2D', () => {
    const high = sampleCloses.map(v => v + 1);
    const low = sampleCloses.map(v => v - 1);
    const result = calculateKDJ(high, low, sampleCloses);

    for (let i = 0; i < sampleCloses.length; i++) {
      if (result.k[i] !== null && result.d[i] !== null) {
        expect(result.j[i]).toBeCloseTo(
          3 * result.k[i]! - 2 * result.d[i]!,
          3
        );
      }
    }
  });

  it('K和D值应该在合理范围内', () => {
    const high = sampleCloses.map(v => v + 2);
    const low = sampleCloses.map(v => v - 2);
    const result = calculateKDJ(high, low, sampleCloses);

    result.k.forEach(val => {
      if (val !== null) {
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(100);
      }
    });
  });
});

// ==================== 布林带测试 ====================

describe('calculateBollingerBands', () => {
  it('应该返回上轨、中轨、下轨', () => {
    const result = calculateBollingerBands(sampleCloses, 5);
    expect(result.upper).toHaveLength(sampleCloses.length);
    expect(result.middle).toHaveLength(sampleCloses.length);
    expect(result.lower).toHaveLength(sampleCloses.length);
  });

  it('上轨应该 >= 中轨 >= 下轨', () => {
    const result = calculateBollingerBands(sampleCloses, 5);
    for (let i = 0; i < sampleCloses.length; i++) {
      if (result.upper[i] !== null) {
        expect(result.upper[i]).toBeGreaterThanOrEqual(result.middle[i]!);
        expect(result.middle[i]).toBeGreaterThanOrEqual(result.lower[i]!);
      }
    }
  });

  it('标准差为0时上下轨应该等于中轨', () => {
    const flat = [10, 10, 10, 10, 10, 10, 10, 10, 10, 10];
    const result = calculateBollingerBands(flat, 5);
    const idx = 9;
    expect(result.upper[idx]).toBeCloseTo(result.middle[idx]!, 2);
    expect(result.lower[idx]).toBeCloseTo(result.middle[idx]!, 2);
  });
});

// ==================== 综合测试 ====================

describe('calculateAllIndicators', () => {
  it('应该返回与输入相同长度的结果', () => {
    const data = generateOHLCV(100);
    const result = calculateAllIndicators(data);
    expect(result).toHaveLength(100);
  });

  it('每条记录应该包含所有指标字段', () => {
    const data = generateOHLCV(80);
    const result = calculateAllIndicators(data);
    const last = result[result.length - 1];

    expect(last).toHaveProperty('tradeDate');
    expect(last).toHaveProperty('ma5');
    expect(last).toHaveProperty('ma10');
    expect(last).toHaveProperty('ma20');
    expect(last).toHaveProperty('ma60');
    expect(last).toHaveProperty('rsi');
    expect(last).toHaveProperty('macd');
    expect(last).toHaveProperty('macdSignal');
    expect(last).toHaveProperty('macdHistogram');
    expect(last).toHaveProperty('kdjK');
    expect(last).toHaveProperty('kdjD');
    expect(last).toHaveProperty('kdjJ');
    expect(last).toHaveProperty('bollUpper');
    expect(last).toHaveProperty('bollMiddle');
    expect(last).toHaveProperty('bollLower');
  });

  it('大数据量(500条)应该在合理时间内完成', () => {
    const data = generateOHLCV(500);
    const start = Date.now();
    calculateAllIndicators(data);
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(1000); // 1秒内
  });
});
