/**
 * 数据同步模块 - 将 data-collector 与 backend 集成
 * 实现定时从腾讯API获取数据并存入数据库
 */

import { Knex } from 'knex';
import axios from 'axios';
import { db } from '../db/dbFactory';

export interface SyncResult {
  success: boolean;
  stocksCreated: number;
  quotesSaved: number;
  errors: string[];
  duration: number;
}

export interface RawQuoteData {
  symbol: string;
  name: string;
  currentPrice: number;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  prevClose: number;
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
  timestamp: number;
  source: string;
}

export interface RawKLineData {
  symbol: string;
  tradeDate: string;
  openPrice: number;
  closePrice: number;
  highPrice: number;
  lowPrice: number;
  volume: number;
  turnover: number;
}

/**
 * 数据同步服务
 */
export class DataSyncService {
  private isRunning: boolean = false;

  /**
   * 从腾讯API获取实时行情并同步到数据库
   */
  async syncRealtimeQuotes(symbols?: string[]): Promise<SyncResult> {
    if (this.isRunning) {
      return {
        success: false,
        stocksCreated: 0,
        quotesSaved: 0,
        errors: ['同步任务正在运行中'],
        duration: 0,
      };
    }

    this.isRunning = true;
    const startTime = Date.now();
    const result: SyncResult = {
      success: false,
      stocksCreated: 0,
      quotesSaved: 0,
      errors: [],
      duration: 0,
    };

    try {
      const targetSymbols = symbols || this.getDefaultSymbols();
      const batchSize = 200;
      const batches = this.chunk(targetSymbols, batchSize);

      for (const batch of batches) {
        try {
          const quotes = await this.fetchTencentQuotes(batch);

          for (const quote of quotes) {
            try {
              // 获取或创建股票
              let stock = await db.getStockBySymbol(quote.symbol);
              if (!stock) {
                stock = await db.createStock({
                  symbol: quote.symbol,
                  name: quote.name,
                  fullName: quote.name,
                  market: this.getMarketFromSymbol(quote.symbol),
                  isActive: true,
                });
                result.stocksCreated++;
              }

              // 更新股票名称
              if (stock.name !== quote.name) {
                await db.updateStock(stock.id, { name: quote.name });
              }

              // 保存日行情
              await db.createDailyQuote({
                stockId: stock.id,
                tradeDate: new Date(),
                openPrice: quote.openPrice,
                closePrice: quote.currentPrice,
                highPrice: quote.highPrice,
                lowPrice: quote.lowPrice,
                volume: quote.volume,
                turnover: quote.turnover,
                change: quote.change,
                changePercent: quote.changePercent,
                amplitude: quote.amplitude,
                turnoverRate: quote.turnoverRate,
                peRatio: quote.peRatio,
                pbRatio: quote.pbRatio,
                marketCap: quote.marketCap,
                circulatingMarketCap: quote.circulatingMarketCap,
              });

              result.quotesSaved++;
            } catch (error) {
              result.errors.push(`保存失败 ${quote.symbol}: ${(error as Error).message}`);
            }
          }

          // 批次间延迟
          if (batches.length > 1) {
            await this.delay(500);
          }
        } catch (error) {
          result.errors.push(`批量获取失败: ${(error as Error).message}`);
        }
      }

      result.success = result.quotesSaved > 0;
    } catch (error) {
      result.errors.push(`同步失败: ${(error as Error).message}`);
    } finally {
      this.isRunning = false;
      result.duration = Date.now() - startTime;
    }

    return result;
  }

  /**
   * 从腾讯API获取K线数据并同步到数据库
   */
  async syncKLineData(symbol: string, days: number = 120): Promise<SyncResult> {
    const startTime = Date.now();
    const result: SyncResult = {
      success: false,
      stocksCreated: 0,
      quotesSaved: 0,
      errors: [],
      duration: 0,
    };

    try {
      const klineData = await this.fetchTencentKLine(symbol, days);
      const stock = await db.getStockBySymbol(symbol);

      if (!stock) {
        result.errors.push(`股票不存在: ${symbol}`);
        return result;
      }

      for (const kline of klineData) {
        try {
          const change = kline.closePrice - kline.openPrice;
          const changePercent = kline.openPrice > 0
            ? (change / kline.openPrice) * 100
            : 0;
          const amplitude = kline.openPrice > 0
            ? ((kline.highPrice - kline.lowPrice) / kline.openPrice) * 100
            : 0;

          await db.createDailyQuote({
            stockId: stock.id,
            tradeDate: new Date(kline.tradeDate),
            openPrice: kline.openPrice,
            closePrice: kline.closePrice,
            highPrice: kline.highPrice,
            lowPrice: kline.lowPrice,
            volume: kline.volume,
            turnover: kline.turnover,
            change: parseFloat(change.toFixed(4)),
            changePercent: parseFloat(changePercent.toFixed(4)),
            amplitude: parseFloat(amplitude.toFixed(4)),
            turnoverRate: 0,
          });

          result.quotesSaved++;
        } catch (error) {
          // 忽略重复数据错误
          if (!(error as Error).message?.includes('duplicate')) {
            result.errors.push(`保存K线失败: ${(error as Error).message}`);
          }
        }
      }

      result.success = result.quotesSaved > 0;
    } catch (error) {
      result.errors.push(`K线同步失败: ${(error as Error).message}`);
    } finally {
      result.duration = Date.now() - startTime;
    }

    return result;
  }

  /**
   * 批量同步多只股票的K线数据
   */
  async syncMultipleKLineData(symbols: string[], days: number = 120): Promise<SyncResult> {
    const startTime = Date.now();
    const result: SyncResult = {
      success: false,
      stocksCreated: 0,
      quotesSaved: 0,
      errors: [],
      duration: 0,
    };

    for (const symbol of symbols) {
      try {
        const singleResult = await this.syncKLineData(symbol, days);
        result.quotesSaved += singleResult.quotesSaved;
        result.errors.push(...singleResult.errors);

        // 请求间延迟，避免被限流
        await this.delay(300);
      } catch (error) {
        result.errors.push(`同步 ${symbol} 失败: ${(error as Error).message}`);
      }
    }

    result.success = result.quotesSaved > 0;
    result.duration = Date.now() - startTime;
    return result;
  }

  /**
   * 获取同步状态
   */
  isSyncing(): boolean {
    return this.isRunning;
  }

  // ==================== 私有方法 ====================

  /**
   * 从腾讯API获取实时行情
   */
  private async fetchTencentQuotes(symbols: string[]): Promise<RawQuoteData[]> {
    const symbolStr = symbols.join(',');
    const url = `https://qt.gtimg.cn/q=${symbolStr}`;

    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://finance.qq.com',
      },
      responseType: 'text',
    });

    return this.parseTencentResponse(response.data);
  }

  /**
   * 从腾讯API获取K线数据
   */
  private async fetchTencentKLine(symbol: string, days: number): Promise<RawKLineData[]> {
    const tencentSymbol = this.toTencentSymbol(symbol);
    const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get`;

    const response = await axios.get(url, {
      params: {
        param: `${tencentSymbol},day,,,${days},qfq`,
      },
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://finance.qq.com',
      },
    });

    return this.parseKLineResponse(response.data, symbol);
  }

  /**
   * 解析腾讯实时行情响应
   */
  private parseTencentResponse(raw: string): RawQuoteData[] {
    const quotes: RawQuoteData[] = [];
    const lines = raw.split('\n').filter(line => line.trim());

    for (const line of lines) {
      let rawSymbol = '';
      try {
        const match = line.match(/v_\w+="(.+)"/);
        if (!match) continue;

        const parts = match[1].split('~');
        if (parts.length < 45) continue;

        rawSymbol = parts[2];
        const market = this.getMarketFromSymbol(rawSymbol);
        if (market === 'UNKNOWN') continue;

        const v = (idx: number) => { const x = parseFloat(parts[idx]); return Number.isFinite(x) ? x : 0; };

        const currentPrice = v(3);
        const prevClose = v(4);
        const change = currentPrice - prevClose;
        const changePct = v(32);
        const finalChangePct = Number.isFinite(changePct) ? changePct :
          (prevClose > 0 ? (change / prevClose) * 100 : 0);

        quotes.push({
          symbol: `${rawSymbol}.${market}`,
          name: parts[1],
          currentPrice,
          openPrice: v(5),
          highPrice: v(33) || currentPrice,
          lowPrice: v(34) || currentPrice,
          prevClose,
          volume: v(6),
          turnover: v(37),
          change,
          changePercent: finalChangePct,
          amplitude: v(43),
          turnoverRate: v(38),
          peRatio: (() => { const v = parseFloat(parts[39]); return Number.isFinite(v) ? v : undefined; })(),
          pbRatio: (() => { const v = parseFloat(parts[46]); return Number.isFinite(v) ? v : undefined; })(),
          marketCap: (() => { const v = parseFloat(parts[45]); return Number.isFinite(v) ? v * 10000 : undefined; })(),
          circulatingMarketCap: (() => { const v = parseFloat(parts[44]); return Number.isFinite(v) ? v * 10000 : undefined; })(),
          bidPrice1: (() => { const v = parseFloat(parts[9]); return Number.isFinite(v) ? v : undefined; })(),
          askPrice1: (() => { const v = parseFloat(parts[19]); return Number.isFinite(v) ? v : undefined; })(),
          timestamp: Date.now(),
          source: 'tencent',
        });
      } catch (error) {
        console.warn(`[DataSync] 行情解析失败: ${rawSymbol || 'unknown'}`, error instanceof Error ? error.message : error);
      }
    }

    return quotes;
  }

  /**
   * 解析K线响应
   */
  private parseKLineResponse(data: any, symbol: string): RawKLineData[] {
    const result: RawKLineData[] = [];

    try {
      const stockData = data?.data?.[symbol] || data?.data?.[`qfq${symbol}`] || data?.data?.[`sh${symbol.slice(0, 6)}`] || data?.data?.[`sz${symbol.slice(0, 6)}`];
      const dayData = stockData?.day || stockData?.qfqday;

      if (!dayData) return result;

      for (const item of dayData) {
        if (item.length >= 5) {
          const k = (idx: number) => { const v = parseFloat(item[idx]); return Number.isFinite(v) ? v : 0; };
          result.push({
            symbol,
            tradeDate: item[0],
            openPrice: k(1),
            closePrice: k(2),
            highPrice: k(3),
            lowPrice: k(4),
            volume: k(5),
            turnover: k(6),
          });
        }
      }
    } catch (error) {
      console.error(`[DataSync] 解析K线数据失败: ${symbol}`, error);
    }

    return result;
  }

  /**
   * 转换为腾讯格式的股票代码
   */
  private toTencentSymbol(symbol: string): string {
    const code = symbol.replace(/\.(SZ|SH|BJ)$/i, '');
    if (code.startsWith('6') || code.startsWith('9')) {
      return `sh${code}`;
    }
    return `sz${code}`;
  }

  /**
   * 从股票代码获取市场
   */
  private getMarketFromSymbol(symbol: string): string {
    const code = symbol.replace(/\.(SZ|SH|BJ)$/i, '');
    if (code.startsWith('6') || code.startsWith('9')) return 'SH';
    if (code.startsWith('0') || code.startsWith('3')) return 'SZ';
    if (code.startsWith('8') || code.startsWith('4')) return 'BJ';
    return 'UNKNOWN';
  }

  /**
   * 获取默认股票列表
   */
  private getDefaultSymbols(): string[] {
    return [
      'sh000001', 'sh000300', 'sh000905', 'sz399001', 'sz399006',
      'sh600519', 'sz000858', 'sh601318', 'sz000002', 'sz000333',
      'sh600036', 'sz000001', 'sh601166', 'sz002714', 'sh600276',
      'sz002594', 'sh601012', 'sz300750', 'sh688981', 'sz002475',
      'sh600900', 'sz002352', 'sh601398', 'sz000651', 'sh600030',
      'sz300059', 'sh601888', 'sz002230', 'sh600887', 'sz002415',
      'sh600309', 'sz000858', 'sh601288', 'sz002304', 'sh600585',
      'sz300015', 'sh601668', 'sz002049', 'sh600703', 'sz000568',
      'sh601601', 'sz002241', 'sh600809', 'sz000725', 'sh601919',
      'sz002466', 'sh600547', 'sz300122', 'sh601857', 'sz002129',
      'sh600196', 'sz000338', 'sh600028', 'sz002153', 'sh600588',
    ];
  }

  /**
   * 数组分批
   */
  private chunk<T>(arr: T[], size: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      result.push(arr.slice(i, i + size));
    }
    return result;
  }

  /**
   * 延迟
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 单例导出
export const dataSyncService = new DataSyncService();
