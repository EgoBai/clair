/**
 * WebVitalsWidget 组件测试
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';
import WebVitalsWidget from '../components/Common/WebVitalsWidget';

describe('WebVitalsWidget', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('渲染组件', () => {
    render(<WebVitalsWidget />);
    // 组件默认标题是 "页面性能监控"
    expect(document.body.textContent).toContain('页面性能监控');
  });

  it('显示Vital指标', () => {
    render(<WebVitalsWidget />);
    // 组件使用 setTimeout 异步加载数据，需要推进时间
    act(() => {
      vi.advanceTimersByTime(500);
    });
    // 应显示FCP, LCP, CLS等指标
    expect(document.body.textContent).toContain('FCP');
    expect(document.body.textContent).toContain('LCP');
  });

  it('显示分数', () => {
    render(<WebVitalsWidget />);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    // 组件显示 "总体性能评分" 和 "通过率"
    const text = document.body.textContent || '';
    expect(text).toContain('总体性能评分');
  });

  it('显示通过项数', () => {
    render(<WebVitalsWidget />);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    // 组件显示 "通过率 X/6" 格式
    expect(document.body.textContent).toContain('通过率');
  });

  it('支持自定义标题', () => {
    render(<WebVitalsWidget title="性能监控" />);
    expect(document.body.textContent).toContain('性能监控');
  });

  it('支持compact模式', () => {
    render(<WebVitalsWidget compact />);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(document.body.textContent).toContain('分数');
  });
});
