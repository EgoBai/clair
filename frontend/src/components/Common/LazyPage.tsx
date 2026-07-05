/**
 * LazyPage 包装器
 * 统一处理：Suspense加载 + ErrorBoundary错误捕获 + 页面切换动画
 * 简化 main.tsx 路由定义
 */

import React, { Suspense, LazyExoticComponent, ComponentType } from 'react';
import { Card, Skeleton, Row, Col } from 'antd';
import { UnifiedErrorBoundary } from './UnifiedErrorBoundary';

interface LazyPageProps {
  component: LazyExoticComponent<ComponentType<any>>;
  name?: string;
}

const PageLoader = () => (
  <div style={{ padding: 16, maxWidth: 1400, margin: '0 auto' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
      <Skeleton.Input active size="small" style={{ width: 200 }} />
      <Skeleton.Button active size="small" style={{ width: 80 }} />
    </div>
    <Row gutter={16} style={{ marginBottom: 16 }}>
      {[1,2,3,4].map(i => (
        <Col xs={12} sm={6} key={i}>
          <Card size="small"><Skeleton paragraph={{ rows: 1 }} active /></Card>
        </Col>
      ))}
    </Row>
    <Row gutter={16}>
      <Col xs={24} lg={12}>
        <Card size="small"><Skeleton active paragraph={{ rows: 8 }} /></Card>
      </Col>
      <Col xs={24} lg={12}>
        <Card size="small"><Skeleton active paragraph={{ rows: 8 }} /></Card>
      </Col>
    </Row>
  </div>
);

const FadeIn: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <>
    <style>{`
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .page-fade-in {
        animation: fadeIn 0.3s ease-out;
      }
    `}</style>
    <div className="page-fade-in">{children}</div>
  </>
);

export function LazyPage({ component: Component, name }: LazyPageProps) {
  return (
    <UnifiedErrorBoundary name={name} maxRetries={3}>
      <Suspense fallback={<PageLoader />}>
        <FadeIn>
          <Component />
        </FadeIn>
      </Suspense>
    </UnifiedErrorBoundary>
  );
}

export default React.memo(LazyPage);
