import { describe, it, expect } from 'vitest';

/**
 * 限售股解禁分析测试
 */

interface LockupShare {
  code: string;
  holder: string;
  shares: number;
  lockupDate: string;
  unlockDate: string;
  type: 'ipo' | 'private_placement' | 'employee_stock' | 'restructuring';
  priceAtLockup: number;
}

interface UnlockEvent {
  code: string;
  date: string;
  totalShares: number;
  percentOfFloat: number;
  riskLevel: 'low' | 'medium' | 'high';
  holders: Array<{ holder: string; shares: number; type: string }>;
}

function groupByUnlockDate(lockups: LockupShare[]): Map<string, LockupShare[]> {
  const grouped = new Map<string, LockupShare[]>();
  for (const lockup of lockups) {
    const existing = grouped.get(lockup.unlockDate) || [];
    existing.push(lockup);
    grouped.set(lockup.unlockDate, existing);
  }
  return grouped;
}

function calcUnlockRisk(percentOfFloat: number): 'low' | 'medium' | 'high' {
  if (percentOfFloat > 10) return 'high';
  if (percentOfFloat > 5) return 'medium';
  return 'low';
}

function analyzeUnlocks(lockups: LockupShare[], floatShares: number): UnlockEvent[] {
  const grouped = groupByUnlockDate(lockups);
  const events: UnlockEvent[] = [];

  for (const [date, shares] of grouped) {
    const totalShares = shares.reduce((s, l) => s + l.shares, 0);
    const percentOfFloat = floatShares > 0 ? (totalShares / floatShares) * 100 : 0;
    events.push({
      code: shares[0].code,
      date,
      totalShares,
      percentOfFloat: Math.round(percentOfFloat * 100) / 100,
      riskLevel: calcUnlockRisk(percentOfFloat),
      holders: shares.map(s => ({ holder: s.holder, shares: s.shares, type: s.type })),
    });
  }

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

function filterUpcomingUnlocks(events: UnlockEvent[], daysAhead: number = 30): UnlockEvent[] {
  const today = new Date();
  const cutoff = new Date(today.getTime() + daysAhead * 86400000);
  const todayStr = today.toISOString().split('T')[0];
  const cutoffStr = cutoff.toISOString().split('T')[0];
  return events.filter(e => e.date >= todayStr && e.date <= cutoffStr);
}

function calcPriceImpact(lockup: LockupShare, currentPrice: number): number {
  const gain = ((currentPrice - lockup.priceAtLockup) / lockup.priceAtLockup) * 100;
  // Higher gain = higher sell pressure
  if (gain > 100) return 0.8;
  if (gain > 50) return 0.6;
  if (gain > 20) return 0.4;
  if (gain > 0) return 0.2;
  return 0.1; // Loss holders less likely to sell
}

describe('Lockup Shares Analysis', () => {
  const lockups: LockupShare[] = [
    { code: '000001', holder: '大股东A', shares: 50000000, lockupDate: '2023-01-01', unlockDate: '2024-06-01', type: 'ipo', priceAtLockup: 10 },
    { code: '000001', holder: '机构B', shares: 30000000, lockupDate: '2023-01-01', unlockDate: '2024-06-01', type: 'private_placement', priceAtLockup: 12 },
    { code: '000001', holder: '高管C', shares: 10000000, lockupDate: '2023-06-01', unlockDate: '2024-12-01', type: 'employee_stock', priceAtLockup: 15 },
    { code: '000001', holder: '大股东D', shares: 100000000, lockupDate: '2022-01-01', unlockDate: '2025-01-01', type: 'restructuring', priceAtLockup: 8 },
  ];

  describe('按解禁日分组', () => {
    it('应该正确分组', () => {
      const grouped = groupByUnlockDate(lockups);
      expect(grouped.size).toBe(3); // 3 different dates
    });

    it('同一天解禁应该合并', () => {
      const grouped = groupByUnlockDate(lockups);
      const june2024 = grouped.get('2024-06-01');
      expect(june2024?.length).toBe(2);
    });
  });

  describe('风险评估', () => {
    it('高比例应该标记高风险', () => {
      expect(calcUnlockRisk(15)).toBe('high');
    });

    it('中等比例应该标记中风险', () => {
      expect(calcUnlockRisk(7)).toBe('medium');
    });

    it('低比例应该标记低风险', () => {
      expect(calcUnlockRisk(2)).toBe('low');
    });
  });

  describe('解禁分析', () => {
    it('应该返回解禁事件', () => {
      const events = analyzeUnlocks(lockups, 1000000000);
      expect(events.length).toBe(3);
    });

    it('应该计算占比', () => {
      const events = analyzeUnlocks(lockups, 1000000000);
      const firstEvent = events[0];
      expect(firstEvent.percentOfFloat).toBe(8); // (50M+30M)/1B
    });

    it('应该有风险等级', () => {
      const events = analyzeUnlocks(lockups, 100000000);
      for (const event of events) {
        expect(['low', 'medium', 'high']).toContain(event.riskLevel);
      }
    });
  });

  describe('价格影响', () => {
    it('高收益应该有高抛压', () => {
      const lockup: LockupShare = { ...lockups[0], priceAtLockup: 5 };
      expect(calcPriceImpact(lockup, 20)).toBeGreaterThan(calcPriceImpact(lockup, 6));
    });

    it('亏损应该有低抛压', () => {
      const lockup: LockupShare = { ...lockups[0], priceAtLockup: 20 };
      expect(calcPriceImpact(lockup, 10)).toBe(0.1);
    });
  });
});
