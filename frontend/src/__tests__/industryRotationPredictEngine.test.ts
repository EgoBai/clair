import { describe, it, expect } from 'vitest';
import { analyzeIndustryRotation, IndustryData } from '../utils/industryRotationPredictEngine';

describe('行业轮动预测引擎', () => {
  const industries: IndustryData[] = [
    { name: '科技', returns: Array.from({ length: 60 }, () => 0.002 + Math.random() * 0.02), marketCap: 5e12, peRatio: 35, pbRatio: 5 },
    { name: '消费', returns: Array.from({ length: 60 }, () => 0.001 + Math.random() * 0.015), marketCap: 3e12, peRatio: 25, pbRatio: 4 },
    { name: '金融', returns: Array.from({ length: 60 }, () => -0.001 + Math.random() * 0.012), marketCap: 8e12, peRatio: 8, pbRatio: 1 },
    { name: '医药', returns: Array.from({ length: 60 }, () => 0.0015 + Math.random() * 0.018), marketCap: 2e12, peRatio: 30, pbRatio: 4.5 },
    { name: '能源', returns: Array.from({ length: 60 }, () => -0.002 + Math.random() * 0.025), marketCap: 1e12, peRatio: 12, pbRatio: 1.5 },
  ];

  const benchmark = Array.from({ length: 60 }, () => 0.0005 + Math.random() * 0.01);

  it('应该生成轮动信号', () => {
    const result = analyzeIndustryRotation(industries, benchmark);
    expect(result.signals.length).toBe(5);
  });

  it('应该计算动量', () => {
    const result = analyzeIndustryRotation(industries, benchmark);
    for (const s of result.signals) {
      expect(typeof s.momentum).toBe('number');
    }
  });

  it('应该计算相对强弱', () => {
    const result = analyzeIndustryRotation(industries, benchmark);
    for (const s of result.signals) {
      expect(typeof s.relativeStrength).toBe('number');
    }
  });

  it('应该判断周期阶段', () => {
    const result = analyzeIndustryRotation(industries, benchmark);
    for (const s of result.signals) {
      expect(['leading', 'lagging', 'mature', 'recovering']).toContain(s.cyclePhase);
    }
  });

  it('应该给出配置建议', () => {
    const result = analyzeIndustryRotation(industries, benchmark);
    for (const s of result.signals) {
      expect(['overweight', 'neutral', 'underweight']).toContain(s.recommendation);
    }
  });

  it('应该返回TOP行业', () => {
    const result = analyzeIndustryRotation(industries, benchmark);
    expect(result.topIndustries.length).toBeLessThanOrEqual(5);
    if (result.topIndustries.length > 1) {
      expect(result.topIndustries[0].momentum).toBeGreaterThanOrEqual(result.topIndustries[1].momentum);
    }
  });

  it('应该返回底部行业', () => {
    const result = analyzeIndustryRotation(industries, benchmark);
    expect(result.bottomIndustries.length).toBeLessThanOrEqual(5);
  });

  it('应该计算轮动速度', () => {
    const result = analyzeIndustryRotation(industries, benchmark);
    expect(result.rotationSpeed).toBeGreaterThanOrEqual(0);
  });

  it('应该计算周期位置', () => {
    const result = analyzeIndustryRotation(industries, benchmark);
    expect(result.cyclePosition).toBeGreaterThanOrEqual(0);
    expect(result.cyclePosition).toBeLessThanOrEqual(1);
  });

  it('空数据应抛出错误', () => {
    expect(() => analyzeIndustryRotation([], benchmark)).toThrow();
  });

  it('应该计算置信度', () => {
    const result = analyzeIndustryRotation(industries, benchmark);
    for (const s of result.signals) {
      expect(s.confidence).toBeGreaterThanOrEqual(0);
      expect(s.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('应该计算估值分位', () => {
    const result = analyzeIndustryRotation(industries, benchmark);
    for (const s of result.signals) {
      expect(s.valuation).toBeGreaterThanOrEqual(0);
      expect(s.valuation).toBeLessThanOrEqual(1);
    }
  });
});
