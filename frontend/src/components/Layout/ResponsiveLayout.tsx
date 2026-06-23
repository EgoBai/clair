/**
 * ResponsiveLayout 响应式布局组件 v2
 * 提供Grid、断点判断、显示/隐藏、流体排版、自适应容器
 */
import React, { useState, useEffect } from 'react';
import {
  getCurrentBreakpoint, BREAKPOINTS, GRID_PRESETS,
  fluidTypography, TYPOGRAPHY_SCALE, fluidSpacing,
  getAdaptiveConfig, safeAreaPadding,
  type Breakpoint, type AdaptiveConfig,
} from '../../utils/responsiveUtils';

// Hook: 当前断点
export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>('lg');

  useEffect(() => {
    const check = () => setBp(getCurrentBreakpoint(window.innerWidth));
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return bp;
}

// Hook: 完整自适应配置
export function useAdaptive(): AdaptiveConfig {
  const [config, setConfig] = useState<AdaptiveConfig>(() => getAdaptiveConfig(window.innerWidth));

  useEffect(() => {
    const check = () => setConfig(getAdaptiveConfig(window.innerWidth));
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return config;
}

// Hook: 容器宽度（用于自适应容器查询）
export function useContainerWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
      }
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);

  return width;
}

// 响应式布局容器
export const ResponsiveLayout: React.FC<{
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}> = ({ children, className = '', style = {} }) => (
  <div className={`responsive-layout ${className}`} style={{ width: '100%', ...style }}>
    {children}
  </div>
);

// 自适应 Grid 容器
export const Grid: React.FC<{
  children: React.ReactNode;
  columns?: number;
  gap?: number;
  className?: string;
  minItemWidth?: number;
  maxWidth?: number;
}> = ({ children, columns = 1, gap = 16, className = '', minItemWidth, maxWidth }) => {
  const style: React.CSSProperties = minItemWidth
    ? {
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fill, minmax(${minItemWidth}px, 1fr))`,
        gap,
        maxWidth,
      }
    : {
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap,
        maxWidth,
      };

  return (
    <div className={className} style={style}>
      {children}
    </div>
  );
};

// 响应式 Grid（自动根据断点调整列数）
export const ResponsiveGrid: React.FC<{
  children: React.ReactNode;
  className?: string;
  mobileColumns?: number;
  tabletColumns?: number;
  desktopColumns?: number;
  gap?: number;
}> = ({ children, className = '', mobileColumns = 1, tabletColumns = 2, desktopColumns = 3, gap }) => {
  const bp = useBreakpoint();
  const isMobile = bp === 'xs' || bp === 'sm';
  const isTablet = bp === 'md';
  const cols = isMobile ? mobileColumns : isTablet ? tabletColumns : desktopColumns;
  const gridGap = gap ?? GRID_PRESETS[bp].gap;

  return (
    <div
      className={className}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: gridGap,
      }}
    >
      {children}
    </div>
  );
};

// Grid Item
export const GridItem: React.FC<{
  children: React.ReactNode;
  span?: number;
  className?: string;
}> = ({ children, span = 1, className = '' }) => (
  <div className={className} style={{ gridColumn: `span ${span}` }}>
    {children}
  </div>
);

// 大于等于断点时显示
export const Show: React.FC<{
  breakpoint: Breakpoint;
  children: React.ReactNode;
}> = ({ breakpoint, children }) => {
  const bp = useBreakpoint();
  if (BREAKPOINTS[bp] < BREAKPOINTS[breakpoint]) return null;
  return <>{children}</>;
};

// 小于断点时显示
export const Hide: React.FC<{
  breakpoint: Breakpoint;
  children: React.ReactNode;
}> = ({ breakpoint, children }) => {
  const bp = useBreakpoint();
  if (BREAKPOINTS[bp] >= BREAKPOINTS[breakpoint]) return null;
  return <>{children}</>;
};

// 仅移动端显示
export const MobileOnly: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Hide breakpoint="md">{children}</Hide>
);

// 仅桌面端显示
export const DesktopOnly: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Show breakpoint="lg">{children}</Show>
);

// 仅平板显示
export const TabletOnly: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const bp = useBreakpoint();
  if (bp !== 'md') return null;
  return <>{children}</>;
};

// 流体排版组件
export const FluidText: React.FC<{
  scale: keyof typeof TYPOGRAPHY_SCALE;
  children: React.ReactNode;
  as?: keyof JSX.IntrinsicElements;
  className?: string;
  style?: React.CSSProperties;
}> = ({ scale, children, as: Tag = 'span', className = '', style = {} }) => {
  const fontSize = fluidTypography(TYPOGRAPHY_SCALE[scale]);
  return (
    <Tag className={className} style={{ fontSize, ...style }}>
      {children}
    </Tag>
  );
};

// 自适应卡片容器（带安全区域支持）
export const SafeAreaContainer: React.FC<{
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}> = ({ children, className = '', style = {} }) => {
  const safe = safeAreaPadding();
  return (
    <div
      className={className}
      style={{
        ...safe,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

// 响应式间距组件
export const Spacer: React.FC<{
  size?: 'xs' | 'sm' | 'md' | 'lg';
  horizontal?: boolean;
}> = ({ size = 'md', horizontal = false }) => {
  const spacingMap = {
    xs: fluidSpacing(4, 8),
    sm: fluidSpacing(8, 12),
    md: fluidSpacing(12, 20),
    lg: fluidSpacing(16, 32),
  };

  return (
    <div
      style={{
        width: horizontal ? spacingMap[size] : undefined,
        height: horizontal ? undefined : spacingMap[size],
        flexShrink: 0,
      }}
    />
  );
};

// 响应式行（水平布局，自动换行）
export const Row: React.FC<{
  children: React.ReactNode;
  gap?: number;
  align?: 'start' | 'center' | 'end' | 'stretch';
  wrap?: boolean;
  className?: string;
  style?: React.CSSProperties;
}> = ({ children, gap = 16, align = 'center', wrap = true, className = '', style = {} }) => (
  <div
    className={className}
    style={{
      display: 'flex',
      flexWrap: wrap ? 'wrap' : 'nowrap',
      alignItems: align === 'start' ? 'flex-start' : align === 'end' ? 'flex-end' : align,
      gap,
      ...style,
    }}
  >
    {children}
  </div>
);

export default React.memo(ResponsiveLayout);
