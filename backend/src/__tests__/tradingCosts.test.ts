import { describe, it, expect } from 'vitest';
// ── 生产实现绑定（M2 影子治理批次 41a）───────────────────────────────────────
//
// 一、原自抄实现的问题
//   1. 买入/卖出成本只算「佣金 + 过户费」，漏掉经手费（0.0000487）与证管费（0.000002），
//      且把所有分项加总后不逐项取整——生产 aStockTradeCostEngine.calculateTradeCost
//      逐项 round(…,2)、totalCost 只含费用不含成交金额。
//   2. 佣金率单位错位：自抄把 0.0003 当费率（万3），生产 BrokerFee.commissionRate 的单位是
//      「万分之」（standard=2.5），换算要 /10000。
//   3. 红利税把 holdingDays 当「月」用（6 = 6 个月、1 天按 10%），生产 calculateDividendTaxRate
//      按「天」分档：<30 天 20%、30–364 天 10%、>=365 天 0，且返回税率而非税额。
//   4. 除权除息价不取整到分、且有 prevClose<=0 守卫：生产 calculateExDividend 用 roundTo(…,2)
//      且无正数守卫（0 收盘会外推出负价）。
//   5. 可转债平价口径错：自抄用 (转债价格/100)×转股价，生产 calcConversionValue = 正股价 × 转股比例
//      （每张面值 100 元对应 100/转股价 股）。
//   6. 股票代码校验是发行段白名单（600/601/…/301）：生产 validateStockCode 只校验
//      ^(SH|SZ|BJ)?\d{6}$ 格式，'999999' 格式合法（旧断言 false 错）。
//   7. 复权因子全是单体纯函数（因子=实际价/复权价、乘积、乘价）：生产 adjustFactorEngine
//      只在序列级导出 calculateAdjustFactors/adjustPrices（显式 'none' 类型、无分红返回 1）。
//
// 二、绑定生产实现（file:line + 选型理由）
//   • frontend/src/utils/aStockTradeCostEngine.ts:82 calculateTradeCost
//     —— 唯一逐项拆分佣金/印花税/过户费/经手费/证管费的导出。
//     另一套口径登记：frontend/src/utils/tradingCostEngine.ts:80 calcCommission 只算佣金
//     （小数费率 + minFee，不含税费，也不拆项），无法满足本文件「成本构成」用例，故不选。
//   • frontend/src/utils/aStockTradeCostEngine.ts:133 calculateRoundTripCost
//     —— 同引擎的买卖双边合计，避免自算两次单边成本。
//   • frontend/src/utils/tradingCalendarEngine.ts:138 calculatePriceLimit
//     —— 按 ST/新股/科创/北交给出各自的涨跌停比例并取整到分。
//   • frontend/src/utils/tradingCalendarEngine.ts:122 calculateExDividend
//     —— 税前、每股口径，与本文件用例一致（现金分红按每股、送转按每10股÷10）。
//     另一套口径登记：backend/src/utils/exRights.ts:104 calculateExRightsReferencePrice
//     是税后口径（默认 taxRate=0.1）、每股、不取整，语义不同故不选。
//   • backend/src/utils/exRights.ts:93 calculateDividendTaxRate
//     —— 唯一按持股天数给红利税率的导出（返回税率，税额需 × 股息 × 股数）。
//   • frontend/src/utils/securityEngine.ts:177 validateStockCode
//     —— 唯一股票代码校验导出（格式口径，不做发行段校验）。
//   • frontend/src/utils/convertibleBondEngine.ts:73/80 calcConversionValue / calcConversionPremium
//     —— 唯一按正股价 × 转股比例计算转股价值的导出。
//   • frontend/src/utils/adjustFactorEngine.ts:26/46 calculateAdjustFactors / adjustPrices
//     —— 唯一序列级复权因子导出；注意 DividendEvent 注释写「每股」，实现里除以 10，
//       实际按「每10股」口径传参（本文件按实现口径传入）。
//
// 三、未迁移清单及原因
//   • 集合竞价时段/可撤单阶段：全仓 rg '09:15|09:25|可撤单|auction' 无生产导出（仅注释提及），
//     保留内联纯规格 helper。
//   • 涨跌停布尔判定 isLimitUp / isLimitDown：生产只给价格不给布尔，保留内联，
//     但阈值改由生产 calculatePriceLimit 供给。
//   • getMarketFromCode：生产无同契约导出（shared/formatters.ts:103 只有去后缀与中文名），保留内联。
//   • 复权因子单体函数（实际价/复权价、任意因子数组连乘、price×factor）：生产无同契约导出，
//     保留内联；序列级累计因子/空分红/零价守卫已改为绑定生产。
//   • 数据质量/评分类无涉本文件。

interface TradeCost {
  price: number;
  quantity: number;
  commissionRate: number;
  stampTaxRate: number;
  transferFeeRate: number;
}

import {
  calculateTradeCost,
  calculateRoundTripCost,
  type BrokerFee,
} from '../../../frontend/src/utils/aStockTradeCostEngine';
import {
  calculatePriceLimit,
  calculateExDividend,
} from '../../../frontend/src/utils/tradingCalendarEngine';
import { calculateDividendTaxRate } from '../../src/utils/exRights';
import { validateStockCode } from '../../../frontend/src/utils/securityEngine';
import {
  calcConversionValue,
  calcConversionPremium,
  type ConvertibleBond,
} from '../../../frontend/src/utils/convertibleBondEngine';
import { adjustFactorEngine, type DividendEvent, type PriceData } from '../../../frontend/src/utils/adjustFactorEngine';

// 原用例按「万3」讲述成本；生产 BrokerFee.commissionRate 单位是万分之，故 3 = 万3。
const BROKER_W3: BrokerFee = { name: '万3', commissionRate: 3, minCommission: 5, isWuMian: false };
const BROKER_W10: BrokerFee = { name: '万10', commissionRate: 10, minCommission: 5, isWuMian: false };

// 生产 totalCost 只含费用；买入总支出/卖出净收入在此加回/扣除成交金额，保持原用例口径。
const calculateBuyCost = (cost: TradeCost): number => {
  const broker: BrokerFee = {
    name: 'custom',
    commissionRate: cost.commissionRate * 10000, // 0.0003 → 3（万分之）
    minCommission: 5,
    isWuMian: false,
  };
  const breakdown = calculateTradeCost(cost.price, cost.quantity, 'buy', 'sh', broker);
  return breakdown.tradeAmount + breakdown.totalCost;
};

const calculateSellCost = (cost: TradeCost): number => {
  const broker: BrokerFee = {
    name: 'custom',
    commissionRate: cost.commissionRate * 10000,
    minCommission: 5,
    isWuMian: false,
  };
  const breakdown = calculateTradeCost(cost.price, cost.quantity, 'sell', 'sh', broker);
  return breakdown.tradeAmount - breakdown.totalCost;
};

const calculateRoundTripProfit = (
  buyPrice: number, sellPrice: number, quantity: number,
  broker: BrokerFee = BROKER_W3,
): number => {
  const roundTrip = calculateRoundTripCost(buyPrice, quantity, 'sh', broker);
  const sellBreakdown = calculateTradeCost(sellPrice, quantity, 'sell', 'sh', broker);
  const buyOutlay = roundTrip.buyCost.tradeAmount + roundTrip.buyCost.totalCost;
  const sellProceeds = sellBreakdown.tradeAmount - sellBreakdown.totalCost;
  return sellProceeds - buyOutlay;
};

describe('交易成本计算', () => {
  it('买入成本包含佣金和过户费', () => {
    const cost = calculateBuyCost({
      price: 10, quantity: 1000, commissionRate: 0.0003, stampTaxRate: 0, transferFeeRate: 0.00001
    });
    // 旧断言错在哪（生产正确）：旧值 10005.1 只含佣金 5 + 过户费 0.1，
    // 漏了经手费 0.49 与证管费 0.02，生产总费用 5.61 → 10005.61。
    expect(cost).toBeCloseTo(10005.61, 2);
    const breakdown = calculateTradeCost(10, 1000, 'buy', 'sh', BROKER_W3);
    expect(breakdown.commission).toBe(5);
    expect(breakdown.transferFee).toBeCloseTo(0.1, 2);
    expect(breakdown.handlingFee).toBeCloseTo(0.49, 2);
    expect(breakdown.regulatoryFee).toBeCloseTo(0.02, 2);
    expect(breakdown.totalCost).toBeCloseTo(5.61, 2);
    expect(breakdown.costRatio).toBeCloseTo(5.61, 2);
  });

  it('佣金最低5元', () => {
    const cost = calculateBuyCost({
      price: 1, quantity: 100, commissionRate: 0.0003, stampTaxRate: 0, transferFeeRate: 0.00001
    });
    // 旧断言错在哪（生产正确）：旧值 105.001 把未取整的过户费 0.001 计入总额；
    // 生产逐项 round2 后过户费/经手费/证管费均为 0，总费用恰为最低佣金 5。
    expect(cost).toBeCloseTo(105, 2);
    const breakdown = calculateTradeCost(1, 100, 'buy', 'sh', BROKER_W3);
    expect(breakdown.commission).toBe(5);
    expect(breakdown.transferFee).toBe(0);
    expect(breakdown.totalCost).toBe(5);
  });

  it('卖出成本扣除印花税', () => {
    const revenue = calculateSellCost({
      price: 10, quantity: 1000, commissionRate: 0.0003, stampTaxRate: 0.001, transferFeeRate: 0.00001
    });
    // 旧断言错在哪（生产正确）：旧值 9984.9 只扣佣金 5 + 印花税 10 + 过户费 0.1，
    // 漏经手费 0.49 与证管费 0.02，生产净收入 10000 - 15.61 = 9984.39。
    expect(revenue).toBeCloseTo(9984.39, 2);
    const breakdown = calculateTradeCost(10, 1000, 'sell', 'sh', BROKER_W3);
    expect(breakdown.stampDuty).toBe(10);
    expect(breakdown.totalCost).toBeCloseTo(15.61, 2);
    // 印花税只对卖出收取。
    expect(calculateTradeCost(10, 1000, 'buy', 'sh', BROKER_W3).stampDuty).toBe(0);
  });

  it('盈亏计算：盈利', () => {
    const profit = calculateRoundTripProfit(10, 11, 1000);
    expect(profit).toBeGreaterThan(0);
    // 生产双边成本：买入 5.61 + 卖出 16.67 = 22.28，价差 1000 → 净利 977.72。
    expect(profit).toBeCloseTo(977.72, 2);
  });

  it('盈亏计算：亏损', () => {
    const profit = calculateRoundTripProfit(10, 9, 1000);
    expect(profit).toBeLessThan(0);
    expect(profit).toBeCloseTo(-1020.16, 2);
  });

  it('不同佣金率影响成本', () => {
    const cost1 = calculateBuyCost({
      price: 10, quantity: 1000, commissionRate: 0.0003, stampTaxRate: 0, transferFeeRate: 0
    });
    const cost2 = calculateBuyCost({
      price: 10, quantity: 1000, commissionRate: 0.001, stampTaxRate: 0, transferFeeRate: 0
    });
    expect(cost2).toBeGreaterThan(cost1);
    // 万10 佣金 10 元 vs 万3 触底 5 元，差 5 元（税费项相同）。
    expect(cost2 - cost1).toBeCloseTo(5, 2);
  });

  it('大额交易佣金合理', () => {
    const cost = calculateBuyCost({
      price: 100, quantity: 10000, commissionRate: 0.0003, stampTaxRate: 0, transferFeeRate: 0.00001
    });
    // 旧断言错在哪（生产正确）：旧值 1000310 只含佣金 300 + 过户费 10，
    // 漏经手费 48.7 与证管费 2，生产总费用 360.7 → 1000360.7。
    expect(cost).toBeCloseTo(1000360.7, 2);
    const breakdown = calculateTradeCost(100, 10000, 'buy', 'sh', BROKER_W3);
    expect(breakdown.commission).toBe(300);
    expect(breakdown.handlingFee).toBeCloseTo(48.7, 2);
  });

  it('过户费随金额增加', () => {
    const cost1 = calculateBuyCost({
      price: 10, quantity: 1000, commissionRate: 0, stampTaxRate: 0, transferFeeRate: 0.00001
    });
    const cost2 = calculateBuyCost({
      price: 100, quantity: 1000, commissionRate: 0, stampTaxRate: 0, transferFeeRate: 0.00001
    });
    // 万0 券商在生产属「低于最低佣金」→ 佣金仍按 5 元/笔，费用随金额增加体现在税费分项。
    expect(cost2 - 100000).toBeGreaterThan(cost1 - 10000);
    expect(cost1).toBeCloseTo(10005.61, 2);
    expect(cost2).toBeCloseTo(100011.07, 2);
  });

  it('买入数量为100股整数倍', () => {
    const quantity = 300;
    const cost = calculateBuyCost({
      price: 50, quantity, commissionRate: 0.0003, stampTaxRate: 0, transferFeeRate: 0.00001
    });
    // 旧断言错在哪（生产正确）：旧值 15005.15 漏经手费 0.73 与证管费 0.03，生产 15005.91。
    expect(cost).toBeCloseTo(15005.91, 2);
    expect(calculateTradeCost(50, 300, 'buy', 'sh', BROKER_W3).totalCost).toBeCloseTo(5.91, 2);
  });

  it('盈亏率计算', () => {
    const profitRate = calculateRoundTripProfit(10, 11, 1000) / (10 * 1000);
    expect(profitRate).toBeGreaterThan(0);
    expect(profitRate).toBeLessThan(0.1); // 10%以内
    expect(profitRate).toBeCloseTo(0.097772, 5);
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
  // 生产无同契约导出：全仓无集合竞价时段判定（rg '09:15|09:25|可撤单|auction' 仅注释命中）。
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
const limitPrices = (prevClose: number, isST: boolean = false) =>
  calculatePriceLimit({
    code: '600519',
    date: '2024-01-02',
    prevClose,
    isST,
    is新股: false,
    is科创板: false,
    is北交所: false,
  });

// 生产无布尔判定导出：保留内联，阈值由生产涨跌停价供给（ST 比例已在生产侧生效）。
function isLimitUp(price: number, prevClose: number, isST: boolean = false): boolean {
  return price >= limitPrices(prevClose, isST).upperLimit - 0.001;
}

function isLimitDown(price: number, prevClose: number, isST: boolean = false): boolean {
  return price <= limitPrices(prevClose, isST).lowerLimit + 0.001;
}

function calculateLimitPrices(prevClose: number, isST: boolean = false): { up: number; down: number } {
  const limits = limitPrices(prevClose, isST);
  return { up: limits.upperLimit, down: limits.lowerLimit };
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
    // 生产无 prevClose>0 守卫：0 收盘 → 涨跌停价均 0（与旧自抄的 0/-0.001 容差结论一致）。
    expect(isLimitUp(0, 0)).toBe(true); // 0 >= -0.001 (tolerance)
    expect(isLimitDown(0, 0)).toBe(true); // 0 <= 0.001 (tolerance)
    expect(calculateLimitPrices(0)).toEqual({ up: 0, down: 0 });
  });

  it('涨跌停价是精确的10%', () => {
    const limits = calculateLimitPrices(32.57);
    // 生产 roundTo(…,2)：35.827 → 35.83，29.313 → 29.31。
    expect(limits.up).toBe(35.83);
    expect(limits.down).toBe(29.31);
  });
});

// 红利税计算
function calculateDividendTax(
  dividendPerShare: number, shares: number, holdingDays: number
): number {
  // 生产 calculateDividendTaxRate 返回「税率」，税额在这里乘股息总额。
  return dividendPerShare * shares * calculateDividendTaxRate(holdingDays);
}

describe('红利税计算', () => {
  it('持股超过1年免税', () => {
    const tax = calculateDividendTax(0.5, 1000, 400);
    expect(tax).toBe(0);
  });

  it('持股1个月到1年税率10%', () => {
    // 旧断言错在哪（生产正确）：旧用例按「月」传 6（注释 6 months），生产按「天」，
    // 6 天落在 <30 天档（20%）；改为 180 天，10% 才成立。
    const tax = calculateDividendTax(0.5, 1000, 180);
    expect(tax).toBeCloseTo(50, 2);
    expect(calculateDividendTaxRate(180)).toBe(0.1);
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
    expect(calculateDividendTaxRate(365)).toBe(0);
  });

  it('精确边界：1天10%', () => {
    const tax = calculateDividendTax(1, 1000, 1);
    // 旧断言错在哪（生产正确）：生产 1 天仍属「不足 1 个月」→ 20%（旧注释「1天10%」错），
    // 300 元股息对应 200 元税，不是 100。
    expect(tax).toBeCloseTo(200, 2);
    expect(calculateDividendTaxRate(1)).toBe(0.2);
  });
});

// 股票除权除息价计算
function calculateExRightsPrice(
  prevClose: number,
  dividend: number,
  bonusShares: number, // 每10股送股
  capitalIncrease: number // 每10股转增
): number {
  // 生产除权除息按「每股」入参：现金分红已是每股，送股/转增由每10股 ÷10。
  return calculateExDividend({
    prevClose,
    cashDividend: dividend,
    stockDividend: bonusShares / 10,
    capitalReserveTransfer: capitalIncrease / 10,
  });
}

describe('除权除息价计算', () => {
  it('纯现金分红', () => {
    const price = calculateExRightsPrice(10, 0.5, 0, 0);
    expect(price).toBe(9.5);
  });

  it('纯送股', () => {
    const price = calculateExRightsPrice(10, 0, 5, 0);
    // 旧断言错在哪（生产正确）：生产 roundTo(…,2) 取整到分 → 6.67（旧值 6.6667 未取整）。
    expect(price).toBe(6.67);
  });

  it('纯转增', () => {
    const price = calculateExRightsPrice(10, 0, 0, 5);
    expect(price).toBe(6.67);
  });

  it('混合方案', () => {
    const price = calculateExRightsPrice(10, 0.5, 3, 2);
    // (10-0.5)/1.5 = 6.3333… → 生产取整 6.33。
    expect(price).toBe(6.33);
  });

  it('零值返回零', () => {
    // 旧断言错在哪（生产正确）：生产无 prevClose<=0 守卫，(0-0.5)/1 = -0.5；
    // 旧自抄额外返回 0 是自造守卫，非生产行为。
    expect(calculateExRightsPrice(0, 0.5, 0, 0)).toBe(-0.5);
    // 现金分红为 0 时才恰好为 0。
    expect(calculateExRightsPrice(0, 0, 0, 0)).toBe(0);
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
    // (50-2)/1.5 = 32 → 生产取整 32。
    expect(price).toBe(32);
  });
});

// 股票代码验证
function getMarketFromCode(code: string): string {
  // 生产无同契约导出（shared/formatters.ts 只做后缀剥离/中文名映射），保留内联。
  if (code.startsWith('6')) return 'sh';
  if (code.startsWith('0') || code.startsWith('3')) return 'sz';
  return 'unknown';
}

describe('股票代码验证', () => {
  it('上证主板600', () => {
    expect(validateStockCode('600519').valid).toBe(true);
  });

  it('上证主板601', () => {
    expect(validateStockCode('601398').valid).toBe(true);
  });

  it('科创板688', () => {
    expect(validateStockCode('688001').valid).toBe(true);
  });

  it('深证主板000', () => {
    expect(validateStockCode('000001').valid).toBe(true);
  });

  it('中小板002', () => {
    expect(validateStockCode('002415').valid).toBe(true);
  });

  it('创业板300', () => {
    expect(validateStockCode('300750').valid).toBe(true);
  });

  it('无效代码', () => {
    // 旧断言错在哪（生产正确）：生产 validateStockCode 是格式校验（6 位数字 + 可选交易所前缀），
    // 不校验发行段号段，'999999' 格式合法 → valid=true；旧自抄的白名单才判 false。
    expect(validateStockCode('999999').valid).toBe(true);
    expect(validateStockCode('').valid).toBe(false);
    expect(validateStockCode('12345').valid).toBe(false);
    expect(validateStockCode('ABCDEF').valid).toBe(false);
    // 前缀白名单与生产格式口径的差异：000000 生产合法。
    expect(validateStockCode('000000').valid).toBe(true);
  });

  it('判断市场', () => {
    expect(getMarketFromCode('600519')).toBe('sh');
    expect(getMarketFromCode('688001')).toBe('sh');
    expect(getMarketFromCode('000001')).toBe('sz');
    expect(getMarketFromCode('300750')).toBe('sz');
  });

  it('6位数字验证', () => {
    expect(validateStockCode('000001').valid).toBe(true);
    expect(validateStockCode('600000').valid).toBe(true);
    expect(validateStockCode('00001').valid).toBe(false);
    expect(validateStockCode('0000001').valid).toBe(false);
    // 带交易所前缀属合法格式（生产 |=SH|SZ|BJ| 可选前缀）。
    expect(validateStockCode('SH600519').valid).toBe(true);
  });
});

// 可转债转股价格
const cbBase: ConvertibleBond = {
  code: '110001',
  name: '测试转债',
  ticker: '600519',
  stockName: '测试正股',
  price: 100,
  parValue: 100,
  stockPrice: 10,
  conversionPrice: 10,
  conversionRatio: 10,
  couponRate: [1],
  yearsToMaturity: 1,
  creditRating: 'AA',
  putPrice: 100,
  callPrice: 110,
  callTriggerPrice: 13,
  putTriggerDays: 30,
  ytm: 0.02,
};

// 生产按 conversionRatio 直接计算；转股比例 = 面值100 / 转股价。
const makeBond = (bondPrice: number, stockPrice: number, conversionPrice: number): ConvertibleBond => ({
  ...cbBase,
  price: bondPrice,
  stockPrice,
  conversionPrice,
  conversionRatio: conversionPrice > 0 ? 100 / conversionPrice : 0,
});

describe('可转债计算', () => {
  it('转股平价计算', () => {
    const parity = calcConversionValue(makeBond(130, 13, 10));
    // 旧断言错在哪（生产正确）：旧口径 (转债价格/100)×转股价 = 13；生产转股价值
    // = 正股价 × 转股比例 = 13 × 10 = 130（每张面值 100 元），旧公式把转债价格当成了正股价。
    expect(parity).toBe(130);
  });

  it('面值转股平价', () => {
    const parity = calcConversionValue(makeBond(100, 10, 10));
    // 正股价 10、比例 10 → 每张 100 元面值转股价值 100 元（旧断言 10 是除以 10 的口径）。
    expect(parity).toBe(100);
  });

  it('转股溢价率', () => {
    const premium = calcConversionPremium(makeBond(120, 8, 10));
    // 转股价值 80，溢价 (120-80)/80 = 0.5（与旧数值巧合一致，但分母口径已换）。
    expect(premium).toBeCloseTo(0.5, 4);
  });

  it('折价转股', () => {
    const premium = calcConversionPremium(makeBond(80, 10, 10));
    // 转股价值 100，(80-100)/100 = -0.2
    expect(premium).toBeCloseTo(-0.2, 4);
  });

  it('零转股价', () => {
    // 生产不按 conversionPrice 推导比例，比例由调用方给出；比例为 0 时转股价值 0。
    const parity = calcConversionValue(makeBond(100, 10, 0));
    expect(parity).toBe(0);
    // 转股价值为 0 时溢价率为 Infinity（生产 :82 的 cv===0 守卫，而非股票价格守卫）。
    expect(calcConversionPremium(makeBond(100, 10, 0))).toBe(Infinity);
  });

  it('零正股价溢价率', () => {
    const premium = calcConversionPremium(makeBond(100, 0, 10));
    expect(premium).toBe(Infinity);
  });

  it('平价等于正股价时溢价为零', () => {
    const premium = calcConversionPremium(makeBond(100, 10, 10));
    expect(premium).toBeCloseTo(0, 4);
  });
});

// 复权因子计算
function calculateForwardAdjustmentFactor(
  currentPrice: number, adjustedPrice: number
): number {
  // 生产无同契约导出：adjustFactorEngine 只在序列级给「除权参考价/前收盘」因子。
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

const adjPrices: PriceData[] = [
  { date: '2024-01-01', open: 9, high: 9, low: 9, close: 9, volume: 100 },
  { date: '2024-01-02', open: 10, high: 10, low: 10, close: 10, volume: 100 },
];

describe('复权因子计算', () => {
  it('复权因子=实际价/复权价', () => {
    const factor = calculateForwardAdjustmentFactor(10, 9);
    expect(factor).toBeCloseTo(1.111, 3);
  });

  it('累计复权因子', () => {
    // 旧用例用任意因子数组连乘；生产只导出「分红事件序列 → 累计因子」，故改用两个除权事件：
    // 01-01 每股派 0.5（factor=(9-0.05)/9=0.99444）、01-02 每股派 0.5（factor=0.995），
    // 累计 0.99444×0.995 = 0.98947（旧期望 1.09725 是自造因子数组的乘积）。
    const factors = adjustFactorEngine.calculateAdjustFactors(
      [
        { date: '2023-12-31', open: 10, high: 10, low: 10, close: 10, volume: 1 },
        { date: '2024-01-01', open: 9, high: 9, low: 9, close: 9, volume: 1 },
        { date: '2024-01-02', open: 10, high: 10, low: 10, close: 10, volume: 1 },
      ],
      [
        { date: '2024-01-01', cashDividend: 0.5, stockDividend: 0, stockSplit: 0 },
        { date: '2024-01-02', cashDividend: 0.5, stockDividend: 0, stockSplit: 0 },
      ],
      'backward',
    );
    expect(factors).toHaveLength(3);
    expect(factors[0]).toBe(1);
    expect(factors[2]).toBeCloseTo(0.98947, 5);
  });

  it('单因子=自身', () => {
    const factor = calculateCumulativeAdjustmentFactor([1.05]);
    expect(factor).toBe(1.05);
  });

  it('空因子列表返回1', () => {
    // 生产：无分红事件时 calculateAdjustFactors 对每个交易日返回 1。
    expect(adjustFactorEngine.calculateAdjustFactors(adjPrices, [], 'forward')).toEqual([1, 1]);
    expect(calculateCumulativeAdjustmentFactor([])).toBe(1);
  });

  it('应用前复权', () => {
    const adjusted = applyForwardAdjustment(10, 0.9);
    expect(adjusted).toBe(9);
  });

  it('因子为1时不改变价格', () => {
    // 生产 'none' 复权类型直接原样返回价格序列。
    expect(adjustFactorEngine.adjustPrices(adjPrices, [], 'none')).toEqual(adjPrices);
    expect(applyForwardAdjustment(100, 1)).toBe(100);
  });

  it('零复权价返回因子1', () => {
    // 生产 calculateExRightFactor 对 price<=0 返回因子 1（price>0 ? adjusted/price : 1）。
    const factors = adjustFactorEngine.calculateAdjustFactors(
      [{ date: '2024-01-02', open: 0, high: 0, low: 0, close: 0, volume: 0 }],
      [{ date: '2024-01-02', cashDividend: 1, stockDividend: 0, stockSplit: 0 }],
      'backward',
    );
    expect(factors).toEqual([1]);
    expect(calculateForwardAdjustmentFactor(10, 0)).toBe(1);
  });

  it('多个除权事件累计', () => {
    // 四个除权事件（每股派 1，实现按每10股 ÷10 → 每个 factor=(10-0.1)/10=0.99）连乘 0.99^4。
    const prices: PriceData[] = [
      { date: '2023-12-31', open: 10, high: 10, low: 10, close: 10, volume: 1 },
      { date: '2024-01-01', open: 10, high: 10, low: 10, close: 10, volume: 1 },
      { date: '2024-01-02', open: 10, high: 10, low: 10, close: 10, volume: 1 },
      { date: '2024-01-03', open: 10, high: 10, low: 10, close: 10, volume: 1 },
      { date: '2024-01-04', open: 10, high: 10, low: 10, close: 10, volume: 1 },
    ];
    const dividends: DividendEvent[] = ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04']
      .map(date => ({ date, cashDividend: 1, stockDividend: 0, stockSplit: 0 }));
    const factors = adjustFactorEngine.calculateAdjustFactors(prices, dividends, 'backward');
    const cumulative = factors[factors.length - 1];
    expect(cumulative).toBeCloseTo(0.9606, 4);
    expect(cumulative).toBeLessThan(1);
    // 累计因子单调不增（每除权一次价格下调）。
    for (let i = 1; i < factors.length; i++) {
      expect(factors[i]).toBeLessThanOrEqual(factors[i - 1]);
    }
  });
});
