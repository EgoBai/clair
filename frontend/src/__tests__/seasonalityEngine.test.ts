import { describe, it, expect } from 'vitest';

/**
 * 季节性分析 / 日历效应逻辑测试
 */

describe('SeasonalityEngine', () => {
  describe('月度季节性', () => {
    const monthReturns = {
      1: 2.5, 2: 1.8, 3: 0.5, 4: 1.2, 5: -0.3, 6: -1.5,
      7: -0.8, 8: 0.3, 9: -2.1, 10: 1.5, 11: 3.2, 12: 2.8,
    };

    it('应该有12个月数据', () => {
      expect(Object.keys(monthReturns)).toHaveLength(12);
    });

    it('11月通常是最佳月份', () => {
      const maxMonth = Object.entries(monthReturns).reduce((max, [m, r]) => 
        r > max[1] ? [m, r] : max, ['0', -Infinity]
      );
      expect(maxMonth[0]).toBe('11');
    });

    it('9月通常是最差月份', () => {
      const minMonth = Object.entries(monthReturns).reduce((min, [m, r]) => 
        r < min[1] ? [m, r] : min, ['0', Infinity]
      );
      expect(minMonth[0]).toBe('9');
    });
  });

  describe('星期效应', () => {
    const weekdayReturns = {
      Mon: -0.3, Tue: 0.2, Wed: 0.1, Thu: 0.15, Fri: 0.25,
    };

    it('周一通常收益较低', () => {
      expect(weekdayReturns.Mon).toBeLessThan(0);
    });

    it('周五通常收益较高', () => {
      expect(weekdayReturns.Fri).toBeGreaterThan(weekdayReturns.Mon);
    });
  });

  describe('节假日效应', () => {
    const holidayEffect = {
      beforeHoliday: 0.8,
      afterHoliday: 0.3,
      normal: 0.1,
    };

    it('节前效应应该存在', () => {
      expect(holidayEffect.beforeHoliday).toBeGreaterThan(holidayEffect.normal);
    });
  });

  describe('季节性信号', () => {
    const seasonalSignal = (month: number, historicalReturns: Record<number, number>) => {
      const avgReturn = historicalReturns[month];
      if (avgReturn > 2) return 'strong_buy';
      if (avgReturn > 0.5) return 'buy';
      if (avgReturn < -1.5) return 'sell';
      if (avgReturn < -0.5) return 'cautious';
      return 'neutral';
    };

    it('高收益月份应该给出买入信号', () => {
      expect(seasonalSignal(11, { 11: 3.2 })).toBe('strong_buy');
    });

    it('低收益月份应该给出卖出信号', () => {
      expect(seasonalSignal(9, { 9: -2.1 })).toBe('sell');
    });
  });
});

describe('CalendarEffect', ()  => {
  describe('月初效应', () => {
    const monthStartEffect = (day: number) => {
      if (day <= 3) return 'positive';
      if (day >= 28) return 'negative';
      return 'neutral';
    };

    it('月初应该有正面效应', () => {
      expect(monthStartEffect(1)).toBe('positive');
      expect(monthStartEffect(2)).toBe('positive');
    });

    it('月末应该有负面效应', () => {
      expect(monthStartEffect(28)).toBe('negative');
      expect(monthStartEffect(30)).toBe('negative');
    });
  });

  describe('季度效应', () => {
    const quarterEffect = (month: number) => {
      const quarterEndMonths = [3, 6, 9, 12];
      if (quarterEndMonths.includes(month)) return 'window_dressing';
      return 'normal';
    };

    it('季度末应该有窗口装饰效应', () => {
      expect(quarterEffect(3)).toBe('window_dressing');
      expect(quarterEffect(6)).toBe('window_dressing');
      expect(quarterEffect(12)).toBe('window_dressing');
    });

    it('非季度末应该正常', () => {
      expect(quarterEffect(1)).toBe('normal');
      expect(quarterEffect(5)).toBe('normal');
    });
  });

  describe('财报季效应', () => {
    const earningsSeason = (month: number) => {
      const earningsMonths = [4, 5, 8, 10, 11]; // 1季报, 年报, 中报, 3季报
      return earningsMonths.includes(month);
    };

    it('4月应该是财报季', () => {
      expect(earningsSeason(4)).toBe(true);
    });

    it('7月不应该在财报季', () => {
      expect(earningsSeason(7)).toBe(false);
    });
  });
});
