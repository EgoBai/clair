import { describe, it, expect } from 'vitest';
import { BuybackEngine, type BuybackPlan } from '../utils/buybackAnalysisEngine';

describe('回购分析引擎', () => {
  const engine = new BuybackEngine();

  const createPlan = (overrides: Partial<BuybackPlan> = {}): BuybackPlan => ({
    stockCode: '000001',
    stockName: '平安银行',
    announceDate: '2024-01-01',
    planAmount: 100000,
    minPrice: 10,
    maxPrice: 15,
    purpose: 'stabilize_price',
    duration: 12,
    actualAmount: 50000,
    actualShares: 5000,
    avgBuybackPrice: 10,
    status: 'in_progress',
    ...overrides
  });

  describe('analyzeBuyback', () => {
    it('计算完成率', () => {
      const result = engine.analyzeBuyback(createPlan(), 12);
      expect(result.completionRate).toBeCloseTo(50);
    });

    it('价格吸引力计算', () => {
      const high = engine.analyzeBuyback(createPlan(), 10);
      const low = engine.analyzeBuyback(createPlan(), 14);
      expect(high.priceAttractiveness).toBeGreaterThan(low.priceAttractiveness);
    });

    it('低于下限价格→最高吸引力', () => {
      const result = engine.analyzeBuyback(createPlan({ minPrice: 10 }), 8);
      expect(result.priceAttractiveness).toBe(100);
    });

    it('高于上限→最低吸引力', () => {
      const result = engine.analyzeBuyback(createPlan({ maxPrice: 15 }), 20);
      expect(result.priceAttractiveness).toBe(10);
    });

    it('信号强度在0-100之间', () => {
      const result = engine.analyzeBuyback(createPlan(), 12);
      expect(result.signalStrength).toBeGreaterThanOrEqual(0);
      expect(result.signalStrength).toBeLessThanOrEqual(100);
    });

    it('维护股价目的信号更强', () => {
      const stabilize = engine.analyzeBuyback(createPlan({ purpose: 'stabilize_price' }), 12);
      const incentive = engine.analyzeBuyback(createPlan({ purpose: 'employee_incentive' }), 12);
      expect(stabilize.signalStrength).toBeGreaterThan(incentive.signalStrength);
    });

    it('估值信号分类', () => {
      const undervalued = engine.analyzeBuyback(createPlan({ minPrice: 10 }), 9);
      expect(undervalued.valuationSignal).toBe('undervalued');

      const overvalued = engine.analyzeBuyback(createPlan({ maxPrice: 15 }), 14.5);
      expect(overvalued.valuationSignal).toBe('overvalued');
    });

    it('包含预计完成日期', () => {
      const result = engine.analyzeBuyback(createPlan(), 12);
      expect(result.estimatedCompletion).toBeDefined();
    });
  });

  describe('calculateMarketSentiment', () => {
    it('返回每日情绪', () => {
      const plans = [createPlan({ announceDate: '2024-01-15' })];
      const result = engine.calculateMarketSentiment(plans);
      expect(result.length).toBe(1);
      expect(result[0].totalPlans).toBe(1);
    });

    it('金额大完成率高→看涨', () => {
      const plans = [createPlan({ 
        announceDate: '2024-01-15', 
        planAmount: 1000000, 
        actualAmount: 800000 
      })];
      const result = engine.calculateMarketSentiment(plans);
      expect(result[0].sentiment).toBe('bullish');
    });

    it('总金额汇总', () => {
      const plans = [
        createPlan({ announceDate: '2024-01-15', planAmount: 50000 }),
        createPlan({ announceDate: '2024-01-15', planAmount: 30000 }),
      ];
      const result = engine.calculateMarketSentiment(plans);
      expect(result[0].totalAmount).toBeCloseTo(8); // 80000/10000 亿元
    });

    it('按日期排序', () => {
      const plans = [
        createPlan({ announceDate: '2024-01-16' }),
        createPlan({ announceDate: '2024-01-15' }),
      ];
      const result = engine.calculateMarketSentiment(plans);
      expect(result[0].date).toBe('2024-01-15');
    });
  });

  describe('screenBuybacks', () => {
    it('金额筛选', () => {
      const plans = [
        createPlan({ planAmount: 200000 }),
        createPlan({ planAmount: 50000 }),
      ];
      const result = engine.screenBuybacks(plans, new Map(), { minAmount: 100000 });
      expect(result.length).toBe(1);
    });

    it('目的筛选', () => {
      const plans = [
        createPlan({ purpose: 'stabilize_price' }),
        createPlan({ purpose: 'employee_incentive' }),
      ];
      const result = engine.screenBuybacks(plans, new Map(), { purpose: 'stabilize_price' });
      expect(result.length).toBe(1);
    });

    it('按信号强度排序', () => {
      const plans = [
        createPlan({ planAmount: 50000 }),
        createPlan({ planAmount: 200000 }),
      ];
      const prices = new Map([['000001', 12]]);
      const result = engine.screenBuybacks(plans, prices, {});
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].analysis.signalStrength).toBeGreaterThanOrEqual(result[i].analysis.signalStrength);
      }
    });

    it('空筛选返回全部', () => {
      const plans = [createPlan()];
      const result = engine.screenBuybacks(plans, new Map(), {});
      expect(result.length).toBe(1);
    });
  });

  describe('analyzePriceCorrelation', () => {
    it('计算公告后收益', () => {
      const dates = ['2024-01-15'];
      const prices = [
        { date: '2024-01-15', close: 10 },
        { date: '2024-02-14', close: 11 },
        { date: '2024-04-14', close: 12 },
      ];
      const result = engine.analyzePriceCorrelation(dates, prices);
      expect(typeof result.avgReturnAfter30D).toBe('number');
    });

    it('空数据返回零值', () => {
      const result = engine.analyzePriceCorrelation([], []);
      expect(result.avgReturnAfter30D).toBe(0);
      expect(result.avgReturnAfter90D).toBe(0);
    });

    it('胜率在0-100之间', () => {
      const dates = ['2024-01-15'];
      const prices = [{ date: '2024-01-15', close: 10 }];
      const result = engine.analyzePriceCorrelation(dates, prices);
      expect(result.outperformanceRate).toBeGreaterThanOrEqual(0);
      expect(result.outperformanceRate).toBeLessThanOrEqual(100);
    });

    it('包含最佳时机', () => {
      const dates = ['2024-01-15'];
      const prices = [{ date: '2024-01-15', close: 10 }];
      const result = engine.analyzePriceCorrelation(dates, prices);
      expect(['announce_day', 'hold_90d']).toContain(result.bestTiming);
    });
  });
});
