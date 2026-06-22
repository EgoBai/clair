/**
 * 增强型错误边界组件
 * 支持：错误捕获、自动重试、错误上报、友好UI
 * 参考 Linear 的错误处理体验
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import logger from '../../utils/logger';
import { Button, Typography, Space, Collapse } from 'antd';
import { ReloadOutlined, BugOutlined, HomeOutlined } from '@ant-design/icons';

const { Text, Paragraph } = Typography;

// ==================== 类型定义 ====================

interface ErrorReport {
  error: Error;
  errorInfo: ErrorInfo;
  timestamp: number;
  url: string;
  userAgent: string;
  componentStack: string;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode | ((error: Error, retry: () => void) => ReactNode);
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  maxRetries?: number;
  resetKeys?: unknown[]; // 当这些值变化时自动重置
  name?: string; // 组件名，用于错误定位
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  retryCount: number;
  errorId: string;
}

// ==================== 错误上报 ====================

const errorReports: ErrorReport[] = [];
const MAX_REPORTS = 50;

function reportError(report: ErrorReport): void {
  errorReports.push(report);
  if (errorReports.length > MAX_REPORTS) {
    errorReports.shift();
  }

  // 开发环境下打印详细错误
  if (import.meta.env.DEV) {
    logger.debug(`[ErrorBoundary] ${report.timestamp}`);
    logger.error('Error:', report.error);
    logger.error('Component Stack:', report.componentStack);
  }

  // 生产环境可对接 Sentry 等
  // Sentry.captureException(report.error, { extra: report });
}

export function getErrorReports(): ErrorReport[] {
  return [...errorReports];
}

export function clearErrorReports(): void {
  errorReports.length = 0;
}

// ==================== 错误边界组件 ====================

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private resetTimeout: ReturnType<typeof setTimeout> | null = null;

  state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
    retryCount: 0,
    errorId: '',
  };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
      errorId: `err_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });

    // 上报错误
    reportError({
      error,
      errorInfo,
      timestamp: Date.now(),
      url: typeof window !== 'undefined' ? window.location.href : '',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      componentStack: errorInfo.componentStack || '',
    });

    // 调用外部错误处理
    this.props.onError?.(error, errorInfo);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    // resetKeys 变化时自动重置
    if (this.state.hasError && this.props.resetKeys) {
      const changed = this.props.resetKeys.some(
        (key, i) => key !== (prevProps.resetKeys?.[i] ?? undefined)
      );
      if (changed) {
        this.handleReset();
      }
    }
  }

  componentWillUnmount(): void {
    if (this.resetTimeout) clearTimeout(this.resetTimeout);
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: this.state.retryCount + 1,
    });
  };

  handleRetry = (): void => {
    const { maxRetries = 3 } = this.props;
    if (this.state.retryCount >= maxRetries) {
      return;
    }
    this.handleReset();
  };

  handleGoHome = (): void => {
    window.location.href = '/';
  };

  render(): ReactNode {
    if (this.state.hasError) {
      const { fallback, maxRetries = 3 } = this.props;
      const { error, errorInfo, retryCount } = this.state;
      const canRetry = retryCount < maxRetries;

      // 自定义 fallback
      if (fallback) {
        if (typeof fallback === 'function') {
          return fallback(error!, this.handleRetry);
        }
        return fallback;
      }

      // 默认错误 UI
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px 24px',
          textAlign: 'center',
          minHeight: 300,
        }}>
          <BugOutlined style={{ fontSize: 48, color: '#faad14', marginBottom: 16 }} />

          <Typography.Title level={4} style={{ marginBottom: 8 }}>
            组件渲染出错
          </Typography.Title>

          <Paragraph type="secondary" style={{ maxWidth: 400, marginBottom: 24 }}>
            {error?.message || '页面遇到了一些问题'}
            {this.props.name && ` (${this.props.name})`}
          </Paragraph>

          <Space>
            {canRetry && (
              <Button
                type="primary"
                icon={<ReloadOutlined />}
                onClick={this.handleRetry}
              >
                重试 ({maxRetries - retryCount} 次剩余)
              </Button>
            )}
            <Button
              icon={<HomeOutlined />}
              onClick={this.handleGoHome}
            >
              返回首页
            </Button>
          </Space>

          {/* 开发模式显示详细错误 */}
          {import.meta.env.DEV && errorInfo && (
            <Collapse
              style={{ marginTop: 24, width: '100%', maxWidth: 600 }}
              items={[{
                key: '1',
                label: '错误详情（仅开发模式显示）',
                children: (
                  <div style={{ textAlign: 'left' }}>
                    <Text strong>错误信息:</Text>
                    <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: '#f5222d' }}>
                      {error?.stack}
                    </pre>
                    <Text strong>组件调用栈:</Text>
                    <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: '#666' }}>
                      {errorInfo.componentStack}
                    </pre>
                  </div>
                ),
              }]}
            />
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

// ==================== 高阶组件 ====================

/**
 * withErrorBoundary HOC - 给组件包裹错误边界
 */
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  options?: Omit<ErrorBoundaryProps, 'children'>
): React.FC<P> {
  const WithErrorBoundary: React.FC<P> = (props) => (
    <ErrorBoundary {...options}>
      <WrappedComponent {...props} />
    </ErrorBoundary>
  );

  WithErrorBoundary.displayName = `WithErrorBoundary(${WrappedComponent.displayName || WrappedComponent.name})`;
  return WithErrorBoundary;
}
