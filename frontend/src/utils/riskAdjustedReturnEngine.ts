/**
 * 风险调整收益引擎
 * - Sharpe/Sortino/Calmar比率
 * - 最大回撤分析
 * - 风险收益评级
 */

export interface ReturnData {
  returns: number[];
  riskFreeRate?: number;
}

export interface RiskMetrics {
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  maxDrawdown: number;
  maxDrawdownDuration: number;
  annualizedReturn: number;
  annualizedVolatility: number;
  winRate: number;
  profitFactor: number;
  rating: string;
}

export class RiskAdjustedReturnEngine {
  calculate(data: ReturnData): RiskMetrics {
    const { returns, riskFreeRate = 0.03 / 252 } = data;
    if (returns.length < 2) return this.defaultMetrics();

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / returns.length;
    const vol = Math.sqrt(variance);
    const annualizedReturn = mean * 252;
    const annualizedVol = vol * Math.sqrt(252);

    const sharpe = annualizedVol > 0 ? (annualizedReturn - riskFreeRate * 252) / annualizedVol : 0;
    const downside = returns.filter(r => r < 0);
    const downsideVar = downside.length > 0 ? downside.reduce((a, r) => a + r ** 2, 0) / downside.length : variance;
    const downsideVol = Math.sqrt(downsideVar) * Math.sqrt(252);
    const sortino = downsideVol > 0 ? (annualizedReturn - riskFreeRate * 252) / downsideVol : 0;

    const { maxDD, maxDDD } = this.maxDrawdown(returns);
    const calmar = maxDD > 0 ? annualizedReturn / maxDD : 0;

    const wins = returns.filter(r => r > 0);
    const winRate = wins.length / returns.length;
    const totalWin = wins.reduce((a, r) => a + r, 0);
    const totalLoss = Math.abs(returns.filter(r => r <= 0).reduce((a, r) => a + r, 0));
    const profitFactor = totalLoss > 0 ? totalWin / totalLoss : totalWin > 0 ? Infinity : 0;

    let rating = 'C';
    if (sharpe > 2) rating = 'A+';
    else if (sharpe > 1.5) rating = 'A';
    else if (sharpe > 1) rating = 'B+';
    else if (sharpe > 0.5) rating = 'B';
    else if (sharpe > 0) rating = 'C+';

    return {
      sharpeRatio: Math.round(sharpe * 100) / 100,
      sortinoRatio: Math.round(sortino * 100) / 100,
      calmarRatio: Math.round(calmar * 100) / 100,
      maxDrawdown: Math.round(maxDD * 10000) / 10000,
      maxDrawdownDuration: maxDDD,
      annualizedReturn: Math.round(annualizedReturn * 10000) / 10000,
      annualizedVolatility: Math.round(annualizedVol * 10000) / 10000,
      winRate: Math.round(winRate * 10000) / 10000,
      profitFactor: Math.round(profitFactor * 100) / 100,
      rating,
    };
  }

  private maxDrawdown(returns: number[]): { maxDD: number; maxDDD: number } {
    let peak = 0, cum = 0, maxDD = 0, ddStart = 0, maxDDD = 0, currentDDD = 0;
    for (let i = 0; i < returns.length; i++) {
      cum += returns[i];
      if (cum > peak) { peak = cum; currentDDD = 0; }
      else {
        currentDDD++;
        const dd = peak - cum;
        if (dd > maxDD) { maxDD = dd; maxDDD = currentDDD; }
      }
    }
    return { maxDD, maxDDD };
  }

  private defaultMetrics(): RiskMetrics {
    return { sharpeRatio: 0, sortinoRatio: 0, calmarRatio: 0, maxDrawdown: 0, maxDrawdownDuration: 0, annualizedReturn: 0, annualizedVolatility: 0, winRate: 0, profitFactor: 0, rating: 'N/A' };
  }
}

export default new RiskAdjustedReturnEngine();
