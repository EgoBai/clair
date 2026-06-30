/**
 * 数据同步模块 - 将 data-collector 与 backend 集成
 * 实现定时从腾讯API获取数据并存入数据库
 */

import { Knex } from 'knex';
import axios from 'axios';
import * as iconv from 'iconv-lite';
import { db } from '../db/dbFactory';
import { getInMemoryDb } from '../db/InMemoryDatabase';
import { wsService } from '../websocket/server';

export interface SyncResult {
  success: boolean;
  stocksCreated: number;
  quotesSaved: number;
  errors: string[];
  duration: number;
}

export interface SyncState {
  running: boolean;
  lastSyncAt: string | null;
  lastSyncCount: number;
  lastSyncError: string | null;
  totalSyncs: number;
  nextSyncAt: number | null;  // timestamp ms
  intervalSeconds: number;
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
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private syncState: SyncState = {
    running: false,
    lastSyncAt: null,
    lastSyncCount: 0,
    lastSyncError: null,
    totalSyncs: 0,
    nextSyncAt: null,
    intervalSeconds: 300,
  };

  /**
   * 启动定时同步 (默认每5分钟)
   */
  startScheduledSync(intervalSeconds: number = 300): void {
    if (this.syncTimer) return;
    this.syncState.intervalSeconds = intervalSeconds;
    console.log(`[DataSync] 定时同步已启动，间隔 ${intervalSeconds}s`);

    // 延迟 10s 首次执行
    setTimeout(() => this.runScheduledSync(), 10000);

    this.syncTimer = setInterval(() => {
      this.runScheduledSync();
    }, intervalSeconds * 1000);
  }

  /**
   * 停止定时同步
   */
  stopScheduledSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
      console.log('[DataSync] 定时同步已停止');
    }
  }

  /**
   * 获取同步状态
   */
  getSyncState(): SyncState {
    return { ...this.syncState, running: this.isRunning };
  }

  private async runScheduledSync(): Promise<void> {
    try {
      this.syncState.running = true;
      const result = await this.syncRealtimeQuotes();
      this.syncState.lastSyncAt = new Date().toISOString();
      this.syncState.lastSyncCount = result.quotesSaved;
      this.syncState.lastSyncError = result.errors.length > 0 ? result.errors[0] : null;
      this.syncState.totalSyncs++;
      this.syncState.nextSyncAt = Date.now() + this.syncState.intervalSeconds * 1000;
      console.log(`[DataSync] 定时同步完成: ${result.quotesSaved} 条, ${result.errors.length} 错误`);
    } catch (error) {
      this.syncState.lastSyncError = (error as Error).message;
      console.error('[DataSync] 定时同步失败:', error);
    } finally {
      this.syncState.running = false;
    }
  }

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
                change: quote.change,
                changePercent: quote.changePercent,
                amplitude: quote.amplitude,
                turnoverRate: quote.turnoverRate,
                marketCap: quote.marketCap,
                turnover: quote.turnover * 10000, // 腾讯API返回万元，转为元存储
                peRatio: quote.peRatio,
                pbRatio: quote.pbRatio,
              });

              result.quotesSaved++;

              // 推送到 WebSocket 实时行情
              try {
                wsService.pushQuoteUpdate(quote.symbol, {
                  symbol: quote.symbol,
                  name: quote.name,
                  currentPrice: quote.currentPrice,
                  change: quote.change,
                  changePercent: quote.changePercent,
                  volume: quote.volume,
                  turnover: quote.turnover,
                  bidPrice1: quote.bidPrice1,
                  askPrice1: quote.askPrice1,
                });
              } catch (e) { console.warn('[DataSync] WebSocket推送失败:', e); }
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
      responseType: 'arraybuffer',  // GBK 编码，不能当 UTF-8 直接读
    });

    // 腾讯行情 API 返回 GBK 编码，需手动转 UTF-8
    const rawText = iconv.decode(Buffer.from(response.data), 'gbk');
    return this.parseTencentResponse(rawText);
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
    // 尝试从数据库获取所有活跃股票
    try {
      const memDb = getInMemoryDb();
      const stocks = (memDb as any).stocks;
      if (stocks && stocks.length > 100) {
        return stocks
          .filter((s: any) => s.isActive !== false)
          .map((s: any) => this.toTencentSymbol(s.symbol));
      }
    } catch (error) {
      console.warn('[DataSync] 无法从数据库获取股票列表，使用默认列表');
    }

    return [
      // 三大指数
      'sh000001', 'sh000300', 'sh000905', 'sz399001', 'sz399006',
      // 银行
      'sh600036', 'sh601398', 'sh601288', 'sh601166', 'sh600000', 'sh601818', 'sh600015', 'sh601328',
      // 白酒/消费
      'sh600519', 'sz000858', 'sz000568', 'sh600809', 'sz002304', 'sh603369', 'sz000596', 'sz000799',
      // 新能源/汽车
      'sz002594', 'sz300750', 'sz002475', 'sz300014', 'sz300274', 'sz002126', 'sz300037',
      // 医药
      'sh600276', 'sz300015', 'sz002422', 'sz300003', 'sh600196', 'sz002007', 'sz300347', 'sh600763',
      // 科技/半导体
      'sh688981', 'sz300059', 'sh688036', 'sz002230', 'sz300496', 'sz002049', 'sz300782', 'sh688008',
      // 地产/建筑
      'sz000002', 'sz000069', 'sh600048', 'sz001979', 'sh600383', 'sz000031',
      // 保险/证券
      'sh601318', 'sh601601', 'sh600030', 'sh601688', 'sh601211', 'sz000776', 'sh600837',
      // 钢铁/有色
      'sh600019', 'sz000709', 'sh601899', 'sh600362', 'sz002460', 'sh601600', 'sh600547',
      // 石油/化工
      'sh600028', 'sh601857', 'sh600309', 'sz000338', 'sh600585', 'sz002493', 'sz000830',
      // 电力/公用
      'sh600900', 'sh601985', 'sh600886', 'sz000027', 'sh600023', 'sh601669',
      // 家电/制造
      'sz000651', 'sz000333', 'sz002032', 'sz002508', 'sh600690', 'sz000921',
      // 通信/传媒
      'sh601888', 'sz002153', 'sz300122', 'sz002602', 'sz300413', 'sz002555', 'sz300027',
      // 农业/食品
      'sz002714', 'sz002352', 'sh600887', 'sz000895', 'sz002311', 'sz002157',
      // 交通运输
      'sh601111', 'sh600009', 'sh601006', 'sz000089', 'sh600115', 'sh601872',
      // 其他蓝筹
      'sh600703', 'sh601012', 'sh601919', 'sh600588', 'sz002241', 'sz000725', 'sz002466',
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
