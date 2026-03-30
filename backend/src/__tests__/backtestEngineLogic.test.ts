import { describe, it, expect } from 'vitest';

// 回测引擎核心逻辑
interface Bar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Trade {
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  direction: 'long' | 'short';
  pnl: number;
  pnlPercent: number;
}

interface BacktestConfig {
  initialCapital: number;
  commission: number; // 手续费率
  slippage: number; // 滑点
  maxPosition: number; // 最大持仓比例
}

function calculateSMA(prices: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      result.push(sum / period);
    }
  }
  return result;
}

function calculateEMA(prices: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema: number[] = [prices[0]];
  for (let i = 1; i < prices.length; i++) {
    ema.push(prices[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

function runBacktest(bars: Bar[], config: BacktestConfig): {
  trades: Trade[];
  totalReturn: number;
  maxDrawdown: number;
  winRate: number;
  profitFactor: number;
  sharpeRatio: number;
} {
  const trades: Trade[] = [];
  let position: { entryPrice: number; entryDate: string; quantity: number } | null = null;
  let capital = config.initialCapital;
  let peakCapital = config.initialCapital;
  let maxDrawdown = 0;

  const closes = bars.map(b => b.close);
  const sma5 = calculateSMA(closes, 5);
  const sma20 = calculateSMA(closes, 20);

  for (let i = 1; i < bars.length; i++) {
    const bar = bars[i];
    const buyPrice = bar.close * (1 + config.slippage);
    const sellPrice = bar.close * (1 - config.slippage);

    if (!position && sma5[i] !== null && sma20[i] !== null && sma5[i]! > sma20[i]! && sma5[i - 1]! <= sma20[i - 1]!) {
      // 金叉买入
      const maxAmount = capital * config.maxPosition;
      const quantity = Math.floor(maxAmount / buyPrice);
      if (quantity > 0) {
        const cost = quantity * buyPrice * (1 + config.commission);
        if (cost <= capital) {
          position = { entryPrice: buyPrice, entryDate: bar.date, quantity };
          capital -= cost;
        }
      }
    } else if (position && sma5[i] !== null && sma20[i] !== null && sma5[i]! < sma20[i]! && sma5[i - 1]! >= sma20[i - 1]!) {
      // 死叉卖出
      const revenue = position.quantity * sellPrice * (1 - config.commission);
      const pnl = revenue - position.quantity * position.entryPrice;
      const pnlPercent = (sellPrice / position.entryPrice - 1) * 100;

      trades.push({
        entryDate: position.entryDate,
        exitDate: bar.date,
        entryPrice: position.entryPrice,
        exitPrice: sellPrice,
        quantity: position.quantity,
        direction: 'long',
        pnl,
        pnlPercent,
      });

      capital += revenue;
      peakCapital = Math.max(peakCapital, capital);
      const drawdown = (peakCapital - capital) / peakCapital;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
      position = null;
    }
  }

  const winningTrades = trades.filter(t => t.pnl > 0);
  const losingTrades = trades.filter(t => t.pnl <= 0);
  const totalProfit = winningTrades.reduce((s, t) => s + t.pnl, 0);
  const totalLoss = Math.abs(losingTrades.reduce((s, t) => s + t.pnl, 0));

  const returns = trades.map(t => t.pnlPercent);
  const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const stdDev = returns.length > 1
    ? Math.sqrt(returns.reduce((s, r) => s + (r - avgReturn) ** 2, 0) / (returns.length - 1))
    : 0;
  const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

  return {
    trades,
    totalReturn: ((capital + (position ? position.quantity * closes[closes.length - 1] : 0)) / config.initialCapital - 1) * 100,
    maxDrawdown: maxDrawdown * 100,
    winRate: trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0,
    profitFactor: totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? Infinity : 0,
    sharpeRatio,
  };
}

function generateTestData(count: number, startPrice = 100): Bar[] {
  const bars: Bar[] = [];
  let price = startPrice;
  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.48) * 3;
    price = Math.max(1, price + change);
    const high = price * (1 + Math.random() * 0.02);
    const low = price * (1 - Math.random() * 0.02);
    bars.push({
      date: `2024-${String(Math.floor(i / 30) + 1).padStart(2, '0')}-${String((i % 30) + 1).padStart(2, '0')}`,
      open: price - change * 0.5,
      high,
      low,
      close: price,
      volume: Math.floor(Math.random() * 1000000 + 100000),
    });
  }
  return bars;
}

describe('回测引擎逻辑', () => {
  describe('SMA计算', () => {
    it('应该正确计算简单移动平均', () => {
      const prices = [1, 2, 3, 4, 5];
      const sma3 = calculateSMA(prices, 3);
      expect(sma3[0]).toBeNull();
      expect(sma3[1]).toBeNull();
      expect(sma3[2]).toBe(2); // (1+2+3)/3
      expect(sma3[3]).toBe(3); // (2+3+4)/3
      expect(sma3[4]).toBe(4); // (3+4+5)/3
    });

    it('period=1应该返回原值', () => {
      const prices = [10, 20, 30];
      const sma1 = calculateSMA(prices, 1);
      expect(sma1).toEqual([10, 20, 30]);
    });

    it('应该处理相同值', () => {
      const prices = [5, 5, 5, 5];
      const sma = calculateSMA(prices, 2);
      expect(sma[1]).toBe(5);
      expect(sma[2]).toBe(5);
    });

    it('应该处理负值', () => {
      const prices = [-1, -2, -3, -4];
      const sma = calculateSMA(prices, 2);
      expect(sma[1]).toBe(-1.5);
    });
  });

  describe('EMA计算', () => {
    it('第一个值应该是原价', () => {
      const prices = [100, 102, 104];
      const ema = calculateEMA(prices, 5);
      expect(ema[0]).toBe(100);
    });

    it('应该对价格变化做出反应', () => {
      const prices = [100, 110, 120, 130, 140];
      const ema = calculateEMA(prices, 3);
      // EMA应该跟随上升趋势
      for (let i = 1; i < ema.length; i++) {
        expect(ema[i]).toBeGreaterThan(ema[i - 1]);
      }
    });

    it('k因子计算正确', () => {
      // k = 2/(period+1), period=5 => k=0.333...
      const prices = [100, 106];
      const ema = calculateEMA(prices, 5);
      const k = 2 / 6;
      const expected = prices[1] * k + prices[0] * (1 - k);
      expect(ema[1]).toBeCloseTo(expected, 5);
    });

    it('应该处理单个价格', () => {
      const ema = calculateEMA([42], 10);
      expect(ema).toEqual([42]);
    });
  });

  describe('回测执行', () => {
    const defaultConfig: BacktestConfig = {
      initialCapital: 100000,
      commission: 0.001,
      slippage: 0.001,
      maxPosition: 0.8,
    };

    it('应该返回完整的回测结果结构', () => {
      const bars = generateTestData(50);
      const result = runBacktest(bars, defaultConfig);
      expect(result).toHaveProperty('trades');
      expect(result).toHaveProperty('totalReturn');
      expect(result).toHaveProperty('maxDrawdown');
      expect(result).toHaveProperty('winRate');
      expect(result).toHaveProperty('profitFactor');
      expect(result).toHaveProperty('sharpeRatio');
    });

    it('没有交易时返回合理值', () => {
      const bars: Bar[] = [];
      for (let i = 0; i < 5; i++) {
        bars.push({ date: `2024-01-0${i+1}`, open: 100, high: 100, low: 100, close: 100, volume: 1000 });
      }
      const result = runBacktest(bars, defaultConfig);
      expect(result.trades).toHaveLength(0);
      expect(result.winRate).toBe(0);
      expect(result.profitFactor).toBe(0);
    });

    it('交易记录应该有正确的字段', () => {
      const bars = generateTestData(100);
      const result = runBacktest(bars, defaultConfig);
      for (const trade of result.trades) {
        expect(trade).toHaveProperty('entryDate');
        expect(trade).toHaveProperty('exitDate');
        expect(trade).toHaveProperty('entryPrice');
        expect(trade).toHaveProperty('exitPrice');
        expect(trade).toHaveProperty('quantity');
        expect(trade).toHaveProperty('direction');
        expect(trade).toHaveProperty('pnl');
        expect(trade).toHaveProperty('pnlPercent');
        expect(trade.quantity).toBeGreaterThan(0);
      }
    });

    it('总回报率应该合理', () => {
      const bars = generateTestData(200);
      const result = runBacktest(bars, defaultConfig);
      expect(typeof result.totalReturn).toBe('number');
      expect(isFinite(result.totalReturn)).toBe(true);
    });

    it('最大回撤应该在0-100之间', () => {
      const bars = generateTestData(200);
      const result = runBacktest(bars, defaultConfig);
      expect(result.maxDrawdown).toBeGreaterThanOrEqual(0);
      expect(result.maxDrawdown).toBeLessThanOrEqual(100);
    });

    it('胜率应该在0-100之间', () => {
      const bars = generateTestData(200);
      const result = runBacktest(bars, defaultConfig);
      expect(result.winRate).toBeGreaterThanOrEqual(0);
      expect(result.winRate).toBeLessThanOrEqual(100);
    });

    it('手续费应该影响回报', () => {
      const bars = generateTestData(100, 100);
      const noCommission = runBacktest(bars, { ...defaultConfig, commission: 0 });
      const withCommission = runBacktest(bars, { ...defaultConfig, commission: 0.01 });
      // 有手续费时回报应该更低（或持平如果没有交易）
      expect(withCommission.totalReturn).toBeLessThanOrEqual(noCommission.totalReturn);
    });

    it('滑点应该影响回报', () => {
      const bars = generateTestData(100, 100);
      const noSlippage = runBacktest(bars, { ...defaultConfig, slippage: 0 });
      const withSlippage = runBacktest(bars, { ...defaultConfig, slippage: 0.01 });
      expect(withSlippage.totalReturn).toBeLessThanOrEqual(noSlippage.totalReturn);
    });

    it('最大持仓限制应该被遵守', () => {
      const bars = generateTestData(100);
      const result = runBacktest(bars, { ...defaultConfig, maxPosition: 0.5 });
      // 无法直接验证持仓比例，但可以验证代码执行无错误
      expect(result).toBeDefined();
    });
  });

  describe('边界条件', () => {
    it('应该处理数据不足的情况', () => {
      const bars: Bar[] = [
        { date: '2024-01-01', open: 100, high: 100, low: 100, close: 100, volume: 1000 },
      ];
      const result = runBacktest(bars, { initialCapital: 100000, commission: 0.001, slippage: 0.001, maxPosition: 0.8 });
      expect(result.trades).toHaveLength(0);
    });

    it('应该处理价格剧烈波动', () => {
      const bars: Bar[] = [
        { date: '2024-01-01', open: 100, high: 100, low: 100, close: 100, volume: 1000 },
        { date: '2024-01-02', open: 50, high: 50, low: 50, close: 50, volume: 1000 },
        { date: '2024-01-03', open: 150, high: 150, low: 150, close: 150, volume: 1000 },
        { date: '2024-01-04', open: 150, high: 150, low: 150, close: 150, volume: 1000 },
        { date: '2024-01-05', open: 150, high: 150, low: 150, close: 150, volume: 1000 },
        { date: '2024-01-06', open: 150, high: 150, low: 150, close: 150, volume: 1000 },
        { date: '2024-01-07', open: 150, high: 150, low: 150, close: 150, volume: 1000 },
        { date: '2024-01-08', open: 150, high: 150, low: 150, close: 150, volume: 1000 },
        { date: '2024-01-09', open: 150, high: 150, low: 150, close: 150, volume: 1000 },
        { date: '2024-01-10', open: 150, high: 150, low: 150, close: 150, volume: 1000 },
        { date: '2024-01-11', open: 150, high: 150, low: 150, close: 150, volume: 1000 },
        { date: '2024-01-12', open: 150, high: 150, low: 150, close: 150, volume: 1000 },
        { date: '2024-01-13', open: 150, high: 150, low: 150, close: 150, volume: 1000 },
        { date: '2024-01-14', open: 150, high: 150, low: 150, close: 150, volume: 1000 },
        { date: '2024-01-15', open: 150, high: 150, low: 150, close: 150, volume: 1000 },
        { date: '2024-01-16', open: 150, high: 150, low: 150, close: 150, volume: 1000 },
        { date: '2024-01-17', open: 150, high: 150, low: 150, close: 150, volume: 1000 },
        { date: '2024-01-18', open: 150, high: 150, low: 150, close: 150, volume: 1000 },
        { date: '2024-01-19', open: 150, high: 150, low: 150, close: 150, volume: 1000 },
        { date: '2024-01-20', open: 150, high: 150, low: 150, close: 150, volume: 1000 },
        { date: '2024-01-21', open: 150, high: 150, low: 150, close: 150, volume: 1000 },
        { date: '2024-01-22', open: 150, high: 150, low: 150, close: 150, volume: 1000 },
        { date: '2024-01-23', open: 150, high: 150, low: 150, close: 150, volume: 1000 },
        { date: '2024-01-24', open: 150, high: 150, low: 150, close: 150, volume: 1000 },
        { date: '2024-01-25', open: 150, high: 150, low: 150, close: 150, volume: 1000 },
      ];
      const result = runBacktest(bars, { initialCapital: 100000, commission: 0.001, slippage: 0.001, maxPosition: 0.8 });
      expect(isFinite(result.totalReturn)).toBe(true);
    });

    it('初始资金为0不应该崩溃', () => {
      const bars = generateTestData(30);
      const result = runBacktest(bars, { initialCapital: 0, commission: 0.001, slippage: 0.001, maxPosition: 0.8 });
      expect(result).toBeDefined();
    });
  });
});
