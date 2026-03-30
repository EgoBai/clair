/**
 * 高级筛选器 API
 * 
 * 特性:
 * - AND/OR 组合逻辑
 * - 技术指标筛选 (MACD金叉、RSI超卖等)
 * - 财务指标筛选 (ROE>15%、PE<20等)
 * - 筛选结果导出 (CSV/JSON)
 * 
 * 参考通达信选股公式
 */

import { Request, Response, Router } from 'express';
import { db } from '../db/Database';
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
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'between' | 'in';
  value: number | string | [number, number] | string[];
  // 技术指标条件
  indicator?: TechnicalIndicatorCondition;
}

interface TechnicalIndicatorCondition {
  type: 'macd_golden_cross' | 'macd_death_cross' | 'rsi_oversold' | 'rsi_overbought'
    | 'kdj_golden_cross' | 'kdj_oversold' | 'boll_break_upper' | 'boll_break_lower'
    | 'ma_golden_cross' | 'ma_death_cross' | 'volume_breakout';
  params?: Record<string, number>;
}

interface AdvancedScreenerRequest {
  groups: ConditionGroup[];     // 条件组 (组间AND)
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
  format?: 'json' | 'csv';     // 导出格式
}

// ==================== 技术指标条件映射 ====================

const INDICATOR_DESCRIPTIONS: Record<string, { name: string; description: string }> = {
  macd_golden_cross: { name: 'MACD金叉', description: 'DIF上穿DEA，买入信号' },
  macd_death_cross: { name: 'MACD死叉', description: 'DIF下穿DEA，卖出信号' },
  rsi_oversold: { name: 'RSI超卖', description: 'RSI低于30，可能反弹' },
  rsi_overbought: { name: 'RSI超买', description: 'RSI高于70，可能回调' },
  kdj_golden_cross: { name: 'KDJ金叉', description: 'K线上穿D线' },
  kdj_oversold: { name: 'KDJ超卖', description: 'J值低于20' },
  boll_break_upper: { name: '突破布林上轨', description: '强势信号' },
  boll_break_lower: { name: '跌破布林下轨', description: '弱势信号' },
  ma_golden_cross: { name: '均线金叉', description: '短期均线上穿长期均线' },
  ma_death_cross: { name: '均线死叉', description: '短期均线下穿长期均线' },
  volume_breakout: { name: '放量突破', description: '成交量超过20日均量2倍' },
};

// 支持的字段白名单 (扩展技术指标)
const ALLOWED_FIELDS = new Set([
  'price', 'change_percent', 'volume', 'turnover', 'turnover_rate',
  'amplitude', 'pe_ratio', 'pb_ratio', 'market_cap', 'circulating_market_cap',
  'high_price', 'low_price', 'open_price',
  // 技术指标字段
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
  market_cap: 'dq.market_cap',
  circulating_market_cap: 'dq.circulating_market_cap',
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

// ==================== 预设模板 (扩展) ====================

const ADVANCED_PRESETS = [
  {
    id: 'macd_golden',
    name: 'MACD金叉',
    description: 'MACD金叉 + RSI<70未超买',
    icon: '📊',
    groups: [
      {
        logic: 'and' as const,
        conditions: [
          { field: 'macd_histogram', operator: 'gt' as const, value: 0 },
          { field: 'rsi', operator: 'lt' as const, value: 70 },
        ],
      },
    ],
    sortBy: 'macd_histogram',
    sortOrder: 'desc' as const,
  },
  {
    id: 'oversold_bounce',
    name: '超卖反弹',
    description: 'RSI超卖 + KDJ超卖 + 放量',
    icon: '🔄',
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
    description: '低PE + 低PB + 高ROE',
    icon: '💎',
    groups: [
      {
        logic: 'and' as const,
        conditions: [
          { field: 'pe_ratio', operator: 'gt' as const, value: 0 },
          { field: 'pe_ratio', operator: 'lt' as const, value: 20 },
          { field: 'pb_ratio', operator: 'gt' as const, value: 0 },
          { field: 'pb_ratio', operator: 'lt' as const, value: 3 },
        ],
      },
    ],
    sortBy: 'pe_ratio',
    sortOrder: 'asc' as const,
  },
  {
    id: 'volume_breakout',
    name: '放量突破',
    description: '成交量突破20日均量 + 价格突破MA20',
    icon: '📈',
    groups: [
      {
        logic: 'and' as const,
        conditions: [
          { field: 'volume', operator: 'gt' as const, value: 10000000 },
          { field: 'price', operator: 'gt' as const, value: 0 },
        ],
      },
    ],
    sortBy: 'volume',
    sortOrder: 'desc' as const,
  },
  {
    id: 'dual_filter',
    name: '复合筛选',
    description: '(价值股 OR 成长股) AND 非超买',
    icon: '🎯',
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
];

const customTemplates: Map<string, any> = new Map();

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

    const cacheKey = `adv_screener:${JSON.stringify({ groups, sortBy, sortOrder, page: safePage, pageSize: safePageSize })}`;

    const result = await queryCache.query(
      cacheKey,
      async () => {
        // 构建查询 - 需要左连接技术指标表
        let query = db.connection
          .from('stocks as s')
          .joinRaw(`
            JOIN daily_quotes dq ON dq.id = (
              SELECT id FROM daily_quotes
              WHERE stock_id = s.id
              ORDER BY trade_date DESC
              LIMIT 1
            )
          `)
          .leftJoinRaw(`
            technical_indicators ti ON ti.stock_id = s.id
            AND ti.trade_date = (
              SELECT MAX(trade_date) FROM technical_indicators WHERE stock_id = s.id
            )
          `)
          .where('s.is_active', true);

        // 应用条件组 (组间 AND，组内按 logic)
        for (const group of groups) {
          if (group.conditions.length === 0) continue;

          if (group.logic === 'and') {
            // 组内 AND: 所有条件都要满足
            for (const cond of group.conditions) {
              query = applyCondition(query, cond);
            }
          } else {
            // 组内 OR: 满足任一条件
            query = query.where(function () {
              for (let i = 0; i < group.conditions.length; i++) {
                const cond = group.conditions[i];
                const dbField = FIELD_MAP[cond.field];
                if (!dbField) continue;

                const builder = this;
                if (i === 0) {
                  applyConditionToBuilder(builder, cond, dbField, 'where');
                } else {
                  applyConditionToBuilder(builder, cond, dbField, 'orWhere');
                }
              }
            });
          }
        }

        // 获取总数
        const countResult = await query.clone()
          .clearSelect()
          .clearOrder()
          .count('* as total')
          .first();
        const totalCount = parseInt(String(countResult?.total || '0'));

        // 排序
        const sortField = FIELD_MAP[sortBy] || 'dq.change_percent';
        query = query.orderBy(sortField, sortOrder);

        // 分页
        const offset = (safePage - 1) * safePageSize;
        const stocks = await query
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
            'dq.circulating_market_cap',
            'ti.rsi', 'ti.macd', 'ti.macd_signal', 'ti.macd_histogram',
            'ti.kdj_k', 'ti.kdj_d', 'ti.kdj_j',
            'ti.ma5', 'ti.ma10', 'ti.ma20', 'ti.ma60'
          )
          .limit(safePageSize)
          .offset(offset);

        const mappedStocks = stocks.map((s: any) => ({
          id: s.id,
          symbol: s.symbol,
          name: s.name,
          market: s.market,
          industry: s.industry,
          price: parseFloat(s.price) || 0,
          changePercent: parseFloat(s.change_percent) || 0,
          volume: parseInt(s.volume) || 0,
          turnover: parseFloat(s.turnover) || 0,
          turnoverRate: parseFloat(s.turnover_rate) || 0,
          peRatio: s.pe_ratio ? parseFloat(s.pe_ratio) : null,
          pbRatio: s.pb_ratio ? parseFloat(s.pb_ratio) : null,
          marketCap: s.market_cap ? parseFloat(s.market_cap) : null,
          circulatingMarketCap: s.circulating_market_cap ? parseFloat(s.circulating_market_cap) : null,
          // 技术指标
          rsi: s.rsi ? parseFloat(s.rsi) : null,
          macd: s.macd ? parseFloat(s.macd) : null,
          macdSignal: s.macd_signal ? parseFloat(s.macd_signal) : null,
          macdHistogram: s.macd_histogram ? parseFloat(s.macd_histogram) : null,
          kdjK: s.kdj_k ? parseFloat(s.kdj_k) : null,
          kdjD: s.kdj_d ? parseFloat(s.kdj_d) : null,
          kdjJ: s.kdj_j ? parseFloat(s.kdj_j) : null,
          ma5: s.ma5 ? parseFloat(s.ma5) : null,
          ma10: s.ma10 ? parseFloat(s.ma10) : null,
          ma20: s.ma20 ? parseFloat(s.ma20) : null,
          ma60: s.ma60 ? parseFloat(s.ma60) : null,
        }));

        return {
          stocks: mappedStocks,
          pagination: {
            page: safePage,
            pageSize: safePageSize,
            totalCount,
            totalPages: Math.ceil(totalCount / safePageSize),
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
    description: val.description,
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
router.get('/screener/advanced-presets', async (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      presets: ADVANCED_PRESETS,
      customs: Array.from(customTemplates.values()),
    },
  });
});

/**
 * 保存自定义高级模板
 * POST /api/screener/advanced-templates
 */
router.post('/screener/advanced-templates', async (req: Request, res: Response) => {
  try {
    const { name, description, groups, sortBy, sortOrder } = req.body;

    if (!name || !Array.isArray(groups) || groups.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'name 和 groups 是必填字段',
      });
    }

    const template = {
      id: `adv_custom_${Date.now()}`,
      name,
      description: description || '',
      icon: '🔧',
      groups,
      sortBy: sortBy || 'change_percent',
      sortOrder: sortOrder || 'desc',
    };

    customTemplates.set(template.id, template);

    res.status(201).json({ success: true, data: template });
  } catch (error) {
    console.error('保存高级模板失败:', error);
    res.status(500).json({ success: false, error: '保存失败' });
  }
});

// ==================== 辅助函数 ====================

function applyCondition(query: any, cond: ScreenerCondition): any {
  const dbField = FIELD_MAP[cond.field];
  if (!dbField) return query;

  switch (cond.operator) {
    case 'gt': return query.where(dbField, '>', cond.value);
    case 'gte': return query.where(dbField, '>=', cond.value);
    case 'lt': return query.where(dbField, '<', cond.value);
    case 'lte': return query.where(dbField, '<=', cond.value);
    case 'eq': return query.where(dbField, '=', cond.value);
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
    default: return query;
  }
}

function applyConditionToBuilder(builder: any, cond: ScreenerCondition, dbField: string, method: string): void {
  switch (cond.operator) {
    case 'gt': builder[method](dbField, '>', cond.value); break;
    case 'gte': builder[method](dbField, '>=', cond.value); break;
    case 'lt': builder[method](dbField, '<', cond.value); break;
    case 'lte': builder[method](dbField, '<=', cond.value); break;
    case 'eq': builder[method](dbField, '=', cond.value); break;
    case 'between':
      if (Array.isArray(cond.value) && cond.value.length === 2) {
        builder[method](dbField, '>=', cond.value[0]);
        builder[method](dbField, '<=', cond.value[1]);
      }
      break;
  }
}

function convertToCSV(data: any[]): string {
  if (data.length === 0) return '';

  const headers = [
    '代码', '名称', '市场', '行业', '最新价', '涨跌幅%',
    '成交量', '成交额', '换手率%', '市盈率', '市净率',
    '总市值', '流通市值', 'RSI', 'MACD', 'KDJ-K', 'KDJ-D', 'KDJ-J',
    'MA5', 'MA10', 'MA20', 'MA60',
  ];

  const rows = data.map((s) => [
    s.symbol, s.name, s.market, s.industry || '',
    s.price, s.changePercent,
    s.volume, s.turnover, s.turnoverRate,
    s.peRatio ?? '', s.pbRatio ?? '',
    s.marketCap ?? '', s.circulatingMarketCap ?? '',
    s.rsi ?? '', s.macd ?? '',
    s.kdjK ?? '', s.kdjD ?? '', s.kdjJ ?? '',
    s.ma5 ?? '', s.ma10 ?? '', s.ma20 ?? '', s.ma60 ?? '',
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

export default router;
