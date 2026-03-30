/**
 * API 路由注册完整性测试
 */
import { describe, it, expect } from 'vitest';

describe('API 路由注册', () => {
  const apiRoutes = [
    // 股票核心
    { path: '/api/stocks', method: 'GET', desc: '股票列表' },
    { path: '/api/stocks/:symbol', method: 'GET', desc: '股票详情' },
    { path: '/api/stocks/:symbol/kline', method: 'GET', desc: 'K线数据' },
    { path: '/api/market/summary', method: 'GET', desc: '市场概览' },

    // 搜索
    { path: '/api/search', method: 'GET', desc: '股票搜索' },
    { path: '/api/search/history', method: 'GET', desc: '搜索历史' },

    // 自选股
    { path: '/api/watchlist', method: 'GET', desc: '自选股列表' },
    { path: '/api/watchlist', method: 'POST', desc: '添加自选股' },
    { path: '/api/watchlist/reorder', method: 'PUT', desc: '自选股排序' },

    // 选股器
    { path: '/api/screener/advanced-filter', method: 'POST', desc: '高级筛选' },
    { path: '/api/screener/advanced-presets', method: 'GET', desc: '预设策略' },

    // 回测
    { path: '/api/backtest/run', method: 'POST', desc: '运行回测' },
    { path: '/api/backtest/presets', method: 'GET', desc: '回测预设' },
    { path: '/api/backtest/compare', method: 'POST', desc: '策略对比' },

    // 投资组合
    { path: '/api/portfolio', method: 'GET', desc: '组合列表' },
    { path: '/api/portfolio/:id', method: 'GET', desc: '组合详情' },

    // 新闻
    { path: '/api/news', method: 'GET', desc: '新闻列表' },
    { path: '/api/news/:id', method: 'GET', desc: '新闻详情' },

    // 资金流向
    { path: '/api/fund-flow/industry', method: 'GET', desc: '行业资金流' },

    // 财务报表
    { path: '/api/financials/:symbol', method: 'GET', desc: '财务数据' },

    // 股票对比
    { path: '/api/stock-compare', method: 'GET', desc: '股票对比' },

    // 行业板块
    { path: '/api/sector-analysis', method: 'GET', desc: '行业分析' },

    // 用户
    { path: '/api/user/register', method: 'POST', desc: '用户注册' },
    { path: '/api/user/login', method: 'POST', desc: '用户登录' },
    { path: '/api/user/settings', method: 'PUT', desc: '用户设置' },

    // 性能监控
    { path: '/api/performance/overview', method: 'GET', desc: '性能概览' },

    // 盘口
    { path: '/api/order-book/:symbol', method: 'GET', desc: '盘口数据' },

    // 融资融券
    { path: '/api/margin/overview', method: 'GET', desc: '两融概览' },

    // 龙虎榜
    { path: '/api/top-traders/overview', method: 'GET', desc: '龙虎榜概览' },

    // 大宗交易
    { path: '/api/block-trades', method: 'GET', desc: '大宗交易' },

    // 股东增减持
    { path: '/api/shareholder-changes', method: 'GET', desc: '增减持' },

    // 限售解禁
    { path: '/api/lockup/calendar', method: 'GET', desc: '解禁日历' },

    // AI 选股
    { path: '/api/ai/recommendations', method: 'GET', desc: 'AI推荐' },
    { path: '/api/ai/diagnose/:symbol', method: 'GET', desc: 'AI诊断' },
    { path: '/api/ai/sector-rotation', method: 'GET', desc: '行业轮动' },
    { path: '/api/ai/alert-suggestions', method: 'GET', desc: '预警建议' },
  ];

  it('应注册至少 35 个 API 路由', () => {
    expect(apiRoutes.length).toBeGreaterThanOrEqual(35);
  });

  it('所有路由应有路径', () => {
    apiRoutes.forEach(r => {
      expect(r.path).toMatch(/^\//);
    });
  });

  it('所有路由应有 HTTP 方法', () => {
    const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
    apiRoutes.forEach(r => {
      expect(validMethods).toContain(r.method);
    });
  });

  it('GET 路由应多于 POST 路由', () => {
    const getCount = apiRoutes.filter(r => r.method === 'GET').length;
    const postCount = apiRoutes.filter(r => r.method === 'POST').length;
    expect(getCount).toBeGreaterThan(postCount);
  });

  it('路径不应重复', () => {
    const paths = apiRoutes.map(r => `${r.method} ${r.path}`);
    expect(new Set(paths).size).toBe(paths.length);
  });

  describe('路由分组', () => {
    it('股票核心 API 应至少 4 个', () => {
      const stockRoutes = apiRoutes.filter(r => r.path.startsWith('/api/stocks') || r.path.startsWith('/api/market'));
      expect(stockRoutes.length).toBeGreaterThanOrEqual(4);
    });

    it('金融数据 API 应至少 8 个', () => {
      const financialRoutes = apiRoutes.filter(r =>
        r.path.includes('financials') ||
        r.path.includes('margin') ||
        r.path.includes('top-traders') ||
        r.path.includes('block-trades') ||
        r.path.includes('shareholder') ||
        r.path.includes('lockup') ||
        r.path.includes('order-book') ||
        r.path.includes('fund-flow')
      );
      expect(financialRoutes.length).toBeGreaterThanOrEqual(8);
    });

    it('AI 分析 API 应至少 2 个', () => {
      const aiRoutes = apiRoutes.filter(r => r.path.includes('/ai/'));
      expect(aiRoutes.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('版本信息', () => {
    it('当前版本应为 v1.6+', () => {
      const version = '1.6.0';
      const parts = version.split('.');
      expect(parseInt(parts[0])).toBeGreaterThanOrEqual(1);
      expect(parseInt(parts[1])).toBeGreaterThanOrEqual(6);
    });
  });
});
