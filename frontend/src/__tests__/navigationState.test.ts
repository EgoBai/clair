/**
 * 导航与路由状态管理测试
 */
import { describe, it, expect } from 'vitest';

interface RouteConfig {
  path: string;
  name: string;
  requiresAuth: boolean;
  icon?: string;
}

const routes: RouteConfig[] = [
  { path: '/', name: '首页', requiresAuth: false, icon: 'HomeOutlined' },
  { path: '/stocks', name: '股票', requiresAuth: false, icon: 'StockOutlined' },
  { path: '/stocks/:symbol', name: '股票详情', requiresAuth: false },
  { path: '/market', name: '行情', requiresAuth: false },
  { path: '/watchlist', name: '自选股', requiresAuth: true },
  { path: '/screener', name: '选股器', requiresAuth: false },
  { path: '/backtest', name: '回测', requiresAuth: false },
  { path: '/portfolio', name: '投资组合', requiresAuth: true },
  { path: '/news', name: '新闻', requiresAuth: false },
  { path: '/etf', name: 'ETF', requiresAuth: false },
  { path: '/ai-selection', name: 'AI选股', requiresAuth: false },
  { path: '/market-heat', name: '市场热度', requiresAuth: false },
  { path: '/margin', name: '融资融券', requiresAuth: false },
  { path: '/top-traders', name: '龙虎榜', requiresAuth: false },
  { path: '/block-trades', name: '大宗交易', requiresAuth: false },
  { path: '/settings', name: '设置', requiresAuth: true },
];

function matchRoute(pathname: string): RouteConfig | null {
  for (const route of routes) {
    const pattern = route.path.replace(/:[^/]+/g, '[^/]+');
    const regex = new RegExp(`^${pattern}$`);
    if (regex.test(pathname)) return route;
  }
  return null;
}

function extractParams(pathname: string, pattern: string): Record<string, string> {
  const paramNames: string[] = [];
  const regexStr = pattern.replace(/:([^/]+)/g, (_, name) => {
    paramNames.push(name);
    return '([^/]+)';
  });
  const match = pathname.match(new RegExp(`^${regexStr}$`));
  if (!match) return {};
  const params: Record<string, string> = {};
  paramNames.forEach((name, i) => {
    params[name] = match[i + 1];
  });
  return params;
}

function buildBreadcrumbs(pathname: string): { label: string; path: string }[] {
  const segments = pathname.split('/').filter(Boolean);
  const crumbs = [{ label: '首页', path: '/' }];
  let currentPath = '';
  for (const seg of segments) {
    currentPath += `/${seg}`;
    const route = routes.find(r => r.path === currentPath);
    crumbs.push({
      label: route?.name || seg,
      path: currentPath,
    });
  }
  return crumbs;
}

function getNavItems(isAuthenticated: boolean): RouteConfig[] {
  return routes.filter(r => !r.requiresAuth || isAuthenticated);
}

describe('导航与路由', () => {
  describe('路由匹配', () => {
    it('匹配首页', () => {
      const route = matchRoute('/');
      expect(route?.name).toBe('首页');
    });

    it('匹配动态路由', () => {
      const route = matchRoute('/stocks/600519');
      expect(route?.name).toBe('股票详情');
    });

    it('未匹配返回null', () => {
      expect(matchRoute('/nonexistent')).toBeNull();
    });

    it('精确匹配', () => {
      expect(matchRoute('/stocks').name).toBe('股票');
    });

    it('不部分匹配', () => {
      expect(matchRoute('/stocks/600519/extra')).toBeNull();
    });
  });

  describe('参数提取', () => {
    it('提取symbol参数', () => {
      const params = extractParams('/stocks/600519', '/stocks/:symbol');
      expect(params.symbol).toBe('600519');
    });

    it('无参数返回空对象', () => {
      expect(extractParams('/stocks', '/stocks')).toEqual({});
    });

    it('不匹配返回空对象', () => {
      expect(extractParams('/wrong/path', '/stocks/:symbol')).toEqual({});
    });
  });

  describe('面包屑导航', () => {
    it('首页面包屑', () => {
      const crumbs = buildBreadcrumbs('/');
      expect(crumbs).toHaveLength(1);
      expect(crumbs[0].label).toBe('首页');
    });

    it('嵌套面包屑', () => {
      const crumbs = buildBreadcrumbs('/stocks/600519');
      expect(crumbs).toHaveLength(3);
      expect(crumbs[0].label).toBe('首页');
      expect(crumbs[1].label).toBe('股票');
    });

    it('未知路径使用段名', () => {
      const crumbs = buildBreadcrumbs('/unknown/path');
      expect(crumbs[crumbs.length - 1].label).toBe('path');
    });
  });

  describe('导航菜单', () => {
    it('未登录隐藏认证路由', () => {
      const items = getNavItems(false);
      expect(items.find(r => r.path === '/watchlist')).toBeUndefined();
      expect(items.find(r => r.path === '/portfolio')).toBeUndefined();
    });

    it('登录后显示全部', () => {
      const items = getNavItems(true);
      expect(items.find(r => r.path === '/watchlist')).toBeDefined();
      expect(items.find(r => r.path === '/portfolio')).toBeDefined();
    });

    it('首页始终显示', () => {
      expect(getNavItems(false).find(r => r.path === '/')).toBeDefined();
    });

    it('公开路由数量正确', () => {
      const publicRoutes = routes.filter(r => !r.requiresAuth);
      expect(getNavItems(false).length).toBe(publicRoutes.length);
    });
  });
});
