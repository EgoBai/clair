// @vitest-environment jsdom
/**
 * StockListPage 初次加载 与 字段映射 的诚实性守卫
 *
 * 缺陷背景（线上实测 2026-11-01 https://egobai.github.io/clair/stocks）：
 *   页面只调 /api/market/summary 与 /api/version，从未调用 /api/stocks，
 *   于是恒显示「共 0 只 / 总股票数 0 / 总市值 0 / 暂无数据」。
 *
 * 本测试守三件事：
 *   1. mount 即请求 /api/stocks?pageSize=6000（初次加载路径存在）
 *   2. latestQuote 显式映射正确；接口没有的字段（change / marketCap）渲染「—」，**不是 0**
 *   3. 接口失败 / 返回 0 条时，统计与列表显示「—」并给出可解释提示，**不显示 0**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import StockListPage from '../pages/StockListPage';
import {
  useStockStore,
  mapStockApiItem,
  parseStocksResponse,
  formatVolumeLots,
} from '../store/useStockStore';

/** 线上真实响应样本（实测 https://clair-api.pages.dev/api/stocks?pageSize=3） */
const REAL_PAYLOAD = {
  data: {
    items: [
      {
        symbol: '600000',
        name: '浦发银行',
        market: 'SH',
        industry: '银行',
        concepts: ['银行'],
        latestQuote: {
          closePrice: 10.02,
          changePercent: 0.3,
          turnoverRate: 0.19,
          peRatio: 6.45,
          volume: 648865,
          turnover: 647740000,
        },
      },
      {
        symbol: '600001',
        name: '邯郸钢铁',
        market: 'SH',
        industry: '钢铁',
        concepts: ['钢铁'],
        latestQuote: {
          closePrice: 5.29,
          changePercent: 0,
          turnoverRate: 0,
          volume: 0,
          turnover: 0,
        },
      },
      {
        // latestQuote 整体为 null：上游未覆盖该标的 —— 不许用 0 顶替
        symbol: '600002',
        name: '齐鲁石化',
        market: 'SH',
        industry: '石油石化',
        concepts: ['石油石化', '能源'],
        latestQuote: null,
      },
    ],
    total: 5541,
    page: 1,
    pageSize: 3,
  },
  success: true,
};

const EMPTY_PAYLOAD = {
  data: { items: [], total: 0, page: 1, pageSize: 6000 },
  success: true,
};

function mockFetchJson(payload: unknown) {
  const fn = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => payload,
  });
  (globalThis as unknown as { fetch: unknown }).fetch = fn;
  return fn;
}

function mockFetchReject(message: string) {
  const fn = vi.fn().mockRejectedValue(new Error(message));
  (globalThis as unknown as { fetch: unknown }).fetch = fn;
  return fn;
}

/** 取某个统计卡的文本（label + value 拼在一起） */
function statCardText(label: string): string {
  const labelNode = screen.getByText(label);
  return labelNode.parentElement?.textContent ?? '';
}

/** 取表格里某只股票那一行的单元格 */
function rowCells(symbol: string): HTMLElement[] {
  const cell = screen.getByText(symbol);
  const tr = cell.closest('tr');
  if (!tr) throw new Error(`未找到 ${symbol} 所在行`);
  return Array.from(tr.querySelectorAll('td')) as HTMLElement[];
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  useStockStore.getState().reset();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('显式映射：/api/stocks items[] → Stock', () => {
  it('latestQuote 正常时映射 closePrice/changePercent/volume/peRatio', () => {
    const s = mapStockApiItem(REAL_PAYLOAD.data.items[0]);
    expect(s).not.toBeNull();
    expect(s!.symbol).toBe('600000');
    expect(s!.name).toBe('浦发银行');
    expect(s!.price).toBe(10.02);
    expect(s!.changePercent).toBe(0.3);
    expect(s!.peRatio).toBe(6.45);
    expect(s!.volume).toBe('64.89万手');
    expect(s!.industry).toBe('银行');
  });

  it('change 与 marketCap 恒为 null（接口不提供，禁止估算）', () => {
    const s = mapStockApiItem(REAL_PAYLOAD.data.items[0])!;
    expect(s.change).toBeNull();
    expect(s.marketCap).toBeNull();
  });

  it('latestQuote 为 null 时所有行情字段为 null，而不是 0', () => {
    const s = mapStockApiItem(REAL_PAYLOAD.data.items[2])!;
    expect(s.symbol).toBe('600002');
    expect(s.price).toBeNull();
    expect(s.changePercent).toBeNull();
    expect(s.volume).toBeNull();
    expect(s.marketCap).toBeNull();
  });

  it('无 symbol 的行被丢弃（不编造代码）', () => {
    expect(mapStockApiItem({ name: '幽灵股票' })).toBeNull();
    expect(mapStockApiItem(null)).toBeNull();
  });

  it('成交量缺失返回 null，合法 0 保留为「0手」', () => {
    expect(formatVolumeLots(undefined)).toBeNull();
    expect(formatVolumeLots(null)).toBeNull();
    expect(formatVolumeLots(0)).toBe('0手');
    expect(formatVolumeLots(648865)).toBe('64.89万手');
  });

  it('parseStocksResponse 解析 data.items 与 total', () => {
    const parsed = parseStocksResponse(REAL_PAYLOAD);
    expect(parsed.stocks).toHaveLength(3);
    expect(parsed.total).toBe(5541);
  });

  it('契约不符时抛错（不得静默当成空列表）', () => {
    expect(() => parseStocksResponse({ success: true, data: {} })).toThrow(/data\.items/);
    expect(() => parseStocksResponse({ success: false, message: '上游挂了' })).toThrow(/上游挂了/);
  });
});

describe('StockListPage 初次加载', () => {
  it('mount 即请求 /api/stocks?pageSize=6000（修复「从未调用 /api/stocks」）', async () => {
    const fetchMock = mockFetchJson(REAL_PAYLOAD);
    render(
      <MemoryRouter>
        <StockListPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe('/api/stocks?pageSize=6000');
  });

  it('3 条数据 → 表格 3 行、总股票数=3、上涨=1、下跌=0', async () => {
    mockFetchJson(REAL_PAYLOAD);
    render(
      <MemoryRouter>
        <StockListPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('浦发银行')).toBeTruthy());

    const rows = document.querySelectorAll('.ant-table-tbody tr.ant-table-row');
    expect(rows).toHaveLength(3);

    expect(statCardText('总股票数')).toBe('总股票数3');
    expect(statCardText('上涨')).toBe('上涨1');
    expect(statCardText('下跌')).toBe('下跌0');
  });

  it('总市值显示「—」而不是 0（接口无市值字段）', async () => {
    mockFetchJson(REAL_PAYLOAD);
    render(
      <MemoryRouter>
        <StockListPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('浦发银行')).toBeTruthy());

    const capCard = statCardText('总市值(亿)');
    expect(capCard).toBe('总市值(亿)—');
    expect(capCard).not.toContain('0');
  });

  it('市值列与涨跌额列每行都是「—」，不是 0', async () => {
    mockFetchJson(REAL_PAYLOAD);
    render(
      <MemoryRouter>
        <StockListPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('浦发银行')).toBeTruthy());

    // 列序：0 代码 / 1 名称 / 2 最新价 / 3 涨跌幅 / 4 涨跌额 / 5 成交量 / 6 市值 / 7 自选
    const cells = rowCells('600000');
    expect(cells[2].textContent).toBe('¥10.02');
    expect(cells[3].textContent).toBe('+0.30%');
    expect(cells[4].textContent).toBe('—'); // 涨跌额：接口无昨收，不可推导
    expect(cells[5].textContent).toBe('64.89万手');
    expect(cells[6].textContent).toBe('—'); // 市值：接口不提供

    // 无行情的那只：价格/涨跌幅也都是「—」
    const emptyCells = rowCells('600002');
    expect(emptyCells[2].textContent).toBe('—');
    expect(emptyCells[3].textContent).toBe('—');
  });

  it('页面副标题显示真实只数（不是「共 0 只」）', async () => {
    mockFetchJson(REAL_PAYLOAD);
    render(
      <MemoryRouter>
        <StockListPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('浦发银行')).toBeTruthy());
    expect(screen.getByText(/共 3 只/)).toBeTruthy();
    expect(screen.queryByText(/共 0 只/)).toBeNull();
  });
});

describe('StockListPage 加载失败：可解释提示 + 不显示 0', () => {
  it('fetch 抛错 → 显示错误提示，统计全部「—」，不出现 0', async () => {
    mockFetchReject('网络错误');

    render(
      <MemoryRouter>
        <StockListPage />
      </MemoryRouter>
    );

    await waitFor(() =>
      expect(screen.getByText(/行情数据不可用：本页不展示任何股票数据（未用 0 顶替）/)).toBeTruthy()
    );
    expect(screen.getByText(/行情接口请求失败：网络错误/)).toBeTruthy();

    // 统计卡全部「—」
    expect(statCardText('总股票数')).toBe('总股票数—');
    expect(statCardText('上涨')).toBe('上涨—');
    expect(statCardText('下跌')).toBe('下跌—');
    expect(statCardText('总市值(亿)')).toBe('总市值(亿)—');

    // 副标题与列表标题也不许出现 0
    expect(screen.queryByText(/共 0 只/)).toBeNull();
    expect(screen.getByText(/股票列表 \(— 只\)/)).toBeTruthy();

    // 表格空态是可解释文案，不是「暂无数据」
    const empty = document.querySelector('.ant-table-placeholder');
    expect(empty?.textContent).toContain('行情接口不可用/无数据');
  });

  it('HTTP 非 2xx → 如实报 HTTP 状态码，不静默', async () => {
    const fn = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({}),
    });
    (globalThis as unknown as { fetch: unknown }).fetch = fn;

    render(
      <MemoryRouter>
        <StockListPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText(/HTTP 502/)).toBeTruthy());
    expect(statCardText('总股票数')).toBe('总股票数—');
  });

  it('接口返回 0 条 → 提示「上游无数据」，统计仍为「—」而非 0', async () => {
    mockFetchJson(EMPTY_PAYLOAD);

    render(
      <MemoryRouter>
        <StockListPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText(/返回 0 条股票/)).toBeTruthy());
    expect(statCardText('总股票数')).toBe('总股票数—');
    expect(statCardText('总市值(亿)')).toBe('总市值(亿)—');
    expect(screen.queryByText(/共 0 只/)).toBeNull();
  });
});
