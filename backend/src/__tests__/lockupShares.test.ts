/**
 * 限售股解禁 API 测试
 * 覆盖解禁日历、解禁类型、市值计算、风险评估、筛选排序
 */

import { describe, it, expect } from 'vitest';

// 模拟限售股解禁核心逻辑
interface LockupExpiry {
  id: number;
  symbol: string;
  name: string;
  expiryDate: string;
  lockupType: string;
  shareholder: string;
  totalShares: number;
  circulatingBefore: number;
  unlockRatio: number;
  marketValue: number;
  price: number;
  actualCirculating: number;
}

const LOCKUP_TYPES = ['首发原股东限售', '定向增发机构配售', '股权激励限售', '追加承诺限售'];
const SHAREHOLDER_TYPES = ['控股股东', '实际控制人', '高管团队', '核心员工', '战略投资者', '财务投资者', '私募基金', '员工持股计划'];

function validateLockupData(expiry: LockupExpiry): string[] {
  const errors: string[] = [];
  if (!expiry.symbol) errors.push('股票代码不能为空');
  if (!expiry.expiryDate) errors.push('解禁日期不能为空');
  if (expiry.totalShares <= 0) errors.push('解禁数量必须大于0');
  if (expiry.marketValue < 0) errors.push('解禁市值不能为负');
  if (expiry.unlockRatio < 0 || expiry.unlockRatio > 100) errors.push('解禁比例应在0-100%之间');
  if (!LOCKUP_TYPES.includes(expiry.lockupType)) errors.push('无效的解禁类型');
  if (!SHAREHOLDER_TYPES.includes(expiry.shareholder)) errors.push('无效的股东类型');
  if (expiry.price <= 0) errors.push('股价必须大于0');
  return errors;
}

function calculateUnlockImpact(expiry: LockupExpiry, avgVolume: number): {
  volumeDays: number; // 消化天数
  impactLevel: '低' | '中' | '高' | '极高';
  riskScore: number;
} {
  const volumeDays = avgVolume > 0 ? Math.ceil(expiry.totalShares / avgVolume) : Infinity;
  let impactLevel: '低' | '中' | '高' | '极高';
  let riskScore: number;

  if (expiry.unlockRatio < 1) {
    impactLevel = '低';
    riskScore = 10;
  } else if (expiry.unlockRatio < 5) {
    impactLevel = '中';
    riskScore = 40;
  } else if (expiry.unlockRatio < 15) {
    impactLevel = '高';
    riskScore = 70;
  } else {
    impactLevel = '极高';
    riskScore = 90;
  }

  // 根据消化天数调整风险
  if (volumeDays > 30) riskScore = Math.min(100, riskScore + 20);
  else if (volumeDays > 10) riskScore = Math.min(100, riskScore + 10);

  return { volumeDays, impactLevel, riskScore };
}

function filterLockups(
  expiries: LockupExpiry[],
  filter: {
    startDate?: string;
    endDate?: string;
    types?: string[];
    minMarketValue?: number;
    maxMarketValue?: number;
    minRatio?: number;
    maxRatio?: number;
  }
): LockupExpiry[] {
  return expiries.filter(e => {
    if (filter.startDate && e.expiryDate < filter.startDate) return false;
    if (filter.endDate && e.expiryDate > filter.endDate) return false;
    if (filter.types?.length && !filter.types.includes(e.lockupType)) return false;
    if (filter.minMarketValue !== undefined && e.marketValue < filter.minMarketValue) return false;
    if (filter.maxMarketValue !== undefined && e.marketValue > filter.maxMarketValue) return false;
    if (filter.minRatio !== undefined && e.unlockRatio < filter.minRatio) return false;
    if (filter.maxRatio !== undefined && e.unlockRatio > filter.maxRatio) return false;
    return true;
  });
}

function sortLockups(expiries: LockupExpiry[], field: keyof LockupExpiry, order: 'asc' | 'desc'): LockupExpiry[] {
  return [...expiries].sort((a, b) => {
    const aVal = a[field];
    const bVal = b[field];
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return order === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    return order === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
  });
}

function groupByDate(expiries: LockupExpiry[]): Map<string, LockupExpiry[]> {
  const groups = new Map<string, LockupExpiry[]>();
  for (const e of expiries) {
    const existing = groups.get(e.expiryDate) || [];
    existing.push(e);
    groups.set(e.expiryDate, existing);
  }
  return groups;
}

function calculateMonthlySummary(expiries: LockupExpiry[]): {
  totalCount: number;
  totalMarketValue: number;
  avgRatio: number;
  maxMarketValue: number;
  byType: Map<string, number>;
} {
  const byType = new Map<string, number>();
  let totalMarketValue = 0;
  let totalRatio = 0;
  let maxMarketValue = 0;

  for (const e of expiries) {
    totalMarketValue += e.marketValue;
    totalRatio += e.unlockRatio;
    if (e.marketValue > maxMarketValue) maxMarketValue = e.marketValue;
    byType.set(e.lockupType, (byType.get(e.lockupType) || 0) + e.marketValue);
  }

  return {
    totalCount: expiries.length,
    totalMarketValue,
    avgRatio: expiries.length > 0 ? totalRatio / expiries.length : 0,
    maxMarketValue,
    byType,
  };
}

function isDateInRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

function getDaysUntilExpiry(expiryDate: string, currentDate: string): number {
  const exp = new Date(expiryDate);
  const curr = new Date(currentDate);
  return Math.floor((exp.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24));
}

// 测试数据
const sampleExpiries: LockupExpiry[] = [
  { id: 1, symbol: '600519', name: '贵州茅台', expiryDate: '2026-04-15', lockupType: '首发原股东限售', shareholder: '控股股东', totalShares: 50000000, circulatingBefore: 1250000000, unlockRatio: 4.0, marketValue: 90000000000, price: 1800, actualCirculating: 1300000000 },
  { id: 2, symbol: '000858', name: '五粮液', expiryDate: '2026-04-10', lockupType: '定向增发机构配售', shareholder: '战略投资者', totalShares: 20000000, circulatingBefore: 3870000000, unlockRatio: 0.52, marketValue: 3000000000, price: 150, actualCirculating: 3890000000 },
  { id: 3, symbol: '300750', name: '宁德时代', expiryDate: '2026-04-20', lockupType: '股权激励限售', shareholder: '核心员工', totalShares: 8000000, circulatingBefore: 2300000000, unlockRatio: 0.35, marketValue: 1600000000, price: 200, actualCirculating: 2308000000 },
  { id: 4, symbol: '601318', name: '中国平安', expiryDate: '2026-04-15', lockupType: '追加承诺限售', shareholder: '实际控制人', totalShares: 100000000, circulatingBefore: 7400000000, unlockRatio: 1.35, marketValue: 5000000000, price: 50, actualCirculating: 7500000000 },
  { id: 5, symbol: '002594', name: '比亚迪', expiryDate: '2026-05-01', lockupType: '首发原股东限售', shareholder: '控股股东', totalShares: 200000000, circulatingBefore: 1200000000, unlockRatio: 16.67, marketValue: 52000000000, price: 260, actualCirculating: 1400000000 },
];

// ==================== 数据验证 ====================

describe('validateLockupData 数据验证', () => {
  it('有效数据应通过验证', () => {
    expect(validateLockupData(sampleExpiries[0])).toHaveLength(0);
  });

  it('空股票代码应报错', () => {
    const data = { ...sampleExpiries[0], symbol: '' };
    expect(validateLockupData(data)).toContain('股票代码不能为空');
  });

  it('空解禁日期应报错', () => {
    const data = { ...sampleExpiries[0], expiryDate: '' };
    expect(validateLockupData(data)).toContain('解禁日期不能为空');
  });

  it('解禁数量为0应报错', () => {
    const data = { ...sampleExpiries[0], totalShares: 0 };
    expect(validateLockupData(data)).toContain('解禁数量必须大于0');
  });

  it('负市值应报错', () => {
    const data = { ...sampleExpiries[0], marketValue: -1 };
    expect(validateLockupData(data)).toContain('解禁市值不能为负');
  });

  it('解禁比例超100%应报错', () => {
    const data = { ...sampleExpiries[0], unlockRatio: 150 };
    expect(validateLockupData(data)).toContain('解禁比例应在0-100%之间');
  });

  it('无效解禁类型应报错', () => {
    const data = { ...sampleExpiries[0], lockupType: '未知类型' };
    expect(validateLockupData(data)).toContain('无效的解禁类型');
  });

  it('无效股东类型应报错', () => {
    const data = { ...sampleExpiries[0], shareholder: '未知股东' };
    expect(validateLockupData(data)).toContain('无效的股东类型');
  });

  it('股价为0应报错', () => {
    const data = { ...sampleExpiries[0], price: 0 };
    expect(validateLockupData(data)).toContain('股价必须大于0');
  });

  it('多个错误应全部返回', () => {
    const data = { ...sampleExpiries[0], symbol: '', totalShares: 0, price: -1 };
    const errors = validateLockupData(data);
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });
});

// ==================== 影响评估 ====================

describe('calculateUnlockImpact 影响评估', () => {
  it('小比例解禁应为低影响', () => {
    const result = calculateUnlockImpact(sampleExpiries[1], 500000);
    expect(result.impactLevel).toBe('低');
  });

  it('大比例解禁应为高影响', () => {
    const result = calculateUnlockImpact(sampleExpiries[4], 100000);
    expect(result.impactLevel).toBe('极高');
  });

  it('消化天数应正确计算', () => {
    const result = calculateUnlockImpact(sampleExpiries[0], 500000);
    expect(result.volumeDays).toBe(100); // 50000000 / 500000
  });

  it('零成交量应返回Infinity', () => {
    const result = calculateUnlockImpact(sampleExpiries[0], 0);
    expect(result.volumeDays).toBe(Infinity);
  });

  it('riskScore应在0-100之间', () => {
    for (const expiry of sampleExpiries) {
      const result = calculateUnlockImpact(expiry, 500000);
      expect(result.riskScore).toBeGreaterThanOrEqual(0);
      expect(result.riskScore).toBeLessThanOrEqual(100);
    }
  });

  it('中等比例应为中等影响', () => {
    const data = { ...sampleExpiries[0], unlockRatio: 3 };
    const result = calculateUnlockImpact(data, 1000000);
    expect(result.impactLevel).toBe('中');
  });

  it('高比例应为高影响', () => {
    const data = { ...sampleExpiries[0], unlockRatio: 10 };
    const result = calculateUnlockImpact(data, 1000000);
    expect(result.impactLevel).toBe('高');
  });
});

// ==================== 筛选 ====================

describe('filterLockups 解禁筛选', () => {
  it('按日期范围筛选', () => {
    const result = filterLockups(sampleExpiries, { startDate: '2026-04-01', endDate: '2026-04-15' });
    expect(result.every(e => e.expiryDate >= '2026-04-01' && e.expiryDate <= '2026-04-15')).toBe(true);
  });

  it('按解禁类型筛选', () => {
    const result = filterLockups(sampleExpiries, { types: ['首发原股东限售'] });
    expect(result.every(e => e.lockupType === '首发原股东限售')).toBe(true);
  });

  it('按市值范围筛选', () => {
    const result = filterLockups(sampleExpiries, { minMarketValue: 1000000000, maxMarketValue: 10000000000 });
    expect(result.every(e => e.marketValue >= 1000000000 && e.marketValue <= 10000000000)).toBe(true);
  });

  it('按比例范围筛选', () => {
    const result = filterLockups(sampleExpiries, { minRatio: 1, maxRatio: 5 });
    expect(result.every(e => e.unlockRatio >= 1 && e.unlockRatio <= 5)).toBe(true);
  });

  it('空筛选条件应返回全部', () => {
    expect(filterLockups(sampleExpiries, {})).toHaveLength(sampleExpiries.length);
  });

  it('组合筛选应取交集', () => {
    const result = filterLockups(sampleExpiries, { types: ['首发原股东限售'], minMarketValue: 5000000000 });
    expect(result.every(e => e.lockupType === '首发原股东限售' && e.marketValue >= 5000000000)).toBe(true);
  });
});

// ==================== 排序 ====================

describe('sortLockups 解禁排序', () => {
  it('按日期升序', () => {
    const sorted = sortLockups(sampleExpiries, 'expiryDate', 'asc');
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].expiryDate >= sorted[i - 1].expiryDate).toBe(true);
    }
  });

  it('按市值降序', () => {
    const sorted = sortLockups(sampleExpiries, 'marketValue', 'desc');
    expect(sorted[0].marketValue).toBeGreaterThanOrEqual(sorted[1].marketValue);
  });

  it('按比例降序', () => {
    const sorted = sortLockups(sampleExpiries, 'unlockRatio', 'desc');
    expect(sorted[0].unlockRatio).toBeGreaterThanOrEqual(sorted[1].unlockRatio);
  });

  it('不应修改原数组', () => {
    const original = [...sampleExpiries];
    sortLockups(sampleExpiries, 'marketValue', 'desc');
    expect(sampleExpiries).toEqual(original);
  });
});

// ==================== 按日期分组 ====================

describe('groupByDate 按日期分组', () => {
  it('应正确按日期分组', () => {
    const groups = groupByDate(sampleExpiries);
    expect(groups.get('2026-04-15')).toHaveLength(2); // 茅台和平安
    expect(groups.get('2026-04-10')).toHaveLength(1);
  });

  it('空数组应返回空map', () => {
    expect(groupByDate([]).size).toBe(0);
  });
});

// ==================== 月度汇总 ====================

describe('calculateMonthlySummary 月度汇总', () => {
  it('应正确计算总数量', () => {
    const summary = calculateMonthlySummary(sampleExpiries);
    expect(summary.totalCount).toBe(5);
  });

  it('应正确计算总市值', () => {
    const summary = calculateMonthlySummary(sampleExpiries);
    const expectedTotal = sampleExpiries.reduce((s, e) => s + e.marketValue, 0);
    expect(summary.totalMarketValue).toBe(expectedTotal);
  });

  it('应正确计算平均比例', () => {
    const summary = calculateMonthlySummary(sampleExpiries);
    const expectedAvg = sampleExpiries.reduce((s, e) => s + e.unlockRatio, 0) / sampleExpiries.length;
    expect(summary.avgRatio).toBeCloseTo(expectedAvg);
  });

  it('应找到最大市值', () => {
    const summary = calculateMonthlySummary(sampleExpiries);
    expect(summary.maxMarketValue).toBe(90000000000); // 茅台
  });

  it('应按类型统计市值', () => {
    const summary = calculateMonthlySummary(sampleExpiries);
    expect(summary.byType.has('首发原股东限售')).toBe(true);
  });

  it('空数组应返回零值', () => {
    const summary = calculateMonthlySummary([]);
    expect(summary.totalCount).toBe(0);
    expect(summary.totalMarketValue).toBe(0);
    expect(summary.avgRatio).toBe(0);
  });
});

// ==================== 日期工具 ====================

describe('日期工具函数', () => {
  it('isDateInRange应正确判断日期范围', () => {
    expect(isDateInRange('2026-04-15', '2026-04-01', '2026-04-30')).toBe(true);
    expect(isDateInRange('2026-05-01', '2026-04-01', '2026-04-30')).toBe(false);
    expect(isDateInRange('2026-04-01', '2026-04-01', '2026-04-30')).toBe(true);
    expect(isDateInRange('2026-04-30', '2026-04-01', '2026-04-30')).toBe(true);
  });

  it('getDaysUntilExpiry应正确计算天数', () => {
    expect(getDaysUntilExpiry('2026-04-15', '2026-04-10')).toBe(5);
    expect(getDaysUntilExpiry('2026-04-10', '2026-04-10')).toBe(0);
    expect(getDaysUntilExpiry('2026-04-05', '2026-04-10')).toBe(-5);
  });
});

// ==================== 类型常量 ====================

describe('解禁类型常量', () => {
  it('应包含所有解禁类型', () => {
    expect(LOCKUP_TYPES).toHaveLength(4);
    expect(LOCKUP_TYPES).toContain('首发原股东限售');
    expect(LOCKUP_TYPES).toContain('定向增发机构配售');
    expect(LOCKUP_TYPES).toContain('股权激励限售');
    expect(LOCKUP_TYPES).toContain('追加承诺限售');
  });

  it('应包含所有股东类型', () => {
    expect(SHAREHOLDER_TYPES.length).toBeGreaterThanOrEqual(5);
    expect(SHAREHOLDER_TYPES).toContain('控股股东');
    expect(SHAREHOLDER_TYPES).toContain('战略投资者');
    expect(SHAREHOLDER_TYPES).toContain('员工持股计划');
  });
});
