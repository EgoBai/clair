/**
 * Sector Rotation V2 Engine
 *
 * Enhanced sector rotation with economic cycle detection,
 * relative strength analysis, and momentum scoring.
 */

export interface SectorData {
  name: string;
  returns: number[];
  pe: number;
  dividendYield: number;
  momentum1M: number;
  momentum3M: number;
  momentum6M: number;
  volatility: number;
}

export type EconomicCycle = 'early' | 'mid' | 'late' | 'recession';

export interface RotationSignal {
  sector: string;
  signal: 'overweight' | 'neutral' | 'underweight';
  score: number;
  rank: number;
  reasons: string[];
  cycleFit: number; // how well it fits current cycle
}

export interface SectorRotationReport {
  cycle: EconomicCycle;
  signals: RotationSignal[];
  leaders: string[];
  laggards: string[];
  momentum: { sector: string; rank: number; score: number }[];
  recommendation: string;
}

// Optimal sectors per cycle
const cycleSectors: Record<EconomicCycle, { overweight: string[]; underweight: string[] }> = {
  early: { overweight: ['consumer_discretionary', 'financials', 'technology'], underweight: ['utilities', 'staples', 'healthcare'] },
  mid: { overweight: ['technology', 'industrials', 'materials'], underweight: ['utilities', 'telecom'] },
  late: { overweight: ['energy', 'materials', 'healthcare'], underweight: ['consumer_discretionary', 'technology'] },
  recession: { overweight: ['utilities', 'staples', 'healthcare'], underweight: ['financials', 'materials', 'consumer_discretionary'] },
};

function mean(arr: number[]): number {
  return arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length;
}

/**
 * Detect economic cycle from sector performance
 */
export function detectEconomicCycle(sectors: SectorData[]): EconomicCycle {
  const sectorReturns = sectors.map(s => ({
    name: s.name,
    return3m: s.momentum3M,
    return6m: s.momentum6M,
    vol: s.volatility,
  }));

  const avgReturn3m = mean(sectorReturns.map(s => s.return3m));
  const avgReturn6m = mean(sectorReturns.map(s => s.return6m));
  const avgVol = mean(sectorReturns.map(s => s.vol));

  // Simple heuristic
  if (avgReturn3m > 0.05 && avgReturn6m > 0.1) return 'mid';
  if (avgReturn3m > 0.02 && avgReturn6m > 0.05) return 'early';
  if (avgReturn3m < -0.05) return 'recession';
  if (avgVol > 0.25) return 'late';
  return 'mid';
}

/**
 * Calculate relative strength for each sector
 */
export function calculateRelativeStrength(sectors: SectorData[]): { sector: string; rs: number }[] {
  const marketReturn = mean(sectors.map(s => s.momentum3M));

  return sectors.map(s => ({
    sector: s.name,
    rs: marketReturn === 0 ? 0 : s.momentum3M / marketReturn,
  })).sort((a, b) => b.rs - a.rs);
}

/**
 * Generate sector rotation signals
 */
export function generateRotationSignals(sectors: SectorData[], cycle?: EconomicCycle): SectorRotationReport {
  const detectedCycle = cycle || detectEconomicCycle(sectors);
  const cyclePrefs = cycleSectors[detectedCycle];

  const signals: RotationSignal[] = sectors.map(s => {
    let score = 0;
    const reasons: string[] = [];

    // Momentum scoring
    if (s.momentum1M > 0.03) { score += 20; reasons.push('1月动量强劲'); }
    if (s.momentum3M > 0.08) { score += 25; reasons.push('3月动量强劲'); }
    if (s.momentum3M < -0.05) { score -= 20; reasons.push('3月动量疲弱'); }

    // Cycle fit
    let cycleFit = 0;
    if (cyclePrefs.overweight.includes(s.name)) {
      cycleFit = 1;
      score += 30;
      reasons.push('经济周期匹配');
    } else if (cyclePrefs.underweight.includes(s.name)) {
      cycleFit = -1;
      score -= 20;
      reasons.push('经济周期不匹配');
    }

    // Valuation
    if (s.pe > 0 && s.pe < 15) { score += 10; reasons.push('估值偏低'); }
    if (s.pe > 30) { score -= 10; reasons.push('估值偏高'); }

    // Dividend yield
    if (s.dividendYield > 0.03) { score += 5; reasons.push('高股息'); }

    // Low vol bonus in recession
    if (detectedCycle === 'recession' && s.volatility < 0.15) {
      score += 10;
      reasons.push('低波动防守');
    }

    let signal: RotationSignal['signal'];
    if (score >= 30) signal = 'overweight';
    else if (score <= -15) signal = 'underweight';
    else signal = 'neutral';

    return { sector: s.name, signal, score, rank: 0, reasons, cycleFit };
  });

  // Rank
  signals.sort((a, b) => b.score - a.score);
  signals.forEach((s, i) => s.rank = i + 1);

  const leaders = signals.filter(s => s.signal === 'overweight').map(s => s.sector);
  const laggards = signals.filter(s => s.signal === 'underweight').map(s => s.sector);

  const momentum = sectors.map(s => ({
    sector: s.name,
    rank: 0,
    score: s.momentum1M * 30 + s.momentum3M * 50 + s.momentum6M * 20,
  })).sort((a, b) => b.score - a.score);
  momentum.forEach((m, i) => m.rank = i + 1);

  let recommendation = '';
  if (detectedCycle === 'early') recommendation = '经济复苏初期，增配周期和可选消费';
  else if (detectedCycle === 'mid') recommendation = '经济扩张中期，增配科技和工业';
  else if (detectedCycle === 'late') recommendation = '经济过热后期，增配能源和材料';
  else recommendation = '衰退期，增配防御板块(公用事业/必需消费/医疗)';

  return { cycle: detectedCycle, signals, leaders, laggards, momentum, recommendation };
}

/**
 * Calculate sector momentum score
 */
export function sectorMomentumScore(sector: SectorData): number {
  return sector.momentum1M * 0.3 + sector.momentum3M * 0.5 + sector.momentum6M * 0.2;
}
