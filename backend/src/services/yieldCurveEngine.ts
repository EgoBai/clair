/**
 * YieldCurveEngine - 收益率曲线引擎
 * 构建和分析债券收益率曲线形态
 */

export interface YieldPoint {
  maturity: number;    // 年
  yield: number;       // 百分比
}

export interface YieldCurveAnalysis {
  shape: 'normal' | 'inverted' | 'flat' | 'humped';
  slope: number;
  curvature: number;
  butterfly: number;     // 蝶式利差
  shortRate: number;
  longRate: number;
  spread10Y2Y: number;
  recessionSignal: boolean;
}

export function analyzeYieldCurve(points: YieldPoint[]): YieldCurveAnalysis | null {
  if (points.length < 3) return null;
  const sorted = [...points].sort((a, b) => a.maturity - b.maturity);
  const ys = sorted.map(p => p.yield);
  const n = ys.length;

  const slope = (ys[n - 1] - ys[0]) / (sorted[n - 1].maturity - sorted[0].maturity);
  const mid = Math.floor(n / 2);
  const curvature = (ys[n - 1] + ys[0]) / 2 - ys[mid];

  const short2y = sorted.find(p => p.maturity >= 2);
  const long10y = sorted.find(p => p.maturity >= 10);
  const spread10Y2Y = short2y && long10y ? long10y.yield - short2y.yield : 0;

  const p25 = sorted.find(p => p.maturity >= 0.25);
  const p75 = sorted.find(p => p.maturity >= 0.75);
  const butterfly = p25 && p75 ? (p25.yield + ys[n - 1]) / 2 - p75.yield : 0;

  let shape: YieldCurveAnalysis['shape'];
  if (slope < -0.1) shape = 'inverted';
  else if (slope > 0.3) shape = 'normal';
  else if (Math.abs(curvature) > 0.3) shape = 'humped';
  else shape = 'flat';

  return {
    shape, slope: Math.round(slope * 1000) / 1000,
    curvature: Math.round(curvature * 1000) / 1000,
    butterfly: Math.round(butterfly * 1000) / 1000,
    shortRate: ys[0], longRate: ys[n - 1],
    spread10Y2Y: Math.round(spread10Y2Y * 1000) / 1000,
    recessionSignal: spread10Y2Y < 0,
  };
}
