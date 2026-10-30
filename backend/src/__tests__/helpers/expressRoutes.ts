/**
 * Express 真实路由表提取器
 *
 * 存在意义（工单 P0-FAKE-ROUTE-TEST）：
 * `backend/src/__tests__/apiRoutes.test.ts` 曾是一份 100% 自测自的假测试——
 * 它硬编码一个 `apiRoutes` 数组，然后对该数组自身断言（数量、前缀、唯一性）。
 * 它验证的从来不是「路由是否真的被 Express 注册」，而是「这个数组长什么样」，
 * 因此任何端点漏注册都不会让它变红。
 *
 * 本模块提供**从运行中的 Express app 反向 dump 出真实路由表**的能力，
 * 使「路由注册完整性」类断言必须以真实路由栈为断言源，而非硬编码清单。
 *
 * 实现要点（Express 4.22.x）：
 * - 顶层路由栈位于 `app._router.stack`；
 * - 终结路由 layer 带 `route`（含 `path` 与 `methods`）；
 * - 子路由 layer 的 `handle` 本身是 Router，其 `handle.stack` 需递归下钻，
 *   挂载前缀取该 layer 的 `path`（`app.use('/api', stockRouter)` → '/api'）。
 */

import type { Express } from 'express';

/** 一条被真实注册的路由 */
export interface RegisteredRoute {
  /** 大写 HTTP 方法，如 'GET' */
  method: string;
  /** 完整路径（含挂载前缀），参数段保留 Express 书写形式，如 '/api/stocks/:symbol' */
  path: string;
}

type Layer = {
  route?: { path?: string; methods?: Record<string, boolean> };
  handle?: unknown;
  path?: string;
  regexp?: RegExp;
};

function isRouterLike(handle: unknown): handle is { stack: Layer[] } {
  return (
    typeof handle === 'function' &&
    handle !== null &&
    Array.isArray((handle as { stack?: unknown }).stack)
  );
}

/** 拼接前缀与子路径，避免出现 '//'，空结果归一为 '/' */
function joinPath(prefix: string, sub: string | undefined): string {
  const pre = (prefix || '').replace(/\/+$/, '');
  const seg = (sub || '').replace(/\/+$/, '');
  const joined = `${pre}${seg}`;
  return joined === '' ? '/' : joined;
}

/**
 * 从 Layer 编译后的 regexp 反解挂载前缀。
 *
 * 实测（Express 4.22.1）：`app.use('/api/etf', router)` 产生的 Layer 上
 * `layer.path` 为 **undefined**，挂载前缀只存在于编译后的 regexp：
 *   `/^\/api\/etf\/?(?=\/|$)/i`
 * 因此只能从 regexp 源码反解。若将来 Express 恢复了 `path` 属性，本函数
 * 仍可用（调用处优先取 `layer.path`，取不到才 fallback 到 regexp）。
 */
function prefixFromRegexp(regexp: RegExp | undefined): string {
  if (!regexp) return '';
  // 用 .source 而非 String(regexp)：前者是 `^\/api\/etf\/?(?=\/|$)`，
  // 后者多了首尾的 `/` 与 flags，会让 '^' 锚点失效。
  const m = /^\^(.+?)\\\/\?\(\?=/.exec(regexp.source);
  if (!m) return '';
  return m[1].replace(/\\\//g, '/');
}

function collectFromStack(stack: Layer[], prefix: string, out: RegisteredRoute[]): void {
  for (const layer of stack) {
    // 终结路由：router.get('/x', h) / router.route('/x').get().post()
    if (layer.route) {
      const methods = Object.keys(layer.route.methods || {}).filter(
        (m) => (layer.route!.methods as Record<string, boolean>)[m]
      );
      for (const m of methods) {
        out.push({ method: m.toUpperCase(), path: joinPath(prefix, layer.route.path) });
      }
      continue;
    }

    // 子路由：app.use('/api', someRouter) —— 递归下钻并累加上挂载前缀
    if (isRouterLike(layer.handle)) {
      const mountPath = layer.path ?? prefixFromRegexp(layer.regexp);
      collectFromStack(layer.handle.stack, joinPath(prefix, mountPath), out);
    }
  }
}

/**
 * 提取 app 上真实注册的全部路由。
 * 返回的 `METHOD PATH` 集合即「路由注册完整性」断言的唯一可信来源。
 */
export function collectRegisteredRoutes(app: Express): RegisteredRoute[] {
  const root = (app as unknown as { _router?: { stack: Layer[] } })._router;
  if (!root || !Array.isArray(root.stack)) {
    throw new Error(
      '无法定位 Express 路由栈（app._router.stack 不存在）。' +
        '若项目升级到 Express 5，请改用 app.router.stack 并同步更新本提取器。'
    );
  }
  const out: RegisteredRoute[] = [];
  collectFromStack(root.stack, '', out);
  return out;
}

/** `METHOD PATH` 形式的路由键集合，便于 O(1) 命中判断 */
export function collectRegisteredRouteKeys(app: Express): Set<string> {
  return new Set(collectRegisteredRoutes(app).map((r) => `${r.method} ${r.path}`));
}
