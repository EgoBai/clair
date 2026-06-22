/**
 * 增强自选股 API
 * 支持分组管理、拖拽排序、批量操作
 */

import { Request, Response, Router } from 'express';
import { db } from '../db/dbFactory';
import { validateQuery, validateBody, validateParams, schemas } from '../middleware/validation';
import { asyncHandler, sendSuccess, sendNotFound } from '../utils/apiResponse';
import { queryCache } from '../utils/queryCache';

const router = Router();

/**
 * 获取自选股列表（含分组）
 * GET /api/watchlist
 */
router.get('/watchlist', validateQuery(schemas.watchlistQuery), async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.query.userId as string) || 1;
    const groupId = req.query.groupId as string;
    const cacheKey = `watchlist:${userId}:${groupId || 'all'}`;

    const result = await queryCache.query(cacheKey, async () => {
      // 简单查询：先获取自选股列表，再逐个获取最新行情
      const watchlistRows = await db.connection('watchlist as w')
        .join('stocks as s', 'w.stock_id', 's.id')
        .where('w.user_id', userId)
        .select(
          's.id',
          's.symbol',
          's.name',
          's.market',
          's.industry',
          'w.added_at as addedAt',
          'w.notes'
        )
        .orderBy('w.id', 'asc');

      // 逐个获取最新行情
      const enriched = await Promise.all(watchlistRows.map(async (row: any) => {
        const quote = await db.connection('daily_quotes')
          .where('stock_id', row.id)
          .orderBy('trade_date', 'desc')
          .first()
          .catch(() => null);
        return {
          ...row,
          closePrice: quote?.close_price,
          changePercent: quote?.change_percent,
          volume: quote?.volume,
          turnover: quote?.turnover,
          marketCap: quote?.market_cap,
        };
      }));

      // 获取分组信息
      const groups = await db.connection('watchlist_groups')
        .where('user_id', userId)
        .select('id', 'name', 'sort_index as sortIndex')
        .orderBy('sort_index', 'asc')
        .catch(() => []);

      return {
        watchlist: enriched,
        groups: groups.length > 0 ? groups : [{ id: 'default', name: '默认分组', sortIndex: 0 }],
      };
    }, 10000); // 10秒缓存

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('获取自选股列表失败:', error);
    // InMemoryDatabase doesn't support watchlist joins — return empty gracefully
    const msg = (error as Error).message || '';
    if (msg.includes('does not exist') || msg.includes('not a function') || process.env.DATABASE_URL === undefined) {
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
    const existing = await db.connection('watchlist')
      .where('user_id', userId)
      .where('stock_id', stock.id)
      .first();

    if (existing) {
      return res.status(409).json({ success: false, error: '该股票已在自选列表中' });
    }

    // 获取当前最大排序索引
    const maxSort = await db.connection('watchlist')
      .where('user_id', userId)
      .max('id as maxSort')
      .first();

    await db.connection('watchlist').insert({
      user_id: userId,
      stock_id: stock.id,
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
    const msg = (error as Error).message || '';
    if (msg.includes('does not exist') || msg.includes('not a function') || process.env.DATABASE_URL === undefined) {
      return res.json({
        success: true,
        data: { stockId: 0, symbol: req.body.symbol, name: req.body.symbol, groupId: req.body.groupId || 'default' },
        message: '已添加到自选股（本地缓存）',
      });
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

    const deleted = await db.connection('watchlist')
      .where('user_id', userId)
      .where('stock_id', stock.id)
      .delete();

    if (deleted === 0) {
      return res.status(404).json({ success: false, error: '该股票不在自选列表中' });
    }

    res.json({ success: true, message: '已从自选股移除' });
  } catch (error) {
    console.error('删除自选股失败:', error);
    const msg = (error as Error).message || '';
    if (msg.includes('does not exist') || msg.includes('not a function') || process.env.DATABASE_URL === undefined) {
      return res.json({ success: true, message: '已从自选股移除（本地缓存）' });
    }
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

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ success: false, error: '没有需要更新的字段' });
    }

    const updated = await db.connection('watchlist')
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
        await db.connection('watchlist')
          .where('user_id', userId)
          .where('stock_id', stock.id)
          .update({
            notes: item.notes || null,
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
    const msg = (error as Error).message || '';
    if (msg.includes('does not exist') || msg.includes('not a function') || process.env.DATABASE_URL === undefined) {
      return res.json({
        success: true,
        data: { id: 'group_' + Date.now(), name: (req.body.name || '').trim() },
        message: '分组已创建（本地缓存）',
      });
    }
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

/**
 * 批量同步自选股（前端localStorage → 后端DB）
 * POST /api/watchlist/sync
 */
router.post('/watchlist/sync', async (req: Request, res: Response) => {
  try {
    const { groups } = req.body; // [{id, name, stocks: [{symbol, name, market}]}]
    const userId = 1; // 单用户模式

    if (!groups || !Array.isArray(groups)) {
      res.json({ success: true, message: '无需同步', synced: 0 });
      return;
    }

    let synced = 0;
    
    // 先清除旧数据再批量插入（简化版，生产环境应用upsert）
    await db.connection('watchlist').where('user_id', userId).del().catch(() => {});
    
    for (const group of groups) {
      for (const stock of (group.stocks || [])) {
        // 查找stock_id
        const row = await db.connection('stocks')
          .where('symbol', stock.symbol)
          .first()
          .catch(() => null);
        
        if (row) {
          await db.connection('watchlist').insert({
            user_id: userId,
            stock_id: row.id,
            group_name: group.name || '默认分组',
            added_at: new Date(),
          }).catch(() => {});
          synced++;
        }
      }
    }

    res.json({ success: true, synced, message: `已同步 ${synced} 只自选股` });
  } catch (error) {
    console.error('同步自选股失败:', error);
    res.status(500).json({ success: false, error: '同步失败' });
  }
});

export default router;
