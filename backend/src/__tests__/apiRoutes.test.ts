/**
 * API 路由注册完整性测试 —— 断言源为运行中 Express app 的**真实路由栈**
 *
 * 【本文件为何被重写】
 * 旧版本是一份 100% 自测自的假测试：全文件唯一 import 是 vitest，自己硬编码
 * 一个 `apiRoutes` 数组，然后对该数组自身断言（条目数 ≥35、路径前缀、方法合法、
 * 唯一性、金融类 ≥8……）。它验证的从来不是「路由是否真的被 Express 注册」，
 * 而是「这个数组长什么样」，因此任何端点漏注册都不会让它变红。
 *
 * 实测坐实：旧清单 36 条里有 5 条后端从未注册（含 /api/order-book/:symbol），
 * 而旧测试 10 个用例照样全绿。
 *
 * 【现在的契约】
 * 所有断言的断言源都是 `collectRegisteredRoutes(app)` —— 从 `app._router` 反向
 * dump 出的真实路由表。下方 `EXPECTED_ROUTES` 只是「待验条目」，是否被注册由
 * app 决定；任何人往清单里塞虚构端点，测试立刻红。
 *
 * 【负向验证已实测】
 * 开发期曾临时向清单插入 `GET /api/order-book/:symbol`，本文件如预期变红
 * （见提交说明），验证完毕后移除。
 */

import { describe, it, expect } from 'vitest';
import { app } from '../app';
import {
  collectRegisteredRoutes,
  collectRegisteredRouteKeys,
} from './helpers/expressRoutes';

/**
 * 期望已注册的路由清单。**这不是事实，只是待验条目**——每一条都会在
 * 下方「注册完整性」用例里与真实路由表比对，漏注册即红。
 *
 * 已剔除旧清单中 5 条实测未注册的端点（剔除依据见文件末尾「已知未注册」用例）：
 *   GET /api/financials/:symbol   → 实际注册的是 /api/financials/{summary,balance-sheet,…}
 *   GET /api/stock-compare        → 实际注册的是 /api/compare
 *   GET /api/sector-analysis      → 实际注册的是 /api/sectors/analysis
 *   GET /api/order-book/:symbol   → 实现仅存于 api/_archived/，前端已按死链清理
 *   GET /api/shareholder-changes  → 后端无此路由
 *
 * 剔除后共 31 条（旧清单 36 条）。
 */
const EXPECTED_ROUTES = [
  // 股票核心
  { method: 'GET', path: '/api/stocks', desc: '股票列表' },
  { method: 'GET', path: '/api/stocks/:symbol', desc: '股票详情' },
  { method: 'GET', path: '/api/stocks/:symbol/kline', desc: 'K线数据' },
  { method: 'GET', path: '/api/market/summary', desc: '市场概览' },

  // 搜索
  { method: 'GET', path: '/api/search', desc: '股票搜索' },
  { method: 'GET', path: '/api/search/history', desc: '搜索历史' },

  // 自选股
  { method: 'GET', path: '/api/watchlist', desc: '自选股列表' },
  { method: 'POST', path: '/api/watchlist', desc: '添加自选股' },
  { method: 'PUT', path: '/api/watchlist/reorder', desc: '自选股排序' },

  // 选股器
  { method: 'POST', path: '/api/screener/advanced-filter', desc: '高级筛选' },
  { method: 'GET', path: '/api/screener/advanced-presets', desc: '预设策略' },

  // 回测
  { method: 'POST', path: '/api/backtest/run', desc: '运行回测' },
  { method: 'GET', path: '/api/backtest/presets', desc: '回测预设' },
  { method: 'POST', path: '/api/backtest/compare', desc: '策略对比' },

  // 投资组合
  { method: 'GET', path: '/api/portfolio', desc: '组合列表' },
  { method: 'GET', path: '/api/portfolio/:id', desc: '组合详情' },

  // 新闻
  { method: 'GET', path: '/api/news', desc: '新闻列表' },
  { method: 'GET', path: '/api/news/:id', desc: '新闻详情' },

  // 资金流向
  { method: 'GET', path: '/api/fund-flow/industry', desc: '行业资金流' },

  // 用户
  { method: 'POST', path: '/api/user/register', desc: '用户注册' },
  { method: 'POST', path: '/api/user/login', desc: '用户登录' },
  { method: 'PUT', path: '/api/user/settings', desc: '用户设置' },

  // 性能监控
  { method: 'GET', path: '/api/performance/overview', desc: '性能概览' },

  // 融资融券
  { method: 'GET', path: '/api/margin/overview', desc: '两融概览' },

  // 龙虎榜
  { method: 'GET', path: '/api/top-traders/overview', desc: '龙虎榜概览' },

  // 大宗交易
  { method: 'GET', path: '/api/block-trades', desc: '大宗交易' },

  // 限售解禁
  { method: 'GET', path: '/api/lockup/calendar', desc: '解禁日历' },

  // AI 分析
  { method: 'GET', path: '/api/ai/recommendations', desc: 'AI推荐' },
  { method: 'GET', path: '/api/ai/diagnose/:symbol', desc: 'AI诊断' },
  { method: 'GET', path: '/api/ai/sector-rotation', desc: '行业轮动' },
  { method: 'GET', path: '/api/ai/alert-suggestions', desc: '预警建议' },
];

/** 断言源：真实注册路由表（唯一可信来源） */
const registeredRoutes = collectRegisteredRoutes(app);
const registeredKeys = collectRegisteredRouteKeys(app);

const keyOf = (r: { method: string; path: string }): string => `${r.method} ${r.path}`;

describe('提取器自检', () => {
  // 这组用例是「路由栈提取本身仍然有效」的可执行证据。
  // 若 Express 升级改变了 layer 结构导致挂载前缀丢失，这里先红，
  // 避免清单断言因提取退化而静默通过。

  it('应 dump 出规模合理的真实路由表', () => {
    // 实测 250 条；阈值取 200，保留正常增删余量，但整片路由丢失会立刻暴露
    expect(registeredRoutes.length).toBeGreaterThanOrEqual(200);
  });

  it('一级挂载前缀未丢失：/api 前缀路由可被提取到', () => {
    for (const key of ['GET /api/stocks', 'GET /api/market/summary', 'GET /api/search']) {
      expect(registeredKeys, `真实路由表应包含 ${key}`).toContain(key);
    }
  });

  it('二级挂载前缀未丢失：/api/etf 与 /api/hk-connect 子路由可被提取到', () => {
    expect(registeredKeys).toContain('GET /api/etf/list');
    expect(registeredKeys).toContain('GET /api/hk-connect/ah-premium');
  });

  it('非 API 路由（/health、/）也应被提取到', () => {
    expect(registeredKeys).toContain('GET /health');
    expect(registeredKeys).toContain('GET /');
  });
});

describe('注册完整性（核心：每条清单路由都要真的能命中）', () => {
  it.each(EXPECTED_ROUTES)('$method $path 应真实注册 —— $desc', (route) => {
    expect(registeredKeys, `${keyOf(route)} 未在 app 上注册`).toContain(keyOf(route));
  });

  it('清单中不得存在任何未注册条目', () => {
    const missing = EXPECTED_ROUTES.filter((r) => !registeredKeys.has(keyOf(r))).map(keyOf);
    expect(missing, '以下条目在清单中宣称已注册，但 app 上并不存在').toEqual([]);
  });

  it('清单条目本身不得重复（防止靠重复条目凑数）', () => {
    const keys = EXPECTED_ROUTES.map(keyOf);
    const dup = keys.filter((k, i) => keys.indexOf(k) !== i);
    expect(dup).toEqual([]);
  });
});

describe('路由规范校验（断言源为真实路由表，非硬编码数组）', () => {
  it('所有真实路由的路径应以 / 开头', () => {
    const bad = registeredRoutes.filter((r) => !r.path.startsWith('/')).map(keyOf);
    expect(bad).toEqual([]);
  });

  it('所有真实路由的 HTTP 方法应合法', () => {
    const valid = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
    const bad = registeredRoutes.filter((r) => !valid.has(r.method)).map(keyOf);
    expect(bad).toEqual([]);
  });

  it('真实路由路径不应包含连续斜杠', () => {
    const bad = registeredRoutes.filter((r) => r.path.includes('//')).map(keyOf);
    expect(bad).toEqual([]);
  });

  it('以 /api 打头的路径必须严格带段分隔（/api/ 或 /api-docs/）', () => {
    const bad = registeredRoutes
      .filter((r) => r.path.startsWith('/api') && !/^\/api(-docs)?(\/|$)/.test(r.path))
      .map(keyOf);
    expect(bad).toEqual([]);
  });

  it('真实注册路由中 GET 应多于 POST', () => {
    const getCount = registeredRoutes.filter((r) => r.method === 'GET').length;
    const postCount = registeredRoutes.filter((r) => r.method === 'POST').length;
    expect(getCount).toBeGreaterThan(postCount);
  });
});

describe('已知未注册端点（诚实契约：断言源仍为真实路由表）', () => {
  // 旧假测试把下面这些端点列为「应该已注册」，实际从未挂载。
  // 这里反向锁定事实，防止有人再误以为它们已注册；若将来真注册了，
  // 这几条会红——那正是需要人工同步决策（前端死链清单）的时刻。
  it('/api/order-book/:symbol 确实未注册（实现仅存于 api/_archived/）', () => {
    expect(registeredKeys.has('GET /api/order-book/:symbol')).toBe(false);
  });

  it('/api/shareholder-changes 确实未注册', () => {
    expect(registeredKeys.has('GET /api/shareholder-changes')).toBe(false);
  });

  it('/api/stock-compare 确实未注册（真实端点为 /api/compare）', () => {
    expect(registeredKeys.has('GET /api/stock-compare')).toBe(false);
  });

  it('/api/sector-analysis 确实未注册（真实端点为 /api/sectors/analysis）', () => {
    expect(registeredKeys.has('GET /api/sector-analysis')).toBe(false);
  });

  it('/api/financials/:symbol 确实未注册（真实端点为 /api/financials/* 具名子路由）', () => {
    expect(registeredKeys.has('GET /api/financials/:symbol')).toBe(false);
  });
});
