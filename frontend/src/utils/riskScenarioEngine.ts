/**
 * Risk Scenario Analysis Engine
 *
 * Stress testing, scenario generation, and tail risk analysis.
 */

export interface Scenario {
  name: string;
  description: string;
  shocks: Record<string, number>; // symbol -> return shock
  probability: number;
}

export interface StressTestResult {
  scenario: string;
  portfolioImpact: number;
  worstPosition: { symbol: string; loss: number };
  bestPosition: { symbol: string; gain: number };
  maxDrawdown: number;
  marginCall: boolean;
}

export interface TailRiskMetrics {
  var95: number;
  var99: number;
  expectedShortfall95: number;
  expectedShortfall99: number;
  maxDrawdown: number;
  tailRiskRatio: number;
  conditionalVar: number;
}

export interface MonteCarloResult {
  paths: number[][];
  percentiles: { p5: number[]; p25: number[]; p50: number[]; p75: number[]; p95: number[] };
  probabilityOfLoss: number;
  expectedReturn: number;
  worstCase: number;
  bestCase: number;
}

function mean(arr: number[]): number {
  return arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length;
}

function std(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
}

function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor((p / 100) * sorted.length);
  return sorted[Math.min(idx, sorted.length - 1)] || 0;
}

/**
 * Run stress test with predefined scenarios
 */
export function runStressTest(
  portfolio: Record<string, number>, // symbol -> weight
  scenarios: Scenario[]
): StressTestResult[] {
  return scenarios.map(scenario => {
    let portfolioImpact = 0;
    let worstLoss = 0;
    let worstSymbol = '';
    let bestGain = -Infinity;
    let bestSymbol = '';

    for (const [symbol, weight] of Object.entries(portfolio)) {
      const shock = scenario.shocks[symbol] || 0;
      const impact = weight * shock;
      portfolioImpact += impact;

      if (impact < worstLoss) {
        worstLoss = impact;
        worstSymbol = symbol;
      }
      if (impact > bestGain) {
        bestGain = impact;
        bestSymbol = symbol;
      }
    }

    return {
      scenario: scenario.name,
      portfolioImpact,
      worstPosition: { symbol: worstSymbol, loss: worstLoss },
      bestPosition: { symbol: bestSymbol, gain: bestGain },
      maxDrawdown: Math.abs(portfolioImpact),
      marginCall: portfolioImpact < -0.3,
    };
  });
}

/**
 * Predefined crisis scenarios
 */
export function crisisScenarios(): Scenario[] {
  return [
    {
      name: 'Global Financial Crisis',
      description: '2008-style credit crisis',
      shocks: { equity: -0.50, bond: 0.10, commodity: -0.30, currency: -0.15 },
      probability: 0.02,
    },
    {
      name: 'China Market Crash',
      description: 'A-share circuit breaker crash',
      shocks: { equity: -0.35, bond: 0.05, commodity: -0.15, currency: -0.08 },
      probability: 0.05,
    },
    {
      name: 'Pandemic Shock',
      description: 'COVID-19 style sudden crash',
      shocks: { equity: -0.30, bond: 0.08, commodity: -0.40, currency: -0.05 },
      probability: 0.03,
    },
    {
      name: 'Rate Hike Shock',
      description: 'Aggressive monetary tightening',
      shocks: { equity: -0.15, bond: -0.20, commodity: -0.10, currency: 0.05 },
      probability: 0.10,
    },
    {
      name: 'Tech Bubble Burst',
      description: 'Sector rotation from tech to value',
      shocks: { equity: -0.25, bond: 0.03, commodity: 0.10, currency: 0.02 },
      probability: 0.05,
    },
    {
      name: 'Currency Crisis',
      description: 'RMB devaluation',
      shocks: { equity: -0.20, bond: -0.05, commodity: 0.15, currency: -0.20 },
      probability: 0.03,
    },
  ];
}

/**
 * Calculate tail risk metrics
 */
export function calculateTailRisk(returns: number[]): TailRiskMetrics {
  if (returns.length < 10) {
    return {
      var95: 0, var99: 0, expectedShortfall95: 0, expectedShortfall99: 0,
      maxDrawdown: 0, tailRiskRatio: 0, conditionalVar: 0,
    };
  }

  // VaR: historical simulation
  const var95 = -percentile(returns, 5);
  const var99 = -percentile(returns, 1);

  // Expected Shortfall: average of tail losses
  const sorted = [...returns].sort((a, b) => a - b);
  const es95Slice = sorted.filter(r => r <= -var95);
  const es99Slice = sorted.filter(r => r <= -var99);
  const expectedShortfall95 = es95Slice.length > 0 ? -mean(es95Slice) : var95;
  const expectedShortfall99 = es99Slice.length > 0 ? -mean(es99Slice) : var99;

  // Max drawdown
  let cumReturn = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const r of returns) {
    cumReturn += r;
    if (cumReturn > peak) peak = cumReturn;
    const dd = peak - cumReturn;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  // Tail risk ratio: ES / VaR
  const tailRiskRatio = var95 === 0 ? 0 : expectedShortfall95 / var95;

  // Conditional VaR at 95%
  const conditionalVar = expectedShortfall95;

  return {
    var95,
    var99,
    expectedShortfall95,
    expectedShortfall99,
    maxDrawdown,
    tailRiskRatio,
    conditionalVar,
  };
}

/**
 * Monte Carlo simulation for portfolio returns
 */
export function monteCarloSimulation(
  initialPortfolio: number,
  meanReturn: number,
  volatility: number,
  days: number = 252,
  numPaths: number = 1000
): MonteCarloResult {
  const paths: number[][] = [];
  const finalReturns: number[] = [];

  for (let p = 0; p < numPaths; p++) {
    const path: number[] = [initialPortfolio];
    let value = initialPortfolio;

    for (let d = 0; d < days; d++) {
      // GBM: dS = S * (mu * dt + sigma * dW)
      const z = (Math.random() + Math.random() + Math.random() - 1.5) * 2 / Math.sqrt(3); // approx normal
      const dailyReturn = meanReturn / 252 + (volatility / Math.sqrt(252)) * z;
      value *= (1 + dailyReturn);
      path.push(value);
    }

    paths.push(path);
    finalReturns.push((value - initialPortfolio) / initialPortfolio);
  }

  // Calculate percentiles at each time step
  const percentiles: MonteCarloResult['percentiles'] = { p5: [], p25: [], p50: [], p75: [], p95: [] };
  for (let d = 0; d <= days; d++) {
    const values = paths.map(p => p[d]);
    percentiles.p5.push(percentile(values, 5));
    percentiles.p25.push(percentile(values, 25));
    percentiles.p50.push(percentile(values, 50));
    percentiles.p75.push(percentile(values, 75));
    percentiles.p95.push(percentile(values, 95));
  }

  return {
    paths: paths.slice(0, 100), // return subset
    percentiles,
    probabilityOfLoss: finalReturns.filter(r => r < 0).length / numPaths,
    expectedReturn: mean(finalReturns),
    worstCase: Math.min(...finalReturns),
    bestCase: Math.max(...finalReturns),
  };
}

/**
 * Generate correlated stress scenarios
 */
export function generateCorrelatedScenarios(
  baseMarket: string,
  correlatedMarkets: string[],
  correlations: number[],
  severity: number = 1
): Scenario[] {
  const scenarios: Scenario[] = [];

  const severities = [
    { name: 'Mild', shock: -0.10 * severity },
    { name: 'Moderate', shock: -0.20 * severity },
    { name: 'Severe', shock: -0.35 * severity },
    { name: 'Extreme', shock: -0.50 * severity },
  ];

  for (const sev of severities) {
    const shocks: Record<string, number> = { [baseMarket]: sev.shock };
    for (let i = 0; i < correlatedMarkets.length; i++) {
      shocks[correlatedMarkets[i]] = sev.shock * (correlations[i] || 0);
    }

    scenarios.push({
      name: `${baseMarket} ${sev.name} Shock`,
      description: `${sev.name} decline in ${baseMarket} with correlated impact`,
      shocks,
      probability: sev.name === 'Mild' ? 0.1 : sev.name === 'Moderate' ? 0.05 : sev.name === 'Severe' ? 0.02 : 0.01,
    });
  }

  return scenarios;
}
