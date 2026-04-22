// @vitest-environment jsdom
/**
 * EnhancedErrorBoundary 增强错误边界测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import ErrorBoundary, { getErrorReports, clearErrorReports, withErrorBoundary } from '../components/Common/EnhancedErrorBoundary';

// 组件 that throws
const ThrowError = ({ shouldThrow = true }: { shouldThrow?: boolean }) => {
  if (shouldThrow) {
    throw new Error('测试错误');
  }
  return <div>正常渲染</div>;
};

// 抑制 console.error
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => { );
  clearErrorReports();
});

describe('ErrorBoundary (Enhanced)', () => {
  it('should render children when no error', () => {
    render(
      <ErrorBoundary>
        <div>正常内容</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('正常内容')).toBeTruthy();
  });

  it('should catch error and show fallback UI', () => {
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );
    expect(screen.getByText('组件渲染出错')).toBeTruthy();
  });

  it('should show error message in fallback', () => {
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );
    expect(screen.getByText(/测试错误/)).toBeTruthy();
  });

  it('should render custom fallback', () => {
    render(
      <ErrorBoundary fallback={<div>自定义错误页面</div>}>
        <ThrowError />
      </ErrorBoundary>
    );
    expect(screen.getByText('自定义错误页面')).toBeTruthy();
  });

  it('should render custom fallback function', () => {
    render(
      <ErrorBoundary fallback={(error, retry) => (
        <div>
          <span>错误: {error.message}</span>
          <button onClick={retry}>重试</button>
        </div>
      )}>
        <ThrowError />
      </ErrorBoundary>
    );
    expect(screen.getByText('错误: 测试错误')).toBeTruthy();
  });

  it('should call onError callback', () => {
    const onError = vi.fn();
    render(
      <ErrorBoundary onError={onError}>
        <ThrowError />
      </ErrorBoundary>
    );
    expect(onError).toHaveBeenCalled();
    expect(onError.mock.calls[0][0].message).toBe('测试错误');
  });

  it('should record error reports', () => {
    clearErrorReports();
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );
    const reports = getErrorReports();
    expect(reports.length).toBe(1);
    expect(reports[0].error.message).toBe('测试错误');
  });

  it('should show retry button', () => {
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );
    expect(screen.getByText(/重试/)).toBeTruthy();
  });

  it('should show home button', () => {
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );
    expect(screen.getByText('返回首页')).toBeTruthy();
  });

  it('should display component name when provided', () => {
    render(
      <ErrorBoundary name="TestComponent">
        <ThrowError />
      </ErrorBoundary>
    );
    expect(screen.getByText(/TestComponent/)).toBeTruthy();
  });
});

describe('clearErrorReports', () => {
  it('should clear all error reports', () => {
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );
    expect(getErrorReports().length).toBeGreaterThan(0);
    clearErrorReports();
    expect(getErrorReports()).toHaveLength(0);
  });
});

describe('withErrorBoundary HOC', () => {
  it('should wrap component with error boundary', () => {
    const SafeComponent = withErrorBoundary(ThrowError);
    render(<SafeComponent shouldThrow={true} />);
    expect(screen.getByText('组件渲染出错')).toBeTruthy();
  });

  it('should render component when no error', () => {
    const SafeComponent = withErrorBoundary(ThrowError);
    render(<SafeComponent shouldThrow={false} />);
    expect(screen.getByText('正常渲染')).toBeTruthy();
  });

  it('should pass options to error boundary', () => {
    const onError = vi.fn();
    const SafeComponent = withErrorBoundary(ThrowError, { onError });
    render(<SafeComponent shouldThrow={true} />);
    expect(onError).toHaveBeenCalled();
  });

  it('should set displayName', () => {
    function MyComponent() { return <div />; }
    const SafeComponent = withErrorBoundary(MyComponent);
    expect(SafeComponent.displayName).toBe('WithErrorBoundary(MyComponent)');
  });
});
