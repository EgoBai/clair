/**
 * 路由自动注册 单元测试 + 真实路由表一致性测试
 *
 * 【本文件为何被重写】
 * 旧版本是一份 100% 自测自的假测试：它用 `vi.mock('../docs/apiDocRegistry')`
 * 把文档注册表整个 mock 掉，然后断言 `mockRoutes.length > 100`。而
 * `registerAllRoutes()` push 的内容来自 `routeAutoRegistry.ts` 内部**硬编码的
 * pathMetadata**（registerAllRoutes 就是 `for (const [key, meta] of Object.entries(pathMetadata))`）。
 * 也就是说：断言源是 pathMetadata，被测对象也是 pathMetadata —— 即使 app 上
 * 一条路由都没挂载，这份测试照样全绿。它从未验证「路由是否真的被 Express 注册」。
 *
 * 历史旁证：该断言曾因 `expected 98 to be greater than 100` 在 CI 红过（工单 #44），
 * 当时的处理是把数字改达标，而不是改机制——根因（自测自）一直没动。
 *
 * 【现在的契约：断言源分两类，各归各位】
 * 1. 「文档元数据」类断言（保留原有 mock 形态）：验的是 pathMetadata 派生出的
 *    文档条目本身（tag/summary/auth/method 齐全）。测试名一律以 `文档元数据` 开头，
 *    且显式写明**不代表路由已注册**。之所以保留 mock：它需要拦截 registerRoute 调用
 *    以观测入参，这是元数据层的合法观测点。
 * 2. 「真实路由表一致性」类断言（新增）：断言源是 `collectRegisteredRoutes(app)`
 *    —— 从 `app._router` 反向 dump 出的真实路由栈（实测 250 条）。这里才是
 *    「文档是否声明了不存在的端点」的唯一可信判定点。
 *
 * 【负向验证已实测】开发期曾临时向元数据快照插入 `GET /api/__negative_probe__/nope`，
 * 本文件如预期变红（详见提交说明），验证完毕后移除。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Router } from 'express';
import { app } from '../app';
import { collectRegisteredRoutes } from './helpers/expressRoutes';
import {
  registerAllTags,
  autoRegisterFromRouter,
  registerAllRoutes,
  initApiDocs,
} from '../docs/routeAutoRegistry';

/**
 * 拦截 registerRoute / registerTag 以观测文档元数据入参。
 *
 * 必须用 vi.hoisted：import '../app' 会在模块加载期触发
 * `api-docs.ts` 的 `initApiDocs()` → `registerAllRoutes()`，
 * 若 mock 数组是普通 const，会因 TDZ 抛
 * "Cannot access 'mockRoutes' before initialization"。
 */
const hoisted = vi.hoisted(() => ({
  routes: [] as any[],
  tags: [] as any[],
}));

vi.mock('../docs/apiDocRegistry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../docs/apiDocRegistry')>();
  return {
    ...actual,
    registerRoute: (route: any) => { hoisted.routes.push(route); },
    registerTag: (name: string, description: string) => { hoisted.tags.push({ name, description }); },
  };
});

const mockRoutes = hoisted.routes;
const mockTags = hoisted.tags;

beforeEach(() => {
  mockRoutes.length = 0;
  mockTags.length = 0;
});

// ============================================================================
// 断言源 A：真实 Express 路由栈（唯一可信来源，模块级只 dump 一次）
// ============================================================================
const registeredRoutes = collectRegisteredRoutes(app);

/** 文档元数据快照：registerAllRoutes() 依据 pathMetadata 生成的条目 */
const metaRoutes = (() => {
  const saved = mockRoutes.slice();
  mockRoutes.length = 0;
  registerAllRoutes();
  const snapshot = mockRoutes.slice();
  mockRoutes.length = 0;
  saved.forEach((r) => mockRoutes.push(r));
  return snapshot;
})();

const metaKeys: string[] = metaRoutes.map((r) => `${r.method.toUpperCase()} ${r.path}`);

/**
 * 路径按段匹配：字面量段必须相等；参数段只要求双方同为参数（`:id` 与 `:symbol`
 * 视为等价，参数命名是书写差异，不是注册差异）。
 * 注意：不允许「元数据写 :symbol、真实路由是字面量 overview」这种匹配——
 * 那会把幽灵文档判成已注册，正是本文件要抓的 bug 类型。
 */
function pathMatches(realPath: string, docPath: string): boolean {
  const a = realPath.split('/').filter(Boolean);
  const b = docPath.split('/').filter(Boolean);
  if (a.length !== b.length) return false;
  return a.every((seg, i) => seg === b[i] || (seg.startsWith(':') && b[i].startsWith(':')));
}

function hitOnApp(method: string, path: string): boolean {
  return registeredRoutes.some((r) => r.method === method && pathMatches(r.path, path));
}

// ============================================================================
// 断言源 A 的用例：真实路由表一致性
// ============================================================================
describe('真实路由表一致性（断言源：app._router，非 pathMetadata）', () => {
  it('提取器自检：真实路由表规模应合理（实测 250 条，阈值 200）', () => {
    // 阈值取 200：给正常增删留余量，但整片路由丢失（挂载前缀解析退化）会立刻暴露
    expect(registeredRoutes.length).toBeGreaterThanOrEqual(200);
  });

  it('提取器自检：一/二级挂载前缀未丢失（/api/stocks 与 /api/etf/list 均可提取到）', () => {
    expect(hitOnApp('GET', '/api/stocks')).toBe(true);
    expect(hitOnApp('GET', '/api/etf/list')).toBe(true);
    expect(hitOnApp('GET', '/api/hk-connect/ah-premium')).toBe(true);
  });

  it('核心：pathMetadata 声明的每条端点都必须能在真实路由表命中（不得有幽灵文档）', () => {
    const ghosts = metaKeys.filter((key) => {
      const [method, path] = key.split(' ');
      return !hitOnApp(method, path);
    });
    expect(
      ghosts,
      `以下端点被文档元数据声明，但 app 上并不存在（幽灵文档）：共 ${ghosts.length} 条`
    ).toEqual([]);
  });

  it('核心：文档元数据条目数应与真实可命中数一致（防止靠虚构条目凑数）', () => {
    const hitCount = metaKeys.filter((key) => {
      const [method, path] = key.split(' ');
      return hitOnApp(method, path);
    }).length;
    expect(hitCount).toBe(metaKeys.length);
  });

  it('反向：真实路由中未被文档登记的仅限已知豁免集', () => {
    // 诚实契约：这两条是实测存在、但 pathMetadata 未登记的端点。
    // 若将来新增端点又忘了登记文档，本用例会红——那正是需要人工补登记的时刻。
    // 若将来给它们补了文档，请同步从豁免集移除。
    const KNOWN_UNDOCUMENTED = ['GET /', 'GET /api/version'];
    const undocumented = registeredRoutes
      .filter((r) => !metaKeys.some((key) => {
        const [method, path] = key.split(' ');
        return r.method === method && pathMatches(r.path, path);
      }))
      .map((r) => `${r.method} ${r.path}`)
      .sort();
    expect(undocumented, '出现新的未登记端点，请补 pathMetadata 或显式加入豁免集').toEqual(
      KNOWN_UNDOCUMENTED
    );
  });

  it('文档元数据覆盖的真实端点应占真实路由表的绝大多数', () => {
    // 实测：250 条真实路由中 248 条有文档，覆盖率 99.2%；阈值 95%
    const documented = registeredRoutes.filter((r) =>
      metaKeys.some((key) => {
        const [method, path] = key.split(' ');
        return r.method === method && pathMatches(r.path, path);
      })
    ).length;
    expect(documented / registeredRoutes.length).toBeGreaterThan(0.95);
  });
});

// ============================================================================
// 断言源 B：文档元数据本身（自测自，仅校验元数据形态，不证明路由已注册）
// ============================================================================
describe('文档元数据 · registerAllTags（仅元数据，不代表路由已注册）', () => {
  it('应注册全部已知标签', () => {
    registerAllTags();
    expect(mockTags.length).toBeGreaterThan(25); // all tags
  });

  it('应注册股票类标签及其描述', () => {
    registerAllTags();
    const stockTag = mockTags.find(t => t.name === '股票');
    expect(stockTag).toBeDefined();
    expect(stockTag!.description).toBe('股票信息与行情数据');
  });

  it('应注册系统标签', () => {
    registerAllTags();
    expect(mockTags.some(t => t.name === '系统')).toBe(true);
  });

  it('应注册 AI 分析类标签', () => {
    registerAllTags();
    expect(mockTags.some(t => t.name === 'AI分析')).toBe(true);
    expect(mockTags.some(t => t.name === 'AI选股')).toBe(true);
  });

  it('应注册财务类标签', () => {
    registerAllTags();
    expect(mockTags.some(t => t.name === '财务')).toBe(true);
    expect(mockTags.some(t => t.name === '融资融券')).toBe(true);
  });

  it('应注册 ETF 标签', () => {
    registerAllTags();
    expect(mockTags.some(t => t.name === 'ETF')).toBe(true);
  });
});

describe('文档元数据 · registerAllRoutes（仅元数据，不代表路由已注册）', () => {
  it('元数据规模：应产出 100+ 条文档条目', () => {
    // 注意：这只是 pathMetadata 的条目数，与「这些端点是否真被 Express 挂载」无关。
    // 挂载事实由上方「真实路由表一致性」用例负责。
    registerAllRoutes();
    expect(mockRoutes.length).toBeGreaterThan(100);
  });

  it('股票详情端点的元数据应完整', () => {
    registerAllRoutes();
    const stockDetail = mockRoutes.find(r => r.path === '/api/stocks/:symbol' && r.method === 'get');
    expect(stockDetail).toBeDefined();
    expect(stockDetail!.tag).toBe('股票');
    expect(stockDetail!.summary).toBe('获取股票详情');
    expect(stockDetail!.responses).toBeDefined();
  });

  it('需鉴权的端点元数据应标记 auth', () => {
    registerAllRoutes();
    const authRoutes = mockRoutes.filter(r => r.auth);
    expect(authRoutes.length).toBeGreaterThanOrEqual(10);
    expect(mockRoutes.some(r => r.auth && r.path === '/api/watchlist')).toBe(true);
  });

  it('元数据应覆盖全部 HTTP 方法', () => {
    registerAllRoutes();
    const methods = new Set(mockRoutes.map(r => r.method));
    expect(methods.has('get')).toBe(true);
    expect(methods.has('post')).toBe(true);
    expect(methods.has('put')).toBe(true);
    expect(methods.has('delete')).toBe(true);
  });

  it('性能监控端点元数据应归到「性能」标签', () => {
    registerAllRoutes();
    const perfOverview = mockRoutes.find(r => r.path === '/api/performance/overview');
    expect(perfOverview).toBeDefined();
    expect(perfOverview!.tag).toBe('性能');
  });

  it('健康检查端点元数据应归到「系统」标签', () => {
    registerAllRoutes();
    const health = mockRoutes.find(r => r.path === '/health');
    expect(health).toBeDefined();
    expect(health!.tag).toBe('系统');
    expect(health!.summary).toBe('健康检查');
  });

  it('registerAllRoutes 应同时注册标签（不只是路由）', () => {
    registerAllRoutes();
    expect(mockTags.length).toBeGreaterThan(25);
  });

  it('每条元数据都应带 tag / summary / responses（文档可读性的最低要求）', () => {
    registerAllRoutes();
    const bad = mockRoutes
      .filter(r => !r.tag || !r.summary || !Array.isArray(r.responses) || r.responses.length === 0)
      .map(r => `${r.method} ${r.path}`);
    expect(bad).toEqual([]);
  });
});

// ============================================================================
// 函数行为：给定合成 Router 输入，校验 autoRegisterFromRouter 的实际行为
// ============================================================================
describe('autoRegisterFromRouter（合成 Router 输入 → 观测 registerRoute 调用）', () => {
  function createMockRouter(options?: { routes: { path: string; methods: string[] }[] }) {
    const layers = (options?.routes || []).map(r => ({
      route: {
        path: r.path,
        methods: Object.fromEntries(r.methods.map(m => [m, true])),
      },
    }));
    return { stack: layers } as any as Router;
  }

  it('空 router 不应抛错', () => {
    expect(() => autoRegisterFromRouter(createMockRouter())).not.toThrow();
  });

  it('只有 pathMetadata 中存在的路由才会被注册', () => {
    const router = createMockRouter({ routes: [{ path: '/api/stocks', methods: ['get'] }] });
    autoRegisterFromRouter(router);
    const testRoute = mockRoutes.find(r => r.path === '/api/stocks');
    expect(testRoute).toBeDefined();
    expect(testRoute!.method).toBe('get');
  });

  it('pathMetadata 中不存在的路由不应被注册（避免幽灵文档）', () => {
    const router = createMockRouter({ routes: [{ path: '/api/__not_in_metadata__', methods: ['get'] }] });
    autoRegisterFromRouter(router);
    expect(mockRoutes.some(r => r.path === '/api/__not_in_metadata__')).toBe(false);
  });

  it('basePath 前缀应被拼接到注册路径上', () => {
    const router = createMockRouter({ routes: [{ path: '/stocks', methods: ['get'] }] });
    autoRegisterFromRouter(router, '/api');
    expect(mockRoutes.some(r => r.path === '/api/stocks')).toBe(true);
  });

  it('同一路由的多个方法中，只有具备元数据的方法会被注册', () => {
    const router = createMockRouter({ routes: [{ path: '/api/stocks', methods: ['get', 'post', 'put', 'delete'] }] });
    autoRegisterFromRouter(router);
    const methods = mockRoutes.filter(r => r.path === '/api/stocks').map(r => r.method);
    // pathMetadata 里只有 'GET /api/stocks'
    expect(methods).toEqual(['get']);
  });

  it('应从元数据带入 summary', () => {
    const router = createMockRouter({ routes: [{ path: '/api/stocks/:symbol', methods: ['get'] }] });
    autoRegisterFromRouter(router);
    const route = mockRoutes.find(r => r.path === '/api/stocks/:symbol');
    expect(route).toBeDefined();
    expect(route!.summary).toBe('获取股票详情');
  });
});

describe('文档元数据 · initApiDocs（仅元数据，不代表路由已注册）', () => {
  it('应注册全部路由与标签', () => {
    initApiDocs();
    expect(mockTags.length).toBeGreaterThan(25);
    expect(mockRoutes.length).toBeGreaterThan(100);
  });

  it('重复调用不抛错且会再次产出条目（实现细节，非 bug）', () => {
    initApiDocs();
    const firstCount = mockRoutes.length;
    initApiDocs();
    expect(mockRoutes.length).toBeGreaterThan(firstCount);
  });
});
