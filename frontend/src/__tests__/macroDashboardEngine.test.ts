import { describe, it, expect } from 'vitest';

// 宏观经济仪表盘引擎
interface MacroIndicator {
  name: string;
  value: number;
  unit: string;
  change: number;
  previousValue: number;
  category: 'growth' | 'inflation' | 'employment' | 'trade' | 'monetary';
  timestamp: number;
}

interface MacroDashboard {
  gdpGrowth: number;
  cpiYoY: number;
  ppiYoY: number;
  unemploymentRate: number;
  tradeBalance: number;
  m2Growth: number;
  pmi: number;
  compositeScore: number;
  signals: MacroSignal[];
}

interface MacroSignal {
  indicator: string;
  direction: 'bullish' | 'bearish' | 'neutral';
  strength: number;
  description: string;
}

function calcCompositeScore(indicators: MacroIndicator[]): number {
  const weights: Record<string, number> = {
    gdpGrowth: 0.25, cpiYoY: 0.15, pmi: 0.2,
    unemploymentRate: 0.15, m2Growth: 0.15, tradeBalance: 0.1,
  };
  let score = 50;
  indicators.forEach(ind => {
    const w = weights[ind.name] || 0.05;
    if (ind.change > 0) score += w * 20;
    else if (ind.change < 0) score -= w * 20;
  });
  return Math.max(0, Math.min(100, score));
}

function generateSignals(indicators: MacroIndicator[]): MacroSignal[] {
  return indicators.map(ind => {
    let direction: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    const strength = Math.abs(ind.change) / Math.abs(ind.previousValue || 1) * 100;
    if (ind.name === 'unemploymentRate') {
      direction = ind.change < 0 ? 'bullish' : ind.change > 0 ? 'bearish' : 'neutral';
    } else if (ind.name === 'cpiYoY') {
      direction = ind.change > 2 ? 'bearish' : ind.change > 0 ? 'neutral' : 'bullish';
    } else {
      direction = ind.change > 0 ? 'bullish' : ind.change < 0 ? 'bearish' : 'neutral';
    }
    return {
      indicator: ind.name,
      direction,
      strength: Math.min(100, strength),
      description: `${ind.name}: ${direction} (${ind.change > 0 ? '+' : ''}${ind.change.toFixed(2)})`,
    };
  });
}

function buildDashboard(indicators: MacroIndicator[]): MacroDashboard {
  const get = (name: string) => indicators.find(i => i.name === name);
  const signals = generateSignals(indicators);
  const compositeScore = calcCompositeScore(indicators);
  return {
    gdpGrowth: get('gdpGrowth')?.value || 0,
    cpiYoY: get('cpiYoY')?.value || 0,
    ppiYoY: get('ppiYoY')?.value || 0,
    unemploymentRate: get('unemploymentRate')?.value || 0,
    tradeBalance: get('tradeBalance')?.value || 0,
    m2Growth: get('m2Growth')?.value || 0,
    pmi: get('pmi')?.value || 0,
    compositeScore,
    signals,
  };
}

describe('宏观经济仪表盘引擎', () => {
  const indicators: MacroIndicator[] = [
    { name: 'gdpGrowth', value: 5.2, unit: '%', change: 0.3, previousValue: 4.9, category: 'growth', timestamp: Date.now() },
    { name: 'cpiYoY', value: 2.1, unit: '%', change: 0.5, previousValue: 1.6, category: 'inflation', timestamp: Date.now() },
    { name: 'ppiYoY', value: -1.2, unit: '%', change: -0.8, previousValue: -0.4, category: 'inflation', timestamp: Date.now() },
    { name: 'unemploymentRate', value: 5.1, unit: '%', change: -0.2, previousValue: 5.3, category: 'employment', timestamp: Date.now() },
    { name: 'tradeBalance', value: 68.3, unit: 'B USD', change: 5.2, previousValue: 63.1, category: 'trade', timestamp: Date.now() },
    { name: 'm2Growth', value: 9.8, unit: '%', change: 1.2, previousValue: 8.6, category: 'monetary', timestamp: Date.now() },
    { name: 'pmi', value: 50.8, unit: '', change: 0.5, previousValue: 50.3, category: 'growth', timestamp: Date.now() },
  ];

  it('应计算综合得分', () => {
    const score = calcCompositeScore(indicators);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('空指标列表应返回中性得分', () => {
    expect(calcCompositeScore([])).toBe(50);
  });

  it('所有正面变化应提高得分', () => {
    const allUp = indicators.map(i => ({ ...i, change: 1 }));
    expect(calcCompositeScore(allUp)).toBeGreaterThan(50);
  });

  it('所有负面变化应降低得分', () => {
    const allDown = indicators.map(i => ({ ...i, change: -1 }));
    expect(calcCompositeScore(allDown)).toBeLessThan(50);
  });

  it('应生成信号列表', () => {
    const signals = generateSignals(indicators);
    expect(signals.length).toBe(indicators.length);
    signals.forEach(s => {
      expect(['bullish', 'bearish', 'neutral']).toContain(s.direction);
      expect(s.strength).toBeGreaterThanOrEqual(0);
      expect(s.description).toBeTruthy();
    });
  });

  it('失业率下降应为看涨信号', () => {
    const signals = generateSignals(indicators);
    const unemp = signals.find(s => s.indicator === 'unemploymentRate');
    expect(unemp?.direction).toBe('bullish');
  });

  it('CPI过高应为看跌信号', () => {
    const highCpi: MacroIndicator[] = [
      { name: 'cpiYoY', value: 5.0, unit: '%', change: 3.5, previousValue: 1.5, category: 'inflation', timestamp: Date.now() },
    ];
    const signals = generateSignals(highCpi);
    expect(signals[0].direction).toBe('bearish');
  });

  it('应构建完整仪表盘', () => {
    const dashboard = buildDashboard(indicators);
    expect(dashboard.gdpGrowth).toBe(5.2);
    expect(dashboard.cpiYoY).toBe(2.1);
    expect(dashboard.pmi).toBe(50.8);
    expect(dashboard.compositeScore).toBeGreaterThan(0);
    expect(dashboard.signals.length).toBe(indicators.length);
  });

  it('缺失指标应返回默认值', () => {
    const dashboard = buildDashboard([]);
    expect(dashboard.gdpGrowth).toBe(0);
    expect(dashboard.cpiYoY).toBe(0);
    expect(dashboard.pmi).toBe(0);
  });

  it('信号强度应正比于变化幅度', () => {
    const bigChange: MacroIndicator[] = [
      { name: 'gdpGrowth', value: 8.0, unit: '%', change: 4.0, previousValue: 4.0, category: 'growth', timestamp: Date.now() },
    ];
    const smallChange: MacroIndicator[] = [
      { name: 'gdpGrowth', value: 4.1, unit: '%', change: 0.1, previousValue: 4.0, category: 'growth', timestamp: Date.now() },
    ];
    expect(generateSignals(bigChange)[0].strength).toBeGreaterThan(generateSignals(smallChange)[0].strength);
  });
});
