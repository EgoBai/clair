/**
 * 输入验证中间件
 * 使用 Joi 验证请求参数，防止注入攻击和非法数据
 */

import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';

// ==================== Schema 定义 ====================

// --- 股票相关 ---
const stockSearchSchema = Joi.object({
  symbol: Joi.string().max(20).pattern(/^[a-zA-Z0-9.]*$/).optional(),
  name: Joi.string().max(100).optional(),
  market: Joi.string().valid('SH', 'SZ', 'BJ').optional(),
  industry: Joi.string().max(100).optional(),
  isActive: Joi.string().valid('true', 'false').optional(),
  page: Joi.number().integer().min(1).max(10000).default(1),
  pageSize: Joi.number().integer().min(1).max(6000).default(20),
  sortBy: Joi.string().valid('symbol', 'name', 'market', 'industry', 'created_at').default('symbol'),
  sortOrder: Joi.string().valid('asc', 'desc').default('asc'),
});

const stockSymbolSchema = Joi.object({
  symbol: Joi.string().max(20).pattern(/^[a-zA-Z0-9.]+$/).required(),
});

// --- 财务报表 ---
const financialsQuerySchema = Joi.object({
  symbol: Joi.string().max(20).pattern(/^[a-zA-Z0-9.]*$/).optional(),
  periods: Joi.number().integer().min(1).max(10).default(4),
});
const financialsTrendsQuerySchema = Joi.object({
  symbol: Joi.string().max(20).pattern(/^[a-zA-Z0-9.]*$/).optional(),
  metric: Joi.string().valid('roe', 'roa', 'netMargin', 'grossMargin', 'currentRatio', 'debtToAssetRatio', 'eps', 'revenueGrowth', 'profitGrowth').default('roe'),
  periods: Joi.number().integer().min(1).max(12).default(8),
});

const quoteQuerySchema = Joi.object({
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().optional(),
  limit: Joi.number().integer().min(1).max(1000).default(120),
});

const batchQuotesSchema = Joi.object({
  symbols: Joi.array().items(Joi.string().max(20)).min(1).max(100).required(),
});

// --- 市场相关 ---
const marketQuerySchema = Joi.object({
  date: Joi.date().iso().optional(),
  limit: Joi.number().integer().min(1).max(100).default(10),
});

const sectorQuerySchema = Joi.object({
  date: Joi.date().iso().optional(),
  sortBy: Joi.string().valid('industry', 'avgChangePercent', 'totalMarketCap', 'stockCount').default('avgChangePercent'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});

// --- 新闻相关 ---
const newsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).max(10000).default(1),
  pageSize: Joi.number().integer().min(1).max(50).default(20),
  category: Joi.string().valid('market', 'company', 'policy', 'global', 'analysis', 'all').optional(),
  symbol: Joi.string().max(20).optional(),
  sentiment: Joi.string().valid('positive', 'negative', 'neutral', 'all').optional(),
  q: Joi.string().max(200).optional(),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

// --- 指标相关 ---
const indicatorQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(500).default(120),
});

// --- 资金流向 ---
const fundFlowQuerySchema = Joi.object({
  days: Joi.number().integer().min(1).max(365).default(10),
});

const fundFlowBatchSchema = Joi.object({
  symbols: Joi.array().items(Joi.string().max(20)).min(1).max(30).required(),
});

const industryFlowQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(50).default(20),
});

// --- ETF ---
const etfListQuerySchema = Joi.object({
  type: Joi.string().valid('index', 'sector', 'qdii', 'commodity', 'bond', 'theme').optional(),
  sortBy: Joi.string().valid('totalAssets', 'nav', 'changePercent', 'volume', 'turnover', 'premiumRate', 'expenseRatio', 'dividendYield').default('totalAssets'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});

const etfSymbolSchema = Joi.object({
  symbol: Joi.string().max(10).pattern(/^[0-9]+$/).required(),
});

const etfNavHistorySchema = Joi.object({
  days: Joi.number().integer().min(1).max(365).default(30),
});

// --- 大宗交易 ---
const blockTradeQuerySchema = Joi.object({
  date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).optional(),
  symbol: Joi.string().max(20).optional(),
  page: Joi.number().integer().min(1).max(1000).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(20),
});

const blockTradeHistorySchema = Joi.object({
  days: Joi.number().integer().min(1).max(365).default(30),
});

// --- 限售股 ---
const lockupCalendarSchema = Joi.object({
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().optional(),
  page: Joi.number().integer().min(1).max(1000).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(20),
});

const lockupRankSchema = Joi.object({
  limit: Joi.number().integer().min(1).max(50).default(10),
  sortBy: Joi.string().valid('unlockValue', 'unlockShares', 'unlockDate').default('unlockValue'),
});

// --- 融资融券 ---
const marginSymbolSchema = Joi.object({
  symbol: Joi.string().max(20).pattern(/^[a-zA-Z0-9.]+$/).required(),
});

const marginRankSchema = Joi.object({
  type: Joi.string().valid('finance', 'securities', 'net').default('finance'),
});

// --- 投资组合 ---
const portfolioIdSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
});

const portfolioCreateSchema = Joi.object({
  name: Joi.string().min(1).max(50).required(),
  description: Joi.string().max(200).optional().allow(''),
  cashBalance: Joi.number().min(0).max(1e12).default(100000),
});

const positionAddSchema = Joi.object({
  symbol: Joi.string().max(20).pattern(/^[a-zA-Z0-9.]+$/).required(),
  name: Joi.string().max(50).optional(),
  quantity: Joi.number().integer().min(1).max(10000000).required(),
  costPrice: Joi.number().min(0.01).max(100000).required(),
  buyDate: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: Joi.string().max(200).optional().allow(''),
});

const positionUpdateSchema = Joi.object({
  quantity: Joi.number().integer().min(1).max(10000000).optional(),
  costPrice: Joi.number().min(0.01).max(100000).optional(),
  notes: Joi.string().max(200).optional().allow(''),
});

const portfolioPositionSymbolSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
  symbol: Joi.string().max(20).pattern(/^[a-zA-Z0-9.]+$/).required(),
});

// --- 自选股 ---
const watchlistQuerySchema = Joi.object({
  userId: Joi.number().integer().positive().default(1),
  groupId: Joi.string().max(50).optional(),
});

const watchlistAddSchema = Joi.object({
  symbol: Joi.string().max(20).pattern(/^[a-zA-Z0-9.]+$/).required(),
  notes: Joi.string().max(200).optional().allow(''),
  groupId: Joi.string().max(50).optional().allow(null).default('default'),
  userId: Joi.number().integer().positive().default(1),
});

const watchlistUpdateSchema = Joi.object({
  notes: Joi.string().max(200).optional().allow(''),
  groupId: Joi.string().max(50).optional(),
  sortIndex: Joi.number().integer().min(0).optional(),
  userId: Joi.number().integer().positive().default(1),
});

const watchlistReorderSchema = Joi.object({
  items: Joi.array().items(
    Joi.object({
      symbol: Joi.string().max(20).pattern(/^[a-zA-Z0-9.]+$/).required(),
      sortIndex: Joi.number().integer().min(0).required(),
      groupId: Joi.string().max(50).optional(),
    })
  ).min(1).max(200).required(),
  userId: Joi.number().integer().positive().default(1),
});

const watchlistGroupCreateSchema = Joi.object({
  name: Joi.string().min(1).max(20).required(),
  userId: Joi.number().integer().positive().default(1),
});

const watchlistGroupDeleteSchema = Joi.object({
  id: Joi.string().max(50).required(),
});

// --- 选股器 ---
const screenerConditionSchema = Joi.object({
  field: Joi.string().valid(
    'price', 'change_percent', 'volume', 'turnover', 'turnover_rate',
    'amplitude', 'pe_ratio', 'pb_ratio', 'ps_ratio', 'market_cap', 'circulating_market_cap',
    'dividend_yield', 'roe', 'roa', 'eps',
    'high_price', 'low_price', 'open_price',
    'rsi', 'macd', 'macd_signal', 'macd_histogram',
    'kdj_k', 'kdj_d', 'kdj_j',
    'boll_upper', 'boll_middle', 'boll_lower',
    'ma5', 'ma10', 'ma20', 'ma60'
  ).required(),
  operator: Joi.string().valid('gt', 'gte', 'lt', 'lte', 'eq', 'neq', 'between', 'in', 'not_in').required(),
  value: Joi.alternatives().try(
    Joi.number(),
    Joi.string().max(100),
    Joi.array().items(Joi.number()).length(2),
    Joi.array().items(Joi.string().max(50))
  ).required(),
});

const screenerFilterSchema = Joi.object({
  conditions: Joi.array().items(screenerConditionSchema).max(20).default([]),
  logic: Joi.string().valid('and', 'or').default('and'),
  groups: Joi.array().items(Joi.object({
    logic: Joi.string().valid('and', 'or').required(),
    conditions: Joi.array().items(screenerConditionSchema).max(20).required(),
  })).max(10).optional(),
  sortBy: Joi.string().max(50).default('change_percent'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
  secondarySort: Joi.object({
    field: Joi.string().max(50).required(),
    order: Joi.string().valid('asc', 'desc').required(),
  }).optional(),
  page: Joi.number().integer().min(1).max(10000).default(1),
  pageSize: Joi.number().integer().min(1).max(200).default(50),
  format: Joi.string().valid('json', 'csv').default('json'),
});

const screenerTemplateSaveSchema = Joi.object({
  name: Joi.string().min(1).max(50).required(),
  description: Joi.string().max(200).optional().allow(''),
  conditions: Joi.array().items(screenerConditionSchema).min(1).max(20).required(),
  sortBy: Joi.string().max(50).default('change_percent'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
  secondarySort: Joi.object({
    field: Joi.string().max(50).required(),
    order: Joi.string().valid('asc', 'desc').required(),
  }).optional(),
});

const screenerTemplateRunSchema = Joi.object({
  page: Joi.number().integer().min(1).max(10000).default(1),
  pageSize: Joi.number().integer().min(1).max(200).default(50),
});

// --- 预警 ---
const alertCreateSchema = Joi.object({
  symbol: Joi.string().max(20).pattern(/^[a-zA-Z0-9.]+$/).required(),
  alertType: Joi.string().valid(
    'price_above', 'price_below', 'change_above', 'change_below', 
    'volume_surge', 'indicator', 'composite'
  ).required(),
  threshold: Joi.number().required(),
  message: Joi.string().max(200).optional().allow(''),
  userId: Joi.number().integer().positive().default(1),
  // 指标告警
  indicatorType: Joi.string().valid(
    'macd_cross_up', 'macd_cross_down', 'rsi_above', 'rsi_below',
    'bollinger_upper', 'bollinger_lower', 'ma_cross_up', 'ma_cross_down', 'volume_ma_above'
  ).optional(),
  indicatorParams: Joi.object().optional(),
  // 复合条件
  compositeOperator: Joi.string().valid('and', 'or').optional(),
  subConditions: Joi.array().items(Joi.object({
    alertType: Joi.string().required(),
    threshold: Joi.number().required(),
    indicatorType: Joi.string().optional(),
  })).optional(),
  // 触发模式
  triggerMode: Joi.string().valid('once', 'once_per_bar', 'every_time').optional(),
  // 通知渠道
  channels: Joi.array().items(Joi.string().valid('websocket', 'email', 'sms')).optional(),
});

const alertUpdateSchema = Joi.object({
  threshold: Joi.number().optional(),
  isActive: Joi.boolean().optional(),
  message: Joi.string().max(200).optional().allow(''),
  triggerMode: Joi.string().valid('once', 'once_per_bar', 'every_time').optional(),
  channels: Joi.array().items(Joi.string().valid('websocket', 'email', 'sms')).optional(),
  indicatorType: Joi.string().valid(
    'macd_cross_up', 'macd_cross_down', 'rsi_above', 'rsi_below',
    'bollinger_upper', 'bollinger_lower', 'ma_cross_up', 'ma_cross_down', 'volume_ma_above'
  ).optional(),
  indicatorParams: Joi.object().optional(),
});

const alertQuerySchema = Joi.object({
  userId: Joi.number().integer().positive().default(1),
  isActive: Joi.string().valid('true', 'false').optional(),
  symbol: Joi.string().max(20).optional(),
  page: Joi.number().integer().min(1).max(10000).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(20),
});

const alertHistorySchema = Joi.object({
  page: Joi.number().integer().min(1).max(10000).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(20),
  symbol: Joi.string().max(20).optional(),
});

const alertBatchDeleteSchema = Joi.object({
  ids: Joi.array().items(Joi.number().integer().positive()).min(1).max(100).required(),
});

const alertIdSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
});

// --- 回测 ---
const backtestRunSchema = Joi.object({
  strategy: Joi.string().valid('ma_cross', 'rsi_reversal', 'macd_trend', 'breakout', 'custom').required(),
  symbol: Joi.string().max(20).pattern(/^[a-zA-Z0-9.]+$/).required(),
  startDate: Joi.date().iso().required(),
  endDate: Joi.date().iso().required(),
  initialCapital: Joi.number().min(10000).max(1e12).default(1000000),
  parameters: Joi.object({
    shortPeriod: Joi.number().integer().min(1).max(100).optional(),
    longPeriod: Joi.number().integer().min(1).max(300).optional(),
    rsiPeriod: Joi.number().integer().min(1).max(100).optional(),
    rsiOverbought: Joi.number().min(50).max(100).optional(),
    rsiOversold: Joi.number().min(0).max(50).optional(),
  }).optional(),
});

const backtestCompareSchema = Joi.object({
  strategies: Joi.array().items(
    Joi.object({
      strategy: Joi.string().valid('ma_cross', 'rsi_reversal', 'macd_trend', 'breakout').required(),
      parameters: Joi.object().optional(),
    })
  ).min(2).max(5).required(),
  symbol: Joi.string().max(20).pattern(/^[a-zA-Z0-9.]+$/).required(),
  startDate: Joi.date().iso().required(),
  endDate: Joi.date().iso().required(),
  initialCapital: Joi.number().min(10000).max(1e12).default(1000000),
});

// --- AI分析 ---
const aiAnalyzeSchema = Joi.object({
  symbol: Joi.string().max(20).pattern(/^[a-zA-Z0-9.]+$/).required(),
});

const aiAlertQuerySchema = Joi.object({
  severity: Joi.string().valid('high', 'medium', 'low').optional(),
  type: Joi.string().valid(
    'abnormal_volume', 'limit_up', 'limit_down',
    'breakout', 'breakdown', 'macd_cross', 'rsi_extreme', 'sector_rotation'
  ).optional(),
  limit: Joi.number().integer().min(1).max(50).default(20),
});

// --- 市场统计 ---
const marketStatsQuerySchema = Joi.object({
  date: Joi.date().iso().optional(),
  period: Joi.string().valid('1d', '5d', '1m', '3m', '6m', '1y').default('1d'),
});

// --- 订单簿 ---
const orderBookSchema = Joi.object({
  symbol: Joi.string().max(20).pattern(/^[a-zA-Z0-9.]+$/).required(),
});

// --- 性能监控 ---
const performanceReportSchema = Joi.object({
  metric: Joi.string().max(50).required(),
  value: Joi.number().min(0).max(3600000).required(), // max 1 hour in ms
  page: Joi.string().max(100).optional(),
  timestamp: Joi.number().min(0).optional(),
});

// --- 社交 ---
const commentCreateSchema = Joi.object({
  stockSymbol: Joi.string().max(20).required(),
  content: Joi.string().min(1).max(2000).required(),
  parentId: Joi.number().integer().positive().allow(null).optional(),
  userId: Joi.number().integer().positive().default(1),
});

const commentQuerySchema = Joi.object({
  stockSymbol: Joi.string().max(20).optional(),
  userId: Joi.number().integer().positive().optional(),
  sortBy: Joi.string().valid('newest', 'oldest', 'popular').default('newest'),
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(50).default(20),
});

const followSchema = Joi.object({
  followeeId: Joi.number().integer().positive().required(),
  followerId: Joi.number().integer().positive().default(1),
});

const followStatusQuerySchema = Joi.object({
  followerId: Joi.number().integer().positive().default(1),
  followeeId: Joi.number().integer().positive().required(),
});

const userProfileSchema = Joi.object({
  username: Joi.string().max(50).required(),
});

// --- 财务报表 ---
const financialQuerySchema = Joi.object({
  symbol: Joi.string().max(20).pattern(/^[a-zA-Z0-9.]+$/).required(),
  period: Joi.string().pattern(/^\d{4}(Q[1-4]|H1|FY)$/).optional(),
  years: Joi.number().integer().min(1).max(10).default(3),
});

// ==================== 验证中间件工厂 ====================

/**
 * 验证查询参数
 */
export function validateQuery(schema: Joi.ObjectSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const details = error.details.map((d) => d.message).join('; ');
      return res.status(400).json({
        success: false,
        error: '请求参数验证失败',
        details,
      });
    }

    req.query = value;
    next();
  };
}

/**
 * 验证请求体
 */
export function validateBody(schema: Joi.ObjectSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const details = error.details.map((d) => d.message).join('; ');
      return res.status(400).json({
        success: false,
        error: '请求体验证失败',
        details,
      });
    }

    req.body = value;
    next();
  };
}

/**
 * 验证路径参数
 */
export function validateParams(schema: Joi.ObjectSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.params, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const details = error.details.map((d) => d.message).join('; ');
      return res.status(400).json({
        success: false,
        error: '路径参数验证失败',
        details,
      });
    }

    req.params = value;
    next();
  };
}

// ==================== 导出 Schema ====================

export const schemas = {
  // 股票
  stockSearch: stockSearchSchema,
  stockSymbol: stockSymbolSchema,
  quoteQuery: quoteQuerySchema,
  batchQuotes: batchQuotesSchema,
  // 财务报表
  financialsQuery: financialsQuerySchema,
  financialsTrendsQuery: financialsTrendsQuerySchema,
  // 市场
  marketQuery: marketQuerySchema,
  sectorQuery: sectorQuerySchema,
  // 新闻
  newsQuery: newsQuerySchema,
  // 指标
  indicatorQuery: indicatorQuerySchema,
  // 资金流向
  fundFlowQuery: fundFlowQuerySchema,
  fundFlowBatch: fundFlowBatchSchema,
  industryFlowQuery: industryFlowQuerySchema,
  // ETF
  etfListQuery: etfListQuerySchema,
  etfSymbol: etfSymbolSchema,
  etfNavHistory: etfNavHistorySchema,
  // 大宗交易
  blockTradeQuery: blockTradeQuerySchema,
  blockTradeHistory: blockTradeHistorySchema,
  // 限售股
  lockupCalendar: lockupCalendarSchema,
  lockupRank: lockupRankSchema,
  // 融资融券
  marginSymbol: marginSymbolSchema,
  marginRank: marginRankSchema,
  // 投资组合
  portfolioId: portfolioIdSchema,
  portfolioCreate: portfolioCreateSchema,
  positionAdd: positionAddSchema,
  positionUpdate: positionUpdateSchema,
  portfolioPositionSymbol: portfolioPositionSymbolSchema,
  // 自选股
  watchlistQuery: watchlistQuerySchema,
  watchlistAdd: watchlistAddSchema,
  watchlistUpdate: watchlistUpdateSchema,
  watchlistReorder: watchlistReorderSchema,
  watchlistGroupCreate: watchlistGroupCreateSchema,
  watchlistGroupDelete: watchlistGroupDeleteSchema,
  // 选股器
  screenerCondition: screenerConditionSchema,
  screenerFilter: screenerFilterSchema,
  screenerTemplateSave: screenerTemplateSaveSchema,
  screenerTemplateRun: screenerTemplateRunSchema,
  // 预警
  alertCreate: alertCreateSchema,
  alertUpdate: alertUpdateSchema,
  alertQuery: alertQuerySchema,
  alertHistory: alertHistorySchema,
  alertBatchDelete: alertBatchDeleteSchema,
  alertId: alertIdSchema,
  // 回测
  backtestRun: backtestRunSchema,
  backtestCompare: backtestCompareSchema,
  // AI分析
  aiAnalyze: aiAnalyzeSchema,
  aiAlertQuery: aiAlertQuerySchema,
  // 市场统计
  marketStatsQuery: marketStatsQuerySchema,
  // 订单簿
  orderBook: orderBookSchema,
  // 性能监控
  performanceReport: performanceReportSchema,
  // 社交
  commentCreate: commentCreateSchema,
  commentQuery: commentQuerySchema,
  follow: followSchema,
  followStatusQuery: followStatusQuerySchema,
  userProfile: userProfileSchema,
  // 财务报表
  financialQuery: financialQuerySchema,
};

// ==================== 请求体大小限制中间件 ====================

/**
 * 限制请求体大小，防止DoS攻击
 */
export function limitBodySize(maxBytes: number = 10240) {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    if (contentLength > maxBytes) {
      return res.status(413).json({
        success: false,
        error: '请求体过大',
        details: `最大允许 ${maxBytes} 字节`,
      });
    }
    next();
  };
}

/**
 * SQL注入特征检测（简单防护层）
 * 检测查询参数中是否包含SQL关键字
 */
export function sanitizeInput(req: Request, res: Response, next: NextFunction) {
  const sqlPatterns = [
    /(\b(DROP|DELETE|INSERT|UPDATE|ALTER|CREATE|EXEC|EXECUTE|UNION|SELECT)\b\s)/i,
    /(--|;|\/\*|\*\/|xp_|@@)/i,
    /(\bOR\b\s+\d+\s*=\s*\d+)/i,
    /(\bAND\b\s+\d+\s*=\s*\d+)/i,
    /(CHAR\s*\(|CONCAT\s*\(|CONVERT\s*\()/i,
  ];

  const checkValue = (val: string): boolean => {
    return sqlPatterns.some(pattern => pattern.test(val));
  };

  const checkObject = (obj: any): boolean => {
    if (typeof obj === 'string') return checkValue(obj);
    if (typeof obj === 'object' && obj !== null) {
      return Object.values(obj).some(v => checkObject(v));
    }
    return false;
  };

  if (checkObject(req.query) || checkObject(req.body) || checkObject(req.params)) {
    console.warn(`⚠️ 检测到疑似注入请求: ${req.method} ${req.path} IP: ${req.ip}`);
    return res.status(400).json({
      success: false,
      error: '请求包含非法字符',
    });
  }

  next();
}
