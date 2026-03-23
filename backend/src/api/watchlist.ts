/**
 * 自选股 API
 * 提供用户自选股的增删改查功能
 */

import { Request, Response, Router } from 'express';
import { db } from '../db/Database';

const router = Router();

// 简化版：使用内存存储自选股（实际应用中应使用数据库）
// 在实际项目中，应该关联 user_id 从 JWT token 获取
interface WatchlistItem {
  stockId: number;
  symbol: string;
  name: string;
  addedAt: Date;
  notes?: string;
}

// 使用数据库表 user_watchlist
// 假设 user_id = 1 作为默认用户（实际应从认证中间件获取）

/**
 * 获取自选股列表
 * GET /api/watchlist
 */
router.get('/watchlist', async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.query.userId as string) || 1;
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 50;

    // 从数据库查询自选股
    const watchlist = await db.connection('user_watchlist as w')
      .join('stocks as s', 'w.stock_id', 's.id')
      .leftJoin('daily_quotes as dq', function() {
        this.on('s.id', '=', 'dq.stock_id')
          .andOn('dq.trade_date', '=', db.connection.raw(
            '(SELECT MAX(trade_date) FROM daily_quotes WHERE stock_id = s.id)'
          ));
      })
      .where('w.user_id', userId)
      .select(
        's.id',
        's.symbol',
        's.name',
        's.market',
        's.industry',
        'w.added_at',
        'w.notes',
        'dq.close_price as closePrice',
        'dq.change_percent as changePercent',
        'dq.volume',
        'dq.turnover',
        'dq.market_cap as marketCap'
      )
      .orderBy('w.added_at', 'desc')
      .offset((page - 1) * pageSize)
      .limit(pageSize);

    const countResult = await db.connection('user_watchlist')
      .where('user_id', userId)
      .count('id as count')
      .first();

    const totalCount = Number(countResult?.count || 0);

    res.json({
      success: true,
      data: {
        watchlist,
        pagination: {
          page,
          pageSize,
          totalCount,
          totalPages: Math.ceil(totalCount / pageSize),
        },
      },
    });
  } catch (error) {
    console.error('获取自选股列表失败:', error);

    // 如果表不存在，返回空列表
    if ((error as Error).message?.includes('does not exist')) {
      return res.json({
        success: true,
        data: {
          watchlist: [],
          pagination: { page: 1, pageSize: 50, totalCount: 0, totalPages: 0 },
        },
      });
    }

    res.status(500).json({
      success: false,
      error: '获取自选股列表失败',
      details: error instanceof Error ? error.message : '未知错误',
    });
  }
});

/**
 * 添加自选股
 * POST /api/watchlist
 */
router.post('/watchlist', async (req: Request, res: Response) => {
  try {
    const { symbol, notes } = req.body;
    const userId = parseInt(req.body.userId as string) || 1;

    if (!symbol) {
      return res.status(400).json({ success: false, error: '需要提供股票代码' });
    }

    // 查找股票
    const stock = await db.getStockBySymbol(symbol);
    if (!stock) {
      return res.status(404).json({ success: false, error: '股票不存在' });
    }

    // 检查是否已添加
    const existing = await db.connection('user_watchlist')
      .where('user_id', userId)
      .where('stock_id', stock.id)
      .first();

    if (existing) {
      return res.status(409).json({ success: false, error: '该股票已在自选列表中' });
    }

    // 添加自选股
    await db.connection('user_watchlist').insert({
      user_id: userId,
      stock_id: stock.id,
      notes: notes || null,
      added_at: new Date(),
    });

    res.status(201).json({
      success: true,
      data: {
        stockId: stock.id,
        symbol: stock.symbol,
        name: stock.name,
        addedAt: new Date(),
        notes,
      },
      message: '已添加到自选股',
    });
  } catch (error) {
    console.error('添加自选股失败:', error);

    if ((error as Error).message?.includes('does not exist')) {
      return res.status(500).json({
        success: false,
        error: '自选股功能需要先初始化数据库表',
      });
    }

    res.status(500).json({
      success: false,
      error: '添加自选股失败',
      details: error instanceof Error ? error.message : '未知错误',
    });
  }
});

/**
 * 删除自选股
 * DELETE /api/watchlist/:symbol
 */
router.delete('/watchlist/:symbol', async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const userId = parseInt(req.query.userId as string) || 1;

    const stock = await db.getStockBySymbol(symbol);
    if (!stock) {
      return res.status(404).json({ success: false, error: '股票不存在' });
    }

    const deleted = await db.connection('user_watchlist')
      .where('user_id', userId)
      .where('stock_id', stock.id)
      .delete();

    if (deleted === 0) {
      return res.status(404).json({ success: false, error: '该股票不在自选列表中' });
    }

    res.json({
      success: true,
      message: '已从自选股移除',
    });
  } catch (error) {
    console.error('删除自选股失败:', error);
    res.status(500).json({
      success: false,
      error: '删除自选股失败',
      details: error instanceof Error ? error.message : '未知错误',
    });
  }
});

/**
 * 更新自选股备注
 * PATCH /api/watchlist/:symbol
 */
router.patch('/watchlist/:symbol', async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const { notes } = req.body;
    const userId = parseInt(req.body.userId as string) || 1;

    const stock = await db.getStockBySymbol(symbol);
    if (!stock) {
      return res.status(404).json({ success: false, error: '股票不存在' });
    }

    const updated = await db.connection('user_watchlist')
      .where('user_id', userId)
      .where('stock_id', stock.id)
      .update({ notes });

    if (updated === 0) {
      return res.status(404).json({ success: false, error: '该股票不在自选列表中' });
    }

    res.json({
      success: true,
      message: '备注已更新',
    });
  } catch (error) {
    console.error('更新自选股备注失败:', error);
    res.status(500).json({
      success: false,
      error: '更新自选股备注失败',
      details: error instanceof Error ? error.message : '未知错误',
    });
  }
});

export default router;
