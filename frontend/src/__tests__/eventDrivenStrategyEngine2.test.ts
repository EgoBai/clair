import { describe, it, expect } from 'vitest';

// 事件驱动策略引擎
interface MarketEvent {
  type: 'earnings' | 'dividend' | 'split' | 'merger' | 'regulation' | 'macro';
  symbol: string;
  date: string;
  impact: number; // -1 to 1
  confidence: number;
  details: string;
}

interface EventStrategy {
  eventType: string;
  preEventDays: number;
  postEventDays: number;
  direction: 'long' | 'short' | 'neutral';
  expectedReturn: number;
  winRate: number;
  avgHoldingDays: number;
}

interface EventBacktestResult {
  event: string;
  totalTrades: number;
  winRate: number;
  avgReturn: number;
  maxReturn: number;
  maxLoss: number;
  sharpe: number;
}

function classifyEvent(event: MarketEvent): 'positive' | 'negative' | 'neutral' {
  if (event.impact > 0.2) return 'positive';
  if (event.impact < -0.2) return 'negative';
  return 'neutral';
}

function calcEventStrategy(events: MarketEvent[]): EventStrategy[] {
  const grouped = new Map<string, MarketEvent[]>();
  events.forEach(e => {
    if (!grouped.has(e.type)) grouped.set(e.type, []);
    grouped.get(e.type)!.push(e);
  });

  return Array.from(grouped.entries()).map(([type, evts]) => {
    const avgImpact = evts.reduce((s, e) => s + e.impact, 0) / evts.length;
    const avgConfidence = evts.reduce((s, e) => s + e.confidence, 0) / evts.length;
    return {
      eventType: type,
      preEventDays: Math.round(5 * avgConfidence),
      postEventDays: Math.round(10 * avgConfidence),
      direction: avgImpact > 0.1 ? 'long' : avgImpact < -0.1 ? 'short' : 'neutral',
      expectedReturn: avgImpact * avgConfidence * 5,
      winRate: 0.5 + avgConfidence * 0.2,
      avgHoldingDays: Math.round(7 * avgConfidence),
    };
  });
}

function simulateEventBacktest(strategy: EventStrategy, events: MarketEvent[]): EventBacktestResult {
  const returns = events
    .filter(e => e.type === strategy.eventType)
    .map(e => {
      const noise = (Math.random() - 0.5) * 0.02;
      return e.impact * (strategy.direction === 'short' ? -1 : 1) * e.confidence + noise;
    });

  const wins = returns.filter(r => r > 0);
  return {
    event: strategy.eventType,
    totalTrades: returns.length,
    winRate: returns.length > 0 ? wins.length / returns.length : 0,
    avgReturn: returns.length > 0 ? returns.reduce((s, r) => s + r, 0) / returns.length : 0,
    maxReturn: returns.length > 0 ? Math.max(...returns) : 0,
    maxLoss: returns.length > 0 ? Math.min(...returns) : 0,
    sharpe: 0,
  };
}

function filterHighImpactEvents(events: MarketEvent[], minImpact: number = 0.3): MarketEvent[] {
  return events.filter(e => Math.abs(e.impact) >= minImpact && e.confidence >= 0.7);
}

function calcEventCorrelation(events: MarketEvent[]): { pair: string; correlation: number }[] {
  const types = [...new Set(events.map(e => e.type))];
  const pairs: { pair: string; correlation: number }[] = [];
  for (let i = 0; i < types.length; i++) {
    for (let j = i + 1; j < types.length; j++) {
      const a = events.filter(e => e.type === types[i]).map(e => e.impact);
      const b = events.filter(e => e.type === types[j]).map(e => e.impact);
      const n = Math.min(a.length, b.length);
      if (n < 2) continue;
      const meanA = a.slice(0, n).reduce((s, v) => s + v, 0) / n;
      const meanB = b.slice(0, n).reduce((s, v) => s + v, 0) / n;
      let sumAB = 0, sumA2 = 0, sumB2 = 0;
      for (let k = 0; k < n; k++) {
        const da = a[k] - meanA, db = b[k] - meanB;
        sumAB += da * db;
        sumA2 += da * da;
        sumB2 += db * db;
      }
      const corr = sumA2 > 0 && sumB2 > 0 ? sumAB / Math.sqrt(sumA2 * sumB2) : 0;
      pairs.push({ pair: `${types[i]}-${types[j]}`, correlation: corr });
    }
  }
  return pairs;
}

describe('事件驱动策略引擎', () => {
  const events: MarketEvent[] = [
    { type: 'earnings', symbol: '600519', date: '2024-03-15', impact: 0.6, confidence: 0.85, details: '超预期' },
    { type: 'earnings', symbol: '000858', date: '2024-03-20', impact: -0.3, confidence: 0.75, details: '低于预期' },
    { type: 'dividend', symbol: '600519', date: '2024-04-01', impact: 0.2, confidence: 0.9, details: '高分红' },
    { type: 'split', symbol: '300750', date: '2024-03-25', impact: 0.4, confidence: 0.7, details: '1拆10' },
    { type: 'regulation', symbol: '000001', date: '2024-03-10', impact: -0.5, confidence: 0.8, details: '监管收紧' },
    { type: 'macro', symbol: 'ALL', date: '2024-03-01', impact: -0.2, confidence: 0.6, details: '加息' },
  ];

  it('应分类事件影响', () => {
    expect(classifyEvent(events[0])).toBe('positive');
    expect(classifyEvent(events[1])).toBe('negative');
    expect(classifyEvent(events[5])).toBe('neutral');
  });

  it('应生成事件策略', () => {
    const strategies = calcEventStrategy(events);
    expect(strategies.length).toBeGreaterThan(0);
    strategies.forEach(s => {
      expect(['long', 'short', 'neutral']).toContain(s.direction);
      expect(s.winRate).toBeGreaterThan(0);
      expect(s.winRate).toBeLessThanOrEqual(1);
    });
  });

  it('应按事件类型分组', () => {
    const strategies = calcEventStrategy(events);
    const types = new Set(strategies.map(s => s.eventType));
    expect(types.size).toBe(strategies.length);
  });

  it('应模拟回测', () => {
    const strategies = calcEventStrategy(events);
    const result = simulateEventBacktest(strategies[0], events);
    expect(result.totalTrades).toBeGreaterThanOrEqual(0);
    expect(result.winRate).toBeGreaterThanOrEqual(0);
    expect(result.winRate).toBeLessThanOrEqual(1);
  });

  it('应筛选高影响事件', () => {
    const high = filterHighImpactEvents(events);
    high.forEach(e => {
      expect(Math.abs(e.impact)).toBeGreaterThanOrEqual(0.3);
      expect(e.confidence).toBeGreaterThanOrEqual(0.7);
    });
  });

  it('应计算事件相关性', () => {
    const corr = calcEventCorrelation(events);
    corr.forEach(c => {
      expect(c.correlation).toBeGreaterThanOrEqual(-1);
      expect(c.correlation).toBeLessThanOrEqual(1);
    });
  });

  it('财报事件方向应取决于平均影响', () => {
    const strategies = calcEventStrategy(events);
    const earnings = strategies.find(s => s.eventType === 'earnings');
    expect(earnings).toBeDefined();
    // 平均影响 = (0.6 + (-0.3)) / 2 = 0.15 > 0.1, 应该long
    expect(earnings!.direction).toBe('long');
  });

  it('空事件列表应返回空策略', () => {
    expect(calcEventStrategy([])).toEqual([]);
  });

  it('高置信度事件应有更长持仓期', () => {
    const highConf: MarketEvent[] = [
      { type: 'test', symbol: 'A', date: '2024-01-01', impact: 0.5, confidence: 0.95, details: '' },
    ];
    const lowConf: MarketEvent[] = [
      { type: 'test', symbol: 'A', date: '2024-01-01', impact: 0.5, confidence: 0.5, details: '' },
    ];
    const s1 = calcEventStrategy(highConf)[0];
    const s2 = calcEventStrategy(lowConf)[0];
    expect(s1.avgHoldingDays).toBeGreaterThan(s2.avgHoldingDays);
  });

  it('单事件相关性应返回空', () => {
    const single: MarketEvent[] = [events[0]];
    expect(calcEventCorrelation(single)).toEqual([]);
  });
});
