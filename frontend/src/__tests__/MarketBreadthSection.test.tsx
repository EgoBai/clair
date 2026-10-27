// @vitest-environment jsdom
/**
 * MarketBreadthSection 测试 — `/api/breadth/current` 真实消费者的诚实契约守卫
 *
 * 本测试的存在意义：证明 `breadthService.getCurrent` 从「只有自己测试的孤儿服务」
 * 变成有真实页面消费的服务，且**诚实消费 null**——
 * 腾讯源不提供 newHighs/newLows，若渲染成 0 就是凭空造数（「今日全市场无新高」）。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

const mockGetCurrent = vi.fn();
const mockGetHistory = vi.fn();
const mockGetMcClellan = vi.fn();
vi.mock('../services/breadthService', () => ({
  default: {
    getCurrent: () => mockGetCurrent(),
    getHistory: () => mockGetHistory(),
    getMcClellan: () => mockGetMcClellan(),
  },
}));

import MarketBreadthSection from '../components/Market/MarketBreadthSection';
import { recordNotDeployed, clearNotDeployed } from '../services/apiGateway';

/** 实测自后端 3411 的真实响应要点（newHighs/newLows 为 null） */
const REAL_RESP = {
  timestamp: Date.now(),
  advancing: 2338,
  declining: 2693,
  unchanged: 510,
  totalStocks: 5541,
  advanceDeclineRatio: 0.87,
  newHighs: null,
  newLows: null,
  upVolume: 0,
  downVolume: 0,
  volumeRatio: 0,
  marketSentiment: 'bearish' as const,
  sentimentScore: -12,
  limitUp: 55,
  limitDown: 12,
  turnover: 2529885940000,
  dataSource: 'tencent',
  caliber: '涨跌停判定=现价与交易所涨跌停价比较（含 ±20%/±5% 全部制度）',
  unavailableFields: ['newHighs', 'newLows'],
  message: 'newHighs/newLows 为 null：腾讯行情源不提供历史新高/新低统计（诚实不可用，非「0 = 今日无新高」）。',
  uncoveredSymbols: 3,
};

beforeEach(() => {
    mockGetCurrent.mockReset();
    mockGetHistory.mockReset();
    mockGetMcClellan.mockReset();
  });

describe('MarketBreadthSection', () => {
  it('应调用 breadthService.getCurrent（证明服务有真实页面消费者）', async () => {
    mockGetCurrent.mockResolvedValue(REAL_RESP);
    render(<MarketBreadthSection />);
    await waitFor(() => expect(mockGetCurrent).toHaveBeenCalled());
  });

  describe('真实数据渲染', () => {
    it('应渲染真实涨跌家数与涨跌停', async () => {
      mockGetCurrent.mockResolvedValue(REAL_RESP);
      render(<MarketBreadthSection />);

      await waitFor(() => expect(screen.getByText('2,338')).toBeTruthy());
      expect(screen.getByText('2,693')).toBeTruthy();
      expect(screen.getByText('55')).toBeTruthy();   // 涨停
      expect(screen.getByText('12')).toBeTruthy();   // 跌停
      // 展示真实源名，便于用户核对口径
      expect(screen.getByText(/数据源 tencent/)).toBeTruthy();
    });

    it('应展示覆盖率（源侧无报价的标的数），不把「没覆盖」当「没有」', async () => {
      mockGetCurrent.mockResolvedValue(REAL_RESP);
      render(<MarketBreadthSection />);

      await waitFor(() => expect(screen.getByText(/3 只源侧无报价/)).toBeTruthy());
    });
  });

  describe('诚实红线：newHighs/newLows 为 null 时绝不显示 0', () => {
    it('应显示「数据源未提供」而非 0', async () => {
      mockGetCurrent.mockResolvedValue(REAL_RESP);
      render(<MarketBreadthSection />);

      await waitFor(() => expect(screen.getByText('创新高')).toBeTruthy());
      expect(screen.getByText('创新低')).toBeTruthy();
      // 两个 null 字段都走「不可用」分支
      const unavailable = screen.getAllByTestId('metric-unavailable');
      expect(unavailable.length).toBeGreaterThanOrEqual(2);
      expect(unavailable[0].textContent).toContain('数据源未提供');
    });

    it('应列出后端给出的不可用字段清单', async () => {
      mockGetCurrent.mockResolvedValue(REAL_RESP);
      render(<MarketBreadthSection />);

      await waitFor(() => expect(screen.getByText(/newHighs、newLows/)).toBeTruthy());
    });

    it('若源侧真的提供了数值，则应正常展示（null 分支不能吃掉真实值）', async () => {
      mockGetCurrent.mockResolvedValue({ ...REAL_RESP, newHighs: 37, newLows: 4, unavailableFields: [] });
      render(<MarketBreadthSection />);

      await waitFor(() => expect(screen.getByText('37')).toBeTruthy());
      expect(screen.getByText('4')).toBeTruthy();
      expect(screen.queryAllByTestId('metric-unavailable')).toHaveLength(0);
    });
  });

  describe('接口失败时如实展示，不退回本地推算', () => {
    it('应展示失败文案并说明「未能取到 ≠ 全市场没有涨跌」', async () => {
      mockGetCurrent.mockRejectedValue(new Error('Network Error'));
      render(<MarketBreadthSection />);

      await waitFor(() => expect(screen.getByTestId('breadth-error')).toBeTruthy());
      expect(screen.getByText(/请求失败/)).toBeTruthy();
      expect(screen.getByText(/不代表全市场没有涨跌家数/)).toBeTruthy();
      // 形态必须是「真失败」，不能落成「未部署」或「暂无数据」——三者不可互相冒充
      expect(screen.getByTestId('api-status-notice').getAttribute('data-status')).toBe('failed');
    });

    /**
     * 线上 Worker 场景：`/api/breadth/current` 不在 Worker 路由表里，
     * 返回 404 + {success:false,error:'Not found'}。此时页面必须说
     * 「演示环境未挂载，需连完整后端」，**绝不能**说「接口请求失败」——
     * 后者会让用户误以为后端挂了或自己网络有问题。
     */
    it('端点未部署时应显示环境说明，且不出现「接口请求失败」', async () => {
      recordNotDeployed('/api/breadth/current', 404, 'Not found');
      mockGetCurrent.mockRejectedValue(new Error('HTTP 404'));
      render(<MarketBreadthSection />);

      await waitFor(() => expect(screen.getByTestId('breadth-error')).toBeTruthy());
      const notice = screen.getByTestId('api-status-notice');
      expect(notice.getAttribute('data-status')).toBe('not-deployed');
      expect(notice.textContent).toContain('演示环境未挂载此接口');
      expect(notice.textContent).toContain('需连接完整后端');
      expect(notice.textContent).not.toContain('接口请求失败');
      clearNotDeployed();
    });
  });

  describe('刻意不展示 unavailable 的时序模块', () => {
    it('不应调用 getHistory / getMcClellan（时序未落库，画出来就是造假）', async () => {
      mockGetCurrent.mockResolvedValue(REAL_RESP);
      render(<MarketBreadthSection />);
      await waitFor(() => expect(screen.getByText('2,338')).toBeTruthy());
      expect(mockGetHistory).not.toHaveBeenCalled();
      expect(mockGetMcClellan).not.toHaveBeenCalled();
    });
  });
});