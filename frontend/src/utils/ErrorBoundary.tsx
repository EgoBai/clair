import logger from './logger';
/**
 * 错误边界组件
 * 捕获子组件树中的JavaScript错误，显示降级UI
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): State {
    // 更新state使下一次渲染能够显示降级UI
    return {
      hasError: true,
      error,
      errorInfo: null
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // 你可以将错误日志上报给服务器
    logger.error('ErrorBoundary caught an error:', error, errorInfo);
    
    this.setState({
      error,
      errorInfo
    });

    // 调用自定义错误处理函数
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // 可以在这里发送错误报告到服务器
    this.reportError(error, errorInfo);
  }

  private reportError(error: Error, errorInfo: ErrorInfo): void {
    try {
      // 这里可以集成错误报告服务，如Sentry、LogRocket等
      const errorReport = {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack
        },
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
        url: window.location.href,
        userAgent: navigator.userAgent
      };

      // 发送错误报告到服务器
      fetch('/api/error-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(errorReport)
      }).catch(err => {
        logger.warn('Failed to send error report:', err);
      });
    } catch (reportError) {
      logger.warn('Failed to prepare error report:', reportError);
    }
  }

  private handleRetry = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  };

  private handleReset = (): void => {
    // 清除错误状态，重新渲染子组件
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // 如果提供了自定义fallback，使用它
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // 默认的错误UI
      return (
        <div className="error-boundary">
          <div className="error-boundary-content">
            <div className="error-icon">⚠️</div>
            <h2 className="error-title">出错了</h2>
            <p className="error-message">
              抱歉，页面加载时出现了问题。我们已经记录了这个错误。
            </p>
            
            {this.state.error && (
              <div className="error-details">
                <details>
                  <summary>错误详情</summary>
                  <pre className="error-stack">
                    {this.state.error.toString()}
                  </pre>
                  {this.state.errorInfo && (
                    <pre className="component-stack">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  )}
                </details>
              </div>
            )}

            <div className="error-actions">
              <button
                className="retry-button"
                onClick={this.handleRetry}
              >
                重试
              </button>
              <button
                className="reset-button"
                onClick={this.handleReset}
              >
                重置
              </button>
              <button
                className="home-button"
                onClick={() => window.location.href = '/'}
              >
                返回首页
              </button>
            </div>

            <div className="error-help">
              <p>如果问题持续存在，请：</p>
              <ul>
                <li>刷新页面</li>
                <li>检查网络连接</li>
                <li>清除浏览器缓存</li>
                <li>联系技术支持</li>
              </ul>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

/**
 * 高阶组件：包装组件使其具有错误边界
 */
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  errorBoundaryProps?: Partial<Props>
): React.ComponentType<P> {
  return function WithErrorBoundary(props: P) {
    return (
      <ErrorBoundary {...errorBoundaryProps}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    );
  };
}

/**
 * 使用错误边界的Hook
 */
export function useErrorHandler(): {
  handleError: (error: Error, componentStack?: string) => void;
  ErrorBoundary: typeof ErrorBoundary;
} {
  const handleError = (error: Error, componentStack?: string): void => {
    logger.error('Error caught by useErrorHandler:', error);
    
    // 这里可以添加自定义错误处理逻辑
    const _errorInfo: ErrorInfo = {
      componentStack: componentStack || ''
    };
    
    // 可以在这里发送错误报告
    fetch('/api/client-error', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        error: error.toString(),
        stack: error.stack,
        componentStack,
        timestamp: new Date().toISOString()
      })
    }).catch(err => {
      logger.warn('Failed to send client error:', err);
    });
  };

  return {
    handleError,
    ErrorBoundary
  };
}