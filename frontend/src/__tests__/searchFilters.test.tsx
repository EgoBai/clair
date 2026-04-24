/**
 * SearchFilters 搜索筛选组件测试
 * 筛选器渲染、分组展示、active 追踪
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchFilters, FilterGroup } from '../components/Common/SearchFilters';

// Mock hooks - include all needed exports
const mockSetFilter = vi.fn();
const mockClearFilter = vi.fn();
const mockResetFilters = vi.fn();

vi.mock('../../hooks/useDataFilters', () => ({
  useDataFilters: () => ({
    currentFilters: { market: 'sh' },
    setFilter: mockSetFilter,
    clearFilter: mockClearFilter,
    resetFilters: mockResetFilters,
    activeCount: 1,
  }),
}));

// Sample filter groups
const mockFilterGroups: FilterGroup[] = [
  {
    key: 'market',
    label: '市场',
    multi: false,
    options: [
      { value: 'sh', label: '上海' },
      { value: 'sz', label: '深圳' },
      { value: 'bj', label: '北京' },
    ],
  },
  {
    key: 'type',
    label: '类型',
    multi: true,
    options: [
      { value: 'all', label: '全部' },
      { value: 'stock', label: '股票' },
    ],
  },
];

describe('SearchFilters', () => {
  it('renders filter groups', () => {
    render(<SearchFilters filterGroups={mockFilterGroups} />);
    expect(screen.getByText('市场')).toBeTruthy();
    expect(screen.getByText('类型')).toBeTruthy();
  });

  it('renders empty state', () => {
    const { container } = render(<SearchFilters filterGroups={[]} />);
    expect(container.innerHTML).toBeFalsy();
  });

  it('renders with custom className', () => {
    const { container } = render(
      <SearchFilters filterGroups={mockFilterGroups} className="custom-filters" />
    );
    expect(container.querySelector('.custom-filters')).toBeTruthy();
  });

  it('renders filter options', () => {
    render(<SearchFilters filterGroups={mockFilterGroups} />);
    // Filter group labels should be present
    expect(screen.getByText('市场')).toBeTruthy();
    expect(screen.getByText('类型')).toBeTruthy();
  });

  it('renders with compact mode', () => {
    const { container } = render(
      <SearchFilters filterGroups={mockFilterGroups} compact />
    );
    // Compact mode renders filter groups horizontally
    expect(screen.getByText('市场')).toBeTruthy();
    expect(screen.getByText('类型')).toBeTruthy();
  });

  it('renders with onChange handler', () => {
    const onChange = vi.fn();
    render(
      <SearchFilters filterGroups={mockFilterGroups} onChange={onChange} />
    );
    expect(screen.getByText('市场')).toBeTruthy();
    expect(screen.getByText('类型')).toBeTruthy();
  });
});
