/**
 * 无障碍工具测试
 */
import { describe, it, expect } from 'vitest';

interface AriaConfig {
  role?: string;
  label?: string;
  describedBy?: string;
  expanded?: boolean;
  hidden?: boolean;
  live?: 'polite' | 'assertive' | 'off';
}

function buildAriaProps(config: AriaConfig): Record<string, string | boolean> {
  const props: Record<string, string | boolean> = {};
  if (config.role) props['role'] = config.role;
  if (config.label) props['aria-label'] = config.label;
  if (config.describedBy) props['aria-describedby'] = config.describedBy;
  if (config.expanded !== undefined) props['aria-expanded'] = config.expanded;
  if (config.hidden) props['aria-hidden'] = 'true';
  if (config.live) props['aria-live'] = config.live;
  return props;
}

function validateContrastRatio(fg: string, bg: string, level: 'AA' | 'AAA' = 'AA'): boolean {
  const fgLum = getRelativeLuminance(fg);
  const bgLum = getRelativeLuminance(bg);
  const ratio = (Math.max(fgLum, bgLum) + 0.05) / (Math.min(fgLum, bgLum) + 0.05);
  return level === 'AA' ? ratio >= 4.5 : ratio >= 7;
}

function getRelativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const srgb = [r, g, b].map(c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

function generateSkipLink(target: string, label: string): { href: string; text: string; className: string } {
  return { href: `#${target}`, text: label, className: 'skip-link' };
}

function isFocusable(element: { tag: string; disabled?: boolean; tabIndex?: number; hidden?: boolean }): boolean {
  if (element.hidden) return false;
  if (element.disabled) return false;
  if (element.tabIndex !== undefined && element.tabIndex < 0) return false;
  const focusableTags = ['a', 'button', 'input', 'select', 'textarea'];
  return focusableTags.includes(element.tag) || (element.tabIndex !== undefined && element.tabIndex >= 0);
}

function announceMessage(message: string, priority: 'polite' | 'assertive' = 'polite'): { message: string; priority: string; clearAfterMs: number } {
  return { message, priority, clearAfterMs: priority === 'assertive' ? 1000 : 5000 };
}

function trapFocus(container: HTMLElement, event: KeyboardEvent): void {
  // Simulated focus trap logic
  const focusable = container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  const first = focusable[0] as HTMLElement;
  const last = focusable[focusable.length - 1] as HTMLElement;
  if (event.shiftKey && document.activeElement === first) {
    last?.focus();
  } else if (document.activeElement === last) {
    first?.focus();
  }
}

describe('无障碍工具', () => {
  describe('ARIA属性构建', () => {
    it('role属性', () => {
      const props = buildAriaProps({ role: 'button' });
      expect(props['role']).toBe('button');
    });

    it('label属性', () => {
      const props = buildAriaProps({ label: '关闭' });
      expect(props['aria-label']).toBe('关闭');
    });

    it('describedBy属性', () => {
      const props = buildAriaProps({ describedBy: 'help-text' });
      expect(props['aria-describedby']).toBe('help-text');
    });

    it('expanded属性', () => {
      expect(buildAriaProps({ expanded: true })['aria-expanded']).toBe(true);
      expect(buildAriaProps({ expanded: false })['aria-expanded']).toBe(false);
    });

    it('hidden属性', () => {
      const props = buildAriaProps({ hidden: true });
      expect(props['aria-hidden']).toBe('true');
    });

    it('live region', () => {
      const props = buildAriaProps({ live: 'assertive' });
      expect(props['aria-live']).toBe('assertive');
    });

    it('空配置返回空对象', () => {
      expect(Object.keys(buildAriaProps({}))).toHaveLength(0);
    });
  });

  describe('颜色对比度', () => {
    it('黑白通过AA', () => {
      expect(validateContrastRatio('#000000', '#ffffff', 'AA')).toBe(true);
    });

    it('黑白通过AAA', () => {
      expect(validateContrastRatio('#000000', '#ffffff', 'AAA')).toBe(true);
    });

    it('浅灰白底不通过AA', () => {
      expect(validateContrastRatio('#cccccc', '#ffffff', 'AA')).toBe(false);
    });

    it('深蓝白底通过AA', () => {
      expect(validateContrastRatio('#1a1a6c', '#ffffff', 'AA')).toBe(true);
    });
  });

  describe('跳转链接', () => {
    it('生成跳转链接结构', () => {
      const link = generateSkipLink('main-content', '跳转到主要内容');
      expect(link.href).toBe('#main-content');
      expect(link.text).toBe('跳转到主要内容');
      expect(link.className).toBe('skip-link');
    });
  });

  describe('焦点管理', () => {
    it('可聚焦元素识别', () => {
      expect(isFocusable({ tag: 'button' })).toBe(true);
      expect(isFocusable({ tag: 'a' })).toBe(true);
      expect(isFocusable({ tag: 'input' })).toBe(true);
      expect(isFocusable({ tag: 'div' })).toBe(false);
    });

    it('禁用元素不可聚焦', () => {
      expect(isFocusable({ tag: 'button', disabled: true })).toBe(false);
    });

    it('隐藏元素不可聚焦', () => {
      expect(isFocusable({ tag: 'button', hidden: true })).toBe(false);
    });

    it('负tabIndex不可聚焦', () => {
      expect(isFocusable({ tag: 'div', tabIndex: -1 })).toBe(false);
    });

    it('正tabIndex可聚焦', () => {
      expect(isFocusable({ tag: 'div', tabIndex: 0 })).toBe(true);
    });
  });

  describe('屏幕阅读器播报', () => {
    it('polite播报', () => {
      const result = announceMessage('加载完成', 'polite');
      expect(result.priority).toBe('polite');
      expect(result.message).toBe('加载完成');
    });

    it('assertive播报', () => {
      const result = announceMessage('错误', 'assertive');
      expect(result.priority).toBe('assertive');
    });

    it('assertive清空时间更短', () => {
      const polite = announceMessage('x', 'polite');
      const assertive = announceMessage('x', 'assertive');
      expect(assertive.clearAfterMs).toBeLessThan(polite.clearAfterMs);
    });
  });
});
