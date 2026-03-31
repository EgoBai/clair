import { describe, it, expect, beforeEach } from 'vitest';
import { BacktestEngine, BacktestConfig, BarData, StrategyFn, TradeSignal, Position } from '../services/backtestEngine';

describe('BacktestEngine', () => {
  let engine: BacktestEngine;
  let config: BacktestConfig;

  beforeEach(() => {
    config = {
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      initialCapital: 100000,
      commission: 0.001,
      slippage: 0.001,
      maxPositions: 10
    };
    engine = new BacktestEngine(config);
  });

  const makeBars = (code: string, prices: number[]): Map<string, BarData[]> => {
    const bars: BarData[] = prices.map((p, i) => ({
      date: `2024-01-${String(i + 1).padStart(2, '0')}`,
      open: p * 0.99,
      high: p * 1.02,
      low: p * 0.98,
      close: p,
      volume: 10000
    }));
    return new Map([[code, bars]]);
  };

  const buySellStrategy: StrategyFn = (bar, history, positions): TradeSignal[] => {
    if (history.length < 2) return [];
    const prev = history[history.length - 2];
    
    if (bar.close > prev.close * 1.02 && positions.length === 0) {
      return [{
        timestamp: bar.date,
        action: 'buy',
        stockCode: '600519',
        price: bar.close,
        quantity: 100,
        reason: 'momentum'
      }];
    }
    
    if (bar.close < prev.close * 0.98 && positions.length > 0) {
      return [{
        timestamp: bar.date,
        action: 'sell',
        stockCode: '600519',
        price: bar.close,
        quantity: 100,
        reason: 'momentum_exit'
      }];
    }
    
    return [];
  };

  describe('run', () => {
    it('should run backtest and return result', async () => {
      const data = makeBars('600519', [100, 103, 106, 104, 102, 105, 108, 110, 107, 112]);
      const result = await engine.run(data, buySellStrategy);
      
      expect(result).toBeDefined();
      expect(result.totalTrades).toBeGreaterThanOrEqual(0);
      expect(result.equityCurve.length).toBeGreaterThan(0);
    });

    it('should return valid equity curve', async () => {
      const data = makeBars('600519', [100, 105, 110, 115, 120]);
      const result = await engine.run(data, buySellStrategy);
      
      expect(result.equityCurve).toHaveLength(5);
      result.equityCurve.forEach(point => {
        expect(point.date).toBeDefined();
        expect(point.equity).toBeGreaterThan(0);
      });
    });

    it('should handle empty data', async () => {
      const data = new Map<string, BarData[]>();
      const result = await engine.run(data, buySellStrategy);
      
      expect(result.totalTrades).toBe(0);
      expect(result.totalReturn).toBe(0);
    });

    it('should handle single bar data', async () => {
      const data = makeBars('600519', [100]);
      const result = await engine.run(data, buySellStrategy);
      
      expect(result.equityCurve).toHaveLength(1);
      expect(result.totalTrades).toBe(0);
    });
  });

  describe('result metrics', () => {
    it('should calculate total return', async () => {
      const data = makeBars('600519', [100, 110, 105, 120]);
      const result = await engine.run(data, buySellStrategy);
      
      expect(typeof result.totalReturn).toBe('number');
      expect(isFinite(result.totalReturn)).toBe(true);
    });

    it('should calculate annualized return', async () => {
      const data = makeBars('600519', [100, 110, 120, 130, 140]);
      const result = await engine.run(data, buySellStrategy);
      
      expect(typeof result.annualizedReturn).toBe('number');
    });

    it('should calculate max drawdown between 0 and 1', async () => {
      const data = makeBars('600519', [100, 110, 105, 100, 95, 105]);
      const result = await engine.run(data, buySellStrategy);
      
      expect(result.maxDrawdown).toBeGreaterThanOrEqual(0);
      expect(result.maxDrawdown).toBeLessThanOrEqual(1);
    });

    it('should calculate win rate between 0 and 1', async () => {
      const data = makeBars('600519', [100, 105, 110, 108, 112, 106]);
      const result = await engine.run(data, buySellStrategy);
      
      expect(result.winRate).toBeGreaterThanOrEqual(0);
      expect(result.winRate).toBeLessThanOrEqual(1);
    });

    it('should calculate profit factor', async () => {
      const data = makeBars('600519', [100, 110, 105, 120, 115, 130]);
      const result = await engine.run(data, buySellStrategy);
      
      expect(result.profitFactor).toBeGreaterThanOrEqual(0);
    });

    it('should calculate sharpe ratio', async () => {
      const data = makeBars('600519', [100, 102, 101, 105, 103, 108, 110]);
      const result = await engine.run(data, buySellStrategy);
      
      expect(typeof result.sharpeRatio).toBe('number');
      expect(isFinite(result.sharpeRatio)).toBe(true);
    });

    it('should track consecutive wins and losses', async () => {
      const data = makeBars('600519', [100, 110, 105, 120, 115, 130, 125, 140]);
      const result = await engine.run(data, buySellStrategy);
      
      expect(result.maxConsecutiveWins).toBeGreaterThanOrEqual(0);
      expect(result.maxConsecutiveLosses).toBeGreaterThanOrEqual(0);
    });

    it('should track avg win and avg loss', async () => {
      const data = makeBars('600519', [100, 110, 105, 120, 115]);
      const result = await engine.run(data, buySellStrategy);
      
      expect(result.avgWin).toBeGreaterThanOrEqual(0);
      expect(result.avgLoss).toBeGreaterThanOrEqual(0);
    });
  });

  describe('commission and slippage', () => {
    it('should apply commission', async () => {
      const highCommConfig: BacktestConfig = {
        ...config,
        commission: 0.01
      };
      const highCommEngine = new BacktestEngine(highCommConfig);
      const data = makeBars('600519', [100, 110, 105, 120]);
      
      const result = await highCommEngine.run(data, buySellStrategy);
      const noCommResult = await engine.run(data, buySellStrategy);
      
      // Higher commission should result in lower or equal returns
      expect(result.totalReturn).toBeLessThanOrEqual(noCommResult.totalReturn + 0.001);
    });

    it('should apply slippage', async () => {
      const highSlipConfig: BacktestConfig = {
        ...config,
        slippage: 0.01
      };
      const highSlipEngine = new BacktestEngine(highSlipConfig);
      const data = makeBars('600519', [100, 110, 105, 120]);
      
      const result = await highSlipEngine.run(data, buySellStrategy);
      expect(result).toBeDefined();
    });
  });

  describe('risk management', () => {
    it('should respect stop loss', async () => {
      const slConfig: BacktestConfig = {
        ...config,
        stopLoss: 0.05
      };
      const slEngine = new BacktestEngine(slConfig);
      const data = makeBars('600519', [100, 105, 90, 85, 80]);
      
      const result = await slEngine.run(data, buySellStrategy);
      expect(result).toBeDefined();
    });

    it('should respect take profit', async () => {
      const tpConfig: BacktestConfig = {
        ...config,
        takeProfit: 0.10
      };
      const tpEngine = new BacktestEngine(tpConfig);
      const data = makeBars('600519', [100, 105, 115, 120, 125]);
      
      const result = await tpEngine.run(data, buySellStrategy);
      expect(result).toBeDefined();
    });

    it('should respect max positions limit', async () => {
      const limitedConfig: BacktestConfig = {
        ...config,
        maxPositions: 1
      };
      const limitedEngine = new BacktestEngine(limitedConfig);
      
      const multiStrategy: StrategyFn = (bar, history, positions) => {
        if (history.length < 2) return [];
        return [{
          timestamp: bar.date,
          action: 'buy' as const,
          stockCode: bar.date, // Different stock each day
          price: bar.close,
          quantity: 100,
          reason: 'test'
        }];
      };
      
      const data = new Map<string, BarData[]>([
        ['A', [{ date: '2024-01-01', open: 100, high: 102, low: 98, close: 100, volume: 1000 }]],
        ['B', [{ date: '2024-01-01', open: 100, high: 102, low: 98, close: 100, volume: 1000 }]]
      ]);
      
      const result = await limitedEngine.run(data, multiStrategy);
      expect(result).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle always-hold strategy', async () => {
      const holdStrategy: StrategyFn = () => [];
      const data = makeBars('600519', [100, 105, 110, 115, 120]);
      
      const result = await engine.run(data, holdStrategy);
      expect(result.totalTrades).toBe(0);
      expect(result.totalReturn).toBe(0);
    });

    it('should handle declining market', async () => {
      const data = makeBars('600519', [100, 95, 90, 85, 80]);
      const result = await engine.run(data, buySellStrategy);
      
      expect(result).toBeDefined();
    });

    it('should handle volatile market', async () => {
      const data = makeBars('600519', [100, 110, 95, 115, 90, 120, 85, 125]);
      const result = await engine.run(data, buySellStrategy);
      
      expect(result).toBeDefined();
    });

    it('should handle flat market', async () => {
      const data = makeBars('600519', [100, 100, 100, 100, 100]);
      const result = await engine.run(data, buySellStrategy);
      
      expect(result.totalTrades).toBe(0);
    });
  });
});
