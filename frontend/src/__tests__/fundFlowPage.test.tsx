// @vitest-environment jsdom
/**
 * FundFlowPage 诚实数据回归测试
 *
 * 守卫的缺陷（改前实测）：
 *   market.market 为 null（后端「市场广度不可得」）时，页面用
 *   `String(market.market?.risingStocks ?? 0)` 把它兜成 0，渲染出
 *   「0 家上涨 / 0 家下跌 / 0 家涨停」——用户读到的是「今天全市场平盘」，
 *   事实却是「数据没取到」。这是本项目点名的「把缺失变成业务事实」红线违规。
 *
 * 本文件钉死三条契约：
 *   1. `market:null` + `source:'unavailable'` → 字段一律「—」+ 可解释降级提示，绝不出现 0；
 *   2. 真实数据 → 数字照常渲染（回归不能坏）；
 *   3. 请求失败 → 说「未能取到，不代表全市场没有涨跌家数」，与「暂无数据」区分。
 * 另钉住单档缺失（tiers.superLarge 为 null）不得经 Number(null) 变成「+0」。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import FundFlowPage from '../pages/FundFlowPage';

// ── 夹具：与后端 backend/src/api/fund-flow.ts 的实际返回同形 ──────────────

/** 真实可达：5 档 + 市场广度 + 成交额均为本地真实行情库数值 */
const MARKET_REAL = {
  tiers: { main: 1_234_567_890, superLarge: 500_000_000, large: 700_000_000, medium: -20_000_000, small: 54_567_890 },
  market: {
    tradeDate: '2026-10-30',
    totalTurnover: 1.23e12,
    risingStocks: 2345,
    fallingStocks: 1890,
    unchangedStocks: 120,
    limitUpCount: 42,
    limitDownCount: 7,
    totalStocks: 4355,
  },
  updateTime: '2026-10-30T07:00:00.000Z',
  source: 'eastmoney',
};

/** 降级态：5 档与市场广度都取不到，后端如实给 null + source:'unavailable' */
const MARKET_UNAVAILABLE = {
  tiers: { main: null, superLarge: null, large: null, medium: null, small: null },
  market: null,
  updateTime: '2026-10-30T07:00:00.000Z',
  source: 'unavailable',
  note: '全市场 5 档资金流：东方财富 push2 聚合在沙箱下不可达；本地行情库无当日广度数据。',
};

/** 5 档只取到部分档位：主力有值、超大单为 null（不得渲染成「+0」） */
const MARKET_PARTIAL_TIER = {
  ...MARKET_REAL,
  tiers: { main: 1_000_000, superLarge: null, large: 300_000, medium: null, small: null },
};

const INDUSTRY_EMPTY = { industries: [], count: 0, updateTime: '2026-10-30T07:00:00.000Z' };
const GLOBAL_EMPTY = { indicators: [], dataSource: 'unavailable' };
const META_EMPTY = { activeProviders: [], keysConfigured: {} };
const STOCK_EMPTY = { current: null, history: [], dataSource: 'unavailable' };

// ── fetch 桩 ────────────────────────────────────────────────────────────

type Hit = { body?: unknown; status?: number; throws?: boolean };

/**
 * @param routes 以 URL 片段为 key；`throws:true` 表示该端点网络层失败（fetch reject）
 */
const routeFetch = (routes: Record<string, Hit>) => {
  const fn = vi.fn(async (input: unknown) => {
    const url = String(input);
    for (const [key, hit] of Object.entries(routes)) {
      if (url.includes(key)) {
        if (hit.throws) throw new Error(`Network Error (${key})`);
        return {
          ok: (hit.status ?? 200) < 400,
          status: hit.status ?? 200,
          json: () => Promise.resolve({ success: true, data: hit.body }),
        } as unknown as Response;
      }
    }
    return {
      ok: false,
      status: 404,
      json: () => Promise.resolve({ success: false, error: 'Not found' }),
    } as unknown as Response;
  });
  vi.stubGlobal('fetch', fn);
  return fn;
};

/** 默认静音其余三块，只让 /market 成为被测变量 */
const baseRoutes = (market: Hit) => ({
  '/api/fund-flow/market': market,
  '/api/fund-flow/meta': { body: META_EMPTY },
  '/api/fund-flow/industry': { body: INDUSTRY_EMPTY },
  '/api/fund-flow/global': { body: GLOBAL_EMPTY },
  '/api/fund-flow/': { body: STOCK_EMPTY },
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <FundFlowPage />
    </MemoryRouter>,
  );

/** 取某个 Statistic 卡的完整文案（title + value），用于断言「标签下挂的到底是几」 */
const statText = (label: string): string => {
  const hit = Array.from(document.querySelectorAll('.ant-statistic')).find(
    (el) => el.querySelector('.ant-statistic-title')?.textContent?.trim() === label,
  );
  expect(hit, `未找到「${label}」统计卡`).toBeTruthy();
  return hit!.textContent ?? '';
};

beforeEach(() => {
  vi.stubGlobal('AbortController', globalThis.AbortController);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ── 场景一：降级态（market:null）─────────────────────────────────────────

describe('降级态 dataSource/source=unavailable + market:null', () => {
  beforeEach(() => {
    routeFetch(baseRoutes({ body: MARKET_UNAVAILABLE }));
  });

  it('不得把缺失渲染成「0 家上涨」，广度数字一律为「—」', async () => {
    renderPage();
    // 等加载完成：降级提示出现即代表 /market 已 resolve
    await waitFor(() => expect(screen.getByTestId('fund-flow-market-degraded')).toBeTruthy());

    for (const label of ['上涨家数', '下跌家数', '涨停', '跌停']) {
      const text = statText(label);
      expect(text, `${label} 必须显示缺失占位`).toContain('—');
      // 关键断言：标签后面不能跟着一个 0（那就是「全市场平盘」的假事实）
      expect(text).not.toMatch(/0/);
    }
    expect(statText('全市场成交额')).toContain('—');
  });

  it('应给出可解释的降级提示（unavailable），并点明「不代表全市场平盘」', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('fund-flow-market-degraded')).toBeTruthy());

    const notice = screen.getByTestId('api-status-notice');
    expect(notice.getAttribute('data-status')).toBe('unavailable');
    expect(notice.textContent).toContain('不代表全市场平盘');
    // 后端 note 必须透出，让用户知道为什么取不到
    expect(document.body.textContent).toContain('本地行情库无当日广度数据');
  });

  it('数据源 Tag 不得把 unavailable 伪装成真实 provider（蓝色）', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('fund-flow-market-degraded')).toBeTruthy());
    // 市场卡标题上的 Tag
    expect(screen.getAllByText('不可得').length).toBeGreaterThan(0);
    expect(screen.queryByText('unavailable')).toBeNull();
  });
});

// ── 场景二：真实数据回归 ────────────────────────────────────────────────

describe('真实数据：数字照常渲染（回归保护）', () => {
  beforeEach(() => {
    routeFetch(baseRoutes({ body: MARKET_REAL }));
  });

  it('上涨/下跌/涨停/跌停/成交额渲染真实值，且无降级提示', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('上涨家数')).toBeTruthy());

    // antd Statistic 会做千分位分组，故按分组后的文本断言
    expect(statText('上涨家数')).toContain('2,345');
    expect(statText('下跌家数')).toContain('1,890');
    expect(statText('涨停')).toContain('42');
    expect(statText('跌停')).toContain('7');
    expect(statText('全市场成交额')).toContain('1.23万亿');

    expect(screen.queryByTestId('fund-flow-market-degraded')).toBeNull();
  });

  it('5 档结构渲染真实净额（含负值符号）', async () => {
    renderPage();
    // 行业表格表头也有「主力净额」字样，故按 Statistic 卡定位，避免多元素歧义
    await waitFor(() => expect(statText('主力净额')).toContain('+'));
    // 中单为负 → 必须带负号，不得被取绝对值
    expect(statText('中单')).toContain('-');
  });
});

// ── 场景三：单档缺失 ────────────────────────────────────────────────────

describe('单档缺失：tiers.superLarge=null 不得变成「+0」', () => {
  beforeEach(() => {
    routeFetch(baseRoutes({ body: MARKET_PARTIAL_TIER }));
  });

  it('超大单显示「—」，主力净额仍显示真实值', async () => {
    renderPage();
    await waitFor(() => expect(statText('超大单')).toContain('—'));

    expect(statText('超大单')).not.toMatch(/\+0/);
    expect(statText('主力净额')).not.toContain('—');
  });
});

// ── 场景四：请求失败 ────────────────────────────────────────────────────

describe('请求失败：说「未能取到」，绝不说「暂无数据」', () => {
  beforeEach(() => {
    routeFetch(baseRoutes({ throws: true }));
  });

  it('渲染 failed 提示，且不出现任何「上涨家数」数字行', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('api-status-notice')).toBeTruthy());

    const notice = screen.getByTestId('api-status-notice');
    expect(notice.getAttribute('data-status')).toBe('failed');
    expect(notice.textContent).toContain('请求失败');
    expect(document.body.textContent).toContain('不代表全市场没有涨跌家数');
    // market 整体为 null 时不应再渲染一排「—」，更不能渲染一排 0
    expect(screen.queryByText('上涨家数')).toBeNull();
  });
});
