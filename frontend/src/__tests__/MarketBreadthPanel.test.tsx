// @vitest-environment jsdom
/**
 * MarketBreadthPanel 组件测试
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MarketBreadthPanel } from '../components/Market/MarketBreadthPanel';

const mockBreadthData = {
  timestamp: Date.now(),
  advancing: 1500,
  declining: 800,
  unchanged: 100,
  totalStocks: 2400,
  advanceDeclineRatio: 1.88,
  newHighs: 50,
  newLows: 20,
  upVolume: 3000000000,
  downVolume: 2000000000,
  volumeRatio: 1.5,
  marketSentiment: 'bullish' as const,
  sentimentScore: 35,
};

describe('MarketBreadthPanel', () => {
  it('应该渲染加载状态', () => {
    render(<MarketBreadthPanel loading />);
    expect(screen.getByText('市场宽度分析')).toBeTruthy();
  });

  it('应该渲染无数据状态', () => {
    render(<MarketBreadthPanel data={null} />);
    expect(screen.getByText('暂无数据')).toBeTruthy();
  });

  it('应该渲染市场宽度数据', () => {
    render(<MarketBreadthPanel data={mockBreadthData} />);
    expect(screen.getByText('市场宽度分析')).toBeTruthy();
    expect(screen.getByText('涨跌比')).toBeTruthy();
    expect(screen.getByText('量比')).toBeTruthy();
    expect(screen.getByText('市场情绪')).toBeTruthy();
  });

  it('应该显示涨跌家数', () => {
    render(<MarketBreadthPanel data={mockBreadthData} />);
    expect(screen.getByText(/涨 1500/)).toBeTruthy();
    expect(screen.getByText(/跌 800/)).toBeTruthy();
  });

  it('应该显示偏多标签（bullish）', () => {
    render(<MarketBreadthPanel data={mockBreadthData} />);
    expect(screen.getByText('偏多')).toBeTruthy();
  });

  it('应该显示偏空标签（bearish）', () => {
    const bearishData = {
      ...mockBreadthData,
      advancing: 600,
      declining: 1800,
      marketSentiment: 'bearish' as const,
      sentimentScore: -40,
      advanceDeclineRatio: 0.33,
      volumeRatio: 0.6,
    };
    render(<MarketBreadthPanel data={bearishData} />);
    expect(screen.getByText('偏空')).toBeTruthy();
  });

  it('应该显示中性标签（neutral）', () => {
    const neutralData = {
      ...mockBreadthData,
      advancing: 1200,
      declining: 1100,
      marketSentiment: 'neutral' as const,
      sentimentScore: 5,
      advanceDeclineRatio: 1.09,
    };
    render(<MarketBreadthPanel data={neutralData} />);
    const tags = screen.getAllByText('中性');
    expect(tags.length).toBeGreaterThan(0);
  });

  it('应该显示情绪分数', () => {
    render(<MarketBreadthPanel data={mockBreadthData} />);
    expect(screen.getByText(/情绪分数: 35/)).toBeTruthy();
  });

  it('应该显示涨跌成交量', () => {
    render(<MarketBreadthPanel data={mockBreadthData} />);
    expect(screen.getByText(/上涨成交量/)).toBeTruthy();
    expect(screen.getByText(/下跌成交量/)).toBeTruthy();
  });

  it('紧凑模式不应该显示成交量分布', () => {
    render(<MarketBreadthPanel data={mockBreadthData} compact />);
    expect(screen.queryByText(/上涨成交量/)).toBeNull();
  });

  it('应该调用刷新回调', () => {
    const onRefresh = vi.fn();
    render(<MarketBreadthPanel data={mockBreadthData} onRefresh={onRefresh} />);

    const refreshLink = screen.getByText('刷新');
    fireEvent.click(refreshLink);

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('应该显示涨跌比数值', () => {
    const { container } = render(<MarketBreadthPanel data={mockBreadthData} />);
    // Ant Design Statistic splits number into span elements
    expect(container.textContent).toContain('1.88');
  });

  it('应该显示量比数值', () => {
    const { container } = render(<MarketBreadthPanel data={mockBreadthData} />);
    expect(container.textContent).toContain('1.50');
  });

  it('应该格式化大成交量', () => {
    const bigVolumeData = {
      ...mockBreadthData,
      upVolume: 5000000000000, // 5万亿
      downVolume: 3000000000000,
    };
    render(<MarketBreadthPanel data={bigVolumeData} />);
    expect(screen.getByText(/5.0万亿/)).toBeTruthy();
  });

  it('不传onRefresh时不显示刷新按钮', () => {
    render(<MarketBreadthPanel data={mockBreadthData} />);
    expect(screen.queryByText('刷新')).toBeNull();
  });
});
