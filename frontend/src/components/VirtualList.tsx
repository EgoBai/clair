/**
 * 虚拟列表组件
 * 用于大数据量列表的高性能渲染
 */

import React, { useState, useRef, useCallback, useMemo } from 'react';

interface VirtualListProps<T> {
  items: T[];
  itemHeight: number;
  containerHeight: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  overscan?: number; // 额外渲染的item数量
  className?: string;
  style?: React.CSSProperties;
  onEndReached?: () => void;
  endReachedThreshold?: number;
}

export function VirtualList<T>({
  items,
  itemHeight,
  containerHeight,
  renderItem,
  overscan = 5,
  className,
  style,
  onEndReached,
  endReachedThreshold = 100
}: VirtualListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  // 计算可见范围
  const { startIndex, endIndex, offsetY } = useMemo(() => {
    const startIdx = Math.floor(scrollTop / itemHeight);
    const visibleCount = Math.ceil(containerHeight / itemHeight);
    
    const start = Math.max(0, startIdx - overscan);
    const end = Math.min(items.length, startIdx + visibleCount + overscan);
    
    return {
      startIndex: start,
      endIndex: end,
      offsetY: start * itemHeight
    };
  }, [scrollTop, itemHeight, containerHeight, items.length, overscan]);

  // 可见items
  const visibleItems = useMemo(() => {
    return items.slice(startIndex, endIndex);
  }, [items, startIndex, endIndex]);

  // 总高度
  const totalHeight = items.length * itemHeight;

  // 滚动处理
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    setScrollTop(target.scrollTop);

    // 检查是否到达底部
    if (onEndReached) {
      const { scrollHeight, clientHeight, scrollTop: st } = target;
      if (scrollHeight - st - clientHeight < endReachedThreshold) {
        onEndReached();
      }
    }
  }, [onEndReached, endReachedThreshold]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        height: containerHeight,
        overflow: 'auto',
        ...style
      }}
      onScroll={handleScroll}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${offsetY}px)` }}>
          {visibleItems.map((item, idx) => (
            <div
              key={startIndex + idx}
              style={{ height: itemHeight }}
            >
              {renderItem(item, startIndex + idx)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * 虚拟表格组件
 */
interface VirtualTableProps<T> {
  data: T[];
  columns: Array<{
    key: string;
    title: string;
    width?: number;
    render?: (value: any, record: T, index: number) => React.ReactNode;
  }>;
  rowHeight?: number;
  height?: number;
  className?: string;
  onRowClick?: (record: T, index: number) => void;
}

export function VirtualTable<T extends Record<string, any>>({
  data,
  columns,
  rowHeight = 48,
  height = 500,
  className,
  onRowClick
}: VirtualTableProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const headerHeight = 48;
  const bodyHeight = height - headerHeight;
  
  const visibleCount = Math.ceil(bodyHeight / rowHeight) + 5; // +5 overscan
  const startIdx = Math.max(0, Math.floor(scrollTop / rowHeight) - 2);
  const endIdx = Math.min(data.length, startIdx + visibleCount);
  
  const visibleData = data.slice(startIdx, endIdx);
  const totalHeight = data.length * rowHeight;
  const offsetY = startIdx * rowHeight;

  const totalWidth = columns.reduce((sum, col) => sum + (col.width || 150), 0);

  return (
    <div 
      className={className}
      style={{ 
        border: '1px solid #334155',
        borderRadius: 8,
        overflow: 'hidden'
      }}
    >
      {/* Header */}
      <div 
        style={{ 
          display: 'flex',
          height: headerHeight,
          background: '#1e293b',
          borderBottom: '1px solid #334155'
        }}
      >
        {columns.map(col => (
          <div
            key={col.key}
            style={{
              width: col.width || 150,
              padding: '0 12px',
              display: 'flex',
              alignItems: 'center',
              fontWeight: 600,
              color: '#94a3b8',
              fontSize: 13
            }}
          >
            {col.title}
          </div>
        ))}
      </div>

      {/* Body */}
      <div
        ref={containerRef}
        style={{ 
          height: bodyHeight,
          overflow: 'auto'
        }}
        onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
      >
        <div style={{ height: totalHeight, position: 'relative' }}>
          <div style={{ transform: `translateY(${offsetY}px)` }}>
            {visibleData.map((row, idx) => (
              <div
                key={startIdx + idx}
                style={{
                  display: 'flex',
                  height: rowHeight,
                  borderBottom: '1px solid #1e293b',
                  cursor: onRowClick ? 'pointer' : undefined,
                  background: (startIdx + idx) % 2 === 0 ? '#0f172a' : '#1e293b'
                }}
                onClick={() => onRowClick?.(row, startIdx + idx)}
              >
                {columns.map(col => (
                  <div
                    key={col.key}
                    style={{
                      width: col.width || 150,
                      padding: '0 12px',
                      display: 'flex',
                      alignItems: 'center',
                      color: '#f1f5f9',
                      fontSize: 13,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {col.render 
                      ? col.render(row[col.key], row, startIdx + idx)
                      : row[col.key]
                    }
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default VirtualList;
