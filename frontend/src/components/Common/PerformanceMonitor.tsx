/**
 * 性能监控组件
 * 用于收集和报告React组件渲染性能
 */

import React, { useEffect, useState, useRef } from 'react';
import logger from '../../utils/logger';
import { createPerfMonitor } from '../../utils/performanceMonitor';
import { getVitalsReport } from '../../utils/webVitals';

interface PerformanceMonitorProps {
  componentName: string;
  children: React.ReactNode;
  slowThreshold?: number; // 毫秒
  enableLogging?: boolean;
  enableReporting?: boolean;
}

interface PerformanceData {
  componentName: string;
  mountTime: number;
  updateCount: number;
  averageRenderTime: number;
  maxRenderTime: number;
  slowRenders: number;
  lastRenderTime: number;
  webVitals?: ReturnType<typeof getVitalsReport>;
}

const PerformanceMonitor: React.FC<PerformanceMonitorProps> = ({
  componentName,
  children,
  slowThreshold = 100,
  enableLogging = process.env.NODE_ENV === 'development',
  enableReporting = false,
}) => {
  const [performanceData, setPerformanceData] = useState<PerformanceData>({
    componentName,
    mountTime: 0,
    updateCount: 0,
    averageRenderTime: 0,
    maxRenderTime: 0,
    slowRenders: 0,
    lastRenderTime: 0,
  });

  const renderStartTime = useRef<number>(0);
  const renderTimes = useRef<number[]>([]);
  const updateCount = useRef<number>(0);
  const slowRenderCount = useRef<number>(0);
  const perfMonitor = useRef(createPerfMonitor({ slowThreshold }));

  // 记录渲染开始时间
  useEffect(() => {
    renderStartTime.current = performance.now();
    
    return () => {
      const renderTime = performance.now() - renderStartTime.current;
      renderTimes.current.push(renderTime);
      updateCount.current += 1;
      
      if (renderTime > slowThreshold) {
        slowRenderCount.current += 1;
        
        if (enableLogging) {
          logger.warn(`[性能警告] ${componentName} 渲染过慢: ${renderTime.toFixed(2)}ms`);
        }
      }
      
      // 更新性能数据
      const avgTime = renderTimes.current.reduce((a, b) => a + b, 0) / renderTimes.current.length;
      const maxTime = Math.max(...renderTimes.current);
      
      setPerformanceData({
        componentName,
        mountTime: performanceData.mountTime || performance.now(),
        updateCount: updateCount.current,
        averageRenderTime: avgTime,
        maxRenderTime: maxTime,
        slowRenders: slowRenderCount.current,
        lastRenderTime: renderTime,
      });
      
      // 记录到性能监控器
      perfMonitor.current.measure(`${componentName} render`, () => { /* noop */ }, 'render');
      
      // 报告性能数据（生产环境）
      if (enableReporting && renderTime > slowThreshold * 2) {
        reportPerformanceIssue({
          componentName,
          renderTime,
          threshold: slowThreshold,
          timestamp: Date.now(),
        });
      }
    };
  });

  // 收集Web Vitals数据
  useEffect(() => {
    if (enableReporting) {
      const vitals = getVitalsReport();
      setPerformanceData(prev => ({
        ...prev,
        webVitals: vitals,
      }));
    }
  }, [enableReporting]);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      if (enableLogging) {
        const stats = perfMonitor.current.getSummary();
        logger.log(`[性能统计] ${componentName}:`, {
          总渲染次数: stats.totalEntries,
          慢渲染次数: stats.slowEntries,
          平均渲染时间: `${stats.avgDuration.toFixed(2)}ms`,
          按类型统计: stats.byType,
        });
      }
    };
  }, [componentName, enableLogging]);

  // 开发环境显示性能面板
  const showDevPanel = enableLogging && process.env.NODE_ENV === 'development';

  return (
    <>
      {children}
      
      {showDevPanel && (
        <div style={{
          position: 'fixed',
          bottom: 10,
          right: 10,
          background: 'rgba(0, 0, 0, 0.8)',
          color: 'white',
          padding: '8px 12px',
          borderRadius: '6px',
          fontSize: '12px',
          fontFamily: 'monospace',
          zIndex: 9999,
          maxWidth: '300px',
          maxHeight: '200px',
          overflow: 'auto',
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
            🚀 {componentName}
          </div>
          <div>渲染次数: {performanceData.updateCount}</div>
          <div>上次渲染: {performanceData.lastRenderTime.toFixed(2)}ms</div>
          <div>平均渲染: {performanceData.averageRenderTime.toFixed(2)}ms</div>
          <div>最大渲染: {performanceData.maxRenderTime.toFixed(2)}ms</div>
          <div>慢渲染: {performanceData.slowRenders}</div>
          {performanceData.slowRenders > 0 && (
            <div style={{ color: '#ff6b6b' }}>⚠️ 检测到慢渲染</div>
          )}
        </div>
      )}
    </>
  );
};

/**
 * 性能边界组件 - 包装可能慢的组件
 */
export const PerformanceBoundary: React.FC<{
  children: React.ReactNode;
  fallback?: React.ReactNode;
  timeout?: number;
}> = ({ children, fallback, timeout = 1000 }) => {
  const [isSlow, setIsSlow] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      setIsSlow(true);
      logger.warn('[性能边界] 组件渲染超时');
    }, timeout);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [timeout]);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setIsSlow(false);
  }, [children]);

  if (isSlow && fallback) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};

/**
 * 懒加载性能监控包装器
 */
export const LazyWithPerf = <T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  componentName: string
) => {
  const LazyComponent = React.lazy(factory);
  
  const WrappedComponent: React.FC<React.ComponentProps<T>> = (props) => (
    <PerformanceMonitor componentName={componentName}>
      <LazyComponent {...props} />
    </PerformanceMonitor>
  );
  
  WrappedComponent.displayName = `LazyWithPerf(${componentName})`;
  
  return WrappedComponent;
};

/**
 * 报告性能问题
 *
 * 死链清算（2026-10-06）：
 * 旧实现 sendBeacon 到 `/api/performance/report` —— 后端**从未注册**该路径（实测 404），
 * 是一条纯死链，上报内容全部石沉大海。现改指向后端真实注册的
 * POST /api/performance/frontend（app.ts:144 → performance.ts:95）。
 *
 * 已知后端缺陷（本次未修，超出前端文件域，已上报）：
 * 该端点的 Joi schema（middleware/validation.ts:397）要求 `{ metric, value, page?, timestamp? }`，
 * 而 handler（performance.ts:96）解构的是 `{ metrics, url, userAgent, timestamp }`；
 * 又因 validateBody 开了 `stripUnknown: true`，`metrics` 会被当作未知字段剥掉，
 * 于是 handler 里的 `!metrics` 恒成立 → **任何 payload 都返回 400「无效的性能指标」**（已实测三种payload 均400）。
 * 因此这里按 schema 契约（metric/value）发送：后端修好后即可直接生效，
 * 在此之前上报会被静默丢弃——但这是后端 bug，不是前端指向了不存在的端点。
 */
function reportPerformanceIssue(data: {
  componentName: string;
  renderTime: number;
  threshold: number;
  timestamp: number;
}): void {
  if (typeof window !== 'undefined' && 'sendBeacon' in navigator) {
    const payload = {
      // schema 约定的字段名：metric 为指标名，value 为耗时毫秒
      metric: `${data.componentName}_render_time`,
      value: Math.max(0, Math.min(3600000, Math.round(data.renderTime))),
      page: typeof window !== 'undefined' ? window.location.href : '',
      timestamp: data.timestamp,
    };

    // sendBeacon 以 text/plain 发送 Blob 会被后端 express.json 忽略，
    // 故显式指定 application/json 的 Blob，保证请求体能被解析。
    navigator.sendBeacon(
      '/api/performance/frontend',
      new Blob([JSON.stringify(payload)], { type: 'application/json' })
    );
  }
}

/**
 * 使用性能监控的HOC
 */
export function withPerformanceMonitor<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  componentName: string,
  options?: Partial<Omit<PerformanceMonitorProps, 'componentName' | 'children'>>
) {
  const WithPerformanceMonitor: React.FC<P> = (props) => {
    return (
      <PerformanceMonitor
        componentName={componentName}
        {...options}
      >
        <WrappedComponent {...props} />
      </PerformanceMonitor>
    );
  };
  
  WithPerformanceMonitor.displayName = `WithPerformanceMonitor(${componentName})`;
  
  return WithPerformanceMonitor;
}

export default PerformanceMonitor;