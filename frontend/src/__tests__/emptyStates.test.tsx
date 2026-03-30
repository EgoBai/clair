// @vitest-environment jsdom
/**
 * 空状态组件 + 错误边界 测试
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  BrowserRouter: ({ children }: any) => children,
  Routes: ({ children }: any) => children,
  Route: ({ children }: any) => children,
  useLocation: () => ({ pathname: '/' }),
}));

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
  EmptyNews,
  LoadingState,
  ErrorState,
  DisconnectedState,
  EmptyScreenerResult,
  EmptySocial,
  PermissionDeniedState,
} from '../components/Common/EmptyStates';
import ErrorBoundary from '../components/Common/EnhancedErrorBoundary';

// ==================== 空状态组件测试 ====================

describe('EmptyState', () => {
  it('渲染标题', () => {
    render(<EmptyState title="测试标题" />);
    expect(screen.getByText('测试标题')).toBeTruthy();
  });

  it('渲染描述', () => {
    render(<EmptyState title="标题" description="描述文本" />);
    expect(screen.getByText('描述文本')).toBeTruthy();
  });

  it('渲染操作按钮', () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        title="标题"
        action={{ text: '点击我', onClick }}
      />
    );
    const btn = screen.getByText('点击我');
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalled();
  });

  it('渲染次要操作按钮', () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        title="标题"
        secondaryAction={{ text: '次要操作', onClick }}
      />
    );
    const btn = screen.getByText('次要操作');
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalled();
  });
});

describe('预设空状态组件', () => {
  it('EmptySearch 无查询词时显示默认文本', () => {
    render(<EmptySearch />);
    expect(screen.getByText('搜索股票代码或名称')).toBeTruthy();
  });

  it('EmptySearch 有查询词时显示搜索结果', () => {
    render(<EmptySearch query="腾讯" />);
    expect(screen.getByText('未找到 "腾讯" 的相关结果')).toBeTruthy();
  });

  it('EmptyStocks 渲染', () => {
    render(<EmptyStocks />);
    expect(screen.getByText('暂无股票数据')).toBeTruthy();
  });

  it('EmptyWatchlist 渲染', () => {
    render(<EmptyWatchlist />);
    expect(screen.getByText('自选股为空')).toBeTruthy();
  });

  it('EmptyAlerts 渲染', () => {
    render(<EmptyAlerts />);
    expect(screen.getByText('暂无预警规则')).toBeTruthy();
  });

  it('EmptyScreener 渲染', () => {
    render(<EmptyScreener />);
    expect(screen.getByText('开始筛选')).toBeTruthy();
  });

  it('EmptyChart 渲染', () => {
    render(<EmptyChart />);
    expect(screen.getByText('暂无图表数据')).toBeTruthy();
  });

  it('EmptyBacktest 渲染', () => {
    render(<EmptyBacktest />);
    expect(screen.getByText('开始策略回测')).toBeTruthy();
  });

  it('EmptyPortfolio 渲染', () => {
    render(<EmptyPortfolio />);
    expect(screen.getByText('投资组合为空')).toBeTruthy();
  });

  it('EmptyNews 渲染', () => {
    render(<EmptyNews />);
    expect(screen.getByText('暂无新闻资讯')).toBeTruthy();
  });

  it('EmptyScreenerResult 渲染', () => {
    render(<EmptyScreenerResult />);
    expect(screen.getByText('未找到匹配股票')).toBeTruthy();
  });

  it('EmptySocial 渲染', () => {
    render(<EmptySocial />);
    expect(screen.getByText('暂无讨论内容')).toBeTruthy();
  });
});

describe('状态组件', () => {
  it('LoadingState 默认文案', () => {
    render(<LoadingState />);
    expect(screen.getByText('加载中')).toBeTruthy();
    expect(screen.getByText('数据正在加载，请稍候...')).toBeTruthy();
  });

  it('LoadingState 自定义文案', () => {
    render(<LoadingState title="请稍候" description="正在获取数据" />);
    expect(screen.getByText('请稍候')).toBeTruthy();
    expect(screen.getByText('正在获取数据')).toBeTruthy();
  });

  it('ErrorState 渲染', () => {
    render(<ErrorState />);
    expect(screen.getByText('出了点问题')).toBeTruthy();
  });

  it('ErrorState 带重试按钮', () => {
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} />);
    const btn = screen.getByRole('button', { name: /重\s*试/ });
    fireEvent.click(btn);
    expect(onRetry).toHaveBeenCalled();
  });

  it('DisconnectedState 渲染', () => {
    render(<DisconnectedState />);
    expect(screen.getByText('网络连接已断开')).toBeTruthy();
  });

  it('DisconnectedState 带重连按钮', () => {
    const onReconnect = vi.fn();
    render(<DisconnectedState onReconnect={onReconnect} />);
    const btn = screen.getByText('重新连接');
    fireEvent.click(btn);
    expect(onReconnect).toHaveBeenCalled();
  });

  it('PermissionDeniedState 渲染', () => {
    render(<PermissionDeniedState />);
    expect(screen.getByText('需要登录')).toBeTruthy();
  });

  it('PermissionDeniedState 带登录按钮', () => {
    const onLogin = vi.fn();
    render(<PermissionDeniedState onLogin={onLogin} />);
    const btn = screen.getByText('立即登录');
    fireEvent.click(btn);
    expect(onLogin).toHaveBeenCalled();
  });
});

// ==================== 错误边界测试 ====================

describe('ErrorBoundary', () => {
  // 抑制 console.error
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('正常渲染子组件', () => {
    render(
      <ErrorBoundary>
        <div>正常内容</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('正常内容')).toBeTruthy();
  });

  it('捕获渲染错误并显示错误UI', () => {
    const ThrowError = () => { throw new Error('测试错误'); };

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText('组件渲染出错')).toBeTruthy();
    expect(screen.getByText(/测试错误/)).toBeTruthy();
  });

  it('自定义 fallback 组件', () => {
    const ThrowError = () => { throw new Error('测试错误'); };

    render(
      <ErrorBoundary fallback={<div>自定义错误页面</div>}>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText('自定义错误页面')).toBeTruthy();
  });

  it('自定义 fallback 函数', () => {
    const ThrowError = () => { throw new Error('测试错误'); };

    render(
      <ErrorBoundary fallback={(error, retry) => (
        <div>
          <span>错误: {error.message}</span>
          <button onClick={retry}>重试</button>
        </div>
      )}>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText('错误: 测试错误')).toBeTruthy();
    expect(screen.getByText('重试')).toBeTruthy();
  });

  it('重试按钮可用', () => {
    let shouldThrow = true;
    const MaybeThrow = () => {
      if (shouldThrow) throw new Error('测试错误');
      return <div>恢复成功</div>;
    };

    render(
      <ErrorBoundary>
        <MaybeThrow />
      </ErrorBoundary>
    );

    // 看到错误 UI
    expect(screen.getByText('组件渲染出错')).toBeTruthy();

    // 点击重试
    shouldThrow = false;
    fireEvent.click(screen.getByText(/重试/));
    expect(screen.getByText('恢复成功')).toBeTruthy();
  });

  it('调用 onError 回调', () => {
    const onError = vi.fn();
    const ThrowError = () => { throw new Error('测试错误'); };

    render(
      <ErrorBoundary onError={onError}>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(onError).toHaveBeenCalled();
  });

  it('超过最大重试次数后隐藏重试按钮', () => {
    const ThrowError = () => { throw new Error('总是出错'); };

    render(
      <ErrorBoundary maxRetries={1}>
        <ThrowError />
      </ErrorBoundary>
    );

    // 第一次看到重试按钮
    const retryBtn = screen.getByText(/重试/);
    fireEvent.click(retryBtn);

    // 第二次出错后，重试次数用完
    expect(screen.queryByText(/重试/)).toBeNull();
  });

  it('返回首页按钮可用', () => {
    const ThrowError = () => { throw new Error('测试错误'); };

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText('返回首页')).toBeTruthy();
  });
});
