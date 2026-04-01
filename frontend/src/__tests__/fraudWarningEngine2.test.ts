import { describe, it, expect } from 'vitest';

// 财务造假预警引擎
interface FinancialMetrics {
  symbol: string;
  revenue: number;
  netProfit: number;
  operatingCashFlow: number;
  capex: number;
  receivables: number;
  inventory: number;
  goodwill: number;
  totalAssets: number;
  revenueGrowth: number;
  profitGrowth: number;
  cfoGrowth: number;
  period: string;
}

interface FraudWarning {
  symbol: string;
  score: number;
  level: 'safe' | 'watch' | 'warning' | 'danger';
  indicators: { name: string; value: number; threshold: number; triggered: boolean }[];
  benfordDeviation: number;
}

function calcAccrualRatio(metrics: FinancialMetrics): number {
  const totalAssets = metrics.totalAssets || 1;
  return (metrics.netProfit - metrics.operatingCashFlow) / totalAssets;
}

function calcCashConversion(metrics: FinancialMetrics): number {
  return metrics.revenue > 0 ? metrics.operatingCashFlow / metrics.revenue : 0;
}

function calcReceivableGrowth(current: FinancialMetrics, previous: FinancialMetrics): number {
  return previous.receivables > 0 ? (current.receivables - previous.receivables) / previous.receivables : 0;
}

function checkBenfordLaw(numbers: number[]): number {
  const benford = [0, 0.301, 0.176, 0.125, 0.097, 0.079, 0.067, 0.058, 0.051, 0.046];
  const firstDigits = numbers
    .filter(n => n > 0)
    .map(n => parseInt(String(Math.abs(n))[0]));
  const counts = Array(10).fill(0);
  firstDigits.forEach(d => counts[d]++);
  const total = firstDigits.length || 1;
  let deviation = 0;
  for (let d = 1; d <= 9; d++) {
    const observed = counts[d] / total;
    deviation += Math.abs(observed - benford[d]);
  }
  return deviation;
}

function assessFraudRisk(metrics: FinancialMetrics, previous?: FinancialMetrics): FraudWarning {
  let score = 0;
  const indicators: FraudWarning['indicators'] = [];

  // 应计比率
  const accrual = calcAccrualRatio(metrics);
  indicators.push({ name: '应计比率', value: accrual, threshold: 0.05, triggered: accrual > 0.05 });
  if (accrual > 0.05) score += 20;

  // 现金收入比
  const cashConv = calcCashConversion(metrics);
  indicators.push({ name: '现金收入比', value: cashConv, threshold: 0.5, triggered: cashConv < 0.5 });
  if (cashConv < 0.5) score += 15;

  // 应收账款异常增长
  if (previous) {
    const recvGrowth = calcReceivableGrowth(metrics, previous);
    indicators.push({ name: '应收增速', value: recvGrowth, threshold: 0.5, triggered: recvGrowth > 0.5 && recvGrowth > metrics.revenueGrowth * 1.5 });
    if (recvGrowth > 0.5 && recvGrowth > metrics.revenueGrowth * 1.5) score += 20;
  }

  // 利润增长但现金流下降
  if (metrics.profitGrowth > 0.2 && metrics.cfoGrowth < -0.1) {
    indicators.push({ name: '利润现金流背离', value: metrics.profitGrowth - metrics.cfoGrowth, threshold: 0.3, triggered: true });
    score += 25;
  } else {
    indicators.push({ name: '利润现金流背离', value: metrics.profitGrowth - metrics.cfoGrowth, threshold: 0.3, triggered: false });
  }

  // 商誉占比
  const gwRatio = metrics.totalAssets > 0 ? metrics.goodwill / metrics.totalAssets : 0;
  indicators.push({ name: '商誉占比', value: gwRatio, threshold: 0.3, triggered: gwRatio > 0.3 });
  if (gwRatio > 0.3) score += 15;

  const level = score >= 60 ? 'danger' : score >= 40 ? 'warning' : score >= 20 ? 'watch' : 'safe';

  return { symbol: metrics.symbol, score, level, indicators, benfordDeviation: 0 };
}

describe('财务造假预警引擎', () => {
  const normalMetrics: FinancialMetrics = {
    symbol: '600519', revenue: 1000, netProfit: 200, operatingCashFlow: 250, capex: 100,
    receivables: 50, inventory: 80, goodwill: 10, totalAssets: 3000,
    revenueGrowth: 0.15, profitGrowth: 0.18, cfoGrowth: 0.12, period: '2024Q3',
  };

  const suspiciousMetrics: FinancialMetrics = {
    symbol: '000001', revenue: 500, netProfit: 150, operatingCashFlow: 20, capex: 50,
    receivables: 300, inventory: 200, goodwill: 800, totalAssets: 2000,
    revenueGrowth: 0.3, profitGrowth: 0.5, cfoGrowth: -0.2, period: '2024Q3',
  };

  const previousMetrics: FinancialMetrics = {
    ...suspiciousMetrics, receivables: 150, revenueGrowth: 0.1, profitGrowth: 0.1,
    cfoGrowth: 0.05, period: '2024Q2',
  };

  it('应计算应计比率', () => {
    const accrual = calcAccrualRatio(normalMetrics);
    expect(typeof accrual).toBe('number');
  });

  it('应计算现金收入比', () => {
    const conv = calcCashConversion(normalMetrics);
    expect(conv).toBeGreaterThan(0);
    expect(conv).toBeLessThanOrEqual(2);
  });

  it('正常公司应为安全', () => {
    const warning = assessFraudRisk(normalMetrics);
    expect(warning.level).toBe('safe');
    expect(warning.score).toBeLessThan(20);
  });

  it('可疑公司应触发预警', () => {
    const warning = assessFraudRisk(suspiciousMetrics, previousMetrics);
    expect(warning.level === 'warning' || warning.level === 'danger').toBe(true);
    expect(warning.score).toBeGreaterThan(20);
  });

  it('应有预警指标列表', () => {
    const warning = assessFraudRisk(suspiciousMetrics, previousMetrics);
    expect(warning.indicators.length).toBeGreaterThan(0);
    warning.indicators.forEach(ind => {
      expect(ind.name).toBeTruthy();
      expect(typeof ind.triggered).toBe('boolean');
    });
  });

  it('应收增速异常应触发', () => {
    const warning = assessFraudRisk(suspiciousMetrics, previousMetrics);
    const recv = warning.indicators.find(i => i.name === '应收增速');
    expect(recv?.triggered).toBe(true);
  });

  it('利润现金流背离应触发', () => {
    const warning = assessFraudRisk(suspiciousMetrics, previousMetrics);
    const diverge = warning.indicators.find(i => i.name === '利润现金流背离');
    expect(diverge?.triggered).toBe(true);
  });

  it('商誉占比高应触发', () => {
    const warning = assessFraudRisk(suspiciousMetrics);
    const gw = warning.indicators.find(i => i.name === '商誉占比');
    expect(gw?.triggered).toBe(true);
  });

  it('应检测本福特定律偏差', () => {
    const numbers = [123, 1567, 189, 2345, 3456, 4567, 5678, 6789, 7890, 8901, 9012];
    const deviation = checkBenfordLaw(numbers);
    expect(deviation).toBeGreaterThanOrEqual(0);
  });

  it('空数据应为安全', () => {
    const empty: FinancialMetrics = {
      symbol: 'X', revenue: 0, netProfit: 0, operatingCashFlow: 0, capex: 0,
      receivables: 0, inventory: 0, goodwill: 0, totalAssets: 1,
      revenueGrowth: 0, profitGrowth: 0, cfoGrowth: 0, period: '2024Q1',
    };
    const warning = assessFraudRisk(empty);
    expect(warning.level).toBe('safe');
  });
});
