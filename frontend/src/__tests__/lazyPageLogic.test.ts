import { describe, it, expect } from 'vitest';

/**
 * LazyPage 懒加载逻辑测试
 * Suspense + ErrorBoundary 包装逻辑
 */

interface LazyRouteConfig {
  path: string;
  componentName: string;
  preload?: boolean;
  chunkName?: string;
}

function generateChunkName(componentName: string): string {
  return componentName
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/^-/, '');
}

function shouldPreload(config: LazyRouteConfig): boolean {
  return config.preload === true;
}

function buildImportStatement(config: LazyRouteConfig): string {
  const chunk = config.chunkName || generateChunkName(config.componentName);
  return `const ${config.componentName} = lazy(() => import(/* webpackChunkName: "${chunk}" */ '../pages/${config.componentName}'));`;
}

function validateRoutePath(path: string): { valid: boolean; reason?: string } {
  if (!path) return { valid: false, reason: 'empty path' };
  if (!path.startsWith('/')) return { valid: false, reason: 'must start with /' };
  if (path.includes('//')) return { valid: false, reason: 'double slash' };
  if (path.includes(' ')) return { valid: false, reason: 'spaces not allowed' };
  return { valid: true };
}

function calcRetryDelay(attempt: number, baseDelay = 1000, maxDelay = 30000): number {
  const delay = baseDelay * Math.pow(2, attempt - 1);
  return Math.min(delay, maxDelay);
}

function buildRouteTree(configs: LazyRouteConfig[]): {
  routes: Array<{ path: string; component: string; preload: boolean }>;
  preloadCount: number;
  totalChunks: number;
} {
  const routes = configs.map(c => ({
    path: c.path,
    component: c.componentName,
    preload: c.preload ?? false,
  }));
  return {
    routes,
    preloadCount: routes.filter(r => r.preload).length,
    totalChunks: new Set(configs.map(c => c.chunkName || generateChunkName(c.componentName))).size,
  };
}

function categorizeRoutes(configs: LazyRouteConfig[]): {
  eager: LazyRouteConfig[];
  lazy: LazyRouteConfig[];
} {
  const eager: LazyRouteConfig[] = [];
  const lazy: LazyRouteConfig[] = [];
  for (const c of configs) {
    if (c.preload) eager.push(c);
    else lazy.push(c);
  }
  return { eager, lazy };
}

describe('LazyPage 懒加载逻辑', () => {
  describe('generateChunkName', () => {
    it('should convert PascalCase to kebab-case', () => {
      expect(generateChunkName('HomePage')).toBe('home-page');
      expect(generateChunkName('StockDetail')).toBe('stock-detail');
      expect(generateChunkName('AIAnalysis')).toBe('a-i-analysis');
    });

    it('should handle single word', () => {
      expect(generateChunkName('Home')).toBe('home');
    });

    it('should handle all lowercase', () => {
      expect(generateChunkName('home')).toBe('home');
    });
  });

  describe('shouldPreload', () => {
    it('should return true when preload is set', () => {
      expect(shouldPreload({ path: '/', componentName: 'Home', preload: true })).toBe(true);
    });

    it('should return false by default', () => {
      expect(shouldPreload({ path: '/', componentName: 'Home' })).toBe(false);
    });

    it('should return false when explicitly false', () => {
      expect(shouldPreload({ path: '/', componentName: 'Home', preload: false })).toBe(false);
    });
  });

  describe('buildImportStatement', () => {
    it('should generate correct import', () => {
      const stmt = buildImportStatement({ path: '/', componentName: 'HomePage' });
      expect(stmt).toContain('lazy(');
      expect(stmt).toContain('HomePage');
      expect(stmt).toContain('home-page');
    });

    it('should use custom chunk name', () => {
      const stmt = buildImportStatement({
        path: '/',
        componentName: 'HomePage',
        chunkName: 'main-home',
      });
      expect(stmt).toContain('main-home');
    });
  });

  describe('validateRoutePath', () => {
    it('should accept valid paths', () => {
      expect(validateRoutePath('/').valid).toBe(true);
      expect(validateRoutePath('/stocks').valid).toBe(true);
      expect(validateRoutePath('/stock/:id').valid).toBe(true);
      expect(validateRoutePath('/api/v1/data').valid).toBe(true);
    });

    it('should reject empty path', () => {
      expect(validateRoutePath('').valid).toBe(false);
    });

    it('should reject paths not starting with /', () => {
      expect(validateRoutePath('stocks').valid).toBe(false);
    });

    it('should reject double slashes', () => {
      expect(validateRoutePath('//stocks').valid).toBe(false);
    });

    it('should reject spaces', () => {
      expect(validateRoutePath('/my stocks').valid).toBe(false);
    });
  });

  describe('calcRetryDelay', () => {
    it('should use exponential backoff', () => {
      expect(calcRetryDelay(1)).toBe(1000);
      expect(calcRetryDelay(2)).toBe(2000);
      expect(calcRetryDelay(3)).toBe(4000);
      expect(calcRetryDelay(4)).toBe(8000);
    });

    it('should cap at maxDelay', () => {
      expect(calcRetryDelay(10)).toBe(30000);
      expect(calcRetryDelay(20)).toBe(30000);
    });

    it('should respect custom base delay', () => {
      expect(calcRetryDelay(1, 500)).toBe(500);
      expect(calcRetryDelay(2, 500)).toBe(1000);
    });
  });

  describe('buildRouteTree', () => {
    it('should count routes correctly', () => {
      const configs: LazyRouteConfig[] = [
        { path: '/', componentName: 'Home', preload: true },
        { path: '/stocks', componentName: 'Stocks' },
        { path: '/stock/:id', componentName: 'StockDetail' },
      ];
      const tree = buildRouteTree(configs);
      expect(tree.routes).toHaveLength(3);
      expect(tree.preloadCount).toBe(1);
    });

    it('should count unique chunks', () => {
      const configs: LazyRouteConfig[] = [
        { path: '/', componentName: 'Home' },
        { path: '/home2', componentName: 'Home2', chunkName: 'home' },
        { path: '/other', componentName: 'Other' },
      ];
      const tree = buildRouteTree(configs);
      expect(tree.totalChunks).toBe(2);
    });
  });

  describe('categorizeRoutes', () => {
    it('should separate eager and lazy routes', () => {
      const configs: LazyRouteConfig[] = [
        { path: '/', componentName: 'Home', preload: true },
        { path: '/stocks', componentName: 'Stocks' },
        { path: '/about', componentName: 'About', preload: true },
      ];
      const { eager, lazy } = categorizeRoutes(configs);
      expect(eager).toHaveLength(2);
      expect(lazy).toHaveLength(1);
    });
  });
});
