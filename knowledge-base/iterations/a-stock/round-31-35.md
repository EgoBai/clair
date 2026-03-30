# 迭代记录 Round 31-35: 数据验证和边界检查

## 完成时间
2026-03-30 21:55

## 做了什么

### 核心改进：全面API参数校验

**1. 扩展 validation.ts（新增 ~25 个 Schema）**
- 新闻查询: `newsQuery` - category/sentiment/q 搜索词验证
- 指标查询: `indicatorQuery` - limit 边界 1-500
- 资金流向: `fundFlowQuery`, `fundFlowBatch`, `industryFlowQuery` - days 1-365, symbols 最多30
- ETF: `etfListQuery`, `etfSymbol`, `etfNavHistory` - type枚举, days边界
- 大宗交易: `blockTradeQuery`, `blockTradeHistory` - 日期格式验证
- 限售股: `lockupCalendar`, `lockupRank` - 日期、排序字段验证
- 融资融券: `marginSymbol`, `marginRank` - type枚举
- 投资组合: `portfolioId`, `portfolioCreate`, `positionAdd`, `positionUpdate`, `portfolioPositionSymbol`
- 自选股: `watchlistQuery`, `watchlistAdd`, `watchlistUpdate`, `watchlistReorder`, `watchlistGroupCreate`, `watchlistGroupDelete`
- 选股器: `screenerFilter`, `screenerTemplateSave`, `screenerTemplateRun` - 条件最多20个, pageSize最大200
- 预警: `alertCreate`, `alertUpdate`, `alertQuery`, `alertHistory`, `alertBatchDelete`, `alertId`
- 回测: `backtestRun`, `backtestCompare` - 策略枚举, 初始资金 1万-1万亿
- AI分析: `aiAnalyze`, `aiAlertQuery` - severity/type枚举
- 市场统计: `marketStatsQuery` - period枚举
- 订单簿: `orderBook` - symbol格式
- 性能监控: `performanceReport` - metric/value边界
- 社交: `commentCreate`, `commentQuery`, `follow`, `followStatusQuery`, `userProfile`
- 财务报表: `financialQuery` - period格式验证

**2. 应用验证到所有API路由（27个文件）**

已更新的API文件:
- `screener.ts` - POST /screener/filter 使用 screenerFilter schema
- `advanced-screener.ts` - POST /screener/advanced-filter 使用 screenerFilter schema
- `news.ts` - GET /news 使用 newsQuery schema
- `indicators.ts` - 5个端点 (/:symbol, /ma, /macd, /kdj, /rsi, /boll) 全部加 stockSymbol + indicatorQuery
- `fund-flow.ts` - GET/POST 3个端点
- `etf.ts` - GET 3个端点 (/list, /:symbol, /nav-history)
- `block-trades.ts` - GET 2个端点
- `portfolio.ts` - 全部7个端点
- `watchlist.ts` - 全部7个端点
- `alerts.ts` - 全部8个端点 (已有的导入更新为 centralized schemas)
- `backtest-routes.ts` - POST 2个端点 (/run, /compare)
- `order-book.ts` - GET 2个端点
- `margin.ts` - GET 2个端点 (/margin/:symbol, /margin/rank/:type)
- `lockup-shares.ts` - GET 3个端点
- `market-stats.ts` - GET 4个端点
- `performance.ts` - POST /performance/frontend
- `social.ts` - 移除内联 schemas，改用 centralized，新增 /follow/status 验证
- `sector-analysis.ts` - GET /sectors/analysis/:code
- `top-traders.ts` - GET 2个端点
- `shareholder-changes.ts` - GET 2个端点
- `ai-stock-selection.ts` - GET /ai/diagnose/:symbol

**3. 边界检查策略**
- 数值边界: pageSize 最大 100-200, limit 最大 50-1000, days 最大 365
- 字符串长度: symbol 最大20, name 最大50-100, content 最大2000
- 格式验证: 日期 ISO 格式, 股票代码正则 `/^[a-zA-Z0-9.]+$/`
- 枚举验证: 市场(SH/SZ/BJ), 排序方向(asc/desc), 预警类型等
- 数组限制: symbols 最多 100, conditions 最多 20, items 最多 200

## 测试结果
- 632 passed / 6 test files failed / 8 tests failed
- 所有失败都是**预存的**数学/算法问题（dataPipeline、portfolioAnalytics、sectorRotation等），与本次变更无关
- **无新增失败**

## 关键文件
- `backend/src/middleware/validation.ts` - 主验证 schema 文件（大幅扩展）
- 所有 `backend/src/api/*.ts` - 应用验证中间件

## 下一步
- Round 36-40: 消除 TypeScript any 类型
- Round 41-45: React Error Boundary
