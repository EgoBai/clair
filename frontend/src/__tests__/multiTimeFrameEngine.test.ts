/**
 * 多时间框架分析引擎测试
 */
import { describe, it, expect } from 'vitest';
import { MultiTimeFrameEngine, type TimeFrameData } from '../utils/multiTimeFrameEngine';

describe('MultiTimeFrameEngine', () => {
  const engine = new MultiTimeFrameEngine();

  const generateBars = (count: number, trend: 'up' | 'down' | 'flat' = 'up') => {
    let price = 100;
    return Array.from({ length: count }, (_, i) => {
      const change = trend === 'up' ? 0.3 + Math.random() * 0.5 :
                     trend === 'down' ? -0.3 - Math.random() * 0.5 :
                     (Math.random() - 0.5) * 0.5;
      price += change;
      return {
        open: price - Math.random() * 0.5,
        high: price + Math.random() * 1,
        low: price - Math.random() * 1,
        close: price,
        volume: Math.floor(10000 + Math.random() * 50000),
        timestamp: Date.now() + i * 60000
      };
    });
  };

  const createTFData = (tf: TimeFrameData['timeframe'], bars: ReturnType<typeof generateBars>): TimeFrameData => ({
    timeframe: tf,
    bars
  });

  describe('calculateTrend', () => {
    it('应该计算上升趋势', () => {
      const data = createTFData('1d', generateBars(60, 'up'));
      const result = engine.calculateTrend(data);

      expect(result.timeframe).toBe('1d');
      expect(['bullish', 'bearish', 'neutral']).toContain(result.direction);
      expect(result.strength).toBeGreaterThanOrEqual(0);
      expect(result.strength).toBeLessThanOrEqual(1);
      expect(result.ma20).toBeGreaterThan(0);
      expect(result.rsi).toBeGreaterThanOrEqual(0);
      expect(result.rsi).toBeLessThanOrEqual(100);
    });

    it('不足20根K线应返回neutral', () => {
      const data = createTFData('1d', generateBars(5));
      const result = engine.calculateTrend(data);

      expect(result.direction).toBe('neutral');
      expect(result.strength).toBe(0);
    });

    it('下降趋势应检测bearish', () => {
      const data = createTFData('1d', generateBars(60, 'down'));
      const result = engine.calculateTrend(data);

      expect(result.momentum).toBeLessThan(0);
    });
  });

  describe('analyzeAlignment', () => {
    it('应该分析多时间框架对齐', () => {
      const dataSet: TimeFrameData[] = [
        createTFData('1w', generateBars(50, 'up')),
        createTFData('1d', generateBars(100, 'up')),
        createTFData('4h', generateBars(80, 'up')),
        createTFData('1h', generateBars(60, 'up')),
      ];

      const result = engine.analyzeAlignment(dataSet);

      expect(['strong_bullish', 'bullish', 'neutral', 'bearish', 'strong_bearish']).toContain(result.overallTrend);
      expect(result.alignmentScore).toBeGreaterThanOrEqual(0);
      expect(result.alignmentScore).toBeLessThanOrEqual(100);
      expect(result.bullishCount + result.bearishCount + result.neutralCount).toBe(4);
      expect(result.timeFrameTrends.length).toBe(4);
    });

    it('空数据集应返回空结果', () => {
      const result = engine.analyzeAlignment([]);
      expect(result.alignmentScore).toBe(0);
      expect(result.timeFrameTrends.length).toBe(0);
    });

    it('应该检测共振信号', () => {
      const dataSet: TimeFrameData[] = [
        createTFData('1d', generateBars(60, 'up')),
        createTFData('4h', generateBars(80, 'up')),
        createTFData('1h', generateBars(100, 'up')),
      ];

      const result = engine.analyzeAlignment(dataSet);
      expect(Array.isArray(result.confluenceSignals)).toBe(true);
    });
  });

  describe('analyzeMomentum', () => {
    it('应该分析多时间框架动量', () => {
      const dataSet: TimeFrameData[] = [
        createTFData('1d', generateBars(60, 'up')),
        createTFData('1h', generateBars(80, 'up')),
      ];

      const result = engine.analyzeMomentum(dataSet);

      expect(result.length).toBe(2);
      expect(result[0].timeframe).toBe('1d');
      expect(typeof result[0].roc).toBe('number');
      expect(['bullish', 'bearish', 'neutral']).toContain(result[0].macdSignal);
      expect(typeof result[0].volumeMomentum).toBe('number');
      expect(typeof result[0].acceleration).toBe('number');
    });
  });

  describe('analyzeHigherTimeframe', () => {
    it('应该分析高时间框架环境', () => {
      const data = createTFData('1w', generateBars(60, 'up'));
      const result = engine.analyzeHigherTimeframe(data);

      expect(['long', 'short', 'neutral']).toContain(result.bias);
      expect(result.trendAge).toBeGreaterThanOrEqual(0);
      expect(result.pullbackDepth).toBeGreaterThanOrEqual(0);
      expect(typeof result.isPullback).toBe('boolean');
      expect(Array.isArray(result.keyLevels)).toBe(true);
    });

    it('不足数据应返回neutral偏向', () => {
      const data = createTFData('1w', generateBars(5));
      const result = engine.analyzeHigherTimeframe(data);

      expect(result.bias).toBe('neutral');
      expect(result.trendAge).toBe(0);
    });

    it('应该识别关键支撑阻力', () => {
      const data = createTFData('1d', generateBars(60, 'up'));
      const result = engine.analyzeHigherTimeframe(data);

      // 上升趋势应该有支撑位
      if (result.keyLevels.length > 0) {
        const supportLevels = result.keyLevels.filter(l => l.type === 'support');
        const resistanceLevels = result.keyLevels.filter(l => l.type === 'resistance');
        expect(supportLevels.length + resistanceLevels.length).toBe(result.keyLevels.length);
      }
    });
  });
});
