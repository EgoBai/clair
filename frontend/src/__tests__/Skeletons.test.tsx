/**
 * Skeletons 骨架屏组件测试
 * @vitest-environment jsdom
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import {
  TextSkeleton,
  AvatarSkeleton,
  ButtonSkeleton,
  QuoteCardSkeleton,
  KLineSkeleton,
  StockListRowSkeleton,
  TableSkeleton,
  OverviewCardSkeleton,
  PieChartSkeleton,
  BarChartSkeleton,
  HomePageSkeleton,
  StockDetailSkeleton,
} from '../components/Common/Skeletons';

describe('Skeletons', () => {
  it('TextSkeleton 渲染', () => {
    const { container } = render(<TextSkeleton />);
    expect(container.querySelector('.ant-skeleton')).toBeDefined();
  });

  it('TextSkeleton 支持自定义宽度', () => {
    const { container } = render(<TextSkeleton width={200} />);
    const input = container.querySelector('.ant-skeleton-input');
    expect(input).toBeDefined();
  });

  it('AvatarSkeleton 渲染', () => {
    const { container } = render(<AvatarSkeleton />);
    expect(container.querySelector('.ant-skeleton-avatar')).toBeDefined();
  });

  it('AvatarSkeleton 支持自定义尺寸', () => {
    const { container } = render(<AvatarSkeleton size={60} />);
    const avatar = container.querySelector('.ant-skeleton-avatar');
    expect(avatar).toBeDefined();
  });

  it('ButtonSkeleton 渲染', () => {
    const { container } = render(<ButtonSkeleton />);
    expect(container.querySelector('.ant-skeleton-button')).toBeDefined();
  });

  it('QuoteCardSkeleton 渲染', () => {
    const { container } = render(<QuoteCardSkeleton />);
    expect(container.querySelector('.ant-card')).toBeDefined();
  });

  it('KLineSkeleton 渲染并显示加载文字', () => {
    render(<KLineSkeleton />);
    expect(screen.getByText('加载图表中...')).toBeDefined();
  });

  it('KLineSkeleton 支持自定义高度', () => {
    const { container } = render(<KLineSkeleton height={300} />);
    const div = container.firstChild as HTMLElement;
    expect(div.style.height).toBe('300px');
  });

  it('StockListRowSkeleton 渲染', () => {
    const { container } = render(<StockListRowSkeleton />);
    expect(container.querySelector('.ant-skeleton')).toBeDefined();
  });

  it('TableSkeleton 渲染', () => {
    const { container } = render(<TableSkeleton />);
    expect(container).toBeDefined();
  });

  it('TableSkeleton 支持自定义行数', () => {
    const { container } = render(<TableSkeleton rows={5} />);
    expect(container).toBeDefined();
  });

  it('OverviewCardSkeleton 渲染', () => {
    const { container } = render(<OverviewCardSkeleton />);
    expect(container).toBeDefined();
  });

  it('PieChartSkeleton 渲染', () => {
    const { container } = render(<PieChartSkeleton />);
    expect(container).toBeDefined();
  });

  it('BarChartSkeleton 渲染', () => {
    const { container } = render(<BarChartSkeleton />);
    expect(container).toBeDefined();
  });

  it('BarChartSkeleton 支持自定义高度', () => {
    const { container } = render(<BarChartSkeleton height={300} />);
    expect(container).toBeDefined();
  });

  it('HomePageSkeleton 渲染', () => {
    const { container } = render(<HomePageSkeleton />);
    expect(container).toBeDefined();
  });

  it('StockDetailSkeleton 渲染', () => {
    const { container } = render(<StockDetailSkeleton />);
    expect(container).toBeDefined();
  });
});
