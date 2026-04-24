/**
 * 错误处理工具函数
 * 第17轮迭代优化：统一错误处理工具
 */
import logger from '../../../utils/logger';

/**
 * 判断错误是否为网络错误
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.message.includes('Network') ||
      error.message.includes('network') ||
      error.message.includes('fetch') ||
      error.message.includes('timeout') ||
      error.message.includes('HTTP')
    );
  }
  return false;
}

/**
 * 判断错误是否为授权错误
 */
export function isAuthError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.message.includes('401') ||
      error.message.includes('403') ||
      error.message.includes('unauthorized') ||
      error.message.includes('forbidden') ||
      error.message.includes('token')
    );
  }
  return false;
}

/**
 * 判断错误是否为数据错误
 */
export function isDataError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.message.includes('data') ||
      error.message.includes('parse') ||
      error.message.includes('JSON') ||
      error.message.includes('format')
    );
  }
  return false;
}

/**
 * 获取友好的错误消息
 */
export function getFriendlyErrorMessage(error: unknown, defaultMessage = '发生未知错误'): string {
  if (!error) return defaultMessage;
  
  if (typeof error === 'string') return error;
  
  if (error instanceof Error) {
    const message = error.message;
    
    if (isNetworkError(error)) {
      return '网络连接失败，请检查网络后重试';
    }
    
    if (isAuthError(error)) {
      return '登录已过期，请重新登录';
    }
    
    if (isDataError(error)) {
      return '数据加载失败，请稍后重试';
    }
    
    // 返回原始错误消息，但移除技术细节
    return message.replace(/^Error:\s*/i, '').split('\n')[0];
  }
  
  return defaultMessage;
}

/**
 * 安全执行函数，捕获错误并返回默认值
 */
export function safeExecute<T>(
  fn: () => T,
  defaultValue: T,
  onError?: (error: unknown) => void
): T {
  try {
    return fn();
  } catch (error) {
    if (onError) {
      onError(error);
    } else {
      logger.error('Safe execute error:', error);
    }
    return defaultValue;
  }
}

/**
 * 安全执行异步函数
 */
export async function safeExecuteAsync<T>(
  fn: () => Promise<T>,
  defaultValue: T,
  onError?: (error: unknown) => void
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (onError) {
      onError(error);
    } else {
      logger.error('Safe execute async error:', error);
    }
    return defaultValue;
  }
}

/**
 * 创建错误边界包装器
 */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Partial<import('../UnifiedErrorBoundary').ErrorBoundaryProps>
): React.FC<P> {
  // 动态导入以避免循环依赖
  const WrappedComponent: React.FC<P> = (props) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { UnifiedErrorBoundary } = require('../UnifiedErrorBoundary');
    return (
      <UnifiedErrorBoundary {...errorBoundaryProps}>
        <Component {...props} />
      </UnifiedErrorBoundary>
    );
  };
  
  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
}

/**
 * 错误重试策略
 */
export interface RetryStrategy {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  shouldRetry: (error: unknown, attempt: number) => boolean;
}

/**
 * 默认重试策略
 */
export const defaultRetryStrategy: RetryStrategy = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  shouldRetry: (error: unknown) => isNetworkError(error) || isDataError(error),
};

/**
 * 带重试的执行函数
 */
export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  strategy: RetryStrategy = defaultRetryStrategy
): Promise<T> {
  let lastError: unknown;
  
  for (let attempt = 1; attempt <= strategy.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (!strategy.shouldRetry(error, attempt) || attempt === strategy.maxRetries) {
        break;
      }
      
      // 指数退避延迟
      const delay = Math.min(
        strategy.baseDelay * Math.pow(2, attempt - 1),
        strategy.maxDelay
      );
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}