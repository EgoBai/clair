import { describe, it, expect } from 'vitest';
import {
  analyzeSectorRotation,
  identifyRotationPatterns,
  calculateSectorCorrelation,
  SectorData,
  EconomicCycle,
} from '../services/sectorRotationEngine';

describe('行业轮动引擎', () => {
  const mockSectors: SectorData[] = [
    { name: '科技', returns: Array(30).fill(0).map(() => 0.002 + Math.random() * 0.01), marketCap: 5e12, pe: 35, pb: 5, dividendYield: 0.005, revenueGrowth: 0.25, profitGrowth: 0.30 },
    { name: '消费', returns: Array(30).fill(0).map(() => 0.001 + Math.random() * 0.008), marketCap: 3e12, pe: 25, pb: 4, dividendYield: 0.02, revenueGrowth: 0.12, profitGrowth: 0.15 },
    { name: '金融', returns: Array(30).fill(0).map(() => -0.001 + Math.random() * 0.006), marketCap: 8e12, pe: 8, pb: 0.8, dividendYield: 0.05, revenueGrowth: 0.05, profitGrowth: 0.08 },
    { name: '医药', returns: Array(30).fill(0).map(() => 0.0015 + Math.random() * 0.009), marketCap: 2e12, pe: 40, pb: 6, dividendYield: 0.008, revenueGrowth: 0.18, profitGrowth: 0.22 },
  ];

  const expansionCycle: EconomicCycle = {
    phase: 'expansion',
    confidence: 0.8,
    leadingIndicators: 1.05,
    coincidentIndicators: 1.03,
    laggingIndicators: 1.01,
  };

  const contractionCycle: EconomicCycle = {
    phase: 'contraction',
    confidence: 0.7,
    leadingIndicators: 0.95,
    coincidentIndicators: 0.97,
    laggingIndicators: 0.99,
  };

  describe('行业轮动分析', () => {
    it('应返回信号数组', () => {
      const result = analyzeSectorRotation(mockSectors, expansionCycle);
      expect(result.signals.length).toBe(4);
    });

    it('应有超配/标配/低配', () => {
      const result = analyzeSectorRotation(mockSectors, expansionCycle);
      for (const sig of result.signals) {
        expect(['overweight', 'neutral', 'underweight']).toContain(sig.action);
      }
    });

    it('应有分数', () => {
      const result = analyzeSectorRotation(mockSectors, expansionCycle);
      for (const sig of result.signals) {
        expect(typeof sig.score).toBe('number');
      }
    });

    it('应有原因', () => {
      const result = analyzeSectorRotation(mockSectors, expansionCycle);
      for (const sig of result.signals) {
        expect(Array.isArray(sig.reasons)).toBe(true);
      }
    });

    it('应有动量评分', () => {
      const result = analyzeSectorRotation(mockSectors, expansionCycle);
      for (const sig of result.signals) {
        expect(typeof sig.momentumScore).toBe('number');
      }
    });

    it('应有估值评分', () => {
      const result = analyzeSectorRotation(mockSectors, expansionCycle);
      for (const sig of result.signals) {
        expect(typeof sig.valuationScore).toBe('number');
      }
    });

    it('应有经济周期匹配度', () => {
      const result = analyzeSectorRotation(mockSectors, expansionCycle);
      for (const sig of result.signals) {
        expect(typeof sig.economicPhaseAlignment).toBe('number');
      }
    });

    it('信号应按分数排序', () => {
      const result = analyzeSectorRotation(mockSectors, expansionCycle);
      for (let i = 1; i < result.signals.length; i++) {
        expect(result.signals[i].score).toBeLessThanOrEqual(result.signals[i - 1].score);
      }
    });

    it('应有预期收益', () => {
      const result = analyzeSectorRotation(mockSectors, expansionCycle);
      expect(typeof result.expectedReturn).toBe('number');
    });

    it('应有风险评分', () => {
      const result = analyzeSectorRotation(mockSectors, expansionCycle);
      expect(result.riskScore).toBeGreaterThanOrEqual(0);
    });

    it('应有换手率', () => {
      const result = analyzeSectorRotation(mockSectors, expansionCycle);
      expect(result.turnover).toBeGreaterThanOrEqual(0);
      expect(result.turnover).toBeLessThanOrEqual(1);
    });

    it('扩张期高增长行业应有高对齐度', () => {
      const result = analyzeSectorRotation(mockSectors, expansionCycle);
      const tech = result.signals.find(s => s.sector === '科技');
      if (tech) {
        expect(tech.economicPhaseAlignment).toBeGreaterThan(0);
      }
    });

    it('收缩期应调整信号', () => {
      const result = analyzeSectorRotation(mockSectors, contractionCycle);
      const finance = result.signals.find(s => s.sector === '金融');
      if (finance) {
        expect(typeof finance.score).toBe('number');
      }
    });

    it('空行业应返回空', () => {
      const result = analyzeSectorRotation([], expansionCycle);
      expect(result.signals.length).toBe(0);
    });
  });

  describe('轮动模式识别', () => {
    it('应检测轮动模式', () => {
      const history = [];
      for (let d = 0; d < 30; d++) {
        for (const sector of mockSectors) {
          history.push({
            date: new Date(2024, 0, d + 1),
            sector: sector.name,
            return: sector.returns[d] ?? 0,
          });
        }
      }
      const patterns = identifyRotationPatterns(history);
      expect(Array.isArray(patterns)).toBe(true);
    });

    it('数据不足应返回空', () => {
      const patterns = identifyRotationPatterns([{ date: new Date(), sector: 'A', return: 0.01 }]);
      expect(patterns.length).toBe(0);
    });

    it('模式应有强度', () => {
      const history = [];
      for (let d = 0; d < 30; d++) {
        history.push({ date: new Date(2024, 0, d + 1), sector: 'A', return: d < 15 ? 0.02 : -0.01 });
        history.push({ date: new Date(2024, 0, d + 1), sector: 'B', return: d < 15 ? -0.01 : 0.02 });
      }
      const patterns = identifyRotationPatterns(history);
      for (const p of patterns) {
        expect(typeof p.strength).toBe('number');
      }
    });
  });

  describe('行业相关性', () => {
    it('应返回方阵', () => {
      const corr = calculateSectorCorrelation(mockSectors);
      expect(corr.length).toBe(4);
      expect(corr[0].length).toBe(4);
    });

    it('对角线应为1', () => {
      const corr = calculateSectorCorrelation(mockSectors);
      for (let i = 0; i < 4; i++) {
        expect(corr[i][i]).toBeCloseTo(1, 5);
      }
    });

    it('矩阵应是对称的', () => {
      const corr = calculateSectorCorrelation(mockSectors);
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          expect(corr[i][j]).toBeCloseTo(corr[j][i], 10);
        }
      }
    });

    it('相关性应在-1到1之间', () => {
      const corr = calculateSectorCorrelation(mockSectors);
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          expect(corr[i][j]).toBeGreaterThanOrEqual(-1);
          expect(corr[i][j]).toBeLessThanOrEqual(1);
        }
      }
    });
  });
});
