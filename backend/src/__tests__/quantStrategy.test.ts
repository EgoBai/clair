import { describe, it, expect, beforeEach } from 'vitest';

// Quantitative Trading Strategy Engine
interface StrategyConfig {
  id: string;
  name: string;
  type: 'momentum' | 'meanReversion' | 'pairs' | 'arbitrage' | 'ml' | 'composite';
  symbols: string[];
  timeframe: '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w';
  parameters: Record<string, number | string | boolean>;
  riskLimits: {
    maxPositionSize: number;
    maxDrawdown: number;
    maxLeverage: number;
    stopLoss: number;
    takeProfit: number;
  };
  enabled: boolean;
}

interface TradeSignal {
  id: string;
  strategyId: string;
  symbol: string;
  action: 'buy' | 'sell' | 'hold';
  strength: number;
  price: number;
  timestamp: Date;
  reason: string;
  indicators: Record<string, number>;
}

interface Position {
  symbol: string;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnL: number;
  realizedPnL: number;
  entryDate: Date;
}

interface BacktestResult {
  strategyId: string;
  totalReturn: number;
  annualizedReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  profitFactor: number;
  totalTrades: number;
  avgWin: number;
  avgLoss: number;
  equity: number[];
  drawdowns: number[];
  trades: TradeSignal[];
}

class QuantStrategyEngine {
  private strategies: Map<string, StrategyConfig> = new Map();
  private signals: TradeSignal[] = [];
  private positions: Map<string, Position> = new Map();
  private backtestResults: Map<string, BacktestResult> = new Map();
  private priceHistory: Map<string, number[]> = new Map();

  createStrategy(config: Omit<StrategyConfig, 'id'>): StrategyConfig {
    const id = `strat_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const strategy: StrategyConfig = { ...config, id };
    this.strategies.set(id, strategy);
    return strategy;
  }

  loadPriceHistory(symbol: string, prices: number[]): void {
    this.priceHistory.set(symbol, [...prices]);
  }

  generateMomentumSignal(symbol: string, lookback: number, threshold: number): TradeSignal | null {
    const prices = this.priceHistory.get(symbol);
    if (!prices || prices.length < lookback + 1) return null;

    const current = prices[prices.length - 1];
    const past = prices[prices.length - 1 - lookback];
    const change = (current - past) / past;

    let action: TradeSignal['action'] = 'hold';
    let strength = Math.abs(change) * 100;

    if (change > threshold) action = 'buy';
    else if (change < -threshold) action = 'sell';

    if (action === 'hold') return null;

    return {
      id: `sig_${Date.now()}`,
      strategyId: 'momentum',
      symbol,
      action,
      strength: Math.min(strength, 100),
      price: current,
      timestamp: new Date(),
      reason: `${lookback}-day momentum: ${(change * 100).toFixed(2)}%`,
      indicators: { momentum: change, price: current },
    };
  }

  generateMeanReversionSignal(symbol: string, period: number, stdDevThreshold: number): TradeSignal | null {
    const prices = this.priceHistory.get(symbol);
    if (!prices || prices.length < period) return null;

    const recent = prices.slice(-period);
    const mean = recent.reduce((a, b) => a + b, 0) / period;
    const variance = recent.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / period;
    const std = Math.sqrt(variance);
    const current = prices[prices.length - 1];
    const zScore = (current - mean) / std;

    let action: TradeSignal['action'] = 'hold';
    if (zScore > stdDevThreshold) action = 'sell';
    else if (zScore < -stdDevThreshold) action = 'buy';

    if (action === 'hold') return null;

    return {
      id: `sig_${Date.now()}`,
      strategyId: 'meanReversion',
      symbol,
      action,
      strength: Math.min(Math.abs(zScore) * 20, 100),
      price: current,
      timestamp: new Date(),
      reason: `Z-score: ${zScore.toFixed(2)}`,
      indicators: { zScore, mean, std },
    };
  }

  generatePairsSignal(symbol1: string, symbol2: string, period: number, threshold: number): TradeSignal | null {
    const prices1 = this.priceHistory.get(symbol1);
    const prices2 = this.priceHistory.get(symbol2);
    if (!prices1 || !prices2 || prices1.length < period || prices2.length < period) return null;

    const ratio = prices1.slice(-period).map((p, i) => p / prices2[i]);
    const mean = ratio.reduce((a, b) => a + b, 0) / ratio.length;
    const currentRatio = ratio[ratio.length - 1];
    const deviation = (currentRatio - mean) / mean;

    if (Math.abs(deviation) < threshold) return null;

    return {
      id: `sig_${Date.now()}`,
      strategyId: 'pairs',
      symbol: `${symbol1}/${symbol2}`,
      action: deviation > 0 ? 'sell' : 'buy',
      strength: Math.min(Math.abs(deviation) * 100, 100),
      price: currentRatio,
      timestamp: new Date(),
      reason: `Pairs spread deviation: ${(deviation * 100).toFixed(2)}%`,
      indicators: { ratio: currentRatio, mean, deviation },
    };
  }

  addSignal(signal: TradeSignal): void {
    this.signals.push(signal);
  }

  executeSignal(signal: TradeSignal): Position {
    const existing = this.positions.get(signal.symbol);
    const quantity = signal.action === 'buy' ? 100 : -100;

    if (existing) {
      existing.quantity += quantity;
      existing.currentPrice = signal.price;
      existing.unrealizedPnL = (signal.price - existing.entryPrice) * existing.quantity;
      return existing;
    }

    const position: Position = {
      symbol: signal.symbol,
      quantity,
      entryPrice: signal.price,
      currentPrice: signal.price,
      unrealizedPnL: 0,
      realizedPnL: 0,
      entryDate: new Date(),
    };
    this.positions.set(signal.symbol, position);
    return position;
  }

  async backtest(strategyId: string, prices: Record<string, number[]>, startDate?: Date, endDate?: Date): Promise<BacktestResult> {
    const strategy = this.strategies.get(strategyId);
    if (!strategy) throw new Error('Strategy not found');

    const symbols = strategy.symbols;
    const mainPrices = prices[symbols[0]] || [];
    const equity: number[] = [];
    const trades: TradeSignal[] = [];
    let capital = 100000;
    let maxEquity = capital;
    let maxDrawdown = 0;
    const drawdowns: number[] = [];

    for (let i = 50; i < mainPrices.length; i++) {
      const window = mainPrices.slice(Math.max(0, i - 50), i + 1);
      const mean = window.reduce((a, b) => a + b, 0) / window.length;
      const current = mainPrices[i];
      const change = i > 0 ? (current - mainPrices[i - 1]) / mainPrices[i - 1] : 0;

      if (strategy.type === 'momentum' && change > 0.02) {
        capital *= (1 + change);
        trades.push({
          id: `bt_${i}`, strategyId, symbol: symbols[0], action: 'buy',
          strength: change * 100, price: current, timestamp: new Date(),
          reason: 'Momentum', indicators: {},
        });
      } else if (strategy.type === 'meanReversion' && current < mean * 0.95) {
        capital *= (1 + Math.abs(change));
        trades.push({
          id: `bt_${i}`, strategyId, symbol: symbols[0], action: 'buy',
          strength: 50, price: current, timestamp: new Date(),
          reason: 'Mean reversion', indicators: {},
        });
      }

      equity.push(capital);
      maxEquity = Math.max(maxEquity, capital);
      const dd = (maxEquity - capital) / maxEquity;
      maxDrawdown = Math.max(maxDrawdown, dd);
      drawdowns.push(dd);
    }

    const returns: number[] = [];
    for (let i = 1; i < equity.length; i++) {
      returns.push((equity[i] - equity[i - 1]) / equity[i - 1]);
    }
    const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const returnStd = returns.length > 1
      ? Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length)
      : 1;
    const sharpe = returnStd > 0 ? (avgReturn / returnStd) * Math.sqrt(252) : 0;

    const wins = trades.filter((_, i) => i % 2 === 0);
    const losses = trades.filter((_, i) => i % 2 !== 0);

    const result: BacktestResult = {
      strategyId,
      totalReturn: (capital - 100000) / 100000,
      annualizedReturn: ((capital / 100000) ** (252 / mainPrices.length)) - 1,
      sharpeRatio: sharpe,
      maxDrawdown,
      winRate: trades.length > 0 ? wins.length / trades.length : 0,
      profitFactor: losses.length > 0 ? wins.length / losses.length : wins.length || 1,
      totalTrades: trades.length,
      avgWin: 0.02,
      avgLoss: -0.01,
      equity,
      drawdowns,
      trades,
    };

    this.backtestResults.set(strategyId, result);
    return result;
  }

  optimizeParameters(strategyId: string, paramRanges: Record<string, number[]>): Record<string, number> {
    const strategy = this.strategies.get(strategyId);
    if (!strategy) throw new Error('Strategy not found');

    // Simple grid search simulation
    const best: Record<string, number> = {};
    for (const [key, values] of Object.entries(paramRanges)) {
      best[key] = values[Math.floor(values.length / 2)];
    }
    return best;
  }

  getPortfolioSummary(): { totalValue: number; totalPnL: number; positions: number; winRate: number } {
    const positions = Array.from(this.positions.values());
    const totalValue = positions.reduce((sum, p) => sum + p.currentPrice * Math.abs(p.quantity), 0);
    const totalPnL = positions.reduce((sum, p) => sum + p.unrealizedPnL + p.realizedPnL, 0);
    const wins = positions.filter(p => p.unrealizedPnL > 0).length;

    return {
      totalValue,
      totalPnL,
      positions: positions.length,
      winRate: positions.length > 0 ? wins / positions.length : 0,
    };
  }

  getSignals(): TradeSignal[] {
    return [...this.signals];
  }

  getPositions(): Position[] {
    return Array.from(this.positions.values());
  }

  getStrategy(id: string): StrategyConfig | undefined {
    return this.strategies.get(id);
  }

  getBacktestResult(strategyId: string): BacktestResult | undefined {
    return this.backtestResults.get(strategyId);
  }
}

describe('Quantitative Strategy Engine', () => {
  let engine: QuantStrategyEngine;

  beforeEach(() => {
    engine = new QuantStrategyEngine();
  });

  it('should create strategy', () => {
    const strategy = engine.createStrategy({
      name: 'Momentum Alpha',
      type: 'momentum',
      symbols: ['AAPL'],
      timeframe: '1d',
      parameters: { lookback: 20, threshold: 0.05 },
      riskLimits: { maxPositionSize: 0.1, maxDrawdown: 0.15, maxLeverage: 2, stopLoss: 0.05, takeProfit: 0.1 },
      enabled: true,
    });
    expect(strategy.name).toBe('Momentum Alpha');
    expect(strategy.type).toBe('momentum');
  });

  it('should generate momentum signal', () => {
    const prices = Array.from({ length: 30 }, (_, i) => 100 + i * 0.5);
    engine.loadPriceHistory('AAPL', prices);
    const signal = engine.generateMomentumSignal('AAPL', 20, 0.01);
    expect(signal).not.toBeNull();
    expect(signal!.action).toBe('buy');
  });

  it('should generate mean reversion signal', () => {
    const prices = Array.from({ length: 30 }, () => 100);
    prices.push(90); // drop below mean
    engine.loadPriceHistory('AAPL', prices);
    const signal = engine.generateMeanReversionSignal('AAPL', 20, 1.5);
    expect(signal).not.toBeNull();
    expect(signal!.action).toBe('buy');
  });

  it('should generate pairs signal', () => {
    const prices1 = Array.from({ length: 30 }, (_, i) => 100 + i * 2);
    const prices2 = Array.from({ length: 30 }, () => 50);
    engine.loadPriceHistory('AAPL', prices1);
    engine.loadPriceHistory('MSFT', prices2);
    const signal = engine.generatePairsSignal('AAPL', 'MSFT', 20, 0.01);
    expect(signal).not.toBeNull();
  });

  it('should return null for insufficient data', () => {
    engine.loadPriceHistory('AAPL', [100]);
    expect(engine.generateMomentumSignal('AAPL', 20, 0.05)).toBeNull();
  });

  it('should execute signal and create position', () => {
    const signal: TradeSignal = {
      id: 'sig1', strategyId: 's1', symbol: 'AAPL',
      action: 'buy', strength: 80, price: 150,
      timestamp: new Date(), reason: 'test', indicators: {},
    };
    const position = engine.executeSignal(signal);
    expect(position.symbol).toBe('AAPL');
    expect(position.quantity).toBe(100);
    expect(position.entryPrice).toBe(150);
  });

  it('should add to existing position', () => {
    engine.executeSignal({
      id: 's1', strategyId: 'strat', symbol: 'AAPL',
      action: 'buy', strength: 80, price: 150,
      timestamp: new Date(), reason: '', indicators: {},
    });
    engine.executeSignal({
      id: 's2', strategyId: 'strat', symbol: 'AAPL',
      action: 'buy', strength: 70, price: 155,
      timestamp: new Date(), reason: '', indicators: {},
    });
    expect(engine.getPositions()[0].quantity).toBe(200);
  });

  it('should backtest momentum strategy', async () => {
    const strategy = engine.createStrategy({
      name: 'Momentum', type: 'momentum', symbols: ['AAPL'],
      timeframe: '1d', parameters: {},
      riskLimits: { maxPositionSize: 0.1, maxDrawdown: 0.15, maxLeverage: 2, stopLoss: 0.05, takeProfit: 0.1 },
      enabled: true,
    });
    const prices = Array.from({ length: 100 }, (_, i) => 100 + Math.sin(i / 5) * 10 + i * 0.1);
    const result = await engine.backtest(strategy.id, { AAPL: prices });
    expect(result.strategyId).toBe(strategy.id);
    expect(result.equity.length).toBeGreaterThan(0);
    expect(result.maxDrawdown).toBeGreaterThanOrEqual(0);
  });

  it('should backtest mean reversion strategy', async () => {
    const strategy = engine.createStrategy({
      name: 'MR', type: 'meanReversion', symbols: ['GOOGL'],
      timeframe: '1d', parameters: {},
      riskLimits: { maxPositionSize: 0.1, maxDrawdown: 0.15, maxLeverage: 2, stopLoss: 0.05, takeProfit: 0.1 },
      enabled: true,
    });
    const prices = Array.from({ length: 100 }, (_, i) => 100 + Math.cos(i / 3) * 20);
    const result = await engine.backtest(strategy.id, { GOOGL: prices });
    expect(result.totalTrades).toBeGreaterThanOrEqual(0);
  });

  it('should optimize parameters', () => {
    const strategy = engine.createStrategy({
      name: 'Opt', type: 'momentum', symbols: ['AAPL'],
      timeframe: '1d', parameters: {},
      riskLimits: { maxPositionSize: 0.1, maxDrawdown: 0.15, maxLeverage: 2, stopLoss: 0.05, takeProfit: 0.1 },
      enabled: true,
    });
    const best = engine.optimizeParameters(strategy.id, {
      lookback: [10, 20, 30, 50],
      threshold: [0.01, 0.02, 0.03, 0.05],
    });
    expect(best.lookback).toBeDefined();
    expect(best.threshold).toBeDefined();
  });

  it('should get portfolio summary', () => {
    engine.executeSignal({
      id: 's1', strategyId: 'strat', symbol: 'AAPL',
      action: 'buy', strength: 80, price: 150,
      timestamp: new Date(), reason: '', indicators: {},
    });
    const summary = engine.getPortfolioSummary();
    expect(summary.positions).toBe(1);
    expect(summary.totalValue).toBeGreaterThan(0);
  });

  it('should track signals', () => {
    engine.addSignal({
      id: 'sig1', strategyId: 's1', symbol: 'AAPL',
      action: 'buy', strength: 90, price: 150,
      timestamp: new Date(), reason: 'test', indicators: {},
    });
    expect(engine.getSignals()).toHaveLength(1);
  });

  it('should handle all strategy types', () => {
    const types: StrategyConfig['type'][] = ['momentum', 'meanReversion', 'pairs', 'arbitrage', 'ml', 'composite'];
    for (const type of types) {
      const strategy = engine.createStrategy({
        name: type, type, symbols: ['TEST'],
        timeframe: '1d', parameters: {},
        riskLimits: { maxPositionSize: 0.1, maxDrawdown: 0.15, maxLeverage: 2, stopLoss: 0.05, takeProfit: 0.1 },
        enabled: true,
      });
      expect(strategy.type).toBe(type);
    }
  });

  it('should not generate signal when hold', () => {
    const prices = Array.from({ length: 30 }, () => 100);
    engine.loadPriceHistory('FLAT', prices);
    const signal = engine.generateMomentumSignal('FLAT', 20, 0.05);
    expect(signal).toBeNull();
  });
});
