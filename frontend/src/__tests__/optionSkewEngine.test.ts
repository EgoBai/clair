import { describe, it, expect } from 'vitest';
import { analyzeOptionSkew, OptionData } from '../utils/optionSkewEngine';

describe('期权偏度分析引擎', () => {
  const spotPrice = 100;
  const options: OptionData[] = [
    { strike: 90, callPrice: 12, putPrice: 2, callVolume: 100, putVolume: 300, callOI: 500, putOI: 800, iv: 0.30, delta: 0.8, gamma: 0.02, expiry: '2024-03-29' },
    { strike: 95, callPrice: 8, putPrice: 3.5, callVolume: 200, putVolume: 250, callOI: 600, putOI: 700, iv: 0.26, delta: 0.65, gamma: 0.03, expiry: '2024-03-29' },
    { strike: 100, callPrice: 5, putPrice: 5, callVolume: 500, putVolume: 200, callOI: 1000, putOI: 600, iv: 0.22, delta: 0.5, gamma: 0.04, expiry: '2024-03-29' },
    { strike: 105, callPrice: 2.5, putPrice: 8, callVolume: 300, putVolume: 100, callOI: 700, putOI: 400, iv: 0.25, delta: 0.35, gamma: 0.03, expiry: '2024-03-29' },
    { strike: 110, callPrice: 1, putPrice: 12, callVolume: 150, putVolume: 50, callOI: 400, putOI: 200, iv: 0.28, delta: 0.2, gamma: 0.02, expiry: '2024-03-29' },
  ];

  it('应计算PC比率', () => {
    const r = analyzeOptionSkew(options, spotPrice);
    expect(r.putCallRatio).toBeGreaterThan(0);
  });

  it('应计算偏度', () => {
    const r = analyzeOptionSkew(options, spotPrice);
    expect(typeof r.skew).toBe('number');
  });

  it('应判断情绪', () => {
    const r = analyzeOptionSkew(options, spotPrice);
    expect(['bearish', 'neutral', 'bullish']).toContain(r.sentiment);
  });

  it('应计算恐慌指数', () => {
    const r = analyzeOptionSkew(options, spotPrice);
    expect(r.fearIndex).toBeGreaterThanOrEqual(0);
    expect(r.fearIndex).toBeLessThanOrEqual(100);
  });

  it('应计算最大痛点', () => {
    const r = analyzeOptionSkew(options, spotPrice);
    expect(r.maxPain).toBeGreaterThan(0);
  });

  it('应判断波动率期限结构', () => {
    const r = analyzeOptionSkew(options, spotPrice);
    expect(['contango', 'backwardation', 'flat']).toContain(r.ivTermStructure);
  });

  it('应计算极端事件概率', () => {
    const r = analyzeOptionSkew(options, spotPrice);
    expect(r.extremeEventProbability).toBeGreaterThanOrEqual(0);
    expect(r.extremeEventProbability).toBeLessThanOrEqual(1);
  });

  it('应计算微笑宽度', () => {
    const r = analyzeOptionSkew(options, spotPrice);
    expect(typeof r.smileWidth).toBe('number');
  });

  it('数据不足应抛出错误', () => {
    expect(() => analyzeOptionSkew(options.slice(0, 2), spotPrice)).toThrow();
  });

  it('应输出关键洞察', () => {
    const r = analyzeOptionSkew(options, spotPrice);
    expect(Array.isArray(r.keyInsights)).toBe(true);
  });
});
