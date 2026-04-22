/**
 * Pagination 组件测试
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import Pagination from '../../components/Pagination';

describe('Pagination', () => {
  const mockOnPageChange = vi.fn();

  beforeEach(() => {
    mockOnPageChange.mockClear();
  });

  it('renders nothing when totalPages <= 1', () => {
    const { container } = render(
      <Pagination currentPage={1} totalPages={1} onPageChange={mockOnPageChange} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders page numbers correctly for small total', () => {
    render(
      <Pagination currentPage={1} totalPages={3} onPageChange={mockOnPageChange} />
    );
    expect(screen.getByText('1')).toBeDefined();
    expect(screen.getByText('2')).toBeDefined();
    expect(screen.getByText('3')).toBeDefined();
  });

  it('highlights current page with active class', () => {
    render(
      <Pagination currentPage={2} totalPages={5} onPageChange={mockOnPageChange} />
    );
    const activeBtn = screen.getByText('2');
    expect(activeBtn.className).toContain('active');
  });

  it('disables prev button on first page', () => {
    render(
      <Pagination currentPage={1} totalPages={5} onPageChange={mockOnPageChange} />
    );
    const prevBtn = screen.getByText('上一页');
    expect(prevBtn).toHaveProperty('disabled', true);
  });

  it('disables next button on last page', () => {
    render(
      <Pagination currentPage={5} totalPages={5} onPageChange={mockOnPageChange} />
    );
    const nextBtn = screen.getByText('下一页');
    expect(nextBtn).toHaveProperty('disabled', true);
  });

  it('calls onPageChange when clicking a page number', () => {
    render(
      <Pagination currentPage={1} totalPages={5} onPageChange={mockOnPageChange} />
    );
    fireEvent.click(screen.getByText('3'));
    expect(mockOnPageChange).toHaveBeenCalledWith(3);
  });

  it('calls onPageChange with prev page on 上一页 click', () => {
    render(
      <Pagination currentPage={3} totalPages={5} onPageChange={mockOnPageChange} />
    );
    fireEvent.click(screen.getByText('上一页'));
    expect(mockOnPageChange).toHaveBeenCalledWith(2);
  });

  it('calls onPageChange with next page on 下一页 click', () => {
    render(
      <Pagination currentPage={3} totalPages={5} onPageChange={mockOnPageChange} />
    );
    fireEvent.click(screen.getByText('下一页'));
    expect(mockOnPageChange).toHaveBeenCalledWith(4);
  });

  it('limits visible page numbers to 5 for large page counts', () => {
    render(
      <Pagination currentPage={1} totalPages={100} onPageChange={mockOnPageChange} />
    );
    const pageButtons = screen.getAllByText(/^\d+$/);
    expect(pageButtons.length).toBeLessThanOrEqual(5);
  });

  it('shows surrounding pages when current is in middle', () => {
    render(
      <Pagination currentPage={50} totalPages={100} onPageChange={mockOnPageChange} />
    );
    expect(screen.getByText('48')).toBeDefined();
    expect(screen.getByText('49')).toBeDefined();
    expect(screen.getByText('50')).toBeDefined();
    expect(screen.getByText('51')).toBeDefined();
    expect(screen.getByText('52')).toBeDefined();
  });

  it('shows last 5 pages when current is near end', () => {
    render(
      <Pagination currentPage={98} totalPages={100} onPageChange={mockOnPageChange} />
    );
    expect(screen.getByText('96')).toBeDefined();
    expect(screen.getByText('97')).toBeDefined();
    expect(screen.getByText('98')).toBeDefined();
    expect(screen.getByText('99')).toBeDefined();
    expect(screen.getByText('100')).toBeDefined();
  });

  it('displays page info text', () => {
    render(
      <Pagination currentPage={3} totalPages={10} onPageChange={mockOnPageChange} />
    );
    expect(screen.getByText(/第 3 页/)).toBeDefined();
    expect(screen.getByText(/共 10 页/)).toBeDefined();
  });
});
