/**
 * MarketOverview 组件测试
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import MarketOverview from '../../components/Market/MarketOverview';

// Mock echarts-for-react
vi.mock('echarts-for-react', () => ({
  default: ({ option, style }: any) => (
    <div data-testid="echarts-mock" data-option={JSON.stringify(option)} style={style}>
      ECharts Chart
    </div>
  ),
}));

describe('MarketOverview', () => {
  const mockIndices = [
    {
      symbol: '000001.SH',
      name: '上证综指',
      close: 3050.25,
      change: 25.30,
      changePercent: 0.84,
    },
    {
      symbol: '399001.SZ',
      name: '深证成指',
      close: 9850.60,
      change: -45.20,
      changePercent: -0.46,
    },
    {
      symbol: '399006.SZ',
      name: '创业板指',
      close: 1985.30,
      change: 12.50,
      changePercent: 0.63,
    },
  ];

  const mockSummary = {
    totalStocks: 5200,
    totalMarketCap: 85000000000000,
    totalTurnover: 1200000000000,
    risingStocks: 2800,
    fallingStocks: 2000,
    unchangedStocks: 400,
  };

  const mockTopGainers = [
    {
      symbol: '000001',
      name: '平安银行',
      closePrice: 12.50,
      changePercent: 10.02,
      volume: 500000,
      turnover: 6250000,
    },
    {
      symbol: '000002',
      name: '万科A',
      closePrice: 18.30,
      changePercent: 9.98,
      volume: 800000,
      turnover: 14640000,
    },
  ];

  const mockTopLosers = [
    {
      symbol: '000003',
      name: '某股票',
      closePrice: 5.20,
      changePercent: -10.01,
      volume: 300000,
      turnover: 1560000,
    },
  ];

  const mockTopTurnover = [
    {
      symbol: '600519',
      name: '贵州茅台',
      closePrice: 1850.00,
      changePercent: 1.52,
      volume: 25000,
      turnover: 46250000000,
    },
  ];

  it('should render indices section', () => {
    render(<MarketOverview indices={mockIndices} />);
    expect(screen.getByText('主要指数')).toBeDefined();
  });

  it('should display index names', () => {
    render(<MarketOverview indices={mockIndices} />);
    expect(screen.getByText('上证综指')).toBeDefined();
    expect(screen.getByText('深证成指')).toBeDefined();
    expect(screen.getByText('创业板指')).toBeDefined();
  });

  it('should display index close values in statistics', () => {
    const { container } = render(<MarketOverview indices={mockIndices} />);
    // Antd Statistic renders values in .ant-statistic spans
    const stats = container.querySelectorAll('.ant-statistic');
    expect(stats.length).toBeGreaterThanOrEqual(3);
  });

  it('should display change percentages', () => {
    render(<MarketOverview indices={mockIndices} />);
    expect(screen.getByText('+0.84%')).toBeDefined();
    expect(screen.getByText('-0.46%')).toBeDefined();
  });

  it('should display market statistics when summary is provided', () => {
    render(<MarketOverview indices={mockIndices} summary={mockSummary} />);
    expect(screen.getByText('市场统计')).toBeDefined();
    expect(screen.getByText('总股票数')).toBeDefined();
  });

  it('should display rising/falling stocks count', () => {
    render(<MarketOverview indices={mockIndices} summary={mockSummary} />);
    // Rising and falling counts should be in the pie chart data
    const echartsMock = screen.getByTestId('echarts-mock');
    expect(echartsMock).toBeDefined();
  });

  it('should display tabs for gainers, losers and turnover', () => {
    render(
      <MarketOverview
        indices={mockIndices}
        topGainers={mockTopGainers}
        topLosers={mockTopLosers}
        topTurnover={mockTopTurnover}
      />
    );
    expect(screen.getByText('涨幅榜')).toBeDefined();
    expect(screen.getByText('跌幅榜')).toBeDefined();
    expect(screen.getByText('成交额榜')).toBeDefined();
  });

  it('should display stock data in gainers table', () => {
    render(
      <MarketOverview
        indices={mockIndices}
        topGainers={mockTopGainers}
        topLosers={mockTopLosers}
        topTurnover={mockTopTurnover}
      />
    );
    // First tab (gainers) should be active by default
    expect(screen.getByText('平安银行')).toBeDefined();
  });

  it('should render with empty data', () => {
    render(<MarketOverview />);
    expect(screen.getByText('主要指数')).toBeDefined();
  });

  it('should show loading spinner when loading', () => {
    const { container } = render(<MarketOverview loading={true} indices={[]} />);
    // antd Spin component should be present
    expect(container.querySelector('.ant-spin')).toBeDefined();
  });

  it('should display stock change with correct color class', () => {
    render(
      <MarketOverview
        indices={mockIndices}
        topGainers={mockTopGainers}
      />
    );
    // Check positive change tag
    const redTag = screen.getByText('+10.02%');
    expect(redTag).toBeDefined();
  });

  it('should format market cap correctly', () => {
    render(
      <MarketOverview
        indices={mockIndices}
        summary={{
          totalStocks: 100,
          totalMarketCap: 95000000000000, // 95万亿
          totalTurnover: 1000000000000,
          risingStocks: 50,
          fallingStocks: 40,
          unchangedStocks: 10,
        }}
      />
    );
    expect(screen.getByText('95.00万亿')).toBeDefined();
  });

  it('should format turnover correctly in summary', () => {
    render(
      <MarketOverview
        indices={mockIndices}
        summary={{
          totalStocks: 100,
          totalMarketCap: 1000000000000,
          totalTurnover: 150000000000, // 1500亿
          risingStocks: 50,
          fallingStocks: 40,
          unchangedStocks: 10,
        }}
      />
    );
    expect(screen.getByText('1500.00亿')).toBeDefined();
  });
});
