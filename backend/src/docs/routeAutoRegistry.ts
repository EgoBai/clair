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
  'GET /api/market': { tag: '股票', summary: '获取大盘行情' },
  'GET /api/market/stats': { tag: '股票', summary: '获取市场统计数据' },
  'GET /api/market/overview': { tag: '股票', summary: '获取市场概览' },
  'GET /api/stocks/:symbol/dividend': { tag: '股票', summary: '获取分红送配' },
  'GET /api/stocks/:symbol/shareholder': { tag: '股票', summary: '获取股东信息' },

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
  'GET /api/sectors/:name': { tag: '板块', summary: '获取板块详情' },
  'GET /api/sectors/:name/stocks': { tag: '板块', summary: '获取板块成分股' },
  'GET /api/sector-analysis/rotation': { tag: '板块', summary: '板块轮动分析' },
  'GET /api/sector-analysis/heatmap': { tag: '板块', summary: '板块热力图' },

  // 资金流向
  'GET /api/fund-flow/:symbol': { tag: '资金流向', summary: '个股资金流向' },
  'GET /api/fund-flow/industry': { tag: '资金流向', summary: '行业资金流向排行' },
  'GET /api/fund-flow/market': { tag: '资金流向', summary: '大盘资金流向' },
  'GET /api/fund-flow/history': { tag: '资金流向', summary: '历史资金流向' },

  // 自选股
  'GET /api/watchlist': { tag: '自选股', summary: '获取自选股列表', auth: true },
  'POST /api/watchlist': { tag: '自选股', summary: '添加自选股', auth: true },
  'DELETE /api/watchlist/:symbol': { tag: '自选股', summary: '删除自选股', auth: true },
  'GET /api/watchlist/groups': { tag: '自选股', summary: '获取自选股分组', auth: true },
  'POST /api/watchlist/groups': { tag: '自选股', summary: '创建自选股分组', auth: true },
  'DELETE /api/watchlist/groups/:groupId': { tag: '自选股', summary: '删除自选股分组', auth: true },

  // 预警
  'GET /api/alerts': { tag: '预警', summary: '获取预警列表', auth: true },
  'POST /api/alerts': { tag: '预警', summary: '创建预警', auth: true },
  'PUT /api/alerts/:id': { tag: '预警', summary: '更新预警', auth: true },
  'DELETE /api/alerts/:id': { tag: '预警', summary: '删除预警', auth: true },
  'GET /api/alerts/history': { tag: '预警', summary: '获取预警历史', auth: true },

  // 选股器
  'POST /api/screener/filter': { tag: '选股器', summary: '条件筛选' },
  'POST /api/screener/advanced-filter': { tag: '选股器', summary: '高级筛选', description: 'AND/OR组合逻辑' },
  'GET /api/screener/presets': { tag: '选股器', summary: '获取筛选预设' },
  'GET /api/screener/export': { tag: '选股器', summary: '导出筛选结果' },

  // 回测
  'POST /api/backtest/run': { tag: '回测', summary: '运行策略回测', description: '支持均线交叉/RSI/MACD策略' },
  'GET /api/backtest/presets': { tag: '回测', summary: '获取策略预设' },
  'GET /api/backtest/history': { tag: '回测', summary: '获取回测历史' },

  // 投资组合
  'GET /api/portfolio': { tag: '投资组合', summary: '获取投资组合列表', auth: true },
  'POST /api/portfolio': { tag: '投资组合', summary: '创建投资组合', auth: true },
  'GET /api/portfolio/:id': { tag: '投资组合', summary: '获取投资组合详情', auth: true },
  'PUT /api/portfolio/:id': { tag: '投资组合', summary: '更新投资组合', auth: true },
  'DELETE /api/portfolio/:id': { tag: '投资组合', summary: '删除投资组合', auth: true },
  'POST /api/portfolio/:id/trade': { tag: '投资组合', summary: '记录交易', auth: true },

  // 新闻
  'GET /api/news': { tag: '新闻', summary: '获取新闻列表' },
  'GET /api/news/:id': { tag: '新闻', summary: '获取新闻详情' },

  // 社交
  'GET /api/social/comments': { tag: '社交', summary: '获取评论列表' },
  'POST /api/social/comments': { tag: '社交', summary: '发表评论', auth: true },
  'POST /api/social/vote': { tag: '社交', summary: '投票', auth: true },

  // AI分析
  'POST /api/ai/recommendations': { tag: 'AI分析', summary: 'AI推荐' },
  'POST /api/ai/commentary': { tag: 'AI分析', summary: 'AI行情解读' },
  'POST /api/ai/stop-loss': { tag: 'AI分析', summary: '智能止盈止损' },
  'POST /api/ai/sector-rotation': { tag: 'AI分析', summary: '板块轮动预测' },
  'POST /api/ai/diagnose/:symbol': { tag: 'AI分析', summary: 'AI个股诊断' },
  'GET /api/ai/alert-suggestions': { tag: 'AI分析', summary: 'AI预警建议' },
  'POST /api/ai/events': { tag: 'AI分析', summary: '异常事件检测' },

  // AI选股
  'GET /api/ai/selection/recommendations': { tag: 'AI选股', summary: '获取AI选股推荐' },
  'GET /api/ai/selection/strategies': { tag: 'AI选股', summary: '获取选股策略列表' },
  'POST /api/ai/selection/custom': { tag: 'AI选股', summary: '自定义AI选股' },

  // 财务数据
  'GET /api/financials/summary': { tag: '财务', summary: '财务摘要' },
  'GET /api/financials/balance-sheet': { tag: '财务', summary: '资产负债表' },
  'GET /api/financials/income': { tag: '财务', summary: '利润表' },
  'GET /api/financials/cash-flow': { tag: '财务', summary: '现金流量表' },
  'GET /api/financials/ratios': { tag: '财务', summary: '财务比率' },
  'GET /api/financials/compare': { tag: '财务', summary: '财务对比' },

  // 股票对比
  'GET /api/compare': { tag: '股票对比', summary: '多股票对比' },

  // 用户
  'POST /api/user/register': { tag: '用户', summary: '用户注册' },
  'POST /api/user/login': { tag: '用户', summary: '用户登录' },
  'GET /api/user/profile': { tag: '用户', summary: '获取用户信息', auth: true },
  'PUT /api/user/profile': { tag: '用户', summary: '更新用户信息', auth: true },
  'POST /api/user/change-password': { tag: '用户', summary: '修改密码', auth: true },

  // 性能监控
  'GET /api/performance/overview': { tag: '性能', summary: '性能概览' },
  'GET /api/performance/endpoints': { tag: '性能', summary: '端点性能统计' },

  // 盘口
  'GET /api/order-book/:symbol': { tag: '盘口', summary: '获取盘口数据' },

  // 融资融券
  'GET /api/margin/:symbol': { tag: '融资融券', summary: '个股融资融券' },
  'GET /api/margin/ranking': { tag: '融资融券', summary: '融资融券排行' },

  // 龙虎榜
  'GET /api/top-traders': { tag: '龙虎榜', summary: '获取龙虎榜数据' },
  'GET /api/top-traders/:symbol': { tag: '龙虎榜', summary: '个股龙虎榜' },

  // 大宗交易
  'GET /api/block-trades': { tag: '大宗交易', summary: '获取大宗交易数据' },
  'GET /api/block-trades/:symbol': { tag: '大宗交易', summary: '个股大宗交易' },

  // 股东变动
  'GET /api/shareholder-changes': { tag: '股东变动', summary: '获取股东变动' },
  'GET /api/shareholder-changes/:symbol': { tag: '股东变动', summary: '个股股东变动' },

  // 解禁
  'GET /api/lockup/calendar': { tag: '限售解禁', summary: '解禁日历' },
  'GET /api/lockup/:symbol': { tag: '限售解禁', summary: '个股解禁信息' },

  // ETF
  'GET /api/etf/list': { tag: 'ETF', summary: '获取ETF列表' },
  'GET /api/etf/:symbol': { tag: 'ETF', summary: '获取ETF详情' },
  'GET /api/etf/:symbol/nav': { tag: 'ETF', summary: '获取ETF净值' },
  'GET /api/etf/:symbol/holdings': { tag: 'ETF', summary: '获取ETF持仓' },
  'GET /api/etf/ranking': { tag: 'ETF', summary: 'ETF排行' },

  // 系统
  'GET /health': { tag: '系统', summary: '健康检查' },
  'GET /api/stats/cache': { tag: '系统', summary: '缓存统计' },
  'POST /api/sync/realtime': { tag: '系统', summary: '同步实时行情' },
  'POST /api/sync/kline/:symbol': { tag: '系统', summary: '同步K线数据' },
  'GET /api/csrf-token': { tag: '系统', summary: '获取CSRF Token' },
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
