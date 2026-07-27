/**
 * 主题 Provider v3 — 令牌收敛（D7 P0）
 *
 * 设计令牌唯一真相源 = `styles/design-system.css` 的 CSS 变量。
 * antd ConfigProvider 改为「读取 CSS 变量」映射：
 *   - 不再硬编码 hex（消除与自定义 CSS 组件的数值漂移，如 #111827 vs #0d1117）
 *   - 暗/亮由 [data-theme] 切换语义变量，本组件在主题变更后重读并喂给 antd
 *   - 始终使用 defaultAlgorithm：令牌值已由 [data-theme] 切到对应主题，
 *     避免 darkAlgorithm 二次推算导致背景再次变暗，保证 antd 与自定义 CSS 一致
 *
 * 参考：design/frontend-modernization-strategy.md §2.4 / P0 表
 */

import React, { useLayoutEffect, useState } from 'react';
import { useResolvedTheme } from '../../store/useAppStore';
import { ConfigProvider, theme as antdTheme, type ThemeConfig } from 'antd';
import zhCN from 'antd/locale/zh_CN';

interface ThemeProviderProps {
  children: React.ReactNode;
}

const FALLBACK_FONT =
  "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif";

/** 读取 :root / [data-theme] 上的 CSS 变量；缺失时回退到旧硬编码值，保证视觉不退步 */
function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined' || !window.document) return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

/** 读取像素类变量（如 --radius-md: 10px → 10） */
function cssVarPx(name: string, fallback: number): number {
  const raw = cssVar(name, `${fallback}px`);
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * 依据当前生效的 CSS 变量构建 antd 主题配置。
 * 所有颜色/间距/圆角/字体均来自 design-system.css，实现「antd 读 CSS 变量」。
 */
function buildClairTheme(): ThemeConfig {
  const primary = cssVar('--accent-solid', '#3B82F6');
  const up = cssVar('--color-up', '#EF4444');
  const down = cssVar('--color-down', '#22C55E');
  const warning = cssVar('--color-warning', '#F59E0B');

  return {
    algorithm: antdTheme.defaultAlgorithm,
    token: {
      colorPrimary: primary,
      colorInfo: primary,
      colorSuccess: down,
      colorError: up,
      colorWarning: warning,
      borderRadius: cssVarPx('--radius-md', 10),
      fontFamily: cssVar('--font-body', FALLBACK_FONT),

      colorBgBase: cssVar('--bg-base', '#f8f9fc'),
      colorBgContainer: cssVar('--bg-primary', '#ffffff'),
      colorBgElevated: cssVar('--bg-elevated', '#ffffff'),
      colorBgLayout: cssVar('--bg-base', '#f8f9fc'),
      colorBgSpotlight: cssVar('--bg-elevated', '#ffffff'),

      colorBorder: cssVar('--border-default', '#d9d9d9'),
      colorBorderSecondary: cssVar('--border-subtle', '#f0f0f0'),

      colorText: cssVar('--text-primary', '#1a1d26'),
      colorTextSecondary: cssVar('--text-secondary', '#5a6070'),
      colorTextTertiary: cssVar('--text-tertiary', '#8b90a0'),
      colorTextQuaternary: cssVar('--text-tertiary', '#8b90a0'),

      colorFill: cssVar('--bg-tertiary', '#f1f3f7'),
      colorFillSecondary: cssVar('--bg-secondary', '#e8ebf0'),
      colorFillTertiary: cssVar('--bg-tertiary', '#f1f3f7'),
      colorFillQuaternary: cssVar('--bg-secondary', '#e8ebf0'),

      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
      boxShadowSecondary: '0 4px 12px rgba(0, 0, 0, 0.15)',
    },
    components: {
      Table: {
        headerBg: cssVar('--bg-secondary', '#fafafa'),
        headerColor: cssVar('--text-secondary', '#5a6070'),
        rowHoverBg: cssVar('--bg-tertiary', '#f5f5f5'),
        colorBgContainer: cssVar('--bg-primary', '#ffffff'),
        borderColor: cssVar('--border-default', '#f0f0f0'),
        headerBorderRadius: 0,
      },
      Card: {
        colorBgContainer: cssVar('--bg-primary', '#ffffff'),
        colorBorderSecondary: cssVar('--border-subtle', '#f0f0f0'),
      },
      Menu: {
        itemBg: 'transparent',
        subMenuItemBg: 'transparent',
        itemSelectedBg: cssVar('--accent-light', 'rgba(59, 130, 246, 0.12)'),
        itemHoverBg: cssVar('--bg-tertiary', '#f5f5f5'),
      },
      Input: {
        colorBgContainer: cssVar('--bg-primary', '#ffffff'),
        colorBorder: cssVar('--border-default', '#f0f0f0'),
        activeBorderColor: primary,
      },
      Select: {
        colorBgContainer: cssVar('--bg-primary', '#ffffff'),
        colorBorder: cssVar('--border-default', '#f0f0f0'),
      },
      Modal: {
        contentBg: cssVar('--bg-primary', '#ffffff'),
        headerBg: cssVar('--bg-primary', '#ffffff'),
        titleColor: cssVar('--text-primary', '#1a1d26'),
      },
      Tag: {
        defaultBg: cssVar('--bg-tertiary', '#f5f5f5'),
        defaultColor: cssVar('--text-secondary', '#5a6070'),
      },
      Spin: { colorPrimary: primary },
      Empty: { colorTextDescription: cssVar('--text-tertiary', '#8b90a0') },
      Pagination: {
        colorBgContainer: cssVar('--bg-primary', '#ffffff'),
        colorBorder: cssVar('--border-default', '#f0f0f0'),
        itemActiveBg: primary,
      },
    },
  };
}

const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const resolvedTheme = useResolvedTheme();
  const isDark = resolvedTheme === 'dark';
  // 首屏先用当前 CSS 变量构建（SSR/首次渲染安全）；布局阶段 data-theme 就绪后会重读
  const [antdThemeConfig, setAntdThemeConfig] = useState<ThemeConfig>(() => buildClairTheme());

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', resolvedTheme);
    root.style.setProperty('color-scheme', resolvedTheme);
    document.body.classList.toggle('dark', isDark);
    document.body.style.margin = '0';

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', isDark ? '#080b14' : '#f8f9fc');

    // 关键：data-theme 生效后立即重读 CSS 变量，使 antd 与自定义 CSS 共用同一真相源
    setAntdThemeConfig(buildClairTheme());
  }, [resolvedTheme, isDark]);

  return (
    <ConfigProvider locale={zhCN} theme={antdThemeConfig}>
      {children}
    </ConfigProvider>
  );
};

export default ThemeProvider;
