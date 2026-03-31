/**
 * 统计套利引擎
 * 支持: 均值回归套利、协整套利、波动率套利、跨期套利
 */

export interface ArbitrageOpportunity {
  type: 'mean_reversion' | 'cointegration' | 'volatility' | 'calendar_spread';
  symbols: string[];
  entrySignal: number; // -1 to 1
  expectedReturn: number;
  expectedRisk: number;
  sharpeEstimate: number;
  halfLife: number;
  confidence: number;
  description: string;
}

export interface MeanReversionParams {
  lookback: number;
  entryZScore: number;
  exitZScore: number;
  stopZScore: number;
}

export interface VolArbParams {
  impliedVol: number;
  realizedVol: number;
  volSpread: number;
  historicalPercentile: number;
}

/**
 * 均值回归套利信号
 */
export function meanReversionSignal(
  prices: number[],
  params: MeanReversionParams
): ArbitrageOpportunity | null {
  if (prices.length < params.lookback) return null;

  const recent = prices.slice(-params.lookback);
  const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
  const std = Math.sqrt(recent.reduce((a, p) => a + (p - mean) ** 2, 0) / (recent.length - 1));

  if (std < 1e-10) return null;

  const currentPrice = prices[prices.length - 1];
  const zScore = (currentPrice - mean) / std;

  // 计算半衰期
  const halfLife = calculateHalfLife(prices.slice(-params.lookback));

  // 信号强度
  let entrySignal = 0;
  if (zScore < -params.entryZScore) {
    entrySignal = Math.min(1, (Math.abs(zScore) - params.entryZScore) / params.entryZScore);
  } else if (zScore > params.entryZScore) {
    entrySignal = -Math.min(1, (zScore - params.entryZScore) / params.entryZScore);
  }

  // 预期收益 (基于历史均值回归)
  const expectedReturn = -zScore * std / mean;
  const expectedRisk = std / mean;
  const sharpeEstimate = expectedRisk > 0 ? Math.abs(expectedReturn) / expectedRisk : 0;

  return {
    type: 'mean_reversion',
    symbols: ['SINGLE'],
    entrySignal,
    expectedReturn,
    expectedRisk,
    sharpeEstimate,
    halfLife,
    confidence: Math.min(1, Math.abs(zScore) / 3),
    description: `Z-Score: ${zScore.toFixed(2)}, Mean: ${mean.toFixed(2)}, Half-life: ${halfLife.toFixed(1)} days`
  };
}

/**
 * 波动率套利信号
 */
export function volatilityArbSignal(
  params: VolArbParams
): ArbitrageOpportunity | null {
  const { impliedVol, realizedVol, volSpread, historicalPercentile } = params;

  // 隐含波动率相对于历史波动率的溢价
  const volPremium = impliedVol - realizedVol;

  // 信号: 如果隐含波动率处于历史高位且高于实现波动率，做空波动率
  let entrySignal = 0;
  if (historicalPercentile > 80 && volPremium > 0.02) {
    entrySignal = -Math.min(1, volPremium / 0.1); // 做空波动率
  } else if (historicalPercentile < 20 && volPremium < -0.02) {
    entrySignal = Math.min(1, Math.abs(volPremium) / 0.1); // 做多波动率
  }

  const expectedReturn = volPremium * 0.5; // 假设回归一半
  const expectedRisk = Math.abs(volSpread) * 0.3;

  return {
    type: 'volatility',
    symbols: ['IMPLIED', 'REALIZED'],
    entrySignal,
    expectedReturn,
    expectedRisk,
    sharpeEstimate: expectedRisk > 0 ? Math.abs(expectedReturn) / expectedRisk : 0,
    halfLife: 30,
    confidence: Math.abs(entrySignal),
    description: `IV: ${(impliedVol * 100).toFixed(1)}%, RV: ${(realizedVol * 100).toFixed(1)}%, Premium: ${(volPremium * 100).toFixed(1)}%`
  };
}

/**
 * 跨期价差套利 (Calendar Spread)
 */
export function calendarSpreadSignal(
  nearPrices: number[],
  farPrices: number[],
  lookback: number = 60
): ArbitrageOpportunity | null {
  if (nearPrices.length < lookback || farPrices.length < lookback) return null;

  // 计算价差
  const spreads: number[] = [];
  const n = Math.min(nearPrices.length, farPrices.length);
  for (let i = n - lookback; i < n; i++) {
    spreads.push(farPrices[i] - nearPrices[i]);
  }

  const mean = spreads.reduce((a, b) => a + b, 0) / spreads.length;
  const std = Math.sqrt(spreads.reduce((a, s) => a + (s - mean) ** 2, 0) / (spreads.length - 1));

  if (std < 1e-10) return null;

  const currentSpread = spreads[spreads.length - 1];
  const zScore = (currentSpread - mean) / std;

  const halfLife = calculateHalfLife(spreads);

  let entrySignal = 0;
  if (zScore < -2) entrySignal = 1; // 价差过窄，做多远期做空近期
  else if (zScore > 2) entrySignal = -1; // 价差过宽，做空远期做多近期

  const expectedReturn = Math.abs(zScore) * std / Math.abs(mean) * 0.5;
  const expectedRisk = std / Math.abs(mean);

  return {
    type: 'calendar_spread',
    symbols: ['NEAR', 'FAR'],
    entrySignal,
    expectedReturn,
    expectedRisk,
    sharpeEstimate: expectedRisk > 0 ? expectedReturn / expectedRisk : 0,
    halfLife,
    confidence: Math.min(1, Math.abs(zScore) / 3),
    description: `Spread Z-Score: ${zScore.toFixed(2)}, Mean: ${mean.toFixed(2)}, HL: ${halfLife.toFixed(1)}d`
  };
}

/**
 * 批量扫描套利机会
 */
export function scanArbitrageOpportunities(
  priceData: Map<string, number[]>,
  lookback: number = 60,
  minSharpe: number = 0.5
): ArbitrageOpportunity[] {
  const opportunities: ArbitrageOpportunity[] = [];
  const symbols = Array.from(priceData.keys());

  // 单资产均值回归
  for (const [symbol, prices] of priceData) {
    const opp = meanReversionSignal(prices, {
      lookback,
      entryZScore: 2.0,
      exitZScore: 0.5,
      stopZScore: 3.0
    });
    if (opp && opp.sharpeEstimate >= minSharpe && Math.abs(opp.entrySignal) > 0.1) {
      opp.symbols = [symbol];
      opportunities.push(opp);
    }
  }

  // 配对套利 (简化: 随机配对)
  for (let i = 0; i < symbols.length; i++) {
    for (let j = i + 1; j < Math.min(i + 5, symbols.length); j++) {
      const pricesA = priceData.get(symbols[i])!;
      const pricesB = priceData.get(symbols[j])!;
      const n = Math.min(pricesA.length, pricesB.length);

      if (n < lookback) continue;

      const spreads: number[] = [];
      const hr = calculateHedgeRatio(pricesA.slice(-n), pricesB.slice(-n));
      for (let k = n - lookback; k < n; k++) {
        spreads.push(pricesA[k] - hr * pricesB[k]);
      }

      const opp = meanReversionSignal(spreads, {
        lookback,
        entryZScore: 1.5,
        exitZScore: 0.3,
        stopZScore: 2.5
      });

      if (opp && opp.sharpeEstimate >= minSharpe && Math.abs(opp.entrySignal) > 0.1) {
        opp.symbols = [symbols[i], symbols[j]];
        opportunities.push(opp);
      }
    }
  }

  // 按夏普排序
  return opportunities.sort((a, b) => b.sharpeEstimate - a.sharpeEstimate);
}

// ===== Helpers =====

function calculateHalfLife(prices: number[]): number {
  const n = prices.length;
  if (n < 3) return 1;

  const deltaY: number[] = [];
  const laggedY: number[] = [];
  for (let i = 1; i < n; i++) {
    deltaY.push(prices[i] - prices[i - 1]);
    laggedY.push(prices[i - 1]);
  }

  const m = deltaY.length;
  let sumLag = 0, sumDelta = 0, sumLagDelta = 0, sumLag2 = 0;
  for (let i = 0; i < m; i++) {
    sumLag += laggedY[i];
    sumDelta += deltaY[i];
    sumLagDelta += laggedY[i] * deltaY[i];
    sumLag2 += laggedY[i] * laggedY[i];
  }

  const denom = m * sumLag2 - sumLag * sumLag;
  if (Math.abs(denom) < 1e-10) return 1;

  const beta = (m * sumLagDelta - sumLag * sumDelta) / denom;
  return beta < 0 ? -Math.log(2) / beta : 1000;
}

function calculateHedgeRatio(pricesA: number[], pricesB: number[]): number {
  const n = Math.min(pricesA.length, pricesB.length);
  if (n < 2) return 1;

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += pricesB[i];
    sumY += pricesA[i];
    sumXY += pricesB[i] * pricesA[i];
    sumX2 += pricesB[i] * pricesB[i];
  }

  const denom = n * sumX2 - sumX * sumX;
  return Math.abs(denom) > 1e-10 ? (n * sumXY - sumX * sumY) / denom : 1;
}
