/**
 * 策略模板 CRUD API
 * 支持系统预设 + 用户自定义模板
 */

import { Router, Request, Response } from 'express';
import { db } from '../db/dbFactory';
import { asyncHandler, sendSuccess, sendValidationError, sendNotFound } from '../utils/apiResponse';

const router = Router();

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
  
  let query = db.connection('strategy_templates');
  
  // 分类过滤
  if (category && category !== 'all') {
    query = query.where('category', category);
  }
  
  // 是否包含系统模板
  if (include_system === 'false') {
    query = query.where('is_system', false);
  }
  
  // 用户自定义模板
  if (user_id) {
    query = query.where(function() {
      this.where('is_system', true).orWhere('user_id', user_id);
    });
  }
  
  const templates = await query.orderBy([
    { column: 'is_system', order: 'desc' },
    { column: 'usage_count', order: 'desc' },
    { column: 'created_at', order: 'desc' }
  ]);
  
  sendSuccess(res, { templates });
}));

// ==================== 获取单个模板 ====================

router.get('/strategy-templates/:id', asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  
  const template = await db.connection('strategy_templates')
    .where('id', id)
    .first();
  
  if (!template) {
    return sendNotFound(res, '策略模板');
  }
  
  sendSuccess(res, { template });
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
  
  const [template] = await db.connection('strategy_templates')
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
  
  sendSuccess(res, { template });
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
  const existing = await db.connection('strategy_templates')
    .where('id', id)
    .first();
  
  if (!existing) {
    return sendNotFound(res, '策略模板');
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
  
  const [template] = await db.connection('strategy_templates')
    .where('id', id)
    .update(updates)
    .returning('*');
  
  sendSuccess(res, { template });
}));

// ==================== 删除模板 ====================

router.delete('/strategy-templates/:id', asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  
  // 检查模板是否存在
  const existing = await db.connection('strategy_templates')
    .where('id', id)
    .first();
  
  if (!existing) {
    return sendNotFound(res, '策略模板');
  }
  
  // 系统模板不允许删除
  if (existing.is_system) {
    return sendValidationError(res, '系统预设模板不允许删除');
  }
  
  await db.connection('strategy_templates')
    .where('id', id)
    .delete();
  
  sendSuccess(res, { deleted: true });
}));

// ==================== 记录模板使用 ====================

router.post('/strategy-templates/:id/use', asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  
  await db.connection('strategy_templates')
    .where('id', id)
    .increment('usage_count', 1)
    .update({
      last_used_at: db.connection.fn.now()
    });
  
  sendSuccess(res, { updated: true });
}));

// ==================== 复制系统模板为自定义 ====================

router.post('/strategy-templates/:id/clone', asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const { user_id, name: new_name } = req.body;
  
  // 获取原模板
  const original = await db.connection('strategy_templates')
    .where('id', id)
    .first();
  
  if (!original) {
    return sendNotFound(res, '原模板');
  }
  
  // 创建副本
  const [clone] = await db.connection('strategy_templates')
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
  
  sendSuccess(res, { template: clone });
}));

// ==================== 获取分类统计 ====================

router.get('/strategy-templates/stats/categories', asyncHandler(async (_req: Request, res: Response) => {
  const stats = await db.connection('strategy_templates')
    .select('category')
    .count('* as count')
    .groupBy('category');
  
  sendSuccess(res, { stats });
}));

export default router;
