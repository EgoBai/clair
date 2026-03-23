/**
 * 数据采集服务入口
 * 调度数据采集任务，处理并写入数据库
 */

import dotenv from 'dotenv';
import knex, { Knex } from 'knex';
import winston from 'winston';
import cron from 'node-cron';
import { TencentCollector } from './collectors/tencent';
import { SinaCollector } from './collectors/sina';
import { QuoteProcessor, ProcessedQuote } from './processors/quote-processor';

// 加载环境变量
dotenv.config();

// 配置日志
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
      return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/collector.log' }),
  ],
});

// 数据库配置
const dbConfig: Knex.Config = {
  client: 'pg',
  connection: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_NAME || 'a_stock',
  },
  pool: { min: 2, max: 10 },
};

// 采集服务
class DataCollectorService {
  private db: Knex;
  private tencent: TencentCollector;
  private sina: SinaCollector;
  private processor: QuoteProcessor;
  private isRunning: boolean = false;

  constructor() {
    this.db = knex(dbConfig);
    this.tencent = new TencentCollector();
    this.sina = new SinaCollector();
    this.processor = new QuoteProcessor();
  }

  /**
   * 启动服务
   */
  async start(): Promise<void> {
    logger.info('=== A股数据采集服务启动 ===');

    // 测试数据库连接
    try {
      await this.db.raw('SELECT 1');
      logger.info('数据库连接成功');
    } catch (error) {
      logger.error('数据库连接失败', error);
      process.exit(1);
    }

    // 执行一次初始采集
    await this.collectAll();

    // 定时任务：交易时间内每5分钟采集一次
    // A股交易时间: 9:30-11:30, 13:00-15:00
    cron.schedule('*/5 9-15 * * 1-5', async () => {
      const hour = new Date().getHours();
      const minute = new Date().getMinutes();

      // 上午 9:30-11:30 和下午 13:00-15:00
      if (
        (hour === 9 && minute >= 30) ||
        (hour === 10) ||
        (hour === 11 && minute <= 30) ||
        (hour === 13) ||
        (hour === 14) ||
        (hour === 15 && minute === 0)
      ) {
        logger.info('定时任务触发 - 交易时段数据采集');
        await this.collectAll();
      }
    });

    // 每天15:30采集日线数据
    cron.schedule('30 15 * * 1-5', async () => {
      logger.info('定时任务触发 - 日线数据采集');
      await this.collectDailyData();
    });

    logger.info('定时任务已注册，等待触发...');
  }

  /**
   * 采集所有数据
   */
  async collectAll(): Promise<void> {
    if (this.isRunning) {
      logger.warn('采集任务正在运行，跳过本次采集');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      logger.info('开始采集实时行情数据...');

      // 并行采集
      const [tencentResult, sinaResult] = await Promise.all([
        this.tencent.fetchRealtimeQuotes(),
        this.sina.fetchRealtimeQuotes(),
      ]);

      logger.info(`腾讯采集: ${tencentResult.count}条, 新浪采集: ${sinaResult.count}条`);

      // 合并处理
      const processed = this.processor.mergeQuotes(
        tencentResult.data,
        sinaResult.data
      );

      // 写入数据库
      if (processed.length > 0) {
        await this.saveQuotes(processed);
        logger.info(`保存 ${processed.length} 条行情数据`);
      }

      const elapsed = Date.now() - startTime;
      logger.info(`采集完成，耗时 ${elapsed}ms`);
    } catch (error) {
      logger.error('采集失败', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * 采集日线数据
   */
  async collectDailyData(): Promise<void> {
    logger.info('开始采集日线数据...');

    try {
      // 获取活跃股票列表
      const stocks = await this.db('stocks')
        .where('is_active', true)
        .select('symbol');

      for (const stock of stocks) {
        try {
          const klineData = await this.tencent.fetchKLineData(stock.symbol, 1);
          if (klineData.length > 0) {
            const processed = this.processor.processKLineData(klineData);
            await this.saveQuotes(processed);
          }
        } catch (error) {
          logger.error(`日线采集失败: ${stock.symbol}`, error);
        }
      }

      logger.info('日线数据采集完成');
    } catch (error) {
      logger.error('日线数据采集失败', error);
    }
  }

  /**
   * 保存行情数据到数据库
   */
  private async saveQuotes(quotes: ProcessedQuote[]): Promise<void> {
    for (const quote of quotes) {
      try {
        // 获取或创建股票记录
        let stock = await this.db('stocks')
          .where('symbol', quote.symbol)
          .first();

        if (!stock) {
          const [newStock] = await this.db('stocks')
            .insert({
              symbol: quote.symbol,
              name: quote.name,
              market: quote.market,
              is_active: true,
              created_at: new Date(),
              updated_at: new Date(),
            })
            .returning('*');
          stock = newStock;
        }

        // 更新股票信息
        if (stock.name !== quote.name) {
          await this.db('stocks')
            .where('id', stock.id)
            .update({ name: quote.name, updated_at: new Date() });
        }

        // 插入或更新日行情
        await this.db('daily_quotes')
          .insert({
            stock_id: stock.id,
            trade_date: quote.tradeDate,
            open_price: quote.openPrice,
            close_price: quote.closePrice,
            high_price: quote.highPrice,
            low_price: quote.lowPrice,
            volume: quote.volume,
            turnover: quote.turnover,
            change: quote.change,
            change_percent: quote.changePercent,
            amplitude: quote.amplitude,
            turnover_rate: quote.turnoverRate,
            pe_ratio: quote.peRatio,
            pb_ratio: quote.pbRatio,
            market_cap: quote.marketCap,
            circulating_market_cap: quote.circulatingMarketCap,
            created_at: new Date(),
            updated_at: new Date(),
          })
          .onConflict(['stock_id', 'trade_date'])
          .merge({
            open_price: quote.openPrice,
            close_price: quote.closePrice,
            high_price: quote.highPrice,
            low_price: quote.lowPrice,
            volume: quote.volume,
            turnover: quote.turnover,
            change: quote.change,
            change_percent: quote.changePercent,
            amplitude: quote.amplitude,
            turnover_rate: quote.turnoverRate,
            pe_ratio: quote.peRatio,
            pb_ratio: quote.pbRatio,
            market_cap: quote.marketCap,
            circulating_market_cap: quote.circulatingMarketCap,
            updated_at: new Date(),
          });
      } catch (error) {
        logger.error(`保存行情失败: ${quote.symbol}`, error);
      }
    }
  }

  /**
   * 停止服务
   */
  async stop(): Promise<void> {
    logger.info('正在停止数据采集服务...');
    await this.db.destroy();
    logger.info('服务已停止');
  }
}

// 启动服务
async function main(): Promise<void> {
  const service = new DataCollectorService();

  // 优雅退出
  const shutdown = async () => {
    logger.info('收到退出信号');
    await service.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await service.start();
}

main().catch(error => {
  logger.error('服务启动失败', error);
  process.exit(1);
});

export { DataCollectorService };
