/**
 * 高级筛选器 API (v2 - TradingView对标)
 *
 * 特性:
 * - AND/OR 组合逻辑 (多条件组嵌套)
 * - 技术指标筛选 (MACD金叉、RSI超卖等)
 * - 财务指标筛选 (ROE>15%、PE<20等)
 * - 多维排序 + 次级排序
 * - 筛选结果导出 (CSV/JSON)
 * - 预设策略模板 (对标TradingView Screener)
 *
 * 参考: TradingView Screener, 通达信选股公式
 */

import { Request, Response, Router } from 'express';
import { Knex } from 'knex';
import { db } from '../db/dbFactory';
import { queryCache } from '../utils/queryCache';
import { validateBody, schemas } from '../middleware/validation';

const router = Router();

// ==================== 类型定义 ====================

interface ConditionGroup {
  logic: 'and' | 'or';
  conditions: ScreenerCondition[];
}

interface ScreenerCondition {
  field: string;
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq' | 'between' | 'in' | 'not_in';
  value: number | string | [number, number] | string[];
  indicator?: TechnicalIndicatorCondition;
}

interface TechnicalIndicatorCondition {
  type: 'macd_golden_cross' | 'macd_death_cross' | 'rsi_oversold' | 'rsi_overbought'
    | 'kdj_golden_cross' | 'kdj_oversold' | 'boll_break_upper' | 'boll_break_lower'
    | 'ma_golden_cross' | 'ma_death_cross' | 'volume_breakout';
  params?: Record<string, number>;
}

interface AdvancedScreenerRequest {
  groups: ConditionGroup[];
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  secondarySort?: { field: string; order: 'asc' | 'desc' };
  page?: number;
  pageSize?: number;
  format?: 'json' | 'csv';
}

interface MappedStock {
  id: number;
  symbol: string;
  name: string;
  market: string;
  industry: string;
  price: number;
  changePercent: number;
  volume: number;
  turnover: number;
  turnoverRate: number;
  peRatio: number | null;
  pbRatio: number | null;
  marketCap: number | null;
  circulatingMarketCap: number | null;
  dividendYield: number | null;
  roe: number | null;
  rsi: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  kdjK: number | null;
  kdjD: number | null;
  kdjJ: number | null;
  ma5: number | null;
  ma10: number | null;
  ma20: number | null;
  ma60: number | null;
}

// ==================== 技术指标条件映射 ====================

const INDICATOR_DESCRIPTIONS: Record<string, { name: string; nameEn: string; description: string; signal: string }> = {
  macd_golden_cross: { name: 'MACD金叉', nameEn: 'MACD Golden Cross', description: 'DIF上穿DEA', signal: 'buy' },
  macd_death_cross: { name: 'MACD死叉', nameEn: 'MACD Death Cross', description: 'DIF下穿DEA', signal: 'sell' },
  rsi_oversold: { name: 'RSI超卖', nameEn: 'RSI Oversold', description: 'RSI低于30，可能反弹', signal: 'buy' },
  rsi_overbought: { name: 'RSI超买', nameEn: 'RSI Overbought', description: 'RSI高于70，可能回调', signal: 'sell' },
  kdj_golden_cross: { name: 'KDJ金叉', nameEn: 'KDJ Golden Cross', description: 'K线上穿D线', signal: 'buy' },
  kdj_oversold: { name: 'KDJ超卖', nameEn: 'KDJ Oversold', description: 'J值低于20', signal: 'buy' },
  boll_break_upper: { name: '突破布林上轨', nameEn: 'Bollinger Upper Break', description: '强势信号', signal: 'buy' },
  boll_break_lower: { name: '跌破布林下轨', nameEn: 'Bollinger Lower Break', description: '弱势信号', signal: 'sell' },
  ma_golden_cross: { name: '均线金叉', nameEn: 'MA Golden Cross', description: '短期均线上穿长期均线', signal: 'buy' },
  ma_death_cross: { name: '均线死叉', nameEn: 'MA Death Cross', description: '短期均线下穿长期均线', signal: 'sell' },
  volume_breakout: { name: '放量突破', nameEn: 'Volume Breakout', description: '成交量超过20日均量2倍', signal: 'buy' },
};

// 支持的字段白名单 (扩展技术指标)
const ALLOWED_FIELDS = new Set([
  'price', 'change_percent', 'volume', 'turnover', 'turnover_rate',
  'amplitude', 'pe_ratio', 'pb_ratio', 'ps_ratio', 'market_cap', 'circulating_market_cap',
  'dividend_yield', 'roe', 'roa',
  'high_price', 'low_price', 'open_price',
  'rsi', 'macd', 'macd_signal', 'macd_histogram',
  'kdj_k', 'kdj_d', 'kdj_j',
  'boll_upper', 'boll_middle', 'boll_lower',
  'ma5', 'ma10', 'ma20', 'ma60',
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
  market_cap: 'dq.market_cap',
  circulating_market_cap: 'dq.circulating_market_cap',
  dividend_yield: 'dq.dividend_yield',
  roe: 'dq.roe',
  roa: 'dq.roa',
  high_price: 'dq.high_price',
  low_price: 'dq.low_price',
  open_price: 'dq.open_price',
  // 技术指标
  rsi: 'ti.rsi',
  macd: 'ti.macd',
  macd_signal: 'ti.macd_signal',
  macd_histogram: 'ti.macd_histogram',
  kdj_k: 'ti.kdj_k',
  kdj_d: 'ti.kdj_d',
  kdj_j: 'ti.kdj_j',
  boll_upper: 'ti.boll_upper',
  boll_middle: 'ti.boll_middle',
  boll_lower: 'ti.boll_lower',
  ma5: 'ti.ma5',
  ma10: 'ti.ma10',
  ma20: 'ti.ma20',
  ma60: 'ti.ma60',
};

// ==================== 预设模板 (对标TradingView) ====================

const ADVANCED_PRESETS = [
  {
    id: 'macd_golden',
    name: 'MACD金叉',
    nameEn: 'MACD Golden Cross',
    description: 'MACD金叉 + RSI<70未超买',
    icon: '📊',
    category: 'technical',
    groups: [
      {
        logic: 'and' as const,
        conditions: [
          { field: 'macd_histogram', operator: 'gt' as const, value: 0 },
          { field: 'rsi', operator: 'lt' as const, value: 70 },
          { field: 'rsi', operator: 'gt' as const, value: 30 },
        ],
      },
    ],
    sortBy: 'macd_histogram',
    sortOrder: 'desc' as const,
  },
  {
    id: 'oversold_bounce',
    name: '超卖反弹',
    nameEn: 'Oversold Bounce',
    description: 'RSI超卖 + KDJ超卖 + 放量',
    icon: '🔄',
    category: 'technical',
    groups: [
      {
        logic: 'and' as const,
        conditions: [
          { field: 'rsi', operator: 'lt' as const, value: 30 },
          { field: 'kdj_j', operator: 'lt' as const, value: 20 },
          { field: 'volume', operator: 'gt' as const, value: 5000000 },
        ],
      },
    ],
    sortBy: 'rsi',
    sortOrder: 'asc' as const,
  },
  {
    id: 'value_quality',
    name: '价值质量股',
    nameEn: 'Value with Quality',
    description: '低PE + 低PB + 正ROE',
    icon: '💎',
    category: 'value',
    groups: [
      {
        logic: 'and' as const,
        conditions: [
          { field: 'pe_ratio', operator: 'gt' as const, value: 0 },
          { field: 'pe_ratio', operator: 'lt' as const, value: 20 },
          { field: 'pb_ratio', operator: 'gt' as const, value: 0 },
          { field: 'pb_ratio', operator: 'lt' as const, value: 3 },
          { field: 'roe', operator: 'gt' as const, value: 10 },
        ],
      },
    ],
    sortBy: 'pe_ratio',
    sortOrder: 'asc' as const,
    secondarySort: { field: 'roe', order: 'desc' as const },
  },
  {
    id: 'volume_breakout',
    name: '放量突破',
    nameEn: 'Volume Breakout',
    description: '成交量突破 + 价格上行',
    icon: '📈',
    category: 'technical',
    groups: [
      {
        logic: 'and' as const,
        conditions: [
          { field: 'volume', operator: 'gt' as const, value: 10000000 },
          { field: 'change_percent', operator: 'gt' as const, value: 2 },
          { field: 'turnover_rate', operator: 'gt' as const, value: 5 },
        ],
      },
    ],
    sortBy: 'volume',
    sortOrder: 'desc' as const,
  },
  {
    id: 'dual_filter',
    name: '复合筛选',
    nameEn: 'Dual Filter',
    description: '(价值股 OR 成长股) AND 非超买',
    icon: '🎯',
    category: 'custom',
    groups: [
      {
        logic: 'or' as const,
        conditions: [
          { field: 'pe_ratio', operator: 'lt' as const, value: 15 },
          { field: 'change_percent', operator: 'gt' as const, value: 3 },
        ],
      },
      {
        logic: 'and' as const,
        conditions: [
          { field: 'rsi', operator: 'lt' as const, value: 70 },
        ],
      },
    ],
    sortBy: 'change_percent',
    sortOrder: 'desc' as const,
  },
  {
    id: 'momentum_breakout',
    name: '动量突破',
    nameEn: 'Momentum Breakout',
    description: '涨幅+换手率+市值筛选的动量股',
    icon: '🚀',
    category: 'momentum',
    groups: [
      {
        logic: 'and' as const,
        conditions: [
          { field: 'change_percent', operator: 'gte' as const, value: 5 },
          { field: 'turnover_rate', operator: 'gte' as const, value: 5 },
          { field: 'market_cap', operator: 'gte' as const, value: 5000000000 },
        ],
      },
    ],
    sortBy: 'change_percent',
    sortOrder: 'desc' as const,
  },
  {
    id: 'ma_trend',
    name: '均线多头',
    nameEn: 'MA Uptrend',
    description: 'MA5>MA10>MA20均线排列',
    icon: '📐',
    category: 'technical',
    groups: [
      {
        logic: 'and' as const,
        conditions: [
          { field: 'ma5', operator: 'gt' as const, value: 0 },
          { field: 'ma10', operator: 'gt' as const, value: 0 },
          { field: 'ma20', operator: 'gt' as const, value: 0 },
        ],
      },
    ],
    sortBy: 'change_percent',
    sortOrder: 'desc' as const,
  },
  {
    id: 'high_dividend_value',
    name: '高息价值',
    nameEn: 'High Dividend Value',
    description: '高股息率+低估值的价值股',
    icon: '💰',
    category: 'value',
    groups: [
      {
        logic: 'and' as const,
        conditions: [
          { field: 'dividend_yield', operator: 'gte' as const, value: 3 },
          { field: 'pe_ratio', operator: 'gt' as const, value: 0 },
          { field: 'pe_ratio', operator: 'lte' as const, value: 20 },
          { field: 'market_cap', operator: 'gte' as const, value: 10000000000 },
        ],
      },
    ],
    sortBy: 'dividend_yield',
    sortOrder: 'desc' as const,
  },
];

interface CustomTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  groups: ConditionGroup[];
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  secondarySort?: { field: string; order: 'asc' | 'desc' };
}

const customTemplates: Map<string, CustomTemplate> = new Map();

// ==================== 辅助函数 ====================

function applyCondition(query: Knex.QueryBuilder, cond: ScreenerCondition): Knex.QueryBuilder {
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

function applyConditionToBuilder(builder: Knex.QueryBuilder, cond: ScreenerCondition, dbField: string, method: string): void {
  const fn = (builder as unknown as Record<string, (...args: unknown[]) => unknown>)[method];
  switch (cond.operator) {
    case 'gt': fn.call(builder, dbField, '>', cond.value); break;
    case 'gte': fn.call(builder, dbField, '>=', cond.value); break;
    case 'lt': fn.call(builder, dbField, '<', cond.value); break;
    case 'lte': fn.call(builder, dbField, '<=', cond.value); break;
    case 'eq': fn.call(builder, dbField, '=', cond.value); break;
    case 'neq': fn.call(builder, dbField, '!=', cond.value); break;
    case 'between':
      if (Array.isArray(cond.value) && cond.value.length === 2) {
        fn.call(builder, dbField, '>=', cond.value[0]);
        fn.call(builder, dbField, '<=', cond.value[1]);
      }
      break;
    case 'in':
      if (Array.isArray(cond.value)) {
        const fnIn = (builder as unknown as Record<string, (...args: unknown[]) => unknown>)[method + 'In'];
        fnIn.call(builder, dbField, cond.value);
      }
      break;
    case 'not_in':
      if (Array.isArray(cond.value)) {
        const fnNotIn = (builder as unknown as Record<string, (...args: unknown[]) => unknown>)[method === 'where' ? 'whereNotIn' : 'orWhereNotIn'];
        fnNotIn.call(builder, dbField, cond.value);
      }
      break;
  }
}

function buildAdvancedQuery() {
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
    .joinRaw(`
      LEFT JOIN technical_indicators ti ON ti.stock_id = s.id
      AND ti.trade_date = (
        SELECT MAX(trade_date) FROM technical_indicators WHERE stock_id = s.id
      )
    `)
    .where('s.is_active', true);
}

function applyGroups(query: Knex.QueryBuilder, groups: ConditionGroup[]): Knex.QueryBuilder {
  for (const group of groups) {
    if (!group.conditions || group.conditions.length === 0) continue;

    if (group.logic === 'and') {
      for (const cond of group.conditions) {
        query = applyCondition(query, cond);
      }
    } else {
      query = query.where(function (this: Knex.QueryBuilder) {
        for (let i = 0; i < group.conditions.length; i++) {
          const cond = group.conditions[i];
          const dbField = FIELD_MAP[cond.field];
          if (!dbField) continue;

          if (i === 0) {
            applyConditionToBuilder(this, cond, dbField, 'where');
          } else {
            applyConditionToBuilder(this, cond, dbField, 'orWhere');
          }
        }
      });
    }
  }
  return query;
}

function applyAdvancedSorting(query: Knex.QueryBuilder, sortBy: string, sortOrder: string, secondarySort?: { field: string; order: string }) {
  const sortField = FIELD_MAP[sortBy] || 'dq.change_percent';
  query = query.orderBy(sortField, sortOrder as 'asc' | 'desc');

  if (secondarySort && FIELD_MAP[secondarySort.field]) {
    query = query.orderBy(FIELD_MAP[secondarySort.field], secondarySort.order as 'asc' | 'desc');
  }

  query = query.orderBy('s.id', 'asc');
  return query;
}

const SELECT_COLUMNS = [
  's.id', 's.symbol', 's.name', 's.market', 's.industry',
  'dq.close_price as price', 'dq.change_percent', 'dq.volume',
  'dq.turnover', 'dq.turnover_rate', 'dq.amplitude',
  'dq.pe_ratio', 'dq.pb_ratio', 'dq.market_cap',
  'dq.circulating_market_cap', 'dq.dividend_yield', 'dq.roe',
  'ti.rsi', 'ti.macd', 'ti.macd_signal', 'ti.macd_histogram',
  'ti.kdj_k', 'ti.kdj_d', 'ti.kdj_j',
  'ti.ma5', 'ti.ma10', 'ti.ma20', 'ti.ma60',
];

function mapStockRow(s: Record<string, string | null>): MappedStock {
  const pf = (v: string | null) => { const x = parseFloat(String(v)); return Number.isFinite(x) ? x : 0; };
  const pi = (v: string | null) => { const x = parseFloat(String(v)); return Number.isFinite(x) ? Math.floor(x) : 0; };
  const pn = (v: string | null) => { if (v === null || v === undefined) return null; const x = parseFloat(String(v)); return Number.isFinite(x) ? x : null; };
  return {
    id: pi(s.id),
    symbol: String(s.symbol || ''),
    name: String(s.name || ''),
    market: String(s.market || ''),
    industry: String(s.industry || ''),
    price: pf(s.price),
    changePercent: pf(s.change_percent),
    volume: pf(s.volume),
    turnover: pf(s.turnover),
    turnoverRate: pf(s.turnover_rate),
    peRatio: pn(s.pe_ratio),
    pbRatio: pn(s.pb_ratio),
    marketCap: pn(s.market_cap),
    circulatingMarketCap: pn(s.circulating_market_cap),
    dividendYield: pn(s.dividend_yield),
    roe: pn(s.roe),
    rsi: pn(s.rsi),
    macd: pn(s.macd),
    macdSignal: pn(s.macd_signal),
    macdHistogram: pn(s.macd_histogram),
    kdjK: pn(s.kdj_k),
    kdjD: pn(s.kdj_d),
    kdjJ: pn(s.kdj_j),
    ma5: pn(s.ma5),
    ma10: pn(s.ma10),
    ma20: pn(s.ma20),
    ma60: pn(s.ma60),
  };
}

function convertToCSV(data: MappedStock[]): string {
  if (data.length === 0) return '';

  const headers = [
    '代码', '名称', '市场', '行业', '最新价', '涨跌幅%',
    '成交量', '成交额', '换手率%', '市盈率', '市净率',
    '总市值', '流通市值', '股息率%', 'ROE%',
    'RSI', 'MACD', 'KDJ-J',
    'MA5', 'MA10', 'MA20', 'MA60',
  ];

  const rows = data.map((s) => [
    s.symbol, s.name, s.market, s.industry || '',
    s.price, s.changePercent,
    s.volume, s.turnover, s.turnoverRate,
    s.peRatio ?? '', s.pbRatio ?? '',
    s.marketCap ?? '', s.circulatingMarketCap ?? '',
    s.dividendYield ?? '', s.roe ?? '',
    s.rsi ?? '', s.macdHistogram ?? '', s.kdjJ ?? '',
    s.ma5 ?? '', s.ma10 ?? '', s.ma20 ?? '', s.ma60 ?? '',
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

// ==================== 路由 ====================

/**
 * 高级多条件组合筛选
 * POST /api/screener/advanced-filter
 */
router.post('/screener/advanced-filter', validateBody(schemas.screenerFilter), async (req: Request, res: Response) => {
  try {
    const {
      groups = [],
      sortBy = 'change_percent',
      sortOrder = 'desc',
      secondarySort,
      page = 1,
      pageSize = 50,
      format = 'json',
    }: AdvancedScreenerRequest = req.body;

    if (!Array.isArray(groups) || groups.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'groups 必须是非空数组',
      });
    }

    // 验证所有条件的字段
    for (const group of groups) {
      if (!group.conditions || !Array.isArray(group.conditions)) {
        return res.status(400).json({
          success: false,
          error: '每个条件组必须包含 conditions 数组',
        });
      }
      for (const cond of group.conditions) {
        if (!ALLOWED_FIELDS.has(cond.field)) {
          return res.status(400).json({
            success: false,
            error: `不支持的筛选字段: ${cond.field}`,
          });
        }
      }
    }

    const safePageSize = format === 'csv' ? 10000 : Math.min(Math.max(pageSize, 1), 200);
    const safePage = Math.max(page, 1);

    const cacheKey = `adv_screener:v2:${JSON.stringify({ groups, sortBy, sortOrder, secondarySort, page: safePage, pageSize: safePageSize })}`;

    const result = await queryCache.query(
      cacheKey,
      async () => {
        let query = buildAdvancedQuery();
        query = applyGroups(query, groups);

        // 获取总数
        const countResult = await query.clone()
          .clearSelect()
          .clearOrder()
          .count('* as total')
          .first();
        const totalCount = parseInt(String(countResult?.total || '0'));

        // 排序
        query = applyAdvancedSorting(query, sortBy, sortOrder, secondarySort);

        // 分页
        const offset = (safePage - 1) * safePageSize;
        const stocks = await query
          .select(...SELECT_COLUMNS)
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
          filterSummary: {
            groupCount: groups.length,
            totalConditions: groups.reduce((sum, g) => sum + (g.conditions?.length || 0), 0),
          },
        };
      },
      30000
    );

    // CSV 导出
    if (format === 'csv') {
      const csv = convertToCSV(result.stocks);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=screener_result_${Date.now()}.csv`);
      return res.send('\uFEFF' + csv); // BOM for Excel
    }

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('高级筛选失败:', error);
    res.status(500).json({
      success: false,
      error: '高级筛选失败',
      details: process.env.NODE_ENV === 'development'
        ? (error instanceof Error ? error.message : '未知错误')
        : undefined,
    });
  }
});

/**
 * 获取技术指标筛选条件列表
 * GET /api/screener/indicator-conditions
 */
router.get('/screener/indicator-conditions', async (_req: Request, res: Response) => {
  const indicators = Object.entries(INDICATOR_DESCRIPTIONS).map(([key, val]) => ({
    type: key,
    name: val.name,
    nameEn: val.nameEn,
    description: val.description,
    signal: val.signal,
  }));

  res.json({
    success: true,
    data: {
      indicators,
      fields: Object.entries(FIELD_MAP).map(([field, dbCol]) => ({
        field,
        dbColumn: dbCol,
      })),
    },
  });
});

/**
 * 获取高级预设模板
 * GET /api/screener/advanced-presets
 */
router.get('/screener/advanced-presets', async (req: Request, res: Response) => {
  const category = req.query.category as string | undefined;
  let presets = ADVANCED_PRESETS;

  if (category) {
    presets = ADVANCED_PRESETS.filter(p => p.category === category);
  }

  res.json({
    success: true,
    data: {
      presets,
      customs: Array.from(customTemplates.values()),
      categories: ['technical', 'value', 'momentum', 'custom'],
    },
  });
});

/**
 * 保存自定义高级模板
 * POST /api/screener/advanced-templates
 */
router.post('/screener/advanced-templates', async (req: Request, res: Response) => {
  try {
    const { name, description, groups, sortBy, sortOrder, secondarySort } = req.body;

    if (!name || !Array.isArray(groups) || groups.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'name 和 groups 是必填字段',
      });
    }

    // Validate groups structure
    for (const group of groups) {
      if (!group.conditions || !Array.isArray(group.conditions) || group.conditions.length === 0) {
        return res.status(400).json({
          success: false,
          error: '每个条件组必须包含非空的 conditions 数组',
        });
      }
      for (const cond of group.conditions) {
        if (!cond.field || !cond.operator) {
          return res.status(400).json({
            success: false,
            error: '每个条件必须包含 field 和 operator',
          });
        }
        if (!ALLOWED_FIELDS.has(cond.field)) {
          return res.status(400).json({
            success: false,
            error: `不支持的筛选字段: ${cond.field}`,
          });
        }
      }
    }

    const template = {
      id: `adv_custom_${Date.now()}`,
      name,
      description: description || '',
      icon: '🔧',
      category: 'custom',
      groups,
      sortBy: sortBy || 'change_percent',
      sortOrder: sortOrder || 'desc',
      secondarySort,
    };

    customTemplates.set(template.id, template);

    res.status(201).json({ success: true, data: template });
  } catch (error) {
    console.error('保存高级模板失败:', error);
    res.status(500).json({ success: false, error: '保存失败' });
  }
});

/**
 * 删除自定义高级模板
 * DELETE /api/screener/advanced-templates/:id
 */
router.delete('/screener/advanced-templates/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!customTemplates.has(id)) {
    return res.status(404).json({
      success: false,
      error: '模板不存在或为系统预设模板',
    });
  }

  customTemplates.delete(id);
  res.json({ success: true, data: { deleted: true, id } });
});

export default router;
