/**
 * Cross-Market Correlation Engine
 *
 * Analyzes relationships between A-shares and global markets:
 * US, HK, commodities, bonds, currencies, and crypto.
 */

export type MarketType = 'equity' | 'bond' | 'commodity' | 'currency' | 'crypto';

export interface MarketData {
  symbol: string;
  name: string;
  type: MarketType;
  returns: number[];
  prices: number[];
}

export interface CrossCorrelation {
  market1: string;
  market2: string;
  correlation: number;
  lagCorrelation: { lag: number; correlation: number }[];
  leadLag: number; // which market leads
  regimeCorrelations: { regime: string; correlation: number }[];
}

export interface CrossMarketSignal {
  signal: 'risk_on' | 'risk_off' | 'neutral';
  confidence: number;
  drivers: { market: string; contribution: number }[];
  leadIndicators: string[];
}

export interface MarketRegime {
  regime: 'risk_on' | 'risk_off' | 'transitional';
  duration: number; // days
  markets: { symbol: string; performance: number }[];
  historical: { date: string; regime: string }[];
}

export interface ContagionRisk {
  source: string;
  targets: { symbol: string; betaToSource: number; correlation: number }[];
  stressLevel: number; // 0-100
  spilloverProbability: number;
}

function mean(arr: number[]): number {
  return arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length;
}

function correlation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const ma = mean(a.slice(0, n));
  const mb = mean(b.slice(0, n));
  let cov = 0, va = 0, vb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma, db = b[i] - mb;
    cov += da * db;
    va += da * da;
    vb += db * db;
  }
  const denom = Math.sqrt(va * vb);
  return denom === 0 ? 0 : cov / denom;
}

function laggedCorrelation(a: number[], b: number[], lag: number): number {
  if (lag >= 0) {
    const aSlice = a.slice(0, a.length - lag);
    const bSlice = b.slice(lag);
    return correlation(aSlice, bSlice);
  } else {
    const aSlice = a.slice(-lag);
    const bSlice = b.slice(0, b.length + lag);
    return correlation(aSlice, bSlice);
  }
}

/**
 * Calculate cross-correlation between two markets
 */
export function calculateCrossCorrelation(
  market1: MarketData,
  market2: MarketData,
  maxLag: number = 10
): CrossCorrelation {
  const lagCorrelation: { lag: number; correlation: number }[] = [];

  for (let lag = -maxLag; lag <= maxLag; lag++) {
    lagCorrelation.push({ lag, correlation: laggedCorrelation(market1.returns, market2.returns, lag) });
  }

  // Find lead-lag: lag with highest absolute correlation
  const bestLag = lagCorrelation.reduce((best, curr) =>
    Math.abs(curr.correlation) > Math.abs(best.correlation) ? curr : best
  );

  // Regime correlations
  const regimeCorrelations = [
    { regime: 'high_vol', correlation: correlation(
      market1.returns.filter((_, i) => i > 0 && Math.abs(market1.returns[i - 1]) > 0.02),
      market2.returns.filter((_, i) => i > 0 && Math.abs(market1.returns[i - 1]) > 0.02)
    )},
    { regime: 'low_vol', correlation: correlation(
      market1.returns.filter((_, i) => i > 0 && Math.abs(market1.returns[i - 1]) <= 0.02),
      market2.returns.filter((_, i) => i > 0 && Math.abs(market1.returns[i - 1]) <= 0.02)
    )},
  ];

  return {
    market1: market1.symbol,
    market2: market2.symbol,
    correlation: correlation(market1.returns, market2.returns),
    lagCorrelation,
    leadLag: bestLag.lag,
    regimeCorrelations,
  };
}

/**
 * Build correlation matrix for multiple markets
 */
export function buildCorrelationMatrix(markets: MarketData[]): {
  symbols: string[];
  matrix: number[][];
  strongPairs: { pair: [string, string]; correlation: number }[];
} {
  const symbols = markets.map(m => m.symbol);
  const matrix = symbols.map((_, i) =>
    symbols.map((_, j) => correlation(markets[i].returns, markets[j].returns))
  );

  const strongPairs: { pair: [string, string]; correlation: number }[] = [];
  for (let i = 0; i < symbols.length; i++) {
    for (let j = i + 1; j < symbols.length; j++) {
      if (Math.abs(matrix[i][j]) > 0.7) {
        strongPairs.push({ pair: [symbols[i], symbols[j]], correlation: matrix[i][j] });
      }
    }
  }

  return { symbols, matrix, strongPairs };
}

/**
 * Generate cross-market signal
 */
export function generateCrossMarketSignal(markets: MarketData[]): CrossMarketSignal {
  // Risk-on: equities up, bonds down, commodities up, VIX down
  // Risk-off: equities down, bonds up, commodities down, VIX up

  const equities = markets.filter(m => m.type === 'equity');
  const bonds = markets.filter(m => m.type === 'bond');
  const commodities = markets.filter(m => m.type === 'commodity');

  const eqPerformance = equities.map(m => mean(m.returns.slice(-5)) * 252);
  const bondPerformance = bonds.map(m => mean(m.returns.slice(-5)) * 252);
  const commPerformance = commodities.map(m => mean(m.returns.slice(-5)) * 252);

  const avgEq = mean(eqPerformance);
  const avgBond = mean(bondPerformance);
  const avgComm = mean(commPerformance);

  let score = 0;
  if (avgEq > 0) score += 30; else score -= 30;
  if (avgBond < 0) score += 15; else score -= 15; // bonds down = risk on
  if (avgComm > 0) score += 15; else score -= 15;

  const signal: CrossMarketSignal['signal'] = score > 20 ? 'risk_on' : score < -20 ? 'risk_off' : 'neutral';

  const drivers: { market: string; contribution: number }[] = markets.map(m => ({
    market: m.symbol,
    contribution: mean(m.returns.slice(-5)),
  })).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  return {
    signal,
    confidence: Math.min(1, Math.abs(score) / 60),
    drivers: drivers.slice(0, 5),
    leadIndicators: equities.slice(0, 3).map(m => m.symbol),
  };
}

/**
 * Detect contagion risk
 */
export function detectContagionRisk(
  source: MarketData,
  targets: MarketData[],
  lookback: number = 20
): ContagionRisk {
  const recentReturns = source.returns.slice(-lookback);
  const stressEvents = recentReturns.filter(r => r < -0.02).length;
  const stressLevel = Math.min(100, (stressEvents / lookback) * 200);

  const targetAnalysis = targets.map(t => {
    const corr = correlation(source.returns, t.returns);
    // Beta: covariance / variance of source
    const srcMean = mean(source.returns);
    const tMean = mean(t.returns);
    const n = Math.min(source.returns.length, t.returns.length);
    let cov = 0, varSrc = 0;
    for (let i = 0; i < n; i++) {
      cov += (source.returns[i] - srcMean) * (t.returns[i] - tMean);
      varSrc += (source.returns[i] - srcMean) ** 2;
    }
    const beta = varSrc === 0 ? 0 : cov / varSrc;

    return { symbol: t.symbol, betaToSource: beta, correlation: corr };
  });

  const avgCorr = mean(targetAnalysis.map(t => Math.abs(t.correlation)));
  const spilloverProbability = Math.min(1, avgCorr * (stressLevel / 100) * 1.5);

  return {
    source: source.symbol,
    targets: targetAnalysis.sort((a, b) => Math.abs(b.betaToSource) - Math.abs(a.betaToSource)),
    stressLevel,
    spilloverProbability,
  };
}

/**
 * Detect market regime
 */
export function detectMarketRegime(markets: MarketData[]): MarketRegime {
  const equities = markets.filter(m => m.type === 'equity');

  // Look at last 20 days
  const lookback = 20;
  const performances = equities.map(m => ({
    symbol: m.symbol,
    performance: m.returns.slice(-lookback).reduce((s, r) => s + r, 0),
  }));

  const avgPerf = mean(performances.map(p => p.performance));
  const posCount = performances.filter(p => p.performance > 0).length;
  const agreement = posCount / performances.length;

  let regime: MarketRegime['regime'];
  if (avgPerf > 0.02 && agreement > 0.6) regime = 'risk_on';
  else if (avgPerf < -0.02 && agreement < 0.4) regime = 'risk_off';
  else regime = 'transitional';

  return {
    regime,
    duration: lookback,
    markets: performances.sort((a, b) => b.performance - a.performance),
    historical: [],
  };
}

/**
 * Calculate rolling cross-correlations
 */
export function rollingCrossCorrelation(
  market1: MarketData,
  market2: MarketData,
  window: number = 60
): { date: string; correlation: number }[] {
  const n = Math.min(market1.returns.length, market2.returns.length);
  const results: { date: string; correlation: number }[] = [];

  for (let i = window; i <= n; i++) {
    const slice1 = market1.returns.slice(i - window, i);
    const slice2 = market2.returns.slice(i - window, i);
    results.push({ date: `day_${i}`, correlation: correlation(slice1, slice2) });
  }

  return results;
}
