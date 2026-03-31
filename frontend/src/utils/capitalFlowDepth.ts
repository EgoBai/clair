/**
 * 资金流分析深度引擎
 * 大单追踪、主力资金分析、筹码分布
 */

export interface TradeData {
  price: number;
  volume: number;
  amount: number;
  direction: 'buy' | 'sell';
  timestamp: number;
  isLargeOrder: boolean;
}

export interface CapitalFlowResult {
  netInflow: number;
  largeOrderNetInflow: number;
  superLargeOrderNetInflow: number;
  mainForceNetInflow: number;
  retailNetInflow: number;
  buySellRatio: number;
  concentration: number;
  trend: 'inflow' | 'outflow' | 'balanced';
}

export interface ChipDistribution {
  priceLevel: number;
  percentage: number;
  isProfit: boolean;
  costCenter: number;
}

export class CapitalFlowDepthEngine {
  private readonly LARGE_ORDER_THRESHOLD = 100000;    // 10万
  private readonly SUPER_LARGE_THRESHOLD = 500000;    // 50万
  private readonly MAIN_FORCE_THRESHOLD = 1000000;    // 100万

  /**
   * 分析资金流向
   */
  analyzeFlow(trades: TradeData[], currentPrice: number): CapitalFlowResult {
    let totalBuy = 0;
    let totalSell = 0;
    let largeBuy = 0;
    let largeSell = 0;
    let superLargeBuy = 0;
    let superLargeSell = 0;
    let mainForceBuy = 0;
    let mainForceSell = 0;

    for (const trade of trades) {
      if (trade.direction === 'buy') {
        totalBuy += trade.amount;
        if (trade.amount >= this.LARGE_ORDER_THRESHOLD) largeBuy += trade.amount;
        if (trade.amount >= this.SUPER_LARGE_THRESHOLD) superLargeBuy += trade.amount;
        if (trade.amount >= this.MAIN_FORCE_THRESHOLD) mainForceBuy += trade.amount;
      } else {
        totalSell += trade.amount;
        if (trade.amount >= this.LARGE_ORDER_THRESHOLD) largeSell += trade.amount;
        if (trade.amount >= this.SUPER_LARGE_THRESHOLD) superLargeSell += trade.amount;
        if (trade.amount >= this.MAIN_FORCE_THRESHOLD) mainForceSell += trade.amount;
      }
    }

    const netInflow = totalBuy - totalSell;
    const total = totalBuy + totalSell;

    // 集中度（大单占比）
    const largeOrderTotal = largeBuy + largeSell;
    const concentration = total > 0 ? largeOrderTotal / total : 0;

    // 买卖比
    const buySellRatio = totalSell > 0 ? totalBuy / totalSell : totalBuy > 0 ? Infinity : 1;

    // 趋势判断
    let trend: CapitalFlowResult['trend'];
    if (netInflow > total * 0.1) trend = 'inflow';
    else if (netInflow < -total * 0.1) trend = 'outflow';
    else trend = 'balanced';

    return {
      netInflow: Math.round(netInflow),
      largeOrderNetInflow: Math.round(largeBuy - largeSell),
      superLargeOrderNetInflow: Math.round(superLargeBuy - superLargeSell),
      mainForceNetInflow: Math.round(mainForceBuy - mainForceSell),
      retailNetInflow: Math.round((totalBuy - mainForceBuy) - (totalSell - mainForceSell)),
      buySellRatio: Math.round(buySellRatio * 100) / 100,
      concentration: Math.round(concentration * 100) / 100,
      trend,
    };
  }

  /**
   * 筹码分布计算
   */
  calculateChipDistribution(
    trades: TradeData[],
    currentPrice: number,
    levels: number = 20
  ): ChipDistribution[] {
    if (trades.length === 0) return [];

    const prices = trades.map(t => t.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const step = (maxPrice - minPrice) / levels || 1;

    const distribution: Map<number, number> = new Map();

    for (const trade of trades) {
      const level = Math.floor((trade.price - minPrice) / step);
      const key = minPrice + level * step;
      distribution.set(key, (distribution.get(key) || 0) + trade.volume);
    }

    const totalVolume = trades.reduce((s, t) => s + t.volume, 0);
    const result: ChipDistribution[] = [];

    for (const [price, volume] of distribution) {
      result.push({
        priceLevel: Math.round(price * 100) / 100,
        percentage: Math.round((volume / totalVolume) * 10000) / 100,
        isProfit: price < currentPrice,
        costCenter: currentPrice,
      });
    }

    return result.sort((a, b) => a.priceLevel - b.priceLevel);
  }

  /**
   * 获利盘比例
   */
  calculateProfitRatio(trades: TradeData[], currentPrice: number): number {
    if (trades.length === 0) return 0;

    const profitableVolume = trades
      .filter(t => t.price < currentPrice)
      .reduce((s, t) => s + t.volume, 0);
    const totalVolume = trades.reduce((s, t) => s + t.volume, 0);

    return Math.round((profitableVolume / totalVolume) * 100) / 100;
  }

  /**
   * 主力行为判断
   */
  detectMainForceAction(trades: TradeData[]): {
    action: 'accumulating' | 'distributing' | 'washing' | 'neutral';
    confidence: number;
    description: string;
  } {
    const mainForceTrades = trades.filter(t => t.amount >= this.MAIN_FORCE_THRESHOLD);
    const mainForceBuy = mainForceTrades.filter(t => t.direction === 'buy').reduce((s, t) => s + t.amount, 0);
    const mainForceSell = mainForceTrades.filter(t => t.direction === 'sell').reduce((s, t) => s + t.amount, 0);
    const netMainForce = mainForceBuy - mainForceSell;
    const totalMainForce = mainForceBuy + mainForceSell;

    if (totalMainForce === 0) {
      return { action: 'neutral', confidence: 0, description: '无大单交易' };
    }

    const ratio = netMainForce / totalMainForce;

    if (ratio > 0.3) {
      return { action: 'accumulating', confidence: Math.min(1, ratio), description: '主力持续吸筹' };
    }
    if (ratio < -0.3) {
      return { action: 'distributing', confidence: Math.min(1, Math.abs(ratio)), description: '主力派发筹码' };
    }
    if (mainForceBuy > 0 && mainForceSell > 0) {
      return { action: 'washing', confidence: 0.5, description: '主力洗盘震荡' };
    }

    return { action: 'neutral', confidence: 0.3, description: '主力观望' };
  }
}

export const capitalFlowDepthEngine = new CapitalFlowDepthEngine();
export default CapitalFlowDepthEngine;
