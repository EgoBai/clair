/**
 * 骨架屏组件系统
 * 为关键页面提供加载态骨架屏，提升感知性能
 */

import React from 'react';

// ==================== 基础动画样式 ====================

const shimmerKeyframes = `
@keyframes skeleton-shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
`;

if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = shimmerKeyframes;
  document.head.appendChild(style);
}

const baseShimmer: React.CSSProperties = {
  background: 'linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 37%, #f0f0f0 63%)',
  backgroundSize: '200% 100%',
  animation: 'skeleton-shimmer 1.4s ease infinite',
  borderRadius: 4,
};

const darkShimmer: React.CSSProperties = {
  ...baseShimmer,
  background: 'linear-gradient(90deg, #2a2a2a 25%, #333 37%, #2a2a2a 63%)',
  backgroundSize: '200% 100%',
};

// ==================== 基础骨架元素 ====================

interface SkeletonBlockProps {
  width?: number | string;
  height?: number | string;
  style?: React.CSSProperties;
  dark?: boolean;
  circle?: boolean;
  className?: string;
}

export const SkeletonBlock: React.FC<SkeletonBlockProps> = ({
  width = '100%',
  height = 16,
  style,
  dark = false,
  circle = false,
  className,
}) => (
  <div
    className={className}
    style={{
      ...(dark ? darkShimmer : baseShimmer),
      width,
      height,
      borderRadius: circle ? '50%' : 4,
      ...style,
    }}
  />
);

// ==================== 文本行骨架 ====================

interface SkeletonTextProps {
  lines?: number;
  widths?: (string | number)[];
  lineHeight?: number;
  gap?: number;
  dark?: boolean;
}

export const SkeletonText: React.FC<SkeletonTextProps> = ({
  lines = 3,
  widths,
  lineHeight = 16,
  gap = 8,
  dark = false,
}) => {
  const defaultWidths = ['100%', '90%', '75%', '85%', '60%'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {Array.from({ length: lines }, (_, i) => (
        <SkeletonBlock
          key={i}
          width={widths?.[i] ?? defaultWidths[i % defaultWidths.length]}
          height={lineHeight}
          dark={dark}
        />
      ))}
    </div>
  );
};

// ==================== 卡片骨架 ====================

interface SkeletonCardProps {
  hasAvatar?: boolean;
  hasImage?: boolean;
  textLines?: number;
  dark?: boolean;
  style?: React.CSSProperties;
}

export const SkeletonCard: React.FC<SkeletonCardProps> = ({
  hasAvatar = false,
  hasImage = false,
  textLines = 3,
  dark = false,
  style,
}) => (
  <div style={{ padding: 16, border: '1px solid #f0f0f0', borderRadius: 8, ...style }}>
    {hasImage && <SkeletonBlock width="100%" height={160} dark={dark} style={{ marginBottom: 12 }} />}
    {hasAvatar && (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <SkeletonBlock width={40} height={40} circle dark={dark} />
        <div style={{ flex: 1 }}>
          <SkeletonBlock width="60%" height={14} dark={dark} style={{ marginBottom: 6 }} />
          <SkeletonBlock width="40%" height={12} dark={dark} />
        </div>
      </div>
    )}
    <SkeletonText lines={textLines} dark={dark} />
  </div>
);

// ==================== 股票列表骨架 ====================

interface SkeletonStockRowProps {
  dark?: boolean;
}

export const SkeletonStockRow: React.FC<SkeletonStockRowProps> = ({ dark = false }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      padding: '12px 16px',
      gap: 16,
      borderBottom: '1px solid #f0f0f0',
    }}
  >
    <SkeletonBlock width={60} height={14} dark={dark} />
    <SkeletonBlock width={80} height={14} dark={dark} />
    <div style={{ flex: 1 }} />
    <SkeletonBlock width={70} height={18} dark={dark} />
    <SkeletonBlock width={60} height={14} dark={dark} />
    <SkeletonBlock width={80} height={14} dark={dark} />
  </div>
);

export const SkeletonStockList: React.FC<{ rows?: number; dark?: boolean }> = ({
  rows = 10,
  dark = false,
}) => (
  <div>
    {/* 表头 */}
    <div style={{ display: 'flex', padding: '8px 16px', gap: 16, background: '#fafafa' }}>
      <SkeletonBlock width={60} height={12} dark={dark} />
      <SkeletonBlock width={80} height={12} dark={dark} />
      <div style={{ flex: 1 }} />
      <SkeletonBlock width={70} height={12} dark={dark} />
      <SkeletonBlock width={60} height={12} dark={dark} />
      <SkeletonBlock width={80} height={12} dark={dark} />
    </div>
    {Array.from({ length: rows }, (_, i) => (
      <SkeletonStockRow key={i} dark={dark} />
    ))}
  </div>
);

// ==================== 股票详情骨架 ====================

export const SkeletonStockDetail: React.FC<{ dark?: boolean }> = ({ dark = false }) => (
  <div style={{ padding: 24 }}>
    {/* 头部信息 */}
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24, marginBottom: 24 }}>
      <div style={{ flex: 1 }}>
        <SkeletonBlock width={200} height={28} dark={dark} style={{ marginBottom: 8 }} />
        <SkeletonBlock width={120} height={14} dark={dark} style={{ marginBottom: 16 }} />
        <div style={{ display: 'flex', gap: 24 }}>
          <SkeletonBlock width={100} height={36} dark={dark} />
          <SkeletonBlock width={80} height={20} dark={dark} />
          <SkeletonBlock width={80} height={20} dark={dark} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <SkeletonBlock width={80} height={32} dark={dark} />
        <SkeletonBlock width={80} height={32} dark={dark} />
      </div>
    </div>
    {/* K线图区域 */}
    <SkeletonBlock width="100%" height={400} dark={dark} style={{ marginBottom: 24 }} />
    {/* 指标卡片 */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
      {Array.from({ length: 8 }, (_, i) => (
        <SkeletonCard key={i} textLines={2} dark={dark} />
      ))}
    </div>
  </div>
);

// ==================== K线图骨架 ====================

export const SkeletonChart: React.FC<{ height?: number; dark?: boolean }> = ({
  height = 350,
  dark = false,
}) => (
  <div style={{ position: 'relative' }}>
    <SkeletonBlock width="100%" height={height} dark={dark} />
    {/* 模拟图表刻度 */}
    <div style={{ position: 'absolute', left: 8, top: 20, bottom: 30, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      {Array.from({ length: 5 }, (_, i) => (
        <SkeletonBlock key={i} width={40} height={10} dark={dark} />
      ))}
    </div>
    {/* 模拟时间轴 */}
    <div style={{ position: 'absolute', bottom: 8, left: 60, right: 20, display: 'flex', justifyContent: 'space-between' }}>
      {Array.from({ length: 6 }, (_, i) => (
        <SkeletonBlock key={i} width={40} height={10} dark={dark} />
      ))}
    </div>
  </div>
);

// ==================== 仪表盘骨架 ====================

export const SkeletonDashboard: React.FC<{ dark?: boolean }> = ({ dark = false }) => (
  <div style={{ padding: 24 }}>
    {/* 指标概览行 */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} style={{ padding: 16, border: '1px solid #f0f0f0', borderRadius: 8 }}>
          <SkeletonBlock width="60%" height={12} dark={dark} style={{ marginBottom: 8 }} />
          <SkeletonBlock width="80%" height={28} dark={dark} style={{ marginBottom: 6 }} />
          <SkeletonBlock width="40%" height={12} dark={dark} />
        </div>
      ))}
    </div>
    {/* 主图表 */}
    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 24 }}>
      <SkeletonChart height={300} dark={dark} />
      <SkeletonCard textLines={6} dark={dark} />
    </div>
    {/* 表格区域 */}
    <SkeletonStockList rows={5} dark={dark} />
  </div>
);

// ==================== 新闻列表骨架 ====================

export const SkeletonNewsList: React.FC<{ items?: number; dark?: boolean }> = ({
  items = 5,
  dark = false,
}) => (
  <div>
    {Array.from({ length: items }, (_, i) => (
      <div
        key={i}
        style={{
          display: 'flex',
          gap: 16,
          padding: '16px 0',
          borderBottom: '1px solid #f0f0f0',
        }}
      >
        <SkeletonBlock width={120} height={80} dark={dark} />
        <div style={{ flex: 1 }}>
          <SkeletonBlock width="70%" height={18} dark={dark} style={{ marginBottom: 8 }} />
          <SkeletonText lines={2} lineHeight={12} dark={dark} />
          <SkeletonBlock width={80} height={10} dark={dark} style={{ marginTop: 8 }} />
        </div>
      </div>
    ))}
  </div>
);

// ==================== 自选股骨架 ====================

export const SkeletonWatchlist: React.FC<{ dark?: boolean }> = ({ dark = false }) => (
  <div style={{ padding: 16 }}>
    {/* 标签栏 */}
    <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
      <SkeletonBlock width={60} height={32} dark={dark} />
      <SkeletonBlock width={60} height={32} dark={dark} />
      <SkeletonBlock width={60} height={32} dark={dark} />
    </div>
    <SkeletonStockList rows={8} dark={dark} />
  </div>
);

// ==================== 市场分析骨架 ====================

export const SkeletonMarketAnalysis: React.FC<{ dark?: boolean }> = ({ dark = false }) => (
  <div style={{ padding: 24 }}>
    {/* 大盘指数 */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} style={{ padding: 16, border: '1px solid #f0f0f0', borderRadius: 8 }}>
          <SkeletonBlock width="50%" height={14} dark={dark} style={{ marginBottom: 8 }} />
          <SkeletonBlock width="70%" height={24} dark={dark} style={{ marginBottom: 4 }} />
          <SkeletonBlock width="40%" height={14} dark={dark} />
        </div>
      ))}
    </div>
    {/* 热力图区域 */}
    <SkeletonBlock width="100%" height={350} dark={dark} style={{ marginBottom: 24 }} />
    {/* 板块排行 */}
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <SkeletonStockList rows={5} dark={dark} />
      <SkeletonStockList rows={5} dark={dark} />
    </div>
  </div>
);

// ==================== 导出所有骨架屏 ====================

export default {
  Block: SkeletonBlock,
  Text: SkeletonText,
  Card: SkeletonCard,
  StockRow: SkeletonStockRow,
  StockList: SkeletonStockList,
  StockDetail: SkeletonStockDetail,
  Chart: SkeletonChart,
  Dashboard: SkeletonDashboard,
  NewsList: SkeletonNewsList,
  Watchlist: SkeletonWatchlist,
  MarketAnalysis: SkeletonMarketAnalysis,
};
