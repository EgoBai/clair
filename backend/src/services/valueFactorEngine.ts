/**
 * ValueFactorEngine - 价值因子引擎
 * EP/BP/SP/CFOP等估值因子计算与合成
 */

export interface ValuationData {
  code: string; pe: number; pb: number; ps: number; pcf: number;
  roe: number; roa: number; grossMargin: number;
}

export function calcEP(pe: number): number { return pe > 0 ? 1 / pe : 0; }
export function calcBP(pb: number): number { return pb > 0 ? 1 / pb : 0; }
export function calcSP(ps: number): number { return ps > 0 ? 1 / ps : 0; }
export function calcCFOP(pcf: number): number { return pcf > 0 ? 1 / pcf : 0; }

export function compositeValueScore(d: ValuationData): number {
  const ep = calcEP(d.pe);
  const bp = calcBP(d.pb);
  const sp = calcSP(d.ps);
  const cfop = calcCFOP(d.pcf);
  return ep * 0.3 + bp * 0.25 + sp * 0.2 + cfop * 0.25;
}

export function valueWithQuality(d: ValuationData): number {
  const value = compositeValueScore(d);
  const quality = (d.roe + d.roa + d.grossMargin) / 3;
  return value * (1 + quality);
}

export function rankValueFactors(data: ValuationData[]): Map<string, number> {
  const scores = data.map(d => ({ code: d.code, score: compositeValueScore(d) }));
  scores.sort((a, b) => b.score - a.score);
  const result = new Map<string, number>();
  scores.forEach((s, i) => result.set(s.code, i + 1));
  return result;
}
