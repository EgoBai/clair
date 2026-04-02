/**
 * BarraFactorEngine - Barra因子引擎
 * 风格因子暴露度计算和分解
 */

export interface StockExposure {
  stockId: string;
  market: number;      // 市场因子
  size: number;        // 市值因子
  value: number;       // 价值因子
  momentum: number;    // 动量因子
  volatility: number;  // 波动率因子
  quality: number;     // 质量因子
  return_: number;
}

export interface FactorExposure {
  factor: string;
  exposure: number;
  tStat: number;
  significance: boolean;
}

export function computeFactorExposures(stocks: StockExposure[]): FactorExposure[] {
  if (stocks.length < 5) return [];
  const factors = ['market', 'size', 'value', 'momentum', 'volatility', 'quality'] as const;
  const returns = stocks.map(s => s.return_);

  return factors.map(f => {
    const exposures = stocks.map(s => s[f]);
    const n = stocks.length;
    const mx = exposures.reduce((s, v) => s + v, 0) / n;
    const my = returns.reduce((s, v) => s + v, 0) / n;
    let num = 0, dx = 0;
    for (let i = 0; i < n; i++) {
      num += (exposures[i] - mx) * (returns[i] - my);
      dx += (exposures[i] - mx) ** 2;
    }
    const beta = dx > 0 ? num / dx : 0;
    const residuals = returns.map((r, i) => r - beta * exposures[i]);
    const se = Math.sqrt(residuals.reduce((s, v) => s + v ** 2, 0) / (n - 2)) / Math.sqrt(dx);
    const tStat = se > 0 ? beta / se : 0;
    return { factor: f, exposure: Math.round(beta * 10000) / 10000, tStat: Math.round(tStat * 100) / 100, significance: Math.abs(tStat) > 1.96 };
  });
}
