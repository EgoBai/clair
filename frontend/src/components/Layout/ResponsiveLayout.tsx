/**
 * ResponsiveLayout 响应式布局组件
 * 提供Grid、断点判断、显示/隐藏工具
 */
import React, { useState, useEffect } from 'react';
import { getCurrentBreakpoint, BREAKPOINTS, type Breakpoint } from '../../utils/responsiveUtils';

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

// Grid 容器
export const Grid: React.FC<{
  children: React.ReactNode;
  columns?: number;
  gap?: number;
  className?: string;
}> = ({ children, columns = 1, gap = 16, className = '' }) => (
  <div
    className={className}
    style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${columns}, 1fr)`,
      gap,
    }}
  >
    {children}
  </div>
);

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

export default ResponsiveLayout;
