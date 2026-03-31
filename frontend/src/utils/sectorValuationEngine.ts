/**
 * 板块估值分位引擎
 * 行业/板块估值历史分位数分析
 */

export interface SectorValuation {
  name: string;
  currentPE: number;
  currentPB: number;
  currentDividendYield: number;
  historicalPE: number[];
  historicalPB: number[];
}

export interface ValuationPercentile {
  sector: string;
  pePercentile: number;
  pbPercentile: number;
  yieldPercentile: number;
  compositePercentile: number;
  valuationLevel: 'extreme_low' | 'low' | 'fair' | 'high' | 'extreme_high';
  recommendation: string;
}

/**
 * 计算百分位数
 */
function percentile(sorted: number[], value: number): number {
  if (sorted.length === 0) return 50;
  let count = 0;
  for (const v of sorted) {
    if (v <= value) count++;
    else break;
  }
  return (count / sorted.length) * 100;
}

/**
 * 估值分位数分析
 */
export function valuationPercentileAnalysis(sector: SectorValuation): ValuationPercentile {
  const peHist = [...sector.historicalPE].sort((a, b) => a - b);
  const pbHist = [...sector.historicalPB].sort((a, b) => a - b);

  const pePercentile = percentile(peHist, sector.currentPE);
  const pbPercentile = percentile(pbHist, sector.currentPB);

  // 股息率分位 (越高越好,所以反向)
  const yieldSorted = Array.from({ length: 100 }, (_, i) => i * 0.005).sort((a, b) => a - b);
  const yieldPercentile = 100 - percentile(yieldSorted, sector.currentDividendYield);

  const compositePercentile = Math.round((pePercentile * 0.4 + pbPercentile * 0.4 + yieldPercentile * 0.2) * 10) / 10;

  let valuationLevel: ValuationPercentile['valuationLevel'];
  let recommendation: string;

  if (compositePercentile < 10) {
    valuationLevel = 'extreme_low';
    recommendation = '极度低估，强烈建议配置';
  } else if (compositePercentile < 30) {
    valuationLevel = 'low';
    recommendation = '估值偏低，建议关注';
  } else if (compositePercentile < 70) {
    valuationLevel = 'fair';
    recommendation = '估值合理，维持中性配置';
  } else if (compositePercentile < 90) {
    valuationLevel = 'high';
    recommendation = '估值偏高，建议减仓';
  } else {
    valuationLevel = 'extreme_high';
    recommendation = '极度高估，建议规避';
  }

  return {
    sector: sector.name,
    pePercentile: Math.round(pePercentile * 10) / 10,
    pbPercentile: Math.round(pbPercentile * 10) / 10,
    yieldPercentile: Math.round(yieldPercentile * 10) / 10,
    compositePercentile,
    valuationLevel,
    recommendation,
  };
}

/**
 * 多板块估值排名
 */
export function sectorValuationRanking(sectors: SectorValuation[]): ValuationPercentile[] {
  return sectors
    .map(s => valuationPercentileAnalysis(s))
    .sort((a, b) => a.compositePercentile - b.compositePercentile);
}
