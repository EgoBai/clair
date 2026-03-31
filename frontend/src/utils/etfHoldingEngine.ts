/**
 * ETF持仓变动跟踪引擎
 * - 持仓变动检测(新增/剔除/增持/减持)
 * - 持仓集中度分析
 * - 行业分布变化
 * - 重仓股异动跟踪
 * - 持仓偏离度分析
 */

export interface ETFHolding {
  stockCode: string;
  stockName: string;
  shares: number;
  marketValue: number;
  weight: number; // 占净值比
  changeFromPrev: number; // 持仓变动比例
}

export interface ETFHoldingSnapshot {
  etfCode: string;
  etfName: string;
  date: string;
  totalValue: number;
  holdings: ETFHolding[];
}

export interface HoldingChange {
  stockCode: string;
  stockName: string;
  changeType: 'new' | 'removed' | 'increase' | 'decrease';
  prevWeight: number;
  currWeight: number;
  weightChange: number;
  prevShares: number;
  currShares: number;
  sharesChangePct: number;
}

export interface ConcentrationMetrics {
  top5Weight: number;
  top10Weight: number;
  top20Weight: number;
  hhiIndex: number; // Herfindahl-Hirschman Index
  effectiveN: number; // 有效持仓数
}

export interface SectorDistribution {
  sector: string;
  weight: number;
  prevWeight: number;
  change: number;
  stockCount: number;
}

export interface DriftAnalysis {
  trackingError: number;
  maxDeviation: number;
  deviationStocks: Array<{ code: string; deviation: number }>;
  driftScore: number; // 0-100
}

export interface ETFHoldingAnalysis {
  changes: HoldingChange[];
  concentration: ConcentrationMetrics;
  sectorDist: SectorDistribution[];
  drift: DriftAnalysis;
  topMovers: HoldingChange[];
  riskAlerts: string[];
}

/**
 * 分析ETF持仓变动
 */
export function analyzeETFHoldings(
  current: ETFHoldingSnapshot,
  previous?: ETFHoldingSnapshot,
  sectorMap?: Record<string, string>
): ETFHoldingAnalysis {
  const changes = detectHoldingChanges(current.holdings, previous?.holdings);
  const concentration = calculateConcentration(current.holdings);
  const sectorDist = analyzeSectorDistribution(
    current.holdings,
    previous?.holdings,
    sectorMap
  );
  const drift = analyzeDrift(current, previous);
  const topMovers = getTopMovers(changes, 10);
  const riskAlerts = generateRiskAlerts(concentration, drift, changes);

  return { changes, concentration, sectorDist, drift, topMovers, riskAlerts };
}

function detectHoldingChanges(
  current: ETFHolding[],
  previous?: ETFHolding[]
): HoldingChange[] {
  const prevMap = new Map(previous?.map(h => [h.stockCode, h]));
  const currMap = new Map(current.map(h => [h.stockCode, h]));
  const changes: HoldingChange[] = [];

  for (const curr of current) {
    const prev = prevMap.get(curr.stockCode);
    if (!prev) {
      changes.push({
        stockCode: curr.stockCode,
        stockName: curr.stockName,
        changeType: 'new',
        prevWeight: 0,
        currWeight: curr.weight,
        weightChange: curr.weight,
        prevShares: 0,
        currShares: curr.shares,
        sharesChangePct: Infinity,
      });
    } else {
      const sharesChangePct = prev.shares > 0
        ? (curr.shares - prev.shares) / prev.shares
        : Infinity;
      const weightChange = curr.weight - prev.weight;
      if (Math.abs(sharesChangePct) > 0.001 || Math.abs(weightChange) > 0.001) {
        changes.push({
          stockCode: curr.stockCode,
          stockName: curr.stockName,
          changeType: sharesChangePct > 0 ? 'increase' : 'decrease',
          prevWeight: prev.weight,
          currWeight: curr.weight,
          weightChange,
          prevShares: prev.shares,
          currShares: curr.shares,
          sharesChangePct,
        });
      }
    }
  }

  if (previous) {
    for (const prev of previous) {
      if (!currMap.has(prev.stockCode)) {
        changes.push({
          stockCode: prev.stockCode,
          stockName: prev.stockName,
          changeType: 'removed',
          prevWeight: prev.weight,
          currWeight: 0,
          weightChange: -prev.weight,
          prevShares: prev.shares,
          currShares: 0,
          sharesChangePct: -1,
        });
      }
    }
  }

  return changes;
}

function calculateConcentration(holdings: ETFHolding[]): ConcentrationMetrics {
  const sorted = [...holdings].sort((a, b) => b.weight - a.weight);
  const top5Weight = sorted.slice(0, 5).reduce((s, h) => s + h.weight, 0);
  const top10Weight = sorted.slice(0, 10).reduce((s, h) => s + h.weight, 0);
  const top20Weight = sorted.slice(0, 20).reduce((s, h) => s + h.weight, 0);
  const hhiIndex = holdings.reduce((s, h) => s + (h.weight * 100) ** 2, 0);
  const effectiveN = hhiIndex > 0 ? 10000 / hhiIndex : holdings.length;

  return { top5Weight, top10Weight, top20Weight, hhiIndex, effectiveN };
}

function analyzeSectorDistribution(
  current: ETFHolding[],
  previous: ETFHolding[] | undefined,
  sectorMap?: Record<string, string>
): SectorDistribution[] {
  const map = sectorMap ?? {};
  const currSector = new Map<string, { weight: number; count: number }>();
  const prevSector = new Map<string, { weight: number; count: number }>();

  for (const h of current) {
    const sector = map[h.stockCode] ?? '其他';
    const s = currSector.get(sector) ?? { weight: 0, count: 0 };
    s.weight += h.weight;
    s.count++;
    currSector.set(sector, s);
  }

  for (const h of previous ?? []) {
    const sector = map[h.stockCode] ?? '其他';
    const s = prevSector.get(sector) ?? { weight: 0, count: 0 };
    s.weight += h.weight;
    s.count++;
    prevSector.set(sector, s);
  }

  const sectors = new Set([...currSector.keys(), ...prevSector.keys()]);
  return [...sectors].map(sector => {
    const curr = currSector.get(sector) ?? { weight: 0, count: 0 };
    const prev = prevSector.get(sector) ?? { weight: 0, count: 0 };
    return {
      sector,
      weight: curr.weight,
      prevWeight: prev.weight,
      change: curr.weight - prev.weight,
      stockCount: curr.count,
    };
  }).sort((a, b) => b.weight - a.weight);
}

function analyzeDrift(
  current: ETFHoldingSnapshot,
  previous?: ETFHoldingSnapshot
): DriftAnalysis {
  if (!previous) {
    return { trackingError: 0, maxDeviation: 0, deviationStocks: [], driftScore: 0 };
  }

  const prevMap = new Map(previous.holdings.map(h => [h.stockCode, h.weight]));
  const deviations: Array<{ code: string; deviation: number }> = [];

  for (const h of current.holdings) {
    const prevWeight = prevMap.get(h.stockCode) ?? 0;
    const deviation = h.weight - prevWeight;
    if (Math.abs(deviation) > 0.005) {
      deviations.push({ code: h.stockCode, deviation });
    }
  }

  const allDeviations = current.holdings.map(h => {
    const prevWeight = prevMap.get(h.stockCode) ?? 0;
    return h.weight - prevWeight;
  });

  const trackingError = Math.sqrt(
    allDeviations.reduce((s, d) => s + d * d, 0) / allDeviations.length
  );
  const maxDeviation = Math.max(...allDeviations.map(Math.abs));
  const driftScore = Math.min(100, trackingError * 1000 + maxDeviation * 100);

  return {
    trackingError,
    maxDeviation,
    deviationStocks: deviations.sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation)).slice(0, 10),
    driftScore,
  };
}

function getTopMovers(changes: HoldingChange[], n: number): HoldingChange[] {
  return [...changes]
    .filter(c => c.changeType !== 'removed')
    .sort((a, b) => Math.abs(b.weightChange) - Math.abs(a.weightChange))
    .slice(0, n);
}

function generateRiskAlerts(
  concentration: ConcentrationMetrics,
  drift: DriftAnalysis,
  changes: HoldingChange[]
): string[] {
  const alerts: string[] = [];
  if (concentration.top5Weight > 0.5) alerts.push('前5大持仓占比超过50%，集中度过高');
  if (concentration.hhiIndex > 2500) alerts.push('HHI指数超过2500，持仓高度集中');
  if (drift.driftScore > 50) alerts.push('持仓偏离度偏高，可能影响跟踪效果');
  const newCount = changes.filter(c => c.changeType === 'new').length;
  if (newCount > 20) alerts.push(`新增持仓${newCount}只，调仓幅度较大`);
  const removedCount = changes.filter(c => c.changeType === 'removed').length;
  if (removedCount > 20) alerts.push(`剔除持仓${removedCount}只，调仓幅度较大`);
  return alerts;
}
