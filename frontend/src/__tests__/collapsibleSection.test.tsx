/**
 * CollapsibleSection 折叠面板组件测试
 * 展开/收起、动画、图标、徽标、回调
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { CollapsibleSection } from '../components/Common/CollapsibleSection';

describe('CollapsibleSection', () => {
  // === 基础渲染 ===
  describe('basic rendering', () => {
    it('renders title', () => {
      render(
        <CollapsibleSection title="筛选条件">
          <div>内容区域</div>
        </CollapsibleSection>
      );
      expect(screen.getByText('筛选条件')).toBeTruthy();
    });

    it('renders children', () => {
      render(
        <CollapsibleSection title="标题">
          <div data-testid="child">子元素</div>
        </CollapsibleSection>
      );
      expect(screen.getByTestId('child')).toBeTruthy();
      expect(screen.getByText('子元素')).toBeTruthy();
    });

    it('renders with custom className', () => {
      const { container } = render(
        <CollapsibleSection title="标题" className="my-custom-class">
          <div>内容</div>
        </CollapsibleSection>
      );
      const section = container.querySelector('.my-custom-class');
      expect(section).toBeTruthy();
    });
  });

  // === 展开/收起状态 ===
  describe('expand/collapse', () => {
    it('starts collapsed by default', () => {
      const { container } = render(
        <CollapsibleSection title="标题">
          <div>内容</div>
        </CollapsibleSection>
      );
      // Content area should have height 0
      const contentWrapper = container.querySelector('[style*="overflow: hidden"]');
      expect(contentWrapper).toBeTruthy();
      expect(contentWrapper?.getAttribute('style')).toContain('height: 0px');
    });

    it('starts expanded when defaultOpen is true', () => {
      const { container } = render(
        <CollapsibleSection title="标题" defaultOpen>
          <div>内容</div>
        </CollapsibleSection>
      );
      // Check aria-expanded rather than style (animation runs after mount)
      const header = container.querySelector('button');
      expect(header?.getAttribute('aria-expanded')).toBe('true');
    });

    it('toggles on button click', () => {
      const { container } = render(
        <CollapsibleSection title="标题">
          <div>内容</div>
        </CollapsibleSection>
      );
      const header = container.querySelector('button');
      expect(header).toBeTruthy();
      
      // Initially collapsed
      expect(header?.getAttribute('aria-expanded')).toBe('false');
      
      // Click to expand
      fireEvent.click(header!);
      expect(header?.getAttribute('aria-expanded')).toBe('true');
      
      // Click to collapse
      fireEvent.click(header!);
      expect(header?.getAttribute('aria-expanded')).toBe('false');
    });

    it('shows arrow rotation state', () => {
      const { container } = render(
        <CollapsibleSection title="标题">
          <div>内容</div>
        </CollapsibleSection>
      );
      const arrow = container.querySelector('span[style*="rotate"]');
      expect(arrow).toBeTruthy();
      
      // Initially collapsed - 0deg
      expect(arrow?.getAttribute('style')).toContain('rotate(0deg)');
      
      // Click to expand
      const header = container.querySelector('button')!;
      fireEvent.click(header);
      
      // Should show 180deg rotation
      const arrowAfter = container.querySelector('span[style*="rotate"]');
      expect(arrowAfter?.getAttribute('style')).toContain('rotate(180deg)');
    });
  });

  // === 图标和徽标 ===
  describe('icon and badge', () => {
    it('renders icon when provided', () => {
      const { container } = render(
        <CollapsibleSection title="标题" icon={<span data-testid="icon">🔍</span>}>
          <div>内容</div>
        </CollapsibleSection>
      );
      expect(container.querySelector('[data-testid="icon"]')).toBeTruthy();
    });

    it('renders badge when provided', () => {
      render(
        <CollapsibleSection title="标题" badge={5}>
          <div>内容</div>
        </CollapsibleSection>
      );
      expect(screen.getByText('5')).toBeTruthy();
    });

    it('renders badge as string', () => {
      render(
        <CollapsibleSection title="标题" badge="新">
          <div>内容</div>
        </CollapsibleSection>
      );
      expect(screen.getByText('新')).toBeTruthy();
    });

    it('does not render badge when not provided', () => {
      render(
        <CollapsibleSection title="标题">
          <div>内容</div>
        </CollapsibleSection>
      );
      // Only the arrow ▼ should be visible besides title
      expect(screen.getByText('▼')).toBeTruthy();
    });

    it('renders without icon', () => {
      const { container } = render(
        <CollapsibleSection title="标题">
          <div>内容</div>
        </CollapsibleSection>
      );
      expect(container.textContent).toContain('标题');
    });
  });

  // === 回调函数 ===
  describe('onToggle callback', () => {
    it('calls onToggle when toggling open', () => {
      const onToggle = vi.fn();
      const { container } = render(
        <CollapsibleSection title="标题" onToggle={onToggle}>
          <div>内容</div>
        </CollapsibleSection>
      );
      const header = container.querySelector('button')!;
      fireEvent.click(header);
      expect(onToggle).toHaveBeenCalledWith(true);
    });

    it('calls onToggle when toggling closed', () => {
      const onToggle = vi.fn();
      const { container } = render(
        <CollapsibleSection title="标题" defaultOpen onToggle={onToggle}>
          <div>内容</div>
        </CollapsibleSection>
      );
      const header = container.querySelector('button')!;
      fireEvent.click(header);
      expect(onToggle).toHaveBeenCalledWith(false);
    });

    it('calls onToggle each toggle', () => {
      const onToggle = vi.fn();
      const { container } = render(
        <CollapsibleSection title="标题" onToggle={onToggle}>
          <div>内容</div>
        </CollapsibleSection>
      );
      const header = container.querySelector('button')!;
      fireEvent.click(header); // open
      fireEvent.click(header); // close
      expect(onToggle).toHaveBeenCalledTimes(2);
      expect(onToggle).toHaveBeenCalledWith(true);
      expect(onToggle).toHaveBeenCalledWith(false);
    });

    it('does not call onToggle on initial render', () => {
      const onToggle = vi.fn();
      render(
        <CollapsibleSection title="标题" onToggle={onToggle}>
          <div>内容</div>
        </CollapsibleSection>
      );
      expect(onToggle).not.toHaveBeenCalled();
    });
  });

  // === 键盘可访问性 ===
  describe('accessibility', () => {
    it('renders button with aria-expanded attribute', () => {
      const { container } = render(
        <CollapsibleSection title="标题">
          <div>内容</div>
        </CollapsibleSection>
      );
      const header = container.querySelector('button');
      expect(header?.getAttribute('aria-expanded')).toBe('false');
    });

    it('updates aria-expanded on click', () => {
      const { container } = render(
        <CollapsibleSection title="标题">
          <div>内容</div>
        </CollapsibleSection>
      );
      const header = container.querySelector('button')!;
      fireEvent.click(header);
      expect(header.getAttribute('aria-expanded')).toBe('true');
    });

    it('has accessible button element', () => {
      const { container } = render(
        <CollapsibleSection title="标题">
          <div>内容</div>
        </CollapsibleSection>
      );
      const header = container.querySelector('button');
      expect(header?.tagName).toBe('BUTTON');
    });
  });

  // === 边缘情况 ===
  describe('edge cases', () => {
    it('renders with no children', () => {
      const { container } = render(
        <CollapsibleSection title="空内容" />
      );
      expect(screen.getByText('空内容')).toBeTruthy();
      // Content area with no children should still render
      const contentWrapper = container.querySelector('[style*="overflow: hidden"] > div');
      expect(contentWrapper).toBeTruthy();
    });

    it('renders with empty title', () => {
      const { container } = render(
        <CollapsibleSection title="">
          <div>内容</div>
        </CollapsibleSection>
      );
      // Arrow should still render
      expect(screen.getByText('▼')).toBeTruthy();
    });

    it('preserves inner content className', () => {
      render(
        <CollapsibleSection title="标题">
          <div className="inner-content">内层内容</div>
        </CollapsibleSection>
      );
      expect(screen.getByText('内层内容')).toBeTruthy();
    });
  });
});
