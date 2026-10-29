/**
 * 策略模板 CRUD API
 * 支持系统预设 + 用户自定义模板
 */

import { Router, Request, Response } from 'express';
import { db } from '../db/dbFactory';
import { asyncHandler, sendValidationError } from '../utils/apiResponse';

const router = Router();

/**
 * 诚实数据契约发送器（本文件统一出口）：顶层 dataSource 与 data 内同源。
 *
 * 本文件数据来自 strategy_templates 表。注意：该表在部分部署环境不存在
 * （实测 GET /strategy-templates/stats/categories 返回 500
 *  `relation "strategy_templates" does not exist`），故查询失败时
 * **绝不能**用空数组冒充「当前没有任何模板」。
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

// ==================== 类型定义 ====================

interface StrategyTemplate {
  id: number;
  name: string;
  name_en: string;
  description: string;
  icon: string;
  category: string;
  conditions: Array<{
    field: string;
    operator: string;
    value: number | string | [number, number] | string[];
  }>;
  logic: 'and' | 'or';
  sort_by: string;
  sort_order: 'asc' | 'desc';
  secondary_sort?: { field: string; order: string };
  is_system: boolean;
  user_id?: string;
  usage_count: number;
  last_used_at?: string;
  created_at: string;
  updated_at: string;
}

// ==================== 获取所有模板 ====================

router.get('/strategy-templates', asyncHandler(async (req: Request, res: Response) => {
  const { category, include_system = 'true', user_id } = req.query;
  
  let templates: any[] = [];
  let queryFailed = false;
  try {
    let query = db.connection('strategy_templates');
    
    if (category && category !== 'all') {
      query = query.where('category', category);
    }
    if (include_system === 'false') {
      query = query.where('is_system', false);
    }
    if (user_id) {
      query = query.where(function() {
        this.where('is_system', true).orWhere('user_id', user_id);
      });
    }
    
    templates = await query.orderBy([
      { column: 'is_system', order: 'desc' },
      { column: 'usage_count', order: 'desc' },
      { column: 'created_at', order: 'desc' }
    ]);
  } catch (e) {
    console.warn('[StrategyTemplates] 查询策略模板失败:', e);
    // 表不存在/查询异常时**不**用空数组冒充「当前没有任何模板」：
    // 这是「拿不到数据」与「确实没有模板」两种完全不同的状态。
    queryFailed = true;
  }

  if (queryFailed) {
    sendHonest(res, 'unavailable', {
      templates: [],
      message: 'strategy_templates 表查询失败（部署环境可能未建表），空列表不代表「当前没有任何模板」',
    });
    return;
  }

  // 模板内容是**静态策略配置**（预设选股条件目录，来自
  // backend/src/db/migrations/strategy_templates.sql 的播种），不含任何实时
  // 行情数据 —— 如实标注，避免前端把「选股条件预设」当成实时数据。
  // 查到了但一行没有：此时**不能**断言「用户就是没有模板」——表可能是从未播种的空表
  // （实测本仓 strategy_templates 表在不少环境直接不存在）。保守标 unavailable，
  // 但 message 如实说明「查询成功、结果为空」，不伪造结论也不谎报不可用。
  sendHonest(res, templates.length > 0 ? 'real' : 'unavailable', {
    templates,
    note: '策略模板为静态策略配置（预设选股条件目录），非实时行情数据',
    ...(templates.length > 0 ? {} : { message: '已成功查询但结果为空（当前库中没有任何策略模板）' }),
  });
}));

// ==================== 获取单个模板 ====================

router.get('/strategy-templates/:id', asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);

  let template: any = null;
  try {
    template = await db.connection('strategy_templates')
      .where('id', id)
      .first();
  } catch (e) {
    // 表不存在 / 查询失败：绝不能让它冒泡到全局错误处理（那条路径没有 dataSource），
    // 也不要用「模板不存在」冒充「查询失败」——两者含义完全不同。
    console.warn('[StrategyTemplates] 查询模板失败:', e);
    sendHonest(res, 'unavailable', {
      message: 'strategy_templates 表查询失败（部署环境可能未建表），未返回任何模板',
    });
    return;
  }

  if (!template) {
    sendHonest(res, 'unavailable', {
      message: '策略模板不存在（id 未命中），未返回任何模板',
    });
    return;
  }

  sendHonest(res, 'real', { template });
}));

// ==================== 创建模板 ====================

router.post('/strategy-templates', asyncHandler(async (req: Request, res: Response) => {
  const {
    name,
    name_en,
    description,
    icon = '📊',
    category = 'custom',
    conditions = [],
    logic = 'and',
    sort_by = 'change_percent',
    sort_order = 'desc',
    secondary_sort,
    user_id
  } = req.body;
  
  // 验证必填字段
  if (!name) {
    return sendValidationError(res, '策略名称不能为空');
  }
  
  if (!Array.isArray(conditions) || conditions.length === 0) {
    return sendValidationError(res, '筛选条件不能为空');
  }
  
  // 验证条件格式
  for (const cond of conditions) {
    if (!cond.field || !cond.operator) {
      return sendValidationError(res, '条件格式错误：缺少field或operator');
    }
  }
  
  let template: any;
  try {
    [template] = await db.connection('strategy_templates')
      .insert({
        name,
        name_en: name_en || name,
        description: description || '',
        icon,
        category,
        conditions: JSON.stringify(conditions),
        logic,
        sort_by,
        sort_order,
        secondary_sort: secondary_sort ? JSON.stringify(secondary_sort) : null,
        is_system: false,
        user_id: user_id || null,
        usage_count: 0
      })
      .returning('*');
  } catch (e) {
    console.warn('[StrategyTemplates] 创建模板失败:', e);
    sendHonest(res, 'unavailable', {
      message: 'strategy_templates 表写入失败（部署环境可能未建表），未创建任何模板',
    });
    return;
  }

  sendHonest(res, 'real', { template });
}));

// ==================== 更新模板 ====================

router.put('/strategy-templates/:id', asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const {
    name,
    name_en,
    description,
    icon,
    category,
    conditions,
    logic,
    sort_by,
    sort_order,
    secondary_sort
  } = req.body;
  
  // 检查模板是否存在
  let existing: any = null;
  try {
    existing = await db.connection('strategy_templates')
      .where('id', id)
      .first();
  } catch (e) {
    console.warn('[StrategyTemplates] 查询待更新模板失败:', e);
    sendHonest(res, 'unavailable', {
      message: 'strategy_templates 表查询失败（部署环境可能未建表），未做任何修改',
    });
    return;
  }

  if (!existing) {
    sendHonest(res, 'unavailable', { message: '策略模板不存在（id 未命中），未做任何修改' });
    return;
  }

  // 系统模板不允许修改
  if (existing.is_system) {
    return sendValidationError(res, '系统预设模板不允许修改');
  }
  
  // 构建更新对象
  const updates: Record<string, unknown> = {
    updated_at: db.connection.fn.now()
  };
  
  if (name !== undefined) updates.name = name;
  if (name_en !== undefined) updates.name_en = name_en;
  if (description !== undefined) updates.description = description;
  if (icon !== undefined) updates.icon = icon;
  if (category !== undefined) updates.category = category;
  if (conditions !== undefined) updates.conditions = JSON.stringify(conditions);
  if (logic !== undefined) updates.logic = logic;
  if (sort_by !== undefined) updates.sort_by = sort_by;
  if (sort_order !== undefined) updates.sort_order = sort_order;
  if (secondary_sort !== undefined) {
    updates.secondary_sort = secondary_sort ? JSON.stringify(secondary_sort) : null;
  }
  
  let updated: any = null;
  try {
    [updated] = await db.connection('strategy_templates')
      .where('id', id)
      .update(updates)
      .returning('*');
  } catch (e) {
    console.warn('[StrategyTemplates] 更新模板失败:', e);
    sendHonest(res, 'unavailable', {
      message: 'strategy_templates 表写入失败（部署环境可能未建表），未做任何修改',
    });
    return;
  }

  sendHonest(res, 'real', { template: updated });
}));

// ==================== 删除模板 ====================

router.delete('/strategy-templates/:id', asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  
  // 检查模板是否存在
  let existing: any = null;
  try {
    existing = await db.connection('strategy_templates')
      .where('id', id)
      .first();
  } catch (e) {
    console.warn('[StrategyTemplates] 查询待删除模板失败:', e);
    sendHonest(res, 'unavailable', {
      message: 'strategy_templates 表查询失败（部署环境可能未建表），未做任何删除',
    });
    return;
  }

  if (!existing) {
    sendHonest(res, 'unavailable', { message: '策略模板不存在（id 未命中），未做任何修改' });
    return;
  }

  // 系统模板不允许删除
  if (existing.is_system) {
    return sendValidationError(res, '系统预设模板不允许删除');
  }

  try {
    await db.connection('strategy_templates')
      .where('id', id)
      .delete();
  } catch (e) {
    console.warn('[StrategyTemplates] 删除模板失败:', e);
    sendHonest(res, 'unavailable', {
      message: 'strategy_templates 表写入失败（部署环境可能未建表），未做任何删除',
    });
    return;
  }

  sendHonest(res, 'real', { deleted: true });
}));

// ==================== 记录模板使用 ====================

router.post('/strategy-templates/:id/use', asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  
  try {
    await db.connection('strategy_templates')
      .where('id', id)
      .increment('usage_count', 1)
      .update({
        last_used_at: db.connection.fn.now()
      });
  } catch (e) {
    console.warn('[StrategyTemplates] 记录使用次数失败:', e);
    sendHonest(res, 'unavailable', {
      message: 'strategy_templates 表写入失败（部署环境可能未建表），未记录任何使用次数',
    });
    return;
  }

  sendHonest(res, 'real', { updated: true });
}));

// ==================== 复制系统模板为自定义 ====================

router.post('/strategy-templates/:id/clone', asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const { user_id, name: new_name } = req.body;
  
  // 获取原模板
  let original: any = null;
  try {
    original = await db.connection('strategy_templates')
      .where('id', id)
      .first();
  } catch (e) {
    console.warn('[StrategyTemplates] 查询待克隆模板失败:', e);
    sendHonest(res, 'unavailable', {
      message: 'strategy_templates 表查询失败（部署环境可能未建表），未克隆任何模板',
    });
    return;
  }

  if (!original) {
    sendHonest(res, 'unavailable', { message: '原模板不存在（id 未命中），未克隆任何模板' });
    return;
  }

  // 创建副本
  let clone: any;
  try {
    [clone] = await db.connection('strategy_templates')
      .insert({
        name: new_name || `${original.name} (副本)`,
        name_en: original.name_en ? `${original.name_en} (Copy)` : '',
        description: original.description,
        icon: original.icon,
        category: original.category,
        conditions: original.conditions,
        logic: original.logic,
        sort_by: original.sort_by,
        sort_order: original.sort_order,
        secondary_sort: original.secondary_sort,
        is_system: false,
        user_id: user_id || null,
        usage_count: 0
      })
      .returning('*');
  } catch (e) {
    console.warn('[StrategyTemplates] 克隆模板失败:', e);
    sendHonest(res, 'unavailable', {
      message: 'strategy_templates 表写入失败（部署环境可能未建表），未克隆任何模板',
    });
    return;
  }

  sendHonest(res, 'real', { template: clone });
}));

// ==================== 获取分类统计 ====================

router.get('/strategy-templates/stats/categories', asyncHandler(async (_req: Request, res: Response) => {
  let stats: Array<{ category: string; count: number | string }> = [];
  try {
    stats = await db.connection('strategy_templates')
      .select('category')
      .count('* as count')
      .groupBy('category');
  } catch (e) {
    // 诚实降级：strategy_templates 表不存在（实测 500
    // `relation "strategy_templates" does not exist`）时如实标注，
    // 不再把 DB 缺表升级成 500 崩溃。
    console.warn('[StrategyTemplates] 分类统计查询失败:', e);
    res.status(200).json({
      success: true,
      dataSource: 'unavailable',
      data: {
        stats: [], dataSource: 'unavailable',
        message: 'strategy_templates 表查询失败（部署环境可能未建表），未返回任何分类统计',
      },
      timestamp: new Date().toISOString(),
    });
    return;
  }

  sendHonest(res, stats.length > 0 ? 'real' : 'unavailable', {
    stats,
    ...(stats.length > 0 ? {} : { message: '已成功查询但无任何分类统计（当前没有任何策略模板）' }),
  });
}));

export default router;
