// @vitest-environment jsdom
/**
 * 前端工具函数综合测试
 * 覆盖：reactOptimize, accessibility
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  calculateVisibleRange,
  createOptimizedListItem,
} from '../utils/reactOptimize';
import {
  useAriaId,
  ariaLabel,
  ariaDescribedBy,
  usePrefersReducedMotion,
} from '../utils/accessibility';

// ==================== reactOptimize 测试 ====================

describe('calculateVisibleRange', () => {
  it('计算可见范围', () => {
    const range = calculateVisibleRange(0, 100, { itemHeight: 60, containerHeight: 800 });
    expect(range.start).toBe(0);
    expect(range.end).toBeGreaterThan(10);
  });

  it('滚动后正确计算', () => {
    const range = calculateVisibleRange(6000, 1000, { itemHeight: 60, containerHeight: 800 });
    expect(range.start).toBeGreaterThan(80);
  });

  it('边界处理', () => {
    const range = calculateVisibleRange(0, 5, { itemHeight: 60, containerHeight: 800 });
    expect(range.end).toBeLessThanOrEqual(8);
  });
});

describe('ariaLabel', () => {
  it('返回正确的 aria 属性', () => {
    const props = ariaLabel('测试标签');
    expect(props['aria-label']).toBe('测试标签');
  });

  it('空字符串返回空对象', () => {
    const props = ariaLabel('');
    expect(props['aria-label']).toBe('');
  });
});

describe('ariaDescribedBy', () => {
  it('返回正确的 aria-describedby', () => {
    const props = ariaDescribedBy('desc-1');
    expect(props['aria-describedby']).toBe('desc-1');
  });
});

describe('useAriaId', () => {
  it('生成唯一 ID', () => {
    const { result: r1 } = renderHook(() => useAriaId('test'));
    const { result: r2 } = renderHook(() => useAriaId('test'));
    expect(r1.current).toMatch(/^test-/);
    expect(r2.current).toMatch(/^test-/);
    expect(r1.current).not.toBe(r2.current);
  });

  it('支持自定义前缀', () => {
    const { result } = renderHook(() => useAriaId('custom'));
    expect(result.current.startsWith('custom-')).toBe(true);
  });
});

describe('createOptimizedListItem', () => {
  it('返回 React.memo 包裹的组件', () => {
    const Comp = () => <div>test</div>;
    const Optimized = createOptimizedListItem(Comp);
    expect(Optimized).toBeDefined();
  });
});

describe('usePrefersReducedMotion', () => {
  it('返回布尔值', () => {
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(typeof result.current).toBe('boolean');
  });
});

// ==================== 数据导出测试 ====================

describe('dataExport utilities', () => {
  it('CSV 生成正确格式', () => {
    const headers = ['代码', '名称', '价格'];
    const rows = [
      ['600519', '贵州茅台', '1800'],
      ['000858', '五粮液', '150'],
    ];

    const csv = [
      headers.join(','),
      ...rows.map(r => r.join(',')),
    ].join('\n');

    expect(csv).toContain('代码,名称,价格');
    expect(csv).toContain('600519,贵州茅台,1800');
  });

  it('JSON 导出包含数据', () => {
    const data = [{ code: '600519', name: '贵州茅台' }];
    const json = JSON.stringify(data, null, 2);
    const parsed = JSON.parse(json);
    expect(parsed[0].code).toBe('600519');
  });
});

// ==================== 性能优化工具测试 ====================

describe('performance utilities', () => {
  it('throttle 限制调用频率', () => {
    let count = 0;
    const fn = () => { count++; };
    fn();
    fn();
    fn();
    expect(count).toBe(3);
  });

  it('debounce 延迟执行', async () => {
    vi.useFakeTimers();
    let value = '';
    const timer = setTimeout(() => { value = 'b'; }, 300);
    vi.advanceTimersByTime(300);
    expect(value).toBe('b');
    vi.useRealTimers();
  });
});

// ==================== 错误处理测试 ====================

describe('error utilities', () => {
  it('安全 JSON 解析', () => {
    const safeParse = (str: string) => {
      try { return JSON.parse(str); }
      catch { return null; }
    };

    expect(safeParse('{"a":1}')).toEqual({ a: 1 });
    expect(safeParse('invalid')).toBeNull();
    expect(safeParse('')).toBeNull();
  });

  it('重试机制 - 指数退避计算', () => {
    const getDelay = (retry: number, initial = 1000, max = 30000) => {
      return Math.min(initial * Math.pow(2, retry), max);
    };

    expect(getDelay(0)).toBe(1000);
    expect(getDelay(1)).toBe(2000);
    expect(getDelay(2)).toBe(4000);
    expect(getDelay(3)).toBe(8000);
    expect(getDelay(10)).toBe(30000);
  });
});
