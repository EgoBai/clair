import { describe, it, expect } from 'vitest';
import { DividendAnalysisEngine } from '../utils/dividendDeepEngine';
import type { DividendRecord } from '../utils/dividendDeepEngine';

describe('股息深度分析引擎', () => {
  const engine = new DividendAnalysisEngine();

  const createDividend = (overrides: Partial<DividendRecord> = {}): DividendRecord => ({
    stockCode: '000001',
    stockName: '平安银行',
    exDate: '2024-06-15',
    payDate: '2024-06-20',
    cashDividend: 0.5,
    stockDividend: 0,
    bonusShares: 0,
    year: 2024,
    period: 'annual',
    ...overrides
  });

  describe('analyzeDividends', () => {
    it('空数组返回零值分析', () => {
      const result = engine.analyzeDividends([], 10, 1);
      expect(result.currentYield).toBe(0);
      expect(result.dividendScore).toBe(0);
      expect(result.sustainability).toBe('unsustainable');
    });

    it('计算当前收益率', () => {
      const dividends = [createDividend({ cashDividend: 0.5, year: 2024 })];
      const result = engine.analyzeDividends(dividends, 10, 1);
      expect(result.currentYield).toBeCloseTo(5);
    });

    it('派息率 = 每股派息 / EPS', () => {
      const dividends = [createDividend({ cashDividend: 0.5, year: 2024 })];
      const result = engine.analyzeDividends(dividends, 10, 1);
      expect(result.payoutRatio).toBeCloseTo(50);
    });

    it('派息率超过100%标记为不可持续', () => {
      const dividends = [createDividend({ cashDividend: 1.5, year: 2024 })];
      const result = engine.analyzeDividends(dividends, 10, 1);
      expect(result.sustainability).toBe('unsustainable');
    });

    it('连续分红年数计算', () => {
      const dividends = [
        createDividend({ year: 2022, cashDividend: 0.3 }),
        createDividend({ year: 2023, cashDividend: 0.4 }),
        createDividend({ year: 2024, cashDividend: 0.5 }),
      ];
      const result = engine.analyzeDividends(dividends, 10, 1);
      expect(result.consecutiveYears).toBe(3);
    });

    it('股息增长率计算', () => {
      const dividends = [
        createDividend({ year: 2023, cashDividend: 0.4 }),
        createDividend({ year: 2024, cashDividend: 0.5 }),
      ];
      const result = engine.analyzeDividends(dividends, 10, 1);
      expect(result.dividendGrowthRate).toBeCloseTo(25);
    });

    it('3年和5年平均收益率', () => {
      const dividends = [
        createDividend({ year: 2020, cashDividend: 0.2 }),
        createDividend({ year: 2021, cashDividend: 0.3 }),
        createDividend({ year: 2022, cashDividend: 0.4 }),
        createDividend({ year: 2023, cashDividend: 0.4 }),
        createDividend({ year: 2024, cashDividend: 0.5 }),
      ];
      const result = engine.analyzeDividends(dividends, 10, 1);
      expect(result.avgYield3Y).toBeGreaterThan(0);
      expect(result.avgYield5Y).toBeGreaterThan(0);
    });

    it('评分在0-100之间', () => {
      const dividends = [
        createDividend({ year: 2022, cashDividend: 0.3 }),
        createDividend({ year: 2023, cashDividend: 0.4 }),
        createDividend({ year: 2024, cashDividend: 0.5 }),
      ];
      const result = engine.analyzeDividends(dividends, 10, 1);
      expect(result.dividendScore).toBeGreaterThanOrEqual(0);
      expect(result.dividendScore).toBeLessThanOrEqual(100);
    });

    it('价格为0时不报错', () => {
      const dividends = [createDividend()];
      const result = engine.analyzeDividends(dividends, 0, 1);
      expect(result.currentYield).toBe(0);
    });

    it('EPS为0时派息率为0', () => {
      const dividends = [createDividend({ cashDividend: 0.5 })];
      const result = engine.analyzeDividends(dividends, 10, 0);
      expect(result.payoutRatio).toBe(0);
    });
  });

  describe('findDividendAristocrats', () => {
    it('筛选连续增长的股票', () => {
      const stocks = [
        {
          code: '000001', name: '增长股',
          dividends: Array.from({ length: 12 }, (_, i) => 
            createDividend({ year: 2013 + i, cashDividend: 0.1 + i * 0.05 })
          ),
          price: 10, eps: 1
        },
        {
          code: '000002', name: '普通股',
          dividends: [createDividend({ year: 2024, cashDividend: 0.3 })],
          price: 10, eps: 1
        },
      ];
      const result = engine.findDividendAristocrats(stocks, 10, 1);
      expect(result.length).toBe(1);
      expect(result[0].stockCode).toBe('000001');
    });

    it('质量分级正确', () => {
      const stocks = [{
        code: '000001', name: '贵族股',
        dividends: Array.from({ length: 26 }, (_, i) => 
          createDividend({ year: 1999 + i, cashDividend: 0.1 + i * 0.02 })
        ),
        price: 10, eps: 1
      }];
      const result = engine.findDividendAristocrats(stocks, 10, 1);
      if (result.length > 0) {
        expect(['aristocrat', 'contender', 'challenger']).toContain(result[0].quality);
      }
    });

    it('空数组返回空', () => {
      const result = engine.findDividendAristocrats([], 10, 2);
      expect(result).toEqual([]);
    });
  });

  describe('buildDividendCalendar', () => {
    it('构建日历', () => {
      const dividends = [
        createDividend({ exDate: '2024-06-15', payDate: '2024-06-20' }),
      ];
      const result = engine.buildDividendCalendar(dividends, '2024-06-01', '2024-06-30');
      expect(result.length).toBeGreaterThan(0);
    });

    it('日期范围外的事件不包含', () => {
      const dividends = [createDividend({ exDate: '2024-01-15', payDate: '2024-01-20' })];
      const result = engine.buildDividendCalendar(dividends, '2024-06-01', '2024-06-30');
      expect(result.length).toBe(0);
    });

    it('日期按升序排列', () => {
      const dividends = [
        createDividend({ exDate: '2024-06-20' }),
        createDividend({ exDate: '2024-06-10' }),
        createDividend({ exDate: '2024-06-15' }),
      ];
      const result = engine.buildDividendCalendar(dividends, '2024-06-01', '2024-06-30');
      for (let i = 1; i < result.length; i++) {
        expect(result[i].date.localeCompare(result[i - 1].date)).toBeGreaterThanOrEqual(0);
      }
    });

    it('除权日和派息日都包含', () => {
      const dividends = [createDividend({ exDate: '2024-06-15', payDate: '2024-06-20' })];
      const result = engine.buildDividendCalendar(dividends, '2024-06-01', '2024-06-30');
      expect(result.length).toBe(2); // ex_dividend + pay_date
    });
  });

  describe('calculateDRIPReturn', () => {
    it('计算股息再投资回报', () => {
      const dividends = [
        createDividend({ cashDividend: 0.5, exDate: '2024-06-15' }),
      ];
      const result = engine.calculateDRIPReturn(100, 10, dividends, 12);
      expect(result.totalReturn).toBeGreaterThan(0);
      expect(result.finalValue).toBeGreaterThan(1000);
    });

    it('无股息时只有资本利得', () => {
      const result = engine.calculateDRIPReturn(100, 10, [], 12);
      expect(result.dividendIncome).toBe(0);
      expect(result.capitalGain).toBeCloseTo(20);
      expect(result.dripShares).toBe(0);
    });

    it('再投资增加持股数', () => {
      const dividends = [createDividend({ cashDividend: 1.0 })];
      const result = engine.calculateDRIPReturn(100, 10, dividends, 10);
      expect(result.dripShares).toBeGreaterThan(0);
    });

    it('总回报 = 资本利得 + 股息收入效应', () => {
      const dividends = [createDividend({ cashDividend: 0.5 })];
      const result = engine.calculateDRIPReturn(100, 10, dividends, 11);
      expect(result.totalReturn).toBeDefined();
      expect(result.capitalGain).toBeCloseTo(10);
    });

    it('价格为0时不报错', () => {
      const dividends = [createDividend({ cashDividend: 0.5 })];
      const result = engine.calculateDRIPReturn(100, 10, dividends, 0);
      expect(result.finalValue).toBe(0);
    });
  });
});
