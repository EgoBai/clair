/**
 * EmptyStates 组件测试
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import {
  EmptyState,
  EmptySearch,
  EmptyStocks,
  EmptyWatchlist,
  EmptyAlerts,
  EmptyScreener,
  EmptyChart,
  EmptyBacktest,
  EmptyPortfolio,
  ErrorState,
  DisconnectedState,
  LoadingState,
  PermissionDeniedState,
} from '../components/Common/EmptyStates';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

describe('EmptyStates', () => {
  it('EmptyState 渲染标题和描述', () => {
    render(
      <EmptyState
        title="暂无数据"
        description="请稍后再试"
      />
    );
    // Ant Design Typography 渲染嵌套元素，用 container.textContent 检查
    expect(document.body.textContent).toContain('暂无数据');
    expect(document.body.textContent).toContain('请稍后再试');
  });

  it('EmptyState 渲染图标', () => {
    render(
      <EmptyState
        icon={<span data-testid="icon">📊</span>}
        title="暂无数据"
      />
    );
    expect(screen.getByTestId('icon')).toBeDefined();
  });

  it('EmptyState 渲染操作按钮', () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        title="暂无数据"
        action={{ text: '刷新', onClick }}
      />
    );
    // Ant Design 按钮文本可能有空格
    const text = document.body.textContent?.replace(/\s+/g, '');
    expect(text).toContain('刷新');
  });

  it('EmptyState 渲染次要操作按钮', () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        title="暂无数据"
        action={{ text: '主操作', onClick }}
        secondaryAction={{ text: '次要操作', onClick }}
      />
    );
    expect(document.body.textContent).toContain('主操作');
    expect(document.body.textContent).toContain('次要操作');
  });

  it('EmptySearch 渲染搜索提示', () => {
    render(<EmptySearch />);
    expect(document.body.textContent).toContain('搜索股票代码或名称');
  });

  it('EmptySearch 带查询词显示提示', () => {
    render(<EmptySearch query="ABC" />);
    expect(document.body.textContent).toContain('ABC');
  });

  it('EmptyWatchlist 渲染', () => {
    render(<EmptyWatchlist />);
    expect(document.body.textContent).toContain('自选股');
  });

  it('EmptyStocks 渲染', () => {
    render(<EmptyStocks />);
    expect(document.body.textContent).toContain('暂无股票数据');
  });

  it('EmptyAlerts 渲染', () => {
    render(<EmptyAlerts />);
    expect(document.body.textContent).toContain('暂无预警规则');
  });

  it('EmptyBacktest 渲染', () => {
    render(<EmptyBacktest />);
    expect(document.body.textContent).toContain('回测');
  });

  it('EmptyPortfolio 渲染', () => {
    render(<EmptyPortfolio />);
    expect(document.body.textContent).toContain('投资组合');
  });

  it('EmptyScreener 渲染', () => {
    render(<EmptyScreener />);
    expect(document.body.textContent).toContain('开始筛选');
  });

  it('EmptyChart 渲染', () => {
    render(<EmptyChart />);
    expect(document.body.textContent).toContain('暂无图表数据');
  });

  it('ErrorState 渲染错误信息', () => {
    render(<ErrorState error="网络连接失败" />);
    // ErrorState 没有 error prop，使用 title 和 description
    expect(document.body.textContent).toContain('出了点问题');
  });

  it('ErrorState 自定义标题', () => {
    render(<ErrorState title="发生错误" description="请检查网络" />);
    expect(document.body.textContent).toContain('发生错误');
    expect(document.body.textContent).toContain('请检查网络');
  });

  it('DisconnectedState 渲染', () => {
    render(<DisconnectedState />);
    expect(document.body.textContent).toContain('网络连接已断开');
  });

  it('LoadingState 渲染', () => {
    render(<LoadingState />);
    expect(document.body.textContent).toContain('加载中');
  });

  it('PermissionDeniedState 渲染', () => {
    render(<PermissionDeniedState />);
    expect(document.body.textContent).toContain('需要登录');
  });
});
