// @vitest-environment jsdom
/**
 * 个股研究 tab 面板：真实字段渲染、缺值「—」、不可用如实说明。
 * 不 mock 组件内部逻辑，只 mock 接口；断言全部落在用户可见文本。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('../services/api', () => ({
  apiService: { get: vi.fn() },
}));

import { apiService } from '../services/api';
import {
  StockFinancialsPanel,
  StockResearchReportsPanel,
  StockAnnouncementsPanel,
  StockNewsPanel,
} from '../components/Stock/StockResearchPanels';

const getMock = vi.mocked(apiService.get);

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('个股研究 tab 面板', () => {
  beforeEach(() => {
    getMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('财务：真实摘要与三表字段直出，缺失指标显示「—」，不补 0', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url === '/financials/summary') {
        return {
          success: true,
          data: {
            balanceSheet: { totalEquity: 123456789 },
            incomeStatement: { totalRevenue: 300000000, netProfit: 120000000, eps: 12.34 },
            cashFlow: { netOperatingCashFlow: 90000000, freeCashFlow: 45000000 },
            indicators: { grossMargin: 41.2, netMargin: 40, roe: 32.53, debtToAssetRatio: null, eps: 12.34, bps: 195.3554 },
          },
        } as never;
      }
      return {
        success: true,
        data: { periods: [{ period: '2025-12-31', totalAssets: 1000000000 }] },
      } as never;
    });

    render(<StockFinancialsPanel symbol="600519" />);

    expect((await screen.findAllByText('营业总收入')).length).toBeGreaterThan(0);
    expect(screen.getByText('3.00亿')).toBeTruthy();
    expect(screen.getByText('32.53%')).toBeTruthy();
    // debtToAssetRatio 为 null：必须是「—」，不能出现 0.00%
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    // 资产负债率为 null → 「—」，不能落成 0.00%
    expect(document.body.textContent).toContain('资产负债率—');
    expect(screen.getAllByText('资产负债表').length).toBeGreaterThan(0);
    // 每股指标是「元/股」，不能按金额量级换算成亿（195.36 元不是 195.36 亿）
    expect(document.body.textContent).toContain('每股净资产195.36');
    expect(document.body.textContent).not.toContain('195.36亿');
    expect(document.body.textContent).toContain('每股收益12.34');
  });

  it('财务：四请求全失败时列出失败表名并提供重试，不渲染 0 值表', async () => {
    getMock.mockRejectedValue(new Error('network down'));
    render(<StockFinancialsPanel symbol="600519" />);

    await waitFor(() =>
      expect(screen.getByText('以下数据加载失败：财务摘要、资产负债表、利润表、现金流量表')).toBeTruthy(),
    );
    expect(screen.getByRole('button', { name: /重试/ })).toBeTruthy();
    expect(document.body.textContent).not.toContain('总资产');
  });

  it('研报：真实列表渲染机构/评级/预测，并标注来源', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      success: true,
      dataSource: 'real',
      data: {
        items: [{
          id: 'AP202611041831416424',
          title: '贵州茅台三季报点评',
          orgName: '国信证券',
          publishDate: '2026-11-04',
          industryName: '白酒',
          rating: '增持',
          predictThisYearEps: 64.62,
          predictThisYearPe: 22.9,
          predictNextYearEps: 70.01,
          predictNextYearPe: 21.1,
          url: 'https://data.eastmoney.com/report/zw_stock.jshtml?infoCode=R1',
        }],
        count: 1,
      },
    })));

    render(<MemoryRouter><StockResearchReportsPanel symbol="600519.SH" /></MemoryRouter>);
    expect(await screen.findByText('贵州茅台三季报点评')).toBeTruthy();
    const detailLink = screen.getByRole('link', { name: '贵州茅台三季报点评' });
    expect(detailLink.getAttribute('href')).toBe('/report-center/AP202611041831416424');
    expect(document.body.textContent).toContain('国信证券');
    expect(document.body.textContent).toContain('增持');
    expect(document.body.textContent).toContain('预测今年 EPS：64.62');
    expect(document.body.textContent).toContain('共 1 篇');
    const calledUrl = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain('/api/news/research/reports?symbol=600519');
  });

  it('研报：dataSource=unavailable 时说明源不可用，不把快讯当研报', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      success: false,
      dataSource: 'unavailable',
      message: '研报真实源当前不可用',
      data: { items: [] },
    })));
    render(<StockResearchReportsPanel symbol="600519" />);
    expect(await screen.findByText('研报源暂不可用')).toBeTruthy();
    expect(document.body.textContent).toContain('研报真实源当前不可用');
    expect(document.body.textContent).not.toContain('暂无相关研报');
  });

  it('公告：真实列表渲染日期/来源/标签', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      success: true,
      dataSource: 'real',
      data: {
        items: [{
          id: 'A1',
          title: '关于召开2026年第三季度业绩说明会的公告',
          publishTime: '2026-11-03 16:59:12',
          source: '贵州茅台公告',
          tags: ['业绩说明会'],
          url: 'https://data.eastmoney.com/notices/detail/600519/A1.html',
        }],
      },
    })));
    render(<StockAnnouncementsPanel symbol="600519" />);
    expect(await screen.findByText('关于召开2026年第三季度业绩说明会的公告')).toBeTruthy();
    expect(document.body.textContent).toContain('2026-11-03');
    expect(document.body.textContent).toContain('贵州茅台公告');
    expect(document.body.textContent).toContain('业绩说明会');
  });

  it('公告：无数据时显示「暂无公告」与真实说明', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      success: true,
      dataSource: 'real',
      data: { items: [], message: '公告库没有返回该标的公告' },
    })));
    render(<StockAnnouncementsPanel symbol="600519" />);
    expect(await screen.findByText('暂无公告')).toBeTruthy();
    expect(document.body.textContent).toContain('公告库没有返回该标的公告');
  });

  it('新闻：Worker data 数组形态也能渲染，并展示免责声明', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      data: [{
        id: 'N1',
        title: '白酒板块午后走强',
        summary: '贵州茅台涨超2%',
        url: 'https://finance.eastmoney.com/a/1.html',
        source: '东方财富',
        time: '2026-11-06 14:00:00',
      }],
      count: 1,
      note: '来源：东方财富资讯',
      disclaimer: '情感倾向基于新闻关键词规则统计，非真实舆情指数',
    })));
    render(<StockNewsPanel symbol="600519" />);
    expect(await screen.findByText('白酒板块午后走强')).toBeTruthy();
    expect(document.body.textContent).toContain('东方财富');
    expect(document.body.textContent).toContain('非真实舆情指数');
    expect(document.body.textContent).toContain('共 1 条');
  });

  it('新闻：空数组时显示 note，不伪造新闻', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      data: [],
      count: 0,
      note: '未检索到与「贵州茅台」相关的新闻',
      disclaimer: '情感倾向基于新闻关键词规则统计',
    })));
    render(<StockNewsPanel symbol="600519" />);
    expect(await screen.findByText('暂无相关新闻')).toBeTruthy();
    expect(document.body.textContent).toContain('未检索到与「贵州茅台」相关的新闻');
  });
});

describe('个股详情 tab 接线', () => {
  it('六个 tab 全部接入，概览保留原区块，URL 用 ?tab= 持久化', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/pages/StockDetailPage.tsx'), 'utf8');
    for (const key of ['overview', 'financials', 'valuation', 'reports', 'announcements', 'news']) {
      expect(source).toContain(`key: '${key}'`);
    }
    expect(source).toContain('useSearchParams');
    expect(source).toContain("next.set('tab', key)");
    expect(source).toContain('<StockFinancialsPanel symbol={symbol} />');
    expect(source).toContain('<StockResearchReportsPanel symbol={symbol} />');
    expect(source).toContain('<StockAnnouncementsPanel symbol={symbol} />');
    expect(source).toContain('<StockNewsPanel symbol={symbol} />');
  });
});
