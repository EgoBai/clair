/**
 * ETF Premium/Discount Analysis Engine
 * 
 * ETF溢价/折价分析引擎 - 分析ETF的溢价率、折价套利机会
 */

export interface ETFData {
  symbol: string;
  name: string;
  nav: number; // Net Asset Value
  marketPrice: number;
  totalAssets: number;
  shares: number;
  trackingError: number;
  expenseRatio: number;
  dividendYield: number;
  volume: number;
  creationRedemptionUnit: number;
  underlying: string;
}

export interface PremiumDiscountResult {
  premiumRate: number; // percentage
  status: 'premium' | 'discount' | 'par';
  arbitrageSignal: 'create' | 'redeem' | 'none';
  estimatedProfit: number;
  liquidityScore: number;
  trackingEfficiency: number;
  costAdjustedPremium: number;
}

export interface ETFArbOpportunity {
  etf: string;
  direction: 'create' | 'redeem';
  premium: number;
  estimatedCost: number;
  netProfit: number;
  feasibility: 'high' | 'medium' | 'low';
}

// ===== Premium/Discount Calculation =====

export function calculatePremiumRate(
  marketPrice: number,
  nav: number
): number {
  if (nav <= 0) return 0;
  return ((marketPrice - nav) / nav) * 100;
}

export function classifyPremiumStatus(
  premiumRate: number,
  threshold: number = 0.5
): 'premium' | 'discount' | 'par' {
  if (premiumRate > threshold) return 'premium';
  if (premiumRate < -threshold) return 'discount';
  return 'par';
}

// ===== Arbitrage Signal =====

export function determineArbitrageSignal(
  premiumRate: number,
  creationThreshold: number = 1.0,
  redemptionThreshold: number = -1.0
): 'create' | 'redeem' | 'none' {
  if (premiumRate > creationThreshold) return 'create'; // Create new shares, sell at premium
  if (premiumRate < redemptionThreshold) return 'redeem'; // Redeem shares, buy at discount
  return 'none';
}

// ===== Liquidity Score =====

export function calculateLiquidityScore(
  volume: number,
  totalAssets: number
): number {
  if (totalAssets <= 0) return 0;
  const dailyTurnover = volume / totalAssets;
  // Normalize to 0-100
  return Math.min(100, dailyTurnover * 1000);
}

// ===== Tracking Efficiency =====

export function calculateTrackingEfficiency(
  trackingError: number,
  expenseRatio: number
): number {
  // Lower tracking error relative to expense ratio = better efficiency
  const excessError = trackingError - expenseRatio;
  if (excessError <= 0) return 100;
  return Math.max(0, 100 - excessError * 1000);
}

// ===== Cost-Adjusted Premium =====

export function costAdjustedPremium(
  premiumRate: number,
  expenseRatio: number,
  tradingCost: number = 0.1
): number {
  // Account for creation/redemption costs
  return premiumRate - expenseRatio - tradingCost;
}

// ===== Full Premium/Discount Analysis =====

export function analyzePremiumDiscount(etf: ETFData): PremiumDiscountResult {
  const premiumRate = calculatePremiumRate(etf.marketPrice, etf.nav);
  const status = classifyPremiumStatus(premiumRate);
  const arbitrageSignal = determineArbitrageSignal(premiumRate);
  const liquidityScore = calculateLiquidityScore(etf.volume, etf.totalAssets);
  const trackingEfficiency = calculateTrackingEfficiency(
    etf.trackingError,
    etf.expenseRatio
  );
  const costAdjPremium = costAdjustedPremium(
    premiumRate,
    etf.expenseRatio
  );

  // Estimated profit from arbitrage
  let estimatedProfit = 0;
  if (arbitrageSignal === 'create') {
    estimatedProfit = Math.abs(costAdjPremium) * etf.creationRedemptionUnit;
  } else if (arbitrageSignal === 'redeem') {
    estimatedProfit = Math.abs(costAdjPremium) * etf.creationRedemptionUnit;
  }

  return {
    premiumRate: Math.round(premiumRate * 10000) / 10000,
    status,
    arbitrageSignal,
    estimatedProfit: Math.round(estimatedProfit * 100) / 100,
    liquidityScore: Math.round(liquidityScore * 100) / 100,
    trackingEfficiency: Math.round(trackingEfficiency * 100) / 100,
    costAdjustedPremium: Math.round(costAdjPremium * 10000) / 10000,
  };
}

// ===== Multi-ETF Arbitrage Scanner =====

export function scanArbOpportunities(
  etfs: ETFData[]
): ETFArbOpportunity[] {
  const opportunities: ETFArbOpportunity[] = [];

  for (const etf of etfs) {
    const analysis = analyzePremiumDiscount(etf);

    if (analysis.arbitrageSignal !== 'none') {
      const estimatedCost =
        etf.expenseRatio * 0.1 + // Pro-rated expense
        0.05 + // Trading cost
        0.02; // Impact cost

      const netProfit = Math.abs(analysis.premiumRate) - estimatedCost;

      let feasibility: 'high' | 'medium' | 'low';
      if (netProfit > 0.5 && analysis.liquidityScore > 50) feasibility = 'high';
      else if (netProfit > 0.2) feasibility = 'medium';
      else feasibility = 'low';

      opportunities.push({
        etf: etf.symbol,
        direction: analysis.arbitrageSignal,
        premium: analysis.premiumRate,
        estimatedCost: Math.round(estimatedCost * 10000) / 10000,
        netProfit: Math.round(netProfit * 10000) / 10000,
        feasibility,
      });
    }
  }

  return opportunities.sort((a, b) => Math.abs(b.netProfit) - Math.abs(a.netProfit));
}

// ===== NAV-based Fair Value =====

export function calculateFairValue(
  nav: number,
  expectedPremium: number = 0
): number {
  return nav * (1 + expectedPremium / 100);
}

// ===== ETF Divergence Analysis =====

export function analyzeDivergence(
  etfReturns: number[],
  benchmarkReturns: number[]
): { cumulativeDivergence: number; annualizedTrackingError: number; beta: number } {
  if (etfReturns.length !== benchmarkReturns.length || etfReturns.length === 0) {
    return { cumulativeDivergence: 0, annualizedTrackingError: 0, beta: 1 };
  }

  // Cumulative returns
  let etfCum = 1;
  let benchCum = 1;
  for (let i = 0; i < etfReturns.length; i++) {
    etfCum *= 1 + etfReturns[i];
    benchCum *= 1 + benchmarkReturns[i];
  }
  const cumulativeDivergence = (etfCum - benchCum) * 100;

  // Tracking error
  const diffs = etfReturns.map((r, i) => r - benchmarkReturns[i]);
  const avgDiff = diffs.reduce((s, d) => s + d, 0) / diffs.length;
  const variance = diffs.reduce((s, d) => s + (d - avgDiff) ** 2, 0) / diffs.length;
  const dailyTE = Math.sqrt(variance);
  const annualizedTrackingError = dailyTE * Math.sqrt(252) * 100;

  // Beta
  const benchAvg = benchmarkReturns.reduce((s, r) => s + r, 0) / benchmarkReturns.length;
  const cov = etfReturns.reduce((s, r, i) => s + (r - avgDiff) * (benchmarkReturns[i] - benchAvg), 0) / etfReturns.length;
  const benchVar = benchmarkReturns.reduce((s, r) => s + (r - benchAvg) ** 2, 0) / benchmarkReturns.length;
  const beta = benchVar > 0 ? cov / benchVar : 1;

  return {
    cumulativeDivergence: Math.round(cumulativeDivergence * 100) / 100,
    annualizedTrackingError: Math.round(annualizedTrackingError * 100) / 100,
    beta: Math.round(beta * 1000) / 1000,
  };
}
