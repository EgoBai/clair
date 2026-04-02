/**
 * AdaptiveStopLossEngine - 自适应止损引擎
 * 基于ATR、波动率和趋势强度动态调整止损位
 */

export interface OHLCData {
  date: string;
  high: number;
  low: number;
  close: number;
}

export interface StopLossResult {
  atrValue: number;
  atrStopLoss: number;
  trailingStop: number;
  chandelierStop: number;
  finalStopLoss: number;
  riskPercent: number;
  stopType: 'tight' | 'normal' | 'wide';
  shouldExit: boolean;
}

export interface StopLossConfig {
  atrPeriod: number;
  atrMultiplier: number;
  trailingLookback: number;
  riskTolerance: 'conservative' | 'moderate' | 'aggressive';
}

const RISK_MULTIPLIERS = {
  conservative: 1.5,
  moderate: 2.0,
  aggressive: 3.0,
};

const DEFAULT_CONFIG: StopLossConfig = {
  atrPeriod: 14,
  atrMultiplier: 2.0,
  trailingLookback: 20,
  riskTolerance: 'moderate',
};

function computeATR(data: OHLCData[], period: number): number {
  if (data.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < data.length; i++) {
    const tr = Math.max(
      data[i].high - data[i].low,
      Math.abs(data[i].high - data[i - 1].close),
      Math.abs(data[i].low - data[i - 1].close)
    );
    trs.push(tr);
  }
  const recent = trs.slice(-period);
  return recent.reduce((s, v) => s + v, 0) / recent.length;
}

export function computeStopLoss(
  data: OHLCData[],
  entryPrice: number,
  direction: 'long' | 'short' = 'long',
  config: Partial<StopLossConfig> = {}
): StopLossResult | null {
  if (data.length < 2) return null;
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const multiplier = cfg.atrMultiplier * RISK_MULTIPLIERS[cfg.riskTolerance] / RISK_MULTIPLIERS.moderate;

  const atr = computeATR(data, cfg.atrPeriod);
  if (atr === 0) return null;

  const slice = data.slice(-cfg.trailingLookback);
  const currentPrice = data[data.length - 1].close;

  let atrStop: number, trailingStop: number, chandelierStop: number;
  if (direction === 'long') {
    atrStop = entryPrice - atr * multiplier;
    const highestHigh = Math.max(...slice.map(d => d.high));
    trailingStop = highestHigh - atr * multiplier;
    chandelierStop = highestHigh - atr * 3;
  } else {
    atrStop = entryPrice + atr * multiplier;
    const lowestLow = Math.min(...slice.map(d => d.low));
    trailingStop = lowestLow + atr * multiplier;
    chandelierStop = lowestLow + atr * 3;
  }

  const finalStop = direction === 'long'
    ? Math.max(atrStop, trailingStop, chandelierStop)
    : Math.min(atrStop, trailingStop, chandelierStop);

  const riskPercent = direction === 'long'
    ? (entryPrice - finalStop) / entryPrice
    : (finalStop - entryPrice) / entryPrice;

  const shouldExit = direction === 'long' ? currentPrice <= finalStop : currentPrice >= finalStop;

  let stopType: StopLossResult['stopType'];
  if (riskPercent < 0.02) stopType = 'tight';
  else if (riskPercent > 0.05) stopType = 'wide';
  else stopType = 'normal';

  return {
    atrValue: atr,
    atrStopLoss: atrStop,
    trailingStop,
    chandelierStop,
    finalStopLoss: finalStop,
    riskPercent,
    stopType,
    shouldExit,
  };
}

export function computeMultiTimeframeStop(
  data: OHLCData[],
  entryPrice: number,
  direction: 'long' | 'short' = 'long'
): { daily: StopLossResult | null; weekly: StopLossResult | null } {
  const daily = computeStopLoss(data, entryPrice, direction, { atrPeriod: 14, trailingLookback: 20 });
  // 模拟周线: 取每5根
  const weeklyData = data.filter((_, i) => i % 5 === 0);
  const weekly = computeStopLoss(weeklyData, entryPrice, direction, { atrPeriod: 10, trailingLookback: 12 });
  return { daily, weekly };
}
