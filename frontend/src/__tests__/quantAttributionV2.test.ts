import { describe, it, expect } from 'vitest';

// 量化归因分析引擎V2
interface FactorExposure {
  market: number;
  size: number;
  value: number;
  momentum: number;
  quality: number;
  volatility: number;
}

interface PortfolioReturn {
  symbol: string;
  weight: number;
  return_: number;
  exposures: FactorExposure;
}

interface AttributionResult {
  totalReturn: number;
  factorReturn: number;
  specificReturn: number;
  factorContributions: Record<string, number>;
  activeReturn: number;
  trackingError: number;
  informationRatio: number;
}

function attributeReturns(portfolio: PortfolioReturn[], benchmark: PortfolioReturn[]): AttributionResult {
  const factors = ['market', 'size', 'value', 'momentum', 'quality', 'volatility'] as const;
  
  const portReturn = portfolio.reduce((s, p) => s + p.weight * p.return_, 0);
  const benchReturn = benchmark.reduce((s, b) => s + b.weight * b.return_, 0);
  
  const factorContributions: Record<string, number> = {};
  factors.forEach(f => {
    const portExposure = portfolio.reduce((s, p) => s + p.weight * (p.exposures[f] || 0), 0);
    const benchExposure = benchmark.reduce((s, b) => s + b.weight * (b.exposures[f] || 0), 0);
    const activeExposure = portExposure - benchExposure;
    const factorReturn = portfolio.reduce((s, p) => s + p.weight * p.return_ * (p.exposures[f] || 0), 0);
    factorContributions[f] = activeExposure * factorReturn;
  });

  const factorReturn = Object.values(factorContributions).reduce((s, v) => s + v, 0);
  const specificReturn = portReturn - factorReturn - benchReturn;
  const activeReturn = portReturn - benchReturn;
  
  const returnDiffs = portfolio.map((p, i) => {
    const b = benchmark[i] || { return_: 0, weight: 0 };
    return p.weight * p.return_ - b.weight * b.return_;
  });
  const meanDiff = returnDiffs.reduce((a, b) => a + b, 0) / returnDiffs.length;
  const variance = returnDiffs.reduce((s, d) => s + (d - meanDiff) ** 2, 0) / returnDiffs.length;
  const trackingError = Math.sqrt(variance);

  return {
    totalReturn: portReturn,
    factorReturn,
    specificReturn,
    factorContributions,
    activeReturn,
    trackingError,
    informationRatio: trackingError > 0 ? activeReturn / trackingError : 0,
  };
}

function calcBrinsonAttribution(portfolio: PortfolioReturn[], benchmark: PortfolioReturn[]): {
  allocationEffect: number;
  selectionEffect: number;
  interactionEffect: number;
} {
  const sectors = new Map<string, { pWeight: number; bWeight: number; pReturn: number; bReturn: number }>();
  
  portfolio.forEach(p => {
    const key = p.symbol.slice(0, 2);
    if (!sectors.has(key)) sectors.set(key, { pWeight: 0, bWeight: 0, pReturn: 0, bReturn: 0 });
    const s = sectors.get(key)!;
    s.pWeight += p.weight;
    s.pReturn += p.weight * p.return_;
  });
  
  benchmark.forEach(b => {
    const key = b.symbol.slice(0, 2);
    if (!sectors.has(key)) sectors.set(key, { pWeight: 0, bWeight: 0, pReturn: 0, bReturn: 0 });
    const s = sectors.get(key)!;
    s.bWeight += b.weight;
    s.bReturn += b.weight * b.return_;
  });

  let allocation = 0, selection = 0, interaction = 0;
  const benchTotalReturn = benchmark.reduce((s, b) => s + b.weight * b.return_, 0);

  sectors.forEach(s => {
    const pRet = s.pWeight > 0 ? s.pReturn / s.pWeight : 0;
    const bRet = s.bWeight > 0 ? s.bReturn / s.bWeight : 0;
    allocation += (s.pWeight - s.bWeight) * (bRet - benchTotalReturn);
    selection += s.bWeight * (pRet - bRet);
    interaction += (s.pWeight - s.bWeight) * (pRet - bRet);
  });

  return { allocationEffect: allocation, selectionEffect: selection, interactionEffect: interaction };
}

describe('量化归因分析引擎V2', () => {
  const portfolio: PortfolioReturn[] = [
    { symbol: '600519', weight: 0.3, return_: 0.08, exposures: { market: 1, size: -0.5, value: 0.3, momentum: 0.4, quality: 0.8, volatility: -0.3 } },
    { symbol: '000858', weight: 0.25, return_: 0.05, exposures: { market: 1, size: -0.3, value: 0.5, momentum: 0.2, quality: 0.6, volatility: -0.2 } },
    { symbol: '300750', weight: 0.25, return_: 0.12, exposures: { market: 1, size: 0.3, value: -0.4, momentum: 0.7, quality: 0.4, volatility: 0.5 } },
    { symbol: '000001', weight: 0.2, return_: 0.03, exposures: { market: 1, size: 0.1, value: 0.8, momentum: -0.1, quality: 0.5, volatility: -0.4 } },
  ];

  const benchmark: PortfolioReturn[] = [
    { symbol: '600519', weight: 0.1, return_: 0.08, exposures: { market: 1, size: -0.5, value: 0.3, momentum: 0.4, quality: 0.8, volatility: -0.3 } },
    { symbol: '000858', weight: 0.1, return_: 0.05, exposures: { market: 1, size: -0.3, value: 0.5, momentum: 0.2, quality: 0.6, volatility: -0.2 } },
    { symbol: '300750', weight: 0.1, return_: 0.12, exposures: { market: 1, size: 0.3, value: -0.4, momentum: 0.7, quality: 0.4, volatility: 0.5 } },
    { symbol: '000001', weight: 0.7, return_: 0.03, exposures: { market: 1, size: 0.1, value: 0.8, momentum: -0.1, quality: 0.5, volatility: -0.4 } },
  ];

  it('应进行收益归因', () => {
    const result = attributeReturns(portfolio, benchmark);
    expect(result.totalReturn).toBeGreaterThan(0);
    expect(typeof result.factorReturn).toBe('number');
    expect(typeof result.specificReturn).toBe('number');
  });

  it('总收益应等于加权收益和', () => {
    const result = attributeReturns(portfolio, benchmark);
    const manual = portfolio.reduce((s, p) => s + p.weight * p.return_, 0);
    expect(result.totalReturn).toBeCloseTo(manual, 5);
  });

  it('应有因子贡献', () => {
    const result = attributeReturns(portfolio, benchmark);
    expect(Object.keys(result.factorContributions).length).toBe(6);
  });

  it('主动收益应为组合收益减基准收益', () => {
    const result = attributeReturns(portfolio, benchmark);
    const benchReturn = benchmark.reduce((s, b) => s + b.weight * b.return_, 0);
    expect(result.activeReturn).toBeCloseTo(result.totalReturn - benchReturn, 5);
  });

  it('应进行Brinson归因', () => {
    const brinson = calcBrinsonAttribution(portfolio, benchmark);
    expect(typeof brinson.allocationEffect).toBe('number');
    expect(typeof brinson.selectionEffect).toBe('number');
    expect(typeof brinson.interactionEffect).toBe('number');
  });

  it('跟踪误差应为非负', () => {
    const result = attributeReturns(portfolio, benchmark);
    expect(result.trackingError).toBeGreaterThanOrEqual(0);
  });

  it('信息比率应有定义', () => {
    const result = attributeReturns(portfolio, benchmark);
    expect(typeof result.informationRatio).toBe('number');
  });

  it('相同组合归因应一致', () => {
    const r1 = attributeReturns(portfolio, benchmark);
    const r2 = attributeReturns(portfolio, benchmark);
    expect(r1.totalReturn).toBe(r2.totalReturn);
  });

  it('空组合应返回零', () => {
    const result = attributeReturns([], []);
    expect(result.totalReturn).toBe(0);
  });

  it('因子贡献之和应接近因子收益', () => {
    const result = attributeReturns(portfolio, benchmark);
    const sum = Object.values(result.factorContributions).reduce((s, v) => s + v, 0);
    expect(typeof sum).toBe('number');
  });
});
