import { describe, it, expect } from 'vitest';
import {
  slidingWindowAggregate,
  detectAnomalyZScore,
  detectAnomalyIQR,
  ewma,
  detectChangePoint,
  StreamEvent,
  WindowConfig,
} from '../utils/streamProcessingEngine';

function makeEvents(n = 100): StreamEvent[] {
  return Array.from({ length: n }, (_, i) => ({
    timestamp: i,
    value: 100 + Math.sin(i * 0.1) * 10 + Math.random() * 5,
  }));
}

describe('Stream Processing Engine', () => {
  describe('slidingWindowAggregate', () => {
    it('应聚合翻滚窗口', () => {
      const config: WindowConfig = { size: 10, slide: 10, type: 'tumbling' };
      const result = slidingWindowAggregate(makeEvents(50), config);
      expect(result.length).toBeGreaterThan(0);
      result.forEach(r => {
        expect(r.count).toBeGreaterThan(0);
        expect(r.mean).toBeGreaterThan(0);
        expect(r.min).toBeLessThanOrEqual(r.max);
      });
    });

    it('应聚合滑动窗口', () => {
      const config: WindowConfig = { size: 20, slide: 10, type: 'sliding' };
      const result = slidingWindowAggregate(makeEvents(50), config);
      expect(result.length).toBeGreaterThan(0);
    });

    it('应计算分位数', () => {
      const config: WindowConfig = { size: 20, slide: 20, type: 'tumbling' };
      const result = slidingWindowAggregate(makeEvents(40), config);
      result.forEach(r => {
        expect(r.p95).toBeGreaterThanOrEqual(r.median);
        expect(r.p99).toBeGreaterThanOrEqual(r.p95);
      });
    });

    it('应处理空数据', () => {
      const config: WindowConfig = { size: 10, slide: 10, type: 'tumbling' };
      const result = slidingWindowAggregate([], config);
      expect(result.length).toBe(0);
    });
  });

  describe('detectAnomalyZScore', () => {
    it('应检测正常值', () => {
      const history = Array.from({ length: 100 }, () => 100 + Math.random() * 5);
      const result = detectAnomalyZScore(102, history);
      expect(result.isAnomaly).toBe(false);
    });

    it('应检测异常值', () => {
      const history = Array.from({ length: 100 }, () => 100 + Math.random() * 2);
      const result = detectAnomalyZScore(200, history, 3);
      expect(result.isAnomaly).toBe(true);
      expect(result.deviation).toBeGreaterThan(3);
    });

    it('应计算异常分数', () => {
      const history = Array.from({ length: 100 }, () => 100 + Math.random() * 5);
      const result = detectAnomalyZScore(150, history);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });

    it('应返回预期范围', () => {
      const history = Array.from({ length: 100 }, () => 100 + Math.random() * 5);
      const result = detectAnomalyZScore(102, history);
      expect(result.expectedRange[0]).toBeLessThan(result.expectedRange[1]);
    });
  });

  describe('detectAnomalyIQR', () => {
    it('应检测IQR异常', () => {
      const history = Array.from({ length: 100 }, () => 100 + Math.random() * 5);
      const result = detectAnomalyIQR(200, history);
      expect(result.isAnomaly).toBe(true);
    });

    it('正常值不应触发异常', () => {
      const history = Array.from({ length: 100 }, () => 100 + Math.random() * 5);
      const result = detectAnomalyIQR(102, history);
      expect(result.isAnomaly).toBe(false);
    });
  });

  describe('ewma', () => {
    it('应计算指数加权平均', () => {
      const result = ewma(makeEvents(20), 0.3);
      expect(result.length).toBe(20);
    });

    it('首值应等于原始首值', () => {
      const events = makeEvents(10);
      const result = ewma(events, 0.3);
      expect(result[0]).toBe(events[0].value);
    });

    it('应平滑数据', () => {
      const events = makeEvents(20);
      const result = ewma(events, 0.1);
      const lastDiff = Math.abs(result[result.length - 1] - events[events.length - 1].value);
      expect(lastDiff).toBeLessThan(10); // 应该被平滑
    });
  });

  describe('detectChangePoint', () => {
    it('应检测均值变化', () => {
      const series = [
        ...Array.from({ length: 50 }, () => 100 + Math.random() * 2),
        ...Array.from({ length: 50 }, () => 120 + Math.random() * 2),
      ];
      const result = detectChangePoint(series, 5);
      expect(result.length).toBeGreaterThan(0);
    });

    it('稳定序列不应有变点', () => {
      const series = Array.from({ length: 30 }, () => 100);
      const result = detectChangePoint(series, 5);
      expect(result.length).toBe(0);
    });

    it('应返回变点方向', () => {
      const series = [
        ...Array.from({ length: 50 }, () => 100),
        ...Array.from({ length: 50 }, () => 130),
      ];
      const result = detectChangePoint(series, 5);
      if (result.length > 0) {
        expect(['increase', 'decrease']).toContain(result[0].type);
      }
    });
  });
});
