import { describe, it, expect } from 'vitest';
import {
  runStressTest,
  runMultiScenarioStressTest,
  getPredefinedScenarios,
  createCustomScenario,
  sensitivityAnalysis,
  StressScenario,
  PortfolioPosition,
} from '../utils/stressTestEngine';

function makePositions(): PortfolioPosition[] {
  return [
    { ticker: '600519', sector: '消费', weight: 30, beta: 0.8, currentPrice: 1800, shares: 100 },
    { ticker: '000858', sector: '消费', weight: 20, beta: 1.1, currentPrice: 150, shares: 1000 },
    { ticker: '601318', sector: '金融', weight: 25, beta: 1.2, currentPrice: 50, shares: 3000 },
    { ticker: '300750', sector: '科技', weight: 25, beta: 1.5, currentPrice: 200, shares: 500 },
  ];
}

const testScenario: StressScenario = {
  id: 'test',
  name: '测试情景',
  type: 'hypothetical',
  description: '测试用',
  marketShock: -20,
  sectorShocks: { '金融': -30, '科技': -35, '消费': -15 },
  volatilityMultiplier: 2,
};

describe('Stress Test Engine', () => {
  describe('runStressTest', () => {
    it('应计算组合冲击', () => {
      const result = runStressTest(makePositions(), testScenario);
      expect(result.portfolioImpact).toBeLessThan(0);
      expect(result.positionImpacts.length).toBe(4);
    });

    it('应计算VaR', () => {
      const result = runStressTest(makePositions(), testScenario);
      expect(result.var95).toBeLessThan(0);
      expect(result.var99).toBeLessThan(result.var95);
    });

    it('应计算预期最大回撤', () => {
      const result = runStressTest(makePositions(), testScenario);
      expect(result.maxDrawdown).toBeLessThan(0);
      expect(Math.abs(result.maxDrawdown)).toBeGreaterThanOrEqual(Math.abs(result.portfolioImpact));
    });

    it('应估算恢复天数', () => {
      const result = runStressTest(makePositions(), testScenario);
      expect(result.recoveryDays).toBeGreaterThan(0);
    });

    it('应计算各持仓冲击', () => {
      const result = runStressTest(makePositions(), testScenario);
      const techPos = result.positionImpacts.find(p => p.ticker === '300750');
      expect(techPos).toBeDefined();
      expect(techPos!.impact).toBeLessThan(0);
      expect(techPos!.newPrice).toBeGreaterThan(0);
    });

    it('应考虑Beta调整', () => {
      const positions = makePositions();
      const result = runStressTest(positions, testScenario);
      // 高Beta持仓冲击应更大
      const tech = result.positionImpacts.find(p => p.ticker === '300750')!;
      const consumer = result.positionImpacts.find(p => p.ticker === '600519')!;
      expect(Math.abs(tech.impact)).toBeGreaterThan(Math.abs(consumer.impact));
    });
  });

  describe('runMultiScenarioStressTest', () => {
    it('应运行所有预设情景', () => {
      const result = runMultiScenarioStressTest(makePositions());
      expect(result.results.length).toBeGreaterThanOrEqual(5);
    });

    it('应识别最差/最佳情景', () => {
      const result = runMultiScenarioStressTest(makePositions());
      expect(result.worstCase.portfolioImpact).toBeLessThanOrEqual(result.bestCase.portfolioImpact);
    });

    it('应计算平均冲击', () => {
      const result = runMultiScenarioStressTest(makePositions());
      expect(typeof result.averageImpact).toBe('number');
      expect(result.averageImpact).toBeLessThan(0);
    });

    it('应计算尾部风险', () => {
      const result = runMultiScenarioStressTest(makePositions());
      expect(result.tailRisk).toBeLessThan(result.worstCase.portfolioImpact);
    });

    it('应生成风险建议', () => {
      const result = runMultiScenarioStressTest(makePositions());
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it('应支持自定义情景列表', () => {
      const customScenario = createCustomScenario('极端下跌', -50);
      const result = runMultiScenarioStressTest(makePositions(), [customScenario]);
      expect(result.results.length).toBe(1);
      expect(result.worstCase.scenario.name).toBe('极端下跌');
    });
  });

  describe('getPredefinedScenarios', () => {
    it('应返回预设情景列表', () => {
      const scenarios = getPredefinedScenarios();
      expect(scenarios.length).toBeGreaterThanOrEqual(5);
      expect(scenarios.some(s => s.name.includes('2008'))).toBe(true);
      expect(scenarios.some(s => s.name.includes('疫情'))).toBe(true);
    });
  });

  describe('createCustomScenario', () => {
    it('应创建自定义情景', () => {
      const scenario = createCustomScenario('测试', -30);
      expect(scenario.name).toBe('测试');
      expect(scenario.marketShock).toBe(-30);
      expect(scenario.type).toBe('hypothetical');
    });

    it('应支持可选参数', () => {
      const scenario = createCustomScenario('测试', -30, {
        sectorShocks: { '银行': -50 },
        volatilityMultiplier: 3,
      });
      expect(scenario.sectorShocks!['银行']).toBe(-50);
      expect(scenario.volatilityMultiplier).toBe(3);
    });
  });

  describe('sensitivityAnalysis', () => {
    it('应计算各持仓风险贡献', () => {
      const analysis = sensitivityAnalysis(makePositions(), testScenario);
      expect(analysis.length).toBe(4);
      analysis.forEach(a => {
        expect(a.riskContribution).toBeGreaterThan(0);
        expect(a.marginalVar).toBeGreaterThan(0);
        expect(a.componentVar).toBeGreaterThan(0);
      });
    });

    it('应按风险贡献排序', () => {
      const analysis = sensitivityAnalysis(makePositions(), testScenario);
      for (let i = 1; i < analysis.length; i++) {
        expect(analysis[i - 1].riskContribution).toBeGreaterThanOrEqual(analysis[i].riskContribution);
      }
    });
  });
});
