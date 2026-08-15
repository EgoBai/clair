import { describe, it, expect } from 'vitest';
import {
  findSupportResistance,
  detectPatterns,
  analyzeVolumePrice,
  type OHLCV,
} from '../utils/patternRecognition';

/**
 * 技术形态识别引擎测试 —— 直接驱动真实模块
 */

function bar(date: string, o: number, h: number, l: number, c: number, v: number): OHLCV {
  return { date, open: o, high: h, low: l, close: c, volume: v };
}

describe('findSupportResistance', () => {
  it('空数据应返回空数组', () => {
    expect(findSupportResistance([])).toEqual([]);
  });

  it('应基于价格聚类识别支撑与阻力位', () => {
    const ohlcv = [
      bar('1', 50, 60, 50, 55, 1000),
      bar('2', 50, 60, 50, 55, 1000),
      bar('3', 50, 60, 50, 55, 1000),
      bar('4', 90, 140, 90, 95, 1000),
      bar('5', 90, 140, 90, 95, 1000),
    ];
    const levels = findSupportResistance(ohlcv);
    // 每个价位簇至少被触及 2 次(minTouches 默认 2)
    expect(levels.length).toBeGreaterThanOrEqual(2);
    expect(levels.some((l) => l.type === 'support')).toBe(true);
    expect(levels.some((l) => l.type === 'resistance')).toBe(true);
  });

  it('价位应四舍五入到 2 位小数且按触及次数降序排列', () => {
    const ohlcv = [
      bar('1', 100, 110, 100, 105, 1000),
      bar('2', 100, 110, 100, 105, 1000),
      bar('3', 100, 110, 100, 105, 1000),
      bar('4', 105, 115, 105, 110, 1000),
      bar('5', 105, 115, 105, 110, 1000),
    ];
    const levels = findSupportResistance(ohlcv);
    for (const l of levels) {
      expect(l.level).toBe(Math.round(l.level * 100) / 100);
      expect(l.strength).toBeGreaterThanOrEqual(2);
    }
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i - 1].strength).toBeGreaterThanOrEqual(levels[i].strength);
    }
  });

  it('应尊重 minTouches 参数过滤弱价位', () => {
    const ohlcv = [
      bar('1', 100, 110, 100, 105, 1000),
      bar('2', 100, 110, 100, 105, 1000),
      bar('3', 105, 115, 105, 110, 1000),
      bar('4', 105, 115, 105, 110, 1000),
    ];
    // 每个价位簇只有 2 次触及, 提高阈值后应被过滤
    const strict = findSupportResistance(ohlcv, 3);
    expect(strict.every((l) => l.strength >= 3)).toBe(true);
  });
});

describe('detectPatterns', () => {
  it('数据不足 20 根时应返回空数组', () => {
    const ohlcv = Array.from({ length: 10 }, (_, i) =>
      bar(String(i), 100 + i, 105 + i, 95 + i, 100 + i, 1000)
    );
    expect(detectPatterns(ohlcv)).toEqual([]);
  });

  it('明确的上升趋势应识别出"上升趋势"形态', () => {
    const closes = Array.from({ length: 25 }, (_, i) => 100 + i * 2);
    const ohlcv = closes.map((c, i) =>
      bar(`d${i}`, c, c + 2, c - 2, c, 1000)
    );
    const patterns = detectPatterns(ohlcv);
    expect(Array.isArray(patterns)).toBe(true);
    expect(patterns.some((p) => p.pattern === '上升趋势' && p.direction === 'bullish')).toBe(true);
  });

  it('明确的下降趋势应识别出"下降趋势"形态', () => {
    const closes = Array.from({ length: 25 }, (_, i) => 200 - i * 2);
    const ohlcv = closes.map((c, i) =>
      bar(`d${i}`, c, c + 2, c - 2, c, 1000)
    );
    const patterns = detectPatterns(ohlcv);
    expect(patterns.some((p) => p.pattern === '下降趋势' && p.direction === 'bearish')).toBe(true);
  });
});

describe('analyzeVolumePrice', () => {
  it('数据不足 5 根时应返回空数组', () => {
    const ohlcv = Array.from({ length: 3 }, (_, i) =>
      bar(String(i), 100, 110, 90, 100 + i, 1000)
    );
    expect(analyzeVolumePrice(ohlcv)).toEqual([]);
  });

  it('放量上涨应产生 bullish 信号', () => {
    const ohlcv = [
      bar('1', 100, 110, 90, 100, 100),
      bar('2', 100, 110, 90, 100, 100),
      bar('3', 100, 110, 90, 100, 100),
      bar('4', 100, 110, 90, 100, 100),
      bar('5', 100, 110, 90, 101, 1000),
    ];
    const signals = analyzeVolumePrice(ohlcv);
    expect(signals.some((s) => s.type === 'bullish' && s.pattern === '放量上涨')).toBe(true);
  });

  it('缩量下跌应产生 bullish 信号(回调抛压减弱)', () => {
    const ohlcv = [
      bar('1', 100, 110, 90, 100, 1000),
      bar('2', 100, 110, 90, 100, 1000),
      bar('3', 100, 110, 90, 100, 1000),
      bar('4', 100, 110, 90, 100, 1000),
      bar('5', 100, 110, 90, 99, 100),
    ];
    const signals = analyzeVolumePrice(ohlcv);
    expect(signals.some((s) => s.pattern === '缩量下跌')).toBe(true);
  });
});
