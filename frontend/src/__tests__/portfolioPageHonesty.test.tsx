// @vitest-environment jsdom
/**
 * 投资组合页诚实红线：接口失败必须是错误态 + 原因 + 重试，
 * 不能把失败伪装成「暂无投资组合 / 后端接口尚未接入」。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../services/api', () => ({
  apiService: {
    getPortfolios: vi.fn(),
    getPortfolio: vi.fn(),
  },
}));

import { apiService } from '../services/api';
import PortfolioPage from '../pages/PortfolioPage';

const getPortfolios = vi.mocked(apiService.getPortfolios);
const getPortfolio = vi.mocked(apiService.getPortfolio);

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/portfolio']}>
      <PortfolioPage />
    </MemoryRouter>
  );
}

describe('PortfolioPage 失败态诚实性', () => {
  beforeEach(() => {
    getPortfolios.mockReset();
    getPortfolio.mockReset();
  });

  it('列表接口 success=false：显示错误态与重试，不显示「尚未接入」', async () => {
    getPortfolios.mockResolvedValue({ success: false } as never);
    renderPage();

    await waitFor(() =>
      expect(screen.getByText('投资组合加载失败：后端返回 success=false')).toBeTruthy()
    );
    expect(document.body.textContent).not.toContain('后端接口尚未接入');
    expect(screen.queryByText('暂无投资组合')).toBeNull();
    expect(screen.getByRole('button', { name: /重试/ })).toBeTruthy();
  });

  it('列表接口抛错：显示真实原因并可重试', async () => {
    getPortfolios.mockRejectedValue(new Error('ECONNREFUSED'));
    renderPage();

    await waitFor(() =>
      expect(screen.getByText('投资组合加载失败：ECONNREFUSED')).toBeTruthy()
    );
    fireEvent.click(screen.getByRole('button', { name: /重试/ }));
    await waitFor(() => expect(getPortfolios).toHaveBeenCalledTimes(2));
  });

  it('列表成功但为空：是空组合，不是接口失败', async () => {
    getPortfolios.mockResolvedValue({ success: true, data: { portfolios: [] } } as never);
    renderPage();

    await waitFor(() => expect(screen.getByText('暂无投资组合')).toBeTruthy());
    expect(screen.queryByText(/投资组合加载失败/)).toBeNull();
    expect(screen.queryByRole('button', { name: /重试/ })).toBeNull();
  });
});