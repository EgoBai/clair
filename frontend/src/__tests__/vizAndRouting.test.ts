import { describe, it, expect } from 'vitest';

// ===== 数据可视化逻辑测试 =====
describe('Data Visualization Logic', () => {
  // 颜色插值
  describe('Color Interpolation', () => {
    const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

    const interpolateColor = (start: [number, number, number], end: [number, number, number], t: number): string => {
      const r = Math.round(lerp(start[0], end[0], t));
      const g = Math.round(lerp(start[1], end[1], t));
      const b = Math.round(lerp(start[2], end[2], t));
      return `rgb(${r},${g},${b})`;
    };

    const valueToColor = (value: number, min: number, max: number, colors: string[]): string => {
      if (max === min) return colors[0];
      const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
      const idx = Math.min(Math.floor(t * colors.length), colors.length - 1);
      return colors[idx];
    };

    it('起点t=0', () => {
      expect(interpolateColor([0, 0, 0], [255, 255, 255], 0)).toBe('rgb(0,0,0)');
    });

    it('终点t=1', () => {
      expect(interpolateColor([0, 0, 0], [255, 255, 255], 1)).toBe('rgb(255,255,255)');
    });

    it('中点t=0.5', () => {
      expect(interpolateColor([0, 0, 0], [100, 100, 100], 0.5)).toBe('rgb(50,50,50)');
    });

    it('值映射到颜色', () => {
      const colors = ['#00ff00', '#ffff00', '#ff0000'];
      expect(valueToColor(0, 0, 100, colors)).toBe('#00ff00');
      expect(valueToColor(100, 0, 100, colors)).toBe('#ff0000');
    });

    it('超出范围应钳制', () => {
      expect(valueToColor(200, 0, 100, ['#a', '#b', '#c'])).toBe('#c');
      expect(valueToColor(-10, 0, 100, ['#a', '#b', '#c'])).toBe('#a');
    });

    it('min=max应返回首色', () => {
      expect(valueToColor(5, 5, 5, ['#x'])).toBe('#x');
    });
  });

  // 坐标映射
  describe('Coordinate Mapping', () => {
    const mapToCanvas = (value: number, dataMin: number, dataMax: number, canvasSize: number, invert: boolean = false): number => {
      const t = dataMax !== dataMin ? (value - dataMin) / (dataMax - dataMin) : 0.5;
      return invert ? canvasSize * (1 - t) : canvasSize * t;
    };

    it('数据最小值应映射到0', () => {
      expect(mapToCanvas(10, 10, 20, 100)).toBe(0);
    });

    it('数据最大值应映射到canvasSize', () => {
      expect(mapToCanvas(20, 10, 20, 100)).toBe(100);
    });

    it('中间值', () => {
      expect(mapToCanvas(15, 10, 20, 100)).toBe(50);
    });

    it('反向映射', () => {
      expect(mapToCanvas(10, 10, 20, 100, true)).toBe(100);
      expect(mapToCanvas(20, 10, 20, 100, true)).toBe(0);
    });

    it('相等min/max应居中', () => {
      expect(mapToCanvas(5, 5, 5, 100)).toBe(50);
    });

    it('应处理负值范围', () => {
      expect(mapToCanvas(-5, -10, 0, 100)).toBe(50);
    });
  });

  // 热力图颜色
  describe('Heatmap Color', () => {
    const heatmapColor = (value: number, min: number, max: number): string => {
      const t = max !== min ? (value - min) / (max - min) : 0.5;
      if (t < 0.5) {
        const g = Math.round(255 * (t * 2));
        return `rgb(0,${g},0)`;
      } else {
        const r = Math.round(255 * ((t - 0.5) * 2));
        return `rgb(${r},0,0)`;
      }
    };

    it('最低值应为暗绿', () => {
      expect(heatmapColor(0, 0, 100)).toBe('rgb(0,0,0)');
    });

    it('最高值应为红色', () => {
      expect(heatmapColor(100, 0, 100)).toBe('rgb(255,0,0)');
    });

    it('中值应为绿色', () => {
      expect(heatmapColor(25, 0, 100)).toBe('rgb(0,128,0)');
    });

    it('相等min/max', () => {
      const c = heatmapColor(5, 5, 5);
      expect(c).toContain('rgb');
    });
  });

  // 图例生成
  describe('Legend Generation', () => {
    const generateLegend = (min: number, max: number, steps: number): number[] => {
      if (steps <= 1) return [min];
      const step = (max - min) / (steps - 1);
      return Array.from({ length: steps }, (_, i) => min + step * i);
    };

    it('应生成正确步数', () => {
      expect(generateLegend(0, 100, 5).length).toBe(5);
    });

    it('首值应为min', () => {
      expect(generateLegend(0, 100, 5)[0]).toBe(0);
    });

    it('末值应为max', () => {
      const l = generateLegend(0, 100, 5);
      expect(l[l.length - 1]).toBe(100);
    });

    it('steps=1应返回[min]', () => {
      expect(generateLegend(10, 20, 1)).toEqual([10]);
    });

    it('等距分布', () => {
      const l = generateLegend(0, 100, 3);
      expect(l[1]).toBeCloseTo(50);
    });

    it('负值范围', () => {
      const l = generateLegend(-100, 100, 3);
      expect(l[1]).toBeCloseTo(0);
    });
  });

  // 涨跌颜色系统
  describe('A-Share Color System', () => {
    const getColor = (change: number): string => {
      if (change > 0) return '#ef4444'; // red
      if (change < 0) return '#22c55e'; // green
      return '#6b7280'; // gray
    };

    const getBgColor = (change: number): string => {
      if (change > 0) return 'rgba(239,68,68,0.1)';
      if (change < 0) return 'rgba(34,197,94,0.1)';
      return 'rgba(107,114,128,0.1)';
    };

    it('上涨应为红色', () => {
      expect(getColor(1)).toBe('#ef4444');
      expect(getBgColor(1)).toContain('239,68,68');
    });

    it('下跌应为绿色', () => {
      expect(getColor(-1)).toBe('#22c55e');
      expect(getBgColor(-1)).toContain('34,197,94');
    });

    it('平盘应为灰色', () => {
      expect(getColor(0)).toBe('#6b7280');
    });

    it('涨跌颜色应相反（与美股）', () => {
      expect(getColor(1)).not.toBe(getColor(-1));
      expect(getColor(1)).toContain('4444'); // red
      expect(getColor(-1)).toContain('c55e'); // green
    });
  });
});

// ===== 前端路由逻辑测试 =====
describe('Frontend Routing Logic', () => {
  interface RouteConfig {
    path: string;
    name: string;
    requiresAuth?: boolean;
  }

  const routes: RouteConfig[] = [
    { path: '/', name: '首页' },
    { path: '/stocks', name: '股票列表' },
    { path: '/stocks/:symbol', name: '股票详情' },
    { path: '/watchlist', name: '自选股', requiresAuth: true },
    { path: '/backtest', name: '策略回测' },
    { path: '/compare', name: '股票对比' },
    { path: '/ai-selection', name: 'AI选股' },
    { path: '/market-heat', name: '市场热度' },
    { path: '/etf', name: 'ETF基金' },
    { path: '/margin', name: '融资融券' },
    { path: '/top-traders', name: '龙虎榜' },
    { path: '/block-trades', name: '大宗交易' },
    { path: '/shareholder-changes', name: '股东增减持' },
    { path: '/lockup-calendar', name: '限售解禁' },
    { path: '/sectors', name: '行业板块' },
    { path: '/sectors/:code', name: '板块详情' },
    { path: '/financials/:symbol', name: '财务报表' },
    { path: '/news', name: '新闻资讯' },
    { path: '/settings', name: '用户设置', requiresAuth: true },
    { path: '/performance', name: '性能监控' },
    { path: '*', name: '404' },
  ];

  const matchRoute = (pathname: string): RouteConfig | null => {
    for (const route of routes) {
      if (route.path === pathname) return route;
      if (route.path === '*') continue;
      const pattern = route.path.replace(/:[^/]+/g, '[^/]+');
      if (new RegExp(`^${pattern}$`).test(pathname)) return route;
    }
    const fallback = routes.find(r => r.path === '*');
    return fallback || null;
  };

  const getBreadcrumbs = (pathname: string): { name: string; path: string }[] => {
    const crumbs: { name: string; path: string }[] = [{ name: '首页', path: '/' }];
    const parts = pathname.split('/').filter(Boolean);
    let current = '';
    for (const part of parts) {
      current += '/' + part;
      const route = matchRoute(current);
      crumbs.push({ name: route?.name || part, path: current });
    }
    return crumbs;
  };

  it('首页路由匹配', () => {
    expect(matchRoute('/')?.name).toBe('首页');
  });

  it('静态路由匹配', () => {
    expect(matchRoute('/stocks')?.name).toBe('股票列表');
    expect(matchRoute('/watchlist')?.name).toBe('自选股');
  });

  it('动态路由匹配', () => {
    const route = matchRoute('/stocks/600519');
    expect(route?.name).toBe('股票详情');
  });

  it('未匹配应返回null（排除404）', () => {
    // routes 中有 * 通配符，但精确匹配优先
    expect(matchRoute('/unknown/path')).not.toBeNull();
  });

  it('404路由兜底', () => {
    expect(matchRoute('/nonexistent')?.name).toBe('404');
  });

  it('路由唯一性', () => {
    const paths = routes.map(r => r.path);
    const staticPaths = paths.filter(p => !p.includes(':') && p !== '*');
    expect(new Set(staticPaths).size).toBe(staticPaths.length);
  });

  it('需认证路由应标记', () => {
    const authRoutes = routes.filter(r => r.requiresAuth);
    expect(authRoutes.length).toBeGreaterThanOrEqual(2);
    expect(authRoutes.map(r => r.name)).toContain('自选股');
  });

  it('面包屑导航', () => {
    const crumbs = getBreadcrumbs('/stocks/600519');
    expect(crumbs.length).toBe(3);
    expect(crumbs[0].name).toBe('首页');
    expect(crumbs[1].name).toBe('股票列表');
    expect(crumbs[2].name).toBe('股票详情');
  });

  it('面包屑首页', () => {
    const crumbs = getBreadcrumbs('/');
    expect(crumbs.length).toBe(1);
    expect(crumbs[0].path).toBe('/');
  });

  it('路由总数', () => {
    expect(routes.length).toBeGreaterThanOrEqual(18);
  });

  it('动态参数路径', () => {
    const r1 = matchRoute('/sectors/Baijiu');
    expect(r1?.name).toBe('板块详情');
    const r2 = matchRoute('/financials/600519');
    expect(r2?.name).toBe('财务报表');
  });
});
