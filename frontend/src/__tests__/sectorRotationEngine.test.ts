import { describe, it, expect } from 'vitest';
import { SectorRotationEngine } from '../utils/sectorRotationEngine';
import type { SectorRanking } from '../utils/sectorRotationEngine';

describe('SectorRotationEngine', () => {
  const engine = new SectorRotationEngine();

  describe('经济周期判断', () => {
    it('应该检测扩张期', () => {
      const result = engine.detectEconomicCycle(
        [3, 3.5, 4],    // GDP增长
        [2, 2.5, 3],    // 温和通胀
        [52, 53, 54],   // PMI > 50
        [1.5, 1.6],     // 收益率曲线
      );
      expect(result.phase).toBe('expansion');
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.indicators.length).toBeGreaterThan(0);
    });

    it('应该检测复苏期', () => {
      const result = engine.detectEconomicCycle(
        [0.5, 1, 1.5],   // GDP企稳
        [1, 1.5, 2],     // 低通胀
        [48, 49, 50],    // PMI触底
        [1.2, 1.3],
      );
      expect(result.phase).toBe('recovery');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('应该检测滞胀期', () => {
      const result = engine.detectEconomicCycle(
        [1, 1.5, 1],     // GDP放缓
        [5, 5.5, 6],     // 高通胀
        [51, 52, 53],
        [1.5, 1.4],
      );
      expect(result.phase).toBe('stagflation');
      expect(result.indicators).toContain('通胀上升');
    });

    it('应该检测衰退期', () => {
      const result = engine.detectEconomicCycle(
        [-1, -0.5, -1],  // GDP负增长
        [1, 1, 0.5],
        [45, 46, 47],    // PMI < 50
        [1.5, 1.3],
      );
      expect(result.phase).toBe('recession');
      expect(result.indicators).toContain('PMI<50');
    });

    it('应该返回置信度', () => {
      const result = engine.detectEconomicCycle([3], [2], [52], [1.5]);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('应该包含阶段持续月数', () => {
      const result = engine.detectEconomicCycle([3], [2], [52], [1.5]);
      expect(result.monthsInPhase).toBeGreaterThan(0);
    });
  });

  describe('板块排名', () => {
    it('应该按综合评分排序', () => {
      const momentumMap: Record<string, number> = { '科技': 80, '消费': 50, '金融': 30 };
      const valuationMap: Record<string, number> = { '科技': 30, '消费': 50, '金融': 70 };
      const fundFlowMap: Record<string, number> = { '科技': 70, '消费': 40, '金融': 20 };

      const rankings = engine.rankSectors(momentumMap, valuationMap, fundFlowMap);
      expect(rankings.length).toBe(10); // 10个板块
      expect(rankings[0].rank).toBe(1);
      // 科技应排在前面（高动量、低估值、高资金流）
      const techRank = rankings.find(r => r.sector === '科技');
      const financeRank = rankings.find(r => r.sector === '金融');
      expect(techRank!.rank).toBeLessThan(financeRank!.rank);
    });

    it('应该标记超配/低配信号', () => {
      const rankings = engine.rankSectors({}, {}, {});
      const overweight = rankings.filter(r => r.signal === 'overweight');
      const underweight = rankings.filter(r => r.signal === 'underweight');
      expect(overweight.length).toBe(3);  // 前3名
      expect(underweight.length).toBe(3); // 后3名
    });

    it('应该计算综合评分', () => {
      const rankings = engine.rankSectors(
        { '科技': 80 },
        { '科技': 20 },  // 低估值=高分
        { '科技': 60 },
      );
      const tech = rankings.find(r => r.sector === '科技');
      expect(tech!.compositeScore).toBeGreaterThan(0);
      expect(tech!.momentum).toBe(80);
      expect(tech!.valuation).toBe(20);
      expect(tech!.fundFlow).toBe(60);
    });

    it('缺失数据应使用默认值', () => {
      const rankings = engine.rankSectors({}, {}, {});
      expect(rankings.length).toBe(10);
      rankings.forEach(r => {
        expect(r.momentum).toBe(0);
        expect(r.valuation).toBe(50);
        expect(r.fundFlow).toBe(0);
      });
    });
  });

  describe('轮动信号', () => {
    it('应该生成轮动信号', () => {
      const rankings: SectorRanking[] = [
        { sector: '科技', momentum: 80, valuation: 20, fundFlow: 70, compositeScore: 85, rank: 1, signal: 'overweight' },
        { sector: '消费', momentum: 50, valuation: 50, fundFlow: 40, compositeScore: 50, rank: 5, signal: 'neutral' },
        { sector: '金融', momentum: 20, valuation: 80, fundFlow: 10, compositeScore: 15, rank: 10, signal: 'underweight' },
      ];

      const signals = engine.generateRotationSignals(rankings);
      expect(signals.length).toBeGreaterThan(0);
      expect(signals[0].fromSector).toBe('金融');
      expect(signals[0].toSector).toBe('科技');
      expect(signals[0].strength).toBeGreaterThan(20);
    });

    it('评分差不足20时不生成信号', () => {
      const rankings: SectorRanking[] = [
        { sector: '科技', momentum: 55, valuation: 45, fundFlow: 55, compositeScore: 55, rank: 1, signal: 'overweight' },
        { sector: '金融', momentum: 45, valuation: 55, fundFlow: 45, compositeScore: 45, rank: 10, signal: 'underweight' },
      ];

      const signals = engine.generateRotationSignals(rankings);
      expect(signals.length).toBe(0);
    });

    it('信号应包含预期收益差', () => {
      const rankings: SectorRanking[] = [
        { sector: '科技', momentum: 90, valuation: 10, fundFlow: 90, compositeScore: 95, rank: 1, signal: 'overweight' },
        { sector: '金融', momentum: 10, valuation: 90, fundFlow: 10, compositeScore: 5, rank: 10, signal: 'underweight' },
      ];

      const signals = engine.generateRotationSignals(rankings);
      expect(signals.length).toBeGreaterThan(0);
      expect(signals[0].expectedSpread).toBeGreaterThan(0);
    });

    it('信号应按强度排序', () => {
      const rankings: SectorRanking[] = [
        { sector: '科技', momentum: 90, valuation: 10, fundFlow: 90, compositeScore: 95, rank: 1, signal: 'overweight' },
        { sector: '消费', momentum: 80, valuation: 20, fundFlow: 80, compositeScore: 85, rank: 2, signal: 'overweight' },
        { sector: '地产', momentum: 15, valuation: 85, fundFlow: 15, compositeScore: 10, rank: 9, signal: 'underweight' },
        { sector: '金融', momentum: 10, valuation: 90, fundFlow: 10, compositeScore: 5, rank: 10, signal: 'underweight' },
      ];

      const signals = engine.generateRotationSignals(rankings);
      for (let i = 1; i < signals.length; i++) {
        expect(signals[i - 1].strength).toBeGreaterThanOrEqual(signals[i].strength);
      }
    });
  });

  describe('配置建议', () => {
    it('应该生成配置建议', () => {
      const rankings: SectorRanking[] = [
        { sector: '科技', momentum: 80, valuation: 20, fundFlow: 70, compositeScore: 85, rank: 1, signal: 'overweight' },
        { sector: '消费', momentum: 50, valuation: 50, fundFlow: 40, compositeScore: 50, rank: 5, signal: 'neutral' },
        { sector: '金融', momentum: 20, valuation: 80, fundFlow: 10, compositeScore: 15, rank: 10, signal: 'underweight' },
      ];

      const allocation = engine.suggestAllocation(rankings, { '科技': 0.3, '消费': 0.4, '金融': 0.3 });
      expect(allocation.length).toBe(3);
      allocation.forEach(a => {
        expect(a.suggestedWeight).toBeGreaterThan(0);
        expect(typeof a.change).toBe('number');
        expect(a.reasoning).toBeTruthy();
      });
    });

    it('超配板块权重应高于低配板块', () => {
      const rankings: SectorRanking[] = [
        { sector: '科技', momentum: 80, valuation: 20, fundFlow: 70, compositeScore: 85, rank: 1, signal: 'overweight' },
        { sector: '金融', momentum: 20, valuation: 80, fundFlow: 10, compositeScore: 15, rank: 10, signal: 'underweight' },
      ];

      const allocation = engine.suggestAllocation(rankings, {});
      const techAlloc = allocation.find(a => a.sector === '科技')!;
      const financeAlloc = allocation.find(a => a.sector === '金融')!;
      expect(techAlloc.suggestedWeight).toBeGreaterThan(financeAlloc.suggestedWeight);
    });

    it('应计算权重变化量', () => {
      const rankings: SectorRanking[] = [
        { sector: '科技', momentum: 80, valuation: 20, fundFlow: 70, compositeScore: 85, rank: 1, signal: 'overweight' },
      ];

      const allocation = engine.suggestAllocation(rankings, { '科技': 0.5 });
      expect(allocation[0].change).not.toBe(0);
    });

    it('无当前权重时使用0', () => {
      const rankings: SectorRanking[] = [
        { sector: '科技', momentum: 80, valuation: 20, fundFlow: 70, compositeScore: 85, rank: 1, signal: 'overweight' },
      ];

      const allocation = engine.suggestAllocation(rankings, {});
      expect(allocation[0].currentWeight).toBe(0);
    });
  });

  describe('边界情况', () => {
    it('空数据不应报错', () => {
      expect(() => engine.rankSectors({}, {}, {})).not.toThrow();
      expect(() => engine.generateRotationSignals([])).not.toThrow();
      expect(() => engine.suggestAllocation([], {})).not.toThrow();
    });

    it('收益率曲线不足时不应报错', () => {
      expect(() => engine.detectEconomicCycle([], [], [], [])).not.toThrow();
    });

    it('单个板块排名', () => {
      const rankings = engine.rankSectors(
        { '科技': 50 },
        { '科技': 50 },
        { '科技': 50 },
      );
      expect(rankings.length).toBe(10); // 总是返回所有板块
    });
  });
});
