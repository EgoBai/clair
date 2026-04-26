/**
 * LazyPage 包装器
 * 统一处理：Suspense加载 + ErrorBoundary错误捕获
 * 简化 main.tsx 路由定义
 */

import React, { Suspense, LazyExoticComponent, ComponentType } from 'react';
import { Spin } from 'antd';
import { UnifiedErrorBoundary } from './UnifiedErrorBoundary';

interface LazyPageProps {
  component: LazyExoticComponent<ComponentType<any>>;
  name?: string;
}

const PageLoader = () => (
  <div style={{
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '60vh',
  }}>
    <Spin size="large" tip="页面加载中..." />
  </div>
);

export function LazyPage({ component: Component, name }: LazyPageProps) {
  return (
    <UnifiedErrorBoundary name={name} maxRetries={3}>
      <Suspense fallback={<PageLoader />}>
        <Component />
      </Suspense>
    </UnifiedErrorBoundary>
  );
}

export default React.memo(LazyPage);
