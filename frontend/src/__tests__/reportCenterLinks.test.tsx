import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ReportCenterPage from '../pages/ReportCenterPage';

vi.mock('echarts-for-react', () => ({ default: () => null }));
vi.mock('../utils/echarts', () => ({ default: {} }));

const report = (overrides: Record<string, unknown>) => ({
  id: 'r1',
  title: '公司信息更新报告',
  stockName: '万科A',
  stockCode: '000002',
  orgName: '中信证券',
  publishDate: '2026-11-04',
  rating: '买入',
  ...overrides,
});

describe('研报中心与个股互链', () => {
  it('?symbol= 预选该股，并提供个股页与研报类型入口', async () => {
    const fetchMock = vi.fn((url: string) => Promise.resolve({
      json: async () => {
        if (url.includes('symbol=600519')) {
          return {
            success: true,
            data: {
              dataSource: 'real',
              items: [report({ id: 'r2', stockName: '贵州茅台', stockCode: '600519', title: '白酒行业跟踪' })],
            },
          };
        }
        if (url.includes('research/reports')) {
          return {
            success: true,
            data: {
              dataSource: 'real',
              // 全市场默认列表故意不含 600519，验证 ?symbol= 会单独补拉
              items: [report({ id: 'r1', stockName: '万科A', stockCode: '000002' })],
            },
          };
        }
        return { success: true, data: { dataSource: 'real', items: [] } };
      },
    }));
    vi.stubGlobal('fetch', fetchMock);
    render(
      <MemoryRouter initialEntries={['/report-center?symbol=600519']}>
        <Routes>
          <Route path="/report-center" element={<ReportCenterPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const stockLink = await screen.findByRole('link', { name: '查看个股' });
    expect(stockLink.getAttribute('href')).toBe('/stocks/600519');

    const tableStockLinks = screen.getAllByRole('link').filter((a) => a.getAttribute('href') === '/stocks/600519');
    expect(tableStockLinks.length).toBeGreaterThanOrEqual(2);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/news/research/reports?symbol=600519'))).toBe(true);
  });

  it('没有 ?symbol= 时回退到第一只覆盖股票，不出现空链接', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve({
      json: async () => (url.includes('research/reports')
        ? {
          success: true,
          data: {
            dataSource: 'real',
            items: [report({ id: 'r1', stockName: '万科A', stockCode: '000002' })],
          },
        }
        : { success: true, data: { dataSource: 'real', items: [] } }),
    })));
    render(
      <MemoryRouter initialEntries={['/report-center']}>
        <Routes>
          <Route path="/report-center" element={<ReportCenterPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const stockLink = await screen.findByRole('link', { name: '查看个股' });
    expect(stockLink.getAttribute('href')).toBe('/stocks/000002');
  });
});