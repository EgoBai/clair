/**
 * 配对交易引擎 - 协整检验/价差分析/均值回归信号
 */

export interface PairData {
  tickerA: string;
  tickerB: string;
  pricesA: number[];
  pricesB: number[];
  dates: string[];
}

export interface CointegrationResult {
  isCointegrated: boolean;
  hedgeRatio: number;
  spreadMean: number;
  spreadStd: number;
  halfLife: number; // 均值回归半衰期(天)
  adfStat: number; // ADF统计量
  pValue: number;
  rSquared: number;
}

export interface SpreadAnalysis {
  currentSpread: number;
  zScore: number;
  percentile: number;
  signal: 'long_spread' | 'short_spread' | 'exit' | 'neutral';
  entryThreshold: number;
  exitThreshold: number;
  stopLoss: number;
  expectedReturn: number;
  holdingPeriod: number; // 预期持有天数
  confidence: number;
}

export interface PairTradeSignal {
  pair: PairData;
  cointegration: CointegrationResult;
  spread: SpreadAnalysis;
  action: 'open_long_A_short_B' | 'open_short_A_long_B' | 'close' | 'hold';
  riskReward: number;
  maxPosition: number; // 最大仓位(%)
}

/**
 * 协整检验 (简化Engle-Granger)
 */
export function testCointegration(pair: PairData): CointegrationResult {
  const n = Math.min(pair.pricesA.length, pair.pricesB.length);
  if (n < 20) {
    return {
      isCointegrated: false, hedgeRatio: 1, spreadMean: 0, spreadStd: 0,
      halfLife: 0, adfStat: 0, pValue: 1, rSquared: 0,
    };
  }

  const A = pair.pricesA.slice(-n);
  const B = pair.pricesB.slice(-n);

  // OLS回归: A = α + β*B
  const meanA = A.reduce((a, b) => a + b, 0) / n;
  const meanB = B.reduce((a, b) => a + b, 0) / n;

  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (A[i] - meanA) * (B[i] - meanB);
    den += (B[i] - meanB) ** 2;
  }
  const hedgeRatio = den > 0 ? num / den : 1;
  const alpha = meanA - hedgeRatio * meanB;

  // 价差
  const spread = A.map((a, i) => a - hedgeRatio * B[i] - alpha);
  const spreadMean = spread.reduce((a, b) => a + b, 0) / n;
  const spreadStd = Math.sqrt(spread.reduce((s, v) => s + (v - spreadMean) ** 2, 0) / (n - 1));

  // R²
  const predicted = B.map(b => alpha + hedgeRatio * b);
  const ssRes = A.reduce((s, a, i) => s + (a - predicted[i]) ** 2, 0);
  const ssTot = A.reduce((s, a) => s + (a - meanA) ** 2, 0);
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  // ADF检验 (简化: 用spread的差分回归)
  const dSpread = spread.slice(1).map((s, i) => s - spread[i]);
  const laggedSpread = spread.slice(0, -1);
  const meanLagged = laggedSpread.reduce((a, b) => a + b, 0) / laggedSpread.length;
  const meanDiff = dSpread.reduce((a, b) => a + b, 0) / dSpread.length;

  let adfNum = 0, adfDen = 0;
  for (let i = 0; i < dSpread.length; i++) {
    adfNum += (laggedSpread[i] - meanLagged) * (dSpread[i] - meanDiff);
    adfDen += (laggedSpread[i] - meanLagged) ** 2;
  }
  const gamma = adfDen > 0 ? adfNum / adfDen : 0;
  const residVar = dSpread.reduce((s, v, i) => s + (v - meanDiff - gamma * (laggedSpread[i] - meanLagged)) ** 2, 0) / (dSpread.length - 2);
  const se = Math.sqrt(residVar / adfDen);
  const adfStat = se > 0 ? gamma / se : 0;

  // 简化p值 (临界值法)
  const pValue = adfStat < -3.4 ? 0.01 : adfStat < -2.86 ? 0.05 : adfStat < -2.57 ? 0.1 : 0.5;

  // 半衰期
  const halfLife = gamma < 0 ? Math.round(-Math.log(2) / gamma) : n;

  return {
    isCointegrated: pValue < 0.05,
    hedgeRatio: Math.round(hedgeRatio * 10000) / 10000,
    spreadMean: Math.round(spreadMean * 10000) / 10000,
    spreadStd: Math.round(spreadStd * 10000) / 10000,
    halfLife: Math.min(halfLife, 120),
    adfStat: Math.round(adfStat * 100) / 100,
    pValue: Math.round(pValue * 100) / 100,
    rSquared: Math.round(rSquared * 10000) / 10000,
  };
}

/**
 * 价差分析
 */
export function analyzeSpread(
  pair: PairData,
  cointegration: CointegrationResult,
): SpreadAnalysis {
  const n = Math.min(pair.pricesA.length, pair.pricesB.length);
  const latestA = pair.pricesA[n - 1];
  const latestB = pair.pricesB[n - 1];

  const currentSpread = latestA - cointegration.hedgeRatio * latestB;
  const zScore = cointegration.spreadStd > 0
    ? (currentSpread - cointegration.spreadMean) / cointegration.spreadStd : 0;

  // 历史分位
  const spreads = pair.pricesA.map((a, i) => a - cointegration.hedgeRatio * pair.pricesB[i]);
  const sorted = [...spreads].sort((a, b) => a - b);
  const percentile = (sorted.filter(s => s <= currentSpread).length / sorted.length) * 100;

  // 信号
  const entryThreshold = 2;
  const exitThreshold = 0.5;
  const stopLoss = 3;

  let signal: SpreadAnalysis['signal'];
  if (zScore > entryThreshold) signal = 'short_spread';
  else if (zScore < -entryThreshold) signal = 'long_spread';
  else if (Math.abs(zScore) < exitThreshold) signal = 'exit';
  else signal = 'neutral';

  const expectedReturn = Math.abs(zScore) > entryThreshold ? Math.abs(zScore) * cointegration.spreadStd * 0.5 : 0;
  const holdingPeriod = cointegration.halfLife > 0 ? Math.min(cointegration.halfLife * 2, 60) : 30;
  const confidence = cointegration.isCointegrated ? Math.min(0.9, 0.5 + cointegration.rSquared * 0.4) : 0.3;

  return {
    currentSpread: Math.round(currentSpread * 100) / 100,
    zScore: Math.round(zScore * 100) / 100,
    percentile: Math.round(percentile),
    signal,
    entryThreshold,
    exitThreshold,
    stopLoss,
    expectedReturn: Math.round(expectedReturn * 100) / 100,
    holdingPeriod,
    confidence: Math.round(confidence * 100) / 100,
  };
}

/**
 * 生成配对交易信号
 */
export function generatePairSignal(pair: PairData): PairTradeSignal {
  const cointegration = testCointegration(pair);
  const spread = analyzeSpread(pair, cointegration);

  let action: PairTradeSignal['action'];
  if (spread.signal === 'long_spread') action = 'open_long_A_short_B';
  else if (spread.signal === 'short_spread') action = 'open_short_A_long_B';
  else if (spread.signal === 'exit') action = 'close';
  else action = 'hold';

  const riskReward = spread.stopLoss > 0 ? Math.abs(spread.expectedReturn / (spread.stopLoss * cointegration.spreadStd)) : 0;
  const maxPosition = cointegration.isCointegrated && spread.signal !== 'neutral' && spread.signal !== 'exit'
    ? Math.min(20, 10 * cointegration.rSquared) : 0;

  return {
    pair,
    cointegration,
    spread,
    action,
    riskReward: Math.round(riskReward * 100) / 100,
    maxPosition: Math.round(maxPosition * 10) / 10,
  };
}
