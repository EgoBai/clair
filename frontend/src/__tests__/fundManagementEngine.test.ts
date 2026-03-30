import { describe, it, expect } from 'vitest';

// 资金管理系统引擎测试
describe('资金管理系统引擎', () => {
  describe('头寸规模计算', () => {
    function positionSize(capital: number, riskPercent: number, entryPrice: number, stopPrice: number): { shares: number; cost: number; risk: number } {
      const riskAmount = capital * riskPercent;
      const priceRisk = Math.abs(entryPrice - stopPrice);
      if (priceRisk === 0) return { shares: 0, cost: 0, risk: 0 };
      const shares = Math.floor(riskAmount / priceRisk);
      const cost = shares * entryPrice;
      return { shares, cost, risk: riskAmount };
    }

    it('正确计算头寸规模', () => {
      const result = positionSize(100000, 0.02, 50, 48);
      expect(result.shares).toBe(1000);
      expect(result.cost).toBe(50000);
    });

    it('零风险距离返回零', () => {
      expect(positionSize(100000, 0.02, 50, 50).shares).toBe(0);
    });

    it('风险金额=资金×风险比例', () => {
      expect(positionSize(100000, 0.02, 50, 48).risk).toBe(2000);
    });

    it('高风险比例增加头寸', () => {
      const low = positionSize(100000, 0.01, 50, 48);
      const high = positionSize(100000, 0.05, 50, 48);
      expect(high.shares).toBeGreaterThan(low.shares);
    });
  });

  describe('金字塔加仓', () => {
    function pyramidAdd(baseSize: number, maxAdds: number, scaleFactor: number): number[] {
      const sizes: number[] = [baseSize];
      for (let i = 1; i < maxAdds; i++) {
        sizes.push(Math.round(baseSize * Math.pow(scaleFactor, i)));
      }
      return sizes;
    }

    it('递减加仓', () => {
      const sizes = pyramidAdd(1000, 4, 0.5);
      expect(sizes[1]).toBeLessThan(sizes[0]);
      expect(sizes[2]).toBeLessThan(sizes[1]);
    });

    it('递增加仓', () => {
      const sizes = pyramidAdd(1000, 4, 1.5);
      expect(sizes[1]).toBeGreaterThan(sizes[0]);
    });

    it('首仓等于基础规模', () => {
      expect(pyramidAdd(500, 3, 0.5)[0]).toBe(500);
    });

    it('加仓次数正确', () => {
      expect(pyramidAdd(1000, 5, 0.5)).toHaveLength(5);
    });
  });

  describe('马丁格尔策略', () => {
    function martingale(bet: number, losses: number, multiplier = 2): number {
      return bet * Math.pow(multiplier, losses);
    }

    it('连亏后翻倍', () => {
      expect(martingale(100, 3)).toBe(800);
    });

    it('零连亏等于初始注', () => {
      expect(martingale(100, 0)).toBe(100);
    });

    it('自定义倍数', () => {
      expect(martingale(100, 2, 3)).toBe(900);
    });
  });

  describe('反马丁格尔策略', () => {
    function antiMartingale(bet: number, wins: number, multiplier = 2, maxBet = Infinity): number {
      return Math.min(bet * Math.pow(multiplier, wins), maxBet);
    }

    it('连胜后加注', () => {
      expect(antiMartingale(100, 3)).toBe(800);
    });

    it('限制最大注', () => {
      expect(antiMartingale(100, 10, 2, 1000)).toBe(1000);
    });

    it('零连胜等于初始注', () => {
      expect(antiMartingale(100, 0)).toBe(100);
    });
  });

  describe('资金曲线分析', () => {
    function equityAnalysis(equity: number[]): { peak: number; trough: number; maxDrawdown: number; recoveryFactor: number; profitFactor: number } {
      if (equity.length === 0) return { peak: 0, trough: 0, maxDrawdown: 0, recoveryFactor: 0, profitFactor: 0 };
      let peak = equity[0], trough = equity[0], maxDD = 0;
      let gains = 0, losses = 0;
      for (let i = 1; i < equity.length; i++) {
        if (equity[i] > peak) peak = equity[i];
        if (equity[i] < trough) trough = equity[i];
        const dd = (peak - equity[i]) / peak;
        if (dd > maxDD) maxDD = dd;
        const change = equity[i] - equity[i - 1];
        if (change > 0) gains += change;
        else losses += Math.abs(change);
      }
      const totalReturn = (equity[equity.length - 1] - equity[0]) / equity[0];
      return { peak, trough, maxDrawdown: maxDD, recoveryFactor: maxDD > 0 ? totalReturn / maxDD : 0, profitFactor: losses > 0 ? gains / losses : Infinity };
    }

    it('单调递增最大回撤为零', () => {
      expect(equityAnalysis([100, 110, 120, 130]).maxDrawdown).toBe(0);
    });

    it('单调递减回撤最大', () => {
      expect(equityAnalysis([100, 80, 60, 40]).maxDrawdown).toBeCloseTo(0.6, 5);
    });

    it('盈利因子非负', () => {
      const result = equityAnalysis([100, 110, 105, 120, 115, 130]);
      expect(result.profitFactor).toBeGreaterThanOrEqual(0);
    });

    it('空数据返回零', () => {
      expect(equityAnalysis([]).maxDrawdown).toBe(0);
    });

    it('峰值正确', () => {
      expect(equityAnalysis([100, 120, 110, 130]).peak).toBe(130);
    });
  });

  describe('复利计算', () => {
    function compoundReturn(principal: number, rate: number, periods: number): number {
      return principal * Math.pow(1 + rate, periods);
    }

    function annualizedReturn(startValue: number, endValue: number, years: number): number {
      if (startValue === 0 || years === 0) return 0;
      return Math.pow(endValue / startValue, 1 / years) - 1;
    }

    it('复利增长', () => {
      expect(compoundReturn(10000, 0.1, 10)).toBeCloseTo(25937.42, 0);
    });

    it('零利率不变', () => {
      expect(compoundReturn(10000, 0, 10)).toBe(10000);
    });

    it('年化收益率计算', () => {
      expect(annualizedReturn(10000, 12100, 2)).toBeCloseTo(0.1, 2);
    });

    it('零年返回零', () => {
      expect(annualizedReturn(10000, 11000, 0)).toBe(0);
    });

    it('负年化收益率', () => {
      expect(annualizedReturn(10000, 8000, 1)).toBeCloseTo(-0.2, 5);
    });
  });
});
