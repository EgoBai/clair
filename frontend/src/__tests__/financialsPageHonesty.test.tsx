// @vitest-environment jsdom
/**
 * 财务报表页诚实红线：四表接口全失败时必须是错误态 + 真实原因 + 重试，
 * 不能渲染「无法加载财务数据」以外的空表，也不能用 0 或演示数据补位。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../services/api', () => ({
  apiService: { get: vi.fn() },
}));

import { apiService } from '../services/api';
import FinancialsPage from '../pages/FinancialsPage';

const getMock = vi.mocked(apiService.get);

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/financials/600519']}>
      <Routes>
        <Route path="/financials/:symbol" element={<FinancialsPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('FinancialsPage 失败态诚实性', () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it('四表全部请求失败：列出失败表名并提供重试，不补 0', async () => {
    getMock.mockRejectedValue(new Error('network down'));
    renderPage();

    await waitFor(() =>
      expect(
        screen.getByText('以下数据加载失败：财务摘要、资产负债表、利润表、现金流量表')
      ).toBeTruthy()
    );
    expect(screen.getByRole('button', { name: /重试/ })).toBeTruthy();
    expect(document.body.textContent).not.toContain('暂无财务数据');
    expect(document.body.textContent).not.toContain('0.00');
    expect(getMock).toHaveBeenCalledTimes(4);

    fireEvent.click(screen.getByRole('button', { name: /重试/ }));
    await waitFor(() => expect(getMock).toHaveBeenCalledTimes(8));
  });

  it('摘要成功但三表失败：显示部分可用，不隐藏失败表名', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url === '/financials/summary') {
        return {
          success: true,
          data: { indicators: {} },
        } as never;
      }
      throw new Error('table unavailable');
    });
    renderPage();

    await waitFor(() =>
      expect(screen.getByText('接口未取到完整财务三表数据')).toBeTruthy()
    );
    expect(document.body.textContent).toContain('资产负债表');
    expect(document.body.textContent).toContain('利润表');
    expect(document.body.textContent).toContain('现金流量表');
  });
});