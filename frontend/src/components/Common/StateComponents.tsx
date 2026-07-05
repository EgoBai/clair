/**
 * 统一状态组件 — 加载/空/错误
 * 全站一致的使用体验
 */

import React from 'react';
import { Button, Result, Skeleton } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

interface LoadingStateProps {
  tip?: string;
  fullPage?: boolean;
}

export const LoadingState: React.FC<LoadingStateProps> = ({ fullPage }) => {
  if (fullPage) {
    return (
      <div style={{ padding: 16, maxWidth: 1400, margin: '0 auto' }}>
        <Skeleton active paragraph={{ rows: 1 }} style={{ marginBottom: 16 }} />
        <Skeleton active paragraph={{ rows: 6 }} />
      </div>
    );
  }
  return <Skeleton active paragraph={{ rows: 3 }} />;
};

interface EmptyStateProps {
  icon?: React.ReactNode;
  title?: string;
  description?: string;
  action?: { text: string; onClick: () => void };
}

export const EmptyState: React.FC<EmptyStateProps> = ({ 
  icon = '📭', 
  title = '暂无数据',
  description,
  action,
}) => (
  <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-secondary)' }}>
    <div style={{ fontSize: 48, marginBottom: 16 }}>{icon}</div>
    <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>{title}</div>
    {description && <div style={{ fontSize: 13, marginBottom: 16 }}>{description}</div>}
    {action && (
      <Button type="primary" onClick={action.onClick} icon={<ReloadOutlined />}>
        {action.text}
      </Button>
    )}
  </div>
);

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({ message = '加载失败', onRetry }) => (
  <Result
    status="error"
    title={message}
    subTitle="请检查网络连接后重试"
    extra={onRetry && (
      <Button type="primary" onClick={onRetry} icon={<ReloadOutlined />}>
        重试
      </Button>
    )}
  />
);

interface PageTitleProps {
  icon?: string;
  title: string;
  subtitle?: string;
}

export const PageTitle: React.FC<PageTitleProps> = ({ icon, title, subtitle }) => (
  <div style={{ marginBottom: 20 }}>
    <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
      {icon && <span>{icon}</span>}
      {title}
    </h2>
    {subtitle && <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>{subtitle}</p>}
  </div>
);
