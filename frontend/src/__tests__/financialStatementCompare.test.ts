import { describe, it, expect } from 'vitest';

// 财务报表对比引擎
interface FinancialStatement {
  period: string;
  revenue: number;
  netProfit: number;
  grossMargin: number;
  operatingMargin: number;
  roe: number;
  roa: number;
  debtToEquity: number;
  currentRatio: number;
  quickRatio: number;
  inventoryTurnover: number;
  receivablesTurnover: number;
}

interface ComparisonResult {
  metrics: MetricComparison[];
  overallTrend: 'improving' | 'declining' | 'stable';
  score: number;
}

interface MetricComparison {
  name: string;
  current: number;
  previous: number;
  change: number;
  changePercent: number;
  trend: 'up' | 'down' | 'flat';
}

function compareStatements(current: FinancialStatement, previous: FinancialStatement): ComparisonResult {
  const metrics: { name: string; key: keyof FinancialStatement }[] = [
    { name: '营收', key: 'revenue' },
    { name: '净利润', key: 'netProfit' },
    { name: '毛利率', key: 'grossMargin' },
    { name: '营业利润率', key: 'operatingMargin' },
    { name: 'ROE', key: 'roe' },
    { name: 'ROA', key: 'roa' },
    { name: '资产负债率', key: 'debtToEquity' },
    { name: '流动比率', key: 'currentRatio' },
    { name: '速动比率', key: 'quickRatio' },
    { name: '存货周转率', key: 'inventoryTurnover' },
    { name: '应收账款周转率', key: 'receivablesTurnover' },
  ];

  const comparisons: MetricComparison[] = metrics.map(m => {
    const cur = current[m.key] as number;
    const prev = previous[m.key] as number;
    const change = cur - prev;
    const changePercent = prev !== 0 ? (change / Math.abs(prev)) * 100 : 0;
    const trend = Math.abs(changePercent) < 1 ? 'flat' : change > 0 ? 'up' : 'down';
    return { name: m.name, current: cur, previous: prev, change, changePercent, trend };
  });

  const upCount = comparisons.filter(c => c.trend === 'up').length;
  const downCount = comparisons.filter(c => c.trend === 'down').length;
  const overallTrend = upCount > downCount ? 'improving' : downCount > upCount ? 'declining' : 'stable';
  const score = ((upCount - downCount) / comparisons.length + 1) * 50;

  return { metrics: comparisons, overallTrend, score };
}

function detectAnomalies(statements: FinancialStatement[]): string[] {
  const anomalies: string[] = [];
  if (statements.length < 2) return anomalies;

  for (let i = 1; i < statements.length; i++) {
    const cur = statements[i];
    const prev = statements[i - 1];
    if (prev.revenue > 0 && (cur.revenue - prev.revenue) / prev.revenue < -0.3) {
      anomalies.push(`${cur.period}: 营收大幅下降 ${(((cur.revenue - prev.revenue) / prev.revenue) * 100).toFixed(1)}%`);
    }
    if (cur.debtToEquity > 0.8) {
      anomalies.push(`${cur.period}: 资产负债率过高 ${(cur.debtToEquity * 100).toFixed(1)}%`);
    }
    if (cur.currentRatio < 1) {
      anomalies.push(`${cur.period}: 流动比率低于1，流动性风险`);
    }
    if (cur.grossMargin < 0.1) {
      anomalies.push(`${cur.period}: 毛利率过低 ${(cur.grossMargin * 100).toFixed(1)}%`);
    }
  }
  return anomalies;
}

function calcFinancialHealthScore(stmt: FinancialStatement): number {
  let score = 50;
  // 盈利能力
  if (stmt.roe > 15) score += 10;
  else if (stmt.roe > 10) score += 5;
  else if (stmt.roe < 5) score -= 10;
  // 成长性
  if (stmt.revenue > 0) score += 5;
  // 偿债能力
  if (stmt.currentRatio > 1.5) score += 10;
  else if (stmt.currentRatio < 1) score -= 15;
  if (stmt.debtToEquity < 0.5) score += 10;
  else if (stmt.debtToEquity > 0.7) score -= 10;
  // 运营效率
  if (stmt.inventoryTurnover > 5) score += 5;
  if (stmt.receivablesTurnover > 6) score += 5;
  return Math.max(0, Math.min(100, score));
}

describe('财务报表对比引擎', () => {
  const current: FinancialStatement = {
    period: '2024Q3',
    revenue: 1000,
    netProfit: 200,
    grossMargin: 0.45,
    operatingMargin: 0.25,
    roe: 18,
    roa: 10,
    debtToEquity: 0.4,
    currentRatio: 2.0,
    quickRatio: 1.5,
    inventoryTurnover: 6,
    receivablesTurnover: 8,
  };

  const previous: FinancialStatement = {
    period: '2024Q2',
    revenue: 900,
    netProfit: 180,
    grossMargin: 0.42,
    operatingMargin: 0.23,
    roe: 16,
    roa: 9,
    debtToEquity: 0.42,
    currentRatio: 1.8,
    quickRatio: 1.3,
    inventoryTurnover: 5.5,
    receivablesTurnover: 7.5,
  };

  it('应比较两期报表', () => {
    const result = compareStatements(current, previous);
    expect(result.metrics.length).toBe(11);
    expect(result.score).toBeGreaterThan(0);
  });

  it('应计算指标变化', () => {
    const result = compareStatements(current, previous);
    const revenue = result.metrics.find(m => m.name === '营收');
    expect(revenue?.change).toBe(100);
    expect(revenue?.trend).toBe('up');
  });

  it('整体趋势应为改善', () => {
    const result = compareStatements(current, previous);
    expect(result.overallTrend).toBe('improving');
  });

  it('下降报表应标记下降趋势', () => {
    const worse: FinancialStatement = { ...current, revenue: 800, netProfit: 150, grossMargin: 0.35, roe: 12, currentRatio: 0.8, debtToEquity: 0.85 };
    const result = compareStatements(worse, current);
    expect(result.overallTrend).toBe('declining');
  });

  it('应检测异常', () => {
    const bad: FinancialStatement = { ...current, period: '2024Q4', revenue: 500, debtToEquity: 0.85, currentRatio: 0.8, grossMargin: 0.05 };
    const anomalies = detectAnomalies([current, bad]);
    expect(anomalies.length).toBeGreaterThan(0);
    expect(anomalies.some(a => a.includes('营收大幅下降'))).toBe(true);
    expect(anomalies.some(a => a.includes('资产负债率'))).toBe(true);
  });

  it('正常报表不应有异常', () => {
    const anomalies = detectAnomalies([previous, current]);
    expect(anomalies.length).toBe(0);
  });

  it('单期报表不应有异常', () => {
    expect(detectAnomalies([current])).toEqual([]);
  });

  it('应计算财务健康得分', () => {
    const score = calcFinancialHealthScore(current);
    expect(score).toBeGreaterThan(50);
  });

  it('差的财务状况得分应低', () => {
    const bad: FinancialStatement = { ...current, roe: 3, currentRatio: 0.7, debtToEquity: 0.9, inventoryTurnover: 2, receivablesTurnover: 3 };
    expect(calcFinancialHealthScore(bad)).toBeLessThan(calcFinancialHealthScore(current));
  });

  it('变化百分比应正确计算', () => {
    const result = compareStatements(current, previous);
    const profit = result.metrics.find(m => m.name === '净利润');
    expect(profit?.changePercent).toBeCloseTo(11.11, 1);
  });
});
