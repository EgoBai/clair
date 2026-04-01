import { describe, it, expect } from 'vitest';

// 行业景气度追踪引擎
interface IndustryMetrics {
  industry: string;
  revenueGrowth: number;
  profitGrowth: number;
  roeChange: number;
  marginExpansion: number;
  orderGrowth: number;
  inventoryChange: number;
  capexGrowth: number;
  timestamp: number;
}

interface ProsperityScore {
  industry: string;
  score: number;
  phase: 'expansion' | 'peak' | 'contraction' | 'trough';
  trend: 'rising' | 'falling' | 'stable';
  rank: number;
  confidence: number;
}

function calcProsperityScore(metrics: IndustryMetrics): number {
  let score = 50;
  // 收入增长
  if (metrics.revenueGrowth > 20) score += 15;
  else if (metrics.revenueGrowth > 10) score += 10;
  else if (metrics.revenueGrowth > 0) score += 5;
  else score -= 10;
  // 利润增长
  if (metrics.profitGrowth > 30) score += 15;
  else if (metrics.profitGrowth > 15) score += 10;
  else if (metrics.profitGrowth > 0) score += 5;
  else score -= 10;
  // ROE变化
  score += Math.sign(metrics.roeChange) * 5;
  // 毛利率扩张
  score += Math.sign(metrics.marginExpansion) * 5;
  // 订单增长
  if (metrics.orderGrowth > 15) score += 10;
  else if (metrics.orderGrowth > 0) score += 5;
  else score -= 5;
  // 库存变化（负=去库存=好）
  score -= Math.sign(metrics.inventoryChange) * 3;
  // 资本开支增长（适度扩张=好）
  if (metrics.capexGrowth > 5 && metrics.capexGrowth < 30) score += 5;
  else if (metrics.capexGrowth > 40) score -= 5;
  return Math.max(0, Math.min(100, score));
}

function determinePhase(score: number, prevScore: number): { phase: ProsperityScore['phase']; trend: ProsperityScore['trend'] } {
  let phase: ProsperityScore['phase'];
  if (score > 70) phase = 'expansion';
  else if (score > 50) phase = prevScore > score ? 'peak' : 'expansion';
  else if (score > 30) phase = prevScore < score ? 'trough' : 'contraction';
  else phase = 'contraction';

  const diff = score - prevScore;
  const trend = Math.abs(diff) < 2 ? 'stable' : diff > 0 ? 'rising' : 'falling';
  return { phase, trend };
}

function rankIndustries(metricsList: IndustryMetrics[]): ProsperityScore[] {
  const scores = metricsList.map(m => ({
    industry: m.industry,
    score: calcProsperityScore(m),
    prevScore: 50,
    metrics: m,
  }));

  const sorted = [...scores].sort((a, b) => b.score - a.score);
  return sorted.map((s, i) => {
    const { phase, trend } = determinePhase(s.score, s.prevScore);
    return {
      industry: s.industry,
      score: s.score,
      phase,
      trend,
      rank: i + 1,
      confidence: Math.min(1, s.score / 100),
    };
  });
}

function findLeadingIndustries(ranked: ProsperityScore[], n: number = 5): ProsperityScore[] {
  return ranked.filter(r => r.phase === 'expansion' && r.trend === 'rising').slice(0, n);
}

function calcIndustryRotationSignals(current: ProsperityScore[], previous: ProsperityScore[]): { industry: string; signal: 'in' | 'out' | 'hold' }[] {
  return current.map(c => {
    const prev = previous.find(p => p.industry === c.industry);
    if (!prev) return { industry: c.industry, signal: 'hold' as const };
    if (c.rank <= 5 && prev.rank > 5) return { industry: c.industry, signal: 'in' as const };
    if (c.rank > 5 && prev.rank <= 5) return { industry: c.industry, signal: 'out' as const };
    return { industry: c.industry, signal: 'hold' as const };
  });
}

describe('行业景气度追踪引擎', () => {
  const industries: IndustryMetrics[] = [
    { industry: '新能源', revenueGrowth: 35, profitGrowth: 50, roeChange: 3, marginExpansion: 2, orderGrowth: 40, inventoryChange: -5, capexGrowth: 20, timestamp: Date.now() },
    { industry: '半导体', revenueGrowth: 25, profitGrowth: 30, roeChange: 2, marginExpansion: 1, orderGrowth: 25, inventoryChange: 3, capexGrowth: 25, timestamp: Date.now() },
    { industry: '消费', revenueGrowth: 8, profitGrowth: 10, roeChange: 0.5, marginExpansion: 0.5, orderGrowth: 5, inventoryChange: -2, capexGrowth: 8, timestamp: Date.now() },
    { industry: '地产', revenueGrowth: -15, profitGrowth: -25, roeChange: -4, marginExpansion: -3, orderGrowth: -20, inventoryChange: 15, capexGrowth: -30, timestamp: Date.now() },
    { industry: '医药', revenueGrowth: 12, profitGrowth: 15, roeChange: 1, marginExpansion: 1, orderGrowth: 10, inventoryChange: 0, capexGrowth: 12, timestamp: Date.now() },
  ];

  it('应计算景气度得分', () => {
    const score = calcProsperityScore(industries[0]);
    expect(score).toBeGreaterThan(50);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('高增长行业得分应高于衰退行业', () => {
    const high = calcProsperityScore(industries[0]);
    const low = calcProsperityScore(industries[3]);
    expect(high).toBeGreaterThan(low);
  });

  it('应判断景气周期阶段', () => {
    const { phase, trend } = determinePhase(80, 70);
    expect(phase).toBe('expansion');
    expect(trend).toBe('rising');
  });

  it('低分下降应为收缩', () => {
    const { phase, trend } = determinePhase(25, 35);
    expect(phase).toBe('contraction');
    expect(trend).toBe('falling');
  });

  it('应排名行业', () => {
    const ranked = rankIndustries(industries);
    expect(ranked.length).toBe(industries.length);
    expect(ranked[0].rank).toBe(1);
    expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[ranked.length - 1].score);
  });

  it('应找出领先行业', () => {
    const ranked = rankIndustries(industries);
    const leading = findLeadingIndustries(ranked, 3);
    leading.forEach(l => {
      expect(l.phase).toBe('expansion');
      expect(l.trend).toBe('rising');
    });
  });

  it('应生成轮动信号', () => {
    const current = rankIndustries(industries);
    const previous = current.map(c => ({ ...c, rank: c.rank + 2 }));
    const signals = calcIndustryRotationSignals(current, previous);
    expect(signals.length).toBe(current.length);
    signals.forEach(s => {
      expect(['in', 'out', 'hold']).toContain(s.signal);
    });
  });

  it('地产行业得分应低', () => {
    const score = calcProsperityScore(industries[3]);
    expect(score).toBeLessThan(50);
  });

  it('得分应在0-100范围内', () => {
    industries.forEach(ind => {
      const score = calcProsperityScore(ind);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });
  });

  it('相同指标应产生相同得分', () => {
    const s1 = calcProsperityScore(industries[0]);
    const s2 = calcProsperityScore(industries[0]);
    expect(s1).toBe(s2);
  });
});
