import { describe, it, expect } from 'vitest';

// 投资组合压力测试引擎
interface StressScenario {
  name: string;
  stockShock: number;
  bondShock: number;
  fxShock: number;
  rateShock: number;
  volShock: number;
}

interface PortfolioPosition {
  symbol: string;
  type: 'stock' | 'bond' | 'cash';
  value: number;
  beta: number;
  duration?: number;
  currency?: string;
}

interface StressResult {
  scenario: string;
  originalValue: number;
  stressedValue: number;
  pnl: number;
  pnlPercent: number;
  worstPosition: string;
}

const defaultScenarios: StressScenario[] = [
  { name: '2008金融危机', stockShock: -0.5, bondShock: 0.1, fxShock: -0.15, rateShock: -0.02, volShock: 0.8 },
  { name: '2015A股暴跌', stockShock: -0.4, bondShock: 0.05, fxShock: -0.05, rateShock: -0.01, volShock: 0.6 },
  { name: '2020疫情冲击', stockShock: -0.35, bondShock: 0.08, fxShock: -0.08, rateShock: -0.015, volShock: 0.7 },
  { name: '利率飙升', stockShock: -0.15, bondShock: -0.2, fxShock: 0.05, rateShock: 0.03, volShock: 0.3 },
  { name: '通胀失控', stockShock: -0.1, bondShock: -0.15, fxShock: -0.1, rateShock: 0.04, volShock: 0.5 },
];

function applyStress(positions: PortfolioPosition[], scenario: StressScenario): StressResult {
  const originalValue = positions.reduce((s, p) => s + p.value, 0);
  let stressedValue = 0;
  let worstPnl = Infinity;
  let worstPosition = '';

  positions.forEach(p => {
    let shock = 0;
    if (p.type === 'stock') shock = scenario.stockShock * (p.beta || 1);
    else if (p.type === 'bond') shock = scenario.bondShock + (scenario.rateShock * (-(p.duration || 5)));
    else shock = 0;

    const posValue = p.value * (1 + shock);
    stressedValue += posValue;
    const posPnl = posValue - p.value;
    if (posPnl < worstPnl) {
      worstPnl = posPnl;
      worstPosition = p.symbol;
    }
  });

  const pnl = stressedValue - originalValue;
  return {
    scenario: scenario.name,
    originalValue,
    stressedValue,
    pnl,
    pnlPercent: originalValue > 0 ? (pnl / originalValue) * 100 : 0,
    worstPosition,
  };
}

function runAllScenarios(positions: PortfolioPosition[], scenarios: StressScenario[] = defaultScenarios): StressResult[] {
  return scenarios.map(s => applyStress(positions, s));
}

function calcMaxDrawdown(results: StressResult[]): number {
  return Math.min(...results.map(r => r.pnlPercent));
}

function calcVaR(positions: PortfolioPosition[], confidence: number = 0.95): number {
  const baseValue = positions.reduce((s, p) => s + p.value, 0);
  const avgBeta = positions.reduce((s, p) => s + p.beta * p.value, 0) / (baseValue || 1);
  const zScore = confidence === 0.95 ? 1.645 : confidence === 0.99 ? 2.326 : 1.645;
  const dailyVol = 0.02; // 假设日波动率2%
  return baseValue * dailyVol * avgBeta * zScore;
}

describe('投资组合压力测试引擎', () => {
  const positions: PortfolioPosition[] = [
    { symbol: '600519', type: 'stock', value: 500000, beta: 0.8 },
    { symbol: '000858', type: 'stock', value: 300000, beta: 1.1 },
    { symbol: '国债ETF', type: 'bond', value: 200000, beta: 0, duration: 5 },
    { symbol: '现金', type: 'cash', value: 100000, beta: 0 },
  ];

  it('应执行单个压力测试', () => {
    const result = applyStress(positions, defaultScenarios[0]);
    expect(result.scenario).toBe('2008金融危机');
    expect(result.originalValue).toBe(1100000);
    expect(result.stressedValue).toBeLessThan(result.originalValue);
    expect(result.pnl).toBeLessThan(0);
  });

  it('应运行所有场景', () => {
    const results = runAllScenarios(positions);
    expect(results.length).toBe(defaultScenarios.length);
    results.forEach(r => {
      expect(r.originalValue).toBe(1100000);
      expect(r.pnlPercent).toBeDefined();
    });
  });

  it('现金不受股票冲击影响', () => {
    const cashOnly: PortfolioPosition[] = [{ symbol: '现金', type: 'cash', value: 100000, beta: 0 }];
    const result = applyStress(cashOnly, defaultScenarios[0]);
    expect(result.pnl).toBe(0);
  });

  it('高beta股票损失更大', () => {
    const highBeta: PortfolioPosition[] = [{ symbol: 'A', type: 'stock', value: 100000, beta: 2 }];
    const lowBeta: PortfolioPosition[] = [{ symbol: 'B', type: 'stock', value: 100000, beta: 0.5 }];
    const shock: StressScenario = { name: 'test', stockShock: -0.2, bondShock: 0, fxShock: 0, rateShock: 0, volShock: 0 };
    const highResult = applyStress(highBeta, shock);
    const lowResult = applyStress(lowBeta, shock);
    expect(highResult.pnl).toBeLessThan(lowResult.pnl);
  });

  it('债券受利率冲击', () => {
    const bondOnly: PortfolioPosition[] = [{ symbol: '债', type: 'bond', value: 100000, beta: 0, duration: 10 }];
    const shock: StressScenario = { name: '利率', stockShock: 0, bondShock: 0, fxShock: 0, rateShock: 0.02, volShock: 0 };
    const result = applyStress(bondOnly, shock);
    expect(result.pnl).toBeLessThan(0); // 利率上升→债券价格下跌
  });

  it('应计算最大回撤', () => {
    const results = runAllScenarios(positions);
    const maxDD = calcMaxDrawdown(results);
    expect(maxDD).toBeLessThan(0);
  });

  it('应计算VaR', () => {
    const var95 = calcVaR(positions, 0.95);
    const var99 = calcVaR(positions, 0.99);
    expect(var95).toBeGreaterThan(0);
    expect(var99).toBeGreaterThan(var95);
  });

  it('应识别最差持仓', () => {
    const result = applyStress(positions, defaultScenarios[0]);
    expect(result.worstPosition).toBeTruthy();
  });

  it('空组合应返回零值', () => {
    const result = applyStress([], defaultScenarios[0]);
    expect(result.originalValue).toBe(0);
    expect(result.stressedValue).toBe(0);
    expect(result.pnl).toBe(0);
  });

  it('不同场景应产生不同结果', () => {
    const results = runAllScenarios(positions);
    const pnls = new Set(results.map(r => r.pnl));
    expect(pnls.size).toBeGreaterThan(1);
  });
});
