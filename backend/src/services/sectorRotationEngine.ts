/**
 * 行业轮动引擎 - Round 728
 * 基于经济周期和动量的行业轮动策略
 */
export interface SectorData {
  name: string;
  returns: number[];
  marketCap: number;
  pe: number;
  pb: number;
  dividendYield: number;
  revenueGrowth: number;
  profitGrowth: number;
}

export interface EconomicCycle {
  phase: 'expansion' | 'peak' | 'contraction' | 'trough';
  confidence: number;
  leadingIndicators: number;
  coincidentIndicators: number;
  laggingIndicators: number;
}

export interface RotationSignal {
  sector: string;
  action: 'overweight' | 'neutral' | 'underweight';
  score: number;
  reasons: string[];
  economicPhaseAlignment: number;
  momentumScore: number;
  valuationScore: number;
}

export interface RotationPortfolio {
  signals: RotationSignal[];
  expectedReturn: number;
  riskScore: number;
  turnover: number;
}

function calculateMomentum(returns: number[], period: number = 20): number {
  if (returns.length < period) return 0;
  const recent = returns.slice(-period);
  const cumulative = recent.reduce((prod, r) => prod * (1 + r), 1) - 1;
  const vol = Math.sqrt(recent.reduce((s, r) => {
    const m = recent.reduce((a, b) => a + b, 0) / recent.length;
    return s + (r - m) ** 2;
  }, 0) / (recent.length - 1));
  return vol > 0 ? cumulative / vol : 0;
}

export function analyzeSectorRotation(
  sectors: SectorData[],
  cycle: EconomicCycle
): RotationPortfolio {
  const signals: RotationSignal[] = sectors.map(sector => {
    const reasons: string[] = [];

    // Momentum score
    const momentumScore = calculateMomentum(sector.returns, 20);
    if (momentumScore > 0.5) reasons.push('动量强势');
    else if (momentumScore < -0.5) reasons.push('动量弱势');

    // Valuation score
    const valuationScore = (sector.pb > 0 ? 1 / sector.pb : 0) * 0.4 +
      (sector.pe > 0 ? 1 / sector.pe : 0) * 0.3 +
      sector.dividendYield * 0.3;

    // Economic phase alignment
    let phaseAlignment = 0;
    switch (cycle.phase) {
      case 'expansion':
        if (sector.revenueGrowth > 0.15 && sector.profitGrowth > 0.2) {
          phaseAlignment = 0.8;
          reasons.push('扩张期高增长');
        }
        break;
      case 'peak':
        if (sector.dividendYield > 0.03) {
          phaseAlignment = 0.6;
          reasons.push('高峰期高分红');
        }
        break;
      case 'contraction':
        if (sector.pb < 1.5 && sector.dividendYield > 0.04) {
          phaseAlignment = 0.7;
          reasons.push('收缩期防御性');
        }
        break;
      case 'trough':
        if (sector.revenueGrowth > 0) {
          phaseAlignment = 0.9;
          reasons.push('底部反转迹象');
        }
        break;
    }

    // Combined score
    const score = momentumScore * 0.35 + valuationScore * 0.25 + phaseAlignment * 0.4;

    let action: 'overweight' | 'neutral' | 'underweight';
    if (score > 0.3) action = 'overweight';
    else if (score < -0.3) action = 'underweight';
    else action = 'neutral';

    return {
      sector: sector.name,
      action,
      score,
      reasons,
      economicPhaseAlignment: phaseAlignment,
      momentumScore,
      valuationScore,
    };
  });

  // Sort by score descending
  signals.sort((a, b) => b.score - a.score);

  const expectedReturn = signals.reduce((s, sig) => s + sig.score, 0) / signals.length;
  const riskScore = signals.reduce((s, sig) => s + Math.abs(sig.score - expectedReturn), 0) / signals.length;
  const turnover = signals.filter(s => s.action !== 'neutral').length / signals.length;

  return { signals, expectedReturn, riskScore, turnover };
}

export function identifyRotationPatterns(
  sectorHistory: { date: Date; sector: string; return: number }[]
): { pattern: string; sectors: string[]; strength: number }[] {
  if (sectorHistory.length < 10) return [];

  const patterns: { pattern: string; sectors: string[]; strength: number }[] = [];

  // Group by sector
  const bySector = new Map<string, number[]>();
  for (const h of sectorHistory) {
    if (!bySector.has(h.sector)) bySector.set(h.sector, []);
    bySector.get(h.sector)!.push(h.return);
  }

  // Detect rotation (leaders becoming laggards and vice versa)
  const sectorMomentum = new Map<string, number>();
  for (const [sector, returns] of bySector) {
    if (returns.length >= 10) {
      const firstHalf = returns.slice(0, Math.floor(returns.length / 2));
      const secondHalf = returns.slice(Math.floor(returns.length / 2));
      const firstAvg = firstHalf.reduce((s, r) => s + r, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((s, r) => s + r, 0) / secondHalf.length;
      sectorMomentum.set(sector, secondAvg - firstAvg);
    }
  }

  // Find sectors reversing
  const sorted = Array.from(sectorMomentum.entries()).sort((a, b) => b[1] - a[1]);
  if (sorted.length >= 2) {
    const improving = sorted.filter(([_, m]) => m > 0).map(([s]) => s);
    const declining = sorted.filter(([_, m]) => m < 0).map(([s]) => s);
    if (improving.length > 0 && declining.length > 0) {
      patterns.push({
        pattern: 'sector_rotation',
        sectors: [...improving.slice(0, 3), ...declining.slice(0, 3)],
        strength: Math.abs(sorted[0][1] - sorted[sorted.length - 1][1]),
      });
    }
  }

  return patterns;
}

export function calculateSectorCorrelation(sectors: SectorData[]): number[][] {
  const n = sectors.length;
  const corr: number[][] = [];
  for (let i = 0; i < n; i++) {
    corr[i] = [];
    for (let j = 0; j < n; j++) {
      const a = sectors[i].returns;
      const b = sectors[j].returns;
      const len = Math.min(a.length, b.length);
      if (len < 2) { corr[i][j] = i === j ? 1 : 0; continue; }
      const meanA = a.slice(0, len).reduce((s, r) => s + r, 0) / len;
      const meanB = b.slice(0, len).reduce((s, r) => s + r, 0) / len;
      let cov = 0, varA = 0, varB = 0;
      for (let k = 0; k < len; k++) {
        cov += (a[k] - meanA) * (b[k] - meanB);
        varA += (a[k] - meanA) ** 2;
        varB += (b[k] - meanB) ** 2;
      }
      corr[i][j] = (varA > 0 && varB > 0) ? cov / Math.sqrt(varA * varB) : (i === j ? 1 : 0);
    }
  }
  return corr;
}
