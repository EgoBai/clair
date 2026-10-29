/**
 * API 网关 —— 「接口未部署」的**全局登记处**，以及给页面用的诚实取数入口
 *
 * ## 它解决什么问题
 *
 * `utils/apiStatus.ts` 有一套纯判别规则，但它需要「HTTP 状态码 + 响应体」才能工作。
 * 而线上真实链路里，绝大多数页面是这么写的：
 *
 * ```js
 * fetch('/api/xxx')
 *   .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
 *   .catch(err => setError(err.message));   // ← 404 与 500 在这里变成了同一句话
 * ```
 *
 * 页面**自己**把 404 JSON 的响应体丢了（在 `!r.ok` 处就 throw 掉了），
 * 判别所需的响应体就此蒸发，下游只剩一个 `"HTTP 404"` 字符串。
 *
 * 所以本模块把判别做到**传输层之前**：包住 `window.fetch`，在 HTTP >= 400 时
 * **先把错误体读出来判别完再放行**（用 `Response.clone()`，不动调用方要读的那份 body）。
 * 一旦判为「端点未部署」，立即登记到本模块的 registry。
 *
 * 之后页面只需问一句 `statusFromFailure(err, '/api/xxx')`，就能拿回**准确的一类态**，
 * 而不用自己去解析 `"HTTP 404"` 这种已经丢失语义的字符串。
 *
 * ## 为什么不在 interceptor 里直接改写响应体
 *
 * 改写 body 会让所有既有的 `d.success / d.data` 解析逻辑面临未知风险，
 * 也可能把「接口未部署」伪装成「后端给了个正常空数据」——那本身就是一种撒谎。
 * 这里采取的做法是：**只读不改写**，额外记录事实，由 UI 层显式取用。
 */

import {
  type ApiStatus,
  EndpointNotDeployedError,
  OK_STATUS,
  classifyApiResponse,
} from '../utils/apiStatus';

export { EndpointNotDeployedError };

/** 挂在 Response 实例上的判别结果属性名（非枚举，不影响 JSON/遍历） */
const STATUS_PROP = '__clairApiStatus';

export interface EndpointRecord {
  endpoint: string;
  httpStatus: number;
  reason?: string;
  at: number;
}

/** 已确认「未部署」的端点登记表。key 为归一化之后的 `/api/...` 路径。 */
const notDeployed = new Map<string, EndpointRecord>();

const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      /* 单个订阅者出错不能影响其余订阅者 */
    }
  });
}

/**
 * 把任意形态的地址归一成 `/api/xxx`（去 host、去 query、去尾部斜杠）。
 *
 * 页面传进来的通常是相对路径 `/api/etf/list`，而被 `main.tsx` 重写过的是
 * `https://clair-api.pages.dev/api/etf/list?x=1` —— 两者必须落到同一个 key，
 * 否则「登记」和「查询」永远对不上。
 */
export function normalizeApiPath(input: string | URL | Request | undefined | null): string {
  if (!input) return '';
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!raw) return '';
  let path = raw;
  try {
    path = new URL(raw, typeof location !== 'undefined' ? location.href : 'http://localhost').pathname;
  } catch {
    path = raw.split('?')[0].split('#')[0];
  }
  path = path.replace(/\/+$/, '');
  return path.startsWith('/api/') ? path : `/api/${path.replace(/^\/+/, '')}`;
}

function isApiRequest(raw: string): boolean {
  return /\/api\//.test(raw) || raw.startsWith('/api/');
}

/** 记录一个已确认未部署的端点 */
export function recordNotDeployed(endpoint: string, httpStatus: number, reason?: string): void {
  const key = normalizeApiPath(endpoint);
  if (!key) return;
  const existing = notDeployed.get(key);
  if (existing) {
    existing.httpStatus = httpStatus;
    existing.reason = reason;
    existing.at = Date.now();
  } else {
    notDeployed.set(key, { endpoint: key, httpStatus, reason, at: Date.now() });
  }
  notify();
}

/** 该端点是否在本次会话中被确认为「未部署」 */
export function wasEndpointNotDeployed(endpoint: string): boolean {
  return notDeployed.has(normalizeApiPath(endpoint));
}

/** 登记表快照（按时间倒序） */
export function snapshotNotDeployed(): EndpointRecord[] {
  return [...notDeployed.values()].sort((a, b) => b.at - a.at).map((e) => ({ ...e }));
}

/** 订阅登记表变化。返回取消订阅函数。 */
export function subscribeNotDeployed(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 清空登记表（页面导航 / 重试前调用，避免上一页的结论污染当前页） */
export function clearNotDeployed(): void {
  if (notDeployed.size === 0) return;
  notDeployed.clear();
  notify();
}

/** 从一个已拿到的 Response 上读取判别结果（若 interceptor 已标记过） */
export function readResponseStatus(res: Response): ApiStatus | undefined {
  return (res as unknown as Record<string, ApiStatus | undefined>)[STATUS_PROP];
}

function attachStatus(res: Response, status: ApiStatus): void {
  try {
    Object.defineProperty(res, STATUS_PROP, { value: status, enumerable: false, configurable: true });
  } catch {
    /* Response 在某些环境下不可扩展，忽略即可 —— 页面仍可靠 registry 判别 */
  }
}

/** 读取错误响应体（克隆一份，不消费调用方要读的那份），并判别形态 */
async function detectFailureBody(res: Response): Promise<unknown> {
  let text = '';
  try {
    text = await res.clone().text();
  } catch {
    return undefined;
  }
  if (text.trim() === '') return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/**
 * 安装 `window.fetch` 判别拦截器。幂等，重复调用无副作用。
 *
 * 注意：这里**同时适用于 dev 与生产**。dev 下 Vite proxy 转发到本机 Express（端点齐全），
 * 所以日常不会命中；但一旦有人把 dev 指向 Worker，页面表现必须与生产一致，
 * 否则「本地跑得好好的」就会掩盖线上真相。
 */
export function installApiStatusInterceptor(): void {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  const g = window as unknown as Record<string, unknown>;
  if (g.__clairApiGatewayInstalled) return;
  g.__clairApiGatewayInstalled = true;

  const original = window.fetch.bind(window);

  const patched: typeof fetch = async (input, init) => {
    const rawUrl = extractUrl(input as RequestInfo | URL);
    const res = await original(input as RequestInfo | URL, init);

    if (isApiRequest(rawUrl) && typeof res.status === 'number' && res.status >= 400) {
      const body = await detectFailureBody(res);
      const status = classifyApiResponse(res.status, body);
      const endpoint = normalizeApiPath(rawUrl);
      const tagged: ApiStatus = { ...status, endpoint };
      attachStatus(res, tagged);
      if (tagged.kind === 'not-deployed') {
        recordNotDeployed(endpoint, res.status, tagged.reason);
        // 同时抛一次结构化信号到控制台，方便排查（不影响页面渲染）
        if (typeof console !== 'undefined') {
          console.warn(`[api-gateway] 端点未部署：${endpoint} (HTTP ${res.status})`);
        }
      }
    }

    return res;
  };

  window.fetch = patched;
}

/**
 * 给页面上已有的 catch 分支兜底用：把一个「已经丢了响应体」的错误还原成准确的一类态。
 *
 * 判据优先级：
 *   1. registry 里该端点已被确认为未部署 → `not-deployed`（覆盖 `throw new Error('HTTP 404')` 的历史写法）
 *   2. 错误本身是 `EndpointNotDeployedError` → `not-deployed`
 *   3. 其余（含无法验证的裸 `HTTP 404` 字符串）→ `failed`
 *
 * 第 3 条是刻意的保守：宁可说「请求失败」也不去猜「接口没部署」。
 */
/**
 * 读取挂在错误对象上的判别结论（由 `services/api.ts` 的 axios 错误拦截器写入）。
 *
 * 为什么要它：`Promise.all([...])` 里谁先 reject 是不确定的，页面往往拿着
 * 「第二个请求的失败」却去问「第一个端点」的登记表，于是明明是未部署也被判成失败。
 * 把结论**跟着错误本身**走，就能精确定位到出错的那一个请求。
 */
export function readAttachedStatus(err: unknown): ApiStatus | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const v = (err as unknown as Record<string, unknown>).__clairApiStatus;
  return (v && typeof v === 'object') ? (v as ApiStatus) : undefined;
}

export function statusFromFailure(err: unknown, endpoint: string): ApiStatus {
  const key = normalizeApiPath(endpoint);

  // 1) 错误自带结论最精准（axios 拦截器写入，能对应到具体哪个请求）
  const attached = readAttachedStatus(err);
  if (attached && attached.kind !== 'ok') return attached;

  // 2) 退回到登记表
  const hit = notDeployed.get(key);
  if (hit) {
    return {
      kind: 'not-deployed',
      httpStatus: hit.httpStatus,
      reason: hit.reason,
      endpoint: key,
    };
  }

  if (err instanceof EndpointNotDeployedError) {
    return { kind: 'not-deployed', httpStatus: err.httpStatus, endpoint: err.endpoint };
  }

  const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  const m = /HTTP\s+(\d{3})/.exec(msg);
  return {
    kind: 'failed',
    httpStatus: m ? Number(m[1]) : undefined,
    reason: msg || undefined,
    endpoint: key,
  };
}

/** axios 错误判别（404/5xx 在 axios 里会进 reject，`error.response.data` 已解析好） */
export function classifyAxiosError(err: unknown): ApiStatus | undefined {
  const maybe = err as { response?: { status?: number; data?: unknown; config?: { url?: string } }; isAxiosError?: boolean };
  if (!maybe?.response) return undefined;
  return classifyApiResponse(maybe.response.status, maybe.response.data);
}

/**
 * 诚实取数入口 —— 给页面用的推荐写法。
 *
 * 与直接 `fetch(...).then(r => r.json())` 的区别：**不丢失败语义**。
 * 返回值给出结构化 status + payload，调用方按 kind 渲染即可，不必再 catch 里猜。
 *
 * @returns `payload` 为 null 表示确实没有数据；`status.kind !== 'ok'` 时必须向用户解释原因。
 */
export async function fetchApiJson<T = unknown>(
  url: string,
  init?: RequestInit,
): Promise<{ status: ApiStatus; payload: T | null }> {
  try {
    const res = await fetch(url, init);
    const endpoint = normalizeApiPath(url);

    if (!res.ok) {
      const recorded = readResponseStatus(res);
      const status: ApiStatus =
        recorded ?? statusFromFailure(new Error(`HTTP ${res.status}`), endpoint);
      return { status: { ...status, endpoint }, payload: null };
    }

    const payload = (await res.json()) as T;
    const status = classifyApiResponse(res.status, payload);
    // unavailable 态仍回传 payload：后端常把自己的口径说明写在 data.notes 里，
    // 这些说明正是「为什么没有数据」的证据，丢了反而说不清。是否渲染由调用方按 kind 决定。
    return { status: { ...status, endpoint }, payload };
  } catch (err) {
    return { status: statusFromFailure(err, url), payload: null };
  }
}

/** 成功态常量，页面初始化 status 时用它避免到处写字面量 */
export { OK_STATUS };

/**
 * 一个模块同时打了多个端点时用（典型是 `Promise.all`）。
 *
 * 页面往往只能拿到「其中某一个」请求的失败错误，却要解释整个模块为什么没数据；
 * 这里按「只要有一个端点确认未部署，就说模块未部署」处理——
 * 该说法在「另一个端点也是好的」场景下依然成立（模块确实不完整）。
 *
 * 优先级与 `statusFromFailure` 一致：错误自带的结论 > 登记表 > failed。
 */
export function statusFromFailureAny(err: unknown, endpoints: string[]): ApiStatus {
  const attached = readAttachedStatus(err);
  if (attached && attached.kind !== 'ok') return attached;

  for (const ep of endpoints) {
    const hit = notDeployed.get(normalizeApiPath(ep));
    if (hit) {
      return { kind: 'not-deployed', httpStatus: hit.httpStatus, reason: hit.reason, endpoint: hit.endpoint };
    }
  }

  const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  const m = /HTTP\s+(\d{3})/.exec(msg);
  return {
    kind: 'failed',
    httpStatus: m ? Number(m[1]) : undefined,
    reason: msg || undefined,
    endpoint: endpoints[0] ? normalizeApiPath(endpoints[0]) : undefined,
  };
}
