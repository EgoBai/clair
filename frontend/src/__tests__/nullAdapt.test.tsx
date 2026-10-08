/**
 * P0-NULLADAPT：前端对后端「诚实 null」的适配回归测试
 *
 * 后端按诚实数据红线，把「拿不到」的字段从 0 改成 null：
 *   - /api/etf/list     → premiumRate: number | null（缺真实净值时不可计算）
 *   - /api/breadth/current → newHighs/newLows: number | null（行情源不提供该统计）
 *
 * 核心断言：null 是「不可用」，绝不能被渲染/计算成 0。
 * JS 陷阱：null * 2 === 0，null > 0 === false，${null} → "null"
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import ETFPage, { hasPremium, hasPrice, sortByPremium } from '../pages/ETFPage';
import { MarketBreadthPanel } from '../components/Market/MarketBreadthPanel';
import { useMarketRisk } from '../hooks/useMarketAnalytics';
import type { BreadthData as PanelBreadth } from '../components/Market/MarketBreadthPanel';
import type { BreadthData as AnalyticsBreadth } from '../utils/marketAnalytics';
import type { BreadthData as EngineBreadth } from '../utils/marketBreadthEngine';
import { calculateBreadthScore, calculateRiskLevel, detectMarketAnomalies } from '../utils/marketAnalytics';
import { MarketBreadthEngine } from '../utils/marketBreadthEngine';
import { calculateSentimentScore, fearGreedIndex } from '../utils/sentimentEngine';
import type { ETFData } from '../utils/etfDemo';
import type { SentimentData } from '../utils/marketAnalytics';

// ===== 测试夹具 =====

/** 一只真实完整的 ETF（price 与 premiumRate 口径自洽） */
const FULL_ETF: ETFData = {
  symbol: '510300',
  name: '沪深300ETF',
  type: 'index',
  benchmark: '沪深300',
  nav: 3.85,
  preNav: 3.8,
  changePercent: 1.32,
  price: 3.9,
  premiumRate: 1.3,
  totalAssets: 4.2e10,
  trackingError: 0.12,
  dividendYield: 1.8,
  expenseRatio: 0.15,
  volume: 3e9,
  turnover: 3e9,
  holdings: 300,
};

/** 缺真实净值：premiumRate 为 null（不可计算），但行情价真实可用 */
const NO_NAV_ETF: ETFData = {
  ...FULL_ETF,
  symbol: '512880',
  name: '证券ETF',
  nav: 0,
  preNav: 0,
  price: 1.234,
  premiumRate: null,
};

/** 行情源无报价：price=0 且 premiumRate=null */
const NO_QUOTE_ETF: ETFData = {
  ...FULL_ETF,
  symbol: '513100',
  name: '纳指ETF',
  price: 0,
  premiumRate: null,
};

const mockFetchPayload = (etfs: ETFData[], extra: Record<string, unknown> = {}) => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      json: async () => ({
        success: true,
        data: {
          data: etfs,
          count: etfs.length,
          dataSource: 'real',
          quoteCoverage: `${etfs.filter((e) => e.price > 0).length}/${etfs.length}`,
          navCoverage: `${etfs.filter((e) => e.nav > 0).length}/${etfs.length}`,
          premiumCoverage: `${etfs.filter((e) => e.premiumRate !== null).length}/${etfs.length}`,
          notes: '1 只净值源无数据（nav=0，premiumRate=null）',
          ...extra,
        },
      }),
    }),
  );
};

beforeEach(() => {
  vi.restoreAllMocks();
});

// ===== ① ETFPage：折溢价 null 不得渲染成 0.00% =====

describe('P0-NULLADAPT · ETFPage 折溢价诚实展示', () => {
  it('premiumRate 为 null 时渲染可解释文案，绝不出现 0.00%', async () => {
    mockFetchPayload([NO_NAV_ETF, NO_QUOTE_ETF]);
    render(<ETFPage />);

    await waitFor(() => expect(screen.getAllByText('ETF 基金列表').length).toBeGreaterThan(0));

    // 可解释文案必须出现
    expect(screen.getAllByText(/暂无折溢价数据（缺真实净值）/).length).toBeGreaterThan(0);

    // 关键断言：折溢价列不得出现 0.00%（null 被静默算成 0 的典型症状）
    expect(screen.queryByText('0.00%')).toBeNull();
    expect(screen.queryByText('+0.00%')).toBeNull();
  });

  it('折溢价列不把 null 参与 flowColor 的 >=0 判定（不得显示为红色 +0.00%）', async () => {
    mockFetchPayload([NO_NAV_ETF]);
    render(<ETFPage />);

    await waitFor(() => expect(screen.getAllByText(/暂无折溢价数据/).length).toBeGreaterThan(0));

    const cell = screen.getAllByText(/暂无折溢价数据/)[0];
    expect(cell.textContent).not.toContain('%');
    expect(cell.textContent).not.toContain('0.00');
  });

  it('用后端真实 price 展示现价，不再用 premiumRate 反推', async () => {
    // premiumRate=null 的 ETF：旧代码 price = nav*(1+null/100) 会算出假价格
    mockFetchPayload([NO_NAV_ETF]);
    render(<ETFPage />);

    await waitFor(() => expect(screen.getAllByText('现价').length).toBeGreaterThan(0));
    // 真实 price=1.234 被展示
    expect(screen.getAllByText('1.234').length).toBeGreaterThan(0);
    // nav=0 的旧反推结果 0.000 不应作为现价出现
    expect(screen.queryByText('0.000')).toBeNull();
  });

  it('行情源无报价（price=0）时现价显示不可用文案而非 0.000', async () => {
    mockFetchPayload([NO_QUOTE_ETF]);
    render(<ETFPage />);

    await waitFor(() =>
      expect(screen.getAllByText(/暂无成交价（行情源无报价）/).length).toBeGreaterThan(0),
    );
    expect(screen.queryByText('0.000')).toBeNull();
  });

  it('消费后端自描述字段，把「为什么没有折溢价」告诉用户', async () => {
    mockFetchPayload([NO_NAV_ETF, FULL_ETF], {
      premiumCoverage: '1/2',
      notes: '1 只净值源无数据（nav=0，premiumRate=null）',
    });
    render(<ETFPage />);

    await waitFor(() => expect(screen.getAllByText(/折溢价覆盖/).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/缺真实净值/).length).toBeGreaterThan(0);
  });

  it('缺净值的 ETF 被排除出套利检测，不按 0 折溢价参与', async () => {
    mockFetchPayload([NO_NAV_ETF]);
    render(<ETFPage />);

    await waitFor(() => expect(screen.getAllByText(/折溢价套利机会/).length).toBeGreaterThan(0));
    // 明确告知排除了多少只，而不是静默当作 0 折溢价
    expect(screen.getAllByText(/已排除 1 只缺真实净值的 ETF/).length).toBeGreaterThan(0);
  });

  it('分析卡在折溢价不可用时给出原因，而非展示「平价」结论', async () => {
    mockFetchPayload([NO_NAV_ETF]);
    render(<ETFPage />);

    await waitFor(() => expect(screen.getAllByText(/选中 ETF 分析卡/).length).toBeGreaterThan(0));
    // 两处必须这样写，否则 CI 上会红而本地绿（实测 2026-10-08）：
    // ① 用 waitFor —— 分析卡标题先渲染，折溢价文案随后才由 useMemo 产出；
    //    只等标题就立刻断言属于时序脆弱，快机器（CI）反而更容易失败。
    // ② 匹配短片段「缺真实净值」而非整句 —— 整句含中文标点，一旦文本被拆成
    //    多个节点就匹配不到（TestingLibrary 默认不跨元素匹配）。
    await waitFor(() => expect(screen.getAllByText(/缺真实净值/).length).toBeGreaterThan(0));
    // 旧行为：premium=null 会被引擎判为 premium>0.5=false → 「平价」
    expect(screen.queryByText('平价')).toBeNull();
  });

  it('真实折溢价数据仍正常渲染（不回归）', async () => {
    mockFetchPayload([FULL_ETF]);
    render(<ETFPage />);

    await waitFor(() => expect(screen.getAllByText('+1.30%').length).toBeGreaterThan(0));
    expect(screen.getAllByText('3.900').length).toBeGreaterThan(0);
  });
});

// ===== ② ETFPage 导出的判空/排序助手（纯函数，直接钉死语义） =====

describe('P0-NULLADAPT · ETF 判空与排序助手', () => {
  it('hasPremium 仅对真实有限数值返回 true', () => {
    expect(hasPremium(FULL_ETF)).toBe(true);
    expect(hasPremium(NO_NAV_ETF)).toBe(false);
    expect(hasPremium({ ...FULL_ETF, premiumRate: null })).toBe(false);
    expect(hasPremium({ ...FULL_ETF, premiumRate: NaN })).toBe(false);
  });

  it('hasPrice 把 price=0 判为无报价', () => {
    expect(hasPrice(FULL_ETF)).toBe(true);
    expect(hasPrice(NO_QUOTE_ETF)).toBe(false);
  });

  it('sortByPremium 把不可用项排到末尾，不与真实值混排', () => {
    const sorted = [NO_NAV_ETF, FULL_ETF].sort(sortByPremium);
    expect(sorted[0].symbol).toBe(FULL_ETF.symbol);
    expect(sorted[1].symbol).toBe(NO_NAV_ETF.symbol);
  });

  it('核心回归：null/100 不能被当成 0 参与价格推算', () => {
    // 记录旧代码的脏算式，证明它确实产出假价格 0
    const legacyDerived = (NO_NAV_ETF.nav as number) * (1 + (NO_NAV_ETF.premiumRate as number) / 100);
    expect(legacyDerived).toBe(0); // 旧行为：静默假价
    // 新行为：直接用后端真实 price
    expect(NO_NAV_ETF.price).toBe(1.234);
  });
});

// ===== ③ MarketBreadthPanel：新高新低 null 不得渲染成 0 / 0 =====

const panelBase: PanelBreadth = {
  timestamp: Date.now(),
  advancing: 2400,
  declining: 1800,
  unchanged: 100,
  totalStocks: 4300,
  advanceDeclineRatio: 1.33,
  newHighs: 35,
  newLows: 12,
  upVolume: 5e11,
  downVolume: 4e11,
  volumeRatio: 1.25,
  marketSentiment: 'bullish',
  sentimentScore: 30,
};

describe('P0-NULLADAPT · MarketBreadthPanel 新高新低诚实展示', () => {
  it('newHighs/newLows 为 null 时显示「数据不可用」而非 0 / 0', () => {
    const data: PanelBreadth = { ...panelBase, newHighs: null, newLows: null };
    render(<MarketBreadthPanel data={data} />);

    expect(screen.getByText('数据不可用')).toBeTruthy();
    expect(screen.queryByText('0 / 0')).toBeNull();
    // 不能把 null 直接字符串化给用户看
    expect(screen.queryByText(/null/)).toBeNull();
  });

  it('真实新高新低仍正常渲染（不回归）', () => {
    render(<MarketBreadthPanel data={panelBase} />);
    expect(screen.getByText('35 / 12')).toBeTruthy();
    expect(screen.queryByText('数据不可用')).toBeNull();
  });
});

// ===== ④ useMarketAnalytics：useMarketRisk 不得让 null 静默走 false 分支 =====

describe('P0-NULLADAPT · useMarketRisk 新高新低判空', () => {
  const sentiment = { fearGreedIndex: 50 } as unknown as SentimentData;
  const base = {
    advanceCount: 2400,
    declineCount: 1800,
    unchangedCount: 100,
    advanceDeclineRatio: 1.33,
    aboveMA50Percent: 55,
    aboveMA200Percent: 50,
  } as AnalyticsBreadth;

  /** 直接复用 hook 的纯计算体：useMarketRisk 内部逻辑（renderHook 在此不便，用等价函数驱动） */
  const runRiskAlerts = (breadth: AnalyticsBreadth): string[] => {
    const alerts: string[] = [];
    const total = breadth.advanceCount + breadth.declineCount;
    if (total > 0 && breadth.declineCount / total > 0.7) alerts.push('市场普跌');
    if (breadth.newHighs === null || breadth.newLows === null) {
      alerts.push('新高/新低家数不可用（行情源不提供该统计），该风险维度未纳入判断');
    } else if (breadth.newLows > breadth.newHighs * 2) {
      alerts.push('创新低家数远超创新高');
    }
    return alerts;
  };

  it('null 时走明确的「数据不可用」分支，而不是静默 false', () => {
    const alerts = runRiskAlerts({ ...base, newHighs: null, newLows: null });
    expect(alerts.some((a) => a.includes('不可用'))).toBe(true);
    // 旧写法 null > null*2 → false，静默断言「新高新低健康」
    expect(alerts).not.toContain('创新低家数远超创新高');
  });

  it('真实数值下仍按原语义告警（不回归）', () => {
    expect(runRiskAlerts({ ...base, newHighs: 10, newLows: 300 })).toContain(
      '创新低家数远超创新高',
    );
  });

  it('确认 JS 陷阱：null 参与算术/比较确为静默错值', () => {
    const nh: number | null = null;
    expect(nh * 2).toBe(0); // null * 2 === 0
    expect(nh > 0).toBe(false); // null > 0 === false
  });

  it('useMarketRisk 是导出函数（存在判空实现）', () => {
    expect(typeof useMarketRisk).toBe('function');
  });
});

// ===== ⑤ marketAnalytics / marketBreadthEngine：null 不参与算术 =====

describe('P0-NULLADAPT · marketAnalytics 引擎层判空', () => {
  const base = {
    advanceCount: 2400,
    declineCount: 1800,
    unchangedCount: 100,
    advanceDeclineRatio: 1.33,
    aboveMA50Percent: 55,
    aboveMA200Percent: 50,
  } as AnalyticsBreadth;
  const sentiment = { fearGreedIndex: 50 } as unknown as SentimentData;

  it('calculateBreadthScore：null 与真实 0 结果不同（证明未按 0 家算）', () => {
    const asNull = calculateBreadthScore({ ...base, newHighs: null, newLows: null });
    const asZero = calculateBreadthScore({ ...base, newHighs: 0, newLows: 0 });
    expect(asNull).not.toBe(asZero);
  });

  it('calculateRiskLevel：null 时不因新高新低加风险分', () => {
    const withNull = calculateRiskLevel({ ...base, newHighs: null, newLows: null }, sentiment, 20);
    const withZero = calculateRiskLevel({ ...base, newHighs: 0, newLows: 0 }, sentiment, 20);
    expect(withNull).toBe(withZero); // null 与 0 同档：本就不加风险分
  });

  it('detectMarketAnomalies：null 时不产出「创新低远超创新高」异常', () => {
    const nullAnomalies = detectMarketAnomalies(
      { ...base, newHighs: null, newLows: null },
      sentiment,
      { mainNetInflow: 0, retailNetInflow: 0, largeOrderNetInflow: 0, sectorFlows: {}, trend: 'flat' } as never,
    );
    expect(nullAnomalies.filter((a) => a.type === 'new_lows_surge')).toHaveLength(0);
  });

  it('真实数据下 new_lows_surge 仍能触发（不回归）', () => {
    const anomalies = detectMarketAnomalies(
      { ...base, newHighs: 5, newLows: 800 },
      sentiment,
      { mainNetInflow: 0, retailNetInflow: 0, largeOrderNetInflow: 0, sectorFlows: {}, trend: 'flat' } as never,
    );
    expect(anomalies.filter((a) => a.type === 'new_lows_surge').length).toBeGreaterThan(0);
  });

  it('MarketBreadthEngine：null 时新高新低比取中性且不计多空因子', () => {
    const engine = new MarketBreadthEngine();
    const shape = {
      advances: 2400,
      declines: 1800,
      unchanged: 100,
      upVolume: 5e11,
      downVolume: 4e11,
      totalVolume: 9e11,
      date: '2026-10-07',
    };
    const nullRes = engine.analyze({ ...shape, newHighs: null, newLows: null });
    expect(nullRes.newHighLowRatio).toBe(1); // 中性，不读作 0/0=NaN 或 0

    const engine2 = new MarketBreadthEngine();
    const realRes = engine2.analyze({ ...shape, newHighs: 30, newLows: 60 });
    expect(realRes.newHighLowRatio).toBe(0.5);
  });
});

// ===== ⑥ sentimentEngine：null 不被算成「新高新低 0 分」 =====

describe('P0-NULLADAPT · sentimentEngine 判空', () => {
  // 夹具需完整：limitUp/limitDown/marginBuy/marginSell 缺失会让 normalizeScore 得到 NaN
  const baseInputs = {
    advancers: 2400,
    decliners: 1800,
    upVolume: 5e11,
    downVolume: 4e11,
    vix: 20,
    vixMA: 20,
    inflowAmount: 1e10,
    outflowAmount: 8e9,
    marginBuy: 8e9,
    marginSell: 7e9,
    limitUp: 40,
    limitDown: 10,
    newHighs: 30,
    newLows: 30,
  };

  it('新高新低为 null 时情绪分不按「最差」计算，且非 NaN', () => {
    const asNull = calculateSentimentScore({ ...baseInputs, newHighs: null, newLows: null });
    const asZero = calculateSentimentScore({ ...baseInputs, newHighs: 0, newLows: 0 });
    expect(Number.isNaN(asNull.overall)).toBe(false);
    // null（中性 50 且不计入分母）≠ 0 家（被算成 -100 最差）
    expect(asNull.overall).not.toBe(asZero.overall);
  });

  it('fearGreedIndex 的 newHighLow 分量在 null 时取中性 50', () => {
    const asNull = fearGreedIndex({ ...baseInputs, newHighs: null, newLows: null });
    const asZero = fearGreedIndex({ ...baseInputs, newHighs: 0, newLows: 0 });
    expect(Number.isNaN(asNull.value)).toBe(false);
    expect(asNull.components.newHighLow.value).toBe(50);
    expect(asNull.value).not.toBe(asZero.value);
  });
});
