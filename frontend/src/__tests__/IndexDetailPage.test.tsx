// @vitest-environment jsdom
/**
 * P0-165 —— 指数详情页三态契约回归测试
 *
 * 后端新增两个端点，前端（IndexDetailPage）必须三态兼容：
 *   GET /api/market/index-tech/:symbol
 *     → 200 {success:true, dataSource:'real', data:{ma, rsi14, compositeScore, positionAdvice, ...}}
 *     → 不可用 {dataSource:'unavailable', message} 或 404（Worker 未部署）
 *   GET /api/market/index-top-movers/:symbol?limit=10
 *     → 200 {dataSource:'real', data:{scopeLabel, tradeDate, topGainers, topLosers}}
 *     → 不可用/404 同上，前端回退全市场榜（top-gainers|top-losers）并如实标注口径
 *
 * 诚实渲染红线（与 hkConnectNullAdapt / marketPulseNullGauge 同一纪律）：
 *   - tech 非 real → 诚实 Alert，绝不渲染 0 值或占位数值
 *   - movers 非 real → 标题「全市场」+ 口径小字「成分股行情暂不可用」
 *   - 行内 close_price / change_percent 为 null/undefined → 显示「—」，绝不出现 NaN
 *   - Worker 的 /api/market/indices 对部分指数缺 openPrice/highPrice 等字段
 *     （实测 sz399006），头部同样不得渲染「开盘 NaN」
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import IndexDetailPage from '../pages/IndexDetailPage';

// ── 夹具：与真实响应同形 ─────────────────────────────────────────

const INDEX_ROW_SZ = {
  symbol: 'sz399006', name: '创业板指',
  closePrice: 2634.76, changePercent: 3.4, volume: 181409982,
  // 注意：线上 Worker 实测不含 openPrice/highPrice/lowPrice/turnover —— 故意不填
  category: 'index',
};

const TECH_REAL = {
  success: true,
  dataSource: 'real',
  data: {
    indexSymbol: 'sz399006', indexName: '创业板指',
    asOf: '2026-10-27', source: '东方财富日线',
    ma: { ma5: 2588.31, ma10: 2561.02, ma20: 2498.77, ma60: 2380.55 },
    rsi14: 61.8,
    compositeScore: 72,
    positionAdvice: '偏多（半仓以上）',
  },
};

const MOVERS_REAL = {
  success: true,
  dataSource: 'real',
  data: {
    scopeLabel: '创业板指成分股涨幅榜 TOP10',
    asOf: '2026-10-27',
    tradeDate: '2026-10-27',
    topGainers: [
      { symbol: '301080.SZ', name: '百普赛斯', close_price: 88.5, change_percent: 20.0 },
      { symbol: '301488.SZ', name: '豪恩汽电', close_price: 45.2, change_percent: 20.0 },
    ],
    topLosers: [
      { symbol: '300803.SZ', name: '华兰疫苗', close_price: 15.31, change_percent: -13.79 },
    ],
  },
};

const FULL_MARKET_GAINERS = {
  success: true, dataSource: 'real',
  data: { topGainers: [{ symbol: '301080.SZ', name: '百普赛斯', close_price: '88.50', change_percent: '20.00' }] },
};
const FULL_MARKET_LOSERS = {
  success: true, dataSource: 'real',
  data: { topLosers: [{ symbol: '603392.SH', name: '*ST航图', close_price: '2.14', change_percent: '-18.10' }] },
};

const NOT_FOUND_BODY = { success: false, error: 'Not found' };

/** 按 URL 前缀路由的 fetch mock；每个 key 是 {status, body} 或数组（按调用次序轮替） */
const routeFetch = (routes: Record<string, { status?: number; body: unknown } | Array<{ status?: number; body: unknown }>>) => {
  const fn = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    for (const [key, val] of Object.entries(routes)) {
      if (url.includes(key)) {
        const hit = Array.isArray(val) ? val.shift() ?? val[val.length - 1] : val;
        return Promise.resolve({
          ok: (hit.status ?? 200) < 400,
          status: hit.status ?? 200,
          json: () => Promise.resolve(hit.body),
        } as Response);
      }
    }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve(NOT_FOUND_BODY) } as Response);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
};

const renderPage = (symbol = 'sz399006') =>
  render(
    <MemoryRouter initialEntries={[`/index/${symbol}`]}>
      <Routes>
        <Route path="/index/:symbol" element={<IndexDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.stubGlobal('AbortController', globalThis.AbortController);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ── 场景一：全 real ──────────────────────────────────────────────

describe('全 real：技术分析卡 + 成分股口径榜单', () => {
  beforeEach(() => {
    routeFetch({
      '/api/market/indices': { body: { success: true, dataSource: 'real', data: { indices: [INDEX_ROW_SZ] } } },
      '/api/market/index-tech/': { body: TECH_REAL },
      '/api/market/index-top-movers/': { body: MOVERS_REAL },
      '/api/market/kline': { status: 404, body: NOT_FOUND_BODY },
    });
  });

  it('技术分析卡渲染 RSI14 真实数值，并标注「规则计算，仅供参考」', async () => {
    renderPage();
    await waitFor(() => {
      expect(document.body.textContent).toContain('61.8');
    });
    expect(screen.getByText('RSI14')).toBeTruthy();
    expect(screen.getByText('综合评分')).toBeTruthy();
    expect(document.body.textContent).toContain('72');
    expect(document.body.textContent).toContain('偏多（半仓以上）');
    expect(document.body.textContent).toContain('规则计算，仅供参考');
  });

  it('榜单标题使用后端 scopeLabel，底部标注成分口径与行情日期', async () => {
    renderPage();
    // scopeLabel 同时出现在涨跌榜标题与底部口径小字里，故用 getAllByText
    await waitFor(() => {
      expect(screen.getAllByText(/创业板指成分股涨幅榜 TOP10/).length).toBeGreaterThan(0);
    });
    expect(screen.getByText(/创业板指成分股跌幅榜/)).toBeTruthy();
    expect(document.body.textContent).toContain('成分口径：创业板指成分股涨幅榜 TOP10');
    expect(document.body.textContent).toContain('行情日期 2026-10-27');
  });

  it('MA 均线渲染真实值（2588.31 / 2380.55）', async () => {
    renderPage();
    await waitFor(() => {
      expect(document.body.textContent).toContain('2588.31');
    });
    expect(document.body.textContent).toContain('2380.55');
  });
});

// ── 场景二：movers 404 → 回退全市场榜 ────────────────────────────

describe('movers 404 + 全市场榜有数据：fallback 口径标注', () => {
  beforeEach(() => {
    routeFetch({
      '/api/market/indices': { body: { success: true, dataSource: 'real', data: { indices: [INDEX_ROW_SZ] } } },
      '/api/market/index-tech/': { status: 404, body: NOT_FOUND_BODY },
      '/api/market/index-top-movers/': { status: 404, body: NOT_FOUND_BODY },
      '/api/market/top-gainers': { body: FULL_MARKET_GAINERS },
      '/api/market/top-losers': { body: FULL_MARKET_LOSERS },
      '/api/market/kline': { status: 404, body: NOT_FOUND_BODY },
    });
  });

  it('标题回落为「全市场」，底部标注「成分股行情暂不可用」', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/全市场涨幅榜 TOP10/)).toBeTruthy();
    });
    expect(screen.getByText(/全市场跌幅榜 TOP10/)).toBeTruthy();
    expect(document.body.textContent).toContain('成分股行情暂不可用，以下为全市场榜（本地行情库不含北交所）');
    // scopeLabel 不应出现
    expect(document.body.textContent).not.toContain('成分口径：');
  });

  it('index-tech 404 时技术分析区是诚实 Alert 而非 0 值占位', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/技术分析：数据源暂不可用/)).toBeTruthy();
    });
    expect(screen.queryByText('RSI14')).toBeNull();
    expect(screen.queryByText('综合评分')).toBeNull();
    // 绝不出现 0 值占位的技术分析卡
    expect(document.body.textContent).not.toContain('规则计算，仅供参考');
  });
});

// ── 场景三：全部 404 —— 页面不崩、诚实 Alert ─────────────────────

describe('全部 404（Worker 未部署新端点且旧榜无数据）', () => {
  beforeEach(() => {
    routeFetch({
      '/api/market/indices': { body: { success: true, dataSource: 'real', data: { indices: [INDEX_ROW_SZ] } } },
      '/api/market/index-tech/': { status: 404, body: NOT_FOUND_BODY },
      '/api/market/index-top-movers/': { status: 404, body: NOT_FOUND_BODY },
      '/api/market/top-gainers': { status: 404, body: NOT_FOUND_BODY },
      '/api/market/top-losers': { status: 404, body: NOT_FOUND_BODY },
      '/api/market/kline': { status: 404, body: NOT_FOUND_BODY },
    });
  });

  it('页面不崩：无「渲染失败」，出现诚实 Alert（K线/技术分析/涨跌榜逐条说明）', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(screen.getByText(/技术分析：数据源暂不可用（后端端点未部署或源失败）/)).toBeTruthy();
    });
    expect(container.textContent).not.toContain('渲染失败');
    expect(container.textContent).not.toContain('渲染出错');
    expect(container.textContent).toContain('涨跌榜：后端本地行情库无当日涨跌数据');
    expect(container.textContent).toContain('K线图：真实历史 K 线源不可达');
  });

  it('Worker 缺失字段（openPrice 等 undefined）不渲染出 NaN，一律显示「—」', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/技术分析：数据源暂不可用/)).toBeTruthy();
    });
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/NaN/);
    // 头部字段存在且为「—」占位
    expect(text).toContain('开盘');
    expect(text).toContain('—');
  });
});

// ── 场景四：榜单行 null 容错 ─────────────────────────────────────

describe('榜单条目 null 容错：change_percent / close_price 缺失显示「—」', () => {
  beforeEach(() => {
    routeFetch({
      '/api/market/indices': { body: { success: true, dataSource: 'real', data: { indices: [INDEX_ROW_SZ] } } },
      '/api/market/index-tech/': { status: 404, body: NOT_FOUND_BODY },
      '/api/market/index-top-movers/': {
        body: {
          success: true, dataSource: 'real',
          data: {
            scopeLabel: '创业板指成分股涨幅榜 TOP10', tradeDate: '2026-10-27',
            topGainers: [
              { symbol: '301080.SZ', name: '百普赛斯', close_price: null, change_percent: null },
              { symbol: '301488.SZ', name: '豪恩汽电', close_price: 45.2, change_percent: undefined },
            ],
          },
        },
      },
      '/api/market/top-gainers': { status: 404, body: NOT_FOUND_BODY },
      '/api/market/top-losers': { status: 404, body: NOT_FOUND_BODY },
      '/api/market/kline': { status: 404, body: NOT_FOUND_BODY },
    });
  });

  it('null/undefined 值渲染为「—」，页面无 NaN、无崩溃', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(screen.getAllByText(/创业板指成分股涨幅榜 TOP10/).length).toBeGreaterThan(0);
    });
    expect(screen.getByText('百普赛斯')).toBeTruthy();
    expect(screen.getByText('豪恩汽电')).toBeTruthy();
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/NaN/);
    expect(container.textContent).not.toContain('undefined');
    // 「—」占位至少出现（null close_price 与 undefined change_percent 各一处）
    expect(text).toContain('—');
  });
});
