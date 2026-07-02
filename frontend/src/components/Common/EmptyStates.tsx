/**
 * 空状态设计组件
 * 统一的空状态展示，参考 Notion 的空状态设计
 */

import React from 'react';
import { Button, Typography, Space } from 'antd';
import {
  SearchOutlined, BellOutlined, StockOutlined, FilterOutlined,
  BarChartOutlined, FileSearchOutlined,
  WarningOutlined, DisconnectOutlined, WalletOutlined,
  ReadOutlined, TeamOutlined, LockOutlined, SyncOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

const { Title, Text, Paragraph } = Typography;

interface EmptyStateProps {
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

// 通用空状态
export const EmptyState = React.memo(function EmptyState({ icon, title, description, action, secondaryAction }: EmptyStateProps) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '48px 24px',
      textAlign: 'center',
    }}>
      {icon && (
        <div style={{ fontSize: 48, color: '#bfbfbf', marginBottom: 16 }}>
          {icon}
        </div>
      )}
      <Title level={5} style={{ color: '#595959', marginBottom: 8 }}>
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

// 预设空状态

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
  const _navigate = useNavigate();
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
      icon={<StarOutlined />}
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

// 错误状态
export const ErrorState = React.memo(function ErrorState({
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

// 网络断开
export const DisconnectedState = React.memo(function DisconnectedState({ onReconnect }: { onReconnect?: () => void }) {
  return (
    <EmptyState
      icon={<DisconnectOutlined style={{ color: '#f5222d' }} />}
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

// 自选股星标图标
function StarOutlined(props: any) {
  return <StockOutlined {...props} />;
}

// 更多预设空状态
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

// 统一加载状态组件
export function LoadingState({
  title = '加载中',
  description = '数据正在加载，请稍候...',
}: {
  title?: string;
  description?: string;
}) {
  return (
    <EmptyState
      icon={<SyncOutlined spin style={{ color: '#1890ff' }} />}
      title={title}
      description={description}
    />
  );
}

// 权限不足状态
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


