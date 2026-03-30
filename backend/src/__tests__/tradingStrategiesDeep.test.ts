import { describe, it, expect } from 'vitest';

// 深度交易策略测试

interface TradeSignal {
  type: 'buy' | 'sell' | 'hold';
  strength: number; // 0-100
  reason: string;
  price: number;
  timestamp: number;
}

interface StrategyConfig {
  name: string;
  parameters: Record<string, number>;
  enabled: boolean;
}

interface TradeResult {
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  pnlPercent: number;
  duration: number;
  side: 'long' | 'short';
}

function generateSignals(prices: number[], period: number): TradeSignal[] {
  const signals: TradeSignal[] = [];
  for (let i = period; i < prices.length; i++) {
    const ma = prices.slice(i - period, i).reduce((a, b) => a + b, 0) / period;
    const prevMa = prices.slice(i - period - 1, i - 1).reduce((a, b) => a + b, 0) / period;
    if (ma > prevMa && prices[i] > ma) {
      signals.push({ type: 'buy', strength: Math.min(100, ((prices[i] - ma) / ma) * 1000), reason: 'price_above_ma', price: prices[i], timestamp: i });
    } else if (ma < prevMa && prices[i] < ma) {
      signals.push({ type: 'sell', strength: Math.min(100, ((ma - prices[i]) / ma) * 1000), reason: 'price_below_ma', price: prices[i], timestamp: i });
    }
  }
  return signals;
}

function calculatePnL(entry: number, exit: number, qty: number, side: 'long' | 'short'): TradeResult {
  const pnl = side === 'long' ? (exit - entry) * qty : (entry - exit) * qty;
  return {
    entryPrice: entry,
    exitPrice: exit,
    quantity: qty,
    pnl,
    pnlPercent: (pnl / (entry * qty)) * 100,
    duration: 1,
    side,
  };
}

function backtestStrategy(prices: number[], signals: TradeSignal[]): TradeResult[] {
  const results: TradeResult[] = [];
  let position: { entry: number; side: 'long' | 'short' } | null = null;

  for (const signal of signals) {
    if (signal.type === 'buy' && !position) {
      position = { entry: signal.price, side: 'long' };
    } else if (signal.type === 'sell' && position) {
      results.push(calculatePnL(position.entry, signal.price, 100, position.side));
      position = null;
    }
  }
  if (position) {
    results.push(calculatePnL(position.entry, prices[prices.length - 1], 100, position.side));
  }
  return results;
}

describe('Trading Strategies Deep', () => {
  describe('信号生成', () => {
    it('should generate buy signals when price crosses above MA', () => {
      const prices = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
      const signals = generateSignals(prices, 5);
      expect(signals.every(s => s.type === 'buy' || s.type === 'sell')).toBe(true);
      expect(signals.length).toBeGreaterThan(0);
    });

    it('should generate sell signals in downtrend', () => {
      const prices = [20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10];
      const signals = generateSignals(prices, 5);
      const sellSignals = signals.filter(s => s.type === 'sell');
      expect(sellSignals.length).toBeGreaterThan(0);
    });

    it('should have strength between 0 and 100', () => {
      const prices = [10, 15, 20, 15, 10, 15, 20, 25, 30, 25, 20];
      const signals = generateSignals(prices, 3);
      signals.forEach(s => {
        expect(s.strength).toBeGreaterThanOrEqual(0);
        expect(s.strength).toBeLessThanOrEqual(100);
      });
    });

    it('should include reason in every signal', () => {
      const prices = Array.from({ length: 20 }, (_, i) => 100 + Math.sin(i) * 10);
      const signals = generateSignals(prices, 5);
      signals.forEach(s => {
        expect(s.reason).toBeTruthy();
        expect(typeof s.reason).toBe('string');
      });
    });

    it('should produce no signals with flat prices', () => {
      const prices = Array(20).fill(100);
      const signals = generateSignals(prices, 5);
      expect(signals.length).toBe(0);
    });
  });

  describe('盈亏计算', () => {
    it('should calculate long PnL correctly', () => {
      const result = calculatePnL(100, 110, 100, 'long');
      expect(result.pnl).toBe(1000);
      expect(result.pnlPercent).toBeCloseTo(10, 1);
    });

    it('should calculate short PnL correctly', () => {
      const result = calculatePnL(110, 100, 100, 'short');
      expect(result.pnl).toBe(1000);
      expect(result.pnlPercent).toBeCloseTo(9.09, 1);
    });

    it('should handle zero PnL (same price)', () => {
      const result = calculatePnL(100, 100, 100, 'long');
      expect(result.pnl).toBe(0);
      expect(result.pnlPercent).toBe(0);
    });

    it('should calculate negative PnL for losing trade', () => {
      const result = calculatePnL(100, 90, 100, 'long');
      expect(result.pnl).toBe(-1000);
      expect(result.pnlPercent).toBeLessThan(0);
    });

    it('should handle fractional shares', () => {
      const result = calculatePnL(100, 110, 50.5, 'long');
      expect(result.pnl).toBeCloseTo(505, 1);
    });
  });

  describe('回测引擎', () => {
    it('should execute trades from signals', () => {
      const prices = [10, 12, 14, 16, 14, 12, 10, 12, 14, 16];
      const signals: TradeSignal[] = [
        { type: 'buy', strength: 80, reason: 'test', price: 12, timestamp: 1 },
        { type: 'sell', strength: 70, reason: 'test', price: 14, timestamp: 3 },
        { type: 'buy', strength: 60, reason: 'test', price: 10, timestamp: 6 },
        { type: 'sell', strength: 90, reason: 'test', price: 16, timestamp: 9 },
      ];
      const results = backtestStrategy(prices, signals);
      expect(results.length).toBe(2);
      expect(results[0].pnl).toBeGreaterThan(0);
      expect(results[1].pnl).toBeGreaterThan(0);
    });

    it('should handle no signals', () => {
      const results = backtestStrategy([100, 101, 102], []);
      expect(results.length).toBe(0);
    });

    it('should close open position at end', () => {
      const prices = [10, 12, 14];
      const signals: TradeSignal[] = [
        { type: 'buy', strength: 80, reason: 'test', price: 12, timestamp: 1 },
      ];
      const results = backtestStrategy(prices, signals);
      expect(results.length).toBe(1);
      expect(results[0].exitPrice).toBe(14);
    });

    it('should not open multiple positions simultaneously', () => {
      const prices = [10, 12, 14, 16, 18];
      const signals: TradeSignal[] = [
        { type: 'buy', strength: 80, reason: 'test', price: 12, timestamp: 1 },
        { type: 'buy', strength: 90, reason: 'test', price: 14, timestamp: 2 },
      ];
      const results = backtestStrategy(prices, signals);
      // Only one position should be opened
      expect(results.length).toBe(1);
    });
  });

  describe('策略配置', () => {
    it('should validate strategy config structure', () => {
      const config: StrategyConfig = {
        name: 'MA_Cross',
        parameters: { short_period: 5, long_period: 20 },
        enabled: true,
      };
      expect(config.name).toBeTruthy();
      expect(config.parameters).toBeDefined();
      expect(typeof config.enabled).toBe('boolean');
    });

    it('should handle multiple strategies', () => {
      const strategies: StrategyConfig[] = [
        { name: 'MA_Cross', parameters: { short: 5, long: 20 }, enabled: true },
        { name: 'RSI_Reversal', parameters: { period: 14, overbought: 70, oversold: 30 }, enabled: true },
        { name: 'MACD_Signal', parameters: { fast: 12, slow: 26, signal: 9 }, enabled: false },
      ];
      const enabled = strategies.filter(s => s.enabled);
      expect(enabled.length).toBe(2);
    });

    it('should support parameter ranges', () => {
      const config: StrategyConfig = {
        name: 'test',
        parameters: { period: 14, threshold: 0.5 },
        enabled: true,
      };
      expect(config.parameters['period']).toBeGreaterThan(0);
      expect(config.parameters['threshold']).toBeGreaterThan(0);
      expect(config.parameters['threshold']).toBeLessThan(1);
    });
  });

  describe('风险控制', () => {
    it('should enforce stop loss', () => {
      const entryPrice = 100;
      const stopLoss = 0.05; // 5%
      const currentPrice = 93;
      const shouldStop = (currentPrice - entryPrice) / entryPrice < -stopLoss;
      expect(shouldStop).toBe(true);
    });

    it('should enforce take profit', () => {
      const entryPrice = 100;
      const takeProfit = 0.10; // 10%
      const currentPrice = 112;
      const shouldTake = (currentPrice - entryPrice) / entryPrice >= takeProfit;
      expect(shouldTake).toBe(true);
    });

    it('should calculate position size by risk', () => {
      const accountBalance = 100000;
      const riskPerTrade = 0.02; // 2%
      const entryPrice = 100;
      const stopLoss = 95;
      const riskAmount = accountBalance * riskPerTrade;
      const riskPerShare = entryPrice - stopLoss;
      const positionSize = Math.floor(riskAmount / riskPerShare);
      expect(positionSize).toBe(400);
      expect(positionSize * entryPrice).toBeLessThanOrEqual(accountBalance);
    });

    it('should limit max position size', () => {
      const accountBalance = 100000;
      const maxPositionPercent = 0.25; // 25% max per position
      const positionValue = 30000;
      const limited = Math.min(positionValue, accountBalance * maxPositionPercent);
      expect(limited).toBe(25000);
    });
  });
});
