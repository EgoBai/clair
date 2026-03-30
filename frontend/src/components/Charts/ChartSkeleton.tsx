import React from 'react';
import { Card, Skeleton } from 'antd';

/**
 * 图表骨架屏组件
 * 在图表数据加载时显示占位效果
 */

interface ChartSkeletonProps {
  /** 卡片标题 */
  title?: string;
  /** 骨架屏高度 */
  height?: number;
  /** 是否显示骨架屏 */
  loading?: boolean;
  /** 子组件（加载完成后显示） */
  children?: React.ReactNode;
  /** 卡片大小 */
  size?: 'default' | 'small';
  /** 额外操作区 */
  extra?: React.ReactNode;
}

export const ChartSkeleton: React.FC<ChartSkeletonProps> = ({
  title,
  height = 300,
  loading = false,
  children,
  size = 'small',
  extra,
}) => {
  if (!loading) {
    return (
      <Card title={title} size={size} extra={extra}>
        {children}
      </Card>
    );
  }

  return (
    <Card title={title} size={size} extra={extra}>
      <div style={{ height, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <Skeleton active paragraph={{ rows: Math.floor(height / 60) }} />
      </div>
    </Card>
  );
};

/**
 * 简单的图表加载占位（无卡片包裹）
 */
export const ChartLoadingPlaceholder: React.FC<{ height?: number }> = ({ height = 300 }) => (
  <div
    style={{
      height,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#fafafa',
      borderRadius: 8,
    }}
  >
    <Skeleton active paragraph={{ rows: 3 }} style={{ width: '80%' }} />
  </div>
);

export default ChartSkeleton;
