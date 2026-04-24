import { describe, it, expect, beforeEach } from 'vitest';
import { MarketBreadthEngine, type BreadthData } from '../utils/marketBreadthEngine';

describe('MarketBreadthEngine', () => {
  let engine: MarketBreadthEngine;

  const createData = (overrides: Partial<BreadthData> = {}): BreadthData => ({
    advances: 2000,
    declines: 800,
    unchanged: 200,
    newHighs: 150,
    newLows: 30,
    upVolume: 500000,
    downVolume: 200000,
    totalVolume: 800000,
    date: '2024-01-15',
    ...overrides,
  });

  beforeEach(() => {
    engine = new MarketBreadthEngine();
  });

  describe('涨跌比', () => {
    it('应该计算涨跌家数比', () => {
      const result = engine.analyze(createData());
      expect(result.advanceDeclineRatio).toBeGreaterThan(1);
    });

    it('涨多跌少时比值大于1', () => {
      const result = engine.analyze(createData({ advances: 2500, declines: 500 }));
      expect(result.advanceDeclineRatio).toBe(5);
    });

    it('跌多涨少时比值小于1', () => {
      const result = engine.analyze(createData({ advances: 500, declines: 2500 }));
      expect(result.advanceDeclineRatio).toBeLessThan(1);
    });
  });

  describe('涨跌线', () => {
    it('应该累加涨跌线', () => {
      const r1 = engine.analyze(createData({ advances: 1500, declines: 1000 }), 0);
      expect(r1.advanceDeclineLine).toBe(500);

      const r2 = engine.analyze(createData({ advances: 1800, declines: 800 }), r1.advanceDeclineLine);
      expect(r2.advanceDeclineLine).toBe(1500);
    });
  });

  describe('新高新低比', () => {
    it('应该计算新高新低比', () => {
      const result = engine.analyze(createData({ newHighs: 100, newLows: 20 }));
      expect(result.newHighLowRatio).toBe(5);
    });
  });

  describe('成交量广度', () => {
    it('应该计算成交量广度', () => {
      const result = engine.analyze(createData({ upVolume: 600000, downVolume: 200000 }));
      expect(result.volumeBreadth).toBe(3);
    });
  });

  describe('McClellan振荡器', () => {
    it('应该计算McClellan值', () => {
      for (let i = 0; i < 50; i++) {
        engine.analyze(createData({ advances: 1500 + i * 10, declines: 1000 - i * 5 }));
      }
      const result = engine.analyze(createData());
      expect(typeof result.mcclellanOscillator).toBe('number');
    });
  });

  describe('Arms Index (TRIN)', () => {
    it('应该计算TRIN值', () => {
      const result = engine.analyze(createData());
      expect(result.armIndex).toBeGreaterThan(0);
    });

    it('强势市场TRIN应小于1', () => {
      const result = engine.analyze(createData({
        advances: 2500, declines: 500,
        upVolume: 700000, downVolume: 100000,
      }));
      expect(result.armIndex).toBeLessThan(1);
    });
  });

  describe('Breadth Thrust', () => {
    it('应该计算广度推力', () => {
      const result = engine.analyze(createData());
      expect(result.breadthThrust).toBeGreaterThan(0);
      expect(result.breadthThrust).toBeLessThanOrEqual(1);
    });
  });

  describe('综合信号', () => {
    it('强势市场应给出看涨信号', () => {
      const data = createData({
        advances: 2800, declines: 200,
        newHighs: 300, newLows: 5,
        upVolume: 750000, downVolume: 50000,
      });
      const result = engine.analyze(data);
      expect(result.signal).toBe('bullish');
    });

    it('弱势市场应给出看跌信号', () => {
      const data = createData({
        advances: 200, declines: 2800,
        newHighs: 5, newLows: 300,
        upVolume: 50000, downVolume: 750000,
      });
      const result = engine.analyze(data);
      expect(result.signal).toBe('bearish');
    });

    it('平衡市场应给出中性信号', () => {
      const data = createData({
        advances: 1500, declines: 1500,
        newHighs: 50, newLows: 50,
        upVolume: 400000, downVolume: 400000,
      });
      const result = engine.analyze(data);
      expect(result.signal).toBe('neutral');
    });
  });

  describe('重置', () => {
    it('应该清除历史数据', () => {
      engine.analyze(createData());
      engine.reset();
      const result = engine.analyze(createData());
      expect(result.advanceDeclineLine).toBe(createData().advances - createData().declines);
    });
  });
});
