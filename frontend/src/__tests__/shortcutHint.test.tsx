/**
 * ShortcutHint 快捷键提示组件测试
 * 不同快捷键格式、macOS/Windows显示、样式变化
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ShortcutHint, shortcutToString, useShortcut } from '../components/Common/ShortcutHint';

// Mock useI18n
vi.mock('../../hooks/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

describe('shortcutToString', () => {
  it('returns empty string for null/undefined', () => {
    expect(shortcutToString(null as any)).toBe('');
    expect(shortcutToString(undefined as any)).toBe('');
  });

  it('converts single key', () => {
    expect(shortcutToString('k')).toBe('k');
    expect(shortcutToString('enter')).toBe('enter');
  });

  it('converts modifier keys on macOS', () => {
    expect(shortcutToString(['mod', 'k'], true)).toBe('⌘K');
  });

  it('converts combination with multiple modifiers', () => {
    expect(shortcutToString(['mod', 'shift', 'k'], true)).toContain('⌘');
    expect(shortcutToString(['mod', 'shift', 'k'], true)).toContain('⇧');
    expect(shortcutToString(['mod', 'shift', 'k'], true)).toContain('K');
  });

  it('converts alt modifier', () => {
    const result = shortcutToString(['alt', 'k'], true);
    expect(result).toContain('⌥');
    expect(result).toContain('K');
  });

  it('converts ctrl modifier', () => {
    const result = shortcutToString(['ctrl', 's'], true);
    expect(result).toContain('⌃');
    expect(result).toContain('S');
  });
});

describe('ShortcutHint', () => {
  it('renders single shortcut', () => {
    render(<ShortcutHint shortcut="k" />);
    const kbd = screen.getByText('k');
    expect(kbd).toBeTruthy();
  });

  it('renders modifier shortcut', () => {
    render(<ShortcutHint shortcut={['mod', 'k']} />);
    const shortcut = document.querySelector('kbd');
    expect(shortcut).toBeTruthy();
  });

  it('renders with description', () => {
    render(<ShortcutHint shortcut={['mod', 'k']} description="打开命令面板" />);
    expect(screen.getByText('打开命令面板')).toBeTruthy();
  });

  it('renders without description', () => {
    const { container } = render(<ShortcutHint shortcut={['mod', 'k']} />);
    // Only the shortcut text should render, no description
    expect(container.textContent).toBeTruthy();
  });

  it('renders with custom className', () => {
    const { container } = render(
      <ShortcutHint shortcut="enter" className="custom-hint" />
    );
    const wrapper = container.querySelector('.custom-hint');
    expect(wrapper).toBeTruthy();
  });

  it('renders blank when shortcut mapResult is empty', () => {
    const { container } = render(<ShortcutHint shortcut={''} />);
    expect(container.textContent).toBe('');
  });
});

describe('useShortcut hook', () => {
  it('registers keyboard event listener', () => {
    const onTrigger = vi.fn();
    const addEventListener = vi.spyOn(document, 'addEventListener');
    
    function TestComponent() {
      useShortcut(['mod', 'k'], onTrigger);
      return null;
    }
    
    render(<TestComponent />);
    // React strict mode may double-invoke effects
    expect(addEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
  });

  it('registers listeners for multiple shortcuts', () => {
    const onTrigger = vi.fn();
    const addEventListener = vi.spyOn(document, 'addEventListener');
    
    function TestComponent() {
      useShortcut(['mod', 'k'], onTrigger);
      useShortcut(['mod', 'shift', 'k'], onTrigger);
      return null;
    }
    
    render(<TestComponent />);
    // 2 different shortcuts = 2 listeners (but strict mode doubles)
    expect(addEventListener.mock.calls.filter(c => c[0] === 'keydown').length).toBeGreaterThanOrEqual(2);
  });
});
