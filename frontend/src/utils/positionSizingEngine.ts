/**
 * 仓位管理引擎
 * - Kelly公式
 * - 固定比例法
 * - ATR仓位法
 * - 风险预算法
 */

export interface PositionParams {
  capital: number;          // 总资金
  entryPrice: number;       // 入场价
  stopLoss: number;         // 止损价
  winRate: number;          // 预期胜率(0-1)
  avgWin: number;           // 平均盈利(%)
  avgLoss: number;          // 平均亏损(%)
  atr: number;              // ATR值
  maxRiskPct: number;       // 最大单笔风险(%)
}

export interface PositionResult {
  kellyShares: number;
  kellyPct: number;
  fixedPctShares: number;
  atrShares: number;
  riskBudgetShares: number;
  recommendedShares: number;
  recommendedPct: number;
  riskAmount: number;
  maxLoss: number;
  expectedValue: number;
}

export class PositionSizingEngine {
  /**
   * Kelly公式仓位
   */
  kellySize(params: PositionParams): { shares: number; pct: number; fKelly: number } {
    const { capital, winRate, avgWin, avgLoss, entryPrice } = params;

    if (avgLoss <= 0 || entryPrice <= 0) return { shares: 0, pct: 0, fKelly: 0 };

    const b = avgWin / avgLoss; // 赔率
    const fKelly = winRate - (1 - winRate) / b;
    const halfKelly = Math.max(0, fKelly * 0.5); // 半Kelly更保守

    const position = capital * halfKelly;
    const shares = Math.floor(position / entryPrice / 100) * 100; // 整手

    return {
      shares: Math.max(0, shares),
      pct: Math.round(halfKelly * 10000) / 100,
      fKelly: Math.round(fKelly * 10000) / 10000,
    };
  }

  /**
   * 固定比例法
   */
  fixedPctSize(capital: number, entryPrice: number, riskPct: number = 2): number {
    const position = capital * riskPct / 100;
    return Math.max(0, Math.floor(position / entryPrice / 100) * 100);
  }

  /**
   * ATR仓位法
   */
  atrSize(params: PositionParams, atrMultiplier: number = 2): number {
    const { capital, entryPrice, atr, maxRiskPct } = params;
    if (atr <= 0 || entryPrice <= 0) return 0;

    const riskAmount = capital * maxRiskPct / 100;
    const perShareRisk = atr * atrMultiplier;
    const shares = Math.floor(riskAmount / perShareRisk / 100) * 100;

    return Math.max(0, shares);
  }

  /**
   * 风险预算法
   */
  riskBudgetSize(capital: number, entryPrice: number, stopLoss: number, maxRiskPct: number): number {
    if (entryPrice <= 0 || entryPrice <= stopLoss) return 0;

    const riskPerShare = entryPrice - stopLoss;
    const riskAmount = capital * maxRiskPct / 100;
    const shares = Math.floor(riskAmount / riskPerShare / 100) * 100;

    return Math.max(0, shares);
  }

  /**
   * 综合计算
   */
  calculatePosition(params: PositionParams): PositionResult {
    const kelly = this.kellySize(params);
    const fixedShares = this.fixedPctSize(params.capital, params.entryPrice, params.maxRiskPct);
    const atrShares = this.atrSize(params);
    const riskShares = this.riskBudgetSize(params.capital, params.entryPrice, params.stopLoss, params.maxRiskPct);

    // 取最小值(最保守)
    const candidates = [kelly.shares, fixedShares, atrShares, riskShares].filter(s => s > 0);
    const recommendedShares = candidates.length > 0 ? Math.min(...candidates) : 0;
    const recommendedPct = params.capital > 0 && params.entryPrice > 0
      ? Math.round(recommendedShares * params.entryPrice / params.capital * 10000) / 100
      : 0;

    const riskPerShare = Math.abs(params.entryPrice - params.stopLoss);
    const riskAmount = recommendedShares * riskPerShare;
    const maxLoss = riskAmount;

    // 期望值 = 胜率*平均盈利*仓位 - 败率*平均亏损*仓位
    const positionValue = recommendedShares * params.entryPrice;
    const expectedValue = params.winRate * params.avgWin / 100 * positionValue - (1 - params.winRate) * params.avgLoss / 100 * positionValue;

    return {
      kellyShares: kelly.shares,
      kellyPct: kelly.pct,
      fixedPctShares: fixedShares,
      atrShares,
      riskBudgetShares: riskShares,
      recommendedShares,
      recommendedPct,
      riskAmount: Math.round(riskAmount),
      maxLoss: Math.round(maxLoss),
      expectedValue: Math.round(expectedValue),
    };
  }
}

export default new PositionSizingEngine();
