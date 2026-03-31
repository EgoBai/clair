// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { isMobileDevice, hasTouchSupport } from '../hooks/useMobileGestures';

describe('isMobileDevice', () => {
  const originalUA = navigator.userAgent;
  const originalInnerWidth = window.innerWidth;

  afterEach(() => {
    Object.defineProperty(navigator, 'userAgent', {
      value: originalUA,
      configurable: true,
    });
    Object.defineProperty(window, 'innerWidth', {
      value: originalInnerWidth,
      writable: true,
    });
  });

  it('应该返回 false 在桌面环境', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)',
      configurable: true,
    });
    Object.defineProperty(window, 'innerWidth', { value: 1920, writable: true });
    expect(isMobileDevice()).toBe(false);
  });

  it('应该检测 iPhone', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS)',
      configurable: true,
    });
    expect(isMobileDevice()).toBe(true);
  });

  it('应该检测 Android', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Linux; Android 13)',
      configurable: true,
    });
    expect(isMobileDevice()).toBe(true);
  });

  it('应该检测小屏幕', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)',
      configurable: true,
    });
    Object.defineProperty(window, 'innerWidth', { value: 500, writable: true });
    expect(isMobileDevice()).toBe(true);
  });

  it('768px 应该被检测为移动端 (<=768)', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)',
      configurable: true,
    });
    Object.defineProperty(window, 'innerWidth', { value: 768, writable: true });
    expect(isMobileDevice()).toBe(true);
  });

  it('769px 应该被检测为桌面端', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)',
      configurable: true,
    });
    Object.defineProperty(window, 'innerWidth', { value: 769, writable: true });
    expect(isMobileDevice()).toBe(false);
  });
});

describe('hasTouchSupport', () => {
  it('应该返回布尔值', () => {
    const result = hasTouchSupport();
    expect(typeof result).toBe('boolean');
  });
});
