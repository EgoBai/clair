/**
 * 波动率曲面引擎 - 隐含波动率/波动率微笑/期限结构/GARCH预测
 */

export interface VolatilityPoint {
  strike: number;
  expiry: string; // YYYY-MM-DD
  impliedVol: number;
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
}

export interface VolSurface {
  ticker: string;
  spot: number;
  riskFreeRate: number;
  points: VolatilityPoint[];
}

export interface VolSmile {
  expiry: string;
  strikes: number[];
  impliedVols: number[];
  atmVol: number;
  skew: number; // 偏度
  kurtosis: number; // 峰度
  putCallParity: number; // 看跌看涨平价偏差
}

export interface VolTermStructure {
  expiries: string[];
  atmVols: number[];
  contango: boolean; // 是否正向
  slope: number; // 斜率
  curvature: number; // 曲率
}

export interface GARCHForecast {
  currentVol: number;
  forecast1d: number;
  forecast5d: number;
  forecast20d: number;
  longRunVol: number;
  halfLife: number; // 波动率均值回归半衰期
  persistence: number; // 波动率持续性
  meanReversion: number; // 均值回归速度
}

export interface VolRegime {
  regime: 'low' | 'normal' | 'elevated' | 'high' | 'extreme';
  currentVol: number;
  percentile: number;
  trend: 'rising' | 'falling' | 'stable';
  expectedChange: number;
  tradingImplication: string;
}

/**
 * 构建波动率微笑
 */
export function buildVolSmile(surface: VolSurface, expiry: string): VolSmile {
  const filtered = surface.points.filter(p => p.expiry === expiry);
  if (filtered.length === 0) {
    return { expiry, strikes: [], impliedVols: [], atmVol: 0, skew: 0, kurtosis: 0, putCallParity: 0 };
  }

  const sorted = [...filtered].sort((a, b) => a.strike - b.strike);
  const strikes = sorted.map(p => p.strike);
  const impliedVols = sorted.map(p => p.impliedVol);

  // ATM波动率 (最接近现货价的)
  const atmIdx = strikes.reduce((best, s, i) =>
    Math.abs(s - surface.spot) < Math.abs(strikes[best] - surface.spot) ? i : best, 0);
  const atmVol = impliedVols[atmIdx];

  // 偏度 (25delta put - 25delta call)
  const put25 = filtered.find(p => p.delta > -0.3 && p.delta < -0.2);
  const call25 = filtered.find(p => p.delta > 0.2 && p.delta < 0.3);
  const skew = put25 && call25 ? put25.impliedVol - call25.impliedVol : 0;

  // 峰度 (翅膀 - ATM)
  const wingVol = (impliedVols[0] + impliedVols[impliedVols.length - 1]) / 2;
  const kurtosis = wingVol - atmVol;

  // 看跌看涨平价偏差
  const putCallParity = filtered.length >= 2 ? Math.abs(impliedVols[0] - impliedVols[impliedVols.length - 1]) : 0;

  return {
    expiry,
    strikes,
    impliedVols: impliedVols.map(v => Math.round(v * 10000) / 10000),
    atmVol: Math.round(atmVol * 10000) / 10000,
    skew: Math.round(skew * 10000) / 10000,
    kurtosis: Math.round(kurtosis * 10000) / 10000,
    putCallParity: Math.round(putCallParity * 10000) / 10000,
  };
}

/**
 * 构建波动率期限结构
 */
export function buildVolTermStructure(surface: VolSurface): VolTermStructure {
  const expiryMap = new Map<string, VolatilityPoint[]>();
  surface.points.forEach(p => {
    const existing = expiryMap.get(p.expiry) || [];
    existing.push(p);
    expiryMap.set(p.expiry, existing);
  });

  const expiries = Array.from(expiryMap.keys()).sort();
  const atmVols = expiries.map(exp => {
    const points = expiryMap.get(exp)!;
    const atm = points.reduce((best, p) =>
      Math.abs(p.strike - surface.spot) < Math.abs(best.strike - surface.spot) ? p : best);
    return atm.impliedVol;
  });

  // 正向/反向
  const contango = atmVols.length >= 2 && atmVols[atmVols.length - 1] > atmVols[0];

  // 斜率
  const slope = atmVols.length >= 2
    ? (atmVols[atmVols.length - 1] - atmVols[0]) / (atmVols.length - 1) : 0;

  // 曲率
  const curvature = atmVols.length >= 3
    ? atmVols[atmVols.length - 1] - 2 * atmVols[Math.floor(atmVols.length / 2)] + atmVols[0] : 0;

  return {
    expiries,
    atmVols: atmVols.map(v => Math.round(v * 10000) / 10000),
    contango,
    slope: Math.round(slope * 10000) / 10000,
    curvature: Math.round(curvature * 10000) / 10000,
  };
}

/**
 * GARCH(1,1) 波动率预测
 */
export function garchForecast(
  returns: number[],
  omega: number = 0.00001,
  alpha: number = 0.1,
  beta: number = 0.85,
): GARCHForecast {
  if (returns.length < 20) {
    return {
      currentVol: 0, forecast1d: 0, forecast5d: 0, forecast20d: 0,
      longRunVol: 0, halfLife: 0, persistence: beta, meanReversion: 1 - beta,
    };
  }

  // 估计GARCH参数 (简化: 使用固定参数)
  const persistence = alpha + beta;
  const longRunVar = omega / (1 - persistence);
  const longRunVol = Math.sqrt(longRunVar) * Math.sqrt(252); // 年化

  // 递推条件方差
  let variance = returns.reduce((s, r) => s + r * r, 0) / returns.length;
  for (let i = returns.length - 1; i >= Math.max(0, returns.length - 30); i--) {
    variance = omega + alpha * returns[i] * returns[i] + beta * variance;
  }

  const currentVol = Math.sqrt(variance) * Math.sqrt(252);

  // 预测
  const forecast1d = Math.sqrt(omega + persistence * variance) * Math.sqrt(252);
  let futureVar = variance;
  for (let i = 0; i < 5; i++) {
    futureVar = omega + persistence * futureVar;
  }
  const forecast5d = Math.sqrt(futureVar) * Math.sqrt(252);

  for (let i = 0; i < 20; i++) {
    futureVar = omega + persistence * futureVar;
  }
  const forecast20d = Math.sqrt(futureVar) * Math.sqrt(252);

  // 均值回归半衰期
  const halfLife = persistence < 1 ? Math.round(-Math.log(2) / Math.log(persistence)) : 999;
  const meanReversion = 1 - persistence;

  return {
    currentVol: Math.round(currentVol * 10000) / 10000,
    forecast1d: Math.round(forecast1d * 10000) / 10000,
    forecast5d: Math.round(forecast5d * 10000) / 10000,
    forecast20d: Math.round(forecast20d * 10000) / 10000,
    longRunVol: Math.round(longRunVol * 10000) / 10000,
    halfLife,
    persistence: Math.round(persistence * 10000) / 10000,
    meanReversion: Math.round(meanReversion * 10000) / 10000,
  };
}

/**
 * 波动率状态判断
 */
export function detectVolRegime(
  historicalVols: number[],
  currentVol: number,
): VolRegime {
  if (historicalVols.length < 10) {
    return {
      regime: 'normal', currentVol, percentile: 50, trend: 'stable',
      expectedChange: 0, tradingImplication: '数据不足',
    };
  }

  const sorted = [...historicalVols].sort((a, b) => a - b);
  const percentile = (sorted.filter(v => v <= currentVol).length / sorted.length) * 100;

  let regime: VolRegime['regime'];
  if (percentile > 95) regime = 'extreme';
  else if (percentile > 80) regime = 'high';
  else if (percentile > 60) regime = 'elevated';
  else if (percentile > 20) regime = 'normal';
  else regime = 'low';

  const recent5 = historicalVols.slice(-5);
  const earlier5 = historicalVols.slice(-10, -5);
  const recentAvg = recent5.reduce((a, b) => a + b, 0) / recent5.length;
  const earlierAvg = earlier5.reduce((a, b) => a + b, 0) / earlier5.length;

  let trend: VolRegime['trend'];
  if (recentAvg > earlierAvg * 1.1) trend = 'rising';
  else if (recentAvg < earlierAvg * 0.9) trend = 'falling';
  else trend = 'stable';

  const meanVol = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  const expectedChange = (meanVol - currentVol) * 0.5;

  let tradingImplication = '';
  if (regime === 'extreme' && trend === 'rising') tradingImplication = '波动率极端偏高且上升，考虑做空波动率';
  else if (regime === 'low' && trend === 'stable') tradingImplication = '波动率低位平稳，可做多波动率';
  else if (regime === 'high' && trend === 'falling') tradingImplication = '波动率高位回落，注意反转';
  else tradingImplication = `波动率处于${regime}水平，趋势${trend}`;

  return {
    regime,
    currentVol: Math.round(currentVol * 10000) / 10000,
    percentile: Math.round(percentile),
    trend,
    expectedChange: Math.round(expectedChange * 10000) / 10000,
    tradingImplication,
  };
}
