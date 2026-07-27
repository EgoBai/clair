/**
 * 键盘快捷键 Hook
 * 支持搜索聚焦、切换股票、返回、主题切换等
 * 集成快捷键引擎，支持序列键(g h, g s 等)
 * 参考雪球/TradingView快捷键设计
 */

import { useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

export interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  action: () => void;
  description: string;
  preventDefault?: boolean;
}

interface UseKeyboardShortcutsOptions {
  onSearchFocus?: () => void;
  onEscape?: () => void;
  onToggleTheme?: () => void;
  enabled?: boolean;
}

/**
 * 全局快捷键注册
 */
export function useKeyboardShortcuts(options: UseKeyboardShortcutsOptions = {}) {
  const { onSearchFocus, onEscape, onToggleTheme, enabled = true } = options;
  const navigate = useNavigate();
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;

      // 忽略输入框中的按键（除非是 Escape）
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      // Escape - 关闭弹窗/取消搜索
      if (e.key === 'Escape') {
        if (isInput) {
          (target as HTMLInputElement).blur();
        }
        onEscape?.();
        return;
      }

      // 在输入框中不响应其他快捷键
      if (isInput) return;

      // Ctrl/Cmd + K - 聚焦搜索
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        onSearchFocus?.();
        return;
      }

      // / - 聚焦搜索（同 GitHub）
      if (e.key === '/' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        onSearchFocus?.();
        return;
      }

      // Alt + 数字 - 快速导航
      if (e.altKey) {
        switch (e.key) {
          case '1':
            e.preventDefault();
            navigate('/');
            return;
          case '2':
            e.preventDefault();
            navigate('/stocks');
            return;
          case '3':
            e.preventDefault();
            navigate('/market');
            return;
          case '4':
            e.preventDefault();
            navigate('/watchlist');
            return;
          case '5':
            e.preventDefault();
            navigate('/backtest');
            return;
          case '6':
            e.preventDefault();
            navigate('/screener');
            return;
        }
      }

      // Alt + T - 切换主题
      if (e.altKey && e.key === 't') {
        e.preventDefault();
        onToggleTheme?.();
        return;
      }

      // Alt + S - 切换侧边栏
      if (e.altKey && e.key === 's') {
        e.preventDefault();
        document.dispatchEvent(new CustomEvent('toggle-sidebar'));
        return;
      }

      // G 然后 H/S/M/W 跳转（GitHub 风格）
      // J/K 上下导航列表
      // Backspace - 返回上一页（非输入框）
      if (e.key === 'Backspace') {
        e.preventDefault();
        navigate(-1);
        return;
      }
    },
    [enabled, navigate, onSearchFocus, onEscape, onToggleTheme]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return { searchInputRef };
}

/**
 * 快捷键提示面板 Hook
 */
export function useShortcutHints() {
  return [
    { keys: ['⌘', 'K'], description: '聚焦搜索' },
    { keys: ['/'], description: '聚焦搜索' },
    { keys: ['Esc'], description: '关闭弹窗/取消' },
    { keys: ['Alt', '1'], description: '首页' },
    { keys: ['Alt', '2'], description: '股票列表' },
    { keys: ['Alt', '3'], description: '行情分析' },
    { keys: ['Alt', '4'], description: '自选股' },
    { keys: ['Alt', '5'], description: '策略回测' },
    { keys: ['Alt', '6'], description: 'AI 选股' },
    { keys: ['Alt', 'T'], description: '切换主题' },
    { keys: ['Alt', 'S'], description: '切换侧边栏' },
    { keys: ['⌫'], description: '返回上一页' },
    // 序列键
    { keys: ['g', 'h'], description: '跳转首页' },
    { keys: ['g', 's'], description: '跳转股票列表' },
    { keys: ['g', 'm'], description: '跳转行情' },
    { keys: ['g', 'w'], description: '跳转自选股' },
    { keys: ['g', 'p'], description: '跳转设置' },
    // 列表导航
    { keys: ['j', '↓'], description: '列表下移' },
    { keys: ['k', '↑'], description: '列表上移' },
    // 股票操作
    { keys: ['W'], description: '添加/移除自选' },
    { keys: ['B'], description: '买入' },
    { keys: ['S'], description: '卖出' },
  ];
}
