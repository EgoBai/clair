/**
 * ThemeProvider 主题组件测试
 * 基于 zustand store 的主题应用、Ant Design 配置、CSS 变量、meta 标签管理
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import ThemeProvider from '../components/Common/ThemeProvider';

// Mock useAppStore (zustand) using vi.mock with factory
const mockUseResolvedTheme = vi.fn(() => 'light');

vi.mock('../store/useAppStore', () => ({
  useResolvedTheme: (...args: unknown[]) => {
    const result = mockUseResolvedTheme(...args);
    return result;
  },
  useAppStore: vi.fn((selector?: (state: unknown) => unknown) => 
    selector ? selector({}) : {}
  ),
}));

beforeEach(() => {
  mockUseResolvedTheme.mockReturnValue('light');
  // Clean document state thoroughly
  document.documentElement.removeAttribute('data-theme');
  document.body.classList.remove('dark');
  // Remove any meta theme-color
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.remove();
});

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
  document.body.classList.remove('dark');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.remove();
});

describe('ThemeProvider', () => {
  it('renders children', () => {
    render(
      <ThemeProvider>
        <div data-testid="child">子元素</div>
      </ThemeProvider>
    );
    expect(screen.getByTestId('child')).toBeTruthy();
    expect(screen.getByText('子元素')).toBeTruthy();
  });

  it('renders multiple children', () => {
    render(
      <ThemeProvider>
        <span>A</span>
        <span>B</span>
      </ThemeProvider>
    );
    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.getByText('B')).toBeTruthy();
  });

  it('renders without crashing when no children', () => {
    const { container } = render(<ThemeProvider children={undefined as any} />);
    expect(container.innerHTML).toBeDefined();
  });
});

describe('data-theme attribute', () => {
  it('sets data-theme to light for light mode', () => {
    mockUseResolvedTheme.mockReturnValue('light');
    render(
      <ThemeProvider>
        <div>Content</div>
      </ThemeProvider>
    );
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('sets data-theme to dark for dark mode', () => {
    mockUseResolvedTheme.mockReturnValue('dark');
    render(
      <ThemeProvider>
        <div>Content</div>
      </ThemeProvider>
    );
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('updates data-theme when theme changes', () => {
    document.documentElement.removeAttribute('data-theme');
    const { rerender } = render(
      <ThemeProvider>
        <div>Content</div>
      </ThemeProvider>
    );
    
    mockUseResolvedTheme.mockReturnValue('dark');
    rerender(
      <ThemeProvider>
        <div>Content</div>
      </ThemeProvider>
    );
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    
    mockUseResolvedTheme.mockReturnValue('light');
    rerender(
      <ThemeProvider>
        <div>Content</div>
      </ThemeProvider>
    );
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});

describe('body class management', () => {
  it('adds dark class for dark mode', () => {
    document.body.classList.remove('dark');
    mockUseResolvedTheme.mockReturnValue('dark');
    render(
      <ThemeProvider>
        <div>Content</div>
      </ThemeProvider>
    );
    expect(document.body.classList.contains('dark')).toBe(true);
  });

  it('removes dark class for light mode', () => {
    // Clean state first
    document.body.classList.remove('dark');
    document.documentElement.removeAttribute('data-theme');
    // First render dark
    mockUseResolvedTheme.mockReturnValue('dark');
    const { rerender } = render(
      <ThemeProvider>
        <div>Content</div>
      </ThemeProvider>
    );
    expect(document.body.classList.contains('dark')).toBe(true);
    
    // Then switch to light
    mockUseResolvedTheme.mockReturnValue('light');
    rerender(
      <ThemeProvider>
        <div>Content</div>
      </ThemeProvider>
    );
    expect(document.body.classList.contains('dark')).toBe(false);
  });

  it('does not add dark class for light mode', () => {
    render(
      <ThemeProvider>
        <div>Content</div>
      </ThemeProvider>
    );
    expect(document.body.classList.contains('dark')).toBe(false);
  });
});

describe('meta theme-color management', () => {
  beforeEach(() => {
    // Create meta theme-color element
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = '#ffffff';
    document.head.appendChild(meta);
  });

  afterEach(() => {
    document.head.querySelector('meta[name="theme-color"]')?.remove();
  });

  it('sets light color for light mode', () => {
    mockUseResolvedTheme.mockReturnValue('light');
    render(
      <ThemeProvider>
        <div>Content</div>
      </ThemeProvider>
    );
    const meta = document.querySelector('meta[name="theme-color"]');
    expect(meta?.getAttribute('content')).toBe('#f8f9fc');
  });

  it('sets dark color for dark mode', () => {
    mockUseResolvedTheme.mockReturnValue('dark');
    render(
      <ThemeProvider>
        <div>Content</div>
      </ThemeProvider>
    );
    const meta = document.querySelector('meta[name="theme-color"]');
    expect(meta?.getAttribute('content')).toBe('#080b14');
  });

  it('is a no-op when meta tag does not exist', () => {
    // Remove meta
    document.head.querySelector('meta[name="theme-color"]')?.remove();
    
    expect(() => {
      render(
        <ThemeProvider>
          <div>Content</div>
        </ThemeProvider>
      );
    }).not.toThrow();
  });
});

describe('theme cleanup on unmount', () => {
  it('preserves body state after unmount', () => {
    mockUseResolvedTheme.mockReturnValue('dark');
    const { unmount } = render(
      <ThemeProvider>
        <div>Content</div>
      </ThemeProvider>
    );
    unmount();
    // Body state isn't cleaned up on unmount (no cleanup effect)
    // but we should verify it didn't break anything
    expect(document.body.classList.contains('dark')).toBe(true);
  });
});
