/**
 * 可访问性增强引擎
 * ARIA属性管理、键盘导航、屏幕阅读器支持、色彩对比度检查
 */

// ==================== 类型定义 ====================

export interface AriaAttributes {
  role?: string;
  label?: string;
  labelledBy?: string;
  describedBy?: string;
  hidden?: boolean;
  expanded?: boolean;
  selected?: boolean;
  checked?: boolean | 'mixed';
  disabled?: boolean;
  readonly?: boolean;
  required?: boolean;
  invalid?: boolean;
  live?: 'polite' | 'assertive' | 'off';
  atomic?: boolean;
  busy?: boolean;
  current?: boolean | 'page' | 'step' | 'location' | 'date' | 'time';
  hasPopup?: boolean | 'menu' | 'listbox' | 'tree' | 'grid' | 'dialog';
  controls?: string;
  owns?: string;
  flowTo?: string;
  level?: number;
  posInSet?: number;
  setSize?: number;
  valueMin?: number;
  valueMax?: number;
  valueNow?: number;
  valueText?: string;
}

export interface KeyboardShortcut {
  key: string;
  modifiers?: Array<'ctrl' | 'alt' | 'shift' | 'meta'>;
  action: string;
  description: string;
  scope?: string;
}

export interface ColorContrastResult {
  ratio: number;
  passes: {
    AA_normal: boolean;
    AA_large: boolean;
    AAA_normal: boolean;
    AAA_large: boolean;
  };
  foreground: string;
  background: string;
}

export interface FocusManagementOptions {
  trapFocus: boolean;
  restoreFocus: boolean;
  initialFocus?: string; // selector
  escapeDeactivates: boolean;
}

// ==================== ARIA辅助 ====================

/**
 * 生成ARIA属性对象
 */
export function createAriaAttributes(attrs: AriaAttributes): Record<string, string | boolean | number> {
  const result: Record<string, string | boolean | number> = {};

  const mapping: Record<string, string> = {
    role: 'role',
    label: 'aria-label',
    labelledBy: 'aria-labelledby',
    describedBy: 'aria-describedby',
    hidden: 'aria-hidden',
    expanded: 'aria-expanded',
    selected: 'aria-selected',
    checked: 'aria-checked',
    disabled: 'aria-disabled',
    readonly: 'aria-readonly',
    required: 'aria-required',
    invalid: 'aria-invalid',
    live: 'aria-live',
    atomic: 'aria-atomic',
    busy: 'aria-busy',
    current: 'aria-current',
    hasPopup: 'aria-haspopup',
    controls: 'aria-controls',
    owns: 'aria-owns',
    flowTo: 'aria-flowto',
    level: 'aria-level',
    posInSet: 'aria-posinset',
    setSize: 'aria-setsize',
    valueMin: 'aria-valuemin',
    valueMax: 'aria-valuemax',
    valueNow: 'aria-valuenow',
    valueText: 'aria-valuetext',
  };

  for (const [key, ariaKey] of Object.entries(mapping)) {
    const value = attrs[key as keyof AriaAttributes];
    if (value !== undefined && value !== null) {
      result[ariaKey] = value;
    }
  }

  return result;
}

/**
 * 生成唯一ARIA ID
 */
let ariaIdCounter = 0;
export function generateAriaId(prefix: string = 'aria'): string {
  ariaIdCounter++;
  return `${prefix}-${ariaIdCounter}-${Date.now().toString(36)}`;
}

/**
 * 创建标签关联
 */
export function createLabelAssociation(
  inputId: string,
  labelId: string,
): { input: Record<string, string>; label: Record<string, string> } {
  return {
    input: { 'aria-labelledby': labelId, id: inputId },
    label: { for: inputId, id: labelId },
  };
}

/**
 * 创建描述关联
 */
export function createDescriptionAssociation(
  inputId: string,
  descId: string,
): { input: Record<string, string>; desc: Record<string, string> } {
  return {
    input: { 'aria-describedby': descId, id: inputId },
    desc: { id: descId, role: 'note' },
  };
}

// ==================== 色彩对比度 ====================

/**
 * 解析颜色为RGB
 */
export function parseColor(color: string): { r: number; g: number; b: number } | null {
  // Hex
  const hexMatch = color.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (hexMatch) {
    return {
      r: parseInt(hexMatch[1], 16),
      g: parseInt(hexMatch[2], 16),
      b: parseInt(hexMatch[3], 16),
    };
  }

  // 3-digit hex
  const shortHex = color.match(/^#?([a-f\d])([a-f\d])([a-f\d])$/i);
  if (shortHex) {
    return {
      r: parseInt(shortHex[1] + shortHex[1], 16),
      g: parseInt(shortHex[2] + shortHex[2], 16),
      b: parseInt(shortHex[3] + shortHex[3], 16),
    };
  }

  // rgb()
  const rgbMatch = color.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (rgbMatch) {
    return { r: parseInt(rgbMatch[1], 10), g: parseInt(rgbMatch[2], 10), b: parseInt(rgbMatch[3], 10) };
  }

  return null;
}

/**
 * 计算相对亮度
 */
export function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * 计算对比度
 */
export function calculateContrastRatio(color1: string, color2: string): number {
  const c1 = parseColor(color1);
  const c2 = parseColor(color2);
  if (!c1 || !c2) return 0;

  const l1 = relativeLuminance(c1.r, c1.g, c1.b);
  const l2 = relativeLuminance(c2.r, c2.g, c2.b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  return Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100;
}

/**
 * 检查WCAG色彩对比度
 */
export function checkColorContrast(
  foreground: string,
  background: string,
): ColorContrastResult {
  const ratio = calculateContrastRatio(foreground, background);

  return {
    ratio,
    passes: {
      AA_normal: ratio >= 4.5,
      AA_large: ratio >= 3,
      AAA_normal: ratio >= 7,
      AAA_large: ratio >= 4.5,
    },
    foreground,
    background,
  };
}

/**
 * 建议调整颜色以满足对比度
 */
export function suggestContrastFix(
  foreground: string,
  background: string,
  targetRatio: number = 4.5,
): string | null {
  const fg = parseColor(foreground);
  const bg = parseColor(background);
  if (!fg || !bg) return null;

  const bgLum = relativeLuminance(bg.r, bg.g, bg.b);

  // 尝试加深或加亮前景色
  for (let i = 0; i <= 255; i++) {
    // 加深
    const darker = {
      r: Math.max(0, fg.r - i),
      g: Math.max(0, fg.g - i),
      b: Math.max(0, fg.b - i),
    };
    const darkerLum = relativeLuminance(darker.r, darker.g, darker.b);
    const darkerRatio = (Math.max(bgLum, darkerLum) + 0.05) / (Math.min(bgLum, darkerLum) + 0.05);
    if (darkerRatio >= targetRatio) {
      return `#${darker.r.toString(16).padStart(2, '0')}${darker.g.toString(16).padStart(2, '0')}${darker.b.toString(16).padStart(2, '0')}`;
    }

    // 加亮
    const lighter = {
      r: Math.min(255, fg.r + i),
      g: Math.min(255, fg.g + i),
      b: Math.min(255, fg.b + i),
    };
    const lighterLum = relativeLuminance(lighter.r, lighter.g, lighter.b);
    const lighterRatio = (Math.max(bgLum, lighterLum) + 0.05) / (Math.min(bgLum, lighterLum) + 0.05);
    if (lighterRatio >= targetRatio) {
      return `#${lighter.r.toString(16).padStart(2, '0')}${lighter.g.toString(16).padStart(2, '0')}${lighter.b.toString(16).padStart(2, '0')}`;
    }
  }

  return null;
}

// ==================== 键盘导航 ====================

/**
 * 创建键盘快捷键映射
 */
export function createKeyboardMap(shortcuts: KeyboardShortcut[]): Map<string, KeyboardShortcut> {
  const map = new Map<string, KeyboardShortcut>();

  for (const shortcut of shortcuts) {
    const key = normalizeKey(shortcut);
    map.set(key, shortcut);
  }

  return map;
}

/**
 * 规范化按键组合
 */
export function normalizeKey(shortcut: KeyboardShortcut): string {
  const parts: string[] = [];
  if (shortcut.modifiers?.includes('ctrl')) parts.push('ctrl');
  if (shortcut.modifiers?.includes('alt')) parts.push('alt');
  if (shortcut.modifiers?.includes('shift')) parts.push('shift');
  if (shortcut.modifiers?.includes('meta')) parts.push('meta');
  parts.push(shortcut.key.toLowerCase());
  return parts.join('+');
}

/**
 * 匹配键盘事件
 */
export function matchKeyEvent(
  event: { key: string; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean },
  shortcut: KeyboardShortcut,
): boolean {
  const mods = shortcut.modifiers || [];
  return event.key.toLowerCase() === shortcut.key.toLowerCase()
    && event.ctrlKey === mods.includes('ctrl')
    && event.altKey === mods.includes('alt')
    && event.shiftKey === mods.includes('shift')
    && event.metaKey === mods.includes('meta');
}

/**
 * 获取键盘快捷键帮助文本
 */
export function formatShortcutHelp(shortcuts: KeyboardShortcut[]): Array<{ keys: string; description: string }> {
  return shortcuts.map(s => {
    const parts: string[] = [];
    if (s.modifiers?.includes('ctrl')) parts.push('Ctrl');
    if (s.modifiers?.includes('alt')) parts.push('Alt');
    if (s.modifiers?.includes('shift')) parts.push('Shift');
    if (s.modifiers?.includes('meta')) parts.push('⌘');
    parts.push(s.key.toUpperCase());

    return {
      keys: parts.join(' + '),
      description: s.description,
    };
  });
}

// ==================== 屏幕阅读器 ====================

/**
 * 生成屏幕阅读器公告
 */
export function createAnnouncement(
  message: string,
  priority: 'polite' | 'assertive' = 'polite',
): { message: string; priority: string; timestamp: number } {
  return { message, priority, timestamp: Date.now() };
}

/**
 * 格式化表格数据为屏幕阅读器文本
 */
export function formatTableForScreenReader(
  headers: string[],
  rows: string[][],
  caption?: string,
): string {
  const parts: string[] = [];

  if (caption) parts.push(caption);
  parts.push(`表格，${headers.length}列，${rows.length}行`);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const cells = row.map((cell, j) => `${headers[j] || `列${j + 1}`}: ${cell}`).join(', ');
    parts.push(`第${i + 1}行: ${cells}`);
  }

  return parts.join('. ');
}

/**
 * 简化列表为屏幕阅读器文本
 */
export function formatListForScreenReader(items: string[], ordered: boolean = false): string {
  const type = ordered ? '有序列表' : '无序列表';
  return `${type}，${items.length}项: ${items.join(', ')}`;
}

// ==================== 焦点管理 ====================

/**
 * 获取可聚焦元素列表
 */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const selector = [
    'a[href]', 'button:not([disabled])', 'input:not([disabled])',
    'select:not([disabled])', 'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])', '[contenteditable]',
  ].join(', ');

  return Array.from(container.querySelectorAll<HTMLElement>(selector));
}

/**
 * 焦点陷阱逻辑
 */
export function createFocusTrap(container: HTMLElement): {
  activate: () => void;
  deactivate: () => void;
  isActive: boolean;
} {
  let active = false;
  let previousFocus: HTMLElement | null = null;

  function activate() {
    active = true;
    previousFocus = document.activeElement as HTMLElement;
    const focusable = getFocusableElements(container);
    if (focusable.length > 0) focusable[0].focus();
  }

  function deactivate() {
    active = false;
    if (previousFocus) previousFocus.focus();
  }

  return { activate, deactivate, get isActive() { return active; } };
}

// ==================== 无障碍审计 ====================

/**
 * 基础无障碍审计（非DOM版本）
 */
export function auditAccessibility(): {
  score: number;
  checks: Array<{ name: string; passed: boolean; message: string }>;
} {
  const checks: Array<{ name: string; passed: boolean; message: string }> = [];
  let score = 100;

  // 颜色对比度（检查常见配色）
  const commonPairs = [
    ['#333333', '#ffffff', '深色文字/白色背景'],
    ['#666666', '#ffffff', '中灰文字/白色背景'],
    ['#ff4444', '#ffffff', '红色/白色'],
    ['#00aa00', '#ffffff', '绿色/白色'],
  ];

  for (const [fg, bg, desc] of commonPairs) {
    const result = checkColorContrast(fg, bg);
    const passed = result.passes.AA_normal;
    checks.push({ name: `色彩对比: ${desc}`, passed, message: `比率: ${result.ratio}:1` });
    if (!passed) score -= 10;
  }

  return { score: Math.max(0, score), checks };
}
