import React, { Profiler, ProfilerOnRenderCallback } from 'react';
import logger from '../../utils/logger';

interface PerformanceProfilerProps {
  id: string;
  children: React.ReactNode;
  onRender?: ProfilerOnRenderCallback;
  enabled?: boolean;
  warningThreshold?: number; // 警告阈值（毫秒）
  logToConsole?: boolean;
}

/**
 * React Profiler包装组件，用于监控组件渲染性能
 * 
 * @example
 * ```tsx
 * <PerformanceProfiler id="StockList">
 *   <StockListPage />
 * </PerformanceProfiler>
 * ```
 */
export const PerformanceProfiler: React.FC<PerformanceProfilerProps> = ({
  id,
  children,
  onRender,
  enabled = process.env.NODE_ENV === 'development',
  warningThreshold = 16, // 16ms = 60fps的一帧时间
  logToConsole = true
}) => {
  const defaultOnRender: ProfilerOnRenderCallback = (
    id,
    phase,
    actualDuration,
    baseDuration,
    startTime,
    commitTime
  ) => {
    const timestamp = new Date().toISOString();
    const metrics = {
      id,
      phase,
      actualDuration: actualDuration.toFixed(2),
      baseDuration: baseDuration.toFixed(2),
      commitTime: commitTime.toFixed(2),
      timestamp,
      isSlow: actualDuration > warningThreshold
    };

    // 发送自定义事件，供其他组件监听
    window.dispatchEvent(new CustomEvent('profiler-data', { detail: metrics }));

    if (logToConsole) {
      const logMethod = metrics.isSlow ? console.warn : console.log;
      logMethod(`[PerformanceProfiler] ${id} - ${phase}:`, {
        actualDuration: `${actualDuration.toFixed(2)}ms`,
        baseDuration: `${baseDuration.toFixed(2)}ms`,
        isSlow: metrics.isSlow ? `⚠️ 超过${warningThreshold}ms阈值` : '✅ 正常',
        timestamp
      });
    }

    // 性能警告：如果渲染时间过长
    if (metrics.isSlow) {
      // 可以集成到错误监控系统
      logger.warn(`[Performance Warning] 组件 "${id}" ${phase} 渲染时间过长: ${actualDuration.toFixed(2)}ms`);
      
      // 开发环境下的可视化提示
      if (process.env.NODE_ENV === 'development') {
        // 可以添加屏幕上的警告提示
        const warningElement = document.getElementById(`perf-warning-${id}`);
        if (!warningElement) {
          const div = document.createElement('div');
          div.id = `perf-warning-${id}`;
          div.style.cssText = `
            position: fixed;
            bottom: 10px;
            right: 10px;
            background: #ff6b6b;
            color: white;
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 12px;
            z-index: 9999;
            max-width: 300px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
          `;
          div.textContent = `⚠️ ${id} 渲染慢: ${actualDuration.toFixed(2)}ms`;
          document.body.appendChild(div);
          
          // 3秒后自动移除
          setTimeout(() => div.remove(), 3000);
        }
      }
    }
  };

  // 如果不启用性能监控，直接渲染子组件
  if (!enabled) {
    return <>{children}</>;
  }

  return (
    <Profiler id={id} onRender={onRender || defaultOnRender}>
      {children}
    </Profiler>
  );
};

/**
 * 性能监控HOC（高阶组件）
 * 
 * @example
 * ```tsx
 * const MonitoredComponent = withPerformanceProfiler(MyComponent, 'MyComponent');
 * ```
 */
export function withPerformanceProfiler<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  componentId: string,
  options?: Omit<PerformanceProfilerProps, 'id' | 'children'>
) {
  const displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component';
  
  const ComponentWithProfiler: React.FC<P> = (props) => {
    return (
      <PerformanceProfiler id={componentId} {...options}>
        <WrappedComponent {...props} />
      </PerformanceProfiler>
    );
  };
  
  ComponentWithProfiler.displayName = `withPerformanceProfiler(${displayName})`;
  
  return ComponentWithProfiler;
}

/**
 * 性能数据收集器
 */
export class PerformanceCollector {
  private static instance: PerformanceCollector;
  private metrics: Array<{
    id: string;
    phase: 'mount' | 'update';
    actualDuration: number;
    timestamp: string;
  }> = [];
  private maxMetrics = 1000; // 最大存储数量

  private constructor() {
    // 监听性能数据
    window.addEventListener('profiler-data', (event: Event) => {
      const detail = (event as CustomEvent).detail;
      this.addMetric({
        id: detail.id,
        phase: detail.phase,
        actualDuration: parseFloat(detail.actualDuration),
        timestamp: detail.timestamp
      });
    });
  }

  static getInstance(): PerformanceCollector {
    if (!PerformanceCollector.instance) {
      PerformanceCollector.instance = new PerformanceCollector();
    }
    return PerformanceCollector.instance;
  }

  private addMetric(metric: {
    id: string;
    phase: 'mount' | 'update';
    actualDuration: number;
    timestamp: string;
  }) {
    this.metrics.push(metric);
    
    // 限制存储数量
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }
  }

  /**
   * 获取性能报告
   */
  getReport() {
    if (this.metrics.length === 0) {
      return { message: '暂无性能数据' };
    }

    const totalDuration = this.metrics.reduce((sum, m) => sum + m.actualDuration, 0);
    const averageDuration = totalDuration / this.metrics.length;
    
    // 按组件分组统计
    const byComponent = this.metrics.reduce((acc, metric) => {
      if (!acc[metric.id]) {
        acc[metric.id] = {
          count: 0,
          totalDuration: 0,
          maxDuration: 0,
          slowRenders: 0
        };
      }
      
      acc[metric.id].count++;
      acc[metric.id].totalDuration += metric.actualDuration;
      acc[metric.id].maxDuration = Math.max(acc[metric.id].maxDuration, metric.actualDuration);
      
      if (metric.actualDuration > 16) {
        acc[metric.id].slowRenders++;
      }
      
      return acc;
    }, {} as Record<string, {
      count: number;
      totalDuration: number;
      maxDuration: number;
      slowRenders: number;
    }>);

    // 找出最慢的组件
    const slowestComponents = Object.entries(byComponent)
      .map(([id, stats]) => ({
        id,
        averageDuration: stats.totalDuration / stats.count,
        maxDuration: stats.maxDuration,
        slowRenders: stats.slowRenders,
        slowPercentage: (stats.slowRenders / stats.count) * 100
      }))
      .sort((a, b) => b.averageDuration - a.averageDuration)
      .slice(0, 10);

    return {
      summary: {
        totalRenders: this.metrics.length,
        averageRenderTime: averageDuration.toFixed(2),
        totalMonitoringTime: totalDuration.toFixed(2),
        slowRenders: this.metrics.filter(m => m.actualDuration > 16).length,
        slowPercentage: (this.metrics.filter(m => m.actualDuration > 16).length / this.metrics.length * 100).toFixed(1)
      },
      slowestComponents,
      recentMetrics: this.metrics.slice(-10)
    };
  }

  /**
   * 清空性能数据
   */
  clear() {
    this.metrics = [];
  }

  /**
   * 导出性能数据
   */
  export() {
    return {
      metrics: this.metrics,
      report: this.getReport(),
      timestamp: new Date().toISOString()
    };
  }
}

// 导出单例实例
export const performanceCollector = PerformanceCollector.getInstance();