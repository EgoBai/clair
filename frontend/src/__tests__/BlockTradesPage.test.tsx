// @vitest-environment jsdom
/**
 * BlockTradesPage 页面级渲染测试
 *
 * 重点守卫从`_archived/BlockTradesPage.tsx` 迁移时修正的 4 处失效契约：
 *   1. logger 相对路径（编译期由 esbuild/route 注册守卫覆盖）
 *   2. `id` 为 **string**（后端 withStableId 产出 `symbol-date-i`）
 *   3. 默认视图**不传 date**（休市日回退最近交易日）
 *   4. 必须消费 dataSource / dataDateNote / message，unavailable 时**不渲染空表**
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// mock 服务层：页面用 apiService.get('/block-trades')，不是裸 fetch
const mockGet = vi.fn();
vi.mock('../services/api', () => ({
  apiService: { get: (...args: unknown[]) => mockGet(...args) },
}));

import BlockTradesPage from '../pages/BlockTradesPage';

/** 真实后端响应样本（实测自 3411 端口，73 笔真实交易中的第一页） */
const REALTIME_RESP = {
  success: true,
  data: {
    dataSource: 'realtime',
    date: '2026-09-30',
    dataDateNote: '数据截至 2026-09-30（2026-10-06 为休市日或当日无大宗交易）',
    trades: [
      {
        id: '601088-2026-09-30-1',   // 注意：字符串 id
        symbol: '601088',
        name: '中国神华',
        tradeDate: '2026-09-30',
        price: 39.5,
        closePrice: 39.2,
        volume: 1_200_000,
        amount: 47_400_000,
        discount: 0.78,
        buyer: '机构专用',
        seller: '机构专用',
      },
    ],
    pagination: { page: 1, pageSize: 20, total: 73, totalPages: 4 },
    summary: {
      totalAmount: 625_497_800,
      totalVolume: 285_354_694,
      avgDiscount: -5.71,
      premiumCount: 8,
      discountCount: 32,
      tradeCount: 73,
    },
  },
};

const UNAVAILABLE_RESP = {
  success: true,
  data: {
    dataSource: 'unavailable',
    message: '上游大宗交易报表接口不可用（东方财富报表接口返回异常，非请求参数问题）',
    trades: [],
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    summary: { totalAmount: 0, totalVolume: 0, avgDiscount: 0, premiumCount: 0, discountCount: 0, tradeCount: 0 },
  },
};

const renderPage = () =>
  render(<MemoryRouter><BlockTradesPage /></MemoryRouter>);

beforeEach(() => {
  mockGet.mockReset();
});

describe('BlockTradesPage', () => {
  describe('契约 3：默认视图不传 date（休市日回退最近交易日）', () => {
    it('应调用 /block-trades 且不带 date 参数', async () => {
      mockGet.mockResolvedValue(REALTIME_RESP);
      renderPage();
      await waitFor(() => expect(mockGet).toHaveBeenCalled());

      const [path, params] = mockGet.mock.calls[0];
      expect(path).toBe('/block-trades');
      // 若误传今天（休市日），后端必然返回空 → 用户误读成「当天零成交」
      expect(params).not.toHaveProperty('date');
      expect(params).toMatchObject({ page: 1, pageSize: 20 });
    });
  });

  describe('契约 2 + 4：真实数据渲染 + 诚实契约消费', () => {
    it('应渲染真实成交记录（含字符串 id 的行）', async () => {
      mockGet.mockResolvedValue(REALTIME_RESP);
      renderPage();

      await waitFor(() => expect(screen.getByText('中国神华')).toBeTruthy());
      expect(screen.getByText('601088')).toBeTruthy();
      // 统计卡用真实 summary（73 笔）
      expect(screen.getByText('73')).toBeTruthy();
    });

    it('应展示 dataDateNote，让用户知道看到的是哪个交易日的数据', async () => {
      mockGet.mockResolvedValue(REALTIME_RESP);
      renderPage();

      await waitFor(() => expect(screen.getByTestId('block-trades-datanote')).toBeTruthy());
      expect(screen.getByText(/数据截至 2026-09-30/)).toBeTruthy();
      expect(screen.getByText(/休市日或当日无大宗交易/)).toBeTruthy();
    });
  });

  describe('契约 4：dataSource=unavailable 时渲染可解释文案，绝不渲染空表', () => {
    it('应展示降级原因，且表格不渲染', async () => {
      mockGet.mockResolvedValue(UNAVAILABLE_RESP);
      renderPage();

      await waitFor(() => expect(screen.getByTestId('block-trades-degraded')).toBeTruthy());
      expect(screen.getByText(/上游大宗交易数据源暂不可用/)).toBeTruthy();
      // 后端 message 必须被透出
      expect(screen.getByText(/东方财富报表接口返回异常/)).toBeTruthy();
      // 关键：空表会被误读成「当天零成交」，因此不能出现
      expect(screen.queryByRole('table')).toBeNull();
      expect(screen.queryByText('中国神华')).toBeNull();
    });
  });

  describe('契约 4：请求异常与「源可达但无成交」是两种不同事实', () => {
    it('请求失败应展示失败文案（而非「无大宗交易」）', async () => {
      mockGet.mockRejectedValue(new Error('Network Error'));
      renderPage();

      await waitFor(() => expect(screen.getByTestId('block-trades-degraded')).toBeTruthy());
      expect(screen.getByText(/大宗交易接口请求失败/)).toBeTruthy();
      // 必须点明「未能取到」≠「当天没有」
      expect(screen.getByText(/不代表当天没有大宗交易/)).toBeTruthy();
      expect(screen.queryByRole('table')).toBeNull();
    });

    it('源可达但当日无成交：dataSource=realtime + message，渲染表格 + 说明', async () => {
      mockGet.mockResolvedValue({
        success: true,
        data: {
          dataSource: 'realtime',
          message: '最近交易日 真实源无大宗交易记录',
          trades: [],
          pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
          summary: { totalAmount: 0, totalVolume: 0, avgDiscount: 0, premiumCount: 0, discountCount: 0, tradeCount: 0 },
        },
      });
      renderPage();

      await waitFor(() => expect(screen.getByText(/真实源无大宗交易记录/)).toBeTruthy());
      // 与 unavailable 不同：这里仍渲染表格（空表 + 明确说明，语义是「真的没有」）
      expect(screen.queryByTestId('block-trades-degraded')).toBeNull();
    });
  });
});