/**
 * 轻量 ECharts React 包装器
 * 使用按需引入的 echarts 实例，替代全量 echarts-for-react
 */
import React, { useRef, useEffect, useCallback } from 'react';
import type { CSSProperties } from 'react';
import echarts from '@/utils/echarts';
import type { EChartsType } from 'echarts/core';

export interface EChartsWrapperProps {
  option: any;
  style?: CSSProperties;
  className?: string;
  notMerge?: boolean;
  theme?: string | object;
  opts?: {
    renderer?: 'canvas' | 'svg';
    width?: number | null | 'auto';
    height?: number | null | 'auto';
    devicePixelRatio?: number;
    locale?: string;
  };
  onChartReady?: (instance: EChartsType) => void;
  onEvents?: Record<string, (params: any) => void>;
  showLoading?: boolean;
  loadingOption?: any;
}

const EChartsWrapper: React.FC<EChartsWrapperProps> = ({
  option,
  style = { width: '100%', height: '400px' },
  className,
  notMerge = false,
  theme,
  opts,
  onChartReady,
  onEvents,
  showLoading = false,
  loadingOption,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType | null>(null);

  const initChart = useCallback(() => {
    if (!containerRef.current) return;
    const instance = echarts.init(containerRef.current, theme, opts);
    chartRef.current = instance;
    if (showLoading) instance.showLoading(loadingOption);
    instance.setOption(option, notMerge);
    if (onChartReady) onChartReady(instance);
    if (onEvents) {
      Object.entries(onEvents).forEach(([event, handler]) => {
        instance.on(event, handler);
      });
    }
    return instance;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const instance = initChart();
    const handleResize = () => instance?.resize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      instance?.dispose();
    };
  }, [initChart]);

  // Update option when it changes
  useEffect(() => {
    if (chartRef.current && !chartRef.current.isDisposed()) {
      if (showLoading) {
        chartRef.current.showLoading(loadingOption);
      }
      chartRef.current.setOption(option, notMerge);
      if (!showLoading) {
        chartRef.current.hideLoading();
      }
    }
  }, [option, notMerge, showLoading, loadingOption]);

  return <div ref={containerRef} style={style} className={className} />;
};

export default EChartsWrapper;
