/**
 * ThemeToggle — 主题切换按钮
 * 使用 Zustand store 管理主题状态
 */

import React from 'react';
import { useAppStore } from '../../store/useAppStore';

export const ThemeToggle: React.FC = () => {
  const theme = useAppStore((s) => s.preferences.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const isDark = theme === 'dark';

  const toggleTheme = () => {
    setTheme(isDark ? 'light' : 'dark');
  };

  return (
    <button
      className="theme-toggle-button"
      onClick={toggleTheme}
      aria-label={isDark ? '切换到浅色模式' : '切换到深色模式'}
      title={isDark ? '切换到浅色模式' : '切换到深色模式'}
      style={{
        position: 'fixed',
        bottom: 24,
        left: 24,
        zIndex: 1000,
        width: 36,
        height: 36,
        borderRadius: 18,
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 16,
        transition: 'all 0.2s ease',
        background: isDark ? 'rgba(30, 41, 59, 0.9)' : 'rgba(255, 255, 255, 0.9)',
        color: isDark ? '#f59e0b' : '#3b82f6',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'scale(1.1)';
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.25)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.15)';
      }}
    >
      {isDark ? '☀️' : '🌙'}
    </button>
  );
};

export default ThemeToggle;
