/**
 * 板块估值引擎V2
 * - 板块PE/PB/PS估值
 * - 历史分位数
 * - 板块间估值对比
 * - 估值吸引力评分
 * - 估值回归信号
 */
export interface SectorValuation {
  name: string;
  pe: number;
  pb: number;
  ps: number;
  dividendYield: number;
  roe: number;
  profitGrowth: number;
  pePercentile: number; // 历史分位 0-1
  pbPercentile: number;
  psPercentile: number;
  avgPE5y: number; // 5年平均PE
  minPE5y: number;
  maxPE5y: number;
}

export interface SectorValuationResult {
  sector: string;
  valuationScore: number; // 0-100
  attractiveness: 'very_attractive' | 'attractive' | 'fair' | 'expensive' | 'very_expensive';
  peDeviation: number; // PE偏离均值
  valuationGap: number; // 估值差距
  meanReversionSignal: 'buy' | 'neutral' | 'sell';
  crossSectorRank: number;
  riskAdjustedValue: number;
  insights: string[];
}

export function analyzeSectorValuations(sectors: SectorValuation[]): SectorValuationResult[] {
  if (sectors.length < 2) throw new Error('至少需要2个板块数据');

  const results: SectorValuationResult[] = sectors.map(sector => {
    const insights: string[] = [];

    // PE偏离均值
    const peDeviation = sector.avgPE5y !== 0 ? (sector.pe - sector.avgPE5y) / sector.avgPE5y : 0;

    // 估值差距 (当前PE - 历史中位数的位置)
    const valuationGap = sector.pePercentile - 0.5;

    // 均值回归信号
    let meanReversionSignal: SectorValuationResult['meanReversionSignal'];
    if (sector.pePercentile < 0.2 && sector.profitGrowth > 0) { meanReversionSignal = 'buy'; insights.push('估值处于历史低位且盈利增长'); }
    else if (sector.pePercentile > 0.8) { meanReversionSignal = 'sell'; insights.push('估值处于历史高位'); }
    else meanReversionSignal = 'neutral';

    // 估值评分
    let score = 50;
    // PE分位数越低越好
    score += (1 - sector.pePercentile) * 30;
    // PB分位数
    score += (1 - sector.pbPercentile) * 15;
    // 股息率加分
    score += Math.min(15, sector.dividendYield * 5);
    // ROE加分
    score += Math.min(10, sector.roe * 50);
    // 盈利增长加分
    score += Math.min(10, sector.profitGrowth * 30);
    score = Math.max(0, Math.min(100, Math.round(score)));

    // 吸引力判断
    let attractiveness: SectorValuationResult['attractiveness'];
    if (score >= 80) attractiveness = 'very_attractive';
    else if (score >= 65) attractiveness = 'attractive';
    else if (score >= 45) attractiveness = 'fair';
    else if (score >= 30) attractiveness = 'expensive';
    else attractiveness = 'very_expensive';

    // 风险调整后价值
    const riskAdjustedValue = sector.profitGrowth > 0
      ? score * (1 + sector.profitGrowth) / Math.max(sector.pePercentile, 0.1)
      : score;

    return {
      sector: sector.name,
      valuationScore: score,
      attractiveness,
      peDeviation: Math.round(peDeviation * 10000) / 10000,
      valuationGap: Math.round(valuationGap * 100) / 100,
      meanReversionSignal,
      crossSectorRank: 0,
      riskAdjustedValue: Math.round(riskAdjustedValue * 100) / 100,
      insights,
    };
  });

  // 跨板块排名
  results.sort((a, b) => b.valuationScore - a.valuationScore);
  results.forEach((r, i) => { r.crossSectorRank = i + 1; });

  return results;
}
