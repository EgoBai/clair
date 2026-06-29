/**
 * 图表专用错误边界
 * 轻量级，针对 ECharts 渲染失败提供优雅降级
 */

import { Component, ErrorInfo, ReactNode } from 'react';
import logger from '../../utils/logger';

interface ChartErrorBoundaryProps {
  children: ReactNode;
  title?: string;
  height?: number | string;
  onRetry?: () => void;
}

interface ChartErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  retryCount: number;
}

export default class ChartErrorBoundary extends Component<ChartErrorBoundaryProps, ChartErrorBoundaryState> {
  state: ChartErrorBoundaryState = {
    hasError: false,
    error: null,
    retryCount: 0,
  };

  static getDerivedStateFromError(error: Error): Partial<ChartErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, _errorInfo: ErrorInfo) {
    logger.warn(`[ChartErrorBoundary] 图表渲染失败:`, error.message);
  }

  handleRetry = () => {
    if (this.state.retryCount < 3) {
      this.setState(prev => ({
        hasError: false,
        error: null,
        retryCount: prev.retryCount + 1,
      }));
      this.props.onRetry?.();
    }
  };

  render() {
    if (this.state.hasError) {
      const { title = '图表', height = 300 } = this.props;
      const canRetry = this.state.retryCount < 3;

      return (
        <div style={{
          height,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--color-bg-secondary, #f8f9fa)',
          borderRadius: 8,
          border: '1px dashed var(--color-border, #e2e8f0)',
          color: 'var(--color-text-secondary, #64748b)',
          gap: 12,
        }}>
          <span style={{ fontSize: 32 }}>📊</span>
          <span style={{ fontSize: 14, fontWeight: 500 }}>{title} 加载失败</span>
          <span style={{ fontSize: 12, opacity: 0.7 }}>{this.state.error?.message}</span>
          {canRetry && (
            <button
              onClick={this.handleRetry}
              style={{
                padding: '6px 16px',
                border: '1px solid var(--color-primary, #3B82F6)',
                borderRadius: 6,
                background: 'transparent',
                color: 'var(--color-primary, #3B82F6)',
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              重试 ({3 - this.state.retryCount} 次剩余)
            </button>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
