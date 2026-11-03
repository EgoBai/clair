/**
 * 响应式逻辑测试 — 影子测试迁移（批次 23）
 *
 * 已绑定生产实现（frontend/src/utils/）：
 * - responsiveUtils.ts:8    BREAKPOINTS（sm 640 / md 768 / lg 1024 / xl 1280 / 2xl 1536）
 * - responsiveUtils.ts:58   getCurrentBreakpoint
 * - responsiveUtils.ts:70   isBelow
 * - responsiveUtils.ts:130  calculateColumns（maxColumns 默认 6）
 * - responsiveUtils.ts:258  getAdaptiveConfig().isMobile（= isBelow(width, 'md')）
 * - debounceThrottle.ts:6   debounce（支持 leading/trailing/maxWait，返回 cancel/flush/pending）
 * - debounceThrottle.ts:141 throttle（= debounce + maxWait=interval，leading 默认 true）
 *
 * 旧断言错在哪（旧值 → 生产值）：
 * | 旧断言 | 生产行为 | 依据 |
 * | 1920 => 'xxl' | '2xl'（阈值 1536，不是 1600） | responsiveUtils.ts:8 |
 * | 800 => 'md' | 仍为 'md'（md 阈值 768 相同） | responsiveUtils.ts:62 |
 * | (1200, 300) 列数 >= 3（松断言） | 精确 3：floor((1200+16)/(300+16)) | responsiveUtils.ts:137 |
 * | 旧 helper 无列数上限 | 默认上限 6：calculateColumns(2000,100,16) => 6 | responsiveUtils.ts:134-138 |
 * | isMobile 手写 width < 768 | getAdaptiveConfig().isMobile 走 isBelow(width,'md') | responsiveUtils.ts:258 |
 *
 * 未迁移（生产没有可导入的数值实现，保留本地 helper 与用例）：
 * - calculateResponsiveFontSize：生产只有 fluidTypography（:187），返回 CSS clamp() 字符串，无 px 数值
 * - calculateSafeArea：生产只有 safeAreaPadding（:297），返回 CSS env() 字符串，不做数值相减
 * - getOrientation：生产没有横竖屏判定导出
 *
 * 本地保留业务规则：无。
 * 生产缺陷候选：无。
 * 新增：debounce/throttle 绑定用例 5 个（原文件只内联 helper、零用例）。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  BREAKPOINTS,
  getCurrentBreakpoint,
  isBelow,
  calculateColumns,
  getAdaptiveConfig,
} from '../utils/responsiveUtils';
import { debounce, throttle } from '../utils/debounceThrottle';

// 未迁移：生产只有 fluidTypography()（responsiveUtils.ts:187），返回 CSS clamp() 字符串，
// 没有 px 数值版字号计算，无法按数值断言，故保留本地 helper。
function calculateResponsiveFontSize(baseSize: number, width: number, min = 12, max = 24): number {
  const scale = Math.min(1.5, Math.max(0.75, width / 1200));
  return Math.min(max, Math.max(min, Math.round(baseSize * scale)));
}

// 未迁移：生产只有 safeAreaPadding()（responsiveUtils.ts:297），返回 CSS env() 字符串，
// 没有 { width, height, x, y } 数值结构，故保留本地 helper。
function calculateSafeArea(
  insets: { top: number; bottom: number; left: number; right: number },
  base: { width: number; height: number }
): { width: number; height: number; x: number; y: number } {
  return {
    width: base.width - insets.left - insets.right,
    height: base.height - insets.top - insets.bottom,
    x: insets.left,
    y: insets.top,
  };
}

// 未迁移：生产没有横竖屏判定（getOrientation）导出，故保留本地 helper。
function getOrientation(width: number, height: number): 'portrait' | 'landscape' {
  return height > width ? 'portrait' : 'landscape';
}

describe('响应式逻辑', () => {
  describe('断点识别（生产 getCurrentBreakpoint）', () => {
    it('320px 为 xs', () => {
      expect(getCurrentBreakpoint(320)).toBe('xs');
    });

    it('800px 为 md', () => {
      expect(getCurrentBreakpoint(800)).toBe('md');
    });

    it('1920px 为 2xl（旧断言 xxl 错误）', () => {
      expect(getCurrentBreakpoint(1920)).toBe('2xl');
    });

    it('断点边界按生产阈值 640/768/1024/1280/1536 生效', () => {
      expect(getCurrentBreakpoint(639)).toBe('xs');
      expect(getCurrentBreakpoint(640)).toBe('sm');
      expect(getCurrentBreakpoint(1023)).toBe('md');
      expect(getCurrentBreakpoint(1024)).toBe('lg');
      expect(getCurrentBreakpoint(1535)).toBe('xl');
      expect(getCurrentBreakpoint(1536)).toBe('2xl');
      expect(BREAKPOINTS.sm).toBe(640);
      expect(BREAKPOINTS['2xl']).toBe(1536);
    });
  });

  describe('移动端判定（生产 getAdaptiveConfig）', () => {
    it('375px 为移动端', () => {
      expect(getAdaptiveConfig(375).isMobile).toBe(true);
      expect(isBelow(375, 'md')).toBe(true);
    });

    it('1024px 非移动端', () => {
      expect(getAdaptiveConfig(1024).isMobile).toBe(false);
      expect(isBelow(1024, 'md')).toBe(false);
    });
  });

  describe('栅格列数（生产 calculateColumns）', () => {
    it('1200px / 最小 300 / gap 16 精确为 3 列', () => {
      expect(calculateColumns(1200, 300, 16)).toBe(3);
    });

    it('容器不足一列时至少 1 列', () => {
      expect(calculateColumns(100, 300, 16)).toBe(1);
    });

    it('默认上限 6 列（旧 helper 无上限）', () => {
      expect(calculateColumns(2000, 100, 16)).toBe(6);
    });
  });

  describe('字号缩放（未迁移：生产无 px 数值实现）', () => {
    it('should scale with width', () => {
      const small = calculateResponsiveFontSize(16, 375);
      const large = calculateResponsiveFontSize(16, 1920);
      expect(large).toBeGreaterThanOrEqual(small);
    });

    it('should respect min/max', () => {
      const tiny = calculateResponsiveFontSize(16, 100);
      expect(tiny).toBeGreaterThanOrEqual(12);
    });
  });

  describe('安全区（未迁移：生产只返回 CSS env 字符串）', () => {
    it('should subtract insets', () => {
      const safe = calculateSafeArea({ top: 20, bottom: 34, left: 0, right: 0 }, { width: 375, height: 812 });
      expect(safe.height).toBe(758);
      expect(safe.y).toBe(20);
    });
  });

  describe('横竖屏（未迁移：生产无方向判定导出）', () => {
    it('should detect portrait', () => {
      expect(getOrientation(375, 812)).toBe('portrait');
    });

    it('should detect landscape', () => {
      expect(getOrientation(812, 375)).toBe('landscape');
    });
  });

  describe('防抖 / 节流（生产 debounce / throttle）', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('debounce 延迟执行，且只取最后一次参数', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced('a');
      debounced('b');
      debounced('c');

      expect(fn).not.toHaveBeenCalled();
      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith('c');
    });

    it('debounce cancel 后不再执行', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced('a');
      debounced.cancel();
      vi.advanceTimersByTime(200);

      expect(fn).not.toHaveBeenCalled();
    });

    it('debounce flush 立即执行并返回结果，pending 随 timer 变化', () => {
      const fn = vi.fn();
      fn.mockImplementation((value: string) => value.toUpperCase());
      const debounced = debounce(fn, 100);

      debounced('a');
      expect(debounced.pending()).toBe(true);

      const result = debounced.flush() as unknown as string;
      expect(result).toBe('A');
      expect(fn).toHaveBeenCalledTimes(1);
      expect(debounced.pending()).toBe(false);
    });

    it('throttle 首次立即执行，窗口内合并为一次 trailing', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      throttled('a');
      throttled('b');

      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenLastCalledWith('a');

      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(2);
      expect(fn).toHaveBeenLastCalledWith('b');
    });

    it('throttle cancel 后只保留 leading 调用', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      throttled('a');
      throttled('b');
      throttled.cancel();
      vi.advanceTimersByTime(200);

      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith('a');
    });
  });
});
