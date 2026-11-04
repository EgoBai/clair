/**
 * 期权定价 × 宏观指标 × 微观结构 × 回测统计 综合测试
 *
 * 一、原自抄实现的问题
 * 1. 原文件把 normalCDF/bsCall/bsPut/putCallParity/intrinsicCall/intrinsicPut/timeValue 完整复制进
 *    测试，验证的是测试内副本。副本 normalCDF 没有生产在 |x|>8 时的 0/1 截断
 *    （frontend/src/utils/optionsPricingEngine.ts:54），极端尾部行为从未被覆盖。
 * 2. 时间价值口径不同：副本 timeValue = max(price-intrinsic, 0) 强行 clamp；生产 priceOption 的
 *    timeValue = price - intrinsicValue 不 clamp（optionsPricingEngine.ts:222-230）。深实值看跌
 *    （spot=1, strike=100, T=1）实测 timeValue = -4.877057549928594。旧断言"时间价值应非负"
 *    只对平值看涨成立，掩盖了生产差异；现拆成"平值看涨 >0"与"深实值看跌 <0"两条，生产不 clamp
 *    只记录不改。
 * 3. 平价关系口径不同：副本返回带符号差值；生产 optionsPricingEngine.putCallParity 返回
 *    {lhs,rhs,difference,isValid}（:298），advancedOptionsEngine.putCallParity 返回
 *    {theoreticalDiff,actualDiff,arbitrage}（:164）。旧断言 Math.abs(diff)<0.01 只覆盖一个数值，
 *    现同时绑定两实现，断言 difference 近零、isValid=true、arbitrage=false。
 * 4. 微观结构 5 个函数（orderBookImbalance/weightedMidPrice/spreadBps/marketDepth/effectiveSpread）
 *    全部是副本。生产只有 analyzeOrderBookDepth 单入口（marketDepthEngine.ts:62），且 critical
 *    差异：spreadBps 分母是 lastPrice 而非 mid（:82）。旧断言 spreadBps(10,10.02)≈20 之所以成立，
 *    只是因为末价恰好等于 mid=10.01（19.98002 与 20 的误差在 toBeCloseTo(20,0) 容差内）。迁移后
 *    显式传入 lastPrice=10.01 与 10.05，分别断言 19.98001998 与 19.90049751，锁死生产分母。
 *    生产没有 levels 参数，原 marketDepth(bids,asks,levels) 改绑 totalBidVolume/totalAskVolume
 *    （全档求和）+ depthProfile.bidDepth 数组，并注明层级切片语义未迁移。
 * 5. 回测 10 个统计函数是副本；生产 runEventBacktest 是唯一入口（eventDrivenBacktestEngine.ts:49）：
 *    空交易抛 Error('没有交易数据')（副本返回 0）；收益率为比例制 returnPct（副本 pnl 是金额制）。
 *    旧断言 expectancy=1.6、avgWin=4、avgLoss=2 均有量纲错误；按 returnPct=pnl/100 迁移后应为
 *    0.016/0.04/0.02，winRate/profitFactor 比例不变。旧"空交易胜率/期望值应为 0"两条改为断言抛错。
 * 6. 宏观 9 个指标函数（gdpGrowthRate/cpi/ppi/realGDP/yieldSpread/yieldCurveInverted/
 *    unemploymentRate/laborParticipationRate/debtToGDP）rg 生产 export 无同契约实现；相近的
 *    macroEconomicEngine.ts 入参是已算好的 MacroIndicator、返回 score/regime，
 *    macroSentimentEngine.ts:28 返回情绪结论，均非 (y1,y2)→百分率。按任务要求保留内联并注明。
 * 7. effectiveSpread 生产无同契约纯函数：marketMicrostructureV2Engine.ts:64-69 是成交量加权方向
 *    口径，liquidityRiskEngine.ts:79 是 avgSpread*2，marketMicrostructureEngine.ts:84 是简化 spread。
 *    保留内联；旧断言 0.1 保留但注明未绑定生产。
 *
 * 二、绑定生产实现（file:line）
 * - normalCDF                         frontend/src/utils/optionsPricingEngine.ts:54
 * - blackScholesPrice                 frontend/src/utils/optionsPricingEngine.ts:130
 * - calculateGreeks                   frontend/src/utils/optionsPricingEngine.ts:152
 * - priceOption                       frontend/src/utils/optionsPricingEngine.ts:222
 * - putCallParity                     frontend/src/utils/optionsPricingEngine.ts:298
 * - putCallParity（第二实现）         frontend/src/utils/advancedOptionsEngine.ts:164
 * - analyzeOrderBookDepth             frontend/src/utils/marketDepthEngine.ts:62
 * - runEventBacktest                  frontend/src/utils/eventDrivenBacktestEngine.ts:49
 * D43 跨包依赖核查：optionsPricingEngine.ts、advancedOptionsEngine.ts、marketDepthEngine.ts、
 * eventDrivenBacktestEngine.ts 顶部均无 import，无 xlsx/file-saver 等第三方浏览器依赖，
 * backend 测试可直接加载。
 *
 * 三、未迁移清单及原因
 * - intrinsicCall/intrinsicPut：生产无独立导出；改用 priceOption(...).intrinsicValue（与
 *   blackScholesPrice 的 T<=0 内在价值）绑定，不再保留副本。
 * - timeValue 独立函数：生产无独立导出；改用 priceOption(...).timeValue。
 * - bsCall/bsPut：改用 blackScholesPrice + 只补 type 的薄适配（callPrice/putPrice），未复制公式。
 * - 宏观 9 个指标函数：rg 无同契约生产导出，保留内联（见第一节第 6 条）。
 * - effectiveSpread：生产无同契约纯函数（三种近似口径均不同），保留内联（见第一节第 7 条）。
 * - 副本 marketDepth(bids,asks,levels) 的按层级切片：生产 analyzeOrderBookDepth 只有全档
 *   totalBidVolume/totalAskVolume 与 depthProfile 数组，无 levels 入参，未迁移切片语义。
 */

import { describe, it, expect } from 'vitest';
import {
  normalCDF,
  blackScholesPrice,
  calculateGreeks,
  priceOption,
  putCallParity,
  type OptionParams,
} from '../../../frontend/src/utils/optionsPricingEngine';
import { putCallParity as putCallParityAdvanced } from '../../../frontend/src/utils/advancedOptionsEngine';
import {
  analyzeOrderBookDepth,
  type OrderBookLevel,
} from '../../../frontend/src/utils/marketDepthEngine';
import {
  runEventBacktest,
  type EventTrade,
  type BacktestConfig,
} from '../../../frontend/src/utils/eventDrivenBacktestEngine';

// 期权定价引擎 (Black-Scholes简化)
describe('期权定价引擎', () => {
  const baseParams: OptionParams = {
    spot: 100,
    strike: 100,
    timeToExpiry: 1,
    riskFreeRate: 0.05,
    volatility: 0.2,
    type: 'call',
  };

  // 薄适配：只补 type，不复制定价公式
  const callPrice = (overrides: Partial<OptionParams> = {}) =>
    blackScholesPrice({ ...baseParams, ...overrides, type: 'call' });
  const putPrice = (overrides: Partial<OptionParams> = {}) =>
    blackScholesPrice({ ...baseParams, ...overrides, type: 'put' });

  it('看涨期权应非负', () => {
    expect(callPrice()).toBeGreaterThan(0);
    expect(callPrice()).toBeCloseTo(10.450575, 6);
  });

  it('看跌期权应非负', () => {
    expect(putPrice()).toBeGreaterThan(0);
    expect(putPrice()).toBeCloseTo(5.573518, 6);
  });

  it('平价看涨应大于平价看跌', () => {
    expect(callPrice()).toBeGreaterThan(putPrice());
  });

  it('到期看涨应等于内在价值', () => {
    expect(callPrice({ spot: 110, timeToExpiry: 0 })).toBe(10);
    expect(callPrice({ spot: 90, timeToExpiry: 0 })).toBe(0);
  });

  it('到期看跌应等于内在价值', () => {
    expect(putPrice({ spot: 90, timeToExpiry: 0 })).toBe(10);
    expect(putPrice({ spot: 110, timeToExpiry: 0 })).toBe(0);
  });

  it('看涨内在价值应正确', () => {
    expect(priceOption({ ...baseParams, spot: 110 }).intrinsicValue).toBe(10);
    expect(priceOption({ ...baseParams, spot: 90 }).intrinsicValue).toBe(0);
  });

  it('看跌内在价值应正确', () => {
    expect(priceOption({ ...baseParams, type: 'put', spot: 90 }).intrinsicValue).toBe(10);
    expect(priceOption({ ...baseParams, type: 'put', spot: 110 }).intrinsicValue).toBe(0);
  });

  it('平值看涨时间价值应为正', () => {
    const result = priceOption(baseParams);
    expect(result.timeValue).toBeGreaterThan(0);
    expect(result.timeValue).toBeCloseTo(10.450575, 6);
    expect(result.price).toBeCloseTo(10.450575, 6);
  });

  it('深实值看跌时间价值为负（生产不 clamp，缺陷仅记录）', () => {
    // 旧断言 max(price-intrinsic,0) 是副本行为，生产直接 price-intrinsic
    const deepItmPut: OptionParams = { ...baseParams, spot: 1, strike: 100, type: 'put' };
    const result = priceOption(deepItmPut);
    expect(result.intrinsicValue).toBe(99);
    expect(result.price).toBeCloseTo(94.1229424500714, 6);
    expect(result.timeValue).toBeLessThan(0);
    expect(result.timeValue).toBeCloseTo(-4.87705755, 6);
  });

  it('看涨看跌平价关系应近似成立', () => {
    const call = callPrice();
    const put = putPrice();
    const parity = putCallParity(call, put, 100, 100, 0.05, 1);
    expect(parity.isValid).toBe(true);
    expect(parity.difference).toBeLessThan(0.01);
    expect(parity.difference).toBeCloseTo(0, 10);
    expect(parity.lhs).toBeCloseTo(4.87705755, 6);
    expect(parity.rhs).toBeCloseTo(4.87705755, 6);
  });

  it('看涨看跌平价关系应同时满足第二实现', () => {
    const call = callPrice();
    const put = putPrice();
    const parity = putCallParityAdvanced(call, put, 100, 100, 0.05, 1);
    expect(parity.theoreticalDiff).toBeCloseTo(4.87705755, 6);
    expect(parity.actualDiff).toBeCloseTo(4.87705755, 6);
    expect(parity.arbitrage).toBe(false);
  });

  it('高波动率期权价值应更高', () => {
    const low = callPrice({ volatility: 0.1 });
    const high = callPrice({ volatility: 0.5 });
    expect(high).toBeGreaterThan(low);
    expect(low).toBeCloseTo(6.804963, 5);
    expect(high).toBeCloseTo(21.792599, 5);
  });

  it('深度虚值看涨应接近0', () => {
    expect(callPrice({ spot: 50, timeToExpiry: 0.01 })).toBe(0);
    expect(callPrice({ spot: 50, timeToExpiry: 0.01 })).toBeLessThan(0.01);
  });

  it('深度实值看涨应接近S-K*exp(-rT)', () => {
    const call = callPrice({ spot: 200 });
    const expected = 200 - 100 * Math.exp(-0.05);
    expect(Math.abs(call - expected)).toBeLessThan(1);
    expect(call).toBeCloseTo(104.877723, 5);
  });

  it('normalCDF(0)应为0.5', () => {
    expect(normalCDF(0)).toBeCloseTo(0.5);
    expect(normalCDF(0)).toBeGreaterThan(0.5);
    // 生产在 |x|>8 时截断，副本没有该行为
    expect(normalCDF(9)).toBe(1);
    expect(normalCDF(-9)).toBe(0);
  });

  it('normalCDF应单调递增', () => {
    expect(normalCDF(-2)).toBeLessThan(normalCDF(-1));
    expect(normalCDF(-1)).toBeLessThan(normalCDF(0));
    expect(normalCDF(0)).toBeLessThan(normalCDF(1));
  });

  it('到期希腊字母应全部为零（生产 T<=0 或 vol<=0 直接返回零）', () => {
    const greeks = calculateGreeks({ ...baseParams, timeToExpiry: 0 });
    expect(greeks.delta).toBe(0);
    expect(greeks.gamma).toBe(0);
    expect(greeks.theta).toBe(0);
    expect(greeks.vega).toBe(0);
    expect(greeks.rho).toBe(0);
    expect(greeks.lambda).toBe(0);
    expect(greeks.vanna).toBe(0);
    expect(greeks.charm).toBe(0);
    expect(greeks.volga).toBe(0);
    expect(greeks.speed).toBe(0);
    expect(calculateGreeks({ ...baseParams, volatility: 0 }).delta).toBe(0);
  });
});

// 宏观经济指标
describe('宏观经济指标计算', () => {
  // 保留内联：rg 生产无同契约导出（见头部第一节第 6 条）
  function gdpGrowthRate(current: number, previous: number): number {
    return previous > 0 ? (current - previous) / previous * 100 : 0;
  }

  function cpi(y1: number, y2: number): number {
    return y2 > 0 ? (y1 - y2) / y2 * 100 : 0;
  }

  function ppi(y1: number, y2: number): number {
    return y2 > 0 ? (y1 - y2) / y2 * 100 : 0;
  }

  function realGDP(nominal: number, deflator: number): number {
    return deflator > 0 ? nominal / deflator * 100 : 0;
  }

  function yieldSpread(long: number, short: number): number {
    return long - short;
  }

  function yieldCurveInverted(long: number, short: number): boolean {
    return long < short;
  }

  function unemploymentRate(employed: number, laborForce: number): number {
    return laborForce > 0 ? (1 - employed / laborForce) * 100 : 0;
  }

  function laborParticipationRate(laborForce: number, workingAge: number): number {
    return workingAge > 0 ? laborForce / workingAge * 100 : 0;
  }

  function debtToGDP(debt: number, gdp: number): number {
    return gdp > 0 ? debt / gdp * 100 : 0;
  }

  it('GDP增速应正确', () => {
    expect(gdpGrowthRate(110, 100)).toBe(10);
  });

  it('GDP下降应返回负增速', () => {
    expect(gdpGrowthRate(90, 100)).toBe(-10);
  });

  it('零基期GDP增速应为0', () => {
    expect(gdpGrowthRate(100, 0)).toBe(0);
  });

  it('CPI应正确', () => {
    expect(cpi(105, 100)).toBe(5);
  });

  it('PPI应正确', () => {
    expect(ppi(103, 100)).toBe(3);
  });

  it('实际GDP应正确', () => {
    expect(realGDP(120, 110)).toBeCloseTo(109.09, 1);
  });

  it('收益率利差应正确', () => {
    expect(yieldSpread(3.5, 2.0)).toBe(1.5);
  });

  it('收益率曲线倒挂应正确', () => {
    expect(yieldCurveInverted(1.5, 2.0)).toBe(true);
    expect(yieldCurveInverted(3.0, 2.0)).toBe(false);
  });

  it('失业率应正确', () => {
    expect(unemploymentRate(95, 100)).toBeCloseTo(5);
  });

  it('劳动参与率应正确', () => {
    expect(laborParticipationRate(70, 100)).toBe(70);
  });

  it('政府债务/GDP应正确', () => {
    expect(debtToGDP(60, 200)).toBe(30);
  });

  it('零基期指标应返回0', () => {
    expect(cpi(100, 0)).toBe(0);
    expect(ppi(100, 0)).toBe(0);
    expect(realGDP(100, 0)).toBe(0);
    expect(unemploymentRate(0, 0)).toBe(0);
    expect(debtToGDP(100, 0)).toBe(0);
  });
});

// 市场微观结构
describe('市场微观结构引擎', () => {
  interface Level2Entry { price: number; quantity: number; orders: number }

  // 夹具沿用 quantity 命名，进生产前映射为 volume（OrderBookLevel）
  const toLevels = (entries: Level2Entry[]): OrderBookLevel[] =>
    entries.map(e => ({ price: e.price, volume: e.quantity, orders: e.orders }));

  const analyzeBook = (bids: Level2Entry[], asks: Level2Entry[], lastPrice: number) =>
    analyzeOrderBookDepth({
      timestamp: 0,
      symbol: 'TEST',
      bids: toLevels(bids),
      asks: toLevels(asks),
      lastPrice,
    });

  // 保留内联：生产无同契约 effectiveSpread 纯函数（见头部第三节）
  function effectiveSpread(tradePrice: number, bid: number, ask: number): number {
    const mid = (bid + ask) / 2;
    return Math.abs(tradePrice - mid) * 2;
  }

  it('应计算订单簿不平衡度', () => {
    const bids: Level2Entry[] = [{ price: 10, quantity: 500, orders: 5 }];
    const asks: Level2Entry[] = [{ price: 10.1, quantity: 300, orders: 3 }];
    expect(analyzeBook(bids, asks, 10.05).imbalance).toBeCloseTo(0.25);
  });

  it('等量订单簿不平衡度应为0', () => {
    const bids: Level2Entry[] = [{ price: 10, quantity: 500, orders: 5 }];
    const asks: Level2Entry[] = [{ price: 10.1, quantity: 500, orders: 5 }];
    expect(analyzeBook(bids, asks, 10.05).imbalance).toBe(0);
  });

  it('应计算加权中间价', () => {
    const bids: Level2Entry[] = [{ price: 10, quantity: 200, orders: 2 }];
    const asks: Level2Entry[] = [{ price: 10.2, quantity: 100, orders: 1 }];
    const mid = analyzeBook(bids, asks, 10.1).weightedMidPrice;
    expect(mid).toBeGreaterThan(10);
    expect(mid).toBeLessThan(10.2);
    expect(mid).toBeCloseTo(10.1333333333, 9);
  });

  it('应计算点差BPS（生产分母是 lastPrice，不是 mid）', () => {
    const bids: Level2Entry[] = [{ price: 10, quantity: 500, orders: 5 }];
    const asks: Level2Entry[] = [{ price: 10.02, quantity: 300, orders: 3 }];
    // lastPrice = mid = 10.01 时与副本 mid 口径数值一致
    expect(analyzeBook(bids, asks, 10.01).spreadBps).toBeCloseTo(19.9800199800, 9);
    // 旧断言 ≈20 在 lastPrice=mid 时也能过；换成 lastPrice=10.05 才能暴露生产分母
    expect(analyzeBook(bids, asks, 10.05).spreadBps).toBeCloseTo(19.9004975124, 9);
  });

  it('应计算市场深度（全档合计 + 逐档数组）', () => {
    const bids: Level2Entry[] = [
      { price: 10, quantity: 100, orders: 1 },
      { price: 9.9, quantity: 200, orders: 2 },
    ];
    const asks: Level2Entry[] = [
      { price: 10.1, quantity: 150, orders: 1 },
    ];
    const book = analyzeBook(bids, asks, 10.05);
    expect(book.totalBidVolume).toBe(300);
    expect(book.totalAskVolume).toBe(150);
    expect(book.depthProfile.bidDepth).toEqual([100, 200]);
    expect(book.depthProfile.askDepth).toEqual([150]);
  });

  it('应计算有效点差', () => {
    // 未绑定生产：三种近似口径均不同（见头部第三节）
    expect(effectiveSpread(10.0, 10.0, 10.1)).toBeCloseTo(0.1);
  });

  it('空订单簿不平衡度应为0', () => {
    const book = analyzeBook([], [], 10);
    expect(book.imbalance).toBe(0);
    expect(book.weightedMidPrice).toBe(10);
    expect(book.spreadBps).toBe(0);
    expect(book.totalBidVolume).toBe(0);
    expect(book.totalAskVolume).toBe(0);
  });

  it('零价差BPS应为0', () => {
    const bids: Level2Entry[] = [{ price: 10, quantity: 500, orders: 5 }];
    const asks: Level2Entry[] = [{ price: 10, quantity: 500, orders: 5 }];
    expect(analyzeBook(bids, asks, 10).spreadBps).toBe(0);
  });

  it('深度虚值点差BPS应大', () => {
    const bids: Level2Entry[] = [{ price: 10, quantity: 500, orders: 5 }];
    const asks: Level2Entry[] = [{ price: 10.5, quantity: 300, orders: 3 }];
    const result = analyzeBook(bids, asks, 10.25);
    expect(result.spreadBps).toBeGreaterThan(100);
    expect(result.spreadBps).toBeCloseTo(487.8048780487805, 9);
  });
});

// 回测统计引擎
describe('回测统计引擎', () => {
  interface Trade { entry: number; exit: number; pnl: number; duration: number }

  // 副本 pnl 是金额制；生产 returnPct 是比例制，故除以 100 保持原断言的比例关系
  const toEventTrade = (trade: Trade): EventTrade => ({
    eventDate: '2026-01-01',
    eventType: 'test',
    entryPrice: trade.entry,
    exitPrice: trade.exit,
    entryDate: '2026-01-01',
    exitDate: '2026-01-02',
    holdingDays: trade.duration,
    returnPct: trade.pnl / 100,
    maxDrawdownDuringHolding: 0,
    maxGainDuringHolding: 0,
  });

  const config: BacktestConfig = {
    holdingDays: 5,
    stopLoss: 0.05,
    takeProfit: 0.1,
    maxPositionSize: 1,
  };

  const sample: Trade[] = [
    { entry: 10, exit: 12, pnl: 2, duration: 5 },
    { entry: 15, exit: 13, pnl: -2, duration: 3 },
    { entry: 20, exit: 25, pnl: 5, duration: 10 },
    { entry: 30, exit: 28, pnl: -2, duration: 7 },
    { entry: 10, exit: 15, pnl: 5, duration: 8 },
  ];

  const sampleTrades = sample.map(toEventTrade);

  it('应计算胜率', () => {
    expect(runEventBacktest(sampleTrades, config).winRate).toBeCloseTo(0.6);
  });

  it('空交易胜率应为0（生产改为抛错，旧断言错误）', () => {
    expect(() => runEventBacktest([], config)).toThrow('没有交易数据');
  });

  it('应计算盈亏比', () => {
    expect(runEventBacktest(sampleTrades, config).profitFactor).toBeCloseTo(3);
  });

  it('应计算期望值（比例制 0.016，旧断言 1.6 是金额制量纲错误）', () => {
    expect(runEventBacktest(sampleTrades, config).expectancy).toBeCloseTo(0.016, 10);
  });

  it('空交易期望值应为0（生产改为抛错，旧断言错误）', () => {
    expect(() => runEventBacktest([], config)).toThrow('没有交易数据');
  });

  it('应计算平均盈利（比例制 0.04）', () => {
    expect(runEventBacktest(sampleTrades, config).avgWin).toBeCloseTo(0.04, 10);
  });

  it('应计算平均亏损（比例制 0.02）', () => {
    expect(runEventBacktest(sampleTrades, config).avgLoss).toBeCloseTo(0.02, 10);
  });

  it('应计算最大连续盈利', () => {
    expect(runEventBacktest(sampleTrades, config).consecutiveWins).toBe(1);
  });

  it('应计算最大连续亏损', () => {
    expect(runEventBacktest(sampleTrades, config).consecutiveLosses).toBe(1);
  });

  it('全部盈利应计算最大连续盈利', () => {
    const wins: Trade[] = [
      { entry: 0, exit: 0, pnl: 1, duration: 1 },
      { entry: 0, exit: 0, pnl: 1, duration: 1 },
      { entry: 0, exit: 0, pnl: 1, duration: 1 },
    ];
    const result = runEventBacktest(wins.map(toEventTrade), config);
    expect(result.consecutiveWins).toBe(3);
    expect(result.totalTrades).toBe(3);
  });

  it('应计算平均持仓时长', () => {
    expect(runEventBacktest(sampleTrades, config).avgHoldingDays).toBeCloseTo(6.6);
  });

  it('无亏损交易盈亏比应为Infinity', () => {
    const allWins: Trade[] = [{ entry: 0, exit: 0, pnl: 1, duration: 1 }];
    const result = runEventBacktest(allWins.map(toEventTrade), config);
    expect(result.profitFactor).toBe(Infinity);
    expect(result.riskRewardRatio).toBe(Infinity);
  });

  it('大量交易应正确统计', () => {
    const many: Trade[] = Array.from({ length: 1000 }, (_, i) => ({
      entry: 10, exit: 10 + (i % 2 === 0 ? 1 : -0.5),
      pnl: i % 2 === 0 ? 1 : -0.5, duration: i % 10 + 1,
    }));
    const result = runEventBacktest(many.map(toEventTrade), config);
    expect(result.totalTrades).toBe(1000);
    expect(result.winRate).toBeCloseTo(0.5);
    expect(result.profitFactor).toBeCloseTo(2);
    expect(result.avgHoldingDays).toBeCloseTo(5.5);
  });
});
