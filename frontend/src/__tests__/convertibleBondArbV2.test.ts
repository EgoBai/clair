/**
 * 可转债套利分析引擎测试 — 影子测试迁移（批次 23）
 *
 * 已绑定生产实现（frontend/src/utils/convertibleBondEngine.ts）：
 * - :73  calcConversionValue   = stockPrice × conversionRatio
 * - :80  calcConversionPremium = (price - cv) / cv，cv === 0 时返回 Infinity
 * - :89  calcBondFloor         = 固定 5% 折现的简化 DCF（完全忽略 ytm）
 *
 * 旧断言错在哪（旧值 → 生产值）：
 * | 旧断言 | 生产行为 | 依据 |
 * | cv = (stockPrice / conversionPrice) × 100，D = 116.67 | 生产 = stockPrice × conversionRatio，D = 14 × 8.33 = 116.62 | convertibleBondEngine.ts:73-75 |
 * | 债底按 ytm 折现，A = 98.09（仅 90~120 松断言） | 生产固定 5% 折现，A = 94.42 | convertibleBondEngine.ts:89-103 |
 * | 转股价值为 0 时溢价率返回 0 | 生产返回 Infinity | convertibleBondEngine.ts:80-84 |
 * | 字段 bondPrice / remainingYears / symbol | 生产字段 price / yearsToMaturity / code | convertibleBondEngine.ts:6-24 |
 *
 * 未迁移（生产无对应实现，保留本地 helper 与用例）：
 * - findArbitrage / rankBonds / filterLowPremiumBonds：生产没有套利机会/排名/筛选 API；
 *   本地 helper 内部改用生产 calcConversionValue / calcConversionPremium。
 * - 生产另有 analyzeCBValuation / analyzeTriggers / filterBonds / dualLowRanking，
 *   语义不同，本文件原有用例不涉及。
 *
 * 本地保留业务规则：套利阈值 -2% / +30%、风险分级、排名与低溢价筛选。
 * 生产缺陷候选：
 * - calcBondFloor 用固定 5% 折现、完全忽略 ytm（新增用例锁定该行为）。
 * 新增：零转股价值溢价率 1 例、ytm 不影响债底 1 例。
 */

import { describe, it, expect } from 'vitest';
import {
  calcConversionValue,
  calcConversionPremium,
  calcBondFloor,
  type ConvertibleBond,
} from '../utils/convertibleBondEngine';

interface CBArbitrage {
  symbol: string;
  conversionValue: number;
  premiumRate: number;
  arbitrageType: 'convert' | 'reverse' | 'none';
  expectedReturn: number;
  risk: 'low' | 'medium' | 'high';
}

// 未迁移：生产没有套利机会判定 API，阈值与风险分级是本文件保留的业务规则。
function findArbitrage(bond: ConvertibleBond): CBArbitrage {
  const conversionValue = calcConversionValue(bond);
  const premiumRate = calcConversionPremium(bond);

  let arbitrageType: CBArbitrage['arbitrageType'] = 'none';
  let expectedReturn = 0;
  let risk: CBArbitrage['risk'] = 'medium';

  if (premiumRate < -0.02) {
    arbitrageType = 'convert';
    expectedReturn = Math.abs(premiumRate) - 0.005;
    risk = premiumRate < -0.05 ? 'low' : 'medium';
  } else if (premiumRate > 0.3) {
    arbitrageType = 'reverse';
    expectedReturn = -premiumRate * 0.3;
    risk = 'high';
  }

  return { symbol: bond.code, conversionValue, premiumRate, arbitrageType, expectedReturn, risk };
}

// 未迁移：生产没有排名 API；排序规则（预期收益降序）本地保留。
function rankBonds(bonds: ConvertibleBond[]): CBArbitrage[] {
  return bonds
    .map((bond) => findArbitrage(bond))
    .sort((a, b) => b.expectedReturn - a.expectedReturn);
}

// 未迁移：生产没有低溢价筛选 API；阈值与排序规则本地保留。
function filterLowPremiumBonds(bonds: ConvertibleBond[], maxPremium: number = 0.1): ConvertibleBond[] {
  return bonds
    .filter((bond) => calcConversionPremium(bond) <= maxPremium)
    .sort((a, b) => calcConversionPremium(a) - calcConversionPremium(b));
}

describe('可转债套利分析引擎', () => {
  const bonds: ConvertibleBond[] = [
    {
      code: '110059', name: '转债A', ticker: '000001', stockName: '正股A',
      price: 98, parValue: 100, stockPrice: 10.5, conversionPrice: 10, conversionRatio: 10,
      couponRate: [2, 2], yearsToMaturity: 2, creditRating: 'AA',
      putPrice: 100, callPrice: 130, callTriggerPrice: 13, putTriggerDays: 30, ytm: 0.03,
    },
    {
      code: '110060', name: '转债B', ticker: '000002', stockName: '正股B',
      price: 120, parValue: 100, stockPrice: 9, conversionPrice: 8, conversionRatio: 12.5,
      couponRate: [1.5], yearsToMaturity: 1, creditRating: 'AA',
      putPrice: 100, callPrice: 130, callTriggerPrice: 10.4, putTriggerDays: 30, ytm: 0.02,
    },
    {
      code: '110061', name: '转债C', ticker: '000003', stockName: '正股C',
      price: 150, parValue: 100, stockPrice: 4, conversionPrice: 5, conversionRatio: 20,
      couponRate: [1, 1, 1], yearsToMaturity: 3, creditRating: 'AA',
      putPrice: 100, callPrice: 130, callTriggerPrice: 6.5, putTriggerDays: 30, ytm: 0.01,
    },
    {
      code: '110062', name: '转债D', ticker: '000004', stockName: '正股D',
      price: 105, parValue: 100, stockPrice: 14, conversionPrice: 12, conversionRatio: 8.33,
      couponRate: [1.8, 1.8], yearsToMaturity: 2, creditRating: 'AA',
      putPrice: 100, callPrice: 130, callTriggerPrice: 15.6, putTriggerDays: 30, ytm: 0.025,
    },
  ];

  it('应计算转股价值', () => {
    const value = calcConversionValue(bonds[0]!);
    expect(value).toBe(105);
  });

  it('应计算溢价率', () => {
    const premium = calcConversionPremium(bonds[0]!);
    expect(premium).toBeCloseTo(-0.0667, 3);
  });

  it('应寻找套利机会', () => {
    bonds.forEach((bond) => {
      const arb = findArbitrage(bond);
      expect(['convert', 'reverse', 'none']).toContain(arb.arbitrageType);
      expect(arb.conversionValue).toBeGreaterThan(0);
    });
  });

  it('负溢价应为转股套利', () => {
    const arb = findArbitrage(bonds[0]!);
    expect(arb.arbitrageType).toBe('convert');
    expect(arb.expectedReturn).toBeGreaterThan(0);
    expect(arb.risk).toBe('low');
  });

  it('高溢价应为反向套利', () => {
    const arb = findArbitrage(bonds[2]!);
    expect(arb.arbitrageType).toBe('reverse');
  });

  it('应排名可转债', () => {
    const ranked = rankBonds(bonds);
    expect(ranked.length).toBe(bonds.length);
    expect(ranked[0]!.expectedReturn).toBeGreaterThanOrEqual(ranked[ranked.length - 1]!.expectedReturn);
    expect(ranked[0]!.symbol).toBe('110062');
    expect(ranked[ranked.length - 1]!.symbol).toBe('110061');
  });

  it('应筛选低溢价转债', () => {
    const low = filterLowPremiumBonds(bonds, 0.1);
    expect(low.length).toBe(3);
    low.forEach((bond) => {
      expect(calcConversionPremium(bond)).toBeLessThanOrEqual(0.1);
    });
    expect(low.map((bond) => bond.code)).toEqual(['110062', '110059', '110060']);
  });

  it('应计算债底（生产固定 5% 折现）', () => {
    const floor = calcBondFloor(bonds[0]!);
    expect(floor).toBeCloseTo(94.42, 2);
  });

  it('转股价值应与正股价格正相关', () => {
    const v1 = calcConversionValue(bonds[0]!);
    const v2 = calcConversionValue(bonds[3]!);
    expect(v1).toBeCloseTo(105, 0);
    expect(v2).toBeCloseTo(116.62, 5); // 旧断言 116.67
  });

  it('空数据排名应为空', () => {
    expect(rankBonds([])).toEqual([]);
  });

  it('转股价值为 0 时溢价率为 Infinity', () => {
    const zeroConversion: ConvertibleBond = { ...bonds[0]!, conversionRatio: 0 };
    expect(calcConversionPremium(zeroConversion)).toBe(Infinity);
  });

  it('债底不受 ytm 影响（生产缺陷候选）', () => {
    const lowYtm: ConvertibleBond = { ...bonds[0]!, ytm: 0.03 };
    const highYtm: ConvertibleBond = { ...bonds[0]!, ytm: 0.08 };
    expect(calcBondFloor(highYtm)).toBe(calcBondFloor(lowYtm));
    expect(calcBondFloor(highYtm)).toBeCloseTo(94.42, 2);
  });
});
