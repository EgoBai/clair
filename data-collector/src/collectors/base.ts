/**
 * 采集器基类
 * 定义数据采集器的通用接口和行为
 */

export interface RawQuoteData {
  symbol: string;            // 股票代码
  name: string;              // 股票名称
  currentPrice: number;      // 当前价
  openPrice: number;         // 开盘价
  highPrice: number;         // 最高价
  lowPrice: number;          // 最低价
  prevClose: number;         // 昨收价
  volume: number;            // 成交量
  turnover: number;          // 成交额
  change: number;            // 涨跌额
  changePercent: number;     // 涨跌幅
  amplitude: number;         // 振幅
  turnoverRate: number;      // 换手率
  peRatio?: number;          // 市盈率
  pbRatio?: number;          // 市净率
  marketCap?: number;        // 总市值
  circulatingMarketCap?: number; // 流通市值
  bidPrice1?: number;        // 买一价
  askPrice1?: number;        // 卖一价
  bidVolume1?: number;       // 买一量
  askVolume1?: number;       // 卖一量
  timestamp: number;         // 时间戳
  source: string;            // 数据源
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

export interface CollectorConfig {
  name: string;
  baseUrl: string;
  timeout: number;
  retryCount: number;
  retryDelay: number;
  requestInterval: number;
}

export interface CollectorResult {
  success: boolean;
  data: RawQuoteData[];
  errors: string[];
  timestamp: Date;
  source: string;
  count: number;
}

/**
 * 数据采集器基类
 * 所有数据源的采集器都应继承此类
 */
export abstract class BaseCollector {
  protected config: CollectorConfig;
  protected isRunning: boolean = false;
  protected lastRunTime: Date | null = null;

  constructor(config: CollectorConfig) {
    this.config = config;
  }

  /**
   * 获取采集器名称
   */
  getName(): string {
    return this.config.name;
  }

  /**
   * 获取采集器是否正在运行
   */
  getIsRunning(): boolean {
    return this.isRunning;
  }

  /**
   * 获取上次运行时间
   */
  getLastRunTime(): Date | null {
    return this.lastRunTime;
  }

  /**
   * 获取实时行情数据
   * @param symbols 股票代码列表，为空则获取全部
   */
  abstract fetchRealtimeQuotes(symbols?: string[]): Promise<CollectorResult>;

  /**
   * 获取K线数据
   * @param symbol 股票代码
   * @param days 获取天数
   */
  abstract fetchKLineData(symbol: string, days?: number): Promise<RawKLineData[]>;

  /**
   * 解析原始数据为标准格式
   */
  abstract parseRawData(raw: string): RawQuoteData[];

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.fetchRealtimeQuotes();
      return result.success;
    } catch {
      return false;
    }
  }

  /**
   * 延迟函数
   */
  protected async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 带重试的请求
   */
  protected async fetchWithRetry<T>(
    fetchFn: () => Promise<T>,
    retries: number = this.config.retryCount
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await fetchFn();
      } catch (error) {
        lastError = error as Error;
        console.warn(`[${this.config.name}] 第 ${attempt + 1} 次尝试失败:`, error);

        if (attempt < retries) {
          await this.delay(this.config.retryDelay * (attempt + 1));
        }
      }
    }

    throw lastError || new Error('Request failed after retries');
  }

  /**
   * 获取A股市场标识
   */
  protected getMarketFromSymbol(symbol: string): string {
    if (symbol.startsWith('6') || symbol.startsWith('9')) return 'SH';
    if (symbol.startsWith('0') || symbol.startsWith('3')) return 'SZ';
    if (symbol.startsWith('8') || symbol.startsWith('4')) return 'BJ';
    return 'UNKNOWN';
  }

  /**
   * 格式化股票代码为完整格式
   */
  protected formatSymbol(code: string): string {
    const market = this.getMarketFromSymbol(code);
    return `${code}.${market}`;
  }
}
