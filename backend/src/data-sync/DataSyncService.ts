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
import { isTradingDay } from '../utils/tradingCalendar';

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
  degraded: boolean;
  consecutiveFailures: number;
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
  /**
   * 上游标注的**真实成交交易日**（YYYY-MM-DD，交易所本地时间），取自腾讯
   * `parts[30]`（形如 `20261008161457`）。
   *
   * 为什么必须用它而不是本地时钟（P0-SMEARED 根因）：休市日/ 停牌日调腾讯实时接口，
   * 返回的是**上一个交易日的收盘快照**，但本地时钟仍是当天。若拿本地时钟当
   * `trade_date`，就会在非交易日凭空造出一行行情（实测2026 国庆 10-04~10-07 各
   * 5541 行，且四天 OHLCV 完全相同 = 同一批数据被复制到多个日历日）。
   * 更糟的是：真实交易日反而可能因采集器停机而缺行，于是「唯一的真实数据」
   * 被挂在了假期日期下——删掉假期行就等于删掉真实行情。
   *
   * 故：日期真源必须是上游的 session 时间戳。
   */
  sessionDate: string;
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
  /** 成交额，单位**元**（上游给万元，此处已换算） */
  turnover: number;
  /** 换手率，单位 %（上游 index 7） */
  turnoverRate: number;
}

/**
 * 把 `YYYY-MM-DD` 构造成**本地正午**的 Date。
 *
 * 为什么不用 `new Date('2026-09-30')`：该写法按 UTC 解析，在负时区会退化成前一天
 * （这正是 tradingCalendar 注释里点名的日期错位来源）。取本地正 noon 则
 * 「日历日」在任何时区下都稳定落在同一天，交给 PG 的 `date` 列也不会偏移。
 *
 * @throws 入参不是合法日历日时抛错（脏数据不该被静默写成邻近日期）
 */
function sessionDateToLocalNoon(dateStr: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) throw new Error(`DataSync: 非法 session 日期 "${dateStr}"，期望 YYYY-MM-DD`);
  const [, y, mo, d] = m;
  const probe = new Date(Number(y), Number(mo) - 1, Number(d), 12, 0, 0, 0);
  if (
    probe.getFullYear() !== Number(y) ||
    probe.getMonth() !== Number(mo) - 1 ||
    probe.getDate() !== Number(d)
  ) {
    throw new Error(`DataSync: session 日期 "${dateStr}" 不是合法日历日`);
  }
  return probe;
}

/**
 * K 线端点候选（按优先级降级，P0-QFQ）。
 *
 * ## 为什么必须是 `newfqkline` 而不是老的 `fqkline`
 * 老 `fqkline` 响应**不含成交额**，而 `daily_quotes.turnover` 是 NOT NULL，
 * 只能写 0 糊过去。`newfqkline` 的 index 8 带成交额（万元），正好补齐该列。
 *
 * ## 实测可达性（2026-10-09，逐个 curl 验证，非推断）
 * - `web.ifzq.gtimg.cn/appstock/app/fqkline/get`（**老路径**）→ **HTTP 501**，
 *   响应体是腾讯 WAF 拦截页 `waf.tencent.com/501page.html`。
 *   注意：501 是**老 fqkline 路径**被拦，**不是** `web.ifzq.gtimg.cn` 整域不可用。
 * - `proxy.finance.qq.com/ifzqgtimg/appstock/app/newfqkline/get` → HTTP 200，连测 3 次稳定。
 * - `web.ifzq.gtimg.cn/appstock/app/newfqkline/get` → HTTP 200，连测 3 次稳定。
 *   （`proxy.finance.qq.com/appstock/...` 不带 `ifzqgtimg` 前缀会404，勿用该路径）
 *
 * 因此主备都取 `newfqkline`，仅 host 不同，用来做互相兜底。
 */
const KLINE_ENDPOINTS = [
  'https://proxy.finance.qq.com/ifzqgtimg/appstock/app/newfqkline/get',
  'https://web.ifzq.gtimg.cn/appstock/app/newfqkline/get',
] as const;

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
    degraded: false,
    consecutiveFailures: 0,
  };

  /** 腾讯API降级：连续失败计数 */
  private tencentFailureCount: number = 0;
  private readonly MAX_CONSECUTIVE_FAILURES: number = 3;
  /** 缓存最近一次成功的行情数据（降级时使用） */
  private cachedQuotes: RawQuoteData[] = [];

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

          // ── P0-SMEARED 守卫：只在真实交易日落库，且用上游 session 日期而非本地时钟 ──
          // 休市日腾讯返回的是「上一交易日收盘快照」，若照写就会在假期凭空造行。
          const sessionDates = [...new Set(quotes.map((x) => x.sessionDate))];
          const tradingSessions = sessionDates.filter((d) => isTradingDay(d));
          if (tradingSessions.length === 0) {
            console.warn(
              `[DataSync] 批次无真实交易日数据（session=${sessionDates.join(',') || '无'}），跳过写入`,
            );
            continue;
          }
          if (sessionDates.length > 1) {
            console.warn(
              `[DataSync] 批次内session 日期不一致（${sessionDates.join(',')}），仅写入交易日 ${tradingSessions[0]}`,
            );
          }
          const sessionDate = tradingSessions[0];
          const quotesToSave = quotes.filter((x) => x.sessionDate === sessionDate);
          const tradeDate = sessionDateToLocalNoon(sessionDate);

          for (const quote of quotesToSave) {
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
                // tradeDate 用上游 session 日期，**不用 new Date()**：
                // 那样会在非交易日把上一交易日快照写成当天的行情（P0-SMEARED 根因）。
                await db.createDailyQuote({
                  stockId: stock.id,
                  tradeDate,
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

      // 前收盘基准：K 线响应按日期升序，`prevClose` = 上一交易日的收盘价。
      // 首行没有前收盘（响应窗口被截断），此时涨跌额无意义 —— 留null，不拿开盘价顶替。
      let prevClose: number | null = null;
      let skippedNonTrading = 0;
      let skippedBadDate = 0;
      let skippedNoPrevClose = 0;

      for (const kline of klineData) {
        try {
          // ── 非交易日守卫：复用 tradingCalendar 唯一真源（P0-5D）──
          // 腾讯在休市日可能返回假期区间的行，直接写库就是 P0-SMEARED 抹布行。
          if (!isTradingDay(kline.tradeDate)) {
            skippedNonTrading++;
            continue;
          }

          let tradeDate: Date;
          try {
            // 复用 syncRealtimeQuotes 路径的同一helper：
            // `new Date('2026-09-30')` 按 UTC 解析，负时区会退化成前一天。
            tradeDate = sessionDateToLocalNoon(kline.tradeDate);
          } catch {
            skippedBadDate++;
            continue;
          }

          const change = prevClose === null ? null : kline.closePrice - prevClose;
          const changePercent =
            change !== null && prevClose !== null && prevClose > 0 ? (change / prevClose) * 100 : null;
          const amplitude =
            kline.openPrice > 0 ? ((kline.highPrice - kline.lowPrice) / kline.openPrice) * 100 : null;

          if (change === null) {
            // 首行无前收盘：仍写入 OHLCV，但涨跌口径留 NULL，不编造
            skippedNoPrevClose++;
          }

          await db.createDailyQuote({
            stockId: stock.id,
            tradeDate,
            openPrice: kline.openPrice,
            closePrice: kline.closePrice,
            highPrice: kline.highPrice,
            lowPrice: kline.lowPrice,
            volume: kline.volume,
            turnover: kline.turnover,
            change: change === null ? null : parseFloat(change.toFixed(4)),
            changePercent: changePercent === null ? null : parseFloat(changePercent.toFixed(4)),
            amplitude: amplitude === null ? null : parseFloat(amplitude.toFixed(4)),
            turnoverRate: kline.turnoverRate,
            // K 线不含市值/估值：留NULL，绝不编造
            marketCap: null,
            peRatio: null,
            pbRatio: null,
          });

          prevClose = kline.closePrice;
          result.quotesSaved++;
        } catch (error) {
          // 忽略重复数据错误
          if (!(error as Error).message?.includes('duplicate')) {
            result.errors.push(`保存K线失败: ${(error as Error).message}`);
          }
        }
      }

      if (skippedNonTrading > 0) {
        const msg = `跳过 ${skippedNonTrading} 行非交易日数据（交易日历判定）`;
        result.errors.push(msg);
        console.warn(`[DataSync] ${symbol} ${msg}`);
      }
      if (skippedBadDate > 0) {
        result.errors.push(`跳过 ${skippedBadDate} 行非法日期数据`);
      }
      if (skippedNoPrevClose > 0) {
        console.warn(
          `[DataSync] ${symbol} ${skippedNoPrevClose} 行缺少前收盘基准（响应窗口首行），涨跌额/幅留 NULL`,
        );
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

  /**
   * 获取降级状态
   */
  getDegradationStatus(): { degraded: boolean; consecutiveFailures: number; cacheAvailable: boolean } {
    return {
      degraded: this.syncState.degraded,
      consecutiveFailures: this.tencentFailureCount,
      cacheAvailable: this.cachedQuotes.length > 0,
    };
  }

  /**
   * 手动清除降级标记（用于运维恢复）
   */
  clearDegradation(): void {
    this.syncState.degraded = false;
    this.tencentFailureCount = 0;
    this.syncState.consecutiveFailures = 0;
    console.log('[DataSync] 降级标记已清除，恢复API调用');
  }

  // ==================== 私有方法 ====================

  /**
   * 从腾讯API获取实时行情
   */
  private async fetchTencentQuotes(symbols: string[]): Promise<RawQuoteData[]> {
    // 降级模式：使用缓存数据
    if (this.syncState.degraded) {
      console.warn(`[DataSync] 腾讯API降级中，使用缓存数据 (${this.cachedQuotes.length} 条)`);
      // 过滤出请求的 symbols
      const symbolSet = new Set(symbols.map(s => s.toLowerCase()));
      return this.cachedQuotes.filter(q => symbolSet.has(q.symbol.toLowerCase()));
    }

    const symbolStr = symbols.join(',');
    const url = `https://qt.gtimg.cn/q=${symbolStr}`;

    try {
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
      const quotes = this.parseTencentResponse(rawText);

      // 成功：重置失败计数，缓存数据，清除降级标记
      this.tencentFailureCount = 0;
      if (quotes.length > 0) {
        this.cachedQuotes = quotes;
      }
      if (this.syncState.degraded) {
        console.log('[DataSync] 腾讯API恢复，退出降级模式');
        this.syncState.degraded = false;
        this.syncState.consecutiveFailures = 0;
      }

      return quotes;
    } catch (error) {
      this.tencentFailureCount++;
      this.syncState.consecutiveFailures = this.tencentFailureCount;

      console.error(
        `[DataSync] 腾讯API请求失败 (${this.tencentFailureCount}/${this.MAX_CONSECUTIVE_FAILURES}):`,
        (error as Error).message
      );

      // 连续失败达到阈值：自动降级
      if (this.tencentFailureCount >= this.MAX_CONSECUTIVE_FAILURES) {
        console.error('[DataSync] 腾讯API连续失败3次，自动降级到缓存模式');
        this.syncState.degraded = true;
      }

      // 有缓存数据则返回缓存
      if (this.cachedQuotes.length > 0) {
        console.warn(`[DataSync] 降级使用缓存数据 (${this.cachedQuotes.length} 条)`);
        const symbolSet = new Set(symbols.map(s => s.toLowerCase()));
        return this.cachedQuotes.filter(q => symbolSet.has(q.symbol.toLowerCase()));
      }

      throw error; // 无缓存数据，抛出错误
    }
  }

  /**
   * 从腾讯API获取K线数据（**不复权**口径）
   *
   * ## 口径：为什么不复权（P0-QFQ 根因）
   * 本库 `daily_quotes` 存的是**不复权价**（实测 601390.SH 2026-09-24 收 4.25、
   * 2026-09-30 收 4.33，与腾讯 newfqkline 不复权一致；库内**无一行**等于前复权值）。
   * 而旧实现请求 `...,qfq`（前复权）——除权除息日之前的整段历史都会被写成前复权价，
   * 与库内既有口径不一致，导致同一只股票的历史序列在除权日「跳变」、收益率算错。
   * 故此处 `fq` 位**留空**（腾讯约定：空 = 不复权）。
   *
   * ## 端点降级
   * 逐个尝试 {@link KLINE_ENDPOINTS}，任一成功即返回；WAF 拦截页（HTML/501）
   * 同样视为该端点失败继续降级。全部失败才抛错——**绝不返回空数组冒充成功**。
   */
  private async fetchTencentKLine(symbol: string, days: number): Promise<RawKLineData[]> {
    const tencentSymbol = this.toTencentSymbol(symbol);
    // 末位 fq 留空 = 不复权（切勿填 qfq/hfq，否则与本库口径冲突）
    const param = `${tencentSymbol},day,,,${days},`;

    const failures: string[] = [];

    for (const url of KLINE_ENDPOINTS) {
      try {
        const response = await axios.get(url, {
          params: { param },
          timeout: 15000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://finance.qq.com',
          },
        });

        // 腾讯 WAF 拦截会返回 HTTP 200 + HTML 页面（实测老 fqkline 路径为 501 + HTML）。
        // 若不识别，`parseKLineResponse` 会静默返回空数组 → 上层误判「同步成功但0 条」。
        const body = response?.data;
        if (typeof body === 'string' || body?.code !== 0) {
          throw new Error(
            `响应非预期 code=${body?.code} data=${typeof body === 'string' ? body.slice(0, 80) : 'object'}`,
          );
        }

        const parsed = this.parseKLineResponse(body, symbol);
        if (parsed.length === 0) {
          throw new Error('解析后0 行（响应结构异常或该窗口无数据）');
        }
        return parsed;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        failures.push(`${new URL(url).host}: ${msg}`);
        console.warn(`[DataSync] K线端点失败，降级重试 (${new URL(url).host}): ${msg}`);
      }
    }

    throw new Error(`K线全部端点失败: ${failures.join(' | ')}`);
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
        /**
         * 匹配时**捕获响应 key**（如 `sh000001`），因为它是上游给出的、
         * 唯一无歧义的交易所归属信息。
         *
         * 为什么必须用它（P0-IDXBLEED）：`parts[2]` 只有 6 位数字代码，而
         * **指数与个股共用数字代码**——`sh000001`(上证指数) 与
         * `sz000001`(平安银行) 的 parts[2] 都是 '000001'。若再按数字前缀反推
         * 交易所，`000001` 以 `0` 开头会被判成 SZ，于是**上证指数点位被写进
         * 「000001.SZ 平安银行」那一行**。
         * 实测：平安银行曾出现 close=4068.57，恰为上证指数同日收盘点位。
         */
        const match = line.match(/v_(\w+)="(.+)"/);
        if (!match) continue;

        const respSymbol = match[1];
        const parts = match[2].split('~');
        if (parts.length < 45) continue;

        rawSymbol = parts[2];
        // 交易所归属优先取响应 key 前缀（sh/sz/bj），仅当 key 无前缀时才退回数字推断
        const market = this.marketFromResponseKey(respSymbol) ?? this.getMarketFromSymbol(rawSymbol);
        if (market === 'UNKNOWN') continue;

        const v = (idx: number) => { const x = parseFloat(parts[idx]); return Number.isFinite(x) ? x : 0; };

        /**
         * 解析上游标注的真实成交交易日（`parts[30]`，形如 `20261008161457`）。
         *
         * 该字段是**交易所本地时间**，无需再做时区换算（末尾 6 位是时分秒）。
         * 解析失败返回 null —— 调用方必须据此跳过写库，绝不允许退回本地时钟。
         */
        const rawSession = parts[30] ?? '';
        const m = /^(\d{4})(\d{2})(\d{2})\d{6}$/.exec(rawSession.trim());
        const sessionDate = m ? `${m[1]}-${m[2]}-${m[3]}` : null;

        // 上游没给 session 时间戳 → 无法确证这批数据属于哪个交易日。
        // 此时若仍按本地时钟写库，就会重新制造 P0-SMEARED 抹布行，故直接跳过。
        if (sessionDate === null) {
          console.warn(
            `[DataSync] ${rawSymbol} 上游未返回可解析的 session 时间戳（parts[30]=${JSON.stringify(rawSession)}），` +
              '跳过写入以免把非交易日数据写成行情',
          );
          continue;
        }

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
          sessionDate,
          source: 'tencent',
        });
      } catch (error) {
        console.warn(`[DataSync] 行情解析失败: ${rawSymbol || 'unknown'}`, error instanceof Error ? error.message : error);
      }
    }

    return quotes;
  }

  /**
   * 解析K线响应（腾讯 `newfqkline`）
   *
   * ## 日期真源（P0-QFQ）
   * 是响应数组的 **`item[0]`**（形如 `"2026-09-30"`），它本来就是上游给的真实交易日。
   *
   * **不要用 `parts[30]`** —— 那是腾讯**实时行情**接口（`qt` 行情串）的字段，
   * K 线响应里根本没有这回事。它只在 {@link parseTencentResponse} 里成立。
   *
   * 非法日期（脏数据/结构变化）一律**丢弃该行**，绝不退回本地时钟。
   *
   * ## 字段下标（实测 newfqkline，勿凭记忆改动）
   * ```
   * 0=日期  1=开  2=收  3=高  4=低  5=成交量(手)
   * 6=除权信息**对象**（除权日才有内容，其余为 {}）← 不是数字，别喂parseFloat
   * 7=换手率%   8=成交额(万元)
   * ```
   * 旧实现把 index 6喂给 `parseFloat` → NaN → 成交额恒为 0（P0-QFQ 附带缺陷）。
   */
  private parseKLineResponse(data: any, symbol: string): RawKLineData[] {
    const result: RawKLineData[] = [];

    try {
      //响应 key 用腾讯原样给的带市场前缀形式（`sh601390`）。刻意**不**查 `qfq${symbol}`：
      // 那是前复权响应的 key，本库存不复权，查它等于把两种口径混在一起（正是 P0-QFQ 根因）。
      const stockData =
        data?.data?.[symbol] ||
        data?.data?.[`sh${symbol.slice(0, 6)}`] ||
        data?.data?.[`sz${symbol.slice(0, 6)}`] ||
        data?.data?.[`bj${symbol.slice(0, 6)}`];
      // 只认不复权的 `day`。**刻意不接受 `qfqday`**：
      // 上游一旦返回前复权（key 为 qfqday），宁可当解析失败降级到别的口径，也不静默混库。
      const dayData = stockData?.day;

      if (!dayData) return result;

      for (const item of dayData) {
        if (!Array.isArray(item) || item.length < 5) continue;

        const tradeDate = typeof item[0] === 'string' ? item[0].trim() : '';
        // 复用 sessionDateToLocalNoon 做校验：它同时检查格式与「是否真实存在的日历日」，
        // 故 `2026-13-45` 这类能过正则但非法的日期也会被拒。校验不过即丢弃，**不退回本地时钟**。
        try {
          sessionDateToLocalNoon(tradeDate);
        } catch {
          console.warn(
            `[DataSync] ${symbol} K线行日期非法（item[0]=${JSON.stringify(item[0])}），丢弃该行`,
          );
          continue;
        }

        const k = (idx: number): number => {
          const v = parseFloat(item[idx]);
          return Number.isFinite(v) ? v : 0;
        };

        // 成交额单位：上游万元 → 本库元（daily_quotes.turnover 与实时行情路径同口径）
        const turnoverWan = k(8);

        result.push({
          symbol,
          tradeDate,
          openPrice: k(1),
          closePrice: k(2),
          highPrice: k(3),
          lowPrice: k(4),
          volume: k(5),
          turnover: turnoverWan * 10000,
          turnoverRate: k(7),
        });
      }
    } catch (error) {
      console.error(`[DataSync] 解析K线数据失败: ${symbol}`, error);
    }

    return result;
  }

  /**
   * 转换为腾讯格式的股票代码
   */
  /**
   * 从腾讯响应的 key 提取交易所（`sh000001` → `SH`）。
   *
   * 这是**唯一无歧义**的交易所来源：数字代码本身无法区分交易所
   * （`000001` 既是上证指数代码、也是平安银行代码），而 key 前缀由上游明确给出。
   *
   * @returns `SH` / `SZ` / `BJ`；key 无交易所前缀时返回 null（交由调用方退回数字推断）
   */
  private marketFromResponseKey(respSymbol: string): string | null {
    const m = /^(sh|sz|bj)/i.exec(respSymbol.trim());
    if (!m) return null;
    return m[1].toUpperCase();
  }

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
  /**
   * 行情同步兜底符号表（仅在内存库股票数 < 100 时启用）
   * 含主要指数（sh/sz 开头）+ 蓝筹，用于拉取行情；不写入 stocks 表。
   * 抽为命名常量，避免在方法体内散落魔法数组。
   */
  private static readonly DEFAULT_FALLBACK_SYMBOLS: string[] = [
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

    return DataSyncService.DEFAULT_FALLBACK_SYMBOLS;
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
