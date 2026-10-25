// @vitest-environment jsdom
/**
 * 诚实契约守卫：AI 运维提示**绝不能**被当作「AI 总结 / 复盘 / 筛选结论」渲染给用户。
 *
 * 缺陷背景（P0-FIXEDTRUTH）：
 *   线上 `POST /api/ai/watchlist-summary` 实测返回
 *   `{"summary":"⚠️ AI总结服务未配置：请在 Cloudflare Pages 环境变量中设置 DEEPSEEK_API_KEY 后重试。"}`
 *   —— HTTP 200、无 success 字段。前端原先只判 `if (data.summary)`，
 *   于是这行**运维配置指令**被当作「AI 总结」渲染给用户。
 *
 * 本文件锁三层判据（frontend/src/utils/aiResponse.ts）：
 *   1. 结构化判据（success / dataSource / code）—— 主路径
 *   2. 运维指令闸门 —— 安全网：任何字段漏出运维指令即判「未接入」且**不返回该文本**
 *   3. 旧后端降级判据（⚠️ 前缀 + 失败信号组合）—— 兼容未升级的老 Worker
 *
 * 三条断言主线：
 *   A. 判据层：运维文本永远不作为业务内容返回（readAiResponse / classifyAiResponse）
 *   B. 组件层：WatchlistPage 渲染出的 DOM 里**不含**运维指令，含诚实中文提示
 *   C. 契约层：/api/alerts 返回体形状不兼容时记 failedSymbols 而非静默空
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import {
  readAiResponse,
  classifyAiResponse,
  looksLikeOpsInstruction,
} from '../utils/aiResponse';
import { fetchAlertsForSymbols } from '../hooks/useWatchlistData';

/* ------------------------------------------------------------------ */
/*  线上真实响应样本（curl 实测 clair-api.pages.dev）                   */
/* ------------------------------------------------------------------ */

/** 线上原样：运维提示被塞在业务字段 summary 里（这是要消灭的形态） */
const ONLINE_OPS_SUMMARY = {
  summary: '⚠️ AI总结服务未配置：请在 Cloudflare Pages 环境变量中设置 DEEPSEEK_API_KEY 后重试。',
};

/** 线上原样：/api/ai/filter 未配置 */
const ONLINE_OPS_FILTER = {
  success: false,
  error: 'AI筛选服务未配置：请在 Cloudflare Pages 设置 DEEPSEEK_API_KEY',
};

/** 修复后的 Worker 契约（clair-worker/worker.js handleAiWatchlistSummary） */
const WORKER_UNAVAILABLE = {
  success: false,
  dataSource: 'unavailable',
  code: 'UPSTREAM_UNAVAILABLE',
  error: 'DEEPSEEK_API_KEY 未配置',
  message: 'AI 总结服务未接入，暂时无法生成 AI 总结。',
  timestamp: 1760000000000,
};

/** 本地 Express 契约（backend/src/api/ai-chat.ts sendUnavailable） */
const LOCAL_UNAVAILABLE = {
  success: false,
  dataSource: 'unavailable',
  code: 'UPSTREAM_UNAVAILABLE',
  error: '追踪总结生成失败：AI 服务不可用',
  message: 'LLM 不可用，未生成任何自选股总结',
  timestamp: '2026-10-25T00:00:00.000Z',
};

const OPTS = {
  unavailableMessage: 'AI 总结服务未接入，暂时无法生成 AI 总结。',
  errorMessage: 'AI 总结生成失败，暂时无法生成 AI 总结。',
};

/* ================================================================== */
/*  A. 判据层                                                          */
/* ================================================================== */

describe('A. 运维指令闸门：运维文本永不可作为业务内容', () => {
  it('A1 线上原样响应（运维提示塞在 summary 里）→ 判失败，且不返回该文本', () => {
    const r = readAiResponse(ONLINE_OPS_SUMMARY, { ...OPTS, field: 'summary' });
    expect(r.ok).toBe(false);
    expect(r.kind).toBe('unavailable');
    // 关键：文本绝不能被当作 AI 总结返回
    expect((r as { text?: string }).text).toBeUndefined();
    expect(r.message).not.toContain('DEEPSEEK_API_KEY');
    expect(r.message).not.toContain('Cloudflare');
    expect(r.message).toBe(OPTS.unavailableMessage);
  });

  it('A2 运维指令出现在 message 字段（success:true 也拦）→ 判失败并丢弃该文本', () => {
    const poisoned = {
      success: true,
      dataSource: 'real',
      summary: '看起来像总结',
      message: '请在 Cloudflare Pages 环境变量中设置 DEEPSEEK_API_KEY',
    };
    const r = readAiResponse(poisoned, { ...OPTS, field: 'summary' });
    expect(r.ok).toBe(false);
    expect((r as { text?: string }).text).toBeUndefined();
    expect(r.message).toBe(OPTS.unavailableMessage);
  });

  it('A3 运维指令出现在 error 字段（success:false）→ 判失败，且不透传 error 原文', () => {
    const r = classifyAiResponse(ONLINE_OPS_FILTER, OPTS);
    expect(r.ok).toBe(false);
    expect(r.kind).toBe('unavailable');
    expect(r.message).not.toContain('DEEPSEEK_API_KEY');
    expect(r.message).not.toContain('Cloudflare');
    expect(r.message).toBe(OPTS.unavailableMessage);
  });

  it('A4 Worker 结构化未配置响应 → 判失败，kind=unavailable', () => {
    const r = readAiResponse(WORKER_UNAVAILABLE, { ...OPTS, field: 'summary' });
    expect(r.ok).toBe(false);
    expect(r.kind).toBe('unavailable');
    expect(r.message).toBe(WORKER_UNAVAILABLE.message);
    expect(r.message).not.toContain('DEEPSEEK_API_KEY');
  });

  it('A5 本地 Express 结构化未配置响应 → 判失败，kind=unavailable', () => {
    const r = readAiResponse(LOCAL_UNAVAILABLE, { ...OPTS, field: 'summary' });
    expect(r.ok).toBe(false);
    expect(r.kind).toBe('unavailable');
    expect(r.message).toBe(LOCAL_UNAVAILABLE.message);
  });

  it('A6 旧后端降级判据：⚠️ 前缀 + 失败信号 → 判失败，不返回原文', () => {
    const legacy = { summary: '⚠️ AI总结暂时不可用：上游超时' };
    const r = readAiResponse(legacy, { ...OPTS, field: 'summary' });
    expect(r.ok).toBe(false);
    // 「不可用」属降级信号词表 → 归类为 unavailable（与「未配置/未接入」同类）
    expect(r.kind).toBe('unavailable');
    expect((r as { text?: string }).text).toBeUndefined();
    expect(r.message).not.toContain('上游超时');
  });

  it('A6b 旧后端降级判据：⚠️ 前缀 + 「失败」信号（不含 unavailable 词）→ 归类为 error', () => {
    const legacy = { summary: '⚠️ AI总结生成失败，请稍后重试' };
    const r = readAiResponse(legacy, { ...OPTS, field: 'summary' });
    expect(r.ok).toBe(false);
    expect(r.kind).toBe('error');
    expect((r as { text?: string }).text).toBeUndefined();
  });

  it('A7 真实 AI 总结（无 success 字段、无 ⚠️、无运维词）→ 判成功并原样返回', () => {
    const genuine = { summary: '## 组合概览\n今日白酒板块回调，资金流出。' };
    const r = readAiResponse(genuine, { ...OPTS, field: 'summary' });
    expect(r.ok).toBe(true);
    expect(r.text).toBe(genuine.summary);
  });

  it('A8 success:true 但内容为空 → 判失败（没有内容就是没有内容）', () => {
    const r = readAiResponse({ success: true, summary: '   ' }, { ...OPTS, field: 'summary' });
    expect(r.ok).toBe(false);
    expect(r.kind).toBe('error');
  });

  it('A9 looksLikeOpsInstruction 只对运维语义为真，正常业务文案为假', () => {
    expect(looksLikeOpsInstruction('请在 Cloudflare Pages 设置 DEEPSEEK_API_KEY')).toBe(true);
    expect(looksLikeOpsInstruction('请在环境变量中配置')).toBe(true);
    expect(looksLikeOpsInstruction('本组合今日整体回调，建议关注资金流向')).toBe(false);
    expect(looksLikeOpsInstruction(undefined)).toBe(false);
    expect(looksLikeOpsInstruction(123)).toBe(false);
  });

  it('A10 无 success 字段且无内容 → 判失败（不把未知响应当成功）', () => {
    const r = readAiResponse({}, { ...OPTS, field: 'summary' });
    expect(r.ok).toBe(false);
    expect((r as { text?: string }).text).toBeUndefined();
  });
});

/* ================================================================== */
/*  B. 组件层：WatchlistPage 渲染                                       */
/* ================================================================== */

const mockApiFetch = vi.fn();
vi.mock('../utils/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  apiUrl: (p: string) => p,
}));

import WatchlistPage from '../pages/WatchlistPage';

/** 构造一个「看起来成功」的 Response 替身 */
function fakeResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

/** 按请求路径分派响应 */
function routeApiFetch(routes: Record<string, (body: unknown, status?: number) => Response>) {
  mockApiFetch.mockImplementation(async (path: string) => {
    const key = Object.keys(routes).find((k) => path.includes(k));
    if (!key) return fakeResponse({ success: true, data: {} });
    return routes[key]({});
  });
}

/** 写入一只自选股到 localStorage，让页面进入「有股票」分支 */
function seedWatchlist() {
  const payload = [
    {
      id: 'default',
      name: '默认分组',
      isDefault: true,
      stocks: [
        { symbol: '600519', name: '贵州茅台', market: 'SH', sortIndex: 0, groupId: 'default' },
      ],
    },
  ];
  localStorage.setItem('astock_watchlist_v2', JSON.stringify(payload));
}

describe('B. 组件层：WatchlistPage 不把运维提示当 AI 总结渲染', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    seedWatchlist();
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('B1 线上原样运维响应 → DOM 不含运维指令，含诚实提示', async () => {
    routeApiFetch({
      '/api/ai/watchlist-summary': () => fakeResponse(ONLINE_OPS_SUMMARY),
      '/api/alerts': () => fakeResponse({
        success: true,
        data: { alerts: [], pagination: { page: 1, pageSize: 100, totalCount: 0, totalPages: 0 } },
      }),
      '/api/stocks/batch/quotes': () => fakeResponse({
        success: true,
        data: { stocks: [{ symbol: '600519', name: '贵州茅台', latestQuote: { closePrice: 1500, changePercent: 1 } }] },
      }),
    });

    render(
      <MemoryRouter>
        <WatchlistPage />
      </MemoryRouter>,
    );

    // 等待 AI 总结请求返回并渲染
    await waitFor(() => {
      expect(mockApiFetch.mock.calls.some((c) => String(c[0]).includes('/api/ai/watchlist-summary'))).toBe(true);
    });

    const notice = await screen.findByTestId('ai-summary-notice');

    // 诚实提示是中文用户文案
    expect(notice.textContent).toContain('未接入');
    expect(notice.textContent).not.toContain('DEEPSEEK_API_KEY');
    expect(notice.textContent).not.toContain('Cloudflare');
    expect(notice.textContent).not.toContain('环境变量');

    // 整个 DOM 里都不得出现运维指令
    const dom = document.body.textContent || '';
    expect(dom).not.toContain('DEEPSEEK_API_KEY');
    expect(dom).not.toContain('Cloudflare Pages');
    expect(dom).not.toContain('AI总结服务未配置');
    expect(dom).not.toContain('AI总结服务未配置：请在');
  });

  it('B2 Worker 结构化未配置响应 → 展示后端面向用户的 message，不展示 error 里的运维诊断', async () => {
    routeApiFetch({
      '/api/ai/watchlist-summary': () => fakeResponse(WORKER_UNAVAILABLE),
      '/api/alerts': () => fakeResponse({
        success: true,
        data: { alerts: [], pagination: { page: 1, pageSize: 100, totalCount: 0, totalPages: 0 } },
      }),
      '/api/stocks/batch/quotes': () => fakeResponse({
        success: true,
        data: { stocks: [{ symbol: '600519', name: '贵州茅台', latestQuote: { closePrice: 1500, changePercent: 1 } }] },
      }),
    });

    render(
      <MemoryRouter>
        <WatchlistPage />
      </MemoryRouter>,
    );

    const notice = await screen.findByTestId('ai-summary-notice');
    expect(notice.textContent).toContain('AI 总结服务未接入');
    expect(notice.textContent).not.toContain('DEEPSEEK_API_KEY');

    const dom = document.body.textContent || '';
    expect(dom).not.toContain('DEEPSEEK_API_KEY');
    expect(dom).not.toContain('Cloudflare');
  });

  it('B3 AI 总结成功 → 不显示失败提示，正常渲染总结正文', async () => {
    routeApiFetch({
      '/api/ai/watchlist-summary': () => fakeResponse({
        success: true,
        dataSource: 'real',
        summary: '## 组合概览\n白酒板块今日小幅回调。',
        timestamp: 1,
      }),
      '/api/alerts': () => fakeResponse({
        success: true,
        data: { alerts: [], pagination: { page: 1, pageSize: 100, totalCount: 0, totalPages: 0 } },
      }),
      '/api/stocks/batch/quotes': () => fakeResponse({
        success: true,
        data: { stocks: [{ symbol: '600519', name: '贵州茅台', latestQuote: { closePrice: 1500, changePercent: 1 } }] },
      }),
    });

    render(
      <MemoryRouter>
        <WatchlistPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(mockApiFetch.mock.calls.some((c) => String(c[0]).includes('/api/ai/watchlist-summary'))).toBe(true);
    });

    await waitFor(() => {
      expect(document.body.textContent || '').toContain('组合概览');
    });
    expect(screen.queryByTestId('ai-summary-notice')).toBeNull();
  });
});

/* ================================================================== */
/*  C. 契约层：/api/alerts 形状不兼容 → failedSymbols，不静默空         */
/* ================================================================== */

describe('C. /api/alerts 契约守卫', () => {
  // 注意：本文件已 mock '../utils/api'，fetchAlertsForSymbols 走的是 mockApiFetch
  // （不是 global fetch），故此处用 mockApiFetch 记录请求。
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it('C1 旧 Worker 的嵌套数组形状 → 记 failedSymbols，不返回「零条」', async () => {
    mockApiFetch.mockResolvedValue(fakeResponse({
      success: true,
      // 旧 Worker 形状：data 是 [{symbol, alerts:[...]}]，不是 {alerts, pagination}
      data: [{ symbol: '600519', alerts: [{ type: 'limit_move' }] }],
    }));

    const outcome = await fetchAlertsForSymbols(['600519']);
    expect(outcome.returnedCount).toBe(0);
    expect(outcome.items).toHaveLength(0);
    expect(outcome.failedSymbols).toHaveLength(1);
    expect(outcome.failedSymbols[0].symbol).toBe('600519');
    expect(outcome.failedSymbols[0].reason).toContain('不符合');
  });

  it('C2 复数形态的 URL 绝不被发出（契约统一为单数 ?symbol=）', async () => {
    mockApiFetch.mockResolvedValue(fakeResponse({
      success: true,
      data: { alerts: [], pagination: { page: 1, pageSize: 100, totalCount: 0, totalPages: 0 } },
    }));

    await fetchAlertsForSymbols(['600519', '000001']);

    const urls = mockApiFetch.mock.calls.map((c) => String(c[0]));
    expect(urls).toHaveLength(2);
    for (const u of urls) {
      expect(u).toContain('symbol=');
      expect(u).not.toContain('symbols=');
    }
  });

  it('C3 success:false → 记 failedSymbols（不静默变空）', async () => {
    mockApiFetch.mockResolvedValue(fakeResponse({
      success: false,
      dataSource: 'unavailable',
      error: '查询失败',
    }, 500));

    const outcome = await fetchAlertsForSymbols(['600519']);
    expect(outcome.failedSymbols).toHaveLength(1);
    expect(outcome.returnedCount).toBe(0);
  });
});
