/**
 * 主题Provider v2
 * 使用antd ConfigProvider暗色主题 + 全局CSS变量
 * 页面不再需要手动设置深色背景
 */

import React, { useEffect } from 'react';
import { useResolvedTheme } from '../../store/useAppStore';
import { ConfigProvider, theme as antdTheme } from 'antd';
import zhCN from 'antd/locale/zh_CN';

interface ThemeProviderProps {
  children: React.ReactNode;
}

const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const resolvedTheme = useResolvedTheme();
  const isDark = resolvedTheme === 'dark';

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
    document.documentElement.style.setProperty('color-scheme', resolvedTheme);
    document.body.classList.toggle('dark', isDark);

    // 全局背景色
    document.body.style.background = isDark ? '#0a0e1a' : '#f5f5f7';
    document.body.style.color = isDark ? '#f1f5f9' : '#111827';
    document.body.style.margin = '0';

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', isDark ? '#0a0e1a' : '#ffffff');
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
          colorWarning: '#F59E0B',
          borderRadius: 8,
          fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif",
          ...(isDark && {
            colorBgContainer: '#111827',
            colorBgElevated: '#1e293b',
            colorBgLayout: '#0a0e1a',
            colorBgSpotlight: '#1e293b',
            colorBorder: '#2d3748',
            colorBorderSecondary: '#374151',
            colorText: '#f1f5f9',
            colorTextSecondary: '#94a3b8',
            colorTextTertiary: '#64748b',
            colorTextQuaternary: '#475569',
            colorFill: '#1e293b',
            colorFillSecondary: '#374151',
            colorFillTertiary: '#2d3748',
            colorFillQuaternary: '#1e293b',
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            boxShadowSecondary: '0 4px 12px rgba(0,0,0,0.4)',
          }),
        },
        components: {
          Table: {
            ...(isDark && {
              headerBg: '#0f172a',
              headerColor: '#94a3b8',
              rowHoverBg: '#1e293b',
              colorBgContainer: '#111827',
              borderColor: '#2d3748',
              headerBorderRadius: 0,
            }),
          },
          Card: {
            ...(isDark && {
              colorBgContainer: '#111827',
              colorBorderSecondary: '#2d3748',
            }),
          },
          Menu: {
            ...(isDark && {
              itemBg: 'transparent',
              subMenuItemBg: 'transparent',
              itemSelectedBg: '#1e3a5f',
              itemHoverBg: '#1e293b',
            }),
          },
          Input: {
            ...(isDark && {
              colorBgContainer: '#0f172a',
              colorBorder: '#2d3748',
              activeBorderColor: '#3b82f6',
            }),
          },
          Select: {
            ...(isDark && {
              colorBgContainer: '#0f172a',
              colorBorder: '#2d3748',
            }),
          },
          Modal: {
            ...(isDark && {
              contentBg: '#111827',
              headerBg: '#111827',
              titleColor: '#f1f5f9',
            }),
          },
          Tag: {
            ...(isDark && {
              defaultBg: '#1e293b',
              defaultColor: '#94a3b8',
            }),
          },
          Spin: {
            ...(isDark && {
              colorPrimary: '#3b82f6',
            }),
          },
          Empty: {
            ...(isDark && {
              colorTextDescription: '#64748b',
            }),
          },
          Pagination: {
            ...(isDark && {
              colorBgContainer: '#111827',
              colorBorder: '#2d3748',
              itemActiveBg: '#3b82f6',
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
