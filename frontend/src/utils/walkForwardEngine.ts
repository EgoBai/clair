/**
 * Walk-Forward Analysis Engine
 *
 * Out-of-sample testing framework: walk-forward optimization,
 * anchored/expanding/rolling windows, and overfitting detection.
 */

export interface WalkForwardWindow {
  trainStart: number;
  trainEnd: number;
  testStart: number;
  testEnd: number;
  trainReturns: number[];
  testReturns: number[];
}

export interface WalkForwardResult {
  windows: WalkForwardWindow[];
  inSampleMetrics: PerformanceMetrics;
  outOfSampleMetrics: PerformanceMetrics;
  efficiencyRatio: number; // OOS / IS
  overfittingScore: number; // 0-1, higher = more overfit
  parameterStability: number[];
}

export interface PerformanceMetrics {
  totalReturn: number;
  annualizedReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  profitFactor: number;
  calmarRatio: number;
  sortinoRatio: number;
}

export type WalkForwardType = 'anchored' | 'rolling' | 'expanding';

function mean(arr: number[]): number {
  return arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length;
}

function std(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
}

/**
 * Generate walk-forward windows
 */
export function generateWalkForwardWindows(
  totalLength: number,
  trainSize: number,
  testSize: number,
  type: WalkForwardType = 'rolling'
): WalkForwardWindow[] {
  const windows: WalkForwardWindow[] = [];

  if (type === 'anchored') {
    // Train always starts at 0, test slides forward
    for (let testStart = trainSize; testStart + testSize <= totalLength; testStart += testSize) {
      windows.push({
        trainStart: 0,
        trainEnd: testStart,
        testStart,
        testEnd: testStart + testSize,
        trainReturns: [],
        testReturns: [],
      });
    }
  } else if (type === 'rolling') {
    // Both train and test slide forward
    for (let start = 0; start + trainSize + testSize <= totalLength; start += testSize) {
      windows.push({
        trainStart: start,
        trainEnd: start + trainSize,
        testStart: start + trainSize,
        testEnd: start + trainSize + testSize,
        trainReturns: [],
        testReturns: [],
      });
    }
  } else {
    // Expanding: train grows, test slides
    for (let testStart = trainSize; testStart + testSize <= totalLength; testStart += testSize) {
      windows.push({
        trainStart: 0,
        trainEnd: testStart,
        testStart,
        testEnd: Math.min(testStart + testSize, totalLength),
        trainReturns: [],
        testReturns: [],
      });
    }
  }

  return windows;
}

/**
 * Calculate performance metrics from returns
 */
export function calculatePerformanceMetrics(returns: number[]): PerformanceMetrics {
  if (returns.length === 0) {
    return {
      totalReturn: 0, annualizedReturn: 0, sharpeRatio: 0, maxDrawdown: 0,
      winRate: 0, profitFactor: 0, calmarRatio: 0, sortinoRatio: 0,
    };
  }

  const totalReturn = returns.reduce((s, r) => s + r, 0);
  const annualizedReturn = totalReturn * (252 / returns.length);
  const vol = std(returns) * Math.sqrt(252);
  const sharpeRatio = vol === 0 ? 0 : annualizedReturn / vol;

  // Max drawdown
  let cumReturn = 0, peak = 0, maxDrawdown = 0;
  for (const r of returns) {
    cumReturn += r;
    if (cumReturn > peak) peak = cumReturn;
    const dd = peak - cumReturn;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  // Win rate
  const wins = returns.filter(r => r > 0);
  const losses = returns.filter(r => r <= 0);
  const winRate = returns.length === 0 ? 0 : wins.length / returns.length;

  // Profit factor
  const totalWins = wins.reduce((s, r) => s + r, 0);
  const totalLosses = Math.abs(losses.reduce((s, r) => s + r, 0));
  const profitFactor = totalLosses === 0 ? (totalWins > 0 ? Infinity : 0) : totalWins / totalLosses;

  // Calmar ratio
  const calmarRatio = maxDrawdown === 0 ? 0 : annualizedReturn / maxDrawdown;

  // Sortino ratio
  const downside = returns.filter(r => r < 0);
  const downsideDev = downside.length > 0
    ? Math.sqrt(downside.reduce((s, r) => s + r ** 2, 0) / downside.length) * Math.sqrt(252)
    : 0;
  const sortinoRatio = downsideDev === 0 ? 0 : annualizedReturn / downsideDev;

  return {
    totalReturn,
    annualizedReturn,
    sharpeRatio,
    maxDrawdown,
    winRate,
    profitFactor: isFinite(profitFactor) ? profitFactor : 0,
    calmarRatio,
    sortinoRatio,
  };
}

/**
 * Run walk-forward analysis
 */
export function runWalkForward(
  returns: number[],
  trainSize: number,
  testSize: number,
  type: WalkForwardType = 'rolling'
): WalkForwardResult {
  const windows = generateWalkForwardWindows(returns.length, trainSize, testSize, type);

  // Fill windows with returns data
  for (const w of windows) {
    w.trainReturns = returns.slice(w.trainStart, w.trainEnd);
    w.testReturns = returns.slice(w.testStart, w.testEnd);
  }

  // Aggregate IS and OOS returns
  const isReturns: number[] = [];
  const oosReturns: number[] = [];

  for (const w of windows) {
    isReturns.push(...w.trainReturns);
    oosReturns.push(...w.testReturns);
  }

  const inSampleMetrics = calculatePerformanceMetrics(isReturns);
  const outOfSampleMetrics = calculatePerformanceMetrics(oosReturns);

  // Efficiency ratio: how much OOS performance degrades vs IS
  const efficiencyRatio = inSampleMetrics.sharpeRatio === 0
    ? 0
    : outOfSampleMetrics.sharpeRatio / inSampleMetrics.sharpeRatio;

  // Overfitting score: based on efficiency ratio and win rate degradation
  const sharpeDecay = 1 - efficiencyRatio;
  const winRateDecay = Math.abs(inSampleMetrics.winRate - outOfSampleMetrics.winRate);
  const overfittingScore = Math.min(1, Math.max(0, (sharpeDecay + winRateDecay) / 2));

  // Parameter stability: variance of per-window Sharpe ratios
  const windowSharpes = windows
    .filter(w => w.testReturns.length > 0)
    .map(w => calculatePerformanceMetrics(w.testReturns).sharpeRatio);
  const parameterStability = windowSharpes;

  return {
    windows,
    inSampleMetrics,
    outOfSampleMetrics,
    efficiencyRatio,
    overfittingScore,
    parameterStability,
  };
}

/**
 * Combinatorial cross-validation (Combinatorial Purged Cross-Validation)
 */
export function combinatorialPurgedCV(
  returns: number[],
  numFolds: number = 5,
  purgeGap: number = 5
): { folds: { train: number[]; test: number[] }[]; avgOOSMetrics: PerformanceMetrics } {
  const foldSize = Math.floor(returns.length / numFolds);
  const folds: { train: number[]; test: number[] }[] = [];

  for (let i = 0; i < numFolds; i++) {
    const testStart = i * foldSize;
    const testEnd = Math.min(testStart + foldSize, returns.length);

    const train: number[] = [];
    for (let j = 0; j < returns.length; j++) {
      if (j < testStart - purgeGap || j >= testEnd + purgeGap) {
        train.push(returns[j]);
      }
    }

    folds.push({
      train,
      test: returns.slice(testStart, testEnd),
    });
  }

  const oosMetrics = folds.map(f => calculatePerformanceMetrics(f.test));
  const avgOOSMetrics: PerformanceMetrics = {
    totalReturn: mean(oosMetrics.map(m => m.totalReturn)),
    annualizedReturn: mean(oosMetrics.map(m => m.annualizedReturn)),
    sharpeRatio: mean(oosMetrics.map(m => m.sharpeRatio)),
    maxDrawdown: mean(oosMetrics.map(m => m.maxDrawdown)),
    winRate: mean(oosMetrics.map(m => m.winRate)),
    profitFactor: mean(oosMetrics.map(m => m.profitFactor)),
    calmarRatio: mean(oosMetrics.map(m => m.calmarRatio)),
    sortinoRatio: mean(oosMetrics.map(m => m.sortinoRatio)),
  };

  return { folds, avgOOSMetrics };
}

/**
 * Detect overfitting via performance degradation
 */
export function detectOverfitting(
  inSample: PerformanceMetrics,
  outOfSample: PerformanceMetrics,
  thresholds: { sharpeRatio: number; winRate: number; profitFactor: number } = {
    sharpeRatio: 0.5,
    winRate: 0.1,
    profitFactor: 0.5,
  }
): {
  isOverfit: boolean;
  reasons: string[];
  severity: 'none' | 'mild' | 'moderate' | 'severe';
} {
  const reasons: string[] = [];

  const sharpeDecay = inSample.sharpeRatio > 0
    ? (inSample.sharpeRatio - outOfSample.sharpeRatio) / inSample.sharpeRatio
    : 0;
  if (sharpeDecay > thresholds.sharpeRatio) {
    reasons.push(`Sharpe decay: ${(sharpeDecay * 100).toFixed(0)}%`);
  }

  const winRateDecay = Math.abs(inSample.winRate - outOfSample.winRate);
  if (winRateDecay > thresholds.winRate) {
    reasons.push(`Win rate decay: ${(winRateDecay * 100).toFixed(0)}%`);
  }

  const pfDecay = inSample.profitFactor > 0
    ? (inSample.profitFactor - outOfSample.profitFactor) / inSample.profitFactor
    : 0;
  if (pfDecay > thresholds.profitFactor) {
    reasons.push(`Profit factor decay: ${(pfDecay * 100).toFixed(0)}%`);
  }

  const isOverfit = reasons.length > 0;
  let severity: 'none' | 'mild' | 'moderate' | 'severe';
  if (reasons.length === 0) severity = 'none';
  else if (reasons.length === 1) severity = 'mild';
  else if (reasons.length === 2) severity = 'moderate';
  else severity = 'severe';

  return { isOverfit, reasons, severity };
}
