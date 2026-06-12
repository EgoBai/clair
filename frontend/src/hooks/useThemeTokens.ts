/**
 * useThemeTokens — 统一设计token hook
 * 所有页面通过此hook获取颜色，不再各自定义常量
 */

import { theme as antdTheme } from 'antd';
import { useResolvedTheme } from '../store/useAppStore';

export function useThemeTokens() {
  const resolvedTheme = useResolvedTheme();
  const isDark = resolvedTheme === 'dark';

  if (isDark) {
    return {
      isDark: true,
      // 背景层级
      bgPage: '#0a0e1a',
      bgCard: '#111827',
      bgSurface: '#1e293b',
      bgInput: '#0f172a',
      // 边框
      border: '#2d3748',
      borderLight: '#374151',
      // 文字
      text: '#f1f5f9',
      textSecondary: '#94a3b8',
      textMuted: '#64748b',
      // 功能色
      accent: '#3b82f6',
      accentLight: '#60a5fa',
      success: '#22c55e',
      danger: '#ef4444',
      warning: '#f59e0b',
      gold: '#f59e0b',
      // A股涨跌色
      up: '#ef4444',
      down: '#22c55e',
      flat: '#6b7280',
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
