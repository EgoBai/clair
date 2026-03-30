import { describe, it, expect } from 'vitest';

/**
 * 量化策略引擎测试
 */

interface Trade { date: string; type: 'buy' | 'sell'; price: number; qty: number; }
interface BacktestResult { trades: Trade[]; totalReturn: number; maxDrawdown: number; sharpeRatio: number; winRate: number; }

const momentumStrategy = (prices: number[], lookback: number = 20): Trade[] => {
  const trades: Trade[] = [];
  let position = 0;
  for (let i = lookback; i < prices.length; i++) {
    const momentum = (prices[i] - prices[i - lookback]) / prices[i - lookback];
    if (momentum > 0.05 && position === 0) {
      trades.push({ date: `${i}`, type: 'buy', price: prices[i], qty: 100 });
      position = 100;
    } else if (momentum < -0.03 && position > 0) {
      trades.push({ date: `${i}`, type: 'sell', price: prices[i], qty: position });
      position = 0;
    }
  }
  return trades;
};

const meanReversionStrategy = (prices: number[], period: number = 20): Trade[] => {
  const trades: Trade[] = [];
  let position = 0;
  for (let i = period; i < prices.length; i++) {
    const mean = prices.slice(i - period, i).reduce((a, b) => a + b, 0) / period;
    const std = Math.sqrt(prices.slice(i - period, i).reduce((a, b) => a + (b - mean) ** 2, 0) / period);
    const zScore = (prices[i] - mean) / (std || 1);
    if (zScore < -2 && position === 0) {
      trades.push({ date: `${i}`, type: 'buy', price: prices[i], qty: 100 });
      position = 100;
    } else if (zScore > 2 && position > 0) {
      trades.push({ date: `${i}`, type: 'sell', price: prices[i], qty: position });
      position = 0;
    }
  }
  return trades;
};

const calcMaxDrawdown = (prices: number[]): number => {
  let maxPrice = prices[0];
  let maxDD = 0;
  for (const p of prices) {
    if (p > maxPrice) maxPrice = p;
    const dd = (maxPrice - p) / maxPrice;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
};

const calcSharpe = (returns: number[], riskFreeRate: number = 0.03): number => {
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const std = Math.sqrt(returns.reduce((a, b) => a + (b - avgReturn) ** 2, 0) / returns.length);
  return std === 0 ? 0 : ((avgReturn - riskFreeRate / 252) / std) * Math.sqrt(252);
};

describe('量化策略引擎', () => {
  describe('动量策略', () => {
    it('应该在上升趋势中产生买入信号', () => {
      const prices = Array.from({ length: 50 }, (_, i) => 100 + i * 0.5);
      const trades = momentumStrategy(prices, 10);
      expect(trades.length).toBeGreaterThan(0);
      expect(trades[0].type).toBe('buy');
    });

    it('应该在下跌趋势中产生卖出信号', () => {
      const prices = [100, 102, 105, 108, 110, 112, 115, 118, 120, 122, 125, 120, 115, 110, 105, 100, 95, 90, 85, 80, 75, 70];
      const trades = momentumStrategy(prices, 5);
      const sells = trades.filter(t => t.type === 'sell');
      expect(sells.length).toBeGreaterThan(0);
    });

    it('应该使用正确的回看周期', () => {
      const prices = Array.from({ length: 100 }, (_, i) => 100 + Math.sin(i / 5) * 10);
      const trades5 = momentumStrategy(prices, 5);
      const trades20 = momentumStrategy(prices, 20);
      expect(trades5.length).not.toBe(trades20.length);
    });

    it('空数组应该返回空交易', () => {
      expect(momentumStrategy([], 10)).toEqual([]);
    });

    it('价格不变应该不产生交易', () => {
      const prices = Array(30).fill(100);
      expect(momentumStrategy(prices, 10)).toEqual([]);
    });

    it('应该正确记录交易价格', () => {
      const prices = Array.from({ length: 30 }, (_, i) => 100 + i);
      const trades = momentumStrategy(prices, 5);
      for (const t of trades) {
        expect(t.price).toBeGreaterThan(0);
        expect(t.qty).toBeGreaterThan(0);
      }
    });

    it('应该始终买入在卖出之前', () => {
      const prices = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 3) * 20);
      const trades = momentumStrategy(prices, 5);
      let hadBuy = false;
      for (const t of trades) {
        if (t.type === 'buy') hadBuy = true;
        if (t.type === 'sell') expect(hadBuy).toBe(true);
      }
    });

    it('波动行情应该产生多次交易', () => {
      const prices = Array.from({ length: 100 }, (_, i) => 100 + (i % 10 < 5 ? i % 10 : 10 - i % 10) * 5);
      const trades = momentumStrategy(prices, 3);
      expect(trades.length).toBeGreaterThan(2);
    });

    it('单边上涨应该只有买入', () => {
      const prices = Array.from({ length: 50 }, (_, i) => 100 + i * 2);
      const trades = momentumStrategy(prices, 10);
      const buys = trades.filter(t => t.type === 'buy');
      const sells = trades.filter(t => t.type === 'sell');
      expect(buys.length).toBeGreaterThanOrEqual(sells.length);
    });

    it('不同lookback应该影响触发时点', () => {
      const prices = Array.from({ length: 60 }, (_, i) => i < 30 ? 100 + i : 130 - (i - 30));
      const t3 = momentumStrategy(prices, 3);
      const t10 = momentumStrategy(prices, 10);
      if (t3.length > 0 && t10.length > 0) {
        expect(parseInt(t3[0].date)).not.toBe(parseInt(t10[0].date));
      }
    });
  });

  describe('均值回归策略', () => {
    it('应该在价格低于均值2个标准差时买入', () => {
      const prices = [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 60];
      const trades = meanReversionStrategy(prices, 10);
      expect(trades.some(t => t.type === 'buy')).toBe(true);
    });

    it('稳定价格不应触发交易', () => {
      const prices = Array(30).fill(100);
      expect(meanReversionStrategy(prices, 10)).toEqual([]);
    });

    it('应该正确计算z-score触发点', () => {
      const prices = Array.from({ length: 20 }, () => 100).concat([50, 50, 50]);
      const trades = meanReversionStrategy(prices, 10);
      if (trades.length > 0) {
        expect(trades[0].price).toBeLessThan(100);
      }
    });

    it('空数据应该返回空交易', () => {
      expect(meanReversionStrategy([], 10)).toEqual([]);
    });

    it('不同周期应该产生不同结果', () => {
      const prices = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i / 3) * 30);
      const t5 = meanReversionStrategy(prices, 5);
      const t15 = meanReversionStrategy(prices, 15);
      expect(t5.length).not.toBe(t15.length);
    });

    it('快速反弹应该触发卖出', () => {
      const prices = [100, 100, 100, 100, 100, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 150, 150, 150, 150, 150];
      const trades = meanReversionStrategy(prices, 5);
      const sells = trades.filter(t => t.type === 'sell');
      expect(sells.length).toBeGreaterThan(0);
    });

    it('渐变价格应该减少交易频率', () => {
      const gradual = Array.from({ length: 50 }, (_, i) => 100 + i * 0.1);
      const sharp = Array.from({ length: 50 }, (_, i) => 100 + (i % 2 === 0 ? 0 : 20));
      const tGradual = meanReversionStrategy(gradual, 10);
      const tSharp = meanReversionStrategy(sharp, 10);
      expect(tSharp.length).toBeGreaterThanOrEqual(tGradual.length);
    });

    it('交易金额应该为正数', () => {
      const prices = Array.from({ length: 40 }, (_, i) => 100 + Math.sin(i / 2) * 50);
      const trades = meanReversionStrategy(prices, 5);
      for (const t of trades) {
        expect(t.price).toBeGreaterThan(0);
        expect(t.qty).toBeGreaterThan(0);
      }
    });
  });

  describe('最大回撤计算', () => {
    it('上升曲线回撤为0', () => {
      const prices = [1, 2, 3, 4, 5];
      expect(calcMaxDrawdown(prices)).toBe(0);
    });

    it('下降曲线回撤应大于0', () => {
      const prices = [100, 90, 80, 70, 60];
      expect(calcMaxDrawdown(prices)).toBeGreaterThan(0);
    });

    it('应该正确计算最大回撤', () => {
      const prices = [100, 120, 80, 110, 60, 90];
      const dd = calcMaxDrawdown(prices);
      expect(dd).toBeCloseTo((120 - 60) / 120, 5);
    });

    it('单值数组回撤为0', () => {
      expect(calcMaxDrawdown([100])).toBe(0);
    });

    it('等值数组回撤为0', () => {
      expect(calcMaxDrawdown([50, 50, 50, 50])).toBe(0);
    });

    it('V型走势回撤正确', () => {
      const prices = [100, 110, 120, 60, 130];
      expect(calcMaxDrawdown(prices)).toBeCloseTo((120 - 60) / 120, 5);
    });

    it('回撤不应该超过100%', () => {
      const prices = [100, 50, 1, 0.1];
      expect(calcMaxDrawdown(prices)).toBeLessThanOrEqual(1);
    });

    it('多次波动取最大回撤', () => {
      const prices = [100, 90, 95, 85, 100, 70, 95];
      const dd = calcMaxDrawdown(prices);
      expect(dd).toBeCloseTo((100 - 70) / 100, 5);
    });

    it('大数值应该正确处理', () => {
      const prices = [1e6, 1.2e6, 0.8e6, 1.1e6];
      const dd = calcMaxDrawdown(prices);
      expect(dd).toBeCloseTo((1.2e6 - 0.8e6) / 1.2e6, 5);
    });

    it('微小波动回撤接近0', () => {
      const prices = Array.from({ length: 100 }, (_, i) => 100 + Math.sin(i) * 0.001);
      expect(calcMaxDrawdown(prices)).toBeLessThan(0.01);
    });
  });

  describe('夏普比率计算', () => {
    it('零波动收益夏普应为正', () => {
      const returns = Array(252).fill(0.001);
      expect(calcSharpe(returns)).toBeGreaterThan(0);
    });

    it('负收益夏普应为负', () => {
      const returns = Array(252).fill(-0.001);
      expect(calcSharpe(returns)).toBeLessThan(0);
    });

    it('零标准差应该返回0', () => {
      const returns = Array(100).fill(0);
      expect(calcSharpe(returns)).toBe(0);
    });

    it('应该年化夏普比率', () => {
      const returns = Array.from({ length: 252 }, () => 0.001 + (Math.random() - 0.5) * 0.01);
      const sharpe = calcSharpe(returns);
      expect(Math.abs(sharpe)).toBeGreaterThan(0);
    });

    it('高波动低收益夏普应较低', () => {
      const lowVol = Array(252).fill(0.001);
      const highVol = Array.from({ length: 252 }, (_, i) => i % 2 === 0 ? 0.01 : -0.01);
      expect(calcSharpe(lowVol)).toBeGreaterThan(calcSharpe(highVol));
    });

    it('不同无风险利率影响夏普', () => {
      const returns = Array.from({ length: 252 }, () => 0.002);
      const s1 = calcSharpe(returns, 0);
      const s2 = calcSharpe(returns, 0.1);
      expect(s1).toBeGreaterThan(s2);
    });

    it('空数组应该返回0', () => {
      expect(calcSharpe([])).toBe(0);
    });

    it('单一收益率应该返回有效值', () => {
      const result = calcSharpe([0.01]);
      expect(typeof result).toBe('number');
      expect(isNaN(result)).toBe(false);
    });

    it('收益分布对称时夏普应接近0', () => {
      const returns = Array.from({ length: 252 }, (_, i) => i % 2 === 0 ? 0.01 : -0.01);
      const sharpe = calcSharpe(returns, 0);
      expect(Math.abs(sharpe)).toBeLessThan(0.5);
    });

    it('应该处理极值收益', () => {
      const returns = [0.5, -0.3, 0.2, -0.1, 0.4, -0.5, 0.3, -0.2];
      const sharpe = calcSharpe(returns);
      expect(isFinite(sharpe)).toBe(true);
    });
  });

  describe('双均线策略', () => {
    const dualMAStrategy = (prices: number[], fast: number = 5, slow: number = 20): Trade[] => {
      const trades: Trade[] = [];
      let position = 0;
      const calcMA = (arr: number[], start: number, period: number) =>
        arr.slice(Math.max(0, start - period + 1), start + 1).reduce((a, b) => a + b, 0) / Math.min(period, start + 1);
      for (let i = slow; i < prices.length; i++) {
        const fastMA = calcMA(prices, i, fast);
        const slowMA = calcMA(prices, i, slow);
        const prevFastMA = calcMA(prices, i - 1, fast);
        const prevSlowMA = calcMA(prices, i - 1, slow);
        if (prevFastMA <= prevSlowMA && fastMA > slowMA && position === 0) {
          trades.push({ date: `${i}`, type: 'buy', price: prices[i], qty: 100 });
          position = 100;
        } else if (prevFastMA >= prevSlowMA && fastMA < slowMA && position > 0) {
          trades.push({ date: `${i}`, type: 'sell', price: prices[i], qty: position });
          position = 0;
        }
      }
      return trades;
    };

    it('金叉应该产生买入信号', () => {
      const prices = Array.from({ length: 40 }, (_, i) => i < 20 ? 100 - i * 0.5 : 90 + (i - 20) * 1.5);
      const trades = dualMAStrategy(prices, 3, 10);
      expect(trades.some(t => t.type === 'buy')).toBe(true);
    });

    it('死叉应该产生卖出信号', () => {
      const prices = Array.from({ length: 40 }, (_, i) => i < 20 ? 90 + i * 1.5 : 120 - (i - 20) * 2);
      const trades = dualMAStrategy(prices, 3, 10);
      const sells = trades.filter(t => t.type === 'sell');
      expect(sells.length).toBeGreaterThan(0);
    });

    it('趋势不明朗应该减少交易', () => {
      const flat = Array(50).fill(100);
      const trades = dualMAStrategy(flat, 5, 20);
      expect(trades.length).toBe(0);
    });

    it('短周期参数应该更敏感', () => {
      const prices = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 5) * 15);
      const t3 = dualMAStrategy(prices, 3, 10);
      const t10 = dualMAStrategy(prices, 10, 30);
      expect(t3.length).toBeGreaterThanOrEqual(t10.length);
    });

    it('买卖应该交替出现', () => {
      const prices = Array.from({ length: 80 }, (_, i) => 100 + Math.sin(i / 4) * 20);
      const trades = dualMAStrategy(prices, 5, 20);
      for (let i = 1; i < trades.length; i++) {
        expect(trades[i].type).not.toBe(trades[i - 1].type);
      }
    });
  });
});
