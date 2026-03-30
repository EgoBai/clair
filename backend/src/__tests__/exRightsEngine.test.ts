/**
 * 除权除息引擎测试 - 大批量
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateDividendTaxRate,
  calculateExRightsReferencePrice,
  describeDividendEvent,
  calculateDividendYield,
  calculateTotalBonusRatio,
  validateExRightsEvent,
  AdjustmentEngine,
  type ExRightsEvent,
} from '../utils/exRights';

describe('红利税率计算', () => {
  it('持股不到1个月 税率20%', () => {
    expect(calculateDividendTaxRate(10)).toBe(0.2);
  });

  it('持股1天 税率20%', () => {
    expect(calculateDividendTaxRate(1)).toBe(0.2);
  });

  it('持股29天 税率20%', () => {
    expect(calculateDividendTaxRate(29)).toBe(0.2);
  });

  it('持股30天 税率10%', () => {
    expect(calculateDividendTaxRate(30)).toBe(0.1);
  });

  it('持股100天 税率10%', () => {
    expect(calculateDividendTaxRate(100)).toBe(0.1);
  });

  it('持股364天 税率10%', () => {
    expect(calculateDividendTaxRate(364)).toBe(0.1);
  });

  it('持股365天 免税', () => {
    expect(calculateDividendTaxRate(365)).toBe(0);
  });

  it('持股1000天 免税', () => {
    expect(calculateDividendTaxRate(1000)).toBe(0);
  });

  it('持股0天 默认最高税率', () => {
    expect(calculateDividendTaxRate(0)).toBe(0.2);
  });

  it('负数持股天数 默认最高税率', () => {
    expect(calculateDividendTaxRate(-1)).toBe(0.2);
  });
});

describe('除权参考价计算', () => {
  it('纯现金分红', () => {
    // 收盘价100，每10股派10元（每股1元），税率10%
    // 参考价 = (100 - 1*(1-0.1)) / 1 = 99.1
    const price = calculateExRightsReferencePrice(100, 1, 0, 0, 0.1);
    expect(price).toBeCloseTo(99.1, 2);
  });

  it('纯送股', () => {
    // 收盘价100，每股送0.5股
    // 参考价 = 100 / 1.5 = 66.67
    const price = calculateExRightsReferencePrice(100, 0, 0.5, 0, 0);
    expect(price).toBeCloseTo(66.67, 2);
  });

  it('纯转增', () => {
    // 收盘价100，每股转增0.3股
    const price = calculateExRightsReferencePrice(100, 0, 0, 0.3, 0);
    expect(price).toBeCloseTo(100 / 1.3, 2);
  });

  it('混合方案：分红+送股', () => {
    // 收盘价200，每股派2元(税后1.8)，每股送0.2股
    // 参考价 = (200 - 1.8) / 1.2 = 165.17
    const price = calculateExRightsReferencePrice(200, 2, 0.2, 0, 0.1);
    expect(price).toBeCloseTo(165.17, 1);
  });

  it('免税分红', () => {
    const price = calculateExRightsReferencePrice(100, 1, 0, 0, 0);
    expect(price).toBeCloseTo(99, 2);
  });

  it('零分红零送转 不变', () => {
    const price = calculateExRightsReferencePrice(100, 0, 0, 0, 0);
    expect(price).toBe(100);
  });

  it('默认税率10%', () => {
    const price = calculateExRightsReferencePrice(100, 1, 0, 0);
    expect(price).toBeCloseTo(99.1, 2);
  });
});

describe('除权事件描述', () => {
  it('纯现金分红描述', () => {
    const event: ExRightsEvent = {
      id: '1', symbol: '600519', announceDate: '2025-01-01', exRightsDate: '2025-01-15',
      type: 'cash', cashDividendPerShare: 0.5, bonusSharesPerShare: 0,
      capitalReservePerShare: 0, taxRate: 0.1, description: '',
    };
    expect(describeDividendEvent(event)).toBe('每10股派5.00元');
  });

  it('纯送股描述', () => {
    const event: ExRightsEvent = {
      id: '1', symbol: '600519', announceDate: '2025-01-01', exRightsDate: '2025-01-15',
      type: 'bonus', cashDividendPerShare: 0, bonusSharesPerShare: 0.5,
      capitalReservePerShare: 0, taxRate: 0.1, description: '',
    };
    expect(describeDividendEvent(event)).toBe('每10股送5股');
  });

  it('纯转增描述', () => {
    const event: ExRightsEvent = {
      id: '1', symbol: '600519', announceDate: '2025-01-01', exRightsDate: '2025-01-15',
      type: 'capital_reserve', cashDividendPerShare: 0, bonusSharesPerShare: 0,
      capitalReservePerShare: 0.3, taxRate: 0.1, description: '',
    };
    expect(describeDividendEvent(event)).toBe('每10股转增3股');
  });

  it('混合方案描述', () => {
    const event: ExRightsEvent = {
      id: '1', symbol: '600519', announceDate: '2025-01-01', exRightsDate: '2025-01-15',
      type: 'mixed', cashDividendPerShare: 0.5, bonusSharesPerShare: 0.2,
      capitalReservePerShare: 0.3, taxRate: 0.1, description: '',
    };
    const desc = describeDividendEvent(event);
    expect(desc).toContain('派5.00元');
    expect(desc).toContain('送2股');
    expect(desc).toContain('转增3股');
  });

  it('无分红方案描述', () => {
    const event: ExRightsEvent = {
      id: '1', symbol: '600519', announceDate: '2025-01-01', exRightsDate: '2025-01-15',
      type: 'cash', cashDividendPerShare: 0, bonusSharesPerShare: 0,
      capitalReservePerShare: 0, taxRate: 0.1, description: '',
    };
    expect(describeDividendEvent(event)).toBe('无分红方案');
  });
});

describe('股息率计算', () => {
  it('正常股息率', () => {
    expect(calculateDividendYield(1, 100)).toBe(1);
  });

  it('高股息率', () => {
    expect(calculateDividendYield(5, 50)).toBe(10);
  });

  it('零分红', () => {
    expect(calculateDividendYield(0, 100)).toBe(0);
  });

  it('零价格', () => {
    expect(calculateDividendYield(1, 0)).toBe(0);
  });

  it('负价格', () => {
    expect(calculateDividendYield(1, -10)).toBe(0);
  });
});

describe('送转比例计算', () => {
  it('送股+转增', () => {
    const event: ExRightsEvent = {
      id: '1', symbol: 'test', announceDate: '2025-01-01', exRightsDate: '2025-01-15',
      type: 'mixed', cashDividendPerShare: 0, bonusSharesPerShare: 0.3,
      capitalReservePerShare: 0.5, taxRate: 0, description: '',
    };
    expect(calculateTotalBonusRatio(event)).toBe(8);
  });

  it('无送转', () => {
    const event: ExRightsEvent = {
      id: '1', symbol: 'test', announceDate: '2025-01-01', exRightsDate: '2025-01-15',
      type: 'cash', cashDividendPerShare: 1, bonusSharesPerShare: 0,
      capitalReservePerShare: 0, taxRate: 0, description: '',
    };
    expect(calculateTotalBonusRatio(event)).toBe(0);
  });
});

describe('除权事件验证', () => {
  const validEvent: ExRightsEvent = {
    id: '1', symbol: '600519', announceDate: '2025-01-01', exRightsDate: '2025-01-15',
    type: 'cash', cashDividendPerShare: 0.5, bonusSharesPerShare: 0,
    capitalReservePerShare: 0, taxRate: 0.1, description: '',
  };

  it('有效事件无错误', () => {
    expect(validateExRightsEvent(validEvent)).toHaveLength(0);
  });

  it('空股票代码报错', () => {
    const errors = validateExRightsEvent({ ...validEvent, symbol: '' });
    expect(errors.some(e => e.includes('股票代码'))).toBe(true);
  });

  it('空除权日报错', () => {
    const errors = validateExRightsEvent({ ...validEvent, exRightsDate: '' });
    expect(errors.some(e => e.includes('除权除息日'))).toBe(true);
  });

  it('负派息报错', () => {
    const errors = validateExRightsEvent({ ...validEvent, cashDividendPerShare: -1 });
    expect(errors.some(e => e.includes('派息'))).toBe(true);
  });

  it('负送股报错', () => {
    const errors = validateExRightsEvent({ ...validEvent, bonusSharesPerShare: -1 });
    expect(errors.some(e => e.includes('送股'))).toBe(true);
  });

  it('负转增报错', () => {
    const errors = validateExRightsEvent({ ...validEvent, capitalReservePerShare: -1 });
    expect(errors.some(e => e.includes('转增'))).toBe(true);
  });

  it('税率超出范围报错', () => {
    const errors1 = validateExRightsEvent({ ...validEvent, taxRate: -0.1 });
    expect(errors1.some(e => e.includes('税率'))).toBe(true);
    const errors2 = validateExRightsEvent({ ...validEvent, taxRate: 1.1 });
    expect(errors2.some(e => e.includes('税率'))).toBe(true);
  });

  it('无任何分红动作报错', () => {
    const errors = validateExRightsEvent({
      ...validEvent,
      cashDividendPerShare: 0,
      bonusSharesPerShare: 0,
      capitalReservePerShare: 0,
    });
    expect(errors.some(e => e.includes('至少有一项'))).toBe(true);
  });
});

describe('复权引擎', () => {
  let engine: AdjustmentEngine;

  beforeEach(() => {
    engine = new AdjustmentEngine();
  });

  describe('事件注册', () => {
    it('添加事件', () => {
      engine.addEvent({
        id: '1', symbol: '600519', announceDate: '2025-01-01',
        exRightsDate: '2025-06-15', type: 'cash',
        cashDividendPerShare: 0.5, bonusSharesPerShare: 0,
        capitalReservePerShare: 0, taxRate: 0.1, description: '',
      });
      expect(engine.getRegisteredSymbols()).toContain('600519');
    });

    it('批量添加事件', () => {
      engine.addEvents([
        { id: '1', symbol: '600519', announceDate: '2025-01-01', exRightsDate: '2025-06-15',
          type: 'cash', cashDividendPerShare: 0.5, bonusSharesPerShare: 0,
          capitalReservePerShare: 0, taxRate: 0.1, description: '' },
        { id: '2', symbol: '000001', announceDate: '2025-01-01', exRightsDate: '2025-06-15',
          type: 'bonus', cashDividendPerShare: 0, bonusSharesPerShare: 0.5,
          capitalReservePerShare: 0, taxRate: 0.1, description: '' },
      ]);
      expect(engine.getRegisteredSymbols()).toHaveLength(2);
    });

    it('重复事件不重复添加', () => {
      const event: ExRightsEvent = {
        id: '1', symbol: '600519', announceDate: '2025-01-01',
        exRightsDate: '2025-06-15', type: 'cash',
        cashDividendPerShare: 0.5, bonusSharesPerShare: 0,
        capitalReservePerShare: 0, taxRate: 0.1, description: '',
      };
      engine.addEvent(event);
      engine.addEvent(event);
      expect(engine.getRegisteredSymbols()).toHaveLength(1);
    });

    it('清除事件', () => {
      engine.addEvent({
        id: '1', symbol: '600519', announceDate: '2025-01-01',
        exRightsDate: '2025-06-15', type: 'cash',
        cashDividendPerShare: 0.5, bonusSharesPerShare: 0,
        capitalReservePerShare: 0, taxRate: 0.1, description: '',
      });
      engine.clearEvents('600519');
      expect(engine.getRegisteredSymbols()).not.toContain('600519');
    });
  });

  describe('复权因子', () => {
    it('无事件返回空Map', () => {
      const factors = engine.getAdjustmentFactors('NOEXIST');
      expect(factors.size).toBe(0);
    });

    it('有事件返回因子Map', () => {
      engine.addEvent({
        id: '1', symbol: '600519', announceDate: '2025-01-01',
        exRightsDate: '2025-06-15', type: 'bonus',
        cashDividendPerShare: 0, bonusSharesPerShare: 0.5,
        capitalReservePerShare: 0, taxRate: 0, description: '',
      });
      const factors = engine.getAdjustmentFactors('600519');
      expect(factors.size).toBeGreaterThan(0);
    });
  });

  describe('不复权', () => {
    it('不复权数据保持原样', () => {
      const data = [
        { tradeDate: '2025-01-02', open: 100, close: 105, high: 108, low: 98, volume: 1000, turnover: 100000 },
        { tradeDate: '2025-01-03', open: 105, close: 110, high: 112, low: 103, volume: 1200, turnover: 132000 },
      ];
      const adjusted = engine.adjustKLineData('600519', data, { type: 'none' });
      expect(adjusted).toHaveLength(2);
      expect(adjusted[0].open).toBe(100);
      expect(adjusted[0].originalOpen).toBe(100);
      expect(adjusted[0].adjustmentType).toBe('none');
      expect(adjusted[0].adjustmentFactor).toBe(1);
    });

    it('空数据返回空数组', () => {
      const adjusted = engine.adjustKLineData('600519', [], { type: 'forward' });
      expect(adjusted).toHaveLength(0);
    });
  });

  describe('最近事件', () => {
    it('无事件返回null', () => {
      expect(engine.getLatestEvent('NOEXIST')).toBeNull();
    });

    it('返回最近的事件', () => {
      engine.addEvents([
        { id: '1', symbol: '600519', announceDate: '2024-01-01', exRightsDate: '2024-06-15',
          type: 'cash', cashDividendPerShare: 0.3, bonusSharesPerShare: 0,
          capitalReservePerShare: 0, taxRate: 0.1, description: '2024分红' },
        { id: '2', symbol: '600519', announceDate: '2025-01-01', exRightsDate: '2025-06-15',
          type: 'cash', cashDividendPerShare: 0.5, bonusSharesPerShare: 0,
          capitalReservePerShare: 0, taxRate: 0.1, description: '2025分红' },
      ]);
      const latest = engine.getLatestEvent('600519');
      expect(latest?.exRightsDate).toBe('2025-06-15');
    });
  });

  describe('事件范围查询', () => {
    it('查询日期范围内的事件', () => {
      engine.addEvents([
        { id: '1', symbol: '600519', announceDate: '2024-01-01', exRightsDate: '2024-06-15',
          type: 'cash', cashDividendPerShare: 0.3, bonusSharesPerShare: 0,
          capitalReservePerShare: 0, taxRate: 0.1, description: '' },
        { id: '2', symbol: '600519', announceDate: '2025-01-01', exRightsDate: '2025-06-15',
          type: 'cash', cashDividendPerShare: 0.5, bonusSharesPerShare: 0,
          capitalReservePerShare: 0, taxRate: 0.1, description: '' },
        { id: '3', symbol: '600519', announceDate: '2026-01-01', exRightsDate: '2026-06-15',
          type: 'cash', cashDividendPerShare: 0.6, bonusSharesPerShare: 0,
          capitalReservePerShare: 0, taxRate: 0.1, description: '' },
      ]);
      const events = engine.getEventsInRange('600519', '2025-01-01', '2025-12-31');
      expect(events).toHaveLength(1);
      expect(events[0].exRightsDate).toBe('2025-06-15');
    });

    it('范围外返回空', () => {
      engine.addEvent({
        id: '1', symbol: '600519', announceDate: '2025-01-01', exRightsDate: '2025-06-15',
        type: 'cash', cashDividendPerShare: 0.5, bonusSharesPerShare: 0,
        capitalReservePerShare: 0, taxRate: 0.1, description: '',
      });
      const events = engine.getEventsInRange('600519', '2026-01-01', '2026-12-31');
      expect(events).toHaveLength(0);
    });
  });

  describe('复权涨跌幅', () => {
    it('计算复权后涨跌幅', () => {
      const data = [
        { tradeDate: '2025-01-02', open: 100, close: 100, high: 100, low: 100, volume: 1000, turnover: 100000, originalOpen: 100, originalClose: 100, originalHigh: 100, originalLow: 100, adjustmentFactor: 1, adjustmentType: 'none' as const },
        { tradeDate: '2025-01-03', open: 105, close: 105, high: 105, low: 105, volume: 1000, turnover: 100000, originalOpen: 105, originalClose: 105, originalHigh: 105, originalLow: 105, adjustmentFactor: 1, adjustmentType: 'none' as const },
        { tradeDate: '2025-01-04', open: 110, close: 110, high: 110, low: 110, volume: 1000, turnover: 100000, originalOpen: 110, originalClose: 110, originalHigh: 110, originalLow: 110, adjustmentFactor: 1, adjustmentType: 'none' as const },
      ];
      const changes = engine.calculateAdjustedChangePercent(data);
      expect(changes).toHaveLength(3);
      expect(changes[0]).toBe(0);
      expect(changes[1]).toBeCloseTo(5, 1);
      expect(changes[2]).toBeCloseTo(4.76, 1);
    });
  });
});
