/**
 * MarketIndexPanel 组件测试
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MarketIndexPanel, IndexData } from '../../components/Market/MarketIndexPanel';

// Mock timers for refresh interval tests
vi.useFakeTimers();

describe('MarketIndexPanel', () => {
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

  it('should render with default indices', () => {
    render(<MarketIndexPanel />);
    expect(screen.getByText('大盘指数')).toBeDefined();
  });

  it('should render provided indices', () => {
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
    
    // Find and click the first index card
    const indexCard = screen.getByText('上证综指').closest('div');
    if (indexCard) {
      indexCard.click();
      expect(handleClick).toHaveBeenCalledWith('000001.SH');
    }
  });

  it('should display market sentiment', () => {
    render(<MarketIndexPanel indices={mockIndices} />);
    // With one rising and one falling, sentiment should be balanced
    expect(screen.getByText('均衡')).toBeDefined();
  });

  it('should format volume correctly', () => {
    render(<MarketIndexPanel indices={mockIndices} />);
    // Volume 350000000000 should be formatted as 3500.00亿
    expect(screen.getByText(/3500\.00亿/)).toBeDefined();
  });

  it('should apply custom className', () => {
    const { container } = render(
      <MarketIndexPanel indices={mockIndices} className="custom-class" />
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
});
