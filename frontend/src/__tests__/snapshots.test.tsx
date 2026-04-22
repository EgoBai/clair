// @vitest-environment jsdom
/**
 * 组件快照测试
 * 验证关键组件渲染一致性
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';

// Mock API
vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('../services/websocket', () => ({
  wsService: {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    on: vi.fn().mockReturnValue(() => { ),
    onMessage: vi.fn().mockReturnValue(() => { ),
    getConnectionState: vi.fn().mockReturnValue(true),
  },
}));

// matchMedia mock
beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

// 包装器
function renderWithProviders(ui: React.ReactElement) {
  return render(
    <BrowserRouter>
      <ConfigProvider locale={zhCN}>
        {ui}
      </ConfigProvider>
    </BrowserRouter>
  );
}

describe('格式化函数快照', () => {
  it('formatChangePercent 正数', async () => {
    const { formatChangePercent } = await import('../../../shared/formatters');
    expect(formatChangePercent(3.56)).toMatchInlineSnapshot('"+3.56%"');
    expect(formatChangePercent(0)).toMatchInlineSnapshot('"+0.00%"');
    expect(formatChangePercent(-2.34)).toMatchInlineSnapshot('"-2.34%"');
    expect(formatChangePercent(null)).toMatchInlineSnapshot('"-"');
  });

  it('formatMarketCap 各种量级', async () => {
    const { formatMarketCap } = await import('../../../shared/formatters');
    expect(formatMarketCap(1500000000000)).toMatchInlineSnapshot('"1.50万亿"');
    expect(formatMarketCap(800000000)).toMatchInlineSnapshot('"8.00亿"');
    expect(formatMarketCap(50000)).toMatchInlineSnapshot('"5.00万"');
    expect(formatMarketCap(undefined)).toMatchInlineSnapshot('"-"');
  });

  it('formatVolume 各种量级', async () => {
    const { formatVolume } = await import('../../../shared/formatters');
    expect(formatVolume(200000000)).toMatchInlineSnapshot('"2.00亿手"');
    expect(formatVolume(500000)).toMatchInlineSnapshot('"50.00万手"');
    expect(formatVolume(1000)).toMatchInlineSnapshot('"1000手"');
  });

  it('getChangeHexColor', async () => {
    const { getChangeHexColor } = await import('../../../shared/formatters');
    expect(getChangeHexColor(5)).toMatchInlineSnapshot('"#EF4444"');
    expect(getChangeHexColor(-3)).toMatchInlineSnapshot('"#22C55E"');
    expect(getChangeHexColor(0)).toMatchInlineSnapshot('"#6B7280"');
    expect(getChangeHexColor(null)).toMatchInlineSnapshot('"#6B7280"');
  });
});

describe('ErrorBoundary', () => {
  it('应该捕获子组件错误', async () => {
    const ThrowError = () => { throw new Error('测试错误'); };
    const mod = await import('../components/Common/ErrorBoundary');
    const ErrorBoundary = mod.default;

    const spy = vi.spyOn(console, 'error').mockImplementation(() => { );

    const { getByText } = renderWithProviders(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(getByText(/页面渲染异常/)).toBeTruthy();
    spy.mockRestore();
  });
});

describe('空状态组件', () => {
  it('EmptyStocks 应该渲染', async () => {
    const { EmptyStocks } = await import('../components/Common/EmptyStates');
    const { container } = renderWithProviders(<EmptyStocks />);
    expect(container.firstChild).toBeTruthy();
  });

  it('EmptySearch 应该渲染', async () => {
    const { EmptySearch } = await import('../components/Common/EmptyStates');
    const { container } = renderWithProviders(<EmptySearch />);
    expect(container.firstChild).toBeTruthy();
  });

  it('EmptyWatchlist 应该渲染', async () => {
    const { EmptyWatchlist } = await import('../components/Common/EmptyStates');
    const { container } = renderWithProviders(<EmptyWatchlist />);
    expect(container.firstChild).toBeTruthy();
  });
});

describe('骨架屏组件', () => {
  it('QuoteCardSkeleton 应该渲染', async () => {
    const { QuoteCardSkeleton } = await import('../components/Common/Skeletons');
    const { container } = render(<QuoteCardSkeleton />);
    expect(container.firstChild).toBeTruthy();
  });

  it('TableSkeleton 应该渲染', async () => {
    const { TableSkeleton } = await import('../components/Common/Skeletons');
    const { container } = render(<TableSkeleton />);
    expect(container.firstChild).toBeTruthy();
  });

  it('KLineSkeleton 应该渲染', async () => {
    const { KLineSkeleton } = await import('../components/Common/Skeletons');
    const { container } = render(<KLineSkeleton />);
    expect(container.firstChild).toBeTruthy();
  });
});
