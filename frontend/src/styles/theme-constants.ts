/**
 * 共享主题常量 — 使用 CSS 变量
 * 变量名与 design-system.css 一致
 */

export const THEME = {
  bg: 'var(--bg-base)',
  cardBg: 'var(--card-bg)',
  surface: 'var(--bg-secondary)',
  border: 'var(--border-default)',
  text: 'var(--text-primary)',
  textSec: 'var(--text-secondary)',
  textMuted: 'var(--text-tertiary)',
  accent: 'var(--accent-solid)',
  up: 'var(--color-up)',
  down: 'var(--color-down)',
  flat: 'var(--text-tertiary)',
} as const;

export const BG = THEME.bg;
export const CARD_BG = THEME.cardBg;
export const BORDER = THEME.border;
export const TEXT = THEME.text;
export const TEXT_SEC = THEME.textSec;
export const COLOR_UP = THEME.up;
export const COLOR_DOWN = THEME.down;
export const ACCENT = THEME.accent;
export const GOLD = '#f59e0b';
