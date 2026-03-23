/**
 * 腾讯数据源采集器
 * 从腾讯财经API获取A股实时行情数据
 */

import axios, { AxiosInstance } from 'axios';
import {
  BaseCollector,
  RawQuoteData,
  RawKLineData,
  CollectorConfig,
  CollectorResult,
} from './base';

const TENCENT_CONFIG: CollectorConfig = {
  name: 'tencent',
  baseUrl: 'https://qt.gtimg.cn',
  timeout: 10000,
  retryCount: 3,
  retryDelay: 1000,
  requestInterval: 500,
};

/**
 * 腾讯实时行情字段映射
 * 腾讯行情接口返回固定格式的文本，按分号分隔各股票，按波浪号分隔各字段
 */
const TENCENT_FIELDS = [
  'name',           // 0: 名称
  'code',           // 1: 代码
  'currentPrice',   // 2: 当前价
  'prevClose',      // 3: 昨收
  'openPrice',      // 4: 开盘
  'volume',         // 5: 成交量
  'buyVolume',      // 6: 买入量
  'sellVolume',     // 7: 卖出量
  'highPrice',      // 8: 最高
  'lowPrice',       // 9: 最低
  'bidPrice1',      // 10: 买一价
  'askPrice1',      // 11: 卖一价
  'turnover',       // 12: 成交额
  'bid1Vol',        // 13: 买一量
  'bid2Vol',        // 14: 买二量
  'bid3Vol',        // 15: 买三量
  'bid4Vol',        // 16: 买四量
  'bid5Vol',        // 17: 买五量
  'bid1Price',      // 18: 买一价
  'bid2Price',      // 19: 买二价
  'bid3Price',      // 20: 买三价
  'bid4Price',      // 21: 买四价
  'bid5Price',      // 22: 买五价
  'ask1Vol',        // 23: 卖一量
  'ask2Vol',        // 24: 卖二量
  'ask3Vol',        // 25: 卖三量
  'ask4Vol',        // 26: 卖四量
  'ask5Vol',        // 27: 卖五量
  'ask1Price',      // 28: 卖一价
  'ask2Price',      // 29: 卖二价
  'ask3Price',      // 30: 卖三价
  'ask4Price',      // 31: 卖四价
  'ask5Price',      // 32: 卖五价
  'date',           // 33: 日期
  'time',           // 34: 时间
  'amplitude',      // 35: 振幅
  'turnoverRate',   // 36: 换手率
  'peRatio',        // 37: 市盈率
  'volume2',        // 38: 成交量2
  'priceDiff',      // 39: 涨跌额
  'changePercent',  // 40: 涨跌幅
  'highLimit',      // 41: 涨停价
  'lowLimit',       // 42: 跌停价
  'marketCap',      // 43: 总市值
  'circulatingCap', // 44: 流通市值
];

export class TencentCollector extends BaseCollector {
  private httpClient: AxiosInstance;

  constructor(config: Partial<CollectorConfig> = {}) {
    super({ ...TENCENT_CONFIG, ...config });

    this.httpClient = axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://finance.qq.com',
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
        targetSymbols = symbols.map(s => this.toTencentSymbol(s));
      } else {
        // 默认获取沪深主要指数和热门股票
        targetSymbols = this.getDefaultSymbols();
      }

      // 分批获取，每批最多200只
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
    const tencentSymbol = this.toTencentSymbol(symbol);
    const rtUrl = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get`;

    try {
      const response = await this.httpClient.get(rtUrl, {
        params: {
          param: `${tencentSymbol},day,,,${days},qfq`,
        },
      });

      return this.parseKLineResponse(response.data, symbol);
    } catch (error) {
      console.error(`[Tencent] 获取K线数据失败: ${symbol}`, error);
      return [];
    }
  }

  /**
   * 批量获取行情
   */
  private async fetchBatch(symbols: string[]): Promise<RawQuoteData[]> {
    return this.fetchWithRetry(async () => {
      const symbolStr = symbols.join(',');
      const response = await this.httpClient.get(`/q=${symbolStr}`, {
        responseType: 'text',
      });

      return this.parseRawData(response.data);
    });
  }

  /**
   * 解析腾讯行情数据
   */
  parseRawData(raw: string): RawQuoteData[] {
    const quotes: RawQuoteData[] = [];
    const lines = raw.split('\n').filter(line => line.trim());

    for (const line of lines) {
      try {
        const quote = this.parseSingleQuote(line);
        if (quote) {
          quotes.push(quote);
        }
      } catch (error) {
        console.warn('[Tencent] 解析行情行失败:', line, error);
      }
    }

    return quotes;
  }

  /**
   * 解析单行行情数据
   */
  private parseSingleQuote(line: string): RawQuoteData | null {
    // 格式: v_sh600000="1~浦发银行~600000~..."
    const match = line.match(/v_\w+="(.+)"/);
    if (!match) return null;

    const parts = match[1].split('~');
    if (parts.length < 45) return null;

    const rawSymbol = parts[2];
    const market = this.getMarketFromSymbol(rawSymbol);
    if (market === 'UNKNOWN') return null;

    const currentPrice = parseFloat(parts[3]) || 0;
    const prevClose = parseFloat(parts[4]) || 0;
    const change = currentPrice - prevClose;
    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

    return {
      symbol: `${rawSymbol}.${market}`,
      name: parts[1],
      currentPrice,
      openPrice: parseFloat(parts[5]) || 0,
      highPrice: parseFloat(parts[33]) || currentPrice,
      lowPrice: parseFloat(parts[34]) || currentPrice,
      prevClose,
      volume: parseFloat(parts[6]) || 0,
      turnover: parseFloat(parts[37]) || 0,
      change,
      changePercent: parseFloat(parts[32]) || changePercent,
      amplitude: parseFloat(parts[43]) || 0,
      turnoverRate: parseFloat(parts[38]) || 0,
      peRatio: parseFloat(parts[39]) || undefined,
      pbRatio: parseFloat(parts[46]) || undefined,
      marketCap: parseFloat(parts[45]) * 10000 || undefined,
      circulatingMarketCap: parseFloat(parts[44]) * 10000 || undefined,
      bidPrice1: parseFloat(parts[9]) || undefined,
      askPrice1: parseFloat(parts[19]) || undefined,
      bidVolume1: parseFloat(parts[10]) || undefined,
      askVolume1: parseFloat(parts[20]) || undefined,
      timestamp: Date.now(),
      source: 'tencent',
    };
  }

  /**
   * 解析K线数据
   */
  private parseKLineResponse(data: any, symbol: string): RawKLineData[] {
    const result: RawKLineData[] = [];

    try {
      const key = Object.keys(data.data || {}).find(k => k.startsWith('qfq') || k === symbol);
      const klineData = key ? data.data[key] : null;

      if (!klineData?.day) return result;

      for (const item of klineData.day) {
        result.push({
          symbol,
          tradeDate: item[0],
          openPrice: parseFloat(item[1]),
          closePrice: parseFloat(item[2]),
          highPrice: parseFloat(item[3]),
          lowPrice: parseFloat(item[4]),
          volume: parseFloat(item[5]),
          turnover: parseFloat(item[6]) || 0,
        });
      }
    } catch (error) {
      console.error('[Tencent] 解析K线数据失败:', error);
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
   * 获取默认的股票列表
   */
  private getDefaultSymbols(): string[] {
    return [
      'sh000001', // 上证指数
      'sh000300', // 沪深300
      'sh000905', // 中证500
      'sz399001', // 深证成指
      'sz399006', // 创业板指
      'sh600519', // 贵州茅台
      'sz000858', // 五粮液
      'sh601318', // 中国平安
      'sz000002', // 万科A
      'sz000333', // 美的集团
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
