/**
 * 无障碍 (Accessibility) 工具 v2
 * WCAG 2.1 AA 标准合规
 * 新增: 颜色对比度检测、表格可访问性、表单验证播报、增强键盘导航
 */

import React, { useEffect, useRef, useCallback, createContext, useContext, useState, useMemo } from 'react';

// ==================== ARIA 工具 ====================

let idCounter = 0;
export function useAriaId(prefix: string = 'aria'): string {
  const [id] = useState(() => `${prefix}-${++idCounter}`);
  return id;
}

export function ariaLabel(label: string) {
  return { 'aria-label': label };
}

export function ariaDescribedBy(id: string) {
  return { 'aria-describedby': id };
}

export function ariaLabelledBy(id: string) {
  return { 'aria-labelledby': id };
}

export function roleAria(role: string, props: Record<string, any> = {}) {
  return { role, ...Object.fromEntries(
    Object.entries(props).map(([k, v]) => [`aria-${k}`, v])
  )};
}

/**
 * 表格 ARIA 属性
 */
export function tableAria(label: string, rowCount: number, colCount: number) {
  return {
    role: 'table',
    'aria-label': label,
    'aria-rowcount': rowCount,
    'aria-colcount': colCount,
  };
}

export function rowAria(index: number, selected: boolean = false) {
  return {
    role: 'row',
    'aria-rowindex': index + 1,
    'aria-selected': selected,
  };
}

export function cellAria(row: number, col: number, header?: string) {
  return {
    role: 'cell',
    'aria-rowindex': row + 1,
    'aria-colindex': col + 1,
    ...(header ? { 'aria-describedby': header } : {}),
  };
}

/**
 * 进度条 ARIA
 */
export function progressAria(value: number, max: number = 100, label?: string) {
  return {
    role: 'progressbar',
    'aria-valuenow': value,
    'aria-valuemin': 0,
    'aria-valuemax': max,
    'aria-valuetext': `${value}%`,
    ...(label ? { 'aria-label': label } : {}),
  };
}

/**
 * 加载状态 ARIA
 */
export function loadingAria(label: string = '加载中') {
  return {
    role: 'status',
    'aria-busy': true,
    'aria-label': label,
  };
}

// ==================== 颜色对比度 ====================

/**
 * 相对亮度计算 (WCAG 2.0)
 */
export function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * 两个颜色的对比度
 */
export function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * 解析 hex 颜色为 RGB
 */
export function parseHexColor(hex: string): [number, number, number] | null {
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    return [
      parseInt(clean[0] + clean[0], 16),
      parseInt(clean[1] + clean[1], 16),
      parseInt(clean[2] + clean[2], 16),
    ];
  }
  if (clean.length === 6) {
    return [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16),
    ];
  }
  return null;
}

/**
 * 检查颜色对比度是否符合 WCAG 标准
 */
export function checkContrast(
  fg: string,
  bg: string,
  level: 'AA' | 'AAA' = 'AA',
  size: 'normal' | 'large' = 'normal'
): { ratio: number; passes: boolean; required: number } {
  const fgRgb = parseHexColor(fg);
  const bgRgb = parseHexColor(bg);

  if (!fgRgb || !bgRgb) {
    return { ratio: 0, passes: false, required: level === 'AAA' ? 7 : 4.5 };
  }

  const fgLum = relativeLuminance(...fgRgb);
  const bgLum = relativeLuminance(...bgRgb);
  const ratio = contrastRatio(fgLum, bgLum);

  let required: number;
  if (level === 'AAA') {
    required = size === 'large' ? 4.5 : 7;
  } else {
    required = size === 'large' ? 3 : 4.5;
  }

  return { ratio: Math.round(ratio * 100) / 100, passes: ratio >= required, required };
}

/**
 * 批量检查多组颜色
 */
export function auditColorContrast(
  pairs: Array<{ fg: string; bg: string; name: string }>,
  level: 'AA' | 'AAA' = 'AA'
): Array<{ name: string; ratio: number; passes: boolean; required: number }> {
  return pairs.map(({ fg, bg, name }) => ({
    name,
    ...checkContrast(fg, bg, level),
  }));
}

// ==================== 焦点管理 ====================

/**
 * 焦点陷阱 Hook
 */
export function useFocusTrap(active: boolean = true) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active || !containerRef.current) return;

    const container = containerRef.current;
    const focusable = container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    first.focus();

    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [active]);

  return containerRef;
}

/**
 * 返回焦点 Hook - 关闭弹窗后恢复焦点
 */
export function useReturnFocus() {
  const previousFocus = useRef<HTMLElement | null>(null);

  const saveFocus = useCallback(() => {
    previousFocus.current = document.activeElement as HTMLElement;
  }, []);

  const restoreFocus = useCallback(() => {
    previousFocus.current?.focus();
  }, []);

  return { saveFocus, restoreFocus };
}

/**
 * 跳转链接
 */
export function SkipLink({ targetId = 'main-content' }: { targetId?: string }) {
  return React.createElement('a', {
    href: `#${targetId}`,
    className: 'skip-link',
    style: {
      position: 'absolute',
      top: -40,
      left: 0,
      background: '#3B82F6',
      color: 'white',
      padding: '8px 16px',
      zIndex: 9999,
      transition: 'top 0.2s',
      borderRadius: '0 0 6px 0',
      fontWeight: 600,
    },
    onFocus: (e: React.FocusEvent) => {
      (e.target as HTMLElement).style.top = '0';
    },
    onBlur: (e: React.FocusEvent) => {
      (e.target as HTMLElement).style.top = '-40px';
    },
  }, '跳转到主内容');
}

// ==================== 屏幕阅读器 ====================

/**
 * 实时区域
 */
export function LiveRegion({
  message,
  politeness = 'polite',
}: {
  message: string;
  politeness?: 'polite' | 'assertive' | 'off';
}) {
  return React.createElement('div', {
    role: 'status',
    'aria-live': politeness,
    'aria-atomic': 'true',
    className: 'sr-only',
  }, message);
}

/**
 * 播报消息 Hook
 */
export function useAnnounce() {
  const [message, setMessage] = useState('');

  const announce = useCallback((text: string, _politeness: 'polite' | 'assertive' = 'polite') => {
    setMessage('');
    requestAnimationFrame(() => setMessage(text));
  }, []);

  return { message, announce };
}

/**
 * 表单验证错误播报
 */
export function useFormErrorAnnounce() {
  const { announce, message } = useAnnounce();

  const announceErrors = useCallback((errors: Record<string, string>) => {
    const errorMessages = Object.values(errors);
    if (errorMessages.length > 0) {
      announce(`表单有 ${errorMessages.length} 个错误: ${errorMessages.join(', ')}`, 'assertive');
    }
  }, [announce]);

  const announceSuccess = useCallback((text: string = '操作成功') => {
    announce(text, 'polite');
  }, [announce]);

  return { announceErrors, announceSuccess, message };
}

// ==================== 高对比度模式 ====================

interface HighContrastContextType {
  enabled: boolean;
  toggle: () => void;
}

const HighContrastContext = createContext<HighContrastContextType>({
  enabled: false,
  toggle: () => {},
});

export function useHighContrast() {
  return useContext(HighContrastContext);
}

export function HighContrastProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(() => {
    return localStorage.getItem('high-contrast') === 'true';
  });

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      localStorage.setItem('high-contrast', String(next));
      document.documentElement.setAttribute('data-high-contrast', String(next));
      return next;
    });
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-high-contrast', String(enabled));
  }, [enabled]);

  return React.createElement(
    HighContrastContext.Provider,
    { value: { enabled, toggle } },
    children
  );
}

// ==================== 键盘导航 ====================

/**
 * 方向键导航 Hook
 */
export function useArrowNavigation(
  containerRef: React.RefObject<HTMLElement>,
  itemSelector: string,
  options: { loop?: boolean; orientation?: 'horizontal' | 'vertical' | 'both' } = {}
) {
  const { loop = true, orientation = 'vertical' } = options;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const items = Array.from(container.querySelectorAll<HTMLElement>(itemSelector));
      const current = document.activeElement as HTMLElement;
      const idx = items.indexOf(current);
      if (idx === -1) return;

      let nextIdx = idx;
      const isVertical = orientation !== 'horizontal';
      const isHorizontal = orientation !== 'vertical';

      switch (e.key) {
        case 'ArrowDown':
          if (!isVertical) return;
          e.preventDefault();
          nextIdx = idx + 1;
          break;
        case 'ArrowUp':
          if (!isVertical) return;
          e.preventDefault();
          nextIdx = idx - 1;
          break;
        case 'ArrowRight':
          if (!isHorizontal) return;
          e.preventDefault();
          nextIdx = idx + 1;
          break;
        case 'ArrowLeft':
          if (!isHorizontal) return;
          e.preventDefault();
          nextIdx = idx - 1;
          break;
        case 'Home':
          e.preventDefault();
          nextIdx = 0;
          break;
        case 'End':
          e.preventDefault();
          nextIdx = items.length - 1;
          break;
        default:
          return;
      }

      if (loop) {
        nextIdx = (nextIdx + items.length) % items.length;
      } else {
        nextIdx = Math.max(0, Math.min(nextIdx, items.length - 1));
      }

      items[nextIdx]?.focus();
    };

    container.addEventListener('keydown', handleKeyDown);
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [containerRef, itemSelector, loop, orientation]);
}

/**
 * Roving Tabindex Hook
 * 管理一组元素的 tabindex，只有一个可 tab 到
 */
export function useRovingTabindex(
  containerRef: React.RefObject<HTMLElement>,
  itemSelector: string
) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const items = () => Array.from(container.querySelectorAll<HTMLElement>(itemSelector));

    // 初始设置：第一个可 tab，其余不可
    const initItems = items();
    initItems.forEach((el, i) => {
      el.setAttribute('tabindex', i === 0 ? '0' : '-1');
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      const allItems = items();
      const current = document.activeElement as HTMLElement;
      const idx = allItems.indexOf(current);
      if (idx === -1) return;

      let nextIdx = idx;
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          e.preventDefault();
          nextIdx = (idx + 1) % allItems.length;
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault();
          nextIdx = (idx - 1 + allItems.length) % allItems.length;
          break;
        default:
          return;
      }

      current.setAttribute('tabindex', '-1');
      allItems[nextIdx].setAttribute('tabindex', '0');
      allItems[nextIdx].focus();
    };

    container.addEventListener('keydown', handleKeyDown);
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [containerRef, itemSelector]);
}

// ==================== 减弱动画 ====================

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return reduced;
}

// ==================== 可访问性审计 ====================

/**
 * 页面可访问性快速审计
 */
export interface A11yIssue {
  type: 'error' | 'warning' | 'info';
  rule: string;
  message: string;
  element?: string;
}

export function auditPageAccessibility(): A11yIssue[] {
  const issues: A11yIssue[] = [];

  // 检查图片 alt
  document.querySelectorAll('img:not([alt])').forEach((el) => {
    issues.push({
      type: 'error',
      rule: 'img-alt',
      message: '图片缺少 alt 属性',
      element: (el as HTMLImageElement).src,
    });
  });

  // 检查表单 label
  document.querySelectorAll('input:not([type="hidden"]):not([aria-label]):not([aria-labelledby])').forEach((el) => {
    const id = (el as HTMLInputElement).id;
    if (!id || !document.querySelector(`label[for="${id}"]`)) {
      issues.push({
        type: 'error',
        rule: 'form-label',
        message: '表单控件缺少 label 或 aria-label',
        element: (el as HTMLInputElement).name || 'unknown',
      });
    }
  });

  // 检查链接文本
  document.querySelectorAll('a').forEach((el) => {
    const text = el.textContent?.trim();
    const ariaLabel = el.getAttribute('aria-label');
    if (!text && !ariaLabel && !el.querySelector('img[alt]')) {
      issues.push({
        type: 'error',
        rule: 'link-name',
        message: '链接缺少可访问名称',
        element: el.href,
      });
    }
  });

  // 检查按钮文本
  document.querySelectorAll('button').forEach((el) => {
    const text = el.textContent?.trim();
    const ariaLabel = el.getAttribute('aria-label');
    if (!text && !ariaLabel) {
      issues.push({
        type: 'error',
        rule: 'button-name',
        message: '按钮缺少可访问名称',
        element: el.className,
      });
    }
  });

  // 检查 heading 层级
  const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
  let lastLevel = 0;
  headings.forEach((h) => {
    const level = parseInt(h.tagName[1], 10);
    if (level - lastLevel > 1 && lastLevel > 0) {
      issues.push({
        type: 'warning',
        rule: 'heading-order',
        message: `标题层级跳跃: h${lastLevel} → h${level}`,
        element: h.textContent?.slice(0, 50),
      });
    }
    lastLevel = level;
  });

  // 检查 lang 属性
  if (!document.documentElement.getAttribute('lang')) {
    issues.push({
      type: 'error',
      rule: 'html-lang',
      message: 'html 元素缺少 lang 属性',
    });
  }

  return issues;
}

/**
 * ARIA 有效性检查
 */
export function validateAria(element: HTMLElement): string[] {
  const errors: string[] = [];

  const role = element.getAttribute('role');
  if (role) {
    // 检查 required properties
    if (role === 'checkbox' && !element.hasAttribute('aria-checked')) {
      errors.push('role="checkbox" 需要 aria-checked');
    }
    if (role === 'tab' && !element.hasAttribute('aria-selected')) {
      errors.push('role="tab" 需要 aria-selected');
    }
  }

  // aria-hidden 不应包含可聚焦元素
  if (element.getAttribute('aria-hidden') === 'true') {
    const focusable = element.querySelectorAll('button, a, input, select, textarea, [tabindex]');
    if (focusable.length > 0) {
      errors.push('aria-hidden="true" 的元素不应包含可聚焦元素');
    }
  }

  return errors;
}

// ==================== 可访问性配置 ====================

/**
 * 用户可访问性偏好
 */
export interface A11yPreferences {
  reducedMotion: boolean;
  highContrast: boolean;
  largeText: boolean;
  screenReaderOptimized: boolean;
  keyboardNavigation: boolean;
}

export function getSystemA11yPreferences(): A11yPreferences {
  return {
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    highContrast: window.matchMedia('(prefers-contrast: more)').matches,
    largeText: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    screenReaderOptimized: false,
    keyboardNavigation: true,
  };
}

/**
 * 检测是否使用键盘导航
 */
export function useKeyboardUser() {
  const [isKeyboard, setIsKeyboard] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab') setIsKeyboard(true);
    };
    const onMouse = () => setIsKeyboard(false);

    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onMouse);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onMouse);
    };
  }, []);

  return isKeyboard;
}
