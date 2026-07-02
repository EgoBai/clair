/**
 * 虚拟滚动列表
 * 大数据量股票列表性能优化
 * 参考 TradingView 的大数据渲染优化
 */

import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Typography, Spin } from 'antd';

const { Text } = Typography;

interface VirtualListProps<T> {
  items: T[];
  itemHeight: number;
  height: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  overscan?: number;
  loading?: boolean;
  onEndReached?: () => void;
  endReachedThreshold?: number;
  keyExtractor: (item: T, index: number) => string | number;
}

export default function VirtualList<T>({
  items,
  itemHeight,
  height,
  renderItem,
  overscan = 5,
  loading = false,
  onEndReached,
  endReachedThreshold = 200,
  keyExtractor,
}: VirtualListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const totalHeight = items.length * itemHeight;

  // 计算可见范围
  const { startIndex, endIndex, visibleItems } = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const visibleCount = Math.ceil(height / itemHeight) + 2 * overscan;
    const end = Math.min(items.length - 1, start + visibleCount);
    return {
      startIndex: start,
      endIndex: end,
      visibleItems: items.slice(start, end + 1),
    };
  }, [items, scrollTop, itemHeight, height, overscan]);

  // 滚动处理
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    setScrollTop(el.scrollTop);

    // 触底检测
    if (onEndReached) {
      const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distanceToBottom < endReachedThreshold) {
        onEndReached();
      }
    }
  }, [onEndReached, endReachedThreshold]);

  // 监听滚动事件
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  return (
    <div
      ref={containerRef}
      style={{
        height,
        overflow: 'auto',
        position: 'relative',
        willChange: 'transform',
      }}
    >
      {/* 撑高容器 */}
      <div style={{ height: totalHeight, position: 'relative' }}>
        {/* 可见区域 */}
        <div
          style={{
            position: 'absolute',
            top: startIndex * itemHeight,
            left: 0,
            right: 0,
          }}
        >
          {visibleItems.map((item, i) => (
            <div
              key={keyExtractor(item, startIndex + i)}
              style={{ height: itemHeight }}
            >
              {renderItem(item, startIndex + i)}
            </div>
          ))}
        </div>
      </div>

      {/* 加载指示器 */}
      {loading && (
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '8px 0',
          textAlign: 'center',
          background: 'rgba(255,255,255,0.9)',
        }}>
          <Spin size="small" /> <Text type="secondary" style={{ marginLeft: 8 }}>加载中...</Text>
        </div>
      )}
    </div>
  );
}
