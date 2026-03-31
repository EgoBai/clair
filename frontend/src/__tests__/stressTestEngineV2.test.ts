/**
 * 组合压力测试引擎v2测试
 */
import { describe, it, expect } from 'vitest';
import { StressTestEngineV2 } from '../utils/stressTestEngineV2';
import type { Position, StressScenario } from '../utils/stressTestEngineV2';

describe('StressTestEngineV2', () => {
  const engine = new StressTestEngineV2();

  const samplePositions: Position[] = [
    { symbol: '600519', quantity: 100, currentPrice: 1800, sector: '消费', beta: 0.8 },
    { symbol: '000858', quantity: 200, currentPrice: 150, sector: '消费', beta: 0.9 },
    { symbol: '601318', quantity: 500, currentPrice: 50, sector: '金融', beta: 1.2 },
    { symbol: '300750', quantity: 150, currentPrice: 200, sector: '新能源', beta: 1.5 }
  ];

  const sectorMapping = new Map([
    ['消费', 'equity'],
    ['金融', 'equity'],
    ['新能源', 'equity']
  ]);

  describe('getPredefinedScenarios', () => {
    it('应该返回预定义场景', () => {
      const scenarios = StressTestEngineV2.getPredefinedScenarios();
      expect(scenarios.length).toBeGreaterThan(0);
      expect(scenarios[0].name).toBeTruthy();
      expect(scenarios[0].shocks.size).toBeGreaterThan(0);
    });
  });

  describe('runStressTest', () => {
    it('应该执行压力测试', () => {
      const scenario = StressTestEngineV2.getPredefinedScenarios()[0];
      const result = engine.runStressTest(samplePositions, scenario, sectorMapping);

      expect(result.scenario).toBe(scenario.name);
      expect(result.portfolioPnl).toBeLessThan(0); // 崩盘场景应亏损
      expect(result.portfolioPnlPercent).toBeLessThan(0);
      expect(result.positionPnls.size).toBe(4);
      expect(result.maxDrawdown).toBeGreaterThan(0);
      expect(result.marginCallRisk).toBeGreaterThanOrEqual(0);
      expect(result.marginCallRisk).toBeLessThanOrEqual(1);
    });

    it('温和调整的损失应小于崩盘', () => {
      const scenarios = StressTestEngineV2.getPredefinedScenarios();
      const crash = engine.runStressTest(samplePositions, scenarios[0], sectorMapping);
      const mild = engine.runStressTest(samplePositions, scenarios[5], sectorMapping);
      expect(Math.abs(mild.portfolioPnl)).toBeLessThan(Math.abs(crash.portfolioPnl));
    });
  });

  describe('analyzeSensitivity', () => {
    it('应该分析因子敏感性', () => {
      const factorBeta = new Map(samplePositions.map(p => [p.symbol, p.beta]));
      const result = engine.analyzeSensitivity(samplePositions, '市场', factorBeta);

      expect(result.factor).toBe('市场');
      expect(typeof result.impact1bps).toBe('number');
      expect(typeof result.impact100bps).toBe('number');
      expect(typeof result.impact500bps).toBe('number');
      expect(result.impact500bps).toBeGreaterThan(result.impact100bps);
      expect(result.elasticity).toBeGreaterThan(0);
    });
  });

  describe('reverseStressTest', () => {
    it('应该执行反向压力测试', () => {
      const result = engine.reverseStressTest(samplePositions, 10, sectorMapping);

      expect(result.targetLoss).toBeGreaterThan(0);
      expect(result.requiredShock.size).toBeGreaterThan(0);
      expect(result.probability).toBeGreaterThan(0);
      expect(result.probability).toBeLessThanOrEqual(1);
      expect(result.scenario).toBeTruthy();
    });

    it('更大损失应需要更大冲击', () => {
      const small = engine.reverseStressTest(samplePositions, 5, sectorMapping);
      const large = engine.reverseStressTest(samplePositions, 20, sectorMapping);
      const smallShock = Math.abs(small.requiredShock.get('equity') || 0);
      const largeShock = Math.abs(large.requiredShock.get('equity') || 0);
      expect(largeShock).toBeGreaterThan(smallShock);
    });
  });

  describe('calculatePortfolioGreeks', () => {
    it('应该计算组合Greeks', () => {
      const result = engine.calculatePortfolioGreeks(samplePositions);

      expect(result.delta).toBeGreaterThan(0); // 纯多头
      expect(result.portfolioBeta).toBeGreaterThan(0);
      expect(result.concentrationRisk).toBeGreaterThan(0);
      expect(result.concentrationRisk).toBeLessThanOrEqual(1);
    });

    it('空组合应返回零值', () => {
      const result = engine.calculatePortfolioGreeks([]);
      expect(result.delta).toBe(0);
      expect(result.portfolioBeta).toBe(0);
    });
  });

  describe('runBatchStressTest', () => {
    it('应该批量执行所有预定义场景', () => {
      const results = engine.runBatchStressTest(samplePositions, sectorMapping);
      const scenarios = StressTestEngineV2.getPredefinedScenarios();

      expect(results.length).toBe(scenarios.length);
      expect(results[0].scenario).toBeTruthy();
    });
  });
});
