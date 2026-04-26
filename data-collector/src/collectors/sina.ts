/**
 * 新浪数据源采集器
 * 从新浪财经API获取A股实时行情数据
 */

import axios, { AxiosInstance } from 'axios';
import {
  BaseCollector,
  RawQuoteData,
  RawKLineData,
  CollectorConfig,
  CollectorResult,
} from './base';
import { toValidNumber } from '../utils';

const SINA_CONFIG: CollectorConfig = {
  name: 'sina',
  baseUrl: 'https://hq.sinajs.cn',
  timeout: 10000,
  retryCount: 3,
  retryDelay: 1000,
  requestInterval: 500,
};

export class SinaCollector extends BaseCollector {
  private httpClient: AxiosInstance;

  constructor(config: Partial<CollectorConfig> = {}) {
    super({ ...SINA_CONFIG, ...config });

    this.httpClient = axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://finance.sina.com.cn',
      },
    });
  }

  /**
   * 获取实时行情
   */
  async fetchRealtimeQuotes(symbols?: string[]): Promise<CollectorResult> {
    this.isRunning = true;
    const result: CollectorResult = {
      success: false,
      data: [],
      errors: [],
      timestamp: new Date(),
      source: this.config.name,
      count: 0,
    };

    try {
      let targetSymbols: string[];
      if (symbols && symbols.length > 0) {
        targetSymbols = symbols.map(s => this.toSinaSymbol(s));
      } else {
        targetSymbols = this.getDefaultSymbols();
      }

      // 分批获取
      const batchSize = 200;
      const batches = this.chunk(targetSymbols, batchSize);

      for (const batch of batches) {
        try {
          const batchResult = await this.fetchBatch(batch);
          result.data.push(...batchResult);
          result.count += batchResult.length;

          if (batches.length > 1) {
            await this.delay(this.config.requestInterval);
          }
        } catch (batchError) {
          result.errors.push(`批量获取失败: ${(batchError as Error).message}`);
        }
      }

      result.success = result.count > 0;
    } catch (error) {
      result.errors.push(`采集失败: ${(error as Error).message}`);
    } finally {
      this.isRunning = false;
      this.lastRunTime = new Date();
    }

    return result;
  }

  /**
   * 获取K线数据
   */
  async fetchKLineData(symbol: string, days: number = 120): Promise<RawKLineData[]> {
    const sinaSymbol = this.toSinaSymbol(symbol);
    const url = `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${sinaSymbol}&scale=240&ma=no&datalen=${days}`;

    try {
      const response = await this.httpClient.get(url, {
        headers: { 'Referer': 'https://finance.sina.com.cn' },
      });

      return this.parseKLineResponse(response.data, symbol);
    } catch (error) {
      console.error(`[Sina] 获取K线数据失败: ${symbol}`, error);
      return [];
    }
  }

  /**
   * 批量获取行情
   */
  private async fetchBatch(symbols: string[]): Promise<RawQuoteData[]> {
    return this.fetchWithRetry(async () => {
      const symbolStr = symbols.join(',');
      const response = await this.httpClient.get(`/list=${symbolStr}`, {
        responseType: 'text',
      });

      return this.parseRawData(response.data);
    });
  }

  /**
   * 解析新浪行情数据
   * 新浪返回格式: var hq_str_sh600519="贵州茅台,1800.00,..."
   */
  parseRawData(raw: string): RawQuoteData[] {
    const quotes: RawQuoteData[] = [];
    const lines = raw.split(/\r?\n/).filter(line => line.trim());

    for (const line of lines) {
      try {
        const quote = this.parseSingleQuote(line);
        if (quote) {
          quotes.push(quote);
        }
      } catch (error) {
        console.warn('[Sina] 解析行情行失败:', line, error);
      }
    }

    return quotes;
  }

  /**
   * 解析单行行情数据
   */
  private parseSingleQuote(line: string): RawQuoteData | null {
    // 格式: var hq_str_sh600519="1800.00,1801.00,..."
    const match = line.match(/hq_str_(\w+)="(.+)"/);
    if (!match) return null;

    const sinaSymbol = match[1];
    const fields = match[2].split(',');
    const code = sinaSymbol.replace(/^(sh|sz)/, '');

    // 新浪行情字段顺序:
    // 0: 股票名称, 1: 今开, 2: 昨收, 3: 当前价, 4: 最高, 5: 最低
    // 6: 买一价, 7: 卖一价, 8: 成交量(手), 9: 成交额
    // 10: 买一量, 11: 买二量 ... 后续为五档数据
    if (fields.length < 10) return null;

    const name = fields[0];
    const openPrice = toValidNumber(parseFloat(fields[1]), 0);
    const prevClose = toValidNumber(parseFloat(fields[2]), 0);
    const currentPrice = toValidNumber(parseFloat(fields[3]), 0);
    const highPrice = toValidNumber(parseFloat(fields[4]), 0);
    const lowPrice = toValidNumber(parseFloat(fields[5]), 0);
    // fields[6] = 买一价, fields[7] = 卖一价
    // fields[8] = 成交量(手), fields[9] = 成交额
    const volume = toValidNumber(parseFloat(fields[8]), 0) * 100; // 手 -> 股
    const turnover = toValidNumber(parseFloat(fields[9]), 0);
    const change = currentPrice - prevClose;
    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;
    const amplitude = (prevClose > 0 && highPrice > 0 && lowPrice > 0)
      ? ((highPrice - lowPrice) / prevClose) * 100
      : 0;

    const market = sinaSymbol.startsWith('sh') ? 'SH' : 'SZ';

    return {
      symbol: `${code}.${market}`,
      name,
      currentPrice,
      openPrice,
      highPrice,
      lowPrice,
      prevClose,
      volume,
      turnover,
      change,
      changePercent,
      amplitude,
      turnoverRate: 0, // 新浪默认不提供换手率
      bidPrice1: toValidNumber(parseFloat(fields[6])),
      askPrice1: toValidNumber(parseFloat(fields[7])),
      bidVolume1: fields[10] ? parseFloat(fields[10]) * 100 : undefined,
      askVolume1: fields[20] ? parseFloat(fields[20]) * 100 : undefined,
      timestamp: Date.now(),
      source: 'sina',
    };
  }

  /**
   * 解析K线数据
   */
  private parseKLineResponse(data: any[], symbol: string): RawKLineData[] {
    const result: RawKLineData[] = [];

    if (!Array.isArray(data)) return result;

    for (const item of data) {
      try {
        result.push({
          symbol,
          tradeDate: item.day,
          openPrice: toValidNumber(parseFloat(item.open), 0),
          closePrice: toValidNumber(parseFloat(item.close), 0),
          highPrice: toValidNumber(parseFloat(item.high), 0),
          lowPrice: toValidNumber(parseFloat(item.low), 0),
          volume: toValidNumber(parseFloat(item.volume), 0),
          turnover: toValidNumber(parseFloat(item.amount), 0),
        });
      } catch {
        continue;
      }
    }

    return result;
  }

  /**
   * 转换为新浪格式的股票代码
   */
  private toSinaSymbol(symbol: string): string {
    const code = symbol.replace(/\.(SZ|SH|BJ)$/i, '');
    if (code.startsWith('6') || code.startsWith('9')) {
      return `sh${code}`;
    }
    return `sz${code}`;
  }

  /**
   * 获取默认的股票列表
   */
  private getDefaultSymbols(): string[] {
    return [
      'sh000001', // 上证指数
      'sh000300', // 沪深300
      'sz399001', // 深证成指
      'sz399006', // 创业板指
      'sh600519', // 贵州茅台
      'sz000858', // 五粮液
      'sh601318', // 中国平安
      'sz000002', // 万科A
      'sz000333', // 美的集团
      'sz002415', // 海康威视
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
}
