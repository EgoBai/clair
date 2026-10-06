// @vitest-environment jsdom
/**
 * 北向资金页渲染测试（P0-NBFLOW）
 *
 * 守卫两条诚实红线：
 *  1. **净买额口径已停披露**：`netInflow` / `netDealAmount` 为 null 时，页面
 *     一律显示「已停止披露」/「—」，全页 DOM 不得出现 `0.00 亿`。
 *  2. **单位换算正确**：后端 `dealAmount` 单位为**万元**，展示「亿元」须 ÷10000。
 *     同时守卫「成交额 ≠ 净买额」——卡片标题不得出现把成交额称作净流入。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);
vi.mock('../utils/logger', () => ({
  default: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import NorthBoundPage from '../pages/NorthBoundPage';

/** 真实后端响应样本：字段与 backend/src/api/northBound.ts 的 DealFlowRow / summarizeByDate 对齐 */
const REAL_RESP = {
  success: true,
  data: {
    flows: [],
    holdings: [],
    sectors: [],
    latestTradeDate: '2026-09-30',
    byDate: [
      {
        date: '2026-09-29',
        shDealAmount: 820000,      // 82.00 亿
        szDealAmount: 640000,      // 64.00 亿
        totalDealAmount: 1460000,  // 146.00 亿
        shDealCount: 100000,
        szDealCount: 80000,
        shNetInflow: null,
        szNetInflow: null,
        totalNetInflow: null,
        shIndexClose: 3100.5,
        szIndexClose: 10250.3,
        shQuotaStatus: '额度充足',
        szQuotaStatus: '额度充足',
        dataSource: 'real',
      },
      {
        date: '2026-09-30',
        shDealAmount: 500000,      // 50.00 亿
        szDealAmount: 300000,      // 30.00 亿
        totalDealAmount: 800000,   // 80.00 亿
        shDealCount: 60000,
        szDealCount: 40000,
        shNetInflow: null,
        szNetInflow: null,
        totalNetInflow: null,
        shIndexClose: 3120.0,
        szIndexClose: 10300.0,
        shQuotaStatus: '额度充足',
        szQuotaStatus: '额度充足',
        dataSource: 'real',
      },
    ],
    dealFlows: [
      {
        date: '2026-09-29', channel: '沪股通', dealAmount: 820000, dealCount: 100000,
        netDealAmount: null,
        leadStock: { code: '600519', name: '贵州茅台', changeRate: 1.25 },
        indexClose: 3100.5, indexChangeRate: 0.4, quotaStatus: '额度充足', dataSource: 'real',
      },
      {
        date: '2026-09-29', channel: '深股通', dealAmount: 640000, dealCount: 80000,
        netDealAmount: null,
        leadStock: { code: '300750', name: '宁德时代', changeRate: -0.85 },
        indexClose: 10250.3, indexChangeRate: -0.2, quotaStatus: '额度充足', dataSource: 'real',
      },
      {
        date: '2026-09-30', channel: '沪股通', dealAmount: 500000, dealCount: 60000,
        netDealAmount: null,
        leadStock: { code: '601318', name: '中国平安', changeRate: 0.6 },
        indexClose: 3120.0, indexChangeRate: 0.6, quotaStatus: '额度充足', dataSource: 'real',
      },
      {
        date: '2026-09-30', channel: '深股通', dealAmount: 300000, dealCount: 40000,
        netDealAmount: null,
        leadStock: { code: '000858', name: '五粮液', changeRate: 2.1 },
        indexClose: 10300.0, indexChangeRate: 0.5, quotaStatus: '额度充足', dataSource: 'real',
      },
    ],
  },
  dataSource: 'real',
  message: '北向资金「净买额 / 资金流入 / 买入额 / 卖出额」口径已被交易所停止披露。',
  netInflowDisclosure: {
    disclosed: false,
    lastDisclosedDateObserved: '2024-08-16',
    note: '上游 RPT_MUTUAL_DEAL_HISTORY 的 NET_DEAL_AMT / FUND_INFLOW 现均为 null。',
  },
};

const okJson = (body: unknown) => ({ ok: true, json: async () => body });

/**
 * 读取 antd Statistic 的展示值。
 * antd 会把整数位与小数位拆成两个 span（`50` + `.00`），故需取 textContent 而非 getByText。
 */
const statValue = (title: string): string => {
  // 标题文案同时出现在 Statistic 与 Table 表头，故只在 .ant-statistic 内查找
  const el = screen.getByText(title, { selector: '.ant-statistic-title *' });
  const card = el.closest('.ant-statistic');
  return card?.querySelector('.ant-statistic-content-value')?.textContent?.trim() ?? '';
};

/** 页面上是否出现「恰好等于 0.00 亿」的展示值（排除 30.00/50.00 这类含子串的合法值） */
const hasExactZeroYi = (container: HTMLElement): boolean =>
  Array.from(container.querySelectorAll('*')).some(
    (el) => el.children.length === 0 && /^(0\.00 亿|0\.00亿|0 亿|0亿)$/.test(el.textContent?.trim() ?? ''),
  );

describe('NorthBoundPage · P0-NBFLOW 成交额真实化', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('场景A：后端返回真实成交额时，展示数值 + 领涨股，且不出现「数据源暂时不可用」', async () => {
    mockFetch.mockResolvedValue(okJson(REAL_RESP));
    render(<NorthBoundPage />);

    await waitFor(() => expect(screen.getByText(/沪股通成交额\(亿\)/)).toBeTruthy());

    // 空态文案不得出现
    expect(screen.queryByText(/数据源暂时不可用/)).toBeNull();
    expect(screen.queryByText(/本次未取到数据/)).toBeNull();

    // 单位换算：500000 万元 = 50.00 亿；300000 万元 = 30.00 亿；800000 万元 = 80.00 亿
    expect(statValue('沪股通成交额(亿)')).toBe('50.00');
    expect(statValue('深股通成交额(亿)')).toBe('30.00');
    expect(statValue('北向成交额合计(亿)')).toBe('80.00');
    // 换算错误（未 ÷10000）会得到 500000 / 5000，显式排除
    expect(statValue('沪股通成交额(亿)')).not.toContain('500000');
    expect(statValue('北向成交额合计(亿)')).not.toContain('800000');

    // 成交笔数：60000 + 40000 = 100000
    expect(statValue('成交笔数')).toBe('100,000');

    // 领涨股真实值
    expect(screen.getAllByText('中国平安').length).toBeGreaterThan(0);
    expect(screen.getAllByText('五粮液').length).toBeGreaterThan(0);

    // 口径说明引用后端 note
    expect(screen.getByText(/净买额口径已停止披露，故本页展示成交额/)).toBeTruthy();
    expect(screen.getByText(/NET_DEAL_AMT/)).toBeTruthy();

    // 最新交易日
    expect(screen.getByText(/最新交易日 2026-09-30/)).toBeTruthy();
  });

  it('场景B：净流入为 null 时显示「已停止披露」，页面无任何 0.00 亿 展示值', async () => {
    mockFetch.mockResolvedValue(okJson(REAL_RESP));
    const { container } = render(<NorthBoundPage />);

    await waitFor(() => expect(screen.getByText('今日北向净流入(亿)')).toBeTruthy());

    // 三张净流入卡片全部显示「已停止披露」
    expect(statValue('今日北向净流入(亿)')).toBe('已停止披露');
    expect(statValue('近5日累计净流入(亿)')).toBe('已停止披露');
    expect(statValue('近20日累计净流入(亿)')).toBe('已停止披露');

    // 红线：不存在「恰好 0.00 亿」的叶子节点
    expect(hasExactZeroYi(container)).toBe(false);
    // 且净流入区文案明确点出「而非数值 0」
    expect(screen.getByText(/而非数值 0/)).toBeTruthy();
  });

  it('净买额列为 null 时不显示 0.00，仅显示「已停止披露」', async () => {
    mockFetch.mockResolvedValue(okJson(REAL_RESP));
    const { container } = render(<NorthBoundPage />);
    await waitFor(() => expect(screen.getByText(/成交明细/)).toBeTruthy());
    expect(hasExactZeroYi(container)).toBe(false);
  });

  it('成交额缺失（null）时显示「—」，不显示 0.00 亿', async () => {
    mockFetch.mockResolvedValue(
      okJson({
        ...REAL_RESP,
        data: {
          ...REAL_RESP.data,
          byDate: [
            {
              ...REAL_RESP.data.byDate[1],
              shDealAmount: null,
              szDealAmount: null,
              totalDealAmount: null,
              shDealCount: null,
              szDealCount: null,
            },
          ],
        },
      }),
    );
    const { container } = render(<NorthBoundPage />);
    await waitFor(() => expect(screen.getByText(/沪股通成交额\(亿\)/)).toBeTruthy());
    expect(hasExactZeroYi(container)).toBe(false);
    expect(statValue('沪股通成交额(亿)')).toBe('—');
    expect(statValue('北向成交额合计(亿)')).toBe('—');
    expect(statValue('成交笔数')).toBe('—');
  });

  it('卡片标题写「成交额」而非把成交额称作「净流入」', async () => {
    mockFetch.mockResolvedValue(okJson(REAL_RESP));
    render(<NorthBoundPage />);
    await waitFor(() => expect(screen.getByText(/北向成交额合计\(亿\)/)).toBeTruthy());
    expect(screen.getByText(/北向成交额趋势/)).toBeTruthy();
    // 趋势图口径脚注必须点明「成交额，非净买额」
    expect(screen.getByText(/此处为/)).toBeTruthy();
    expect(screen.getByText(/非净买额/)).toBeTruthy();
  });

  it('dealFlows / byDate 有数据时不进入空态（后端有真实数据却显示「不可用」的回归守卫）', async () => {
    mockFetch.mockResolvedValue(okJson(REAL_RESP));
    render(<NorthBoundPage />);
    await waitFor(() => expect(screen.getByText(/北向成交额趋势（近 60 个交易日）/)).toBeTruthy());
    expect(screen.queryByText(/北向资金数据源暂时不可用/)).toBeNull();
  });

  it('空态文案不含失真的「已接入沪/深股通持仓接口」', async () => {
    mockFetch.mockResolvedValue(okJson({ success: true, data: {}, dataSource: 'unavailable' }));
    const { container } = render(<NorthBoundPage />);
    await waitFor(() => expect(screen.getByText(/北向资金本次未取到数据/)).toBeTruthy());
    expect(container.innerHTML).not.toContain('已接入沪/深股通持仓接口');
  });

  it('持仓/板块为空时据实说明，不伪造数据', async () => {
    mockFetch.mockResolvedValue(okJson(REAL_RESP));
    render(<NorthBoundPage />);
    await waitFor(() => expect(screen.getByText(/北向重仓股/)).toBeTruthy());
    expect(screen.getByText(/停更一年以上/)).toBeTruthy();
    expect(screen.getByText(/北向板块级净流入在东方财富 \/ 腾讯 \/ 新浪均无真实数据源/)).toBeTruthy();
  });

  it('接口报错时不崩溃，如实落到空态', async () => {
    mockFetch.mockRejectedValue(new Error('network down'));
    render(<NorthBoundPage />);
    await waitFor(() => expect(screen.getByText(/北向资金本次未取到数据/)).toBeTruthy());
  });
});