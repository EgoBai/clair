import { describe, it, expect } from 'vitest';

// 市盈率 (PE) 计算
function calculatePE(price: number, eps: number): number {
  if (eps <= 0) return Infinity;
  return price / eps;
}

function calculateForwardPE(price: number, projectedEps: number): number {
  if (projectedEps <= 0) return Infinity;
  return price / projectedEps;
}

function calculateTTMPE(price: number, annualEps: number): number {
  return calculatePE(price, annualEps);
}

// 市净率 (PB) 计算
function calculatePB(price: number, bvps: number): number {
  if (bvps <= 0) return Infinity;
  return price / bvps;
}

// 市销率 (PS) 计算
function calculatePS(marketCap: number, revenue: number): number {
  if (revenue <= 0) return Infinity;
  return marketCap / revenue;
}

// ROE计算
function calculateROE(netIncome: number, equity: number): number {
  if (equity <= 0) return Infinity;
  return (netIncome / equity) * 100;
}

function calculateROA(netIncome: number, totalAssets: number): number {
  if (totalAssets <= 0) return Infinity;
  return (netIncome / totalAssets) * 100;
}

// 毛利率
function calculateGrossMargin(revenue: number, cogs: number): number {
  if (revenue <= 0) return 0;
  return ((revenue - cogs) / revenue) * 100;
}

// 净利率
function calculateNetMargin(revenue: number, netIncome: number): number {
  if (revenue <= 0) return 0;
  return (netIncome / revenue) * 100;
}

// 资产负债率
function calculateDebtRatio(totalLiabilities: number, totalAssets: number): number {
  if (totalAssets <= 0) return 0;
  return (totalLiabilities / totalAssets) * 100;
}

// 流动比率
function calculateCurrentRatio(currentAssets: number, currentLiabilities: number): number {
  if (currentLiabilities <= 0) return Infinity;
  return currentAssets / currentLiabilities;
}

// 速动比率
function calculateQuickRatio(currentAssets: number, inventory: number, currentLiabilities: number): number {
  if (currentLiabilities <= 0) return Infinity;
  return (currentAssets - inventory) / currentLiabilities;
}

// EPS增速
function calculateEpsGrowth(currentEps: number, prevEps: number): number {
  if (prevEps <= 0) return Infinity;
  return ((currentEps - prevEps) / prevEps) * 100;
}

// PEG
function calculatePEG(pe: number, epsGrowthRate: number): number {
  if (epsGrowthRate <= 0) return Infinity;
  return pe / epsGrowthRate;
}

// 股息率
function calculateDividendYield(dividendPerShare: number, price: number): number {
  if (price <= 0) return 0;
  return (dividendPerShare / price) * 100;
}

describe('市盈率PE计算', () => {
  it('PE = 股价 / EPS', () => {
    expect(calculatePE(100, 5)).toBe(20);
  });

  it('负EPS返回Infinity', () => {
    expect(calculatePE(100, -2)).toBe(Infinity);
  });

  it('零EPS返回Infinity', () => {
    expect(calculatePE(100, 0)).toBe(Infinity);
  });

  it('高PE股票', () => {
    expect(calculatePE(200, 1)).toBe(200);
  });

  it('低PE股票', () => {
    expect(calculatePE(50, 5)).toBe(10);
  });

  it('预期PE', () => {
    expect(calculateForwardPE(100, 6)).toBeCloseTo(16.67, 2);
  });

  it('TTM PE', () => {
    expect(calculateTTMPE(80, 4)).toBe(20);
  });
});

describe('市净率PB计算', () => {
  it('PB = 股价 / 每股净资产', () => {
    expect(calculatePB(20, 10)).toBe(2);
  });

  it('破净PB < 1', () => {
    expect(calculatePB(8, 10)).toBe(0.8);
  });

  it('负净资产返回Infinity', () => {
    expect(calculatePB(20, -5)).toBe(Infinity);
  });

  it('PB为1表示股价=净资产', () => {
    expect(calculatePB(10, 10)).toBe(1);
  });
});

describe('市销率PS计算', () => {
  it('PS = 市值 / 营收', () => {
    expect(calculatePS(1000, 500)).toBe(2);
  });

  it('零营收返回Infinity', () => {
    expect(calculatePS(1000, 0)).toBe(Infinity);
  });

  it('亏损公司PS较低', () => {
    const ps = calculatePS(5000, 2000);
    expect(ps).toBe(2.5);
  });
});

describe('ROE计算', () => {
  it('ROE = 净利润 / 净资产 × 100', () => {
    expect(calculateROE(100, 1000)).toBeCloseTo(10, 2);
  });

  it('高ROE公司', () => {
    expect(calculateROE(300, 1000)).toBe(30);
  });

  it('零净资产', () => {
    expect(calculateROE(100, 0)).toBe(Infinity);
  });

  it('负净资产', () => {
    expect(calculateROE(100, -500)).toBe(Infinity);
  });
});

describe('ROA计算', () => {
  it('ROA = 净利润 / 总资产 × 100', () => {
    expect(calculateROA(50, 1000)).toBe(5);
  });

  it('ROA低于ROE（正常情况）', () => {
    const roe = calculateROE(100, 500);
    const roa = calculateROA(100, 1000);
    expect(roe).toBeGreaterThan(roa);
  });
});

describe('毛利率计算', () => {
  it('毛利率 = (营收-成本)/营收 × 100', () => {
    expect(calculateGrossMargin(1000, 600)).toBe(40);
  });

  it('100%毛利率（零成本）', () => {
    expect(calculateGrossMargin(1000, 0)).toBe(100);
  });

  it('零营收', () => {
    expect(calculateGrossMargin(0, 0)).toBe(0);
  });

  it('负毛利', () => {
    expect(calculateGrossMargin(100, 120)).toBe(-20);
  });
});

describe('净利率计算', () => {
  it('净利率 = 净利润 / 营收 × 100', () => {
    expect(calculateNetMargin(1000, 150)).toBe(15);
  });

  it('亏损公司净利率为负', () => {
    expect(calculateNetMargin(1000, -100)).toBe(-10);
  });

  it('毛利率 > 净利率（正常情况）', () => {
    const gross = calculateGrossMargin(1000, 400);
    const net = calculateNetMargin(1000, 200);
    expect(gross).toBeGreaterThan(net);
  });
});

describe('资产负债率计算', () => {
  it('资产负债率 = 负债 / 资产 × 100', () => {
    expect(calculateDebtRatio(400, 1000)).toBe(40);
  });

  it('100%资产负债率（资不抵债）', () => {
    expect(calculateDebtRatio(1000, 1000)).toBe(100);
  });

  it('零资产', () => {
    expect(calculateDebtRatio(100, 0)).toBe(0);
  });

  it('低负债率公司', () => {
    expect(calculateDebtRatio(200, 1000)).toBe(20);
  });
});

describe('流动比率计算', () => {
  it('流动比率 = 流动资产 / 流动负债', () => {
    expect(calculateCurrentRatio(600, 300)).toBe(2);
  });

  it('流动比率 > 1 表示短期偿债能力健康', () => {
    expect(calculateCurrentRatio(500, 300)).toBeGreaterThan(1);
  });

  it('零流动负债', () => {
    expect(calculateCurrentRatio(100, 0)).toBe(Infinity);
  });
});

describe('速动比率计算', () => {
  it('速动比率 = (流动资产-存货) / 流动负债', () => {
    expect(calculateQuickRatio(600, 100, 300)).toBeCloseTo(1.67, 2);
  });

  it('速动比率 < 1 可能有流动性风险', () => {
    expect(calculateQuickRatio(300, 200, 300)).toBeCloseTo(0.33, 2);
  });

  it('零存货时等于流动比率', () => {
    const current = calculateCurrentRatio(500, 250);
    const quick = calculateQuickRatio(500, 0, 250);
    expect(quick).toBe(current);
  });
});

describe('EPS增速计算', () => {
  it('正常增速', () => {
    expect(calculateEpsGrowth(2, 1)).toBe(100);
  });

  it('下降', () => {
    expect(calculateEpsGrowth(1, 2)).toBe(-50);
  });

  it('零基期EPS', () => {
    expect(calculateEpsGrowth(1, 0)).toBe(Infinity);
  });

  it('不变', () => {
    expect(calculateEpsGrowth(3, 3)).toBe(0);
  });
});

describe('PEG计算', () => {
  it('PEG = PE / EPS增速', () => {
    expect(calculatePEG(20, 25)).toBeCloseTo(0.8, 2);
  });

  it('PEG < 1 可能被低估', () => {
    expect(calculatePEG(15, 30)).toBeLessThan(1);
  });

  it('PEG > 1 可能被高估', () => {
    expect(calculatePEG(30, 10)).toBe(3);
  });

  it('零增速', () => {
    expect(calculatePEG(20, 0)).toBe(Infinity);
  });
});

describe('股息率计算', () => {
  it('股息率 = 每股股息 / 股价 × 100', () => {
    expect(calculateDividendYield(2, 50)).toBe(4);
  });

  it('零股息', () => {
    expect(calculateDividendYield(0, 50)).toBe(0);
  });

  it('零股价', () => {
    expect(calculateDividendYield(2, 0)).toBe(0);
  });

  it('高股息率', () => {
    expect(calculateDividendYield(5, 40)).toBe(12.5);
  });
});
