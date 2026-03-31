/**
 * Backtest 模型测试
 */

import { describe, it, expect } from 'vitest';
import {
  validateStrategyType,
  validateBacktestPeriod,
  calculateSharpeRatio,
  calculateMaxDrawdown,
  type BacktestStrategy,
  type BacktestRun,
  type BacktestResult,
  type BacktestTrade,
  type BacktestEquity,
  type BacktestReport,
  type StrategyType,
  type BacktestStatus,
} from '../../models/Backtest';

describe('Backtest Model', () => {
  describe('validateStrategyType', () => {
    it('should validate correct strategy types', () => {
      expect(validateStrategyType('momentum')).toBe(true);
      expect(validateStrategyType('mean_reversion')).toBe(true);
      expect(validateStrategyType('value')).toBe(true);
      expect(validateStrategyType('growth')).toBe(true);
      expect(validateStrategyType('trend_following')).toBe(true);
      expect(validateStrategyType('breakout')).toBe(true);
      expect(validateStrategyType('custom')).toBe(true);
    });

    it('should reject invalid strategy types', () => {
      expect(validateStrategyType('invalid')).toBe(false);
      expect(validateStrategyType('')).toBe(false);
      expect(validateStrategyType('scalping')).toBe(false);
    });
  });

  describe('validateBacktestPeriod', () => {
    it('should validate correct periods', () => {
      const start = new Date('2023-01-01');
      const end = new Date('2023-12-31');
      expect(validateBacktestPeriod(start, end)).toBe(true);
    });

    it('should reject periods where start >= end', () => {
      const date = new Date('2023-06-01');
      expect(validateBacktestPeriod(date, date)).toBe(false);
      expect(validateBacktestPeriod(date, new Date('2023-01-01'))).toBe(false);
    });

    it('should reject periods ending in the future', () => {
      const start = new Date('2023-01-01');
      const futureEnd = new Date();
      futureEnd.setFullYear(futureEnd.getFullYear() + 1);
      expect(validateBacktestPeriod(start, futureEnd)).toBe(false);
    });
  });

  describe('calculateSharpeRatio', () => {
    it('should calculate Sharpe ratio for positive returns', () => {
      const returns = [0.01, 0.02, -0.01, 0.015, 0.005];
      const sharpe = calculateSharpeRatio(returns);
      expect(sharpe).toBeGreaterThan(0);
    });

    it('should calculate Sharpe ratio for negative returns', () => {
      const returns = [-0.01, -0.02, -0.01, -0.015, -0.005];
      const sharpe = calculateSharpeRatio(returns);
      expect(sharpe).toBeLessThan(0);
    });

    it('should return 0 for insufficient data', () => {
      expect(calculateSharpeRatio([0.01])).toBe(0);
      expect(calculateSharpeRatio([])).toBe(0);
    });

    it('should return 0 for zero volatility', () => {
      const returns = [0.01, 0.01, 0.01, 0.01];
      const sharpe = calculateSharpeRatio(returns);
      expect(sharpe).toBe(0);
    });

    it('should use custom risk-free rate', () => {
      const returns = [0.01, 0.02, -0.01, 0.015, 0.005];
      const sharpe1 = calculateSharpeRatio(returns, 0.03);
      const sharpe2 = calculateSharpeRatio(returns, 0.05);
      expect(sharpe1).toBeGreaterThan(sharpe2);
    });
  });

  describe('calculateMaxDrawdown', () => {
    it('should calculate max drawdown correctly', () => {
      const equity = [100, 110, 105, 120, 90, 95, 115];
      const maxDD = calculateMaxDrawdown(equity);
      expect(maxDD).toBeCloseTo(0.25, 2); // (120-90)/120 = 0.25
    });

    it('should return 0 for always rising curve', () => {
      const equity = [100, 110, 120, 130, 140];
      expect(calculateMaxDrawdown(equity)).toBe(0);
    });

    it('should return 0 for empty curve', () => {
      expect(calculateMaxDrawdown([])).toBe(0);
    });

    it('should handle single element', () => {
      expect(calculateMaxDrawdown([100])).toBe(0);
    });

    it('should handle declining curve', () => {
      const equity = [100, 90, 80, 70, 60];
      const maxDD = calculateMaxDrawdown(equity);
      expect(maxDD).toBeCloseTo(0.4, 2); // (100-60)/100 = 0.4
    });
  });

  describe('Type interfaces', () => {
    it('should allow BacktestStrategy creation', () => {
      const strategy: BacktestStrategy = {
        id: 1,
        userId: 1,
        name: '动量策略',
        type: 'momentum',
        parameters: {
          holdingPeriod: 20,
          stopLoss: 5,
          takeProfit: 15,
          maxPositions: 10,
          rebalanceFrequency: 'weekly',
        },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      expect(strategy.name).toBe('动量策略');
    });

    it('should allow BacktestRun creation', () => {
      const run: BacktestRun = {
        id: 1,
        strategyId: 1,
        startDate: new Date('2023-01-01'),
        endDate: new Date('2023-12-31'),
        initialCapital: 1000000,
        commission: 0.0003,
        slippage: 0.001,
        status: 'pending',
        createdAt: new Date(),
      };
      expect(run.initialCapital).toBe(1000000);
    });

    it('should allow BacktestResult creation', () => {
      const result: BacktestResult = {
        id: 1,
        runId: 1,
        totalReturn: 25.5,
        annualizedReturn: 25.5,
        benchmarkReturn: 10.2,
        excessReturn: 15.3,
        sharpeRatio: 1.8,
        sortinoRatio: 2.1,
        maxDrawdown: 8.5,
        maxDrawdownDuration: 30,
        volatility: 15.2,
        winRate: 65.5,
        profitLossRatio: 2.1,
        totalTrades: 120,
        avgHoldingPeriod: 15,
        turnoverRate: 350,
        alpha: 12.5,
        beta: 0.85,
        informationRatio: 1.5,
        calmarRatio: 3.0,
        createdAt: new Date(),
      };
      expect(result.sharpeRatio).toBe(1.8);
    });

    it('should allow BacktestTrade creation', () => {
      const trade: BacktestTrade = {
        id: 1,
        runId: 1,
        stockId: 1,
        stockSymbol: '000001.SZ',
        direction: 'long',
        entryDate: new Date('2023-03-01'),
        entryPrice: 12.5,
        exitDate: new Date('2023-03-15'),
        exitPrice: 13.8,
        quantity: 1000,
        pnl: 1300,
        pnlPercent: 10.4,
        holdingDays: 14,
        exitReason: 'take_profit',
        createdAt: new Date(),
      };
      expect(trade.direction).toBe('long');
    });
  });

  describe('Strategy types', () => {
    it('should support all strategy types', () => {
      const types: StrategyType[] = [
        'momentum', 'mean_reversion', 'value', 'growth',
        'trend_following', 'breakout', 'custom'
      ];
      types.forEach(type => {
        expect(validateStrategyType(type)).toBe(true);
      });
    });
  });

  describe('Backtest statuses', () => {
    it('should support all statuses', () => {
      const statuses: BacktestStatus[] = [
        'pending', 'running', 'completed', 'failed', 'cancelled'
      ];
      statuses.forEach(status => {
        const run: BacktestRun = {
          id: 1,
          strategyId: 1,
          startDate: new Date(),
          endDate: new Date(),
          initialCapital: 1000000,
          commission: 0.0003,
          slippage: 0.001,
          status,
          createdAt: new Date(),
        };
        expect(run.status).toBe(status);
      });
    });
  });
});
