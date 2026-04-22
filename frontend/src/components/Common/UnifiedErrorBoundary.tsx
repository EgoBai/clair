/**
 * 统一错误边界组件
 * 第17轮迭代优化：统一所有ErrorBoundary实现，消除重复代码
 * 
 * 功能特性：
 * 1. 基础错误捕获和降级UI
 * 2. 支持自定义fallback组件
 * 3. 错误上报和日志记录
 * 4. 自动重试机制
 * 5. 特定领域适配器（图表、表单等）
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import logger from '../../utils/logger';
import { Button, Result, Typography, Space, Alert } from 'antd';
import { ReloadOutlined, BugOutlined, HomeOutlined, WarningOutlined } from '@ant-design/icons';

const { Text, Paragraph } = Typography;

// ==================== 类型定义 ====================

export interface ErrorBoundaryProps {
  /** 子组件 */
  children: ReactNode;
  
  /** 自定义降级UI或渲染函数 */
  fallback?: ReactNode | ((error: Error, retry: () => void, errorInfo?: ErrorInfo) => ReactNode);
  
  /** 错误发生时的回调 */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  
  /** 最大重试次数，0表示不重试 */
  maxRetries?: number;
  
  /** 当这些值变化时自动重置错误状态 */
  resetKeys?: unknown[];
  
  /** 组件名称，用于错误定位 */
  name?: string;
  
  /** 错误边界类型，用于提供特定领域的降级UI */
  boundaryType?: 'default' | 'chart' | 'form' | 'table' | 'data';
  
  /** 是否显示详细错误信息（开发环境） */
  showDetails?: boolean;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  retryCount: number;
  errorId: string;
}

// ==================== 错误上报工具 ====================

interface ErrorReport {
  error: Error;
  errorInfo: ErrorInfo;
  timestamp: number;
  url: string;
  componentName?: string;
  boundaryType?: string;
  retryCount: number;
}

class ErrorReporter {
  private static instance: ErrorReporter;
  private reports: ErrorReport[] = [];
  private readonly MAX_REPORTS = 100;

  private constructor() {}

  static getInstance(): ErrorReporter {
    if (!ErrorReporter.instance) {
      ErrorReporter.instance = new ErrorReporter();
    }
    return ErrorReporter.instance;
  }

  report(report: ErrorReport): void {
    this.reports.push(report);
    if (this.reports.length > this.MAX_REPORTS) {
      this.reports.shift();
    }

    // 开发环境：控制台输出
    if (process.env.NODE_ENV === 'development') {
      console.group(`[ErrorBoundary] ${report.componentName || 'Unknown Component'}`);
      logger.error('Error:', report.error);
      logger.error('Component Stack:', report.errorInfo.componentStack);
      console.groupEnd();
    }

    // TODO: 生产环境可集成Sentry等错误监控服务
    // if (process.env.NODE_ENV === 'production') {
    //   // 发送到错误监控服务
    // }
  }

  getReports(): ErrorReport[] {
    return [...this.reports];
  }

  clear(): void {
    this.reports = [];
  }
}

// ==================== 降级UI组件 ====================

interface FallbackUIProps {
  error: Error;
  errorInfo?: ErrorInfo;
  boundaryType?: string;
  componentName?: string;
  retryCount: number;
  maxRetries: number;
  onRetry: () => void;
  showDetails?: boolean;
}

const DefaultFallback: React.FC<FallbackUIProps> = ({
  error,
  errorInfo,
  boundaryType = 'default',
  componentName,
  retryCount,
  maxRetries,
  onRetry,
  showDetails = process.env.NODE_ENV === 'development',
}) => {
  const canRetry = maxRetries === 0 || retryCount < maxRetries;
  const errorTitle = componentName 
    ? `${componentName} 渲染失败`
    : '组件渲染异常';

  return (
    <Result
      status="error"
      title={errorTitle}
      subTitle={error.message || '发生了未知错误'}
      extra={
        <Space>
          {canRetry && (
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              onClick={onRetry}
            >
              重试 {retryCount > 0 && `(${retryCount}/${maxRetries})`}
            </Button>
          )}
          <Button
            icon={<HomeOutlined />}
            onClick={() => window.location.reload()}
          >
            刷新页面
          </Button>
        </Space>
      }
    >
      {showDetails && errorInfo && (
        <Alert
          type="info"
          message="错误详情"
          description={
            <div style={{ maxHeight: 200, overflow: 'auto' }}>
              <Paragraph copyable code>
                {errorInfo.componentStack}
              </Paragraph>
            </div>
          }
          style={{ marginTop: 16 }}
        />
      )}
    </Result>
  );
};

const ChartFallback: React.FC<FallbackUIProps> = (props) => {
  const { error, onRetry, retryCount, maxRetries } = props;
  const canRetry = maxRetries === 0 || retryCount < maxRetries;

  return (
    <div style={{
      height: 300,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#fafafa',
      border: '1px dashed #d9d9d9',
      borderRadius: 8,
      padding: 24,
    }}>
      <WarningOutlined style={{ fontSize: 48, color: '#faad14', marginBottom: 16 }} />
      <Text type="warning" strong>图表加载失败</Text>
      <Text type="secondary" style={{ marginTop: 8, marginBottom: 16 }}>
        {error.message || '图表数据渲染异常'}
      </Text>
      {canRetry && (
        <Button
          size="small"
          icon={<ReloadOutlined />}
          onClick={onRetry}
        >
          重新加载
        </Button>
      )}
    </div>
  );
};

const FormFallback: React.FC<FallbackUIProps> = (props) => {
  const { error, onRetry } = props;

  return (
    <Alert
      type="error"
      message="表单加载失败"
      description={
        <div>
          <Paragraph>{error.message || '表单组件初始化失败'}</Paragraph>
          <Button
            size="small"
            type="link"
            onClick={onRetry}
            style={{ padding: 0 }}
          >
            点击重试
          </Button>
        </div>
      }
      style={{ margin: '16px 0' }}
    />
  );
};

// ==================== 主组件 ====================

export class UnifiedErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  static defaultProps: Partial<ErrorBoundaryProps> = {
    maxRetries: 3,
    boundaryType: 'default',
    showDetails: process.env.NODE_ENV === 'development',
  };

  private errorReporter = ErrorReporter.getInstance();

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
      errorId: this.generateErrorId(),
    };
  }

  private generateErrorId(): string {
    return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });

    // 错误上报
    this.errorReporter.report({
      error,
      errorInfo,
      timestamp: Date.now(),
      url: window.location.href,
      componentName: this.props.name,
      boundaryType: this.props.boundaryType,
      retryCount: this.state.retryCount,
    });

    // 调用自定义错误处理
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    // 当resetKeys变化时重置错误状态
    if (
      this.props.resetKeys &&
      JSON.stringify(this.props.resetKeys) !== JSON.stringify(prevProps.resetKeys)
    ) {
      this.resetError();
    }
  }

  resetError = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
      errorId: this.generateErrorId(),
    });
  };

  handleRetry = (): void => {
    const { maxRetries = 3 } = this.props;
    
    if (maxRetries === 0 || this.state.retryCount < maxRetries) {
      this.setState(
        (prev) => ({ retryCount: prev.retryCount + 1 }),
        () => {
          this.resetError();
        }
      );
    }
  };

  renderFallback(): ReactNode {
    const { fallback, boundaryType, name, showDetails } = this.props;
    const { error, errorInfo, retryCount } = this.state;
    const { maxRetries = 3 } = this.props;

    if (typeof fallback === 'function') {
      return fallback(error!, this.handleRetry, errorInfo || undefined);
    }

    if (fallback) {
      return fallback;
    }

    const fallbackProps: FallbackUIProps = {
      error: error!,
      errorInfo: errorInfo || undefined,
      boundaryType,
      componentName: name,
      retryCount,
      maxRetries,
      onRetry: this.handleRetry,
      showDetails,
    };

    switch (boundaryType) {
      case 'chart':
        return <ChartFallback {...fallbackProps} />;
      case 'form':
        return <FormFallback {...fallbackProps} />;
      case 'table':
      case 'data':
        return <DefaultFallback {...fallbackProps} />;
      default:
        return <DefaultFallback {...fallbackProps} />;
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return this.renderFallback();
    }

    return this.props.children;
  }
}

// ==================== 便捷导出 ====================

/**
 * 图表错误边界
 */
export const ChartErrorBoundary: React.FC<Omit<ErrorBoundaryProps, 'boundaryType'>> = (props) => (
  <UnifiedErrorBoundary boundaryType="chart" {...props} />
);

/**
 * 表单错误边界
 */
export const FormErrorBoundary: React.FC<Omit<ErrorBoundaryProps, 'boundaryType'>> = (props) => (
  <UnifiedErrorBoundary boundaryType="form" {...props} />
);

/**
 * 数据表格错误边界
 */
export const TableErrorBoundary: React.FC<Omit<ErrorBoundaryProps, 'boundaryType'>> = (props) => (
  <UnifiedErrorBoundary boundaryType="table" {...props} />
);

/**
 * 简化版错误边界（无重试）
 */
export const SimpleErrorBoundary: React.FC<Omit<ErrorBoundaryProps, 'maxRetries'>> = (props) => (
  <UnifiedErrorBoundary maxRetries={0} {...props} />
);