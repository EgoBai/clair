/**
 * API 文档端点测试
 * 覆盖 OpenAPI 生成、文档端点、路由自动注册
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { generateOpenAPISpec, generateOpenAPIJson, generateOpenAPIYaml } from '../docs/openApiGenerator';
import { apiDocRegistry, registerRoute, registerTag } from '../docs/apiDocRegistry';
import { registerAllRoutes, initApiDocs } from '../docs/routeAutoRegistry';

describe('OpenAPI 文档生成', () => {
  beforeAll(() => {
    apiDocRegistry.clear();
    initApiDocs();
  });

  it('应该生成完整的 OpenAPI 3.0 规范', () => {
    const spec = generateOpenAPISpec();
    expect(spec.openapi).toBe('3.0.3');
    expect(spec.info.title).toBe('A股行情分析网站 API');
    expect(spec.info.version).toBeDefined();
    expect(spec.servers).toHaveLength(2);
  });

  it('应该包含所有注册的路由路径', () => {
    const spec = generateOpenAPISpec();
    const paths = Object.keys(spec.paths);
    expect(paths.length).toBeGreaterThan(0);
    // 至少包含核心路径
    expect(paths.some(p => p.includes('/stocks'))).toBe(true);
    expect(paths.some(p => p.includes('/sectors'))).toBe(true);
    expect(paths.some(p => p.includes('/search'))).toBe(true);
    expect(paths.some(p => p.includes('/news'))).toBe(true);
  });

  it('应该包含预定义的 schemas', () => {
    const spec = generateOpenAPISpec();
    const schemas = Object.keys(spec.components.schemas);
    expect(schemas).toContain('ApiResponse');
    expect(schemas).toContain('PaginatedResponse');
    expect(schemas).toContain('Stock');
    expect(schemas).toContain('DailyQuote');
    expect(schemas).toContain('KLineData');
    expect(schemas).toContain('TechnicalIndicator');
    expect(schemas).toContain('Sector');
    expect(schemas).toContain('FundFlow');
    expect(schemas).toContain('NewsItem');
    expect(schemas).toContain('Alert');
    expect(schemas).toContain('BacktestResult');
    expect(schemas).toContain('WatchlistItem');
    expect(schemas).toContain('Portfolio');
    expect(schemas).toContain('ScreenerRequest');
    expect(schemas).toContain('Error');
  });

  it('应该包含安全方案定义', () => {
    const spec = generateOpenAPISpec();
    expect(spec.components.securitySchemes).toBeDefined();
    expect(spec.components.securitySchemes!.BearerAuth).toEqual({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    });
  });

  it('应该包含所有标签', () => {
    const spec = generateOpenAPISpec();
    const tagNames = spec.tags.map(t => t.name);
    expect(tagNames).toContain('股票');
    expect(tagNames).toContain('技术指标');
    expect(tagNames).toContain('板块');
    expect(tagNames).toContain('自选股');
    expect(tagNames).toContain('回测');
    expect(tagNames).toContain('AI分析');
    expect(tagNames).toContain('系统');
  });

  it('应该将 Express 路径参数转为 OpenAPI 格式', () => {
    const spec = generateOpenAPISpec();
    const paths = Object.keys(spec.paths);
    // Express :param → OpenAPI {param}
    expect(paths.some(p => p.includes('{'))).toBe(true);
    expect(paths.some(p => p.includes(':'))).toBe(false);
  });

  it('应该生成 JSON 格式文档', () => {
    const json = generateOpenAPIJson();
    expect(() => JSON.parse(json)).not.toThrow();
    const parsed = JSON.parse(json);
    expect(parsed.openapi).toBe('3.0.3');
  });

  it('应该生成 YAML 格式文档', () => {
    const yaml = generateOpenAPIYaml();
    expect(yaml).toContain('openapi: 3.0.3');
    expect(yaml).toContain('title: A股行情分析网站 API');
  });

  it('应该包含操作ID', () => {
    const spec = generateOpenAPISpec();
    for (const [, methods] of Object.entries(spec.paths)) {
      for (const [, op] of Object.entries(methods as Record<string, any>)) {
        expect(op.operationId).toBeDefined();
        expect(typeof op.operationId).toBe('string');
      }
    }
  });
});

describe('路由注册中心', () => {
  beforeAll(() => {
    apiDocRegistry.clear();
  });

  it('应该注册路由文档', () => {
    registerRoute({
      method: 'get',
      path: '/api/test',
      tag: '测试',
      summary: '测试路由',
      responses: [{ status: 200, description: '成功' }],
    });

    const routes = apiDocRegistry.getRoutes();
    expect(routes.some(r => r.path === '/api/test' && r.method === 'get')).toBe(true);
  });

  it('应该避免重复注册', () => {
    apiDocRegistry.clear();
    registerRoute({
      method: 'get',
      path: '/api/dup',
      tag: '测试',
      summary: '第一次',
    });
    registerRoute({
      method: 'get',
      path: '/api/dup',
      tag: '测试',
      summary: '第二次',
    });
    const routes = apiDocRegistry.getRoutes().filter(r => r.path === '/api/dup');
    expect(routes).toHaveLength(1);
    expect(routes[0].summary).toBe('第一次');
  });

  it('应该注册标签', () => {
    registerTag('自定义标签', '这是自定义标签的描述');
    const tags = apiDocRegistry.getTags();
    expect(tags.some(t => t.name === '自定义标签')).toBe(true);
  });

  it('应该按标签筛选路由', () => {
    apiDocRegistry.clear();
    registerRoute({ method: 'get', path: '/a', tag: 'A', summary: 'A' });
    registerRoute({ method: 'get', path: '/b', tag: 'B', summary: 'B' });
    registerRoute({ method: 'post', path: '/a2', tag: 'A', summary: 'A2' });
    const aRoutes = apiDocRegistry.getRoutesByTag('A');
    expect(aRoutes).toHaveLength(2);
  });

  it('应该支持 toJSON 导出', () => {
    apiDocRegistry.clear();
    registerTag('T1', '标签1');
    registerRoute({ method: 'get', path: '/r1', tag: 'T1', summary: '路由1' });
    const json = apiDocRegistry.toJSON();
    expect(json.routes).toHaveLength(1);
    expect(json.tags).toHaveLength(1);
    expect(json.tags[0].name).toBe('T1');
  });

  it('应该支持 clear 清空', () => {
    registerRoute({ method: 'get', path: '/z', tag: 'Z', summary: 'Z' });
    apiDocRegistry.clear();
    expect(apiDocRegistry.getRoutes()).toHaveLength(0);
    expect(apiDocRegistry.getTags()).toHaveLength(0);
  });
});

describe('路由自动注册', () => {
  it('应该注册所有核心标签', () => {
    apiDocRegistry.clear();
    initApiDocs();
    const tags = apiDocRegistry.getTags().map(t => t.name);
    expect(tags).toContain('股票');
    expect(tags).toContain('搜索');
    expect(tags).toContain('技术指标');
    expect(tags).toContain('板块');
    expect(tags).toContain('资金流向');
    expect(tags).toContain('自选股');
    expect(tags).toContain('预警');
    expect(tags).toContain('选股器');
    expect(tags).toContain('回测');
    expect(tags).toContain('投资组合');
    expect(tags).toContain('新闻');
    expect(tags).toContain('社交');
    expect(tags).toContain('AI分析');
    expect(tags).toContain('AI选股');
    expect(tags).toContain('财务');
    expect(tags).toContain('用户');
    expect(tags).toContain('ETF');
    expect(tags).toContain('系统');
  });

  it('应该注册超过50个端点', () => {
    apiDocRegistry.clear();
    initApiDocs();
    const routes = apiDocRegistry.getRoutes();
    expect(routes.length).toBeGreaterThan(50);
  });

  it('GET 端点应多于 POST 端点', () => {
    apiDocRegistry.clear();
    initApiDocs();
    const getRoutes = apiDocRegistry.getRoutes().filter(r => r.method === 'get');
    const postRoutes = apiDocRegistry.getRoutes().filter(r => r.method === 'post');
    expect(getRoutes.length).toBeGreaterThan(postRoutes.length);
  });

  it('应该包含所有核心 API 路径', () => {
    apiDocRegistry.clear();
    initApiDocs();
    const paths = apiDocRegistry.getRoutes().map(r => r.path);

    expect(paths).toContain('/api/stocks');
    expect(paths).toContain('/api/stocks/:symbol');
    expect(paths).toContain('/api/stocks/:symbol/kline');
    expect(paths).toContain('/api/search');
    expect(paths).toContain('/api/sectors');
    expect(paths).toContain('/api/watchlist');
    expect(paths).toContain('/api/alerts');
    expect(paths).toContain('/api/screener/filter');
    expect(paths).toContain('/api/backtest/run');
    expect(paths).toContain('/api/portfolio');
    expect(paths).toContain('/api/news');
    expect(paths).toContain('/api/financials/summary');
    expect(paths).toContain('/health');
    expect(paths).toContain('/api/etf/list');
    expect(paths).toContain('/api/ai/selection/recommendations');
  });

  it('auth 标记应正确标识需要认证的端点', () => {
    apiDocRegistry.clear();
    initApiDocs();
    const authRoutes = apiDocRegistry.getRoutes().filter(r => r.auth);
    const noAuthRoutes = apiDocRegistry.getRoutes().filter(r => !r.auth);

    expect(authRoutes.length).toBeGreaterThan(0);
    expect(noAuthRoutes.length).toBeGreaterThan(0);

    // 自选股和用户管理需要认证
    const watchlistRoutes = authRoutes.filter(r => r.path.includes('watchlist'));
    expect(watchlistRoutes.length).toBeGreaterThan(0);

    // 搜索和行情不需要认证
    const publicRoutes = noAuthRoutes.filter(r => r.path.includes('search') || r.path.includes('stocks'));
    expect(publicRoutes.length).toBeGreaterThan(0);
  });
});

describe('OpenAPI 规范完整性', () => {
  beforeAll(() => {
    apiDocRegistry.clear();
    initApiDocs();
  });

  it('所有路径应至少有一个操作', () => {
    const spec = generateOpenAPISpec();
    for (const [path, methods] of Object.entries(spec.paths)) {
      const methodCount = Object.keys(methods).length;
      expect(methodCount, `路径 ${path} 没有操作`).toBeGreaterThan(0);
    }
  });

  it('所有操作应有 summary', () => {
    const spec = generateOpenAPISpec();
    for (const [, methods] of Object.entries(spec.paths)) {
      for (const [, op] of Object.entries(methods as Record<string, any>)) {
        expect(op.summary, `操作缺少 summary`).toBeDefined();
        expect(op.summary.length).toBeGreaterThan(0);
      }
    }
  });

  it('所有操作应有 tags', () => {
    const spec = generateOpenAPISpec();
    const definedTags = spec.tags.map(t => t.name);
    for (const [, methods] of Object.entries(spec.paths)) {
      for (const [, op] of Object.entries(methods as Record<string, any>)) {
        expect(op.tags, `操作缺少 tags`).toBeDefined();
        expect(op.tags.length).toBeGreaterThan(0);
        for (const tag of op.tags) {
          expect(definedTags, `标签 "${tag}" 未在 tags 定义中`).toContain(tag);
        }
      }
    }
  });

  it('所有操作应有 responses', () => {
    const spec = generateOpenAPISpec();
    for (const [, methods] of Object.entries(spec.paths)) {
      for (const [, op] of Object.entries(methods as Record<string, any>)) {
        expect(op.responses, `操作缺少 responses`).toBeDefined();
        expect(Object.keys(op.responses).length).toBeGreaterThan(0);
      }
    }
  });

  it('需要认证的操作应有 security 定义', () => {
    apiDocRegistry.clear();
    initApiDocs();
    const spec = generateOpenAPISpec();
    const authRoutes = apiDocRegistry.getRoutes().filter(r => r.auth);

    for (const route of authRoutes) {
      const openApiPath = route.path.replace(/:(\w+)/g, '{$1}');
      const pathObj = spec.paths[openApiPath];
      if (pathObj && pathObj[route.method]) {
        expect(
          pathObj[route.method].security,
          `认证端点 ${route.method.toUpperCase()} ${route.path} 缺少 security`
        ).toBeDefined();
      }
    }
  });
});
