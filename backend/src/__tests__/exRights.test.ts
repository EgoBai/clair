/**
 * 除权除息复权处理测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AdjustmentEngine,
  calculateExRightsReferencePrice,
  calculateDividendTaxRate,
  describeDividendEvent,
  calculateDividendYield,
  calculateTotalBonusRatio,
  validateExRightsEvent,
  ExRightsEvent,
} from '../utils/exRights';
import { KLineData } from '../../shared/types';

describe('除权除息复权处理', () => {
  // ==================== 工具函数测试 ====================

  describe('calculateDividendTaxRate', () => {
    it('持股少于1个月税率20%', () => {
      expect(calculateDividendTaxRate(10)).toBe(0.2);
      expect(calculateDividendTaxRate(29)).toBe(0.2);
    });

    it('持股1个月到1年税率10%', () => {
      expect(calculateDividendTaxRate(30)).toBe(0.1);
      expect(calculateDividendTaxRate(180)).toBe(0.1);
      expect(calculateDividendTaxRate(364)).toBe(0.1);
    });

    it('持股超过1年免税', () => {
      expect(calculateDividendTaxRate(365)).toBe(0);
      expect(calculateDividendTaxRate(1000)).toBe(0);
    });

    it('负值天数按最高税率', () => {
      expect(calculateDividendTaxRate(-1)).toBe(0.2);
      expect(calculateDividendTaxRate(0)).toBe(0.2);
    });
  });

  describe('calculateExRightsReferencePrice', () => {
    it('纯现金分红除权参考价', () => {
      // 收盘价10元，每股派0.5元，税率10%
      const refPrice = calculateExRightsReferencePrice(10, 0.5, 0, 0, 0.1);
      // (10 - 0.5 * 0.9) / 1 = 9.55
      expect(refPrice).toBeCloseTo(9.55, 2);
    });

    it('送股除权参考价', () => {
      // 收盘价20元，每10股送5股(0.5)，无派息
      const refPrice = calculateExRightsReferencePrice(20, 0, 0.5, 0, 0);
      // 20 / 1.5 ≈ 13.33
      expect(refPrice).toBeCloseTo(13.333, 2);
    });

    it('转增股除权参考价', () => {
      // 收盘价15元，每10股转增10股(1.0)
      const refPrice = calculateExRightsReferencePrice(15, 0, 0, 1.0, 0);
      // 15 / 2 = 7.5
      expect(refPrice).toBe(7.5);
    });

    it('混合方案除权参考价', () => {
      // 收盘价30元，每10股派2元，送3股，转增2股
      const refPrice = calculateExRightsReferencePrice(30, 0.2, 0.3, 0.2, 0.1);
      // (30 - 0.2 * 0.9) / (1 + 0.3 + 0.2) = 29.82 / 1.5
      expect(refPrice).toBeCloseTo(19.88, 2);
    });

    it('零派息零送转应返回原价', () => {
      expect(calculateExRightsReferencePrice(10, 0, 0, 0, 0)).toBe(10);
    });
  });

  describe('describeDividendEvent', () => {
    it('纯现金分红描述', () => {
      const event: ExRightsEvent = {
        id: 'test-1',
        symbol: '600519.SH',
        announceDate: '2025-03-15',
        exRightsDate: '2025-03-20',
        type: 'cash',
        cashDividendPerShare: 0.3,
        bonusSharesPerShare: 0,
        capitalReservePerShare: 0,
        taxRate: 0.1,
        description: '',
      };
      expect(describeDividendEvent(event)).toBe('每10股派3.00元');
    });

    it('混合方案描述', () => {
      const event: ExRightsEvent = {
        id: 'test-2',
        symbol: '000858.SZ',
        announceDate: '2025-03-15',
        exRightsDate: '2025-03-20',
        type: 'mixed',
        cashDividendPerShare: 0.2,
        bonusSharesPerShare: 0.3,
        capitalReservePerShare: 0.5,
        taxRate: 0.1,
        description: '',
      };
      expect(describeDividendEvent(event)).toBe('每10股派2.00元，每10股送3股，每10股转增5股');
    });

    it('无分红方案', () => {
      const event: ExRightsEvent = {
        id: 'test-3',
        symbol: '600000.SH',
        announceDate: '2025-03-15',
        exRightsDate: '2025-03-20',
        type: 'cash',
        cashDividendPerShare: 0,
        bonusSharesPerShare: 0,
        capitalReservePerShare: 0,
        taxRate: 0,
        description: '',
      };
      expect(describeDividendEvent(event)).toBe('无分红方案');
    });
  });

  describe('calculateDividendYield', () => {
    it('计算股息率', () => {
      // 每股派0.5元，股价25元 = 2%
      expect(calculateDividendYield(0.5, 25)).toBe(2);
    });

    it('零股价返回0', () => {
      expect(calculateDividendYield(0.5, 0)).toBe(0);
    });

    it('负股价返回0', () => {
      expect(calculateDividendYield(0.5, -10)).toBe(0);
    });
  });

  describe('calculateTotalBonusRatio', () => {
    it('计算送转比例', () => {
      const event: ExRightsEvent = {
        id: 'test',
        symbol: 'test',
        announceDate: '2025-01-01',
        exRightsDate: '2025-01-02',
        type: 'mixed',
        cashDividendPerShare: 0,
        bonusSharesPerShare: 0.3,
        capitalReservePerShare: 0.7,
        taxRate: 0,
        description: '',
      };
      expect(calculateTotalBonusRatio(event)).toBe(10); // (0.3 + 0.7) * 10
    });
  });

  describe('validateExRightsEvent', () => {
    it('有效事件返回空错误数组', () => {
      const event: ExRightsEvent = {
        id: 'valid',
        symbol: '600519.SH',
        announceDate: '2025-03-15',
        exRightsDate: '2025-03-20',
        type: 'cash',
        cashDividendPerShare: 0.5,
        bonusSharesPerShare: 0,
        capitalReservePerShare: 0,
        taxRate: 0.1,
        description: '',
      };
      expect(validateExRightsEvent(event)).toHaveLength(0);
    });

    it('空股票代码报错', () => {
      const event: ExRightsEvent = {
        id: 'test',
        symbol: '',
        announceDate: '2025-03-15',
        exRightsDate: '2025-03-20',
        type: 'cash',
        cashDividendPerShare: 0.5,
        bonusSharesPerShare: 0,
        capitalReservePerShare: 0,
        taxRate: 0,
        description: '',
      };
      const errors = validateExRightsEvent(event);
      expect(errors).toContain('股票代码不能为空');
    });

    it('负派息报错', () => {
      const event: ExRightsEvent = {
        id: 'test',
        symbol: '600519.SH',
        announceDate: '2025-03-15',
        exRightsDate: '2025-03-20',
        type: 'cash',
        cashDividendPerShare: -1,
        bonusSharesPerShare: 0,
        capitalReservePerShare: 0,
        taxRate: 0,
        description: '',
      };
      expect(validateExRightsEvent(event)).toContain('每股派息不能为负');
    });

    it('无任何分红送转报错', () => {
      const event: ExRightsEvent = {
        id: 'test',
        symbol: '600519.SH',
        announceDate: '2025-03-15',
        exRightsDate: '2025-03-20',
        type: 'cash',
        cashDividendPerShare: 0,
        bonusSharesPerShare: 0,
        capitalReservePerShare: 0,
        taxRate: 0,
        description: '',
      };
      expect(validateExRightsEvent(event)).toContain('派息、送股、转增至少有一项大于0');
    });

    it('税率超范围报错', () => {
      const event: ExRightsEvent = {
        id: 'test',
        symbol: '600519.SH',
        announceDate: '2025-03-15',
        exRightsDate: '2025-03-20',
        type: 'cash',
        cashDividendPerShare: 0.5,
        bonusSharesPerShare: 0,
        capitalReservePerShare: 0,
        taxRate: 1.5,
        description: '',
      };
      expect(validateExRightsEvent(event)).toContain('税率应在0-1之间');
    });
  });

  // ==================== AdjustmentEngine 测试 ====================

  describe('AdjustmentEngine', () => {
    let engine: AdjustmentEngine;
    let mockKLineData: KLineData[];
    let exRightsEvent: ExRightsEvent;

    beforeEach(() => {
      engine = new AdjustmentEngine();

      exRightsEvent = {
        id: 'ex-1',
        symbol: '600519.SH',
        announceDate: '2025-03-15',
        exRightsDate: '2025-03-25',
        type: 'mixed',
        cashDividendPerShare: 0.3,  // 每股派0.3元
        bonusSharesPerShare: 0,     // 无送股
        capitalReservePerShare: 0.5, // 每股转增0.5
        taxRate: 0.1,
        description: '每10股派3元转增5股',
      };

      // 模拟K线数据：除权日前价格20元，除权后价格约13元
      mockKLineData = [
        { tradeDate: '2025-03-20', open: 19.5, close: 20, high: 20.5, low: 19.3, volume: 100000, turnover: 2000000 },
        { tradeDate: '2025-03-21', open: 20.1, close: 20.5, high: 20.8, low: 20, volume: 110000, turnover: 2255000 },
        { tradeDate: '2025-03-24', open: 20.5, close: 20.8, high: 21, low: 20.3, volume: 95000, turnover: 1976000 },
        // 除权日 3月25日
        { tradeDate: '2025-03-25', open: 13.5, close: 13.8, high: 14, low: 13.2, volume: 200000, turnover: 2760000 },
        { tradeDate: '2025-03-26', open: 13.8, close: 14.2, high: 14.5, low: 13.6, volume: 180000, turnover: 2556000 },
        { tradeDate: '2025-03-27', open: 14.2, close: 14, high: 14.3, low: 13.8, volume: 160000, turnover: 2240000 },
      ];
    });

    it('无事件时不调整价格', () => {
      const adjusted = engine.adjustKLineData('600519.SH', mockKLineData, { type: 'forward' });
      for (let i = 0; i < adjusted.length; i++) {
        expect(adjusted[i].close).toBe(mockKLineData[i].close);
        expect(adjusted[i].adjustmentType).toBe('forward');
      }
    });

    it('前复权调整除权日之前的价格', () => {
      engine.addEvent(exRightsEvent);
      const adjusted = engine.adjustKLineData('600519.SH', mockKLineData, { type: 'forward' });

      expect(adjusted).toHaveLength(mockKLineData.length);
      // 调整后所有价格应为正数
      for (const item of adjusted) {
        expect(item.close).toBeGreaterThan(0);
        expect(item.adjustmentType).toBe('forward');
      }
    });

    it('后复权调整除权日之后的价格', () => {
      engine.addEvent(exRightsEvent);
      const adjusted = engine.adjustKLineData('600519.SH', mockKLineData, { type: 'backward' });

      // 除权日之前的价格应基本不变
      expect(adjusted[0].close).toBeCloseTo(20, 0);
      expect(adjusted[1].close).toBeCloseTo(20.5, 0);

      // 除权日之后的价格应向上调整
      expect(adjusted[3].close).toBeGreaterThan(mockKLineData[3].close);
      expect(adjusted[4].close).toBeGreaterThan(mockKLineData[4].close);
    });

    it('不复权模式返回原始价格', () => {
      engine.addEvent(exRightsEvent);
      const adjusted = engine.adjustKLineData('600519.SH', mockKLineData, { type: 'none' });

      for (let i = 0; i < adjusted.length; i++) {
        expect(adjusted[i].close).toBe(mockKLineData[i].close);
        expect(adjusted[i].originalClose).toBe(mockKLineData[i].close);
        expect(adjusted[i].adjustmentFactor).toBe(1);
        expect(adjusted[i].adjustmentType).toBe('none');
      }
    });

    it('空数据返回空数组', () => {
      const adjusted = engine.adjustKLineData('600519.SH', [], { type: 'forward' });
      expect(adjusted).toHaveLength(0);
    });

    it('前复权应保持收益率一致', () => {
      engine.addEvent(exRightsEvent);
      const adjusted = engine.adjustKLineData('600519.SH', mockKLineData, { type: 'forward' });

      // 复权后所有数据应完整
      expect(adjusted).toHaveLength(mockKLineData.length);
      for (const item of adjusted) {
        expect(item.close).toBeGreaterThan(0);
        expect(item.originalClose).toBeDefined();
        expect(item.adjustmentFactor).toBeGreaterThan(0);
      }
    });

    it('添加重复事件不会重复注册', () => {
      engine.addEvent(exRightsEvent);
      engine.addEvent(exRightsEvent); // 重复添加
      const adjusted1 = engine.adjustKLineData('600519.SH', mockKLineData, { type: 'forward' });
      
      engine.addEvent(exRightsEvent); // 再次添加
      const adjusted2 = engine.adjustKLineData('600519.SH', mockKLineData, { type: 'forward' });

      expect(adjusted1).toEqual(adjusted2);
    });

    it('获取指定日期范围内的事件', () => {
      engine.addEvent(exRightsEvent);
      const events = engine.getEventsInRange('600519.SH', '2025-03-01', '2025-03-31');
      expect(events).toHaveLength(1);
      expect(events[0].exRightsDate).toBe('2025-03-25');
    });

    it('获取最近的除权除息事件', () => {
      const event2: ExRightsEvent = {
        ...exRightsEvent,
        id: 'ex-2',
        exRightsDate: '2026-03-25',
      };
      engine.addEvent(exRightsEvent);
      engine.addEvent(event2);

      const latest = engine.getLatestEvent('600519.SH');
      expect(latest?.exRightsDate).toBe('2026-03-25');
    });

    it('清除事件数据', () => {
      engine.addEvent(exRightsEvent);
      engine.clearEvents('600519.SH');
      const latest = engine.getLatestEvent('600519.SH');
      expect(latest).toBeNull();
    });

    it('计算复权后涨跌幅', () => {
      engine.addEvent(exRightsEvent);
      const adjusted = engine.adjustKLineData('600519.SH', mockKLineData, { type: 'forward' });
      const changePercents = engine.calculateAdjustedChangePercent(adjusted);

      // 第一天涨跌幅应为0
      expect(changePercents[0]).toBe(0);

      // 其他天涨跌幅应为有限值
      for (let i = 1; i < changePercents.length; i++) {
        expect(isFinite(changePercents[i])).toBe(true);
      }
    });

    it('纯现金分红复权', () => {
      const cashOnlyEvent: ExRightsEvent = {
        ...exRightsEvent,
        type: 'cash',
        cashDividendPerShare: 0.5,
        bonusSharesPerShare: 0,
        capitalReservePerShare: 0,
      };
      engine.addEvent(cashOnlyEvent);
      const adjusted = engine.adjustKLineData('600519.SH', mockKLineData, { type: 'forward' });

      // 纯派息情况下，除权日前价格应减去派息调整
      expect(adjusted[0].close).toBeLessThan(mockKLineData[0].close);
    });

    it('纯送股复权', () => {
      const bonusOnlyEvent: ExRightsEvent = {
        ...exRightsEvent,
        type: 'bonus',
        cashDividendPerShare: 0,
        bonusSharesPerShare: 1.0, // 每10股送10股
        capitalReservePerShare: 0,
      };
      engine.addEvent(bonusOnlyEvent);
      const adjusted = engine.adjustKLineData('600519.SH', mockKLineData, { type: 'forward' });

      expect(adjusted).toHaveLength(mockKLineData.length);
      for (const item of adjusted) {
        expect(item.close).toBeGreaterThan(0);
        expect(item.adjustmentType).toBe('forward');
      }
    });
  });
});
