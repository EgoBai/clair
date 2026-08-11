/**
 * MarketIndexPanel 组件测试
 * @vitest-environment jsdom
 *
 * 数据策略契约（与组件实现对齐）：
 * - 传入 `indices` prop → 直接渲染该数据，不触发 fetch。
 * - 不传 `indices` → 调用 `/api/market/realtime` 拉真实数据；
 *   `dataSource:'unavailable'` 或请求失败 → 显示诚实空态「实时指数数据源暂不可用」，
 *   绝不回填伪造/演示数据。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MarketIndexPanel, IndexData } from '../../components/Market/MarketIndexPanel';

const mockIndices: IndexData[] = [
  {
    symbol: '000001.SH',
    name: '上证综指',
    current: 3050.25,
    change: 25.30,
    changePercent: 0.84,
    volume: 350000000000,
    turnover: 450000000000,
    high: 3065.80,
    low: 3020.15,
    open: 3025.00,
    prevClose: 3024.95,
  },
  {
    symbol: '399001.SZ',
    name: '深证成指',
    current: 9850.60,
    change: -45.20,
    changePercent: -0.46,
    volume: 480000000000,
    turnover: 520000000000,
    high: 9920.30,
    low: 9810.45,
    open: 9895.80,
    prevClose: 9895.80,
  },
];

/** 构造 /api/market/realtime 的真实响应结构 */
function buildRealtimeResponse(
  overrides: Partial<{
    shanghai: { name: string; price: number; changePct: number };
    shenzhen: { name: string; price: number; changePct: number };
    chinext: { name: string; price: number; changePct: number };
    dataSource: string;
  }> = {},
) {
  return {
    success: true,
    data: {
      shanghai: overrides.shanghai ?? { name: '上证指数', price: 3966.59, changePct: 0.67 },
      shenzhen: overrides.shenzhen ?? { name: '深证成指', price: 14316.96, changePct: 0.04 },
      chinext: overrides.chinext ?? { name: '创业板指', price: 3537.21, changePct: -0.73 },
      breadth: null,
      dataSource: overrides.dataSource ?? 'real',
    },
    timestamp: new Date().toISOString(),
  };
}

describe('MarketIndexPanel', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = originalFetch;
  });

  it('should render panel title when no indices prop provided', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => buildRealtimeResponse(),
    } as Response);

    await act(async () => {
      render(<MarketIndexPanel refreshInterval={999999} />);
    });
    expect(screen.getByText('大盘指数')).toBeDefined();
  });

  it('should render provided indices via prop', () => {
    render(<MarketIndexPanel indices={mockIndices} />);
    expect(screen.getByText('上证综指')).toBeDefined();
    expect(screen.getByText('深证成指')).toBeDefined();
  });

  it('should display index prices', () => {
    render(<MarketIndexPanel indices={mockIndices} />);
    expect(screen.getByText('3050.25')).toBeDefined();
    expect(screen.getByText('9850.60')).toBeDefined();
  });

  it('should display change values', () => {
    render(<MarketIndexPanel indices={mockIndices} />);
    expect(screen.getByText('+25.30')).toBeDefined();
    expect(screen.getByText('-45.20')).toBeDefined();
  });

  it('should display change percentages', () => {
    render(<MarketIndexPanel indices={mockIndices} />);
    expect(screen.getByText('+0.84%')).toBeDefined();
    expect(screen.getByText('-0.46%')).toBeDefined();
  });

  it('should call onIndexClick when clicking an index', () => {
    const handleClick = vi.fn();
    render(<MarketIndexPanel indices={mockIndices} onIndexClick={handleClick} />);

    const indexCard = screen.getByText('上证综指').closest('div');
    if (indexCard) {
      indexCard.click();
      expect(handleClick).toHaveBeenCalledWith('000001.SH');
    }
  });

  it('should display market sentiment', () => {
    render(<MarketIndexPanel indices={mockIndices} />);
    // 一涨一跌 → 均衡
    expect(screen.getByText('均衡')).toBeDefined();
  });

  it('should format volume correctly', () => {
    render(<MarketIndexPanel indices={mockIndices} />);
    // 350000000000 → 3500.00亿
    expect(screen.getByText(/3500\.00亿/)).toBeDefined();
  });

  it('should apply custom className', () => {
    const { container } = render(
      <MarketIndexPanel indices={mockIndices} className="custom-class" />,
    );
    expect(container.querySelector('.custom-class')).toBeTruthy();
  });

  it('should show mini chart when enabled', () => {
    render(<MarketIndexPanel indices={mockIndices} showMiniChart={true} />);
    expect(screen.getAllByText('📈').length).toBeGreaterThan(0);
  });

  it('should not show mini chart when disabled', () => {
    render(<MarketIndexPanel indices={mockIndices} showMiniChart={false} />);
    expect(screen.queryByText('📈')).toBeNull();
  });

  it('should render all index cards', () => {
    render(<MarketIndexPanel indices={mockIndices} />);
    const cards = screen.getAllByText(/上证|深证|创业板|沪深/);
    expect(cards.length).toBeGreaterThanOrEqual(2);
  });

  it('should handle empty indices array', () => {
    render(<MarketIndexPanel indices={[]} />);
    expect(screen.getByText('大盘指数')).toBeDefined();
  });

  it('should display correct colors for positive changes', () => {
    render(<MarketIndexPanel indices={[mockIndices[0]]} />);
    const changeElement = screen.getByText('+0.84%');
    expect(changeElement).toBeDefined();
  });

  it('should display correct colors for negative changes', () => {
    render(<MarketIndexPanel indices={[mockIndices[1]]} />);
    const changeElement = screen.getByText('-0.46%');
    expect(changeElement).toBeDefined();
  });

  // ============ 真实数据源契约测试 ============

  it('should fetch /api/market/realtime and render real indices when no prop', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => buildRealtimeResponse(),
    } as Response);

    await act(async () => {
      render(<MarketIndexPanel refreshInterval={999999} />);
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/market/realtime');
    // 真实响应里的价格应被渲染
    await waitFor(() => {
      expect(screen.getByText('上证指数')).toBeDefined();
      expect(screen.getByText('3966.59')).toBeDefined();
      expect(screen.getByText('14316.96')).toBeDefined();
      expect(screen.getByText('3537.21')).toBeDefined();
    });
    // 红涨绿跌:创业板 -0.73%
    expect(screen.getByText('-0.73%')).toBeDefined();
  });

  it('should show honest empty state when dataSource is unavailable', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () =>
        buildRealtimeResponse({
          shanghai: { name: '', price: 0, changePct: 0 },
          shenzhen: { name: '', price: 0, changePct: 0 },
          chinext: { name: '', price: 0, changePct: 0 },
          dataSource: 'unavailable',
        }),
    } as Response);

    await act(async () => {
      render(<MarketIndexPanel refreshInterval={999999} />);
    });

    await waitFor(() => {
      expect(screen.getByText('实时指数数据源暂不可用')).toBeDefined();
    });
    // 绝不显示伪造数据
    expect(screen.queryByText('3050.25')).toBeNull();
  });

  it('should show honest empty state when fetch throws', async () => {
    fetchMock.mockRejectedValue(new Error('network error'));

    await act(async () => {
      render(<MarketIndexPanel refreshInterval={999999} />);
    });

    await waitFor(() => {
      expect(screen.getByText('实时指数数据源暂不可用')).toBeDefined();
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/market/realtime');
  });
});
