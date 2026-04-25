/**
 * 增强自选股 API
 * 支持分组管理、拖拽排序、批量操作
 */

import { Router } from 'express';
import { db } from '../db/dbFactory';
import { validateQuery, validateBody, validateParams, schemas } from '../middleware/validation';
import { asyncHandler, sendSuccess, sendNotFound } from '../utils/apiResponse';

const router = Router();

/**
 * 获取自选股列表（含分组）
 * GET /api/watchlist
 */
router.get('/watchlist', validateQuery(schemas.watchlistQuery), async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.query.userId as string) || 1;
    const groupId = req.query.groupId as string;

    let query = db.connection('user_watchlist as w')
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
        'w.added_at as addedAt',
        'w.notes',
        'w.group_id as groupId',
        'w.sort_index as sortIndex',
        'dq.close_price as closePrice',
        'dq.change_percent as changePercent',
        'dq.volume',
        'dq.turnover',
        'dq.market_cap as marketCap'
      );

    if (groupId) {
      query = query.where('w.group_id', groupId);
    }

    const watchlist = await query.orderBy('w.sort_index', 'asc').orderBy('w.added_at', 'desc');

    // 获取分组信息
    const groups = await db.connection('watchlist_groups')
      .where('user_id', userId)
      .select('id', 'name', 'sort_index as sortIndex')
      .orderBy('sort_index', 'asc')
      .catch(() => []);

    res.json({
      success: true,
      data: {
        watchlist,
        groups: groups.length > 0 ? groups : [{ id: 'default', name: '默认分组', sortIndex: 0 }],
      },
    });
  } catch (error) {
    console.error('获取自选股列表失败:', error);
    if ((error as Error).message?.includes('does not exist')) {
      return res.json({
        success: true,
        data: { watchlist: [], groups: [{ id: 'default', name: '默认分组', sortIndex: 0 }] },
      });
    }
    res.status(500).json({ success: false, error: '获取自选股列表失败' });
  }
});

/**
 * 添加自选股
 * POST /api/watchlist
 */
router.post('/watchlist', validateBody(schemas.watchlistAdd), async (req: Request, res: Response) => {
  try {
    const { symbol, notes, groupId = 'default' } = req.body;
    const userId = parseInt(req.body.userId as string) || 1;

    if (!symbol) {
      return res.status(400).json({ success: false, error: '需要提供股票代码' });
    }

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

    // 获取当前最大排序索引
    const maxSort = await db.connection('user_watchlist')
      .where('user_id', userId)
      .where('group_id', groupId)
      .max('sort_index as maxSort')
      .first();

    await db.connection('user_watchlist').insert({
      user_id: userId,
      stock_id: stock.id,
      group_id: groupId,
      sort_index: (maxSort?.maxSort || 0) + 1,
      notes: notes || null,
      added_at: new Date(),
    });

    res.status(201).json({
      success: true,
      data: { stockId: stock.id, symbol: stock.symbol, name: stock.name, groupId },
      message: '已添加到自选股',
    });
  } catch (error) {
    console.error('添加自选股失败:', error);
    if ((error as Error).message?.includes('does not exist')) {
      return res.status(500).json({ success: false, error: '自选股功能需要先初始化数据库表' });
    }
    res.status(500).json({ success: false, error: '添加自选股失败' });
  }
});

/**
 * 删除自选股
 * DELETE /api/watchlist/:symbol
 */
router.delete('/watchlist/:symbol', validateParams(schemas.stockSymbol), async (req: Request, res: Response) => {
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

    res.json({ success: true, message: '已从自选股移除' });
  } catch (error) {
    console.error('删除自选股失败:', error);
    res.status(500).json({ success: false, error: '删除自选股失败' });
  }
});

/**
 * 更新自选股（分组/排序/备注）
 * PATCH /api/watchlist/:symbol
 */
router.patch('/watchlist/:symbol', validateParams(schemas.stockSymbol), validateBody(schemas.watchlistUpdate), async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const { notes, groupId, sortIndex } = req.body;
    const userId = parseInt(req.body.userId as string) || 1;

    const stock = await db.getStockBySymbol(symbol);
    if (!stock) {
      return res.status(404).json({ success: false, error: '股票不存在' });
    }

    const updateData: Record<string, string | number> = {};
    if (notes !== undefined) updateData.notes = notes;
    if (groupId !== undefined) updateData.group_id = groupId;
    if (sortIndex !== undefined) updateData.sort_index = sortIndex;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ success: false, error: '没有需要更新的字段' });
    }

    const updated = await db.connection('user_watchlist')
      .where('user_id', userId)
      .where('stock_id', stock.id)
      .update(updateData);

    if (updated === 0) {
      return res.status(404).json({ success: false, error: '该股票不在自选列表中' });
    }

    res.json({ success: true, message: '已更新' });
  } catch (error) {
    console.error('更新自选股失败:', error);
    res.status(500).json({ success: false, error: '更新自选股失败' });
  }
});

/**
 * 批量排序
 * PUT /api/watchlist/reorder
 */
router.put('/watchlist/reorder', validateBody(schemas.watchlistReorder), async (req: Request, res: Response) => {
  try {
    const { items } = req.body; // [{ symbol, sortIndex, groupId }]
    const userId = parseInt(req.body.userId as string) || 1;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: '需要提供排序数据' });
    }

    for (const item of items) {
      const stock = await db.getStockBySymbol(item.symbol);
      if (stock) {
        await db.connection('user_watchlist')
          .where('user_id', userId)
          .where('stock_id', stock.id)
          .update({
            sort_index: item.sortIndex,
            ...(item.groupId && { group_id: item.groupId }),
          });
      }
    }

    res.json({ success: true, message: '排序已更新' });
  } catch (error) {
    console.error('批量排序失败:', error);
    res.status(500).json({ success: false, error: '批量排序失败' });
  }
});

/**
 * 创建分组
 * POST /api/watchlist/groups
 */
router.post('/watchlist/groups', validateBody(schemas.watchlistGroupCreate), async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    const userId = parseInt(req.body.userId as string) || 1;

    if (!name?.trim()) {
      return res.status(400).json({ success: false, error: '分组名称不能为空' });
    }

    const id = `group_${Date.now()}`;

    await db.connection('watchlist_groups').insert({
      id,
      user_id: userId,
      name: name.trim(),
      sort_index: 999,
      created_at: new Date(),
    });

    res.status(201).json({
      success: true,
      data: { id, name: name.trim() },
      message: '分组已创建',
    });
  } catch (error) {
    console.error('创建分组失败:', error);
    res.status(500).json({ success: false, error: '创建分组失败' });
  }
});

/**
 * 删除分组
 * DELETE /api/watchlist/groups/:id
 */
router.delete('/watchlist/groups/:id', validateParams(schemas.watchlistGroupDelete), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (id === 'default') {
      return res.status(400).json({ success: false, error: '默认分组不能删除' });
    }

    const userId = parseInt(req.query.userId as string) || 1;

    // 将该分组的股票移到默认分组
    await db.connection('user_watchlist')
      .where('user_id', userId)
      .where('group_id', id)
      .update({ group_id: 'default' })
      .catch((err) => console.error('将股票移到默认分组失败:', err));

    await db.connection('watchlist_groups')
      .where('id', id)
      .where('user_id', userId)
      .delete()
      .catch((err) => console.error('删除自选股分组失败:', err));

    res.json({ success: true, message: '分组已删除，股票已移至默认分组' });
  } catch (error) {
    console.error('删除分组失败:', error);
    res.status(500).json({ success: false, error: '删除分组失败' });
  }
});

export default router;
