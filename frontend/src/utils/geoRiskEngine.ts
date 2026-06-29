/**
 * 地缘政治风险引擎
 * - 区域风险评估
 * - 事件冲击分析
 * - 供应链风险传导
 * - 避险信号
 */
export interface GeoEvent {
  region: string;
  type: 'conflict' | 'sanction' | 'trade_war' | 'political' | 'natural_disaster' | 'pandemic';
  severity: number; // 1-10
  date: string;
  affectedSectors: string[];
  affectedCountries: string[];
}

export interface RegionRisk {
  region: string;
  riskScore: number; // 0-100
  trend: 'rising' | 'falling' | 'stable';
  activeEvents: number;
  supplyChainImpact: number;
  marketImpact: number;
}

export interface GeoRiskAnalysis {
  globalRiskIndex: number;
  regionRisks: RegionRisk[];
  sectorImpacts: Array<{ sector: string; impact: number; risk: number }>;
  safeHavenSignal: 'gold' | 'bond' | 'usd' | 'none';
  hedgeSuggestions: string[];
  alerts: string[];
}

export function analyzeGeoRisk(
  events: GeoEvent[],
  _sectorExposure?: Record<string, number>
): GeoRiskAnalysis {
  if (events.length === 0) {
    return {
      globalRiskIndex: 20,
      regionRisks: [],
      sectorImpacts: [],
      safeHavenSignal: 'none',
      hedgeSuggestions: [],
      alerts: [],
    };
  }

  // 区域风险
  const regionMap = new Map<string, { events: GeoEvent[]; totalSeverity: number }>();
  for (const e of events) {
    const existing = regionMap.get(e.region) ?? { events: [], totalSeverity: 0 };
    existing.events.push(e);
    existing.totalSeverity += e.severity;
    regionMap.set(e.region, existing);
  }

  const now = Date.now();
  const regionRisks: RegionRisk[] = [...regionMap.entries()].map(([region, data]) => {
    const riskScore = Math.min(100, data.totalSeverity * 5 + data.events.length * 10);
    const recentEvents = data.events.filter(e => (now - new Date(e.date).getTime()) < 30 * 86400000);
    const olderEvents = data.events.filter(e => (now - new Date(e.date).getTime()) >= 30 * 86400000);
    const trend: 'rising' | 'falling' | 'stable' = recentEvents.length > olderEvents.length ? 'rising'
      : recentEvents.length < olderEvents.length ? 'falling' : 'stable';

    const supplyChainImpact = data.events.filter(e =>
      ['sanction', 'trade_war', 'natural_disaster'].includes(e.type)
    ).reduce((s, e) => s + e.severity, 0) * 3;
    const marketImpact = data.events.reduce((s, e) => s + e.severity, 0) * 4;

    return { region, riskScore, trend: trend as 'rising' | 'falling' | 'stable', activeEvents: data.events.length, supplyChainImpact, marketImpact };
  }).sort((a, b) => b.riskScore - a.riskScore);

  // 全球风险指数
  const globalRiskIndex = Math.min(100, regionRisks.reduce((s, r) => s + r.riskScore, 0) / Math.max(regionRisks.length, 1));

  // 行业影响
  const sectorImpactMap = new Map<string, { impact: number; count: number }>();
  for (const e of events) {
    for (const sector of e.affectedSectors) {
      const existing = sectorImpactMap.get(sector) ?? { impact: 0, count: 0 };
      existing.impact += e.severity;
      existing.count++;
      sectorImpactMap.set(sector, existing);
    }
  }
  const sectorImpacts = [...sectorImpactMap.entries()].map(([sector, data]) => ({
    sector,
    impact: data.impact,
    risk: Math.min(100, data.impact * 10 + data.count * 5),
  })).sort((a, b) => b.risk - a.risk);

  // 避险信号
  let safeHavenSignal: 'gold' | 'bond' | 'usd' | 'none' = 'none';
  if (globalRiskIndex > 60) safeHavenSignal = 'gold';
  else if (globalRiskIndex > 40) safeHavenSignal = 'bond';
  else if (globalRiskIndex > 30) safeHavenSignal = 'usd';

  // 对冲建议
  const hedgeSuggestions: string[] = [];
  if (globalRiskIndex > 50) hedgeSuggestions.push('增加黄金配置');
  if (sectorImpacts.some(s => s.risk > 50)) hedgeSuggestions.push('减少受影响行业暴露');
  if (regionRisks.some(r => r.riskScore > 70)) hedgeSuggestions.push('关注地缘高风险区域');
  if (events.some(e => e.type === 'trade_war')) hedgeSuggestions.push('关注贸易摩擦受益行业');

  const alerts: string[] = [];
  if (globalRiskIndex > 70) alerts.push('全球地缘风险高企');
  const conflictEvents = events.filter(e => e.type === 'conflict' && e.severity > 7);
  if (conflictEvents.length > 0) alerts.push('存在严重冲突事件');

  return { globalRiskIndex, regionRisks, sectorImpacts, safeHavenSignal, hedgeSuggestions, alerts };
}
