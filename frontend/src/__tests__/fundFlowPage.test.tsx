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
  // 刻意与 tradeDate 错开：页面上的日期必须取自 asOf，而不是从 tradeDate 顶替
  asOf: '2026-10-28',
  asOfIsFallback: false,
};

/** 数据日期缺失（后端未透出 asOf）：不得默认成今天，也不得拿 tradeDate 顶替 */
const MARKET_NO_ASOF = {
  ...MARKET_REAL,
  asOf: null,
  asOfIsFallback: false,
};

/** 今天非交易日 → 后端回退到最近交易日，并给出原因 */
const MARKET_ASOF_FALLBACK = {
  ...MARKET_REAL,
  asOf: '2026-10-28',
  asOfIsFallback: true,
  asOfNote: '2026-10-31 为周末休市，已回退至最近交易日 2026-10-28',
};

/** 字段级缺失（新契约：后端逐字段给 null，而不是 0）*/
const MARKET_FIELD_NULL = {
  ...MARKET_REAL,
  market: {
    ...MARKET_REAL.market,
    totalTurnover: null,
    risingStocks: null,
    fallingStocks: null,
    limitUpCount: null,
    limitDownCount: null,
  },
};

/** 真实 0：全市场确实零涨停/零跌停，必须渲染 0，不能渲染成「—」 */
const MARKET_REAL_ZERO = {
  ...MARKET_REAL,
  market: {
    ...MARKET_REAL.market,
    totalTurnover: 0,
    risingStocks: 0,
    fallingStocks: 0,
    limitUpCount: 0,
    limitDownCount: 0,
  },
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
/** 行业资金流：一行有真实主力净额、一行上游缺失（null），另一行真实 0 */
const INDUSTRY_PARTIAL = {
  industries: [
    { industry: '食品饮料', mainNet: 2_897_530_500, netInflow: null, stockCount: 122, topStocks: [] },
    { industry: '上游缺失行业', mainNet: null, netInflow: null, stockCount: null, topStocks: [] },
    { industry: '真零行业', mainNet: 0, netInflow: null, stockCount: 0, topStocks: [] },
  ],
  count: 3,
  updateTime: '2026-10-30T07:00:00.000Z',
  dataSource: 'tencent',
  asOf: null,
  note: '东财 push2 不可达，以下为腾讯板块排行真实数据',
};
/** 行业资金流：两源皆不可达的诚实空态（必须带中文原因） */
const INDUSTRY_UNAVAILABLE = {
  industries: [],
  count: 0,
  updateTime: '2026-10-30T07:00:00.000Z',
  dataSource: 'unavailable',
  asOf: null,
  note: '行业资金流：东方财富 push2 与腾讯板块排行两个真实源均不可达',
};
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
    // 请求彻底失败时没有 asOf 可标，不得凭空造一个日期标注
    expect(screen.queryByTestId('fund-flow-data-date')).toBeNull();
  });
});

// ── 场景五：数据所属交易日（asOf）────────────────────────────────────────

describe('数据日期标注：只如实展示 asOf', () => {
  it('asOf 存在 → 页面展示该交易日（取自 asOf，非 tradeDate）', async () => {
    routeFetch(baseRoutes({ body: MARKET_REAL }));
    renderPage();

    await waitFor(() => expect(screen.getByTestId('fund-flow-data-date')).toBeTruthy());
    const node = screen.getByTestId('fund-flow-data-date');
    expect(node.textContent).toContain('数据日期');
    expect(node.textContent).toContain('2026-10-28'); // asOf
    // tradeDate(2026-10-30) 不得冒充数据日期
    expect(node.textContent).not.toContain('2026-10-30');
  });

  it('asOf 缺失 → 显示「不可得」，绝不默认成今天、也不拿 tradeDate 顶替', async () => {
    routeFetch(baseRoutes({ body: MARKET_NO_ASOF }));
    renderPage();

    await waitFor(() => expect(screen.getByTestId('fund-flow-data-date')).toBeTruthy());
    const node = screen.getByTestId('fund-flow-data-date');
    expect(node.textContent).toContain('不可得');
    expect(node.textContent).not.toContain('2026-10-30'); // 不拿 tradeDate 冒充
    expect(node.textContent).not.toContain('今天');
    // 全页不得出现「今天」字样（把旧数据说成实时是最严重的失真）
    expect(document.body.textContent).not.toContain('今天');
    // 日期缺失不影响数字本身的如实渲染
    expect(statText('上涨家数')).toContain('2,345');
  });

  it('asOfIsFallback:true → 一并展示 asOfNote 说明为何不是今天', async () => {
    routeFetch(baseRoutes({ body: MARKET_ASOF_FALLBACK }));
    renderPage();

    await waitFor(() => expect(screen.getByTestId('fund-flow-asof-note')).toBeTruthy());
    const note = screen.getByTestId('fund-flow-asof-note');
    expect(note.textContent).toContain('2026-10-31 为周末休市');
    expect(note.textContent).toContain('已回退至最近交易日');
    // 日期标注本体仍在
    expect(screen.getByTestId('fund-flow-data-date').textContent).toContain('2026-10-28');
  });
});

// ── 场景六：字段级 null vs 真实 0（新契约）──────────────────────────────

describe('字段级 null 与真实 0 必须区分', () => {
  it('字段为 null → 渲染「—」', async () => {
    routeFetch(baseRoutes({ body: MARKET_FIELD_NULL }));
    renderPage();

    await waitFor(() => expect(statText('上涨家数')).toContain('—'));
    for (const label of ['上涨家数', '下跌家数', '涨停', '跌停', '全市场成交额']) {
      expect(statText(label), `${label} 为 null 应显示「—」`).toContain('—');
    }
    // 单字段缺失不等于整体降级（market 行存在），不应误报 unavailable
    expect(screen.queryByTestId('fund-flow-market-degraded')).toBeNull();
  });

  it('字段为真实 0 → 渲染 0，不得渲染成「—」', async () => {
    routeFetch(baseRoutes({ body: MARKET_REAL_ZERO }));
    renderPage();

    await waitFor(() => expect(statText('上涨家数')).toContain('0'));
    for (const label of ['上涨家数', '下跌家数', '涨停', '跌停']) {
      const text = statText(label);
      expect(text, `${label} 真值为 0 时必须显示 0`).toContain('0');
      expect(text, `${label} 真值为 0 时不得显示缺失占位`).not.toContain('—');
    }
    // 成交额 0 → 「0亿」，不是「—」
    expect(statText('全市场成交额')).toContain('0亿');
    expect(statText('全市场成交额')).not.toContain('—');
  });
});

// ── 场景七：行业资金流（缺失 null ≠ 0、空态必带原因）────────────────────

describe('行业资金流：主力净额缺失渲染「—」、真实 0 仍渲染 0', () => {
  beforeEach(() => {
    routeFetch({
      ...baseRoutes({ body: MARKET_REAL }),
      '/api/fund-flow/industry': { body: INDUSTRY_PARTIAL },
    });
  });

  it('null 行渲染「—」（不是 +0），真实 0 行渲染 0', async () => {
    renderPage();
    await waitFor(() => expect(document.body.textContent).toContain('上游缺失行业'));

    // 表格三行：食品饮料(真实值) / 上游缺失行业(null) / 真零行业(0)
    const rows = Array.from(document.querySelectorAll('.ant-table-tbody tr'));
    /** 取该行业行的「主力净额」单元格（第 2 列；第 1 列是行业名） */
    const mainNetCell = (name: string): string => {
      const row = rows.find((r) => r.textContent?.includes(name));
      expect(row, `未找到「${name}」行`).toBeTruthy();
      return row!.querySelectorAll('td')[1]?.textContent?.trim() ?? '';
    };

    const missing = mainNetCell('上游缺失行业');
    expect(missing, '缺失行业的主力净额必须渲染「—」').toBe('—');
    // 关键：缺失不得被 Number(null) 变成「+0」（那是在说"该行业净流入 0 元"）
    expect(missing).not.toContain('+0');

    const zero = mainNetCell('真零行业');
    expect(zero, '真实 0 必须渲染 0，不得判成缺失').toContain('+0');
    expect(zero, '真实 0 不得渲染成占位符').not.toContain('—');
  });

  it('真实来源与数据日期如实展示（tencent + asOf 不可得）', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('fund-flow-industry-date')).toBeTruthy());

    // 旧实现硬编码「未标注」，即使拿到真实数据也不显示来源
    expect(screen.getAllByText('tencent').length).toBeGreaterThan(0);
    const date = screen.getByTestId('fund-flow-industry-date');
    // 腾讯排行不返回数据日期 → 如实说「不可得」，绝不默认成今天
    expect(date.textContent).toContain('不可得');
    expect(date.textContent).toContain('腾讯板块排行真实数据');
  });
});

// ── 场景：个股五档部分缺失（Worker 返回 null + missing[] + dataSource:partial）──
//
// Worker 侧旧实现 `mainNet: latest.mainNet ?? 0`：东财对停牌/新股/无成交的档位给 '-'
// （`??` 不生效 → 前端拿到字符串），真为 null 时写成 0 → 页面渲染「主力净流入 0 元」。
// 现在 Worker 统一 number|null + missing[]；本用例钉住前端也不许再把 null 变回 0。

const STOCK_PARTIAL = {
  current: {
    symbol: '600519.SH', name: '贵州茅台',
    mainNet: 123_456_789, superLargeNet: null, largeNet: 23_456_789,
    mediumNet: null, smallNet: 0, tradeDate: '2026-10-30',
  },
  missing: ['superLargeNet', 'mediumNet'],
  history: [],
  dataSource: 'partial',
};

describe('个股五档部分缺失：null 档渲染「—」，真实 0 仍是 +0', () => {
  beforeEach(() => {
    routeFetch({
      ...baseRoutes({ body: MARKET_REAL }),
      '/api/fund-flow/': { body: STOCK_PARTIAL },
    });
  });

  /** 个股卡片区（市场 5 档与个股 5 档标题同名：必须限定容器，否则命中市场块） */
  const stockStatText = (label: string): string => {
    const box = document.querySelector('[data-testid="stock-flow-current"]');
    expect(box, '未找到个股五档卡片区').toBeTruthy();
    const hit = Array.from(box!.querySelectorAll('.ant-statistic')).find(
      (el) => el.querySelector('.ant-statistic-title')?.textContent?.trim() === label,
    );
    expect(hit, `个股卡片区未找到「${label}」`).toBeTruthy();
    return hit!.textContent ?? '';
  };

  it('缺失档位显示「—」而不是「+0」，且不染成流入红/流出绿', async () => {
    renderPage();
    await waitFor(() => expect(stockStatText('超大单')).toContain('—'));

    expect(stockStatText('主力净额'), '真实主力净额照常渲染').toContain('+123,456,789');
    const superLarge = stockStatText('超大单');
    expect(superLarge).toContain('—');
    // 关键：不得出现「+0」——那是「超大单净流入 0 元」的假事实
    expect(superLarge).not.toContain('+0');
    expect(stockStatText('中单')).toContain('—');
    expect(stockStatText('小单'), '真实 0 必须保留为 +0，不得判成缺失').toContain('+0');
    expect(stockStatText('小单')).not.toContain('—');
  });

  it('数据源 Tag 标「部分缺失」，不冒充完整的 eastmoney', async () => {
    renderPage();
    await waitFor(() => expect(stockStatText('超大单')).toContain('—'));
    expect(screen.getAllByText('部分缺失').length).toBeGreaterThan(0);
  });
});

describe('行业资金流空态：说清「为什么没有」，不留无声空列表', () => {
  beforeEach(() => {
    routeFetch({
      ...baseRoutes({ body: MARKET_REAL }),
      '/api/fund-flow/industry': { body: INDUSTRY_UNAVAILABLE },
    });
  });

  it('空列表必须透出后端中文原因，而不是干瘪的「暂无数据」', async () => {
    renderPage();
    await waitFor(() => expect(document.body.textContent).toContain('行业资金流：数据源未取到'));

    expect(document.body.textContent).toContain('两个真实源均不可达');
    // 「不可得」Tag 而非「未标注」：来源是明确的（两源都试过）
    expect(screen.getAllByText('不可得').length).toBeGreaterThan(0);
  });
});
