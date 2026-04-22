/**
 * ErrorBoundary 组件测试
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import ErrorBoundary from '../components/Common/ErrorBoundary';

// 一个会抛出错误的组件
const ThrowError: React.FC<{ shouldThrow?: boolean }> = ({ shouldThrow = true }) => {
  if (shouldThrow) {
    throw new Error('测试错误');
  }
  return <div>正常渲染</div>;
};

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => { );
  });

  it('正常渲染子组件', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText('正常渲染')).toBeDefined();
  });

  it('捕获错误并显示降级UI', () => {
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );
    expect(screen.getByText('页面渲染异常')).toBeDefined();
  });

  it('显示自定义fallback', () => {
    render(
      <ErrorBoundary fallback={<div>自定义错误页面</div>}>
        <ThrowError />
      </ErrorBoundary>
    );
    expect(screen.getByText('自定义错误页面')).toBeDefined();
  });

  it('包含重试按钮', () => {
    const { container } = render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );
    // Ant Design Button 渲染为嵌套元素，文本可能有空格
    const text = container.textContent?.replace(/\s+/g, '');
    expect(text).toContain('重试');
    expect(text).toContain('返回首页');
  });

  it('重试按钮可点击', () => {
    const { container } = render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );
    const buttons = container.querySelectorAll('button');
    // Ant Design 按钮文本可能有空格，用正则匹配
    const retryBtn = Array.from(buttons).find(b => /重\s*试/.test(b.textContent || ''));
    expect(retryBtn).toBeDefined();
    retryBtn?.click();
  });
});
