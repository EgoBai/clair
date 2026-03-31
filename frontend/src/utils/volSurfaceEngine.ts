/**
 * 波动率曲面引擎 - IV曲面/波动率期限结构/偏度/微笑参数化
 */

export interface OptionIVData {
  strike: number;
  expiry: string; // days to expiry
  iv: number;
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
}

export interface VolSurfacePoint {
  strike: number;
  expiry: number;
  iv: number;
  moneyness: number; // K/S
  moneynessLabel: 'deep_itm' | 'itm' | 'atm' | 'otm' | 'deep_otm';
}

export interface VolSmileParams {
  atmVol: number;
  skew: number; // -1 to 1, negative = put skew
  curvature: number; // convexity of smile
  wingLeft: number; // left wing slope
  wingRight: number; // right wing slope
  rmse: number; // fit quality
}

export interface TermStructure {
  tenors: Array<{ days: number; iv: number }>;
  contango: boolean;
  steepness: number; // slope
  inversion: boolean; // short-term > long-term
  expectedVol: number; // weighted average
}

export interface SkewAnalysis {
  putCallSkew: number;
  riskReversal: number;
  butterflySpread: number;
  skewPercentile: number; // 0-100, historical percentile
  interpretation: string;
}

/**
 * 构建波动率曲面
 */
export function buildVolSurface(
  options: OptionIVData[],
  spotPrice: number,
): VolSurfacePoint[] {
  return options.map(opt => {
    const moneyness = opt.strike / spotPrice;
    let moneynessLabel: VolSurfacePoint['moneynessLabel'];

    if (moneyness < 0.9) moneynessLabel = 'deep_itm';
    else if (moneyness < 0.97) moneynessLabel = 'itm';
    else if (moneyness <= 1.03) moneynessLabel = 'atm';
    else if (moneyness <= 1.1) moneynessLabel = 'otm';
    else moneynessLabel = 'deep_otm';

    return {
      strike: opt.strike,
      expiry: parseFloat(opt.expiry),
      iv: opt.iv,
      moneyness: Math.round(moneyness * 1000) / 1000,
      moneynessLabel,
    };
  });
}

/**
 * 拟合波动率微笑 (SVI参数化简化版)
 */
export function fitVolSmile(
  points: VolSurfacePoint[],
  targetExpiry: number,
): VolSmileParams {
  const filtered = points.filter(p => Math.abs(p.expiry - targetExpiry) < targetExpiry * 0.1);

  if (filtered.length < 3) {
    return { atmVol: 0.2, skew: 0, curvature: 0, wingLeft: 0, wingRight: 0, rmse: 1 };
  }

  // ATM vol (closest to moneyness = 1)
  const atmPoints = filtered.filter(p => p.moneynessLabel === 'atm');
  const atmVol = atmPoints.length > 0
    ? atmPoints.reduce((s, p) => s + p.iv, 0) / atmPoints.length
    : filtered.reduce((s, p) => s + p.iv, 0) / filtered.length;

  // Skew: OTM put IV minus OTM call IV
  const otmPuts = filtered.filter(p => p.moneyness < 0.95);
  const otmCalls = filtered.filter(p => p.moneyness > 1.05);
  const putVol = otmPuts.length > 0 ? otmPuts.reduce((s, p) => s + p.iv, 0) / otmPuts.length : atmVol;
  const callVol = otmCalls.length > 0 ? otmCalls.reduce((s, p) => s + p.iv, 0) / otmCalls.length : atmVol;
  const skew = Math.round((putVol - callVol) * 1000) / 1000;

  // Curvature: second derivative approximation
  const sorted = [...filtered].sort((a, b) => a.moneyness - b.moneyness);
  let curvatureSum = 0;
  let curvatureCount = 0;
  for (let i = 1; i < sorted.length - 1; i++) {
    const d2 = sorted[i + 1].iv - 2 * sorted[i].iv + sorted[i - 1].iv;
    const dx2 = ((sorted[i + 1].moneyness - sorted[i - 1].moneyness) / 2) ** 2;
    if (dx2 > 0) {
      curvatureSum += d2 / dx2;
      curvatureCount++;
    }
  }
  const curvature = curvatureCount > 0 ? Math.round((curvatureSum / curvatureCount) * 10000) / 10000 : 0;

  // Wing slopes
  const leftWing = sorted.filter(p => p.moneyness < 0.95);
  const rightWing = sorted.filter(p => p.moneyness > 1.05);
  const wingLeft = leftWing.length >= 2
    ? Math.round(((leftWing[leftWing.length - 1].iv - leftWing[0].iv) / (leftWing[leftWing.length - 1].moneyness - leftWing[0].moneyness)) * 1000) / 1000
    : 0;
  const wingRight = rightWing.length >= 2
    ? Math.round(((rightWing[rightWing.length - 1].iv - rightWing[0].iv) / (rightWing[rightWing.length - 1].moneyness - rightWing[0].moneyness)) * 1000) / 1000
    : 0;

  // RMSE
  const errors = filtered.map(p => (p.iv - atmVol) ** 2);
  const rmse = Math.round(Math.sqrt(errors.reduce((a, b) => a + b, 0) / errors.length) * 10000) / 10000;

  return { atmVol: Math.round(atmVol * 10000) / 10000, skew, curvature, wingLeft, wingRight, rmse };
}

/**
 * 构建波动率期限结构
 */
export function buildTermStructure(
  points: VolSurfacePoint[],
  targetMoneyness: number = 1.0,
): TermStructure {
  // Group by expiry, average IV for each
  const byExpiry = new Map<number, number[]>();
  for (const p of points) {
    if (Math.abs(p.moneyness - targetMoneyness) < 0.05) {
      if (!byExpiry.has(p.expiry)) byExpiry.set(p.expiry, []);
      byExpiry.get(p.expiry)!.push(p.iv);
    }
  }

  const tenors = [...byExpiry.entries()]
    .map(([days, ivs]) => ({ days, iv: Math.round((ivs.reduce((a, b) => a + b, 0) / ivs.length) * 10000) / 10000 }))
    .sort((a, b) => a.days - b.days);

  if (tenors.length < 2) {
    return { tenors, contango: true, steepness: 0, inversion: false, expectedVol: tenors[0]?.iv || 0 };
  }

  const shortTerm = tenors[0].iv;
  const longTerm = tenors[tenors.length - 1].iv;
  const contango = longTerm > shortTerm;
  const inversion = shortTerm > longTerm;
  const steepness = Math.round(((longTerm - shortTerm) / shortTerm) * 10000) / 10000;

  // Weighted average (linear weights by days)
  const totalDays = tenors.reduce((s, t) => s + t.days, 0);
  const expectedVol = totalDays > 0
    ? Math.round((tenors.reduce((s, t) => s + t.iv * t.days, 0) / totalDays) * 10000) / 10000
    : shortTerm;

  return { tenors, contango, steepness, inversion, expectedVol };
}

/**
 * 偏度分析
 */
export function analyzeSkew(
  smileParams: VolSmileParams,
  historicalSkew: number[],
): SkewAnalysis {
  const putCallSkew = smileParams.skew;
  const riskReversal = Math.round(putCallSkew * 50 * 100) / 100; // scaled
  const butterflySpread = Math.round(smileParams.curvature * 100 * 100) / 100;

  // Historical percentile
  const below = historicalSkew.filter(s => s < putCallSkew).length;
  const skewPercentile = historicalSkew.length > 0
    ? Math.round((below / historicalSkew.length) * 100)
    : 50;

  let interpretation: string;
  if (skewPercentile > 80) interpretation = '偏度处于历史高位，市场对下行保护需求强烈';
  else if (skewPercentile > 60) interpretation = '偏度偏高，投资者偏向防御';
  else if (skewPercentile > 40) interpretation = '偏度处于正常区间';
  else if (skewPercentile > 20) interpretation = '偏低偏度，市场情绪偏乐观';
  else interpretation = '极低偏度，可能存在过度乐观';

  return { putCallSkew, riskReversal, butterflySpread, skewPercentile, interpretation };
}

/**
 * 插值波动率曲面上的点
 */
export function interpolateIV(
  surface: VolSurfacePoint[],
  targetStrike: number,
  targetExpiry: number,
): number {
  if (surface.length === 0) return 0.2;

  // Find 4 nearest points (bilinear interpolation)
  const sorted = [...surface].sort((a, b) => {
    const distA = Math.abs(a.strike - targetStrike) / targetStrike + Math.abs(a.expiry - targetExpiry) / Math.max(targetExpiry, 1);
    const distB = Math.abs(b.strike - targetStrike) / targetStrike + Math.abs(b.expiry - targetExpiry) / Math.max(targetExpiry, 1);
    return distA - distB;
  });

  const nearest = sorted.slice(0, Math.min(4, sorted.length));
  let weightSum = 0;
  let ivSum = 0;

  for (const p of nearest) {
    const dist = Math.sqrt(
      ((p.strike - targetStrike) / targetStrike) ** 2 +
      ((p.expiry - targetExpiry) / Math.max(targetExpiry, 1)) ** 2
    );
    const weight = dist > 0 ? 1 / dist : 1000;
    weightSum += weight;
    ivSum += p.iv * weight;
  }

  return Math.round((ivSum / weightSum) * 10000) / 10000;
}
