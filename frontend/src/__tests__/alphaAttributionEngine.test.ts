import { describe, it, expect } from 'vitest';

// 多因子Alpha归因引擎
interface FactorReturn {
  factor: string;
  return_: number;
  tStat: number;
  ic: number;
  ir: number;
}

interface AlphaAttribution {
  alpha: number;
  factorContributions: Record<string, number>;
  specificReturn: number;
  totalReturn: number;
  factorReturns: FactorReturn[];
}

interface StockExposure {
  symbol: string;
  market: number;
  size: number;
  value: number;
  momentum: number;
  quality: number;
  volatility: number;
  return_: number;
}

const FACTORS = ['market', 'size', 'value', 'momentum', 'quality', 'volatility'];

function calcFactorReturns(stocks: StockExposure[]): FactorReturn[] {
  return FACTORS.map(factor => {
    const exposures = stocks.map(s => (s as any)[factor] || 0);
    const returns = stocks.map(s => s.return_);
    const n = stocks.length;
    let sumXY = 0, sumXX = 0;
    for (let i = 0; i < n; i++) {
      sumXY += exposures[i] * returns[i];
      sumXX += exposures[i] * exposures[i];
    }
    const factorRet = sumXX > 0 ? sumXY / sumXX : 0;
    const residuals = returns.map((r, i) => r - factorRet * exposures[i]);
    const mse = residuals.reduce((s, r) => s + r * r, 0) / (n - 1 || 1);
    const se = sumXX > 0 ? Math.sqrt(mse / sumXX) : 1;
    const tStat = se > 0 ? factorRet / se : 0;
    const ic = sumXX > 0 ? sumXY / Math.sqrt(sumXX * returns.reduce((s, r) => s + r * r, 0)) : 0;
    return { factor, return_: factorRet, tStat, ic, ir: ic / (Math.sqrt(1 - ic * ic) || 1) };
  });
}

function attributeAlpha(stocks: StockExposure[]): AlphaAttribution {
  const factorReturns = calcFactorReturns(stocks);
  const avgReturn = stocks.reduce((s, st) => s + st.return_, 0) / stocks.length;
  const factorContributions: Record<string, number> = {};
  FACTORS.forEach(f => {
    const avgExposure = stocks.reduce((s, st) => s + ((st as any)[f] || 0), 0) / stocks.length;
    const fRet = factorReturns.find(fr => fr.factor === f)?.return_ || 0;
    factorContributions[f] = avgExposure * fRet;
  });
  const totalFactorReturn = Object.values(factorContributions).reduce((s, v) => s + v, 0);
  const specificReturn = avgReturn - totalFactorReturn;
  return {
    alpha: specificReturn,
    factorContributions,
    specificReturn,
    totalReturn: avgReturn,
    factorReturns,
  };
}

function calcInformationRatio(attribution: AlphaAttribution): number {
  const excessReturns = Object.values(attribution.factorContributions);
  const mean = excessReturns.reduce((s, r) => s + r, 0) / excessReturns.length;
  const variance = excessReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / excessReturns.length;
  const trackingError = Math.sqrt(variance);
  return trackingError > 0 ? attribution.alpha / trackingError : 0;
}

describe('多因子Alpha归因引擎', () => {
  const stocks: StockExposure[] = [
    { symbol: 'A', market: 1, size: 0.8, value: 0.5, momentum: 0.3, quality: 0.7, volatility: -0.4, return_: 12 },
    { symbol: 'B', market: 1, size: -0.3, value: 0.9, momentum: -0.2, quality: 0.5, volatility: 0.1, return_: 8 },
    { symbol: 'C', market: 1, size: 0.5, value: -0.3, momentum: 0.8, quality: 0.3, volatility: -0.6, return_: 15 },
    { symbol: 'D', market: 1, size: -0.7, value: 0.4, momentum: 0.1, quality: -0.2, volatility: 0.5, return_: 5 },
    { symbol: 'E', market: 1, size: 0.2, value: 0.6, momentum: 0.5, quality: 0.8, volatility: -0.3, return_: 10 },
  ];

  it('应计算因子收益', () => {
    const factorReturns = calcFactorReturns(stocks);
    expect(factorReturns.length).toBe(FACTORS.length);
    factorReturns.forEach(fr => {
      expect(fr.factor).toBeTruthy();
      expect(typeof fr.return_).toBe('number');
      expect(typeof fr.tStat).toBe('number');
    });
  });

  it('应进行Alpha归因', () => {
    const attr = attributeAlpha(stocks);
    expect(attr.totalReturn).toBeCloseTo(10, 0);
    expect(Object.keys(attr.factorContributions).length).toBe(FACTORS.length);
    expect(typeof attr.alpha).toBe('number');
  });

  it('总收益应等于因子收益+Alpha', () => {
    const attr = attributeAlpha(stocks);
    const factorTotal = Object.values(attr.factorContributions).reduce((s, v) => s + v, 0);
    expect(attr.totalReturn).toBeCloseTo(factorTotal + attr.alpha, 5);
  });

  it('应计算信息比率', () => {
    const attr = attributeAlpha(stocks);
    const ir = calcInformationRatio(attr);
    expect(typeof ir).toBe('number');
  });

  it('每只股票收益应为正', () => {
    expect(stocks.every(s => s.return_ > 0)).toBe(true);
  });

  it('市场因子暴露应均为1', () => {
    expect(stocks.every(s => s.market === 1)).toBe(true);
  });

  it('因子收益应包含所有因子', () => {
    const fr = calcFactorReturns(stocks);
    const factors = new Set(fr.map(f => f.factor));
    FACTORS.forEach(f => expect(factors.has(f)).toBe(true));
  });

  it('单只股票应能归因', () => {
    const single = [stocks[0]];
    const attr = attributeAlpha(single);
    expect(attr.totalReturn).toBe(single[0].return_);
  });

  it('IC应在-1到1之间', () => {
    const fr = calcFactorReturns(stocks);
    fr.forEach(f => {
      expect(f.ic).toBeGreaterThanOrEqual(-1);
      expect(f.ic).toBeLessThanOrEqual(1);
    });
  });

  it('相同股票归因应一致', () => {
    const attr1 = attributeAlpha(stocks);
    const attr2 = attributeAlpha(stocks);
    expect(attr1.alpha).toBe(attr2.alpha);
    expect(attr1.totalReturn).toBe(attr2.totalReturn);
  });
});
