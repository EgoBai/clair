/**
 * ICAnalysisEngine - IC分析引擎
 * 因子IC序列分析、滚动IC、IC衰减
 */

export interface ICSeries {
  dates: string[];
  icValues: number[];
}

export interface ICAnalysis {
  meanIC: number;
  icStd: number;
  icIR: number;
  icSkewness: number;
  positiveRatio: number;
  maxConsecutiveNegative: number;
  rollingIC: number[];
  isEffective: boolean;
}

export function analyzeIC(series: ICSeries, window: number = 20): ICAnalysis | null {
  if (series.icValues.length < 5) return null;
  const ic = series.icValues;
  const n = ic.length;
  const mean = ic.reduce((s, v) => s + v, 0) / n;
  const std = Math.sqrt(ic.reduce((s, v) => s + (v - mean) ** 2, 0) / n);
  const ir = std > 0 ? mean / std : 0;
  const skew = n > 2 ? ic.reduce((s, v) => s + ((v - mean) / std) ** 3, 0) / n : 0;
  const pos = ic.filter(v => v > 0).length / n;

  let maxNeg = 0, curNeg = 0;
  for (const v of ic) {
    if (v < 0) { curNeg++; maxNeg = Math.max(maxNeg, curNeg); } else curNeg = 0;
  }

  const rolling: number[] = [];
  for (let i = window - 1; i < n; i++) {
    const w = ic.slice(i - window + 1, i + 1);
    const wm = w.reduce((s, v) => s + v, 0) / window;
    rolling.push(Math.round(wm * 10000) / 10000);
  }

  return { meanIC: Math.round(mean * 10000) / 10000, icStd: Math.round(std * 10000) / 10000, icIR: Math.round(ir * 100) / 100, icSkewness: Math.round(skew * 100) / 100, positiveRatio: Math.round(pos * 100) / 100, maxConsecutiveNegative: maxNeg, rollingIC: rolling, isEffective: Math.abs(mean) > 0.03 && Math.abs(ir) > 0.5 };
}
