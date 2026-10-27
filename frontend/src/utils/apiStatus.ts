/**
 * 接口状态判别 —— 「端点未部署 / 数据不可得 / 请求失败」三类形态的**唯一判别真源**
 *
 * ## 为什么要这个文件
 *
 * 线上前端（GitHub Pages）配的后端是 Cloudflare Worker `clair-worker`：它只挂载了
 * 后端 Express 全部端点的一小部分（实测 Worker 42 条路由模式 vs Express 250 处注册）。
 * 于是**大量页面打到的 `/api/xxx` 在线上是不存在的**。
 *
 * 问题在于这类「不存在」的返回形态容易被误读：
 *
 *   - `fetch()` 只在**网络层失败**时 reject，HTTP 404 **会正常 resolve**；
 *   - Worker 的未命中响应是 `HTTP 404 + {"success":false,"error":"Not found"}`；
 *   - 页面里的写法普遍是 `.then(r => { if (!r.ok) throw new Error('HTTP 404'); return r.json(); })`，
 *     于是 404 走进 catch 分支，被当成「某某接口请求失败」渲染出来。
 *
 * 结果：用户看到一个「转不动也没数据的产品」，而真相是「这个演示环境没挂这个接口」。
 * 这两件事必须分开说 —— 把环境缺失说成数据缺失、或反过来，都是对用户撒谎。
 *
 * 本模块把判别收口成一**个可机读的枚举**（不是散落的字符串 `includes('404')` 判断）：
 *
 *   | kind            | 含义                       | 判据                                    |
 *   |-----------------|----------------------------|-----------------------------------------|
 *   | `not-deployed`  | 端点在当前后端未挂载        | 通用「路由未命中」指纹（见下方白名单）   |
 *   | `unavailable`   | 接口在，但该口径没有数据    | HTTP 2xx + `dataSource==='unavailable'` |
 *   | `failed`        | 真的请求失败                | 网络错误 / 5xx / 超时 / 业务性错误      |
 *   | `ok`            | 有真实数据                  | 其余                                     |
 *
 * ## 红线
 *
 * `not-deployed` 与 `unavailable` **绝不允许互相冒充**：前者是环境部署事实，
 * 后者是数据源事实。为降低误判，「未部署」只认**路由层通用未命中**的指纹，
 * 业务性 404（如「股票未找到」「投资组合不存在」）一律判为 `failed`，
 * 不会谎称接口没挂载。
 *
 * 本文件为**纯函数模块**：不 import React、不碰 window、不做副作用，便于单测。
 */

/** 接口状态的四类取值。`not-deployed` / `unavailable` / `failed` 三类需要给用户可见的解释。 */
export type ApiStatusKind = 'ok' | 'not-deployed' | 'unavailable' | 'failed';

/** 判别结果（机器可读）。UI 层按 kind 渲染，不要拿 reason 去做分支判断。 */
export interface ApiStatus {
  kind: ApiStatusKind;
  /** HTTP 状态码（网络层失败时为 undefined） */
  httpStatus?: number;
  /** 后端给出的原始原因，仅用于**展示**，不用于判别别类 */
  reason?: string;
  /** 命中的端点，仅用于**展示** */
  endpoint?: string;
}

export const OK_STATUS: ApiStatus = { kind: 'ok' };

/** 后端响应体里「真实数据不可得」的标记值。与后端 dataSource 契约保持一致。 */
export const UNAVAILABLE_DATA_SOURCE = 'unavailable';

/** 通用「路由未命中」错误文案指纹 —— Worker / Cloudflare Pages / SPA 兜底页 */
const GENERIC_NOT_FOUND_TEXT = /^\s*not\s*found\s*$/i;

/** Express `notFoundHandler` 抛的是 AppError(404, NOT_FOUND, `接口未找到: GET /api/xxx`) */
const EXPRESS_ROUTE_MISS_TEXT = /接口未找到|Not\s*Found:\s*\//i;

/** 静态托管的 HTML 404 兜底页（如把前端当 SPA 部署，未匹配的 /api/* 落到 index.html） */
const HTML_DOC = /^\s*<(!doctype|html)/i;

/** 尝试把字符串解析成 JSON；失败返回 undefined（不抛错） */
function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** 从任意响应体里取出可读的错误原因（只用于展示，绝不影响判别） */
function describeBodyError(body: unknown): string | undefined {
  if (typeof body === 'string') {
    return HTML_DOC.test(body) ? '服务端返回了 HTML 兜底页' : body.slice(0, 200);
  }
  if (!body || typeof body !== 'object') return undefined;
  const rec = body as Record<string, unknown>;
  const err = rec.error;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const inner = err as Record<string, unknown>;
    const parts = [inner.code, inner.message].filter((v): v is string => typeof v === 'string' && !!v);
    if (parts.length > 0) return parts.join(' — ');
  }
  if (typeof rec.message === 'string') return rec.message;
  return undefined;
}

/**
 * 「端点未部署」判据 —— **刻意收得很紧**，宁可判成 failed 也不谎称接口没挂载。
 *
 * 命中以下任一条即认为端点在当前后端未挂载：
 *   1. HTTP 501 Not Implemented（服务端明确说没实现）；
 *   2. HTTP 404 + `{"success":false,"error":"Not found"}`（Worker / Pages 的通用未命中体）；
 *   3. HTTP 404 + Express 未命中体的结构化错误 `{code:'NOT_FOUND', message:'接口未找到: …'}`；
 *   4. HTTP 404 + HTML 兜底页 body（静态托管把未匹配的 /api 路由回落到了 SPA 首页）；
 *   5. HTTP 404 + 空 body（没有任何业务语义，只能是路由层未命中）。
 *
 * 业务性 404（例如 `{success:false,error:'股票未找到'}`、`'投资组合不存在'`）**不在此列**：
 * 那些是「端点在、且明确回答了查无此资源」，判为 failed 更诚实。
 */
export function isEndpointNotDeployed(httpStatus: number | undefined, body: unknown): boolean {
  if (httpStatus === undefined) return false;
  if (httpStatus === 501) return true;
  if (httpStatus !== 404) return false;

  if (typeof body === 'string') {
    if (body.trim() === '') return true;
    if (HTML_DOC.test(body)) return true;
    // 有些传输层（axios 未自动解析、或响应头不对）会把 JSON 以字符串形式交上来。
    // 先试着解析再判，否则「同样的 404 响应体」会因传输层不同得出不同结论。
    const parsed = tryParseJson(body);
    return parsed !== undefined ? isEndpointNotDeployed(httpStatus, parsed) : false;
  }
  if (body === null || body === undefined) return true;
  if (typeof body !== 'object') return false;
  if (Array.isArray(body)) return false;

  const rec = body as Record<string, unknown>;
  // 只有「success 明确为假」的失败体才参与判别，避免把正常响应误判
  if (rec.success !== false) return false;

  const err = rec.error;
  if (typeof err === 'string') return GENERIC_NOT_FOUND_TEXT.test(err);
  if (err && typeof err === 'object') {
    const inner = err as Record<string, unknown>;
    const code = typeof inner.code === 'string' ? inner.code : '';
    const message = typeof inner.message === 'string' ? inner.message : '';
    if (code === 'NOT_FOUND' || code === 'ENDPOINT_NOT_FOUND') {
      return EXPRESS_ROUTE_MISS_TEXT.test(message) || message.trim() === '';
    }
  }
  return false;
}

/** 读响应体里的 dataSource 标记（body 顶层或 data 内均可）。 */
export function readDataSource(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const rec = body as Record<string, unknown>;
  const candidates: unknown[] = [rec.dataSource];
  const data = rec.data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    candidates.push((data as Record<string, unknown>).dataSource);
  }
  for (const c of candidates) {
    if (typeof c === 'string' && c !== '') return c;
  }
  return undefined;
}

/**
 * 判别一个 HTTP 响应属于哪一类。
 *
 * @param httpStatus HTTP 状态码；网络层失败传 undefined
 * @param body       已解析（或原始文本）的响应体
 *
 * 覆盖「HTTP 失败但 Promise fulfilled」的情形 —— 这是本模块存在的直接原因，
 * 见文件头注释里 404 JSON 走 resolve 分支导致文案错乱的说明。
 */
export function classifyApiResponse(httpStatus: number | undefined, body: unknown): ApiStatus {
  const reason = describeBodyError(body);

  // 没有 HTTP 状态码 ⟹ 请求根本没走到响应阶段（网络错误 / DNS / 超时 / CORS）。
  // 这必然是「真失败」，绝不能因为「没证据」就判成 ok——那等于说「有数据」。
  if (typeof httpStatus !== 'number') {
    return { kind: 'failed', reason: reason ?? '请求未完成（网络错误或超时）' };
  }

  if (httpStatus >= 400) {
    if (isEndpointNotDeployed(httpStatus, body)) {
      return { kind: 'not-deployed', httpStatus, reason };
    }
    return { kind: 'failed', httpStatus, reason: reason ?? `HTTP ${httpStatus}` };
  }

  if (body && typeof body === 'object') {
    const rec = body as Record<string, unknown>;
    if (readDataSource(body) === UNAVAILABLE_DATA_SOURCE) {
      return { kind: 'unavailable', httpStatus, reason };
    }
    if (rec.success === false) {
      // 2xx 却自称失败：端点在，但后端给出了业务性错误 → 属于「请求失败」，不是未部署
      return { kind: 'failed', httpStatus, reason: reason ?? '后端返回失败响应' };
    }
  }

  return { kind: 'ok', httpStatus };
}

/** 是否持有「需要向用户解释」的状态（三类非空态都需要给文案） */
export function needsNotice(status: ApiStatus | undefined | null): boolean {
  return !!status && status.kind !== 'ok';
}

export interface ApiStatusCopy {
  title: string;
  description: string;
}

/**
 * 三类状态的中文文案真源。
 *
 * 刻意把「环境未挂载」和「暂无数据」写成两种截然不同的说法，避免任何互相冒充的空间。
 */
export function describeApiStatus(status: ApiStatus, moduleName?: string): ApiStatusCopy {
  const subject = moduleName ? `「${moduleName}」` : '该模块';
  switch (status.kind) {
    case 'not-deployed':
      return {
        title: `${subject}需要连接完整后端`,
        description:
          `该模块依赖的接口在当前线上环境中未挂载` +
          (status.endpoint ? `（${status.endpoint}）` : '') +
          `。当前线上部署的是轻量演示后端（Cloudflare Worker，仅包含服务端能力的一部分），` +
          `要查看该模块的真实数据请连接完整后端服务。这不是「暂无数据」，也不是请求失败，` +
          `我们不会用任何估算值或示例数据填充这里。`,
      };
    case 'unavailable':
      return {
        title: '暂无数据',
        description:
          `接口已连通，但该口径当前没有可取的数据` +
          (status.reason ? `（${status.reason}）` : '') +
          `。这是真实的数据缺失，不代表接口故障，也未使用任何模拟值填充。`,
      };
    case 'failed':
      return {
        title: `${subject}请求失败`,
        description:
          (status.reason ? `失败原因：${status.reason}。` : '') +
          `这可能由网络异常、后端超时或服务暂时不可用引起，可稍后重试。`,
      };
    default:
      return { title: '', description: '' };
  }
}

/** 单行紧凑文案，用于列表/卡片内联提示 */
export function shortApiStatusText(status: ApiStatus): string {
  switch (status.kind) {
    case 'not-deployed':
      return '演示环境未挂载此接口，需连接完整后端';
    case 'unavailable':
      return '接口已连通，当前口径暂无数据';
    case 'failed':
      return `请求失败${status.reason ? `（${status.reason}）` : ''}`;
    default:
      return '';
  }
}

/**
 * 「端点未部署」专用错误类型。
 *
 * 调用方（尤其是已经手写了 `if (!r.ok) throw new Error('HTTP 404')` 的历史代码）
 * 抛出本类型后，上层可以直接 `instanceof` 判别，不必再靠解析错误字符串。
 */
export class EndpointNotDeployedError extends Error {
  readonly endpoint: string;
  readonly httpStatus: number;

  constructor(endpoint: string, httpStatus = 404) {
    super(`端点未部署: ${endpoint} (HTTP ${httpStatus})`);
    this.name = 'EndpointNotDeployedError';
    this.endpoint = endpoint;
    this.httpStatus = httpStatus;
  }
}
