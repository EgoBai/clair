/**
 * Pagination 组件测试
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import Pagination from '../components/Pagination';

describe('Pagination', () => {
  it('总页数<=1时不渲染', () => {
    const { container } = render(
      <Pagination currentPage={1} totalPages={1} onPageChange={vi.fn()} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('总页数为0时不渲染', () => {
    const { container } = render(
      <Pagination currentPage={1} totalPages={0} onPageChange={vi.fn()} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('渲染分页按钮', () => {
    render(<Pagination currentPage={1} totalPages={5} onPageChange={vi.fn()} />);
    expect(screen.getByText('上一页')).toBeDefined();
    expect(screen.getByText('1')).toBeDefined();
    expect(screen.getByText('5')).toBeDefined();
  });

  it('第一页时禁用上一页按钮', () => {
    render(<Pagination currentPage={1} totalPages={5} onPageChange={vi.fn()} />);
    const prevBtn = screen.getByText('上一页') as HTMLButtonElement;
    expect(prevBtn.disabled).toBe(true);
  });

  it('点击页码触发回调', () => {
    const onPageChange = vi.fn();
    render(<Pagination currentPage={1} totalPages={5} onPageChange={onPageChange} />);
    screen.getByText('3').click();
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it('点击上一页触发回调', () => {
    const onPageChange = vi.fn();
    render(<Pagination currentPage={3} totalPages={5} onPageChange={onPageChange} />);
    screen.getByText('上一页').click();
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('当前页高亮', () => {
    render(<Pagination currentPage={3} totalPages={5} onPageChange={vi.fn()} />);
    const activeBtn = screen.getByText('3');
    expect(activeBtn.className).toContain('active');
  });

  it('大量页码时只显示部分', () => {
    render(<Pagination currentPage={5} totalPages={20} onPageChange={vi.fn()} />);
    // 应显示当前页附近的5个页码
    expect(screen.getByText('3')).toBeDefined();
    expect(screen.getByText('7')).toBeDefined();
  });

  it('最后几页显示最后5页', () => {
    render(<Pagination currentPage={19} totalPages={20} onPageChange={vi.fn()} />);
    expect(screen.getByText('16')).toBeDefined();
    expect(screen.getByText('20')).toBeDefined();
  });
});
