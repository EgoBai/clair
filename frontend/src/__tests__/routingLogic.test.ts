import { describe, it, expect } from 'vitest';

// Routing and navigation logic tests
describe('Routing & Navigation Logic', () => {
  // Route matching
  describe('Route Matching', () => {
    interface Route {
      path: string;
      pattern: RegExp;
      params: string[];
    }

    function matchRoute(pathname: string, routes: Route[]): { route: Route; params: Record<string, string> } | null {
      for (const route of routes) {
        const match = pathname.match(route.pattern);
        if (match) {
          const params: Record<string, string> = {};
          route.params.forEach((name, i) => {
            params[name] = match[i + 1];
          });
          return { route, params };
        }
      }
      return null;
    }

    const routes: Route[] = [
      { path: '/', pattern: /^\/$/, params: [] },
      { path: '/stocks', pattern: /^\/stocks$/, params: [] },
      { path: '/stocks/:symbol', pattern: /^\/stocks\/([^/]+)$/, params: ['symbol'] },
      { path: '/sectors/:code', pattern: /^\/sectors\/([^/]+)$/, params: ['code'] },
    ];

    it('should match exact routes', () => {
      const result = matchRoute('/', routes);
      expect(result?.route.path).toBe('/');
    });

    it('should extract params from dynamic routes', () => {
      const result = matchRoute('/stocks/600519', routes);
      expect(result?.params.symbol).toBe('600519');
    });

    it('should return null for unmatched routes', () => {
      expect(matchRoute('/unknown', routes)).toBeNull();
    });

    it('should match first matching route', () => {
      const result = matchRoute('/stocks', routes);
      expect(result?.route.path).toBe('/stocks');
    });

    it('should not match partial paths', () => {
      expect(matchRoute('/stocks/600519/details', routes)).toBeNull();
    });
  });

  // Breadcrumb generation
  describe('Breadcrumb Generation', () => {
    interface Breadcrumb { label: string; path: string; }

    const routeLabels: Record<string, string> = {
      '/': '首页',
      '/stocks': '股票列表',
      '/sectors': '行业板块',
      '/watchlist': '自选股',
      '/backtest': '策略回测',
    };

    function generateBreadcrumbs(pathname: string): Breadcrumb[] {
      const segments = pathname.split('/').filter(Boolean);
      const breadcrumbs: Breadcrumb[] = [{ label: '首页', path: '/' }];

      let currentPath = '';
      for (const segment of segments) {
        currentPath += '/' + segment;
        const label = routeLabels[currentPath] || segment;
        breadcrumbs.push({ label, path: currentPath });
      }

      return breadcrumbs;
    }

    it('should generate breadcrumbs for home', () => {
      const crumbs = generateBreadcrumbs('/');
      expect(crumbs).toEqual([{ label: '首页', path: '/' }]);
    });

    it('should generate breadcrumbs for nested path', () => {
      const crumbs = generateBreadcrumbs('/stocks/600519');
      expect(crumbs).toHaveLength(3);
      expect(crumbs[0].path).toBe('/');
      expect(crumbs[1].path).toBe('/stocks');
      expect(crumbs[2].path).toBe('/stocks/600519');
    });

    it('should use segment as label for unknown routes', () => {
      const crumbs = generateBreadcrumbs('/unknown/path');
      expect(crumbs[1].label).toBe('unknown');
    });

    it('should handle empty path', () => {
      const crumbs = generateBreadcrumbs('');
      expect(crumbs).toEqual([{ label: '首页', path: '/' }]);
    });
  });

  // Query parameter parsing
  describe('Query Parameters', () => {
    function parseQuery(search: string): Record<string, string> {
      if (!search || search === '?') return {};
      const params = search.startsWith('?') ? search.slice(1) : search;
      return Object.fromEntries(
        params.split('&')
          .filter(Boolean)
          .map(p => {
            const [key, ...values] = p.split('=');
            return [decodeURIComponent(key), decodeURIComponent(values.join('='))];
          })
      );
    }

    function buildQuery(params: Record<string, string | number | undefined>): string {
      const entries = Object.entries(params)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
      return entries.length ? '?' + entries.join('&') : '';
    }

    it('should parse query string', () => {
      const result = parseQuery('?page=1&size=20');
      expect(result).toEqual({ page: '1', size: '20' });
    });

    it('should handle URL encoded values', () => {
      const result = parseQuery('?q=%E8%8C%85%E5%8F%B0');
      expect(result.q).toBe('茅台');
    });

    it('should handle empty query', () => {
      expect(parseQuery('')).toEqual({});
      expect(parseQuery('?')).toEqual({});
    });

    it('should build query string', () => {
      const qs = buildQuery({ page: 1, q: '茅台' });
      expect(qs).toContain('page=1');
      expect(qs).toContain(encodeURIComponent('茅台'));
    });

    it('should skip undefined in build', () => {
      expect(buildQuery({ a: 1, b: undefined })).toBe('?a=1');
    });

    it('should return empty for no params', () => {
      expect(buildQuery({})).toBe('');
    });
  });

  // Navigation history
  describe('Navigation History', () => {
    class NavHistory {
      private stack: string[] = [];
      private maxLen: number;

      constructor(maxLen = 50) {
        this.maxLen = maxLen;
      }

      push(path: string) {
        if (this.stack[this.stack.length - 1] !== path) {
          this.stack.push(path);
          if (this.stack.length > this.maxLen) this.stack.shift();
        }
      }

      back(): string | null {
        if (this.stack.length > 1) {
          this.stack.pop();
          return this.stack[this.stack.length - 1];
        }
        return null;
      }

      current(): string | null {
        return this.stack.length > 0 ? this.stack[this.stack.length - 1] : null;
      }

      size(): number { return this.stack.length; }
      getAll(): string[] { return [...this.stack]; }
    }

    it('should track navigation history', () => {
      const nav = new NavHistory();
      nav.push('/');
      nav.push('/stocks');
      nav.push('/stocks/600519');
      expect(nav.current()).toBe('/stocks/600519');
    });

    it('should go back', () => {
      const nav = new NavHistory();
      nav.push('/'); nav.push('/a'); nav.push('/b');
      expect(nav.back()).toBe('/a');
      expect(nav.back()).toBe('/');
    });

    it('should not go back from home', () => {
      const nav = new NavHistory();
      nav.push('/');
      expect(nav.back()).toBeNull();
    });

    it('should not duplicate consecutive paths', () => {
      const nav = new NavHistory();
      nav.push('/a');
      nav.push('/a');
      nav.push('/a');
      expect(nav.size()).toBe(1);
    });

    it('should respect max length', () => {
      const nav = new NavHistory(3);
      nav.push('/1'); nav.push('/2'); nav.push('/3'); nav.push('/4');
      expect(nav.size()).toBe(3);
      expect(nav.getAll()[0]).toBe('/2');
    });
  });
});
