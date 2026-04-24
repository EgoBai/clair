/**
 * ScrollReveal 组件测试
 * 元素进入视口动画、IntersectionObserver、交错列表
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ScrollReveal, StaggerList } from '../components/Common/ScrollReveal';

// Mock IntersectionObserver
const mockObserverCallback = vi.fn();
let mockObserve = vi.fn();
let mockDisconnect = vi.fn();
let mockIsIntersecting = false;

beforeEach(() => {
  mockIsIntersecting = false;
  mockObserve = vi.fn();
  mockDisconnect = vi.fn();
  
  class MockIntersectionObserver {
    readonly root: Element | null = null;
    readonly rootMargin: string = '';
    readonly thresholds: ReadonlyArray<number> = [0];
    
    constructor(private callback: IntersectionObserverCallback) {
      mockObserverCallback.mockImplementation((...args: unknown[]) => callback(...args as [IntersectionObserverEntry[], IntersectionObserver]));
    }
    
    observe = mockObserve;
    disconnect = mockDisconnect;
    unobserve = vi.fn();
    takeRecords = vi.fn();
  }
  
  // @ts-expect-error Mock intersection observer
  globalThis.IntersectionObserver = MockIntersectionObserver;
});

afterEach(() => {
  vi.restoreAllMocks();
  // @ts-expect-error Clean up
  delete globalThis.IntersectionObserver;
});

function simulateIntersection(isIntersecting: boolean) {
  const entry = {
    isIntersecting,
    intersectionRatio: isIntersecting ? 0.5 : 0,
    boundingClientRect: {} as DOMRectReadOnly,
    intersectionRect: {} as DOMRectReadOnly,
    rootBounds: null,
    target: document.createElement('div'),
    time: Date.now(),
  };
  
  const callback = (globalThis.IntersectionObserver as unknown as typeof jest)?.fn?.();
  
  // Find the observer instance that was created
  const observerCalls = mockObserverCallback.mock.calls;
  for (const call of observerCalls) {
    const entries = call[0] as unknown as IntersectionObserverEntry[];
    if (entries[0]) {
      const updatedEntry = { ...entry, isIntersecting };
      entries[0] = updatedEntry;
    }
  }
}

describe('ScrollReveal', () => {
  // === 基础渲染 ===
  describe('basic rendering', () => {
    it('renders children', () => {
      render(
        <ScrollReveal>
          <div data-testid="content">Hello World</div>
        </ScrollReveal>
      );
      expect(screen.getByTestId('content')).toBeTruthy();
      expect(screen.getByText('Hello World')).toBeTruthy();
    });

    it('renders with default animation style (hidden initially)', () => {
      const { container } = render(
        <ScrollReveal>
          <div>Content</div>
        </ScrollReveal>
      );
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.style.opacity).toBe('0');
      expect(wrapper.style.transform).toBe('translateY(30px)');
    });

    it('applies custom className', () => {
      const { container } = render(
        <ScrollReveal className="custom-class">
          <div>Content</div>
        </ScrollReveal>
      );
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toBe('custom-class');
    });
  });

  // === 动画类型 ===
  describe('animation types', () => {
    it('renders with fade-in animation (hidden)', () => {
      const { container } = render(
        <ScrollReveal animation="fade-in">
          <div>Content</div>
        </ScrollReveal>
      );
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.style.opacity).toBe('0');
    });

    it('renders with slide-left animation (hidden)', () => {
      const { container } = render(
        <ScrollReveal animation="slide-left">
          <div>Content</div>
        </ScrollReveal>
      );
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.style.transform).toBe('translateX(-30px)');
    });

    it('renders with slide-right animation (hidden)', () => {
      const { container } = render(
        <ScrollReveal animation="slide-right">
          <div>Content</div>
        </ScrollReveal>
      );
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.style.transform).toBe('translateX(30px)');
    });

    it('renders with zoom-in animation (hidden)', () => {
      const { container } = render(
        <ScrollReveal animation="zoom-in">
          <div>Content</div>
        </ScrollReveal>
      );
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.style.transform).toBe('scale(0.9)');
    });
  });

  // === 过渡效果 ===
  describe('transition effects', () => {
    it('applies transition styles', () => {
      const { container } = render(
        <ScrollReveal duration={600} delay={200}>
          <div>Content</div>
        </ScrollReveal>
      );
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.style.transition).toContain('600ms');
      expect(wrapper.style.transition).toContain('200ms');
    });

    it('uses default duration and delay', () => {
      const { container } = render(
        <ScrollReveal>
          <div>Content</div>
        </ScrollReveal>
      );
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.style.transition).toContain('500ms');
      expect(wrapper.style.transition).toContain('0ms');
    });
  });

  // === IntersectionObserver ===
  describe('IntersectionObserver', () => {
    it('creates observer on mount', () => {
      render(
        <ScrollReveal>
          <div>Content</div>
        </ScrollReveal>
      );
      expect(mockObserve).toHaveBeenCalledTimes(1);
    });

    it('disconnects observer on unmount', () => {
      const { unmount } = render(
        <ScrollReveal>
          <div>Content</div>
        </ScrollReveal>
      );
      unmount();
      expect(mockDisconnect).toHaveBeenCalled();
    });
  });

  // === 边缘情况 ===
  describe('edge cases', () => {
    it('handles invalid animation type gracefully', () => {
      // @ts-expect-error Testing invalid animation
      const { container } = render(
        <ScrollReveal animation="invalid">
          <div>Content</div>
        </ScrollReveal>
      );
      const wrapper = container.firstChild as HTMLElement;
      // Should fallback to 'fade-up'
      expect(wrapper.style.opacity).toBe('0');
      expect(wrapper.style.transform).toBe('translateY(30px)');
    });

    it('renders with multiple children', () => {
      const { container } = render(
        <ScrollReveal>
          <div>First</div>
          <div>Second</div>
          <div>Third</div>
        </ScrollReveal>
      );
      expect(container.textContent).toContain('FirstSecondThird');
    });

    it('renders with empty children', () => {
      // @ts-expect-error Testing empty children
      const { container } = render(<ScrollReveal></ScrollReveal>);
      expect(container.firstChild).toBeTruthy();
    });
  });
});

describe('StaggerList', () => {
  it('renders all children with stagger delay', () => {
    const { container } = render(
      <StaggerList>
        <div>Item 1</div>
        <div>Item 2</div>
        <div>Item 3</div>
      </StaggerList>
    );
    // All items should render initially hidden
    const items = container.querySelectorAll('[style*="translateY(30px)"]');
    expect(items.length).toBe(3);
  });

  it('renders with custom stagger delay', () => {
    render(
      <StaggerList staggerDelay={100} animation="fade-in">
        <div>Item A</div>
        <div>Item B</div>
      </StaggerList>
    );
    expect(screen.getByText('Item A')).toBeTruthy();
    expect(screen.getByText('Item B')).toBeTruthy();
  });

  it('applies custom className to the wrapper', () => {
    const { container } = render(
      <StaggerList className="stagger-wrapper">
        <div>Item</div>
      </StaggerList>
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toBe('stagger-wrapper');
  });

  it('handles empty children', () => {
    // @ts-expect-error Testing empty children
    const { container } = render(<StaggerList></StaggerList>);
    expect(container.textContent).toBe('');
  });

  it('renders with single child', () => {
    const { container } = render(
      <StaggerList>
        <div>Only One</div>
      </StaggerList>
    );
    // Should still render with delay(0)
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toBeTruthy();
  });
});
