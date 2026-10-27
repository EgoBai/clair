/**
 * 接口形态判别单测 —— 「端点未部署 / 数据不可得 / 请求失败」三类不许互串
 *
 * ## 为什么必须有三态而不是两态
 *
 * 线上前端配的后端是 Cloudflare Worker（实测 42 条路由），而后端 Express 有 250 处注册。
 * 缺口被请求到时返回 `HTTP 404 + {"success":false,"error":"Not found"}`。
 *
 * 这跟「接口在，但今天确实没有数据」是**两件不同的事实**：
 *   - 前者是部署事实 → 要说「演示环境没挂这个接口，需要连完整后端」
 *   - 后者是数据源事实 → 要说「暂无数据 / 该口径无数据」
 *
 * 反过来也一样：把「真实无数据」说成「没挂载」同样是撒谎（用户会以为换个后端就有了，
 * 而实际上换过去也是空的）。
 *
 * 本测试把这三类判据钉住，任何一方的判据被改宽/改窄都必须显式修改这里的用例。
 */

import { describe, it, expect } from 'vitest';
import {
  type ApiStatus,
  OK_STATUS,
  classifyApiResponse,
  describeApiStatus,
  EndpointNotDeployedError,
  isEndpointNotDeployed,
  needsNotice,
  readDataSource,
  shortApiStatusText,
} from '../utils/apiStatus';
import { normalizeApiPath, statusFromFailure, recordNotDeployed, wasEndpointNotDeployed, clearNotDeployed } from '../services/apiGateway';

/** Worker 真实未命中响应体（实测 https://clair-api.pages.dev/api/industries） */
const WORKER_404_BODY = { success: false, error: 'Not found' };

/** Express notFoundHandler → globalErrorHandler 的真实兜底体（结构化错误对象） */
const EXPRESS_404_BODY = {
  success: false,
  error: { code: 'NOT_FOUND', message: '接口未找到: GET /api/xxx' },
};

describe('isEndpointNotDeployed —— 只认路由层通用未命中', () => {
  it('Worker 的 404 + {"success":false,"error":"Not found"} 判为未部署', () => {
    expect(isEndpointNotDeployed(404, WORKER_404_BODY)).toBe(true);
  });

  it('Express 的结构化 NOT_FOUND（message 含「接口未找到」）判为未部署', () => {
    expect(isEndpointNotDeployed(404, EXPRESS_404_BODY)).toBe(true);
  });

  it('HTML 兜底页 404（静态托管把 /api 回落 SPA）判为未部署', () => {
    expect(isEndpointNotDeployed(404, '<!DOCTYPE html><html></html>')).toBe(true);
  });

  it('空 body 的 404 判为未部署（无业务语义，只能是路由未命中）', () => {
    expect(isEndpointNotDeployed(404, null)).toBe(true);
    expect(isEndpointNotDeployed(404, '')).toBe(true);
  });

  it('501 Not Implemented 判为未部署', () => {
    expect(isEndpointNotDeployed(501, WORKER_404_BODY)).toBe(true);
  });

  it('业务性 404（股票未找到）**不**判为未部署 —— 端点在且明确回答了', () => {
    expect(isEndpointNotDeployed(404, { success: false, error: '股票未找到' })).toBe(false);
    expect(isEndpointNotDeployed(404, { success: false, error: '投资组合不存在' })).toBe(false);
  });

  it('5xx / 4xx(非404) 一概不判为未部署', () => {
    expect(isEndpointNotDeployed(500, WORKER_404_BODY)).toBe(false);
    expect(isEndpointNotDeployed(403, WORKER_404_BODY)).toBe(false);
    expect(isEndpointNotDeployed(400, WORKER_404_BODY)).toBe(false);
  });

  it('2xx 响应绝不判为未部署', () => {
    expect(isEndpointNotDeployed(200, WORKER_404_BODY)).toBe(false);
  });
});

describe('classifyApiResponse —— HTTP 失败但 Promise fulfilled 也要判准', () => {
  it('Worker 404 JSON → not-deployed（这正是 fetch 会 resolve 的场景）', () => {
    const st = classifyApiResponse(404, WORKER_404_BODY);
    expect(st.kind).toBe('not-deployed');
    expect(st.httpStatus).toBe(404);
    expect(st.reason).toBe('Not found');
  });

  it('502/500 → failed', () => {
    expect(classifyApiResponse(502, { success: false, error: 'Bad gateway' }).kind).toBe('failed');
    expect(classifyApiResponse(500, null).kind).toBe('failed');
  });

  it('业务性 404 → failed（不是未部署）', () => {
    const st = classifyApiResponse(404, { success: false, error: '股票未找到' });
    expect(st.kind).toBe('failed');
  });

  it('2xx + dataSource:unavailable（顶层）→ unavailable', () => {
    expect(classifyApiResponse(200, { success: true, dataSource: 'unavailable' }).kind).toBe('unavailable');
  });

  it('2xx + dataSource:unavailable（嵌在 data 内）→ unavailable', () => {
    expect(
      classifyApiResponse(200, { success: true, data: { rows: [], dataSource: 'unavailable' } }).kind,
    ).toBe('unavailable');
  });

  it('2xx + success:false → failed（端点在，但后端明确报错）', () => {
    const st = classifyApiResponse(200, { success: false, error: '参数非法' });
    expect(st.kind).toBe('failed');
    expect(st.reason).toBe('参数非法');
  });

  it('2xx 正常体 → ok', () => {
    expect(classifyApiResponse(200, { success: true, data: [{ a: 1 }] }).kind).toBe('ok');
  });

  it('网络层失败（无状态码）→ failed', () => {
    expect(classifyApiResponse(undefined, undefined).kind).toBe('failed');
  });
});

describe('readDataSource', () => {
  it('顶层与 data 内的 dataSource 都能读到', () => {
    expect(readDataSource({ dataSource: 'unavailable' })).toBe('unavailable');
    expect(readDataSource({ data: { dataSource: 'tencent' } })).toBe('tencent');
    expect(readDataSource(undefined)).toBeUndefined();
  });

  it('data 是数组时不误读', () => {
    expect(readDataSource({ data: [{ dataSource: 'x' }] })).toBeUndefined();
  });
});

describe('三类文案 —— 不许互相冒充', () => {
  const notDeployed: ApiStatus = { kind: 'not-deployed', httpStatus: 404, endpoint: '/api/etf/list' };
  const unavailable: ApiStatus = { kind: 'unavailable', httpStatus: 200 };
  const failed: ApiStatus = { kind: 'failed', httpStatus: 500, reason: 'Internal' };

  it('未部署文案必须点明「演示环境未挂载 + 需连完整后端」，且不含「暂无数据」', () => {
    const copy = describeApiStatus(notDeployed, 'ETF');
    expect(copy.title).toContain('需要连接完整后端');
    expect(copy.description).toContain('Cloudflare Worker');
    expect(copy.description).toContain('未挂载');
    expect(copy.description).toContain('这不是「暂无数据」');
    expect(shortApiStatusText(notDeployed)).toContain('未挂载');
  });

  it('数据不可得文案必须是「暂无数据」，且**不能**说接口没挂载', () => {
    const copy = describeApiStatus(unavailable, 'ETF');
    expect(copy.title).toBe('暂无数据');
    expect(copy.description).toContain('接口已连通');
    expect(copy.description).not.toContain('未挂载');
    expect(copy.description).not.toContain('请求失败');
    expect(shortApiStatusText(unavailable)).toContain('暂无数据');
  });

  it('真失败文案保留「请求失败」并给出原因', () => {
    const copy = describeApiStatus(failed, 'ETF');
    expect(copy.title).toContain('请求失败');
    expect(copy.description).toContain('Internal');
    expect(shortApiStatusText(failed)).toContain('请求失败');
  });

  it('ok 态不该有任何提示文案，needsNotice 也应为 false', () => {
    expect(describeApiStatus(OK_STATUS).title).toBe('');
    expect(needsNotice(OK_STATUS)).toBe(false);
    expect(needsNotice(notDeployed)).toBe(true);
    expect(needsNotice(undefined)).toBe(false);
  });
});

describe('normalizeApiPath —— 登记与查询必须落到同一个 key', () => {
  it('相对路径与绝对 URL 归一化后一致', () => {
    expect(normalizeApiPath('/api/etf/list')).toBe('/api/etf/list');
    expect(normalizeApiPath('https://clair-api.pages.dev/api/etf/list?page=1')).toBe('/api/etf/list');
    expect(normalizeApiPath('/api/block-trades/')).toBe('/api/block-trades');
  });
});

describe('statusFromFailure —— 给已丢掉响应体的历史 catch 分支兜底', () => {
  it('登记表命中该端点 → not-deployed（覆盖 `throw new Error("HTTP 404")` 的老写法）', () => {
    clearNotDeployed();
    recordNotDeployed('/api/top-traders/overview', 404, 'Not found');
    expect(wasEndpointNotDeployed('/api/top-traders/overview')).toBe(true);

    const st = statusFromFailure(new Error('HTTP 404'), '/api/top-traders/overview');
    expect(st.kind).toBe('not-deployed');
    expect(st.httpStatus).toBe(404);
    clearNotDeployed();
  });

  it('EndpointNotDeployedError → not-deployed', () => {
    const st = statusFromFailure(new EndpointNotDeployedError('/api/x', 404), '/api/x');
    expect(st.kind).toBe('not-deployed');
  });

  it('未登记过的裸 Network Error → failed（宁可说失败，不臆断未部署）', () => {
    clearNotDeployed();
    const st = statusFromFailure(new Error('Network Error'), '/api/whatever');
    expect(st.kind).toBe('failed');
    expect(st.reason).toBe('Network Error');
  });

  it('未登记过但消息里有 HTTP 500 → failed 且记录状态码', () => {
    clearNotDeployed();
    const st = statusFromFailure(new Error('HTTP 500'), '/api/whatever');
    expect(st.kind).toBe('failed');
    expect(st.httpStatus).toBe(500);
  });
});
