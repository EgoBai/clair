/**
 * 选股器/筛选器 API (v2 - TradingView对标)
 * 多条件组合筛选 + 预设模板 + 多维排序 + 游标分页
 * 参考通达信选股器 + TradingView Stock Screener
 */

import { Request, Response, Router } from 'express';
import { db } from '../db/dbFactory';
import { queryCache } from '../utils/queryCache';
import { validateBody, schemas } from '../middleware/validation';

const router = Router();

// ==================== 类型定义 ====================

interface ScreenerCondition {
  field: string;
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq' | 'between' | 'in' | 'not_in';
  value: number | string | [number, number] | string[];
}

interface ScreenerRequest {
  conditions: ScreenerCondition[];
  logic?: 'and' | 'or';
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  secondarySort?: { field: string; order: 'asc' | 'desc' };
  page?: number;
  pageSize?: number;
  cursor?: string;
}

interface ScreenerTemplate {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  icon: string;
  category: 'value' | 'growth' | 'momentum' | 'technical' | 'income' | 'custom';
  conditions: ScreenerCondition[];
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  secondarySort?: { field: string; order: 'asc' | 'desc' };
}

// ==================== 预设筛选模板 (对标TradingView) ====================

const PRESET_TEMPLATES: ScreenerTemplate[] = [
  // --- 价值投资 ---
  {
    id: 'value_stocks',
    name: '价值股',
    nameEn: 'Value Stocks',
    description: '低PE、低PB的价值投资标的',
    icon: '💎',
    category: 'value',
    conditions: [
      { field: 'pe_ratio', operator: 'gt', value: 0 },
      { field: 'pe_ratio', operator: 'lt', value: 20 },
      { field: 'pb_ratio', operator: 'gt', value: 0 },
      { field: 'pb_ratio', operator: 'lt', value: 3 },
      { field: 'turnover_rate', operator: 'gt', value: 0.5 },
    ],
    sortBy: 'pe_ratio',
    sortOrder: 'asc',
    secondarySort: { field: 'pb_ratio', order: 'asc' },
  },
  {
    id: 'high_dividend',
    name: '高股息',
    nameEn: 'High Dividend Yield',
    description: '分红率高、适合收息的蓝筹股',
    icon: '💰',
    category: 'income',
    conditions: [
      { field: 'dividend_yield', operator: 'gte', value: 3 },
      { field: 'market_cap', operator: 'gte', value: 10000000000 },
      { field: 'pe_ratio', operator: 'gt', value: 0 },
      { field: 'pe_ratio', operator: 'lt', value: 25 },
    ],
    sortBy: 'dividend_yield',
    sortOrder: 'desc',
  },
  {
    id: 'low_pe_large_cap',
    name: '低估值大盘',
    nameEn: 'Undervalued Large Cap',
    description: '大盘蓝筹中估值较低的标的',
    icon: '🏛️',
    category: 'value',
    conditions: [
      { field: 'market_cap', operator: 'gte', value: 50000000000 },
      { field: 'pe_ratio', operator: 'gt', value: 0 },
      { field: 'pe_ratio', operator: 'lt', value: 15 },
      { field: 'pb_ratio', operator: 'gt', value: 0 },
    ],
    sortBy: 'pe_ratio',
    sortOrder: 'asc',
  },

  // --- 成长股 ---
  {
    id: 'growth_stocks',
    name: '成长股',
    nameEn: 'Growth Stocks',
    description: '涨幅靠前、成交量活跃的成长型标的',
    icon: '🚀',
    category: 'growth',
    conditions: [
      { field: 'change_percent', operator: 'gt', value: 2 },
      { field: 'turnover_rate', operator: 'gt', value: 3 },
      { field: 'turnover', operator: 'gte', value: 500000000 },
    ],
    sortBy: 'change_percent',
    sortOrder: 'desc',
  },
  {
    id: 'small_cap_growth',
    name: '小盘成长',
    nameEn: 'Small Cap Growth',
    description: '小市值高活跃度成长股',
    icon: '🌱',
    category: 'growth',
    conditions: [
      { field: 'circulating_market_cap', operator: 'gt', value: 2000000000 },
      { field: 'circulating_market_cap', operator: 'lt', value: 20000000000 },
      { field: 'turnover_rate', operator: 'gte', value: 5 },
      { field: 'change_percent', operator: 'gt', value: 0 },
    ],
    sortBy: 'change_percent',
    sortOrder: 'desc',
  },

  // --- 动量/趋势 ---
  {
    id: 'active_stocks',
    name: '活跃股',
    nameEn: 'Most Active',
    description: '高换手率、大成交额的活跃品种',
    icon: '🔥',
    category: 'momentum',
    conditions: [
      { field: 'turnover_rate', operator: 'gt', value: 5 },
      { field: 'turnover', operator: 'gt', value: 500000000 },
    ],
    sortBy: 'turnover',
    sortOrder: 'desc',
  },
  {
    id: 'top_gainers',
    name: '涨幅榜',
    nameEn: 'Top Gainers',
    description: '当日涨幅最大的股票',
    icon: '📈',
    category: 'momentum',
    conditions: [
      { field: 'change_percent', operator: 'gt', value: 3 },
      { field: 'volume', operator: 'gt', value: 1000000 },
    ],
    sortBy: 'change_percent',
    sortOrder: 'desc',
    secondarySort: { field: 'turnover', order: 'desc' },
  },
  {
    id: 'top_losers',
    name: '跌幅榜',
    nameEn: 'Top Losers',
    description: '当日跌幅最大的股票',
    icon: '📉',
    category: 'momentum',
    conditions: [
      { field: 'change_percent', operator: 'lt', value: -3 },
      { field: 'volume', operator: 'gt', value: 1000000 },
    ],
    sortBy: 'change_percent',
    sortOrder: 'asc',
  },

  // --- 技术形态 ---
  {
    id: 'limit_up',
    name: '涨停股',
    nameEn: 'Limit Up',
    description: '当日涨停的股票',
    icon: '🔴',
    category: 'technical',
    conditions: [
      { field: 'change_percent', operator: 'gte', value: 9.9 },
    ],
    sortBy: 'turnover',
    sortOrder: 'desc',
  },
  {
    id: 'limit_down',
    name: '跌停股',
    nameEn: 'Limit Down',
    description: '当日跌停的股票',
    icon: '🟢',
    category: 'technical',
    conditions: [
      { field: 'change_percent', operator: 'lte', value: -9.9 },
    ],
    sortBy: 'turnover',
    sortOrder: 'desc',
  },
  {
    id: 'high_volume',
    name: '放量股',
    nameEn: 'High Volume',
    description: '成交量明显放大的股票',
    icon: '📊',
    category: 'technical',
    conditions: [
      { field: 'volume', operator: 'gt', value: 10000000 },
    ],
    sortBy: 'volume',
    sortOrder: 'desc',
  },
  {
    id: 'high_amplitude',
    name: '高振幅',
    nameEn: 'High Volatility',
    description: '振幅较大的品种，适合短线交易',
    icon: '⚡',
    category: 'technical',
    conditions: [
      { field: 'amplitude', operator: 'gte', value: 8 },
      { field: 'turnover_rate', operator: 'gte', value: 3 },
    ],
    sortBy: 'amplitude',
    sortOrder: 'desc',
  },

  // --- 市值分类 ---
  {
    id: 'small_cap',
    name: '小盘股',
    nameEn: 'Small Cap',
    description: '流通市值小于50亿的小盘股',
    icon: '🎯',
    category: 'growth',
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
    nameEn: 'Large Cap Blue Chip',
    description: '流通市值大于500亿的大盘蓝筹',
    icon: '🏦',
    category: 'value',
    conditions: [
      { field: 'circulating_market_cap', operator: 'gt', value: 50000000000 },
    ],
    sortBy: 'market_cap',
    sortOrder: 'desc',
  },
  {
    id: 'mid_cap',
    name: '中盘股',
    nameEn: 'Mid Cap',
    description: '流通市值50-200亿的中盘股',
    icon: '📦',
    category: 'value',
    conditions: [
      { field: 'circulating_market_cap', operator: 'gte', value: 5000000000 },
      { field: 'circulating_market_cap', operator: 'lte', value: 20000000000 },
    ],
    sortBy: 'circulating_market_cap',
    sortOrder: 'asc',
  },
];

// 用户保存的自定义模板
const customTemplates: Map<string, ScreenerTemplate> = new Map();

// 支持筛选的字段白名单
const ALLOWED_FIELDS = new Set([
  'price', 'change_percent', 'volume', 'turnover', 'turnover_rate',
  'amplitude', 'pe_ratio', 'pb_ratio', 'ps_ratio', 'roe', 'roa',
  'market_cap', 'circulating_market_cap', 'dividend_yield',
  'high_price', 'low_price', 'open_price',
  'debt_to_equity', 'revenue_growth', 'profit_growth',
  'float_shares', 'total_shares', 'eps',
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
  ps_ratio: 'dq.ps_ratio',
  roe: 'dq.roe',
  roa: 'dq.roa',
  market_cap: 'dq.market_cap',
  circulating_market_cap: 'dq.circulating_market_cap',
  dividend_yield: 'dq.dividend_yield',
  high_price: 'dq.high_price',
  low_price: 'dq.low_price',
  open_price: 'dq.open_price',
  debt_to_equity: 'dq.debt_to_equity',
  revenue_growth: 'dq.revenue_growth',
  profit_growth: 'dq.profit_growth',
  float_shares: 'dq.float_shares',
  total_shares: 'dq.total_shares',
  eps: 'dq.eps',
};

// 字段元信息 (用于前端展示)
const FIELD_META: Array<{ field: string; name: string; nameEn: string; category: string; unit: string; type: string }> = [
  // 行情数据
  { field: 'price', name: '最新价', nameEn: 'Price', category: '行情', unit: '元', type: 'number' },
  { field: 'change_percent', name: '涨跌幅', nameEn: 'Change %', category: '行情', unit: '%', type: 'number' },
  { field: 'volume', name: '成交量', nameEn: 'Volume', category: '行情', unit: '手', type: 'number' },
  { field: 'turnover', name: '成交额', nameEn: 'Turnover', category: '行情', unit: '元', type: 'number' },
  { field: 'turnover_rate', name: '换手率', nameEn: 'Turnover Rate', category: '行情', unit: '%', type: 'number' },
  { field: 'amplitude', name: '振幅', nameEn: 'Amplitude', category: '行情', unit: '%', type: 'number' },
  { field: 'high_price', name: '最高价', nameEn: 'High', category: '行情', unit: '元', type: 'number' },
  { field: 'low_price', name: '最低价', nameEn: 'Low', category: '行情', unit: '元', type: 'number' },
  { field: 'open_price', name: '开盘价', nameEn: 'Open', category: '行情', unit: '元', type: 'number' },
  // 估值指标
  { field: 'pe_ratio', name: '市盈率', nameEn: 'P/E', category: '估值', unit: '倍', type: 'number' },
  { field: 'pb_ratio', name: '市净率', nameEn: 'P/B', category: '估值', unit: '倍', type: 'number' },
  { field: 'ps_ratio', name: '市销率', nameEn: 'P/S', category: '估值', unit: '倍', type: 'number' },
  { field: 'eps', name: '每股收益', nameEn: 'EPS', category: '估值', unit: '元', type: 'number' },
  { field: 'dividend_yield', name: '股息率', nameEn: 'Div Yield', category: '估值', unit: '%', type: 'number' },
  // 财务指标
  { field: 'market_cap', name: '总市值', nameEn: 'Market Cap', category: '市值', unit: '元', type: 'number' },
  { field: 'circulating_market_cap', name: '流通市值', nameEn: 'Float Cap', category: '市值', unit: '元', type: 'number' },
  { field: 'total_shares', name: '总股本', nameEn: 'Shares', category: '市值', unit: '股', type: 'number' },
  { field: 'float_shares', name: '流通股本', nameEn: 'Float Shares', category: '市值', unit: '股', type: 'number' },
  { field: 'roe', name: 'ROE', nameEn: 'ROE', category: '财务', unit: '%', type: 'number' },
  { field: 'roa', name: 'ROA', nameEn: 'ROA', category: '财务', unit: '%', type: 'number' },
  { field: 'debt_to_equity', name: '负债率', nameEn: 'D/E Ratio', category: '财务', unit: '%', type: 'number' },
  { field: 'revenue_growth', name: '营收增长', nameEn: 'Revenue Growth', category: '财务', unit: '%', type: 'number' },
  { field: 'profit_growth', name: '利润增长', nameEn: 'Profit Growth', category: '财务', unit: '%', type: 'number' },
];

const OPERATORS = [
  { operator: 'gt', name: '大于', symbol: '>' },
  { operator: 'gte', name: '大于等于', symbol: '≥' },
  { operator: 'lt', name: '小于', symbol: '<' },
  { operator: 'lte', name: '小于等于', symbol: '≤' },
  { operator: 'eq', name: '等于', symbol: '=' },
  { operator: 'neq', name: '不等于', symbol: '≠' },
  { operator: 'between', name: '介于', symbol: '~' },
  { operator: 'in', name: '属于', symbol: '∈' },
  { operator: 'not_in', name: '不属于', symbol: '∉' },
];

// ==================== 辅助函数 ====================

function applyConditionToQuery(query: any, cond: ScreenerCondition): any {
  const dbField = FIELD_MAP[cond.field];
  if (!dbField) return query;

  switch (cond.operator) {
    case 'gt': return query.where(dbField, '>', cond.value);
    case 'gte': return query.where(dbField, '>=', cond.value);
    case 'lt': return query.where(dbField, '<', cond.value);
    case 'lte': return query.where(dbField, '<=', cond.value);
    case 'eq': return query.where(dbField, '=', cond.value);
    case 'neq': return query.where(dbField, '!=', cond.value);
    case 'between':
      if (Array.isArray(cond.value) && cond.value.length === 2) {
        return query.whereBetween(dbField, cond.value as [number, number]);
      }
      return query;
    case 'in':
      if (Array.isArray(cond.value)) {
        return query.whereIn(dbField, cond.value as string[]);
      }
      return query;
    case 'not_in':
      if (Array.isArray(cond.value)) {
        return query.whereNotIn(dbField, cond.value as string[]);
      }
      return query;
    default: return query;
  }
}

function buildBaseQuery(logic: 'and' | 'or' = 'and') {
  return db.connection
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
}

function applyConditions(query: any, conditions: ScreenerCondition[], logic: 'and' | 'or'): any {
  if (conditions.length === 0) return query;

  if (logic === 'and') {
    for (const cond of conditions) {
      query = applyConditionToQuery(query, cond);
    }
  } else {
    query = query.where(function (this: any) {
      for (let i = 0; i < conditions.length; i++) {
        const cond = conditions[i];
        const dbField = FIELD_MAP[cond.field];
        if (!dbField) continue;

        const builder = this;
        const method = i === 0 ? 'where' : 'orWhere';
        switch (cond.operator) {
          case 'gt': builder[method](dbField, '>', cond.value); break;
          case 'gte': builder[method](dbField, '>=', cond.value); break;
          case 'lt': builder[method](dbField, '<', cond.value); break;
          case 'lte': builder[method](dbField, '<=', cond.value); break;
          case 'eq': builder[method](dbField, '=', cond.value); break;
          case 'neq': builder[method](dbField, '!=', cond.value); break;
          case 'between':
            if (Array.isArray(cond.value) && cond.value.length === 2) {
              builder[method](dbField, '>=', cond.value[0]);
              builder[method](dbField, '<=', cond.value[1]);
            }
            break;
          case 'in':
            if (Array.isArray(cond.value)) {
              builder[method + 'In'](dbField, cond.value);
            }
            break;
          case 'not_in':
            if (Array.isArray(cond.value)) {
              builder[method === 'where' ? 'whereNotIn' : 'orWhereNotIn'](dbField, cond.value);
            }
            break;
        }
      }
    });
  }

  return query;
}

function applySorting(query: any, sortBy: string, sortOrder: string, secondarySort?: { field: string; order: string }) {
  const sortField = FIELD_MAP[sortBy] || 'dq.change_percent';
  query = query.orderBy(sortField, sortOrder as 'asc' | 'desc');

  if (secondarySort && FIELD_MAP[secondarySort.field]) {
    query = query.orderBy(FIELD_MAP[secondarySort.field], secondarySort.order as 'asc' | 'desc');
  }

  // Tiebreaker: always sort by id for deterministic results
  query = query.orderBy('s.id', 'asc');
  return query;
}

const STOCK_COLUMNS = [
  's.id', 's.symbol', 's.name', 's.market', 's.industry',
  'dq.close_price as price', 'dq.change_percent', 'dq.volume',
  'dq.turnover', 'dq.turnover_rate', 'dq.amplitude',
  'dq.pe_ratio', 'dq.pb_ratio', 'dq.ps_ratio',
  'dq.market_cap', 'dq.circulating_market_cap',
  'dq.dividend_yield', 'dq.roe', 'dq.roa', 'dq.eps',
];

function mapStockRow(s: Record<string, string | null>) {
  const pf = (x: string | null | undefined): number => {
    if (x == null) return 0;
    const v = parseFloat(String(x));
    return Number.isFinite(v) ? v : 0;
  };
  const pn = (x: string | null | undefined): number | null => {
    if (x == null) return null;
    const v = parseFloat(String(x));
    return Number.isFinite(v) ? v : null;
  };
  const pi = (x: string | null | undefined): number => {
    if (x == null) return 0;
    const v = parseInt(String(x), 10);
    return Number.isFinite(v) ? v : 0;
  };
  return {
    id: s.id,
    symbol: s.symbol,
    name: s.name,
    market: s.market,
    industry: s.industry,
    price: pf(s.price),
    changePercent: pf(s.change_percent),
    volume: pi(s.volume),
    turnover: pf(s.turnover),
    turnoverRate: pf(s.turnover_rate),
    amplitude: pf(s.amplitude),
    peRatio: pn(s.pe_ratio),
    pbRatio: pn(s.pb_ratio),
    psRatio: pn(s.ps_ratio),
    marketCap: pn(s.market_cap),
    circulatingMarketCap: pn(s.circulating_market_cap),
    dividendYield: pn(s.dividend_yield),
    roe: pn(s.roe),
    roa: pn(s.roa),
    eps: pn(s.eps),
  };
}

// ==================== 路由 ====================

/**
 * 多条件组合筛选
 * POST /api/screener/filter
 */
router.post('/screener/filter', validateBody(schemas.screenerFilter), async (req: Request, res: Response) => {
  try {
    const {
      conditions,
      logic = 'and',
      sortBy = 'change_percent',
      sortOrder = 'desc',
      secondarySort,
      page = 1,
      pageSize = 50,
    }: ScreenerRequest = req.body;

    const safePageSize = Math.min(Math.max(pageSize, 1), 200);
    const safePage = Math.max(page, 1);

    // 构建缓存key
    const cacheKey = `screener:v2:${JSON.stringify({ conditions, logic, sortBy, sortOrder, secondarySort, page: safePage, pageSize: safePageSize })}`;

    const result = await queryCache.query(
      cacheKey,
      async () => {
        let query = buildBaseQuery(logic);
        query = applyConditions(query, conditions || [], logic);

        // 获取总数 (使用 COUNT(*) 窗口函数优化)
        const countResult = await query.clone()
          .clearSelect()
          .clearOrder()
          .count('* as total')
          .first();
        const totalCount = parseInt(String(countResult?.total || '0'));

        // 排序
        query = applySorting(query, sortBy, sortOrder, secondarySort);

        // 分页
        const offset = (safePage - 1) * safePageSize;
        const stocks = await query
          .select(...STOCK_COLUMNS)
          .limit(safePageSize)
          .offset(offset);

        return {
          stocks: stocks.map(mapStockRow),
          pagination: {
            page: safePage,
            pageSize: safePageSize,
            totalCount,
            totalPages: Math.ceil(totalCount / safePageSize),
            hasNextPage: safePage * safePageSize < totalCount,
            hasPrevPage: safePage > 1,
          },
          sortConfig: { sortBy, sortOrder, secondarySort },
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
router.get('/screener/templates', async (req: Request, res: Response) => {
  const category = req.query.category as string | undefined;
  let presets = PRESET_TEMPLATES;

  if (category && ['value', 'growth', 'momentum', 'technical', 'income'].includes(category)) {
    presets = PRESET_TEMPLATES.filter(t => t.category === category);
  }

  const allTemplates = [
    ...presets,
    ...Array.from(customTemplates.values()),
  ];

  res.json({
    success: true,
    data: {
      presets,
      customs: Array.from(customTemplates.values()),
      categories: ['value', 'growth', 'momentum', 'technical', 'income'],
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

    const cacheKey = `screener:tpl:v2:${id}:${page}:${pageSize}`;
    const result = await queryCache.query(
      cacheKey,
      async () => {
        let query = buildBaseQuery('and');
        query = applyConditions(query, template.conditions, 'and');

        const countResult = await query.clone()
          .clearSelect()
          .clearOrder()
          .count('* as total')
          .first();
        const totalCount = parseInt(String(countResult?.total || '0'));

        query = applySorting(query, template.sortBy, template.sortOrder, template.secondarySort);

        const offset = (page - 1) * pageSize;
        const stocks = await query
          .select(...STOCK_COLUMNS)
          .limit(pageSize)
          .offset(offset);

        return {
          stocks: stocks.map(mapStockRow),
          pagination: {
            page,
            pageSize,
            totalCount,
            totalPages: Math.ceil(totalCount / pageSize),
            hasNextPage: page * pageSize < totalCount,
            hasPrevPage: page > 1,
          },
        };
      },
      30000
    );

    res.json({
      success: true,
      data: {
        template: {
          id: template.id,
          name: template.name,
          nameEn: template.nameEn,
          description: template.description,
          category: template.category,
          icon: template.icon,
        },
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
    const { name, description, conditions, sortBy, sortOrder, secondarySort } = req.body;

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
      nameEn: '',
      description: description || '',
      icon: '📋',
      category: 'custom',
      conditions,
      sortBy: sortBy || 'change_percent',
      sortOrder: sortOrder || 'desc',
      secondarySort,
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
 * 获取可筛选字段列表 (含元信息)
 * GET /api/screener/fields
 */
router.get('/screener/fields', async (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      fields: FIELD_META,
      operators: OPERATORS,
      categories: [...new Set(FIELD_META.map(f => f.category))],
    },
  });
});

/**
 * 快速筛选 (预设快捷条件)
 * POST /api/screener/quick
 */
router.post('/screener/quick', async (req: Request, res: Response) => {
  try {
    const { preset, page = 1, pageSize = 50 } = req.body;

    const QUICK_FILTERS: Record<string, { conditions: ScreenerCondition[]; sortBy: string; sortOrder: string }> = {
      limit_up: {
        conditions: [{ field: 'change_percent', operator: 'gte', value: 9.9 }],
        sortBy: 'turnover', sortOrder: 'desc',
      },
      limit_down: {
        conditions: [{ field: 'change_percent', operator: 'lte', value: -9.9 }],
        sortBy: 'turnover', sortOrder: 'desc',
      },
      high_turnover: {
        conditions: [{ field: 'turnover_rate', operator: 'gte', value: 10 }],
        sortBy: 'turnover_rate', sortOrder: 'desc',
      },
      low_pe: {
        conditions: [
          { field: 'pe_ratio', operator: 'gt', value: 0 },
          { field: 'pe_ratio', operator: 'lt', value: 15 },
        ],
        sortBy: 'pe_ratio', sortOrder: 'asc',
      },
      new_high: {
        conditions: [
          { field: 'change_percent', operator: 'gt', value: 0 },
          { field: 'turnover_rate', operator: 'gte', value: 3 },
        ],
        sortBy: 'change_percent', sortOrder: 'desc',
      },
    };

    const filter = QUICK_FILTERS[preset];
    if (!filter) {
      return res.status(400).json({
        success: false,
        error: `未知的快速筛选: ${preset}`,
      });
    }

    const safePageSize = Math.min(Math.max(pageSize, 1), 200);
    const safePage = Math.max(page, 1);

    const cacheKey = `screener:quick:${preset}:${safePage}:${safePageSize}`;
    const result = await queryCache.query(
      cacheKey,
      async () => {
        let query = buildBaseQuery('and');
        query = applyConditions(query, filter.conditions, 'and');

        const countResult = await query.clone()
          .clearSelect()
          .clearOrder()
          .count('* as total')
          .first();
        const totalCount = parseInt(String(countResult?.total || '0'));

        query = applySorting(query, filter.sortBy, filter.sortOrder);

        const offset = (safePage - 1) * safePageSize;
        const stocks = await query
          .select(...STOCK_COLUMNS)
          .limit(safePageSize)
          .offset(offset);

        return {
          stocks: stocks.map(mapStockRow),
          pagination: {
            page: safePage,
            pageSize: safePageSize,
            totalCount,
            totalPages: Math.ceil(totalCount / safePageSize),
          },
        };
      },
      15000
    );

    res.json({ success: true, data: { preset, ...result } });
  } catch (error) {
    console.error('快速筛选失败:', error);
    res.status(500).json({ success: false, error: '快速筛选失败' });
  }
});

export default router;
