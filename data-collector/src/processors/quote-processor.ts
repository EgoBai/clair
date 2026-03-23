/**
 * 行情数据处理器
 * 负责将采集器获取的原始数据转换为标准格式并写入数据库
 */

import { RawQuoteData, RawKLineData } from '../collectors/base';

export interface ProcessedQuote {
  symbol: string;
  name: string;
  market: string;
  tradeDate: Date;
  openPrice: number;
  closePrice: number;
  highPrice: number;
  lowPrice: number;
  volume: number;
  turnover: number;
  change: number;
  changePercent: number;
  amplitude: number;
  turnoverRate: number;
  peRatio?: number;
  pbRatio?: number;
  marketCap?: number;
  circulatingMarketCap?: number;
  bidPrice1?: number;
  askPrice1?: number;
  source: string;
  collectedAt: Date;
}

export interface QuoteMergeStrategy {
  preferSource: string;
  fallbackSource: string;
  allowPriceDeviation: number; // 允许的价格偏差百分比
}

const DEFAULT_MERGE_STRATEGY: QuoteMergeStrategy = {
  preferSource: 'tencent',
  fallbackSource: 'sina',
  allowPriceDeviation: 1.0, // 1%
};

/**
 * 行情数据处理器
 */
export class QuoteProcessor {
  private mergeStrategy: QuoteMergeStrategy;
  private processedCount: number = 0;
  private errorCount: number = 0;

  constructor(strategy: Partial<QuoteMergeStrategy> = {}) {
    this.mergeStrategy = { ...DEFAULT_MERGE_STRATEGY, ...strategy };
  }

  /**
   * 处理原始行情数据
   */
  processQuotes(rawQuotes: RawQuoteData[]): ProcessedQuote[] {
    const processed: ProcessedQuote[] = [];
    const now = new Date();

    for (const raw of rawQuotes) {
      try {
        const quote = this.transformQuote(raw, now);
        if (this.validateQuote(quote)) {
          processed.push(quote);
          this.processedCount++;
        }
      } catch (error) {
        console.error(`[QuoteProcessor] 处理失败: ${raw.symbol}`, error);
        this.errorCount++;
      }
    }

    return processed;
  }

  /**
   * 合并多个数据源的行情
   */
  mergeQuotes(
    quotesA: RawQuoteData[],
    quotesB: RawQuoteData[]
  ): ProcessedQuote[] {
    const merged = new Map<string, RawQuoteData>();

    // 按优先级合并
    for (const quote of quotesA) {
      if (quote.source === this.mergeStrategy.preferSource) {
        merged.set(quote.symbol, quote);
      }
    }

    // 补充缺失数据
    for (const quote of quotesB) {
      if (!merged.has(quote.symbol)) {
        merged.set(quote.symbol, quote);
      }
    }

    return this.processQuotes(Array.from(merged.values()));
  }

  /**
   * 转换为标准格式
   */
  private transformQuote(raw: RawQuoteData, collectedAt: Date): ProcessedQuote {
    return {
      symbol: raw.symbol,
      name: raw.name,
      market: this.extractMarket(raw.symbol),
      tradeDate: this.normalizeDate(collectedAt),
      openPrice: this.normalizePrice(raw.openPrice),
      closePrice: this.normalizePrice(raw.currentPrice),
      highPrice: this.normalizePrice(raw.highPrice),
      lowPrice: this.normalizePrice(raw.lowPrice),
      volume: this.normalizeVolume(raw.volume),
      turnover: this.normalizeTurnover(raw.turnover),
      change: this.normalizePrice(raw.change),
      changePercent: this.round(raw.changePercent, 2),
      amplitude: this.round(raw.amplitude, 2),
      turnoverRate: this.round(raw.turnoverRate, 2),
      peRatio: raw.peRatio,
      pbRatio: raw.pbRatio,
      marketCap: raw.marketCap,
      circulatingMarketCap: raw.circulatingMarketCap,
      bidPrice1: raw.bidPrice1,
      askPrice1: raw.askPrice1,
      source: raw.source,
      collectedAt,
    };
  }

  /**
   * 处理K线数据
   */
  processKLineData(rawData: RawKLineData[]): ProcessedQuote[] {
    const processed: ProcessedQuote[] = [];

    for (const raw of rawData) {
      try {
        const quote: ProcessedQuote = {
          symbol: raw.symbol,
          name: '',
          market: this.extractMarket(raw.symbol),
          tradeDate: new Date(raw.tradeDate),
          openPrice: this.normalizePrice(raw.openPrice),
          closePrice: this.normalizePrice(raw.closePrice),
          highPrice: this.normalizePrice(raw.highPrice),
          lowPrice: this.normalizePrice(raw.lowPrice),
          volume: this.normalizeVolume(raw.volume),
          turnover: this.normalizeTurnover(raw.turnover),
          change: this.normalizePrice(raw.closePrice - raw.openPrice),
          changePercent: raw.openPrice > 0
            ? this.round(((raw.closePrice - raw.openPrice) / raw.openPrice) * 100, 2)
            : 0,
          amplitude: raw.openPrice > 0
            ? this.round(((raw.highPrice - raw.lowPrice) / raw.openPrice) * 100, 2)
            : 0,
          turnoverRate: 0,
          source: 'kline',
          collectedAt: new Date(),
        };

        if (this.validateQuote(quote)) {
          processed.push(quote);
        }
      } catch (error) {
        console.error(`[QuoteProcessor] K线处理失败:`, error);
      }
    }

    return processed;
  }

  /**
   * 验证行情数据
   */
  private validateQuote(quote: ProcessedQuote): boolean {
    if (!quote.symbol || !quote.symbol.match(/^\d{6}\.(SZ|SH|BJ)$/)) {
      return false;
    }
    if (quote.closePrice <= 0) {
      return false;
    }
    if (quote.highPrice < quote.lowPrice) {
      return false;
    }
    if (quote.volume < 0 || quote.turnover < 0) {
      return false;
    }
    // 涨跌幅异常过滤
    if (Math.abs(quote.changePercent) > 20) {
      console.warn(`[QuoteProcessor] 涨跌幅异常: ${quote.symbol} ${quote.changePercent}%`);
    }
    return true;
  }

  /**
   * 提取市场标识
   */
  private extractMarket(symbol: string): string {
    const parts = symbol.split('.');
    return parts[1] || 'UNKNOWN';
  }

  /**
   * 规范化日期
   */
  private normalizeDate(date: Date): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /**
   * 规范化价格
   */
  private normalizePrice(price: number): number {
    return this.round(price, 3);
  }

  /**
   * 规范化成交量（股）
   */
  private normalizeVolume(volume: number): number {
    return Math.round(volume);
  }

  /**
   * 规范化成交额（元）
   */
  private normalizeTurnover(turnover: number): number {
    return this.round(turnover, 0);
  }

  /**
   * 四舍五入
   */
  private round(num: number, decimals: number): number {
    const factor = Math.pow(10, decimals);
    return Math.round(num * factor) / factor;
  }

  /**
   * 获取处理统计
   */
  getStats(): { processed: number; errors: number } {
    return { processed: this.processedCount, errors: this.errorCount };
  }

  /**
   * 重置统计
   */
  resetStats(): void {
    this.processedCount = 0;
    this.errorCount = 0;
  }
}
