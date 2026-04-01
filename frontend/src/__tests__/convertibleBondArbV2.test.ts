import { describe, it, expect } from 'vitest';

// 可转债套利分析引擎
interface ConvertibleBond {
  symbol: string;
  name: string;
  bondPrice: number;
  conversionPrice: number;
  stockPrice: number;
  premium: number;
  ytm: number;
  delta: number;
  remainingYears: number;
  couponRate: number;
  conversionRatio: number;
}

interface CBArbitrage {
  symbol: string;
  conversionValue: number;
  premiumRate: number;
  arbitrageType: 'convert' | 'reverse' | 'none';
  expectedReturn: number;
  risk: 'low' | 'medium' | 'high';
}

function calcConversionValue(bond: ConvertibleBond): number {
  return (bond.stockPrice / bond.conversionPrice) * 100;
}

function calcPremiumRate(bond: ConvertibleBond): number {
  const convValue = calcConversionValue(bond);
  return convValue > 0 ? (bond.bondPrice - convValue) / convValue : 0;
}

function findArbitrage(bond: ConvertibleBond): CBArbitrage {
  const conversionValue = calcConversionValue(bond);
  const premiumRate = calcPremiumRate(bond);

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

  return { symbol: bond.symbol, conversionValue, premiumRate, arbitrageType, expectedReturn, risk };
}

function rankBonds(bonds: ConvertibleBond[]): CBArbitrage[] {
  return bonds
    .map(b => findArbitrage(b))
    .sort((a, b) => b.expectedReturn - a.expectedReturn);
}

function filterLowPremiumBonds(bonds: ConvertibleBond[], maxPremium: number = 0.1): ConvertibleBond[] {
  return bonds.filter(b => calcPremiumRate(b) <= maxPremium).sort((a, b) => calcPremiumRate(a) - calcPremiumRate(b));
}

function calcBondFloor(bond: ConvertibleBond): number {
  const { remainingYears, couponRate, ytm } = bond;
  let floor = 0;
  for (let i = 1; i <= remainingYears; i++) {
    floor += couponRate / Math.pow(1 + ytm, i);
  }
  floor += 100 / Math.pow(1 + ytm, remainingYears);
  return floor;
}

describe('可转债套利分析引擎', () => {
  const bonds: ConvertibleBond[] = [
    { symbol: '110059', name: '转债A', bondPrice: 98, conversionPrice: 10, stockPrice: 10.5, premium: 0, ytm: 0.03, delta: 0.6, remainingYears: 2, couponRate: 2, conversionRatio: 10 },
    { symbol: '110060', name: '转债B', bondPrice: 120, conversionPrice: 8, stockPrice: 9, premium: 0.2, ytm: 0.02, delta: 0.8, remainingYears: 1, couponRate: 1.5, conversionRatio: 12.5 },
    { symbol: '110061', name: '转债C', bondPrice: 150, conversionPrice: 5, stockPrice: 4, premium: 0.5, ytm: 0.01, delta: 0.3, remainingYears: 3, couponRate: 1, conversionRatio: 20 },
    { symbol: '110062', name: '转债D', bondPrice: 105, conversionPrice: 12, stockPrice: 14, premium: 0, ytm: 0.025, delta: 0.7, remainingYears: 2, couponRate: 1.8, conversionRatio: 8.33 },
  ];

  it('应计算转股价值', () => {
    const value = calcConversionValue(bonds[0]);
    expect(value).toBe(105);
  });

  it('应计算溢价率', () => {
    const premium = calcPremiumRate(bonds[0]);
    expect(premium).toBeCloseTo(-0.0667, 3);
  });

  it('应寻找套利机会', () => {
    bonds.forEach(b => {
      const arb = findArbitrage(b);
      expect(['convert', 'reverse', 'none']).toContain(arb.arbitrageType);
      expect(arb.conversionValue).toBeGreaterThan(0);
    });
  });

  it('负溢价应为转股套利', () => {
    const arb = findArbitrage(bonds[0]);
    expect(arb.arbitrageType).toBe('convert');
    expect(arb.expectedReturn).toBeGreaterThan(0);
  });

  it('高溢价应为反向套利', () => {
    const arb = findArbitrage(bonds[2]);
    expect(arb.arbitrageType).toBe('reverse');
  });

  it('应排名可转债', () => {
    const ranked = rankBonds(bonds);
    expect(ranked.length).toBe(bonds.length);
    expect(ranked[0].expectedReturn).toBeGreaterThanOrEqual(ranked[ranked.length - 1].expectedReturn);
  });

  it('应筛选低溢价转债', () => {
    const low = filterLowPremiumBonds(bonds, 0.1);
    low.forEach(b => {
      expect(calcPremiumRate(b)).toBeLessThanOrEqual(0.1);
    });
  });

  it('应计算债底', () => {
    const floor = calcBondFloor(bonds[0]);
    expect(floor).toBeGreaterThan(90);
    expect(floor).toBeLessThan(120);
  });

  it('转股价值应与正股价格正相关', () => {
    const v1 = calcConversionValue(bonds[0]);
    const v2 = calcConversionValue(bonds[3]);
    expect(v1).toBeCloseTo(105, 0);
    expect(v2).toBeCloseTo(116.67, 1);
  });

  it('空数据排名应为空', () => {
    expect(rankBonds([])).toEqual([]);
  });
});
