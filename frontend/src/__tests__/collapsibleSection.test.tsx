/**
 * CollapsibleSection 组件测试
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { CollapsibleSection } from '../components/Common/CollapsibleSection';

describe('CollapsibleSection', () => {
  it('渲染标题', () => {
    render(
      <CollapsibleSection title="筛选条件">
        <div>子内容</div>
      </CollapsibleSection>
    );
    expect(screen.getByText('筛选条件')).toBeDefined();
  });

  it('默认关闭时不显示内容', () => {
    render(
      <CollapsibleSection title="筛选条件" defaultOpen={false}>
        <div data-testid="content">子内容</div>
      </CollapsibleSection>
    );
    // 内容存在但在折叠状态
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });

  it('默认打开时显示内容', () => {
    render(
      <CollapsibleSection title="筛选条件" defaultOpen={true}>
        <div>子内容</div>
      </CollapsibleSection>
    );
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('aria-expanded')).toBe('true');
  });

  it('点击切换展开/收起', () => {
    render(
      <CollapsibleSection title="筛选条件">
        <div>子内容</div>
      </CollapsibleSection>
    );
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });

  it('触发onToggle回调', () => {
    const onToggle = vi.fn();
    render(
      <CollapsibleSection title="筛选条件" onToggle={onToggle}>
        <div>子内容</div>
      </CollapsibleSection>
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it('显示badge', () => {
    render(
      <CollapsibleSection title="筛选条件" badge={5}>
        <div>子内容</div>
      </CollapsibleSection>
    );
    expect(screen.getByText('5')).toBeDefined();
  });

  it('显示icon', () => {
    render(
      <CollapsibleSection title="筛选条件" icon={<span data-testid="icon">🔍</span>}>
        <div>子内容</div>
      </CollapsibleSection>
    );
    expect(screen.getByTestId('icon')).toBeDefined();
  });

  it('支持自定义className', () => {
    const { container } = render(
      <CollapsibleSection title="筛选条件" className="my-section">
        <div>子内容</div>
      </CollapsibleSection>
    );
    expect(container.querySelector('.my-section')).toBeDefined();
  });
});
