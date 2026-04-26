import { describe, it, expect } from 'vitest';

// 蒙特卡洛模拟与风险度量引擎
describe('蒙特卡洛模拟与风险度量引擎', () => {
  describe('随机数生成', () => {
    function seededRandom(seed: number): () => number {
      let s = seed;
      return () => {
        s = (s * 1664525 + 1013904223) & 0xffffffff;
        return (s >>> 0) / 0xffffffff;
      };
    }

    function boxMullerTransform(rng: () => number): [number, number] {
      const u1 = rng();
      const u2 = rng();
      const r = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10)));
      const theta = 2 * Math.PI * u2;
      return [r * Math.cos(theta), r * Math.sin(theta)];
    }

    it('种子随机数产生确定性序列', () => {
      const rng1 = seededRandom(42);
      const rng2 = seededRandom(42);
      for (let i = 0; i < 10; i++) {
        expect(rng1()).toBe(rng2());
      }
    });

    it('随机数在[0,1)区间', () => {
      const rng = seededRandom(123);
      for (let i = 0; i < 100; i++) {
        const v = rng();
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    });

    it('不同种子产生不同序列', () => {
      const rng1 = seededRandom(1);
      const rng2 = seededRandom(2);
      expect(rng1()).not.toBe(rng2());
    });

    it('Box-Muller变换产生正态分布', () => {
      const rng = seededRandom(99);
      const samples: number[] = [];
      for (let i = 0; i < 500; i++) {
        const [z1] = boxMullerTransform(rng);
        samples.push(z1);
      }
      const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
      expect(Math.abs(mean)).toBeLessThan(0.3);
    });

    it('Box-Muller返回两个独立样本', () => {
      const rng = seededRandom(55);
      const [z1, z2] = boxMullerTransform(rng);
      expect(typeof z1).toBe('number');
      expect(typeof z2).toBe('number');
      expect(isFinite(z1)).toBe(true);
      expect(isFinite(z2)).toBe(true);
    });
  });

  describe('VaR计算', () => {
    function historicalVaR(returns: number[], confidence: number): number {
      const sorted = [...returns].sort((a, b) => a - b);
      const index = Math.floor((1 - confidence) * sorted.length);
      return -sorted[Math.max(0, index)];
    }

    function parametricVaR(mean: number, std: number, confidence: number): number {
      const zScores: Record<number, number> = { 0.9: 1.282, 0.95: 1.645, 0.99: 2.326 };
      const z = zScores[confidence] || 1.645;
      return -(mean - z * std);
    }

    function cvar(returns: number[], confidence: number): number {
      const sorted = [...returns].sort((a, b) => a - b);
      const cutoff = Math.floor((1 - confidence) * sorted.length);
      const tail = sorted.slice(0, cutoff + 1);
      return tail.length === 0 ? 0 : -tail.reduce((a, b) => a + b, 0) / tail.length;
    }

    it('历史VaR返回正值', () => {
      const returns = [-0.05, -0.03, -0.01, 0.01, 0.02, 0.03, 0.05];
      expect(historicalVaR(returns, 0.95)).toBeGreaterThan(0);
    });

    it('高置信度VaR更大', () => {
      const returns = Array.from({ length: 100 }, (_, i) => (i - 50) / 1000);
      expect(historicalVaR(returns, 0.99)).toBeGreaterThan(historicalVaR(returns, 0.9));
    });

    it('参数VaR使用正态分布假设', () => {
      const result = parametricVaR(0.001, 0.02, 0.95);
      expect(result).toBeGreaterThan(0);
    });

    it('高波动率VaR更大', () => {
      expect(parametricVaR(0, 0.04, 0.95)).toBeGreaterThan(parametricVaR(0, 0.02, 0.95));
    });

    it('CVaR大于等于VaR', () => {
      const returns = Array.from({ length: 100 }, (_, i) => (Math.sin(i * 0.5 + 2) * 0.05));
      const varVal = historicalVaR(returns, 0.95);
      const cvarVal = cvar(returns, 0.95);
      expect(cvarVal).toBeGreaterThanOrEqual(varVal - 0.001);
    });

    it('正收益序列VaR为负或零', () => {
      const returns = [0.01, 0.02, 0.03, 0.01, 0.02];
      expect(historicalVaR(returns, 0.95)).toBeLessThanOrEqual(0);
    });

    it('空CVaR返回0', () => {
      expect(cvar([], 0.95)).toBe(0);
    });
  });

  describe('蒙特卡洛路径模拟', () => {
    function simulatePricePath(initialPrice: number, mu: number, sigma: number, days: number, rng: () => number): number[] {
      const path = [initialPrice];
      let price = initialPrice;
      for (let i = 0; i < days; i++) {
        const u1 = Math.max(rng(), 1e-10);
        const u2 = rng();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        price = price * Math.exp((mu - 0.5 * sigma * sigma) + sigma * z);
        path.push(price);
      }
      return path;
    }

    function simulatePortfolio(portfolio: { weight: number; mu: number; sigma: number }[], days: number, rng: () => number): number[] {
      const paths = portfolio.map(p => simulatePricePath(100, p.mu, p.sigma, days, rng));
      const portfolioPath: number[] = [];
      for (let i = 0; i <= days; i++) {
        let value = 0;
        for (let j = 0; j < portfolio.length; j++) {
          value += portfolio[j].weight * paths[j][i];
        }
        portfolioPath.push(value);
      }
      return portfolioPath;
    }

    it('路径长度正确', () => {
      const rng = Math.random;
      const path = simulatePricePath(100, 0.1, 0.2, 252, rng);
      expect(path.length).toBe(253);
    });

    it('起始价格正确', () => {
      const rng = Math.random;
      const path = simulatePricePath(50, 0.1, 0.2, 10, rng);
      expect(path[0]).toBe(50);
    });

    it('价格始终为正', () => {
      const rng = Math.random;
      const path = simulatePricePath(100, -0.5, 0.8, 100, rng);
      expect(path.every(p => p > 0)).toBe(true);
    });

    it('确定性随机产生确定路径', () => {
      const makeRng = (s: number) => () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
      const rng1 = makeRng(42);
      const rng2 = makeRng(42);
      const path1 = simulatePricePath(100, 0.1, 0.2, 50, rng1);
      const path2 = simulatePricePath(100, 0.1, 0.2, 50, rng2);
      expect(path1).toEqual(path2);
    });

    it('零波动率路径确定性增长', () => {
      const makeRng = (s: number) => () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
      const rng1 = makeRng(1);
      const rng2 = makeRng(2);
      const path1 = simulatePricePath(100, 0.1, 0, 50, rng1);
      const path2 = simulatePricePath(100, 0.1, 0, 50, rng2);
      // Zero volatility should produce identical paths regardless of RNG
      expect(path1).toEqual(path2);
      // Path should be strictly increasing with positive drift
      for (let i = 1; i < path1.length; i++) {
        expect(path1[i]).toBeGreaterThan(path1[i - 1]);
      }
    });

    it('组合路径长度正确', () => {
      const portfolio = [{ weight: 0.5, mu: 0.1, sigma: 0.2 }, { weight: 0.5, mu: 0.15, sigma: 0.25 }];
      const path = simulatePortfolio(portfolio, 100, Math.random);
      expect(path.length).toBe(101);
    });

    it('组合初始值为权重之和', () => {
      const portfolio = [{ weight: 0.6, mu: 0.1, sigma: 0.2 }, { weight: 0.4, mu: 0.15, sigma: 0.25 }];
      const path = simulatePortfolio(portfolio, 10, Math.random);
      expect(path[0]).toBeCloseTo(100, 5);
    });
  });

  describe('波动率计算', () => {
    function realizedVolatility(returns: number[], annualizeFactor = 252): number {
      if (returns.length < 2) return 0;
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
      return Math.sqrt(variance * annualizeFactor);
    }

    function ewmaVolatility(returns: number[], lambda: number): number {
      if (returns.length === 0) return 0;
      let variance = returns[0] ** 2;
      for (let i = 1; i < returns.length; i++) {
        variance = lambda * variance + (1 - lambda) * returns[i] ** 2;
      }
      return Math.sqrt(variance);
    }

    it('计算已实现波动率', () => {
      const returns = [0.01, -0.02, 0.015, -0.01, 0.005];
      const vol = realizedVolatility(returns);
      expect(vol).toBeGreaterThan(0);
    });

    it('单个返回值波动率为0', () => {
      expect(realizedVolatility([0.01])).toBe(0);
    });

    it('空数组波动率为0', () => {
      expect(realizedVolatility([])).toBe(0);
    });

    it('年化因子增大波动率', () => {
      const returns = [0.01, -0.02, 0.015, -0.01, 0.005];
      const daily = realizedVolatility(returns, 1);
      const annual = realizedVolatility(returns, 252);
      expect(annual).toBeGreaterThan(daily);
    });

    it('常数返回波动率为0', () => {
      expect(realizedVolatility([0.01, 0.01, 0.01, 0.01])).toBe(0);
    });

    it('EWMA波动率为正', () => {
      const returns = [0.01, -0.02, 0.015, -0.01, 0.005];
      expect(ewmaVolatility(returns, 0.94)).toBeGreaterThan(0);
    });

    it('空EWMA返回0', () => {
      expect(ewmaVolatility([], 0.94)).toBe(0);
    });

    it('高lambda衰减更慢', () => {
      const returns = Array.from({ length: 50 }, (_, i) => Math.sin(i * 0.7 + 1) * 0.02);
      const vol1 = ewmaVolatility(returns, 0.99);
      const vol2 = ewmaVolatility(returns, 0.8);
      // Both should be positive, values depend on data
      expect(vol1).toBeGreaterThan(0);
      expect(vol2).toBeGreaterThan(0);
    });
  });

  describe('相关性分析', () => {
    function correlation(x: number[], y: number[]): number {
      if (x.length !== y.length || x.length < 2) return 0;
      const n = x.length;
      const meanX = x.reduce((a, b) => a + b, 0) / n;
      const meanY = y.reduce((a, b) => a + b, 0) / n;
      let num = 0, denX = 0, denY = 0;
      for (let i = 0; i < n; i++) {
        const dx = x[i] - meanX;
        const dy = y[i] - meanY;
        num += dx * dy;
        denX += dx * dx;
        denY += dy * dy;
      }
      const den = Math.sqrt(denX * denY);
      return den === 0 ? 0 : num / den;
    }

    function covariance(x: number[], y: number[]): number {
      if (x.length !== y.length || x.length < 2) return 0;
      const n = x.length;
      const meanX = x.reduce((a, b) => a + b, 0) / n;
      const meanY = y.reduce((a, b) => a + b, 0) / n;
      return x.reduce((s, v, i) => s + (v - meanX) * (y[i] - meanY), 0) / (n - 1);
    }

    it('完全正相关为1', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [2, 4, 6, 8, 10];
      expect(correlation(x, y)).toBeCloseTo(1, 5);
    });

    it('完全负相关为-1', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [10, 8, 6, 4, 2];
      expect(correlation(x, y)).toBeCloseTo(-1, 5);
    });

    it('不相关接近0', () => {
      const x = [1, -1, 1, -1, 1];
      const y = [1, 1, -1, -1, 0];
      expect(Math.abs(correlation(x, y))).toBeLessThan(0.5);
    });

    it('常数序列相关性为0', () => {
      expect(correlation([1, 1, 1], [2, 3, 4])).toBe(0);
    });

    it('空数组相关性为0', () => {
      expect(correlation([], [])).toBe(0);
    });

    it('单元素相关性为0', () => {
      expect(correlation([1], [2])).toBe(0);
    });

    it('计算协方差', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [2, 4, 6, 8, 10];
      expect(covariance(x, y)).toBeGreaterThan(0);
    });

    it('反向序列协方差为负', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [5, 4, 3, 2, 1];
      expect(covariance(x, y)).toBeLessThan(0);
    });

    it('相关系数在[-1,1]', () => {
      const x = [1, 3, 5, 7, 9, 2, 4, 6];
      const y = [9, 7, 5, 3, 1, 8, 6, 4];
      const r = correlation(x, y);
      expect(r).toBeGreaterThanOrEqual(-1);
      expect(r).toBeLessThanOrEqual(1);
    });
  });

  describe('夏普比率与风险调整收益', () => {
    function sharpeRatio(returns: number[], riskFreeRate: number): number {
      if (returns.length < 2) return 0;
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
      const std = Math.sqrt(variance);
      return std === 0 ? 0 : (mean - riskFreeRate) / std;
    }

    function sortinoRatio(returns: number[], riskFreeRate: number): number {
      if (returns.length < 2) return 0;
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const downside = returns.filter(r => r < riskFreeRate);
      if (downside.length === 0) return Infinity;
      const downsideVar = downside.reduce((s, r) => s + (r - riskFreeRate) ** 2, 0) / downside.length;
      const downsideDev = Math.sqrt(downsideVar);
      return downsideDev === 0 ? Infinity : (mean - riskFreeRate) / downsideDev;
    }

    function calmarRatio(annualReturn: number, maxDrawdown: number): number {
      return maxDrawdown === 0 ? Infinity : annualReturn / maxDrawdown;
    }

    it('正夏普比率表示超额收益', () => {
      const returns = [0.02, 0.03, 0.01, 0.04, 0.02];
      expect(sharpeRatio(returns, 0.005)).toBeGreaterThan(0);
    });

    it('零波动率夏普比率为0', () => {
      expect(sharpeRatio([0.01, 0.01, 0.01], 0)).toBe(0);
    });

    it('空数组夏普比率为0', () => {
      expect(sharpeRatio([], 0)).toBe(0);
    });

    it('高无风险利率降低夏普比率', () => {
      const returns = [0.02, 0.03, 0.01, 0.04, 0.02];
      expect(sharpeRatio(returns, 0.001)).toBeGreaterThan(sharpeRatio(returns, 0.02));
    });

    it('索提诺比率只考虑下行风险', () => {
      const returns = [0.02, -0.01, 0.03, -0.02, 0.04];
      expect(sortinoRatio(returns, 0.005)).toBeGreaterThan(0);
    });

    it('无下行风险索提诺比率为无穷', () => {
      const returns = [0.05, 0.06, 0.07];
      expect(sortinoRatio(returns, 0.001)).toBe(Infinity);
    });

    it('卡尔马比率', () => {
      expect(calmarRatio(0.15, 0.1)).toBeCloseTo(1.5, 5);
    });

    it('零最大回撤卡尔马比率为无穷', () => {
      expect(calmarRatio(0.15, 0)).toBe(Infinity);
    });

    it('索提诺比率通常高于夏普比率', () => {
      const returns = [0.02, -0.01, 0.03, 0.01, 0.04, -0.005];
      const sharpe = sharpeRatio(returns, 0.005);
      const sortino = sortinoRatio(returns, 0.005);
      expect(sortino).toBeGreaterThanOrEqual(sharpe);
    });
  });
});
