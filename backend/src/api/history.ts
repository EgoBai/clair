/**
 * 历史数据回补API
 * 用于批量回补股票的K线历史数据
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../utils/apiResponse';
import { dataSyncService } from '../data-sync/DataSyncService';
import { db, isMemoryMode, getDb } from '../db/dbFactory';
import { InMemoryDatabase } from '../db/InMemoryDatabase';

const router = Router();

/**
 * 诚实数据契约发送器（本文件统一出口）：顶层 dataSource 与 data 内同源。
 *
 * 本文件是**运维/回补端点**，数据来自本地真实行情库（stocks / daily_quotes）。
 * 回补结果如实反映：success/failed 均为真实执行结果，无任何编造成分。
 */
function sendHonest(
  res: Response,
  dataSource: 'real' | 'unavailable',
  data: Record<string, unknown>
): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(200).json({
    success: true,
    dataSource,
    data: { ...data, dataSource },
    timestamp: new Date().toISOString(),
  });
}

/**
 * POST /api/history/backfill
 * 批量回补历史数据
 */
router.post('/history/backfill', asyncHandler(async (req: Request, res: Response) => {
  const days = parseInt(req.query.days as string) || 120;
  const limit = parseInt(req.query.limit as string) || 100;
  const offset = parseInt(req.query.offset as string) || 0;

  // 获取需要回补的股票列表
  const stocks = await db.getStocks({ 
    page: Math.floor(offset / limit) + 1, 
    pageSize: limit,
    sortBy: 'symbol',
    sortOrder: 'asc'
  });

  // 诚实空态：真实股票库无任何股票 → 无标的可回补，
  // 不用 processed:0 冒充「已回补但今天没有数据」。
  if (stocks.length === 0) {
    return sendHonest(res, 'unavailable', {
      message: '本地真实股票库无任何股票，无标的可回补',
      processed: 0,
      total: 0,
    });
  }

  const results = {
    processed: 0,
    success: 0,
    failed: 0,
    totalQuotes: 0,
    errors: [] as string[]
  };

  // 逐个股票回补历史数据
  for (const stock of stocks) {
    try {
      const result = await dataSyncService.syncKLineData(stock.symbol, days);
      results.processed++;
      
      if (result.success) {
        results.success++;
        results.totalQuotes += result.quotesSaved;
      } else {
        results.failed++;
        results.errors.push(...result.errors);
      }

      // 每处理10个股票输出一次进度
      if (results.processed % 10 === 0) {
        console.log(`[HistoryBackfill] 进度: ${results.processed}/${stocks.length}`);
      }

      // 延迟100ms避免API限流
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      results.processed++;
      results.failed++;
      results.errors.push(`${stock.symbol}: ${(error as Error).message}`);
    }
  }

  // results 是真实执行结果（success/failed/errors 均为实际计数），
  // 但若全部失败则说明一个上游都没通，不能算「回补成功」。
  const dataSource = results.success > 0 ? 'real' : 'unavailable';
  sendHonest(res, dataSource, {
    message: results.success > 0
      ? '历史数据回补完成'
      : '全部标的回补失败（上游数据源不可达），未写入任何历史行情',
    ...results,
    total: stocks.length,
  });
}));

/**
 * GET /api/history/status
 * 获取历史数据状态
 */
router.get('/history/status', asyncHandler(async (_req: Request, res: Response) => {
  const totalStocks = (await db.getStockCount({})).valueOf();
  
  // 获取有历史数据的股票数
  let stocks_with_history = 0;
  let total_records = 0;
  
  if (isMemoryMode()) {
    // 内存模式：从quotes map统计
    const memDb = getDb() as unknown as InMemoryDatabase;
    const quotesMap = (memDb as any).quotes as Map<string, any[]>;
    stocks_with_history = quotesMap.size;
    quotesMap.forEach((quotes) => { total_records += quotes.length; });
  } else {
    // PostgreSQL模式：直接查询
    try {
      const knex = (db as any).connection;
      const result = await knex('daily_quotes')
        .countDistinct('stock_id as stocks_with_history')
        .count('* as total_records')
        .first();
      stocks_with_history = Number(result?.stocks_with_history || 0);
      total_records = Number(result?.total_records || 0);
    } catch (e) {
      console.warn('[History] 查询历史数据统计失败:', (e as Error).message);
    }
  }

  // 诚实空态：库内一行行情都没有 → 不用 0% 覆盖率冒充「真实覆盖率为 0」
  const dataSource = total_records > 0 ? 'real' : 'unavailable';
  sendHonest(res, dataSource, {
    totalStocks,
    stocks_with_history,
    total_records,
    coverage: totalStocks > 0
      ? Math.round((stocks_with_history / totalStocks) * 100)
      : 0,
    ...(total_records > 0 ? {} : { message: '本地真实行情库无任何日线记录，覆盖率 0% 不代表真实覆盖情况' }),
  });
}));

export default router;
