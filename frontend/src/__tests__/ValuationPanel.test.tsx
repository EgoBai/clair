// @vitest-environment jsdom
/**
 * 估值分析面板：真实数据渲染 / 空值不造假 / 接口不可用如实说明
 *
 * 背景：该面板此前是纯 stub（「数据未接入」）。接 Worker /api/valuation/:symbol 后，
 * 这里守住三条：字段存在就展示；缺失渲染「—」而不是 0；接口不可用/标的不支持时
 * 显示可解释原因，绝不显示 0.00 或编造 PE/PB/DCF。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

import ValuationPanel, { formatValuationMarketCap } from '../components/valuation/ValuationPanel';

const REAL_DATA = {
  symbol: '600519',
  name: '贵州茅台',
  industry: '食品饮料',
  asOf: '2026-11-04',
  price: 1446.44,
  marketCap: 1.81e12,
  marketCapUnit: 'yuan',
  pe: 22.01,
  pb: 6.67,
  peg: 1.35,
  pePercentile3y: 18.2,
  pbPercentile3y: 35.5,
  pePercentileSampleCount: 748,
  pbPercentileSampleCount: 750,
  eps: 65.7,
  bps: 216.9,
  roe: 31.5,
  profitGrowth: 16.3,
  revenueGrowth: 15.2,
  reportDate: '2025-12-31',
  dcfInput: {
    freeCashFlow: 1e9,
    growthRate: 0.1,
    terminalGrowthRate: 0.025,
    discountRate: 0.1,
    projectionYears: 5,
    shares: 1e9,
    netDebt: 0,
  },
  dcfNote: null,
  notes: ['历史分位用最新年报 EPS/BPS 回溯近 3 年不复权收盘价计算，是近似分位而非逐期真实 PE/PB 历史。'],
  dataSource: 'real',
};

const originalFetch = globalThis.fetch;

function mockJson(payload: unknown, status = 200) {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  });
  (globalThis as unknown as { fetch: unknown }).fetch = fn;
  return fn;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('ValuationPanel', () => {
  it('真实数据：PE/PB/分位/市值/EPS 渲染为真实值（不是 0 或 —）', async () => {
    const fetchMock = mockJson({ success: true, dataSource: 'real', data: REAL_DATA });
    render(<ValuationPanel symbol="600519" />);

    await waitFor(() => expect(screen.getByText('22.01')).toBeTruthy());
    expect(fetchMock.mock.calls[0][0]).toBe('/api/valuation/600519');
    expect(screen.getByText('6.67')).toBeTruthy();
    expect(screen.getByText('1.35')).toBeTruthy();
    expect(screen.getByText('1.81万亿')).toBeTruthy();
    expect(screen.getByText('18.2%')).toBeTruthy();
    expect(screen.getByText('35.5%')).toBeTruthy();
    expect(screen.getByText('65.70 / 216.90')).toBeTruthy();
    expect(screen.getByText('31.5% / 16.3%')).toBeTruthy();
    expect(screen.getByText('真实计算')).toBeTruthy();
  });

  it('DCF 用接口给的真实输入计算内在价值、溢价与敏感性区间', async () => {
    mockJson({ success: true, dataSource: 'real', data: REAL_DATA });
    render(<ValuationPanel symbol="600519" />);

    await waitFor(() => expect(screen.getByText('18.67 元')).toBeTruthy());
    // (18.67 - 1446.44) / 1446.44 ≈ -98.71%
    expect(screen.getByText('-98.71%')).toBeTruthy();
    expect(screen.getByText('13.07 ~ 24.27 元')).toBeTruthy();
    expect(screen.getByText(/假设：营收\/现金流增速 10.00%、永续 2.5%、折现率 10.0%、预测 5 年/)).toBeTruthy();
  });

  it('字段缺失时渲染「—」，不出现 0.00 / 0%', async () => {
    mockJson({
      success: true,
      dataSource: 'partial',
      data: {
        ...REAL_DATA,
        pe: null, pb: null, peg: null, marketCap: null,
        pePercentile3y: null, pbPercentile3y: null, pePercentileSampleCount: null, pbPercentileSampleCount: null,
        eps: null, bps: null, roe: null, profitGrowth: null,
        dcfInput: null, dcfNote: '现金流量表不可用（银行/保险等特殊报表主体或不披露自由现金流），DCF 不计算，不用 0 或假设值顶替。',
        dataSource: 'partial',
      },
    });
    render(<ValuationPanel symbol="600519" />);

    await waitFor(() => expect(screen.getByText('部分真实（年报指标缺失）')).toBeTruthy());
    // PE/PB/PEG/市值/PE 分位/PB 分位 六个独立单元格 + EPS/BPS 与 ROE/增速 两个组合单元格
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(6);
    expect(screen.getAllByText('— / —')).toHaveLength(2);
    expect(screen.queryByText('0.00')).toBeNull();
    expect(screen.queryByText('0.00%')).toBeNull();
    expect(screen.getByText(/DCF 不计算，不用 0 或假设值顶替/)).toBeTruthy();
  });

  it('dataSource=unavailable → 显示后端给出的真实原因，不渲染估值数字', async () => {
    mockJson({
      success: true,
      dataSource: 'unavailable',
      data: { ...REAL_DATA, dataSource: 'unavailable', notes: ['行情源未返回 999999 的有效价格，无法计算估值；不以 0 或估算值顶替'] },
    });
    render(<ValuationPanel symbol="999999" />);

    await waitFor(() => expect(screen.getByText(/行情源未返回 999999 的有效价格/)).toBeTruthy());
    expect(screen.queryByText('22.01')).toBeNull();
  });

  it('HTTP 404 → 明说接口未部署，不用假数据兜底', async () => {
    mockJson({ message: 'Not Found' }, 404);
    render(<ValuationPanel symbol="600519" />);

    await waitFor(() => expect(screen.getByText(/估值数据不可用：估值接口未部署（HTTP 404）/)).toBeTruthy());
  });

  it('市值格式化：万亿/亿/元三档，非法值「—」', () => {
    expect(formatValuationMarketCap(1.81e12)).toBe('1.81万亿');
    expect(formatValuationMarketCap(2.94e10)).toBe('294.00亿');
    expect(formatValuationMarketCap(1234)).toBe('1234元');
    expect(formatValuationMarketCap(null)).toBe('—');
    expect(formatValuationMarketCap(0)).toBe('—');
  });
});
