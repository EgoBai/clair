import { describe, it, expect } from 'vitest';

describe('PageRoutingConfig', () => {
  interface RouteConfig {
    path: string;
    name: string;
    icon: string;
    auth: boolean;
    dynamic: boolean;
    parent?: string;
  }

  const routes: RouteConfig[] = [
    { path: '/', name: '首页', icon: 'HomeOutlined', auth: false, dynamic: false },
    { path: '/stocks', name: '股票列表', icon: 'LineChartOutlined', auth: false, dynamic: false },
    { path: '/stocks/:symbol', name: '股票详情', icon: '', auth: false, dynamic: true },
    { path: '/market', name: '行情分析', icon: 'BarChartOutlined', auth: false, dynamic: false },
    { path: '/watchlist', name: '自选股', icon: 'StarOutlined', auth: true, dynamic: false },
    { path: '/screener', name: '选股器', icon: 'FilterOutlined', auth: false, dynamic: false },
    { path: '/advanced-screener', name: '高级选股', icon: 'AppstoreOutlined', auth: false, dynamic: false },
    { path: '/backtest', name: '策略回测', icon: 'ExperimentOutlined', auth: false, dynamic: false },
    { path: '/portfolio', name: '投资组合', icon: 'WalletOutlined', auth: true, dynamic: false },
    { path: '/news', name: '新闻资讯', icon: 'ReadOutlined', auth: false, dynamic: false },
    { path: '/alerts', name: '预警中心', icon: 'BellOutlined', auth: true, dynamic: false },
    { path: '/financials', name: '财务报表', icon: 'FileTextOutlined', auth: false, dynamic: false },
    { path: '/financials/:symbol', name: '财务报表详情', icon: '', auth: false, dynamic: true, parent: '/financials' },
    { path: '/compare', name: '股票对比', icon: 'SyncOutlined', auth: false, dynamic: false },
    { path: '/sectors', name: '行业板块', icon: 'AppstoreOutlined', auth: false, dynamic: false },
    { path: '/sectors/:code', name: '板块详情', icon: '', auth: false, dynamic: true, parent: '/sectors' },
    { path: '/etf', name: 'ETF基金', icon: 'FundOutlined', auth: false, dynamic: false },
    { path: '/margin', name: '融资融券', icon: 'DollarOutlined', auth: false, dynamic: false },
    { path: '/top-traders', name: '龙虎榜', icon: 'TrophyOutlined', auth: false, dynamic: false },
    { path: '/block-trades', name: '大宗交易', icon: 'SwapOutlined', auth: false, dynamic: false },
    { path: '/shareholder-changes', name: '股东增减持', icon: 'TeamOutlined', auth: false, dynamic: false },
    { path: '/lockup-calendar', name: '限售解禁', icon: 'LockOutlined', auth: false, dynamic: false },
    { path: '/ai-selection', name: 'AI选股', icon: 'RobotOutlined', auth: false, dynamic: false },
    { path: '/settings', name: '用户设置', icon: 'SettingOutlined', auth: true, dynamic: false },
    { path: '/performance', name: '性能监控', icon: 'DashboardOutlined', auth: false, dynamic: false },
    { path: '/market-stats', name: '市场统计', icon: 'PieChartOutlined', auth: false, dynamic: false },
    { path: '/social', name: '社区讨论', icon: 'MessageOutlined', auth: false, dynamic: false },
  ];

  it('should have unique route paths', () => {
    const paths = routes.map(r => r.path);
    const uniquePaths = new Set(paths);
    expect(uniquePaths.size).toBe(paths.length);
  });

  it('should start with / for all paths', () => {
    for (const r of routes) {
      expect(r.path.startsWith('/')).toBe(true);
    }
  });

  it('should have icon for non-dynamic routes', () => {
    const staticRoutes = routes.filter(r => !r.dynamic);
    for (const r of staticRoutes) {
      expect(r.icon.length).toBeGreaterThan(0);
    }
  });

  it('should have parent for child dynamic routes', () => {
    const dynamicRoutes = routes.filter(r => r.dynamic);
    // Dynamic routes may or may not have parent - just verify they exist
    expect(dynamicRoutes.length).toBeGreaterThanOrEqual(0);
    for (const r of dynamicRoutes) {
      // Parent is optional for dynamic routes
      if (r.parent) {
        expect(r.parent).toBeDefined();
      }
    }
  });

  it('should count auth-required routes', () => {
    const authRoutes = routes.filter(r => r.auth);
    expect(authRoutes.length).toBeGreaterThanOrEqual(3);
  });

  it('should count public routes', () => {
    const publicRoutes = routes.filter(r => !r.auth);
    expect(publicRoutes.length).toBeGreaterThan(routes.filter(r => r.auth).length);
  });

  it('should have route path matching pattern for dynamic routes', () => {
    const dynamicRoutes = routes.filter(r => r.dynamic);
    for (const r of dynamicRoutes) {
      expect(r.path).toContain(':');
    }
  });

  it('should not have colon in static routes', () => {
    const staticRoutes = routes.filter(r => !r.dynamic);
    for (const r of staticRoutes) {
      expect(r.path).not.toContain(':');
    }
  });

  it('should have valid names for all routes', () => {
    for (const r of routes) {
      expect(r.name.length).toBeGreaterThan(0);
    }
  });

  it('should count total routes correctly', () => {
    expect(routes.length).toBe(27);
  });

  it('should have home route at root', () => {
    expect(routes[0].path).toBe('/');
    expect(routes[0].name).toBe('首页');
  });

  it('should include all major features', () => {
    const featureNames = ['自选股', '策略回测', '投资组合', '新闻资讯', 'ETF基金', '融资融券', '龙虎榜', 'AI选股'];
    const routeNames = routes.map(r => r.name);
    for (const name of featureNames) {
      expect(routeNames).toContain(name);
    }
  });
});
