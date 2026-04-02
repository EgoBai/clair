/**
 * FactorRankingEngine - 因子排序引擎
 * 截面因子排序、分组和收益分析
 */

export interface FactorData {
  stockId: string;
  factorValue: number;
  forwardReturn: number;
}

export interface RankingResult {
  groups: { group: number; avgReturn: number; count: number }[];
  longShortReturn: number;
  monotonicity: boolean;
  topGroup: number;
  bottomGroup: number;
  ic: number;
}

export function rankAndGroup(data: FactorData[], numGroups: number = 5): RankingResult | null {
  if (data.length < numGroups) return null;
  const sorted = [...data].sort((a, b) => b.factorValue - a.factorValue);
  const groupSize = Math.ceil(sorted.length / numGroups);
  const groups: RankingResult['groups'] = [];

  for (let g = 0; g < numGroups; g++) {
    const members = sorted.slice(g * groupSize, (g + 1) * groupSize);
    const avgReturn = members.reduce((s, m) => s + m.forwardReturn, 0) / members.length;
    groups.push({ group: g + 1, avgReturn: Math.round(avgReturn * 10000) / 10000, count: members.length });
  }

  const avgRet = groups.map(g => g.avgReturn);
  const longShortReturn = avgRet[0] - avgRet[avgRet.length - 1];
  const monotonic = avgRet.every((v, i) => i === 0 || v <= avgRet[i - 1] + 0.0001);

  const n = sorted.length;
  const meanF = sorted.reduce((s, d) => s + d.factorValue, 0) / n;
  const meanR = sorted.reduce((s, d) => s + d.forwardReturn, 0) / n;
  let num = 0, df = 0, dr = 0;
  for (const d of sorted) {
    num += (d.factorValue - meanF) * (d.forwardReturn - meanR);
    df += (d.factorValue - meanF) ** 2;
    dr += (d.forwardReturn - meanR) ** 2;
  }
  const ic = Math.sqrt(df * dr) > 0 ? num / Math.sqrt(df * dr) : 0;

  return { groups, longShortReturn: Math.round(longShortReturn * 10000) / 10000, monotonicity: monotonic, topGroup: 1, bottomGroup: numGroups, ic: Math.round(ic * 10000) / 10000 };
}
