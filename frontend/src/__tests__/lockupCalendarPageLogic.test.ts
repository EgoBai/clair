/**
 * 持仓锁定期日历逻辑测试
 * 覆盖锁定期计算、到期提醒、日历展示
 */

import { describe, it, expect } from 'vitest';

describe('锁定期日历逻辑', () => {
  describe('锁定期到期判断', () => {
    interface LockupEvent {
      symbol: string;
      name: string;
      lockupEnd: Date;
      sharesLocked: number;
      percentOfTotal: number;
    }

    function getDaysUntilUnlock(lockupEnd: Date, now: Date): number {
      const diff = lockupEnd.getTime() - now.getTime();
      return Math.ceil(diff / 86400000);
    }

    function getUrgency(daysLeft: number): 'expired' | 'urgent' | 'soon' | 'normal' {
      if (daysLeft <= 0) return 'expired';
      if (daysLeft <= 7) return 'urgent';
      if (daysLeft <= 30) return 'soon';
      return 'normal';
    }

    it('已过期应返回expired', () => {
      const now = new Date(2024, 0, 15);
      const end = new Date(2024, 0, 10);
      expect(getUrgency(getDaysUntilUnlock(end, now))).toBe('expired');
    });

    it('7天内应返回urgent', () => {
      expect(getUrgency(3)).toBe('urgent');
      expect(getUrgency(7)).toBe('urgent');
    });

    it('30天内应返回soon', () => {
      expect(getUrgency(15)).toBe('soon');
    });

    it('超过30天应返回normal', () => {
      expect(getUrgency(60)).toBe('normal');
    });
  });

  describe('解禁影响评估', () => {
    function assessImpact(event: { sharesLocked: number; percentOfTotal: number; avgDailyVolume: number }): {
      level: 'high' | 'medium' | 'low';
      daysToAbsorb: number;
      description: string;
    } {
      const daysToAbsorb = Math.round(event.sharesLocked / event.avgDailyVolume);
      let level: 'high' | 'medium' | 'low' = 'low';
      if (event.percentOfTotal > 10 || daysToAbsorb > 10) level = 'high';
      else if (event.percentOfTotal > 3 || daysToAbsorb > 3) level = 'medium';
      return { level, daysToAbsorb, description: `预计${daysToAbsorb}个交易日消化` };
    }

    it('大比例解禁应为高影响', () => {
      const result = assessImpact({ sharesLocked: 1e8, percentOfTotal: 15, avgDailyVolume: 1e6 });
      expect(result.level).toBe('high');
    });

    it('小比例解禁应为低影响', () => {
      const result = assessImpact({ sharesLocked: 1e6, percentOfTotal: 0.5, avgDailyVolume: 5e6 });
      expect(result.level).toBe('low');
    });
  });

  describe('日历事件聚合', () => {
    interface CalendarEvent {
      date: string;
      events: { symbol: string; type: 'unlock' | 'lockup_start'; amount: number }[];
    }

    function aggregateByDate(events: { date: string; symbol: string; type: string; amount: number }[]): CalendarEvent[] {
      const map = new Map<string, CalendarEvent['events']>();
      for (const e of events) {
        if (!map.has(e.date)) map.set(e.date, []);
        map.get(e.date)!.push({ symbol: e.symbol, type: e.type as any, amount: e.amount });
      }
      return Array.from(map.entries())
        .map(([date, events]) => ({ date, events }))
        .sort((a, b) => a.date.localeCompare(b.date));
    }

    it('同日事件应聚合', () => {
      const events = [
        { date: '2024-01-15', symbol: 'A', type: 'unlock', amount: 1000 },
        { date: '2024-01-15', symbol: 'B', type: 'unlock', amount: 2000 },
        { date: '2024-01-16', symbol: 'C', type: 'unlock', amount: 500 },
      ];
      const result = aggregateByDate(events);
      expect(result).toHaveLength(2);
      expect(result[0].events).toHaveLength(2);
      expect(result[1].events).toHaveLength(1);
    });
  });

  describe('解禁类型标签', () => {
    type UnlockType = 'ipo_lockup' | 'private_placement' | 'employee_stock' | 'major_shareholder';

    const typeLabels: Record<UnlockType, string> = {
      ipo_lockup: 'IPO限售解禁',
      private_placement: '定增解禁',
      employee_stock: '股权激励解禁',
      major_shareholder: '大股东解禁',
    };

    function getTypeLabel(type: UnlockType): string {
      return typeLabels[type] || '其他解禁';
    }

    it('应有完整类型标签', () => {
      expect(Object.keys(typeLabels)).toHaveLength(4);
    });

    it('应正确返回标签', () => {
      expect(getTypeLabel('ipo_lockup')).toBe('IPO限售解禁');
      expect(getTypeLabel('employee_stock')).toBe('股权激励解禁');
    });
  });
});
