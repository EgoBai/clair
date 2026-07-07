/**
 * 统一状态组件 — 加载/空/错误
 * 全站一致的使用体验，基于 CSS 变量的暗色主题适配
 */

import React from 'react';
import { Button, Result, Skeleton, Typography, Space } from 'antd';
import {
  SearchOutlined, BellOutlined, StockOutlined, FilterOutlined,
  BarChartOutlined, FileSearchOutlined,
  WarningOutlined, DisconnectOutlined, WalletOutlined,
  ReadOutlined, TeamOutlined, LockOutlined, SyncOutlined, ReloadOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

const { Title, Paragraph } = Typography;

// ─── 基础状态组件 ────────────────────────────────────────────

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

interface BaseEmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    text: string;
    onClick: () => void;
    type?: 'primary' | 'default';
  };
  secondaryAction?: {
    text: string;
    onClick: () => void;
  };
}

export const EmptyState = React.memo(function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
}: BaseEmptyStateProps) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '48px 24px',
      textAlign: 'center',
      color: 'var(--text-secondary)',
    }}>
      {icon && (
        <div style={{ fontSize: 48, color: 'var(--text-muted, #64748b)', marginBottom: 16 }}>
          {icon}
        </div>
      )}
      <Title level={5} style={{ color: 'var(--text)', marginBottom: 8 }}>
        {title}
      </Title>
      {description && (
        <Paragraph type="secondary" style={{ maxWidth: 360, marginBottom: 24 }}>
          {description}
        </Paragraph>
      )}
      <Space>
        {action && (
          <Button type={action.type || 'primary'} onClick={action.onClick}>
            {action.text}
          </Button>
        )}
        {secondaryAction && (
          <Button onClick={secondaryAction.onClick}>
            {secondaryAction.text}
          </Button>
        )}
      </Space>
    </div>
  );
});

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

// ─── 预设空状态 ──────────────────────────────────────────────

export function EmptySearch({ query }: { query?: string }) {
  return (
    <EmptyState
      icon={<SearchOutlined />}
      title={query ? `未找到 "${query}" 的相关结果` : '搜索股票代码或名称'}
      description={query ? '试试其他关键词，或检查拼写是否正确' : '输入股票代码、名称或拼音首字母快速搜索'}
    />
  );
}

export function EmptyStocks() {
  return (
    <EmptyState
      icon={<StockOutlined />}
      title="暂无股票数据"
      description="股票数据正在同步中，请稍后再试"
      action={{
        text: '刷新页面',
        onClick: () => window.location.reload(),
      }}
    />
  );
}

export function EmptyWatchlist() {
  const navigate = useNavigate();
  return (
    <EmptyState
      icon={<StockOutlined />}
      title="自选股为空"
      description="将感兴趣的股票添加到自选股，方便快速查看行情"
      action={{
        text: '浏览股票',
        onClick: () => navigate('/stocks'),
      }}
    />
  );
}

export function EmptyAlerts() {
  return (
    <EmptyState
      icon={<BellOutlined />}
      title="暂无预警规则"
      description="设置价格、涨跌幅预警，第一时间获取市场异动通知"
    />
  );
}

export function EmptyScreener() {
  return (
    <EmptyState
      icon={<FilterOutlined />}
      title="开始筛选"
      description="设置筛选条件或选择预设模板，找到符合策略的投资标的"
    />
  );
}

export function EmptyChart() {
  return (
    <EmptyState
      icon={<BarChartOutlined />}
      title="暂无图表数据"
      description="图表数据加载中或当前时间范围无数据"
    />
  );
}

export function EmptyKLine() {
  return (
    <EmptyState
      icon={<BarChartOutlined />}
      title="暂无K线数据"
      description="该股票暂无K线行情数据"
      action={{
        text: '数据同步',
        onClick: () => {},
        type: 'default',
      }}
    />
  );
}

export function EmptyHistory() {
  return (
    <EmptyState
      icon={<FileSearchOutlined />}
      title="暂无历史记录"
      description="你的操作历史将显示在这里"
    />
  );
}

export function EmptyBacktest() {
  const navigate = useNavigate();
  return (
    <EmptyState
      icon={<BarChartOutlined />}
      title="开始策略回测"
      description="选择股票和策略参数，验证你的投资策略表现"
      action={{
        text: '选择策略',
        onClick: () => navigate('/advanced-screener'),
      }}
    />
  );
}

export function EmptyPortfolio() {
  return (
    <EmptyState
      icon={<WalletOutlined />}
      title="投资组合为空"
      description="添加持仓记录，跟踪你的投资收益"
      action={{
        text: '添加持仓',
        onClick: () => {},
      }}
    />
  );
}

export function EmptyNews() {
  return (
    <EmptyState
      icon={<ReadOutlined />}
      title="暂无新闻资讯"
      description="当前筛选条件下没有找到相关资讯"
      action={{
        text: '刷新',
        onClick: () => window.location.reload(),
        type: 'default',
      }}
    />
  );
}

export function EmptyScreenerResult() {
  return (
    <EmptyState
      icon={<FilterOutlined />}
      title="未找到匹配股票"
      description="尝试放宽筛选条件，或使用预设策略模板"
    />
  );
}

export function EmptySocial() {
  return (
    <EmptyState
      icon={<TeamOutlined />}
      title="暂无讨论内容"
      description="成为第一个发表观点的人，分享你的市场分析"
      action={{
        text: '发表观点',
        onClick: () => {},
      }}
    />
  );
}

// ─── 状态组件 ────────────────────────────────────────────────

export const ErrorStateDetail = React.memo(function ErrorStateDetail({
  title = '出了点问题',
  description = '请稍后再试，或联系技术支持',
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <EmptyState
      icon={<WarningOutlined style={{ color: '#faad14' }} />}
      title={title}
      description={description}
      action={onRetry ? {
        text: '重试',
        onClick: onRetry,
      } : undefined}
    />
  );
});

export const DisconnectedState = React.memo(function DisconnectedState({
  onReconnect,
}: {
  onReconnect?: () => void;
}) {
  return (
    <EmptyState
      icon={<DisconnectOutlined style={{ color: 'var(--color-error, #f5222d)' }} />}
      title="网络连接已断开"
      description="请检查网络连接，确保设备已接入互联网"
      action={onReconnect ? {
        text: '重新连接',
        onClick: onReconnect,
        type: 'primary',
      } : undefined}
    />
  );
});

export function LoadingStateDetail({
  title = '加载中',
  description = '数据正在加载，请稍候...',
}: {
  title?: string;
  description?: string;
}) {
  return (
    <EmptyState
      icon={<SyncOutlined spin style={{ color: 'var(--color-primary, #1890ff)' }} />}
      title={title}
      description={description}
    />
  );
}

export function PermissionDeniedState({
  onLogin,
}: {
  onLogin?: () => void;
} = {}) {
  return (
    <EmptyState
      icon={<LockOutlined />}
      title="需要登录"
      description="登录后即可使用该功能"
      action={onLogin ? {
        text: '立即登录',
        onClick: onLogin,
      } : undefined}
    />
  );
}
