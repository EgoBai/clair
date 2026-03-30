/**
 * 主题Provider
 * 支持 light / dark / system 三种模式
 */

import React, { useEffect } from 'react';
import { useAppStore, useResolvedTheme } from '../../store/useAppStore';
import { ConfigProvider, theme as antdTheme } from 'antd';
import zhCN from 'antd/locale/zh_CN';

interface ThemeProviderProps {
  children: React.ReactNode;
}

const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const resolvedTheme = useResolvedTheme();
  const isDark = resolvedTheme === 'dark';

  // 应用到 document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
    document.body.classList.toggle('dark', isDark);
    // 更新 meta theme-color
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', isDark ? '#1a1a2e' : '#ffffff');
    }
  }, [resolvedTheme, isDark]);

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: '#3B82F6',
          colorError: '#EF4444',
          colorSuccess: '#22C55E',
          borderRadius: 8,
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
          ...(isDark && {
            colorBgContainer: '#16213e',
            colorBgElevated: '#1a1a2e',
            colorBgLayout: '#0f0f23',
            colorBorder: '#2a2a4a',
            colorText: '#e0e0e0',
            colorTextSecondary: '#a0a0b0',
          }),
        },
        components: {
          Table: {
            ...(isDark && {
              rowHoverBg: '#1e2a4a',
              headerBg: '#16213e',
            }),
          },
          Card: {
            ...(isDark && {
              colorBgContainer: '#16213e',
            }),
          },
          Menu: {
            ...(isDark && {
              itemBg: 'transparent',
              subMenuItemBg: 'transparent',
            }),
          },
        },
      }}
    >
      {children}
    </ConfigProvider>
  );
};

export default ThemeProvider;
