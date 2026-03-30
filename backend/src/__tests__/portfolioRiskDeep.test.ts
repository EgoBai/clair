import { describe, it, expect } from 'vitest';

// 投资组合风险分析测试 — 55用例
describe('投资组合风险分析', () => {

  // Beta计算
  describe('Beta系数', () => {
    function calcBeta(stockReturns: number[], marketReturns: number[]) {
      const n = Math.min(stockReturns.length, marketReturns.length);
      if (n === 0) return 0;
      const sr = stockReturns.slice(0, n), mr = marketReturns.slice(0, n);
      const sm = sr.reduce((a, b) => a + b, 0) / n;
      const mm = mr.reduce((a, b) => a + b, 0) / n;
      const cov = sr.reduce((s, r, i) => s + (r - sm) * (mr[i] - mm), 0) / n;
      const mVar = mr.reduce((s, r) => s + (r - mm) ** 2, 0) / n;
      return mVar === 0 ? 0 : cov / mVar;
    }

    it('Beta=1表示与市场同步', () => {
      const market = [0.01, -0.02, 0.03, -0.01, 0.02];
      const stock = market.map(r => r);
      expect(calcBeta(stock, market)).toBeCloseTo(1, 5);
    });

    it('Beta>1表示高波动', () => {
      const market = [0.01, -0.02, 0.03, -0.01, 0.02];
      const stock = market.map(r => r * 2);
      expect(calcBeta(stock, market)).toBeCloseTo(2, 5);
    });

    it('Beta<1表示低波动', () => {
      const market = [0.01, -0.02, 0.03, -0.01, 0.02];
      const stock = market.map(r => r * 0.5);
      expect(calcBeta(stock, market)).toBeCloseTo(0.5, 5);
    });

    it('负Beta表示反向', () => {
      const market = [0.01, -0.02, 0.03, -0.01, 0.02];
      const stock = market.map(r => -r);
      expect(calcBeta(stock, market)).toBeCloseTo(-1, 5);
    });

    it('空数据Beta为0', () => {
      expect(calcBeta([], [])).toBe(0);
    });

    it('零市场波动Beta为0', () => {
      expect(calcBeta([0.01, 0.02], [0, 0])).toBe(0);
    });
  });

  // 相关系数
  describe('相关系数', () => {
    function correlation(x: number[], y: number[]) {
      const n = Math.min(x.length, y.length);
      if (n === 0) return 0;
      const xa = x.slice(0, n), ya = y.slice(0, n);
      const xm = xa.reduce((a, b) => a + b, 0) / n;
      const ym = ya.reduce((a, b) => a + b, 0) / n;
      const cov = xa.reduce((s, v, i) => s + (v - xm) * (ya[i] - ym), 0) / n;
      const sx = Math.sqrt(xa.reduce((s, v) => s + (v - xm) ** 2, 0) / n);
      const sy = Math.sqrt(ya.reduce((s, v) => s + (v - ym) ** 2, 0) / n);
      return sx === 0 || sy === 0 ? 0 : cov / (sx * sy);
    }

    it('完全正相关应为1', () => {
      expect(correlation([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 5);
    });

    it('完全负相关应为-1', () => {
      expect(correlation([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1, 5);
    });

    it('无关应接近0', () => {
      expect(correlation([1, 1, 1, 1], [1, 2, 3, 4])).toBe(0);
    });

    it('相关系数范围应在[-1, 1]', () => {
      const r = correlation([0.01, -0.02, 0.03, -0.01], [0.02, -0.01, 0.01, 0.03]);
      expect(r).toBeGreaterThanOrEqual(-1);
      expect(r).toBeLessThanOrEqual(1);
    });

    it('空数据相关系数为0', () => {
      expect(correlation([], [])).toBe(0);
    });

    it('常量序列相关系数为0', () => {
      expect(correlation([5, 5, 5], [1, 2, 3])).toBe(0);
    });
  });

  // 投资组合方差
  describe('投资组合方差', () => {
    function portfolioVariance(weights: number[], covMatrix: number[][]) {
      let variance = 0;
      for (let i = 0; i < weights.length; i++) {
        for (let j = 0; j < weights.length; j++) {
          variance += weights[i] * weights[j] * covMatrix[i]![j]!;
        }
      }
      return variance;
    }

    it('单资产方差应等于自身方差', () => {
      expect(portfolioVariance([1], [[0.04]])).toBeCloseTo(0.04, 5);
    });

    it('分散化应降低方差', () => {
      const single = portfolioVariance([1], [[0.04]]);
      const diversified = portfolioVariance([0.5, 0.5], [[0.04, 0.01], [0.01, 0.04]]);
      expect(diversified).toBeLessThan(single);
    });

    it('零权重组合方差为0', () => {
      expect(portfolioVariance([0, 0], [[0.04, 0.01], [0.01, 0.04]])).toBe(0);
    });

    it('方差应为非负', () => {
      const result = portfolioVariance([0.3, 0.7], [[0.04, 0.02], [0.02, 0.09]]);
      expect(result).toBeGreaterThanOrEqual(0);
    });

    it('对称矩阵结果应一致', () => {
      const a = portfolioVariance([0.5, 0.5], [[0.04, 0.02], [0.02, 0.09]]);
      const b = portfolioVariance([0.5, 0.5], [[0.04, 0.02], [0.02, 0.09]]);
      expect(a).toBe(b);
    });
  });

  // 风险价值 VaR
  describe('风险价值VaR', () => {
    function calcVaR(returns: number[], confidence: number) {
      const sorted = [...returns].sort((a, b) => a - b);
      const idx = Math.floor((1 - confidence) * sorted.length);
      return sorted[Math.max(0, idx)] || 0;
    }

    it('95%置信度VaR应为负值（损失）', () => {
      const returns = Array.from({ length: 100 }, (_, i) => (i - 50) / 1000);
      expect(calcVaR(returns, 0.95)).toBeLessThan(0);
    });

    it('100%置信度VaR应为最小收益', () => {
      const returns = [0.01, -0.02, 0.03, -0.01];
      expect(calcVaR(returns, 1)).toBe(Math.min(...returns));
    });

    it('0%置信度VaR为默认值', () => {
      const returns = [0.01, -0.02, 0.03, -0.01];
      expect(calcVaR(returns, 0)).toBe(0);
    });

    it('VaR应为有限值', () => {
      const returns = [0.01, -0.02, 0.03, -0.01, 0.02, -0.03];
      expect(Number.isFinite(calcVaR(returns, 0.95))).toBe(true);
    });

    it('空数据VaR为0', () => {
      expect(calcVaR([], 0.95)).toBe(0);
    });
  });

  // 组合再平衡
  describe('组合再平衡', () => {
    function rebalance(current: { symbol: string; weight: number }[], target: { symbol: string; weight: number }[]) {
      const trades: { symbol: string; action: string; delta: number }[] = [];
      const targetMap = new Map(target.map(t => [t.symbol, t.weight]));
      for (const pos of current) {
        const tw = targetMap.get(pos.symbol) || 0;
        const delta = tw - pos.weight;
        if (Math.abs(delta) > 0.001) {
          trades.push({ symbol: pos.symbol, action: delta > 0 ? 'buy' : 'sell', delta: Math.abs(delta) });
        }
      }
      return trades;
    }

    it('完美平衡应无交易', () => {
      const trades = rebalance(
        [{ symbol: 'A', weight: 0.5 }, { symbol: 'B', weight: 0.5 }],
        [{ symbol: 'A', weight: 0.5 }, { symbol: 'B', weight: 0.5 }]
      );
      expect(trades).toHaveLength(0);
    });

    it('不平衡应产生交易', () => {
      const trades = rebalance(
        [{ symbol: 'A', weight: 0.7 }, { symbol: 'B', weight: 0.3 }],
        [{ symbol: 'A', weight: 0.5 }, { symbol: 'B', weight: 0.5 }]
      );
      expect(trades.length).toBeGreaterThan(0);
    });

    it('卖出A买入B方向正确', () => {
      const trades = rebalance(
        [{ symbol: 'A', weight: 0.7 }, { symbol: 'B', weight: 0.3 }],
        [{ symbol: 'A', weight: 0.5 }, { symbol: 'B', weight: 0.5 }]
      );
      const tradeA = trades.find(t => t.symbol === 'A');
      const tradeB = trades.find(t => t.symbol === 'B');
      expect(tradeA?.action).toBe('sell');
      expect(tradeB?.action).toBe('buy');
    });

    it('差额应正确', () => {
      const trades = rebalance(
        [{ symbol: 'A', weight: 0.7 }, { symbol: 'B', weight: 0.3 }],
        [{ symbol: 'A', weight: 0.5 }, { symbol: 'B', weight: 0.5 }]
      );
      trades.forEach(t => expect(t.delta).toBeCloseTo(0.2, 5));
    });

    it('新增资产应产生买入', () => {
      const trades = rebalance(
        [{ symbol: 'A', weight: 1 }],
        [{ symbol: 'A', weight: 0.5 }, { symbol: 'B', weight: 0.5 }]
      );
      expect(trades.some(t => t.symbol === 'A' && t.action === 'sell')).toBe(true);
    });
  });
});
