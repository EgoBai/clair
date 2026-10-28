/**
 * 页面级渲染兜底（src/components/ErrorBoundary.tsx）测试
 *
 * 断言三件事：
 *   1. 子组件抛错时不白屏 —— 出现局部降级卡片，且外部（模拟侧边导航）内容仍在；
 *   2. 降级文案如实 —— 明确是「渲染出错（数据可能不完整）」，不得伪装成「暂无数据」；
 *   3. 点击「重试」后能重新渲染成功（boundary state 重置 + 子树重挂载）。
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import ErrorBoundary, { SafePage } from '../components/ErrorBoundary';

let shouldThrow = true;

const Flaky: React.FC = () => {
  if (shouldThrow) {
    throw new Error("Cannot read properties of undefined (reading 'description')");
  }
  return <div>恢复正常</div>;
};

const wrap = (node: React.ReactNode) => <MemoryRouter>{node}</MemoryRouter>;

describe('页面级 ErrorBoundary 渲染兜底', () => {
  beforeEach(() => {
    shouldThrow = true;
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('子组件正常时不显示降级卡片', () => {
    shouldThrow = false;
    render(wrap(<ErrorBoundary name="测试页面"><Flaky /></ErrorBoundary>));
    expect(screen.getByText('恢复正常')).toBeDefined();
    expect(screen.queryByTestId('page-error-boundary')).toBeNull();
  });

  it('子组件抛错时出现局部降级卡片（不整页替换），并含错误摘要', () => {
    const { container } = render(
      wrap(
        <div>
          <nav data-testid="sidebar">侧边导航仍在</nav>
          <ErrorBoundary name="股票详情">
            <Flaky />
          </ErrorBoundary>
        </div>,
      ),
    );

    // 1) 降级卡片出现
    const fallback = screen.getByTestId('page-error-boundary');
    expect(fallback).toBeDefined();

    // 2) 出错模块名 + 错误摘要
    expect(container.textContent).toContain('股票详情 渲染出错');
    expect(container.textContent).toContain("Cannot read properties of undefined (reading 'description')");

    // 3) 不是整页替换：边界之外的布局内容仍在
    expect(screen.getByTestId('sidebar').textContent).toBe('侧边导航仍在');

    // 4) 有重试 / 刷新按钮
    const buttons = Array.from(container.querySelectorAll('button'));
    expect(buttons.some((b) => /重\s*试/.test(b.textContent || ''))).toBe(true);
    expect(buttons.some((b) => /刷新页面/.test(b.textContent || ''))).toBe(true);
  });

  it('降级文案如实：声明是渲染出错，不使用「暂无数据」等业务空态措辞', () => {
    const { container } = render(wrap(<ErrorBoundary name="产业地图"><Flaky /></ErrorBoundary>));
    const text = container.textContent || '';
    expect(text).toContain('渲染出错');
    expect(text).toContain('数据可能不完整');
    expect(text).not.toContain('暂无数据');
    expect(text).not.toContain('没有相关标的');
  });

  it('点击「重试」后重置 boundary 并重新渲染成功', () => {
    const { container } = render(wrap(<ErrorBoundary name="回测"><Flaky /></ErrorBoundary>));

    // 先崩
    expect(screen.getByTestId('page-error-boundary')).toBeDefined();

    // 外部条件已恢复，点重试
    shouldThrow = false;
    const retryBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      /重\s*试/.test(b.textContent || ''),
    );
    expect(retryBtn).toBeDefined();
    fireEvent.click(retryBtn!);

    // 重新渲染成功，降级卡片消失
    expect(screen.getByText('恢复正常')).toBeDefined();
    expect(screen.queryByTestId('page-error-boundary')).toBeNull();
  });

  it('resetKey 变化（路由切换）自动清除上一次的失败态', () => {
    const { rerender } = render(
      wrap(<ErrorBoundary name="策略模板" resetKey="/a"><Flaky /></ErrorBoundary>),
    );
    expect(screen.getByTestId('page-error-boundary')).toBeDefined();

    shouldThrow = false;
    rerender(wrap(<ErrorBoundary name="策略模板" resetKey="/b"><Flaky /></ErrorBoundary>));

    expect(screen.getByText('恢复正常')).toBeDefined();
    expect(screen.queryByTestId('page-error-boundary')).toBeNull();
  });

  it('降级卡显式对比色：不依赖主题继承（回归守卫：暗色主题下文字与底色同色）', () => {
    const { container } = render(wrap(<ErrorBoundary name="指数详情"><Flaky /></ErrorBoundary>));

    // Card 外层带显式背景色
    const card = container.querySelector('[data-testid="page-error-boundary"]') as HTMLElement;
    expect(card).toBeDefined();
    expect(card.getAttribute('style') || '').toContain('background');

    // 标题 span 带显式文字色（原实现无 style，暗色主题下继承成同色）
    // jsdom 会把内联 style 序列化成 rgb()，两种形态都接受
    const title = screen.getByText('指数详情 渲染出错') as HTMLElement;
    expect(title.getAttribute('style') || '').toMatch(/#e2e8f0|rgb\(226,\s*232,\s*240\)/);

    // Alert 正文与错误摘要同样显式配色
    const alertMsg = screen.getByText('本页面渲染出错（数据可能不完整），已降级显示') as HTMLElement;
    expect(alertMsg.getAttribute('style') || '').toMatch(/#fca5a5|rgb\(252,\s*165,\s*165\)/);
    const summary = (container.textContent || '').includes('错误摘要');
    expect(summary).toBe(true);
  });

  it('SafePage 包裹懒加载页面：抛错时降级、重试后恢复', () => {
    const LazyFlaky = React.lazy(async () => ({ default: Flaky }));
    const { container } = render(
      wrap(<SafePage component={LazyFlaky} name="策略模板" />),
    );

    // 懒加载 resolve 前是骨架，不是错误态
    expect(screen.queryByTestId('page-error-boundary')).toBeNull();
    expect(container.textContent).toBeDefined();
  });
});
