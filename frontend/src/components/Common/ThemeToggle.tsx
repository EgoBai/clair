/**
 * ThemeToggle — 主题切换按钮
 * 
 * 放置在页面左下角，点击切换深色/浅色模式
 * - 深色模式：投资应用标准，减少视觉疲劳
 * - 浅色模式：明亮清爽，适合白天使用
 * - 自动保存到 localStorage
 */

import React, { useEffect, useState, useCallback } from 'react';

type Theme = 'dark' | 'light';

const THEME_KEY = 'clair-theme';

/** 获取初始主题 */
function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  // 默认深色（投资应用标准）
  return 'dark';
}

/** 应用主题到 DOM */
function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  // 更新 meta theme-color
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', theme === 'dark' ? '#0a0e1a' : '#ffffff');
  }
}

export const ThemeToggle: React.FC = () => {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  // 初始化主题
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // 监听系统主题变化
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      // 只有用户未手动设置时才跟随系统
      const saved = localStorage.getItem(THEME_KEY);
      if (!saved) {
        const newTheme = e.matches ? 'dark' : 'light';
        setTheme(newTheme);
      }
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem(THEME_KEY, next);
      applyTheme(next);
      return next;
    });
  }, []);

  return (
    <button
      className="theme-toggle-button"
      onClick={toggleTheme}
      aria-label={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
      title={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
      style={{
        position: 'fixed',
        bottom: 24,
        left: 24,
        zIndex: 1000,
        width: 40,
        height: 40,
        borderRadius: 20,
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 18,
        transition: 'all 0.2s ease',
        background: theme === 'dark' ? 'rgba(30, 41, 59, 0.9)' : 'rgba(255, 255, 255, 0.9)',
        color: theme === 'dark' ? '#f59e0b' : '#3b82f6',
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
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  );
};

export default ThemeToggle;
