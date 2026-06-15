/**
 * 共享主题常量 — 使用 CSS 变量
 * 所有页面引用此文件，不再硬编码颜色
 */

export const THEME = {
  // 页面背景
  bg: 'var(--bg-page)',
  // 卡片背景
  cardBg: 'var(--bg-card)',
  // 表面/次级背景
  surface: 'var(--bg-surface)',
  // 边框
  border: 'var(--border)',
  // 主文本
  text: 'var(--text)',
  // 次级文本
  textSec: 'var(--text-secondary)',
  // 弱化文本
  textMuted: 'var(--text-muted)',
  // 强调色
  accent: 'var(--accent)',
  // 涨
  up: 'var(--up)',
  // 跌
  down: 'var(--down)',
  // 平
  flat: 'var(--flat)',
} as const;

// 兼容旧代码的别名
export const BG = THEME.bg;
export const CARD_BG = THEME.cardBg;
export const BORDER = THEME.border;
export const TEXT = THEME.text;
export const TEXT_SEC = THEME.textSec;
export const COLOR_UP = THEME.up;
export const COLOR_DOWN = THEME.down;
export const ACCENT = THEME.accent;
export const GOLD = '#f59e0b';
