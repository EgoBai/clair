/**
 * 页面级渲染兜底（ErrorBoundary + SafePage）
 *
 * 背景：后端返回 404 / 空数组 / 部分字段缺失是常态，页面组件在渲染期
 * 对 undefined 取值会抛错。抛错若不兜住，会把整个应用打崩（白屏或整页失败）。
 *
 * 设计要点：
 * 1. 兜底 UI 是**局部卡片**，只替换出问题的那块内容，布局与侧边导航仍在，
 *    用户可以继续切换其它子页面（不是整页替换）。
 * 2. componentDidCatch 拿到 error.message 作为错误摘要。
 * 3. 「重试」重置 boundary state 并强制重挂载子树（换 key），从而重新走一遍
 *    数据请求与渲染，而不是原地空转。
 * 4. 文案如实：明确写「渲染出错（数据可能不完整）」，不得伪装成
 *    「暂无数据 / 没有相关标的」这类业务空态。
 */

import React, { Component, ComponentType, ErrorInfo, LazyExoticComponent, ReactNode, Suspense } from 'react';
import { useLocation } from 'react-router-dom';
import { Alert, Button, Card, Skeleton, Space, Typography } from 'antd';
import { ReloadOutlined, WarningOutlined } from '@ant-design/icons';

const { Paragraph, Text } = Typography;

export interface PageErrorBoundaryProps {
  children: ReactNode;
  /** 出错模块名，展示在降级卡片标题上，便于定位 */
  name?: string;
  /** 该值变化时自动重置错误状态（路由切换后不应残留上一次的失败态） */
  resetKey?: string;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** 自定义降级 UI（一般不需要） */
  fallback?: ReactNode;
}

interface PageErrorBoundaryState {
  hasError: boolean;
  message: string;
  retryNonce: number;
}

export class ErrorBoundary extends Component<PageErrorBoundaryProps, PageErrorBoundaryState> {
  constructor(props: PageErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '', retryNonce: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<PageErrorBoundaryState> {
    return { hasError: true, message: error?.message || '未知渲染错误' };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // 保留控制台现场，便于定位；同时交给调用方（如需上报）
    // eslint-disable-next-line no-console
    console.error(`[ErrorBoundary]${this.props.name ? ` ${this.props.name}` : ''} 渲染出错:`, error, errorInfo?.componentStack);
    this.props.onError?.(error, errorInfo);
  }

  componentDidUpdate(prevProps: PageErrorBoundaryProps): void {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.reset();
    }
  }

  reset = (): void => {
    this.setState((prev) => ({
      hasError: false,
      message: '',
      retryNonce: prev.retryNonce + 1,
    }));
  };

  private renderFallback(): ReactNode {
    const { name, fallback } = this.props;
    const { message } = this.state;

    if (fallback) return fallback;

    const title = name ? `${name} 渲染出错` : '本页面渲染出错';

    return (
      <Card
        size="small"
        data-testid="page-error-boundary"
        style={{ margin: 16 }}
        title={
          <Space>
            <WarningOutlined style={{ color: '#ff4d4f' }} />
            <span>{title}</span>
          </Space>
        }
      >
        <Alert
          type="error"
          showIcon
          message="本页面渲染出错（数据可能不完整），已降级显示"
          description={
            <div>
              <Paragraph style={{ marginBottom: 8 }}>
                这是<Text strong>渲染出错</Text>，不代表当前业务确实为空。可能原因：接口未取到数据、
                返回字段缺失或数据格式与预期不符。已仅降级本区域，侧边导航与其它页面仍可正常使用。
              </Paragraph>
              <Text code style={{ wordBreak: 'break-all' }}>
                错误摘要：{message}
              </Text>
            </div>
          }
        />
        <Space style={{ marginTop: 16 }}>
          <Button type="primary" icon={<ReloadOutlined />} onClick={this.reset}>
            重试
          </Button>
          <Button onClick={() => window.location.reload()}>刷新页面</Button>
        </Space>
      </Card>
    );
  }

  render(): ReactNode {
    if (this.state.hasError) return this.renderFallback();
    // key 随 retryNonce 变化 → 重试时强制重挂载子树，重新发起数据请求
    return <React.Fragment key={this.state.retryNonce}>{this.props.children}</React.Fragment>;
  }
}

/** 懒加载兜底骨架（仅加载态，不是错误态） */
const PageLoading = () => (
  <div style={{ padding: 16 }}>
    <Skeleton active paragraph={{ rows: 2 }} />
    <Skeleton active paragraph={{ rows: 6 }} />
  </div>
);

export interface SafePageProps {
  component: LazyExoticComponent<ComponentType<any>>;
  name?: string;
}

/**
 * 路由层使用：Suspense（加载态）+ ErrorBoundary（出错态）二合一包装。
 * resetKey 绑定当前路由，切换子页面自动清除上一次的失败态。
 */
export function SafePage({ component: Component, name }: SafePageProps) {
  const location = useLocation();
  return (
    <ErrorBoundary name={name} resetKey={`${location.pathname}${location.search}`}>
      <Suspense fallback={<PageLoading />}>
        <Component />
      </Suspense>
    </ErrorBoundary>
  );
}

export default ErrorBoundary;
