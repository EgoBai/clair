/**
 * 复权计算引擎
 * 处理前复权、后复权价格计算
 */

export interface DividendEvent {
  date: string;
  cashDividend: number;  // 每股派息（元）
  stockDividend: number; // 每股送股
  stockSplit: number;    // 每股转增
  allotmentPrice?: number; // 配股价
  allotmentRatio?: number; // 配股比例
}

export interface PriceData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type AdjustType = 'none' | 'forward' | 'backward';

export class AdjustFactorEngine {
  /**
   * 计算除权因子
   */
  private calculateExRightFactor(
    price: number,
    dividend: DividendEvent
  ): number {
    const { cashDividend, stockDividend, stockSplit, allotmentPrice = 0, allotmentRatio = 0 } = dividend;

    // 除权价 = (前收盘价 - 每股派息 + 配股价 × 配股比例) / (1 + 每股送股 + 每股转增 + 配股比例)
    const adjustedPrice = (price - cashDividend / 10 + allotmentPrice * allotmentRatio / 10) /
      (1 + stockDividend / 10 + stockSplit / 10 + allotmentRatio / 10);

    return price > 0 ? adjustedPrice / price : 1;
  }

  /**
   * 计算复权因子序列
   */
  calculateAdjustFactors(
    prices: PriceData[],
    dividends: DividendEvent[],
    type: AdjustType = 'forward'
  ): number[] {
    if (type === 'none' || dividends.length === 0) {
      return prices.map(() => 1);
    }

    const factors = new Array(prices.length).fill(1);
    const sortedDividends = [...dividends].sort((a, b) => a.date.localeCompare(b.date));

    if (type === 'forward') {
      // 前复权：从最新日期向前累积
      let cumulativeFactor = 1;

      for (let i = prices.length - 1; i >= 0; i--) {
        const priceDate = prices[i].date;
        const nextDate = i < prices.length - 1 ? prices[i + 1].date : '9999-99-99';

        for (const div of sortedDividends) {
          if (div.date > priceDate && div.date <= nextDate) {
            const factor = this.calculateExRightFactor(prices[i].close, div);
            cumulativeFactor *= factor;
          }
        }

        factors[i] = cumulativeFactor;
      }
    } else {
      // 后复权：从最早日期向后累积
      let cumulativeFactor = 1;

      for (let i = 0; i < prices.length; i++) {
        const priceDate = prices[i].date;
        const prevDate = i > 0 ? prices[i - 1].date : '0000-00-00';

        for (const div of sortedDividends) {
          if (div.date > prevDate && div.date <= priceDate) {
            const factor = this.calculateExRightFactor(prices[i].close, div);
            cumulativeFactor *= factor;
          }
        }

        factors[i] = cumulativeFactor;
      }
    }

    return factors;
  }

  /**
   * 应用复权
   */
  adjustPrices(
    prices: PriceData[],
    dividends: DividendEvent[],
    type: AdjustType = 'forward'
  ): PriceData[] {
    if (type === 'none') return prices;

    const factors = this.calculateAdjustFactors(prices, dividends, type);

    return prices.map((price, i) => ({
      ...price,
      open: Math.round(price.open * factors[i] * 100) / 100,
      high: Math.round(price.high * factors[i] * 100) / 100,
      low: Math.round(price.low * factors[i] * 100) / 100,
      close: Math.round(price.close * factors[i] * 100) / 100,
      volume: Math.round(price.volume / factors[i]),
    }));
  }

  /**
   * 计算等比复权收益率
   */
  calculateAdjustedReturns(
    prices: PriceData[],
    dividends: DividendEvent[],
    type: AdjustType = 'forward'
  ): number[] {
    const adjusted = this.adjustPrices(prices, dividends, type);
    const returns: number[] = [];

    for (let i = 1; i < adjusted.length; i++) {
      if (adjusted[i - 1].close > 0) {
        returns.push((adjusted[i].close - adjusted[i - 1].close) / adjusted[i - 1].close);
      }
    }

    return returns;
  }
}

export const adjustFactorEngine = new AdjustFactorEngine();
export default AdjustFactorEngine;
