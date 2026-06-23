/**
 * QuickActions 快捷操作组件
 * 提供股票的快速操作按钮组
 */
import React, { useState } from 'react';
import { Button, Tooltip, message } from 'antd';
import {
  StarOutlined,
  StarFilled,
  BellOutlined,
  LineChartOutlined,
  ShareAltOutlined,
} from '@ant-design/icons';

interface QuickActionsProps {
  symbol: string;
  name?: string;
  inWatchlist?: boolean;
  onToggleWatchlist?: (symbol: string) => void;
  onSetAlert?: (symbol: string) => void;
  onViewChart?: (symbol: string) => void;
  onShare?: (symbol: string) => void;
  size?: 'small' | 'middle' | 'large';
  direction?: 'horizontal' | 'vertical';
}

export const QuickActions: React.FC<QuickActionsProps> = React.memo(({
  symbol,
  name,
  inWatchlist = false,
  onToggleWatchlist,
  onSetAlert,
  onViewChart,
  onShare,
  size = 'small',
  direction = 'horizontal',
}) => {
  const [watchlisted, setWatchlisted] = useState(inWatchlist);

  const handleWatchlist = () => {
    setWatchlisted(!watchlisted);
    onToggleWatchlist?.(symbol);
    message.success(watchlisted ? `已从自选股移除 ${symbol}` : `已添加 ${symbol} 到自选股`);
  };

  const handleShare = () => {
    onShare?.(symbol);
    const url = `${window.location.origin}/stock/${symbol}`;
    navigator.clipboard?.writeText(url);
    message.success('链接已复制');
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: direction === 'vertical' ? 'column' : 'row',
        gap: 4,
      }}
    >
      <Tooltip title={watchlisted ? '移除自选' : '添加自选'}>
        <Button
          type="text"
          size={size}
          icon={watchlisted ? <StarFilled style={{ color: '#fadb14' }} /> : <StarOutlined />}
          onClick={handleWatchlist}
        />
      </Tooltip>

      <Tooltip title="设置预警">
        <Button
          type="text"
          size={size}
          icon={<BellOutlined />}
          onClick={() => onSetAlert?.(symbol)}
        />
      </Tooltip>

      <Tooltip title="查看图表">
        <Button
          type="text"
          size={size}
          icon={<LineChartOutlined />}
          onClick={() => onViewChart?.(symbol)}
        />
      </Tooltip>

      <Tooltip title="分享">
        <Button
          type="text"
          size={size}
          icon={<ShareAltOutlined />}
          onClick={handleShare}
        />
      </Tooltip>
    </div>
  );
});

// 股票卡片（含快捷操作）
export const StockCard: React.FC<{
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  inWatchlist?: boolean;
  onToggleWatchlist?: (symbol: string) => void;
}> = React.memo(({ symbol, name, price, changePercent, inWatchlist, onToggleWatchlist }) => {
  const isUp = changePercent > 0;
  const isFlat = changePercent === 0;
  const color = isFlat ? '#999' : isUp ? '#ef4444' : '#22c55e';

  return (
    <div
      style={{
        padding: 16,
        borderRadius: 8,
        border: '1px solid #f0f0f0',
        transition: 'box-shadow 0.2s',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 600 }}>{name}</div>
          <div style={{ fontSize: 12, color: '#999' }}>{symbol}</div>
        </div>
        <QuickActions
          symbol={symbol}
          inWatchlist={inWatchlist}
          onToggleWatchlist={onToggleWatchlist}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 20, fontWeight: 700, color }}>{price.toFixed(2)}</span>
        <span style={{ fontSize: 14, color }}>
          {isUp ? '+' : ''}{changePercent.toFixed(2)}%
        </span>
      </div>
    </div>
  );
});

export default QuickActions;
