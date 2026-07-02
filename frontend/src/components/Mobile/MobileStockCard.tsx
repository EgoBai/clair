/**
 * 移动端股票卡片组件
 * 紧凑布局，支持滑动操作
 * 参考富途牛牛移动端设计
 */

import React, { useRef } from 'react';
import { useMobileGestures } from '../../hooks/useMobileGestures';

interface MobileStockCardProps {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume?: number;
  turnover?: number;
  onClick?: () => void;
  onSwipeLeft?: () => void;   // 左滑：删除/更多
  onSwipeRight?: () => void;  // 右滑：加入自选
  showActions?: boolean;
}

const MobileStockCard: React.FC<MobileStockCardProps> = ({
  symbol, name, price, change, changePercent,
  volume, turnover, onClick, onSwipeLeft, onSwipeRight, showActions = true,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const isRising = changePercent > 0;
  const isFalling = changePercent < 0;
  const color = isRising ? '#ef4444' : isFalling ? '#22c55e' : '#9ca3af';

  useMobileGestures(cardRef, {
    onSwipeLeft,
    onSwipeRight,
    onTap: () => onClick?.(),
  });

  const formatVolume = (v?: number) => {
    if (!v) return '-';
    if (v >= 1e8) return (v / 1e8).toFixed(1) + '亿';
    if (v >= 1e4) return (v / 1e4).toFixed(0) + '万';
    return v.toString();
  };

  return (
    <div
      ref={cardRef}
      className="mobile-stock-card"
      onClick={onClick}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        cursor: 'pointer',
        transition: 'background-color 0.15s',
        WebkitTapHighlightColor: 'transparent',
      }}
      onTouchStart={(e) => {
        (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255,255,255,0.05)';
      }}
      onTouchEnd={(e) => {
        (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
      }}
    >
      {/* 左侧：股票信息 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{
            fontSize: 15, fontWeight: 600, color: '#e5e7eb',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {name}
          </span>
          <span style={{ fontSize: 12, color: '#6b7280' }}>{symbol}</span>
        </div>
        {volume !== undefined && (
          <span style={{ fontSize: 11, color: '#6b7280' }}>
            成交 {formatVolume(volume)}
          </span>
        )}
      </div>

      {/* 右侧：价格和涨跌 */}
      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
        <div style={{ fontSize: 17, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
          {price.toFixed(2)}
        </div>
        <div style={{
          fontSize: 13, color, fontWeight: 500,
          fontVariantNumeric: 'tabular-nums',
          marginTop: 2,
        }}>
          {change >= 0 ? '+' : ''}{change.toFixed(2)}
          <span style={{ marginLeft: 6 }}>
            ({changePercent >= 0 ? '+' : ''}{changePercent.toFixed(2)}%)
          </span>
        </div>
      </div>
    </div>
  );
};

export default MobileStockCard;
