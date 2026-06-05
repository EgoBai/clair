/**
 * 板块动量引擎
 * 基于相对强度和动量识别板块轮动信号
 */

export interface SectorData {
  name: string;
  /** 近N日收益率序列 */
  returns: number[];
  /** 成交量序列 */
  volumes: number[];
  /** 资金净流入序列 */
  fundFlows: number[];
}

export interface MomentumResult {
  sector: string;
  /** 相对强度 (vs 市场平均) */
  relativeStrength: number;
  /** 动量得分 */
  momentum: number;
  /** 量价配合度 */
  volumeConfirmation: number;
  /** 资金支持度 */
  fundSupport: number;
  /** 综合评分 */
  compositeScore: number;
  /** 信号 */
  signal: '领涨' | '轮动中' | '观望' | '退潮' | '回避';
}

export interface RotationSignal {
  /** 进入领涨的板块 */
  inflowSectors: string[];
  /** 退潮的板块 */
  outflowSectors: string[];
  /** 市场风格 */
  style: '成长' | '价值' | '均衡';
  /** 轮动强度 */
  rotationStrength: number;
}

function calcEMA(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const result = [values[0]];
  for (let i = 1; i < values.length; i++) {
    result.push(values[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

function calcROC(prices: number[], period: number): number {
  if (prices.length < period + 1) return 0;
  const current = prices[prices.length - 1];
  const previous = prices[prices.length - 1 - period];
  return previous !== 0 ? ((current - previous) / Math.abs(previous)) * 100 : 0;
}

function calcAvgVolumeConfirmation(returns: number[], volumes: number[]): number {
  if (returns.length < 2 || volumes.length < 2) return 0;
  let confirmed = 0;
  const len = Math.min(returns.length, volumes.length);
  for (let i = 1; i < len; i++) {
    const priceUp = returns[i] > returns[i - 1];
    const volUp = volumes[i] > volumes[i - 1];
    if ((priceUp && volUp) || (!priceUp && !volUp)) confirmed++;
  }
  return (confirmed / (len - 1)) * 100;
}

function calcFundSupport(fundFlows: number[]): number {
  if (fundFlows.length === 0) return 50;
  const positiveDays = fundFlows.filter(f => f > 0).length;
  return (positiveDays / fundFlows.length) * 100;
}

export function analyzeSectorMomentum(
  sector: SectorData,
  marketAvgReturn: number
): MomentumResult {
  const totalReturn = sector.returns.reduce((a, b) => a + b, 0);
  const relativeStrength = totalReturn - marketAvgReturn;

  const emaShort = calcEMA(sector.returns, 5);
  const emaLong = calcEMA(sector.returns, 20);
  const lastShort = emaShort[emaShort.length - 1] || 0;
  const lastLong = emaLong[emaLong.length - 1] || 0;
  const momentum = lastShort - lastLong;

  const volumeConfirmation = calcAvgVolumeConfirmation(sector.returns, sector.volumes);
  const fundSupport = calcFundSupport(sector.fundFlows);

  const compositeScore = Math.round(
    relativeStrength * 30 +
    momentum * 25 +
    volumeConfirmation * 0.2 +
    fundSupport * 0.25
  );

  let signal: MomentumResult['signal'];
  if (compositeScore > 60) signal = '领涨';
  else if (compositeScore > 30) signal = '轮动中';
  else if (compositeScore > -10) signal = '观望';
  else if (compositeScore > -40) signal = '退潮';
  else signal = '回避';

  return {
    sector: sector.name,
    relativeStrength,
    momentum,
    volumeConfirmation,
    fundSupport,
    compositeScore,
    signal,
  };
}

export function detectRotation(
  sectors: SectorData[],
  marketAvgReturn: number
): RotationSignal {
  const results = sectors.map(s => analyzeSectorMomentum(s, marketAvgReturn));

  const inflowSectors = results
    .filter(r => r.signal === '领涨' || r.signal === '轮动中')
    .map(r => r.sector);

  const outflowSectors = results
    .filter(r => r.signal === '退潮' || r.signal === '回避')
    .map(r => r.sector);

  const avgMomentum = results.reduce((sum, r) => sum + r.momentum, 0) / results.length;
  const growthSectors = results.filter(r => r.momentum > avgMomentum).length;
  const style: RotationSignal['style'] =
    growthSectors > results.length * 0.6 ? '成长' :
    growthSectors < results.length * 0.4 ? '价值' : '均衡';

  const rotationStrength = Math.abs(
    results.reduce((sum, r) => sum + r.compositeScore, 0) / results.length
  );

  return { inflowSectors, outflowSectors, style, rotationStrength };
}

export function rankSectors(
  sectors: SectorData[],
  marketAvgReturn: number
): MomentumResult[] {
  const results = sectors.map(s => analyzeSectorMomentum(s, marketAvgReturn));
  return results.sort((a, b) => b.compositeScore - a.compositeScore);
}
