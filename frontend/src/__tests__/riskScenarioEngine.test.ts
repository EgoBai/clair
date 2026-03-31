import { describe, it, expect } from 'vitest';

/**
 * 风险场景引擎测试
 */

interface Position {
  code: string;
  name: string;
  weight: number;
  beta: number;
  sector: string;
  volatility: number;
}

interface RiskScenario {
  name: string;
  marketMove: number;
  sectorShock?: Record<string, number>;
  volatilityChange?: number;
  correlation?: number;
}

interface ScenarioResult {
  scenario: string;
  portfolioImpact: number;
  positionImpacts: Array<{
    code: string;
    impact: number;
    contribution: number;
  }>;
  var95: number;
  maxDrawdown: number;
}

function runScenario(positions: Position[], scenario: RiskScenario): ScenarioResult {
  const positionImpacts = positions.map(p => {
    let impact = p.beta * scenario.marketMove;
    if (scenario.sectorShock && scenario.sectorShock[p.sector]) {
      impact += scenario.sectorShock[p.sector];
    }
    if (scenario.volatilityChange) {
      impact += p.volatility * scenario.volatilityChange * 0.1;
    }
    impact *= p.weight;
    return { code: p.code, impact, contribution: impact * p.weight };
  });

  const portfolioImpact = positionImpacts.reduce((s, p) => s + p.impact, 0);
  const variance = positionImpacts.reduce((s, p) => s + Math.pow(p.impact - portfolioImpact, 2), 0) / positions.length;
  const stdDev = Math.sqrt(variance);
  const var95 = portfolioImpact - 1.645 * stdDev;
  const maxDrawdown = Math.min(...positionImpacts.map(p => p.impact));

  return {
    scenario: scenario.name,
    portfolioImpact: Math.round(portfolioImpact * 10000) / 10000,
    positionImpacts,
    var95: Math.round(var95 * 10000) / 10000,
    maxDrawdown: Math.round(maxDrawdown * 10000) / 10000,
  };
}

function stressTest(positions: Position[], scenarios: RiskScenario[]): ScenarioResult[] {
  return scenarios.map(s => runScenario(positions, s));
}

function calcRiskBudget(positions: Position[]): {
  totalRisk: number;
  marginalRisk: Array<{ code: string; marginalContribution: number; percentContribution: number }>;
} {
  const totalVol = Math.sqrt(positions.reduce((s, p) => s + Math.pow(p.weight * p.volatility, 2), 0));
  const marginalRisk = positions.map(p => {
    const marginalContribution = (p.weight * p.volatility * p.volatility) / (totalVol || 1);
    return { code: p.code, marginalContribution, percentContribution: 0 };
  });
  const totalMarginal = marginalRisk.reduce((s, m) => s + m.marginalContribution, 0);
  marginalRisk.forEach(m => {
    m.percentContribution = totalMarginal > 0 ? m.marginalContribution / totalMarginal : 0;
  });
  return { totalRisk: totalVol, marginalRisk };
}

describe('Risk Scenario Engine', () => {
  const positions: Position[] = [
    { code: '600519', name: '贵州茅台', weight: 0.3, beta: 0.8, sector: '白酒', volatility: 0.25 },
    { code: '000001', name: '平安银行', weight: 0.25, beta: 1.2, sector: '银行', volatility: 0.3 },
    { code: '300750', name: '宁德时代', weight: 0.25, beta: 1.5, sector: '新能源', volatility: 0.4 },
    { code: '000858', name: '五粮液', weight: 0.2, beta: 0.9, sector: '白酒', volatility: 0.28 },
  ];

  const scenarios: RiskScenario[] = [
    { name: '大盘下跌5%', marketMove: -5 },
    { name: '大盘上涨3%', marketMove: 3 },
    { name: '白酒暴跌', marketMove: -2, sectorShock: { '白酒': -8 } },
    { name: '波动率飙升', marketMove: -3, volatilityChange: 5 },
  ];

  describe('场景运行', () => {
    it('应该计算投资组合影响', () => {
      const result = runScenario(positions, scenarios[0]);
      expect(result.portfolioImpact).toBeLessThan(0);
      expect(result.positionImpacts.length).toBe(4);
    });

    it('上涨场景应该有正影响', () => {
      const result = runScenario(positions, scenarios[1]);
      expect(result.portfolioImpact).toBeGreaterThan(0);
    });

    it('应该包含VaR和最大回撤', () => {
      const result = runScenario(positions, scenarios[0]);
      expect(typeof result.var95).toBe('number');
      expect(typeof result.maxDrawdown).toBe('number');
      expect(result.var95).toBeLessThanOrEqual(result.portfolioImpact);
    });

    it('行业冲击应该影响相关持仓', () => {
      const result = runScenario(positions, scenarios[2]);
      const baijiuPositions = result.positionImpacts.filter(p =>
        ['600519', '000858'].includes(p.code)
      );
      const nonBaijiuPositions = result.positionImpacts.filter(p =>
        !['600519', '000858'].includes(p.code)
      );
      const baijiuAvg = baijiuPositions.reduce((s, p) => s + p.impact, 0) / baijiuPositions.length;
      const otherAvg = nonBaijiuPositions.reduce((s, p) => s + p.impact, 0) / nonBaijiuPositions.length;
      expect(baijiuAvg).toBeLessThan(otherAvg);
    });
  });

  describe('压力测试', () => {
    it('应该返回所有场景的结果', () => {
      const results = stressTest(positions, scenarios);
      expect(results.length).toBe(scenarios.length);
    });

    it('每个场景应该有唯一名称', () => {
      const results = stressTest(positions, scenarios);
      const names = results.map(r => r.scenario);
      expect(new Set(names).size).toBe(names.length);
    });
  });

  describe('风险预算', () => {
    it('应该计算总风险', () => {
      const budget = calcRiskBudget(positions);
      expect(budget.totalRisk).toBeGreaterThan(0);
    });

    it('边际风险贡献百分比应该总和为1', () => {
      const budget = calcRiskBudget(positions);
      const totalPercent = budget.marginalRisk.reduce((s, m) => s + m.percentContribution, 0);
      expect(totalPercent).toBeCloseTo(1, 5);
    });

    it('高波动资产应该有更高边际风险贡献', () => {
      const budget = calcRiskBudget(positions);
      const byCode = Object.fromEntries(budget.marginalRisk.map(m => [m.code, m.marginalContribution]));
      // 宁德时代波动率最高
      expect(byCode['300750']).toBeGreaterThan(byCode['600519']);
    });
  });
});
