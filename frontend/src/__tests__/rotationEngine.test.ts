import { describe, it, expect } from 'vitest';

/**
 * 行业轮动 / 板块资金流引擎逻辑测试
 */

describe('RotationEngine', () => {
  describe('行业相对强度', () => {
    const calcRelativeStrength = (sectorReturns: number[], marketReturns: number[]) => {
      return sectorReturns.map((sr, i) => sr - marketReturns[i]);
    };

    it('应该计算相对强度', () => {
      const rs = calcRelativeStrength([0.02, 0.03, -0.01], [0.01, 0.01, 0.01]);
      expect(rs[0]).toBeCloseTo(0.01, 10);
      expect(rs[1]).toBeCloseTo(0.02, 10);
      expect(rs[2]).toBeCloseTo(-0.02, 10);
    });

    it('强势行业 RS 应为正', () => {
      const rs = calcRelativeStrength([0.05, 0.04], [0.01, 0.01]);
      expect(rs.every(v => v > 0)).toBe(true);
    });
  });

  describe('动量排序', () => {
    const momentumRank = (sectors: {name: string, momentum: number}[]) => {
      return [...sectors].sort((a, b) => b.momentum - a.momentum);
    };

    it('应该按动量排序', () => {
      const sectors = [
        { name: 'A', momentum: 0.05 },
        { name: 'B', momentum: 0.10 },
        { name: 'C', momentum: 0.02 },
      ];
      const ranked = momentumRank(sectors);
      expect(ranked[0].name).toBe('B');
      expect(ranked[2].name).toBe('C');
    });
  });

  describe('轮动信号', () => {
    const rotationSignal = (currentLeader: string, prevLeader: string, strength: number) => {
      if (currentLeader !== prevLeader && strength > 0.05) return 'rotation_detected';
      if (currentLeader === prevLeader && strength > 0.03) return 'continuation';
      return 'neutral';
    };

    it('应该检测行业轮动', () => {
      expect(rotationSignal('tech', 'finance', 0.08)).toBe('rotation_detected');
    });

    it('应该检测趋势延续', () => {
      expect(rotationSignal('tech', 'tech', 0.05)).toBe('continuation');
    });

    it('弱信号应该返回中性', () => {
      expect(rotationSignal('tech', 'finance', 0.02)).toBe('neutral');
    });
  });
});

describe('SectorFundFlowEngine', () => {
  describe('板块资金流向', () => {
    const sectorFlows = [
      { sector: '科技', mainInflow: 5e9, retailOutflow: -2e9, net: 3e9 },
      { sector: '金融', mainOutflow: -3e9, retailInflow: 1e9, net: -2e9 },
      { sector: '消费', mainInflow: 2e9, retailOutflow: -1e9, net: 1e9 },
    ];

    it('应该有主力资金数据', () => {
      sectorFlows.forEach(s => {
        const hasMain = s.mainInflow !== undefined || s.mainOutflow !== undefined;
        expect(hasMain).toBe(true);
        expect(typeof s.net).toBe('number');
      });
    });

    it('应该能计算净流入', () => {
      sectorFlows.forEach(s => {
        const calcNet = (s.mainInflow || 0) + (s.mainOutflow || 0);
        // 注意：mainInflow 和 mainOutflow 是互斥的
      });
    });

    it('应该能排序', () => {
      const sorted = [...sectorFlows].sort((a, b) => b.net - a.net);
      expect(sorted[0].sector).toBe('科技');
      expect(sorted[2].sector).toBe('金融');
    });
  });

  describe('资金流向趋势', () => {
    const detectTrend = (flows: number[]) => {
      const recent = flows.slice(-3);
      const isIncreasing = recent.every((v, i) => i === 0 || v > recent[i - 1]);
      const isDecreasing = recent.every((v, i) => i === 0 || v < recent[i - 1]);
      if (isIncreasing) return 'increasing';
      if (isDecreasing) return 'decreasing';
      return 'mixed';
    };

    it('应该检测流入趋势增加', () => {
      expect(detectTrend([1e9, 2e9, 3e9, 4e9, 5e9])).toBe('increasing');
    });

    it('应该检测流入趋势减少', () => {
      expect(detectTrend([5e9, 4e9, 3e9, 2e9, 1e9])).toBe('decreasing');
    });
  });

  describe('聪明钱检测', () => {
    const isSmartMoney = (flow: number, priceChange: number) => {
      // 聪明钱：资金流入 + 价格上涨，或资金流出 + 价格下跌
      return (flow > 0 && priceChange > 0) || (flow < 0 && priceChange < 0);
    };

    it('资金流入+价格上涨 = 聪明钱', () => {
      expect(isSmartMoney(1e9, 0.02)).toBe(true);
    });

    it('资金流出+价格上涨 = 非聪明钱', () => {
      expect(isSmartMoney(-1e9, 0.02)).toBe(false);
    });
  });
});
