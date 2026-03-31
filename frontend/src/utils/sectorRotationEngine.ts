/**
 * Sector Rotation Detection Engine
 *
 * 板块轮动检测、动量排名、资金流向追踪
 */

export interface SectorSnapshot {
  sector: string;
  timestamp: number;
  change: number;
  volume: number;
  turnover: number;
  upCount: number;
  downCount: number;
  leadingStocks: Array<{ symbol: string; change: number }>;
}

export interface RotationSignal {
  fromSector: string;
  toSector: string;
  strength: number; // 0-1
  phase: 'early' | 'middle' | 'late';
  duration: number; // days
  confidence: number;
}

export interface SectorMomentum {
  sector: string;
  momentum1D: number;
  momentum5D: number;
  momentum20D: number;
  compositeMomentum: number;
  rank: number;
  trend: 'up' | 'down' | 'sideways';
}

/**
 * 计算板块动量
 */
export function calculateSectorMomentum(
  history: SectorSnapshot[]
): SectorMomentum[] {
  const bySector = new Map<string, SectorSnapshot[]>();

  for (const snap of history) {
    if (!bySector.has(snap.sector)) bySector.set(snap.sector, []);
    bySector.get(snap.sector)!.push(snap);
  }

  const results: SectorMomentum[] = [];

  for (const [sector, snaps] of bySector) {
    const sorted = snaps.sort((a, b) => b.timestamp - a.timestamp);

    const m1D = sorted[0]?.change ?? 0;
    const m5D = sorted.length >= 5
      ? sorted.slice(0, 5).reduce((s, s2) => s + s2.change, 0) / 5
      : m1D;
    const m20D = sorted.length >= 20
      ? sorted.slice(0, 20).reduce((s, s2) => s + s2.change, 0) / 20
      : m5D;

    const composite = m1D * 0.5 + m5D * 0.3 + m20D * 0.2;

    let trend: 'up' | 'down' | 'sideways';
    if (composite > 0.5) trend = 'up';
    else if (composite < -0.5) trend = 'down';
    else trend = 'sideways';

    results.push({
      sector,
      momentum1D: Math.round(m1D * 100) / 100,
      momentum5D: Math.round(m5D * 100) / 100,
      momentum20D: Math.round(m20D * 100) / 100,
      compositeMomentum: Math.round(composite * 100) / 100,
      rank: 0,
      trend,
    });
  }

  // Assign ranks
  results.sort((a, b) => b.compositeMomentum - a.compositeMomentum);
  results.forEach((r, i) => r.rank = i + 1);

  return results;
}

/**
 * 检测板块轮动信号
 */
export function detectRotationSignals(
  momentum: SectorMomentum[],
  minStrength: number = 0.3
): RotationSignal[] {
  const signals: RotationSignal[] = [];

  const leaders = momentum.filter(m => m.trend === 'up').slice(0, 3);
  const laggers = momentum.filter(m => m.trend === 'down').slice(-3);

  for (const leader of leaders) {
    for (const lagger of laggers) {
      const strength = (leader.compositeMomentum - lagger.compositeMomentum) / 10;
      if (strength < minStrength) continue;

      let phase: 'early' | 'middle' | 'late';
      if (leader.momentum1D > leader.momentum5D) phase = 'early';
      else if (leader.momentum5D > leader.momentum20D) phase = 'middle';
      else phase = 'late';

      signals.push({
        fromSector: lagger.sector,
        toSector: leader.sector,
        strength: Math.min(1, Math.round(strength * 100) / 100),
        phase,
        duration: 0,
        confidence: Math.min(1, Math.round(strength * 0.8 * 100) / 100),
      });
    }
  }

  return signals.sort((a, b) => b.strength - a.strength);
}

/**
 * 板块资金流向计算
 */
export interface CapitalFlow {
  sector: string;
  inflow: number;
  outflow: number;
  netFlow: number;
  flowTrend: 'inflow' | 'outflow' | 'neutral';
  consecutiveDays: number;
}

export function calculateCapitalFlows(
  snapshots: SectorSnapshot[],
  days: number = 5
): CapitalFlow[] {
  const bySector = new Map<string, SectorSnapshot[]>();

  for (const snap of snapshots) {
    if (!bySector.has(snap.sector)) bySector.set(snap.sector, []);
    bySector.get(snap.sector)!.push(snap);
  }

  const flows: CapitalFlow[] = [];

  for (const [sector, snaps] of bySector) {
    const recent = snaps
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, days);

    let inflow = 0;
    let outflow = 0;
    let consecutiveDays = 0;
    let lastFlowDir: 'in' | 'out' | 'neutral' = 'neutral';

    for (const snap of recent) {
      const flow = snap.turnover * (snap.change > 0 ? 1 : -1);
      if (flow > 0) {
        inflow += flow;
        if (lastFlowDir === 'in') consecutiveDays++;
        else { consecutiveDays = 1; lastFlowDir = 'in'; }
      } else {
        outflow += Math.abs(flow);
        if (lastFlowDir === 'out') consecutiveDays++;
        else { consecutiveDays = 1; lastFlowDir = 'out'; }
      }
    }

    const netFlow = inflow - outflow;
    flows.push({
      sector,
      inflow: Math.round(inflow),
      outflow: Math.round(outflow),
      netFlow: Math.round(netFlow),
      flowTrend: netFlow > 0 ? 'inflow' : netFlow < 0 ? 'outflow' : 'neutral',
      consecutiveDays,
    });
  }

  return flows.sort((a, b) => b.netFlow - a.netFlow);
}

/**
 * 板块相对强度
 */
export function calculateRelativeStrength(
  sectorHistory: number[],
  marketHistory: number[]
): number {
  const minLen = Math.min(sectorHistory.length, marketHistory.length);
  if (minLen < 2) return 0;

  const sectorReturn = (sectorHistory[0] - sectorHistory[minLen - 1]) / sectorHistory[minLen - 1];
  const marketReturn = (marketHistory[0] - marketHistory[minLen - 1]) / marketHistory[minLen - 1];

  return Math.round((sectorReturn - marketReturn) * 10000) / 100;
}
