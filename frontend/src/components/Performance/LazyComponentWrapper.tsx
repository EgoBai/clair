import React, { Suspense, ReactNode, ComponentType, lazy } from 'react';
import logger from '../../utils/logger';

interface LazyComponentWrapperProps {
  children: ReactNode;
  fallback?: ReactNode;
  errorBoundary?: boolean;
  errorFallback?: ReactNode;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

/**
 * 简单的错误边界组件
 */
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.error('组件加载错误:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }

    return this.props.children;
  }
}

/**
 * 懒加载组件包装器
 * 统一处理Suspense和ErrorBoundary
 * 
 * @example
 * ```tsx
 * // 基本用法
 * <LazyComponentWrapper>
 *   <LazyComponent />
 * </LazyComponentWrapper>
 * 
 * // 自定义加载状态和错误处理
 * <LazyComponentWrapper
 *   fallback={<CustomLoadingSpinner />}
 *   errorFallback={<ErrorDisplay message="组件加载失败" />}
 * >
 *   <LazyComponent />
 * </LazyComponentWrapper>
 * ```
 */
export const LazyComponentWrapper: React.FC<LazyComponentWrapperProps> = ({
  children,
  fallback = <DefaultLoadingFallback />,
  errorBoundary = true,
  errorFallback = <DefaultErrorFallback />
}) => {
  if (errorBoundary) {
    return (
      <ErrorBoundary fallback={errorFallback}>
        <Suspense fallback={fallback}>
          {children}
        </Suspense>
      </ErrorBoundary>
    );
  }

  return <Suspense fallback={fallback}>{children}</Suspense>;
};

/**
 * 默认加载中组件
 */
const DefaultLoadingFallback: React.FC = () => {
  return (
    <div className="lazy-loading-fallback">
      <div className="loading-spinner">
        <div className="spinner"></div>
      </div>
      <p className="loading-text">加载中...</p>
      <style>{`
        .lazy-loading-fallback {
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          min-height: 200px;
          padding: 20px;
        }
        
        .loading-spinner {
          width: 40px;
          height: 40px;
          margin-bottom: 12px;
        }
        
        .spinner {
          width: 100%;
          height: 100%;
          border: 3px solid #f3f3f3;
          border-top: 3px solid #3498db;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        
        .loading-text {
          color: #666;
          font-size: 14px;
          margin: 0;
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

/**
 * 默认错误显示组件
 */
const DefaultErrorFallback: React.FC = () => {
  return (
    <div className="lazy-error-fallback">
      <div className="error-icon">⚠️</div>
      <h3 className="error-title">组件加载失败</h3>
      <p className="error-message">抱歉，无法加载该组件。请刷新页面重试。</p>
      <button 
        className="retry-button"
        onClick={() => window.location.reload()}
      >
        刷新页面
      </button>
      <style>{`
        .lazy-error-fallback {
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          min-height: 200px;
          padding: 20px;
          text-align: center;
          background: #fff5f5;
          border-radius: 8px;
          border: 1px solid #fed7d7;
        }
        
        .error-icon {
          font-size: 48px;
          margin-bottom: 16px;
        }
        
        .error-title {
          color: #c53030;
          margin: 0 0 8px 0;
          font-size: 18px;
        }
        
        .error-message {
          color: #718096;
          margin: 0 0 16px 0;
          font-size: 14px;
          max-width: 300px;
        }
        
        .retry-button {
          background: #4299e1;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          transition: background 0.2s;
        }
        
        .retry-button:hover {
          background: #3182ce;
        }
        
        .retry-button:active {
          background: #2c5282;
        }
      `}</style>
    </div>
  );
};

/**
 * 创建懒加载组件的高级函数
 * 
 * @param importFunc 动态导入函数
 * @param options 配置选项
 * @returns 懒加载组件
 * 
 * @example
 * ```tsx
 * const LazyChart = createLazyComponent(
 *   () => import('./components/HeavyChart'),
 *   {
 *     fallback: <ChartLoading />,
 *     errorFallback: <ChartError />
 *   }
 * );
 * ```
 */
export function createLazyComponent<T extends ComponentType<any>>(
  importFunc: () => Promise<{ default: T }>,
  options?: {
    fallback?: ReactNode;
    errorBoundary?: boolean;
    errorFallback?: ReactNode;
  }
): React.FC<React.ComponentProps<T>> {
  const LazyComponent = lazy(importFunc);
  
  const WrappedComponent: React.FC<React.ComponentProps<T>> = (props) => {
    return (
      <LazyComponentWrapper
        fallback={options?.fallback}
        errorBoundary={options?.errorBoundary}
        errorFallback={options?.errorFallback}
      >
        <LazyComponent {...props} />
      </LazyComponentWrapper>
    );
  };
  
  // 设置显示名称
  WrappedComponent.displayName = `LazyComponent(${importFunc.toString().slice(0, 30)}...)`;
  
  return WrappedComponent;
}

/**
 * 预加载组件
 * 
 * @param importFunc 动态导入函数
 * @returns Promise，组件加载完成后resolve
 * 
 * @example
 * ```tsx
 * // 鼠标悬停时预加载
 * const handleMouseEnter = () => {
 *   preloadComponent(() => import('./HeavyComponent'));
 * };
 * ```
 */
export function preloadComponent<T extends ComponentType<any>>(
  importFunc: () => Promise<{ default: T }>
): Promise<{ default: T }> {
  return importFunc();
}

/**
 * 批量预加载组件
 * 
 * @param importFuncs 动态导入函数数组
 * @returns Promise，所有组件加载完成后resolve
 */
export function preloadComponents(
  importFuncs: Array<() => Promise<any>>
): Promise<any[]> {
  return Promise.all(importFuncs.map(func => func()));
}

/**
 * 组件加载优先级管理
 */
export class ComponentPriorityManager {
  private highPriorityQueue: Array<() => Promise<any>> = [];
  private lowPriorityQueue: Array<() => Promise<any>> = [];
  private isProcessing = false;

  /**
   * 添加高优先级组件
   */
  addHighPriority(importFunc: () => Promise<any>) {
    this.highPriorityQueue.push(importFunc);
    this.processQueue();
  }

  /**
   * 添加低优先级组件
   */
  addLowPriority(importFunc: () => Promise<any>) {
    this.lowPriorityQueue.push(importFunc);
    this.processQueue();
  }

  /**
   * 处理队列
   */
  private async processQueue() {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    
    try {
      // 先处理高优先级队列
      while (this.highPriorityQueue.length > 0) {
        const importFunc = this.highPriorityQueue.shift();
        if (importFunc) {
          await importFunc();
        }
      }
      
      // 空闲时处理低优先级队列
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(async () => {
          while (this.lowPriorityQueue.length > 0) {
            const importFunc = this.lowPriorityQueue.shift();
            if (importFunc) {
              await importFunc();
            }
          }
        });
      } else {
        // 降级方案：延迟处理
        setTimeout(async () => {
          while (this.lowPriorityQueue.length > 0) {
            const importFunc = this.lowPriorityQueue.shift();
            if (importFunc) {
              await importFunc();
            }
          }
        }, 1000);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 清空队列
   */
  clear() {
    this.highPriorityQueue = [];
    this.lowPriorityQueue = [];
  }
}

// 导出单例实例
export const componentPriorityManager = new ComponentPriorityManager();

// 默认导出
export default React.memo(LazyComponentWrapper);