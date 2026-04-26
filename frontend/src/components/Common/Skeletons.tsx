/**
 * 骨架屏组件库
 * 提供各种页面的加载占位符，提升感知性能
 */

import React from 'react';
import { Skeleton, Card, Row, Col, Space } from 'antd';

// ==================== 基础骨架 ====================

/** 单行文本骨架 */
export const TextSkeleton: React.FC<{ width?: number | string }> = ({ width = '100%' }) => (
  <Skeleton.Input active size="small" style={{ width }} />
);

/** 头像骨架 */
export const AvatarSkeleton: React.FC<{ size?: number }> = ({ size = 40 }) => (
  <Skeleton.Avatar active size={size} />
);

/** 按钮骨架 */
export const ButtonSkeleton: React.FC<{ width?: number }> = ({ width = 80 }) => (
  <Skeleton.Button active size="small" style={{ width }} />
);

// ==================== 股票相关骨架 ====================

/** 股票行情卡片骨架 */
export const QuoteCardSkeleton: React.FC = () => (
  <Card size="small" style={{ marginBottom: 12 }}>
    <Row gutter={[16, 16]}>
      <Col xs={24} md={8}>
        <Space direction="vertical" size={4}>
          <Skeleton.Input active size="default" style={{ width: 120 }} />
          <Space>
            <Skeleton.Button active size="small" style={{ width: 60 }} />
            <Skeleton.Button active size="small" style={{ width: 60 }} />
          </Space>
        </Space>
      </Col>
      <Col xs={24} md={16}>
        <Row gutter={[8, 8]}>
          {Array.from({ length: 10 }).map((_, i) => (
            <Col xs={12} sm={8} md={6} key={i}>
              <Skeleton.Input active size="small" style={{ width: '100%' }} />
            </Col>
          ))}
        </Row>
      </Col>
    </Row>
  </Card>
);

/** K线图骨架 */
export const KLineSkeleton: React.FC<{ height?: number }> = ({ height = 450 }) => (
  <div style={{
    height,
    background: 'linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%)',
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.5s infinite',
    borderRadius: 4,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#bbb',
  }}>
    <span style={{ fontSize: 14 }}>加载图表中...</span>
  </div>
);

/** 股票列表行骨架 */
export const StockListRowSkeleton: React.FC = () => (
  <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
    <Row gutter={16} align="middle">
      <Col span={4}><Skeleton.Input active size="small" style={{ width: 80 }} /></Col>
      <Col span={4}><Skeleton.Input active size="small" style={{ width: 70 }} /></Col>
      <Col span={4}><Skeleton.Input active size="small" style={{ width: 60 }} /></Col>
      <Col span={4}><Skeleton.Input active size="small" style={{ width: 60 }} /></Col>
      <Col span={4}><Skeleton.Input active size="small" style={{ width: 80 }} /></Col>
      <Col span={4}><Skeleton.Input active size="small" style={{ width: 80 }} /></Col>
    </Row>
  </div>
);

/** 表格骨架 - 多行 */
export const TableSkeleton: React.FC<{ rows?: number }> = ({ rows = 10 }) => (
  <div>
    {Array.from({ length: rows }).map((_, i) => (
      <StockListRowSkeleton key={i} />
    ))}
  </div>
);

// ==================== 首页骨架 ====================

/** 首页概览卡片骨架 */
export const OverviewCardSkeleton: React.FC = () => (
  <Row gutter={[12, 12]}>
    {Array.from({ length: 4 }).map((_, i) => (
      <Col xs={12} sm={6} key={i}>
        <Card size="small">
          <Skeleton.Input active size="small" style={{ width: 60, marginBottom: 8 }} />
          <Skeleton.Input active style={{ width: 80 }} />
        </Card>
      </Col>
    ))}
  </Row>
);

/** 环形图骨架 */
export const PieChartSkeleton: React.FC = () => (
  <div style={{
    height: 280,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }}>
    <div style={{
      width: 180,
      height: 180,
      borderRadius: '50%',
      background: 'linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.5s infinite',
    }} />
  </div>
);

/** 柱状图骨架 */
export const BarChartSkeleton: React.FC<{ height?: number }> = ({ height = 280 }) => (
  <div style={{
    height,
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 8,
    padding: '0 40px',
  }}>
    {Array.from({ length: 12 }).map((_, i) => (
      <div
        key={i}
        style={{
          flex: 1,
          height: `${20 + Math.abs(Math.sin(i * 0.7)) * 60}%`,
          background: 'linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.5s infinite',
          animationDelay: `${i * 0.05}s`,
          borderRadius: '3px 3px 0 0',
        }}
      />
    ))}
  </div>
);

/** 首页完整骨架 */
export const HomePageSkeleton: React.FC = () => (
  <div style={{ padding: '16px' }}>
    <OverviewCardSkeleton />
    <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
      <Col xs={24} md={8}>
        <Card size="small">
          <Skeleton.Input active size="small" style={{ width: 100, marginBottom: 12 }} />
          <PieChartSkeleton />
        </Card>
      </Col>
      <Col xs={24} md={16}>
        <Card size="small">
          <Skeleton.Input active size="small" style={{ width: 100, marginBottom: 12 }} />
          <BarChartSkeleton />
        </Card>
      </Col>
    </Row>
  </div>
);

/** 股票详情页完整骨架 */
export const StockDetailSkeleton: React.FC = () => (
  <div style={{ padding: '16px' }}>
    {/* 面包屑 */}
    <div style={{ marginBottom: 16 }}>
      <Skeleton.Input active size="small" style={{ width: 300 }} />
    </div>
    {/* 行情卡片 */}
    <QuoteCardSkeleton />
    {/* K线图 */}
    <Card size="small" style={{ marginBottom: 12 }}>
      <div style={{ marginBottom: 8 }}>
        <Space>
          {['日K', '成交量', 'MACD', 'KDJ', 'RSI', '布林带'].map((label) => (
            <Skeleton.Button key={label} active size="small" style={{ width: 50 }} />
          ))}
        </Space>
      </div>
      <KLineSkeleton height={400} />
    </Card>
    {/* 基本信息 */}
    <Card size="small">
      <Skeleton.Input active size="small" style={{ width: 100, marginBottom: 12 }} />
      <Row gutter={[8, 8]}>
        {Array.from({ length: 7 }).map((_, i) => (
          <Col xs={12} sm={8} md={6} key={i}>
            <Skeleton.Input active size="small" style={{ width: '100%' }} />
          </Col>
        ))}
      </Row>
    </Card>
  </div>
);

export default {
  TextSkeleton,
  AvatarSkeleton,
  ButtonSkeleton,
  QuoteCardSkeleton,
  KLineSkeleton,
  StockListRowSkeleton,
  TableSkeleton,
  OverviewCardSkeleton,
  PieChartSkeleton,
  BarChartSkeleton,
  HomePageSkeleton,
  StockDetailSkeleton,
};
