/**
 * MarketSentiment 组件测试
 * @vitest-environment jsdom
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MarketSentiment from '../../components/Market/MarketSentiment';

describe('MarketSentiment', () => {
  const defaultProps = {
    riseCount: 2800,
    fallCount: 1800,
    flatCount: 400,
    limitUp: 45,
    limitDown: 12,
    totalTurnover: 1200000000000,
    avgChangePercent: 1.25,
  };

  it('should render the sentiment card', () => {
    render(<MarketSentiment {...defaultProps} />);
    expect(screen.getByText('市场情绪')).toBeDefined();
  });

  it('should display sentiment score', () => {
    render(<MarketSentiment {...defaultProps} />);
    // Score should be calculated and displayed
    const scoreElements = screen.getAllByText(/\d+/);
    expect(scoreElements.length).toBeGreaterThan(0);
  });

  it('should display limit up count', () => {
    render(<MarketSentiment {...defaultProps} />);
    expect(screen.getByText('涨停')).toBeDefined();
    expect(screen.getByText('45')).toBeDefined();
  });

  it('should display limit down count', () => {
    render(<MarketSentiment {...defaultProps} />);
    expect(screen.getByText('跌停')).toBeDefined();
    expect(screen.getByText('12')).toBeDefined();
  });

  it('should display turnover', () => {
    render(<MarketSentiment {...defaultProps} />);
    expect(screen.getByText('成交额')).toBeDefined();
    // 1.2万亿
    expect(screen.getByText('1.20万亿')).toBeDefined();
  });

  it('should display average change percentage', () => {
    render(<MarketSentiment {...defaultProps} />);
    expect(screen.getByText('平均涨跌')).toBeDefined();
    expect(screen.getByText('+1.25%')).toBeDefined();
  });

  it('should display negative average change correctly', () => {
    render(<MarketSentiment {...defaultProps} avgChangePercent={-0.75} />);
    expect(screen.getByText('-0.75%')).toBeDefined();
  });

  it('should display rise and fall counts', () => {
    render(<MarketSentiment {...defaultProps} />);
    // The counts should appear in the distribution area
    const riseText = screen.getAllByText(/2800/);
    expect(riseText.length).toBeGreaterThan(0);
  });

  it('should display fall count', () => {
    render(<MarketSentiment {...defaultProps} />);
    const fallText = screen.getAllByText(/1800/);
    expect(fallText.length).toBeGreaterThan(0);
  });

  it('should display total stock count', () => {
    render(<MarketSentiment {...defaultProps} />);
    const totalText = screen.getAllByText(/5000/);
    expect(totalText.length).toBeGreaterThan(0);
  });

  it('should handle extreme bullish sentiment', () => {
    render(
      <MarketSentiment
        riseCount={4500}
        fallCount={300}
        flatCount={200}
        limitUp={200}
        limitDown={2}
        totalTurnover={2000000000000}
        avgChangePercent={5.0}
      />
    );
    expect(screen.getByText('极度乐观')).toBeDefined();
  });

  it('should handle extreme bearish sentiment', () => {
    render(
      <MarketSentiment
        riseCount={300}
        fallCount={4500}
        flatCount={200}
        limitUp={2}
        limitDown={200}
        totalTurnover={800000000000}
        avgChangePercent={-5.0}
      />
    );
    expect(screen.getByText('极度悲观')).toBeDefined();
  });

  it('should handle neutral sentiment', () => {
    render(
      <MarketSentiment
        riseCount={2500}
        fallCount={2500}
        flatCount={0}
        limitUp={10}
        limitDown={10}
        totalTurnover={1000000000000}
        avgChangePercent={0}
      />
    );
    // Should be around neutral
    expect(screen.getByText('市场情绪')).toBeDefined();
  });

  it('should handle zero stocks edge case', () => {
    render(
      <MarketSentiment
        riseCount={0}
        fallCount={0}
        flatCount={0}
        limitUp={0}
        limitDown={0}
        totalTurnover={0}
        avgChangePercent={0}
      />
    );
    expect(screen.getByText('市场情绪')).toBeDefined();
  });

  it('should handle flatCount default value', () => {
    render(
      <MarketSentiment
        riseCount={1000}
        fallCount={1000}
        flatCount={0}
        limitUp={5}
        limitDown={5}
        totalTurnover={500000000000}
        avgChangePercent={0.1}
      />
    );
    expect(screen.getByText('市场情绪')).toBeDefined();
  });
});
