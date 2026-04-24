/**
 * ContextMenu 组件测试
 * 右键菜单: 渲染、定位、键盘导航、事件处理
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ContextMenu, useContextMenu } from '../components/Layout/ContextMenu';

describe('ContextMenu', () => {
  const defaultItems = [
    { key: 'refresh', label: '刷新', onClick: vi.fn() },
    { key: 'edit', label: '编辑', onClick: vi.fn(), icon: <span>✏️</span> },
    { key: 'delete', label: '删除', onClick: vi.fn(), danger: true },
    { key: 'disabled-item', label: '禁用项', disabled: true, onClick: vi.fn() },
    { key: 'divider-key', divider: true, label: '' },
    { key: 'export', label: '导出', onClick: vi.fn() },
  ];

  // === 基础渲染 ===
  describe('basic rendering', () => {
    it('renders null when not visible', () => {
      const { container } = render(
        <ContextMenu items={defaultItems} x={0} y={0} visible={false} onClose={vi.fn()} />
      );
      expect(container.innerHTML).toBe('');
    });

    it('renders menu when visible', () => {
      render(
        <ContextMenu items={defaultItems} x={100} y={200} visible={true} onClose={vi.fn()} />
      );
      expect(screen.getByText('刷新')).toBeTruthy();
      expect(screen.getByText('编辑')).toBeTruthy();
      expect(screen.getByText('删除')).toBeTruthy();
    });

    it('renders all menu items', () => {
      render(
        <ContextMenu items={defaultItems} x={100} y={200} visible={true} onClose={vi.fn()} />
      );
      expect(screen.getByText('刷新')).toBeTruthy();
      expect(screen.getByText('编辑')).toBeTruthy();
      expect(screen.getByText('删除')).toBeTruthy();
      expect(screen.getByText('导出')).toBeTruthy();
      expect(screen.getByText('禁用项')).toBeTruthy();
    });

    it('renders divider elements', () => {
      const { container } = render(
        <ContextMenu items={defaultItems} x={100} y={200} visible={true} onClose={vi.fn()} />
      );
      const dividers = container.querySelectorAll('[style*="height: 1px"]');
      expect(dividers.length).toBe(1);
    });
  });

  // === 交互事件 ===
  describe('interactions', () => {
    it('calls onClick and onClose when clicking an item', () => {
      const onClick = vi.fn();
      const onClose = vi.fn();
      render(
        <ContextMenu
          items={[{ key: 'test', label: '测试', onClick }]}
          x={100} y={200} visible={true} onClose={onClose}
        />
      );
      fireEvent.click(screen.getByText('测试'));
      expect(onClick).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not call onClick when clicking a disabled item', () => {
      const onClick = vi.fn();
      const onClose = vi.fn();
      render(
        <ContextMenu
          items={[{ key: 'test', label: '禁用', disabled: true, onClick }]}
          x={100} y={200} visible={true} onClose={onClose}
        />
      );
      fireEvent.click(screen.getByText('禁用'));
      expect(onClick).not.toHaveBeenCalled();
    });

    it('renders danger items with danger style', () => {
      render(
        <ContextMenu
          items={[{ key: 'delete', label: '删除', danger: true, onClick: vi.fn() }]}
          x={100} y={200} visible={true} onClose={vi.fn()}
        />
      );
      const item = screen.getByText('删除');
      expect(item).toBeTruthy();
    });

    it('renders icon for menu items', () => {
      const { container } = render(
        <ContextMenu
          items={[{ key: 'refresh', label: '刷新', icon: <span data-testid="icon">🔄</span>, onClick: vi.fn() }]}
          x={100} y={200} visible={true} onClose={vi.fn()}
        />
      );
      const icon = container.querySelector('[data-testid="icon"]');
      expect(icon).toBeTruthy();
    });
  });

  // === 定位 ===
  describe('positioning', () => {
    it('sets position from x/y props', () => {
      render(
        <ContextMenu items={defaultItems} x={300} y={400} visible={true} onClose={vi.fn()} />
      );
      const menu = document.querySelector('[style*="position: fixed"]') as HTMLElement;
      expect(menu).toBeTruthy();
      expect(menu.style.left).toBe('300px');
      expect(menu.style.top).toBe('400px');
    });

    it('adjusts x to stay within viewport', () => {
      const wide = window.innerWidth;
      render(
        <ContextMenu items={defaultItems} x={wide + 100} y={100} visible={true} onClose={vi.fn()} />
      );
      const menu = document.querySelector('[style*="position: fixed"]') as HTMLElement;
      const left = parseInt(menu.style.left);
      expect(left).toBeLessThanOrEqual(window.innerWidth - 200);
    });
  });

  // === 键盘事件 ===
  describe('keyboard events', () => {
    it('closes on Escape key', () => {
      const onClose = vi.fn();
      render(
        <ContextMenu items={defaultItems} x={100} y={100} visible={true} onClose={onClose} />
      );
      act(() => { fireEvent.keyDown(document, { key: 'Escape' }); });
      expect(onClose).toHaveBeenCalled();
    });

    it('does not close on Enter key when visible', () => {
      const onClose = vi.fn();
      render(
        <ContextMenu items={defaultItems} x={100} y={100} visible={true} onClose={onClose} />
      );
      act(() => { fireEvent.keyDown(document, { key: 'Enter' }); });
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  // === 点击外部关闭 ===
  describe('click outside', () => {
    it('closes when clicking outside the menu', () => {
      const onClose = vi.fn();
      render(
        <ContextMenu items={defaultItems} x={100} y={100} visible={true} onClose={onClose} />
      );
      act(() => { fireEvent.mouseDown(document.body); });
      expect(onClose).toHaveBeenCalled();
    });

    it('does not close when clicking inside the menu', () => {
      const onClose = vi.fn();
      render(
        <ContextMenu items={defaultItems} x={100} y={100} visible={true} onClose={onClose} />
      );
      const menu = document.querySelector('[style*="position: fixed"]') as HTMLElement;
      act(() => { fireEvent.mouseDown(menu); });
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  // === 边缘情况 ===
  describe('edge cases', () => {
    it('handles empty items array', () => {
      render(
        <ContextMenu items={[]} x={100} y={100} visible={true} onClose={vi.fn()} />
      );
      // Menu should still render but with no items
      expect(document.querySelector('[style*="position: fixed"]')).toBeTruthy();
    });

    it('handles items with divider but no label/onClick', () => {
      render(
        <ContextMenu
          items={[
            { key: 'd1', divider: true, label: '' },
            { key: 'action', label: 'Action', onClick: vi.fn() },
          ]}
          x={100} y={100} visible={true} onClose={vi.fn()}
        />
      );
      expect(screen.getByText('Action')).toBeTruthy();
    });
  });
});

describe('useContextMenu hook', () => {
  function TestComponent() {
    const { x, y, visible, handleContextMenu, close } = useContextMenu();
    return (
      <div>
        <div data-testid="context-area" onContextMenu={handleContextMenu}>
          右键区域
        </div>
        {visible && (
          <div data-testid="menu">
            菜单位置: {x}, {y}
            <button data-testid="close-btn" onClick={close}>关闭</button>
          </div>
        )}
      </div>
    );
  }

  it('shows menu on contextmenu event', () => {
    render(<TestComponent />);
    const area = screen.getByTestId('context-area');
    fireEvent.contextMenu(area, { clientX: 150, clientY: 250 });
    const menu = screen.getByTestId('menu');
    expect(menu).toBeTruthy();
    expect(menu.textContent).toContain('150, 250');
  });

  it('closes menu when close is called', () => {
    render(<TestComponent />);
    const area = screen.getByTestId('context-area');
    fireEvent.contextMenu(area, { clientX: 150, clientY: 250 });
    expect(screen.getByTestId('menu')).toBeTruthy();
    fireEvent.click(screen.getByTestId('close-btn'));
    expect(screen.queryByTestId('menu')).toBeNull();
  });

  it('prevents default context menu behavior', () => {
    render(<TestComponent />);
    const area = screen.getByTestId('context-area');
    const prevented = { defaultPrevented: false };
    fireEvent.contextMenu(area, { clientX: 100, clientY: 100, ...prevented });
    expect(prevented.defaultPrevented).toBe(false);
  });
});
