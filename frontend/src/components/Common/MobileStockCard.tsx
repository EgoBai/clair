/**
 * MobileStockCard — 移动端股票卡片组件
 * 
 * 在小屏设备上替代表格行，提供更好的触摸体验
 * - 股票名称 + 代码
 * - 最新价 + 涨跌幅（红涨绿跌）
 * - 关键指标（成交额/换手率/PE）
 * - 触摸目标 ≥ 44px
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';

interface StockCardData {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  volume?: number;
  turnover?: number;
  turnoverRate?: number;
  pe?: number;
  marketCap?: number;
  industry?: string;
}

interface MobileStockCardProps {
  stock: StockCardData;
  onClick?: (symbol: string) => void;
  showIndex?: number;
  rightAction?: React.ReactNode;
}

const formatBig = (n: number): string => {
  if (n >= 1e8) return (n / 1e8).toFixed(1) + '亿';
  if (n >= 1e4) return (n / 1e4).toFixed(1) + '万';
  return String(n);
};

const _formatVolume = (n: number): string => {
  if (n >= 1e8) return (n / 1e8).toFixed(1) + '亿';
  if (n >= 1e4) return (n / 1e4).toFixed(0) + '万';
  return String(n);
};

export const MobileStockCard: React.FC<MobileStockCardProps> = ({
  stock,
  onClick,
  showIndex,
  rightAction,
}) => {
  const navigate = useNavigate();
  const isUp = stock.changePercent >= 0;
  const color = isUp ? '#cf2a2a' : '#1db468';

  const handleClick = () => {
    if (onClick) {
      onClick(stock.symbol);
    } else {
      navigate(`/stocks/${stock.symbol}`);
    }
  };

  return (
    <div
      className="stock-card-mobile"
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '12px 14px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        cursor: 'pointer',
        transition: 'border-color 0.15s, transform 0.1s',
        minHeight: 56,
        WebkitTapHighlightColor: 'transparent',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--accent)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border)';
      }}
      onTouchStart={(e) => {
        e.currentTarget.style.transform = 'scale(0.98)';
      }}
      onTouchEnd={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
      }}
    >
      {/* 左侧：排名 + 名称 + 代码 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
        {showIndex !== undefined && (
          <span style={{
            fontSize: 12,
            fontWeight: 700,
            color: showIndex < 3 ? '#f59e0b' : '#64748b',
            minWidth: 18,
            textAlign: 'center',
            fontFamily: 'monospace',
          }}>
            {showIndex + 1}
          </span>
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--text)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {stock.name}
          </div>
          <div style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            fontFamily: 'monospace',
            marginTop: 1,
          }}>
            {stock.symbol.replace(/\.(SH|SZ)$/, '')}
            {stock.industry && (
              <span style={{ marginLeft: 6, color: '#475569', fontSize: 10 }}>
                {stock.industry}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 右侧：价格 + 涨跌 */}
      <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div>
          <div style={{
            fontSize: 16,
            fontWeight: 700,
            fontFamily: 'monospace',
            fontVariantNumeric: 'tabular-nums',
            color: 'var(--text)',
          }}>
            {stock.price?.toFixed(2) ?? '—'}
          </div>
          <div style={{
            fontSize: 13,
            fontWeight: 600,
            fontFamily: 'monospace',
            color,
            marginTop: 1,
          }}>
            {isUp ? '+' : ''}{stock.changePercent?.toFixed(2)}%
          </div>
        </div>

        {/* 关键指标 */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          fontSize: 10,
          color: 'var(--text-muted)',
          minWidth: 50,
        }}>
          {stock.turnover !== undefined && (
            <span>额 {formatBig(stock.turnover)}</span>
          )}
          {stock.turnoverRate !== undefined && (
            <span>换 {stock.turnoverRate.toFixed(1)}%</span>
          )}
          {stock.pe !== undefined && (
            <span>PE {stock.pe.toFixed(1)}</span>
          )}
        </div>

        {rightAction && (
          <div onClick={(e) => e.stopPropagation()}>
            {rightAction}
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(MobileStockCard);
