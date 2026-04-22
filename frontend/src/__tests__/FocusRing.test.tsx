/**
 * FocusRing 组件测试
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import {
  FocusRing,
  KeyboardHint,
  FocusIndicator,
  ShortcutPanel,
} from '../components/Common/FocusRing';

describe('FocusRing', () => {
  it('渲染子组件', () => {
    render(
      <FocusRing>
        <button>测试按钮</button>
      </FocusRing>
    );
    expect(screen.getByText('测试按钮')).toBeDefined();
  });

  it('应用自定义className', () => {
    const { container } = render(
      <FocusRing className="custom-ring">
        <button>按钮</button>
      </FocusRing>
    );
    expect(container.querySelector('.custom-ring')).toBeDefined();
  });
});

describe('KeyboardHint', () => {
  it('渲染单个快捷键', () => {
    render(<KeyboardHint keys={['Ctrl']} />);
    expect(screen.getByText('Ctrl')).toBeDefined();
  });

  it('渲染组合快捷键', () => {
    render(<KeyboardHint keys={['Ctrl', 'S']} />);
    expect(screen.getByText('Ctrl')).toBeDefined();
    expect(screen.getByText('S')).toBeDefined();
    expect(screen.getByText('+')).toBeDefined();
  });

  it('支持大小变体', () => {
    const { container } = render(<KeyboardHint keys={['Enter']} size="md" />);
    const kbd = container.querySelector('kbd');
    expect(kbd).toBeDefined();
  });

  it('应用自定义className', () => {
    const { container } = render(<KeyboardHint keys={['Tab']} className="my-hint" />);
    const hint = container.querySelector('.keyboard-hint');
    expect(hint).toBeDefined();
  });
});

describe('FocusIndicator', () => {
  it('渲染子组件', () => {
    render(
      <FocusIndicator>
        <div>内容</div>
      </FocusIndicator>
    );
    expect(screen.getByText('内容')).toBeDefined();
  });
});

describe('ShortcutPanel', () => {
  const mockShortcuts = [
    { keys: ['Ctrl', 'K'], label: '搜索' },
    { keys: ['Esc'], label: '关闭' },
  ];

  it('visible=true时渲染快捷键面板', () => {
    render(<ShortcutPanel shortcuts={mockShortcuts} visible={true} onClose={vi.fn()} />);
    expect(document.body.textContent).toContain('快捷键');
    expect(document.body.textContent).toContain('搜索');
    expect(document.body.textContent).toContain('关闭');
  });

  it('visible=false时不渲染', () => {
    const { container } = render(
      <ShortcutPanel shortcuts={mockShortcuts} visible={false} onClose={vi.fn()} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('渲染快捷键组合', () => {
    render(<ShortcutPanel shortcuts={mockShortcuts} visible={true} onClose={vi.fn()} />);
    expect(screen.getByText('Ctrl')).toBeDefined();
    expect(screen.getByText('K')).toBeDefined();
  });
});
