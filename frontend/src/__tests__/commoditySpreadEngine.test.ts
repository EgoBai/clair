import { describe, it, expect } from 'vitest';
import { CommoditySpreadEngine } from '../utils/commoditySpreadEngine';
import type { CommodityPrice } from '../utils/commoditySpreadEngine';

describe('大宗商品价差引擎', () => {
  const engine = new CommoditySpreadEngine();

  const createPrice = (overrides: Partial<CommodityPrice> = {}): CommodityPrice => ({
    commodity: '原油',
    contract: 'SC2406',
    price: 500,
    date: '2024-01-15',
    deliveryMonth: '2024-06',
    volume: 10000,
    openInterest: 50000,
    ...overrides
  });

  describe('analyzeCalendarSpread', () => {
    it('计算跨期价差', () => {
      const near = createPrice({ price: 500 });
      const far = createPrice({ price: 520, deliveryMonth: '2024-12' });
      const result = engine.analyzeCalendarSpread(near, far);
      expect(result.spread).toBe(20);
      expect(result.contango).toBe(true);
    });

    it('backwardation情况', () => {
      const near = createPrice({ price: 520 });
      const far = createPrice({ price: 500 });
      const result = engine.analyzeCalendarSpread(near, far);
      expect(result.spread).toBe(-20);
      expect(result.contango).toBe(false);
    });

    it('价差过大→做空信号', () => {
      const near = createPrice({ price: 500 });
      const far = createPrice({ price: 600 });
      const result = engine.analyzeCalendarSpread(near, far, 10);
      expect(result.signal).toBe('sell_spread');
    });

    it('价差过小→做多信号', () => {
      const near = createPrice({ price: 550 });
      const far = createPrice({ price: 500 });
      const result = engine.analyzeCalendarSpread(near, far, 20);
      expect(result.signal).toBe('buy_spread');
    });

    it('spreadPercent计算', () => {
      const near = createPrice({ price: 500 });
      const far = createPrice({ price: 510 });
      const result = engine.analyzeCalendarSpread(near, far);
      expect(result.spreadPercent).toBeCloseTo(1.98, 1);
    });
  });

  describe('analyzeIntercommoditySpread', () => {
    it('跨品种价差', () => {
      const c1 = createPrice({ commodity: '原油', price: 500 });
      const c2 = createPrice({ commodity: '燃油', price: 3000 });
      const result = engine.analyzeIntercommoditySpread(c1, c2, 6);
      expect(result.spreadType).toBe('intercommodity');
      expect(result.spread).toBe(500 - 3000 * 6);
    });

    it('配比调整', () => {
      const c1 = createPrice({ commodity: 'A', price: 100 });
      const c2 = createPrice({ commodity: 'B', price: 50 });
      const r1 = engine.analyzeIntercommoditySpread(c1, c2, 1);
      const r2 = engine.analyzeIntercommoditySpread(c1, c2, 2);
      expect(r2.farPrice).toBe(r1.farPrice * 2);
    });
  });

  describe('analyzeBasis', () => {
    it('计算基差', () => {
      const result = engine.analyzeBasis(510, 500, '2024-06-15', '2024-01-15');
      expect(result.basis).toBe(10);
      expect(result.basisPercent).toBeCloseTo(2);
    });

    it('backwardation信号', () => {
      const result = engine.analyzeBasis(530, 500, '2024-06-15', '2024-01-15');
      expect(result.convergenceSignal).toBe('backwardation');
    });

    it('contango信号', () => {
      const result = engine.analyzeBasis(470, 500, '2024-06-15', '2024-01-15');
      expect(result.convergenceSignal).toBe('contango');
    });

    it('天数计算', () => {
      const result = engine.analyzeBasis(510, 500, '2024-06-15', '2024-01-15');
      expect(result.daysToDelivery).toBeGreaterThan(0);
    });

    it('年化基差', () => {
      const result = engine.analyzeBasis(510, 500, '2024-06-15', '2024-01-15');
      expect(typeof result.annualizedBasis).toBe('number');
    });
  });

  describe('analyzeCrackSpread', () => {
    it('计算裂解价差', () => {
      const result = engine.analyzeCrackSpread(500, 600, 580);
      expect(result.crackSpread).toBeDefined();
      expect(result.crackMargin).toBeDefined();
    });

    it('高利润率→增产信号', () => {
      const result = engine.analyzeCrackSpread(400, 800, 750);
      expect(result.signal).toBe('refine_more');
    });

    it('低利润率→减产信号', () => {
      const result = engine.analyzeCrackSpread(600, 580, 570);
      expect(result.signal).toBe('refine_less');
    });

    it('盈利能力在0-100之间', () => {
      const result = engine.analyzeCrackSpread(500, 600, 580);
      expect(result.profitability).toBeGreaterThanOrEqual(0);
      expect(result.profitability).toBeLessThanOrEqual(100);
    });
  });

  describe('analyzeCrushSpread', () => {
    it('计算压榨价差', () => {
      const result = engine.analyzeCrushSpread(4000, 3500, 8000);
      expect(typeof result.crushSpread).toBe('number');
      expect(typeof result.crushMargin).toBe('number');
    });

    it('高压榨利润→增产', () => {
      const result = engine.analyzeCrushSpread(3000, 4000, 10000);
      expect(result.signal).toBe('crush_more');
    });

    it('低利润→减产', () => {
      const result = engine.analyzeCrushSpread(5000, 3000, 5000);
      expect(['crush_less', 'neutral']).toContain(result.signal);
    });
  });

  describe('analyzeInventorySpreadRelation', () => {
    it('计算相关性', () => {
      const inventory = [
        { date: '2024-01-01', level: 100 },
        { date: '2024-01-02', level: 90 },
        { date: '2024-01-03', level: 80 },
      ];
      const spreads = [
        { date: '2024-01-01', spread: 10 },
        { date: '2024-01-02', spread: 15 },
        { date: '2024-01-03', spread: 20 },
      ];
      const result = engine.analyzeInventorySpreadRelation(inventory, spreads);
      expect(result.correlation).toBeLessThan(0); // 库存降、价差涨，负相关
    });

    it('数据不足返回提示', () => {
      const result = engine.analyzeInventorySpreadRelation(
        [{ date: '2024-01-01', level: 100 }],
        [{ date: '2024-01-01', spread: 10 }]
      );
      expect(result.signal).toBe('数据不足');
    });

    it('相关性在-1到1之间', () => {
      const inventory = Array.from({ length: 10 }, (_, i) => ({ date: `2024-01-${i + 1}`, level: 100 - i }));
      const spreads = Array.from({ length: 10 }, (_, i) => ({ date: `2024-01-${i + 1}`, spread: 10 + i }));
      const result = engine.analyzeInventorySpreadRelation(inventory, spreads);
      expect(result.correlation).toBeGreaterThanOrEqual(-1);
      expect(result.correlation).toBeLessThanOrEqual(1);
    });
  });
});
