/**
 * ETF套利引擎
 * - 折溢价套利 (IOPV vs 市场价)
 * - 期现套利 (期货-现货基差)
 * - 跨市场套利 (AH股溢价)
 * - LOF套利 (场内外价差)
 * - 轮动套利 (行业ETF轮动)
 */

export interface ETFQuote {
  symbol: string;
  name: string;
  price: number;
  iopv: number;        // 基金净值估算
  nav: number;         // 基金净值
  volume: number;
  timestamp: number;
}

export interface FuturesQuote {
  symbol: string;
  underlying: string;
  price: number;
  spotPrice: number;
  deliveryDate: string;
  daysToDelivery: number;
  timestamp: number;
}

export interface AHQuote {
  aSymbol: string;
  hSymbol: string;
  aPrice: number;
  hPrice: number;
  exchangeRate: number; // HKD/CNY
  timestamp: number;
}

export interface LOFQuote {
  symbol: string;
  fieldPrice: number;   // 场内价格
  nav: number;          // 净值
  volume: number;
  timestamp: number;
}

export interface ArbitrageOpportunity {
  type: 'etf_premium' | 'etf_discount' | 'futures_basis' | 'ah_premium' | 'lof_arb' | 'rotation';
  symbol: string;
  direction: 'buy' | 'sell';
  spread: number;
  spreadPercent: number;
  expectedProfit: number;
  cost: number;
  netProfit: number;
  risk: 'low' | 'medium' | 'high';
  holdingPeriod: string;
  description: string;
}

export interface ArbitrageReport {
  opportunities: ArbitrageOpportunity[];
  bestOpportunity: ArbitrageOpportunity | null;
  totalOpportunities: number;
  avgSpread: number;
  timestamp: number;
}

export class ETFArbitrageEngine {
  private readonly etfTradingFee = 0.0003;  // ETF交易佣金
  private readonly stampTax = 0;            // ETF免印花税
  private readonly slippage = 0.001;        // 滑点估计
  private readonly futuresMargin = 0.12;    // 期货保证金比例

  /**
   * ETF折溢价套利检测
   */
  detectETFDiscountPremium(quotes: ETFQuote[]): ArbitrageOpportunity[] {
    const opportunities: ArbitrageOpportunity[] = [];

    for (const q of quotes) {
      if (q.iopv <= 0 || q.price <= 0) continue;

      const spread = q.price - q.iopv;
      const spreadPercent = spread / q.iopv;
      const totalCost = this.etfTradingFee * 2 + this.slippage; // 买卖各一次

      // 溢价套利: 申购ETF份额 + 卖出
      if (spreadPercent > totalCost + 0.002) { // >0.2% beyond costs
        const netProfit = spreadPercent - totalCost;
        opportunities.push({
          type: 'etf_premium',
          symbol: q.symbol,
          direction: 'sell',
          spread,
          spreadPercent,
          expectedProfit: spreadPercent * 1000000, // 假设100万资金
          cost: totalCost * 1000000,
          netProfit: netProfit * 1000000,
          risk: spreadPercent > 0.01 ? 'high' : 'medium',
          holdingPeriod: 'T+0',
          description: `${q.name} 溢价${(spreadPercent * 100).toFixed(2)}%，可申购卖出`
        });
      }

      // 折价套利: 买入ETF + 赎回
      if (spreadPercent < -(totalCost + 0.002)) {
        const netProfit = Math.abs(spreadPercent) - totalCost;
        opportunities.push({
          type: 'etf_discount',
          symbol: q.symbol,
          direction: 'buy',
          spread,
          spreadPercent,
          expectedProfit: Math.abs(spreadPercent) * 1000000,
          cost: totalCost * 1000000,
          netProfit: netProfit * 1000000,
          risk: Math.abs(spreadPercent) > 0.01 ? 'high' : 'medium',
          holdingPeriod: 'T+0',
          description: `${q.name} 折价${(Math.abs(spreadPercent) * 100).toFixed(2)}%，可买入赎回`
        });
      }
    }

    return opportunities.sort((a, b) => b.netProfit - a.netProfit);
  }

  /**
   * 期现套利检测
   */
  detectFuturesBasisArb(quotes: FuturesQuote[]): ArbitrageOpportunity[] {
    const opportunities: ArbitrageOpportunity[] = [];

    for (const q of quotes) {
      if (q.spotPrice <= 0 || q.price <= 0) continue;

      const basis = q.price - q.spotPrice;
      const basisPercent = basis / q.spotPrice;

      // 年化基差
      const daysToUse = Math.max(1, q.daysToDelivery);
      const annualizedBasis = basisPercent * (365 / daysToUse);

      // 无风险利率参考 (假设2.5%)
      const riskFreeRate = 0.025;
      const tradingCost = this.etfTradingFee + this.futuresMargin * 0.03; // 保证金利息

      // 正向套利: 买入现货 + 卖出期货
      if (annualizedBasis > riskFreeRate + tradingCost + 0.005) {
        const netProfit = annualizedBasis - riskFreeRate - tradingCost;
        opportunities.push({
          type: 'futures_basis',
          symbol: q.symbol,
          direction: 'sell',
          spread: basis,
          spreadPercent: basisPercent,
          expectedProfit: netProfit * 1000000,
          cost: (riskFreeRate + tradingCost) * 1000000,
          netProfit: netProfit * 1000000,
          risk: daysToUse < 30 ? 'low' : 'medium',
          holdingPeriod: `${daysToUse}天`,
          description: `${q.underlying} 期货升水${(annualizedBasis * 100).toFixed(2)}%(年化)，可做正向套利`
        });
      }

      // 反向套利: 融券卖出 + 买入期货
      if (annualizedBasis < -(riskFreeRate + tradingCost + 0.01)) {
        const netProfit = Math.abs(annualizedBasis) - riskFreeRate - tradingCost - 0.01; // 融券成本
        opportunities.push({
          type: 'futures_basis',
          symbol: q.symbol,
          direction: 'buy',
          spread: basis,
          spreadPercent: basisPercent,
          expectedProfit: Math.abs(netProfit) * 1000000,
          cost: (riskFreeRate + tradingCost + 0.01) * 1000000,
          netProfit: Math.abs(netProfit) * 1000000,
          risk: 'high',
          holdingPeriod: `${daysToUse}天`,
          description: `${q.underlying} 期货贴水${(Math.abs(annualizedBasis) * 100).toFixed(2)}%(年化)`
        });
      }
    }

    return opportunities.sort((a, b) => b.netProfit - a.netProfit);
  }

  /**
   * AH股溢价套利
   */
  detectAHPremiumArb(quotes: AHQuote[]): ArbitrageOpportunity[] {
    const opportunities: ArbitrageOpportunity[] = [];

    for (const q of quotes) {
      if (q.aPrice <= 0 || q.hPrice <= 0 || q.exchangeRate <= 0) continue;

      const hPriceInCNY = q.hPrice * q.exchangeRate;
      const premium = (q.aPrice - hPriceInCNY) / hPriceInCNY;

      const tradingCost = 0.003; // 双边交易成本

      // AH溢价 > 30% 时考虑套利
      if (premium > 0.30) {
        const netProfit = premium - tradingCost;
        opportunities.push({
          type: 'ah_premium',
          symbol: q.aSymbol,
          direction: 'sell',
          spread: q.aPrice - hPriceInCNY,
          spreadPercent: premium,
          expectedProfit: netProfit * 1000000,
          cost: tradingCost * 1000000,
          netProfit: netProfit * 1000000,
          risk: 'high',
          holdingPeriod: '长期',
          description: `AH溢价${(premium * 100).toFixed(1)}%，A股(${q.aSymbol})相对H股(${q.hSymbol})高估`
        });
      }

      // AH折价 (罕见)
      if (premium < -0.15) {
        opportunities.push({
          type: 'ah_premium',
          symbol: q.aSymbol,
          direction: 'buy',
          spread: q.aPrice - hPriceInCNY,
          spreadPercent: premium,
          expectedProfit: Math.abs(premium - tradingCost) * 1000000,
          cost: tradingCost * 1000000,
          netProfit: Math.abs(premium - tradingCost) * 1000000,
          risk: 'high',
          holdingPeriod: '长期',
          description: `AH折价${(Math.abs(premium) * 100).toFixed(1)}%，A股(${q.aSymbol})相对H股低估`
        });
      }
    }

    return opportunities.sort((a, b) => b.netProfit - a.netProfit);
  }

  /**
   * LOF场内外套利
   */
  detectLOFArb(quotes: LOFQuote[]): ArbitrageOpportunity[] {
    const opportunities: ArbitrageOpportunity[] = [];

    for (const q of quotes) {
      if (q.nav <= 0 || q.fieldPrice <= 0) continue;

      const spread = q.fieldPrice - q.nav;
      const spreadPercent = spread / q.nav;
      const totalCost = 0.003; // 申赎费用 + 交易佣金

      // 溢价: 申购转场内卖出
      if (spreadPercent > totalCost + 0.005) {
        opportunities.push({
          type: 'lof_arb',
          symbol: q.symbol,
          direction: 'sell',
          spread,
          spreadPercent,
          expectedProfit: (spreadPercent - totalCost) * 1000000,
          cost: totalCost * 1000000,
          netProfit: (spreadPercent - totalCost) * 1000000,
          risk: 'medium',
          holdingPeriod: 'T+2~T+3',
          description: `LOF溢价${(spreadPercent * 100).toFixed(2)}%，可申购转场内卖出`
        });
      }

      // 折价: 场内买入转场外赎回
      if (spreadPercent < -(totalCost + 0.005)) {
        opportunities.push({
          type: 'lof_arb',
          symbol: q.symbol,
          direction: 'buy',
          spread,
          spreadPercent,
          expectedProfit: (Math.abs(spreadPercent) - totalCost) * 1000000,
          cost: totalCost * 1000000,
          netProfit: (Math.abs(spreadPercent) - totalCost) * 1000000,
          risk: 'medium',
          holdingPeriod: 'T+2~T+3',
          description: `LOF折价${(Math.abs(spreadPercent) * 100).toFixed(2)}%，可买入转赎回`
        });
      }
    }

    return opportunities.sort((a, b) => b.netProfit - a.netProfit);
  }

  /**
   * 综合套利报告
   */
  generateReport(
    etfQuotes: ETFQuote[],
    futuresQuotes: FuturesQuote[],
    ahQuotes: AHQuote[],
    lofQuotes: LOFQuote[]
  ): ArbitrageReport {
    const opportunities: ArbitrageOpportunity[] = [
      ...this.detectETFDiscountPremium(etfQuotes),
      ...this.detectFuturesBasisArb(futuresQuotes),
      ...this.detectAHPremiumArb(ahQuotes),
      ...this.detectLOFArb(lofQuotes),
    ].sort((a, b) => b.netProfit - a.netProfit);

    const totalSpread = opportunities.reduce((sum, o) => sum + Math.abs(o.spreadPercent), 0);
    const avgSpread = opportunities.length > 0 ? totalSpread / opportunities.length : 0;

    return {
      opportunities,
      bestOpportunity: opportunities[0] || null,
      totalOpportunities: opportunities.length,
      avgSpread,
      timestamp: Date.now()
    };
  }
}

export default new ETFArbitrageEngine();
