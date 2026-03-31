/**
 * 交易成本分析引擎测试
 */
import { describe, it, expect } from 'vitest';
import { TradeCostEngine } from '../utils/tradeCostEngineV3';
import type { TradeExecution } from '../utils/tradeCostEngineV3';

describe('TradeCostEngine', () => {
  const engine = new TradeCostEngine();

  const generateExecutions = (count: number): TradeExecution[] => {
    return Array.from({ length: count }, (_, i) => {
      const mid = 100 + (Math.random() - 0.5) * 5;
      const side = Math.random() > 0.5 ? 'buy' as const : 'sell' as const;
      const slippage = (Math.random() - 0.3) * 0.1;
      return {
        symbol: '600519',
        side,
        quantity: Math.floor(100 + Math.random() * 9900),
        limitPrice: mid,
        executedPrice: mid + (side === 'buy' ? slippage : -slippage),
        timestamp: Date.now() + i * 1000,
        venue: ['上交所', '深交所', '北交所'][Math.floor(Math.random() * 3)],
        orderType: 'limit' as const
      };
    });
  };

  const buildMidPrices = (executions: TradeExecution[]): Map<number, number> => {
    const map = new Map<number, number>();
    for (const e of executions) {
      map.set(e.timestamp, e.limitPrice);
    }
    return map;
  };

  describe('analyzeSlippage', () => {
    it('应该分析滑点', () => {
      const execs = generateExecutions(50);
      const midPrices = buildMidPrices(execs);
      const result = engine.analyzeSlippage(execs, midPrices);

      expect(typeof result.avgSlippage).toBe('number');
      expect(result.maxSlippage).toBeGreaterThanOrEqual(0);
      expect(result.slippageStd).toBeGreaterThanOrEqual(0);
      expect(typeof result.slippageBySide.buy).toBe('number');
      expect(typeof result.slippageBySide.sell).toBe('number');
      expect(typeof result.costInBps).toBe('number');
    });

    it('空数据应返回零值', () => {
      const result = engine.analyzeSlippage([], new Map());
      expect(result.avgSlippage).toBe(0);
      expect(result.maxSlippage).toBe(0);
    });

    it('应按交易规模分类', () => {
      const execs = generateExecutions(100);
      const midPrices = buildMidPrices(execs);
      const result = engine.analyzeSlippage(execs, midPrices);

      expect(typeof result.slippageBySize.small).toBe('number');
      expect(typeof result.slippageBySize.medium).toBe('number');
      expect(typeof result.slippageBySize.large).toBe('number');
    });
  });

  describe('estimateMarketImpact', () => {
    it('应该估算市场冲击', () => {
      const result = engine.estimateMarketImpact(10000, 1000000, 0.02, 0.001);

      expect(result.temporaryImpact).toBeGreaterThan(0);
      expect(result.permanentImpact).toBeGreaterThan(0);
      expect(result.totalImpact).toBeGreaterThan(0);
      expect(result.totalImpact).toBeGreaterThanOrEqual(result.temporaryImpact + result.permanentImpact);
      expect(result.impactByVolume.length).toBe(6);
      expect(result.optimalExecutionTime).toBeGreaterThan(0);
      expect(result.participationRate).toBeGreaterThan(0);
    });

    it('零订单量应返回零冲击', () => {
      const result = engine.estimateMarketImpact(0, 1000000, 0.02, 0.001);
      expect(result.totalImpact).toBe(0);
    });

    it('大订单应产生更大冲击', () => {
      const small = engine.estimateMarketImpact(1000, 1000000, 0.02, 0.001);
      const large = engine.estimateMarketImpact(100000, 1000000, 0.02, 0.001);
      expect(large.totalImpact).toBeGreaterThan(small.totalImpact);
    });
  });

  describe('analyzeVenues', () => {
    it('应该分析交易所表现', () => {
      const execs = generateExecutions(50);
      const midPrices = buildMidPrices(execs);
      const result = engine.analyzeVenues(execs, midPrices);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].venue).toBeTruthy();
      expect(result[0].fillRate).toBeGreaterThanOrEqual(0);
      expect(result[0].fillRate).toBeLessThanOrEqual(1);
      expect(result[0].avgLatency).toBeGreaterThan(0);
      expect(result[0].priceImprovement).toBeGreaterThanOrEqual(0);
    });

    it('空数据应返回空数组', () => {
      const result = engine.analyzeVenues([], new Map());
      expect(result.length).toBe(0);
    });
  });

  describe('scoreExecutionQuality', () => {
    it('应该评分执行质量', () => {
      const execs = generateExecutions(50);
      const midPrices = buildMidPrices(execs);
      const result = engine.scoreExecutionQuality(execs, midPrices);

      expect(result.overall).toBeGreaterThanOrEqual(0);
      expect(result.overall).toBeLessThanOrEqual(100);
      expect(result.slippageScore).toBeGreaterThanOrEqual(0);
      expect(result.timingScore).toBeGreaterThanOrEqual(0);
      expect(result.venueScore).toBeGreaterThanOrEqual(0);
      expect(result.costEfficiencyScore).toBeGreaterThanOrEqual(0);
      expect(result.recommendation).toBeTruthy();
    });

    it('空数据应返回零分', () => {
      const result = engine.scoreExecutionQuality([], new Map());
      expect(result.overall).toBe(0);
      expect(result.recommendation).toBe('无交易数据');
    });
  });

  describe('decomposeCosts', () => {
    it('应该分解交易成本', () => {
      const exec: TradeExecution = {
        symbol: '600519',
        side: 'buy',
        quantity: 1000,
        limitPrice: 100,
        executedPrice: 100.05,
        timestamp: Date.now(),
        venue: '上交所',
        orderType: 'limit'
      };

      const result = engine.decomposeCosts(exec, 100);

      expect(result.explicitCosts.commission).toBeGreaterThan(0);
      expect(result.explicitCosts.exchangeFee).toBeGreaterThan(0);
      expect(result.explicitCosts.secFee).toBeGreaterThan(0);
      expect(result.explicitCosts.stampTax).toBe(0); // 买入无印花税
      expect(result.implicitCosts.spreadCost).toBeGreaterThanOrEqual(0);
      expect(result.totalCostBps).toBeGreaterThan(0);
      expect(result.costPerShare).toBeGreaterThan(0);
    });

    it('卖出应有印花税', () => {
      const exec: TradeExecution = {
        symbol: '600519',
        side: 'sell',
        quantity: 1000,
        limitPrice: 100,
        executedPrice: 99.95,
        timestamp: Date.now(),
        venue: '上交所',
        orderType: 'limit'
      };

      const result = engine.decomposeCosts(exec, 100);
      expect(result.explicitCosts.stampTax).toBeGreaterThan(0);
    });
  });
});
