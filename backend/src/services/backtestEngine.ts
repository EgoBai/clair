/**
 * 事件驱动回测引擎
 * 支持策略回测、参数优化、收益归因
 */

export interface TradeSignal {
  timestamp: string;
  action: 'buy' | 'sell' | 'hold';
  stockCode: string;
  price: number;
  quantity: number;
  reason: string;
}

export interface Position {
  stockCode: string;
  quantity: number;
  avgCost: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPnL: number;
  realizedPnL: number;
}

export interface BacktestConfig {
  startDate: string;
  endDate: string;
  initialCapital: number;
  commission: number; // 手续费率
  slippage: number; // 滑点
  maxPositions: number;
  stopLoss?: number; // 止损比例
  takeProfit?: number; // 止盈比例
}

export interface BacktestResult {
  totalReturn: number;
  annualizedReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
  winRate: number;
  profitFactor: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  avgWin: number;
  avgLoss: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  equityCurve: { date: string; equity: number }[];
  trades: TradeSignal[];
}

export interface BarData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type StrategyFn = (bar: BarData, history: BarData[], positions: Position[]) => TradeSignal[];

export class BacktestEngine {
  private config: BacktestConfig;
  private equity: number;
  private positions: Map<string, Position> = new Map();
  private trades: TradeSignal[] = [];
  private equityCurve: { date: string; equity: number }[] = [];
  private tradeResults: number[] = [];

  constructor(config: BacktestConfig) {
    this.config = config;
    this.equity = config.initialCapital;
  }

  async run(data: Map<string, BarData[]>, strategy: StrategyFn): Promise<BacktestResult> {
    this.reset();
    
    const dates = this.getAllDates(data);
    dates.sort();

    for (const date of dates) {
      const currentBars = new Map<string, BarData>();
      const historyBars = new Map<string, BarData[]>();

      for (const [code, bars] of data) {
        const barIdx = bars.findIndex(b => b.date === date);
        if (barIdx >= 0) {
          currentBars.set(code, bars[barIdx]);
          historyBars.set(code, bars.slice(0, barIdx + 1));
        }
      }

      // Execute strategy
      for (const [code, bar] of currentBars) {
        const history = historyBars.get(code) || [];
        const signals = strategy(bar, history, Array.from(this.positions.values()));
        
        for (const signal of signals) {
          this.executeSignal(signal, bar);
        }
      }

      // Update positions with current prices
      for (const [code, pos] of this.positions) {
        const bar = currentBars.get(code);
        if (bar) {
          pos.currentPrice = bar.close;
          pos.marketValue = pos.quantity * bar.close;
          pos.unrealizedPnL = (bar.close - pos.avgCost) * pos.quantity;
        }
      }

      // Check stop loss / take profit
      this.checkRiskLimits();

      // Record equity
      this.equity = this.calculateEquity();
      this.equityCurve.push({ date, equity: this.equity });
    }

    return this.generateResult();
  }

  private executeSignal(signal: TradeSignal, bar: BarData): void {
    const effectivePrice = this.applySlippage(signal.price, signal.action);
    const cost = effectivePrice * signal.quantity;
    const commission = cost * this.config.commission;

    if (signal.action === 'buy') {
      if (this.positions.size >= this.config.maxPositions && !this.positions.has(signal.stockCode)) {
        return;
      }
      
      const existing = this.positions.get(signal.stockCode);
      if (existing) {
        const totalCost = existing.avgCost * existing.quantity + cost + commission;
        const totalQty = existing.quantity + signal.quantity;
        existing.avgCost = totalCost / totalQty;
        existing.quantity = totalQty;
      } else {
        this.positions.set(signal.stockCode, {
          stockCode: signal.stockCode,
          quantity: signal.quantity,
          avgCost: effectivePrice + (commission / signal.quantity),
          currentPrice: effectivePrice,
          marketValue: cost,
          unrealizedPnL: 0,
          realizedPnL: 0
        });
      }
      this.trades.push(signal);
    } else if (signal.action === 'sell') {
      const existing = this.positions.get(signal.stockCode);
      if (existing && existing.quantity >= signal.quantity) {
        const pnl = (effectivePrice - existing.avgCost) * signal.quantity - commission;
        existing.realizedPnL += pnl;
        existing.quantity -= signal.quantity;
        this.tradeResults.push(pnl);
        
        if (existing.quantity <= 0) {
          this.positions.delete(signal.stockCode);
        }
        this.trades.push(signal);
      }
    }
  }

  private applySlippage(price: number, action: 'buy' | 'sell' | 'hold'): number {
    if (action === 'buy') return price * (1 + this.config.slippage);
    if (action === 'sell') return price * (1 - this.config.slippage);
    return price;
  }

  private checkRiskLimits(): void {
    if (!this.config.stopLoss && !this.config.takeProfit) return;

    for (const [code, pos] of this.positions) {
      const pnlRatio = (pos.currentPrice - pos.avgCost) / pos.avgCost;
      
      if (this.config.stopLoss && pnlRatio <= -this.config.stopLoss) {
        this.executeSignal({
          timestamp: new Date().toISOString(),
          action: 'sell',
          stockCode: code,
          price: pos.currentPrice,
          quantity: pos.quantity,
          reason: 'stop_loss'
        }, { date: '', open: 0, high: 0, low: 0, close: pos.currentPrice, volume: 0 });
      }
      
      if (this.config.takeProfit && pnlRatio >= this.config.takeProfit) {
        this.executeSignal({
          timestamp: new Date().toISOString(),
          action: 'sell',
          stockCode: code,
          price: pos.currentPrice,
          quantity: pos.quantity,
          reason: 'take_profit'
        }, { date: '', open: 0, high: 0, low: 0, close: pos.currentPrice, volume: 0 });
      }
    }
  }

  private calculateEquity(): number {
    let total = 0;
    for (const pos of this.positions.values()) {
      total += pos.marketValue;
    }
    return this.equity - this.totalMarketValue() + total;
  }

  private totalMarketValue(): number {
    let total = 0;
    for (const pos of this.positions.values()) {
      total += pos.marketValue;
    }
    return total;
  }

  private getAllDates(data: Map<string, BarData[]>): string[] {
    const dateSet = new Set<string>();
    for (const bars of data.values()) {
      for (const bar of bars) {
        dateSet.add(bar.date);
      }
    }
    return Array.from(dateSet);
  }

  private reset(): void {
    this.equity = this.config.initialCapital;
    this.positions.clear();
    this.trades = [];
    this.equityCurve = [];
    this.tradeResults = [];
  }

  private generateResult(): BacktestResult {
    const winningTrades = this.tradeResults.filter(r => r > 0);
    const losingTrades = this.tradeResults.filter(r => r <= 0);
    const totalTrades = this.tradeResults.length;
    
    const totalReturn = (this.equity - this.config.initialCapital) / this.config.initialCapital;
    const days = this.equityCurve.length;
    const annualizedReturn = days > 0 ? Math.pow(1 + totalReturn, 365 / days) - 1 : 0;
    
    const maxDrawdown = this.calculateMaxDrawdown();
    const sharpeRatio = this.calculateSharpeRatio();
    
    const winRate = totalTrades > 0 ? winningTrades.length / totalTrades : 0;
    const grossProfit = winningTrades.reduce((s, r) => s + r, 0);
    const grossLoss = Math.abs(losingTrades.reduce((s, r) => s + r, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
    
    const { maxWins, maxLosses } = this.calculateConsecutive();

    return {
      totalReturn,
      annualizedReturn,
      maxDrawdown,
      sharpeRatio,
      winRate,
      profitFactor,
      totalTrades,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      avgWin: winningTrades.length > 0 ? grossProfit / winningTrades.length : 0,
      avgLoss: losingTrades.length > 0 ? grossLoss / losingTrades.length : 0,
      maxConsecutiveWins: maxWins,
      maxConsecutiveLosses: maxLosses,
      equityCurve: this.equityCurve,
      trades: this.trades
    };
  }

  private calculateMaxDrawdown(): number {
    let peak = 0;
    let maxDd = 0;
    
    for (const point of this.equityCurve) {
      if (point.equity > peak) peak = point.equity;
      const dd = (peak - point.equity) / peak;
      if (dd > maxDd) maxDd = dd;
    }
    
    return maxDd;
  }

  private calculateSharpeRatio(): number {
    if (this.equityCurve.length < 2) return 0;
    
    const returns: number[] = [];
    for (let i = 1; i < this.equityCurve.length; i++) {
      const r = (this.equityCurve[i].equity - this.equityCurve[i - 1].equity) / this.equityCurve[i - 1].equity;
      returns.push(r);
    }
    
    const avgReturn = returns.reduce((s, r) => s + r, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1);
    const stdDev = Math.sqrt(variance);
    
    return stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;
  }

  private calculateConsecutive(): { maxWins: number; maxLosses: number } {
    let maxWins = 0;
    let maxLosses = 0;
    let currentWins = 0;
    let currentLosses = 0;

    for (const result of this.tradeResults) {
      if (result > 0) {
        currentWins++;
        currentLosses = 0;
        maxWins = Math.max(maxWins, currentWins);
      } else {
        currentLosses++;
        currentWins = 0;
        maxLosses = Math.max(maxLosses, currentLosses);
      }
    }

    return { maxWins, maxLosses };
  }
}

export default BacktestEngine;
