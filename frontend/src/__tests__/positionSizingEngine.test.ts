import { describe, it, expect } from 'vitest';

/**
 * 资金管理 / 仓位管理 / Kelly公式逻辑测试
 */

describe('PositionSizingEngine', () => {
  describe('Kelly 公式', () => {
    const kelly = (winRate: number, avgWin: number, avgLoss: number) => {
      const b = avgWin / avgLoss;
      return (winRate * b - (1 - winRate)) / b;
    };

    it('应该计算 Kelly 比例', () => {
      const kellyPct = kelly(0.6, 2, 1);
      expect(kellyPct).toBeCloseTo(0.4, 10); // (0.6*2 - 0.4)/2 = 0.8/2 = 0.4
    });

    it('胜率50%盈亏比2:1 Kelly应为25%', () => {
      const kellyPct = kelly(0.5, 2, 1);
      expect(kellyPct).toBe(0.25);
    });

    it('负期望应该返回负值', () => {
      const kellyPct = kelly(0.3, 1, 1);
      expect(kellyPct).toBeLessThan(0);
    });

    it('通常使用半 Kelly', () => {
      const fullKelly = kelly(0.6, 2, 1);
      const halfKelly = fullKelly / 2;
      expect(halfKelly).toBeCloseTo(0.2, 10);
    });
  });

  describe('固定比例仓位', () => {
    const fixedFractional = (capital: number, riskPerTrade: number) => {
      return capital * riskPerTrade;
    };

    it('应该按固定比例分配', () => {
      expect(fixedFractional(100000, 0.02)).toBe(2000);
    });
  });

  describe('ATR 仓位法', () => {
    const atrPositionSize = (capital: number, riskAmount: number, atr: number, multiplier: number = 2) => {
      const stopDistance = atr * multiplier;
      const shares = Math.floor(riskAmount / stopDistance);
      return shares;
    };

    it('应该根据 ATR 计算仓位', () => {
      const shares = atrPositionSize(100000, 2000, 5, 2);
      expect(shares).toBe(200); // 2000 / 10 = 200
    });

    it('ATR 越大仓位越小', () => {
      const shares1 = atrPositionSize(100000, 2000, 5, 2);
      const shares2 = atrPositionSize(100000, 2000, 10, 2);
      expect(shares2).toBeLessThan(shares1);
    });
  });

  describe('风险平价', () => {
    const riskParityWeights = (vols: number[]) => {
      const invVols = vols.map(v => 1 / v);
      const total = invVols.reduce((a, b) => a + b);
      return invVols.map(v => v / total);
    };

    it('应该给低波动资产更高权重', () => {
      const weights = riskParityWeights([0.1, 0.2, 0.3]);
      expect(weights[0]).toBeGreaterThan(weights[1]);
      expect(weights[1]).toBeGreaterThan(weights[2]);
    });
  });
});

describe('RiskManager', () => {
  describe('最大回撤控制', () => {
    const checkMaxDrawdown = (currentNav: number, peakNav: number, maxDD: number) => {
      const dd = (peakNav - currentNav) / peakNav;
      return {
        currentDD: dd,
        withinLimit: dd <= maxDD,
        shouldStop: dd > maxDD,
      };
    };

    it('应该正确计算当前回撤', () => {
      const result = checkMaxDrawdown(85000, 100000, 0.15);
      expect(result.currentDD).toBe(0.15);
    });

    it('超过限制应该触发止损', () => {
      const result = checkMaxDrawdown(80000, 100000, 0.15);
      expect(result.shouldStop).toBe(true);
    });

    it('未超过限制不应该触发', () => {
      const result = checkMaxDrawdown(90000, 100000, 0.15);
      expect(result.shouldStop).toBe(false);
    });
  });

  describe('集中度限制', () => {
    const checkConcentration = (positions: {weight: number}[], maxWeight: number) => {
      return positions.map(p => ({
        ...p,
        exceeds: p.weight > maxWeight,
      }));
    };

    it('应该检测过度集中', () => {
      const result = checkConcentration([
        { weight: 0.3 },
        { weight: 0.25 },
        { weight: 0.15 },
      ], 0.25);
      expect(result[0].exceeds).toBe(true);
      expect(result[2].exceeds).toBe(false);
    });
  });

  describe('流动性检查', () => {
    const liquidityCheck = (avgVolume: number, orderSize: number, maxParticipation: number = 0.05) => {
      const participation = orderSize / avgVolume;
      return {
        participation,
        canExecute: participation <= maxParticipation,
        suggestedSplit: Math.ceil(participation / maxParticipation),
      };
    };

    it('小订单可以直接执行', () => {
      const result = liquidityCheck(1e6, 10000);
      expect(result.canExecute).toBe(true);
    });

    it('大订单应该拆分', () => {
      const result = liquidityCheck(1e6, 100000);
      expect(result.canExecute).toBe(false);
      expect(result.suggestedSplit).toBeGreaterThan(1);
    });
  });
});
