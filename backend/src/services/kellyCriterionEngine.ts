/**
 * Kelly准则引擎 (Kelly Criterion Engine)
 * - 经典Kelly公式
 * - 分数Kelly (Fractional Kelly)
 * - 多资产Kelly
 */

export interface TradeRecord {
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  timestamp: number;
}

export interface KellyResult {
  fullKelly: number;
  halfKelly: number;
  quarterKelly: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  expectedGrowth: number;
}

export class KellyCriterionEngine {
  calculateKelly(winRate: number, avgWin: number, avgLoss: number): KellyResult {
    if (avgLoss <= 0 || winRate < 0 || winRate > 1) {
      return { fullKelly: 0, halfKelly: 0, quarterKelly: 0, winRate, avgWin, avgLoss, profitFactor: 0, expectedGrowth: 0 };
    }
    const b = avgWin / avgLoss;
    const p = winRate;
    const q = 1 - p;
    const fullKelly = Math.max(0, (b * p - q) / b);
    const profitFactor = p > 0 && q > 0 && avgLoss > 0 ? (avgWin * p) / (avgLoss * q) : 0;
    return {
      fullKelly: Math.round(fullKelly * 10000) / 10000,
      halfKelly: Math.round(fullKelly * 0.5 * 10000) / 10000,
      quarterKelly: Math.round(fullKelly * 0.25 * 10000) / 10000,
      winRate: p,
      avgWin,
      avgLoss,
      profitFactor: Math.round(profitFactor * 10000) / 10000,
      expectedGrowth: Math.round((p * Math.log(1 + b * fullKelly * 0.5) + q * Math.log(1 - fullKelly * 0.5)) * 10000) / 10000,
    };
  }

  estimateFromTrades(trades: TradeRecord[]): KellyResult {
    if (trades.length === 0) {
      return { fullKelly: 0, halfKelly: 0, quarterKelly: 0, winRate: 0, avgWin: 0, avgLoss: 0, profitFactor: 0, expectedGrowth: 0 };
    }
    const returns = trades.map(t => (t.exitPrice - t.entryPrice) / t.entryPrice);
    const wins = returns.filter(r => r > 0);
    const losses = returns.filter(r => r <= 0);
    const winRate = wins.length / returns.length;
    const avgWin = wins.length > 0 ? wins.reduce((s, v) => s + v, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, v) => s + v, 0) / losses.length) : 0.01;
    return this.calculateKelly(winRate, avgWin, avgLoss);
  }

  constrainedKelly(winRate: number, avgWin: number, avgLoss: number, maxDrawdown: number): KellyResult {
    const base = this.calculateKelly(winRate, avgWin, avgLoss);
    if (maxDrawdown > 0 && maxDrawdown < 1 && base.fullKelly > 0) {
      const maxF = 1 - Math.pow(1 - maxDrawdown, 1 / Math.max(base.fullKelly, 0.001));
      base.halfKelly = Math.min(base.halfKelly, Math.max(0, maxF));
    }
    return base;
  }

  multiAssetKelly(assets: Array<{ symbol: string; winRate: number; avgWin: number; avgLoss: number }>): Record<string, number> {
    const weights: Record<string, number> = {};
    let total = 0;
    for (const a of assets) {
      const k = this.calculateKelly(a.winRate, a.avgWin, a.avgLoss);
      weights[a.symbol] = k.halfKelly;
      total += k.halfKelly;
    }
    if (total > 0) {
      for (const sym of Object.keys(weights)) {
        weights[sym] = Math.round((weights[sym] / total) * 10000) / 10000;
      }
    }
    return weights;
  }
}

export default new KellyCriterionEngine();
