import { describe, it, expect } from 'vitest';
import {
  detectPivots,
  detectImpulseWave,
  detectCorrectiveWave,
  calculateFibonacciLevels,
  projectNextWave,
  analyzeElliottWave,
  classifyWaveDegree,
  checkWaveAlternation,
  analyzeWaveChannel,
  type PricePoint,
  type PivotPoint,
  type ElliottWaveAnalysis,
} from '../utils/elliottWaveEngine';

/**
 * 波浪理论引擎测试 —— 导入真实模块 src/utils/elliottWaveEngine.ts
 *
 * 构造单调分段锯齿数据，使折点成为清晰的 pivot。
 */
function buildZigzag(levels: number[], step = 6): number[] {
  const prices: number[] = [];
  for (let i = 0; i < levels.length - 1; i++) {
    const start = levels[i];
    const end = levels[i + 1];
    for (let j = 0; j < step; j++) {
      prices.push(start + (end - start) * (j / step));
    }
  }
  prices.push(levels[levels.length - 1]);
  return prices;
}

describe('Elliott Wave Engine', () => {
  describe('detectPivots', () => {
    it('空数组返回空', () => {
      expect(detectPivots([])).toEqual([]);
    });

    it('短数据返回空数组', () => {
      expect(detectPivots([1, 2, 3])).toEqual([]);
    });

    it('在锯齿数据中识别交替的高低点并携带 significance', () => {
      const prices = buildZigzag([20, 10, 16, 14, 28, 20]);
      const pivots = detectPivots(prices);
      expect(pivots.length).toBeGreaterThanOrEqual(3);

      const byIndex = [...pivots].sort((a, b) => a.index - b.index);
      for (let i = 1; i < byIndex.length; i++) {
        expect(byIndex[i].type).not.toBe(byIndex[i - 1].type);
      }
      for (const p of pivots) {
        expect(p.significance).toBeGreaterThan(0);
        expect(['high', 'low']).toContain(p.type);
      }
    });
  });

  describe('calculateFibonacciLevels', () => {
    it('返回正确的回撤 / 扩展 / 投影价位', () => {
      const fib = calculateFibonacciLevels(100, 80);
      expect(fib.retracement[0.0]).toBeCloseTo(100);
      expect(fib.retracement[0.5]).toBeCloseTo(90);
      expect(fib.retracement[1.0]).toBeCloseTo(80);
      expect(fib.extension[1.618]).toBeCloseTo(67.64);
      expect(fib.projection[1.0]).toBeCloseTo(120);
      expect(fib.projection[2.0]).toBeCloseTo(140);
    });
  });

  describe('classifyWaveDegree', () => {
    it('根据涨跌幅百分比返回正确浪级', () => {
      expect(classifyWaveDegree(600, 100)).toBe('grand_supercycle');
      expect(classifyWaveDegree(300, 100)).toBe('supercycle');
      expect(classifyWaveDegree(150, 100)).toBe('cycle');
      expect(classifyWaveDegree(75, 100)).toBe('primary');
      expect(classifyWaveDegree(30, 100)).toBe('intermediate');
      expect(classifyWaveDegree(15, 100)).toBe('minor');
      expect(classifyWaveDegree(7, 100)).toBe('minute');
      expect(classifyWaveDegree(3, 100)).toBe('minuette');
      expect(classifyWaveDegree(1, 100)).toBe('subminuette');
    });
  });

  describe('checkWaveAlternation', () => {
    it('强交替返回 isAlternating=true', () => {
      const r = checkWaveAlternation({ start: 0, end: 10 }, { start: 0, end: 3 });
      expect(r.isAlternating).toBe(true);
      expect(r.description).toMatch(/Strong alternation/);
    });

    it('长度相近返回 isAlternating=false', () => {
      const r = checkWaveAlternation({ start: 0, end: 10 }, { start: 0, end: 10 });
      expect(r.isAlternating).toBe(false);
      expect(r.description).toMatch(/weak alternation/);
    });

    it('温和交替返回 isAlternating=true', () => {
      const r = checkWaveAlternation({ start: 0, end: 10 }, { start: 0, end: 5 });
      expect(r.isAlternating).toBe(true);
      expect(r.description).toMatch(/Moderate alternation/);
    });
  });

  describe('detectImpulseWave', () => {
    it('识别牛市推动浪 12345', () => {
      const pivots: PivotPoint[] = [
        { index: 0, price: 10, type: 'low', significance: 100 },
        { index: 6, price: 16, type: 'high', significance: 100 },
        { index: 12, price: 14, type: 'low', significance: 100 },
        { index: 18, price: 30, type: 'high', significance: 100 },
        { index: 24, price: 18, type: 'low', significance: 100 },
      ];
      const wave = detectImpulseWave(pivots, []);
      expect(wave).not.toBeNull();
      expect(wave!.type).toBe('impulse');
      expect(wave!.label).toBe('impulse-12345');
      expect(wave!.confidence).toBeGreaterThan(0.3);
    });

    it('不足 5 点返回 null', () => {
      const pivots: PivotPoint[] = [
        { index: 0, price: 10, type: 'low', significance: 100 },
        { index: 6, price: 16, type: 'high', significance: 100 },
      ];
      expect(detectImpulseWave(pivots, [])).toBeNull();
    });
  });

  describe('detectCorrectiveWave', () => {
    it('识别 ABC 之字修正浪', () => {
      const pivots: PivotPoint[] = [
        { index: 0, price: 10, type: 'low', significance: 100 },
        { index: 6, price: 18, type: 'high', significance: 100 },
        { index: 12, price: 12, type: 'low', significance: 100 },
      ];
      const wave = detectCorrectiveWave(pivots, []);
      expect(wave).not.toBeNull();
      expect(wave!.type).toBe('corrective');
      expect(wave!.label).toBe('corrective-ABC');
      expect(wave!.confidence).toBeGreaterThan(0);
    });

    it('不足 3 点返回 null', () => {
      const pivots: PivotPoint[] = [
        { index: 0, price: 10, type: 'low', significance: 100 },
      ];
      expect(detectCorrectiveWave(pivots, [])).toBeNull();
    });
  });

  describe('analyzeWaveChannel', () => {
    it('少于 3 点返回空通道', () => {
      const ch = analyzeWaveChannel([{ index: 0, price: 10, timestamp: 0 }]);
      expect(ch.upperChannel).toEqual([]);
      expect(ch.lowerChannel).toEqual([]);
      expect(ch.isBreakingUp).toBe(false);
      expect(ch.isBreakingDown).toBe(false);
    });

    it('3 点以上返回通道并判断突破', () => {
      const waves: PricePoint[] = [
        { index: 0, price: 10, timestamp: 0 },
        { index: 1, price: 20, timestamp: 1 },
        { index: 2, price: 15, timestamp: 2 },
      ];
      const ch = analyzeWaveChannel(waves);
      expect(ch.upperChannel.length).toBe(3);
      expect(ch.lowerChannel.length).toBe(3);
      expect(ch.isBreakingUp).toBe(false);
      expect(ch.isBreakingDown).toBe(false);
    });
  });

  describe('analyzeElliottWave', () => {
    it('对推动浪锯齿返回结构化 impulse 分析', () => {
      // low-high-low-high-low 五点推动结构（满足推动浪规则与置信度阈值）
      const prices = buildZigzag([20, 10, 16, 13, 24, 20, 26]);
      const analysis = analyzeElliottWave(prices);
      expect(analysis.pattern.type).toBe('impulse');
      expect(analysis.waves.length).toBe(1);
      expect(analysis.currentWave).toBe(5);
      expect(analysis.confidence).toBeGreaterThanOrEqual(0);
      expect(analysis.confidence).toBeLessThanOrEqual(1);
      expect(analysis.fibonacci.retracement).toBeTypeOf('object');
      expect(analysis.fibonacci.projection).toBeTypeOf('object');
      expect(Array.isArray(analysis.waveLabels)).toBe(true);
      expect(analysis.waveLabels.length).toBeGreaterThan(0);
      expect(typeof analysis.targetPrice).toBe('number');
      expect(typeof analysis.stopLoss).toBe('number');
    });

    it('对发展中形态返回 developing 结构且不抛错', () => {
      const prices = buildZigzag([20, 10, 16, 14, 28, 20]);
      const analysis = analyzeElliottWave(prices);
      expect(['impulse', 'corrective']).toContain(analysis.pattern.type);
      expect(analysis.pattern.isValid).toBeTypeOf('boolean');
    });
  });

  describe('projectNextWave', () => {
    const fib = calculateFibonacciLevels(100, 80);

    it('未完成推动浪预期向上延续', () => {
      const analysis: ElliottWaveAnalysis = {
        pattern: { type: 'impulse', subtype: 'motive', degree: 'minor', isComplete: false, isValid: true },
        waves: [],
        fibonacci: fib,
        currentWave: 3,
        nextExpectedDirection: 'up',
        targetPrice: 120,
        stopLoss: 80,
        confidence: 0.8,
        invalidationPrice: 80,
        waveLabels: ['1', '2', '3'],
      };
      const r = projectNextWave(analysis, 90);
      expect(r.direction).toBe('up');
      expect(r.target).toBeGreaterThan(90);
      expect(r.probability).toBeGreaterThan(0);
    });

    it('完成推动浪预期向下修正', () => {
      const analysis: ElliottWaveAnalysis = {
        pattern: { type: 'impulse', subtype: 'motive', degree: 'minor', isComplete: true, isValid: true },
        waves: [],
        fibonacci: fib,
        currentWave: 5,
        nextExpectedDirection: 'down',
        targetPrice: 90,
        stopLoss: 80,
        confidence: 0.8,
        invalidationPrice: 80,
        waveLabels: ['1', '2', '3', '4', '5'],
      };
      const r = projectNextWave(analysis, 90);
      expect(r.direction).toBe('down');
      expect(r.target).toBeLessThan(90);
    });
  });
});
