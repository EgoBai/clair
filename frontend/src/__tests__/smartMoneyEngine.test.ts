import { describe, it, expect } from 'vitest';
import {
  analyzeSmartMoney,
  summarizeMoneyFlow,
  analyzeInstitutionalBehavior,
  MoneyFlow,
} from '../utils/smartMoneyEngine';

function makeFlows(overrides: Partial<MoneyFlow> = {}): MoneyFlow[] {
  return Array.from({ length: 20 }, (_, i) => ({
    date: `2026-03-${String(i + 1).padStart(2, '0')}`,
    ticker: '600519',
    institutional: 5000 + Math.random() * 3000,
    northbound: 2000 + Math.random() * 1500,
    mainForce: 1000 + Math.random() * 2000,
    retail: -3000 + Math.random() * 1000,
    hotMoney: Math.random() * 5000,
    volume: 1e6 + Math.random() * 5e5,
    price: 1800 + Math.sin(i * 0.3) * 50,
    ...overrides,
  }));
}

describe('Smart Money Engine', () => {
  describe('analyzeSmartMoney', () => {
    it('应分析资金信号', () => {
      const flows = makeFlows();
      const signal = analyzeSmartMoney(flows);
      expect(signal.ticker).toBe('600519');
      expect(signal.score).toBeGreaterThan(0); // 正流入
      expect(['strong_inflow', 'inflow', 'neutral']).toContain(signal.signal);
    });

    it('应检测资金流出', () => {
      const flows = makeFlows({ institutional: -5000, northbound: -2000, mainForce: -1000 });
      const signal = analyzeSmartMoney(flows);
      expect(signal.score).toBeLessThan(0);
      expect(['outflow', 'strong_outflow']).toContain(signal.signal);
    });

    it('应计算持续天数', () => {
      const flows = makeFlows();
      const signal = analyzeSmartMoney(flows);
      expect(signal.duration).toBeGreaterThanOrEqual(0);
      expect(signal.duration).toBeLessThanOrEqual(20);
    });

    it('应计算信心度', () => {
      const flows = makeFlows();
      const signal = analyzeSmartMoney(flows);
      expect(signal.confidence).toBeGreaterThanOrEqual(0);
      expect(signal.confidence).toBeLessThanOrEqual(1);
    });

    it('应生成驱动因素', () => {
      const flows = makeFlows();
      const signal = analyzeSmartMoney(flows);
      expect(signal.drivers.length).toBeGreaterThan(0);
    });

    it('应处理空数组', () => {
      const signal = analyzeSmartMoney([]);
      expect(signal.signal).toBe('neutral');
      expect(signal.score).toBe(0);
    });
  });

  describe('summarizeMoneyFlow', () => {
    it('应汇总资金流向', () => {
      const summary = summarizeMoneyFlow(makeFlows());
      expect(summary.ticker).toBe('600519');
      expect(typeof summary.totalInflow).toBe('number');
      expect(typeof summary.avgDailyFlow).toBe('number');
    });

    it('应判断资金趋势', () => {
      const summary = summarizeMoneyFlow(makeFlows());
      expect(['accelerating', 'stable', 'decelerating', 'reversing']).toContain(summary.flowTrend);
    });

    it('应计算机构主导度', () => {
      const summary = summarizeMoneyFlow(makeFlows());
      expect(summary.institutionalDominance).toBeGreaterThanOrEqual(0);
      expect(summary.institutionalDominance).toBeLessThanOrEqual(100);
    });

    it('应判断北向趋势', () => {
      const summary = summarizeMoneyFlow(makeFlows());
      expect(['accumulating', 'holding', 'reducing']).toContain(summary.northboundTrend);
    });

    it('应判断游资活跃度', () => {
      const summary = summarizeMoneyFlow(makeFlows());
      expect(['active', 'normal', 'quiet']).toContain(summary.hotMoneyActivity);
    });

    it('应识别关键日', () => {
      const flows = makeFlows();
      flows[10].institutional = 50000; // 突放大额流入
      const summary = summarizeMoneyFlow(flows);
      expect(summary.keyDays.length).toBeGreaterThanOrEqual(1);
    });

    it('应计算价量相关性', () => {
      const summary = summarizeMoneyFlow(makeFlows());
      expect(summary.correlation.priceFlow).toBeGreaterThanOrEqual(-1);
      expect(summary.correlation.priceFlow).toBeLessThanOrEqual(1);
    });
  });

  describe('analyzeInstitutionalBehavior', () => {
    it('应分析机构行为', () => {
      const behavior = analyzeInstitutionalBehavior(makeFlows(), 1850);
      expect(behavior.ticker).toBe('600519');
      expect(typeof behavior.holdingChange).toBe('number');
      expect(typeof behavior.avgCost).toBe('number');
    });

    it('应判断机构行为类型', () => {
      const behavior = analyzeInstitutionalBehavior(makeFlows(), 1850);
      expect(['accumulating', 'distributing', 'holding', 'panic_selling']).toContain(behavior.behavior);
    });

    it('应计算盈亏', () => {
      const behavior = analyzeInstitutionalBehavior(makeFlows(), 1850);
      expect(typeof behavior.profitLoss).toBe('number');
    });

    it('应估算目标价', () => {
      const behavior = analyzeInstitutionalBehavior(makeFlows(), 1850);
      expect(behavior.estimatedTarget).toBeGreaterThan(0);
    });

    it('应计算信心度', () => {
      const behavior = analyzeInstitutionalBehavior(makeFlows(), 1850);
      expect(behavior.conviction).toBeGreaterThanOrEqual(0);
      expect(behavior.conviction).toBeLessThanOrEqual(100);
    });

    it('应处理空数据', () => {
      const behavior = analyzeInstitutionalBehavior([], 100);
      expect(behavior.behavior).toBe('holding');
      expect(behavior.avgCost).toBe(100);
    });
  });
});
