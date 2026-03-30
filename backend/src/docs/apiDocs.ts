/**
 * A股行情分析网站 - API 文档
 * 
 * 基于 OpenAPI 3.0 规范
 * 后端 Swagger UI 地址: /api-docs
 */

export const apiDocs = {
  openapi: '3.0.3',
  info: {
    title: 'A股行情分析网站 API',
    description: '提供A股实时行情、K线数据、技术分析、选股器等服务',
    version: '2.0.0',
    contact: {
      name: 'ego_bai',
    },
  },
  servers: [
    { url: 'http://localhost:3001', description: '开发环境' },
    { url: 'https://api.a-stock.example.com', description: '生产环境' },
  ],
  paths: {
    // ==================== 股票相关 ====================
    '/api/stocks': {
      get: {
        tags: ['股票'],
        summary: '获取股票列表',
        description: '支持分页、搜索、行业筛选、排序',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 }, description: '页码' },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 20, minimum: 1, maximum: 100 }, description: '每页数量' },
          { name: 'q', in: 'query', schema: { type: 'string' }, description: '搜索关键词(代码/名称/拼音)' },
          { name: 'industry', in: 'query', schema: { type: 'string' }, description: '行业筛选' },
          { name: 'market', in: 'query', schema: { type: 'string', enum: ['SH', 'SZ', 'BJ'] }, description: '市场筛选' },
          { name: 'sortBy', in: 'query', schema: { type: 'string', enum: ['changePercent', 'volume', 'turnover', 'marketCap'] }, description: '排序字段' },
          { name: 'sortOrder', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] }, description: '排序方向' },
        ],
        responses: {
          200: { description: '成功', content: { 'application/json': { schema: { $ref: '#/components/schemas/StockListResponse' } } } },
          400: { description: '参数错误' },
          429: { description: '请求频率超限' },
        },
      },
    },
    '/api/stocks/{symbol}': {
      get: {
        tags: ['股票'],
        summary: '获取股票详情',
        parameters: [
          { name: 'symbol', in: 'path', required: true, schema: { type: 'string' }, description: '股票代码(如600519.SH)' },
        ],
        responses: {
          200: { description: '成功' },
          404: { description: '股票不存在' },
        },
      },
    },
    '/api/stocks/{symbol}/kline': {
      get: {
        tags: ['股票'],
        summary: '获取K线数据',
        description: '获取指定股票的日K线数据，支持日期范围筛选',
        parameters: [
          { name: 'symbol', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date' }, description: '开始日期 YYYY-MM-DD' },
          { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date' }, description: '结束日期 YYYY-MM-DD' },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 1000, default: 100 }, description: '返回条数' },
          { name: 'adjust', in: 'query', schema: { type: 'string', enum: ['none', 'forward', 'backward'], default: 'none' }, description: '复权方式' },
        ],
        responses: {
          200: { description: 'K线数据列表' },
        },
      },
    },

    // ==================== 搜索 ====================
    '/api/search': {
      get: {
        tags: ['搜索'],
        summary: '搜索股票',
        description: '支持代码精确匹配、名称匹配、拼音首字母搜索',
        parameters: [
          { name: 'q', in: 'query', required: true, schema: { type: 'string', minLength: 1 }, description: '搜索关键词' },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
        ],
        responses: {
          200: { description: '搜索结果' },
        },
      },
    },

    // ==================== 自选股 ====================
    '/api/watchlist': {
      get: {
        tags: ['自选股'],
        summary: '获取自选股列表',
        parameters: [
          { name: 'groupId', in: 'query', schema: { type: 'string' }, description: '分组ID筛选' },
        ],
        responses: { 200: { description: '自选股列表' } },
      },
      post: {
        tags: ['自选股'],
        summary: '添加自选股',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/WatchlistItem' } } },
        },
        responses: {
          201: { description: '添加成功' },
          409: { description: '已在自选股中' },
        },
      },
    },
    '/api/watchlist/groups': {
      post: {
        tags: ['自选股'],
        summary: '创建自选股分组',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } } } },
        },
        responses: { 201: { description: '创建成功' } },
      },
    },

    // ==================== 选股器 ====================
    '/api/screener/advanced-filter': {
      post: {
        tags: ['选股器'],
        summary: '高级筛选',
        description: '多条件组合筛选，支持AND/OR逻辑',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ScreenerRequest' } } },
        },
        responses: { 200: { description: '筛选结果' } },
      },
    },

    // ==================== 回测 ====================
    '/api/backtest/run': {
      post: {
        tags: ['回测'],
        summary: '运行策略回测',
        description: '支持均线交叉、RSI、MACD三种策略',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/BacktestRequest' } } },
        },
        responses: { 200: { description: '回测结果' } },
      },
    },
    '/api/backtest/presets': {
      get: {
        tags: ['回测'],
        summary: '获取策略预设',
        responses: { 200: { description: '预设列表' } },
      },
    },

    // ==================== 投资组合 ====================
    '/api/portfolio': {
      get: {
        tags: ['投资组合'],
        summary: '获取投资组合列表',
        responses: { 200: { description: '组合列表' } },
      },
      post: {
        tags: ['投资组合'],
        summary: '创建投资组合',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' } } } } },
        },
        responses: { 201: { description: '创建成功' } },
      },
    },

    // ==================== 新闻 ====================
    '/api/news': {
      get: {
        tags: ['新闻'],
        summary: '获取新闻列表',
        parameters: [
          { name: 'category', in: 'query', schema: { type: 'string', enum: ['market', 'company', 'policy', 'international', 'analysis'] } },
          { name: 'sentiment', in: 'query', schema: { type: 'string', enum: ['positive', 'negative', 'neutral'] } },
          { name: 'q', in: 'query', schema: { type: 'string' }, description: '关键词搜索' },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: { 200: { description: '新闻列表' } },
      },
    },

    // ==================== AI 分析 ====================
    '/api/ai/commentary': {
      post: {
        tags: ['AI分析'],
        summary: '生成市场行情解读',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CommentaryRequest' } } },
        },
        responses: { 200: { description: 'AI行情解读' } },
      },
    },
    '/api/ai/stop-loss': {
      post: {
        tags: ['AI分析'],
        summary: '智能止盈止损建议',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/StopLossRequest' } } },
        },
        responses: { 200: { description: '止盈止损建议' } },
      },
    },
    '/api/ai/sector-rotation': {
      post: {
        tags: ['AI分析'],
        summary: '板块轮动预测',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', properties: { sectors: { type: 'array', items: { $ref: '#/components/schemas/SectorData' } } } } } },
        },
        responses: { 200: { description: '轮动预测结果' } },
      },
    },

    // ==================== 资金流向 ====================
    '/api/fund-flow/industry': {
      get: {
        tags: ['资金流向'],
        summary: '行业资金流向排行',
        responses: { 200: { description: '行业资金流向' } },
      },
    },

    // ==================== 系统 ====================
    '/api/health': {
      get: {
        tags: ['系统'],
        summary: '健康检查',
        responses: { 200: { description: '系统状态' } },
      },
    },
    '/api/stats/cache': {
      get: {
        tags: ['系统'],
        summary: '缓存统计',
        responses: { 200: { description: '缓存命中率等' } },
      },
    },
  },
  components: {
    schemas: {
      StockListResponse: {
        type: 'object',
        properties: {
          data: { type: 'array', items: { $ref: '#/components/schemas/Stock' } },
          total: { type: 'integer' },
          page: { type: 'integer' },
          pageSize: { type: 'integer' },
        },
      },
      Stock: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          symbol: { type: 'string' },
          name: { type: 'string' },
          market: { type: 'string', enum: ['SH', 'SZ', 'BJ'] },
          industry: { type: 'string' },
          latestQuote: { $ref: '#/components/schemas/DailyQuote' },
        },
      },
      DailyQuote: {
        type: 'object',
        properties: {
          openPrice: { type: 'number' },
          closePrice: { type: 'number' },
          highPrice: { type: 'number' },
          lowPrice: { type: 'number' },
          volume: { type: 'number' },
          turnover: { type: 'number' },
          change: { type: 'number' },
          changePercent: { type: 'number' },
          turnoverRate: { type: 'number' },
          peRatio: { type: 'number' },
          pbRatio: { type: 'number' },
          marketCap: { type: 'number' },
        },
      },
      WatchlistItem: {
        type: 'object',
        required: ['symbol'],
        properties: {
          symbol: { type: 'string' },
          groupId: { type: 'string' },
          notes: { type: 'string' },
        },
      },
      ScreenerRequest: {
        type: 'object',
        properties: {
          groups: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                logic: { type: 'string', enum: ['AND', 'OR'] },
                conditions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      field: { type: 'string' },
                      operator: { type: 'string', enum: ['>', '<', '>=', '<=', '==', 'between'] },
                      value: {},
                    },
                  },
                },
              },
            },
          },
        },
      },
      BacktestRequest: {
        type: 'object',
        required: ['symbol', 'strategy'],
        properties: {
          symbol: { type: 'string' },
          strategy: { type: 'string', enum: ['ma_cross', 'rsi', 'macd'] },
          startDate: { type: 'string', format: 'date' },
          endDate: { type: 'string', format: 'date' },
          params: { type: 'object' },
        },
      },
      CommentaryRequest: {
        type: 'object',
        properties: {
          indexChange: { type: 'number' },
          indexPrice: { type: 'number' },
          riseCount: { type: 'integer' },
          fallCount: { type: 'integer' },
          hotSectors: { type: 'array', items: { type: 'object' } },
        },
      },
      StopLossRequest: {
        type: 'object',
        required: ['symbol', 'currentPrice'],
        properties: {
          symbol: { type: 'string' },
          currentPrice: { type: 'number' },
          method: { type: 'string', enum: ['atr', 'moving_average', 'percent'] },
        },
      },
      SectorData: {
        type: 'object',
        properties: {
          sector: { type: 'string' },
          changePercent5d: { type: 'number' },
          changePercent20d: { type: 'number' },
          volumeRatio: { type: 'number' },
          capitalInflow: { type: 'number' },
        },
      },
    },
  },
  tags: [
    { name: '股票', description: '股票信息与行情数据' },
    { name: '搜索', description: '股票搜索' },
    { name: '自选股', description: '自选股管理' },
    { name: '选股器', description: '条件选股' },
    { name: '回测', description: '策略回测' },
    { name: '投资组合', description: '投资组合管理' },
    { name: '新闻', description: '新闻资讯' },
    { name: 'AI分析', description: 'AI智能分析' },
    { name: '资金流向', description: '资金流向分析' },
    { name: '系统', description: '系统状态' },
  ],
};
