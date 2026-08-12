/**
 * useThemeTokens — 统一设计token hook
 * 所有页面通过此hook获取颜色，不再各自定义常量
 */

import { useResolvedTheme } from '../store/useAppStore';
import { colors } from '../styles/theme';

export function useThemeTokens() {
  const resolvedTheme = useResolvedTheme();
  const isDark = resolvedTheme === 'dark';

  if (isDark) {
    // 暗色分支直接复用 styles/theme.ts 单一令牌源，避免重复硬编码
    return {
      isDark: true,
      // 背景层级
      bgPage: colors.page,
      bgCard: colors.card,
      bgSurface: colors.surface,
      bgInput: '#0f172a',
      // 边框
      border: colors.border,
      borderLight: colors.borderLight,
      // 文字
      text: colors.text,
      textSecondary: colors.textSecondary,
      textMuted: colors.textMuted,
      // 功能色
      accent: colors.accent,
      accentLight: colors.accentLight,
      success: colors.success,
      danger: colors.danger,
      warning: colors.warning,
      gold: colors.gold,
      // A股涨跌色
      up: colors.up,
      down: colors.down,
      flat: colors.flat,
    } as const;
  }

  return {
    isDark: false,
    bgPage: '#f5f5f7',
    bgCard: '#ffffff',
    bgSurface: '#f0f0f0',
    bgInput: '#ffffff',
    border: '#e5e7eb',
    borderLight: '#d1d5db',
    text: '#111827',
    textSecondary: '#6b7280',
    textMuted: '#9ca3af',
    accent: '#3b82f6',
    accentLight: '#60a5fa',
    success: '#22c55e',
    danger: '#ef4444',
    warning: '#f59e0b',
    gold: '#f59e0b',
    up: '#ef4444',
    down: '#22c55e',
    flat: '#6b7280',
  } as const;
}

export type ThemeTokens = ReturnType<typeof useThemeTokens>;
