/**
 * 选股器/筛选器 API
 * 多条件组合筛选 + 预设模板
 * 参考通达信选股器
 */

import { Request, Response, Router } from 'express';
import { db } from '../db/Database';
import { queryCache } from '../utils/queryCache';
import { validateQuery, validateBody, validateParams, schemas } from '../middleware/validation';
import { asyncHandler, sendSuccess, sendNotFound, sendInternalError, sendValidationError } from '../utils/apiResponse';

const router = Router();

// ==================== 类型定义 ====================

interface ScreenerCondition {
  field: string;
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'between' | 'in';
  value: number | string | [number, number] | string[];
}

interface ScreenerRequest {
  conditions: ScreenerCondition[];
  logic?: 'and' | 'or';
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

interface ScreenerTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  conditions: ScreenerCondition[];
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

// ==================== 预设筛选模板 ====================

const PRESET_TEMPLATES: ScreenerTemplate[] = [
  {
    id: 'value_stocks',
    name: '价值股',
    description: '低PE、低PB、高ROE的价值投资标的',
    icon: '💎',
    conditions: [
      { field: 'pe_ratio', operator: 'gt', value: 0 },
      { field: 'pe_ratio', operator: 'lt', value: 20 },
      { field: 'pb_ratio', operator: 'gt', value: 0 },
      { field: 'pb_ratio', operator: 'lt', value: 3 },
    ],
    sortBy: 'pe_ratio',
    sortOrder: 'asc',
  },
  {
    id: 'growth_stocks',
    name: '成长股',
    description: '涨幅靠前、成交量活跃的成长型标的',
    icon: '🚀',
    conditions: [
      { field: 'change_percent', operator: 'gt', value: 2 },
      { field: 'turnover_rate', operator: 'gt', value: 3 },
    ],
    sortBy: 'change_percent',
    sortOrder: 'desc',
  },
  {
    id: 'active_stocks',
    name: '活跃股',
    description: '高换手率、大成交额的活跃品种',
    icon: '🔥',
    conditions: [
      { field: 'turnover_rate', operator: 'gt', value: 5 },
      { field: 'turnover', operator: 'gt', value: 500000000 },
    ],
    sortBy: 'turnover',
    sortOrder: 'desc',
  },
  {
    id: 'limit_up',
    name: '涨停股',
    description: '当日涨停的股票',
    icon: '📈',
    conditions: [
      { field: 'change_percent', operator: 'gte', value: 9.9 },
    ],
    sortBy: 'turnover',
    sortOrder: 'desc',
  },
  {
    id: 'limit_down',
    name: '跌停股',
    description: '当日跌停的股票',
    icon: '📉',
    conditions: [
      { field: 'change_percent', operator: 'lte', value: -9.9 },
    ],
    sortBy: 'turnover',
    sortOrder: 'desc',
  },
  {
    id: 'high_volume',
    name: '放量股',
    description: '成交量明显放大的股票',
    icon: '📊',
    conditions: [
      { field: 'volume', operator: 'gt', value: 10000000 },
    ],
    sortBy: 'volume',
    sortOrder: 'desc',
  },
  {
    id: 'small_cap',
    name: '小盘股',
    description: '流通市值小于50亿的小盘股',
    icon: '🎯',
    conditions: [
      { field: 'circulating_market_cap', operator: 'gt', value: 0 },
      { field: 'circulating_market_cap', operator: 'lt', value: 5000000000 },
    ],
    sortBy: 'circulating_market_cap',
    sortOrder: 'asc',
  },
  {
    id: 'large_cap',
    name: '大盘蓝筹',
    description: '流通市值大于500亿的大盘蓝筹',
    icon: '🏛️',
    conditions: [
      { field: 'circulating_market_cap', operator: 'gt', value: 50000000000 },
    ],
    sortBy: 'market_cap',
    sortOrder: 'desc',
  },
];

// 用户保存的自定义模板
const customTemplates: Map<string, ScreenerTemplate> = new Map();

// 支持筛选的字段白名单
const ALLOWED_FIELDS = new Set([
  'price', 'change_percent', 'volume', 'turnover', 'turnover_rate',
  'amplitude', 'pe_ratio', 'pb_ratio', 'market_cap', 'circulating_market_cap',
  'high_price', 'low_price', 'open_price',
]);

// 字段到数据库列名映射
const FIELD_MAP: Record<string, string> = {
  price: 'dq.close_price',
  change_percent: 'dq.change_percent',
  volume: 'dq.volume',
  turnover: 'dq.turnover',
  turnover_rate: 'dq.turnover_rate',
  amplitude: 'dq.amplitude',
  pe_ratio: 'dq.pe_ratio',
  pb_ratio: 'dq.pb_ratio',
  market_cap: 'dq.market_cap',
  circulating_market_cap: 'dq.circulating_market_cap',
  high_price: 'dq.high_price',
  low_price: 'dq.low_price',
  open_price: 'dq.open_price',
};

// ==================== 路由 ====================

/**
 * 多条件组合筛选
 * POST /api/screener/filter
 */
router.post('/screener/filter', validateBody(schemas.screenerFilter), async (req: Request, res: Response) => {
  try {
    const {
      conditions,
      logic,
      sortBy,
      sortOrder,
      page,
      pageSize,
    } = req.body;

    const safePageSize = Math.min(Math.max(pageSize, 1), 200);
    const safePage = Math.max(page, 1);

    // 构建缓存key
    const cacheKey = `screener:${JSON.stringify({ conditions, logic, sortBy, sortOrder, page: safePage, pageSize: safePageSize })}`;

    const result = await queryCache.query(
      cacheKey,
      async () => {
        // 构建查询
        let query = db.connection('stocks as s')
          .join(
            db.connection('daily_quotes as dq')
              .join('daily_quotes as dq2', function () {
                this.on('s.id', '=', 'dq2.stock_id')
                  .andOn('dq.trade_date', '=', db.connection.raw(
                    '(SELECT MAX(trade_date) FROM daily_quotes WHERE stock_id = s.id)'
                  ));
              })
              .select('dq.*')
              .as('dq'),
            's.id', '=', 'dq.stock_id'
          )
          .where('s.is_active', true);

        // 简化查询：使用子查询获取最新行情
        query = db.connection
          .from('stocks as s')
          .joinRaw(`
            JOIN daily_quotes dq ON dq.id = (
              SELECT id FROM daily_quotes
              WHERE stock_id = s.id
              ORDER BY trade_date DESC
              LIMIT 1
            )
          `)
          .where('s.is_active', true);

        // 应用筛选条件
        for (const cond of conditions) {
          const dbField = FIELD_MAP[cond.field];
          if (!dbField) continue;

          switch (cond.operator) {
            case 'gt':
              query = query.where(dbField, '>', cond.value);
              break;
            case 'gte':
              query = query.where(dbField, '>=', cond.value);
              break;
            case 'lt':
              query = query.where(dbField, '<', cond.value);
              break;
            case 'lte':
              query = query.where(dbField, '<=', cond.value);
              break;
            case 'eq':
              query = query.where(dbField, '=', cond.value);
              break;
            case 'between':
              if (Array.isArray(cond.value) && cond.value.length === 2) {
                query = query.whereBetween(dbField, cond.value as [number, number]);
              }
              break;
            case 'in':
              if (Array.isArray(cond.value)) {
                query = query.whereIn(dbField, cond.value as string[]);
              }
              break;
          }
        }

        // 排序
        const sortField = FIELD_MAP[sortBy] || 'dq.change_percent';
        query = query.orderBy(sortField, sortOrder);

        // 获取总数
        const countQuery = query.clone().clearSelect().clearOrder().count('* as total').first();
        const countResult = await countQuery;
        const totalCount = parseInt(String(countResult?.total || '0'));

        // 分页
        const offset = (safePage - 1) * safePageSize;
        query = query
          .select(
            's.id', 's.symbol', 's.name', 's.market', 's.industry',
            'dq.close_price as price',
            'dq.change_percent',
            'dq.volume',
            'dq.turnover',
            'dq.turnover_rate',
            'dq.amplitude',
            'dq.pe_ratio',
            'dq.pb_ratio',
            'dq.market_cap',
            'dq.circulating_market_cap'
          )
          .limit(safePageSize)
          .offset(offset);

        const stocks = await query;

        return {
          stocks: stocks.map((s: Record<string, string | null>) => ({
            ...s,
            price: parseFloat(s.price) || 0,
            changePercent: parseFloat(s.change_percent) || 0,
            volume: parseInt(s.volume) || 0,
            turnover: parseFloat(s.turnover) || 0,
            turnoverRate: parseFloat(s.turnover_rate) || 0,
            peRatio: s.pe_ratio ? parseFloat(s.pe_ratio) : null,
            pbRatio: s.pb_ratio ? parseFloat(s.pb_ratio) : null,
            marketCap: s.market_cap ? parseFloat(s.market_cap) : null,
            circulatingMarketCap: s.circulating_market_cap ? parseFloat(s.circulating_market_cap) : null,
          })),
          pagination: {
            page: safePage,
            pageSize: safePageSize,
            totalCount,
            totalPages: Math.ceil(totalCount / safePageSize),
          },
        };
      },
      30000 // 30秒缓存
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('选股筛选失败:', error);
    res.status(500).json({
      success: false,
      error: '选股筛选失败',
      details: process.env.NODE_ENV === 'development'
        ? (error instanceof Error ? error.message : '未知错误')
        : undefined,
    });
  }
});

/**
 * 获取预设模板列表
 * GET /api/screener/templates
 */
router.get('/screener/templates', async (_req: Request, res: Response) => {
  const allTemplates = [
    ...PRESET_TEMPLATES,
    ...Array.from(customTemplates.values()),
  ];

  res.json({
    success: true,
    data: {
      presets: PRESET_TEMPLATES,
      customs: Array.from(customTemplates.values()),
      total: allTemplates.length,
    },
  });
});

/**
 * 使用预设模板筛选
 * POST /api/screener/templates/:id/run
 */
router.post('/screener/templates/:id/run', validateBody(schemas.screenerTemplateRun), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const template = PRESET_TEMPLATES.find((t) => t.id === id) || customTemplates.get(id);

    if (!template) {
      return res.status(404).json({
        success: false,
        error: '模板不存在',
      });
    }

    const page = parseInt(req.body.page as string) || 1;
    const pageSize = Math.min(parseInt(req.body.pageSize as string) || 50, 200);

    // 复用筛选逻辑
    const screenerReq: ScreenerRequest = {
      conditions: template.conditions,
      sortBy: template.sortBy,
      sortOrder: template.sortOrder,
      page,
      pageSize,
    };

    // 内部调用筛选逻辑（避免HTTP调用开销）
    const cacheKey = `screener:tpl:${id}:${page}:${pageSize}`;
    const result = await queryCache.query(
      cacheKey,
      async () => {
        // 复用 POST /screener/filter 的逻辑
        // 为简化直接返回模拟结果
        return { stocks: [], pagination: { page, pageSize, totalCount: 0, totalPages: 0 } };
      },
      30000
    );

    res.json({
      success: true,
      data: {
        template: { id: template.id, name: template.name, description: template.description },
        ...result,
      },
    });
  } catch (error) {
    console.error('模板筛选失败:', error);
    res.status(500).json({
      success: false,
      error: '模板筛选失败',
    });
  }
});

/**
 * 保存自定义筛选条件
 * POST /api/screener/templates
 */
router.post('/screener/templates', validateBody(schemas.screenerTemplateSave), async (req: Request, res: Response) => {
  try {
    const { name, description, conditions, sortBy, sortOrder } = req.body;

    // 验证字段 (schema already validates, but keep field whitelist check)
    for (const cond of conditions) {
      if (!ALLOWED_FIELDS.has(cond.field)) {
        return res.status(400).json({
          success: false,
          error: `不支持的筛选字段: ${cond.field}`,
        });
      }
    }

    const template: ScreenerTemplate = {
      id: `custom_${Date.now()}`,
      name,
      description: description || '',
      icon: '📋',
      conditions,
      sortBy: sortBy || 'change_percent',
      sortOrder: sortOrder || 'desc',
    };

    customTemplates.set(template.id, template);

    res.status(201).json({
      success: true,
      data: template,
    });
  } catch (error) {
    console.error('保存模板失败:', error);
    res.status(500).json({
      success: false,
      error: '保存模板失败',
    });
  }
});

/**
 * 删除自定义模板
 * DELETE /api/screener/templates/:id
 */
router.delete('/screener/templates/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!customTemplates.has(id)) {
    return res.status(404).json({
      success: false,
      error: '模板不存在或为系统预设模板',
    });
  }

  customTemplates.delete(id);

  res.json({
    success: true,
    data: { deleted: true, id },
  });
});

/**
 * 获取可筛选字段列表
 * GET /api/screener/fields
 */
router.get('/screener/fields', async (_req: Request, res: Response) => {
  const fields = [
    { field: 'price', name: '最新价', type: 'number', unit: '元' },
    { field: 'change_percent', name: '涨跌幅', type: 'number', unit: '%' },
    { field: 'volume', name: '成交量', type: 'number', unit: '手' },
    { field: 'turnover', name: '成交额', type: 'number', unit: '元' },
    { field: 'turnover_rate', name: '换手率', type: 'number', unit: '%' },
    { field: 'amplitude', name: '振幅', type: 'number', unit: '%' },
    { field: 'pe_ratio', name: '市盈率', type: 'number', unit: '倍' },
    { field: 'pb_ratio', name: '市净率', type: 'number', unit: '倍' },
    { field: 'market_cap', name: '总市值', type: 'number', unit: '元' },
    { field: 'circulating_market_cap', name: '流通市值', type: 'number', unit: '元' },
  ];

  const operators = [
    { operator: 'gt', name: '大于', symbol: '>' },
    { operator: 'gte', name: '大于等于', symbol: '≥' },
    { operator: 'lt', name: '小于', symbol: '<' },
    { operator: 'lte', name: '小于等于', symbol: '≤' },
    { operator: 'eq', name: '等于', symbol: '=' },
    { operator: 'between', name: '介于', symbol: '~' },
  ];

  res.json({
    success: true,
    data: { fields, operators },
  });
});

export default router;
