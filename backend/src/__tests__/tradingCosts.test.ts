import { describe, it, expect } from 'vitest';

// 交易成本计算
interface TradeCost {
  price: number;
  quantity: number;
  commissionRate: number;
  stampTaxRate: number;
  transferFeeRate: number;
}

function calculateBuyCost(cost: TradeCost): number {
  const amount = cost.price * cost.quantity;
  const commission = Math.max(amount * cost.commissionRate, 5); // 最低5元
  const transferFee = amount * cost.transferFeeRate;
  return amount + commission + transferFee;
}

function calculateSellCost(cost: TradeCost): number {
  const amount = cost.price * cost.quantity;
  const commission = Math.max(amount * cost.commissionRate, 5);
  const stampTax = amount * cost.stampTaxRate;
  const transferFee = amount * cost.transferFeeRate;
  return amount - commission - stampTax - transferFee;
}

function calculateRoundTripProfit(
  buyPrice: number, sellPrice: number, quantity: number,
  commissionRate: number = 0.0003, stampTaxRate: number = 0.001, transferFeeRate: number = 0.00001
): number {
  const buyCost = calculateBuyCost({ price: buyPrice, quantity, commissionRate, stampTaxRate, transferFeeRate });
  const sellRevenue = calculateSellCost({ price: sellPrice, quantity, commissionRate, stampTaxRate, transferFeeRate });
  return sellRevenue - buyCost;
}

describe('交易成本计算', () => {
  it('买入成本包含佣金和过户费', () => {
    const cost = calculateBuyCost({
      price: 10, quantity: 1000, commissionRate: 0.0003, stampTaxRate: 0, transferFeeRate: 0.00001
    });
    expect(cost).toBeCloseTo(10005.1, 2); // commission=max(3,5)=5, transfer=0.1
  });

  it('佣金最低5元', () => {
    const cost = calculateBuyCost({
      price: 1, quantity: 100, commissionRate: 0.0003, stampTaxRate: 0, transferFeeRate: 0.00001
    });
    // amount = 100, commission should be max(0.03, 5) = 5
    expect(cost).toBeCloseTo(100 + 5 + 0.001, 2);
  });

  it('卖出成本扣除印花税', () => {
    const revenue = calculateSellCost({
      price: 10, quantity: 1000, commissionRate: 0.0003, stampTaxRate: 0.001, transferFeeRate: 0.00001
    });
    expect(revenue).toBeCloseTo(10000 - 5 - 10 - 0.1, 2); // commission=max(3,5)=5
  });

  it('盈亏计算：盈利', () => {
    const profit = calculateRoundTripProfit(10, 11, 1000);
    expect(profit).toBeGreaterThan(0);
  });

  it('盈亏计算：亏损', () => {
    const profit = calculateRoundTripProfit(10, 9, 1000);
    expect(profit).toBeLessThan(0);
  });

  it('不同佣金率影响成本', () => {
    const cost1 = calculateBuyCost({
      price: 10, quantity: 1000, commissionRate: 0.0003, stampTaxRate: 0, transferFeeRate: 0
    });
    const cost2 = calculateBuyCost({
      price: 10, quantity: 1000, commissionRate: 0.001, stampTaxRate: 0, transferFeeRate: 0
    });
    expect(cost2).toBeGreaterThan(cost1);
  });

  it('大额交易佣金合理', () => {
    const cost = calculateBuyCost({
      price: 100, quantity: 10000, commissionRate: 0.0003, stampTaxRate: 0, transferFeeRate: 0.00001
    });
    // amount = 1,000,000, commission = 300
    expect(cost).toBeCloseTo(1000000 + 300 + 10, 2);
  });

  it('过户费随金额增加', () => {
    const cost1 = calculateBuyCost({
      price: 10, quantity: 1000, commissionRate: 0, stampTaxRate: 0, transferFeeRate: 0.00001
    });
    const cost2 = calculateBuyCost({
      price: 100, quantity: 1000, commissionRate: 0, stampTaxRate: 0, transferFeeRate: 0.00001
    });
    expect(cost2 - 100000).toBeGreaterThan(cost1 - 10000);
  });

  it('买入数量为100股整数倍', () => {
    const quantity = 300;
    const cost = calculateBuyCost({
      price: 50, quantity, commissionRate: 0.0003, stampTaxRate: 0, transferFeeRate: 0.00001
    });
    expect(cost).toBeCloseTo(15005.15, 2); // commission=max(4.5,5)=5, transfer=0.15
  });

  it('盈亏率计算', () => {
    const profitRate = calculateRoundTripProfit(10, 11, 1000) / (10 * 1000);
    expect(profitRate).toBeGreaterThan(0);
    expect(profitRate).toBeLessThan(0.1); // 10%以内
  });
});

// 盘前集合竞价
function isCallAuctionTime(hour: number, minute: number): boolean {
  // 9:15-9:25
  return hour === 9 && minute >= 15 && minute <= 25;
}

function getCallAuctionPhase(hour: number, minute: number): string {
  if (hour === 9 && minute >= 15 && minute <= 20) return '可撤单';
  if (hour === 9 && minute >= 21 && minute <= 25) return '不可撤单';
  return '非集合竞价';
}

describe('集合竞价', () => {
  it('9:15是集合竞价开始', () => {
    expect(isCallAuctionTime(9, 15)).toBe(true);
  });

  it('9:25是集合竞价结束', () => {
    expect(isCallAuctionTime(9, 25)).toBe(true);
  });

  it('9:26不是集合竞价', () => {
    expect(isCallAuctionTime(9, 26)).toBe(false);
  });

  it('9:14不是集合竞价', () => {
    expect(isCallAuctionTime(9, 14)).toBe(false);
  });

  it('9:15-9:20可撤单阶段', () => {
    expect(getCallAuctionPhase(9, 15)).toBe('可撤单');
    expect(getCallAuctionPhase(9, 20)).toBe('可撤单');
  });

  it('9:21-9:25不可撤单阶段', () => {
    expect(getCallAuctionPhase(9, 21)).toBe('不可撤单');
    expect(getCallAuctionPhase(9, 25)).toBe('不可撤单');
  });

  it('9:14不是集合竞价', () => {
    expect(getCallAuctionPhase(9, 14)).toBe('非集合竞价');
  });
});

// A股涨跌停计算
function isLimitUp(price: number, prevClose: number, isST: boolean = false): boolean {
  const limit = isST ? 0.05 : 0.1;
  return price >= prevClose * (1 + limit) - 0.001;
}

function isLimitDown(price: number, prevClose: number, isST: boolean = false): boolean {
  const limit = isST ? 0.05 : 0.1;
  return price <= prevClose * (1 - limit) + 0.001;
}

function calculateLimitPrices(prevClose: number, isST: boolean = false): { up: number; down: number } {
  const limit = isST ? 0.05 : 0.1;
  return {
    up: Math.round(prevClose * (1 + limit) * 100) / 100,
    down: Math.round(prevClose * (1 - limit) * 100) / 100
  };
}

describe('涨跌停计算', () => {
  it('普通股票涨停10%', () => {
    expect(isLimitUp(11, 10)).toBe(true);
    expect(isLimitUp(10.9, 10)).toBe(false);
  });

  it('普通股票跌停10%', () => {
    expect(isLimitDown(9, 10)).toBe(true);
    expect(isLimitDown(9.1, 10)).toBe(false);
  });

  it('ST股票涨跌停5%', () => {
    expect(isLimitUp(10.5, 10, true)).toBe(true);
    expect(isLimitDown(9.5, 10, true)).toBe(true);
    expect(isLimitUp(10.4, 10, true)).toBe(false); // below 10.5 threshold
  });

  it('计算涨停价', () => {
    const limits = calculateLimitPrices(10);
    expect(limits.up).toBe(11);
    expect(limits.down).toBe(9);
  });

  it('计算ST涨跌停价', () => {
    const limits = calculateLimitPrices(10, true);
    expect(limits.up).toBe(10.5);
    expect(limits.down).toBe(9.5);
  });

  it('高价股涨停价精确到分', () => {
    const limits = calculateLimitPrices(100);
    expect(limits.up).toBe(110);
    expect(limits.down).toBe(90);
  });

  it('零值或负值处理', () => {
    expect(isLimitUp(0, 0)).toBe(true); // 0 >= -0.001 (tolerance)
    expect(isLimitDown(0, 0)).toBe(true); // 0 <= 0.001 (tolerance)
  });

  it('涨跌停价是精确的10%', () => {
    const limits = calculateLimitPrices(32.57);
    const expectedUp = Math.round(32.57 * 1.1 * 100) / 100;
    const expectedDown = Math.round(32.57 * 0.9 * 100) / 100;
    expect(limits.up).toBe(expectedUp);
    expect(limits.down).toBe(expectedDown);
  });
});

// 红利税计算
function calculateDividendTax(
  dividendPerShare: number, shares: number, holdingDays: number
): number {
  const totalDividend = dividendPerShare * shares;
  let taxRate: number;
  
  if (holdingDays < 1) {
    taxRate = 0.2; // 持股不足1个月
  } else if (holdingDays < 12) {
    taxRate = 0.1; // 持股1个月到1年
  } else {
    taxRate = 0; // 持股超过1年免税
  }
  
  return totalDividend * taxRate;
}

describe('红利税计算', () => {
  it('持股超过1年免税', () => {
    const tax = calculateDividendTax(0.5, 1000, 400);
    expect(tax).toBe(0);
  });

  it('持股1个月到1年税率10%', () => {
    const tax = calculateDividendTax(0.5, 1000, 6); // 6 months
    expect(tax).toBeCloseTo(50, 2);
  });

  it('持股不足1个月税率20%', () => {
    const tax = calculateDividendTax(0.5, 1000, 0); // < 1 month
    expect(tax).toBeCloseTo(100, 2);
  });

  it('零股息零税', () => {
    const tax = calculateDividendTax(0, 1000, 10);
    expect(tax).toBe(0);
  });

  it('大额分红税率正确', () => {
    const tax = calculateDividendTax(1, 100000, 0); // <1 month → 20%
    expect(tax).toBeCloseTo(20000, 2);
  });

  it('精确边界：365天免税', () => {
    const tax = calculateDividendTax(1, 1000, 365);
    expect(tax).toBe(0);
  });

  it('精确边界：1天10%', () => {
    const tax = calculateDividendTax(1, 1000, 1);
    expect(tax).toBeCloseTo(100, 2);
  });
});

// 股票除权除息价计算
function calculateExRightsPrice(
  prevClose: number,
  dividend: number,
  bonusShares: number, // 每10股送股
  capitalIncrease: number // 每10股转增
): number {
  if (prevClose <= 0) return 0;
  const totalNewShares = (bonusShares + capitalIncrease) / 10;
  return (prevClose - dividend) / (1 + totalNewShares);
}

describe('除权除息价计算', () => {
  it('纯现金分红', () => {
    const price = calculateExRightsPrice(10, 0.5, 0, 0);
    expect(price).toBe(9.5);
  });

  it('纯送股', () => {
    const price = calculateExRightsPrice(10, 0, 5, 0);
    expect(price).toBeCloseTo(10 / 1.5, 4);
  });

  it('纯转增', () => {
    const price = calculateExRightsPrice(10, 0, 0, 5);
    expect(price).toBeCloseTo(10 / 1.5, 4);
  });

  it('混合方案', () => {
    const price = calculateExRightsPrice(10, 0.5, 3, 2);
    expect(price).toBeCloseTo((10 - 0.5) / 1.5, 4);
  });

  it('零值返回零', () => {
    expect(calculateExRightsPrice(0, 0.5, 0, 0)).toBe(0);
  });

  it('大比例送转', () => {
    const price = calculateExRightsPrice(30, 0, 10, 10);
    expect(price).toBe(10); // (30-0)/(1+2) = 10
  });

  it('高分红除权', () => {
    const price = calculateExRightsPrice(100, 10, 0, 0);
    expect(price).toBe(90);
  });

  it('分红+送股+转增', () => {
    const price = calculateExRightsPrice(50, 2, 2, 3);
    expect(price).toBeCloseTo((50 - 2) / 1.5, 4);
  });
});

// 股票代码验证
function isValidStockCode(code: string): boolean {
  if (!code || code.length !== 6) return false;
  const num = parseInt(code);
  if (isNaN(num)) return false;
  // 上海: 600xxx, 601xxx, 603xxx, 605xxx, 688xxx (科创板)
  // 深圳: 000xxx, 001xxx, 002xxx, 003xxx, 300xxx (创业板), 301xxx
  const prefix = code.substring(0, 3);
  return ['600', '601', '603', '605', '688', '000', '001', '002', '003', '300', '301'].includes(prefix);
}

function getMarketFromCode(code: string): string {
  if (code.startsWith('6') || code.startsWith('688')) return 'sh';
  if (code.startsWith('0') || code.startsWith('3')) return 'sz';
  return 'unknown';
}

describe('股票代码验证', () => {
  it('上证主板600', () => {
    expect(isValidStockCode('600519')).toBe(true);
  });

  it('上证主板601', () => {
    expect(isValidStockCode('601398')).toBe(true);
  });

  it('科创板688', () => {
    expect(isValidStockCode('688001')).toBe(true);
  });

  it('深证主板000', () => {
    expect(isValidStockCode('000001')).toBe(true);
  });

  it('中小板002', () => {
    expect(isValidStockCode('002415')).toBe(true);
  });

  it('创业板300', () => {
    expect(isValidStockCode('300750')).toBe(true);
  });

  it('无效代码', () => {
    expect(isValidStockCode('999999')).toBe(false);
    expect(isValidStockCode('')).toBe(false);
    expect(isValidStockCode('12345')).toBe(false);
    expect(isValidStockCode('ABCDEF')).toBe(false);
  });

  it('判断市场', () => {
    expect(getMarketFromCode('600519')).toBe('sh');
    expect(getMarketFromCode('688001')).toBe('sh');
    expect(getMarketFromCode('000001')).toBe('sz');
    expect(getMarketFromCode('300750')).toBe('sz');
  });

  it('6位数字验证', () => {
    expect(isValidStockCode('000001')).toBe(true);
    expect(isValidStockCode('600000')).toBe(true);
    expect(isValidStockCode('00001')).toBe(false);
    expect(isValidStockCode('0000001')).toBe(false);
  });
});

// 可转债转股价格
function calculateConvertibleBondParity(bondPrice: number, conversionPrice: number): number {
  if (conversionPrice <= 0) return 0;
  return (bondPrice / 100) * conversionPrice;
}

function calculatePremium(bondPrice: number, stockPrice: number, conversionPrice: number): number {
  if (stockPrice <= 0) return Infinity;
  const parity = calculateConvertibleBondParity(bondPrice, conversionPrice);
  return (parity - stockPrice) / stockPrice;
}

describe('可转债计算', () => {
  it('转股平价计算', () => {
    const parity = calculateConvertibleBondParity(130, 10);
    expect(parity).toBe(13);
  });

  it('面值转股平价', () => {
    const parity = calculateConvertibleBondParity(100, 10);
    expect(parity).toBe(10);
  });

  it('转股溢价率', () => {
    const premium = calculatePremium(120, 8, 10);
    // parity = 12, premium = (12 - 8) / 8 = 0.5
    expect(premium).toBeCloseTo(0.5, 4);
  });

  it('折价转股', () => {
    const premium = calculatePremium(80, 10, 10);
    // parity = 8, premium = (8 - 10) / 10 = -0.2
    expect(premium).toBeCloseTo(-0.2, 4);
  });

  it('零转股价', () => {
    const parity = calculateConvertibleBondParity(100, 0);
    expect(parity).toBe(0);
  });

  it('零正股价溢价率', () => {
    const premium = calculatePremium(100, 0, 10);
    expect(premium).toBe(Infinity);
  });

  it('平价等于正股价时溢价为零', () => {
    const premium = calculatePremium(100, 10, 10);
    expect(premium).toBeCloseTo(0, 4);
  });
});

// 复权因子计算
function calculateForwardAdjustmentFactor(
  currentPrice: number, adjustedPrice: number
): number {
  if (adjustedPrice <= 0) return 1;
  return currentPrice / adjustedPrice;
}

function calculateCumulativeAdjustmentFactor(
  factors: number[]
): number {
  return factors.reduce((acc, f) => acc * f, 1);
}

function applyForwardAdjustment(price: number, factor: number): number {
  return price * factor;
}

describe('复权因子计算', () => {
  it('复权因子=实际价/复权价', () => {
    const factor = calculateForwardAdjustmentFactor(10, 9);
    expect(factor).toBeCloseTo(1.111, 3);
  });

  it('累计复权因子', () => {
    const factor = calculateCumulativeAdjustmentFactor([1.05, 1.1, 0.95]);
    expect(factor).toBeCloseTo(1.09725, 5);
  });

  it('单因子=自身', () => {
    const factor = calculateCumulativeAdjustmentFactor([1.05]);
    expect(factor).toBe(1.05);
  });

  it('空因子列表返回1', () => {
    expect(calculateCumulativeAdjustmentFactor([])).toBe(1);
  });

  it('应用前复权', () => {
    const adjusted = applyForwardAdjustment(10, 0.9);
    expect(adjusted).toBe(9);
  });

  it('因子为1时不改变价格', () => {
    expect(applyForwardAdjustment(100, 1)).toBe(100);
  });

  it('零复权价返回因子1', () => {
    expect(calculateForwardAdjustmentFactor(10, 0)).toBe(1);
  });

  it('多个除权事件累计', () => {
    const factors = [1.02, 0.98, 1.05, 1.03];
    const cumulative = calculateCumulativeAdjustmentFactor(factors);
    expect(cumulative).toBeGreaterThan(1);
    expect(cumulative).toBeLessThan(1.15);
  });
});
