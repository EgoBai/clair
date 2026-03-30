/**
 * 无障碍 (Accessibility) 工具
 * WCAG 2.1 AA 标准合规
 */

import React, { useEffect, useRef, useCallback, createContext, useContext, useState } from 'react';

// ==================== ARIA 工具 ====================

/**
 * 生成唯一 ID 用于 ARIA 关联
 */
let idCounter = 0;
export function useAriaId(prefix: string = 'aria'): string {
  const [id] = useState(() => `${prefix}-${++idCounter}`);
  return id;
}

/**
 * ARIA 属性生成器
 */
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

// ==================== 焦点管理 ====================

/**
 * 焦点陷阱 Hook - 将焦点限制在指定容器内
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
 * 跳转链接 - 快速跳过导航到主内容
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
 * 实时区域 - 用于动态内容播报
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
    style: {
      position: 'absolute',
      width: 1,
      height: 1,
      padding: 0,
      margin: -1,
      overflow: 'hidden',
      clip: 'rect(0, 0, 0, 0)',
      whiteSpace: 'nowrap',
      border: 0,
    },
  }, message);
}

/**
 * 播报消息 Hook
 */
export function useAnnounce() {
  const [message, setMessage] = useState('');

  const announce = useCallback((text: string, politeness: 'polite' | 'assertive' = 'polite') => {
    setMessage('');
    requestAnimationFrame(() => setMessage(text));
  }, []);

  return { message, announce };
}

// ==================== 高对比度模式 ====================

/**
 * 高对比度模式上下文
 */
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
 * 方向键导航 Hook - 用于列表/表格中的方向键移动焦点
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

// ==================== 减弱动画 ====================

/**
 * 检测用户是否偏好减弱动画
 */
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
