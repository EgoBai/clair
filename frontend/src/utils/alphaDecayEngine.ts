/**
 * Alpha衰减分析引擎
 * - Alpha时间序列分析
 * - 衰减率计算
 * - 半衰期估计
 * - Alpha持续性检验
 * - 信号质量评估
 */
export interface AlphaData {
  date: string;
  alpha: number; // 当日超额收益
  signalValue: number; // 信号值
  turnover: number; // 换手率
}

export interface AlphaDecayResult {
  avgAlpha: number; // 平均alpha(日)
  annualizedAlpha: number; // 年化alpha
  alphaVolatility: number; // alpha波动率
  informationRatio: number; // 信息比率
  halfLife: number; // 半衰期(天)
  decayRate: number; // 衰减率
  persistence: number; // 持续性(自相关)
  sharpeFromAlpha: number; // alpha的Sharpe
  alphaQuality: 'excellent' | 'good' | 'degrading' | 'dead';
  signalDecay: number; // 信号衰减
  turnoverAlphaRatio: number; // alpha/换手率
  tStat: number; // t统计量
  isSignificant: boolean; // 是否统计显著
}

export function analyzeAlphaDecay(data: AlphaData[]): AlphaDecayResult {
  if (data.length < 30) throw new Error('至少需要30个数据点');

  const alphas = data.map(d => d.alpha);
  const signals = data.map(d => d.signalValue);
  const turnovers = data.map(d => d.turnover);

  // 平均alpha
  const avgAlpha = alphas.reduce((s, a) => s + a, 0) / alphas.length;
  const annualizedAlpha = avgAlpha * 252;

  // Alpha波动率
  const alphaVolatility = Math.sqrt(alphas.reduce((s, a) => s + (a - avgAlpha) ** 2, 0) / alphas.length) * Math.sqrt(252);

  // 信息比率
  const informationRatio = alphaVolatility > 0 ? annualizedAlpha / alphaVolatility : 0;

  // 自相关(持续性)
  let persistence = 0;
  const n = alphas.length;
  for (let lag = 1; lag <= Math.min(5, n - 1); lag++) {
    let numerator = 0, denom1 = 0, denom2 = 0;
    for (let i = lag; i < n; i++) {
      numerator += (alphas[i] - avgAlpha) * (alphas[i - lag] - avgAlpha);
      denom1 += (alphas[i] - avgAlpha) ** 2;
      denom2 += (alphas[i - lag] - avgAlpha) ** 2;
    }
    const ac = denom1 > 0 && denom2 > 0 ? numerator / Math.sqrt(denom1 * denom2) : 0;
    persistence += ac / 5; // 平均前5阶自相关
  }

  // 半衰期
  const halfLife = persistence > 0 ? Math.round(-Math.log(2) / Math.log(Math.abs(persistence))) : 0;
  const decayRate = 1 - persistence;

  // 信号衰减
  let signalDecay = 0;
  if (signals.length >= 10) {
    const firstHalf = signals.slice(0, Math.floor(signals.length / 2));
    const secondHalf = signals.slice(Math.floor(signals.length / 2));
    const avgFirst = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;
    signalDecay = avgFirst !== 0 ? (avgSecond - avgFirst) / Math.abs(avgFirst) : 0;
  }

  // Alpha质量
  let alphaQuality: AlphaDecayResult['alphaQuality'];
  if (informationRatio > 1 && persistence > 0.1) alphaQuality = 'excellent';
  else if (informationRatio > 0.5) alphaQuality = 'good';
  else if (informationRatio > 0.2) alphaQuality = 'degrading';
  else alphaQuality = 'dead';

  // 换手alpha比
  const avgTurnover = turnovers.reduce((s, t) => s + t, 0) / turnovers.length;
  const turnoverAlphaRatio = avgTurnover > 0 ? avgAlpha / avgTurnover : 0;

  // t统计量
  const alphaStd = Math.sqrt(alphas.reduce((s, a) => s + (a - avgAlpha) ** 2, 0) / (n - 1));
  const tStat = alphaStd > 0 ? avgAlpha / (alphaStd / Math.sqrt(n)) : 0;
  const isSignificant = Math.abs(tStat) > 1.96;

  // Sharpe from Alpha
  const sharpeFromAlpha = alphaVolatility > 0 ? annualizedAlpha / alphaVolatility : 0;

  return {
    avgAlpha: Math.round(avgAlpha * 10000) / 10000,
    annualizedAlpha: Math.round(annualizedAlpha * 10000) / 10000,
    alphaVolatility: Math.round(alphaVolatility * 10000) / 10000,
    informationRatio: Math.round(informationRatio * 100) / 100,
    halfLife: Math.max(0, halfLife),
    decayRate: Math.round(decayRate * 1000) / 1000,
    persistence: Math.round(persistence * 1000) / 1000,
    sharpeFromAlpha: Math.round(sharpeFromAlpha * 100) / 100,
    alphaQuality,
    signalDecay: Math.round(signalDecay * 10000) / 10000,
    turnoverAlphaRatio: Math.round(turnoverAlphaRatio * 10000) / 10000,
    tStat: Math.round(tStat * 100) / 100,
    isSignificant,
  };
}
