/**
 * ETF套利引擎 (深度版)
 * 分析ETF折溢价、一二级市场套利、事件套利
 */

export interface ETFData {
  code: string;
  name: string;
  nav: number; // 净值
  marketPrice: number; // 市场价格
  trackingError: number; // 跟踪误差 %
  totalShares: number; // 总份额(万份)
  creationUnit: number; // 最小申购赎回单位(万份)
  iopv: number; // 实时估值
  date: string;
}

export interface ETFDiscount {
  code: string;
  discount: number; // 折价率(负=折价，正=溢价)
  discountAmount: number; // 折溢价金额
  arbitrageCost: number; // 套利成本(bps)
  netArbitrage: number; // 净套利空间(bps)
  signal: 'create' | 'redeem' | 'neutral'; // 申购/赎回套利
  liquidity: number; // 流动性评分 0-100
  executionRisk: 'low' | 'medium' | 'high';
}

export interface ETFArbOpportunity {
  type: 'cross_market' | 'cross_listed' | 'event' | 'dividend';
  etfA: string;
  etfB: string;
  spread: number;
  expectedReturn: number;
  risk: string;
  timeWindow: string;
}

export class ETFDeepArbitrageEngine {
  /**
   * 计算ETF折溢价
   */
  calculateDiscount(
    etf: ETFData,
    tradingCost: number = 15 // bps
  ): ETFDiscount {
    const discount = etf.nav > 0 
      ? ((etf.marketPrice - etf.nav) / etf.nav) * 100 
      : 0;
    const discountAmount = etf.marketPrice - etf.nav;

    // 套利成本 = 交易成本 + 冲击成本 + 时间成本
    const impactCost = etf.totalShares < 100000 ? 5 : 2;
    const timeCost = 2;
    const arbitrageCost = tradingCost + impactCost + timeCost;
    const netArbitrage = Math.abs(discount * 100) - arbitrageCost;

    let signal: ETFDiscount['signal'] = 'neutral';
    if (discount > 0.15 && netArbitrage > 0) signal = 'create'; // 溢价→申购套利
    else if (discount < -0.15 && netArbitrage > 0) signal = 'redeem'; // 折价→赎回套利

    // 流动性评分
    const liquidity = Math.min(100, etf.totalShares / 10000 * 10);

    // 执行风险
    let executionRisk: ETFDiscount['executionRisk'] = 'low';
    if (etf.totalShares < 50000) executionRisk = 'high';
    else if (etf.totalShares < 200000) executionRisk = 'medium';

    return {
      code: etf.code,
      discount,
      discountAmount,
      arbitrageCost,
      netArbitrage,
      signal,
      liquidity,
      executionRisk
    };
  }

  /**
   * 实时套利监控
   */
  monitorRealTimeArbitrage(
    etf: ETFData,
    componentPrices: { code: string; price: number; weight: number }[]
  ): {
    theoreticalNAV: number;
    realTimeDiscount: number;
    arbitrageSignal: string;
    componentDeviations: { code: string; deviation: number }[];
  } {
    // 理论净值 = ∑(成分股价格 × 权重)
    const theoreticalNAV = componentPrices.reduce(
      (sum, c) => sum + c.price * c.weight, 0
    );

    const realTimeDiscount = theoreticalNAV > 0 
      ? ((etf.marketPrice - theoreticalNAV) / theoreticalNAV) * 100 
      : 0;

    let arbitrageSignal = '无套利机会';
    if (realTimeDiscount > 0.3) arbitrageSignal = '溢价套利: 申购ETF卖出';
    else if (realTimeDiscount < -0.3) arbitrageSignal = '折价套利: 买入ETF赎回';

    // 成分股偏差
    const componentDeviations = componentPrices.map(c => ({
      code: c.code,
      deviation: c.weight > 0 ? (c.price * c.weight / theoreticalNAV - c.weight) * 100 : 0
    }));

    return { theoreticalNAV, realTimeDiscount, arbitrageSignal, componentDeviations };
  }

  /**
   * 跨市场套利
   */
  findCrossMarketArb(
    etfList: ETFData[]
  ): ETFArbOpportunity[] {
    const opportunities: ETFArbOpportunity[] = [];

    for (let i = 0; i < etfList.length; i++) {
      for (let j = i + 1; j < etfList.length; j++) {
        const a = etfList[i];
        const b = etfList[j];

        // 同类型ETF折溢价差异
        const discountA = a.nav > 0 ? ((a.marketPrice - a.nav) / a.nav) * 100 : 0;
        const discountB = b.nav > 0 ? ((b.marketPrice - b.nav) / b.nav) * 100 : 0;
        const spread = discountA - discountB;

        if (Math.abs(spread) > 0.5) {
          opportunities.push({
            type: 'cross_market',
            etfA: a.code,
            etfB: b.code,
            spread,
            expectedReturn: Math.abs(spread) - 0.3,
            risk: Math.abs(spread) > 1 ? 'low' : 'medium',
            timeWindow: 'T+0'
          });
        }
      }
    }

    return opportunities.sort((a, b) => Math.abs(b.spread) - Math.abs(a.spread));
  }

  /**
   * 分红套利分析
   */
  analyzeDividendArb(
    etf: ETFData,
    dividendPerShare: number,
    exDividendDate: string,
    currentPrice: number
  ): {
    dividendYield: number;
    priceDropExpected: number;
    arbReturn: number;
    shouldHold: boolean;
    taxImpact: number;
  } {
    const dividendYield = currentPrice > 0 ? (dividendPerShare / currentPrice) * 100 : 0;
    const priceDropExpected = dividendPerShare; // 除息后预计价格下跌
    const taxImpact = dividendYield > 1 ? dividendYield * 0.2 : 0; // 持有不满1年扣20%税
    const arbReturn = dividendYield - taxImpact;
    const shouldHold = arbReturn > 0.5;

    return { dividendYield, priceDropExpected, arbReturn, shouldHold, taxImpact };
  }

  /**
   * ETF流动性分析
   */
  analyzeLiquidity(
    etf: ETFData,
    dailyVolumes: number[],
    bidAskSpreads: number[]
  ): {
    avgDailyVolume: number;
    turnoverRate: number;
    avgSpread: number;
    liquidityScore: number;
    marketImpact: number; // 100万交易的预期冲击成本 bps
  } {
    const avgDailyVolume = dailyVolumes.length > 0 
      ? dailyVolumes.reduce((a, b) => a + b, 0) / dailyVolumes.length : 0;
    const turnoverRate = etf.totalShares > 0 
      ? (avgDailyVolume / etf.totalShares) * 100 : 0;
    const avgSpread = bidAskSpreads.length > 0 
      ? bidAskSpreads.reduce((a, b) => a + b, 0) / bidAskSpreads.length : 0;

    // 流动性评分
    const volumeScore = Math.min(40, avgDailyVolume / 10000);
    const turnoverScore = Math.min(30, turnoverRate * 3);
    const spreadScore = Math.max(0, 30 - avgSpread * 10);
    const liquidityScore = volumeScore + turnoverScore + spreadScore;

    // 冲击成本估算
    const marketImpact = avgDailyVolume > 0 
      ? Math.min(50, 1000000 / avgDailyVolume * 10) : 100;

    return { avgDailyVolume, turnoverRate, avgSpread, liquidityScore, marketImpact };
  }
}
