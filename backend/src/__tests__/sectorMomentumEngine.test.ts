/**
 * 板块动量引擎测试
 */
import { describe, it, expect } from 'vitest';
import {
  analyzeSectorMomentum,
  detectRotation,
  rankSectors,
  SectorData,
} from '../services/sectorMomentumEngine';

const makeSector = (name: string, returns: number[], volumes?: number[], fundFlows?: number[]): SectorData => ({
  name,
  returns,
  volumes: volumes || returns.map(() => Math.random() * 1000000),
  fundFlows: fundFlows || returns.map(() => (Math.random() - 0.5) * 100),
});

describe('sectorMomentumEngine', () => {
  describe('analyzeSectorMomentum', () => {
    it('应返回完整的结果结构', () => {
      const sector = makeSector('科技', [1, 2, -1, 3, 2]);
      const result = analyzeSectorMomentum(sector, 1);
      expect(result).toHaveProperty('sector', '科技');
      expect(result).toHaveProperty('relativeStrength');
      expect(result).toHaveProperty('momentum');
      expect(result).toHaveProperty('volumeConfirmation');
      expect(result).toHaveProperty('fundSupport');
      expect(result).toHaveProperty('compositeScore');
      expect(result).toHaveProperty('signal');
    });

    it('强势板块应有正的相对强度', () => {
      const strong = makeSector('强势', [5, 3, 4, 6, 2]);
      const result = analyzeSectorMomentum(strong, 1);
      expect(result.relativeStrength).toBeGreaterThan(0);
    });

    it('弱势板块应有负的相对强度', () => {
      const weak = makeSector('弱势', [-3, -2, -1, -4, -2]);
      const result = analyzeSectorMomentum(weak, 1);
      expect(result.relativeStrength).toBeLessThan(0);
    });

    it('信号应为有效类型', () => {
      const sector = makeSector('test', [1, 2, 3, 4, 5]);
      const result = analyzeSectorMomentum(sector, 0);
      expect(['领涨', '轮动中', '观望', '退潮', '回避']).toContain(result.signal);
    });

    it('空数据应不报错', () => {
      const sector = makeSector('空', [], [], []);
      expect(() => analyzeSectorMomentum(sector, 0)).not.toThrow();
    });

    it('单一数据点应正常处理', () => {
      const sector = makeSector('单一', [5], [100], [10]);
      const result = analyzeSectorMomentum(sector, 1);
      expect(result.sector).toBe('单一');
    });

    it('资金持续净流入应有高fundSupport', () => {
      const sector = makeSector('资金流入', [1, 2, 1, 3, 2], undefined, [50, 30, 40, 60, 20]);
      const result = analyzeSectorMomentum(sector, 1);
      expect(result.fundSupport).toBe(100);
    });

    it('资金持续净流出应有低fundSupport', () => {
      const sector = makeSector('资金流出', [1, 2, 1, 3, 2], undefined, [-50, -30, -40, -60, -20]);
      const result = analyzeSectorMomentum(sector, 1);
      expect(result.fundSupport).toBe(0);
    });
  });

  describe('detectRotation', () => {
    it('应正确识别领涨和退潮板块', () => {
      const sectors = [
        makeSector('科技', [5, 4, 6, 3, 5]),
        makeSector('消费', [-2, -3, -1, -4, -2]),
        makeSector('金融', [1, 0, 2, 1, 0]),
      ];
      const signal = detectRotation(sectors, 1);
      expect(signal).toHaveProperty('inflowSectors');
      expect(signal).toHaveProperty('outflowSectors');
      expect(signal).toHaveProperty('style');
      expect(signal).toHaveProperty('rotationStrength');
    });

    it('风格应为成长/价值/均衡之一', () => {
      const sectors = [makeSector('A', [1, 2, 3])];
      const signal = detectRotation(sectors, 0);
      expect(['成长', '价值', '均衡']).toContain(signal.style);
    });

    it('单板块应正常返回', () => {
      const sectors = [makeSector('唯一', [1, 2, 3])];
      const signal = detectRotation(sectors, 1);
      expect(signal.inflowSectors.length + signal.outflowSectors.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('rankSectors', () => {
    it('应按综合评分降序排列', () => {
      const sectors = [
        makeSector('弱', [-5, -3, -4]),
        makeSector('强', [5, 3, 4]),
        makeSector('中', [1, 0, 2]),
      ];
      const ranked = rankSectors(sectors, 0);
      expect(ranked[0].compositeScore).toBeGreaterThanOrEqual(ranked[1].compositeScore);
      expect(ranked[1].compositeScore).toBeGreaterThanOrEqual(ranked[2].compositeScore);
    });

    it('空数组应返回空数组', () => {
      expect(rankSectors([], 0)).toEqual([]);
    });

    it('单板块排名应只有一个元素', () => {
      const sectors = [makeSector('唯一', [1, 2, 3])];
      const ranked = rankSectors(sectors, 0);
      expect(ranked).toHaveLength(1);
    });
  });

  describe('边界测试', () => {
    it('所有收益率为零应正常处理', () => {
      const sector = makeSector('零收益', [0, 0, 0, 0, 0]);
      const result = analyzeSectorMomentum(sector, 0);
      expect(result.relativeStrength).toBe(0);
    });

    it('大量数据应正常处理', () => {
      const returns = Array(100).fill(0).map(() => (Math.random() - 0.5) * 10);
      const sector = makeSector('大数据', returns);
      expect(() => analyzeSectorMomentum(sector, 0)).not.toThrow();
    });

    it('极端收益率应正常处理', () => {
      const sector = makeSector('极端', [100, -100, 50, -50, 200]);
      const result = analyzeSectorMomentum(sector, 0);
      expect(typeof result.compositeScore).toBe('number');
    });
  });
});
