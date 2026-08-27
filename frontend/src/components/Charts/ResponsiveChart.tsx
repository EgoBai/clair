/**
 * ResponsiveChart — 响应式图表包装器
 * 
 * 根据屏幕尺寸自动调整图表高度：
 * - 桌面：默认高度
 * - 平板：适当缩小
 * - 手机：进一步缩小 + 简化配置
 * 
 * 同时处理 ECharts 的 resize 事件
 */

import React, { useEffect, useRef, useState } from 'react';

interface ResponsiveChartProps {
  children: React.ReactElement;
  /** 桌面端默认高度 */
  height?: number;
  /** 手机端高度（默认为桌面的60%） */
  mobileHeight?: number;
  /** 自定义样式 */
  style?: React.CSSProperties;
  /** 容器类名 */
  className?: string;
}

/** 获取当前屏幕断点 */
function getBreakpoint(): 'xs' | 'sm' | 'md' | 'lg' | 'xl' {
  if (typeof window === 'undefined') return 'lg';
  const w = window.innerWidth;
  if (w <= 480) return 'xs';
  if (w <= 768) return 'sm';
  if (w <= 1024) return 'md';
  if (w <= 1440) return 'lg';
  return 'xl';
}

/** 获取响应式高度 */
function getResponsiveHeight(defaultHeight: number, mobileHeight?: number): number {
  const bp = getBreakpoint();
  const mH = mobileHeight || Math.round(defaultHeight * 0.6);
  
  switch (bp) {
    case 'xs': return Math.round(mH * 0.75);
    case 'sm': return mH;
    case 'md': return Math.round(defaultHeight * 0.85);
    default: return defaultHeight;
  }
}

export const ResponsiveChart: React.FC<ResponsiveChartProps> = ({
  children,
  height = 400,
  mobileHeight,
  style,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentHeight, setCurrentHeight] = useState(() => 
    getResponsiveHeight(height, mobileHeight)
  );

  // 监听窗口大小变化
  useEffect(() => {
    const handleResize = () => {
      const newHeight = getResponsiveHeight(height, mobileHeight);
      setCurrentHeight(newHeight);

      // 触发 ECharts resize
      const container = containerRef.current;
      if (container) {
        const chartInstance = container.querySelector('_echarts_instance_');
        if (chartInstance) {
          // ECharts instance found, trigger resize
          const event = new Event('resize');
          window.dispatchEvent(event);
        }
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize(); // 初始化

    return () => window.removeEventListener('resize', handleResize);
  }, [height, mobileHeight]);

  // 克隆子组件并注入响应式高度
  const childWithHeight = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        height: currentHeight,
        style: {
          ...((children.props as Record<string, unknown>)?.style || {}),
          width: '100%',
        },
      })
    : children;

  return (
    <div
      ref={containerRef}
      className={['responsive-chart', className].filter(Boolean).join(' ')}
      style={{
        width: '100%',
        height: currentHeight,
        minHeight: 150,
        ...style,
      }}
    >
      {childWithHeight}
    </div>
  );
};

export default ResponsiveChart;
