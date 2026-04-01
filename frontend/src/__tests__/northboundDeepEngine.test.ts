import { describe, it, expect } from 'vitest';
import { NorthboundFundEngine } from '../utils/northboundDeepEngine';
import type { NorthboundFlow, NorthboundHolding } from '../utils/northboundDeepEngine';

describe('北向资金深度分析引擎', () => {
  const engine = new NorthboundFundEngine();

  const createFlow = (overrides: Partial<NorthboundFlow> = {}): NorthboundFlow => ({
    date: '2024-01-15',
    netBuy: 50,
    buyAmount: 500,
    sellAmount: 450,
    channel: 'total',
    ...overrides
  });

  const createHolding = (overrides: Partial<NorthboundHolding> = {}): NorthboundHolding => ({
    stockCode: '000001',
    stockName: '平安银行',
    shares: 10000,
    marketValue: 100,
    percentOfFloat: 5,
    changeFromPrev: 1.2,
    industry: '银行',
    ...overrides
  });

  describe('calculateSignal', () => {
    it('空数据返回中性信号', () => {
      const result = engine.calculateSignal([], []);
      expect(result.signal).toBe('neutral');
      expect(result.confidence).toBe(0);
    });

    it('连续大额净买入→买入信号', () => {
      const flows = Array.from({ length: 30 }, (_, i) => 
        createFlow({ date: `2024-01-${String(i + 1).padStart(2, '0')}`, netBuy: 100 + i * 5 })
      );
      const result = engine.calculateSignal(flows, []);
      expect(['buy', 'strong_buy']).toContain(result.signal);
    });

    it('连续净卖出→卖出信号', () => {
      const flows = Array.from({ length: 30 }, (_, i) => 
        createFlow({ date: `2024-01-${String(i + 1).padStart(2, '0')}`, netBuy: -50 - i * 2 })
      );
      const result = engine.calculateSignal(flows, []);
      expect(['sell', 'strong_sell']).toContain(result.signal);
    });

    it('包含5日和20日净流入', () => {
      const flows = Array.from({ length: 25 }, (_, i) => 
        createFlow({ date: `2024-01-${String(i + 1).padStart(2, '0')}`, netBuy: 30 })
      );
      const result = engine.calculateSignal(flows, []);
      expect(result.netFlow5D).toBe(150);
      expect(result.netFlow20D).toBe(600);
    });

    it('confidence在0-100之间', () => {
      const flows = Array.from({ length: 25 }, (_, i) => 
        createFlow({ date: `2024-01-${String(i + 1).padStart(2, '0')}`, netBuy: 50 })
      );
      const result = engine.calculateSignal(flows, []);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(100);
    });

    it('广度计算正确', () => {
      const holdings = [
        createHolding({ changeFromPrev: 1 }),
        createHolding({ changeFromPrev: 2 }),
        createHolding({ changeFromPrev: -1 }),
      ];
      const result = engine.calculateSignal([createFlow()], holdings);
      expect(result.breadth).toBeCloseTo(2 / 3);
    });
  });

  describe('analyzeStock', () => {
    it('返回个股分析', () => {
      const holdings = [
        createHolding({ stockCode: '000001', changeFromPrev: 1 }),
        createHolding({ stockCode: '000001', changeFromPrev: 2 }),
      ];
      const result = engine.analyzeStock(holdings, '000001');
      expect(result).not.toBeNull();
      expect(result!.stockCode).toBe('000001');
    });

    it('无持仓返回null', () => {
      const result = engine.analyzeStock([createHolding()], '999999');
      expect(result).toBeNull();
    });

    it('趋势分类正确', () => {
      const holdings = Array.from({ length: 20 }, () => 
        createHolding({ changeFromPrev: 3 })
      );
      const result = engine.analyzeStock(holdings, '000001');
      expect(result!.flowTrend).toBe('accumulating');
    });

    it('聪明钱评分在0-100之间', () => {
      const holdings = [createHolding()];
      const result = engine.analyzeStock(holdings, '000001');
      expect(result!.smartMoneyScore).toBeGreaterThanOrEqual(0);
      expect(result!.smartMoneyScore).toBeLessThanOrEqual(100);
    });

    it('外资偏好度计算', () => {
      const high = engine.analyzeStock([createHolding({ percentOfFloat: 10 })], '000001');
      const low = engine.analyzeStock([createHolding({ percentOfFloat: 1 })], '000001');
      expect(high!.foreignPreference).toBeGreaterThan(low!.foreignPreference);
    });
  });

  describe('industryDistribution', () => {
    it('行业分布排序', () => {
      const holdings = [
        createHolding({ industry: '银行', marketValue: 200 }),
        createHolding({ industry: '科技', marketValue: 500 }),
        createHolding({ industry: '银行', marketValue: 100 }),
      ];
      const result = engine.industryDistribution(holdings);
      expect(result[0].industry).toBe('科技');
      expect(result[0].totalValue).toBe(500);
    });

    it('汇总市值正确', () => {
      const holdings = [
        createHolding({ industry: '银行', marketValue: 200 }),
        createHolding({ industry: '银行', marketValue: 100 }),
      ];
      const result = engine.industryDistribution(holdings);
      expect(result[0].totalValue).toBe(300);
    });

    it('空数据返回空数组', () => {
      expect(engine.industryDistribution([])).toEqual([]);
    });
  });

  describe('detectAnomalies', () => {
    it('检测异常流量', () => {
      const flows = [
        ...Array.from({ length: 20 }, (_, i) => 
          createFlow({ date: `2024-01-${String(i + 1).padStart(2, '0')}`, netBuy: 10 })
        ),
        createFlow({ date: '2024-01-21', netBuy: 500 }), // 异常大
      ];
      const result = engine.detectAnomalies(flows);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].type).toBe('surge');
    });

    it('数据不足返回空', () => {
      const flows = Array.from({ length: 5 }, (_, i) => createFlow({ date: `2024-01-0${i + 1}` }));
      expect(engine.detectAnomalies(flows)).toEqual([]);
    });

    it('包含z-score', () => {
      const flows = [
        ...Array.from({ length: 20 }, (_, i) => 
          createFlow({ date: `2024-01-${String(i + 1).padStart(2, '0')}`, netBuy: 10 })
        ),
        createFlow({ date: '2024-01-21', netBuy: 200 }),
      ];
      const result = engine.detectAnomalies(flows);
      result.forEach(a => {
        expect(Math.abs(a.zScore)).toBeGreaterThan(2);
      });
    });

    it('暴跌检测', () => {
      const flows = [
        ...Array.from({ length: 20 }, (_, i) => 
          createFlow({ date: `2024-01-${String(i + 1).padStart(2, '0')}`, netBuy: 10 })
        ),
        createFlow({ date: '2024-01-21', netBuy: -500 }),
      ];
      const result = engine.detectAnomalies(flows);
      const plunge = result.find(a => a.type === 'plunge');
      expect(plunge).toBeDefined();
    });
  });

  describe('timingBacktest', () => {
    it('返回回测结果', () => {
      const flows = Array.from({ length: 50 }, (_, i) => ({
        date: `2024-01-${String(i + 1).padStart(2, '0')}`,
        netBuy: Math.sin(i / 5) * 50,
        buyAmount: 100,
        sellAmount: 50,
        channel: 'total' as const
      }));
      const prices = Array.from({ length: 50 }, (_, i) => ({
        date: `2024-01-${String(i + 1).padStart(2, '0')}`,
        close: 10 + Math.sin(i / 5) * 2
      }));
      const result = engine.timingBacktest(flows, prices);
      expect(typeof result.totalReturn).toBe('number');
      expect(result.trades).toBeGreaterThanOrEqual(0);
    });

    it('数据不足返回零值', () => {
      const result = engine.timingBacktest([createFlow()], [{ date: '2024-01-01', close: 10 }]);
      expect(result.totalReturn).toBe(0);
      expect(result.trades).toBe(0);
    });

    it('winRate在0-100之间', () => {
      const flows = Array.from({ length: 50 }, (_, i) => 
        createFlow({ date: `2024-01-${String(i + 1).padStart(2, '0')}`, netBuy: (i % 5 === 0 ? -30 : 20) })
      );
      const prices = Array.from({ length: 50 }, (_, i) => ({
        date: `2024-01-${String(i + 1).padStart(2, '0')}`,
        close: 10 + i * 0.1
      }));
      const result = engine.timingBacktest(flows, prices);
      expect(result.winRate).toBeGreaterThanOrEqual(0);
      expect(result.winRate).toBeLessThanOrEqual(100);
    });
  });
});
