/**
 * 路由自动注册到 OpenAPI 文档
 * 扫描 Express 路由器的 layer 信息，自动生成文档
 */

import { Router } from 'express';
import { registerRoute, registerTag, RouteDoc } from './apiDocRegistry';

/** HTTP 方法类型守卫 */
function isValidHttpMethod(method: string): method is 'get' | 'post' | 'put' | 'patch' | 'delete' {
  return ['get', 'post', 'put', 'patch', 'delete'].includes(method.toLowerCase());
}

/** 路由文档元数据映射表 - 从路径推断 tag 和 summary */
const pathMetadata: Record<string, { tag: string; summary: string; description?: string; auth?: boolean }> = {
  // 股票
  'GET /api/stocks': { tag: '股票', summary: '获取股票列表', description: '支持分页、搜索、行业筛选、排序' },
  'GET /api/stocks/:symbol': { tag: '股票', summary: '获取股票详情' },
  'GET /api/stocks/:symbol/kline': { tag: '股票', summary: '获取K线数据', description: '支持日期范围和复权方式' },
  'GET /api/stocks/:symbol/quotes': { tag: '股票', summary: '获取行情数据' },

  // 搜索
  'GET /api/search': { tag: '搜索', summary: '搜索股票', description: '代码/名称/拼音搜索' },
  'GET /api/search/history': { tag: '搜索', summary: '获取搜索历史' },

  // 技术指标
  'GET /api/indicators/:symbol': { tag: '技术指标', summary: '获取技术指标', description: 'MA/MACD/KDJ/RSI/BOLL' },
  'GET /api/indicators/:symbol/ma': { tag: '技术指标', summary: '获取均线数据' },
  'GET /api/indicators/:symbol/macd': { tag: '技术指标', summary: '获取MACD指标' },
  'GET /api/indicators/:symbol/kdj': { tag: '技术指标', summary: '获取KDJ指标' },
  'GET /api/indicators/:symbol/rsi': { tag: '技术指标', summary: '获取RSI指标' },
  'GET /api/indicators/:symbol/boll': { tag: '技术指标', summary: '获取布林带指标' },

  // 板块
  'GET /api/sectors': { tag: '板块', summary: '获取板块列表' },
  'GET /api/sectors/analysis': { tag: '板块', summary: '板块分析', description: '板块涨跌分布、领涨股' },

  // 资金流向
  'GET /api/fund-flow/:symbol': { tag: '资金流向', summary: '个股资金流向' },
  'GET /api/fund-flow/industry': { tag: '资金流向', summary: '行业资金流向排行' },
  'GET /api/fund-flow/market': { tag: '资金流向', summary: '大盘资金流向' },

  // 自选股
  'GET /api/watchlist': { tag: '自选股', summary: '获取自选股列表', auth: true },
  'POST /api/watchlist': { tag: '自选股', summary: '添加自选股', auth: true },
  'DELETE /api/watchlist/:symbol': { tag: '自选股', summary: '删除自选股', auth: true },
  'POST /api/watchlist/groups': { tag: '自选股', summary: '创建自选股分组', auth: true },

  // 预警
  'GET /api/alerts': { tag: '预警', summary: '获取预警列表', auth: true },
  'POST /api/alerts': { tag: '预警', summary: '创建预警', auth: true },
  'PUT /api/alerts/:id': { tag: '预警', summary: '更新预警', auth: true },
  'DELETE /api/alerts/:id': { tag: '预警', summary: '删除预警', auth: true },
  'GET /api/alerts/history': { tag: '预警', summary: '获取预警历史', auth: true },

  // 选股器
  'POST /api/screener/filter': { tag: '选股器', summary: '条件筛选' },
  'POST /api/screener/advanced-filter': { tag: '选股器', summary: '高级筛选', description: 'AND/OR组合逻辑' },

  // 回测
  'POST /api/backtest/run': { tag: '回测', summary: '运行策略回测', description: '支持均线交叉/RSI/MACD策略' },
  'GET /api/backtest/presets': { tag: '回测', summary: '获取策略预设' },

  // 投资组合
  'GET /api/portfolio': { tag: '投资组合', summary: '获取投资组合列表', auth: true },
  'POST /api/portfolio': { tag: '投资组合', summary: '创建投资组合', auth: true },
  'GET /api/portfolio/:id': { tag: '投资组合', summary: '获取投资组合详情', auth: true },
  'DELETE /api/portfolio/:id': { tag: '投资组合', summary: '删除投资组合', auth: true },

  // 新闻
  'GET /api/news': { tag: '新闻', summary: '获取新闻列表' },
  'GET /api/news/:id': { tag: '新闻', summary: '获取新闻详情' },

  // 社交
  'GET /api/social/comments': { tag: '社交', summary: '获取评论列表' },
  'POST /api/social/comments': { tag: '社交', summary: '发表评论', auth: true },

  // AI分析
  'GET /api/ai/alert-suggestions': { tag: 'AI分析', summary: 'AI预警建议' },

  // AI选股

  // 财务数据
  'GET /api/financials/summary': { tag: '财务', summary: '财务摘要' },
  'GET /api/financials/balance-sheet': { tag: '财务', summary: '资产负债表' },
  'GET /api/financials/cash-flow': { tag: '财务', summary: '现金流量表' },

  // 股票对比
  'GET /api/compare': { tag: '股票对比', summary: '多股票对比' },

  // 用户
  'POST /api/user/register': { tag: '用户', summary: '用户注册' },
  'POST /api/user/login': { tag: '用户', summary: '用户登录' },
  'GET /api/user/profile': { tag: '用户', summary: '获取用户信息', auth: true },

  // 性能监控
  'GET /api/performance/overview': { tag: '性能', summary: '性能概览' },
  'GET /api/performance/endpoints': { tag: '性能', summary: '端点性能统计' },

  // 盘口

  // 融资融券
  'GET /api/margin/:symbol': { tag: '融资融券', summary: '个股融资融券' },

  // 龙虎榜
  'GET /api/top-traders/:symbol': { tag: '龙虎榜', summary: '个股龙虎榜' },

  // 大宗交易
  'GET /api/block-trades': { tag: '大宗交易', summary: '获取大宗交易数据' },
  'GET /api/block-trades/:symbol': { tag: '大宗交易', summary: '个股大宗交易' },

  // 股东变动

  // 解禁
  'GET /api/lockup/calendar': { tag: '限售解禁', summary: '解禁日历' },
  'GET /api/lockup/:symbol': { tag: '限售解禁', summary: '个股解禁信息' },

  // ETF
  'GET /api/etf/list': { tag: 'ETF', summary: '获取ETF列表' },
  'GET /api/etf/:symbol': { tag: 'ETF', summary: '获取ETF详情' },

  // 系统
  'GET /health': { tag: '系统', summary: '健康检查' },
  'GET /api/stats/cache': { tag: '系统', summary: '缓存统计' },
  'POST /api/sync/realtime': { tag: '系统', summary: '同步实时行情' },
  'POST /api/sync/kline/:symbol': { tag: '系统', summary: '同步K线数据' },
  'GET /api/csrf-token': { tag: '系统', summary: '获取CSRF Token' },

  // ===== 2026-09-25 按真实注册路由校准：删除 37 条幽灵条目、补登 180 条漏登端点 =====

  // 股票
  'GET /api/market/indices': { tag: '股票', summary: '获取大盘指数行情' },
  'GET /api/market/industries': { tag: '股票', summary: '获取行业板块行情' },
  'GET /api/market/summary': { tag: '股票', summary: '获取大盘概览' },
  'GET /api/market/realtime': { tag: '股票', summary: '获取实时行情' },
  'GET /api/market/kline': { tag: '股票', summary: '获取大盘K线', description: '指数K线，支持周期与复权' },
  'GET /api/market/top-gainers': { tag: '股票', summary: '获取涨幅榜' },
  'GET /api/market/top-losers': { tag: '股票', summary: '获取跌幅榜' },
  'GET /api/market/top-turnover': { tag: '股票', summary: '获取换手率榜' },
  'GET /api/stocks/:symbol/latest': { tag: '股票', summary: '获取股票最新行情' },
  'POST /api/stocks/batch/quotes': { tag: '股票', summary: '批量获取行情' },

  // 技术指标
  'POST /api/tech/batch': { tag: '技术指标', summary: '批量计算技术指标' },
  'POST /api/analyze': { tag: '技术指标', summary: '技术指标综合分析' },
  'POST /api/detect': { tag: '技术指标', summary: '技术形态/信号检测' },
  'POST /api/macd': { tag: '技术指标', summary: '计算MACD指标' },
  'POST /api/rsi': { tag: '技术指标', summary: '计算RSI指标' },

  // 板块
  'GET /api/sectors/:industry/stocks': { tag: '板块', summary: '获取板块成分股' },
  'GET /api/sectors/ranking': { tag: '板块', summary: '板块排行' },
  'GET /api/sectors/performance/enhanced': { tag: '板块', summary: '增强板块表现' },
  'GET /api/sectors/momentum': { tag: '板块', summary: '板块动量' },
  'GET /api/sectors/concept': { tag: '板块', summary: '获取概念板块' },
  'GET /api/sectors/analysis/:code': { tag: '板块', summary: '板块分析详情' },
  'GET /api/sectors/:code/multidim': { tag: '板块', summary: '板块多维分析' },
  'GET /api/sectors/:code/multidim-v2': { tag: '板块', summary: '板块多维分析V2' },
  'GET /api/sectors/:code/multidim-v3': { tag: '板块', summary: '板块多维分析V3' },
  'POST /api/sectors/multidim-v3/batch': { tag: '板块', summary: '批量板块多维分析' },

  // 行业
  'GET /api/industries': { tag: '行业', summary: '获取行业列表' },
  'GET /api/industries/:industry/sub': { tag: '行业', summary: '获取行业子行业' },
  'GET /api/industries/sub': { tag: '行业', summary: '获取子行业列表' },
  'GET /api/industries/sub-sector/:subIndustry/stocks': { tag: '行业', summary: '获取子行业成分股' },
  'GET /api/industries/sub-sector/momentum': { tag: '行业', summary: '子行业动量' },
  'GET /api/industries/level2/stocks': { tag: '行业', summary: '获取二级行业成分股' },
  'GET /api/industry-alerts': { tag: '行业', summary: '行业预警' },

  // 资金流向
  'GET /api/fund-flow/meta': { tag: '资金流向', summary: '资金流向元数据' },
  'GET /api/fund-flow/global': { tag: '资金流向', summary: '全市场资金流向' },
  'POST /api/fund-flow/batch': { tag: '资金流向', summary: '批量资金流向' },

  // 自选股
  'PATCH /api/watchlist/:symbol': { tag: '自选股', summary: '更新自选股', auth: true },
  'PUT /api/watchlist/reorder': { tag: '自选股', summary: '自选股排序', auth: true },
  'DELETE /api/watchlist/groups/:id': { tag: '自选股', summary: '删除自选股分组', auth: true },
  'POST /api/watchlist/sync': { tag: '自选股', summary: '同步自选股', auth: true },

  // 预警
  'GET /api/alerts/:id': { tag: '预警', summary: '获取预警详情', auth: true },
  'GET /api/alerts/stats': { tag: '预警', summary: '获取预警统计', auth: true },
  'POST /api/alerts/batch-delete': { tag: '预警', summary: '批量删除预警', auth: true },
  'POST /api/alerts/check': { tag: '预警', summary: '执行预警检查', auth: true },

  // 选股器
  'GET /api/screener/templates': { tag: '选股器', summary: '获取选股模板列表' },
  'POST /api/screener/templates': { tag: '选股器', summary: '创建选股模板' },
  'POST /api/screener/templates/:id/run': { tag: '选股器', summary: '运行选股模板' },
  'DELETE /api/screener/templates/:id': { tag: '选股器', summary: '删除选股模板' },
  'GET /api/screener/fields': { tag: '选股器', summary: '获取可选字段' },
  'POST /api/screener/quick': { tag: '选股器', summary: '快速选股' },
  'GET /api/screener/advanced-presets': { tag: '选股器', summary: '获取高级筛选预设' },
  'POST /api/screener/advanced-templates': { tag: '选股器', summary: '创建高级筛选模板' },
  'DELETE /api/screener/advanced-templates/:id': { tag: '选股器', summary: '删除高级筛选模板' },
  'GET /api/screener/indicator-conditions': { tag: '选股器', summary: '获取指标条件' },

  // 回测
  'POST /api/backtest/compare': { tag: '回测', summary: '策略对比回测' },

  // 投资组合
  'POST /api/portfolio/:id/positions': { tag: '投资组合', summary: '添加持仓', auth: true },
  'PUT /api/portfolio/:id/positions/:symbol': { tag: '投资组合', summary: '更新持仓', auth: true },
  'DELETE /api/portfolio/:id/positions/:symbol': { tag: '投资组合', summary: '删除持仓', auth: true },

  // 新闻
  'GET /api/news/research/reports': { tag: '新闻', summary: '获取研报列表' },
  'GET /api/news/stats/overview': { tag: '新闻', summary: '获取新闻统计概览' },
  'GET /api/news/stock/:symbol': { tag: '新闻', summary: '获取个股新闻' },

  // 社交
  'GET /api/social/comments/:id/replies': { tag: '社交', summary: '获取评论回复' },
  'POST /api/social/comments/:id/like': { tag: '社交', summary: '点赞评论', auth: true },
  'DELETE /api/social/comments/:id': { tag: '社交', summary: '删除评论', auth: true },
  'GET /api/social/users': { tag: '社交', summary: '获取用户列表' },
  'GET /api/social/users/:username': { tag: '社交', summary: '获取用户主页' },
  'POST /api/social/follow': { tag: '社交', summary: '关注用户', auth: true },
  'GET /api/social/follow/status': { tag: '社交', summary: '获取关注状态' },
  'GET /api/social/stats': { tag: '社交', summary: '获取社交统计' },

  // AI分析
  'GET /api/ai/recommendations': { tag: 'AI分析', summary: '获取AI推荐' },
  'GET /api/ai/analyze/:symbol': { tag: 'AI分析', summary: 'AI个股分析' },
  'GET /api/ai/alerts': { tag: 'AI分析', summary: '获取AI预警' },
  'GET /api/ai/sector-rotation': { tag: 'AI分析', summary: '板块轮动预测' },
  'GET /api/ai/market-sentiment': { tag: 'AI分析', summary: '市场情绪分析' },
  'GET /api/ai/knowledge-search': { tag: 'AI分析', summary: 'AI知识库搜索' },
  'GET /api/ai/diagnose/:symbol': { tag: 'AI分析', summary: 'AI个股诊断' },
  'GET /api/ai/health': { tag: 'AI分析', summary: 'AI服务健康检查' },
  'GET /api/ai/market-analysis': { tag: 'AI分析', summary: 'AI市场分析' },
  'GET /api/ai/market-insight': { tag: 'AI分析', summary: 'AI市场洞察' },
  'GET /api/ai/market-insight-llm': { tag: 'AI分析', summary: 'AI市场洞察(LLM)' },
  'GET /api/ai/market-insights': { tag: 'AI分析', summary: '获取AI市场洞察' },
  'GET /api/ai/market-pulse': { tag: 'AI分析', summary: 'AI市场脉搏' },
  'GET /api/ai/daily-briefing': { tag: 'AI分析', summary: 'AI每日简报' },
  'GET /api/ai/multi-signal': { tag: 'AI分析', summary: '多信号汇总' },
  'GET /api/ai/multi-signal/:symbol': { tag: 'AI分析', summary: '个股多信号' },
  'POST /api/ai/chat': { tag: 'AI分析', summary: 'AI对话' },
  'POST /api/ai/trade-analysis': { tag: 'AI分析', summary: 'AI交易分析' },
  'POST /api/ai/watchlist-summary': { tag: 'AI分析', summary: 'AI自选股总结' },

  // AI选股
  'POST /api/ai/filter': { tag: 'AI选股', summary: 'AI选股筛选' },
  'POST /api/ai/gems': { tag: 'AI选股', summary: 'AI潜力股挖掘' },
  'POST /api/ai/investment-note': { tag: 'AI选股', summary: 'AI投资笔记' },
  'POST /api/ai/strategy': { tag: 'AI选股', summary: 'AI策略生成' },
  'POST /api/ai/strategy-recommend': { tag: 'AI选股', summary: 'AI策略推荐' },

  // 财务
  'GET /api/financials/income-statement': { tag: '财务', summary: '利润表' },
  'GET /api/financials/factor-series': { tag: '财务', summary: '财务因子序列' },
  'GET /api/financials/trends': { tag: '财务', summary: '财务趋势' },

  // 股票对比
  'GET /api/compare/radar': { tag: '股票对比', summary: '多维雷达对比' },

  // 用户
  'GET /api/user/history': { tag: '用户', summary: '获取浏览历史', auth: true },
  'POST /api/user/history': { tag: '用户', summary: '记录浏览历史', auth: true },
  'POST /api/user/logout': { tag: '用户', summary: '用户登出' },
  'PUT /api/user/settings': { tag: '用户', summary: '更新用户设置', auth: true },

  // 性能
  'GET /api/performance/data-sources': { tag: '性能', summary: '数据源性能' },
  'GET /api/performance/errors': { tag: '性能', summary: '错误统计' },
  'GET /api/performance/health': { tag: '性能', summary: '性能健康检查' },
  'GET /api/performance/slow': { tag: '性能', summary: '慢请求统计' },
  'POST /api/performance/frontend': { tag: '性能', summary: '上报前端性能' },

  // 融资融券
  'GET /api/margin/overview': { tag: '融资融券', summary: '融资融券概览' },
  'GET /api/margin/trend': { tag: '融资融券', summary: '融资融券趋势' },
  'GET /api/margin/rank/:type': { tag: '融资融券', summary: '融资融券排行' },

  // 龙虎榜
  'GET /api/top-traders/overview': { tag: '龙虎榜', summary: '龙虎榜概览' },
  'GET /api/top-traders/seat/rank': { tag: '龙虎榜', summary: '营业部排行' },
  'GET /api/top-traders/history/:symbol': { tag: '龙虎榜', summary: '个股龙虎榜历史' },

  // 大宗交易
  'GET /api/block-trades/overview': { tag: '大宗交易', summary: '大宗交易概览' },

  // 限售解禁
  'GET /api/lockup/rank': { tag: '限售解禁', summary: '解禁规模排行' },

  // ETF
  'GET /api/etf/:symbol/nav-history': { tag: 'ETF', summary: '获取ETF净值历史' },
  'GET /api/etf/premium/rank': { tag: 'ETF', summary: 'ETF溢价率排行' },

  // 系统
  'GET /api-docs': { tag: '系统', summary: 'API文档首页' },
  'GET /api-docs/info': { tag: '系统', summary: 'API文档信息' },
  'GET /api-docs/endpoints': { tag: '系统', summary: 'API端点清单' },
  'GET /api-docs/openapi.json': { tag: '系统', summary: 'OpenAPI(JSON)' },
  'GET /api-docs/openapi.yaml': { tag: '系统', summary: 'OpenAPI(YAML)' },
  'GET /api-docs/redoc': { tag: '系统', summary: 'ReDoc文档' },
  'GET /api/security/cors': { tag: '系统', summary: 'CORS状态' },
  'GET /api/sync/state': { tag: '系统', summary: '同步状态' },
  'GET /api/sync/degradation': { tag: '系统', summary: '降级状态' },
  'POST /api/sync/degradation/clear': { tag: '系统', summary: '清除降级状态' },
  'POST /api/auth/refresh': { tag: '系统', summary: '刷新Token' },
  'POST /api/auth/logout': { tag: '系统', summary: '登出' },
  'GET /api/data/freshness': { tag: '系统', summary: '获取数据新鲜度' },

  // 数据分析
  'GET /api/analytics/events': { tag: '数据分析', summary: '获取事件统计' },
  'GET /api/analytics/funnel': { tag: '数据分析', summary: '获取漏斗分析' },
  'GET /api/analytics/performance': { tag: '数据分析', summary: '获取性能分析' },
  'GET /api/analytics/summary': { tag: '数据分析', summary: '获取分析概览' },
  'POST /api/analytics': { tag: '数据分析', summary: '上报分析事件' },

  // 市场宽度
  'GET /api/breadth/current': { tag: '市场宽度', summary: '当前市场宽度' },
  'GET /api/breadth/sectors': { tag: '市场宽度', summary: '板块市场宽度' },
  'GET /api/breadth/history': { tag: '市场宽度', summary: '市场宽度历史' },
  'GET /api/breadth/mcclellan': { tag: '市场宽度', summary: 'McClellan指标' },
  'GET /api/breadth/cache-stats': { tag: '市场宽度', summary: '市场宽度缓存统计' },

  // 事件日历
  'GET /api/event-calendar/events': { tag: '事件日历', summary: '获取财经事件日历' },

  // 因子
  'GET /api/factors/overview': { tag: '因子', summary: '因子概览' },

  // 历史数据
  'GET /api/history/status': { tag: '历史数据', summary: '历史数据状态' },
  'POST /api/history/backfill': { tag: '历史数据', summary: '回填历史数据' },

  // 沪深港通
  'GET /api/hk-connect/summary': { tag: '沪深港通', summary: '沪深港通概览' },
  'GET /api/hk-connect/ah-premium': { tag: '沪深港通', summary: 'AH溢价' },

  // 产业链
  'GET /api/industry-chains/': { tag: '产业链', summary: '获取产业链列表' },
  'GET /api/industry-chains/categories': { tag: '产业链', summary: '获取产业链分类' },
  'GET /api/industry-chains/search': { tag: '产业链', summary: '搜索产业链' },
  'GET /api/industry-chains/:id': { tag: '产业链', summary: '获取产业链详情' },
  'GET /api/industry-chains/:id/analysis': { tag: '产业链', summary: '产业链分析' },
  'GET /api/industry-chains/:id/hot-stocks': { tag: '产业链', summary: '产业链热门股' },
  'GET /api/industry-chains/:id/segments': { tag: '产业链', summary: '产业链环节' },
  'GET /api/industry-chains/:id/stocks': { tag: '产业链', summary: '产业链成分股' },

  // 宏观
  'GET /api/macro/overview': { tag: '宏观', summary: '宏观经济概览' },

  // 北向资金
  'GET /api/north-bound/overview': { tag: '北向资金', summary: '北向资金概览' },

  // 通知
  'GET /api/notifications/:notificationId': { tag: '通知', summary: '获取通知详情', auth: true },
  'GET /api/notifications/user/:userId': { tag: '通知', summary: '获取用户通知', auth: true },
  'GET /api/notifications/user/:userId/preferences': { tag: '通知', summary: '获取通知偏好', auth: true },
  'PUT /api/notifications/user/:userId/preferences': { tag: '通知', summary: '更新通知偏好', auth: true },
  'GET /api/notifications/user/:userId/stats': { tag: '通知', summary: '通知统计', auth: true },
  'GET /api/notifications/user/:userId/unread-count': { tag: '通知', summary: '未读通知数', auth: true },
  'GET /api/notifications/templates/list': { tag: '通知', summary: '获取通知模板' },
  'POST /api/notifications/': { tag: '通知', summary: '创建通知' },
  'POST /api/notifications/batch': { tag: '通知', summary: '批量创建通知' },
  'DELETE /api/notifications/:notificationId': { tag: '通知', summary: '删除通知', auth: true },
  'DELETE /api/notifications/user/:userId/clear': { tag: '通知', summary: '清空用户通知', auth: true },
  'PATCH /api/notifications/:notificationId/read': { tag: '通知', summary: '标记通知已读', auth: true },
  'PATCH /api/notifications/user/:userId/read-all': { tag: '通知', summary: '全部标记已读', auth: true },

  // 风险中心
  'GET /api/risk-center/portfolio': { tag: '风险中心', summary: '组合风险分析', auth: true },

  // 策略模板
  'GET /api/strategy-templates': { tag: '策略模板', summary: '获取策略模板列表' },
  'POST /api/strategy-templates': { tag: '策略模板', summary: '创建策略模板' },
  'GET /api/strategy-templates/:id': { tag: '策略模板', summary: '获取策略模板详情' },
  'PUT /api/strategy-templates/:id': { tag: '策略模板', summary: '更新策略模板' },
  'DELETE /api/strategy-templates/:id': { tag: '策略模板', summary: '删除策略模板' },
  'POST /api/strategy-templates/:id/clone': { tag: '策略模板', summary: '克隆策略模板' },
  'POST /api/strategy-templates/:id/use': { tag: '策略模板', summary: '应用策略模板' },
  'GET /api/strategy-templates/stats/categories': { tag: '策略模板', summary: '策略模板分类统计' },

  // 未来价值
  'GET /api/future-value/discover': { tag: '未来价值', summary: '发现未来价值标的' },
  'GET /api/future-value/detail/:symbol': { tag: '未来价值', summary: '个股未来价值详情' },
  'POST /api/future-value/config': { tag: '未来价值', summary: '保存未来价值配置' },
  'POST /api/future-value/score': { tag: '未来价值', summary: '未来价值评分' },
};

/** 注册标签 */
export function registerAllTags(): void {
  const tags: Record<string, string> = {
    '股票': '股票信息与行情数据',
    '搜索': '股票搜索',
    '技术指标': '技术分析指标计算',
    '板块': '板块行情与分析',
    '资金流向': '资金流向分析',
    '自选股': '自选股管理',
    '预警': '价格/涨跌幅预警',
    '选股器': '条件选股',
    '回测': '策略回测',
    '投资组合': '投资组合管理',
    '新闻': '新闻资讯',
    '社交': '社交讨论',
    'AI分析': 'AI智能分析',
    'AI选股': 'AI选股推荐',
    '财务': '财务报表数据',
    '股票对比': '多股票对比分析',
    '用户': '用户管理',
    '性能': '性能监控',
    '盘口': '盘口数据',
    '融资融券': '融资融券数据',
    '龙虎榜': '龙虎榜数据',
    '大宗交易': '大宗交易数据',
    '股东变动': '股东增减持',
    '限售解禁': '限售股解禁',
    'ETF': 'ETF数据',
    '系统': '系统状态与管理',
    '行业': '行业与子行业行情',
    '数据分析': '埋点与行为分析',
    '市场宽度': '市场宽度指标',
    '事件日历': '财经事件日历',
    '因子': '量化因子数据',
    '历史数据': '历史行情数据管理',
    '沪深港通': '沪深港通资金',
    '产业链': '产业链图谱与成分',
    '宏观': '宏观经济数据',
    '北向资金': '北向资金流向',
    '通知': '站内通知',
    '风险中心': '组合风险分析',
    '策略模板': '策略模板管理',
    '未来价值': '未来价值分析',
  };

  for (const [name, description] of Object.entries(tags)) {
    registerTag(name, description);
  }
}

/**
 * 从 Express Router 自动提取并注册路由
 */
export function autoRegisterFromRouter(router: Router, basePath: string = ''): void {
  // 访问 Express Router 的内部 stack 属性
  const routerWithStack = router as Router & { stack?: any[] };
  const stack = routerWithStack.stack || [];

  for (const layer of stack) {
    if (!layer.route) continue;

    const route = layer.route;
    const methods = Object.keys(route.methods);
    const routePath = basePath + route.path;

    for (const method of methods) {
      const key = `${method.toUpperCase()} ${routePath}`;
      const meta = pathMetadata[key];

      if (meta) {
        const httpMethod = method.toLowerCase();
        if (isValidHttpMethod(httpMethod)) {
          registerRoute({
            method: httpMethod,
            path: routePath,
            tag: meta.tag,
            summary: meta.summary,
            description: meta.description,
            auth: meta.auth,
            responses: [{ status: 200, description: '成功' }],
          });
        }
      }
    }
  }
}

/** 注册所有已知路由 */
export function registerAllRoutes(): void {
  registerAllTags();

  // 直接从 pathMetadata 注册所有已知端点
  for (const [key, meta] of Object.entries(pathMetadata)) {
    const [method, path] = key.split(' ');
    const httpMethod = method.toLowerCase();
    if (isValidHttpMethod(httpMethod)) {
      registerRoute({
        method: httpMethod,
        path,
        tag: meta.tag,
        summary: meta.summary,
        description: meta.description,
        auth: meta.auth,
        responses: [{ status: 200, description: '成功' }],
      });
    }
  }
}

/** 初始化自动注册（在 app 启动时调用） */
export function initApiDocs(): void {
  registerAllRoutes();
}
